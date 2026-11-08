import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COMPANY } from '@/lib/legal/company'

const mocks = vi.hoisted(() => ({ resolveAdsViewerAccess: vi.fn() }))

vi.mock('@/lib/ads/viewer-access', () => ({
  resolveAdsViewerAccess: mocks.resolveAdsViewerAccess,
}))
vi.mock('@/lib/ads/env', () => ({
  resolveMetaAdsAccessMode: () => 'open',
}))
vi.mock('@/components/language-provider', async () => {
  const { dictionary } = await import('@/lib/i18n')
  return { useLanguage: () => ({ lang: 'tr', t: dictionary.tr }) }
})
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/brand-logo', () => ({ BrandLogo: () => null }))
vi.mock('@/components/payment-badges', () => ({ PaymentBadges: () => null }))
vi.mock('@/components/ads/ads-address-form', () => ({ AdsAddressForm: () => null }))
vi.mock('@/components/ads/ads-platform-grid', () => ({ AdsPlatformGrid: () => null }))
vi.mock('@/components/ads/ads-product-switch', () => ({ AdsProductSwitch: () => null }))
vi.mock('@/components/ads/sections/ads-credits-section', () => ({ AdsCreditsSection: () => null }))
vi.mock('@/components/ads/sections/ads-example-preview', () => ({ AdsExamplePreviewSection: () => null }))
vi.mock('@/components/ads/sections/ads-faq-section', () => ({ AdsFaqSection: () => null }))
vi.mock('@/components/ads/sections/ads-how-it-works', () => ({ AdsHowItWorksSection: () => null }))
vi.mock('@/components/ads/sections/ads-trust-section', () => ({ AdsTrustSection: () => null }))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import AdsPage from './page'

afterEach(() => {
  vi.unstubAllEnvs()
  mocks.resolveAdsViewerAccess.mockReset()
})

describe('/ads server-rendered company disclosure', () => {
  it('includes official company details in the initial HTML when the feature is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ADS_FEATURE_UI', '1')
    mocks.resolveAdsViewerAccess.mockResolvedValue({})

    const page = await AdsPage()
    const html = renderToStaticMarkup(page)

    expect(html).toContain('data-testid="company-disclosure"')
    expect(html).toContain(COMPANY.legalName)
    expect(html).toContain(COMPANY.taxNumber)
    expect(html).toContain(COMPANY.address)
    expect(html).toContain(COMPANY.supportEmail)
    expect(html).not.toContain(String.fromCodePoint(0xfffd))
  })
})
