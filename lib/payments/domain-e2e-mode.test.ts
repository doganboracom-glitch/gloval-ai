import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyIyzicoCredentials,
  classifyIyzicoHost,
  classifyRegistrarFromEnv,
  evaluateDomainPaymentStack,
  evaluateDomainPaymentStackFromEnv,
  isDomainE2ETestModeEnabled,
  mayUseSandboxIyzicoInProduction,
  type DomainStackInput,
} from './domain-e2e-mode'
import { resolveIyzicoBaseUrl } from './iyzico'

const LIVE = 'https://api.iyzipay.com'
const SANDBOX = 'https://sandbox-api.iyzipay.com'

const base: DomainStackInput = {
  production: true,
  iyzicoHost: 'live',
  iyzicoCredentials: 'live',
  registrar: 'live',
  e2eFlag: false,
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isDomainE2ETestModeEnabled', () => {
  it('is on only for an explicit true', () => {
    expect(isDomainE2ETestModeEnabled('true')).toBe(true)
    expect(isDomainE2ETestModeEnabled(' "TRUE" ')).toBe(true)
    expect(isDomainE2ETestModeEnabled("'true'")).toBe(true)
  })

  it('is off for anything else', () => {
    for (const value of [undefined, '', 'false', '1', 'yes', 'tru', 'truee']) {
      expect(isDomainE2ETestModeEnabled(value)).toBe(false)
    }
  })
})

describe('classification', () => {
  it('classifies the iyzico host', () => {
    expect(classifyIyzicoHost(`${LIVE}/`)).toBe('live')
    expect(classifyIyzicoHost(SANDBOX)).toBe('sandbox')
    expect(classifyIyzicoHost(undefined)).toBe('missing')
    expect(classifyIyzicoHost('https://evil.example.com')).toBe('unsupported')
  })

  it('classifies credentials by the sandbox- prefix on either key', () => {
    expect(classifyIyzicoCredentials('sandbox-a', 'sandbox-b')).toBe('sandbox')
    expect(classifyIyzicoCredentials('sandbox-a', 'real')).toBe('sandbox')
    expect(classifyIyzicoCredentials('real-a', 'real-b')).toBe('live')
    expect(classifyIyzicoCredentials('real-a', '')).toBe('missing')
  })

  it('classifies the registrar from env', () => {
    const creds = { DOMAINNAMEAPI_USERNAME: 'u', DOMAINNAMEAPI_API_KEY: 'k' }
    expect(classifyRegistrarFromEnv({ ...creds, VERCEL_ENV: 'production', DOMAINNAMEAPI_TEST_MODE: 'true' })).toBe(
      'test',
    )
    expect(classifyRegistrarFromEnv({ ...creds, VERCEL_ENV: 'production', DOMAINNAMEAPI_TEST_MODE: 'false' })).toBe(
      'live',
    )
    expect(classifyRegistrarFromEnv({ DOMAIN_REGISTRAR_MOCK: 'true' })).toBe('mock')
    expect(classifyRegistrarFromEnv({})).toBe('none')
  })
})

describe('evaluateDomainPaymentStack', () => {
  it('allows everything outside production', () => {
    expect(
      evaluateDomainPaymentStack({ ...base, production: false, iyzicoHost: 'sandbox', registrar: 'mock' }),
    ).toEqual({ allowed: true, mode: 'non_production' })
  })

  it('allows live iyzico + live registrar', () => {
    expect(evaluateDomainPaymentStack(base)).toEqual({ allowed: true, mode: 'normal' })
  })

  it('blocks live iyzico with the OTE registrar (real charge, no registration)', () => {
    expect(evaluateDomainPaymentStack({ ...base, registrar: 'test' })).toEqual({
      allowed: false,
      reason: 'live_iyzico_with_test_registrar',
    })
  })

  it('blocks the mock and missing registrars in production', () => {
    expect(evaluateDomainPaymentStack({ ...base, registrar: 'mock' })).toMatchObject({
      reason: 'mock_registrar_in_production',
    })
    expect(evaluateDomainPaymentStack({ ...base, registrar: 'none' })).toMatchObject({
      reason: 'registrar_not_configured',
    })
  })

  it('blocks a missing or unsupported iyzico host', () => {
    expect(evaluateDomainPaymentStack({ ...base, iyzicoHost: 'missing' })).toMatchObject({
      reason: 'iyzico_not_configured',
    })
    expect(evaluateDomainPaymentStack({ ...base, iyzicoHost: 'unsupported' })).toMatchObject({
      reason: 'iyzico_not_configured',
    })
  })

  it('blocks sandbox iyzico with the live registrar even when the flag is on', () => {
    expect(
      evaluateDomainPaymentStack({ ...base, iyzicoHost: 'sandbox', iyzicoCredentials: 'sandbox', e2eFlag: true }),
    ).toEqual({ allowed: false, reason: 'sandbox_iyzico_with_live_registrar' })
  })

  it('blocks sandbox iyzico + OTE registrar while the flag is off', () => {
    expect(
      evaluateDomainPaymentStack({
        ...base,
        iyzicoHost: 'sandbox',
        iyzicoCredentials: 'sandbox',
        registrar: 'test',
      }),
    ).toEqual({ allowed: false, reason: 'e2e_flag_off' })
  })

  it('blocks the E2E pairing when credentials are not sandbox credentials', () => {
    expect(
      evaluateDomainPaymentStack({ ...base, iyzicoHost: 'sandbox', registrar: 'test', e2eFlag: true }),
    ).toEqual({ allowed: false, reason: 'e2e_requires_sandbox_credentials' })
  })

  it('allows sandbox iyzico + OTE registrar only with the flag and sandbox credentials', () => {
    expect(
      evaluateDomainPaymentStack({
        ...base,
        iyzicoHost: 'sandbox',
        iyzicoCredentials: 'sandbox',
        registrar: 'test',
        e2eFlag: true,
      }),
    ).toEqual({ allowed: true, mode: 'e2e_test' })
  })
})

const e2eEnv = {
  VERCEL_ENV: 'production',
  IYZICO_BASE_URL: SANDBOX,
  IYZICO_API_KEY: 'sandbox-key',
  IYZICO_SECRET_KEY: 'sandbox-secret',
  DOMAINNAMEAPI_USERNAME: 'u',
  DOMAINNAMEAPI_API_KEY: 'k',
  DOMAINNAMEAPI_TEST_MODE: 'true',
  DOMAIN_E2E_TEST_MODE: 'true',
}

function setEnv(env: Record<string, string>) {
  for (const key of [
    'VERCEL_ENV',
    'NODE_ENV',
    'IYZICO_BASE_URL',
    'IYZICO_API_KEY',
    'IYZICO_SECRET_KEY',
    'DOMAINNAMEAPI_USERNAME',
    'DOMAINNAMEAPI_API_KEY',
    'DOMAINNAMEAPI_TEST_MODE',
    'DOMAIN_REGISTRAR_MOCK',
    'DOMAIN_E2E_TEST_MODE',
  ]) {
    vi.stubEnv(key, env[key] ?? '')
  }
}

describe('evaluateDomainPaymentStackFromEnv', () => {
  it('reads the full E2E configuration', () => {
    setEnv(e2eEnv)
    expect(evaluateDomainPaymentStackFromEnv()).toEqual({ allowed: true, mode: 'e2e_test' })
  })

  it('turns off immediately when the flag is removed', () => {
    setEnv({ ...e2eEnv, DOMAIN_E2E_TEST_MODE: '' })
    expect(evaluateDomainPaymentStackFromEnv()).toEqual({ allowed: false, reason: 'e2e_flag_off' })
  })
})

describe('production sandbox exception in resolveIyzicoBaseUrl', () => {
  it('lets a domain purchase use the sandbox host in E2E mode', () => {
    setEnv(e2eEnv)
    expect(mayUseSandboxIyzicoInProduction(true)).toBe(true)
    expect(resolveIyzicoBaseUrl({ domainPurchase: true })).toBe(SANDBOX)
  })

  it('never lets a non-domain payment (plan subscription) use the sandbox host', () => {
    setEnv(e2eEnv)
    expect(mayUseSandboxIyzicoInProduction(false)).toBe(false)
    expect(() => resolveIyzicoBaseUrl()).toThrow('iyzico_base_url_not_live')
    expect(() => resolveIyzicoBaseUrl({ domainPurchase: false })).toThrow('iyzico_base_url_not_live')
  })

  it('rejects the sandbox host for domain purchases when the flag is off', () => {
    setEnv({ ...e2eEnv, DOMAIN_E2E_TEST_MODE: 'false' })
    expect(() => resolveIyzicoBaseUrl({ domainPurchase: true })).toThrow('iyzico_base_url_not_live')
  })

  it('rejects the sandbox host for domain purchases when the registrar is live', () => {
    setEnv({ ...e2eEnv, DOMAINNAMEAPI_TEST_MODE: 'false' })
    expect(() => resolveIyzicoBaseUrl({ domainPurchase: true })).toThrow('iyzico_base_url_not_live')
  })

  it('does not change the live host behavior', () => {
    setEnv({ ...e2eEnv, IYZICO_BASE_URL: LIVE })
    expect(resolveIyzicoBaseUrl({ domainPurchase: true })).toBe(LIVE)
  })
})
