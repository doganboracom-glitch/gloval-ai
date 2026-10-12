import { processProductImage } from '@/lib/product-image-pipeline'
import { isUuid } from '@/lib/product-images'
import { StoreAiInvalidResult, StoreAiRefusal } from '@/lib/store-ai-engine'
import { STORE_AI_IMAGE } from '@/lib/store-ai-constants'
import { IMAGE_STYLES, type ImageStyleId } from '@/lib/store-ai-image-styles'

/**
 * Alternative product photos from an uploaded one (image-conditioned edit through
 * the existing AI Gateway). The metered engine owns credits; this file owns the
 * prompt, the result checks and where candidates are kept until accepted.
 */

/* -------------------------------------------------------------------------- */
/*  Prompt                                                                    */
/* -------------------------------------------------------------------------- */

function cleanProductName(name: string): string {
  return name.replace(/["\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function buildImagePrompt(style: ImageStyleId, productName: string): string {
  const scene = IMAGE_STYLES.find((s) => s.id === style)?.scene ?? IMAGE_STYLES[0].scene
  const name = cleanProductName(productName)
  return [
    'Product photo edit. Keep the product in the reference image EXACTLY as it is: same shape, proportions, colors, patterns, materials, brand marks, and any text or logos printed on it.',
    'Do not redraw, restyle, add, remove or alter any part of the product. Only replace the background, lighting and surroundings.',
    `Scene: ${scene}.`,
    'Rules: no people, no faces, no hands, no body parts. No other brands, logos, watermarks or readable text anywhere except what is already printed on the product. One product only, centered, fully in frame, nothing cropped.',
    name ? `Product name (context only): ${name}.` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

/* -------------------------------------------------------------------------- */
/*  Cost                                                                      */
/* -------------------------------------------------------------------------- */

export type ImageUsage = { inputTokens?: number; outputTokens?: number } | undefined

export function estimateImageCost(usage: ImageUsage) {
  const known = typeof usage?.inputTokens === 'number' && typeof usage?.outputTokens === 'number'
  const usd = known
    ? ((usage?.inputTokens ?? 0) * STORE_AI_IMAGE.usdPerMillionInputTokens +
        (usage?.outputTokens ?? 0) * STORE_AI_IMAGE.usdPerMillionOutputTokens) /
      1_000_000
    : STORE_AI_IMAGE.fallbackUsd
  const tryAmount = usd * STORE_AI_IMAGE.tryPerUsd
  return {
    usd: Number(usd.toFixed(5)),
    try: Number(tryAmount.toFixed(3)),
    measured: known,
    overBreakEven: tryAmount > STORE_AI_IMAGE.breakEvenTryPerCall,
  }
}

/* -------------------------------------------------------------------------- */
/*  Model call                                                                */
/* -------------------------------------------------------------------------- */

export type ImageModelOutput = {
  bytes: Buffer
  mediaType: string
  usage?: ImageUsage
  /** Charge the gateway reports for the call, when it does (USD). */
  gatewayCostUsd?: number
}

function readGatewayCost(metadata: unknown): number | undefined {
  const gateway = (metadata as { gateway?: { cost?: unknown } } | undefined)?.gateway
  const cost = typeof gateway?.cost === 'string' ? Number(gateway.cost) : gateway?.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}
export type ImageModelFn = (args: { prompt: string; sourceDataUrl: string; signal: AbortSignal }) => Promise<ImageModelOutput>

const REFUSAL_PATTERN = /safety|moderation|content[_\s-]?policy|policy violation|not allowed/i

/**
 * `openai/gpt-image-1-mini`: edits go through plain JSON, which the gateway's Zero
 * Data Retention setting requires (BFL/Meta edits use multipart and are refused).
 */
export const generateWithGateway: ImageModelFn = async ({ prompt, sourceDataUrl, signal }) => {
  const { generateImage, gateway } = await import('ai')
  try {
    const result = await generateImage({
      model: gateway.imageModel(STORE_AI_IMAGE.model),
      prompt: { images: [sourceDataUrl], text: prompt },
      size: STORE_AI_IMAGE.size,
      providerOptions: { openai: { quality: STORE_AI_IMAGE.quality } },
      abortSignal: signal,
    })
    return {
      bytes: Buffer.from(result.image.base64 ?? '', 'base64'),
      mediaType: result.image.mediaType || 'image/png',
      usage: result.usage,
      gatewayCostUsd: readGatewayCost(result.providerMetadata),
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    const message = error instanceof Error ? error.message : ''
    if (REFUSAL_PATTERN.test(message)) throw new StoreAiRefusal()
    throw error
  }
}

/* -------------------------------------------------------------------------- */
/*  Candidates                                                                */
/* -------------------------------------------------------------------------- */

const CANDIDATE_FILE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/i
const MEDIA_EXT: Record<string, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const EXT_MEDIA: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/** Below this a "result" is an error stub, not a picture. */
const MIN_RESULT_BYTES = 2 * 1024

export const CANDIDATE_PREFIX = 'ai-candidates'

export function isCandidateFile(file: unknown): file is string {
  return typeof file === 'string' && CANDIDATE_FILE_RE.test(file)
}

/** Always derived from the AUTHORIZED project id: another project's file is unaddressable. */
export function candidatePath(projectId: string, file: string): string | null {
  if (!isUuid(projectId) || !isCandidateFile(file)) return null
  return `${CANDIDATE_PREFIX}/${projectId.toLowerCase()}/${file.toLowerCase()}`
}

export function candidateContentType(file: string): string {
  return EXT_MEDIA[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] ?? 'image/png'
}

export type CandidateEntry = { path: string; createdAt: number }

/** Storage for not-yet-accepted images; production = the `site-images` bucket, tests = a map. */
export interface CandidateStore {
  put(path: string, bytes: Buffer, contentType: string): Promise<{ error?: string }>
  get(path: string): Promise<Buffer | null>
  remove(paths: string[]): Promise<{ error?: string }>
  publicUrl(path: string): string
  listProjects(): Promise<string[]>
  listProject(projectId: string): Promise<CandidateEntry[]>
}

export function selectExpired(entries: CandidateEntry[], now: number, ttlMs = STORE_AI_IMAGE.candidateTtlMs): string[] {
  return entries.filter((entry) => now - entry.createdAt >= ttlMs).map((entry) => entry.path)
}

/** Deletes expired candidates of one project, or of every project when `projectId` is omitted. Never throws. */
export async function sweepExpiredCandidates(
  store: CandidateStore,
  now: number,
  projectId?: string,
  ttlMs = STORE_AI_IMAGE.candidateTtlMs,
): Promise<number> {
  try {
    const projects = projectId ? [projectId.toLowerCase()] : await store.listProjects()
    let removed = 0
    for (const id of projects) {
      const expired = selectExpired(await store.listProject(id), now, ttlMs)
      if (expired.length === 0) continue
      const { error } = await store.remove(expired)
      if (error) console.error('[store-ai] candidate sweep failed', { projectId: id, count: expired.length })
      else removed += expired.length
    }
    return removed
  } catch (error) {
    console.error('[store-ai] candidate sweep error', { error: error instanceof Error ? error.message : String(error) })
    return 0
  }
}

export type GenerateCandidateDeps = {
  model: ImageModelFn
  store: CandidateStore
  newId(): string
  /** Same checks as an owner upload (type, size, decodable); swapped in tests. */
  validate?: (bytes: Buffer) => Promise<{ ok: boolean }>
}

export type GeneratedCandidate = { file: string; url: string; cost: ReturnType<typeof estimateImageCost> }

/**
 * The metered `work` of an image attempt. Any throw refunds the attempt, so every
 * unusable outcome (empty, tiny, undecodable, oversized, unsupported type, failed
 * save) throws instead of returning.
 */
export async function generateImageCandidate(
  deps: GenerateCandidateDeps,
  input: { projectId: string; sourceDataUrl: string; style: ImageStyleId; productName: string; signal: AbortSignal },
): Promise<GeneratedCandidate> {
  const output = await deps.model({
    prompt: buildImagePrompt(input.style, input.productName),
    sourceDataUrl: input.sourceDataUrl,
    signal: input.signal,
  })

  const ext = MEDIA_EXT[output.mediaType]
  if (!ext || !output.bytes || output.bytes.length < MIN_RESULT_BYTES) throw new StoreAiInvalidResult()

  const validate = deps.validate ?? (async (bytes: Buffer) => processProductImage(bytes))
  if (!(await validate(output.bytes)).ok) throw new StoreAiInvalidResult()

  const file = `${deps.newId()}.${ext}`
  const path = candidatePath(input.projectId, file)
  if (!path) throw new StoreAiInvalidResult()
  const { error } = await deps.store.put(path, output.bytes, EXT_MEDIA[ext])
  if (error) throw new Error('candidate_store_failed')

  const cost = estimateImageCost(output.usage)
  console.info('[store-ai] image usage', {
    model: STORE_AI_IMAGE.model,
    quality: STORE_AI_IMAGE.quality,
    size: STORE_AI_IMAGE.size,
    inputTokens: output.usage?.inputTokens ?? null,
    outputTokens: output.usage?.outputTokens ?? null,
    gatewayCostUsd: output.gatewayCostUsd ?? null,
    estimatedUsd: cost.usd,
    estimatedTry: cost.try,
    measured: cost.measured,
    overBreakEven: cost.overBreakEven,
  })
  return { file, url: deps.store.publicUrl(path), cost }
}
