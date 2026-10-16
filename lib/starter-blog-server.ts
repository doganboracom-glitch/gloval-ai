import 'server-only'
import { after } from 'next/server'
import { generateStructured } from '@/lib/ai-structured'
import { resolveAiModel } from '@/lib/ai-models'
import { createBlogWriteDeps, listProjectBlogPosts } from '@/lib/blog-store'
import { isStarterPost } from '@/lib/blog'
import {
  buildStarterSystemPrompt,
  buildStarterUserPrompt,
  runStarterBlog,
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

/** Runs after the response is sent, so the publish itself never waits on it and never fails because of it. */
export function scheduleStarterBlog(args: {
  projectId: string
  siteSlug: string | null
  site: StarterSite
  lang: BlogLang
}): void {
  try {
    after(async () => {
      try {
        const result = await runStarterBlogNow(args)
        console.log('[starter-blog]', result.status, 'reason' in result ? result.reason : '')
      } catch (err) {
        console.log('[starter-blog] failed:', err instanceof Error ? err.message : 'unknown')
      }
    })
  } catch (err) {
    console.log('[starter-blog] could not schedule:', err instanceof Error ? err.message : 'unknown')
  }
}
