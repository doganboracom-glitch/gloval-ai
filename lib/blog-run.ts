import type { BlogPost } from '@/lib/blog'
import type { BlogAiOutput } from '@/lib/blog-ai'
import { hasBusinessAnswers } from '@/lib/blog-ai'
import {
  createBlogPost,
  deleteBlogPost,
  personalizeBlogPost,
  recordOf,
  type BlogWriteDeps,
} from '@/lib/blog-write'
import type { BlogProfile } from '@/lib/website-schema'

/**
 * Credit-safe orchestration of the two AI blog flows (write a new draft,
 * personalize an existing draft) with every side effect injected so the rules
 * are unit-testable:
 *
 *  - credits are checked up front but CHARGED only after a validated post has
 *    been stored; any failure after that point rolls the write back;
 *  - a `requestId` makes the charge idempotent: the same id never charges twice
 *    (in-flight guard on one instance, ledger lookup across instances), so a
 *    double click or a retried request cannot double-bill.
 */

export type BlogRunDeps = {
  write: BlogWriteDeps
  /** Credits charged for one delivered post. */
  cost: number
  balance(): Promise<number>
  charge(reason: string): Promise<{ ok: boolean; balance: number }>
  /** True when the user's ledger already holds this exact reason. Fails closed. */
  alreadyCharged(reason: string): Promise<boolean>
  /** Throws when the model fails, times out or cannot satisfy the schema. */
  generate(input: { topic: string; answers: BlogProfile; draft?: string }): Promise<BlogAiOutput>
  /** Shared across requests of one server instance. */
  inflight: Set<string>
}

export type BlogRunFailure = {
  ok: false
  status: 400 | 402 | 404 | 409 | 422 | 502
  error: string
  balance?: number
}

export type BlogRunResult =
  | { ok: true; post: BlogPost; charged: number; balance: number }
  | BlogRunFailure

const fail = (status: BlogRunFailure['status'], error: string, balance?: number): BlogRunFailure => ({
  ok: false,
  status,
  error,
  ...(balance === undefined ? {} : { balance }),
})

/** Runs `work` once per reason; a repeat of the same reason is refused as `duplicate`. */
async function once(
  deps: BlogRunDeps,
  userId: string,
  reason: string,
  work: () => Promise<BlogRunResult>,
): Promise<BlogRunResult> {
  const key = `${userId}:${reason}`
  if (deps.inflight.has(key)) return fail(409, 'duplicate')
  deps.inflight.add(key)
  try {
    if (await deps.alreadyCharged(reason)) return fail(409, 'duplicate')
    return await work()
  } finally {
    deps.inflight.delete(key)
  }
}

export async function runBlogWrite(
  deps: BlogRunDeps,
  args: { userId: string; projectId: string; requestId: string; topic: string; answers: BlogProfile },
): Promise<BlogRunResult> {
  const reason = `blogWrite:${args.requestId}`
  return once(deps, args.userId, reason, async () => {
    const balance = await deps.balance()
    if (balance < deps.cost) return fail(402, 'Out of credits', balance)

    let output: BlogAiOutput
    try {
      output = await deps.generate({ topic: args.topic, answers: args.answers })
    } catch {
      return fail(502, 'generation_failed')
    }

    const created = await createBlogPost(
      deps.write,
      args.projectId,
      {
        title: output.title,
        body: output.body,
        excerpt: output.excerpt,
        keywords: output.keywords,
        seoTitle: output.seoTitle,
        metaDescription: output.metaDescription,
        coverAlt: output.coverAlt,
        status: 'draft',
      },
      { aiGenerated: true, personalized: hasBusinessAnswers(args.answers) },
    )
    if (!created.ok) return fail(created.reason === 'POST_LIMIT' ? 409 : 422, created.reason)

    if (await deps.alreadyCharged(reason)) {
      await deleteBlogPost(deps.write, args.projectId, created.post.id).catch(() => undefined)
      return fail(409, 'duplicate')
    }
    const charge = await deps.charge(reason)
    if (!charge.ok) {
      await deleteBlogPost(deps.write, args.projectId, created.post.id).catch(() => undefined)
      return fail(402, 'Out of credits', charge.balance)
    }
    return { ok: true, post: created.post, charged: deps.cost, balance: charge.balance }
  })
}

export async function runBlogPersonalize(
  deps: BlogRunDeps,
  args: {
    userId: string
    projectId: string
    postId: string
    requestId: string
    answers: BlogProfile
    /** The owner approved that the rewritten post becomes indexable. */
    confirmed: boolean
  },
): Promise<BlogRunResult> {
  if (!args.confirmed) return fail(400, 'confirmation_required')
  if (!hasBusinessAnswers(args.answers)) return fail(422, 'answers_required')
  const reason = `blogPersonalize:${args.requestId}`
  return once(deps, args.userId, reason, async () => {
    const existing = await deps.write.store.get(args.projectId, args.postId)
    if (!existing) return fail(404, 'NOT_FOUND')
    if (existing.personalized && !existing.sample) return fail(409, 'ALREADY_PERSONALIZED')

    const balance = await deps.balance()
    if (balance < deps.cost) return fail(402, 'Out of credits', balance)

    let output: BlogAiOutput
    try {
      output = await deps.generate({ topic: existing.title, answers: args.answers, draft: existing.body })
    } catch {
      return fail(502, 'generation_failed')
    }

    const result = await personalizeBlogPost(deps.write, args.projectId, args.postId, output, { indexable: true })
    if (!result.ok) return fail(result.reason === 'NOT_FOUND' ? 404 : 422, result.reason)

    const restore = () =>
      deps.write.store.update(args.projectId, args.postId, recordOf(result.previous)).catch(() => undefined)
    if (await deps.alreadyCharged(reason)) {
      await restore()
      return fail(409, 'duplicate')
    }
    const charge = await deps.charge(reason)
    if (!charge.ok) {
      await restore()
      return fail(402, 'Out of credits', charge.balance)
    }
    return { ok: true, post: result.post, charged: deps.cost, balance: charge.balance }
  })
}
