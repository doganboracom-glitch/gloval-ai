/**
 * Server-side image provider abstraction
 * --------------------------------------
 * A tiny, swappable seam for turning an image prompt into a real image URL,
 * kept entirely on the server so no API key is ever exposed to the frontend.
 *
 * Design goals:
 *  - Provider-agnostic: swap the backend via the `IMAGE_PROVIDER` env var
 *    without touching any caller.
 *  - Safe by default: if no provider is configured (no API key / env var), the
 *    system is NEVER broken — `generateImage` simply resolves to `null` and the
 *    renderer falls back to its themed gradient placeholder.
 *  - Never throws: every failure (misconfig, timeout, provider error) is caught
 *    and turned into a controlled `null` fallback.
 */

export type ImageAspect = '1:1' | '4:3' | '3:2' | '16:9' | '3:4' | '9:16'

export type ImageRequest = {
  prompt: string
  aspectRatio?: ImageAspect
}

export type ImageResult = { src: string; provider: string } | null

/**
 * Translates an aspect ratio into a concrete `WxH` size accepted by common
 * image models (gpt-image-1 supports 1024x1024 / 1536x1024 / 1024x1536).
 */
function aspectToSize(aspect: ImageAspect): `${number}x${number}` {
  switch (aspect) {
    case '1:1':
      return '1024x1024'
    case '3:4':
    case '9:16':
      return '1024x1536'
    case '4:3':
    case '3:2':
    case '16:9':
    default:
      return '1536x1024'
  }
}

/* -------------------------------------------------------------------------- */
/*  Safe error diagnostics                                                    */
/* -------------------------------------------------------------------------- */

const MAX_DIAG_TEXT = 600

/** Strips credential-looking tokens and bounds length before anything is logged. */
function redact(value: unknown): string {
  const text = typeof value === 'string' ? value : safeStringify(value)
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(sk|vck|vercel|gw|key)[-_][A-Za-z0-9_-]{12,}/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, '[redacted-jwt]')
    .replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{40,}/gi, '[base64 omitted]')
    .slice(0, MAX_DIAG_TEXT)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Extracts only the diagnostic fields we want in logs: error class, HTTP
 * status, gateway generation id, retryability, and a redacted/truncated
 * message plus the upstream cause. Never includes request headers or env.
 */
function describeProviderError(
  err: unknown,
  context?: { modelId: string; size: string },
): Record<string, unknown> {
  const e = (err ?? {}) as Record<string, unknown>
  const cause = (e.cause ?? undefined) as Record<string, unknown> | undefined
  return {
    ...context,
    name: typeof e.name === 'string' ? e.name : typeof err,
    statusCode: e.statusCode ?? cause?.statusCode,
    generationId: e.generationId,
    isRetryable: e.isRetryable,
    message: redact(err instanceof Error ? err.message : err),
    cause: cause
      ? {
          name: cause.name,
          statusCode: cause.statusCode,
          message: redact(typeof cause.message === 'string' ? cause.message : ''),
          responseBody: cause.responseBody ? redact(cause.responseBody) : undefined,
        }
      : undefined,
  }
}

export interface ImageProvider {
  /** Stable identifier, also the value used for `IMAGE_PROVIDER`. */
  id: string
  /** True only when real credentials/config are present. */
  isConfigured(): boolean
  /** Produce an image; resolves `null` on any failure. */
  generate(req: ImageRequest): Promise<ImageResult>
}

/* -------------------------------------------------------------------------- */
/*  Providers                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Vercel AI Gateway image provider. Uses the AI SDK's `generateImage` with a
 * gateway image model. Zero-config for some gateway providers in v0; otherwise
 * an `AI_GATEWAY_API_KEY` (or OIDC token) is required. Returns a data URI so
 * the result is self-contained and can be attached directly to the site data.
 */
const gatewayProvider: ImageProvider = {
  id: 'gateway',
  isConfigured() {
    return Boolean(
      process.env.AI_GATEWAY_API_KEY ||
        process.env.VERCEL_OIDC_TOKEN ||
        // Explicit opt-in even if the key is injected under a custom name.
        process.env.IMAGE_PROVIDER === 'gateway',
    )
  },
  async generate({ prompt, aspectRatio = '16:9' }) {
    let currentContext: { modelId: string; size: string } | undefined
    try {
      const { generateImage, gateway } = await import('ai')
      // Default to a FAST, high-quality gateway image model. `openai/gpt-image-1`
      // was the previous default but takes ~45-60s per image on the gateway,
      // which always blew past the safety timeout below and returned null — so
      // every hero silently fell back to the gradient placeholder.
      // `prodia/flux-fast-schnell` (the next default) started failing with
      // "Job type is no longer available" once Prodia deprecated that job type
      // on their end, even though the gateway still lists the model id. Verified
      // directly against the gateway: `bfl/flux-2-klein-4b` produces comparable
      // photographic quality in ~3s. Override with `IMAGE_MODEL` if a specific
      // model is required.
      const modelId = process.env.IMAGE_MODEL || 'bfl/flux-2-klein-4b'
      // `size` (WxH) is the broadly-compatible knob (e.g. gpt-image-1 rejects
      // `aspectRatio`), so we translate our aspect into a concrete size.
      const size = aspectToSize(aspectRatio)
      currentContext = { modelId, size }
      const { image, warnings } = await generateImage({
        model: gateway.imageModel(modelId),
        prompt,
        size,
      })
      // The gateway reports parameters a model ignored (e.g. an unsupported
      // `size`) as warnings rather than errors — surface them.
      if (warnings?.length) {
        console.log(
          '[v0] image-provider(gateway) warnings:',
          safeStringify({ modelId, size, warnings }),
        )
      }
      const mediaType = image.mediaType || 'image/png'
      return { src: `data:${mediaType};base64,${image.base64}`, provider: 'gateway' }
    } catch (err) {
      console.log(
        '[v0] image-provider(gateway) error:',
        safeStringify(describeProviderError(err, currentContext)),
      )
      return null
    }
  },
}

/** A provider that is intentionally never configured — the safe default. */
const noopProvider: ImageProvider = {
  id: 'none',
  isConfigured() {
    return false
  },
  async generate() {
    return null
  },
}

const PROVIDERS: Record<string, ImageProvider> = {
  gateway: gatewayProvider,
  none: noopProvider,
}

/* -------------------------------------------------------------------------- */
/*  Selection + safe entry point                                              */
/* -------------------------------------------------------------------------- */

/** Resolves the active provider from `IMAGE_PROVIDER` (defaults to gateway). */
export function getImageProvider(): ImageProvider {
  const selected = (process.env.IMAGE_PROVIDER || 'gateway').toLowerCase()
  return PROVIDERS[selected] ?? gatewayProvider
}

/**
 * True when the active provider has real credentials AND real generation has
 * not been explicitly disabled.
 *
 * Real image generation is now ON BY DEFAULT (opt-out) so a connected AI
 * Gateway automatically produces real hero/slider imagery — the previous
 * opt-in default silently left every hero on the gradient placeholder because
 * no `IMAGE_GENERATION_ENABLED` / `IMAGE_PROVIDER` flag was set.
 *
 * Kill switches (any of these disables generation, keeping the fast,
 * unbreakable prompt-only fallback):
 *  - `IMAGE_GENERATION_ENABLED` set to a falsy value (`0|false|no|off`)
 *  - `IMAGE_PROVIDER=none`
 * Otherwise generation is enabled whenever the active provider is configured
 * (e.g. the Vercel AI Gateway is connected).
 */
export function imageGenerationAvailable(): boolean {
  const flag = (process.env.IMAGE_GENERATION_ENABLED || '').trim()
  const explicitlyDisabled =
    /^(0|false|no|off)$/i.test(flag) ||
    (process.env.IMAGE_PROVIDER || '').toLowerCase() === 'none'
  if (explicitlyDisabled) return false
  return getImageProvider().isConfigured()
}

export type TryOnResult = { dataUrl: string } | { error: 'unavailable' | 'failed' }

/**
 * AI "try it on" — composites a buyer-supplied photo with a product photo
 * using image-conditioned generation (the AI SDK's `generateImage` accepts an
 * `images` array in its prompt, which the gateway model uses as visual
 * reference instead of pure text-to-image). Both inputs are passed as data
 * URIs already held in memory — nothing is written to any bucket here, by
 * design, so a buyer's photo never touches persistent storage.
 *
 * Never throws: any failure (misconfigured provider, model rejection, timeout)
 * resolves to `{ error }` so the route can respond and refund the charge.
 */
export async function generateTryOnImage({
  personPhotoDataUrl,
  productPhotoUrl,
  productName,
  // `openai/gpt-image-1` (see the model comment below) measured ~43s for a
  // single edit call directly against the gateway — 80s leaves comfortable
  // headroom under the route's `maxDuration = 90`.
  timeoutMs = 80_000,
}: {
  personPhotoDataUrl: string
  productPhotoUrl: string
  productName: string
  timeoutMs?: number
}): Promise<TryOnResult> {
  const provider = getImageProvider()
  if (!provider.isConfigured()) return { error: 'unavailable' }

  try {
    const run = async (): Promise<TryOnResult> => {
      const { generateImage, gateway } = await import('ai')
      // Zero Data Retention is enabled on this gateway account. Under ZDR,
      // the gateway can only route image-EDIT requests (i.e. calls that pass
      // a reference `images` array) to a provider whose edit endpoint speaks
      // plain JSON. BFL (`bfl/flux-2-klein-4b`) and Meta Muse
      // (`meta/muse-image-1.0`) both require the multipart/form-data path for
      // edits, which ZDR disables outright — every request to either model
      // fails with "multipart/form-data image edits are not supported when
      // Zero Data Retention is enabled", even with inline base64 images and
      // even with a single reference image. `openai/gpt-image-1` is the one
      // gateway image model verified to support JSON-based image edits under
      // this account's ZDR restriction. Verified directly against the
      // gateway: klein-4b and muse-image-1.0 both fail this exact call,
      // gpt-image-1 succeeds.
      const modelId = process.env.TRY_ON_IMAGE_MODEL || 'openai/gpt-image-1'

      const images: string[] = [personPhotoDataUrl]
      // Every image must be an inline base64 `data:` URI rather than a plain
      // `https:` URL — the SDK would otherwise fetch the URL itself and route
      // through the same multipart path ZDR disables. So a remote product
      // photo is fetched and re-encoded here first.
      if (productPhotoUrl.startsWith('data:')) {
        images.push(productPhotoUrl)
      } else if (/^https?:/.test(productPhotoUrl)) {
        try {
          const res = await fetch(productPhotoUrl)
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            const contentType = res.headers.get('content-type') || 'image/jpeg'
            images.push(`data:${contentType};base64,${buf.toString('base64')}`)
          }
        } catch {
          // Fall back to text-only generation if the product photo can't be fetched.
        }
      }

      const { image } = await generateImage({
        model: gateway.imageModel(modelId),
        prompt: {
          images,
          text: `Photorealistic image of the SAME person from the first photo wearing/using the product "${productName}" shown in the reference photo. Keep the person's face, body, pose and the background from the first photo unchanged — only add or fit the product onto them naturally, matching lighting and perspective. Do not alter their identity.`,
        },
        size: '1024x1536',
      })
      const mediaType = image.mediaType || 'image/png'
      return { dataUrl: `data:${mediaType};base64,${image.base64}` }
    }

    return await Promise.race([
      run(),
      new Promise<TryOnResult>((resolve) =>
        setTimeout(() => resolve({ error: 'failed' }), timeoutMs),
      ),
    ])
  } catch (err) {
    console.log('[v0] image-provider(tryOn) error:', err instanceof Error ? err.message : err)
    return { error: 'failed' }
  }
}

/**
 * The single safe entry point every caller should use. Returns `null` when
 * generation is unavailable or fails for any reason — the caller then keeps its
 * prompt-only fallback. Guards against long-running calls with a timeout so a
 * slow provider can never stall the request past its budget.
 */
export async function generateSiteImage(
  req: ImageRequest,
  {
    // Must stay safely below the calling route's `maxDuration` (60s) so the
    // controlled `null` fallback can fire before the function is killed. The
    // default fast model returns in ~2-3s; 25s leaves generous headroom for a
    // slow response while still guaranteeing the fallback. Any override is
    // hard-capped at 25s for the same reason.
    timeoutMs = Math.min(Number(process.env.IMAGE_TIMEOUT_MS) || 25_000, 25_000),
  }: { timeoutMs?: number } = {},
): Promise<ImageResult> {
  const provider = getImageProvider()
  if (!provider.isConfigured()) return null

  try {
    return await Promise.race([
      provider.generate(req),
      new Promise<ImageResult>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ])
  } catch (err) {
    console.log(
      '[v0] generateSiteImage error:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
