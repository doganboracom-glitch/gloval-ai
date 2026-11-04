import { createAdminClient } from '@/lib/supabase/admin'

export type HourlyReservation = 'allowed' | 'limited' | 'unavailable'

/**
 * Per-user hourly reservation (default 5/hour). Fails closed: when the limiter
 * itself cannot answer, the caller must refuse the operation.
 */
export async function reserveUserHourly(
  scope: 'nameserver' | 'transfer-lock' | 'transfer-code',
  subject: string,
  userId: string,
  limit = 5,
): Promise<HourlyReservation> {
  const { data, error } = await createAdminClient()
    .rpc('reserve_rate_limit', {
      p_subject: `${subject}:${userId}`,
      p_limit: limit,
      p_window_seconds: 60 * 60,
    })
    .maybeSingle()
  const reservation = data as { allowed?: unknown } | null
  if (error || !reservation || typeof reservation.allowed !== 'boolean') {
    console.error(`[registrar-manage] ${scope} rate limit unavailable`, error?.code ?? 'NO_RESULT')
    return 'unavailable'
  }
  return reservation.allowed ? 'allowed' : 'limited'
}
