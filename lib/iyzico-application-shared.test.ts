import { describe, expect, it } from 'vitest'
import {
  buildApplicationEmail,
  escapeHtml,
  evaluateSiteReadiness,
  hasPlaceholder,
  validateApplicationInput,
} from '@/lib/iyzico-application-shared'
import type { WebsiteSchema } from '@/lib/website-schema'

const site = (sections: unknown[]): WebsiteSchema =>
  ({ navigation: { logo: '', links: [] }, theme: {}, sections } as unknown as WebsiteSchema)

const store = site([
  { type: 'products', title: 'Ürünler', items: [] },
  { type: 'about', title: 'Hakkımızda', body: 'Yıllardır el yapımı ürünler üretiyoruz.' },
  { type: 'contact', title: 'İletişim', email: 'info@ornek.com', phone: '05320000000', address: 'Kadıköy, İstanbul' },
  { type: 'footer', text: 'x' },
])

const okProbe = { status: 200, finalUrl: 'https://magaza.gloval.site/' }

describe('hasPlaceholder', () => {
  it('detects bracketed template leftovers', () => {
    expect(hasPlaceholder('Adres: [Adres]')).toBe(true)
    expect(hasPlaceholder('Adres: Kadıköy')).toBe(false)
  })
})

describe('evaluateSiteReadiness', () => {
  it('flags an unpublished site and skips live checks', () => {
    const items = evaluateSiteReadiness({ published: false, slug: null, probe: null, schema: store, siteName: 'Mağaza' })
    expect(items.find((i) => i.id === 'published')).toMatchObject({ ok: false, problem: 'not_published' })
    expect(items.find((i) => i.id === 'reachable')).toMatchObject({ ok: false, problem: 'unchecked' })
  })

  it('passes the live checks for a reachable https site', () => {
    const items = evaluateSiteReadiness({ published: true, slug: 'magaza', probe: okProbe, schema: store, siteName: 'Mağaza' })
    for (const id of ['published', 'reachable', 'https', 'about', 'contact', 'footer']) {
      expect(items.find((i) => i.id === id)?.ok, id).toBe(true)
    }
  })

  it('reports an unreachable site and a non-https final URL', () => {
    const down = evaluateSiteReadiness({ published: true, slug: 'm', probe: { status: null, finalUrl: null }, schema: store, siteName: 'M' })
    expect(down.find((i) => i.id === 'reachable')?.problem).toBe('unreachable')
    const http = evaluateSiteReadiness({ published: true, slug: 'm', probe: { status: 200, finalUrl: 'http://m.gloval.site/' }, schema: store, siteName: 'M' })
    expect(http.find((i) => i.id === 'https')?.problem).toBe('not_https')
  })

  it('flags missing, hidden and placeholder sections', () => {
    const broken = site([
      { type: 'products', title: 'Ürünler', items: [] },
      { type: 'about', title: 'Hakkımızda', body: 'Kısa metin burada yazıyor.', hidden: true },
      { type: 'contact', title: 'İletişim', address: '[Adres]' },
    ])
    const items = evaluateSiteReadiness({ published: true, slug: 'm', probe: okProbe, schema: broken, siteName: 'M' })
    expect(items.find((i) => i.id === 'about')?.problem).toBe('hidden')
    expect(items.find((i) => i.id === 'contact')?.problem).toBe('placeholder')
    expect(items.find((i) => i.id === 'footer')?.problem).toBe('missing')
  })

  it('reports a hidden footer', () => {
    const hidden = site([
      { type: 'products', title: 'Ürünler', items: [] },
      { type: 'footer', text: 'x', hidden: true },
    ])
    const items = evaluateSiteReadiness({ published: true, slug: 'm', probe: okProbe, schema: hidden, siteName: 'M' })
    expect(items.find((i) => i.id === 'footer')?.problem).toBe('footer_hidden')
  })

  it('catches template placeholders in the legal pages', () => {
    const items = evaluateSiteReadiness({ published: true, slug: 'm', probe: okProbe, schema: store, siteName: 'M' })
    const privacy = items.find((i) => i.id === 'privacy')
    expect(privacy?.ok).toBe(false)
    expect(privacy?.problem).toBe('placeholder')
  })
})

describe('validateApplicationInput', () => {
  const base = { name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', phone: '0532 000 00 00' }
  it('accepts and normalizes valid input', () => {
    expect(validateApplicationInput(base)).toEqual({
      ok: true,
      value: { name: 'Ayşe Yılmaz', email: 'ayse@ornek.com', phone: '+905320000000' },
    })
  })
  it('rejects bad name, email and phone', () => {
    expect(validateApplicationInput({ ...base, name: 'Ayşe' })).toEqual({ ok: false, error: 'invalid_name' })
    expect(validateApplicationInput({ ...base, email: 'x' })).toEqual({ ok: false, error: 'invalid_email' })
    expect(validateApplicationInput({ ...base, phone: '123' })).toEqual({ ok: false, error: 'invalid_phone' })
    expect(validateApplicationInput({ ...base, name: 42 })).toEqual({ ok: false, error: 'invalid_name' })
  })
})

describe('buildApplicationEmail', () => {
  it('escapes user input and keeps the subject on one line', () => {
    const mail = buildApplicationEmail({
      name: '<b>Ayşe</b> Y',
      email: 'a@b.co',
      phone: '+905320000000',
      siteName: 'Mağaza\nBcc: x',
      siteUrl: 'https://m.gloval.site',
      projectId: 'p1',
    })
    expect(mail.html).not.toContain('<b>')
    expect(mail.html).toContain('&lt;b&gt;')
    expect(mail.subject).not.toMatch(/[\r\n]/)
  })
  it('escapeHtml covers quotes', () => {
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;')
  })
})
