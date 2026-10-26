import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformPaymentProvider } from './index'
import { classifyPaymentInitFailure } from './init-failure'
import { iyzicoProvider } from './iyzico'
import type { PaymentIntentInput } from './types'

const LIVE = 'https://api.iyzipay.com'
const SANDBOX = 'https://sandbox-api.iyzipay.com'

const FAKE_BUYER = {
  fullName: 'Test Alici',
  phone: '0532 000 00 00',
  address: 'Test Mah. Deneme Sok. No:1 Kadikoy Istanbul',
  city: 'Istanbul',
  identityNumber: '11111111110',
  ip: '85.34.78.112',
}

const ENV_KEYS = [
  'VERCEL_ENV',
  'IYZICO_BASE_URL',
  'IYZICO_API_KEY',
  'IYZICO_SECRET_KEY',
  'PLATFORM_PAYMENTS_PROVIDER',
  'DOMAIN_E2E_TEST_MODE',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_URL',
]

function setEnv(env: Record<string, string>) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key] ?? '')
}

function intent(buyer: Record<string, unknown> | null = FAKE_BUYER): PaymentIntentInput {
  return {
    orderId: 'sub_fake_0001',
    amountCents: 49900,
    currency: 'TRY',
    customerEmail: 'fake.buyer@gloval-test.invalid',
    returnUrl: 'https://gloval.ai/billing',
    publicConfig: buyer ? { buyer } : undefined,
    secret: null,
  }
}

function stubIyzicoFetch(response: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const SUCCESS = {
  status: 'success',
  token: 'fake-token-123',
  paymentPageUrl: 'https://sandbox-cpp.iyzipay.com?token=fake-token-123',
}

function sentBody(fetchMock: ReturnType<typeof stubIyzicoFetch>) {
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  return JSON.parse(String(init.body)) as Record<string, any>
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('iyzico checkout-form initialize (simulated server-side, fake buyer)', () => {
  it('sends every field iyzico documents as required, in the documented format', async () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-fakekey',
      IYZICO_SECRET_KEY: 'sandbox-fakesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    const result = await iyzicoProvider.createIntent(intent())

    expect(result).toMatchObject({ action: 'redirect', status: 'pending', reference: 'fake-token-123' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe(`${SANDBOX}/payment/iyzipos/checkoutform/initialize/auth/ecom`)

    const body = sentBody(fetchMock)
    for (const key of [
      'locale',
      'conversationId',
      'price',
      'paidPrice',
      'currency',
      'basketId',
      'paymentGroup',
      'callbackUrl',
    ]) {
      expect(body[key], key).toBeTruthy()
    }
    expect(body.price).toBe('499.00')
    expect(body.currency).toBe('TRY')
    expect(body.callbackUrl).toMatch(/^https?:\/\/.+\/api\/billing\/checkout\/iyzico\/callback$/)

    expect(body.buyer).toMatchObject({
      id: 'sub_fake_0001',
      name: 'Test',
      surname: 'Alici',
      email: 'fake.buyer@gloval-test.invalid',
      city: 'Istanbul',
      country: 'Turkey',
    })
    expect(body.buyer.gsmNumber).toBe('+905320000000')
    expect(body.buyer.identityNumber).toMatch(/^\d{11}$/)
    expect(body.buyer.registrationAddress).toBeTruthy()
    expect(body.buyer.ip).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/)

    for (const addr of [body.shippingAddress, body.billingAddress]) {
      expect(addr).toMatchObject({ city: 'Istanbul', country: 'Turkey' })
      expect(addr.contactName).toBeTruthy()
      expect(addr.address).toBeTruthy()
    }

    expect(body.basketItems).toHaveLength(1)
    expect(body.basketItems[0]).toMatchObject({ price: body.price, itemType: 'VIRTUAL' })
    for (const key of ['id', 'name', 'category1']) expect(body.basketItems[0][key], key).toBeTruthy()
    const basketTotal = body.basketItems.reduce((sum: number, i: { price: string }) => sum + Number(i.price), 0)
    expect(basketTotal.toFixed(2)).toBe(body.price)
  })

  it('sandbox fills only phone/identity/ip/address/city from labelled fixtures; the name must be real', async () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-fakekey',
      IYZICO_SECRET_KEY: 'sandbox-fakesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    await iyzicoProvider.createIntent(intent({ fullName: 'Test Alici' }))

    const body = sentBody(fetchMock)
    expect(body.buyer.gsmNumber).toMatch(/^\+905\d{9}$/)
    expect(body.buyer.identityNumber).toMatch(/^\d{11}$/)
    expect(body.buyer.name).toBe('Test')
    expect(body.buyer.surname).toBe('Alici')
    expect(body.buyer.registrationAddress).toBeTruthy()
  })

  it('production + live host + live keys + valid buyer reaches iyzico live', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: LIVE,
      IYZICO_API_KEY: 'fakelivekey',
      IYZICO_SECRET_KEY: 'fakelivesecret',
    })
    const fetchMock = stubIyzicoFetch({
      ...SUCCESS,
      paymentPageUrl: 'https://cpp.iyzipay.com?token=fake-token-123',
    })

    await expect(iyzicoProvider.createIntent(intent())).resolves.toMatchObject({ status: 'pending' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url.startsWith(LIVE)).toBe(true)
    expect(sentBody(fetchMock).callbackUrl.startsWith('https://')).toBe(true)
  })

  it('production + live host rejects an unusable phone BEFORE calling iyzico', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: LIVE,
      IYZICO_API_KEY: 'fakelivekey',
      IYZICO_SECRET_KEY: 'fakelivesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    const error = await iyzicoProvider
      .createIntent(intent({ ...FAKE_BUYER, phone: '12345' }))
      .catch((e) => e)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(classifyPaymentInitFailure(error)).toEqual({
      code: 'billing_buyer_invalid:phone',
      userError: 'buyer_invalid',
      field: 'phone',
    })
  })

  it('rejects the observed private or missing buyer IP before calling iyzico', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: LIVE,
      IYZICO_API_KEY: 'fakelivekey',
      IYZICO_SECRET_KEY: 'fakelivesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    for (const ip of ['172.23.40.86', null]) {
      const error = await iyzicoProvider
        .createIntent(intent({ ...FAKE_BUYER, ip }))
        .catch((e) => e)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(classifyPaymentInitFailure(error)).toEqual({
        code: 'billing_buyer_invalid:ip',
        userError: 'buyer_invalid',
        field: 'ip',
      })
    }
  })

  it('maps an iyzico rejection to a billing_psp_rejected / buyer code', async () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-fakekey',
      IYZICO_SECRET_KEY: 'sandbox-fakesecret',
    })
    stubIyzicoFetch({ status: 'failure', errorCode: '1000', errorMessage: 'Gecersiz imza' })

    const error = await iyzicoProvider.createIntent(intent()).catch((e) => e)

    expect(classifyPaymentInitFailure(error).code).toBe('billing_psp_rejected:1000')
  })
})

describe('production configuration as currently deployed on gloval.ai', () => {
  // Reproduces the PRODUCTION env state observed via `vercel env pull`:
  // IYZICO_BASE_URL = sandbox host, IYZICO_API_KEY = `sandbox-` prefixed.
  it('sandbox host + sandbox keys in production fails closed before any network call', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-fakekey',
      IYZICO_SECRET_KEY: 'sandbox-fakesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    const provider = getPlatformPaymentProvider()
    const error = await provider.createIntent(intent()).catch((e) => e)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(classifyPaymentInitFailure(error)).toEqual({
      code: 'billing_env_invalid:iyzico_base_url_not_live',
      userError: 'payment_not_ready',
    })
  })

  it('live host with sandbox keys is reported as a credentials mismatch', async () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: LIVE,
      IYZICO_API_KEY: 'sandbox-fakekey',
      IYZICO_SECRET_KEY: 'sandbox-fakesecret',
    })
    const fetchMock = stubIyzicoFetch(SUCCESS)

    const error = await iyzicoProvider.createIntent(intent()).catch((e) => e)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(classifyPaymentInitFailure(error).code).toBe(
      'billing_env_invalid:iyzico_sandbox_credentials_on_live_host',
    )
  })
})
