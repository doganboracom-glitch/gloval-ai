// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_COOKIE, CONSENT_VERSION } from '@/lib/cookie-consent-storage'
import { resetVendor } from '@/lib/analytics'

vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('next/script', () => ({ default: () => null }))
vi.mock('@/components/analytics/use-attribution-capture', () => ({ useAttributionCapture: () => undefined }))
vi.mock('@/components/analytics/use-purchase-return', () => ({ usePurchaseReturn: () => undefined }))
vi.mock('@/lib/analytics-config', () => ({
  GA_MEASUREMENT_ID: null,
  META_PIXEL_ID: '123456789012345',
  isMeasurementSurface: () => true,
}))

import { AnalyticsLoader } from './analytics-loader'

const PIXEL_ID = '123456789012345'
let pixel: ReturnType<typeof vi.fn>

beforeEach(() => {
  document.cookie = `${CONSENT_COOKIE}=; max-age=0; path=/`
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({
    v: CONSENT_VERSION,
    necessary: true,
    analytics: false,
    marketing: true,
  }))}; path=/`
  pixel = vi.fn()
  Object.defineProperty(window, 'fbq', { configurable: true, value: pixel })
  resetVendor('meta')
})

afterEach(() => {
  cleanup()
  resetVendor('meta')
  vi.restoreAllMocks()
  Object.defineProperty(window, 'fbq', { configurable: true, value: undefined })
})

describe('AnalyticsLoader Meta Pixel initialization', () => {
  it('disables automatic configuration before initializing the Pixel', async () => {
    render(<AnalyticsLoader />)

    await waitFor(() => expect(pixel).toHaveBeenCalledWith('init', PIXEL_ID))

    expect(pixel.mock.calls.slice(0, 2)).toEqual([
      ['set', 'autoConfig', false, PIXEL_ID],
      ['init', PIXEL_ID],
    ])
  })
})
