'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { createBlogWriteDeps, listProjectBlogPosts } from '@/lib/blog-store'
import type { BlogPost } from '@/lib/blog'
import { runStarterBlogNow } from '@/lib/starter-blog-server'
import type { StarterErrorCode } from '@/lib/starter-blog'
import { isStorefront, websiteSchema } from '@/lib/website-schema'
import {
  createBlogPost,
  deleteBlogPost,
  markBlogPostPersonalized,
  updateBlogPost,
  type BlogWriteFailure,
  type BlogWriteResult,
} from '@/lib/blog-write'

type Access = { ok: true; slug: string | null; ownerId: string } | { ok: false; reason: 'UNAUTHENTICATED' | 'NOT_FOUND' }

/**
 * Only the project's owner (or a verified admin, same rule as project edits)
 * may write. The session client sees the project only through RLS ownership.
 */
async function authorize(projectId: string): Promise<Access> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: 'UNAUTHENTICATED' }

  const { data: owned } = await supabase
    .from('projects')
    .select('id, slug, owner_id')
    .eq('id', projectId)
    .maybeSingle()
  if (owned) return { ok: true, slug: (owned.slug as string | null) ?? null, ownerId: owned.owner_id as string }

  if (isAdminEmail(user.email ?? null)) {
    const { data } = await createAdminClient()
      .from('projects')
      .select('id, slug, owner_id')
      .eq('id', projectId)
      .maybeSingle()
    if (data) return { ok: true, slug: (data.slug as string | null) ?? null, ownerId: data.owner_id as string }
  }
  return { ok: false, reason: 'NOT_FOUND' }
}

function refresh(slug: string | null) {
  if (!slug) return
  revalidatePath(`/site/${slug}/blog`)
  revalidatePath(`/site/${slug}`, 'layout')
}

type Denied = Extract<Access, { ok: false }>

export async function listBlogPostsAction(
  projectId: string,
): Promise<{ ok: true; posts: BlogPost[] } | Denied> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  try {
    return { ok: true, posts: await listProjectBlogPosts(projectId) }
  } catch {
    return { ok: true, posts: [] }
  }
}

export async function createBlogPostAction(projectId: string, input: unknown): Promise<BlogWriteResult | Denied> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  const result = await createBlogPost(createBlogWriteDeps(projectId, access.slug), projectId, input)
  if (result.ok) refresh(access.slug)
  return result
}

export async function updateBlogPostAction(
  projectId: string,
  postId: string,
  input: unknown,
): Promise<BlogWriteResult | Denied> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  const result = await updateBlogPost(createBlogWriteDeps(projectId, access.slug), projectId, postId, input)
  if (result.ok) refresh(access.slug)
  return result
}

export async function deleteBlogPostAction(
  projectId: string,
  postId: string,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' } | Denied> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  const result = await deleteBlogPost(createBlogWriteDeps(projectId, access.slug), projectId, postId)
  if (result.ok) refresh(access.slug)
  return result
}

export async function markBlogPostPersonalizedAction(
  projectId: string,
  postId: string,
): Promise<{ ok: true; post: BlogPost } | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_PERSONALIZED' } | Denied> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  const result = await markBlogPostPersonalized(createBlogWriteDeps(projectId, access.slug), projectId, postId)
  if (result.ok) refresh(access.slug)
  return result
}

/** One click for existing sites: the same three free starter posts a new site gets at first publish. */
export async function addStarterBlogPostsAction(
  projectId: string,
): Promise<
  | { ok: true; posts: BlogPost[]; failed: number }
  | { ok: false; reason: 'already_added' | 'in_progress' | StarterErrorCode }
  | Denied
> {
  const access = await authorize(projectId)
  if (!access.ok) return access
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('name, language, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { ok: false, reason: 'NOT_FOUND' }
  const parsed = websiteSchema.safeParse(project.schema_data)
  const site = {
    name: parsed.success ? parsed.data.meta.name : String(project.name ?? ''),
    description: parsed.success ? parsed.data.meta.description : '',
    storefront: parsed.success ? isStorefront(parsed.data) : false,
  }
  const result = await runStarterBlogNow({
    projectId,
    ownerId: access.ownerId,
    siteSlug: access.slug,
    site,
    lang: project.language === 'en' ? 'en' : 'tr',
  })
  if (result.status === 'created') {
    refresh(access.slug)
    return { ok: true, posts: result.posts, failed: result.failed }
  }
  if (result.status === 'skipped') return { ok: false, reason: result.reason }
  return { ok: false, reason: result.code }
}

export type { BlogWriteFailure }
