import { describe, expect, it } from 'vitest'
import { buildBlogRss, escapeXml } from '@/lib/blog-feed'
import type { BlogPost } from '@/lib/content/types'

const NOW = Date.parse('2026-06-01T12:00:00Z')

function post(overrides: Partial<BlogPost> & { slug: string; publishedAt: string }): BlogPost {
  return {
    title: { tr: `Başlık ${overrides.slug}`, en: 'Title' },
    excerpt: { tr: 'Özet', en: 'Excerpt' },
    noindex: false,
    ...overrides,
  } as BlogPost
}

const build = (posts: BlogPost[]) => buildBlogRss(posts, { origin: 'https://gloval.ai/', now: NOW })

describe('buildBlogRss', () => {
  it('lists live posts newest first with absolute links', () => {
    const xml = build([
      post({ slug: 'eski', publishedAt: '2026-01-01T00:00:00Z' }),
      post({ slug: 'yeni', publishedAt: '2026-05-01T00:00:00Z' }),
    ])
    expect(xml.indexOf('/blog/yeni')).toBeLessThan(xml.indexOf('/blog/eski'))
    expect(xml).toContain('<link>https://gloval.ai/blog/yeni</link>')
    expect(xml).not.toContain('gloval.ai//blog')
  })

  it('leaves noindex posts out of the feed', () => {
    const xml = build([
      post({ slug: 'gizli', publishedAt: '2026-01-01T00:00:00Z', noindex: true }),
      post({ slug: 'acik', publishedAt: '2026-01-02T00:00:00Z' }),
    ])
    expect(xml).not.toContain('/blog/gizli')
    expect(xml).toContain('/blog/acik')
  })

  it('leaves scheduled (future-dated) posts out of the feed', () => {
    const xml = build([
      post({ slug: 'planli', publishedAt: '2026-06-02T00:00:00Z' }),
      post({ slug: 'yayinda', publishedAt: '2026-06-01T12:00:00Z' }),
    ])
    expect(xml).not.toContain('/blog/planli')
    expect(xml).toContain('/blog/yayinda')
  })

  it('escapes XML special characters in titles, excerpts and categories', () => {
    const xml = build([
      post({
        slug: 'kacis',
        publishedAt: '2026-01-01T00:00:00Z',
        title: { tr: 'A & B <script>"x"</script>', en: '' },
        excerpt: { tr: "it's <b>bold</b>", en: '' },
        categoryLabel: { tr: 'Q&A', en: 'Q&A' },
      }),
    ])
    expect(xml).toContain('<title>A &amp; B &lt;script&gt;&quot;x&quot;&lt;/script&gt;</title>')
    expect(xml).toContain('<description>it&apos;s &lt;b&gt;bold&lt;/b&gt;</description>')
    expect(xml).toContain('<category>Q&amp;A</category>')
    expect(xml).not.toContain('<script>')
  })

  it('produces an empty but valid channel when nothing is live', () => {
    const xml = build([])
    expect(xml.startsWith('<?xml')).toBe(true)
    expect(xml).not.toContain('<item>')
    expect(xml.trimEnd().endsWith('</rss>')).toBe(true)
  })
})

describe('escapeXml', () => {
  it('strips control characters that are illegal in XML 1.0', () => {
    expect(escapeXml('a\u0000b\u0008c\u001Fd')).toBe('abcd')
  })

  it('keeps tab, newline and carriage return', () => {
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })
})
