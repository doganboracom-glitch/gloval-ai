import { z } from 'zod'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { buildStarterAboutDetail, cleanDetailBlocks, findAboutSection, type DetailBlock, type SectionDetail } from '@/lib/section-detail'

type AboutData = Extract<Section, { type: 'about' }>
type Lang = 'tr' | 'en'

const MIN_BLOCKS = 3
const PLACEHOLDER = /lorem|ipsum|placeholder|yer tutucu|örnek metin|sample text|\[[^\]]*\]|xxx/i

const outputSchema = z.object({
  blocks: z
    .array(
      z.object({
        heading: z.string().min(2).max(100),
        body: z.string().min(40).max(1400),
      }),
    )
    .min(MIN_BLOCKS)
    .max(6),
})

/** Everything the site itself already says about the business: the ONLY allowed source of facts. */
export function collectAboutFacts(site: Pick<WebsiteSchema, 'meta' | 'sections'>): string[] {
  const facts: string[] = [site.meta.name, site.meta.tagline, site.meta.description, site.meta.audience]
  for (const section of site.sections) {
    if (section.hidden) continue
    if ('title' in section && typeof section.title === 'string') facts.push(section.title)
    if (section.type === 'about') {
      facts.push(section.body, ...(section.highlights ?? []))
    } else if (section.type === 'services') {
      for (const item of section.items ?? []) facts.push(item.title, item.description)
    } else if (section.type === 'features') {
      for (const item of section.items ?? []) facts.push(item.title, item.description)
    } else if (section.type === 'hero') {
      facts.push(section.title, section.description)
    }
  }
  return facts.map((f) => (f ?? '').trim()).filter(Boolean)
}

function digitsOf(text: string): string[] {
  return text.match(/\d[\d.,]*/g) ?? []
}

/**
 * Drops anything that is not grounded in `facts`: blocks with placeholder text,
 * and blocks that mention a number (years, counts, percentages) the site itself
 * never stated. Pure, so the guard is testable without a model.
 */
export function groundBlocks(blocks: DetailBlock[], facts: string[]): DetailBlock[] {
  const known = new Set(digitsOf(facts.join(' ')))
  return blocks.filter((block) => {
    const text = `${block.heading ?? ''} ${block.body}`
    if (PLACEHOLDER.test(text)) return false
    return digitsOf(text).every((n) => known.has(n))
  })
}

/** True when the site gives the writer enough to say anything beyond the starter. */
export function hasEnoughFacts(site: Pick<WebsiteSchema, 'meta' | 'sections'>): boolean {
  return collectAboutFacts(site).join(' ').length >= 160
}

const SYSTEM: Record<Lang, string> = {
  tr:
    'Bir web sitesinin "Hakkımızda" sayfası için uzun metin yazıyorsun. SADECE verilen bilgileri kullan. ' +
    'Sayı, yıl, rakam, ödül, belge, müşteri adı, kuruluş tarihi, konum veya ekip büyüklüğü UYDURMA; bilgi yoksa genel ve kısa kal. ' +
    'Yer tutucu, lorem ipsum, köşeli parantez ve pazarlama klişesi yok. Doğal, akıcı, ikinci çoğul veya birinci çoğul şahıs Türkçe. ' +
    'Her blok bir alt başlık ve 1-2 paragraf içerir. Madde listesi gerekiyorsa her satırı "- " ile başlat.',
  en:
    'You write the long-form "About us" page copy for a website. Use ONLY the facts provided. ' +
    'NEVER invent numbers, years, awards, certificates, client names, founding dates, locations or team sizes; when a fact is missing, stay general and short. ' +
    'No placeholders, no lorem ipsum, no square brackets, no marketing cliches. Natural, fluent first-person-plural English. ' +
    'Each block has a subheading and 1-2 paragraphs. For lists, start each line with "- ".',
}

/**
 * Writes the About page body from the site's own facts. Falls back to the
 * deterministic starter when facts are too thin, the model fails, or the
 * grounding guard leaves fewer than `MIN_BLOCKS` blocks. Always flagged
 * `sample` so the owner still approves it before it goes public.
 */
export async function generateAboutDetail(
  site: WebsiteSchema,
  planCode: string | null,
): Promise<SectionDetail | undefined> {
  const about = findAboutSection(site) as AboutData | null
  if (!about) return undefined
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  const starter = buildStarterAboutDetail(site, about)
  const facts = collectAboutFacts(site)
  if (!hasEnoughFacts(site)) return starter

  try {
    const result = await generateStructured({
      ai: resolveAiModel('sectionEdit', planCode),
      schema: outputSchema,
      system: SYSTEM[lang],
      prompt: [
        `Business: ${site.meta.name}`,
        'Facts (the only allowed source):',
        ...facts.map((f) => `- ${f}`),
        'Write 3 to 5 blocks, for example: who we are, what we do, how we work, who we serve.',
      ].join('\n'),
      recordEvent: false,
    })
    const blocks = groundBlocks(
      cleanDetailBlocks(result.object.blocks.map((b) => ({ heading: b.heading, level: 'h2' as const, body: b.body }))),
      facts,
    )
    if (blocks.length < MIN_BLOCKS) return starter
    return { ...starter, blocks, sample: true }
  } catch (err) {
    console.log('[v0] about-detail generation failed:', err instanceof Error ? err.message : err)
    return starter
  }
}
