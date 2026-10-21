import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CreateCommit,
  ImagePatch,
  PreviewRow,
  PreviewStore,
  RegenCommit,
  UseCommit,
} from '@/lib/ai-preview/service'

/**
 * Supabase implementation of `PreviewStore`. Reads hit the tables; EVERY write
 * goes through a service-role-only `security definer` function from
 * scripts/070-ai-image-previews.sql, so claiming, charging and state changes
 * are atomic in the database, not in this process.
 */

/** A `generating`/`regenerating` row not touched for this long belongs to a dead request. */
const STALE_WORK_MS = 3 * 60 * 1000

type Row = Record<string, unknown>

function toRow(r: Row): PreviewRow {
  return {
    id: r.id as string,
    userId: r.user_id as string,
    projectId: r.project_id as string,
    sectionKey: r.section_key as string,
    target: r.target as string,
    status: r.status as PreviewRow['status'],
    kind: (r.kind as PreviewRow['kind']) ?? null,
    imageUrl: (r.image_url as string | null) ?? null,
    storagePath: (r.storage_path as string | null) ?? null,
    alt: (r.alt as string | null) ?? null,
    imagePrompt: (r.image_prompt as string | null) ?? null,
    chargedCredits: (r.charged_credits as number) ?? 0,
    regenCount: (r.regen_count as number) ?? 0,
    expiresAt: Date.parse(r.expires_at as string),
    createdAt: Date.parse(r.created_at as string),
  }
}

export function createSupabasePreviewStore(): PreviewStore {
  const admin = createAdminClient()

  async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await admin.rpc(name, args)
    if (error) throw new Error(`${name}: ${error.message}`)
    return data as T
  }
  const first = <T>(data: T[] | T | null): T => (Array.isArray(data) ? data[0] : (data as T))

  const patchArgs = (p: ImagePatch) => ({
    p_url: p.imageUrl,
    p_path: p.storagePath,
    p_alt: p.alt,
    p_prompt: p.imagePrompt,
  })

  return {
    async freeAvailable(userId) {
      try {
        return (await rpc<boolean>('ai_preview_free_available', { p_user: userId })) === true
      } catch {
        // Fail closed: if the marker cannot be read, nothing is promised as free.
        return false
      }
    },

    async findLive(userId, projectId, sectionKey, now) {
      const { data } = await admin
        .from('ai_image_previews')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .eq('section_key', sectionKey)
        .in('status', ['generating', 'open', 'regenerating'])
        .limit(1)
        .maybeSingle()
      if (!data) return null
      const row = toRow(data as Row)
      const touched = Date.parse((data as Row).updated_at as string)
      if (row.expiresAt <= now) return null
      const stale = touched < now - STALE_WORK_MS
      if (row.status === 'generating' && stale) return null
      if (row.status === 'regenerating' && stale) return { ...row, status: 'open' }
      return row
    },

    async get(userId, id) {
      const { data } = await admin
        .from('ai_image_previews')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle()
      return data ? toRow(data as Row) : null
    },

    async claimSlot(input) {
      const claimed = await rpc<boolean>('ai_preview_claim_slot', {
        p_user: input.userId,
        p_id: input.id,
        p_project: input.projectId,
        p_section: input.sectionKey,
        p_target: input.target,
      })
      return claimed === true
    },

    async commitCreate(userId, id, patch) {
      const row = first(
        await rpc<{ o_outcome: CreateCommit['outcome']; o_kind: CreateCommit['kind']; o_charged: number; o_balance: number | null }[]>(
          'ai_preview_commit_create',
          { p_user: userId, p_id: id, ...patchArgs(patch) },
        ),
      )
      return { outcome: row.o_outcome, kind: row.o_kind ?? null, charged: row.o_charged ?? 0, balance: row.o_balance ?? null }
    },

    async release(userId, id, status) {
      const path = await rpc<string | null>('ai_preview_release', { p_user: userId, p_id: id, p_status: status })
      return path ?? null
    },

    async claimRegen(userId, id, key) {
      return rpc<'claimed' | 'duplicate' | 'inflight' | 'invalid'>('ai_preview_claim_regen', {
        p_user: userId,
        p_id: id,
        p_key: key,
      })
    },

    async commitRegen(userId, id, key, patch) {
      const row = first(
        await rpc<{ o_outcome: RegenCommit['outcome']; o_old_path: string | null; o_balance: number | null }[]>(
          'ai_preview_commit_regen',
          { p_user: userId, p_id: id, p_key: key, ...patchArgs(patch) },
        ),
      )
      return { outcome: row.o_outcome, oldPath: row.o_old_path ?? null, balance: row.o_balance ?? null }
    },

    async releaseRegen(userId, id) {
      await rpc<null>('ai_preview_release_regen', { p_user: userId, p_id: id })
    },

    async commitUse(userId, id, key) {
      const row = first(
        await rpc<
          {
            o_outcome: UseCommit['outcome']
            o_charged: number
            o_balance: number | null
            o_url: string | null
            o_alt: string | null
            o_prompt: string | null
          }[]
        >('ai_preview_commit_use', { p_user: userId, p_id: id, p_key: key }),
      )
      return {
        outcome: row.o_outcome,
        charged: row.o_charged ?? 0,
        balance: row.o_balance ?? null,
        image: row.o_url ? { src: row.o_url, alt: row.o_alt ?? '', imagePrompt: row.o_prompt ?? '' } : null,
      }
    },
  }
}
