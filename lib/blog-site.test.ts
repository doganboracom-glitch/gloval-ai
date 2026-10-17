import { describe, expect, it } from 'vitest'
import type { BlogPost } from '@/lib/blog'
import {
  blogIndexHref,
  buildSiteBlogData,
  isBlogRoutePath,
  isStarterPending,
  latestPostsHeading,
  previewSiteBlogData,
  shouldShowBlogLink,
  shouldShowLatestPosts,
} from '@/lib/blog-site'
import { hrefToTenantPath } from '@/lib/website-pages'

function post(overrides: Partial<BlogPost> = {}): BlogPost {
  return {
    id: 'p1',
    slug: 'ilk-yazi',
    title: 'İlk yazı',
    excerpt: null,
    body: 'Merhaba',
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

describe('blog switches', () => {
  const blog = buildSiteBlogData('', [post()])

  it('are on by default when a published post exists', () => {
    expect(shouldShowBlogLink(blog)).toBe(true)
    expect(shouldShowLatestPosts(blog)).toBe(true)
    expect(shouldShowBlogLink(blog, {})).toBe(true)
  })

  it('can be turned off independently by the owner', () => {
    expect(shouldShowBlogLink(blog, { showInMenu: false })).toBe(false)
    expect(shouldShowLatestPosts(blog, { showInMenu: false })).toBe(true)
    expect(shouldShowLatestPosts(blog, { showLatest: false })).toBe(false)
    expect(shouldShowBlogLink(blog, { showLatest: false })).toBe(true)
  })

  it('stay hidden without any published post', () => {
    expect(shouldShowBlogLink(null)).toBe(false)
    expect(shouldShowLatestPosts(buildSiteBlogData('', []))).toBe(false)
  })
})

describe('"View all" link', () => {
  it('points at /blog on a tenant domain and under the site path otherwise', () => {
    expect(blogIndexHref({ hrefBase: '' })).toBe('/blog')
    expect(blogIndexHref({ hrefBase: '/site/demo' })).toBe('/site/demo/blog')
  })
})

describe('previewSiteBlogData', () => {
  it('returns null when there are no live posts', () => {
    expect(previewSiteBlogData([])).toBeNull()
    expect(previewSiteBlogData([post({ status: 'draft', publishedAt: null })])).toBeNull()
  })

  it('ignores sample posts and keeps live ones', () => {
    const data = previewSiteBlogData([post({ id: 's', slug: 'ornek', sample: true }), post()])
    expect(data?.posts.map((p) => p.slug)).toEqual(['ilk-yazi'])
  })

  it('makes the menu link and latest block appear as soon as a post is published', () => {
    const data = previewSiteBlogData([post()])
    expect(shouldShowBlogLink(data)).toBe(true)
    expect(shouldShowLatestPosts(data, { showLatest: false })).toBe(false)
  })

  it('never shows a placeholder block while there are no posts', () => {
    expect(shouldShowLatestPosts(previewSiteBlogData([]))).toBe(false)
    expect(shouldShowBlogLink(previewSiteBlogData([]))).toBe(false)
  })
})

describe('isStarterPending', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  it('is true only for a recently created site', () => {
    expect(isStarterPending('2026-10-16T11:58:00Z', now)).toBe(true)
    expect(isStarterPending('2026-10-16T11:30:00Z', now)).toBe(false)
    expect(isStarterPending(null, now)).toBe(false)
    expect(isStarterPending('not-a-date', now)).toBe(false)
  })
})

describe('isBlogRoutePath', () => {
  it('matches the blog index and post routes only', () => {
    expect(isBlogRoutePath('/blog')).toBe(true)
    expect(isBlogRoutePath('/blog/')).toBe(true)
    expect(isBlogRoutePath('/blog/ilk-yazi')).toBe(true)
    expect(isBlogRoutePath('/blog?page=2')).toBe(true)
    expect(isBlogRoutePath('/blogger')).toBe(false)
    expect(isBlogRoutePath('/hakkimizda')).toBe(false)
  })

  it('works on hrefs rewritten from the internal site path', () => {
    expect(isBlogRoutePath(hrefToTenantPath('/site/demo/blog', 'demo'))).toBe(true)
    expect(isBlogRoutePath(hrefToTenantPath('/site/demo/blog/ilk-yazi', 'demo'))).toBe(true)
  })
})

describe('latestPostsHeading', () => {
  it('is simply "Blog"', () => {
    expect(latestPostsHeading()).toBe('Blog')
  })
})
