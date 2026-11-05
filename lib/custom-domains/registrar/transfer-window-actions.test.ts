import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: true,
  registrar: null as unknown,
  requireUser: vi.fn(),
  findOpenWindow: vi.fn(),
  getCustomDomainId: vi.fn(),
  insertOpenWindow: vi.fn(),
  updateOpenWindow: vi.fn(),
  updateExtensions: vi.fn(),
  reserveHourly: vi.fn(),
  reserveDaily: vi.fn(),
  audit: vi.fn(),
  sendNotice: vi.fn(),
}))

vi.mock('@/lib/supabase/request-user', () => ({ requireRequestUser: mocks.requireUser }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('./capabilities', () => ({ isTransferLockChangeEnabled: () => mocks.enabled }))
vi.mock('./provider', () => ({ getDomainRegistrarProvider: () => mocks.registrar }))
vi.mock('./ownership', () => ({ requireRegisteredByUs: async (_userId: string, domain: string) => domain.toLowerCase() }))
vi.mock('./service', () => ({ parsePurchaseDomain: (domain: string) => ({ domain: domain.toLowerCase(), tld: domain.split('.').at(-1) ?? '' }) }))
vi.mock('./transfer-service', () => ({ isTransferSupportedTld: () => true }))
vi.mock('./nameserver-access', () => ({ isActiveAndUnexpired: () => true }))
vi.mock('./rate-limit', () => ({
  reserveUserHourly: mocks.reserveHourly,
  reserveUserDailyTransferExtension: mocks.reserveDaily,
}))
vi.mock('./transfer-window-store', () => ({
  findOpenTransferWindow: mocks.findOpenWindow,
  getOwnedCustomDomainId: mocks.getCustomDomainId,
  insertOpenTransferWindow: mocks.insertOpenWindow,
  updateOpenTransferWindow: mocks.updateOpenWindow,
  updateOpenTransferWindowIfExtensionsMatch: mocks.updateExtensions,
}))
vi.mock('./audit', () => ({ recordDomainAuditEvent: mocks.audit }))
vi.mock('./transfer-window-notice', () => ({ sendTransferWindowNotice: mocks.sendNotice }))

import {
  extendMyTransferWindow,
  relockMyTransferWindow,
  requestMyTransferOutCode,
} from './transfer-window-actions'
import { RegistrarError } from './types'
import type { OwnedDomainInfo } from './types'

const EPP = 'EPP-TEST-ONLY'
const expiresAt = new Date(Date.now() + 180 * 86_400_000).toISOString()
const openedAt = new Date(Date.now() - 60_000).toISOString()
const activeWindow = (extensions = 0) => ({
  id: 'window-1',
  custom_domain_id: 'domain-1',
  domain: 'example.com',
  user_id: 'user-1',
  status: 'open',
  opened_at: openedAt,
  relock_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  extensions,
  relock_attempts: 0,
  last_error_code: null,
  closed_at: null,
  reminder_sent_at: null,
  relock_lease_until: null,
})

function ownedInfo(overrides: Partial<OwnedDomainInfo> = {}): OwnedDomainInfo {
  const startedAt = new Date(Date.now() - 90 * 86_400_000).toISOString()
  return {
    locked: true,
    expiresAt,
    startedAt,
    startedAtRaw: startedAt,
    remainingDays: 180,
    status: 'Active',
    hasAuthCode: true,
    ...overrides,
  }
}

function makeRegistrar(initiallyLocked = true) {
  let locked = initiallyLocked
  const registrar = {
    checkTransferIn: vi.fn(),
    getTransferPrice: vi.fn(),
    startTransferIn: vi.fn(),
    getOwnedDomainInfo: vi.fn(async (): Promise<OwnedDomainInfo> => ownedInfo({ locked })),
    getAuthCode: vi.fn(async () => EPP),
    getManagedDetails: vi.fn(async () => ({
      locked,
      expiresAt,
      remainingDays: 180,
      status: 'Active',
    })),
    changeLock: vi.fn(async (_domain: string, nextLocked: boolean) => {
      locked = nextLocked
      return { changed: true, previousLocked: !nextLocked, locked: nextLocked }
    }),
    changeNameservers: vi.fn(),
  }
  mocks.registrar = registrar
  return registrar
}

function ownedWindow(row: ReturnType<typeof activeWindow> | null) {
  mocks.findOpenWindow.mockResolvedValue({ ok: true, value: row })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled = true
  mocks.requireUser.mockResolvedValue({
    id: 'user-1',
    email: 'owner@example.com',
    user_metadata: { email_locale: 'tr' },
  })
  mocks.findOpenWindow.mockResolvedValue({ ok: true, value: null })
  mocks.getCustomDomainId.mockResolvedValue('domain-1')
  mocks.insertOpenWindow.mockImplementation(async (_admin, input) => ({
    ok: true,
    value: {
      ...activeWindow(0),
      ...input,
      id: 'window-1',
      status: 'open',
      extensions: 0,
      relock_attempts: 0,
      last_error_code: null,
      closed_at: null,
      reminder_sent_at: null,
      relock_lease_until: null,
    },
  }))
  mocks.updateOpenWindow.mockResolvedValue({ ok: true, value: true })
  mocks.updateExtensions.mockResolvedValue({ ok: true, value: true })
  mocks.reserveHourly.mockResolvedValue('allowed')
  mocks.reserveDaily.mockResolvedValue('allowed')
  mocks.audit.mockResolvedValue(undefined)
  mocks.sendNotice.mockResolvedValue(true)
  makeRegistrar(true)
})

describe('transfer window access controls', () => {
  it('keeps the new flow disabled without contacting the registrar', async () => {
    mocks.enabled = false
    const registrar = makeRegistrar(true)

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'UNSUPPORTED',
    })
    expect(registrar.getOwnedDomainInfo).not.toHaveBeenCalled()
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
  })

  it('fails closed when the transfer-window table is unavailable, before any unlock call', async () => {
    const registrar = makeRegistrar(true)
    mocks.findOpenWindow.mockResolvedValue({ ok: false, error: 'unavailable' })

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'WINDOW_UNAVAILABLE',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
  })

  it('requires an exact domain confirmation before unlocking', async () => {
    const registrar = makeRegistrar(true)

    await expect(requestMyTransferOutCode('example.com', 'example.net')).resolves.toEqual({
      ok: false,
      error: 'CONFIRMATION_MISMATCH',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
  })

  it('blocks a missing registration date until the user confirms the 60-day risk', async () => {
    const registrar = makeRegistrar(true)
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({ startedAt: null, startedAtRaw: null }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'START_DATE_CONFIRMATION_REQUIRED',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_code_viewed',
      details: { outcome: 'failed', reason: 'start_date_missing' },
    }))
  })

  it('opens the normal transfer window after explicit confirmation for a missing date', async () => {
    const registrar = makeRegistrar(true)
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({ startedAt: null, startedAtRaw: null }))

    const result = await requestMyTransferOutCode('example.com', 'example.com', true)

    expect(result).toMatchObject({ ok: true, authCode: EPP, created: true })
    expect(registrar.changeLock).toHaveBeenCalledWith('example.com', false, { acceptUnconfirmed: true, lockCall: {} })
    expect(mocks.insertOpenWindow).toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({ reason: 'start_date_missing' }),
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(EPP)
  })

  it('fails closed and audits an unreadable lock without attempting an unlock', async () => {
    const registrar = makeRegistrar(true)
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({ locked: null }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'STATUS_UNVERIFIED',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_code_viewed',
      details: { outcome: 'failed', reason: 'locked_unreadable' },
    }))
  })

  it('fails closed and audits an unknown registrar transfer status', async () => {
    const registrar = makeRegistrar(true)
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({ status: 'unrecognized-status' }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'STATUS_UNVERIFIED',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_code_viewed',
      details: { outcome: 'failed', reason: 'status_unknown' },
    }))
  })

  it('requires confirmation for an unparseable registration date and audits only its safe shape', async () => {
    const registrar = makeRegistrar(true)
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({
      startedAt: null,
      startedAtRaw: '2026-01-01T10:00:00',
    }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'START_DATE_CONFIRMATION_REQUIRED',
    })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_code_viewed',
      details: {
        outcome: 'failed',
        reason: 'start_date_unparseable',
        startDateShape: '9999-99-99a99:99:99',
      },
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('2026-01-01T10:00:00')
  })

  it('records an unlock-request stage and only the safe RegistrarError prefix', async () => {
    const registrar = makeRegistrar(true)
    registrar.changeLock.mockRejectedValueOnce(
      new RegistrarError('OUTCOME_UNKNOWN', 'domainnameapi:LOCK_NOT_CONFIRMED private-domain-token'),
    )

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'PROVIDER_ERROR',
    })

    expect(registrar.changeLock.mock.calls).toEqual([
      ['example.com', false, { acceptUnconfirmed: true, lockCall: {} }],
      ['example.com', true],
    ])
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({
        stage: 'unlock_request',
        providerCode: 'domainnameapi:LOCK_NOT_CONFIRMED',
      }),
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('private-domain-token')
  })

  it('opens the window without waiting when the registry has not applied the unlock yet', async () => {
    const registrar = makeRegistrar(true)
    registrar.changeLock.mockImplementationOnce(async () => ({
      changed: true,
      pending: true,
      previousLocked: true,
      locked: true,
    }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toMatchObject({
      ok: true,
      authCode: EPP,
      created: true,
    })

    expect(registrar.changeLock).toHaveBeenCalledTimes(1)
    expect(registrar.changeLock).toHaveBeenCalledWith('example.com', false, { acceptUnconfirmed: true, lockCall: {} })
    expect(mocks.insertOpenWindow).toHaveBeenCalledTimes(1)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({ stage: 'unlock_pending', outcome: 'deferred', locked: null }),
    }))
  })

  it('refuses to open a window when the registrar silently ignored the unlock', async () => {
    const registrar = makeRegistrar(true)
    registrar.changeLock.mockImplementationOnce(async () => ({
      changed: false,
      ineffective: true,
      previousLocked: true,
      locked: true,
    }))

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'UNLOCK_INEFFECTIVE',
    })

    expect(mocks.insertOpenWindow).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({ stage: 'unlock_ineffective' }),
    }))
  })

  it('records a confirmed unlock stage when the provider confirms the new state', async () => {
    makeRegistrar(true)

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toMatchObject({
      ok: true,
      created: true,
    })

    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({ stage: 'unlock_confirmed', outcome: 'success', locked: false }),
    }))
  })

  it('relocks and schedules immediate recovery when window insertion fails', async () => {
    const registrar = makeRegistrar(true)
    registrar.changeLock
      .mockImplementationOnce(async () => ({ changed: true, previousLocked: true, locked: false }))
      .mockRejectedValueOnce(new RegistrarError('PROVIDER_ERROR', 'domainnameapi:LOCK_EXCEPTION private-value'))
    mocks.insertOpenWindow
      .mockResolvedValueOnce({ ok: false, error: 'unavailable' })
      .mockResolvedValueOnce({ ok: true, value: { ...activeWindow(), id: 'recovery-window' } })

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'WINDOW_UNAVAILABLE',
    })

    expect(registrar.changeLock.mock.calls).toEqual([
      ['example.com', false, { acceptUnconfirmed: true, lockCall: {} }],
      ['example.com', true],
    ])
    expect(mocks.insertOpenWindow).toHaveBeenCalledTimes(2)
    expect(mocks.updateOpenWindow).toHaveBeenCalledWith(
      expect.anything(),
      'recovery-window',
      expect.objectContaining({ last_error_code: 'unlock_outcome_unconfirmed' }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({
        stage: 'window_insert',
        providerCode: 'domainnameapi:LOCK_EXCEPTION',
      }),
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('private-value')
  })

  it('records provider failures while fetching a code without logging the provider message', async () => {
    const registrar = makeRegistrar(true)
    registrar.getAuthCode.mockRejectedValueOnce(
      new RegistrarError('PROVIDER_ERROR', 'domainnameapi:AUTH_CODE_EXCEPTION private-response'),
    )

    await expect(requestMyTransferOutCode('example.com', 'example.com')).resolves.toEqual({
      ok: false,
      error: 'PROVIDER_ERROR',
    })

    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_code_viewed',
      details: expect.objectContaining({
        stage: 'code_fetch',
        providerCode: 'domainnameapi:AUTH_CODE_EXCEPTION',
      }),
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('private-response')
  })

  it('keeps the 60-day restriction even when the user confirms the date warning', async () => {
    const registrar = makeRegistrar(true)
    const startedAt = new Date(Date.now() - 59 * 86_400_000).toISOString()
    registrar.getOwnedDomainInfo.mockResolvedValue(ownedInfo({ startedAt, startedAtRaw: startedAt }))

    await expect(requestMyTransferOutCode('example.com', 'example.com', true)).resolves.toEqual({
      ok: false,
      error: 'RESTRICTED_60_DAYS',
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
  })

  it('unlocks, verifies, records the window, then retrieves the code without storing it', async () => {
    const registrar = makeRegistrar(true)
    const result = await requestMyTransferOutCode('example.com', 'example.com')

    expect(result).toMatchObject({ ok: true, authCode: EPP, created: true })
    expect(registrar.changeLock).toHaveBeenCalledWith('example.com', false, { acceptUnconfirmed: true, lockCall: {} })
    expect(mocks.insertOpenWindow.mock.invocationCallOrder[0]).toBeGreaterThan(
      registrar.changeLock.mock.invocationCallOrder[0],
    )
    expect(registrar.getAuthCode.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.insertOpenWindow.mock.invocationCallOrder[0],
    )
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(EPP)
    expect(JSON.stringify(mocks.sendNotice.mock.calls)).not.toContain(EPP)
    expect(JSON.stringify(mocks.insertOpenWindow.mock.calls)).not.toContain(EPP)
  })

  it('returns the active-window code without performing a second unlock', async () => {
    const registrar = makeRegistrar(false)
    ownedWindow(activeWindow())

    await expect(requestMyTransferOutCode('example.com')).resolves.toMatchObject({
      ok: true,
      authCode: EPP,
      created: false,
    })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(registrar.getAuthCode).toHaveBeenCalledTimes(1)
  })

  it('refuses code retrieval for an unlocked domain with no active window', async () => {
    const registrar = makeRegistrar(false)

    await expect(requestMyTransferOutCode('example.com')).resolves.toEqual({
      ok: false,
      error: 'WINDOW_NOT_OPEN',
    })
    expect(registrar.getAuthCode).not.toHaveBeenCalled()
  })
})

describe('manual relock and extensions', () => {
  it('re-locks immediately, verifies the registrar, and cancels the active window', async () => {
    const registrar = makeRegistrar(false)
    ownedWindow(activeWindow())

    await expect(relockMyTransferWindow('example.com')).resolves.toEqual({ ok: true, locked: true })
    expect(registrar.changeLock).toHaveBeenCalledWith('example.com', true)
    expect(mocks.updateOpenWindow).toHaveBeenCalledWith(
      expect.anything(),
      'window-1',
      expect.objectContaining({ status: 'cancelled' }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'transfer_lock_changed',
      details: expect.objectContaining({ locked: true, source: 'user_relock' }),
    }))
  })

  it('enforces the two-extension cap without writing a third extension', async () => {
    makeRegistrar(false)
    ownedWindow(activeWindow(2))

    await expect(extendMyTransferWindow('example.com')).resolves.toEqual({
      ok: false,
      error: 'WINDOW_LIMIT_REACHED',
    })
    expect(mocks.updateExtensions).not.toHaveBeenCalled()
  })
})
