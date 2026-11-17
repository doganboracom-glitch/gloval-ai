import { z } from 'zod'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { cleanDetailBlocks, type DetailBlock } from '@/lib/section-detail'
import { collectAboutFacts } from '@/lib/about-detail-ai'
import { findServicesSection, type ServiceItem } from '@/lib/service-pages'
import { SERVICE_ICONS, SERVICE_MIN_WORDS, countBlockWords, isServiceIcon } from '@/lib/service-card'

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
  'referans', 'ödül', 'yıllık deneyim', 'yıldır', '%', 'ücretsiz', '7/24', '24/7', 'memnuniyet',
  'price', 'pricing', 'cost', 'fee', 'duration', 'within 24', 'warranty', 'guarantee', 'certified',
  'certificate', 'reference', 'award', 'years of experience', 'since 19', 'since 20', '$', '€',
  'free quote', 'free of charge', 'satisfaction',
] as const

/** Per-call ceiling; one slow model call must not hold the whole background run. */
export const SERVICE_WRITE_TIMEOUT_MS = 45_000

const outputSchema = z.object({
  shortDescription: z.string().min(40).max(260),
  icon: z.string().min(2).max(40),
  blocks: z
    .array(
      z.object({
        heading: z.string().min(2).max(100),
        body: z.string().min(40).max(2000),
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
    'Her blok bir alt başlık (h2) ve 1-2 paragraf içerir. Madde listesi gerekiyorsa her satırı "- " ile başlat.',
  en:
    'You write the detail-page copy for ONE service on a website. Use ONLY the facts provided. ' +
    'NEVER invent prices, fees, durations, guarantees, certificates, references, awards, years, numbers, percentages or client names; when a fact is missing, stay general and short. ' +
    'No placeholders, no lorem ipsum, no square brackets, no marketing cliches. Natural, fluent English. ' +
    'Each block has a subheading (h2) and 1-2 paragraphs. For lists, start each line with "- ".',
}

const BRIEF: Record<Lang, (iconList: string) => string> = {
  tr: (iconList) =>
    [
      'Çıktı:',
      '- shortDescription: tam 120-160 karakter, tek cümle, hizmetin ne olduğunu ve kime yaradığını anlatır (Google açıklaması olarak da kullanılır).',
      `- icon: şu listeden TEK bir anahtar: ${iconList}`,
      '- blocks: 3 veya 4 blok (alt başlıklı). Toplam EN AZ 300 kelime yaz.',
      '  Bloklardan biri madde listesi içersin (her satır "- " ile). Son blok, işletmeyle iletişime geçmeye davet eden yumuşak bir kapanış olsun; söz, fiyat veya garanti verme.',
    ].join('\n'),
  en: (iconList) =>
    [
      'Output:',
      '- shortDescription: exactly 120-160 characters, one sentence saying what the service is and who it helps (also used as the Google description).',
      `- icon: ONE key from this list: ${iconList}`,
      '- blocks: 3 or 4 blocks (each with a subheading). Write AT LEAST 300 words in total.',
      '  One block must contain a bullet list (each line starts with "- "). The last block is a soft closing that invites contacting the business; promise nothing, no prices or guarantees.',
    ].join('\n'),
}
export type ServiceDetailWrite = {
  blocks: DetailBlock[]
  written: boolean
  /** Grounded Kısa açıklama (120-160 chars), only when the model's text passed the guard. */
  description?: string
  /** Validated icon key from the service icon set. */
  icon?: string
}

/** Keeps a model description only when it is grounded, placeholder-free and a sane length. */
export function acceptShortDescription(raw: string, facts: string[]): string | undefined {
  const text = raw.replace(/\s+/g, ' ').trim()
  const length = Array.from(text).length
  if (length < 100 || length > 200) return undefined
  const grounded = groundServiceBlocks([{ heading: '', level: 'h2', body: text }], facts)
  return grounded.length > 0 ? text : undefined
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('service_write_timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Writes one service's card + page text: Kısa açıklama, an icon and 3-4 blocks
 * (>= 300 words, one retry when shorter). `written` is true only when the model's
 * text survived the grounding guard; otherwise the free starter is returned, so
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
  const iconList = SERVICE_ICONS.join(', ')

  const basePrompt = [
    `Business: ${site.meta.name}`,
    `Service: ${item.title}`,
    `What the site says about this service: ${item.description}`,
    'Facts (the only allowed source):',
    ...facts.map((f) => `- ${f}`),
    BRIEF[lang](iconList),
  ].join('\n')

  let best: { blocks: DetailBlock[]; words: number; description?: string; icon?: string } | null = null
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const retryNote: string =
        attempt === 0 || !best
          ? ''
          : lang === 'tr'
            ? `\nÖnceki deneme yalnızca ${best.words} kelimeydi. Aynı gerçeklere bağlı kalarak daha ayrıntılı yaz; EN AZ ${SERVICE_MIN_WORDS} kelime olsun.`
            : `\nThe previous attempt was only ${best.words} words. Stay within the same facts but write in more depth; AT LEAST ${SERVICE_MIN_WORDS} words.`
      const result: { object: z.infer<typeof outputSchema> } = await withTimeout(
        generateStructured({
          // Background generation always uses the standard tier, whatever the plan.
          ai: resolveAiModel('sectionEdit', options.standard ? null : planCode),
          schema: outputSchema,
          system: SYSTEM[lang],
          prompt: basePrompt + retryNote,
          recordEvent: false,
        }),
        SERVICE_WRITE_TIMEOUT_MS,
      )
      const blocks = groundServiceBlocks(
        cleanDetailBlocks(result.object.blocks.map((b) => ({ heading: b.heading, level: 'h2' as const, body: b.body }))),
        facts,
      )
      if (blocks.length < MIN_SERVICE_BLOCKS) continue
      const words = countBlockWords(blocks)
      if (!best || words > best.words) {
        best = {
          blocks,
          words,
          description: acceptShortDescription(result.object.shortDescription, facts),
          icon: isServiceIcon(result.object.icon) ? result.object.icon : undefined,
        }
      }
      if (words >= SERVICE_MIN_WORDS) break
    }
  } catch (err) {
    console.log('[service-detail] generation failed:', err instanceof Error ? err.message : 'unknown')
  }
  if (!best) return { blocks: starter, written: false }
  return { blocks: best.blocks, written: true, description: best.description, icon: best.icon }
}
