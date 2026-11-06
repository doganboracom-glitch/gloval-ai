// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string | null },
  loadInsights: vi.fn(),
}))

vi.mock('@/lib/supabase/request-user', () => ({
  AuthUnavailableError: class AuthUnavailableError extends Error {},
  getRequestUser: async () => (
    mocks.user ? { kind: 'authenticated', user: mocks.user } : { kind: 'anonymous' }
  ),
}))
vi.mock('@/lib/ads/google-ads-insights-server', () => ({ loadGoogleAdsInsights: mocks.loadInsights }))
vi.mock('@/lib/ads/google-ads-insight-analysis', () => ({
  GoogleAdsAnalysisLimitError: class GoogleAdsAnalysisLimitError extends Error {},
  generateGoogleAdsAnalysis: vi.fn(),
}))
vi.mock('@/lib/ads/google-ads-report-store', () => ({
  GoogleAdsReportStorageError: class GoogleAdsReportStorageError extends Error {},
}))

import { GET } from './route'

const ALLOWED_USER_ID = '550e8400-e29b-41d4-a716-446655440000'
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174000'
const CONNECTION_ID = '987e6543-e21b-42d3-a456-426614174000'

function request() {
  return new Request(`https://gloval.ai/api/ads/google/insights?connectionId=${CONNECTION_ID}&range=7d`)
}

describe('GET /api/ads/google/insights access', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    vi.stubEnv('GOOGLE_ADS_ACCESS_MODE', 'allowlist')
    vi.stubEnv('ADS_GOOGLE_CONNECT_ENABLED', '1')
    vi.stubEnv('ADS_GOOGLE_CONNECT_PUBLIC', '0')
    vi.stubEnv('ADS_GOOGLE_CONNECT_ALLOWED_USER_IDS', ALLOWED_USER_ID)
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com')
    mocks.loadInsights.mockReset()
    mocks.loadInsights.mockResolvedValue({ insights: [] })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mocks.user = null
  })

  it('returns 401 without a session', async () => {
    const response = await GET(request())
    expect(response.status).toBe(401)
  })

  it('returns 200 for an email-confirmed allowlisted user', async () => {
    mocks.user = { id: ALLOWED_USER_ID, email: 'user@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' }
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(mocks.loadInsights).toHaveBeenCalledWith(expect.objectContaining({ userId: ALLOWED_USER_ID }))
  })

  it('returns 200 for an admin who is not on the allowlist', async () => {
    mocks.user = { id: OTHER_USER_ID, email: 'admin@example.com', email_confirmed_at: null }
    const response = await GET(request())
    expect(response.status).toBe(200)
  })

  it('returns 403 for a user who is not allowed', async () => {
    mocks.user = { id: OTHER_USER_ID, email: 'other@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' }
    const response = await GET(request())
    expect(response.status).toBe(403)
    expect(mocks.loadInsights).not.toHaveBeenCalled()
  })

  it('returns 403 for an allowlisted user whose email is not confirmed', async () => {
    mocks.user = { id: ALLOWED_USER_ID, email: 'user@example.com', email_confirmed_at: null }
    const response = await GET(request())
    expect(response.status).toBe(403)
  })
})
