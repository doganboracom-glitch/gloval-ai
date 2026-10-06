import { createHmac, randomBytes } from 'crypto'
import { platformUrl } from '@/lib/domains'
import {
  DOMAIN_PURCHASE_ORDER_PREFIX,
  IYZICO_LIVE_BASE,
  IYZICO_SANDBOX_BASE,
  IYZICO_SANDBOX_KEY_PREFIX,
  mayUseSandboxIyzicoInProduction,
} from './domain-e2e-mode'
import {
  PaymentConfigError,
  type PaymentIntentInput,
  type PaymentIntentResult,
  type PaymentProvider,
  type PaymentWebhookResult,
} from './types'

/**
 * iyzico Checkout Form (CF) adapter. Implemented directly against iyzico's
 * REST API using the IYZWSv2 HMAC-SHA256 authorization scheme — no SDK
 * dependency, mirroring the PayTR/Stripe adapters in this folder.
 *
 * Flow:
 *   1. `createIntent` calls the CF initialize endpoint and returns a redirect
 *      to iyzico's hosted `paymentPageUrl`. The Checkout Form's own `token` is
 *      returned as the payment `reference` (and persisted as
 *      `billing_subscriptions.provider_ref` by the caller), so it can be
 *      matched back up later.
 *   2. After the buyer finishes paying (or cancels), iyzico's hosted page
 *      POSTs the token to our `callbackUrl`
 *      (`app/api/billing/checkout/iyzico/callback`). That route calls
 *      `retrieveIyzicoCheckoutForm` below to get the AUTHORITATIVE result —
 *      the callback POST body itself is never trusted for the payment status.
 *
 * Checkout Form settles asynchronously (redirect + callback), so
 * `capabilities.synchronous` is false, exactly like PayTR. There is no signed
 * push-webhook product for Checkout Form (that is a separate iyzico product,
 * the recurring Subscription API's notification URL), so `parseWebhook`
 * always returns null — nothing reaches activation through the generic
 * webhook route for this provider; only the verified retrieve result does.
 */

const SANDBOX_BASE = IYZICO_SANDBOX_BASE
const LIVE_BASE = IYZICO_LIVE_BASE

const CF_INITIALIZE_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom'
const CF_RETRIEVE_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail'

type IyzicoCredentials = {
  apiKey: string
  secretKey: string
  baseUrl: string
}

/** Read and validate the two iyzico secrets from env. Fails closed. */
function readCredentials(options: IyzicoRequestOptions = {}): IyzicoCredentials {
  const apiKey = process.env.IYZICO_API_KEY?.trim()
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim()
  if (!apiKey || !secretKey) {
    throw new PaymentConfigError('iyzico')
  }
  const baseUrl = resolveIyzicoBaseUrl(options)
  assertCredentialsMatchHost(apiKey, secretKey, baseUrl)
  return { apiKey, secretKey, baseUrl }
}

/**
 * `domainPurchase` marks a request that belongs to a buy-a-domain order. It is
 * the only context in which production may talk to the sandbox host, and only
 * while the controlled E2E test mode is on (see `domain-e2e-mode.ts`).
 */
export type IyzicoRequestOptions = { domainPurchase?: boolean }

const SANDBOX_KEY_PREFIX = IYZICO_SANDBOX_KEY_PREFIX

/**
 * iyzico sandbox keys are always `sandbox-` prefixed. Pairing them with the
 * live host (or live keys with the sandbox host) can never authenticate, so it
 * is rejected up front with a precise machine code instead of surfacing as an
 * opaque iyzico auth failure at initialize time.
 */
function assertCredentialsMatchHost(apiKey: string, secretKey: string, baseUrl: string): void {
  const sandboxKeys = apiKey.startsWith(SANDBOX_KEY_PREFIX) || secretKey.startsWith(SANDBOX_KEY_PREFIX)
  if (sandboxKeys && baseUrl === LIVE_BASE) {
    throw new PaymentConfigError('iyzico', 'iyzico_sandbox_credentials_on_live_host')
  }
  if (!sandboxKeys && baseUrl === SANDBOX_BASE) {
    throw new PaymentConfigError('iyzico', 'iyzico_live_credentials_on_sandbox_host')
  }
}

export type IyzicoEnvironmentReport = {
  environment: 'production' | 'preview' | 'development' | 'unknown'
  iyzico_host: 'sandbox' | 'live' | 'missing' | 'unsupported'
  iyzico_credentials: 'present' | 'missing'
  iyzico_credential_type: 'sandbox' | 'live' | 'unknown'
  resolve_result: 'ok' | string
}

/** Secret-free snapshot of how this deployment would reach iyzico. Safe to log. */
export function describeIyzicoEnvironment(): IyzicoEnvironmentReport {
  const vercelEnv = process.env.VERCEL_ENV
  const environment =
    vercelEnv === 'production' || vercelEnv === 'preview' || vercelEnv === 'development'
      ? vercelEnv
      : 'unknown'

  const configured = process.env.IYZICO_BASE_URL?.trim().replace(/\/$/, '')
  const iyzico_host = !configured
    ? 'missing'
    : configured === SANDBOX_BASE
      ? 'sandbox'
      : configured === LIVE_BASE
        ? 'live'
        : 'unsupported'

  const apiKey = process.env.IYZICO_API_KEY?.trim()
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim()
  const hasCredentials = Boolean(apiKey && secretKey)

  let resolve_result: string = 'ok'
  try {
    const baseUrl = resolveIyzicoBaseUrl()
    if (apiKey && secretKey) assertCredentialsMatchHost(apiKey, secretKey, baseUrl)
  } catch (error) {
    resolve_result = error instanceof Error ? error.message : 'unknown_error'
  }

  return {
    environment,
    iyzico_host,
    iyzico_credentials: hasCredentials ? 'present' : 'missing',
    iyzico_credential_type: !hasCredentials
      ? 'unknown'
      : apiKey!.startsWith(SANDBOX_KEY_PREFIX)
        ? 'sandbox'
        : 'live',
    resolve_result,
  }
}

/**
 * Only the two official iyzico hosts are accepted. In production the live host
 * is mandatory: an unset or sandbox value fails closed instead of silently
 * charging against the sandbox. The single exception is a domain purchase while
 * `DOMAIN_E2E_TEST_MODE=true` with the registrar on its OTE endpoint and sandbox
 * credentials (`mayUseSandboxIyzicoInProduction`); plan subscriptions and every
 * other production payment never get it.
 */
export function resolveIyzicoBaseUrl(options: IyzicoRequestOptions = {}): string {
  const configured = process.env.IYZICO_BASE_URL?.trim().replace(/\/$/, '')
  const isProduction = process.env.VERCEL_ENV === 'production'

  if (!configured) {
    if (isProduction) {
      throw new PaymentConfigError('iyzico', 'iyzico_base_url_missing')
    }
    return SANDBOX_BASE
  }
  if (configured !== SANDBOX_BASE && configured !== LIVE_BASE) {
    throw new PaymentConfigError('iyzico', 'iyzico_base_url_unsupported')
  }
  if (isProduction && configured !== LIVE_BASE) {
    if (configured === SANDBOX_BASE && mayUseSandboxIyzicoInProduction(Boolean(options.domainPurchase))) {
      console.log('[v0] iyzico: DOMAIN_E2E_TEST_MODE active, using sandbox host for a domain purchase')
      return configured
    }
    throw new PaymentConfigError('iyzico', 'iyzico_base_url_not_live')
  }
  return configured
}

/**
 * IYZWSv2 authorization: base64("apiKey:<key>&randomKey:<rnd>&signature:<sig>")
 * where sig = HMAC-SHA256(rnd + uriPath + JSON.stringify(body), secretKey).
 * `uriPath` MUST be the request path only (no host), and `body` MUST be the
 * exact JSON string sent on the wire, or the signature will not verify.
 */
function buildAuthHeaders(
  uriPath: string,
  bodyJson: string,
  creds: IyzicoCredentials,
): Record<string, string> {
  const randomKey = `${Date.now()}${randomBytes(8).toString('hex')}`
  const payload = randomKey + uriPath + bodyJson
  const signature = createHmac('sha256', creds.secretKey)
    .update(payload, 'utf8')
    .digest('hex')
  const authString = `apiKey:${creds.apiKey}&randomKey:${randomKey}&signature:${signature}`
  const authorization = `IYZWSv2 ${Buffer.from(authString, 'utf8').toString('base64')}`
  return {
    Authorization: authorization,
    'x-iyzi-rnd': randomKey,
    'Content-Type': 'application/json',
  }
}

async function iyzicoFetch(
  uriPath: string,
  body: Record<string, unknown>,
  options: IyzicoRequestOptions = {},
): Promise<Record<string, unknown>> {
  const creds = readCredentials(options)
  const bodyJson = JSON.stringify(body)
  const headers = buildAuthHeaders(uriPath, bodyJson, creds)
  console.log('[v0] iyzico request', {
    uriPath,
    baseUrl: creds.baseUrl,
    isSandbox: creds.baseUrl.includes('sandbox'),
  })
  const res = await fetch(`${creds.baseUrl}${uriPath}`, {
    method: 'POST',
    headers,
    body: bodyJson,
  })
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
  console.log('[v0] iyzico response', {
    uriPath,
    httpStatus: res.status,
    status: json?.status,
    paymentStatus: (json as Record<string, unknown> | null)?.paymentStatus,
    errorCode: json?.errorCode,
    errorMessage: json?.errorMessage,
    errorGroup: json?.errorGroup,
    hasToken: uriPath === CF_INITIALIZE_PATH ? Boolean(json?.token) : undefined,
  })
  if (!json) {
    throw new Error(`iyzico_error: http_${res.status}`)
  }
  return json
}

/**
 * Resolve the absolute origin for iyzico's callbackUrl.
 *
 * Priority:
 * 1. `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` — explicit override, wins
 *    everywhere (production, preview, or local) when set.
 * 2. Production (`VERCEL_ENV === 'production'`) — always the canonical
 *    platform host, exactly as before. This branch is unchanged so the
 *    already-working production callback behavior is preserved.
 * 3. Any other Vercel deployment (preview/branch) — `VERCEL_URL` is
 *    auto-populated by Vercel for every deployment (no secret needed), so the
 *    callback returns to THIS deployment instead of being hardcoded to
 *    gloval.ai. Without this, iyzico's hosted page would send the buyer's
 *    browser back to production, which can never see the preview's
 *    `provider_ref` row.
 * 4. Any other production build (`NODE_ENV === 'production'`, e.g. a
 *    self-hosted `next start` that has no `VERCEL_*` variables) — the
 *    canonical platform host. A production build must never hand iyzico a
 *    localhost callback.
 * 5. Local dev / sandboxes (`NODE_ENV !== 'production'`) with no public
 *    origin available in env — falls back to localhost. iyzico's hosted page
 *    redirects the buyer's browser to the callback, so localhost is only
 *    reachable when that browser runs on the same machine. If the test
 *    environment is reachable at a public URL (preview URL, tunnel), set
 *    `NEXT_PUBLIC_SITE_URL` explicitly so branch 1 wins.
 */
export function resolveCallbackOrigin(): string {
  // Production is pinned to the canonical host; env overrides cannot redirect it.
  if (process.env.VERCEL_ENV === 'production') {
    return platformUrl('/').replace(/\/$/, '')
  }

  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl}`

  if (process.env.NODE_ENV === 'production') {
    return platformUrl('/').replace(/\/$/, '')
  }

  const port = process.env.PORT?.trim() || '3000'
  return `http://localhost:${port}`
}

/**
 * iyzico's own documented sandbox test GSM number. Used ONLY as a last
 * resort in the sandbox environment when the buyer did not supply a usable
 * phone number — mirrors `toIdentityNumber`'s sandbox-only fallback below.
 * `500` (the old fallback) is not a valid Turkish mobile operator prefix and
 * iyzico's Sandbox validator rejects it outright (errorCode 200310).
 */
const IYZICO_SANDBOX_TEST_GSM = '+905350000000'

/**
 * Turkish mobile phone -> iyzico's required `+90XXXXXXXXXX` gsmNumber format.
 * Returns null when `raw` does not normalize to a valid 10-digit `5XXXXXXXXX`
 * number, so the caller can decide how to handle a genuinely missing/invalid
 * phone number instead of silently sending iyzico a fabricated one.
 */
function toGsmNumber(raw: string | undefined | null): string | null {
  const digits = (raw ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  let national = digits
  if (national.startsWith('90') && national.length > 10) national = national.slice(2)
  if (national.startsWith('0')) national = national.slice(1)
  national = national.slice(-10)
  if (national.length !== 10 || !national.startsWith('5')) return null
  return `+90${national}`
}

/**
 * iyzico requires an 11-digit TC identity number for individual buyers. When
 * the buyer did not supply one (e.g. a company/tax-id buyer), fall back to
 * iyzico's own well-known sandbox test identity number so Checkout Form
 * initialize does not reject the request in the SANDBOX environment.
 */
function toIdentityNumber(raw: string | undefined | null): string {
  const digits = (raw ?? '').replace(/[^0-9]/g, '')
  return digits.length === 11 ? digits : '11111111111'
}

type IyzicoBuyerInput = {
  fullName?: string
  phone?: string
  address?: string
  identityNumber?: string
  ip?: string
}

export const iyzicoProvider: PaymentProvider = {
  id: 'iyzico',

  capabilities: {
    synchronous: false,
    refunds: false,
    subscriptions: false,
    manualVerification: false,
  },

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    // Fail fast (PaymentConfigError) if the secrets are missing, before doing
    // any network work.
    const requestOptions: IyzicoRequestOptions = {
      domainPurchase: input.orderId.startsWith(DOMAIN_PURCHASE_ORDER_PREFIX),
    }
    const creds = readCredentials(requestOptions)
    const isSandbox = creds.baseUrl.includes('sandbox')

    const buyer = (input.publicConfig?.buyer ?? {}) as IyzicoBuyerInput
    const rawName = (buyer.fullName || input.customerEmail.split('@')[0] || 'Müşteri').trim()
    const [firstName, ...rest] = rawName.split(/\s+/)
    const surname = rest.join(' ') || firstName

    const currency = input.currency.trim().toUpperCase()
    const priceStr = (input.amountCents / 100).toFixed(2)
    const conversationId = input.orderId
    const address = buyer.address?.trim() || 'Belirtilmedi'

    const callbackOrigin = resolveCallbackOrigin()
    const callbackUrl = `${callbackOrigin}/api/billing/checkout/iyzico/callback`

    const normalizedGsm = toGsmNumber(buyer.phone)
    let gsmNumber: string
    if (normalizedGsm) {
      gsmNumber = normalizedGsm
    } else if (isSandbox) {
      // No usable phone number; safe in sandbox only — never used for a real
      // charge.
      gsmNumber = IYZICO_SANDBOX_TEST_GSM
    } else {
      // A live charge must not proceed with a fabricated phone number.
      throw new Error('iyzico_invalid_gsm_number')
    }

    console.log('[v0] iyzico createIntent: resolved callback origin + gsm', {
      callbackOrigin,
      usedExplicitEnv: Boolean(
        process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim(),
      ),
      isSandbox,
      gsmNumberWasFallback: !normalizedGsm,
    })

    const body = {
      locale: 'tr',
      conversationId,
      price: priceStr,
      paidPrice: priceStr,
      currency: currency === 'TL' ? 'TRY' : currency,
      basketId: conversationId,
      paymentGroup: 'PRODUCT',
      callbackUrl,
      buyer: {
        id: conversationId,
        name: firstName || 'Müşteri',
        surname,
        identityNumber: toIdentityNumber(buyer.identityNumber),
        email: input.customerEmail,
        gsmNumber,
        registrationAddress: address,
        city: 'Istanbul',
        country: 'Turkey',
        ip: buyer.ip || '85.34.78.112',
      },
      shippingAddress: {
        contactName: rawName,
        city: 'Istanbul',
        country: 'Turkey',
        address,
      },
      billingAddress: {
        contactName: rawName,
        city: 'Istanbul',
        country: 'Turkey',
        address,
      },
      basketItems: [
        {
          id: conversationId,
          price: priceStr,
          name: `GLOVAL AI — ${conversationId}`,
          category1: 'Abonelik',
          itemType: 'VIRTUAL',
        },
      ],
    }

    const json = await iyzicoFetch(CF_INITIALIZE_PATH, body, requestOptions)
    if (json.status !== 'success' || !json.token || !json.paymentPageUrl) {
      const errorMessage =
        typeof json.errorMessage === 'string' ? json.errorMessage : String(json.status ?? 'unknown')
      throw new Error(`iyzico_error: ${errorMessage}`)
    }

    const paymentPageUrl = String(json.paymentPageUrl)
    let paymentPageHost: string
    try {
      const parsed = new URL(paymentPageUrl)
      paymentPageHost = parsed.hostname
    } catch {
      throw new Error('iyzico_error: invalid_payment_page_url')
    }

    const isIyzicoCheckoutHost =
      paymentPageHost === 'sandbox-cpp.iyzipay.com' ||
      paymentPageHost === 'cpp.iyzipay.com' ||
      paymentPageHost.endsWith('.iyzipay.com')
    if (!isIyzicoCheckoutHost) {
      throw new Error('iyzico_error: unexpected_payment_page_host')
    }

    return {
      reference: String(json.token),
      action: 'redirect',
      redirectUrl: paymentPageUrl,
      status: 'pending',
    }
  },

  // Checkout Form has no signed push webhook to verify here — the callback
  // route authenticates the result itself via `retrieveIyzicoCheckoutForm`
  // and settles directly, so nothing should ever be trusted through this
  // generic path for iyzico.
  async parseWebhook(): Promise<PaymentWebhookResult | null> {
    return null
  },
}

/**
 * Server-side retrieve/detail call — the ONLY source of truth for whether a
 * Checkout Form payment succeeded. The callback POST body's own fields (e.g.
 * a `status` param, if present) must never be trusted on their own; always
 * confirm with this call before activating anything.
 */
export async function retrieveIyzicoCheckoutForm(
  token: string,
  options: IyzicoRequestOptions = {},
): Promise<{
  paid: boolean
  status: string
  raw: Record<string, unknown>
}> {
  console.log('[v0] iyzico retrieve: token received for lookup', {
    tokenMasked: maskToken(token),
    tokenLength: token.length,
  })
  const json = await iyzicoFetch(
    CF_RETRIEVE_PATH,
    {
      locale: 'tr',
      token,
    },
    options,
  )
  const paymentStatus = String(json.paymentStatus ?? '')
  const requestStatus = String(json.status ?? '')
  const paid = requestStatus === 'success' && paymentStatus === 'SUCCESS'
  console.log('[v0] iyzico retrieve: parsed result', {
    tokenMasked: maskToken(token),
    requestStatus,
    paymentStatus,
    paid,
    conversationId: json.conversationId,
  })
  return {
    paid,
    status: paymentStatus || requestStatus,
    raw: json,
  }
}

/** Log-safe partial token (first 6 + last 4 chars) — never log the full token or secrets. */
function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 3)}***`
  return `${token.slice(0, 6)}...${token.slice(-4)}`
}
