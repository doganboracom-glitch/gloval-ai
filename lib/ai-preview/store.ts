import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { PREVIEW_TTL_MS } from '@/lib/ai-preview/policy'
import type { PreviewRow, PreviewStore } from '@/lib/ai-preview/service'

/**
 * Supabase implementation of `PreviewStore` (tables in scripts/070-ai-image-previews.sql).
 * Every transition is ONE conditional UPDATE/INSERT, so concurrent requests
 * cannot both win a state change.
 */

/** A `generating`/`regenerating` row not touched for this long belongs to a dead request. */
const STALE_WORK_MS = 3 * 60 * 1000
/** A `using` row not touched for this long can be taken over by a retry. */
const STALE_USE_MS = 30 * 1000

const iso = (ms: number) => new Date(ms).toISOString()
const LIVE = ['generating', 'open', 'regenerating', 'using']

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
    lastRegenKey: (r.last_regen_key as string | null) ?? null,
    useKey: (r.use_key as string | null) ?? null,
    expiresAt: Date.parse(r.expires_at as string),
    createdAt: Date.parse(r.created_at as string),
  }
}

export function createSupabasePreviewStore(): PreviewStore {
  const admin = createAdminClient()
  const previews = () => admin.from('ai_image_previews')

  const store: PreviewStore = {
    async hasFreeEntitlement(userId) {
      const { data, error } = await admin
        .from('ai_preview_entitlements')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle()
      // Fail closed: if the marker cannot be read, nothing is free.
      if (error) return false
      return !data
    },

    async consumeFreeEntitlement(userId) {
      const { error } = await admin.from('ai_preview_entitlements').insert({ user_id: userId })
      return !error
    },

    async findLive(userId, projectId, sectionKey, now) {
      const scope = { user_id: userId, project_id: projectId, section_key: sectionKey }
      await previews().update({ status: 'expired', updated_at: iso(now) }).match(scope).in('status', ['open', 'generating', 'regenerating']).lt('expires_at', iso(now))
      await previews().update({ status: 'expired', updated_at: iso(now) }).match(scope).eq('status', 'generating').lt('updated_at', iso(now - STALE_WORK_MS))
      await previews().update({ status: 'open', updated_at: iso(now) }).match(scope).eq('status', 'regenerating').lt('updated_at', iso(now - STALE_WORK_MS))
      const { data } = await previews().select('*').match(scope).in('status', LIVE).limit(1).maybeSingle()
      return data ? toRow(data as Row) : null
    },

    async get(userId, id) {
      const { data } = await previews().select('*').eq('id', id).eq('user_id', userId).maybeSingle()
      return data ? toRow(data as Row) : null
    },

    async claimSlot(input, now) {
      const { error } = await previews().insert({
        id: input.id,
        user_id: input.userId,
        project_id: input.projectId,
        section_key: input.sectionKey,
        target: input.target,
        status: 'generating',
        expires_at: iso(now + PREVIEW_TTL_MS),
        created_at: iso(now),
        updated_at: iso(now),
      })
      return error ? { claimed: false } : { claimed: true }
    },

    async completeCreate(id, userId, patch, now) {
      await previews()
        .update({
          status: 'open',
          kind: patch.kind,
          image_url: patch.imageUrl,
          storage_path: patch.storagePath,
          alt: patch.alt,
          image_prompt: patch.imagePrompt,
          charged_credits: patch.chargedCredits,
          expires_at: iso(now + PREVIEW_TTL_MS),
          updated_at: iso(now),
        })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'generating')
    },

    async release(id, userId, status) {
      await previews()
        .update({ status, updated_at: iso(Date.now()) })
        .eq('id', id)
        .eq('user_id', userId)
        .in('status', ['generating', 'open', 'regenerating', 'using'])
    },

    async claimRegen(id, userId, key, now) {
      const current = await store.get(userId, id)
      if (!current || current.expiresAt <= now) return 'invalid'
      if (current.status === 'regenerating' || current.status === 'using' || current.status === 'generating') return 'inflight'
      if (current.status !== 'open') return 'invalid'
      if (current.lastRegenKey === key) return 'duplicate'
      const { data } = await previews()
        .update({ status: 'regenerating', last_regen_key: key, updated_at: iso(now) })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'open')
        .gt('expires_at', iso(now))
        .select('id')
      return data && data.length > 0 ? 'claimed' : 'inflight'
    },

    async completeRegen(id, userId, patch, now) {
      const current = await store.get(userId, id)
      await previews()
        .update({
          status: 'open',
          image_url: patch.imageUrl,
          storage_path: patch.storagePath,
          alt: patch.alt,
          image_prompt: patch.imagePrompt,
          regen_count: (current?.regenCount ?? 0) + 1,
          expires_at: iso(now + PREVIEW_TTL_MS),
          updated_at: iso(now),
        })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'regenerating')
    },

    async revertRegen(id, userId) {
      await previews()
        .update({ status: 'open', last_regen_key: null, updated_at: iso(Date.now()) })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'regenerating')
    },

    async claimUse(id, userId, key, now) {
      const current = await store.get(userId, id)
      if (!current) return 'invalid'
      if (current.status === 'used') return 'done'
      if (current.status === 'using') {
        if (current.useKey !== key) return 'inflight'
        // Atomic takeover of an abandoned attempt: only one retry can win.
        const { data } = await previews()
          .update({ updated_at: iso(now) })
          .eq('id', id)
          .eq('user_id', userId)
          .eq('status', 'using')
          .lt('updated_at', iso(now - STALE_USE_MS))
          .select('id')
        return data && data.length > 0 ? 'resume' : 'inflight'
      }
      if (current.status !== 'open' || current.expiresAt <= now) return 'invalid'
      const { data } = await previews()
        .update({ status: 'using', use_key: key, updated_at: iso(now) })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'open')
        .gt('expires_at', iso(now))
        .select('id')
      return data && data.length > 0 ? 'claimed' : 'inflight'
    },

    async completeUse(id, userId, now) {
      await previews()
        .update({ status: 'used', used_at: iso(now), updated_at: iso(now) })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'using')
    },

    async revertUse(id, userId) {
      await previews()
        .update({ status: 'open', use_key: null, updated_at: iso(Date.now()) })
        .eq('id', id)
        .eq('user_id', userId)
        .eq('status', 'using')
    },
  }
  return store
}
