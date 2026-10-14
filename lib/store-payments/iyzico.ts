import { createHmac, randomBytes } from 'node:crypto'
import {
  IYZICO_PAYMENT_SOURCE,
  iyzicoBaseUrl,
  type IyzicoEnvironment,
} from '@/lib/store-payments/iyzico-constants'

/**
 * Per-store iyzico Checkout Form client (IYZWSv2). It signs with the store
 * owner's own keys and talks only to the two fixed iyzico hosts. Nothing in
 * its results ever contains a key, a signature or a raw iyzico response, so
 * results are safe to log and to return to the owner UI.
 *
 * Deliberately independent of the platform billing adapter in
 * `lib/payments/iyzico.ts`.
 */

export type IyzicoCredentials = {
  apiKey: string
  secretKey: string
  environment: IyzicoEnvironment
}

export const INITIALIZE_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom'
export const RETRIEVE_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail'

const REQUEST_TIMEOUT_MS = 15_000

/** iyzico error codes meaning "the API key / signature was not accepted". */
const AUTH_ERROR_CODES = new Set(['1000', '1001'])

/**
 * IYZWSv2 headers: base64("apiKey:<key>&randomKey:<rnd>&signature:<sig>") where
 * sig = hex(HMAC-SHA256(secret, rnd + uriPath + bodyJson)). `bodyJson` must be
 * the exact string sent on the wire.
 */
export function signIyzicoRequest(
  uriPath: string,
  bodyJson: string,
  creds: Pick<IyzicoCredentials, 'apiKey' | 'secretKey'>,
  randomKey: string = `${Date.now()}${randomBytes(8).toString('hex')}`,
): Record<string, string> {
  const signature = createHmac('sha256', creds.secretKey)
    .update(randomKey + uriPath + bodyJson, 'utf8')
    .digest('hex')
  const authString = `apiKey:${creds.apiKey}&randomKey:${randomKey}&signature:${signature}`
  return {
    Authorization: `IYZWSv2 ${Buffer.from(authString, 'utf8').toString('base64')}`,
    'x-iyzi-rnd': randomKey,
    'Content-Type': 'application/json',
  }
}

/** Integer cents -> iyzico decimal string ("12.5", "100.0"); never floating point math. */
export function centsToIyzicoPrice(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('invalid_amount')
  const whole = Math.floor(cents / 100)
  const frac = cents % 100
  const fracText = frac === 0 ? '0' : String(frac).padStart(2, '0').replace(/0$/, '')
  return `${whole}.${fracText}`
}

/** iyzico decimal ("12.5", 12.5, "12.50000000") -> integer cents, or null if not exactly representable. */
export function iyzicoPriceToCents(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  const match = /^(\d{1,9})(?:\.(\d{1,10}))?$/.exec(text)
  if (!match) return null
  const decimals = (match[2] ?? '').padEnd(2, '0')
  if (/[1-9]/.test(decimals.slice(2))) return null
  return Number(match[1]) * 100 + Number(decimals.slice(0, 2))
}

/** Normalizes a Turkish mobile number to +90XXXXXXXXXX, or null. */
export function normalizeBuyerPhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  let national = digits
  if (national.startsWith('90') && national.length === 12) national = national.slice(2)
  else if (national.startsWith('0') && national.length === 11) national = national.slice(1)
  return /^5\d{9}$/.test(national) ? `+90${national}` : null
}

export type IyzicoBuyerInput = {
  name: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  district?: string
  postalCode?: string
  ip: string
  /** Valid 11-digit TCKN from the invoice details, when the buyer gave one. */
  identityNumber?: string
}

export type BuyerCheck =
  | { ok: true; buyer: Required<Omit<IyzicoBuyerInput, 'district' | 'postalCode' | 'identityNumber'>> & { phone: string; zipCode: string; identityNumber: string } }
  | { ok: false; missing: string[] }

const FALLBACK_IDENTITY_NUMBER = '11111111111'
const FALLBACK_ZIP = '34000'

/** Required buyer data for an iyzico checkout; names the missing fields (Turkish labels). */
export function checkBuyer(input: IyzicoBuyerInput): BuyerCheck {
  const missing: string[] = []
  const clean = (v: string | undefined) => (v ?? '').trim()
  const name = clean(input.name)
  const lastName = clean(input.lastName)
  const email = clean(input.email)
  const address = clean(input.address)
  const city = clean(input.city)
  const phone = normalizeBuyerPhone(input.phone)
  const ip = clean(input.ip)

  if (!name) missing.push('Ad')
  if (!lastName) missing.push('Soyad')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) missing.push('E-posta')
  if (!phone) missing.push('Telefon')
  if (!address) missing.push('Adres')
  if (!city) missing.push('Şehir')
  if (!ip) missing.push('IP')
  if (missing.length > 0 || !phone) return { ok: false, missing }

  const tckn = clean(input.identityNumber)
  return {
    ok: true,
    buyer: {
      name,
      lastName,
      email,
      phone,
      address,
      city,
      ip,
      zipCode: clean(input.postalCode) || FALLBACK_ZIP,
      identityNumber: /^\d{11}$/.test(tckn) ? tckn : FALLBACK_IDENTITY_NUMBER,
    },
  }
}

export type IyzicoBasketLine = { id: string; name: string; totalCents: number }

export type InitializeInput = {
  orderId: string
  totalCents: number
  currency: string
  lines: IyzicoBasketLine[]
  shippingCents: number
  buyer: Extract<BuyerCheck, { ok: true }>['buyer']
  callbackUrl: string
}

function clampText(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim()
  return (text || '-').slice(0, max)
}

/**
 * Builds the Checkout Form initialize body. The basket items MUST add up to
 * the price exactly (iyzico rejects anything else), so a mismatch throws
 * instead of sending a request that would charge a different amount.
 */
export function buildInitializeBody(input: InitializeInput): Record<string, unknown> {
  const items = input.lines.map((l) => ({
    id: clampText(l.id, 64),
    name: clampText(l.name, 100),
    category1: 'Ürün',
    itemType: 'PHYSICAL',
    price: centsToIyzicoPrice(l.totalCents),
    cents: l.totalCents,
  }))
  if (input.shippingCents > 0) {
    items.push({
      id: 'KARGO',
      name: 'Kargo',
      category1: 'Kargo',
      itemType: 'PHYSICAL',
      price: centsToIyzicoPrice(input.shippingCents),
      cents: input.shippingCents,
    })
  }
  const sum = items.reduce((acc, i) => acc + i.cents, 0)
  if (sum !== input.totalCents) throw new Error('basket_total_mismatch')

  const b = input.buyer
  const contactName = `${b.name} ${b.lastName}`
  const address = { contactName, city: b.city, country: 'Turkey', address: b.address, zipCode: b.zipCode }
  const price = centsToIyzicoPrice(input.totalCents)

  return {
    locale: 'tr',
    conversationId: input.orderId,
    price,
    paidPrice: price,
    currency: input.currency.toUpperCase() === 'TL' ? 'TRY' : input.currency.toUpperCase(),
    basketId: input.orderId,
    paymentGroup: 'PRODUCT',
    callbackUrl: input.callbackUrl,
    paymentSource: IYZICO_PAYMENT_SOURCE,
    buyer: {
      id: input.orderId,
      name: b.name,
      surname: b.lastName,
      gsmNumber: b.phone,
      email: b.email,
      identityNumber: b.identityNumber,
      registrationAddress: b.address,
      ip: b.ip,
      city: b.city,
      country: 'Turkey',
      zipCode: b.zipCode,
    },
    shippingAddress: address,
    billingAddress: address,
    basketItems: items.map(({ cents: _cents, ...rest }) => rest),
  }
}

export function buildRetrieveBody(token: string, conversationId: string): Record<string, unknown> {
  return { locale: 'tr', conversationId, token }
}

type RawResult =
  | { kind: 'json'; data: Record<string, unknown>; status: number }
  | { kind: 'unavailable' }

export type FetchLike = typeof fetch

async function post(
  creds: IyzicoCredentials,
  path: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<RawResult> {
  const bodyJson = JSON.stringify(body)
  try {
    const res = await fetchImpl(`${iyzicoBaseUrl(creds.environment)}${path}`, {
      method: 'POST',
      headers: signIyzicoRequest(path, bodyJson, creds),
      body: bodyJson,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const data: unknown = await res.json().catch(() => null)
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { kind: 'unavailable' }
    if (res.status >= 500) return { kind: 'unavailable' }
    return { kind: 'json', data: data as Record<string, unknown>, status: res.status }
  } catch {
    return { kind: 'unavailable' }
  }
}

function isAuthFailure(raw: { data: Record<string, unknown>; status: number }): boolean {
  if (raw.status === 401 || raw.status === 403) return true
  return AUTH_ERROR_CODES.has(String(raw.data.errorCode ?? ''))
}

export type InitializeResult =
  | { ok: true; token: string; paymentPageUrl: string }
  | { ok: false; reason: 'auth' | 'rejected' | 'unavailable' }

/** Only an https page on an iyzico host may ever be handed to the buyer's browser. */
export function isIyzicoPageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname.endsWith('.iyzipay.com') ||
        url.hostname === 'iyzipay.com' ||
        url.hostname.endsWith('.iyzico.com') ||
        url.hostname === 'iyzico.com')
    )
  } catch {
    return false
  }
}

export async function initializeCheckoutForm(
  creds: IyzicoCredentials,
  body: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<InitializeResult> {
  const raw = await post(creds, INITIALIZE_PATH, body, fetchImpl)
  if (raw.kind === 'unavailable') return { ok: false, reason: 'unavailable' }
  if (isAuthFailure(raw)) return { ok: false, reason: 'auth' }
  const { data } = raw
  if (data.status !== 'success') return { ok: false, reason: 'rejected' }
  const token = typeof data.token === 'string' ? data.token : ''
  if (!token || !isIyzicoPageUrl(data.paymentPageUrl)) return { ok: false, reason: 'rejected' }
  return { ok: true, token, paymentPageUrl: data.paymentPageUrl }
}

export type RetrieveData = {
  status: string
  paymentStatus: string
  conversationId: string
  basketId: string
  paymentId: string
  currency: string
  priceCents: number | null
  paidPriceCents: number | null
}

export type RetrieveResult =
  | { kind: 'ok'; data: RetrieveData }
  | { kind: 'error' }
  | { kind: 'unavailable' }

export async function retrieveCheckoutForm(
  creds: IyzicoCredentials,
  token: string,
  conversationId: string,
  fetchImpl: FetchLike = fetch,
): Promise<RetrieveResult> {
  const raw = await post(creds, RETRIEVE_PATH, buildRetrieveBody(token, conversationId), fetchImpl)
  // A wrong key / signature says nothing about the payment: never read it as a failure.
  if (raw.kind === 'unavailable' || isAuthFailure(raw)) return { kind: 'unavailable' }
  const d = raw.data
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  if (d.status !== 'success') return { kind: 'error' }
  return {
    kind: 'ok',
    data: {
      status: str(d.status),
      paymentStatus: str(d.paymentStatus).toUpperCase(),
      conversationId: str(d.conversationId),
      basketId: str(d.basketId),
      paymentId: str(d.paymentId),
      currency: str(d.currency).toUpperCase(),
      priceCents: iyzicoPriceToCents(d.price),
      paidPriceCents: iyzicoPriceToCents(d.paidPrice),
    },
  }
}

export type RetrieveVerdict =
  | { kind: 'paid'; paymentId: string; paidPriceCents: number; currency: string }
  | { kind: 'failed' }
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | { kind: 'mismatch'; reason: 'conversation' | 'price' | 'paid_price' | 'currency' | 'payment_id' }

function normalizeCurrency(c: string): string {
  const up = c.trim().toUpperCase()
  return up === 'TL' ? 'TRY' : up
}

/**
 * Decides what a retrieve answer means for ONE order. A payment only counts
 * when iyzico says SUCCESS and the answer is bound to this very order, price
 * and currency. `paidPrice` may exceed the order total (an installment fee the
 * buyer agreed to) but must never be lower.
 */
export function evaluateRetrieve(
  result: RetrieveResult,
  order: { id: string; totalCents: number; currency: string },
): RetrieveVerdict {
  if (result.kind === 'unavailable') return { kind: 'unavailable' }
  if (result.kind === 'error') return { kind: 'failed' }
  const d = result.data
  if (d.paymentStatus === 'FAILURE') return { kind: 'failed' }
  if (d.paymentStatus !== 'SUCCESS') return { kind: 'pending' }

  if (d.conversationId !== order.id || (d.basketId && d.basketId !== order.id)) {
    return { kind: 'mismatch', reason: 'conversation' }
  }
  if (d.priceCents !== order.totalCents) return { kind: 'mismatch', reason: 'price' }
  if (d.paidPriceCents === null || d.paidPriceCents < order.totalCents) {
    return { kind: 'mismatch', reason: 'paid_price' }
  }
  if (normalizeCurrency(d.currency) !== normalizeCurrency(order.currency)) {
    return { kind: 'mismatch', reason: 'currency' }
  }
  if (!d.paymentId) return { kind: 'mismatch', reason: 'payment_id' }
  return { kind: 'paid', paymentId: d.paymentId, paidPriceCents: d.paidPriceCents, currency: d.currency }
}

export type ConnectionTestResult =
  | { ok: true }
  | { ok: false; error: 'auth' | 'rejected' | 'unavailable' }

/**
 * Connection test: a tiny checkout-form initialize. It creates no order and
 * charges nothing (the form is never opened). Returns only a coarse outcome.
 */
export async function testIyzicoConnection(
  creds: IyzicoCredentials,
  callbackUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<ConnectionTestResult> {
  const id = `gloval-test-${randomBytes(6).toString('hex')}`
  const body = buildInitializeBody({
    orderId: id,
    totalCents: 100,
    currency: 'TRY',
    lines: [{ id: 'TEST', name: 'Baglanti testi', totalCents: 100 }],
    shippingCents: 0,
    buyer: {
      name: 'Test',
      lastName: 'Kullanici',
      email: 'test@example.com',
      phone: '+905320000000',
      address: 'Test Mahallesi Test Sokak No 1',
      city: 'Istanbul',
      ip: '85.34.78.112',
      zipCode: FALLBACK_ZIP,
      identityNumber: FALLBACK_IDENTITY_NUMBER,
    },
    callbackUrl,
  })
  const res = await initializeCheckoutForm(creds, body, fetchImpl)
  return res.ok ? { ok: true } : { ok: false, error: res.reason }
}
