import { describe, expect, it } from 'vitest'
import {
  PAGE_SLUG_MAX,
  RESERVED_PAGE_SLUGS,
  collectSlugRedirects,
  isReservedPageSlug,
  slugifyPageSlug,
  uniquePageSlug,
} from '@/lib/page-slugs'

describe('page slug rules', () => {
  it('folds Turkish characters, lowercases and hyphenates', () => {
    expect(slugifyPageSlug('Hakkımızda')).toBe('hakkimizda')
    expect(slugifyPageSlug('Çalışma Saatleri & İletişim')).toBe('calisma-saatleri-iletisim')
    expect(slugifyPageSlug('  Öğün   Şefi  ')).toBe('ogun-sefi')
  })

  it('caps the slug at 60 characters without a trailing hyphen', () => {
    const slug = slugifyPageSlug('a'.repeat(40) + ' ' + 'b'.repeat(40))
    expect(slug.length).toBeLessThanOrEqual(PAGE_SLUG_MAX)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('reserves the platform routes', () => {
    for (const reserved of ['store', 'blog', 'checkout', 'order', 'hesap', 'yasal', 'api', 'site', 'sitemap.xml', 'robots.txt']) {
      expect(RESERVED_PAGE_SLUGS.has(reserved)).toBe(true)
    }
    expect(isReservedPageSlug('store')).toBe(true)
    expect(isReservedPageSlug('hakkimizda')).toBe(false)
  })

  it('appends -2, -3 on a collision or a reserved word', () => {
    expect(uniquePageSlug('Hakkımızda', [])).toBe('hakkimizda')
    expect(uniquePageSlug('Hakkımızda', ['hakkimizda'])).toBe('hakkimizda-2')
    expect(uniquePageSlug('Hakkımızda', ['hakkimizda', 'hakkimizda-2'])).toBe('hakkimizda-3')
    expect(uniquePageSlug('Store', [])).toBe('store-2')
    expect(uniquePageSlug('API', [])).toBe('api-2')
  })

  it('keeps the suffixed slug within the length cap', () => {
    const long = 'x'.repeat(80)
    const first = uniquePageSlug(long, [])
    const second = uniquePageSlug(long, [first])
    expect(second.length).toBeLessThanOrEqual(PAGE_SLUG_MAX)
    expect(second.endsWith('-2')).toBe(true)
  })
})

describe('slug change redirects (301)', () => {
  it('leaves a redirect behind for a renamed page', () => {
    expect(
      collectSlugRedirects(
        [{ slug: 'home', isHome: true }, { slug: 'hakkimizda' }],
        [{ slug: 'home', isHome: true }, { slug: 'biz-kimiz' }],
      ),
    ).toEqual([{ from: '/hakkimizda', to: '/biz-kimiz' }])
  })

  it('never redirects the home page or an unchanged slug', () => {
    expect(
      collectSlugRedirects(
        [{ slug: 'home', isHome: true }, { slug: 'iletisim' }],
        [{ slug: 'anasayfa', isHome: true }, { slug: 'iletisim' }],
      ),
    ).toEqual([])
  })

  it('does not redirect from a slug that is still live', () => {
    expect(
      collectSlugRedirects(
        [{ slug: 'a' }, { slug: 'b' }],
        [{ slug: 'b' }, { slug: 'a' }],
      ),
    ).toEqual([])
  })
})
