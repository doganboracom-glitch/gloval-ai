import 'server-only'
import { randomBytes } from 'node:crypto'
import {
  PAYTR_FRAME_BASE,
  PAYTR_GET_TOKEN_URL,
  PAYTR_TIMEOUT_MINUTES,
  buildUserBasket,
  classifyTokenFailure,
  computeTokenHash,
  type BasketLine,
  type PaytrCredentials,
  type PaytrTokenFields,
} from '@/lib/store-payments/paytr-core'

export type GetTokenInput = {
  credentials: PaytrCredentials
  userIp: string
  merchantOid: string
  email: string
  amountCents: number
  currency: string
  lines: BasketLine[]
  userName: string
  userAddress: string
  userPhone: string
  okUrl: string
  failUrl: string
  lang?: 'tr' | 'en'
}

export type GetTokenResult =
  | { ok: true; token: string; frameUrl: string }
  | { ok: false; error: 'invalid_credentials' | 'rejected' | 'network' }

const REQUEST_TIMEOUT_MS = 15_000

/**
 * Server-to-server PayTR iFrame `get-token` call with the STORE's own
 * credentials. The raw PayTR response and every secret stay in this function:
 * callers only get a token/frame URL or a coarse error code.
 */
export async function requestPaytrToken(input: GetTokenInput): Promise<GetTokenResult> {
  const { credentials: c } = input
  const userBasket = buildUserBasket(input.lines)
  const fields: PaytrTokenFields = {
    merchantId: c.merchantId,
    userIp: input.userIp,
    merchantOid: input.merchantOid,
    email: input.email,
    paymentAmount: input.amountCents,
    userBasket,
    noInstallment: 0,
    maxInstallment: 0,
    currency: input.currency,
    testMode: c.testMode,
  }
  const paytrToken = computeTokenHash(fields, c.merchantSalt, c.merchantKey)

  const body = new URLSearchParams({
    merchant_id: c.merchantId,
    user_ip: input.userIp,
    merchant_oid: input.merchantOid,
    email: input.email,
    payment_amount: String(input.amountCents),
    paytr_token: paytrToken,
    user_basket: userBasket,
    debug_on: '0',
    no_installment: '0',
    max_installment: '0',
    user_name: input.userName.slice(0, 60),
    user_address: input.userAddress.slice(0, 400),
    user_phone: input.userPhone.slice(0, 20),
    merchant_ok_url: input.okUrl,
    merchant_fail_url: input.failUrl,
    timeout_limit: String(PAYTR_TIMEOUT_MINUTES),
    currency: input.currency,
    test_mode: c.testMode ? '1' : '0',
    lang: input.lang ?? 'tr',
  })

  type TokenResponse = { status?: string; token?: string; reason?: string }
  let json = null as TokenResponse | null
  try {
    const res = await fetch(PAYTR_GET_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    json = (await res.json()) as typeof json
  } catch {
    return { ok: false, error: 'network' }
  }

  if (json?.status === 'success' && typeof json.token === 'string' && /^[A-Za-z0-9]{10,200}$/.test(json.token)) {
    return { ok: true, token: json.token, frameUrl: `${PAYTR_FRAME_BASE}${json.token}` }
  }
  return { ok: false, error: classifyTokenFailure(json?.reason) }
}

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; error: 'invalid_credentials' | 'rejected' | 'network' }

/**
 * "Test connection": a throwaway token request with `test_mode=1`. PayTR only
 * opens a payment session when a card is entered on the returned page, so no
 * charge and no order result from this call.
 */
export async function testPaytrCredentials(
  credentials: PaytrCredentials,
  userIp: string,
  returnUrl: string,
): Promise<ConnectionTestResult> {
  const result = await requestPaytrToken({
    credentials: { ...credentials, testMode: true },
    userIp,
    merchantOid: `TEST${randomBytes(8).toString('hex')}`,
    email: 'baglanti-testi@gloval.ai',
    amountCents: 100,
    currency: 'TL',
    lines: [{ name: 'Baglanti testi', unitPriceCents: 100, quantity: 1 }],
    userName: 'Baglanti Testi',
    userAddress: 'Baglanti testi',
    userPhone: '05000000000',
    okUrl: returnUrl,
    failUrl: returnUrl,
  })
  return result.ok ? { ok: true } : { ok: false, error: result.error }
}
