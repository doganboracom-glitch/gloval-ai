import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { MAX_ABOUT_IMAGES } from '@/lib/about-media'
import { createPreviewDeps, parseSectionKey, SUPPORTED_TARGETS } from '@/lib/ai-preview/server'
import {
  discardPreview,
  getPreviewState,
  regeneratePreview,
  startPreview,
  usePreview,
  type Failure,
} from '@/lib/ai-preview/service'

// Same budget as /api/section-image: one provider call capped at 25s plus storage.
export const maxDuration = 60

const STATUS: Record<Failure['error'], number> = {
  no_credits: 402,
  generation_failed: 502,
  busy: 409,
  not_found: 404,
  expired: 410,
}

type Body = {
  action?: 'start' | 'regenerate' | 'use' | 'discard'
  projectId?: string
  sectionKey?: string
  id?: string
  key?: string
  request?: string
  schema?: unknown
}

async function authenticate() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  return error || !data?.user ? null : data.user.id
}

/** GET /api/ai-previews?projectId=…&sectionKey=about:2 — recoverable preview + costs inputs. */
export async function GET(req: Request) {
  const userId = await authenticate()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const projectId = url.searchParams.get('projectId') ?? ''
  const sectionKey = url.searchParams.get('sectionKey') ?? ''
  if (!projectId || !parseSectionKey(sectionKey)) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const deps = createPreviewDeps({ site: undefined as never, beforeGenerate: async () => false })
  return Response.json(await getPreviewState(deps, { userId, projectId, sectionKey }))
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body
  const userId = await authenticate()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { action, projectId = '', sectionKey = '', id = '', key = '' } = body
  const section = parseSectionKey(sectionKey)

  const needsSite = action === 'start' || action === 'regenerate'
  const parsed = needsSite ? websiteSchema.safeParse(body.schema) : null
  if (needsSite && !parsed?.success) {
    return Response.json({ error: 'Invalid site schema' }, { status: 400 })
  }
  const site = parsed?.success ? parsed.data : (undefined as never)

  let limited: ReturnType<typeof freeDailyLimitResponseBody> | null = null
  const deps = createPreviewDeps({
    site,
    beforeGenerate: async () => {
      const plan = toPlanCode(await getPlanCodeForUser(userId))
      const check = await checkFreeDailyActionLimit(userId, plan)
      if (check.allowed) return true
      limited = freeDailyLimitResponseBody(check)
      return false
    },
  })

  const respond = (result: { ok: true } | Failure, payload: Record<string, unknown> = {}) => {
    if (result.ok) return Response.json(payload)
    if (limited) return Response.json(limited, { status: 429 })
    return Response.json({ error: result.error, balance: result.balance }, { status: STATUS[result.error] })
  }

  if (action === 'start') {
    if (!projectId || !section || !(SUPPORTED_TARGETS as readonly string[]).includes(section.target)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 })
    }
    const target = site.sections[section.index]
    if (!target || target.type !== 'about') return Response.json({ error: 'Invalid request' }, { status: 400 })
    if ((target.media?.images ?? []).length >= MAX_ABOUT_IMAGES) {
      return Response.json({ error: 'max_images' }, { status: 409 })
    }
    const result = await startPreview(deps, {
      userId,
      projectId,
      sectionKey,
      target: section.target,
      request: body.request ?? '',
    })
    return respond(result, result.ok ? { preview: result.preview, resumed: result.resumed } : {})
  }

  if (action === 'regenerate') {
    if (!id || !key) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const result = await regeneratePreview(deps, { userId, id, key, request: body.request ?? '' })
    return respond(result, result.ok ? { preview: result.preview } : {})
  }

  if (action === 'use') {
    if (!id || !key) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const result = await usePreview(deps, { userId, id, key })
    return respond(result, result.ok ? { image: result.image, charged: result.charged } : {})
  }

  if (action === 'discard') {
    if (!id) return Response.json({ error: 'Invalid request' }, { status: 400 })
    await discardPreview(deps, { userId, id })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'Invalid request' }, { status: 400 })
}
