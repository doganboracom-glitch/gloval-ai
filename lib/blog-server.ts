import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { livePosts, type BlogPost, type BlogStatus } from '@/lib/blog'
import { getTenantSlugFromHost, isForeignHost } from '@/lib/domains'

/**
 * Prefix for internal blog links: empty on a tenant subdomain or custom domain
 * (clean `/blog/...` URLs), `/site/<slug>` when the site is opened by its
 * internal path (previews), where a bare `/blog` would hit the platform blog.
 */
export async function blogHrefBase(slug: string): Promise<string> {
  const host = (await headers()).get('host')
  return getTenantSlugFromHost(host) || isForeignHost(host) ? '' : `/site/${slug}`
}

/**
 * Server-only reads for the public blog. Public visitors have no RLS access to
 * `site_blog_posts`, so every read goes through the service-role client and is
 * scoped to the published project that owns `slug`.
 */

const LIST_COLUMNS =
  'id, slug, title, excerpt, keywords, seo_title, meta_description, cover_url, cover_alt, status, indexable, published_at, ai_generated, personalized, sample, created_at, updated_at'
const FULL_COLUMNS = `${LIST_COLUMNS}, body`

type Row = {
  id: string
  slug: string
  title: string
  excerpt: string | null
  body?: string | null
  keywords: string[] | null
  seo_title: string | null
  meta_description: string | null
  cover_url: string | null
  cover_alt: string | null
  status: string
  indexable: boolean
  published_at: string | null
  ai_generated: boolean
  personalized: boolean
  sample: boolean
  created_at: string
  updated_at: string
}

export function rowToPost(row: Row): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body ?? '',
    keywords: row.keywords ?? [],
    seoTitle: row.seo_title,
    metaDescription: row.meta_description,
    coverUrl: row.cover_url,
    coverAlt: row.cover_alt,
    status: row.status as BlogStatus,
    indexable: row.indexable,
    publishedAt: row.published_at,
    aiGenerated: row.ai_generated,
    personalized: row.personalized,
    sample: row.sample,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function publishedProjectId(slug: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

/** Every live post (newest first) WITHOUT bodies; empty on any failure so a blog outage never breaks a site. */
export async function getLiveBlogPosts(slug: string): Promise<BlogPost[]> {
  try {
    const projectId = await publishedProjectId(slug)
    if (!projectId) return []
    const { data, error } = await createAdminClient()
      .from('site_blog_posts')
      .select(LIST_COLUMNS)
      .eq('project_id', projectId)
      .eq('status', 'published')
      .eq('sample', false)
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false })
      .limit(1000)
    if (error || !data) return []
    return livePosts((data as Row[]).map(rowToPost))
  } catch {
    return []
  }
}

/** One live post WITH its body, or null when missing / not yet public. */
export async function getLiveBlogPost(slug: string, postSlug: string): Promise<BlogPost | null> {
  try {
    const projectId = await publishedProjectId(slug)
    if (!projectId) return null
    const { data } = await createAdminClient()
      .from('site_blog_posts')
      .select(FULL_COLUMNS)
      .eq('project_id', projectId)
      .eq('slug', postSlug)
      .eq('status', 'published')
      .eq('sample', false)
      .lte('published_at', new Date().toISOString())
      .maybeSingle()
    return data ? rowToPost(data as Row) : null
  } catch {
    return null
  }
}

/** Drives the menu link: true only when at least one post is publicly visible. */
export async function siteHasBlog(slug: string): Promise<boolean> {
  try {
    const projectId = await publishedProjectId(slug)
    if (!projectId) return false
    const { count } = await createAdminClient()
      .from('site_blog_posts')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'published')
      .eq('sample', false)
      .lte('published_at', new Date().toISOString())
    return (count ?? 0) > 0
  } catch {
    return false
  }
}
