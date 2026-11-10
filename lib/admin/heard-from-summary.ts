import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { HEARD_FROM_VALUES, type HeardFromValue } from '@/lib/heard-from'

/** Rolling window the admin summary covers. */
export const HEARD_FROM_SUMMARY_DAYS = 30

/**
 * Aggregate-only shape. It is the ONLY thing that crosses from server to client,
 * so it must never gain an email, name, user id or any per-user field.
 */
export interface HeardFromSummary {
  windowDays: number
  totalSignups: number
  answered: number
  unanswered: number
  /** Percentage 0-100 with one decimal; 0 when there are no signups. */
  responseRatePct: number
  counts: Record<HeardFromValue, number>
}

export function buildHeardFromSummary(input: {
  total: number
  counts: Partial<Record<HeardFromValue, number>>
}): HeardFromSummary {
  const counts = {} as Record<HeardFromValue, number>
  let answered = 0
  for (const value of HEARD_FROM_VALUES) {
    const n = Math.max(0, Math.trunc(input.counts[value] ?? 0))
    counts[value] = n
    answered += n
  }
  // The counts come from separate queries; never report fewer signups than answers.
  const totalSignups = Math.max(0, Math.trunc(input.total), answered)
  return {
    windowDays: HEARD_FROM_SUMMARY_DAYS,
    totalSignups,
    answered,
    unanswered: totalSignups - answered,
    responseRatePct: totalSignups > 0 ? Math.round((answered / totalSignups) * 1000) / 10 : 0,
    counts,
  }
}

/**
 * Read-only "How did you hear about us?" rollup for the last 30 days.
 *
 * Returns `null` for anyone who is not an admin WITHOUT creating the
 * service-role client or touching the database. Only head/count queries are
 * used, so no profile row (and no personal data) is ever fetched.
 */
export async function getHeardFromSummary(now: number = Date.now()): Promise<HeardFromSummary | null> {
  const caller = await getAdminUser()
  if (!caller) return null

  const admin = createAdminClient()
  const since = new Date(now - HEARD_FROM_SUMMARY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const countWhere = async (value?: HeardFromValue) => {
    let query = admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    if (value) query = query.eq('heard_from', value)
    const { count, error } = await query
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  try {
    const [total, ...perValue] = await Promise.all([
      countWhere(),
      ...HEARD_FROM_VALUES.map((value) => countWhere(value)),
    ])
    const counts: Partial<Record<HeardFromValue, number>> = {}
    HEARD_FROM_VALUES.forEach((value, i) => {
      counts[value] = perValue[i]
    })
    return buildHeardFromSummary({ total, counts })
  } catch (error) {
    // A missing column (migration 132 not applied yet) must not take the overview down.
    console.error('[admin] heard-from summary unavailable:', error instanceof Error ? error.message : 'unknown')
    return null
  }
}
