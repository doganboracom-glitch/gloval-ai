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
  buildTopicSystemPrompt,
  buildTopicUserPrompt,
  topicSuggestionSchema,
  regenerateStarterBlog,
  runStarterBlog,
  starterDailyCapReached,
  starterOutputSchema,
  type StarterBlogDeps,
  type StarterBlogResult,
  type StarterRegenerateResult,
  type StarterSite,
} from '@/lib/starter-blog'
import type { BlogLang } from '@/lib/blog-ai'
import {
  buildCoverPrompt,
  DEFAULT_COVER_STYLE,
  generateAcceptedCover,
  heuristicCoverConcepts,
} from '@/lib/blog-cover'
import { inspectCover } from '@/lib/blog-cover-inspect'
import { generateSiteImage, imageGenerationAvailable } from '@/lib/image-provider'
import { persistImageDataUri } from '@/lib/image-storage'

function realDeps(projectId: string, siteSlug: string | null, ownerId?: string): StarterBlogDeps {
  return {
    write: createBlogWriteDeps(projectId, siteSlug),
    async existingStarterCount(id) {
      return (await listProjectBlogPosts(id)).filter(isStarterPost).length
    },
    dailyCapReached: ownerId ? async () => starterDailyCapReached(await starterPostsLast24h(ownerId)) : undefined,
    async suggestTopics({ site, lang, avoidTitles, abortSignal }) {
      const result = await generateStructured({
        ai: resolveAiModel('blogWrite', null),
        schema: topicSuggestionSchema,
        system: buildTopicSystemPrompt(lang),
        prompt: buildTopicUserPrompt({ site, lang, avoidTitles }),
        abortSignal,
      })
      return result.object
    },
    async generate({ topic, lang, siteName, description, businessType, topicLang, abortSignal }) {
      // Always the standard tier and never billed: the starter posts are a
      // free onboarding gift, so their cost stays predictable on every plan.
      const result = await generateStructured({
        ai: resolveAiModel('blogWrite', null),
        schema: starterOutputSchema(siteName),
        system: buildStarterSystemPrompt(lang),
        prompt: buildStarterUserPrompt({ topic, lang, description, businessType, topicLang }),
        abortSignal,
      })
      return result.object
    },
    async cover({ post, abortSignal }) {
      if (!imageGenerationAvailable()) return null
      const prompt = buildCoverPrompt({
        concepts: heuristicCoverConcepts(`${post.title} ${post.excerpt ?? ''}`),
        style: DEFAULT_COVER_STYLE,
      })
      const gate = await generateAcceptedCover({
        generate: async () => (abortSignal.aborted ? null : generateSiteImage({ prompt, aspectRatio: '16:9' })),
        inspect: async (src) => {
          try {
            return await inspectCover(src)
          } catch {
            return { text: 'unknown', people: 'unknown' }
          }
        },
        maxAttempts: 1,
      })
      if (!gate.ok || abortSignal.aborted) return null
      const stored = await persistImageDataUri(gate.src)
      return stored.startsWith('https://') || stored.startsWith('/') ? stored : null
    },
  }
}

export async function runStarterBlogNow(args: {
  projectId: string
  ownerId?: string
  siteSlug: string | null
  site: StarterSite
  lang: BlogLang
}): Promise<StarterBlogResult> {
  const result = await runStarterBlog(realDeps(args.projectId, args.siteSlug, args.ownerId), {
    projectId: args.projectId,
    site: args.site,
    lang: args.lang,
  })
  // Codes only: no project id, name or post text ever reaches the log.
  console.log(
    '[starter-blog]',
    result.status,
    result.status === 'failed' ? result.code : result.status === 'skipped' ? result.reason : '',
  )
  return result
}

/** Replaces the untouched starter posts of one project; free, never billed, owner-edited posts are never touched. */
export async function regenerateStarterBlogNow(args: {
  projectId: string
  siteSlug: string | null
  site: StarterSite
  lang: BlogLang
}): Promise<StarterRegenerateResult> {
  const inflight = regenerateInflight
  if (inflight.has(args.projectId)) return { status: 'skipped', reason: 'in_progress' }
  inflight.add(args.projectId)
  try {
    const result = await regenerateStarterBlog(realDeps(args.projectId, args.siteSlug), {
      projectId: args.projectId,
      site: args.site,
      lang: args.lang,
      posts: await listProjectBlogPosts(args.projectId),
    })
    console.log(
      '[starter-blog] regenerate',
      result.status,
      result.status === 'failed' ? result.code : result.status === 'skipped' ? result.reason : '',
    )
    return result
  } finally {
    inflight.delete(args.projectId)
  }
}

const regenerateInflight = new Set<string>()

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
  try {
    after(async () => {
      try {
        await runStarterBlogNow(args)
      } catch {
        console.log('[starter-blog] failed starter_blog_unexpected')
      }
    })
  } catch {
    console.log('[starter-blog] failed starter_blog_schedule')
  }
}
