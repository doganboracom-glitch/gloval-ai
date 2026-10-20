import { generateText, Output } from 'ai'
import { z } from 'zod'
import { getAdminUser, requireAdminResponse } from '@/lib/mail/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBlogAdminLimit } from '@/lib/blog-admin-limit'
import { recordBlogAudit } from '@/lib/blog-audit'
import { BLOG_CACHE_TAG } from '@/lib/content/blog'
import { updateTag } from 'next/cache'
import {
  DRAFT_SYSTEM,
  buildDraftPrompt,
  cleanDraft,
  draftSlug,
  normalizeDraftRequest,
} from '@/lib/blog-ai-draft'
import { readingTimeMinutes } from '@/lib/blog-markup'

export const maxDuration = 120

const DRAFT_MODEL = process.env.BLOG_DRAFT_MODEL || 'google/gemini-2.5-flash'

const draftSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  body: z.string(),
  seoTitle: z.string(),
  metaDescription: z.string(),
  tags: z.array(z.string()),
})

/**
 * Admin-only. Generates a Turkish draft from a topic, strips every claim that
 * cannot be verified, and saves it as a `draft` row. It is never published
 * here: an editor reads and publishes it from the post form.
 */
export async function POST(req: Request) {
  const admin = await getAdminUser()
  if (!admin) return requireAdminResponse() as Promise<Response>

  const limit = await checkBlogAdminLimit(admin.userId, 'ai')
  if (!limit.allowed) {
    return Response.json(
      { error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    )
  }

  const request = normalizeDraftRequest(await req.json().catch(() => null))
  if (!request.ok) return Response.json({ error: 'invalid_input' }, { status: 400 })

  let draft
  try {
    const { output } = await generateText({
      model: DRAFT_MODEL,
      system: DRAFT_SYSTEM,
      prompt: buildDraftPrompt(request.value),
      output: Output.object({ schema: draftSchema }),
      temperature: 0.5,
      abortSignal: AbortSignal.any([req.signal, AbortSignal.timeout(100_000)]),
    })
    draft = cleanDraft(output, request.value.topic)
  } catch (error) {
    console.error('[blog-draft] generation failed:', error instanceof Error ? error.message : error)
    return Response.json({ error: 'generation_failed' }, { status: 502 })
  }
  if (!draft) return Response.json({ error: 'draft_too_short' }, { status: 422 })

  const supabase = createAdminClient()
  const base = draftSlug(draft.title)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const slug = attempt === 0 ? base : `${base.slice(0, 70)}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase
      .from('platform_blog_posts')
      .insert({
        slug,
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        tags: draft.tags,
        seo_title: draft.seoTitle,
        meta_description: draft.metaDescription,
        status: 'draft',
        published_at: null,
        author_name: 'GLOVAL AI',
        reading_time: readingTimeMinutes(draft.body),
        noindex: false,
        featured: false,
        translations: {},
      })
      .select('id')
      .single()
    if (!error) {
      await recordBlogAudit({
        actor: admin,
        action: 'post.ai_draft',
        postId: data.id as string,
        postSlug: slug,
        postTitle: draft.title,
        detail: { removedSentences: draft.removedSentences },
      })
      updateTag(BLOG_CACHE_TAG)
      return Response.json({ id: data.id, slug, removedSentences: draft.removedSentences })
    }
    if (error.code !== '23505') {
      console.error('[blog-draft] insert failed:', error.message)
      return Response.json({ error: 'failed' }, { status: 500 })
    }
  }
  return Response.json({ error: 'slug_taken' }, { status: 409 })
}
