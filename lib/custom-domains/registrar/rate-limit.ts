import { createAdminClient } from '@/lib/supabase/admin'

export type HourlyReservation = 'allowed' | 'limited' | 'unavailable'
type RateLimitScope = 'nameserver' | 'transfer-lock' | 'transfer-code' | 'transfer-window-extension'

/** Per-user reservation for any fixed interval. Limiter failures always fail closed. */
export async function reserveUserWindow(
  scope: RateLimitScope,
  subject: string,
  userId: string,
  limit: number,
  windowSeconds: number,
): Promise<HourlyReservation> {
  try {
    const { data, error } = await createAdminClient()
      .rpc('reserve_rate_limit', {
        p_subject: `${subject}:${userId}`,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      })
      .maybeSingle()
    const reservation = data as { allowed?: unknown } | null
    if (error || !reservation || typeof reservation.allowed !== 'boolean') {
      console.error(`[registrar-manage] ${scope} rate limit unavailable`, error?.code ?? 'NO_RESULT')
      return 'unavailable'
    }
    return reservation.allowed ? 'allowed' : 'limited'
  } catch {
    console.error(`[registrar-manage] ${scope} rate limit unavailable`, 'NO_RESULT')
    return 'unavailable'
  }
}

/** Per-user hourly reservation (default 5/hour). */
export function reserveUserHourly(
  scope: 'nameserver' | 'transfer-lock' | 'transfer-code',
  subject: string,
  userId: string,
  limit = 5,
): Promise<HourlyReservation> {
  return reserveUserWindow(scope, subject, userId, limit, 60 * 60)
}

/** Three transfer-window extensions per user in a rolling 24-hour window. */
export function reserveUserDailyTransferExtension(userId: string): Promise<HourlyReservation> {
  return reserveUserWindow(
    'transfer-window-extension',
    'domain:transfer-window-extension',
    userId,
    3,
    24 * 60 * 60,
  )
}
