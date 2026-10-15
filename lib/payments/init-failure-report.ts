import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  classifyPaymentInitFailure,
  type PaymentInitFailure,
  type PaymentInitFlow,
} from './init-failure'

/**
 * Logs and counts one failed payment start. The persistent counter (table
 * `billing_init_failure_events`, scripts/058-billing-init-failure-events.sql)
 * stores flow, provider, deployment environment, the machine code and a
 * timestamp: no user id, buyer data, order reference or provider payload.
 * Recording is best-effort and bounded; it can never delay or fail the
 * checkout response.
 */

const TABLE = 'billing_init_failure_events'
const RECORD_TIMEOUT_MS = 1500

function environmentName(): string {
  const env = process.env.VERCEL_ENV
  return env === 'production' || env === 'preview' || env === 'development' ? env : 'unknown'
}

function eventsDisabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.BILLING_EVENTS_DISABLED === '1'
}

export async function reportPaymentInitFailure(
  flow: PaymentInitFlow,
  error: unknown,
  providerId?: string,
  client?: SupabaseClient,
): Promise<PaymentInitFailure> {
  const failure = classifyPaymentInitFailure(error)
  const environment = environmentName()

  console.error('[billing-init] payment start failed', {
    flow,
    provider: providerId ?? 'unresolved',
    environment,
    code: failure.code,
    field: failure.field,
  })

  if (!client && eventsDisabled()) return failure

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const admin = client ?? createAdminClient()
    const insert = Promise.resolve(
      admin.from(TABLE).insert({
        flow,
        provider: providerId ?? 'unresolved',
        environment,
        code: failure.code.slice(0, 80),
      }),
    ).then(({ error: insertError }) => {
      if (insertError) throw insertError
    })
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, RECORD_TIMEOUT_MS)
    })
    await Promise.race([insert, timeout])
  } catch {
    console.info('[billing-init] record skipped')
  } finally {
    if (timer) clearTimeout(timer)
  }
  return failure
}
