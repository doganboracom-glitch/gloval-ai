import { createHmac, randomBytes } from 'node:crypto'
import {
  IYZICO_BUYER_IDENTITY_PLACEHOLDER,
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
export const CANCEL_PATH = '/payment/cancel'
export const REFUND_PATH = '/payment/refund'

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

/**
 * Normalizes a Turkish phone number (spaces, dashes, parentheses, a leading 0,
 * 90 or 0090 are all accepted) to +90XXXXXXXXXX, or null. Mobile (5xx),
 * landline (2xx/3xx/4xx) and 0850/0800 service numbers are valid: iyzico accepts
 * them as `gsmNumber`, so a store must not turn such a buyer away.
 */
export function normalizeBuyerPhone(raw: string | null | undefined): string | null {
  let national = (raw ?? '').replace(/\D/g, '')
  if (national.startsWith('0090') && national.length === 14) national = national.slice(4)
  else if (national.startsWith('90') && national.length === 12) national = national.slice(2)
  else if (national.startsWith('0') && national.length === 11) national = national.slice(1)
  return /^[2-58]\d{9}$/.test(national) ? `+90${national}` : null
}

/** A Turkish postal code is exactly five digits. */
export function isValidPostalCode(raw: string | null | undefined): boolean {
  return /^\d{5}$/.test((raw ?? '').trim())
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

export type BuyerField = 'name' | 'lastName' | 'email' | 'phone' | 'address' | 'city' | 'postalCode'
export type BuyerIssue = { field: BuyerField; problem: 'missing' | 'invalid' }

export type BuyerCheck =
  | { ok: true; buyer: Required<Omit<IyzicoBuyerInput, 'district' | 'postalCode' | 'identityNumber'>> & { phone: string; zipCode: string; identityNumber: string } }
  | { ok: false; missing: string[]; issues: BuyerIssue[] }

const FALLBACK_ZIP = '34000'

const BUYER_FIELD_LABELS: Record<BuyerField, string> = {
  name: 'Ad',
  lastName: 'Soyad',
  email: 'E-posta',
  phone: 'Telefon',
  address: 'Adres',
  city: 'Şehir',
  postalCode: 'Posta kodu',
}

/**
 * Buyer data for an iyzico checkout. Names every field that is empty or
 * malformed (`issues`, with Turkish `missing` labels for display). The IP is
 * optional for iyzico, so it never blocks an order; the national ID is never
 * asked of the buyer (see `IYZICO_BUYER_IDENTITY_PLACEHOLDER`).
 */
export function checkBuyer(input: IyzicoBuyerInput): BuyerCheck {
  const issues: BuyerIssue[] = []
  const clean = (v: string | undefined) => (v ?? '').trim()
  const name = clean(input.name)
  const lastName = clean(input.lastName)
  const email = clean(input.email)
  const address = clean(input.address)
  const city = clean(input.city)
  const rawPhone = clean(input.phone)
  const phone = normalizeBuyerPhone(rawPhone)
  const postalCode = clean(input.postalCode)

  if (!name) issues.push({ field: 'name', problem: 'missing' })
  if (!lastName) issues.push({ field: 'lastName', problem: 'missing' })
  if (!email) issues.push({ field: 'email', problem: 'missing' })
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push({ field: 'email', problem: 'invalid' })
  if (!rawPhone) issues.push({ field: 'phone', problem: 'missing' })
  else if (!phone) issues.push({ field: 'phone', problem: 'invalid' })
  if (!address) issues.push({ field: 'address', problem: 'missing' })
  if (!city) issues.push({ field: 'city', problem: 'missing' })
  if (postalCode && !isValidPostalCode(postalCode)) issues.push({ field: 'postalCode', problem: 'invalid' })
  if (issues.length > 0 || !phone) {
    return { ok: false, missing: issues.map((i) => BUYER_FIELD_LABELS[i.field]), issues }
  }

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
      ip: clean(input.ip),
      zipCode: postalCode || FALLBACK_ZIP,
      identityNumber: /^\d{11}$/.test(tckn) ? tckn : IYZICO_BUYER_IDENTITY_PLACEHOLDER,
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
      ...(b.ip ? { ip: b.ip } : {}),
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
  /** Per basket item payment transactions: the ids a refund is made against. */
  items?: RetrieveItem[]
}

export type RetrieveItem = {
  itemId: string
  paymentTransactionId: string
  /** What the buyer actually paid for this item (price plus any installment fee). */
  paidPriceCents: number | null
  priceCents: number | null
}

function parseItemTransactions(value: unknown): RetrieveItem[] {
  if (!Array.isArray(value)) return []
  const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  const items: RetrieveItem[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const paymentTransactionId = text(r.paymentTransactionId)
    if (!paymentTransactionId) continue
    items.push({
      itemId: text(r.itemId),
      paymentTransactionId,
      paidPriceCents: iyzicoPriceToCents(r.paidPrice),
      priceCents: iyzicoPriceToCents(r.price),
    })
  }
  return items
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
      items: parseItemTransactions(d.itemTransactions),
    },
  }
}

export type ReversalResult =
  | { kind: 'ok'; ref: string }
  /** iyzico answered and refused. `code` is digits only (or empty), safe to store and show. */
  | { kind: 'rejected'; code: string }
  | { kind: 'auth' }
  /** No usable answer (network, timeout, 5xx): the reversal may or may not have happened. */
  | { kind: 'unavailable' }

function readReversal(
  raw: RawResult,
  refField: string,
  fallbackField: string,
): ReversalResult {
  if (raw.kind === 'unavailable') return { kind: 'unavailable' }
  if (isAuthFailure(raw)) return { kind: 'auth' }
  const d = raw.data
  if (d.status !== 'success') {
    const code = String(d.errorCode ?? '')
    return { kind: 'rejected', code: /^\d{1,6}$/.test(code) ? code : '' }
  }
  const pick = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '')
  const ref = (pick(d[refField]) || pick(d[fallbackField])).slice(0, 120)
  return { kind: 'ok', ref }
}

/**
 * Same-day reversal of a whole payment (iyzico "cancel"). Needs the paymentId.
 * Not idempotent at iyzico: callers guard it with the order's refund state.
 */
export async function cancelPayment(
  creds: IyzicoCredentials,
  input: { paymentId: string; conversationId: string },
  fetchImpl: FetchLike = fetch,
): Promise<ReversalResult> {
  const raw = await post(
    creds,
    CANCEL_PATH,
    { locale: 'tr', conversationId: input.conversationId, paymentId: input.paymentId },
    fetchImpl,
  )
  return readReversal(raw, 'hostReference', 'paymentId')
}

/**
 * Refund of ONE basket item's payment transaction (the day after the payment
 * or later). `priceCents` must not exceed what that item still has paid.
 */
export async function refundItemTransaction(
  creds: IyzicoCredentials,
  input: { paymentTransactionId: string; priceCents: number; currency: string; conversationId: string },
  fetchImpl: FetchLike = fetch,
): Promise<ReversalResult> {
  const currency = input.currency.toUpperCase() === 'TL' ? 'TRY' : input.currency.toUpperCase()
  const raw = await post(
    creds,
    REFUND_PATH,
    {
      locale: 'tr',
      conversationId: input.conversationId,
      paymentTransactionId: input.paymentTransactionId,
      price: centsToIyzicoPrice(input.priceCents),
      currency,
    },
    fetchImpl,
  )
  return readReversal(raw, 'hostReference', 'paymentTransactionId')
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
      identityNumber: IYZICO_BUYER_IDENTITY_PLACEHOLDER,
    },
    callbackUrl,
  })
  const res = await initializeCheckoutForm(creds, body, fetchImpl)
  return res.ok ? { ok: true } : { ok: false, error: res.reason }
}
