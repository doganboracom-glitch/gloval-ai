import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { DRAFT_REMINDER_KINDS, type DraftReminderKind, type ReminderRecord } from './core'
import type { DraftCandidate, DraftReminderStore, OwnerProfile, RecordInput } from './service'

const UNIQUE_VIOLATION = '23505'
const DAY_MS = 86_400_000
// Superset of "inactive for 7 Turkey days": the planner makes the exact decision.
const CANDIDATE_MIN_AGE_MS = 6 * DAY_MS
const IN_CHUNK = 200

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const isKind = (value: unknown): value is DraftReminderKind =>
  typeof value === 'string' && (DRAFT_REMINDER_KINDS as readonly string[]).includes(value)

export function createSupabaseDraftReminderStore(now: Date): DraftReminderStore {
  const admin = createAdminClient()
  const cutoff = new Date(now.getTime() - CANDIDATE_MIN_AGE_MS).toISOString()

  return {
    async listCandidates(offset, limit) {
      const { data, error } = await admin
        .from('projects')
        .select('id, owner_id, project_type, published, reminders_muted')
        .eq('published', false)
        .eq('reminders_muted', false)
        .lte('updated_at', cutoff)
        .order('updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
      if (error) throw new Error('candidates_query_failed')
      return (data ?? []).map(
        (row): DraftCandidate => ({
          projectId: row.id as string,
          ownerId: row.owner_id as string,
          projectType: (row.project_type as string | null) ?? 'corporate',
          published: row.published === true,
          remindersMuted: row.reminders_muted === true,
        }),
      )
    },

    async loadProfiles(userIds) {
      const out = new Map<string, OwnerProfile>()
      for (const ids of chunk(userIds, IN_CHUNK)) {
        const { data, error } = await admin
          .from('profiles')
          .select('id, email, status, language, draft_reminders_opt_out')
          .in('id', ids)
        if (error) throw new Error('profiles_query_failed')
        for (const row of data ?? []) {
          out.set(row.id as string, {
            id: row.id as string,
            email: (row.email as string | null) ?? null,
            status: (row.status as string | null) ?? null,
            language: (row.language as string | null) ?? null,
            optOut: row.draft_reminders_opt_out === true,
          })
        }
      }
      return out
    },

    async loadLastActivity(projectIds) {
      const out = new Map<string, string | null>()
      for (const ids of chunk(projectIds, IN_CHUNK)) {
        const { data, error } = await admin.rpc('draft_reminder_last_activity', { p_project_ids: ids })
        if (error) throw new Error('activity_query_failed')
        for (const row of (data ?? []) as Array<{ project_id: string; last_activity_at: string | null }>) {
          out.set(row.project_id, row.last_activity_at)
        }
      }
      return out
    },

    async loadRecords(projectIds) {
      const out = new Map<string, ReminderRecord[]>()
      for (const ids of chunk(projectIds, IN_CHUNK)) {
        const { data, error } = await admin
          .from('draft_site_reminders')
          .select('project_id, kind, status, created_at')
          .in('project_id', ids)
        if (error) throw new Error('records_query_failed')
        for (const row of data ?? []) {
          if (!isKind(row.kind)) continue
          const list = out.get(row.project_id as string) ?? []
          list.push({ kind: row.kind, status: row.status as ReminderRecord['status'], createdAt: row.created_at as string })
          out.set(row.project_id as string, list)
        }
      }
      return out
    },

    async resolveRecipient(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      const user = data?.user
      if (error || !user?.email) return null
      const metadata = (user.user_metadata ?? {}) as { email_locale?: unknown }
      return { email: user.email, locale: metadata.email_locale }
    },

    async claimLog({ userId, kind, projectId, subject, dedupeKey }) {
      const { data, error } = await admin
        .from('notification_logs')
        .insert({
          user_id: userId,
          channel: 'email',
          type: `draft_site_reminder_${kind}`,
          subject,
          body: `project:${projectId}`,
          status: 'sent',
          dedupe_key: dedupeKey,
        })
        .select('id')
        .maybeSingle()
      if (error?.code === UNIQUE_VIOLATION) return { status: 'duplicate' }
      if (error) throw new Error('claim_failed')
      return { status: 'claimed', logId: (data?.id as string | undefined) ?? null }
    },

    async releaseLog(dedupeKey) {
      const { error } = await admin.from('notification_logs').delete().eq('dedupe_key', dedupeKey)
      if (error) console.warn('[draft-reminders] release claim failed')
    },

    async insertRecord(input: RecordInput) {
      const { error } = await admin.from('draft_site_reminders').insert({
        project_id: input.projectId,
        user_id: input.userId,
        kind: input.kind,
        status: input.status,
        error_code: input.errorCode ?? null,
        notification_log_id: input.notificationLogId ?? null,
      })
      if (!error) return 'ok'
      if (error.code === UNIQUE_VIOLATION) return 'duplicate'
      console.warn('[draft-reminders] record insert failed:', error.code)
      return 'error'
    },
  }
}
