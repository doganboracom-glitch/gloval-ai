import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiModelSelection } from '@/lib/ai-models'

/**
 * Small persistent counter for AI generation outcomes (table
 * `ai_generation_events`, see scripts/054-ai-generation-events.sql).
 *
 * It stores flow, tier, model, outcome, plan code and a timestamp. It never
 * stores a user id, prompt, site content or model output. Recording is
 * best-effort: a missing table, a missing key or a slow database must never
 * slow down or fail a generation, so every failure is swallowed and logged
 * without details.
 */

export type AiEventOutcome = 'ok' | 'repaired' | 'retried' | 'fallback'

export const AI_EVENT_RETENTION_DAYS = 90
const TABLE = 'ai_generation_events'
const RECORD_TIMEOUT_MS = 1500

export type AiEventRow = {
  flow: string
  tier: string
  model: string
  outcome: AiEventOutcome
  plan_code: string
}

/** Off in tests and in developer scripts (`AI_EVENTS_DISABLED=1`). */
export function aiEventsDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.AI_EVENTS_DISABLED === '1'
}

export function toAiEventRow(selection: AiModelSelection, outcome: AiEventOutcome): AiEventRow {
  return {
    flow: selection.flow,
    tier: selection.tier,
    model: selection.model,
    outcome,
    plan_code: selection.plan,
  }
}

export async function recordAiGenerationEvent(
  selection: AiModelSelection,
  outcome: AiEventOutcome,
  client?: SupabaseClient,
): Promise<void> {
  if (!client && aiEventsDisabled()) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const admin = client ?? createAdminClient()
    const insert = Promise.resolve(admin.from(TABLE).insert(toAiEventRow(selection, outcome))).then(({ error }) => {
      if (error) throw error
    })
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RECORD_TIMEOUT_MS)
    })
    await Promise.race([insert, timeout])
  } catch {
    console.info('[ai-events] record skipped')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Deletes events past the retention window; called by the daily cron. */
export async function sweepOldAiGenerationEvents(admin: SupabaseClient, nowMs: number): Promise<number> {
  const cutoff = new Date(nowMs - AI_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin.from(TABLE).delete().lt('created_at', cutoff).select('id')
  if (error) throw error
  return data?.length ?? 0
}

export type AiWeeklyRow = {
  week: string
  flow: string
  tier: string
  model: string
  total: number
  ok: number
  repaired: number
  retried: number
  fallback: number
  fallback_pct: number
}

/** Reads the `ai_generation_weekly` view for the last `weeks` weeks (service role only). */
export async function readAiWeeklyReport(admin: SupabaseClient, weeks: number, nowMs: number): Promise<AiWeeklyRow[]> {
  const since = new Date(nowMs - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data, error } = await admin
    .from('ai_generation_weekly')
    .select('*')
    .gte('week', since)
    .order('week', { ascending: false })
    .order('flow')
  if (error) throw error
  return (data ?? []) as AiWeeklyRow[]
}
