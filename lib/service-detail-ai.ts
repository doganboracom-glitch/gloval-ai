import { z } from 'zod'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { cleanDetailBlocks, type DetailBlock } from '@/lib/section-detail'
import { collectAboutFacts } from '@/lib/about-detail-ai'
import { findServicesSection, type ServiceItem } from '@/lib/service-pages'

type Lang = 'tr' | 'en'

export const MIN_SERVICE_BLOCKS = 2
export const MAX_SERVICE_BLOCKS = 4
/** Below this many characters of facts the writer only echoes the site's own description. */
export const MIN_SERVICE_FACT_CHARS = 120

const PLACEHOLDER = /lorem|ipsum|placeholder|yer tutucu|örnek metin|sample text|\[[^\]]*\]|xxx/i

/**
 * Claim stems the model may never introduce on its own. A stem is only allowed
 * when the site's own facts already contain it (the owner wrote it).
 */
const CLAIM_STEMS = [
  'fiyat', 'ücret', '₺', 'tl ', 'süre', 'saat içinde', 'gün içinde', 'garanti', 'sertifika', 'belgeli',
  'referans', 'ödül', 'yıllık deneyim', 'yıldır', '%',
  'price', 'pricing', 'cost', 'fee', 'duration', 'within 24', 'warranty', 'guarantee', 'certified',
  'certificate', 'reference', 'award', 'years of experience', 'since 19', 'since 20', '$', '€',
] as const

const outputSchema = z.object({
  blocks: z
    .array(
      z.object({
        heading: z.string().min(2).max(100),
        body: z.string().min(40).max(1200),
      }),
    )
    .min(MIN_SERVICE_BLOCKS)
    .max(MAX_SERVICE_BLOCKS),
})

function fold(text: string): string {
  return text.toLocaleLowerCase('tr').replace(/\s+/g, ' ')
}

function digitsOf(text: string): string[] {
  return text.match(/\d[\d.,]*/g) ?? []
}

/** Facts the writer may use for one service: the site's own words, nothing else. */
export function collectServiceFacts(site: Pick<WebsiteSchema, 'meta' | 'sections'>, item: Pick<ServiceItem, 'title' | 'description'>): string[] {
  return [item.title, item.description, ...collectAboutFacts(site)].map((f) => (f ?? '').trim()).filter(Boolean)
}

export function hasEnoughServiceFacts(site: Pick<WebsiteSchema, 'meta' | 'sections'>, item: Pick<ServiceItem, 'title' | 'description'>): boolean {
  return collectServiceFacts(site, item).join(' ').length >= MIN_SERVICE_FACT_CHARS && item.description.trim().length >= 12
}

/** The claim stems present in `text` that the facts never mention. Exported for tests. */
export function inventedClaims(text: string, facts: string[]): string[] {
  const haystack = fold(`${text} `)
  const known = fold(`${facts.join(' ')} `)
  return CLAIM_STEMS.filter((stem) => haystack.includes(stem) && !known.includes(stem))
}

/**
 * Drops anything not grounded in `facts`: placeholder text, numbers the site
 * never stated, and price / duration / guarantee / certificate / reference /
 * award claims the owner never made. Pure, so the ban is testable without a model.
 */
export function groundServiceBlocks(blocks: DetailBlock[], facts: string[]): DetailBlock[] {
  const knownNumbers = new Set(digitsOf(facts.join(' ')))
  return blocks.filter((block) => {
    const text = `${block.heading ?? ''} ${block.body}`
    if (PLACEHOLDER.test(text)) return false
    if (!digitsOf(text).every((n) => knownNumbers.has(n))) return false
    return inventedClaims(text, facts).length === 0
  })
}

/** Deterministic, free fallback: the service's own description, nothing added. Empty when it has none. */
export function buildStarterServiceBlocks(item: Pick<ServiceItem, 'title' | 'description'>): DetailBlock[] {
  const body = item.description.trim()
  if (!body) return []
  return cleanDetailBlocks([{ heading: item.title.trim() || undefined, level: 'h2', body }])
}

const SYSTEM: Record<Lang, string> = {
  tr:
    'Bir web sitesindeki TEK BİR hizmetin detay sayfası için metin yazıyorsun. SADECE verilen bilgileri kullan. ' +
    'Fiyat, ücret, süre, garanti, sertifika, belge, referans, ödül, yıl, sayı, yüzde veya müşteri adı UYDURMA; bilgi yoksa genel ve kısa kal. ' +
    'Yer tutucu, lorem ipsum, köşeli parantez ve pazarlama klişesi yok. Doğal, akıcı Türkçe. ' +
    'Her blok bir alt başlık ve 1-2 paragraf içerir. Madde listesi gerekiyorsa her satırı "- " ile başlat.',
  en:
    'You write the detail-page copy for ONE service on a website. Use ONLY the facts provided. ' +
    'NEVER invent prices, fees, durations, guarantees, certificates, references, awards, years, numbers, percentages or client names; when a fact is missing, stay general and short. ' +
    'No placeholders, no lorem ipsum, no square brackets, no marketing cliches. Natural, fluent English. ' +
    'Each block has a subheading and 1-2 paragraphs. For lists, start each line with "- ".',
}

export type ServiceDetailWrite = { blocks: DetailBlock[]; written: boolean }

/**
 * Writes one service's page text. `written` is true only when the model's text
 * survived the grounding guard; otherwise the free starter is returned, so
 * callers can charge only for real output. Never throws.
 */
export async function generateServiceDetail(
  site: WebsiteSchema,
  itemIndexInSection: number,
  planCode: string | null,
  options: { standard?: boolean } = {},
): Promise<ServiceDetailWrite> {
  const section = findServicesSection(site)
  const item = section?.items[itemIndexInSection]
  if (!section || !item) return { blocks: [], written: false }
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  const starter = buildStarterServiceBlocks(item)
  if (!hasEnoughServiceFacts(site, item)) return { blocks: starter, written: false }
  const facts = collectServiceFacts(site, item)
  try {
    const result = await generateStructured({
      // Background generation always uses the standard tier, whatever the plan.
      ai: resolveAiModel('sectionEdit', options.standard ? null : planCode),
      schema: outputSchema,
      system: SYSTEM[lang],
      prompt: [
        `Business: ${site.meta.name}`,
        `Service: ${item.title}`,
        `What the site says about this service: ${item.description}`,
        'Facts (the only allowed source):',
        ...facts.map((f) => `- ${f}`),
        'Write 2 to 3 blocks, for example: what it is, how it helps, who it is for.',
      ].join('\n'),
      recordEvent: false,
    })
    const blocks = groundServiceBlocks(
      cleanDetailBlocks(result.object.blocks.map((b) => ({ heading: b.heading, level: 'h2' as const, body: b.body }))),
      facts,
    )
    if (blocks.length < MIN_SERVICE_BLOCKS) return { blocks: starter, written: false }
    return { blocks, written: true }
  } catch (err) {
    console.log('[service-detail] generation failed:', err instanceof Error ? err.message : 'unknown')
    return { blocks: starter, written: false }
  }
}
