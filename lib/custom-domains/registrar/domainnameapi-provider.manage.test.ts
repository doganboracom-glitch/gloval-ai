import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  GetDetails: vi.fn(),
  ModifyNameServer: vi.fn(),
  ModifyPrivacyProtectionStatus: vi.fn(),
  EnableTheftProtectionLock: vi.fn(),
  DisableTheftProtectionLock: vi.fn(),
  GetContacts: vi.fn(),
  SaveContacts: vi.fn(),
  Renew: vi.fn(),
  state: { lastResponse: null as unknown },
}))

vi.mock('nodejs-dna/src/DNARest', () => ({
  default: class FakeDNARest {
    get lastResponse() {
      return sdk.state.lastResponse
    }
    GetDetails = sdk.GetDetails
    ModifyNameServer = sdk.ModifyNameServer
    ModifyPrivacyProtectionStatus = sdk.ModifyPrivacyProtectionStatus
    EnableTheftProtectionLock = sdk.EnableTheftProtectionLock
    DisableTheftProtectionLock = sdk.DisableTheftProtectionLock
    GetContacts = sdk.GetContacts
    SaveContacts = sdk.SaveContacts
    Renew = sdk.Renew
  },
}))

import { DomainNameApiProvider } from './domainnameapi-provider'
import { RegistrarError, type DomainContact } from './types'

const DOMAIN = 'example.com'
const EPP = 'EPP-SECRET-xyz-987'
const provider = () => new DomainNameApiProvider('user', 'key', true)

type Raw = Record<string, unknown>

/** Queues the raw HTTP body for each successive GetDetails call. */
function queueDetails(...bodies: Array<Raw | 'throw' | 'not-ok'>) {
  const queue = [...bodies]
  sdk.GetDetails.mockImplementation(async () => {
    const next = queue.length > 1 ? queue.shift()! : queue[0]
    if (next === 'throw') throw new Error('network')
    if (next === 'not-ok') return { result: 'ERROR', error: { Code: 'API_500' } }
    sdk.state.lastResponse = next
    return { result: 'OK', data: { DomainName: DOMAIN, Status: 'Active', AuthCode: EPP } }
  })
}

const body = (over: Raw = {}): Raw => ({
  lockStatus: true,
  privacyProtectionStatus: false,
  nameservers: ['ns1.domainnameapi.com', 'ns2.domainnameapi.com'],
  expirationDate: '2027-10-04T17:55:29Z',
  startDate: '2026-10-04T17:55:29Z',
  remainingDay: 365,
  ...over,
})

const contact = (over: Partial<DomainContact> = {}): DomainContact => ({
  firstName: 'Gloval',
  lastName: 'Test',
  company: '',
  email: 'test-registrant@example.com',
  addressLine1: 'Test Street 1',
  city: 'Istanbul',
  state: 'Istanbul',
  country: 'TR',
  zipCode: '34000',
  phoneCountryCode: '90',
  phone: '5000000000',
  ...over,
})

const sdkContact = (c: DomainContact) => ({
  FirstName: c.firstName,
  LastName: c.lastName,
  Company: c.company,
  EMail: c.email,
  Address: { Line1: c.addressLine1, City: c.city, State: c.state, Country: c.country, ZipCode: c.zipCode },
  Phone: { Phone: { CountryCode: c.phoneCountryCode, Number: c.phone } },
})

const contactsEnvelope = (c: DomainContact) => ({
  result: 'OK',
  data: {
    contacts: {
      Registrant: sdkContact(c),
      Administrative: sdkContact(c),
      Technical: sdkContact(c),
      Billing: sdkContact(c),
    },
  },
})

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof RegistrarError) return e.code
    throw e
  }
  return 'NO_ERROR'
}

beforeEach(() => {
  vi.clearAllMocks()
  sdk.state.lastResponse = null
})

describe('getManagedDetails', () => {
  it('reads flags, nameservers and dates from the raw body', async () => {
    queueDetails(body())
    const d = await provider().getManagedDetails(DOMAIN)
    expect(d).toMatchObject({
      domain: DOMAIN,
      locked: true,
      privacy: false,
      nameservers: ['ns1.domainnameapi.com', 'ns2.domainnameapi.com'],
      remainingDays: 365,
      hasAuthCode: true,
    })
    expect(d?.expiresAt).toBe('2027-10-04T17:55:29.000Z')
  })

  it('does not guess a missing flag: absent means null, not false', async () => {
    queueDetails(body({ lockStatus: undefined, privacyProtectionStatus: 'true' }))
    const d = await provider().getManagedDetails(DOMAIN)
    expect(d?.locked).toBeNull()
    expect(d?.privacy).toBeNull()
  })

  it('keeps a zone-less expiry as raw text with no invented instant', async () => {
    queueDetails(body({ expirationDate: '2027-10-04T17:55:29' }))
    const d = await provider().getManagedDetails(DOMAIN)
    expect(d?.expiresAt).toBeNull()
    expect(d?.expiresAtRaw).toBe('2027-10-04T17:55:29')
  })

  it('returns null when the domain is unknown and throws a provider error on transport failure', async () => {
    queueDetails('not-ok')
    expect(await provider().getManagedDetails(DOMAIN)).toBeNull()
    queueDetails('throw')
    expect(await codeOf(provider().getManagedDetails(DOMAIN))).toBe('PROVIDER_ERROR')
  })

  it('never exposes the auth code itself', async () => {
    queueDetails(body())
    const d = await provider().getManagedDetails(DOMAIN)
    expect(JSON.stringify(d)).not.toContain(EPP)
  })
})

describe('setNameservers', () => {
  it('rejects malformed or too few nameservers before any provider call', async () => {
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.example.com']))).toBe('INVALID_INPUT')
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.example.com', 'bad host']))).toBe('INVALID_INPUT')
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.example.com', 'ns1.example.com']))).toBe('INVALID_INPUT')
    expect(sdk.GetDetails).not.toHaveBeenCalled()
    expect(sdk.ModifyNameServer).not.toHaveBeenCalled()
  })

  it('is a no-op when the provider already has those nameservers', async () => {
    queueDetails(body())
    const res = await provider().setNameservers(DOMAIN, ['NS2.domainnameapi.com.', 'ns1.domainnameapi.com'])
    expect(res).toEqual({ changed: false })
    expect(sdk.ModifyNameServer).not.toHaveBeenCalled()
  })

  it('sends one change and confirms it from the read-back', async () => {
    queueDetails(body(), body({ nameservers: ['ns1.new.com', 'ns2.new.com'] }))
    sdk.ModifyNameServer.mockResolvedValue({ result: 'OK' })
    const res = await provider().setNameservers(DOMAIN, ['NS1.new.com', 'ns2.new.com.'])
    expect(res).toEqual({ changed: true })
    expect(sdk.ModifyNameServer).toHaveBeenCalledTimes(1)
    expect(sdk.ModifyNameServer).toHaveBeenCalledWith(DOMAIN, ['ns1.new.com', 'ns2.new.com'])
  })

  it('reports OUTCOME_UNKNOWN (not success) when the envelope is OK but the read-back differs', async () => {
    queueDetails(body())
    sdk.ModifyNameServer.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.new.com', 'ns2.new.com']))).toBe('OUTCOME_UNKNOWN')
    expect(sdk.ModifyNameServer).toHaveBeenCalledTimes(1)
  })

  it('reports a provider failure when the call failed and the read-back is unchanged', async () => {
    queueDetails(body())
    sdk.ModifyNameServer.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_500' } })
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.new.com', 'ns2.new.com']))).not.toBe('NO_ERROR')
    expect(sdk.ModifyNameServer).toHaveBeenCalledTimes(1)
  })

  it('treats a thrown call as applied when the read-back proves it, and never retries', async () => {
    queueDetails(body(), body({ nameservers: ['ns1.new.com', 'ns2.new.com'] }))
    sdk.ModifyNameServer.mockRejectedValue(new Error('timeout'))
    expect(await provider().setNameservers(DOMAIN, ['ns1.new.com', 'ns2.new.com'])).toEqual({ changed: true })
    expect(sdk.ModifyNameServer).toHaveBeenCalledTimes(1)
  })

  it('reports OUTCOME_UNKNOWN when the read-back itself fails', async () => {
    queueDetails(body(), 'throw')
    sdk.ModifyNameServer.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().setNameservers(DOMAIN, ['ns1.new.com', 'ns2.new.com']))).toBe('OUTCOME_UNKNOWN')
  })
})

describe('setPrivacy and changeLock', () => {
  it('privacy: no-op when the state already matches', async () => {
    queueDetails(body({ privacyProtectionStatus: true }))
    expect(await provider().setPrivacy(DOMAIN, true)).toEqual({ changed: false })
    expect(sdk.ModifyPrivacyProtectionStatus).not.toHaveBeenCalled()
  })

  it('privacy: changes and confirms', async () => {
    queueDetails(body(), body({ privacyProtectionStatus: true }))
    sdk.ModifyPrivacyProtectionStatus.mockResolvedValue({ result: 'OK' })
    expect(await provider().setPrivacy(DOMAIN, true)).toEqual({ changed: true })
    expect(sdk.ModifyPrivacyProtectionStatus).toHaveBeenCalledWith(DOMAIN, true)
  })

  it('privacy: OUTCOME_UNKNOWN when the provider ignores the request', async () => {
    queueDetails(body())
    sdk.ModifyPrivacyProtectionStatus.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().setPrivacy(DOMAIN, true))).toBe('OUTCOME_UNKNOWN')
  })

  it('privacy: an unknown current state is not treated as already matching', async () => {
    queueDetails(body({ privacyProtectionStatus: undefined }), body({ privacyProtectionStatus: false }))
    sdk.ModifyPrivacyProtectionStatus.mockResolvedValue({ result: 'OK' })
    expect(await provider().setPrivacy(DOMAIN, false)).toEqual({ changed: true })
    expect(sdk.ModifyPrivacyProtectionStatus).toHaveBeenCalledTimes(1)
  })

  it('lock: unlocks via the disable call and confirms', async () => {
    queueDetails(body({ lockStatus: true }), body({ lockStatus: false }))
    sdk.DisableTheftProtectionLock.mockResolvedValue({ result: 'OK' })
    expect(await provider().changeLock(DOMAIN, false)).toEqual({ changed: true })
    expect(sdk.DisableTheftProtectionLock).toHaveBeenCalledTimes(1)
    expect(sdk.EnableTheftProtectionLock).not.toHaveBeenCalled()
  })

  it('lock: repeating the same request sends nothing', async () => {
    queueDetails(body({ lockStatus: true }))
    expect(await provider().changeLock(DOMAIN, true)).toEqual({ changed: false })
    expect(sdk.EnableTheftProtectionLock).not.toHaveBeenCalled()
  })

  it('lock: PROVIDER_ERROR when the domain cannot be read', async () => {
    queueDetails('not-ok')
    expect(await codeOf(provider().changeLock(DOMAIN, true))).toBe('PROVIDER_ERROR')
  })
})

describe('contacts', () => {
  it('maps the four WHOIS roles and leaves empty ones null', async () => {
    sdk.GetContacts.mockResolvedValue({
      result: 'OK',
      data: { contacts: { Registrant: sdkContact(contact()), Administrative: {} } },
    })
    const set = await provider().getContacts(DOMAIN)
    expect(set.registrant).toMatchObject({ firstName: 'Gloval', email: 'test-registrant@example.com', country: 'TR' })
    expect(set.admin).toBeNull()
    expect(set.tech).toBeNull()
    expect(set.billing).toBeNull()
  })

  it('rejects an invalid contact before any provider call', async () => {
    for (const bad of [
      contact({ email: 'nope' }),
      contact({ country: 'TUR' }),
      contact({ firstName: '' }),
      contact({ phone: '12' }),
      contact({ phoneCountryCode: 'abc' }),
    ]) {
      expect(await codeOf(provider().updateContacts(DOMAIN, bad))).toBe('INVALID_INPUT')
    }
    expect(sdk.GetContacts).not.toHaveBeenCalled()
    expect(sdk.SaveContacts).not.toHaveBeenCalled()
  })

  it('is a no-op when all four roles already match', async () => {
    sdk.GetContacts.mockResolvedValue(contactsEnvelope(contact()))
    expect(await provider().updateContacts(DOMAIN, contact())).toEqual({ changed: false })
    expect(sdk.SaveContacts).not.toHaveBeenCalled()
  })

  it('saves one contact to all four roles and confirms from a read-back', async () => {
    const next = contact({ firstName: 'Updated' })
    sdk.GetContacts.mockResolvedValueOnce(contactsEnvelope(contact())).mockResolvedValueOnce(contactsEnvelope(next))
    sdk.SaveContacts.mockResolvedValue({ result: 'OK' })
    expect(await provider().updateContacts(DOMAIN, next)).toEqual({ changed: true })
    expect(sdk.SaveContacts).toHaveBeenCalledTimes(1)
    const sent = sdk.SaveContacts.mock.calls[0][1]
    expect(Object.keys(sent).sort()).toEqual(['Administrative', 'Billing', 'Registrant', 'Technical'])
  })

  it('OUTCOME_UNKNOWN when the provider reports OK but the read-back is unchanged', async () => {
    sdk.GetContacts.mockResolvedValue(contactsEnvelope(contact()))
    sdk.SaveContacts.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().updateContacts(DOMAIN, contact({ firstName: 'Other' })))).toBe('OUTCOME_UNKNOWN')
    expect(sdk.SaveContacts).toHaveBeenCalledTimes(1)
  })
})

describe('renewDomain (paid)', () => {
  it('rejects bad periods before calling the provider', async () => {
    for (const years of [0, -1, 11, 1.5, Number.NaN]) {
      expect(await codeOf(provider().renewDomain(DOMAIN, years))).toBe('INVALID_INPUT')
    }
    expect(sdk.Renew).not.toHaveBeenCalled()
  })

  const BEFORE = body({ expirationDate: '2027-10-04T17:55:29.4171901' })
  const AFTER = body({ expirationDate: '2028-10-04T17:55:31' })

  it('succeeds only when the read-back shows a later expiry, and returns that raw value', async () => {
    queueDetails(BEFORE, AFTER)
    sdk.Renew.mockResolvedValue({ result: 'OK', data: { ExpirationDate: '2028-10-04T14:55:31' } })
    const res = await provider().renewDomain(DOMAIN, 1)
    expect(res.expiresAtRaw).toBe('2028-10-04T17:55:31')
    expect(sdk.Renew).toHaveBeenCalledTimes(1)
    expect(sdk.Renew).toHaveBeenCalledWith(DOMAIN, 1)
  })

  it('does not call the paid API when the domain is unknown or not Active', async () => {
    queueDetails('not-ok')
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('PROVIDER_ERROR')

    sdk.GetDetails.mockResolvedValue({ result: 'OK', data: { Status: 'Expired' } })
    sdk.state.lastResponse = BEFORE
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('PROVIDER_ERROR')
    expect(sdk.Renew).not.toHaveBeenCalled()
  })

  it('a thrown call whose read-back advanced is a success and is never retried', async () => {
    queueDetails(BEFORE, AFTER)
    sdk.Renew.mockRejectedValue(new Error('timeout'))
    const res = await provider().renewDomain(DOMAIN, 1)
    expect(res.expiresAtRaw).toBe('2028-10-04T17:55:31')
    expect(sdk.Renew).toHaveBeenCalledTimes(1)
  })

  it('a thrown call with an unchanged read-back is OUTCOME_UNKNOWN and is never retried', async () => {
    queueDetails(BEFORE)
    sdk.Renew.mockRejectedValue(new Error('timeout'))
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
    expect(sdk.Renew).toHaveBeenCalledTimes(1)
  })

  it('an OK reply is not trusted when the read-back is unchanged', async () => {
    queueDetails(BEFORE)
    sdk.Renew.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
  })

  it('an OK reply with an unreadable read-back is OUTCOME_UNKNOWN', async () => {
    queueDetails(BEFORE, 'throw')
    sdk.Renew.mockResolvedValue({ result: 'OK' })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
  })

  it('the SDK swallowed-network-error code DOMAIN_RENEW is OUTCOME_UNKNOWN', async () => {
    queueDetails(BEFORE)
    sdk.Renew.mockResolvedValue({ result: 'ERROR', error: { Code: 'DOMAIN_RENEW' } })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
  })

  it('an ambiguous provider error is OUTCOME_UNKNOWN, a definite rejection is not', async () => {
    queueDetails(BEFORE)
    sdk.Renew.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_408' } })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
    sdk.Renew.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_401' } })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('PROVIDER_ERROR')
  })

  it('a definite rejection is still held as unknown when the read-back cannot be taken', async () => {
    queueDetails(BEFORE, 'throw')
    sdk.Renew.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_401' } })
    expect(await codeOf(provider().renewDomain(DOMAIN, 1))).toBe('OUTCOME_UNKNOWN')
  })
})
