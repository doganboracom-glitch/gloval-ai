import { z } from 'zod'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { cleanDetailBlocks, type DetailBlock } from '@/lib/section-detail'
import {
  MAX_SERVICE_BLOCKS,
  MIN_SERVICE_BLOCKS,
  buildStarterServiceBlocks,
  collectServiceFacts,
  groundServiceBlocks,
  hasEnoughServiceFacts,
} from '@/lib/service-detail-ai'
import { findInlineCatalogSection, type InlineProduct } from '@/lib/product-items'

type Lang = 'tr' | 'en'

const outputSchema = z.object({
  blocks: z
    .array(z.object({ heading: z.string().min(2).max(100), body: z.string().min(40).max(1200) }))
    .min(MIN_SERVICE_BLOCKS)
    .max(MAX_SERVICE_BLOCKS),
})

const SYSTEM: Record<Lang, string> = {
  tr:
    'Bir web sitesindeki TEK BİR ürünün detay sayfası için metin yazıyorsun. SADECE verilen bilgileri kullan. ' +
    'Fiyat, indirim, garanti, sertifika, belge, referans, ödül, yıl, sayı, ölçü, yüzde veya müşteri adı UYDURMA; bilgi yoksa genel ve kısa kal. ' +
    'Yer tutucu, lorem ipsum, köşeli parantez ve pazarlama klişesi yok. Doğal, akıcı Türkçe. ' +
    'Her blok bir alt başlık ve 1-2 paragraf içerir. Madde listesi gerekiyorsa her satırı "- " ile başlat.',
  en:
    'You write the detail-page copy for ONE product on a website. Use ONLY the facts provided. ' +
    'NEVER invent prices, discounts, warranties, certificates, references, awards, years, numbers, dimensions, percentages or client names; when a fact is missing, stay general and short. ' +
    'No placeholders, no lorem ipsum, no square brackets, no marketing cliches. Natural, fluent English. ' +
    'Each block has a subheading and 1-2 paragraphs. For lists, start each line with "- ".',
}

export type ProductDetailWrite = { blocks: DetailBlock[]; written: boolean }

function asServiceLike(item: InlineProduct) {
  return { title: item.name, description: item.description ?? '' }
}

/** What the owner typed about this product (specs and category count as their own words). */
function productFacts(site: WebsiteSchema, item: InlineProduct): string[] {
  const specs = (item.specs ?? []).map((spec) => `${spec.name}: ${spec.value}`)
  return [...collectServiceFacts(site, asServiceLike(item)), item.category ?? '', ...specs]
    .map((fact) => fact.trim())
    .filter(Boolean)
}

/**
 * Writes one corporate product's page text from the site's own facts. `written`
 * is true only when the model's text survived the grounding guard; otherwise the
 * free starter is returned so callers charge only for real output. Never throws.
 */
export async function generateProductDetail(
  site: WebsiteSchema,
  itemIndex: number,
  planCode: string | null,
): Promise<ProductDetailWrite> {
  const item = findInlineCatalogSection(site)?.items[itemIndex]
  if (!item) return { blocks: [], written: false }
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  const starter = buildStarterServiceBlocks(asServiceLike(item))
  if (!hasEnoughServiceFacts(site, asServiceLike(item))) return { blocks: starter, written: false }
  const facts = productFacts(site, item)
  try {
    const result = await generateStructured({
      ai: resolveAiModel('sectionEdit', planCode),
      schema: outputSchema,
      system: SYSTEM[lang],
      prompt: [
        `Business: ${site.meta.name}`,
        `Product: ${item.name}`,
        `What the site says about this product: ${item.description ?? ''}`,
        'Facts (the only allowed source):',
        ...facts.map((fact) => `- ${fact}`),
        'Write 2 to 3 blocks, for example: what it is, where it is used, what to know before choosing it.',
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
    console.log('[product-detail] generation failed:', err instanceof Error ? err.message : 'unknown')
    return { blocks: starter, written: false }
  }
}
