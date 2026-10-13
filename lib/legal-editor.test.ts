import { describe, expect, it } from 'vitest'
import {
  applyMarkupFormat,
  companyFieldOperation,
  legalDocStatus,
  legalEditorStartText,
  resetLegalDocOperation,
  saveLegalDocOperation,
  storeSellerGaps,
  toggleLegalDocHiddenOperation,
} from './legal-editor'
import { isSafeLegalHref, parseInline, sanitizeLegalMarkup } from './legal-markup'
import type { WebsiteSchema } from './website-schema'

function makeSite(extra: Record<string, unknown> = {}, store = false): WebsiteSchema {
  return {
    meta: { name: 'Acme', language: 'tr' },
    sections: [{ type: 'hero' }, store ? { type: 'products' } : { type: 'about' }, { type: 'footer' }],
    ...extra,
  } as unknown as WebsiteSchema
}

describe('legal editor status and operations', () => {
  it('reports template, custom and hidden, with hidden winning', () => {
    expect(legalDocStatus(makeSite(), 'gizlilik-politikasi')).toBe('template')
    const custom = makeSite({
      legalDocs: { docs: { 'gizlilik-politikasi': { body: 'Merhaba', updatedAt: '2025-01-01' } } },
    })
    expect(legalDocStatus(custom, 'gizlilik-politikasi')).toBe('custom')
    const both = makeSite({
      legalDocs: {
        docs: { 'gizlilik-politikasi': { body: 'Merhaba', updatedAt: '2025-01-01' } },
        hidden: ['gizlilik-politikasi'],
      },
    })
    expect(legalDocStatus(both, 'gizlilik-politikasi')).toBe('hidden')
  })

  it('does not freeze an untouched template as an owner edit', () => {
    const site = makeSite()
    const start = legalEditorStartText(site, 'Acme', 'gizlilik-politikasi')
    expect(start.length).toBeGreaterThan(0)
    expect(saveLegalDocOperation(site, 'Acme', 'gizlilik-politikasi', start)).toBeNull()
    expect(saveLegalDocOperation(site, 'Acme', 'gizlilik-politikasi', `${start}\n\nEk not`)).toEqual({
      op: 'updateLegalDoc',
      slug: 'gizlilik-politikasi',
      body: sanitizeLegalMarkup(`${start}\n\nEk not`),
    })
  })

  it('strips html from saved text and refuses empty text', () => {
    const site = makeSite()
    const op = saveLegalDocOperation(site, 'Acme', 'gizlilik-politikasi', 'Selam <script>alert(1)</script>dünya')
    expect(op && 'body' in op ? op.body : '').not.toMatch(/[<>]/)
    expect(saveLegalDocOperation(site, 'Acme', 'gizlilik-politikasi', '   ')).toBeNull()
  })

  it('offers reset only for edited docs', () => {
    expect(resetLegalDocOperation(makeSite(), 'gizlilik-politikasi')).toBeNull()
    const custom = makeSite({
      legalDocs: { docs: { 'gizlilik-politikasi': { body: 'X', updatedAt: '2025-01-01' } } },
    })
    expect(resetLegalDocOperation(custom, 'gizlilik-politikasi')).toEqual({
      op: 'resetLegalDoc',
      slug: 'gizlilik-politikasi',
    })
  })

  it('never lets a store hide the docs its checkout requires', () => {
    const store = makeSite({}, true)
    expect(toggleLegalDocHiddenOperation(store, 'mesafeli-satis-sozlesmesi')).toBeNull()
    expect(toggleLegalDocHiddenOperation(makeSite(), 'gizlilik-politikasi')).toEqual({
      op: 'setLegalDocHidden',
      slug: 'gizlilik-politikasi',
      hidden: true,
    })
  })

  it('wraps a company field into an updateCompany patch', () => {
    expect(companyFieldOperation('tradeName', 'Acme Ltd.')).toEqual({
      op: 'updateCompany',
      patch: { tradeName: 'Acme Ltd.' },
    })
  })
})

describe('storeSellerGaps', () => {
  it('is empty for non-store sites', () => {
    expect(storeSellerGaps(makeSite(), 'Acme')).toEqual([])
  })

  it('lists missing seller fields for a store and shrinks as they are filled', () => {
    const empty = storeSellerGaps(makeSite({}, true), 'Acme')
    expect(empty.length).toBeGreaterThan(0)
    const filled = storeSellerGaps(
      makeSite(
        {
          company: {
            tradeName: 'Acme Ltd. Şti.',
            taxId: '1234567890',
            taxOffice: 'Kadıköy',
            phone: '0532 555 12 34',
            email: 'info@acme.com',
            city: 'İstanbul',
            district: 'Kadıköy',
            addressLine: 'Bağdat Cd. 1',
          },
        },
        true,
      ),
      'Acme',
    )
    expect(filled.length).toBeLessThan(empty.length)
  })
})

describe('markup toolbar', () => {
  it('wraps the selection in bold and keeps it selected', () => {
    const r = applyMarkupFormat('Merhaba dünya', 8, 13, 'bold')
    expect(r.text).toBe('Merhaba **dünya**')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('dünya')
  })

  it('inserts a link and selects the url placeholder', () => {
    const r = applyMarkupFormat('Bkz: kargo', 5, 10, 'link')
    expect(r.text).toBe('Bkz: [kargo](https://)')
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('https://')
  })

  it('toggles heading and bullet markers on whole lines', () => {
    const on = applyMarkupFormat('Başlık\nGövde', 0, 0, 'heading')
    expect(on.text).toBe('## Başlık\nGövde')
    expect(applyMarkupFormat(on.text, 0, 0, 'heading').text).toBe('Başlık\nGövde')
    expect(applyMarkupFormat('bir\niki', 0, 7, 'bullet').text).toBe('- bir\n- iki')
  })
})

describe('legal markup links', () => {
  it('accepts web, mail, phone and same-site links only', () => {
    expect(isSafeLegalHref('https://acme.com/x')).toBe(true)
    expect(isSafeLegalHref('mailto:a@acme.com')).toBe(true)
    expect(isSafeLegalHref('/yasal/gizlilik-politikasi')).toBe(true)
    expect(isSafeLegalHref('javascript:alert(1)')).toBe(false)
    expect(isSafeLegalHref('//evil.com')).toBe(false)
    expect(isSafeLegalHref('data:text/html,x')).toBe(false)
  })

  it('renders an unsafe link as plain text and a safe one with its href', () => {
    expect(parseInline('[kötü](javascript:alert)')).toEqual([{ text: 'kötü', bold: false }])
    expect(parseInline('[iyi](https://acme.com)')).toEqual([{ text: 'iyi', bold: false, href: 'https://acme.com' }])
  })
})
