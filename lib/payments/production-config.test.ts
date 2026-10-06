import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlatformPaymentProviderId } from './index'
import { describeIyzicoEnvironment, resolveCallbackOrigin, resolveIyzicoBaseUrl } from './iyzico'

const LIVE = 'https://api.iyzipay.com'
const SANDBOX = 'https://sandbox-api.iyzipay.com'

afterEach(() => {
  vi.unstubAllEnvs()
})

function setEnv(env: Record<string, string>) {
  for (const key of [
    'VERCEL_ENV',
    'IYZICO_BASE_URL',
    'IYZICO_API_KEY',
    'IYZICO_SECRET_KEY',
    'PLATFORM_PAYMENTS_PROVIDER',
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_APP_URL',
    'VERCEL_URL',
    'PAYTR_MERCHANT_ID',
    'PAYTR_MERCHANT_KEY',
    'PAYTR_MERCHANT_SALT',
  ]) {
    vi.stubEnv(key, env[key] ?? '')
  }
}

describe('resolveIyzicoBaseUrl', () => {
  it('production accepts only the live host', () => {
    setEnv({ VERCEL_ENV: 'production', IYZICO_BASE_URL: `${LIVE}/` })
    expect(resolveIyzicoBaseUrl()).toBe(LIVE)
  })

  it('production rejects sandbox', () => {
    setEnv({ VERCEL_ENV: 'production', IYZICO_BASE_URL: SANDBOX })
    expect(() => resolveIyzicoBaseUrl()).toThrow('iyzico_base_url_not_live')
  })

  it('production fails closed when unset', () => {
    setEnv({ VERCEL_ENV: 'production' })
    expect(() => resolveIyzicoBaseUrl()).toThrow('iyzico_base_url_missing')
  })

  it('rejects unsupported hosts everywhere', () => {
    setEnv({ IYZICO_BASE_URL: 'https://evil.example.com' })
    expect(() => resolveIyzicoBaseUrl()).toThrow('iyzico_base_url_unsupported')
  })

  it('non-production defaults to sandbox and allows both hosts', () => {
    setEnv({ VERCEL_ENV: 'preview' })
    expect(resolveIyzicoBaseUrl()).toBe(SANDBOX)
    setEnv({ VERCEL_ENV: 'preview', IYZICO_BASE_URL: LIVE })
    expect(resolveIyzicoBaseUrl()).toBe(LIVE)
  })
})

describe('describeIyzicoEnvironment', () => {
  it('reports sandbox credentials on the sandbox host as ok, without leaking keys', () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-abc',
      IYZICO_SECRET_KEY: 'sandbox-def',
    })
    const report = describeIyzicoEnvironment()
    expect(report).toEqual({
      environment: 'preview',
      iyzico_host: 'sandbox',
      iyzico_credentials: 'present',
      iyzico_credential_type: 'sandbox',
      resolve_result: 'ok',
    })
    expect(JSON.stringify(report)).not.toContain('abc')
  })

  it('flags production pointed at the sandbox host', () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'sandbox-abc',
      IYZICO_SECRET_KEY: 'sandbox-def',
    })
    expect(describeIyzicoEnvironment().resolve_result).toBe('iyzico_base_url_not_live')
  })

  it('flags sandbox credentials paired with the live host', () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: LIVE,
      IYZICO_API_KEY: 'sandbox-abc',
      IYZICO_SECRET_KEY: 'sandbox-def',
    })
    expect(describeIyzicoEnvironment().resolve_result).toBe('iyzico_sandbox_credentials_on_live_host')
  })

  it('flags live credentials paired with the sandbox host', () => {
    setEnv({
      VERCEL_ENV: 'preview',
      IYZICO_BASE_URL: SANDBOX,
      IYZICO_API_KEY: 'live-abc',
      IYZICO_SECRET_KEY: 'live-def',
    })
    expect(describeIyzicoEnvironment().resolve_result).toBe('iyzico_live_credentials_on_sandbox_host')
  })
})

describe('resolveCallbackOrigin', () => {
  it('production always yields the canonical gloval.ai origin', () => {
    setEnv({
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_SITE_URL: 'https://attacker.example.com',
      VERCEL_URL: 'preview.vercel.app',
    })
    expect(`${resolveCallbackOrigin()}/api/billing/checkout/iyzico/callback`).toBe(
      'https://gloval.ai/api/billing/checkout/iyzico/callback',
    )
  })

  it('preview uses VERCEL_URL', () => {
    setEnv({ VERCEL_ENV: 'preview', VERCEL_URL: 'x.vercel.app' })
    expect(resolveCallbackOrigin()).toBe('https://x.vercel.app')
  })

  it('explicit NEXT_PUBLIC_SITE_URL wins outside production', () => {
    setEnv({
      VERCEL_ENV: 'preview',
      NEXT_PUBLIC_SITE_URL: 'https://tunnel.example.com/',
      VERCEL_URL: 'x.vercel.app',
    })
    expect(resolveCallbackOrigin()).toBe('https://tunnel.example.com')
  })

  it('a production build without VERCEL_* vars never yields localhost', () => {
    setEnv({})
    vi.stubEnv('NODE_ENV', 'production')
    expect(resolveCallbackOrigin()).toBe('https://gloval.ai')
  })

  it('local dev with no public origin falls back to localhost', () => {
    setEnv({})
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('PORT', '')
    expect(resolveCallbackOrigin()).toBe('http://localhost:3000')
  })
})

describe('getPlatformPaymentProviderId', () => {
  it('production never resolves to mock', () => {
    setEnv({ VERCEL_ENV: 'production' })
    expect(() => getPlatformPaymentProviderId()).toThrow(
      'mock_provider_forbidden_in_production',
    )
    setEnv({ VERCEL_ENV: 'production', PLATFORM_PAYMENTS_PROVIDER: 'mock' })
    expect(() => getPlatformPaymentProviderId()).toThrow(
      'mock_provider_forbidden_in_production',
    )
  })

  it('production with iyzico credentials selects iyzico', () => {
    setEnv({
      VERCEL_ENV: 'production',
      IYZICO_API_KEY: 'k',
      IYZICO_SECRET_KEY: 's',
    })
    expect(getPlatformPaymentProviderId()).toBe('iyzico')
  })

  it('non-production keeps the mock fallback', () => {
    setEnv({})
    expect(getPlatformPaymentProviderId()).toBe('mock')
  })
})
