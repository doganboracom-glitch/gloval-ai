import { createHmac } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteSeoContext } from '@/lib/seo/site-seo'
import {
  INDEXNOW_BATCH_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_MAX_ATTEMPTS,
  INDEXNOW_MAX_URLS_PER_ENQUEUE,
  INDEXNOW_MAX_URLS_PER_RUN,
  blogUrls,
  buildIndexNowBody,
  chunk,
  groupByHost,
  isIndexNowAccepted,
  retryDelayMs,
  sitePageUrls,
  type QueueRow,
} from '@/lib/indexnow'
import type { WebsiteSchema } from '@/lib/website-schema'

type Admin = ReturnType<typeof createAdminClient>

/** HMAC secret. Without one IndexNow is simply off: nothing is queued or sent. */
function indexNowSecret(): string | null {
  return process.env.INDEXNOW_SECRET || process.env.CRON_SECRET || null
}

/**
 * Per-project key: HMAC-SHA256 over the project id, 32 lowercase hex chars
 * (valid IndexNow key alphabet). Deterministic, so the key file needs no
 * storage, and unguessable without the server secret.
 */
export function deriveIndexNowKey(projectId: string, secret: string): string {
  return createHmac('sha256', secret).update(`indexnow-key-v1:${projectId}`).digest('hex').slice(0, 32)
}

export function indexNowKeyForProject(projectId: string): string | null {
  const secret = indexNowSecret()
  return secret ? deriveIndexNowKey(projectId, secret) : null
}

export async function indexNowKeyForSlug(slug: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from('projects').select('id').eq('slug', slug).maybeSingle()
    return data?.id ? indexNowKeyForProject(data.id as string) : null
  } catch {
    return null
  }
}

/**
 * Queues URLs for the next cron run. Best effort: an editor action must never
 * fail because the queue did. Re-queuing a URL resets its back-off.
 */
export async function enqueueIndexUrls(
  projectId: string,
  urls: readonly string[],
  reason: string,
  admin?: Admin,
): Promise<number> {
  if (!indexNowSecret()) return 0
  const unique = [...new Set(urls)].filter((url) => url.startsWith('https://')).slice(0, INDEXNOW_MAX_URLS_PER_ENQUEUE)
  if (unique.length === 0) return 0
  try {
    const { error } = await (admin ?? createAdminClient()).from('index_queue').upsert(
      unique.map((url) => ({
        project_id: projectId,
        url,
        reason,
        attempts: 0,
        next_run_at: new Date().toISOString(),
      })),
      { onConflict: 'project_id,url' },
    )
    if (error) throw error
    return unique.length
  } catch (err) {
    console.log('[indexnow] enqueue failed:', err instanceof Error ? err.message : 'unknown')
    return 0
  }
}

/** A site's pages were published, updated or taken down. */
export async function enqueueSitePages(
  projectId: string,
  slug: string,
  schema: WebsiteSchema,
  reason: string,
): Promise<number> {
  try {
    const { origin } = await getSiteSeoContext(slug)
    return await enqueueIndexUrls(projectId, sitePageUrls(origin, schema), reason)
  } catch (err) {
    console.log('[indexnow] page enqueue failed:', err instanceof Error ? err.message : 'unknown')
    return 0
  }
}

/** A blog post was published, updated, unpublished or deleted. */
export async function enqueueBlogPosts(
  projectId: string,
  slug: string,
  postSlugs: readonly string[],
  reason: string,
): Promise<number> {
  try {
    const { origin } = await getSiteSeoContext(slug)
    return await enqueueIndexUrls(projectId, blogUrls(origin, postSlugs), reason)
  } catch (err) {
    console.log('[indexnow] blog enqueue failed:', err instanceof Error ? err.message : 'unknown')
    return 0
  }
}

/** A site went live or was taken down: its blog index and every live post change status with it. */
export async function enqueueLiveBlog(projectId: string, slug: string, reason: string): Promise<number> {
  try {
    const { data } = await createAdminClient()
      .from('site_blog_posts')
      .select('slug')
      .eq('project_id', projectId)
      .eq('status', 'published')
      .eq('sample', false)
      .eq('indexable', true)
      .lte('published_at', new Date().toISOString())
      .limit(INDEXNOW_MAX_URLS_PER_ENQUEUE - 1)
    return await enqueueBlogPosts(
      projectId,
      slug,
      (data ?? []).map((row) => row.slug as string),
      reason,
    )
  } catch (err) {
    console.log('[indexnow] live blog enqueue failed:', err instanceof Error ? err.message : 'unknown')
    return 0
  }
}

export type DispatchResult = {
  skipped?: 'not_configured'
  sent: number
  retried: number
  dropped: number
}

export type DispatchOptions = {
  deadlineMs: number
  limit?: number
  now?: number
  fetchImpl?: typeof fetch
}

async function postBatch(
  fetchImpl: typeof fetch,
  host: string,
  key: string,
  urls: readonly string[],
  deadlineMs: number,
): Promise<number> {
  let status = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadlineMs - Date.now()
    if (remaining <= 250) break
    try {
      const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(buildIndexNowBody(host, key, urls)),
        signal: AbortSignal.timeout(Math.min(remaining, 5_000)),
      })
      status = response.status
      if (isIndexNowAccepted(status) || (status >= 400 && status < 500)) return status
    } catch {
      status = 0
    }
  }
  return status
}

/**
 * Sends due queue rows, one request per (project, host) batch, inside the time
 * budget. Accepted rows are deleted; failed rows back off (attempts, next_run_at)
 * and are dropped after INDEXNOW_MAX_ATTEMPTS. Never throws on a failed send.
 */
export async function dispatchIndexQueue(admin: Admin, options: DispatchOptions): Promise<DispatchResult> {
  const secret = indexNowSecret()
  const result: DispatchResult = { sent: 0, retried: 0, dropped: 0 }
  if (!secret) return { ...result, skipped: 'not_configured' }

  const now = options.now ?? Date.now()
  const fetchImpl = options.fetchImpl ?? fetch
  const { data, error } = await admin
    .from('index_queue')
    .select('id, project_id, url, attempts')
    .lte('next_run_at', new Date(now).toISOString())
    .order('next_run_at', { ascending: true })
    .limit(Math.min(options.limit ?? INDEXNOW_MAX_URLS_PER_RUN, INDEXNOW_MAX_URLS_PER_RUN))
  if (error) throw error

  const { groups, invalid } = groupByHost((data ?? []) as QueueRow[])
  const deleteIds = async (ids: number[]) => {
    if (ids.length > 0) await admin.from('index_queue').delete().in('id', ids)
  }
  if (invalid.length > 0) {
    await deleteIds(invalid.map((row) => row.id))
    result.dropped += invalid.length
  }

  outer: for (const group of groups) {
    const key = deriveIndexNowKey(group.projectId, secret)
    for (const batch of chunk(group.rows, INDEXNOW_BATCH_SIZE)) {
      if (Date.now() >= options.deadlineMs) break outer
      const status = await postBatch(
        fetchImpl,
        group.host,
        key,
        batch.map((row) => row.url),
        options.deadlineMs,
      )
      if (isIndexNowAccepted(status)) {
        await deleteIds(batch.map((row) => row.id))
        result.sent += batch.length
        continue
      }
      const exhausted = batch.filter((row) => row.attempts + 1 >= INDEXNOW_MAX_ATTEMPTS)
      await deleteIds(exhausted.map((row) => row.id))
      result.dropped += exhausted.length
      const byAttempts = new Map<number, number[]>()
      for (const row of batch) {
        if (row.attempts + 1 >= INDEXNOW_MAX_ATTEMPTS) continue
        const ids = byAttempts.get(row.attempts + 1) ?? []
        ids.push(row.id)
        byAttempts.set(row.attempts + 1, ids)
      }
      for (const [attempts, ids] of byAttempts) {
        await admin
          .from('index_queue')
          .update({ attempts, next_run_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString() })
          .in('id', ids)
        result.retried += ids.length
      }
    }
  }
  return result
}

const SCHEDULED_LOOKBACK_MS = 25 * 60 * 60_000

/**
 * Posts scheduled for a future time were not queued when saved (they were not
 * public yet). Queue the ones that went live since the last run. A post saved
 * as live has `updated_at >= published_at`; a scheduled one was last saved
 * before its publish time.
 */
export async function enqueueDueScheduledPosts(admin: Admin, now: number = Date.now()): Promise<number> {
  const { data, error } = await admin
    .from('site_blog_posts')
    .select('project_id, slug, published_at, updated_at, projects!inner(slug)')
    .eq('status', 'published')
    .eq('sample', false)
    .lte('published_at', new Date(now).toISOString())
    .gte('published_at', new Date(now - SCHEDULED_LOOKBACK_MS).toISOString())
    .limit(200)
  if (error || !data) return 0

  const byProject = new Map<string, { siteSlug: string; posts: string[] }>()
  for (const row of data as unknown as Array<{
    project_id: string
    slug: string
    published_at: string
    updated_at: string
    projects: { slug: string | null } | { slug: string | null }[] | null
  }>) {
    if (Date.parse(row.updated_at) >= Date.parse(row.published_at) - 1000) continue
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
    if (!project?.slug) continue
    const entry = byProject.get(row.project_id) ?? { siteSlug: project.slug, posts: [] }
    entry.posts.push(row.slug)
    byProject.set(row.project_id, entry)
  }

  let queued = 0
  for (const [projectId, entry] of byProject) {
    queued += await enqueueBlogPosts(projectId, entry.siteSlug, entry.posts, 'blog:scheduled')
  }
  return queued
}
