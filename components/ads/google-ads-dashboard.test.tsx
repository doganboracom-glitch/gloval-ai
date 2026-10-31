// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'
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

  it('provides matching translated disconnect-dialog keys for every supported locale', () => {
    const expectedKeys = Object.keys(copy.disconnectDialog).sort()

    for (const locale of SUPPORTED_LOCALES) {
      const localeDialog = dictionary[locale].ads.disconnectDialog
      expect(Object.keys(localeDialog).sort()).toEqual(expectedKeys)
      for (const text of Object.values(localeDialog)) expect(text.trim()).not.toBe('')
      if (locale !== 'en') expect(localeDialog.title).not.toBe(copy.disconnectDialog.title)
    }

    expect(dictionary.tr.ads.disconnectDialog).toEqual({
      title: 'Google Ads bağlantısını kes?',
      description: "Bağlantıyı kestiğinde GLOVAL'ın Google hesabına erişimi iptal edilir ve kayıtlı erişim anahtarı silinir. İstediğin zaman yeniden bağlayabilirsin.",
      cancel: 'Vazgeç',
      confirm: 'Bağlantıyı kes',
      pending: 'Kesiliyor…',
      error: 'Google Ads izni iptal edilemedi. Bağlantı hâlâ etkin; tekrar dene.',
    })
  })

  it('opens an accessible dialog, traps focus, and returns focus after Escape', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const browserConfirm = vi.spyOn(window, 'confirm')
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const trigger = screen.getByRole('button', { name: copy.disconnectButton })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('alertdialog', { name: copy.disconnectDialog.title })
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy()
    expect(screen.getByText(copy.disconnectDialog.description)).toBeTruthy()

    const cancelButton = screen.getByRole('button', { name: copy.disconnectDialog.cancel })
    const confirmButton = within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm })
    expect(document.activeElement).toBe(cancelButton)
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.activeElement).toBe(confirmButton)
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(cancelButton)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(browserConfirm).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('closes on cancel and outside click without calling the disconnect API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const trigger = screen.getByRole('button', { name: copy.disconnectButton })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: copy.disconnectDialog.cancel }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    const dialog = screen.getByRole('alertdialog')
    const backdrop = dialog.parentElement
    if (!backdrop) throw new Error('Expected the dialog backdrop to exist')
    fireEvent.mouseDown(backdrop)

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('disconnects after confirmation, updates the panel, refreshes, and focuses the connect action', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/ads/google/disconnect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ connectionId: connection.id }),
      }),
    ))
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled())
    const connectButton = await screen.findByRole('button', { name: copy.connectionButton })
    await waitFor(() => expect(document.activeElement).toBe(connectButton))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('shows an alert inside the dialog after a failure and allows retrying', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'disconnect_failed' }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm }))

    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain(copy.disconnectDialog.error)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect((within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm }))
    await screen.findByRole('button', { name: copy.connectionButton })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('prevents duplicate requests and announces the pending state', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))
    const confirmButton = within(screen.getByRole('alertdialog')).getByRole('button', { name: copy.disconnectDialog.confirm })
    fireEvent.click(confirmButton)
    fireEvent.click(confirmButton)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const pendingButton = screen.getByRole('button', { name: copy.disconnectDialog.pending }) as HTMLButtonElement
    expect(pendingButton.disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toBe(copy.disconnectDialog.pending)

    await act(async () => {
      resolveFetch?.(new Response('{}', { status: 200 }))
    })
    await screen.findByRole('button', { name: copy.connectionButton })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
