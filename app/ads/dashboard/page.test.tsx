import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getPageAuthState: vi.fn(),
  listConnections: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  redirect: (href: string) => mocks.redirect(href),
  notFound: () => mocks.notFound(),
}))
vi.mock('@/lib/ads/feature-flag', () => ({
  ADS_DASHBOARD_PATH: '/ads/dashboard',
  isAdsFeatureUiEnabled: () => true,
}))
vi.mock('@/lib/ads/google-connections', () => ({
  listGoogleAdsConnectionsForUser: (userId: string) => mocks.listConnections(userId),
}))
vi.mock('@/lib/ads/google-route-utils', async () => {
  const { resolveGoogleAdsConnectAccess } = await vi.importActual<typeof import('@/lib/ads/env')>('@/lib/ads/env')
  return { googleAdsConnectAllowed: resolveGoogleAdsConnectAccess }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: () => mocks.createClient() }))
vi.mock('@/lib/supabase/page-auth', () => ({ getPageAuthState: (client: unknown) => mocks.getPageAuthState(client) }))
vi.mock('@/components/ads/ads-dashboard-client', () => ({ AdsDashboardClient: () => null }))
vi.mock('@/components/auth-unavailable-notice', () => ({ AuthUnavailableNotice: () => null }))

import AdsDashboardPage from './page'

const USER_ID = '550e8400-e29b-41d4-a716-446655440000'

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '1')
  vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', '')
  mocks.redirect.mockImplementation((href: string) => {
    throw new Error(`redirect:${href}`)
  })
  mocks.notFound.mockImplementation(() => {
    throw new Error('not-found')
  })
  mocks.createClient.mockResolvedValue({})
  mocks.listConnections.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Ads dashboard access', () => {
  it('redirects anonymous visitors to login even while public connect is enabled', async () => {
    mocks.getPageAuthState.mockResolvedValue({ kind: 'unauthenticated' })

    await expect(AdsDashboardPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow('redirect:/auth/login?next=/ads/dashboard')
    expect(mocks.listConnections).not.toHaveBeenCalled()
  })

  it('renders for any authenticated user when connect and public flags are both enabled', async () => {
    mocks.getPageAuthState.mockResolvedValue({ kind: 'authenticated', user: { id: USER_ID } })

    const page = await AdsDashboardPage({ searchParams: Promise.resolve({}) })

    expect(page).toBeTruthy()
    expect(mocks.notFound).not.toHaveBeenCalled()
    expect(mocks.listConnections).toHaveBeenCalledWith(USER_ID)
  })

  it('keeps the allowlist gate when public connect is off and requires the connect flag', async () => {
    mocks.getPageAuthState.mockResolvedValue({ kind: 'authenticated', user: { id: USER_ID } })
    vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '0')
    await expect(AdsDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')

    vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '1')
    vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '0')
    await expect(AdsDashboardPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('not-found')
  })
})
