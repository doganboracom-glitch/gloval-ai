import { generateTryOnImage } from '@/lib/image-provider'
import { getTryOnConfigForStore } from '@/lib/try-on-settings'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'

// Image-conditioned generation is slower than plain text-to-image —
// `openai/gpt-image-1` (the model this route uses; see image-provider.ts for
// why) measured ~43s for a single edit call directly against the gateway.
// Keep comfortable headroom over generateTryOnImage's internal 80s timeout.
export const maxDuration = 90

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
  const productName = (body.productName ?? '').trim().slice(0, 200) || 'this product'
  const personPhoto = (body.personPhoto ?? '').trim()

  // Demo product images (and some store images) are same-origin relative
  // paths (e.g. `/demos/eticaret/products/sneaker.webp`), not absolute URLs.
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

    const config = await getTryOnConfigForStore(slug)
    if (!config) return Response.json({ ok: false, error: 'not_available' }, { status: 404 })
    ownerId = config.ownerId

    const balance = await getCreditBalance(ownerId)
    if (balance < cost) {
      // Generic message — never expose the owner's internal credit balance
      // to a storefront visitor.
      return Response.json({ ok: false, error: 'not_available' }, { status: 503 })
    }
  } else {
    const slug = (body.demoSlug ?? '').trim()
    if (!slug) return Response.json({ ok: false, error: 'not_available' }, { status: 404 })
  }

  const result = await generateTryOnImage({
    personPhotoDataUrl: personPhoto,
    productPhotoUrl: productImage,
    productName,
  })

  if ('error' in result) {
    const status = result.error === 'unavailable' ? 503 : 500
    return Response.json({ ok: false, error: result.error }, { status })
  }

  // Charge only after a real generation succeeded — a real store never pays
  // for a failed attempt.
  if (mode === 'store' && ownerId) {
    await consumeCredits(ownerId, cost, 'tryOn')
  }

  return Response.json({ ok: true, dataUrl: result.dataUrl })
}
