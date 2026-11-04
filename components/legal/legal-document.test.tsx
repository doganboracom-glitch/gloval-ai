import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getLegalDoc } from '@/lib/legal/documents'

const mocks = vi.hoisted(() => ({ lang: 'tr' as 'tr' | 'en' }))

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({
    lang: mocks.lang,
    t: { nav: { backHome: mocks.lang === 'tr' ? 'Ana sayfaya dön' : 'Back to home' } },
  }),
}))
vi.mock('@/components/site-header', () => ({ SiteHeader: () => null }))
vi.mock('@/components/site-footer', () => ({ SiteFooter: () => null }))

import { LegalDocument } from '@/components/legal/legal-document'

const privacyDoc = getLegalDoc('gizlilik-politikasi')
if (!privacyDoc) throw new Error('Privacy policy document is unavailable')

describe('Google Ads privacy section anchor', () => {
  it.each([
    ['tr', 'Google Ads verileri (GLOVAL Ads)'],
    ['en', 'Google Ads data (GLOVAL Ads)'],
  ] as const)('renders one anchored heading in %s', (locale, heading) => {
    mocks.lang = locale
    const markup = renderToStaticMarkup(<LegalDocument doc={privacyDoc} />)
    const ids = markup.match(/id="google-ads-verileri"/g) ?? []
    const targetHeadings = markup.match(/<h2\b[^>]*id="google-ads-verileri"[^>]*>[\s\S]*?<\/h2>/g) ?? []
    expect(ids).toHaveLength(1)
    expect(targetHeadings).toHaveLength(1)
    expect(targetHeadings[0]).toContain(heading)
    expect(targetHeadings[0]).toContain('scroll-mt-16')
  })
})
