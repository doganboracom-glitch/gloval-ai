import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { blocksToMarkup, sanitizeBlogMarkup } from '@/lib/blog-markup'
import { LIMITS, SLUG_PATTERN } from '@/lib/blog-admin-shared'
import { staticCategories, staticPosts } from './blog-static'
import type { BlogCategory, BlogPost, Localized, StaticBlogPost } from './types'

/**
 * Blog source of truth for the public pages.
 *
 * Posts live in `platform_blog_posts` (migrations 067/068) and are read with
 * the service role, because the tables deny anon/authenticated access. Reads
 * are cached under the `platform-blog` tag and the admin actions expire it, so
 * edits show up immediately while visitors never wait on the database.
 *
 * The file-based posts in `blog-static.ts` are only a fallback for when the
 * database cannot be reached (error or missing table). An EMPTY result is a
 * legitimate state — an admin who unpublishes everything gets an empty blog,
 * never resurrected static posts.
 *
 * Scheduled posts are stored with a future `published_at`. Visibility is
 * decided by comparing it to the server clock on every read, after the cache,
 * so a cached snapshot can never leak a post early.
 */

export const BLOG_CACHE_TAG = 'platform-blog'
const CACHE_SECONDS = 300

export const LIST_COLUMNS =
  'id, slug, title, excerpt, category_id, tags, cover_url, cover_alt, seo_title, meta_description, status, published_at, author_name, reading_time, language, noindex, featured, updated_at, en_title:translations->en->>title, en_excerpt:translations->en->>excerpt, en_seo_title:translations->en->>seo_title, en_meta:translations->en->>meta_description'

export type CategoryRow = { id: string; slug: string; name: string; description: string | null; sort_order: number }

export type PostRow = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body?: string
  category_id: string | null
  tags: string[] | null
  cover_url: string | null
  cover_alt: string | null
  seo_title: string | null
  meta_description: string | null
  status: 'draft' | 'published' | 'scheduled'
  published_at: string | null
  author_name: string
  reading_time: number
  language: string
  noindex: boolean
  featured: boolean
  updated_at: string
  translations?: { en?: EnglishTranslation } | null
  en_title?: string | null
  en_excerpt?: string | null
  en_seo_title?: string | null
  en_meta?: string | null
}

export type EnglishTranslation = {
  title?: string
  excerpt?: string
  body?: string
  seo_title?: string
  meta_description?: string
}

class BlogDbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlogDbError'
  }
}

function isDbError(error: unknown): boolean {
  return error instanceof BlogDbError || (error instanceof Error && error.name === 'BlogDbError')
}

/**
 * Runs `load` through the tagged data cache. Outside the Next runtime (unit
 * tests) the cache is unavailable, so a non-database failure retries directly.
 */
async function cached<T>(keyParts: string[], tags: string[], load: () => Promise<T>): Promise<T> {
  const guarded = async () => {
    try {
      return await load()
    } catch (error) {
      throw new BlogDbError(error instanceof Error ? error.message : 'blog query failed')
    }
  }
  try {
    return await unstable_cache(guarded, keyParts, { tags, revalidate: CACHE_SECONDS })()
  } catch (error) {
    if (isDbError(error)) throw error
    return guarded()
  }
}

/** Public URLs carry arbitrary text: anything that is not a well-formed slug never reaches the database or the cache. */
export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length <= LIMITS.slug && SLUG_PATTERN.test(slug)
}

export function isLive(row: Pick<PostRow, 'status' | 'published_at'>, now = Date.now()): boolean {
  if (row.status === 'draft' || !row.published_at) return false
  return Date.parse(row.published_at) <= now
}

const EN_CATEGORY_LABELS = new Map(staticCategories.map((c) => [c.id, c.label.en]))

function categoryFromRow(row: CategoryRow): BlogCategory {
  return { id: row.slug, label: { tr: row.name, en: EN_CATEGORY_LABELS.get(row.slug) ?? row.name } }
}

export function mapPostRow(row: PostRow, categories: Map<string, CategoryRow>, withBody: boolean): BlogPost {
  const category = row.category_id ? categories.get(row.category_id) : undefined
  const en = row.translations?.en
  const enTitle = en?.title ?? row.en_title ?? ''
  const enExcerpt = en?.excerpt ?? row.en_excerpt ?? ''
  const enSeoTitle = en?.seo_title ?? row.en_seo_title ?? ''
  const enMeta = en?.meta_description ?? row.en_meta ?? ''
  const hasEnglish = Boolean(enTitle.trim())
  const tags = row.tags ?? []
  const excerpt = row.excerpt ?? ''
  const tr = {
    title: row.title,
    excerpt,
    seoTitle: row.seo_title || row.title,
    seoDescription: row.meta_description || excerpt,
  }
  // Re-sanitized on every read, so a row written outside the admin form can never render unsafe markup.
  const body = withBody ? sanitizeBlogMarkup(row.body ?? '') : ''
  const enBody = withBody ? (en?.body ? sanitizeBlogMarkup(en.body) : body) : ''

  return {
    slug: row.slug,
    title: { tr: tr.title, en: enTitle || tr.title },
    excerpt: { tr: tr.excerpt, en: enExcerpt || tr.excerpt },
    markup: { tr: body, en: enBody },
    coverImage: row.cover_url || undefined,
    coverAlt: row.cover_alt ? { tr: row.cover_alt, en: row.cover_alt } : undefined,
    category: category?.slug ?? '',
    categoryLabel: category ? categoryFromRow(category).label : undefined,
    author: row.author_name,
    publishedAt: row.published_at ?? row.updated_at,
    updatedAt: row.updated_at,
    seoTitle: { tr: tr.seoTitle, en: enSeoTitle || enTitle || tr.seoTitle },
    seoDescription: { tr: tr.seoDescription, en: enMeta || enExcerpt || tr.seoDescription },
    keywords: { tr: tags, en: tags },
    tags,
    featured: row.featured,
    noindex: row.noindex,
    readingTime: row.reading_time,
    hasEnglish,
  }
}

function fromStatic(post: StaticBlogPost): BlogPost {
  const category = staticCategories.find((c) => c.id === post.category)
  const l = <T,>(value: Localized<T>): Localized<T> => ({ tr: value.tr ?? value.en, en: value.en })
  return {
    slug: post.slug,
    title: l(post.title),
    excerpt: l(post.excerpt),
    markup: { tr: blocksToMarkup(post.body, 'tr'), en: blocksToMarkup(post.body, 'en') },
    coverImage: post.coverImage,
    coverAlt: post.coverAlt,
    category: post.category,
    categoryLabel: category?.label,
    author: post.author,
    publishedAt: `${post.publishedAt}T00:00:00.000Z`,
    updatedAt: `${post.updatedAt}T00:00:00.000Z`,
    seoTitle: l(post.seoTitle),
    seoDescription: l(post.seoDescription),
    keywords: l(post.keywords),
    tags: post.keywords.tr ?? post.keywords.en,
    featured: post.featured,
    noindex: false,
    readingTime: 1,
    hasEnglish: true,
  }
}

function sortNewestFirst(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

function staticList(): BlogPost[] {
  return sortNewestFirst(staticPosts.map(fromStatic))
}

async function loadCategories(): Promise<CategoryRow[]> {
  const { data, error } = await createAdminClient()
    .from('platform_blog_categories')
    .select('id, slug, name, description, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as CategoryRow[]
}

async function loadList(): Promise<{ posts: PostRow[]; categories: CategoryRow[] }> {
  const supabase = createAdminClient()
  const [postsResult, categories] = await Promise.all([
    supabase
      .from('platform_blog_posts')
      .select(LIST_COLUMNS)
      .in('status', ['published', 'scheduled'])
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false }),
    loadCategories(),
  ])
  if (postsResult.error) throw new Error(postsResult.error.message)
  return { posts: (postsResult.data ?? []) as unknown as PostRow[], categories }
}

/** All live posts, newest first, without bodies. */
export async function getPosts(): Promise<BlogPost[]> {
  try {
    const { posts, categories } = await cached(['platform-blog', 'list'], [BLOG_CACHE_TAG], loadList)
    const byId = new Map(categories.map((c) => [c.id, c]))
    const now = Date.now()
    return posts.filter((row) => isLive(row, now)).map((row) => mapPostRow(row, byId, false))
  } catch (error) {
    if (!isDbError(error)) throw error
    console.error('[blog] database unavailable, serving static fallback:', (error as Error).message)
    return staticList()
  }
}

/** The curated subset shown on the homepage. */
export async function getFeaturedPosts(limit = 3): Promise<BlogPost[]> {
  const posts = await getPosts()
  return posts.filter((post) => post.featured).slice(0, limit)
}

/** One live post with its full body, or null. */
export async function getPost(slug: string): Promise<BlogPost | null> {
  if (!isValidSlug(slug)) return null
  try {
    const { row, categories } = await cached(['platform-blog', 'post', slug], [BLOG_CACHE_TAG, `${BLOG_CACHE_TAG}:${slug}`], async () => {
      const supabase = createAdminClient()
      const [postResult, categoryRows] = await Promise.all([
        supabase.from('platform_blog_posts').select('*').eq('slug', slug).maybeSingle(),
        loadCategories(),
      ])
      if (postResult.error) throw new Error(postResult.error.message)
      return { row: (postResult.data ?? null) as PostRow | null, categories: categoryRows }
    })
    if (!row || !isLive(row)) return null
    return mapPostRow(row, new Map(categories.map((c) => [c.id, c])), true)
  } catch (error) {
    if (!isDbError(error)) throw error
    console.error('[blog] database unavailable, serving static fallback:', (error as Error).message)
    return staticList().find((post) => post.slug === slug) ?? null
  }
}

/** Same category first, then newest others, so the section is never empty. */
export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {
  const others = (await getPosts()).filter((p) => p.slug !== post.slug)
  const sameCategory = others.filter((p) => p.category === post.category)
  const rest = others.filter((p) => p.category !== post.category)
  return [...sameCategory, ...rest].slice(0, limit)
}

/** Categories that have at least one live post, for the filter bar. */
export async function getUsedCategories(posts?: BlogPost[]): Promise<BlogCategory[]> {
  const list = posts ?? (await getPosts())
  const seen = new Map<string, BlogCategory>()
  for (const post of list) {
    if (post.category && post.categoryLabel && !seen.has(post.category)) {
      seen.set(post.category, { id: post.category, label: post.categoryLabel })
    }
  }
  return [...seen.values()]
}

/** Slug a renamed post used to live at, or null. Powers the permanent redirect. */
export async function getRedirectTarget(oldSlug: string): Promise<string | null> {
  if (!isValidSlug(oldSlug)) return null
  try {
    const target = await cached(['platform-blog', 'redirect', oldSlug], [BLOG_CACHE_TAG], async () => {
      const { data, error } = await createAdminClient()
        .from('platform_blog_redirects')
        .select('platform_blog_posts(slug, status, published_at)')
        .eq('old_slug', oldSlug)
        .maybeSingle()
      if (error) throw new Error(error.message)
      const post = (data as { platform_blog_posts: Pick<PostRow, 'slug' | 'status' | 'published_at'> | null } | null)
        ?.platform_blog_posts
      return post ? { slug: post.slug, status: post.status, published_at: post.published_at } : null
    })
    return target && isLive(target) ? target.slug : null
  } catch (error) {
    if (!isDbError(error)) throw error
    return null
  }
}
