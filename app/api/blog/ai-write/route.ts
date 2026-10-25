import { rejectAnonymous } from '@/lib/api-auth'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { BLOG_AI_LIMITS } from '@/lib/blog-ai'
import { loadBlogRouteContext } from '@/lib/blog-route'
import { runBlogWrite } from '@/lib/blog-run'
import { blogAnswersSchema, requestIdSchema } from '@/lib/blog-request'

// Two model attempts at most (first answer + one validated retry).
export const maxDuration = 300

const bodySchema = z.object({
  projectId: z.string().min(1).max(100),
  requestId: requestIdSchema,
  topic: z.string().trim().min(3).max(BLOG_AI_LIMITS.topic),
  answers: blogAnswersSchema,
})

/**
 * POST /api/blog/ai-write
 *
 * Writes ONE AI draft. The credits (3) are charged only after a validated post
 * has been stored: a failed generation costs nothing, and a repeated
 * `requestId` is refused instead of charged again. The result is always a
 * DRAFT: the owner reviews it and publishes through the normal gate.
 */
export async function POST(req: Request) {
  const anonymous = await rejectAnonymous()
  if (anonymous) return anonymous

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const { projectId, requestId, topic, answers } = parsed.data

  const context = await loadBlogRouteContext(projectId)
  if (context instanceof Response) return context

  const result = await runBlogWrite(context.deps, { userId: context.userId, projectId, requestId, topic, answers })
  if (!result.ok) {
    if (result.error === 'generation_failed') console.error('[blog-ai] generation failed')
    return Response.json({ error: result.error, balance: result.balance }, { status: result.status })
  }
  if (context.slug) revalidatePath(`/site/${context.slug}/blog`)
  return Response.json({ ok: true, post: result.post, charged: result.charged, balance: result.balance })
}
