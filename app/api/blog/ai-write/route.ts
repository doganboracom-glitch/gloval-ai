import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { resolveAiModel, attemptTimeoutMs } from '@/lib/ai-models'
import { StructuredGenerationError } from '@/lib/ai-structured'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { createBlogWriteDeps } from '@/lib/blog-store'
import { createBlogPost, deleteBlogPost } from '@/lib/blog-write'
import { BLOG_AI_LIMITS, generateBlogPost, hasBusinessAnswers, type BlogLang } from '@/lib/blog-ai'
import { websiteSchema } from '@/lib/website-schema'
import { revalidatePath } from 'next/cache'

// Two model attempts at most (first answer + one validated retry).
export const maxDuration = 300

const GENERATION_BUDGET_MS = 170_000

const answer = z.string().max(BLOG_AI_LIMITS.answer).optional()
const bodySchema = z.object({
  projectId: z.string().min(1).max(100),
  topic: z.string().trim().min(3).max(BLOG_AI_LIMITS.topic),
  answers: z
    .object({ offering: answer, region: answer, difference: answer, audience: answer, contact: answer })
    .default({}),
})

/**
 * POST /api/blog/ai-write
 *
 * Writes ONE AI draft. The credits (3) are charged only after a validated post
 * has been stored: a failed generation costs nothing. Everything goes through
 * the same server write rules as manual posts (`createBlogPost`), and the result
 * is always a DRAFT: the owner reviews it and publishes through the normal gate.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const { projectId, topic, answers } = parsed.data

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let { data: project } = await supabase
    .from('projects')
    .select('id, slug, language, schema_data')
    .eq('id', projectId)
    .maybeSingle()
  if (!project && isAdminEmail(user.email ?? null)) {
    project = (
      await createAdminClient()
        .from('projects')
        .select('id, slug, language, schema_data')
        .eq('id', projectId)
        .maybeSingle()
    ).data
  }
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 })

  const planCode = toPlanCode(await getPlanCodeForUser(user.id))
  const dailyLimit = await checkFreeDailyActionLimit(user.id, planCode)
  if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

  const cost = AI_ACTION_COSTS.blogWrite
  const balance = await getCreditBalance(user.id)
  if (balance < cost) return Response.json({ error: 'Out of credits', balance }, { status: 402 })

  const site = websiteSchema.safeParse(project.schema_data)
  const lang: BlogLang = project.language === 'en' ? 'en' : 'tr'
  const ai = resolveAiModel('blogWrite', planCode)

  let output
  try {
    const result = await generateBlogPost({
      ai,
      abortSignal: AbortSignal.timeout(Math.min(GENERATION_BUDGET_MS, attemptTimeoutMs(ai.model) * 2)),
      input: {
        topic,
        answers,
        lang,
        siteName: site.success ? site.data.meta.name : '',
        siteDescription: site.success ? site.data.meta.description : '',
      },
    })
    output = result.object
  } catch (error) {
    console.error('[blog-ai] generation failed', error instanceof StructuredGenerationError ? error.attempts : 'error')
    return Response.json({ error: 'generation_failed' }, { status: 502 })
  }

  const slug = (project.slug as string | null) ?? null
  const deps = createBlogWriteDeps(projectId, slug)
  const created = await createBlogPost(
    deps,
    projectId,
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
    { aiGenerated: true, personalized: hasBusinessAnswers(answers) },
  )
  if (!created.ok) {
    const status = created.reason === 'POST_LIMIT' ? 409 : 422
    return Response.json({ error: created.reason }, { status })
  }

  const charge = await consumeCredits(user.id, cost, `blogWrite:${created.post.id}`)
  if (!charge.ok) {
    await deleteBlogPost(deps, projectId, created.post.id).catch(() => undefined)
    return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
  }

  if (slug) revalidatePath(`/site/${slug}/blog`)
  return Response.json({ ok: true, post: created.post, charged: cost, balance: charge.balance, tier: ai.tier })
}
