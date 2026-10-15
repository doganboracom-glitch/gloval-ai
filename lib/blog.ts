import { isReservedPageSlug, slugifyPageSlug, PAGE_SLUG_MAX } from '@/lib/page-slugs'
import { sanitizeLegalMarkup } from '@/lib/legal-markup'
import { safeJsonLd } from '@/lib/product-json-ld'

/**
 * Pure blog rules shared by the tenant routes, sitemap and RSS feed. No I/O
 * here so every visibility / SEO decision is unit-testable; reads live in
 * `lib/blog-server.ts`.
 */

export type BlogStatus = 'draft' | 'published' | 'scheduled'

export type BlogPost = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body: string
  keywords: string[]
  seoTitle: string | null
  metaDescription: string | null
  coverUrl: string | null
  coverAlt: string | null
  status: BlogStatus
  indexable: boolean
  publishedAt: string | null
  aiGenerated: boolean
  personalized: boolean
  sample: boolean
  createdAt: string
  updatedAt: string
}

export const BLOG_PAGE_SIZE = 9
export const BLOG_RSS_LIMIT = 50
export const BLOG_BODY_MAX = 40000
/** Safety cap, the same on every plan (blog is not a paid feature). */
export const BLOG_MAX_POSTS = 500

/** Segments under `/blog` that are served by the platform, not by a post. */
const RESERVED_POST_SLUGS: ReadonlySet<string> = new Set(['rss.xml', 'page', 'feed', 'sitemap.xml'])

export function isReservedPostSlug(slug: string): boolean {
  return RESERVED_POST_SLUGS.has(slug.toLowerCase()) || isReservedPageSlug(slug)
}

/** Same ASCII/dash rules as page slugs; a clash with `taken` or a reserved segment gets `-2`, `-3`... */
export function uniquePostSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (s) => s.toLowerCase()))
  const base = slugifyPageSlug(desired)
  const fits = (candidate: string) => !used.has(candidate) && !isReservedPostSlug(candidate)
  if (fits(base)) return base
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, PAGE_SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`
    if (fits(candidate)) return candidate
  }
  return `${base.slice(0, PAGE_SLUG_MAX - 7)}-${Date.now().toString(36).slice(-5)}`
}

/** Raw HTML never survives: reuses the legal-document sanitizer. */
export function sanitizeBlogBody(raw: string): string {
  return sanitizeLegalMarkup(raw).slice(0, BLOG_BODY_MAX)
}

/** Visible to the public: published, not an unapproved sample, and its publish time has arrived. */
export function isPostLive(
  post: Pick<BlogPost, 'status' | 'sample' | 'publishedAt'>,
  now: Date = new Date(),
): boolean {
  if (post.status !== 'published' || post.sample) return false
  if (!post.publishedAt) return false
  const at = Date.parse(post.publishedAt)
  return !Number.isNaN(at) && at <= now.getTime()
}

/** Live AND allowed into search: drives robots meta, sitemap and RSS. */
export function isPostIndexable(post: BlogPost, now: Date = new Date()): boolean {
  return isPostLive(post, now) && post.indexable
}

/** Live posts, newest first. */
export function livePosts(posts: readonly BlogPost[], now: Date = new Date()): BlogPost[] {
  return posts
    .filter((p) => isPostLive(p, now))
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!))
}

export function indexablePosts(posts: readonly BlogPost[], now: Date = new Date()): BlogPost[] {
  return livePosts(posts, now).filter((p) => p.indexable)
}

export function postTitle(post: Pick<BlogPost, 'title' | 'seoTitle'>): string {
  return post.seoTitle?.trim() || post.title
}

export function postDescription(post: Pick<BlogPost, 'excerpt' | 'metaDescription' | 'body'>): string {
  const explicit = post.metaDescription?.trim() || post.excerpt?.trim()
  if (explicit) return explicit.slice(0, 300)
  const plain = post.body
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 160 ? `${plain.slice(0, 157).trimEnd()}...` : plain
}

export function blogPostPath(slug: string): string {
  return `/blog/${slug}`
}

export function blogListPath(page = 1): string {
  return page > 1 ? `/blog?page=${page}` : '/blog'
}

export type BlogPagination = { page: number; pageCount: number; start: number; end: number }

/** Clamps nothing: callers 404 when `page` is outside `1..pageCount`. */
export function paginatePosts(total: number, rawPage: unknown, size = BLOG_PAGE_SIZE): BlogPagination | null {
  const parsed = typeof rawPage === 'string' ? Number(rawPage) : rawPage === undefined ? 1 : NaN
  const page = Number.isInteger(parsed) ? (parsed as number) : NaN
  const pageCount = Math.max(1, Math.ceil(total / size))
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null
  return { page, pageCount, start: (page - 1) * size, end: Math.min(total, page * size) }
}

/** Neighbours in the newest-first list: `previous` is the older post, `next` the newer one. */
export function adjacentPosts(
  posts: readonly BlogPost[],
  slug: string,
): { previous: BlogPost | null; next: BlogPost | null } {
  const i = posts.findIndex((p) => p.slug === slug)
  if (i === -1) return { previous: null, next: null }
  return { previous: posts[i + 1] ?? null, next: posts[i - 1] ?? null }
}

/** Posts sharing the most keywords, then newest; falls back to newest. Never includes `current`. */
export function relatedPosts(posts: readonly BlogPost[], current: BlogPost, limit = 3): BlogPost[] {
  const wanted = new Set(current.keywords.map((k) => k.toLowerCase()))
  return posts
    .filter((p) => p.slug !== current.slug)
    .map((p, order) => ({
      p,
      order,
      score: p.keywords.reduce((n, k) => n + (wanted.has(k.toLowerCase()) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((x) => x.p)
}

export function blogPostingJsonLd(args: {
  post: BlogPost
  url: string
  siteName: string
  origin: string
  lang: string
}) {
  const { post, url, siteName, origin, lang } = args
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: postTitle(post).slice(0, 110),
    description: postDescription(post),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(post.coverUrl ? { image: [post.coverUrl] } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    ...(post.keywords.length ? { keywords: post.keywords.join(', ') } : {}),
    inLanguage: lang,
    author: { '@type': 'Organization', name: siteName, url: origin },
    publisher: { '@type': 'Organization', name: siteName, url: origin },
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function blogJsonLdScript(value: unknown): string {
  return safeJsonLd(value)
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RSS 2.0 of the indexable posts only (noindex posts never leave the site through the feed). */
export function buildRss(args: {
  siteName: string
  origin: string
  lang: string
  posts: readonly BlogPost[]
  now?: Date
}): string {
  const { siteName, origin, lang, now = new Date() } = args
  const posts = indexablePosts(args.posts, now).slice(0, BLOG_RSS_LIMIT)
  const items = posts
    .map((post) => {
      const url = `${origin}${blogPostPath(post.slug)}`
      return [
        '    <item>',
        `      <title>${escapeXml(postTitle(post))}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${new Date(post.publishedAt!).toUTCString()}</pubDate>`,
        `      <description>${escapeXml(postDescription(post))}</description>`,
        '    </item>',
      ].join('\n')
    })
    .join('\n')
  const lastBuild = posts[0]?.updatedAt ?? posts[0]?.publishedAt
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(`${siteName} Blog`)}</title>`,
    `    <link>${escapeXml(`${origin}/blog`)}</link>`,
    `    <description>${escapeXml(`${siteName} blog`)}</description>`,
    `    <language>${escapeXml(lang)}</language>`,
    ...(lastBuild ? [`    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>`] : []),
    `    <atom:link href="${escapeXml(`${origin}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
