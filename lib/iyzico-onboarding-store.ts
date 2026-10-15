import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { IYZICO_INSTANT_CONSENT_VERSION, IYZICO_INSTANT_LIMITS } from '@/lib/iyzico-onboarding-shared'

const TABLE = 'iyzico_onboarding_requests'

export type ClaimResult =
  | { kind: 'claimed'; id: number }
  | { kind: 'blocked'; reason: 'already_submitted' | 'in_progress' | 'project_limit' | 'user_limit' }
  | { kind: 'unavailable' }

type Row = { id: number; status: string; http_status: number | null; requested_at: string }

function logCode(code: string) {
  console.error('[iyzico-instant]', code)
}

function admin() {
  try {
    return createAdminClient()
  } catch {
    logCode('admin_client_unavailable')
    return null
  }
}

/** The feature is off until the migration has been applied. */
export async function isOnboardingStoreReady(): Promise<boolean> {
  const client = admin()
  if (!client) return false
  const { error } = await client.from(TABLE).select('id', { head: true, count: 'exact' }).limit(1)
  if (error) {
    logCode(`store_unavailable_${error.code ?? 'unknown'}`)
    return false
  }
  return true
}

/**
 * Counts the attempt BEFORE iyzico is called. A reservation row is inserted first
 * and only rows with a smaller id are counted, so of two concurrent requests
 * exactly one can pass.
 */
export async function claimOnboardingSlot(projectId: string, userId: string): Promise<ClaimResult> {
  const client = admin()
  if (!client) return { kind: 'unavailable' }

  const now = Date.now()
  const { data: reservation, error: insertError } = await client
    .from(TABLE)
    .insert({
      project_id: projectId,
      user_id: userId,
      status: 'failed',
      http_status: null,
      consent_version: IYZICO_INSTANT_CONSENT_VERSION,
      consent_at: new Date(now).toISOString(),
    })
    .select('id')
    .single()
  if (insertError || !reservation) {
    logCode(`reserve_failed_${insertError?.code ?? 'unknown'}`)
    return { kind: 'unavailable' }
  }
  const id = reservation.id as number

  const since = new Date(now - IYZICO_INSTANT_LIMITS.windowMs).toISOString()
  const earlier = (column: 'project_id' | 'user_id', value: string) =>
    client
      .from(TABLE)
      .select('id,status,http_status,requested_at')
      .eq(column, value)
      .lt('id', id)
      .gte('requested_at', since)
      .in('status', ['submitted', 'failed'])

  const [projectResult, userResult] = await Promise.all([
    earlier('project_id', projectId),
    earlier('user_id', userId),
  ])
  if (projectResult.error || userResult.error) {
    logCode(`count_failed_${(projectResult.error ?? userResult.error)?.code ?? 'unknown'}`)
    await release(id)
    return { kind: 'unavailable' }
  }

  const projectRows = (projectResult.data ?? []) as Row[]
  const userRows = (userResult.data ?? []) as Row[]
  const inFlightSince = now - IYZICO_INSTANT_LIMITS.inFlightMs

  let reason: Extract<ClaimResult, { kind: 'blocked' }>['reason'] | null = null
  if (projectRows.some((row) => row.status === 'submitted')) reason = 'already_submitted'
  else if (
    projectRows.some((row) => row.http_status === null && Date.parse(row.requested_at) >= inFlightSince)
  )
    reason = 'in_progress'
  else if (projectRows.length >= IYZICO_INSTANT_LIMITS.perProject) reason = 'project_limit'
  else if (userRows.length >= IYZICO_INSTANT_LIMITS.perUser) reason = 'user_limit'

  if (reason) {
    await release(id)
    return { kind: 'blocked', reason }
  }
  return { kind: 'claimed', id }
}

async function release(id: number) {
  const client = admin()
  if (!client) return
  const { error } = await client.from(TABLE).update({ status: 'rate_limited' }).eq('id', id)
  if (error) logCode(`release_failed_${error.code ?? 'unknown'}`)
}

/** Writes the final outcome; retried once so a transient error cannot leave a pending row. */
export async function finalizeOnboardingRequest(
  id: number,
  status: 'submitted' | 'failed',
  httpStatus: number,
): Promise<void> {
  const client = admin()
  if (!client) return
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await client.from(TABLE).update({ status, http_status: httpStatus }).eq('id', id)
    if (!error) return
    logCode(`finalize_failed_${error.code ?? 'unknown'}`)
  }
}
