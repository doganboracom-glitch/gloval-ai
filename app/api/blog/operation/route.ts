import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { loadBlogRouteContext } from '@/lib/blog-route'
import { requestIdSchema } from '@/lib/blog-request'
import { blogOperationSchema, executeBlogOperation } from '@/lib/blog-operations'
import { listProjectBlogPosts } from '@/lib/blog-store'

export const maxDuration = 300

const bodySchema = z.object({
  projectId: z.string().min(1).max(100),
  requestId: requestIdSchema,
  operation: blogOperationSchema,
  /** The owner approved the credit spend; required for createPost and personalizePost. */
  confirmed: z.boolean().optional(),
})

/**
 * POST /api/blog/operation
 *
 * Executes a blog operation recognised from an AI-editor instruction
 * (createPost, personalizePost, setPostStatus) through the same gated,
 * credit-safe functions as the Blog tab. Ownership is verified by
 * `loadBlogRouteContext`; the business facts come from the site's saved
 * profile, never from the request.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const { projectId, requestId, operation, confirmed } = parsed.data

  const context = await loadBlogRouteContext(projectId)
  if (context instanceof Response) return context

  const posts = await listProjectBlogPosts(projectId)
  const result = await executeBlogOperation(context.deps, {
    userId: context.userId,
    projectId,
    requestId,
    operation,
    profile: context.profile,
    confirmed: confirmed === true,
    posts,
  })
  if (!result.ok) return Response.json({ error: result.error, balance: result.balance }, { status: result.status })
  if (context.slug) revalidatePath(`/site/${context.slug}/blog`)
  return Response.json({ ok: true, post: result.post, charged: result.charged, balance: result.balance })
}
