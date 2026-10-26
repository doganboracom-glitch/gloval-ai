import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { APPLICATION_CONSENT_VERSION, APPLICATION_LIMITS } from '@/lib/iyzico-application-shared'

const TABLE = 'iyzico_onboarding_requests'

export type ApplicationClaim =
  | { kind: 'claimed'; id: number }
  | { kind: 'blocked' }
  | { kind: 'unavailable' }

type Row = { id: number; status: string; http_status: number | null; requested_at: string }

function logCode(code: string) {
  console.error('[iyzico-application]', code)
}

function admin() {
  try {
    return createAdminClient()
  } catch {
    logCode('admin_client_unavailable')
    return null
  }
}

/**
 * Counts the request BEFORE the mail goes out. A reservation row is inserted
 * first and only rows with a smaller id are counted, so of two concurrent
 * requests the limit still holds. No personal data is stored: the row only
 * carries project, user, outcome and consent version.
 */
export async function claimApplicationSlot(projectId: string, userId: string): Promise<ApplicationClaim> {
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
      consent_version: APPLICATION_CONSENT_VERSION,
      consent_at: new Date(now).toISOString(),
    })
    .select('id')
    .single()
  if (insertError || !reservation) {
    logCode(`reserve_failed_${insertError?.code ?? 'unknown'}`)
    return { kind: 'unavailable' }
  }
  const id = reservation.id as number

  const since = new Date(now - APPLICATION_LIMITS.windowMs).toISOString()
  const { data, error } = await client
    .from(TABLE)
    .select('id,status,http_status,requested_at')
    .eq('user_id', userId)
    .eq('consent_version', APPLICATION_CONSENT_VERSION)
    .lt('id', id)
    .gte('requested_at', since)
    .in('status', ['submitted', 'failed'])
  if (error) {
    logCode(`count_failed_${error.code ?? 'unknown'}`)
    await release(id)
    return { kind: 'unavailable' }
  }

  const inFlightSince = now - APPLICATION_LIMITS.inFlightMs
  const counted = ((data ?? []) as Row[]).filter(
    (row) =>
      row.status === 'submitted' ||
      (row.http_status === null && Date.parse(row.requested_at) >= inFlightSince),
  )
  if (counted.length >= APPLICATION_LIMITS.perUser) {
    await release(id)
    return { kind: 'blocked' }
  }
  return { kind: 'claimed', id }
}

async function release(id: number) {
  const client = admin()
  if (!client) return
  const { error } = await client.from(TABLE).update({ status: 'rate_limited' }).eq('id', id)
  if (error) logCode(`release_failed_${error.code ?? 'unknown'}`)
}

/** 200 = mail handed to the mailer, 0 = it could not be sent (the slot is not counted). */
export async function finalizeApplicationRequest(id: number, sent: boolean): Promise<void> {
  const client = admin()
  if (!client) return
  const update = sent ? { status: 'submitted', http_status: 200 } : { status: 'failed', http_status: 0 }
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await client.from(TABLE).update(update).eq('id', id)
    if (!error) return
    logCode(`finalize_failed_${error.code ?? 'unknown'}`)
  }
}
