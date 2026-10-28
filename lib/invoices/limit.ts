import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Rate limits for invoice reads and writes, on the same `reserve_rate_limit`
 * counters as the blog admin (`invoiceadm:` / `invoicecust:` prefixes). Admins
 * are trusted, so the numbers are generous; they stop a stolen session or a
 * runaway script. When the counter cannot be reached the request is refused.
 */

export type InvoiceLimitKind = 'write' | 'upload' | 'download' | 'export' | 'customer_download'

type Window = { seconds: number; limit: number }

export const INVOICE_LIMITS: Record<InvoiceLimitKind, Window[]> = {
  write: [{ seconds: 60, limit: 60 }],
  upload: [{ seconds: 60, limit: 20 }],
  download: [{ seconds: 60, limit: 60 }],
  export: [{ seconds: 60, limit: 6 }],
  customer_download: [
    { seconds: 60, limit: 15 },
    { seconds: 3600, limit: 120 },
  ],
}

export type ReserveFn = (
  subject: string,
  limit: number,
  windowSeconds: number,
) => Promise<{ allowed: boolean; resetAt?: string } | null>

const reserveViaRpc: ReserveFn = async (subject, limit, windowSeconds) => {
  const { data, error } = await createAdminClient()
    .rpc('reserve_rate_limit', { p_subject: subject, p_limit: limit, p_window_seconds: windowSeconds })
    .maybeSingle()
  if (error || !data) {
    console.error('[invoice-limit] reserve failed:', error?.message)
    return null
  }
  const row = data as { allowed: boolean; reset_at?: string }
  return { allowed: row.allowed, resetAt: row.reset_at }
}

export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number }

export async function checkInvoiceLimit(
  userId: string,
  kind: InvoiceLimitKind,
  reserve: ReserveFn = reserveViaRpc,
): Promise<LimitResult> {
  const prefix = kind === 'customer_download' ? 'invoicecust' : 'invoiceadm'
  for (const window of INVOICE_LIMITS[kind]) {
    const row = await reserve(`${prefix}:${kind}:${window.seconds}:${userId}`, window.limit, window.seconds)
    if (!row || !row.allowed) {
      const resetMs = row?.resetAt ? Date.parse(row.resetAt) - Date.now() : window.seconds * 1000
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(resetMs / 1000)) }
    }
  }
  return { allowed: true }
}
