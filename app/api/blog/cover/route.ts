import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { generateSiteImage, imageGenerationAvailable } from '@/lib/image-provider'
import { persistImageDataUri } from '@/lib/image-storage'

export const maxDuration = 60

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

async function ownsProject(projectId: string): Promise<{ userId: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) return null
  const { data: owned } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  if (owned) return { userId: user.id }
  if (isAdminEmail(user.email ?? null)) {
    const { data: any } = await createAdminClient().from('projects').select('id').eq('id', projectId).maybeSingle()
    if (any) return { userId: user.id }
  }
  return null
}

/**
 * POST /api/blog/cover
 *  - multipart (`file`, `projectId`): uploads an owner image, free of charge.
 *  - JSON (`projectId`, `title`, `alt`): generates a cover with the site image
 *    flow and charges the usual image credit ONLY when an image was delivered.
 * Returns `{ url }`. The post itself is saved afterwards through the blog
 * server actions, never from here.
 */
export async function POST(req: Request) {
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
    const url = await persistImageDataUri(`data:${file.type};base64,${bytes.toString('base64')}`)
    if (!url.startsWith('https://') && !url.startsWith('/')) {
      return Response.json({ error: 'storage_failed' }, { status: 502 })
    }
    return Response.json({ url })
  }

  const body = (await req.json().catch(() => null)) as { projectId?: string; title?: string; alt?: string } | null
  const projectId = body?.projectId ?? ''
  const subject = (body?.alt || body?.title || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!projectId || subject.length < 3) return Response.json({ error: 'invalid_input' }, { status: 400 })
  const owner = await ownsProject(projectId)
  if (!owner) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!imageGenerationAvailable()) return Response.json({ error: 'unavailable' }, { status: 503 })

  const planCode = toPlanCode(await getPlanCodeForUser(owner.userId))
  const dailyLimit = await checkFreeDailyActionLimit(owner.userId, planCode)
  if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

  const cost = AI_ACTION_COSTS.sectionImage
  const balance = await getCreditBalance(owner.userId)
  if (balance < cost) return Response.json({ error: 'Out of credits', balance }, { status: 402 })

  const image = await generateSiteImage({
    prompt: `Editorial blog cover photograph: ${subject}. Realistic, natural light, uncluttered composition.`,
    aspectRatio: '16:9',
  })
  if (!image) return Response.json({ error: 'generation_failed' }, { status: 502 })

  const url = await persistImageDataUri(image.src)
  if (!url.startsWith('https://') && !url.startsWith('/')) {
    return Response.json({ error: 'storage_failed' }, { status: 502 })
  }
  const charge = await consumeCredits(owner.userId, cost, 'blogCover')
  if (!charge.ok) return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
  return Response.json({ url, charged: cost, balance: charge.balance })
}
