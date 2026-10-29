import { describe, expect, it } from 'vitest'
import { parseBooleanFlag, resolveDomainSearchDemo, resolveWhoisEnabled } from '@/lib/domains/flag-resolvers.mjs'
import { isWhoisLookupEnabled } from '@/lib/domains/feature-flags'
import { buildDemoSearchResponse, demoSearchOrNull } from '@/lib/custom-domains/public-search/demo'
import { evaluateDomainPaymentStackFromEnv, mayUseSandboxIyzicoInProduction } from '@/lib/payments/domain-e2e-mode'

const TRUTHY = ['1', 'true', 'TRUE', ' 1 ', 'yes', 'on', '']

describe('parseBooleanFlag', () => {
  it('only knows 1/true and 0/false', () => {
    expect(parseBooleanFlag('1')).toBe(true)
    expect(parseBooleanFlag('True')).toBe(true)
    expect(parseBooleanFlag('0')).toBe(false)
    expect(parseBooleanFlag('false')).toBe(false)
    expect(parseBooleanFlag('yes')).toBeUndefined()
    expect(parseBooleanFlag(undefined)).toBeUndefined()
  })
})

describe('DOMAIN_SEARCH_DEMO', () => {
  it.each(TRUTHY)('can never be on when VERCEL_ENV is production (value %j)', (value) => {
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'production', DOMAIN_SEARCH_DEMO: value })).toBe(false)
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'production', NODE_ENV: 'development', DOMAIN_SEARCH_DEMO: value })).toBe(false)
    expect(demoSearchOrNull('marka', { VERCEL_ENV: 'production', DOMAIN_SEARCH_DEMO: value })).toBeNull()
    expect(demoSearchOrNull('marka', { VERCEL_ENV: 'preview', DOMAIN_SEARCH_DEMO: '1' })).not.toBeNull()
  })

  it('is off for unknown VERCEL_ENV values and for a production build outside Vercel', () => {
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'staging', DOMAIN_SEARCH_DEMO: '1' })).toBe(false)
    expect(resolveDomainSearchDemo({ NODE_ENV: 'production', DOMAIN_SEARCH_DEMO: '1' })).toBe(false)
  })

  it('is off by default and for anything but an explicit true', () => {
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'preview' })).toBe(false)
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'preview', DOMAIN_SEARCH_DEMO: '0' })).toBe(false)
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'preview', DOMAIN_SEARCH_DEMO: 'yes' })).toBe(false)
  })

  it('turns on only in a preview or development deployment, or local non-production', () => {
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'preview', DOMAIN_SEARCH_DEMO: '1' })).toBe(true)
    expect(resolveDomainSearchDemo({ VERCEL_ENV: 'development', DOMAIN_SEARCH_DEMO: 'true' })).toBe(true)
    expect(resolveDomainSearchDemo({ NODE_ENV: 'development', DOMAIN_SEARCH_DEMO: '1' })).toBe(true)
  })
})

describe('demo mode never reaches purchase, renewal or transfer', () => {
  const demoEnvs = [
    { VERCEL_ENV: 'preview', DOMAIN_SEARCH_DEMO: '1' },
    { NODE_ENV: 'development', DOMAIN_SEARCH_DEMO: 'true' },
    // Even a fully "ready" live stack is refused while the demo flag is on.
    {
      VERCEL_ENV: 'preview',
      DOMAIN_SEARCH_DEMO: '1',
      DOMAIN_E2E_TEST_MODE: 'true',
      IYZICO_BASE_URL: 'https://api.iyzipay.com',
    },
  ]

  it.each(demoEnvs)('the shared payment gate refuses with demo_mode (%o)', (env) => {
    expect(evaluateDomainPaymentStackFromEnv(env)).toEqual({ allowed: false, reason: 'demo_mode' })
    expect(mayUseSandboxIyzicoInProduction(true, env)).toBe(false)
  })

  it('without the flag the gate is not blocked by demo_mode', () => {
    const verdict = evaluateDomainPaymentStackFromEnv({ VERCEL_ENV: 'preview' })
    expect(verdict).not.toMatchObject({ reason: 'demo_mode' })
  })

  it('the demo search itself is fake, never produces a registrar-backed result', () => {
    const response = buildDemoSearchResponse('marka')
    expect(response.ok).toBe(true)
    if (!response.ok) return
    expect(response.results.some((r) => r.status === 'available')).toBe(true)
  })
})

describe('WHOIS_LOOKUP_ENABLED', () => {
  it('is OFF in production unless set explicitly', () => {
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'production' })).toBe(false)
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'production', WHOIS_LOOKUP_ENABLED: '0' })).toBe(false)
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'production', WHOIS_LOOKUP_ENABLED: 'yes' })).toBe(false)
    expect(resolveWhoisEnabled({ NODE_ENV: 'production' })).toBe(false)
  })

  it('turns on in production with WHOIS_LOOKUP_ENABLED=1 (or true)', () => {
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'production', WHOIS_LOOKUP_ENABLED: '1' })).toBe(true)
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'production', WHOIS_LOOKUP_ENABLED: 'true' })).toBe(true)
  })

  it('defaults to on in preview and local development, and can be switched off there', () => {
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(resolveWhoisEnabled({ NODE_ENV: 'development' })).toBe(true)
    expect(resolveWhoisEnabled({ VERCEL_ENV: 'preview', WHOIS_LOOKUP_ENABLED: '0' })).toBe(false)
  })

  it('the runtime flag is true only for the build-time value "1"', () => {
    expect(isWhoisLookupEnabled('1')).toBe(true)
    expect(isWhoisLookupEnabled('0')).toBe(false)
    expect(isWhoisLookupEnabled(undefined)).toBe(false)
    expect(isWhoisLookupEnabled('true')).toBe(false)
  })
})
