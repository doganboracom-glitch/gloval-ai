import 'server-only'
import { after } from 'next/server'
import { generateStructured } from '@/lib/ai-structured'
import { resolveAiModel } from '@/lib/ai-models'
import { createAdminClient } from '@/lib/supabase/admin'
import { createBlogWriteDeps, listProjectBlogPosts } from '@/lib/blog-store'
import { isStarterPost } from '@/lib/blog'
import {
  buildStarterSystemPrompt,
  buildStarterUserPrompt,
  runStarterBlog,
  starterDailyCapReached,
  starterOutputSchema,
  type StarterBlogDeps,
  type StarterBlogResult,
  type StarterSite,
} from '@/lib/starter-blog'
import type { BlogLang } from '@/lib/blog-ai'

function realDeps(projectId: string, siteSlug: string | null): StarterBlogDeps {
  return {
    write: createBlogWriteDeps(projectId, siteSlug),
    async existingStarterCount(id) {
      return (await listProjectBlogPosts(id)).filter(isStarterPost).length
    },
    async generate({ topic, lang, siteName, description, abortSignal }) {
      // Always the standard tier and never billed: the starter posts are a
      // free onboarding gift, so their cost stays predictable on every plan.
      const result = await generateStructured({
        ai: resolveAiModel('blogWrite', null),
        schema: starterOutputSchema(siteName),
        system: buildStarterSystemPrompt(lang),
        prompt: buildStarterUserPrompt({ topic, lang, description }),
        abortSignal,
      })
      return result.object
    },
  }
}

export async function runStarterBlogNow(args: {
  projectId: string
  siteSlug: string | null
  site: StarterSite
  lang: BlogLang
}): Promise<StarterBlogResult> {
  return runStarterBlog(realDeps(args.projectId, args.siteSlug), {
    projectId: args.projectId,
    site: args.site,
    lang: args.lang,
  })
}

/** Starter posts the owner's sites received in the last 24 hours (counts only, no content). */
async function starterPostsLast24h(ownerId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: projects, error } = await admin.from('projects').select('id').eq('owner_id', ownerId)
  if (error) throw error
  const ids = (projects ?? []).map((p) => p.id as string)
  if (ids.length === 0) return 0
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count, error: countErr } = await admin
    .from('site_blog_posts')
    .select('id', { count: 'exact', head: true })
    .in('project_id', ids)
    .eq('ai_generated', true)
    .eq('personalized', false)
    .eq('sample', false)
    .eq('indexable', false)
    .gte('created_at', since)
  if (countErr) throw countErr
  return count ?? 0
}

/**
 * Runs after the response is sent, so neither project creation nor publish waits on it
 * or fails because of it. `ownerId` enables the per-user daily cap.
 */
export function scheduleStarterBlog(args: {
  projectId: string
  ownerId?: string
  siteSlug: string | null
  site: StarterSite
  lang: BlogLang
}): void {
  const { ownerId, ...run } = args
  try {
    after(async () => {
      try {
        if (ownerId && starterDailyCapReached(await starterPostsLast24h(ownerId))) {
          console.log('[starter-blog] skipped daily_cap')
          return
        }
        const result = await runStarterBlogNow(run)
        console.log('[starter-blog]', result.status, 'reason' in result ? result.reason : '')
      } catch (err) {
        console.log('[starter-blog] failed:', err instanceof Error ? err.message : 'unknown')
      }
    })
  } catch (err) {
    console.log('[starter-blog] could not schedule:', err instanceof Error ? err.message : 'unknown')
  }
}
