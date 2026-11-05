// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { dictionary } from '@/lib/i18n'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ t: dictionary.tr, lang: 'tr' }),
}))
vi.mock('@/lib/custom-domains/registrar/transfer-actions', () => ({
  getMyTransferOutStatus: vi.fn(),
  revealMyAuthCode: vi.fn(),
}))
vi.mock('@/lib/custom-domains/registrar/transfer-window-actions', () => ({
  extendMyTransferWindow: vi.fn(),
  relockMyTransferWindow: vi.fn(),
  requestMyTransferOutCode: vi.fn(),
}))

import { TransferOutPanel } from '@/components/domains/transfer-out-panel'

const d = dictionary.tr.domains
const CODE = 'AUTH-CODE-123'

function windowOpenedAgo(ms: number) {
  const openedAt = Date.now() - ms
  return {
    id: 'w1',
    openedAt: new Date(openedAt).toISOString(),
    relockAt: new Date(openedAt + 72 * 3_600_000).toISOString(),
    extensions: 0,
  }
}

function status(overrides: Record<string, unknown>) {
  return {
    ok: true,
    supported: true,
    featureEnabled: true,
    locked: true,
    expiresAt: null,
    restrictedUntil: null,
    restrictionVerified: true,
    startDateNeedsConfirmation: false,
    activeAndUnexpired: true,
    liveStatusReadable: true,
    transferState: 'held',
    windowAvailable: true,
    activeWindow: null,
    ...overrides,
  }
}

function setup(statuses: ReturnType<typeof status>[]) {
  let call = 0
  const getStatus = vi.fn(async () => statuses[Math.min(call++, statuses.length - 1)])
  const requestWindowCode = vi.fn(async () => ({ ok: true, authCode: CODE }))
  const actions = {
    getStatus,
    requestWindowCode,
    revealLegacyCode: vi.fn(),
    extendWindow: vi.fn(),
    relockWindow: vi.fn(),
  }
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <TransferOutPanel domain="example.com" actions={actions as never} />
    </SWRConfig>,
  )
  return { getStatus, requestWindowCode }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('TransferOutPanel transfer window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows "unlocking" instead of "locked" while the registry has not applied the unlock yet', async () => {
    setup([status({ locked: true, activeWindow: windowOpenedAgo(10_000) })])
    expect(await screen.findByText(d.outWindow.statusUnlocking)).toBeTruthy()
    expect(screen.queryByText(d.outWindow.statusLocked)).toBeNull()
  })

  it('falls back to "locked" once the 3 minute wait is over', async () => {
    setup([status({ locked: true, activeWindow: windowOpenedAgo(4 * 60_000) })])
    expect(await screen.findByText(d.outWindow.statusLocked)).toBeTruthy()
  })

  it('shows the start-the-transfer label once unlocked', async () => {
    setup([status({ locked: false, activeWindow: windowOpenedAgo(10_000) })])
    expect(await screen.findByText(d.outWindow.statusUnlockedStart)).toBeTruthy()
  })

  it('shows a countdown, hides on demand and auto-hides after 60 seconds', async () => {
    const unlocked = status({ locked: false, activeWindow: windowOpenedAgo(10_000) })
    setup([unlocked])
    fireEvent.click(await screen.findByRole('button', { name: d.outWindow.showCode }))
    await flush()
    expect(screen.getByText(CODE)).toBeTruthy()
    expect(screen.getByTestId('transfer-code-countdown').textContent).toBe('60 sn kaldı')

    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(screen.getByTestId('transfer-code-countdown').textContent).toBe('50 sn kaldı')

    fireEvent.click(screen.getByRole('button', { name: d.outWindow.hideCode }))
    expect(screen.queryByText(CODE)).toBeNull()
  })

  it('removes the code after 60 seconds', async () => {
    setup([status({ locked: false, activeWindow: windowOpenedAgo(10_000) })])
    fireEvent.click(await screen.findByRole('button', { name: d.outWindow.showCode }))
    await flush()
    expect(screen.getByText(CODE)).toBeTruthy()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.queryByText(CODE)).toBeNull()
  })

  it('keeps a freshly issued code while the registry still reports "locked"', async () => {
    const open = windowOpenedAgo(5_000)
    setup([
      status({ locked: false, activeWindow: open }),
      status({ locked: true, activeWindow: open }),
    ])
    fireEvent.click(await screen.findByRole('button', { name: d.outWindow.showCode }))
    await flush()
    await flush()
    expect(screen.getByText(CODE)).toBeTruthy()
  })

  it('hides the code as soon as the window is gone', async () => {
    setup([
      status({ locked: false, activeWindow: windowOpenedAgo(5_000) }),
      status({ locked: true, activeWindow: null }),
    ])
    fireEvent.click(await screen.findByRole('button', { name: d.outWindow.showCode }))
    await flush()
    await flush()
    expect(screen.queryByText(CODE)).toBeNull()
  })

  it('hides the code when an outgoing transfer starts', async () => {
    const open = windowOpenedAgo(5_000)
    setup([
      status({ locked: false, activeWindow: open }),
      status({ locked: false, activeWindow: open, transferState: 'pending_outgoing' }),
    ])
    fireEvent.click(await screen.findByRole('button', { name: d.outWindow.showCode }))
    await flush()
    await flush()
    expect(screen.queryByText(CODE)).toBeNull()
  })
})
