import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BlogPostView } from '@/components/blog/blog-views'
import type { BlogPost } from './blog'

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'merhaba',
    title: 'Merhaba Dünya',
    excerpt: null,
    body: 'İlk paragraf.\n\nİkinci paragraf.',
    keywords: [],
    seoTitle: null,
    metaDescription: null,
    coverUrl: null,
    coverAlt: null,
    status: 'published',
    indexable: true,
    publishedAt: '2026-01-05T10:00:00.000Z',
    aiGenerated: false,
    personalized: false,
    sample: false,
    createdAt: '2026-01-05T10:00:00.000Z',
    updatedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  }
}

function render(p: BlogPost) {
  return renderToStaticMarkup(
    createElement(BlogPostView, { post: p, previous: null, next: null, related: [], lang: 'tr', hrefBase: '/site/demo' }),
  )
}

describe('blog post page layout', () => {
  it('uses a single reading column with no two-column grid at any width', () => {
    const html = render(post({ coverUrl: 'https://example.com/c.jpg' }))
    expect(html).not.toMatch(/grid-cols-2/)
    expect(html).not.toMatch(/lg:order-/)
    expect(html).toContain('data-blog-post-column')
    expect(html).toContain('max-w-[46rem]')
  })

  it('orders breadcrumb, title, date, cover, body inside the column', () => {
    const html = render(post({ coverUrl: 'https://example.com/c.jpg', coverAlt: 'Kapak' }))
    const order = ['aria-label="breadcrumb"', '<h1', '<time', 'data-blog-post-cover', 'İlk paragraf.']
    const positions = order.map((needle) => html.indexOf(needle))
    expect(positions.every((i) => i >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    const column = html.indexOf('data-blog-post-column')
    expect(column).toBeLessThan(positions[0])
  })

  it('keeps the cover at column width with rounded corners and aspect ratio', () => {
    const html = render(post({ coverUrl: 'https://example.com/c.jpg' }))
    const img = html.match(/<img[^>]*>/)?.[0] ?? ''
    expect(img).toContain('w-full')
    expect(img).toContain('aspect-[16/9]')
    expect(img).toContain('border-radius:var(--site-radius)')
  })

  it('goes straight from title and date to the body when there is no cover', () => {
    const html = render(post())
    expect(html).not.toContain('<img')
    expect(html).not.toContain('data-blog-post-cover')
    expect(html).toContain('data-has-cover="false"')
    expect(html.indexOf('<time')).toBeLessThan(html.indexOf('İlk paragraf.'))
  })
})
