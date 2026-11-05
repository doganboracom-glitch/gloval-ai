import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminClient, DomainTransferWindow } from './transfer-window-store'

const mocks = vi.hoisted(() => ({
  registrar: null as unknown,
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  audit: vi.fn(),
  getRecipient: vi.fn(),
  sendNotice: vi.fn(),
  updateOpenWindow: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('./provider', () => ({ getDomainRegistrarProvider: () => mocks.registrar }))
vi.mock('./audit', () => ({ recordDomainAuditEvent: mocks.audit }))
vi.mock('./transfer-window-notice', () => ({
  getTransferWindowRecipient: mocks.getRecipient,
  sendTransferWindowNotice: mocks.sendNotice,
}))
vi.mock('./transfer-window-store', () => ({
  updateOpenTransferWindow: mocks.updateOpenWindow,
}))

import { runDueTransferWindowRelocks, sendDueTransferWindowReminders } from './transfer-window-relock'

const openedAt = Date.parse('2026-02-01T00:00:00.000Z')
const nowMs = openedAt + 72 * 60 * 60 * 1000

function makeWindow(overrides: Partial<DomainTransferWindow> = {}): DomainTransferWindow {
  return {
    id: 'window-1',
    custom_domain_id: 'domain-1',
    domain: 'example.com',
    user_id: 'user-1',
    status: 'open',
    opened_at: new Date(openedAt).toISOString(),
    relock_at: new Date(nowMs).toISOString(),
    extensions: 0,
    relock_attempts: 0,
    last_error_code: null,
    closed_at: null,
    reminder_sent_at: null,
    relock_lease_until: null,
    ...overrides,
  }
}

function makeAdmin(windows: DomainTransferWindow[]): AdminClient {
  return {
    rpc: vi.fn(async (_name: string, args: { p_limit: number }) => ({ data: windows, error: null, args })),
  } as unknown as AdminClient
}

function makeRegistrar(status: string, initiallyLocked: boolean | null = false) {
  let locked = initiallyLocked
  const registrar = {
    getManagedDetails: vi.fn(async () => ({
      locked,
      status,
      expiresAt: new Date(nowMs + 90 * 24 * 60 * 60 * 1000).toISOString(),
      remainingDays: 90,
    })),
    changeLock: vi.fn(async (_domain: string, nextLocked: boolean) => {
      locked = nextLocked
      return { changed: true, previousLocked: !nextLocked, locked: nextLocked }
    }),
  }
  mocks.registrar = registrar
  return registrar
}

function makeReminderAdmin(candidate: {
  id: string
  custom_domain_id: string
  domain: string
  user_id: string
  relock_at: string
}): AdminClient {
  let claimedAt: string | null = null
  const admin = {
    rpc: vi.fn(),
    from: vi.fn(() => {
      let updatePayload: Record<string, unknown> | null = null
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        gt: () => builder,
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        update: (payload: Record<string, unknown>) => {
          updatePayload = payload
          return builder
        },
        maybeSingle: async () => {
          if (updatePayload?.reminder_sent_at === null) {
            claimedAt = null
            return { data: null, error: null }
          }
          if (updatePayload && claimedAt === null) {
            claimedAt = String(updatePayload.reminder_sent_at)
            return { data: { id: candidate.id }, error: null }
          }
          return { data: null, error: null }
        },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [candidate], error: null }),
      }
      return builder
    }),
  }
  return admin as unknown as AdminClient
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updates.length = 0
  mocks.audit.mockResolvedValue(undefined)
  mocks.getRecipient.mockResolvedValue(null)
  mocks.sendNotice.mockResolvedValue(true)
  mocks.updateOpenWindow.mockImplementation(async (_admin, id, patch) => {
    mocks.updates.push({ id, patch })
    return { ok: true, value: true }
  })
})

describe('scheduled transfer relock', () => {
  it('sends the 24-hour reminder once using an atomic marker claim', async () => {
    mocks.getRecipient.mockResolvedValue({ email: 'owner@example.com', lang: 'tr' })
    const admin = makeReminderAdmin({
      id: 'window-1',
      custom_domain_id: 'domain-1',
      domain: 'example.com',
      user_id: 'user-1',
      relock_at: new Date(nowMs + 6 * 60 * 60 * 1000).toISOString(),
    })

    await expect(sendDueTransferWindowReminders(admin, nowMs)).resolves.toEqual({ sent: 1, failed: 0, skipped: 0 })
    await expect(sendDueTransferWindowReminders(admin, nowMs)).resolves.toEqual({ sent: 0, failed: 0, skipped: 1 })
    expect(mocks.sendNotice).toHaveBeenCalledTimes(1)
    expect(mocks.sendNotice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reminder',
      windowId: 'window-1',
      domain: 'example.com',
    }))
  })

  it('claims at most 20 rows and defers status 11 in 24-hour steps without locking', async () => {
    const registrar = makeRegistrar('WaitingForOutgoingTransfer', false)
    const admin = makeAdmin([makeWindow()])

    const result = await runDueTransferWindowRelocks(admin, nowMs)

    expect(result).toMatchObject({ claimed: 1, deferred: 1, relocked: 0 })
    expect(admin.rpc).toHaveBeenCalledWith('claim_due_domain_transfer_windows', { p_limit: 20 })
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(mocks.updates[0]?.patch).toMatchObject({
      relock_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
      relock_lease_until: null,
    })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ source: 'auto_relock_deferred', outcome: 'deferred' }),
    }))
  })

  it('re-locks only after a fresh read confirms no outgoing transfer is pending', async () => {
    const registrar = makeRegistrar('Active', false)
    const admin = makeAdmin([makeWindow()])

    const result = await runDueTransferWindowRelocks(admin, nowMs)

    expect(result).toMatchObject({ claimed: 1, relocked: 1, deferred: 0 })
    expect(registrar.changeLock).toHaveBeenCalledWith('example.com', true)
    expect(registrar.getManagedDetails).toHaveBeenCalledTimes(2)
    expect(mocks.updates.at(-1)?.patch).toMatchObject({ status: 'relocked', closed_at: expect.any(String) })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ locked: true, source: 'auto_relock' }),
    }))
  })

  it('cancels a window when the registrar no longer has the domain', async () => {
    const registrar = makeRegistrar('Active', false)
    registrar.getManagedDetails.mockResolvedValueOnce(null as never)

    const result = await runDueTransferWindowRelocks(makeAdmin([makeWindow()]), nowMs)

    expect(result.cancelled).toBe(1)
    expect(registrar.changeLock).not.toHaveBeenCalled()
    expect(mocks.updates[0]?.patch).toMatchObject({ status: 'cancelled' })
  })

  it('closes a window as failed after five consecutive relock errors', async () => {
    const registrar = makeRegistrar('Active', false)
    registrar.getManagedDetails.mockRejectedValue(new Error('provider details unavailable'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runDueTransferWindowRelocks(
      makeAdmin([makeWindow({ relock_attempts: 4 })]),
      nowMs,
    )

    expect(result.failed).toBe(1)
    expect(mocks.updates[0]?.patch).toMatchObject({
      status: 'failed',
      relock_attempts: 5,
      last_error_code: 'registrar_read_failed',
    })
    expect(JSON.stringify(mocks.updates)).not.toContain('provider details unavailable')
    expect(errorLog).toHaveBeenCalledWith('[domain-transfer-relock] retry limit reached', 'registrar_read_failed')
    errorLog.mockRestore()
  })
})
