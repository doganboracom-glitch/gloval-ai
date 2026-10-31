// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('posts an explicit disconnect and refreshes server-rendered connection state', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<GoogleAdsDashboard connections={[connection]} pendingFlowId={null} oauthStatus={null} />)

    fireEvent.click(screen.getByRole('button', { name: copy.disconnectButton }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ads/google/disconnect', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(mocks.router.refresh).toHaveBeenCalled())
  })
})
