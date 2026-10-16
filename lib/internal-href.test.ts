import { describe, expect, it } from 'vitest'
import { normalizeInternalHref } from '@/lib/internal-href'
import { isBlogHref, withoutBlogLinks } from '@/lib/blog-site'

describe('normalizeInternalHref', () => {
  const slugs = ['hakkimizda', 'iletisim']

  it('makes known relative targets absolute', () => {
    expect(normalizeInternalHref('blog')).toBe('/blog')
    expect(normalizeInternalHref('./store?x=1')).toBe('/store?x=1')
    expect(normalizeInternalHref('hakkimizda', slugs)).toBe('/hakkimizda')
    expect(normalizeInternalHref('Hakkimizda/ekip', slugs)).toBe('/Hakkimizda/ekip')
  })

  it('leaves everything else untouched', () => {
    for (const href of ['', '/blog', '#hizmetler', 'https://example.com', 'mailto:a@b.co', 'tel:+905321234567', 'bilinmeyen']) {
      expect(normalizeInternalHref(href, slugs)).toBe(href)
    }
  })
})

describe('blog link de-duplication', () => {
  it('recognises hand-written blog targets', () => {
    for (const href of ['blog', '/blog', './blog/', '#blog', ' /Blog ']) expect(isBlogHref(href)).toBe(true)
    for (const href of ['/blog/yazi', '/blogger', 'https://x.com/blog']) expect(isBlogHref(href)).toBe(false)
  })

  it('drops only the blog links', () => {
    const links = [{ href: '/' }, { href: 'blog' }, { href: '/iletisim' }]
    expect(withoutBlogLinks(links)).toEqual([{ href: '/' }, { href: '/iletisim' }])
  })
})
