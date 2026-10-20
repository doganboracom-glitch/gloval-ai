'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdminUser } from '@/lib/mail/admin-guard'
import { BLOG_CACHE_TAG } from '@/lib/content/blog'
import { checkBlogAdminLimit } from '@/lib/blog-admin-limit'
import { recordBlogAudit } from '@/lib/blog-audit'
import {
  validateCategory,
  validatePost,
  type CategoryInput,
  type FieldErrors,
  type PostInput,
  type PostStatus,
} from '@/lib/blog-admin-shared'

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | {
      ok: false
      error: 'unauthorized' | 'validation' | 'not_found' | 'slug_taken' | 'rate_limited' | 'failed'
      errors?: FieldErrors
    }

type Admin = { userId: string; email: string }

/** Resolves the admin and applies the write limit; either failure becomes the action's error result. */
type Denied = { ok: false; error: 'unauthorized' | 'rate_limited' }

async function authorizeWrite(): Promise<{ admin: Admin } | { denied: Denied }> {
  const admin = await getAdminUser()
  if (!admin) return { denied: { ok: false, error: 'unauthorized' } }
  const limit = await checkBlogAdminLimit(admin.userId, 'write')
  if (!limit.allowed) return { denied: { ok: false, error: 'rate_limited' } }
  return { admin }
}

/** Expire the data cache and every page that renders blog content. */
function refreshBlog() {
  updateTag(BLOG_CACHE_TAG)
  revalidatePath('/blog')
  revalidatePath('/blog/[slug]', 'page')
  revalidatePath('/blog/rss.xml')
  revalidatePath('/')
  revalidatePath('/sitemap.xml')
}

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505'

export async function savePostAction(input: PostInput): Promise<ActionResult<{ id: string; slug: string; publishedAt: string | null }>> {
  const auth = await authorizeWrite()
  if ('denied' in auth) return auth.denied
  const { admin } = auth
  const parsed = validatePost(input)
  if (!parsed.ok) return { ok: false, error: 'validation', errors: parsed.errors }
  const v = parsed.value

  const supabase = createAdminClient()
  const columns = {
    slug: v.slug,
    title: v.title,
    excerpt: v.excerpt,
    body: v.body,
    category_id: v.categoryId,
    tags: v.tags,
    cover_url: v.coverUrl,
    cover_alt: v.coverAlt,
    seo_title: v.seoTitle,
    meta_description: v.metaDescription,
    status: v.status,
    published_at: v.publishedAt,
    author_name: v.authorName,
    reading_time: v.readingTime,
    noindex: v.noindex,
    featured: v.featured,
    translations: v.translations,
  }

  if (!input.id) {
    const { data, error } = await supabase.from('platform_blog_posts').insert(columns).select('id').single()
    if (error) {
      if (isUniqueViolation(error)) return { ok: false, error: 'slug_taken', errors: { slug: 'taken' } }
      console.error('[blog-admin] insert failed:', error.message)
      return { ok: false, error: 'failed' }
    }
    // A fresh post may take a slug an older post used to redirect from.
    await supabase.from('platform_blog_redirects').delete().eq('old_slug', v.slug)
    await recordBlogAudit({
      actor: admin,
      action: 'post.create',
      postId: data.id as string,
      postSlug: v.slug,
      postTitle: v.title,
      detail: { status: v.status },
    })
    refreshBlog()
    return { ok: true, id: data.id as string, slug: v.slug, publishedAt: v.publishedAt }
  }

  const { data: existing, error: loadError } = await supabase
    .from('platform_blog_posts')
    .select('slug, status')
    .eq('id', input.id)
    .maybeSingle()
  if (loadError) return { ok: false, error: 'failed' }
  if (!existing) return { ok: false, error: 'not_found' }

  const { error } = await supabase.from('platform_blog_posts').update(columns).eq('id', input.id)
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'slug_taken', errors: { slug: 'taken' } }
    console.error('[blog-admin] update failed:', error.message)
    return { ok: false, error: 'failed' }
  }

  const oldSlug = existing.slug as string
  if (oldSlug !== v.slug) {
    await supabase.from('platform_blog_redirects').delete().eq('old_slug', v.slug)
    const { error: redirectError } = await supabase
      .from('platform_blog_redirects')
      .upsert({ old_slug: oldSlug, post_id: input.id }, { onConflict: 'old_slug' })
    if (redirectError) console.error('[blog-admin] redirect insert failed:', redirectError.message)
    revalidatePath(`/blog/${oldSlug}`)
  }
  await recordBlogAudit({
    actor: admin,
    action: 'post.update',
    postId: input.id,
    postSlug: v.slug,
    postTitle: v.title,
    detail: {
      status: v.status,
      ...(oldSlug !== v.slug ? { previousSlug: oldSlug } : {}),
      ...(existing.status !== v.status ? { previousStatus: existing.status } : {}),
    },
  })
  refreshBlog()
  return { ok: true, id: input.id, slug: v.slug, publishedAt: v.publishedAt }
}

export async function setPostStatusAction(id: string, status: PostStatus): Promise<ActionResult> {
  const auth = await authorizeWrite()
  if ('denied' in auth) return auth.denied
  if (status === 'scheduled') return { ok: false, error: 'validation' }
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('platform_blog_posts')
    .select('slug, title, published_at, body')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'not_found' }
  if (status === 'published' && !(existing.body as string)?.trim()) {
    return { ok: false, error: 'validation', errors: { body: 'required_to_publish' } }
  }
  const previous = existing.published_at as string | null
  // Unpublishing keeps the old date so re-publishing restores it; a future or missing date becomes "now".
  const update =
    status === 'draft'
      ? { status }
      : { status, published_at: previous && Date.parse(previous) <= Date.now() ? previous : new Date().toISOString() }
  const { error } = await supabase.from('platform_blog_posts').update(update).eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  await recordBlogAudit({
    actor: auth.admin,
    action: status === 'draft' ? 'post.unpublish' : 'post.publish',
    postId: id,
    postSlug: existing.slug as string,
    postTitle: existing.title as string,
  })
  refreshBlog()
  return { ok: true }
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  const auth = await authorizeWrite()
  if ('denied' in auth) return auth.denied
  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('platform_blog_posts').select('slug, title').eq('id', id).maybeSingle()
  const { error } = await supabase.from('platform_blog_posts').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  await recordBlogAudit({
    actor: auth.admin,
    action: 'post.delete',
    postId: id,
    postSlug: (existing?.slug as string | undefined) ?? null,
    postTitle: (existing?.title as string | undefined) ?? null,
  })
  refreshBlog()
  return { ok: true }
}

export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult> {
  const auth = await authorizeWrite()
  if ('denied' in auth) return auth.denied
  const parsed = validateCategory(input)
  if (!parsed.ok) return { ok: false, error: 'validation', errors: parsed.errors }
  const { name, slug, description, sortOrder } = parsed.value
  const supabase = createAdminClient()
  const columns = { name, slug, description, sort_order: sortOrder }
  const { error } = input.id
    ? await supabase.from('platform_blog_categories').update(columns).eq('id', input.id)
    : await supabase.from('platform_blog_categories').insert(columns)
  if (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'slug_taken', errors: { slug: 'taken' } }
    return { ok: false, error: 'failed' }
  }
  await recordBlogAudit({
    actor: auth.admin,
    action: input.id ? 'category.update' : 'category.create',
    detail: { name, slug },
  })
  refreshBlog()
  return { ok: true }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const auth = await authorizeWrite()
  if ('denied' in auth) return auth.denied
  const { error } = await createAdminClient().from('platform_blog_categories').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  await recordBlogAudit({ actor: auth.admin, action: 'category.delete', detail: { id } })
  refreshBlog()
  return { ok: true }
}
