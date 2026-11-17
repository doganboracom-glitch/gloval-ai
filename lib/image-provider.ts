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
 *  - Never throws: the quality model has a bounded fast-model fallback, and
 *    every failure is returned as a prompt-free reason code.
 */

import { withImagePromptRules } from './image-prompt-rules'
import { generateWithTextGuard } from './image-text-guard'

export type ImageAspect = '1:1' | '4:3' | '3:2' | '16:9' | '3:4' | '9:16'

export const IMAGE_FAILURE_REASONS = [
  'low_confidence_skipped',
  'timeout',
  'provider_error',
  'storage_failed',
  'text_guard_exhausted',
  'relevance_mismatch',
  'disabled',
] as const

export type ImageFailureReason = (typeof IMAGE_FAILURE_REASONS)[number]
export type ProviderFailureReason = Extract<ImageFailureReason, 'timeout' | 'provider_error' | 'disabled'>

export const DEFAULT_IMAGE_QUALITY_MODEL = 'recraft/recraft-v4.1-flash'
export const DEFAULT_IMAGE_FALLBACK_MODEL = 'bfl/flux-2-klein-4b'
export const IMAGE_PRIMARY_TIMEOUT_MS = 13_000
export const IMAGE_FALLBACK_TIMEOUT_MS = 5_000
const MAX_IMAGE_PRIMARY_TIMEOUT_MS = 13_000

export function resolveImageModel(requested?: string): string {
  return (
    requested?.trim() ||
    process.env.IMAGE_MODEL?.trim() ||
    process.env.IMAGE_MODEL_QUALITY?.trim() ||
    DEFAULT_IMAGE_QUALITY_MODEL
  )
}

export function getImageFallbackModel(): string {
  return process.env.IMAGE_MODEL_FALLBACK?.trim() || DEFAULT_IMAGE_FALLBACK_MODEL
}

export type ImageRequest = {
  prompt: string
  aspectRatio?: ImageAspect
  /** Logos/wordmarks only: skips the no-text rules and the text guard. */
  allowText?: boolean
  /** Gateway image model id for this request; defaults to `IMAGE_MODEL` or the quality model. */
  model?: string
  /** Disable the automatic fast-model fallback for a single deliberate model attempt. */
  allowFallback?: boolean
  /** Receives a prompt-free failure code when no image is generated. */
  onFailure?: (reason: ProviderFailureReason) => void
  /** Abort signal from the bounded model-attempt runner. */
  signal?: AbortSignal
}

export type ImageResult = { src: string; provider: string } | null

/* -------------------------------------------------------------------------- */
/*  Bounded primary / fallback model attempts                                 */
/* -------------------------------------------------------------------------- */

export type ModelFallbackResult<T> =
  | { result: T; model: string; fallbackUsed: boolean }
  | { result: null; reason: Extract<ImageFailureReason, 'timeout' | 'provider_error'>; model: string; fallbackUsed: boolean }

export async function generateWithModelFallback<T>(
  generate: (model: string, signal: AbortSignal) => Promise<T | null>,
  {
    primaryModel,
    fallbackModel,
    primaryTimeoutMs = IMAGE_PRIMARY_TIMEOUT_MS,
    fallbackTimeoutMs = IMAGE_FALLBACK_TIMEOUT_MS,
  }: {
    primaryModel: string
    fallbackModel?: string
    primaryTimeoutMs?: number
    fallbackTimeoutMs?: number
  },
): Promise<ModelFallbackResult<T>> {
  const attempts = [
    { model: primaryModel, timeoutMs: primaryTimeoutMs },
    ...(fallbackModel && fallbackModel !== primaryModel
      ? [{ model: fallbackModel, timeoutMs: fallbackTimeoutMs }]
      : []),
  ]
  let sawTimeout = false
  let lastModel = primaryModel

  for (const [index, attempt] of attempts.entries()) {
    lastModel = attempt.model
    const controller = new AbortController()
    let timedOut = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const generated = await Promise.race([
      generate(attempt.model, controller.signal).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
          resolve(null)
        }, Math.max(1, attempt.timeoutMs))
      }),
    ])
    if (timer) clearTimeout(timer)
    if (generated) return { result: generated, model: attempt.model, fallbackUsed: index > 0 }
    if (timedOut) sawTimeout = true
  }

  return {
    result: null,
    reason: sawTimeout ? 'timeout' : 'provider_error',
    model: lastModel,
    fallbackUsed: attempts.length > 1,
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

function bflDimensions(aspectRatio: ImageAspect): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1024, height: 1024 }
    case '4:3':
      return { width: 1280, height: 960 }
    case '3:2':
      return { width: 1536, height: 1024 }
    case '3:4':
      return { width: 960, height: 1280 }
    case '9:16':
      return { width: 765, height: 1360 }
    case '16:9':
    default:
      return { width: 1360, height: 765 }
  }
}

type ImageModelOptions =
  | { providerOptions: { blackForestLabs: { width: number; height: number } } }
  | { size: `${number}x${number}` }
  | { aspectRatio: ImageAspect }

function recraftSize(aspectRatio: ImageAspect): `${number}x${number}` {
  switch (aspectRatio) {
    case '1:1':
      return '1024x1024'
    case '4:3':
      return '1216x896'
    case '3:2':
      return '1280x832'
    case '3:4':
      return '896x1216'
    case '9:16':
      return '768x1344'
    case '16:9':
    default:
      return '1344x768'
  }
}

export function getImageModelOptions(modelId: string, aspectRatio: ImageAspect): ImageModelOptions {
  if (modelId.startsWith('bfl/flux-2-klein')) {
    return { providerOptions: { blackForestLabs: bflDimensions(aspectRatio) } }
  }
  if (modelId.startsWith('recraft/')) return { size: recraftSize(aspectRatio) }
  return { aspectRatio }
}

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
  async generate({ prompt, aspectRatio = '16:9', model, signal }) {
    const modelId = model || resolveImageModel()
    try {
      const { generateImage, gateway } = await import('ai')
      const modelAspectOptions = getImageModelOptions(modelId, aspectRatio)
      const { image, warnings } = await generateImage({
        model: gateway.imageModel(modelId),
        prompt,
        ...modelAspectOptions,
        abortSignal: signal,
        maxRetries: 0,
      })
      if (warnings?.length) {
        console.warn('[image-generation-model-warning]', {
          model: modelId,
          warningCount: warnings.length,
        })
      }
      const mediaType = image.mediaType || 'image/png'
      return { src: `data:${mediaType};base64,${image.base64}`, provider: 'gateway' }
    } catch {
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
  // headroom under the route's `maxDuration = 300`.
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
  { timeoutMs }: { timeoutMs?: number } = {},
): Promise<ImageResult> {
  const provider = getImageProvider()
  const primaryModel = resolveImageModel(req.model)
  const fallbackModel = req.allowFallback === false ? undefined : getImageFallbackModel()
  const envTimeout = Number(process.env.IMAGE_TIMEOUT_MS)
  const requestedTimeout = timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout > 0
    ? envTimeout
    : IMAGE_PRIMARY_TIMEOUT_MS)
  const primaryTimeoutMs = Math.max(1, Math.min(requestedTimeout, MAX_IMAGE_PRIMARY_TIMEOUT_MS))

  if (!provider.isConfigured()) {
    req.onFailure?.('disabled')
    console.info('[image-generation]', { reason: 'disabled', model: primaryModel })
    return null
  }

  const guarded = !req.allowText
  const finalReq: ImageRequest = guarded
    ? { ...req, prompt: withImagePromptRules(req.prompt) }
    : req
  let lastFailure: Extract<ImageFailureReason, 'timeout' | 'provider_error'> | undefined

  const generateOnce = async (): Promise<ImageResult> => {
    const attempt = await generateWithModelFallback(
      (model, signal) => provider.generate({ ...finalReq, model, signal }),
      {
        primaryModel,
        fallbackModel,
        primaryTimeoutMs,
        fallbackTimeoutMs: IMAGE_FALLBACK_TIMEOUT_MS,
      },
    )
    if (!attempt.result) lastFailure = attempt.reason
    else lastFailure = undefined
    return attempt.result
  }

  try {
    const result = guarded ? await generateWithTextGuard(generateOnce) : await generateOnce()
    if (result) return result

    const reason = lastFailure ?? 'provider_error'
    req.onFailure?.(reason)
    console.info('[image-generation]', {
      reason,
      model: primaryModel,
      fallbackModel: fallbackModel ?? null,
    })
    return null
  } catch {
    req.onFailure?.('provider_error')
    console.info('[image-generation]', {
      reason: 'provider_error',
      model: primaryModel,
      fallbackModel: fallbackModel ?? null,
    })
    return null
  }
}
