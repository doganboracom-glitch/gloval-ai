import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  buildInitializeBody,
  buildRetrieveBody,
  centsToIyzicoPrice,
  checkBuyer,
  evaluateRetrieve,
  initializeCheckoutForm,
  iyzicoPriceToCents,
  retrieveCheckoutForm,
  signIyzicoRequest,
  testIyzicoConnection,
  INITIALIZE_PATH,
  RETRIEVE_PATH,
  type IyzicoCredentials,
  type RetrieveResult,
} from '@/lib/store-payments/iyzico'
import {
  IYZICO_BASE_URLS,
  IYZICO_ENVIRONMENTS,
  IYZICO_PAYMENT_SOURCE,
  iyzicoBaseUrl,
} from '@/lib/store-payments/iyzico-constants'

const creds: IyzicoCredentials = { apiKey: 'sandbox-key', secretKey: 'sandbox-secret', environment: 'sandbox' }

const buyer = (() => {
  const check = checkBuyer({
    name: 'Ayşe',
    lastName: 'Yılmaz',
    email: 'ayse@example.com',
    phone: '0532 111 22 33',
    address: 'Bağdat Cad. No 1',
    city: 'İstanbul',
    ip: '85.1.2.3',
  })
  if (!check.ok) throw new Error('fixture buyer invalid')
  return check.buyer
})()

const initInput = {
  orderId: 'order-1',
  totalCents: 12550,
  currency: 'TRY',
  lines: [
    { id: 'p1', name: 'Ürün A', totalCents: 10000 },
    { id: 'p2', name: 'Ürün B', totalCents: 1550 },
  ],
  shippingCents: 1000,
  buyer,
  callbackUrl: 'https://gloval.ai/api/store/payment-return/iyzico/proj?o=1',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

describe('constants', () => {
  it('paymentSource is the single GLOVAL constant', () => {
    expect(IYZICO_PAYMENT_SOURCE).toBe('GLOVAL')
  })

  it('only the two fixed iyzico hosts are reachable', () => {
    expect([...IYZICO_ENVIRONMENTS].sort()).toEqual(['live', 'sandbox'])
    expect(iyzicoBaseUrl('sandbox')).toBe('https://sandbox-api.iyzipay.com')
    expect(iyzicoBaseUrl('live')).toBe('https://api.iyzipay.com')
    expect(Object.values(IYZICO_BASE_URLS).sort()).toEqual([
      'https://api.iyzipay.com',
      'https://sandbox-api.iyzipay.com',
    ])
  })
})

describe('signIyzicoRequest', () => {
  it('signs randomKey + uriPath + body with HMAC-SHA256 (IYZWSv2)', () => {
    const body = JSON.stringify({ a: 1 })
    const headers = signIyzicoRequest(INITIALIZE_PATH, body, creds, 'rnd123')
    const signature = createHmac('sha256', 'sandbox-secret')
      .update(`rnd123${INITIALIZE_PATH}${body}`)
      .digest('hex')
    const expected = Buffer.from(`apiKey:sandbox-key&randomKey:rnd123&signature:${signature}`).toString('base64')
    expect(headers.Authorization).toBe(`IYZWSv2 ${expected}`)
    expect(headers['x-iyzi-rnd']).toBe('rnd123')
  })

  it('never puts the secret key in a header', () => {
    const headers = signIyzicoRequest(RETRIEVE_PATH, '{}', creds, 'r')
    expect(JSON.stringify(headers)).not.toContain('sandbox-secret')
    expect(Buffer.from(headers.Authorization.replace('IYZWSv2 ', ''), 'base64').toString()).not.toContain(
      'sandbox-secret',
    )
  })

  it('a different body or path gives a different signature', () => {
    const a = signIyzicoRequest(INITIALIZE_PATH, '{}', creds, 'r').Authorization
    expect(signIyzicoRequest(INITIALIZE_PATH, '{"x":1}', creds, 'r').Authorization).not.toBe(a)
    expect(signIyzicoRequest(RETRIEVE_PATH, '{}', creds, 'r').Authorization).not.toBe(a)
  })
})

describe('price conversion', () => {
  it('converts cents to iyzico decimals without float math', () => {
    expect(centsToIyzicoPrice(0)).toBe('0.0')
    expect(centsToIyzicoPrice(100)).toBe('1.0')
    expect(centsToIyzicoPrice(1250)).toBe('12.5')
    expect(centsToIyzicoPrice(1205)).toBe('12.05')
    expect(centsToIyzicoPrice(12345)).toBe('123.45')
    expect(() => centsToIyzicoPrice(-1)).toThrow()
    expect(() => centsToIyzicoPrice(1.5)).toThrow()
  })

  it('reads iyzico decimals back to cents, rejecting sub-cent precision', () => {
    expect(iyzicoPriceToCents('12.5')).toBe(1250)
    expect(iyzicoPriceToCents(12.5)).toBe(1250)
    expect(iyzicoPriceToCents('12.50000000')).toBe(1250)
    expect(iyzicoPriceToCents('100')).toBe(10000)
    expect(iyzicoPriceToCents('12.505')).toBeNull()
    expect(iyzicoPriceToCents('abc')).toBeNull()
    expect(iyzicoPriceToCents(undefined)).toBeNull()
  })
})

describe('buyer check', () => {
  it('names the missing required fields', () => {
    const res = checkBuyer({ name: '', lastName: 'X', email: 'bad', phone: '123', address: '', city: '', ip: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.missing).toEqual(['Ad', 'E-posta', 'Telefon', 'Adres', 'Şehir', 'IP'])
  })

  it('normalizes a Turkish mobile number to +90', () => {
    expect(buyer.phone).toBe('+905321112233')
  })
})

describe('initialize body', () => {
  it('carries paymentSource GLOVAL and the order binding fields', () => {
    const body = buildInitializeBody(initInput)
    expect(body.paymentSource).toBe('GLOVAL')
    expect(body.conversationId).toBe('order-1')
    expect(body.basketId).toBe('order-1')
    expect(body.price).toBe('125.5')
    expect(body.paidPrice).toBe('125.5')
    expect(body.currency).toBe('TRY')
    expect(body.paymentGroup).toBe('PRODUCT')
  })

  it('basket items add up to the price, with shipping as its own line', () => {
    const body = buildInitializeBody(initInput)
    const items = body.basketItems as { id: string; price: string }[]
    expect(items.map((i) => i.id)).toEqual(['p1', 'p2', 'KARGO'])
    const cents = items.reduce((sum, i) => sum + (iyzicoPriceToCents(i.price) ?? 0), 0)
    expect(cents).toBe(12550)
  })

  it('omits the shipping line when shipping is free', () => {
    const body = buildInitializeBody({ ...initInput, totalCents: 11550, shippingCents: 0 })
    expect((body.basketItems as unknown[]).length).toBe(2)
  })

  it('refuses a basket that does not add up to the total', () => {
    expect(() => buildInitializeBody({ ...initInput, totalCents: 99999 })).toThrow('basket_total_mismatch')
  })
})

describe('every request sent to iyzico', () => {
  it('initialize carries paymentSource GLOVAL on the wire, signed, to the fixed host', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'success', token: 't1', paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/?token=t1' }),
    )
    const res = await initializeCheckoutForm(creds, buildInitializeBody(initInput), fetchImpl as unknown as typeof fetch)
    expect(res).toEqual({ ok: true, token: 't1', paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/?token=t1' })
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://sandbox-api.iyzipay.com${INITIALIZE_PATH}`)
    expect(JSON.parse(init.body as string).paymentSource).toBe('GLOVAL')
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^IYZWSv2 /)
  })

  it('the connection test (initialize) carries paymentSource GLOVAL and creates nothing', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'success', token: 't', paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/?token=t' }),
    )
    const res = await testIyzicoConnection(creds, 'https://gloval.ai/cb', fetchImpl as unknown as typeof fetch)
    expect(res).toEqual({ ok: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const sent = JSON.parse(init.body as string)
    expect(sent.paymentSource).toBe('GLOVAL')
    expect(sent.price).toBe('1.0')
  })

  it('retrieve body follows the documented fields (locale, conversationId, token) without paymentSource', async () => {
    expect(buildRetrieveBody('tok', 'order-1')).toEqual({ locale: 'tr', conversationId: 'order-1', token: 'tok' })
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'success', paymentStatus: 'SUCCESS' }))
    await retrieveCheckoutForm(creds, 'tok', 'order-1', fetchImpl as unknown as typeof fetch)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://sandbox-api.iyzipay.com${RETRIEVE_PATH}`)
    expect(JSON.parse(init.body as string)).toEqual({ locale: 'tr', conversationId: 'order-1', token: 'tok' })
  })

  it('live credentials only ever hit the live host', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'failure' }))
    await initializeCheckoutForm({ ...creds, environment: 'live' }, {}, fetchImpl as unknown as typeof fetch)
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`https://api.iyzipay.com${INITIALIZE_PATH}`)
  })
})

describe('initialize outcomes', () => {
  const run = (response: () => Promise<Response>) =>
    initializeCheckoutForm(creds, {}, vi.fn(response) as unknown as typeof fetch)

  it('maps an invalid key / signature to auth', async () => {
    expect(await run(async () => jsonResponse({ status: 'failure', errorCode: '1000' }, 200))).toEqual({
      ok: false,
      reason: 'auth',
    })
  })

  it('maps other failures to rejected without exposing the iyzico message', async () => {
    const res = await run(async () => jsonResponse({ status: 'failure', errorCode: '5', errorMessage: 'secret detail' }))
    expect(res).toEqual({ ok: false, reason: 'rejected' })
    expect(JSON.stringify(res)).not.toContain('secret detail')
  })

  it('treats a network error and a 5xx as unavailable', async () => {
    expect(await run(async () => Promise.reject(new Error('boom')))).toEqual({ ok: false, reason: 'unavailable' })
    expect(await run(async () => jsonResponse({}, 503))).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('refuses a payment page that is not on an iyzico host', async () => {
    const res = await run(async () =>
      jsonResponse({ status: 'success', token: 't', paymentPageUrl: 'https://evil.example.com/pay' }),
    )
    expect(res).toEqual({ ok: false, reason: 'rejected' })
  })
})

describe('retrieve network behaviour', () => {
  it('a network error is unavailable, never a failed payment', async () => {
    const res = await retrieveCheckoutForm(creds, 't', 'o', (async () => Promise.reject(new Error('down'))) as typeof fetch)
    expect(res).toEqual({ kind: 'unavailable' })
    expect(evaluateRetrieve(res, { id: 'o', totalCents: 100, currency: 'TRY' })).toEqual({ kind: 'unavailable' })
  })

  it('a rejected key on retrieve is unavailable too', async () => {
    const res = await retrieveCheckoutForm(
      creds,
      't',
      'o',
      (async () => jsonResponse({ status: 'failure', errorCode: '1001' })) as typeof fetch,
    )
    expect(res).toEqual({ kind: 'unavailable' })
  })
})

describe('evaluateRetrieve', () => {
  const order = { id: 'o1', totalCents: 5000, currency: 'TRY' }
  const ok = (over: Partial<Extract<RetrieveResult, { kind: 'ok' }>['data']> = {}): RetrieveResult => ({
    kind: 'ok',
    data: {
      status: 'success',
      paymentStatus: 'SUCCESS',
      conversationId: 'o1',
      basketId: 'o1',
      paymentId: 'pay-9',
      currency: 'TRY',
      priceCents: 5000,
      paidPriceCents: 5000,
      ...over,
    },
  })

  it('accepts a matching successful payment', () => {
    expect(evaluateRetrieve(ok(), order)).toEqual({
      kind: 'paid',
      paymentId: 'pay-9',
      paidPriceCents: 5000,
      currency: 'TRY',
    })
  })

  it('accepts a paidPrice above the total (installment fee) but never below', () => {
    expect(evaluateRetrieve(ok({ paidPriceCents: 5250 }), order).kind).toBe('paid')
    expect(evaluateRetrieve(ok({ paidPriceCents: 4999 }), order)).toEqual({ kind: 'mismatch', reason: 'paid_price' })
    expect(evaluateRetrieve(ok({ paidPriceCents: null }), order)).toEqual({ kind: 'mismatch', reason: 'paid_price' })
  })

  it('rejects another order, price or currency', () => {
    expect(evaluateRetrieve(ok({ conversationId: 'other' }), order)).toEqual({ kind: 'mismatch', reason: 'conversation' })
    expect(evaluateRetrieve(ok({ basketId: 'other' }), order)).toEqual({ kind: 'mismatch', reason: 'conversation' })
    expect(evaluateRetrieve(ok({ priceCents: 100 }), order)).toEqual({ kind: 'mismatch', reason: 'price' })
    expect(evaluateRetrieve(ok({ currency: 'USD' }), order)).toEqual({ kind: 'mismatch', reason: 'currency' })
  })

  it('maps FAILURE and error answers to failed, anything else to pending', () => {
    expect(evaluateRetrieve(ok({ paymentStatus: 'FAILURE' }), order)).toEqual({ kind: 'failed' })
    expect(evaluateRetrieve({ kind: 'error' }, order)).toEqual({ kind: 'failed' })
    expect(evaluateRetrieve(ok({ paymentStatus: 'INIT_THREEDS' }), order)).toEqual({ kind: 'pending' })
  })
})
