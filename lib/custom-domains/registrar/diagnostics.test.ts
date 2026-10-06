import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildRegistrarDiagnostic, formatRegistrarDiagnostic } from './diagnostics'
import type { RegistrantContact, RegistrarError } from './types'

const contact: RegistrantContact = {
  firstName: 'Ayşegül',
  lastName: 'Yıldırım',
  email: 'ayse.yildirim@example.com',
  phone: '5321234567',
  phoneCountryCode: '90',
  addressLine1: 'Atatürk Caddesi No 12',
  city: 'Kadıköy',
  country: 'TR',
  zipCode: '34710',
  company: 'Yıldırım Mimarlık',
}

const SECRET_KEY = 'sk_live_super_secret_value'
const RESELLER = '11111111-2222-3333-4444-555555555555'

function assertClean(text: string) {
  for (const leaked of [
    'Ayşegül',
    'Yıldırım',
    'ayse.yildirim@example.com',
    '5321234567',
    'Atatürk Caddesi',
    'Kadıköy',
    '34710',
    SECRET_KEY,
    RESELLER,
  ]) {
    expect(text.toLowerCase()).not.toContain(leaked.toLowerCase())
  }
}

describe('buildRegistrarDiagnostic', () => {
  it('captures HTTP 400 status and provider code from the SDK envelope', () => {
    const d = buildRegistrarDiagnostic({
      provider: 'domainnameapi',
      operation: 'registerDomain',
      providerCode: 'API_400',
      providerMessage: 'HTTP 400',
      contact,
    })
    expect(d.httpStatus).toBe(400)
    expect(d.providerCode).toBe('API_400')
    expect(d.message).toBe('HTTP 400')
    expect(d.fieldErrors).toEqual([])
  })

  it('extracts structured field errors and redacts customer data and secrets', () => {
    const d = buildRegistrarDiagnostic({
      provider: 'domainnameapi',
      operation: 'registerDomain',
      providerCode: 'API_400',
      providerMessage: 'HTTP 400',
      body: {
        message: `Validation failed for ${contact.email}`,
        errors: {
          'contacts[0].phone': [`Invalid phone +90 532 123 45 67 (${contact.phone})`],
          'contacts[0].address.line1': [`Address "${contact.addressLine1}" too short`],
          'contacts[0].postalCode': ['Zip 34710 is not valid'],
        },
        authorization: `Bearer ${SECRET_KEY}`,
        note: `apiKey: ${SECRET_KEY} reseller ${RESELLER}`,
      },
      contact,
      secrets: [SECRET_KEY, RESELLER],
    })
    expect(d.fieldErrors.map((f: { field: string | null }) => f.field)).toContain('contacts[0].phone')
    expect(d.fieldErrors.length).toBe(3)
    const serialized = JSON.stringify(d) + formatRegistrarDiagnostic(d)
    assertClean(serialized)
    expect(serialized).toContain('[redacted]')
  })

  it('handles nested provider error envelopes', () => {
    const d = buildRegistrarDiagnostic({
      provider: 'domainnameapi',
      operation: 'registerDomain',
      body: { error: { Code: 'API_350', Message: 'Insufficient balance' } },
    })
    expect(d.providerCode).toBe('API_350')
    expect(d.message).toBe('Insufficient balance')
    expect(d.httpStatus).toBe(350)
  })

  it('does not break on non-JSON, empty, or odd bodies', () => {
    for (const body of ['<html>Bad Request</html>', '', null, undefined, 42, [], [[[[[[[['deep']]]]]]]], { a: { b: { c: { d: { e: { f: 1 } } } } } }]) {
      const d = buildRegistrarDiagnostic({
        provider: 'domainnameapi',
        operation: 'registerDomain',
        providerCode: 'API_400',
        providerMessage: 'HTTP 400',
        body,
        contact,
      })
      expect(d.httpStatus).toBe(400)
      expect(typeof formatRegistrarDiagnostic(d)).toBe('string')
    }
  })

  it('caps message and field count', () => {
    const d = buildRegistrarDiagnostic({
      provider: 'domainnameapi',
      operation: 'registerDomain',
      body: { message: 'x'.repeat(5000), errors: Array.from({ length: 50 }, (_, i) => `err ${i}`) },
    })
    expect(d.message.length).toBeLessThanOrEqual(240)
    expect(d.fieldErrors.length).toBeLessThanOrEqual(10)
    expect(formatRegistrarDiagnostic(d).length).toBeLessThanOrEqual(900)
  })
})

const registerMock = vi.fn()
const clientState: { lastResponse?: unknown; lastParsedResponse?: unknown } = {}

vi.mock('nodejs-dna/src/DNARest', () => ({
  default: class {
    get lastResponse() {
      return clientState.lastResponse
    }
    get lastParsedResponse() {
      return clientState.lastParsedResponse
    }
    RegisterWithContactInfo = registerMock
  },
}))

async function failure(
  provider: { registerDomain: (i: { domain: string; periodYears: number; contact: RegistrantContact }) => Promise<unknown> },
  input: { domain: string; periodYears: number; contact: RegistrantContact },
): Promise<RegistrarError> {
  try {
    await provider.registerDomain(input)
  } catch (e) {
    return e as RegistrarError
  }
  throw new Error('expected registerDomain to fail')
}

describe('DomainNameApiProvider.registerDomain failure handling (mocked SDK, no network)', () => {
  beforeEach(() => {
    registerMock.mockReset()
    clientState.lastResponse = undefined
    clientState.lastParsedResponse = undefined
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  async function makeProvider() {
    const { DomainNameApiProvider } = await import('./domainnameapi-provider')
    return new DomainNameApiProvider(RESELLER, SECRET_KEY, true)
  }

  it('turns an HTTP 400 into a sanitized RegistrarError with a diagnostic', async () => {
    registerMock.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_400', Message: 'HTTP 400', Details: 'HTTP 400' } })
    clientState.lastResponse = {
      errors: { 'registrant.email': [`${contact.email} rejected`], 'registrant.phone': [contact.phone] },
    }
    const provider = await makeProvider()
    const err = await failure(provider, { domain: 'example.com.tr', periodYears: 1, contact })
    expect(err.name).toBe('RegistrarError')
    expect(err.code).toBe('REGISTRATION_FAILED')
    expect(err.diagnostic?.httpStatus).toBe(400)
    expect(err.diagnostic?.fieldErrors.map((f: { field: string | null }) => f.field)).toEqual(['registrant.email', 'registrant.phone'])
    assertClean(err.message + JSON.stringify(err.diagnostic))
    expect(registerMock).toHaveBeenCalledTimes(1)
  })

  it('survives an unexpected non-JSON body', async () => {
    registerMock.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_400', Message: 'HTTP 400' } })
    clientState.lastResponse = '<html>Bad Request</html>'
    const provider = await makeProvider()
    const err = await failure(provider, { domain: 'example.com', periodYears: 1, contact })
    expect(err.diagnostic?.httpStatus).toBe(400)
  })

  it('maps API_350 to INSUFFICIENT_BALANCE and SDK exceptions to PROVIDER_ERROR', async () => {
    const provider = await makeProvider()
    registerMock.mockResolvedValueOnce({ result: 'ERROR', error: { Code: 'API_350', Message: 'Insufficient balance' } })
    const a = await failure(provider, { domain: 'example.com', periodYears: 1, contact })
    expect(a.code).toBe('INSUFFICIENT_BALANCE')

    registerMock.mockRejectedValueOnce(new Error(`socket hang up for ${contact.email} with key ${SECRET_KEY}`))
    const b = await failure(provider, { domain: 'example.com', periodYears: 1, contact })
    expect(b.code).toBe('PROVIDER_ERROR')
    assertClean(b.message)
  })
})
