import { createAdminClient } from '@/lib/supabase/admin'
import { isSubscriptionSuspended } from '@/lib/billing-lifecycle'
import { enqueueBlogPosts } from '@/lib/indexnow-server'
import { rowToPost } from '@/lib/blog-server'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import type { BlogPost } from '@/lib/blog'
import type { BlogRecord, BlogStore, BlogWriteDeps } from '@/lib/blog-write'

/**
 * Real `BlogStore` on the service-role client. Writes are server-only (migration
 * 065 removes the owners' direct write policies), so ownership is checked by the
 * caller (`lib/blog-actions.ts`) before any of these run; every query here is
 * additionally scoped to the project id.
 */

const COLUMNS =
  'id, slug, title, excerpt, body, keywords, seo_title, meta_description, cover_url, cover_alt, status, indexable, published_at, ai_generated, personalized, sample, created_at, updated_at'

function toRow(record: BlogRecord) {
  return {
    slug: record.slug,
    title: record.title,
    excerpt: record.excerpt,
    body: record.body,
    keywords: record.keywords,
    seo_title: record.seoTitle,
    meta_description: record.metaDescription,
    cover_url: record.coverUrl,
    cover_alt: record.coverAlt,
    status: record.status,
    indexable: record.indexable,
    published_at: record.publishedAt,
    ai_generated: record.aiGenerated,
    personalized: record.personalized,
    sample: record.sample,
    // Only set on first insert; updates never clear or change it.
    ...(record.sourceKey ? { source_key: record.sourceKey } : {}),
  }
}

export function createBlogStore(admin = createAdminClient()): BlogStore {
  return {
    async count(projectId) {
      const { count, error } = await admin
        .from('site_blog_posts')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
      if (error) throw error
      return count ?? 0
    },
    async slugs(projectId) {
      const { data, error } = await admin.from('site_blog_posts').select('slug').eq('project_id', projectId)
      if (error) throw error
      return (data ?? []).map((row) => row.slug as string)
    },
    async get(projectId, id) {
      const { data, error } = await admin
        .from('site_blog_posts')
        .select(COLUMNS)
        .eq('project_id', projectId)
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data ? rowToPost(data as Parameters<typeof rowToPost>[0]) : null
    },
    async insert(projectId, record) {
      const row = { project_id: projectId, ...toRow(record) }
      let { data, error } = await admin.from('site_blog_posts').insert(row).select(COLUMNS).single()
      if (error && record.sourceKey && isMissingColumnError(error)) {
        // Migration 066 not applied yet: write without the key until it is.
        const { source_key: _sourceKey, ...withoutKey } = row
        ;({ data, error } = await admin.from('site_blog_posts').insert(withoutKey).select(COLUMNS).single())
      }
      if (error) throw error
      return rowToPost(data as Parameters<typeof rowToPost>[0])
    },
    async update(projectId, id, record) {
      const { data, error } = await admin
        .from('site_blog_posts')
        .update(toRow(record))
        .eq('project_id', projectId)
        .eq('id', id)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return rowToPost(data as Parameters<typeof rowToPost>[0])
    },
    async remove(projectId, id) {
      const { error } = await admin.from('site_blog_posts').delete().eq('project_id', projectId).eq('id', id)
      if (error) throw error
    },
  }
}

/** Every post of one project for the editor list (drafts and scheduled included), newest first. */
export async function listProjectBlogPosts(projectId: string, admin = createAdminClient()): Promise<BlogPost[]> {
  const { data, error } = await admin
    .from('site_blog_posts')
    .select(COLUMNS)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data ?? []).map((row) => rowToPost(row as Parameters<typeof rowToPost>[0]))
}

/** Posts held back as unapproved samples: they stay hidden until the owner confirms them. */
export async function listSampleBlogPosts(
  projectId: string,
  admin = createAdminClient(),
): Promise<Pick<BlogPost, 'id' | 'title'>[]> {
  const { data } = await admin
    .from('site_blog_posts')
    .select('id, title')
    .eq('project_id', projectId)
    .eq('sample', true)
    .eq('status', 'published')
    .limit(50)
  return (data ?? []).map((row) => ({ id: row.id as string, title: row.title as string }))
}

export function createBlogWriteDeps(projectId: string, siteSlug: string | null): BlogWriteDeps {
  return {
    store: createBlogStore(),
    async suspended() {
      const { data } = await createAdminClient().from('projects').select('owner_id').eq('id', projectId).maybeSingle()
      return data?.owner_id ? isSubscriptionSuspended(data.owner_id as string) : false
    },
    async enqueue(id, postSlugs, reason) {
      if (!siteSlug) return 0
      return enqueueBlogPosts(id, siteSlug, postSlugs, reason)
    },
  }
}
