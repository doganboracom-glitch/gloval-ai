import { z } from 'zod'
import {
  BLOG_MAX_POSTS,
  isPostLive,
  sanitizeBlogBody,
  uniquePostSlug,
  type BlogPost,
  type BlogStatus,
} from '@/lib/blog'
import { unresolvedClaims, type BlogClaimFinding } from '@/lib/blog-trust'

/**
 * Blog write rules (create / update / delete) with every side effect injected,
 * so the gates (plan, sample, claims, slug, cap) and the IndexNow triggers are
 * unit-testable. The server actions in `lib/blog-actions.ts` wire real deps.
 */

export const blogInputSchema = z.object({
  title: z.string().max(1000),
  body: z.string().max(200_000),
  slug: z.string().max(200).nullish(),
  excerpt: z.string().max(5000).nullish(),
  keywords: z.array(z.string().max(200)).max(50).optional(),
  seoTitle: z.string().max(1000).nullish(),
  metaDescription: z.string().max(5000).nullish(),
  coverUrl: z.string().max(2000).nullish(),
  coverAlt: z.string().max(500).nullish(),
  status: z.enum(['draft', 'published', 'scheduled']),
  publishAt: z.string().max(40).nullish(),
  indexable: z.boolean().optional(),
  approvals: z.array(z.string().max(100)).max(200).optional(),
  confirmSample: z.boolean().optional(),
})

export type BlogInput = z.infer<typeof blogInputSchema>

/** Server-decided provenance. Never taken from the client. */
export type BlogProvenance = { sample?: boolean; aiGenerated?: boolean; personalized?: boolean }

export type BlogRecord = Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt'>

export type BlogStore = {
  count(projectId: string): Promise<number>
  slugs(projectId: string): Promise<string[]>
  get(projectId: string, id: string): Promise<BlogPost | null>
  insert(projectId: string, record: BlogRecord): Promise<BlogPost>
  update(projectId: string, id: string, record: BlogRecord): Promise<BlogPost>
  remove(projectId: string, id: string): Promise<void>
}

export type BlogWriteDeps = {
  store: BlogStore
  /** True when the owner's subscription is suspended: publishing is blocked, drafts are not. */
  suspended(projectId: string): Promise<boolean>
  /** Fire-and-forget IndexNow queueing for the changed post slugs. */
  enqueue(projectId: string, postSlugs: string[], reason: string): Promise<unknown>
  now?: () => Date
}

export type BlogWriteFailure =
  | { ok: false; reason: 'INVALID'; field: 'title' | 'body' | 'input' }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'POST_LIMIT'; limit: number }
  | { ok: false; reason: 'SUBSCRIPTION_SUSPENDED' }
  | { ok: false; reason: 'SAMPLE_CONTENT'; samplePost: boolean; findings: BlogClaimFinding[] }

export type BlogWriteResult = { ok: true; post: BlogPost } | BlogWriteFailure

const KEYWORDS_MAX = 10

function clip(value: string | null | undefined, max: number): string | null {
  const text = (value ?? '').trim()
  return text ? text.slice(0, max) : null
}

function cleanKeywords(keywords: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  for (const raw of keywords ?? []) {
    const word = raw.trim().slice(0, 40)
    if (word) seen.add(word)
    if (seen.size >= KEYWORDS_MAX) break
  }
  return [...seen]
}

/** Cover images are https or site-relative; anything else (javascript:, data:) is dropped. */
export function safeCoverUrl(value: string | null | undefined): string | null {
  const url = (value ?? '').trim()
  if (!url) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

type Timing = { status: BlogStatus; publishedAt: string | null; goesPublic: boolean }

/** `scheduled` is stored as `published` with a future time: readers only look at the clock. */
function resolveTiming(input: BlogInput, existing: BlogPost | null, now: Date): Timing {
  if (input.status === 'draft') return { status: 'draft', publishedAt: null, goesPublic: false }
  const requested = input.publishAt ? Date.parse(input.publishAt) : NaN
  if (!Number.isNaN(requested)) {
    return { status: 'published', publishedAt: new Date(requested).toISOString(), goesPublic: true }
  }
  if (input.status === 'published' && existing?.status === 'published' && existing.publishedAt) {
    return { status: 'published', publishedAt: existing.publishedAt, goesPublic: true }
  }
  return { status: 'published', publishedAt: now.toISOString(), goesPublic: true }
}

type Prepared = { ok: true; record: BlogRecord; wantsPublish: boolean } | BlogWriteFailure

async function prepare(
  deps: BlogWriteDeps,
  projectId: string,
  input: BlogInput,
  existing: BlogPost | null,
  provenance: BlogProvenance,
): Promise<Prepared> {
  const now = (deps.now ?? (() => new Date()))()
  const title = input.title.trim().slice(0, 200)
  if (!title) return { ok: false, reason: 'INVALID', field: 'title' }
  const body = sanitizeBlogBody(input.body)
  const timing = resolveTiming(input, existing, now)

  let sample = existing?.sample ?? provenance.sample ?? false
  if (timing.goesPublic) {
    if (await deps.suspended(projectId)) return { ok: false, reason: 'SUBSCRIPTION_SUSPENDED' }
    const findings = unresolvedClaims(body, input.approvals)
    const sampleBlocked = sample && input.confirmSample !== true
    if (sampleBlocked || findings.length > 0) {
      return { ok: false, reason: 'SAMPLE_CONTENT', samplePost: sampleBlocked, findings }
    }
    sample = false
  }

  const taken = (await deps.store.slugs(projectId)).filter((slug) => slug !== existing?.slug)
  const wantedSlug = input.slug?.trim() || (existing ? existing.slug : title)
  const slug = existing && wantedSlug === existing.slug ? existing.slug : uniquePostSlug(wantedSlug, taken)

  return {
    ok: true,
    wantsPublish: timing.goesPublic,
    record: {
      slug,
      title,
      excerpt: clip(input.excerpt, 300),
      body,
      keywords: cleanKeywords(input.keywords),
      seoTitle: clip(input.seoTitle, 70),
      metaDescription: clip(input.metaDescription, 300),
      coverUrl: safeCoverUrl(input.coverUrl),
      coverAlt: clip(input.coverAlt, 200),
      status: timing.status,
      indexable: input.indexable ?? existing?.indexable ?? true,
      publishedAt: timing.publishedAt,
      aiGenerated: existing?.aiGenerated ?? provenance.aiGenerated ?? false,
      personalized: existing?.personalized ?? provenance.personalized ?? false,
      sample,
    },
  }
}

function pingSlugs(deps: BlogWriteDeps, projectId: string, slugs: string[], reason: string) {
  void deps.enqueue(projectId, [...new Set(slugs)], reason).catch(() => undefined)
}

export async function createBlogPost(
  deps: BlogWriteDeps,
  projectId: string,
  rawInput: unknown,
  provenance: BlogProvenance = {},
): Promise<BlogWriteResult> {
  const parsed = blogInputSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, reason: 'INVALID', field: 'input' }
  if ((await deps.store.count(projectId)) >= BLOG_MAX_POSTS) {
    return { ok: false, reason: 'POST_LIMIT', limit: BLOG_MAX_POSTS }
  }
  const prepared = await prepare(deps, projectId, parsed.data, null, provenance)
  if (!prepared.ok) return prepared
  const post = await deps.store.insert(projectId, prepared.record)
  const now = (deps.now ?? (() => new Date()))()
  if (isPostLive(post, now)) pingSlugs(deps, projectId, [post.slug], 'blog:publish')
  return { ok: true, post }
}

export async function updateBlogPost(
  deps: BlogWriteDeps,
  projectId: string,
  postId: string,
  rawInput: unknown,
): Promise<BlogWriteResult> {
  const parsed = blogInputSchema.safeParse(rawInput)
  if (!parsed.success) return { ok: false, reason: 'INVALID', field: 'input' }
  const existing = await deps.store.get(projectId, postId)
  if (!existing) return { ok: false, reason: 'NOT_FOUND' }
  const prepared = await prepare(deps, projectId, parsed.data, existing, {})
  if (!prepared.ok) return prepared
  const post = await deps.store.update(projectId, postId, prepared.record)
  const now = (deps.now ?? (() => new Date()))()
  const wasLive = isPostLive(existing, now)
  const isLive = isPostLive(post, now)
  if (wasLive || isLive) {
    const reason = wasLive && !isLive ? 'blog:unpublish' : wasLive ? 'blog:update' : 'blog:publish'
    pingSlugs(deps, projectId, [existing.slug, post.slug], reason)
  }
  return { ok: true, post }
}

export type PersonalizedContent = Pick<
  BlogInput,
  'title' | 'body' | 'excerpt' | 'keywords' | 'seoTitle' | 'metaDescription' | 'coverAlt'
>

/** The writable columns of a stored post, used to restore a post after a failed charge. */
export function recordOf(post: BlogPost): BlogRecord {
  const { id: _id, createdAt: _created, updatedAt: _updated, ...record } = post
  return record
}

/**
 * First-setup / sample drafts become the owner's own text: the content is
 * replaced by a validated rewrite built from the owner's facts, and the post is
 * marked `personalized` (no longer a sample). `indexable` only flips to true
 * when the caller passes the owner's confirmation. Slug, status, publish time
 * and cover stay as they were so published URLs never change.
 */
export async function personalizeBlogPost(
  deps: BlogWriteDeps,
  projectId: string,
  postId: string,
  content: PersonalizedContent,
  options: { indexable: boolean },
): Promise<
  | { ok: true; post: BlogPost; previous: BlogPost }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_PERSONALIZED' | 'INVALID' }
> {
  const existing = await deps.store.get(projectId, postId)
  if (!existing) return { ok: false, reason: 'NOT_FOUND' }
  if (existing.personalized && !existing.sample) return { ok: false, reason: 'ALREADY_PERSONALIZED' }
  const title = content.title.trim().slice(0, 200)
  const body = sanitizeBlogBody(content.body)
  if (!title || !body) return { ok: false, reason: 'INVALID' }
  const record: BlogRecord = {
    ...recordOf(existing),
    title,
    body,
    excerpt: clip(content.excerpt, 300),
    keywords: cleanKeywords(content.keywords),
    seoTitle: clip(content.seoTitle, 70),
    metaDescription: clip(content.metaDescription, 300),
    coverAlt: existing.coverUrl ? existing.coverAlt : clip(content.coverAlt, 200),
    personalized: true,
    sample: false,
    indexable: options.indexable ? true : existing.indexable,
  }
  const post = await deps.store.update(projectId, postId, record)
  const now = (deps.now ?? (() => new Date()))()
  if (isPostLive(existing, now) || isPostLive(post, now)) pingSlugs(deps, projectId, [post.slug], 'blog:update')
  return { ok: true, post, previous: existing }
}

export async function deleteBlogPost(
  deps: BlogWriteDeps,
  projectId: string,
  postId: string,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' }> {
  const existing = await deps.store.get(projectId, postId)
  if (!existing) return { ok: false, reason: 'NOT_FOUND' }
  await deps.store.remove(projectId, postId)
  const now = (deps.now ?? (() => new Date()))()
  if (isPostLive(existing, now)) pingSlugs(deps, projectId, [existing.slug], 'blog:delete')
  return { ok: true }
}
