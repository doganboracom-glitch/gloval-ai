import { generateTryOnImage } from '@/lib/image-provider'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { hashedIp, releaseAnonAiActions, reserveAnonSubjects } from '@/lib/anon-ai-limit'
import { getPublishedSlugForProjectId, resolveActiveDomainForHost } from '@/lib/custom-domains/service'
import { isAllowedTryOnOrigin } from '@/lib/try-on-origin'
import { tryOnStoreDailyLimit, tryOnStoreSubject } from '@/lib/try-on-store-limit'

// Image-conditioned generation is slower than plain text-to-image —
// `openai/gpt-image-1` (the model this route uses; see image-provider.ts for
// why) measured ~43s for a single edit call directly against the gateway.
// Keep comfortable headroom over generateTryOnImage's internal 80s timeout.
export const maxDuration = 300

/**
 * POST /api/try-on
 * -----------------
 * Buyer-facing "AI try it on": composites a buyer-supplied photo with a
 * product photo. Two modes:
 *  - `store`: a real, published e-commerce site with the feature turned on
 *    by its owner. Charges the STORE OWNER's AI credit balance per attempt
 *    (never the buyer's — buyers don't have a credit balance at all).
 *  - `demo`: one of the marketing `/demo/*` showcase sites. No owner to
 *    charge, so it's free but rate-limited the same as store mode to keep
 *    the demo from becoming an open, unmetered image-generation endpoint.
 *
 * The buyer's photo is only ever held in memory for the duration of this
 * request — it is never written to a database row or storage bucket.
 */

const MAX_PHOTO_BASE64_CHARS = 8_000_000 // ~6MB decoded
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/

type RateEntry = { count: number; resetAt: number }
const RATE_LIMIT = 8
const RATE_WINDOW_MS = 10 * 60 * 1000
const rateBuckets = new Map<string, RateEntry>()

// Durable (database) per-IP cap. The in-memory bucket above is per serverless
// instance, so on its own it does not bound a determined caller.
const TRY_ON_IP_DAILY_LIMIT = 12

async function resolveCustomDomainSlug(host: string): Promise<string | null> {
  const bound = await resolveActiveDomainForHost(host)
  return bound?.websiteProjectId ? getPublishedSlugForProjectId(bound.websiteProjectId) : null
}

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const entry = rateBuckets.get(key)
  if (!entry || entry.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count += 1
  return true
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    mode?: 'store' | 'demo'
    storeSlug?: string
    demoSlug?: string
    personPhoto?: string
    productImage?: string
    productName?: string
  }

  const mode = body.mode === 'demo' ? 'demo' : 'store'

  let originAllowed = false
  try {
    originAllowed = await isAllowedTryOnOrigin(
      {
        origin: req.headers.get('origin'),
        referer: req.headers.get('referer'),
        host: req.headers.get('host'),
        mode,
        storeSlug: (body.storeSlug ?? '').trim(),
      },
      { resolveCustomDomainSlug },
    )
  } catch (err) {
    console.error('[try-on] origin check threw', err)
  }
  if (!originAllowed) {
    return Response.json({ ok: false, error: 'forbidden_origin' }, { status: 403 })
  }

  const productName = (body.productName ?? '').trim().slice(0, 200) || 'this product'
  const personPhoto = (body.personPhoto ?? '').trim()

  // Demo product images (and some store images) are same-origin relative
  // paths (e.g. `/demos/eticaret/products/sneaker.47a70fae.webp`), not absolute URLs.
  // Resolve those against this request's own origin so the gateway model can
  // still fetch them — without this, every relative product image failed
  // validation below and buyers only ever saw the generic error message.
  let productImage = (body.productImage ?? '').trim()
  if (productImage.startsWith('/')) {
    productImage = new URL(productImage, req.url).toString()
  }

  if (!productImage || !/^(https?:|data:)/.test(productImage)) {
    return Response.json({ ok: false, error: 'invalid_product_image' }, { status: 400 })
  }
  if (!personPhoto || personPhoto.length > MAX_PHOTO_BASE64_CHARS || !DATA_URL_RE.test(personPhoto)) {
    return Response.json({ ok: false, error: 'invalid_photo' }, { status: 400 })
  }

  const ip = clientIp(req)
  if (!checkRateLimit(`${mode}:${ip}`)) {
    return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }

  let ownerId: string | null = null
  const cost = AI_ACTION_COSTS.tryOn

  if (mode === 'store') {
    const slug = (body.storeSlug ?? '').trim()
    if (!slug) return Response.json({ ok: false, error: 'not_available' }, { status: 404 })

    // An uncaught throw here would surface as a non-JSON 500 that the client
    // can only show as a generic error, so lookups always answer with JSON.
    try {
      const config = await getTryOnConfigForStore(slug)
      if (!config) return Response.json({ ok: false, error: 'not_available' }, { status: 404 })
      ownerId = config.ownerId

      const balance = await getCreditBalance(ownerId)
      if (balance < cost) {
        // Generic message — never expose the owner's internal credit balance
        // to a storefront visitor.
        return Response.json({ ok: false, error: 'not_available' }, { status: 503 })
      }
    } catch (err) {
      console.error('[try-on] store lookup threw', err)
      return Response.json({ ok: false, error: 'failed' }, { status: 500 })
    }
  } else {
    const slug = (body.demoSlug ?? '').trim()
    if (!slug) return Response.json({ ok: false, error: 'not_available' }, { status: 404 })
  }

  let reservedSubjects: string[] = []
  try {
    // Per-IP first so a blocked visitor never touches the store's shared
    // counter; the reservation is all-or-nothing and nothing is charged to the
    // owner until a generation succeeds.
    const attempts = [{ subject: `tryon-ip:${hashedIp(req)}`, limit: TRY_ON_IP_DAILY_LIMIT }]
    if (mode === 'store') {
      attempts.push({
        subject: tryOnStoreSubject((body.storeSlug ?? '').trim()),
        limit: tryOnStoreDailyLimit(),
      })
    }
    const reservation = await reserveAnonSubjects(attempts)
    if (!reservation.allowed) {
      const storeCapReached = reservation.failedSubject?.startsWith('tryon-store:') === true
      return Response.json(
        { ok: false, error: storeCapReached ? 'store_daily_limit' : 'rate_limited' },
        { status: 429 },
      )
    }
    reservedSubjects = reservation.subjects
  } catch (err) {
    console.error('[try-on] limiter threw', err)
    return Response.json({ ok: false, error: 'failed' }, { status: 500 })
  }

  let result: Awaited<ReturnType<typeof generateTryOnImage>>
  try {
    result = await generateTryOnImage({
      personPhotoDataUrl: personPhoto,
      productPhotoUrl: productImage,
      productName,
    })
  } catch (err) {
    console.error('[try-on] generateTryOnImage threw', err)
    await releaseAnonAiActions(reservedSubjects).catch(() => {})
    return Response.json({ ok: false, error: 'failed' }, { status: 500 })
  }

  if ('error' in result) {
    await releaseAnonAiActions(reservedSubjects).catch(() => {})
    const status = result.error === 'unavailable' ? 503 : 500
    return Response.json({ ok: false, error: result.error }, { status })
  }

  // Charge only after a real generation succeeded — a real store never pays
  // for a failed attempt.
  if (mode === 'store' && ownerId) {
    try {
      await consumeCredits(ownerId, cost, 'tryOn')
    } catch (err) {
      console.error('[try-on] consumeCredits threw', err)
    }
  }

  return Response.json({ ok: true, dataUrl: result.dataUrl })
}
