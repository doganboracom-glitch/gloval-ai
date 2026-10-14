import { describe, expect, it } from 'vitest'
import nextConfig from '@/next.config.mjs'
import { LEGAL_DOC_ENTRIES } from '@/lib/legal-editor'
import { FOOTER_LEGAL_DOCS, STORE_ESSENTIAL_LEGAL_SLUGS } from '@/lib/footer-links'
import {
  customLegalBody,
  isLegalDocHidden,
  isSiteLegalSlug,
  legalSlugKeys,
  REQUIRED_STORE_LEGAL,
} from '@/lib/site-legal-docs'
import type { WebsiteSchema } from '@/lib/website-schema'

const site = (legalDocs: WebsiteSchema['legalDocs']) => ({ sections: [], pages: [], legalDocs }) as unknown as WebsiteSchema

describe('"Teslimat ve İade" address', () => {
  it('lives under the new slug everywhere owners see it', () => {
    expect(isSiteLegalSlug('teslimat-ve-iade')).toBe(true)
    expect(isSiteLegalSlug('iptal-ve-iade')).toBe(false)
    expect(LEGAL_DOC_ENTRIES.map((e) => e.slug)).toContain('teslimat-ve-iade')
    expect(LEGAL_DOC_ENTRIES.map((e) => e.slug)).not.toContain('iptal-ve-iade')
    expect(FOOTER_LEGAL_DOCS.map((d) => d.slug)).toContain('teslimat-ve-iade')
    expect(STORE_ESSENTIAL_LEGAL_SLUGS).toContain('teslimat-ve-iade')
    expect(REQUIRED_STORE_LEGAL).toContain('teslimat-ve-iade')
  })

  it('the old tenant address redirects permanently to the new one', async () => {
    const redirects = await nextConfig.redirects()
    expect(redirects).toContainEqual({
      source: '/site/:slug/yasal/iptal-ve-iade',
      destination: '/site/:slug/yasal/teslimat-ve-iade',
      permanent: true,
    })
  })

  it('does not redirect the platform’s own /yasal/iptal-ve-iade document', async () => {
    const redirects = await nextConfig.redirects()
    expect(redirects.some((r: { source: string }) => r.source === '/yasal/iptal-ve-iade')).toBe(false)
  })

  it('edits and hidden flags saved under the old slug still apply', () => {
    expect(legalSlugKeys('teslimat-ve-iade')).toEqual(['teslimat-ve-iade', 'iptal-ve-iade'])
    const s = site({
      docs: { 'iptal-ve-iade': { body: 'Eski özel metin', updatedAt: '2025-01-01T00:00:00.000Z' } },
      hidden: [],
    })
    expect(customLegalBody(s, 'teslimat-ve-iade')?.body).toBe('Eski özel metin')
    const hidden = site({ docs: {}, hidden: ['iptal-ve-iade'] })
    expect(isLegalDocHidden(hidden, 'teslimat-ve-iade')).toBe(true)
  })

  it('the new slug wins over a legacy entry', () => {
    const s = site({
      docs: {
        'iptal-ve-iade': { body: 'eski', updatedAt: '2025-01-01T00:00:00.000Z' },
        'teslimat-ve-iade': { body: 'yeni', updatedAt: '2025-02-01T00:00:00.000Z' },
      },
      hidden: [],
    })
    expect(customLegalBody(s, 'teslimat-ve-iade')?.body).toBe('yeni')
  })
})
