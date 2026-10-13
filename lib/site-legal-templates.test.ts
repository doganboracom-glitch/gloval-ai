import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FOOTER_LEGAL_DOCS, validateFooterHref, legalDocPath } from './footer-links'
import {
  SITE_LEGAL_BUILDERS,
  SITE_LEGAL_DISCLAIMER,
  companyDetailsLine,
  companyFromSite,
  getSiteLegalDoc,
} from './site-legal-templates'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('site legal templates', () => {
  it('has a template for every footer legal doc, and nothing else', () => {
    expect(Object.keys(SITE_LEGAL_BUILDERS).sort()).toEqual(
      FOOTER_LEGAL_DOCS.map((d) => d.slug).sort(),
    )
    for (const d of FOOTER_LEGAL_DOCS) {
      expect(validateFooterHref(legalDocPath(d.slug)).ok).toBe(true)
      const doc = getSiteLegalDoc(d.slug, 'Acme')
      expect(doc?.sections.length).toBeGreaterThan(0)
    }
  })

  it('returns null for unknown or prototype-like slugs', () => {
    expect(getSiteLegalDoc('nope', 'Acme')).toBeNull()
    expect(getSiteLegalDoc('constructor', 'Acme')).toBeNull()
    expect(getSiteLegalDoc('__proto__', 'Acme')).toBeNull()
  })

  it('fills company details from the contact section and omits unknown fields', () => {
    const company = companyFromSite('Acme Ltd', [
      { type: 'hero' },
      { type: 'contact', address: 'Bağdat Cd. 1, İstanbul', phone: '+90 532 000 00 00', email: 'a@acme.com' },
    ])
    const text = JSON.stringify(getSiteLegalDoc('mesafeli-satis-sozlesmesi', company))
    expect(text).toContain('Acme Ltd')
    expect(text).toContain('Bağdat Cd. 1, İstanbul')
    expect(text).toContain('a@acme.com')
    expect(text).not.toContain('Vergi No')
    expect(companyDetailsLine({ name: 'X', taxNo: '123', mersis: '456' })).toContain('MERSİS No: 456')
  })

  it('falls back to a generic seller line without contact details', () => {
    const text = JSON.stringify(getSiteLegalDoc('mesafeli-satis-sozlesmesi', 'Acme'))
    expect(text).toContain('mağazanın iletişim bölümünde')
  })

  it('keeps a permanent template warning rendered on the legal page', () => {
    expect(SITE_LEGAL_DISCLAIMER).toContain('Bu metin şablondur')
    const page = read('app/site/[slug]/yasal/[doc]/page.tsx')
    expect(page).toContain('SITE_LEGAL_DISCLAIMER')
    expect(page).toContain('data-legal-disclaimer')
  })

  it('has a single source: no other file defines legal builders', () => {
    expect(read('lib/store-legal.ts')).not.toContain('paragraphs')
    const page = read('app/site/[slug]/yasal/[doc]/page.tsx')
    expect(page).toContain("'@/lib/site-legal-templates'")
  })
})
