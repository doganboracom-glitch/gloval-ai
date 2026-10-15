import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance, hasLedgerReason } from '@/lib/ai-credits'
import { attemptTimeoutMs, resolveAiModel } from '@/lib/ai-models'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { createBlogWriteDeps } from '@/lib/blog-store'
import { generateBlogPost, type BlogLang } from '@/lib/blog-ai'
import type { BlogRunDeps } from '@/lib/blog-run'
import { websiteSchema, type BlogProfile } from '@/lib/website-schema'

const GENERATION_BUDGET_MS = 170_000

/** One set per server instance; the ledger lookup covers other instances. */
const inflight = new Set<string>()

export type BlogRouteContext = {
  userId: string
  projectId: string
  slug: string | null
  deps: BlogRunDeps
  /** The remembered business answers of the site (empty when none were saved). */
  profile: BlogProfile
}

/**
 * Authenticates the caller, proves the project is theirs (session client under
 * RLS; admins may act on any project), applies the free daily limit and builds
 * the real dependencies for `runBlogWrite` / `runBlogPersonalize`.
 */
export async function loadBlogRouteContext(projectId: string): Promise<BlogRouteContext | Response> {
  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const columns = 'id, slug, language, schema_data'
  let { data: project } = await supabase.from('projects').select(columns).eq('id', projectId).maybeSingle()
  if (!project && isAdminEmail(user.email ?? null)) {
    project = (await createAdminClient().from('projects').select(columns).eq('id', projectId).maybeSingle()).data
  }
  if (!project) return Response.json({ error: 'not_found' }, { status: 404 })

  const planCode = toPlanCode(await getPlanCodeForUser(user.id))
  const dailyLimit = await checkFreeDailyActionLimit(user.id, planCode)
  if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

  const site = websiteSchema.safeParse(project.schema_data)
  const lang: BlogLang = project.language === 'en' ? 'en' : 'tr'
  const ai = resolveAiModel('blogWrite', planCode)
  const slug = (project.slug as string | null) ?? null

  const deps: BlogRunDeps = {
    write: createBlogWriteDeps(projectId, slug),
    cost: AI_ACTION_COSTS.blogWrite,
    balance: () => getCreditBalance(user.id),
    charge: (reason) => consumeCredits(user.id, AI_ACTION_COSTS.blogWrite, reason),
    alreadyCharged: (reason) => hasLedgerReason(user.id, reason),
    inflight,
    generate: async ({ topic, answers, draft }) => {
      const result = await generateBlogPost({
        ai,
        abortSignal: AbortSignal.timeout(Math.min(GENERATION_BUDGET_MS, attemptTimeoutMs(ai.model) * 2)),
        input: {
          topic,
          answers,
          draft,
          lang,
          siteName: site.success ? site.data.meta.name : '',
          siteDescription: site.success ? site.data.meta.description : '',
        },
      })
      return result.object
    },
  }
  return { userId: user.id, projectId, slug, deps, profile: site.success ? (site.data.blogProfile ?? {}) : {} }
}
