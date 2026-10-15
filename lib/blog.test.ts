import { describe, expect, it } from 'vitest'
import {
  adjacentPosts,
  blogPostingJsonLd,
  buildRss,
  indexablePosts,
  isPostIndexable,
  isPostLive,
  isReservedPostSlug,
  livePosts,
  paginatePosts,
  postDescription,
  relatedPosts,
  sanitizeBlogBody,
  uniquePostSlug,
  type BlogPost,
} from '@/lib/blog'

const NOW = new Date('2026-03-10T12:00:00Z')

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'ilk-yazi',
    title: 'İlk yazı',
    excerpt: null,
    body: '## Başlık\n\nMerhaba **dünya**.',
    keywords: [],
    seoTitle: null,
    metaDescription: null,
    coverUrl: null,
    coverAlt: null,
    status: 'published',
    indexable: true,
    publishedAt: '2026-03-01T00:00:00Z',
    aiGenerated: false,
    personalized: true,
    sample: false,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('post visibility', () => {
  it('shows only published posts whose publish time has arrived', () => {
    expect(isPostLive(post(), NOW)).toBe(true)
    expect(isPostLive(post({ status: 'draft' }), NOW)).toBe(false)
    expect(isPostLive(post({ status: 'scheduled' }), NOW)).toBe(false)
    expect(isPostLive(post({ publishedAt: '2026-03-11T00:00:00Z' }), NOW)).toBe(false)
    expect(isPostLive(post({ publishedAt: null }), NOW)).toBe(false)
    expect(isPostLive(post({ sample: true }), NOW)).toBe(false)
  })

  it('keeps noindex posts live but out of the index set', () => {
    const hidden = post({ slug: 'gizli', indexable: false })
    expect(isPostLive(hidden, NOW)).toBe(true)
    expect(isPostIndexable(hidden, NOW)).toBe(false)
    expect(livePosts([post(), hidden], NOW)).toHaveLength(2)
    expect(indexablePosts([post(), hidden], NOW).map((p) => p.slug)).toEqual(['ilk-yazi'])
  })

  it('orders live posts newest first', () => {
    const older = post({ slug: 'a', publishedAt: '2026-01-01T00:00:00Z' })
    const newer = post({ slug: 'b', publishedAt: '2026-02-01T00:00:00Z' })
    expect(livePosts([older, newer], NOW).map((p) => p.slug)).toEqual(['b', 'a'])
  })
})

describe('slugs', () => {
  it('reserves platform segments including blog', () => {
    for (const slug of ['rss.xml', 'page', 'feed', 'blog']) expect(isReservedPostSlug(slug)).toBe(true)
    expect(isReservedPostSlug('hosgeldiniz')).toBe(false)
  })

  it('suffixes clashes and reserved names', () => {
    expect(uniquePostSlug('Yeni Yazı', [])).toBe('yeni-yazi')
    expect(uniquePostSlug('Yeni Yazı', ['yeni-yazi'])).toBe('yeni-yazi-2')
    expect(uniquePostSlug('Yeni Yazı', ['yeni-yazi', 'yeni-yazi-2'])).toBe('yeni-yazi-3')
    expect(isReservedPostSlug(uniquePostSlug('feed', []))).toBe(false)
  })
})

describe('body and description', () => {
  it('strips raw HTML from the body', () => {
    const clean = sanitizeBlogBody('Merhaba <script>alert(1)</script> **kalın**')
    expect(clean).not.toContain('<script')
    expect(clean).toContain('**kalın**')
  })

  it('prefers explicit descriptions and falls back to plain body text', () => {
    expect(postDescription(post({ metaDescription: 'Özel açıklama' }))).toBe('Özel açıklama')
    expect(postDescription(post({ excerpt: 'Özet' }))).toBe('Özet')
    expect(postDescription(post())).toBe('Başlık Merhaba dünya.')
    const long = postDescription(post({ body: 'a'.repeat(400) }))
    expect(long.length).toBeLessThanOrEqual(160)
    expect(long.endsWith('...')).toBe(true)
  })
})

describe('pagination and neighbours', () => {
  it('returns null outside 1..pageCount', () => {
    expect(paginatePosts(20, undefined)).toMatchObject({ page: 1, pageCount: 3, start: 0, end: 9 })
    expect(paginatePosts(20, '3')).toMatchObject({ page: 3, start: 18, end: 20 })
    expect(paginatePosts(20, '4')).toBeNull()
    expect(paginatePosts(20, '0')).toBeNull()
    expect(paginatePosts(20, 'abc')).toBeNull()
    expect(paginatePosts(20, '1.5')).toBeNull()
  })

  it('finds previous (older) and next (newer) posts', () => {
    const list = [post({ slug: 'c' }), post({ slug: 'b' }), post({ slug: 'a' })]
    expect(adjacentPosts(list, 'b')).toMatchObject({ previous: { slug: 'a' }, next: { slug: 'c' } })
    expect(adjacentPosts(list, 'c').next).toBeNull()
    expect(adjacentPosts(list, 'a').previous).toBeNull()
    expect(adjacentPosts(list, 'zzz')).toEqual({ previous: null, next: null })
  })

  it('ranks related posts by shared keywords and excludes the current post', () => {
    const current = post({ slug: 'cur', keywords: ['seo', 'blog'] })
    const list = [
      post({ slug: 'none', keywords: [] }),
      post({ slug: 'two', keywords: ['SEO', 'blog'] }),
      post({ slug: 'one', keywords: ['seo'] }),
      current,
    ]
    expect(relatedPosts(list, current).map((p) => p.slug)).toEqual(['two', 'one', 'none'])
  })
})

describe('structured data and RSS', () => {
  it('builds BlogPosting JSON-LD', () => {
    const ld = blogPostingJsonLd({
      post: post({ coverUrl: 'https://x.test/c.png', keywords: ['a', 'b'] }),
      url: 'https://acme.gloval.site/blog/ilk-yazi',
      siteName: 'Acme',
      origin: 'https://acme.gloval.site',
      lang: 'tr',
    })
    expect(ld['@type']).toBe('BlogPosting')
    expect(ld.url).toBe('https://acme.gloval.site/blog/ilk-yazi')
    expect(ld.image).toEqual(['https://x.test/c.png'])
    expect(ld.keywords).toBe('a, b')
  })

  it('lists only indexable posts in RSS, on the given origin', () => {
    const xml = buildRss({
      siteName: 'Acme & Co',
      origin: 'https://acme.test',
      lang: 'tr',
      now: NOW,
      posts: [post(), post({ slug: 'gizli', indexable: false }), post({ slug: 'taslak', status: 'draft' })],
    })
    expect(xml).toContain('https://acme.test/blog/ilk-yazi')
    expect(xml).not.toContain('gizli')
    expect(xml).not.toContain('taslak')
    expect(xml).toContain('Acme &amp; Co Blog')
    expect(xml).not.toContain('/site/')
  })
})
