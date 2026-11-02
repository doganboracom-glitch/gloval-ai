// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'
import type { AdsAccountSummary, AdsPerformanceSummary } from '@/lib/ads/providers/types'
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

function configureSWRData(nextReport: AdsPerformanceSummary, accounts?: AdsAccountSummary[]) {
  mocks.useSWR.mockImplementation((key: unknown) => ({
    data: typeof key === 'string' && key.includes('/api/ads/google/dashboard')
      ? { report: nextReport }
      : typeof key === 'string' && key.includes('/api/ads/google/select?') && accounts
        ? { accounts }
        : undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  configureSWRData(report)
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

  it.each([
    {
      status: 'ENABLED',
      label: copy.campaignActive,
      badgeClasses: ['border-emerald-700/30', 'bg-emerald-50', 'text-emerald-900', 'dark:border-emerald-300/40', 'dark:bg-emerald-950/50', 'dark:text-emerald-200'],
      dotClasses: ['bg-emerald-700', 'dark:bg-emerald-300'],
    },
    {
      status: 'PAUSED',
      label: copy.campaignPaused,
      badgeClasses: ['border-amber-800/30', 'bg-amber-50', 'text-amber-900', 'dark:border-amber-300/40', 'dark:bg-amber-950/50', 'dark:text-amber-300'],
      dotClasses: ['bg-amber-700', 'dark:bg-amber-300'],
    },
    {
      status: 'REMOVED',
      label: copy.campaignRemoved,
      badgeClasses: ['border-border', 'bg-muted/50', 'text-muted-foreground'],
      dotClasses: ['bg-muted-foreground'],
    },
    {
      status: 'UNSPECIFIED',
      label: copy.campaignUnknown,
      badgeClasses: ['border-border', 'bg-muted/50', 'text-muted-foreground'],
      dotClasses: ['bg-muted-foreground'],
    },
    {
      status: 'UNKNOWN',
      label: copy.campaignUnknown,
      badgeClasses: ['border-border', 'bg-muted/50', 'text-muted-foreground'],
      dotClasses: ['bg-muted-foreground'],
    },
    {
      status: 'FUTURE_STATUS',
      label: copy.campaignUnknown,
      badgeClasses: ['border-border', 'bg-muted/50', 'text-muted-foreground'],
      dotClasses: ['bg-muted-foreground'],
    },
  ] as const)('maps Google campaign status $status to the expected badge', ({ status, label, badgeClasses, dotClasses }) => {
    configureSWRData({
      ...report,
      campaigns: report.campaigns.map((campaign) => ({ ...campaign, status })),
    })
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    const badge = screen.getByText(label, { selector: '[data-slot="badge"]' })
    for (const className of badgeClasses) expect(badge.className).toContain(className)

    const dot = badge.querySelector('span[aria-hidden="true"]')
    expect(dot).toBeTruthy()
    for (const className of dotClasses) expect(dot?.className).toContain(className)
  })

  it('shows account names with IDs and avoids repeating an unnamed account ID', () => {
    const accountId = '4021989690'
    const unnamedConnection = {
      ...connection,
      id: '223e4567-e89b-42d3-a456-426614174001',
      externalAccountId: accountId,
      name: null,
    }
    const namedConnection = {
      ...connection,
      id: '323e4567-e89b-42d3-a456-426614174002',
    }
    configureSWRData(report, [
      { externalAccountId: accountId, name: null, currency: 'TRY', isManager: false, loginCustomerId: null },
      { externalAccountId: '1234567890', name: 'Northstar Ads', currency: 'USD', isManager: false, loginCustomerId: null },
    ])
    render(<GoogleAdsDashboard connections={[unnamedConnection, namedConnection]} pendingFlowId="flow-id" oauthStatus={null} />)

    expect(screen.getAllByRole('option', { name: new RegExp(`^${accountId}$`) })).toHaveLength(2)
    expect(screen.getByRole('option', { name: /^Northstar Ads · 1234567890$/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /^Northstar Search · 9876543210$/ })).toBeTruthy()
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

  it('provides translated campaign status labels for the requested locales', () => {
    const expectedTranslations = {
      tr: { campaignActive: 'Etkin', campaignPaused: 'Duraklatıldı', campaignRemoved: 'Kaldırıldı', campaignUnknown: 'Bilinmiyor' },
      en: { campaignActive: 'Enabled', campaignPaused: 'Paused', campaignRemoved: 'Removed', campaignUnknown: 'Unknown' },
      de: { campaignActive: 'Aktiv', campaignPaused: 'Pausiert', campaignRemoved: 'Entfernt', campaignUnknown: 'Unbekannt' },
      fr: { campaignActive: 'Activée', campaignPaused: 'En pause', campaignRemoved: 'Supprimée', campaignUnknown: 'Inconnue' },
      es: { campaignActive: 'Activa', campaignPaused: 'Pausada', campaignRemoved: 'Eliminada', campaignUnknown: 'Desconocida' },
      it: { campaignActive: 'Attiva', campaignPaused: 'In pausa', campaignRemoved: 'Rimossa', campaignUnknown: 'Sconosciuta' },
    } as const

    for (const locale of SUPPORTED_LOCALES) {
      const statusCopy = dictionary[locale].ads
      expect(statusCopy.campaignActive.trim()).not.toBe('')
      expect(statusCopy.campaignPaused.trim()).not.toBe('')
      expect(statusCopy.campaignRemoved.trim()).not.toBe('')
      expect(statusCopy.campaignUnknown.trim()).not.toBe('')
    }

    for (const locale of Object.keys(expectedTranslations) as (keyof typeof expectedTranslations)[]) {
      expect(dictionary[locale].ads).toMatchObject(expectedTranslations[locale])
    }

    expect(dictionary.tr.ads.readOnlyNote).toBe('Bu panel salt okunurdur: kampanya oluşturma, düzenleme, durdurma veya yayınlama yapmaz.')
    expect(dictionary.en.ads.readOnlyNote).toBe('This dashboard is read-only: it does not create, edit, pause, or publish campaigns.')
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
