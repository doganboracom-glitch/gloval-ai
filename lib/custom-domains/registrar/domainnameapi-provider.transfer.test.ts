import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({
  CheckTransfer: vi.fn(),
  Transfer: vi.fn(),
  GetDetails: vi.fn(),
  GetTldList: vi.fn(),
  EnableTheftProtectionLock: vi.fn(),
  DisableTheftProtectionLock: vi.fn(),
  GetList: vi.fn(),
  state: { lastResponse: null as unknown },
}))

vi.mock('nodejs-dna/src/DNARest', () => ({
  default: class FakeDNARest {
    get lastResponse() {
      return sdk.state.lastResponse
    }
    GetList = sdk.GetList
    CheckTransfer = sdk.CheckTransfer
    Transfer = sdk.Transfer
    GetDetails = sdk.GetDetails
    GetTldList = sdk.GetTldList
    EnableTheftProtectionLock = sdk.EnableTheftProtectionLock
    DisableTheftProtectionLock = sdk.DisableTheftProtectionLock
  },
}))

import { DomainNameApiProvider } from './domainnameapi-provider'

const EPP = 'EPP-SECRET-xyz-987'
const provider = () => new DomainNameApiProvider('user', 'key', true)

beforeEach(() => {
  vi.clearAllMocks()
  sdk.state.lastResponse = null
})

describe('DomainNameApiProvider transfer support', () => {
  it('maps CheckTransfer: valid code + available', async () => {
    sdk.CheckTransfer.mockResolvedValue({
      result: 'OK',
      data: { TransferAvailabilityStatus: true, AuthCodeIsValid: true, TransferLock: false },
    })
    expect(await provider().checkTransferIn('example.com', EPP)).toMatchObject({
      transferable: true,
      authCodeValid: true,
      locked: false,
    })
  })

  it('treats TRANSFER_NOT_AVAILABLE as a business answer, not a transport error', async () => {
    sdk.CheckTransfer.mockResolvedValue({
      result: 'ERROR',
      data: { TransferAvailabilityStatus: false, AuthCodeIsValid: false, TransferLock: true },
      error: { Code: 'TRANSFER_NOT_AVAILABLE' },
    })
    expect(await provider().checkTransferIn('example.com', EPP)).toMatchObject({
      transferable: false,
      authCodeValid: false,
      locked: true,
    })
  })

  it('throws a safe error (no EPP code) when CheckTransfer fails at transport level', async () => {
    sdk.CheckTransfer.mockRejectedValue(new Error(`timeout while sending ${EPP}`))
    const err = await provider().checkTransferIn('example.com', EPP).catch((e: Error) => e)
    expect((err as Error).message).toBe('domainnameapi:CHECK_TRANSFER_EXCEPTION')
    expect(JSON.stringify(err)).not.toContain(EPP)
  })

  it('reads the real transfer price (period 1), not the registration price', async () => {
    sdk.GetTldList.mockResolvedValue({
      result: 'OK',
      data: [
        { tld: 'com', pricing: { registration: { 1: '10.0000' }, transfer: { 1: '8.0000' } }, currencies: { transfer: 'USD' } },
      ],
    })
    expect(await provider().getTransferPrice('com')).toEqual({ transferCents: 800, currency: 'USD' })
  })

  it.each([
    ['missing transfer price', { tld: 'com', pricing: { registration: { 1: '10.0000' } } }],
    ['zero transfer price', { tld: 'com', pricing: { transfer: { 1: '0.0000' } } }],
    ['unknown TLD', { tld: 'net', pricing: { transfer: { 1: '9.0000' } } }],
  ])('returns null for %s (never free, never the register price)', async (_n, row) => {
    sdk.GetTldList.mockResolvedValue({ result: 'OK', data: [row] })
    expect(await provider().getTransferPrice('com')).toBeNull()
  })

  it('starts a transfer and reports a safe error without the EPP code on failure', async () => {
    sdk.Transfer.mockResolvedValue({ result: 'OK', data: { Status: 'pending' } })
    expect(await provider().startTransferIn('example.com', EPP, 1)).toEqual({ providerStatus: 'pending' })
    expect(sdk.Transfer).toHaveBeenCalledWith('example.com', EPP, 1, [])

    sdk.Transfer.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_400', Message: `bad ${EPP}` } })
    const err = await provider().startTransferIn('example.com', EPP, 1).catch((e: Error) => e)
    expect((err as Error).message).toBe('domainnameapi:API_400')
    expect(JSON.stringify(err)).not.toContain(EPP)

    sdk.Transfer.mockRejectedValue(new Error(`timeout ${EPP}`))
    const timeout = await provider().startTransferIn('example.com', EPP, 1).catch((e: Error) => e)
    expect((timeout as Error).message).toBe('domainnameapi:TRANSFER_EXCEPTION')
  })

  it('enables and disables the transfer lock and propagates provider errors', async () => {
    sdk.EnableTheftProtectionLock.mockResolvedValue({ result: 'OK' })
    sdk.DisableTheftProtectionLock.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_403' } })
    await provider().setTransferLock('example.com', true)
    expect(sdk.EnableTheftProtectionLock).toHaveBeenCalledWith('example.com')
    await expect(provider().setTransferLock('example.com', false)).rejects.toThrow('domainnameapi:API_403')
  })

  it('maps GetDetails to owned-domain info and the auth code', async () => {
    sdk.GetDetails.mockResolvedValue({
      result: 'OK',
      data: { Status: 'Active', LockStatus: 'true', AuthCode: EPP, Dates: { Start: '2025-01-01', Expiration: '2026-01-01' } },
    })
    sdk.state.lastResponse = { startDate: '2025-01-01T10:00:00.1234567', expirationDate: '2026-01-01T10:00:00.1234567' }
    expect(await provider().getOwnedDomainInfo('example.com')).toMatchObject({
      status: 'Active',
      locked: true,
      startedAt: null,
      expiresAt: null,
      startedAtRaw: '2025-01-01T10:00:00.1234567',
      expiresAtRaw: '2026-01-01T10:00:00.1234567',
      hasAuthCode: true,
    })
    expect(await provider().getAuthCode('example.com')).toBe(EPP)
  })

  it('returns an instant only for a date that names its own zone', async () => {
    sdk.GetDetails.mockResolvedValue({ result: 'OK', data: { Status: 'Active', LockStatus: 'false' } })
    sdk.state.lastResponse = { expirationDate: '2026-01-01T07:00:00Z' }
    const info = await provider().getOwnedDomainInfo('example.com')
    expect(info?.expiresAt).toBe('2026-01-01T07:00:00.000Z')
    expect(info?.startedAt).toBeNull()
    expect(info?.startedAtRaw).toBeNull()
  })

  describe('listOwnedDomains', () => {
    const row = {
      domainName: 'glovalotemutxxbd7.com',
      lockStatus: true,
      privacyProtectionStatus: true,
      expirationDate: '2027-10-04T17:55:29.4171901',
      remainingDay: 365,
      nameservers: [{ name: 'ns1.domainnameapi.com' }, 'ns2.domainnameapi.com'],
      contacts: { Registrant: 'D-1', Admin: 'D-1', Tech: 'D-1', Billing: 'D-1' },
      authCode: 'MUST-NOT-LEAK',
    }

    it('maps real rows and keeps unreturned fields null instead of inventing them', async () => {
      sdk.GetList.mockResolvedValue({ result: 'OK', data: { Domains: [{ DomainName: row.domainName, Status: 'Active' }] } })
      sdk.state.lastResponse = {
        totalCount: 1,
        items: [row, { domainName: 'sparse.com' }],
      }
      const page = await provider().listOwnedDomains()

      expect(page.total).toBe(1)
      expect(page.items[0]).toEqual({
        domain: 'glovalotemutxxbd7.com',
        status: 'Active',
        locked: true,
        privacy: true,
        expiresAtRaw: '2027-10-04T17:55:29.4171901',
        expiresAt: null,
        remainingDays: 365,
        nameservers: ['ns1.domainnameapi.com', 'ns2.domainnameapi.com'],
        contactHandles: { registrant: 'D-1', admin: 'D-1', tech: 'D-1', billing: 'D-1' },
      })
      expect(page.items[1]).toEqual({
        domain: 'sparse.com',
        status: '',
        locked: null,
        privacy: null,
        expiresAtRaw: null,
        expiresAt: null,
        remainingDays: null,
        nameservers: null,
        contactHandles: null,
      })
      expect(JSON.stringify(page)).not.toContain('MUST-NOT-LEAK')
    })

    it('passes paging to the SDK', async () => {
      sdk.GetList.mockResolvedValue({ result: 'OK', data: { Domains: [] } })
      sdk.state.lastResponse = { totalCount: 0, items: [] }
      await provider().listOwnedDomains({ skip: 20, take: 10 })
      expect(sdk.GetList).toHaveBeenCalledWith({ MaxResultCount: 10, SkipCount: 20 })
    })

    it('treats an empty account as an empty list, but a body without items as an error', async () => {
      sdk.GetList.mockResolvedValue({ result: 'OK', data: { Domains: [] } })
      sdk.state.lastResponse = { totalCount: 0, items: [] }
      expect((await provider().listOwnedDomains()).items).toEqual([])

      sdk.state.lastResponse = { message: 'odd' }
      await expect(provider().listOwnedDomains()).rejects.toThrow('LIST_UNEXPECTED_SHAPE')
    })

    it('surfaces provider errors and thrown exceptions', async () => {
      sdk.GetList.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_401' } })
      await expect(provider().listOwnedDomains()).rejects.toThrow('domainnameapi:API_401')
      sdk.GetList.mockRejectedValue(new Error('boom'))
      await expect(provider().listOwnedDomains()).rejects.toThrow('LIST_EXCEPTION')
    })
  })

  it('returns null info/code when the domain is not on our account', async () => {
    sdk.GetDetails.mockResolvedValue({ result: 'ERROR', error: { Code: 'API_404' } })
    expect(await provider().getOwnedDomainInfo('other.com')).toBeNull()
    expect(await provider().getAuthCode('other.com')).toBeNull()
  })
})
