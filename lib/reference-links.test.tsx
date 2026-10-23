import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { ReferenceLogo } from '@/components/website-renderer/sections/reference-logo'
import { ReferencesFields, REFERENCES_COPY } from '@/components/editor/references-fields'
import { applyOperation } from '@/lib/website-edit-operations'
import {
  safeReferenceUrl,
  sanitizeReferenceUrls,
  syncReferencesPage,
  validateReferenceUrl,
  type ReferenceItem,
} from '@/lib/references'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'

type RefSection = Extract<WebsiteSchema['sections'][number], { type: 'references' }>

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const item = (name: string, url?: string, withLogo = true): ReferenceItem =>
  ({ name, ...(withLogo ? { logo: { src: PNG } } : {}), ...(url === undefined ? {} : { url }) }) as ReferenceItem

function siteWith(items: ReferenceItem[], patch: Partial<RefSection> = {}): WebsiteSchema {
  const base = fallbackWebsite('kurumsal firma', 'tr')
  base.sections = [
    ...base.sections.filter((s) => s.type !== 'references'),
    { type: 'references', title: 'Referanslar', items, pageEnabled: true, linkEnabled: true, ...patch } as RefSection,
  ]
  return syncReferencesPage(base)
}

const renderHome = (site: WebsiteSchema) => renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting />)
const renderPage = (site: WebsiteSchema) =>
  renderToStaticMarkup(<WebsiteRenderer site={site} pageRouting initialPage="referanslar" />)
const logoMarkup = (it: ReferenceItem, index = 0, lang: 'tr' | 'en' = 'tr') =>
  renderToStaticMarkup(<ReferenceLogo item={it} index={index} lang={lang} />)

const anchorOf = (html: string) => /<a [^>]*data-reference-link[^>]*>/.exec(html)?.[0] ?? ''

describe('link: logo is a real, safe anchor', () => {
  const html = logoMarkup(item('Acme Ltd', 'acme.com.tr'))
  const a = anchorOf(html)

  it('renders <a href target="_blank" rel="noopener noreferrer nofollow">', () => {
    expect(a).toContain('href="https://acme.com.tr"')
    expect(a).toContain('target="_blank"')
    expect(a).toContain('rel="noopener noreferrer nofollow"')
  })

  it('keeps an explicit http/https address and its path', () => {
    expect(anchorOf(logoMarkup(item('A', 'http://acme.com/hakkimizda')))).toContain('href="http://acme.com/hakkimizda"')
  })
})

describe('link: aria-label', () => {
  it('uses "<isim> web sitesi (yeni sekmede açılır)"', () => {
    expect(anchorOf(logoMarkup(item('Acme Ltd', 'acme.com')))).toContain(
      'aria-label="Acme Ltd web sitesi (yeni sekmede açılır)"',
    )
  })

  it('falls back to "Referans N" for an unnamed logo', () => {
    expect(anchorOf(logoMarkup(item('', 'acme.com'), 2))).toContain('aria-label="Referans 3 web sitesi (yeni sekmede açılır)"')
  })

  it('is localised on English sites', () => {
    expect(anchorOf(logoMarkup(item('Acme', 'acme.com'), 0, 'en'))).toContain('aria-label="Acme website (opens in a new tab)"')
  })
})

describe('link: empty or invalid url is NOT a link and the markup is unchanged', () => {
  const baseline = logoMarkup(item('Acme Ltd'))

  it.each([['empty string', ''], ['whitespace', '   '], ['javascript:', 'javascript:alert(1)'], ['localhost', 'http://localhost:3000']])(
    '%s renders the exact same HTML as a logo with no url',
    (_label, url) => {
      const html = logoMarkup(item('Acme Ltd', url))
      expect(html).not.toContain('<a ')
      expect(html).not.toContain('data-reference-link')
      expect(html).toBe(baseline)
    },
  )

  it('the plate itself is the root element (no wrapper was added)', () => {
    expect(baseline.startsWith('<div class="flex aspect-[2/1]')).toBe(true)
  })

  it('a home section without any address has no anchors around logos', () => {
    const html = renderHome(siteWith([item('A'), item('B', ''), item('C', 'data:text/html,x')]))
    expect(html).not.toContain('data-reference-link')
  })
})

describe('link: carousel and /referanslar use the same anchor', () => {
  const linked = siteWith(
    Array.from({ length: 8 }, (_, i) => item(`Firma ${i + 1}`, i === 0 ? 'firma1.com' : undefined)),
  )

  it('the home carousel links the logo (visible copy and aria-hidden duplicate)', () => {
    const html = renderHome(linked)
    const anchors = [...html.matchAll(/<a [^>]*data-reference-link[^>]*>/g)].map((m) => m[0])
    expect(anchors).toHaveLength(2)
    for (const a of anchors) {
      expect(a).toContain('href="https://firma1.com"')
      expect(a).toContain('target="_blank"')
      expect(a).toContain('rel="noopener noreferrer nofollow"')
      expect(a).toContain('aria-label="Firma 1 web sitesi (yeni sekmede açılır)"')
    }
    expect(anchors.filter((a) => a.includes('tabindex="-1"'))).toHaveLength(1)
  })

  it('/referanslar shows the same anchor, and only for the logo that has an address', () => {
    const html = renderPage(linked)
    const anchors = [...html.matchAll(/<a [^>]*data-reference-link[^>]*>/g)].map((m) => m[0])
    expect(anchors).toHaveLength(1)
    expect(anchors[0]).toContain('href="https://firma1.com"')
    expect(anchors[0]).toContain('target="_blank"')
    expect(anchors[0]).toContain('rel="noopener noreferrer nofollow"')
    expect(anchors[0]).toContain('aria-label="Firma 1 web sitesi (yeni sekmede açılır)"')
  })

  it('/referanslar without addresses has no anchors', () => {
    expect(renderPage(siteWith([item('A'), item('B')]))).not.toContain('data-reference-link')
  })

  it('a stored forbidden address is never rendered as a link, on either surface', () => {
    const bad = siteWith([item('Evil', 'x')])
    const section = bad.sections.at(-1) as RefSection
    section.items[0].url = 'javascript:alert(1)'
    expect(renderHome(bad)).not.toContain('data-reference-link')
    expect(renderPage(bad)).not.toContain('data-reference-link')
    expect(renderHome(bad)).not.toContain('javascript:')
  })
})

describe('link: fake addresses are rejected', () => {
  const rejected: Array<[string, string, string]> = [
    ['javascript:', 'javascript:alert(1)', 'scheme'],
    ['JavaScript: mixed case', 'JaVaScRiPt:alert(1)', 'scheme'],
    ['data:', 'data:text/html;base64,PHNjcmlwdD4=', 'scheme'],
    ['user:pass@host', 'https://user:pass@example.com', 'credentials'],
    ['user@host', 'user@example.com', 'credentials'],
    ['localhost', 'http://localhost', 'local'],
    ['localhost with port', 'localhost:3000', 'local'],
    ['sub.localhost', 'https://app.localhost', 'local'],
    ['192.168.x.x', 'http://192.168.1.10', 'private'],
    ['10.x.x.x', 'https://10.0.0.5', 'private'],
    ['127.0.0.1', 'http://127.0.0.1:8080', 'private'],
    ['172.16.x.x', 'http://172.16.0.1', 'private'],
    ['169.254.x.x (metadata)', 'http://169.254.169.254', 'private'],
    ['IPv6 literal', 'http://[::1]/', 'private'],
    ['ftp:', 'ftp://example.com', 'scheme'],
    ['no dot', 'intranet', 'invalid'],
    ['spaces', 'ornek firma.com', 'invalid'],
    ['too long', `https://example.com/${'a'.repeat(200)}`, 'too_long'],
  ]

  it.each(rejected)('validateReferenceUrl rejects %s', (_label, input, error) => {
    expect(validateReferenceUrl(input)).toEqual({ ok: false, error })
    expect(safeReferenceUrl(input)).toBeNull()
  })

  it('accepts real addresses, adds https:// and treats empty as "no link"', () => {
    expect(validateReferenceUrl('ornek.com')).toEqual({ ok: true, url: 'https://ornek.com' })
    expect(validateReferenceUrl('https://www.ornek.com.tr/hakkimizda')).toEqual({
      ok: true,
      url: 'https://www.ornek.com.tr/hakkimizda',
    })
    expect(validateReferenceUrl('')).toEqual({ ok: true, url: '' })
  })

  it('the edit operation ignores a rejected address and keeps the previous one', () => {
    const site = siteWith([item('Acme', 'acme.com')])
    const idx = site.sections.length - 1
    for (const [, input] of rejected) {
      const next = applyOperation(site, { op: 'updateReference', index: idx, item: 0, patch: { url: input } })
      expect((next.sections[idx] as RefSection).items[0].url).toBe('https://acme.com')
    }
  })

  it('the edit operation normalises a valid address and clears it with an empty string', () => {
    const site = siteWith([item('Acme')])
    const idx = site.sections.length - 1
    const set = applyOperation(site, { op: 'updateReference', index: idx, item: 0, patch: { url: 'acme.com' } })
    expect((set.sections[idx] as RefSection).items[0].url).toBe('https://acme.com')
    const cleared = applyOperation(set, { op: 'updateReference', index: idx, item: 0, patch: { url: '' } })
    expect('url' in (cleared.sections[idx] as RefSection).items[0]).toBe(false)
  })

  it('the server-side sanitizer drops forbidden stored addresses and keeps the object when nothing changes', () => {
    const clean = siteWith([item('Acme', 'acme.com')])
    expect(sanitizeReferenceUrls(clean)).toBe(clean)
    const dirty = siteWith([item('Acme', 'acme.com'), item('Evil')])
    ;(dirty.sections.at(-1) as RefSection).items[1].url = 'http://192.168.0.1'
    const fixed = sanitizeReferenceUrls(dirty)
    expect((fixed.sections.at(-1) as RefSection).items[1].url).toBeUndefined()
    expect((fixed.sections.at(-1) as RefSection).items[0].url).toBe('https://acme.com')
  })
})

describe('link: editor field', () => {
  const site = siteWith([item('Acme', 'acme.com')])
  const html = renderToStaticMarkup(
    <ReferencesFields site={site} index={site.sections.length - 1} section={site.sections.at(-1) as RefSection} onDispatch={() => {}} />,
  )

  it('has an optional website input with a placeholder and the new-tab hint', () => {
    expect(html).toContain('placeholder="ornek.com"')
    expect(html).toContain(REFERENCES_COPY.tr.urlLabel)
    expect(html).toContain(REFERENCES_COPY.tr.urlHint)
  })

  it('has a Turkish warning for every rejection reason', () => {
    const reasons = Object.keys(REFERENCES_COPY.tr.urlErrors).sort()
    expect(reasons).toEqual(['credentials', 'invalid', 'local', 'private', 'scheme', 'too_long'])
    for (const text of Object.values(REFERENCES_COPY.tr.urlErrors)) expect(text.length).toBeGreaterThan(10)
  })
})
