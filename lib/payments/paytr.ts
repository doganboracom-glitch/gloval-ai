import { createHmac, timingSafeEqual } from 'crypto'
import { headers } from 'next/headers'
import { platformUrl } from '@/lib/domains'
import {
  PaymentConfigError,
  type PaymentIntentInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentWebhookResult,
  type RefundInput,
  type RefundResult,
} from './types'

/**
 * PayTR adapter (Turkey's most common PSP). Implemented against PayTR's HTTP
 * APIs over `fetch` — no SDK dependency. Entirely server-side: the merchant
 * credentials live only in server env vars and never reach the client.
 *
 * Unlike Stripe, PayTR has three separate secrets, all read from env here:
 *   - PAYTR_MERCHANT_ID   (public-ish account id)
 *   - PAYTR_MERCHANT_KEY  (secret, used as the HMAC key)
 *   - PAYTR_MERCHANT_SALT (secret, mixed into every hash)
 *
 * Flow:
 *   1. `createIntent` calls the get-token API and returns a redirect to PayTR's
 *      hosted payment page (`/odeme/guvenli/{token}`).
 *   2. PayTR calls our callback (the store webhook) with a signed result; we
 *      verify the hash in `parseWebhook`. The webhook route MUST reply with the
 *      literal body "OK" or PayTR retries the callback indefinitely.
 *
 * PayTR settles asynchronously via that callback, so `capabilities.synchronous`
 * is false and nothing is ever marked paid without a verified callback.
 */

const GET_TOKEN_URL = 'https://www.paytr.com/odeme/api/get-token'
const REFUND_URL = 'https://www.paytr.com/odeme/iade'
const HOSTED_BASE = 'https://www.paytr.com/odeme/guvenli'

type PayTRCredentials = {
  merchantId: string
  merchantKey: string
  merchantSalt: string
}

/**
 * Read and validate the three PayTR secrets from env. Throws PaymentConfigError
 * (not a generic Error) so callers can fall back gracefully instead of leaking
 * a low-level failure to the buyer.
 */
function readCredentials(): PayTRCredentials {
  const merchantId = process.env.PAYTR_MERCHANT_ID?.trim()
  const merchantKey = process.env.PAYTR_MERCHANT_KEY?.trim()
  const merchantSalt = process.env.PAYTR_MERCHANT_SALT?.trim()
  if (!merchantId || !merchantKey || !merchantSalt) {
    throw new PaymentConfigError('paytr')
  }
  return { merchantId, merchantKey, merchantSalt }
}

/** Base64 HMAC-SHA256, PayTR's signature primitive. */
function paytrHmac(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload, 'utf8').digest('base64')
}

/**
 * PayTR requires an alphanumeric `merchant_oid`. Order ids are UUIDs with
 * dashes, so we strip non-alphanumerics. The stripped value is what we return
 * as the payment `reference` AND what PayTR echoes back in the callback, so the
 * webhook can look the order up by `payment_ref` without any extra mapping.
 */
function toMerchantOid(orderId: string): string {
  return orderId.replace(/[^a-zA-Z0-9]/g, '')
}

/** Map an ISO currency to PayTR's currency code (TRY → TL). */
function toPayTRCurrency(currency: string): string {
  const c = currency.trim().toUpperCase()
  return c === 'TRY' || c === 'TL' ? 'TL' : c
}

/** '1' unless PAYTR_TEST_MODE is explicitly '0' — fail safe toward test mode. */
function testModeFlag(): '0' | '1' {
  return process.env.PAYTR_TEST_MODE?.trim() === '0' ? '0' : '1'
}

/**
 * Resolve the absolute origin for PayTR's ok/fail redirect URLs.
 *
 * Platform billing always lives on the canonical platform host (`gloval.ai`),
 * NEVER on the tenant root (`gloval.site`) — a buyer paying for a package must
 * return to the platform, and the server-to-server callback must reach the
 * platform's webhook route. So resolution order is:
 *   1. Explicit `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` override.
 *   2. `platformUrl()` — the canonical platform host from `lib/domains.ts`
 *      (`gloval.ai` by default, overridable via NEXT_PUBLIC_PLATFORM_* env).
 *
 * We intentionally do NOT derive the origin from the incoming request Host,
 * because createIntent can run under a tenant subdomain (`*.gloval.site`) and
 * PayTR return/callback URLs must not point there.
 */
async function resolveOrigin(): Promise<string> {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return platformUrl('/').replace(/\/$/, '')
}

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = h.get('x-real-ip')
    if (real) return real.trim()
  } catch {
    // ignore
  }
  return '127.0.0.1'
}

export const paytrProvider: PaymentProvider = {
  id: 'paytr',

  capabilities: {
    synchronous: false,
    refunds: true,
    // PayTR recurring/subscription needs the separate stored-card recurring
    // API; not wired yet, so callers must not route subscriptions here.
    subscriptions: false,
    manualVerification: false,
  },

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    const { merchantId, merchantKey, merchantSalt } = readCredentials()

    const merchantOid = toMerchantOid(input.orderId)
    // PayTR amounts are in minor units (kuruş) exactly like amountCents.
    const paymentAmount = String(Math.round(input.amountCents))
    const currency = toPayTRCurrency(input.currency)
    const testMode = testModeFlag()
    const noInstallment = '0'
    const maxInstallment = '0'
    const userIp = await resolveClientIp()

    // Single-line basket: [ [name, unitPrice, quantity] ], base64(JSON).
    const basket = [[`Sipariş ${merchantOid}`, (input.amountCents / 100).toFixed(2), 1]]
    const userBasket = Buffer.from(JSON.stringify(basket), 'utf8').toString('base64')

    // Hash string order is defined by PayTR and must match exactly.
    const hashStr =
      merchantId +
      userIp +
      merchantOid +
      input.customerEmail +
      paymentAmount +
      userBasket +
      noInstallment +
      maxInstallment +
      currency +
      testMode
    const paytrToken = paytrHmac(hashStr + merchantSalt, merchantKey)

    const origin = await resolveOrigin()
    const returnAbs = input.returnUrl.startsWith('http')
      ? input.returnUrl
      : `${origin}${input.returnUrl.startsWith('/') ? '' : '/'}${input.returnUrl}`

    const body = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email: input.customerEmail,
      payment_amount: paymentAmount,
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: testMode === '1' ? '1' : '0',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      currency,
      test_mode: testMode,
      merchant_ok_url: returnAbs,
      merchant_fail_url: returnAbs,
      user_name: input.customerEmail.split('@')[0] || 'Musteri',
      user_address: 'N/A',
      user_phone: '0000000000',
      timeout_limit: '30',
      lang: 'tr',
    })

    const res = await fetch(GET_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const json = (await res.json().catch(() => null)) as
      | { status?: string; token?: string; reason?: string }
      | null

    if (!json || json.status !== 'success' || !json.token) {
      throw new Error(`paytr_error: ${json?.reason ?? `http_${res.status}`}`)
    }

    return {
      reference: merchantOid,
      action: 'redirect',
      redirectUrl: `${HOSTED_BASE}/${json.token}`,
      status: 'pending',
    }
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    const { merchantId, merchantKey, merchantSalt } = readCredentials()
    if (input.amountCents == null) {
      // PayTR's refund API requires an explicit amount.
      return { reference: input.reference, status: 'failed' }
    }
    const returnAmount = (input.amountCents / 100).toFixed(2)
    const token = paytrHmac(
      merchantId + input.reference + returnAmount + merchantSalt,
      merchantKey,
    )
    const res = await fetch(REFUND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        merchant_id: merchantId,
        merchant_oid: input.reference,
        return_amount: returnAmount,
        paytr_token: token,
      }).toString(),
    })
    const json = (await res.json().catch(() => null)) as { status?: string } | null
    return {
      reference: input.reference,
      status: json?.status === 'success' ? 'refunded' : 'failed',
    }
  },

  async parseWebhook(
    rawBody: string,
  ): Promise<PaymentWebhookResult | null> {
    let creds: PayTRCredentials
    try {
      creds = readCredentials()
    } catch {
      // Unconfigured — cannot verify, so reject rather than trust.
      return null
    }

    // PayTR posts the callback as application/x-www-form-urlencoded.
    const params = new URLSearchParams(rawBody)
    const merchantOid = params.get('merchant_oid')
    const status = params.get('status')
    const totalAmount = params.get('total_amount')
    const hash = params.get('hash')
    if (!merchantOid || !status || !totalAmount || !hash) return null

    // Callback hash order: merchant_oid + merchant_salt + status + total_amount.
    const expected = paytrHmac(
      merchantOid + creds.merchantSalt + status + totalAmount,
      creds.merchantKey,
    )
    try {
      const a = Buffer.from(expected)
      const b = Buffer.from(hash)
      if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    } catch {
      return null
    }

    return {
      kind: 'payment',
      reference: merchantOid,
      status: status === 'success' ? 'paid' : 'failed',
    }
  },
}
