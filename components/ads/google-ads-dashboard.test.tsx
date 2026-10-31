// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { dictionary } from '@/lib/i18n'
import type { AdsPerformanceSummary } from '@/lib/ads/providers/types'
import type { GoogleAdsConnectionView } from '@/components/ads/google-ads-dashboard'

const mocks = vi.hoisted(() => ({
  useSWR: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn() },
}))

vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('swr', () => ({ default: (...args: unknown[]) => mocks.useSWR(...args) }))
vi.mock('@/components/language-provider', async () => {
  const { dictionary: translations } = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n')
  return { useLanguage: () => ({ lang: 'en', t: translations.en, setLang: vi.fn() }) }
})

import { GoogleAdsDashboard } from '@/components/ads/google-ads-dashboard'

const copy = dictionary.en.ads
const connection: GoogleAdsConnectionView = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  externalAccountId: '9876543210',
  name: 'Northstar Search',
  currency: 'USD',
  isManager: false,
  loginCustomerId: null,
  status: 'active',
  lastError: null,
  createdAt: '2026-10-31T12:00:00.000Z',
}
const report: AdsPerformanceSummary = {
  range: '7d',
  currency: 'USD',
  totals: { impressions: 1850, clicks: 29, costMicros: 73220000, conversions: 4.5 },
  campaigns: [{
    id: '456',
    name: 'Search campaign',
    status: 'ENABLED',
    impressions: 1850,
    clicks: 29,
    costMicros: 73220000,
    conversions: 4.5,
  }],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.useSWR.mockImplementation((key: unknown) => ({
    data: typeof key === 'string' && key.includes('/api/ads/google/dashboard') ? { report } : undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }))
})

describe('Google Ads dashboard UI', () => {
  it('renders read-only metrics and campaign performance for an active account', () => {
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    expect(screen.getByRole('option', { name: /Northstar Search/ })).toBeTruthy()
    expect(screen.getAllByText('1,850')).toHaveLength(2)
    expect(screen.getAllByText('29')).toHaveLength(2)
    expect(screen.getAllByText('$73.22')).toHaveLength(2)
    expect(screen.getByText('Search campaign')).toBeTruthy()
    expect(screen.getAllByText(copy.readOnlyNote)).toHaveLength(2)
  })

  it('renders the connected status with a green badge and status indicator', () => {
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const badge = screen.getByText(copy.accountStatusActive)
    expect(badge.className).toContain('border-success/30')
    expect(badge.className).toContain('bg-success/10')
    expect(badge.className).toContain('text-success-strong')
    expect(badge.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it.each([
    ['pending', copy.accountStatusError, 'border-amber-800/30', 'text-amber-900'],
    ['error', copy.accountStatusError, 'border-amber-800/30', 'text-amber-900'],
    ['revoked', copy.accountStatusRevoked, 'border-border', 'text-muted-foreground'],
  ] as const)('uses the expected status label and color for %s', (status, label, borderClass, textClass) => {
    const statusConnection = { ...connection, status }
    render(<GoogleAdsDashboard connections={[statusConnection]} pendingFlowId={null} oauthStatus={null} />)

    const badge = screen.getByText(label, { selector: '[data-slot="badge"]' })
    expect(badge.className).toContain(borderClass)
    expect(badge.className).toContain(textClass)
  })

  it('switches the report query to the selected 30-day range', () => {
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)
    fireEvent.click(screen.getByRole('button', { name: copy.range30 }))

    expect(mocks.useSWR.mock.calls.some(([key]) => typeof key === 'string' && key.endsWith('range=30d'))).toBe(true)
  })

  it('shows the connect action when there is no linked account', () => {
    render(<GoogleAdsDashboard connections={[]} pendingFlowId={null} oauthStatus={null} />)

    expect(screen.getByRole('button', { name: copy.connectionButton })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('styles the disconnect action as destructive while keeping its accessible label', () => {
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const button = screen.getByRole('button', { name: copy.disconnectButton })
    expect(button.className).toContain('border-red-700/40')
    expect(button.className).toContain('text-red-700')
    expect(button.className).toContain('hover:bg-red-50')
    expect(button.className).toContain('focus-visible:ring-red-700')
    expect(button.className).toContain('dark:text-red-300')
  })

  it('opens an accessible confirmation dialog with focus on the safe cancel action', () => {
    const nativeConfirm = vi.spyOn(window, 'confirm')
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))

    const dialog = screen.getByRole('alertdialog', { name: copy.disconnectDialogTitle })
    const labelledBy = dialog.getAttribute('aria-labelledby')
    const describedBy = dialog.getAttribute('aria-describedby')
    expect(labelledBy).toBeTruthy()
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe(copy.disconnectDialogTitle)
    expect(document.getElementById(describedBy ?? '')?.textContent).toBe(copy.disconnectDialogDescription)
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: copy.disconnectCancelButton }))
    expect(nativeConfirm).not.toHaveBeenCalled()
  })

  it('closes from cancel, Escape, and an outside click without calling the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const opener = screen.getByRole('button', { name: copy.disconnectButton })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectCancelButton }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(opener)

    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(opener)

    opener.focus()
    fireEvent.click(opener)
    const backdrop = screen.getByRole('alertdialog').parentElement
    expect(backdrop).toBeTruthy()
    fireEvent.mouseDown(backdrop as HTMLElement)
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('traps keyboard focus inside the dialog', () => {
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)
    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))

    const dialog = screen.getByRole('alertdialog')
    const cancelButton = within(dialog).getByRole('button', { name: copy.disconnectCancelButton })
    const confirmButton = within(dialog).getByRole('button', { name: copy.disconnectButton })
    expect(document.activeElement).toBe(cancelButton)

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(confirmButton)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(cancelButton)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirmButton)
  })

  it('disconnects with the existing API request, closes, and focuses the connect action after refresh', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { rerender } = render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    const dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: copy.disconnectButton }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ads/google/disconnect', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId: connection.id }),
    })))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()

    rerender(<GoogleAdsDashboard connections={[]} pendingFlowId={null} oauthStatus={null} />)
    const connectButton = screen.getByRole('button', { name: copy.connectionButton })
    await waitFor(() => expect(document.activeElement).toBe(connectButton))
  })

  it('shows an announced error and allows the disconnect to be retried', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"disconnect_failed"}', { status: 500 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    let dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: copy.disconnectButton }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(copy.disconnectError)
    dialog = screen.getByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: copy.disconnectButton }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('prevents a rapid double click from issuing duplicate disconnect requests', async () => {
    let resolveResponse: (response: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    const dialog = screen.getByRole('alertdialog')
    const confirmButton = within(dialog).getByRole('button', { name: copy.disconnectButton })
    act(() => {
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      confirmButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((within(dialog).getByRole('button', { name: copy.disconnectingButton }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(dialog).getByRole('status').textContent).toBe(copy.disconnectingButton)

    await act(async () => {
      resolveResponse(new Response('{}', { status: 200 }))
    })
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
