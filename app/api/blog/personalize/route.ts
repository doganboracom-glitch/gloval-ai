import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { loadBlogRouteContext } from '@/lib/blog-route'
import { runBlogPersonalize } from '@/lib/blog-run'
import { blogAnswersSchema, requestIdSchema } from '@/lib/blog-request'

export const maxDuration = 300

const bodySchema = z.object({
  projectId: z.string().min(1).max(100),
  postId: z.string().min(1).max(100),
  requestId: requestIdSchema,
  answers: blogAnswersSchema,
  /** The owner explicitly approved that the post becomes personalized + indexable. */
  confirmed: z.boolean(),
})

/**
 * POST /api/blog/personalize
 *
 * Rewrites a sample / first-setup draft with the owner's own facts. 3 credits,
 * charged only after the rewrite is stored; a failure restores the original.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const { projectId, postId, requestId, answers, confirmed } = parsed.data

  const context = await loadBlogRouteContext(projectId)
  if (context instanceof Response) return context

  const result = await runBlogPersonalize(context.deps, {
    userId: context.userId,
    projectId,
    postId,
    requestId,
    answers,
    confirmed,
  })
  if (!result.ok) return Response.json({ error: result.error, balance: result.balance }, { status: result.status })
  if (context.slug) revalidatePath(`/site/${context.slug}/blog`)
  return Response.json({ ok: true, post: result.post, charged: result.charged, balance: result.balance })
}
