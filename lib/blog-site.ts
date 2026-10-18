import { blogPostPath, livePosts, type BlogPost } from '@/lib/blog'
import type { BlogSettings, NavLink } from '@/lib/website-schema'

type Lang = 'tr' | 'en'

/** Everything the site chrome needs from the blog; plain data so it crosses the server/client boundary. */
export type SiteBlogData = {
  /** Prefix for internal links: '' on a tenant domain, `/site/<slug>` on the internal path. */
  hrefBase: string
  /** Live posts, newest first. */
  posts: BlogCardData[]
}

export type BlogCardData = {
  slug: string
  title: string
  excerpt: string | null
  coverUrl: string | null
  coverAlt: string | null
  publishedAt: string | null
}

export const LATEST_POSTS_LIMIT = 3

export function toCardData(post: BlogPost): BlogCardData {
  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    coverUrl: post.coverUrl,
    coverAlt: post.coverAlt,
    publishedAt: post.publishedAt,
  }
}

export function buildSiteBlogData(hrefBase: string, posts: BlogPost[]): SiteBlogData {
  return { hrefBase, posts: posts.slice(0, LATEST_POSTS_LIMIT).map(toCardData) }
}

export const BLOG_LABEL = 'Blog'

export function latestPostsHeading(): string {
  return BLOG_LABEL
}

export function blogIndexHref(blog: Pick<SiteBlogData, 'hrefBase'>): string {
  return `${blog.hrefBase}/blog`
}

export function blogCardHref(blog: Pick<SiteBlogData, 'hrefBase'>, post: Pick<BlogCardData, 'slug'>): string {
  return `${blog.hrefBase}${blogPostPath(post.slug)}`
}

/** True for a tenant-relative blog route: `/blog` or `/blog/<post>` (query and hash allowed). */
export function isBlogRoutePath(tenantPath: string): boolean {
  return /^\/blog(?:[/?#]|$)/i.test(tenantPath)
}

/** The live posts as the site chrome sees them; samples and drafts never appear. */
export function previewSiteBlogData(posts: readonly BlogPost[], now: Date = new Date()): SiteBlogData | null {
  const live = livePosts(posts.filter((post) => !post.sample), now)
  return live.length > 0 ? buildSiteBlogData('', live) : null
}

/** How long after creation a site with no posts is still assumed to be waiting for its starter posts. */
export const STARTER_PENDING_WINDOW_MS = 10 * 60 * 1000

export function isStarterPending(createdAt: string | null | undefined, now: number): boolean {
  if (!createdAt) return false
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && now - created >= 0 && now - created < STARTER_PENDING_WINDOW_MS
}

/** The menu/footer link shows only when the blog has a public post and the owner has not hidden it. */
export function shouldShowBlogLink(blog: SiteBlogData | null | undefined, settings?: BlogSettings): boolean {
  return Boolean(blog && blog.posts.length > 0 && settings?.showInMenu !== false)
}

export function shouldShowLatestPosts(blog: SiteBlogData | null | undefined, settings?: BlogSettings): boolean {
  return Boolean(blog && blog.posts.length > 0 && settings?.showLatest !== false)
}

/**
 * True for a link that points at the blog index in any hand-written form the
 * AI or an owner may have typed: `blog`, `/blog`, `./blog/`, `#blog`.
 * A bare `blog` is a relative URL and resolves to a dead path on sub-pages.
 */
export function isBlogHref(href: string): boolean {
  return /^(?:\.?\/)?#?blog\/?$/i.test(href.trim())
}

/** Header/footer links that duplicate the blog link are dropped when the real one is shown, or when the blog is off. */
export function withoutBlogLinks<T extends Pick<NavLink, 'href'>>(links: T[]): T[] {
  return links.filter((link) => !isBlogHref(link.href))
}

type FooterColumn = { title: string; links: NavLink[] }

const QUICK_TITLES = ['hızlı erişim', 'hizli erisim', 'quick links', 'quick access']
const COMPANY_TITLES = ['kurumsal', 'şirket', 'company']

/**
 * Adds the blog link to the footer's quick-access column (falling back to the
 * company column, then the first one, then a new column) and removes any
 * hand-written blog link first so it never appears twice.
 */
export function withBlogFooterLink(columns: FooterColumn[], link: NavLink, lang: Lang): FooterColumn[] {
  const cleaned = columns.map((col) => ({ ...col, links: withoutBlogLinks(col.links) }))
  const lower = (title: string) => title.trim().toLocaleLowerCase('tr')
  let index = cleaned.findIndex((col) => QUICK_TITLES.includes(lower(col.title)))
  if (index < 0) index = cleaned.findIndex((col) => COMPANY_TITLES.includes(lower(col.title)))
  if (index < 0 && cleaned.length > 0) index = 0
  if (index < 0) return [{ title: lang === 'en' ? 'Quick links' : 'Hızlı erişim', links: [link] }]
  return cleaned.map((col, i) => (i === index ? { ...col, links: [...col.links, link] } : col))
}
