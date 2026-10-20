'use server'

import { revalidatePath, updateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { BLOG_CACHE_TAG } from '@/lib/content/blog'
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
  | { ok: false; error: 'unauthorized' | 'validation' | 'not_found' | 'slug_taken' | 'failed'; errors?: FieldErrors }

async function isAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return Boolean(user && isAdminEmail(user.email))
}

/** Expire the data cache and every page that renders blog content. */
function refreshBlog() {
  updateTag(BLOG_CACHE_TAG)
  revalidatePath('/blog')
  revalidatePath('/blog/[slug]', 'page')
  revalidatePath('/')
  revalidatePath('/sitemap.xml')
}

const isUniqueViolation = (error: { code?: string } | null) => error?.code === '23505'

export async function savePostAction(input: PostInput): Promise<ActionResult<{ id: string; slug: string; publishedAt: string | null }>> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' }
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
    refreshBlog()
    return { ok: true, id: data.id as string, slug: v.slug, publishedAt: v.publishedAt }
  }

  const { data: existing, error: loadError } = await supabase
    .from('platform_blog_posts')
    .select('slug')
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
  refreshBlog()
  return { ok: true, id: input.id, slug: v.slug, publishedAt: v.publishedAt }
}

export async function setPostStatusAction(id: string, status: PostStatus): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' }
  if (status === 'scheduled') return { ok: false, error: 'validation' }
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('platform_blog_posts')
    .select('published_at, body')
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
  refreshBlog()
  return { ok: true }
}

export async function deletePostAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' }
  const { error } = await createAdminClient().from('platform_blog_posts').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  refreshBlog()
  return { ok: true }
}

export async function saveCategoryAction(input: CategoryInput): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' }
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
  refreshBlog()
  return { ok: true }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'unauthorized' }
  const { error } = await createAdminClient().from('platform_blog_categories').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  refreshBlog()
  return { ok: true }
}
