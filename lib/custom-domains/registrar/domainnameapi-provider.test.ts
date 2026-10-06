import { describe, expect, it, vi } from 'vitest'
import type { RegistrantContact, RegistrarError } from './types'

type FakeBehavior = { delayMs: number; body: unknown }
type FakeSuccess = {
  registerData: Record<string, unknown>
  details: { result: string; data?: Record<string, unknown> } | 'throw'
  /** Unformatted GetDetails body the real SDK leaves on `lastResponse`. */
  detailsRaw?: Record<string, unknown>
  /** Overrides the register reply (e.g. an empty-body ERROR from the SDK). */
  registerReply?: { result: string; error?: { Code?: string; Message?: string } }
}

const behaviors = new Map<string, FakeBehavior>()
const successes = new Map<string, FakeSuccess>()
let instanceCount = 0

vi.mock('nodejs-dna/src/DNARest', () => ({
  default: class FakeDNARest {
    lastResponse: unknown = null
    lastParsedResponse: unknown = null
    constructor() {
      instanceCount += 1
    }
    async GetDetails(domain: string) {
      const success = successes.get(domain)!
      if (success.details === 'throw') throw new Error('network down')
      if (success.detailsRaw) this.lastResponse = success.detailsRaw
      return success.details
    }
    async RegisterWithContactInfo(domain: string) {
      const success = successes.get(domain)
      if (success) return success.registerReply ?? { result: 'OK', data: success.registerData }
      const behavior = behaviors.get(domain)!
      await new Promise((resolve) => setTimeout(resolve, behavior.delayMs))
      // Mirrors the SDK: the body lands on the instance that made the HTTP call.
      this.lastResponse = behavior.body
      return { result: 'ERROR', error: { Code: 'API_400', Message: 'HTTP 400' } }
    }
  },
}))

import { DomainNameApiProvider } from './domainnameapi-provider'

const contact: RegistrantContact = {
  firstName: 'Ayse',
  lastName: 'Yilmaz',
  email: 'ayse@example.com',
  phone: '5321234567',
  phoneCountryCode: '90',
  addressLine1: 'Ataturk Caddesi 12',
  city: 'Istanbul',
  country: 'TR',
  zipCode: '34710',
  company: '',
}

function diagnosticText(error: unknown): string {
  const e = error as RegistrarError
  return JSON.stringify(e.diagnostic ?? null) + ' ' + e.message
}

describe('DomainNameApiProvider concurrent registrations', () => {
  it('never mixes one request error body into another request diagnostic', async () => {
    behaviors.set('slow-a.com', { delayMs: 40, body: { message: 'MARKER_ALPHA_ERROR' } })
    behaviors.set('fast-b.com', { delayMs: 5, body: { message: 'MARKER_BETA_ERROR' } })

    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)
    const before = instanceCount

    const [a, b] = await Promise.allSettled([
      provider.registerDomain({ domain: 'slow-a.com', periodYears: 1, contact }),
      provider.registerDomain({ domain: 'fast-b.com', periodYears: 1, contact }),
    ])

    expect(a.status).toBe('rejected')
    expect(b.status).toBe('rejected')
    const textA = diagnosticText((a as PromiseRejectedResult).reason)
    const textB = diagnosticText((b as PromiseRejectedResult).reason)

    expect(textA).toContain('MARKER_ALPHA_ERROR')
    expect(textA).not.toContain('MARKER_BETA_ERROR')
    expect(textB).toContain('MARKER_BETA_ERROR')
    expect(textB).not.toContain('MARKER_ALPHA_ERROR')
    // One dedicated SDK client per registration.
    expect(instanceCount - before).toBe(2)
  })
})

// Shape of the real OTE reply to RegisterWithContactInfo: DomainName empty.
const emptyRegisterData = {
  ID: 0,
  Status: 'Active',
  DomainName: '',
  Dates: { Start: '', Expiration: '2027-10-04T14:55:29' },
  NameServers: [],
}

describe('DomainNameApiProvider registration read-back', () => {
  it('takes the domain name from GetDetails and keeps a zone-less expiry raw instead of guessing a zone', async () => {
    successes.set('readback.com', {
      registerData: emptyRegisterData,
      details: { result: 'OK', data: { DomainName: 'readback.com' } },
      detailsRaw: { domainName: 'readback.com', expirationDate: '2027-10-04T17:55:29.4171901' },
    })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    const result = await provider.registerDomain({ domain: 'readback.com', periodYears: 1, contact })

    expect(result.providerDomainId).toBe('readback.com')
    expect(result.expiresAt).toBeNull()
    expect(result.expiresAtRaw).toBe('2027-10-04T17:55:29.4171901')
  })

  it('converts the expiry to a UTC instant only when the provider names the zone', async () => {
    successes.set('zoned.com', {
      registerData: emptyRegisterData,
      details: { result: 'OK', data: { DomainName: 'zoned.com' } },
      detailsRaw: { expirationDate: '2027-10-04T14:55:29Z' },
    })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    const result = await provider.registerDomain({ domain: 'zoned.com', periodYears: 1, contact })

    expect(result.expiresAt).toBe('2027-10-04T14:55:29.000Z')
  })

  it('never stores an empty provider domain id when the register reply has no DomainName', async () => {
    successes.set('fallback.com', {
      registerData: emptyRegisterData,
      details: { result: 'ERROR' },
    })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    const result = await provider.registerDomain({ domain: 'fallback.com', periodYears: 1, contact })

    expect(result.providerDomainId).toBe('fallback.com')
    expect(result.expiresAt).toBeNull()
    expect(result.expiresAtRaw).toBeNull()
  })

  it('does not fail an already-registered domain when the read-back throws', async () => {
    successes.set('throws.com', { registerData: emptyRegisterData, details: 'throw' })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    const result = await provider.registerDomain({ domain: 'throws.com', periodYears: 1, contact })

    expect(result.providerDomainId).toBe('throws.com')
  })
})

describe('DomainNameApiProvider inconclusive register replies', () => {
  const registerFailure = (code: string) => ({ result: 'ERROR', error: { Code: code, Message: 'x' } })
  const activeDetails = (name: string) => ({
    result: 'OK',
    data: { DomainName: name, Status: 'Active' },
  })

  it.each(['RESPONSE', 'API_500', 'API_408', 'CURL_ECONNABORTED'])(
    'confirms an Active domain through GetDetails after %s instead of failing the order',
    async (code) => {
      const domain = `confirm-${code.toLowerCase()}.com`
      successes.set(domain, {
        registerData: {},
        registerReply: registerFailure(code),
        details: activeDetails(domain),
        detailsRaw: { expirationDate: '2027-10-04T17:55:29' },
      })
      const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

      const result = await provider.registerDomain({ domain, periodYears: 1, contact })

      expect(result.providerDomainId).toBe(domain)
      expect(result.expiresAtRaw).toBe('2027-10-04T17:55:29')
    },
  )

  it.each([
    ['GetDetails reports an error', { result: 'ERROR' } as const],
    ['GetDetails throws', 'throw' as const],
    ['the domain is not Active yet', { result: 'OK', data: { DomainName: 'unsure.com', Status: 'Pending' } } as const],
    ['GetDetails names a different domain', activeDetails('other.com')],
  ])('keeps the outcome unknown (PROVIDER_ERROR, never REGISTRATION_FAILED) when %s', async (_label, details) => {
    successes.set('unsure.com', { registerData: {}, registerReply: registerFailure('API_500'), details })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    await expect(provider.registerDomain({ domain: 'unsure.com', periodYears: 1, contact })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
  })

  it('treats a 2xx reply with no data as inconclusive, not as success or failure', async () => {
    successes.set('nodata.com', {
      registerData: {},
      registerReply: { result: 'OK' },
      details: { result: 'ERROR' },
    })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    await expect(provider.registerDomain({ domain: 'nodata.com', periodYears: 1, contact })).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    })
  })

  it('still reports a definite rejection as a failure without probing GetDetails', async () => {
    successes.set('rejected.com', {
      registerData: {},
      registerReply: registerFailure('API_400'),
      details: 'throw',
    })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    await expect(provider.registerDomain({ domain: 'rejected.com', periodYears: 1, contact })).rejects.toMatchObject({
      code: 'REGISTRATION_FAILED',
    })
  })

  it('maps API_350 to INSUFFICIENT_BALANCE', async () => {
    successes.set('poor.com', { registerData: {}, registerReply: registerFailure('API_350'), details: 'throw' })
    const provider = new DomainNameApiProvider('user-uuid', 'api-key', true)

    await expect(provider.registerDomain({ domain: 'poor.com', periodYears: 1, contact })).rejects.toMatchObject({
      code: 'INSUFFICIENT_BALANCE',
    })
  })
})
