import { beforeAll, describe, expect, it } from 'vitest'
import sitemap from './sitemap'
import robots from './robots'
import { GUIDES } from '@/lib/content/guides'

const PRIVATE_PREFIXES = ['/dashboard', '/editor', '/ecommerce', '/billing', '/admin', '/auth', '/api', '/site', '/demo', '/og']

describe('platform sitemap', () => {
  let entries: Awaited<ReturnType<typeof sitemap>> = []
  beforeAll(async () => {
    entries = await sitemap()
  })

  it('lists the marketing pages on the platform host only', () => {
    const urls = entries.map((e) => e.url)
    for (const path of ['/', '/blog', '/sss', '/iletisim']) {
      expect(urls).toContain(`https://gloval.ai${path}`)
    }
    for (const url of urls) {
      expect(url.startsWith('https://gloval.ai')).toBe(true)
      expect(url).not.toContain('gloval.site')
      expect(url).not.toContain('#')
    }
  })

  it('includes the guide index and all eight articles with English alternates', () => {
    const guideEntries = entries.filter((entry) => {
      const path = new URL(entry.url).pathname
      return path === '/sss/rehber' || path.startsWith('/sss/rehber/')
    })

    expect(guideEntries).toHaveLength(GUIDES.length + 1)
    for (const path of ['/sss/rehber', ...GUIDES.map(({ slug }) => `/sss/rehber/${slug}`)]) {
      const entry = guideEntries.find((item) => new URL(item.url).pathname === path)
      expect(entry?.url).toBe(`https://gloval.ai${path}`)
      expect(entry?.alternates?.languages).toMatchObject({
        'tr-TR': `https://gloval.ai${path}`,
        en: `https://gloval.ai${path}?lang=en`,
        'x-default': `https://gloval.ai${path}`,
      })
    }
  })

  it('never exposes private, tenant, demo or image routes', () => {
    for (const { url } of entries) {
      const path = new URL(url).pathname
      for (const prefix of PRIVATE_PREFIXES) {
        expect(path === prefix || path.startsWith(`${prefix}/`)).toBe(false)
      }
    }
  })

  it('has unique URLs and hreflang alternates including x-default', () => {
    const urls = entries.map((e) => e.url)
    expect(new Set(urls).size).toBe(urls.length)
    for (const entry of entries) {
      const languages = entry.alternates?.languages as Record<string, string>
      expect(languages['x-default']).toBe(entry.url)
      expect(languages['tr-TR']).toBe(entry.url)
      if (languages.en) expect(languages.en).toBe(`${entry.url}?lang=en`)
    }
  })

  it('does not stamp pages without a real modification date as modified now', () => {
    const home = entries.find((e) => e.url === 'https://gloval.ai/')
    expect(home?.lastModified).toBeUndefined()
  })
})

describe('platform robots', () => {
  const config = robots()
  const rules = Array.isArray(config.rules) ? config.rules : [config.rules]
  const disallowed = rules.flatMap((r) => (Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []))

  it('points to the platform sitemap', () => {
    expect(String(config.sitemap)).toBe('https://gloval.ai/sitemap.xml')
  })

  it('keeps private areas disallowed and share images crawlable', () => {
    const normalized = disallowed.map((d) => d.replace(/\/$/, ''))
    for (const prefix of ['/dashboard', '/editor', '/ecommerce', '/billing', '/admin', '/auth', '/api', '/site']) {
      expect(normalized).toContain(prefix)
    }
    expect(disallowed.some((d) => d === '/' || d.startsWith('/og'))).toBe(false)
  })
})
