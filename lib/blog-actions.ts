'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { createBlogWriteDeps } from '@/lib/blog-store'
import {
  createBlogPost,
  deleteBlogPost,
  updateBlogPost,
  type BlogWriteFailure,
  type BlogWriteResult,
} from '@/lib/blog-write'

type Access = { ok: true; slug: string | null } | { ok: false; reason: 'UNAUTHENTICATED' | 'NOT_FOUND' }

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

  const { data: owned } = await supabase.from('projects').select('id, slug').eq('id', projectId).maybeSingle()
  if (owned) return { ok: true, slug: (owned.slug as string | null) ?? null }

  if (isAdminEmail(user.email ?? null)) {
    const { data } = await createAdminClient().from('projects').select('id, slug').eq('id', projectId).maybeSingle()
    if (data) return { ok: true, slug: (data.slug as string | null) ?? null }
  }
  return { ok: false, reason: 'NOT_FOUND' }
}

function refresh(slug: string | null) {
  if (!slug) return
  revalidatePath(`/site/${slug}/blog`)
  revalidatePath(`/site/${slug}`, 'layout')
}

type Denied = Extract<Access, { ok: false }>

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

export type { BlogWriteFailure }
