import { z } from 'zod'
import type { BlogPost } from '@/lib/blog'
import { BLOG_AI_LIMITS, hasBusinessAnswers } from '@/lib/blog-ai'
import { runBlogPersonalize, runBlogWrite, type BlogRunDeps, type BlogRunFailure, type BlogRunResult } from '@/lib/blog-run'
import { updateBlogPost } from '@/lib/blog-write'
import type { BlogProfile } from '@/lib/website-schema'

/**
 * Blog operations the AI editor can request from a chat instruction:
 * `createPost`, `personalizePost`, `setPostStatus`.
 *
 * Posts live in their own table (not in the site schema), so these are never
 * applied by the schema reducer. `/api/edit` only RECOGNISES the instruction;
 * `/api/blog/operation` EXECUTES it through the same credit-safe, gated
 * functions the Blog tab uses. Nothing here can bypass a gate:
 *  - createPost / personalizePost charge 3 credits only for a stored result and
 *    need the owner's explicit confirmation;
 *  - setPostStatus is free, never confirms a sample post and never skips the
 *    claim check or the subscription gate.
 */

export const blogOperationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('createPost'), topic: z.string().trim().min(3).max(BLOG_AI_LIMITS.topic) }),
  z.object({ op: z.literal('personalizePost'), postId: z.string().min(1).max(100).optional() }),
  z.object({
    op: z.literal('setPostStatus'),
    status: z.enum(['draft', 'published']),
    postId: z.string().min(1).max(100).optional(),
    postTitle: z.string().trim().min(1).max(200).optional(),
  }),
])

export type BlogOperation = z.infer<typeof blogOperationSchema>

/** True when the operation spends credits and so needs the owner's confirmation. */
export function blogOperationCostsCredits(operation: BlogOperation): boolean {
  return operation.op !== 'setPostStatus'
}

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (ch) => TR_FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const has = (folded: string, pattern: RegExp) => pattern.test(folded)

function cleanTopic(raw: string): string {
  return raw
    .replace(/["“”'‘’]/g, '')
    .replace(/\b(bir|a|an|the)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.!?,;:]+$/g, '')
    .trim()
    .slice(0, BLOG_AI_LIMITS.topic)
}

function extractTopic(text: string): string | null {
  const english = text.match(/\b(?:about|on|regarding)\s+(.+)$/i)
  const turkish = text.match(/^(.+?)\s+(?:hakkında|hakkinda|konusunda|üzerine|uzerine|ile ilgili|ilgili)\b/i)
  const topic = cleanTopic(english?.[1] ?? turkish?.[1] ?? '')
    .replace(/\b(blog|yazısı|yazisi|yazi|post|article)\b/gi, ' ')
    .replace(/\b(bana|bir|yaz|oluştur|olustur|ekle|üret|uret|write|create|add|generate|please|lütfen|lutfen)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return topic.length >= 3 ? topic : null
}

function quotedTitle(text: string): string | null {
  const match = text.match(/["“'‘](.{1,200}?)["”'’]/)
  return match?.[1]?.trim() || null
}

/**
 * Deterministic recogniser for blog instructions (TR/EN). It only fires when
 * the instruction names the blog, so ordinary site edits ("sayfayı yayınla")
 * are never hijacked. Returns null for anything it does not clearly understand.
 */
export function parseBlogInstruction(instruction: string): BlogOperation | null {
  const text = instruction.trim()
  if (text.length < 5 || text.length > 600) return null
  const folded = fold(text)
  if (!has(folded, /\bblog\b/)) return null

  if (has(folded, /\b(ozellestir|personalize|personalise|firmama uyarla|firmama gore)\w*/)) {
    return { op: 'personalizePost' }
  }

  const unpublish = has(folded, /\b(taslaga|taslak yap|yayindan kaldir|yayini kaldir|unpublish|back to draft|set to draft)\b/)
  const publish = !unpublish && has(folded, /\b(yayinla|yayina al|yayima al|publish)\b/)
  if (unpublish || publish) {
    const postTitle = quotedTitle(text)
    return { op: 'setPostStatus', status: publish ? 'published' : 'draft', ...(postTitle ? { postTitle } : {}) }
  }

  if (has(folded, /\b(yaz|olustur|ekle|uret|write|create|add|generate|draft)\w*/)) {
    const topic = extractTopic(text)
    if (topic) return { op: 'createPost', topic }
  }
  return null
}

const fail = (status: BlogRunFailure['status'], error: string): BlogRunFailure => ({ ok: false, status, error })

const sameTitle = (a: string, b: string) => fold(a).trim() === fold(b).trim()

function byRecent(posts: readonly BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** The post a personalize request means: the given one, else the newest unpersonalised/sample draft. */
export function pickPersonalizeTarget(posts: readonly BlogPost[], postId?: string): BlogPost | null {
  if (postId) return posts.find((post) => post.id === postId) ?? null
  return byRecent(posts).find((post) => post.sample || !post.personalized) ?? null
}

/** The post a status change means: by id, then by title, else the newest one that can change. */
export function pickStatusTarget(
  posts: readonly BlogPost[],
  operation: Extract<BlogOperation, { op: 'setPostStatus' }>,
): BlogPost | null {
  if (operation.postId) return posts.find((post) => post.id === operation.postId) ?? null
  if (operation.postTitle) {
    const wanted = operation.postTitle
    return posts.find((post) => sameTitle(post.title, wanted)) ?? null
  }
  const wantedFrom = operation.status === 'published' ? 'draft' : 'published'
  return byRecent(posts).find((post) => post.status === wantedFrom) ?? null
}

function statusInput(post: BlogPost, status: 'draft' | 'published') {
  return {
    title: post.title,
    body: post.body,
    slug: post.slug,
    excerpt: post.excerpt,
    keywords: post.keywords,
    seoTitle: post.seoTitle,
    metaDescription: post.metaDescription,
    coverUrl: post.coverUrl,
    coverAlt: post.coverAlt,
    indexable: post.indexable,
    status,
  }
}

export type BlogOperationArgs = {
  userId: string
  projectId: string
  requestId: string
  operation: BlogOperation
  /** The site's remembered business answers: the only company facts a post may use. */
  profile: BlogProfile
  /** The owner approved the credit spend (and, for personalize, indexing). */
  confirmed: boolean
  posts: readonly BlogPost[]
}

export async function executeBlogOperation(deps: BlogRunDeps, args: BlogOperationArgs): Promise<BlogRunResult> {
  const { operation } = args

  if (operation.op === 'setPostStatus') {
    const target = pickStatusTarget(args.posts, operation)
    if (!target) return fail(404, 'NOT_FOUND')
    const result = await updateBlogPost(deps.write, args.projectId, target.id, statusInput(target, operation.status))
    if (result.ok) return { ok: true, post: result.post, charged: 0, balance: await deps.balance() }
    if (result.reason === 'NOT_FOUND') return fail(404, 'NOT_FOUND')
    if (result.reason === 'SAMPLE_CONTENT') return fail(409, 'sample_content')
    if (result.reason === 'SUBSCRIPTION_SUSPENDED') return fail(409, 'suspended')
    return fail(422, result.reason)
  }

  if (!args.confirmed) return fail(400, 'confirmation_required')

  if (operation.op === 'createPost') {
    return runBlogWrite(deps, {
      userId: args.userId,
      projectId: args.projectId,
      requestId: args.requestId,
      topic: operation.topic,
      answers: args.profile,
    })
  }

  if (!hasBusinessAnswers(args.profile)) return fail(422, 'answers_required')
  const target = pickPersonalizeTarget(args.posts, operation.postId)
  if (!target) return fail(404, 'NOT_FOUND')
  return runBlogPersonalize(deps, {
    userId: args.userId,
    projectId: args.projectId,
    postId: target.id,
    requestId: args.requestId,
    answers: args.profile,
    confirmed: true,
  })
}
