import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { emptyEnglish, type EnglishInput, type PostInput, type PostStatus } from '@/lib/blog-admin-shared'

/**
 * Admin-side reads for the platform blog. These are deliberately uncached and
 * include drafts; callers must have passed the admin gate first.
 */

export type AdminCategory = {
  id: string
  slug: string
  name: string
  description: string | null
  sortOrder: number
  postCount: number
}

export type AdminPostSummary = {
  id: string
  slug: string
  title: string
  status: PostStatus
  /** What visitors actually see right now, derived from status + date. */
  visibility: 'draft' | 'live' | 'scheduled'
  publishedAt: string | null
  updatedAt: string
  featured: boolean
  noindex: boolean
  categoryName: string | null
  coverUrl: string | null
  readingTime: number
  hasEnglish: boolean
}

type PostSummaryRow = {
  id: string
  slug: string
  title: string
  status: PostStatus
  published_at: string | null
  updated_at: string
  featured: boolean
  noindex: boolean
  category_id: string | null
  cover_url: string | null
  reading_time: number
  en_title: string | null
}

export function visibilityOf(status: PostStatus, publishedAt: string | null, now = Date.now()): AdminPostSummary['visibility'] {
  if (status === 'draft' || !publishedAt) return 'draft'
  return Date.parse(publishedAt) <= now ? 'live' : 'scheduled'
}

export async function listAdminCategories(): Promise<AdminCategory[]> {
  const supabase = createAdminClient()
  const [categories, posts] = await Promise.all([
    supabase
      .from('platform_blog_categories')
      .select('id, slug, name, description, sort_order')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase.from('platform_blog_posts').select('category_id'),
  ])
  if (categories.error) throw new Error(categories.error.message)
  const counts = new Map<string, number>()
  for (const row of (posts.data ?? []) as { category_id: string | null }[]) {
    if (row.category_id) counts.set(row.category_id, (counts.get(row.category_id) ?? 0) + 1)
  }
  return (categories.data ?? []).map((row) => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    sortOrder: row.sort_order as number,
    postCount: counts.get(row.id as string) ?? 0,
  }))
}

export async function listAdminPosts(): Promise<{ posts: AdminPostSummary[]; categories: AdminCategory[] }> {
  const supabase = createAdminClient()
  const [postsResult, categories] = await Promise.all([
    supabase
      .from('platform_blog_posts')
      .select(
        'id, slug, title, status, published_at, updated_at, featured, noindex, category_id, cover_url, reading_time, en_title:translations->en->>title',
      )
      .order('updated_at', { ascending: false }),
    listAdminCategories(),
  ])
  if (postsResult.error) throw new Error(postsResult.error.message)
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const now = Date.now()
  const posts = ((postsResult.data ?? []) as unknown as PostSummaryRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    visibility: visibilityOf(row.status, row.published_at, now),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    featured: row.featured,
    noindex: row.noindex,
    categoryName: row.category_id ? (names.get(row.category_id) ?? null) : null,
    coverUrl: row.cover_url,
    readingTime: row.reading_time,
    hasEnglish: Boolean(row.en_title?.trim()),
  }))
  return { posts, categories }
}

export type AdminPostDetail = {
  input: PostInput
  visibility: AdminPostSummary['visibility']
  updatedAt: string
  oldSlugs: string[]
}

export async function getAdminPost(id: string): Promise<AdminPostDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = createAdminClient()
  const [post, redirects] = await Promise.all([
    supabase.from('platform_blog_posts').select('*').eq('id', id).maybeSingle(),
    supabase.from('platform_blog_redirects').select('old_slug').eq('post_id', id).order('created_at', { ascending: false }),
  ])
  if (post.error) throw new Error(post.error.message)
  const row = post.data as Record<string, unknown> | null
  if (!row) return null
  const en = ((row.translations as { en?: Record<string, string> } | null)?.en ?? {}) as Record<string, string>
  const english: EnglishInput = {
    ...emptyEnglish(),
    title: en.title ?? '',
    excerpt: en.excerpt ?? '',
    body: en.body ?? '',
    seoTitle: en.seo_title ?? '',
    metaDescription: en.meta_description ?? '',
  }
  const status = row.status as PostStatus
  const publishedAt = (row.published_at as string | null) ?? null
  return {
    input: {
      id: row.id as string,
      title: row.title as string,
      slug: row.slug as string,
      excerpt: (row.excerpt as string | null) ?? '',
      body: (row.body as string) ?? '',
      categoryId: (row.category_id as string | null) ?? null,
      tags: (row.tags as string[] | null) ?? [],
      coverUrl: (row.cover_url as string | null) ?? '',
      coverAlt: (row.cover_alt as string | null) ?? '',
      seoTitle: (row.seo_title as string | null) ?? '',
      metaDescription: (row.meta_description as string | null) ?? '',
      status,
      publishedAt,
      authorName: row.author_name as string,
      noindex: Boolean(row.noindex),
      featured: Boolean(row.featured),
      en: english,
    },
    visibility: visibilityOf(status, publishedAt),
    updatedAt: row.updated_at as string,
    oldSlugs: ((redirects.data ?? []) as { old_slug: string }[]).map((r) => r.old_slug),
  }
}
