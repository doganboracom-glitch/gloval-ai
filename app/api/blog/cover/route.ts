import { rejectAnonymous } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance, hasLedgerReason } from '@/lib/ai-credits'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { getImageProvider, imageGenerationAvailable } from '@/lib/image-provider'
import { IMAGE_STORAGE_USER_MESSAGE, ImageStorageError, persistImageDataUri } from '@/lib/image-storage'
import { websiteSchema } from '@/lib/website-schema'
import { DEFAULT_COVER_MODEL, paletteNames, parseCoverStyle } from '@/lib/blog-cover'
import { inspectCover } from '@/lib/blog-cover-inspect'
import { runCoverGeneration } from '@/lib/blog-cover-run'

// The pipeline gives up (and refuses to charge) after COVER_BUDGET_MS, well inside this limit.
export const maxDuration = 300

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const CONCEPT_TIMEOUT_MS = 10_000

/** The existing `storage_failed` code, now with a user-facing message; never charged. */
function storageFailedResponse(balance?: number) {
  return Response.json(
    {
      error: 'storage_failed',
      message: IMAGE_STORAGE_USER_MESSAGE,
      charged: 0,
      ...(balance === undefined ? {} : { balance }),
    },
    { status: 502 },
  )
}

/** One generation per user and project at a time; the ledger covers other instances. */
const inflight = new Set<string>()

type OwnedProject = { userId: string; palette: Array<{ hex: string }> }

async function ownsProject(projectId: string): Promise<OwnedProject | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) return null
  const columns = 'id, schema_data'
  let { data: project } = await supabase.from('projects').select(columns).eq('id', projectId).maybeSingle()
  if (!project && isAdminEmail(user.email ?? null)) {
    project = (await createAdminClient().from('projects').select(columns).eq('id', projectId).maybeSingle()).data
  }
  if (!project) return null
  const site = websiteSchema.safeParse(project.schema_data)
  return { userId: user.id, palette: site.success ? site.data.theme.palette : [] }
}

async function completeConcepts({ system, prompt }: { system: string; prompt: string }): Promise<string> {
  const { generateText } = await import('ai')
  const { text } = await generateText({
    model: process.env.BLOG_COVER_CONCEPT_MODEL || 'google/gemini-2.5-flash-lite',
    system,
    prompt,
    maxOutputTokens: 80,
    temperature: 0.3,
    abortSignal: AbortSignal.timeout(CONCEPT_TIMEOUT_MS),
  })
  return text
}

/**
 * POST /api/blog/cover
 *  - multipart (`file`, `projectId`): uploads an owner image, free of charge.
 *  - JSON (`projectId`, `title`, `excerpt`, `style`, `requestId`): generates a
 *    cover from model-extracted visual concepts (the title is never sent to the
 *    image model), rejects images that contain text or people (one automatic
 *    retry) and charges the image credit ONLY for an accepted image.
 * Returns `{ url }`. The post itself is saved afterwards through the blog
 * server actions, never from here.
 */
export async function POST(req: Request) {
  const anonymous = await rejectAnonymous()
  if (anonymous) return anonymous

  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const projectId = String(form?.get('projectId') ?? '')
    const file = form?.get('file')
    if (!projectId || !(file instanceof File)) return Response.json({ error: 'invalid_input' }, { status: 400 })
    if (!(await ownsProject(projectId))) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: 'unsupported_type' }, { status: 415 })
    if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: 'too_large' }, { status: 413 })
    const bytes = Buffer.from(await file.arrayBuffer())
    let url: string
    try {
      url = await persistImageDataUri(`data:${file.type};base64,${bytes.toString('base64')}`)
    } catch (err) {
      if (err instanceof ImageStorageError) return storageFailedResponse()
      throw err
    }
    if (!url.startsWith('https://') && !url.startsWith('/')) return storageFailedResponse()
    return Response.json({ url })
  }

  const body = (await req.json().catch(() => null)) as {
    projectId?: string
    title?: string
    excerpt?: string
    alt?: string
    style?: string
    requestId?: string
  } | null
  const projectId = body?.projectId ?? ''
  const title = (body?.title || body?.alt || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const excerpt = (body?.excerpt ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)
  const requestId = /^[A-Za-z0-9-]{8,64}$/.test(body?.requestId ?? '') ? (body?.requestId as string) : ''
  if (!projectId || title.length < 3) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const owner = await ownsProject(projectId)
  if (!owner) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!imageGenerationAvailable()) return Response.json({ error: 'unavailable' }, { status: 503 })

  const lockKey = `${owner.userId}:${projectId}`
  if (inflight.has(lockKey)) return Response.json({ error: 'busy' }, { status: 409 })
  const reason = requestId ? `blogCover:${requestId}` : 'blogCover'
  if (requestId && (await hasLedgerReason(owner.userId, reason))) {
    return Response.json({ error: 'duplicate' }, { status: 409 })
  }

  inflight.add(lockKey)
  try {
    const planCode = toPlanCode(await getPlanCodeForUser(owner.userId))
    const dailyLimit = await checkFreeDailyActionLimit(owner.userId, planCode)
    if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

    const cost = AI_ACTION_COSTS.sectionImage
    const style = parseCoverStyle(body?.style)
    const model = process.env.BLOG_COVER_IMAGE_MODEL || DEFAULT_COVER_MODEL
    const provider = getImageProvider()

    const result = await runCoverGeneration(
      {
        getBalance: () => getCreditBalance(owner.userId),
        concepts: completeConcepts,
        generate: (prompt) => provider.generate({ prompt, aspectRatio: '16:9', allowText: true, model }),
        inspect: inspectCover,
        persist: persistImageDataUri,
        charge: (amount, chargeReason) => consumeCredits(owner.userId, amount, chargeReason),
      },
      { title, excerpt, style, colors: paletteNames(owner.palette), cost, reason, signal: req.signal },
    )
    console.info('[blog-cover]', {
      style,
      model,
      ok: result.ok,
      error: result.ok ? null : result.error,
      charged: result.charged,
    })
    if (!result.ok) {
      if (result.error === 'storage_failed') return storageFailedResponse(result.balance)
      const error = result.error === 'out_of_credits' ? 'Out of credits' : result.error
      return Response.json({ error, charged: 0, balance: result.balance }, { status: result.status })
    }
    return Response.json({ url: result.url, charged: result.charged, balance: result.balance, style })
  } finally {
    inflight.delete(lockKey)
  }
}
