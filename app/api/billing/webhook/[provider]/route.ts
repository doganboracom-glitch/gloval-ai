import { NextResponse } from 'next/server'
import {
  getPaymentProvider,
  getProviderWebhookSecret,
  type PaymentProviderId,
} from '@/lib/payments'
import { settlePaymentResult } from '@/lib/payments/settle'

/**
 * Platform billing webhook. Separate from the store payment webhook: this
 * endpoint advances the platform's OWN money movements — subscription (package)
 * activation and one-time per-site rights — for payments settled by a
 * redirect-based PSP.
 *
 * A PSP sends every server-to-server callback for the platform's merchant
 * account to a single notification URL, so this handler resolves the callback
 * by its provider reference (`provider_ref`) against BOTH
 * `billing_subscriptions` and `project_entitlements`.
 *
 * Guarantees:
 *   - Callbacks are cryptographically verified in the provider adapter;
 *     unverifiable payloads are rejected (fail closed).
 *   - Processing is idempotent: a repeated callback never double-activates or
 *     double-charges (transactions upsert on a unique idempotency key, and
 *     status transitions are no-ops once final).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await params
  const providerId = providerParam as PaymentProviderId

  let provider
  try {
    provider = getPaymentProvider(providerId)
  } catch {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 400 })
  }

  const ack = (extra?: Record<string, unknown>) => NextResponse.json({ ok: true, ...extra })

  const rawBody = await request.text()
  const headers: Record<string, string> = {}
  request.headers.forEach((v, k) => {
    headers[k] = v
  })

  const webhookSecret = getProviderWebhookSecret(providerId)
  const result = await provider.parseWebhook(rawBody, headers, webhookSecret)
  if (!result) {
    // Could not verify — never trust it.
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const outcome = await settlePaymentResult(providerId, result)
  return ack(outcome === 'no_match' ? { ignored: 'no_match' } : { handled: outcome })
}
