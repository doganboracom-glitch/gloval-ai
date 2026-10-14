import { z } from 'zod'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { PRODUCT_IMAGE_LIMITS } from '@/lib/product-images'
import { PRODUCT_LIMITS, type ProductSpec } from '@/lib/product-input'
import { StoreAiInvalidResult, StoreAiRefusal } from '@/lib/store-ai-engine'
import { wordIncludes } from '@/lib/visual-subjects'

/** The model sees at most this many product images. */
export const STORE_AI_MAX_IMAGES = 4
export const STORE_AI_DESCRIPTION_MAX = 2000

export type StoreAiTextInput = {
  name: string
  categoryId?: string | null
  categories: ReadonlyArray<{ id: string; name: string }>
  specs: ReadonlyArray<ProductSpec>
  imageUrls: readonly string[]
  lang: 'tr' | 'en'
}

export type StoreAiGeneratedSpec = { name: string; value: string; verify: boolean }

export type StoreAiTextResult = {
  description: string
  specs: StoreAiGeneratedSpec[]
  seoTitle: string
  seoDescription: string
  /** Index-aligned with the images the model saw; null where nothing usable came back. */
  imageAlts: Array<string | null>
  categoryId: string | null
}

// ---------------------------------------------------------------------------
// Input checks
// ---------------------------------------------------------------------------

/** Folded, word-boundary keys. Deliberately conservative; the model also refuses on its own. */
const PROHIBITED_KEYS = [
  'silah',
  'silahi',
  'silahlar',
  'tabanca',
  'tabancasi',
  'tufek',
  'tufegi',
  'muhimmat',
  'patlayici',
  'bomba',
  'uyusturucu',
  'esrar',
  'kokain',
  'eroin',
  'porno',
  'erotik',
  'replika',
  'sahte',
  'cakma',
  'taklit marka',
  'weapon',
  'firearm',
  'ammunition',
  'explosive',
  'narcotic',
  'cocaine',
  'heroin',
  'porn',
  'counterfeit',
  'fake',
] as const

/** Returns the matched key, or null when the text looks fine. */
export function findProhibitedTopic(...texts: Array<string | null | undefined>): string | null {
  const text = texts.filter(Boolean).join(' \n ')
  if (!text) return null
  return PROHIBITED_KEYS.find((key) => wordIncludes(text, key)) ?? null
}

export function hasUsableInput(input: Pick<StoreAiTextInput, 'name' | 'imageUrls'>): boolean {
  return input.name.trim().length > 0 || input.imageUrls.length > 0
}

// ---------------------------------------------------------------------------
// Output cleanup
// ---------------------------------------------------------------------------

/** Plain text only: tags and angle brackets are removed, whitespace tidied. */
export function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function singleLine(text: string): string {
  return stripMarkup(text).replace(/\s+/g, ' ')
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max).trimEnd() : text
}

export const generatedSchema = z.object({
  refused: z.boolean(),
  intro: z.string().default(''),
  benefits: z.array(z.string()).default([]),
  specs: z.array(z.object({ name: z.string(), value: z.string().default(''), verify: z.boolean().default(false) })).default([]),
  seoTitle: z.string().default(''),
  seoDescription: z.string().default(''),
  imageAlts: z.array(z.string()).default([]),
  categoryId: z.string().default(''),
})

export type RawStoreAiText = z.infer<typeof generatedSchema>

/**
 * Turns the raw model object into the result the form can use. Throws
 * `StoreAiRefusal` when the model declined and `StoreAiInvalidResult` when the
 * answer is unusable; both make the engine refund the attempt.
 */
export function normalizeGenerated(raw: unknown, input: StoreAiTextInput): StoreAiTextResult {
  const parsed = generatedSchema.safeParse(raw)
  if (!parsed.success) throw new StoreAiInvalidResult('schema')
  const data = parsed.data
  if (data.refused) throw new StoreAiRefusal('model_refused')

  const intro = stripMarkup(data.intro)
  const benefits = data.benefits
    .map(singleLine)
    .filter(Boolean)
    .slice(0, 6)
    .map((benefit) => `- ${benefit}`)
  const description = clip([intro, benefits.join('\n')].filter(Boolean).join('\n\n'), STORE_AI_DESCRIPTION_MAX)

  const seoTitle = clip(singleLine(data.seoTitle), PRODUCT_LIMITS.seoTitle)
  const seoDescription = clip(singleLine(data.seoDescription), PRODUCT_LIMITS.seoDescription)
  if (!description || !seoTitle) throw new StoreAiInvalidResult('empty')

  const seen = new Set<string>()
  const specs: StoreAiGeneratedSpec[] = []
  for (const spec of data.specs) {
    const name = clip(singleLine(spec.name), PRODUCT_LIMITS.specName)
    const key = name.toLocaleLowerCase('tr')
    if (!name || seen.has(key)) continue
    seen.add(key)
    specs.push({ name, value: clip(singleLine(spec.value), PRODUCT_LIMITS.specValue), verify: spec.verify })
    if (specs.length >= PRODUCT_LIMITS.specCount) break
  }

  const seenCount = Math.min(input.imageUrls.length, STORE_AI_MAX_IMAGES)
  const imageAlts: Array<string | null> = Array.from({ length: seenCount }, (_, index) => {
    const alt = clip(singleLine(data.imageAlts[index] ?? ''), PRODUCT_IMAGE_LIMITS.maxAlt)
    return alt || null
  })

  const categoryId = input.categories.some((category) => category.id === data.categoryId) ? data.categoryId : null

  return { description, specs, seoTitle, seoDescription, imageAlts, categoryId }
}

// ---------------------------------------------------------------------------
// Model call
// ---------------------------------------------------------------------------

export function buildSystemPrompt(lang: 'tr' | 'en'): string {
  const language = lang === 'en' ? 'English' : 'Turkish'
  return (
    `You write product-page copy for a small online store. Write in ${language}, as PLAIN TEXT: no HTML, no markdown headings, no emojis. ` +
    `Base everything ONLY on what the owner gave you: the product photos, the product name, the category and the listed features. ` +
    `Never invent facts that cannot be read from them: karat/purity, measurements, weight, material, brand, certificates, warranty, ` +
    `origin, quantities, prices, or any health/medical claim. If a spec is a reasonable guess you cannot confirm, still list it but set "verify": true. ` +
    `Leave out anything you cannot even guess. ` +
    `Return: "intro" (2-3 sentence product pitch), "benefits" (3-5 short benefit lines, no bullet characters), ` +
    `"specs" (name/value pairs; value may be empty), "seoTitle" (max ${PRODUCT_LIMITS.seoTitle} characters), ` +
    `"seoDescription" (max ${PRODUCT_LIMITS.seoDescription} characters), "imageAlts" (one short alt text per photo, in photo order, empty string if unclear), ` +
    `"categoryId" (the id of the best matching category from the list, or an empty string). ` +
    `Do NOT output price, VAT or stock. ` +
    `If the product is a weapon, ammunition, drug, counterfeit or brand imitation, adult content or otherwise illegal, set "refused": true and leave the rest empty. Otherwise "refused": false.`
  )
}

export function buildUserPrompt(input: StoreAiTextInput): string {
  const category = input.categories.find((c) => c.id === input.categoryId)?.name
  const specs = input.specs.filter((s) => s.name.trim()).map((s) => `- ${s.name.trim()}: ${s.value.trim() || '(no value)'}`)
  const categories = input.categories.map((c) => `- ${c.id} = ${c.name}`)
  return [
    `Product name: ${input.name.trim() || '(not given, read it from the photos)'}`,
    category ? `Current category: ${category}` : null,
    specs.length ? `Features given by the owner:\n${specs.join('\n')}` : null,
    categories.length ? `Available categories (id = name):\n${categories.join('\n')}` : 'There are no categories.',
    `Number of photos attached: ${Math.min(input.imageUrls.length, STORE_AI_MAX_IMAGES)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

export type StoreAiGenerateArgs = {
  system: string
  prompt: string
  imageUrls: string[]
  signal: AbortSignal
  /** Gateway model id picked by `resolveAiModel('productText', plan)`. */
  model?: string
  /** Plan code of the caller, used only for the usage/repair log lines. */
  plan?: string | null
}
export type StoreAiGenerateFn = (args: StoreAiGenerateArgs) => Promise<unknown>

export const generateWithGateway: StoreAiGenerateFn = async ({ system, prompt, imageUrls, signal, model, plan }) => {
  const resolved = resolveAiModel('productText', plan ?? null)
  const { object } = await generateStructured({
    ai: model ? { ...resolved, model } : resolved,
    schema: generatedSchema,
    system,
    prompt,
    imageUrls,
    abortSignal: signal,
  })
  return object
}

export async function generateStoreAiText(
  input: StoreAiTextInput,
  signal: AbortSignal,
  generate: StoreAiGenerateFn = generateWithGateway,
  model?: string,
  plan?: string | null,
): Promise<StoreAiTextResult> {
  const imageUrls = input.imageUrls.slice(0, STORE_AI_MAX_IMAGES)
  const raw = await generate({
    system: buildSystemPrompt(input.lang),
    prompt: buildUserPrompt(input),
    imageUrls,
    signal,
    model,
    plan,
  })
  return normalizeGenerated(raw, input)
}
