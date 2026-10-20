import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Short audit trail for the platform blog admin: who did what, when, to which
 * post. Writing is best-effort and never throws, so an audit outage can never
 * block an editor; failures are logged instead.
 */

export type BlogAuditAction =
  | 'post.create'
  | 'post.update'
  | 'post.publish'
  | 'post.unpublish'
  | 'post.delete'
  | 'post.ai_draft'
  | 'category.create'
  | 'category.update'
  | 'category.delete'
  | 'media.upload'
  | 'media.delete'

export type BlogAuditEntry = {
  actor: { userId: string; email: string }
  action: BlogAuditAction
  postId?: string | null
  postSlug?: string | null
  postTitle?: string | null
  detail?: Record<string, unknown>
}

export type BlogAuditRow = {
  id: string
  at: string
  actorEmail: string
  action: string
  postId: string | null
  postSlug: string | null
  postTitle: string | null
  detail: Record<string, unknown> | null
}

export async function recordBlogAudit(entry: BlogAuditEntry): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from('platform_blog_audit')
      .insert({
        actor_id: entry.actor.userId,
        actor_email: entry.actor.email,
        action: entry.action,
        post_id: entry.postId ?? null,
        post_slug: entry.postSlug ?? null,
        post_title: entry.postTitle ? entry.postTitle.slice(0, 200) : null,
        detail: entry.detail ?? null,
      })
    if (error) console.error('[blog-audit] insert failed:', error.message)
  } catch (error) {
    console.error('[blog-audit] insert failed:', error instanceof Error ? error.message : error)
  }
}

export async function listBlogAudit(limit = 50): Promise<BlogAuditRow[]> {
  const { data, error } = await createAdminClient()
    .from('platform_blog_audit')
    .select('id, at, actor_email, action, post_id, post_slug, post_title, detail')
    .order('at', { ascending: false })
    .limit(limit)
  if (error) {
    console.error('[blog-audit] list failed:', error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    at: row.at as string,
    actorEmail: row.actor_email as string,
    action: row.action as string,
    postId: (row.post_id as string | null) ?? null,
    postSlug: (row.post_slug as string | null) ?? null,
    postTitle: (row.post_title as string | null) ?? null,
    detail: (row.detail as Record<string, unknown> | null) ?? null,
  }))
}
