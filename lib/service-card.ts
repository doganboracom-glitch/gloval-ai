import { HERO_STRIP_ICONS, HERO_STRIP_ICON_LABELS } from '@/lib/hero-strip'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'

/**
 * Pure helpers behind the unified service card (editor) and the service SEO
 * fallback rules (public site). Leaf module: no schema import, so the editor,
 * the renderer, the generator and the tests can all share it.
 */

type BlockLike = { heading?: string; level?: 'h2' | 'h3'; body?: string }

export type ServiceTextBlock = { heading?: string; level?: 'h2' | 'h3'; body: string }
export type ServiceTextWarning = 'heading-too-long' | 'paragraph-too-long' | 'block-limit'
export type NormalizedServiceText = { blocks: ServiceTextBlock[]; warning: ServiceTextWarning | null }

export function blocksToText(blocks: ReadonlyArray<ServiceTextBlock> | null | undefined): string {
  return (blocks ?? [])
    .map((block) => {
      const heading = block.heading?.trim()
      const body = block.body.trim()
      const headingLine = heading ? `${block.level === 'h3' ? '###' : '##'} ${heading}` : ''
      return [headingLine, body].filter(Boolean).join('\n\n')
    })
    .filter(Boolean)
    .join('\n\n')
}

export function textToBlocks(text: string): ServiceTextBlock[] {
  const blocks: ServiceTextBlock[] = []
  let heading: string | undefined
  let level: 'h2' | 'h3' | undefined
  let bodyLines: string[] = []

  const flush = () => {
    const normalizedHeading = heading?.trim()
    const body = bodyLines.join('\n').trim()
    if (normalizedHeading || body) {
      blocks.push({
        ...(normalizedHeading ? { heading: normalizedHeading, level: level ?? 'h2' } : {}),
        body,
      })
    }
    heading = undefined
    level = undefined
    bodyLines = []
  }

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const match = /^(#{2,3}) (.*)$/.exec(line)
    if (match) {
      flush()
      heading = match[2]
      level = match[1].length === 3 ? 'h3' : 'h2'
    } else {
      bodyLines.push(line)
    }
  }
  flush()
  return blocks
}

function splitBodyAtParagraphs(body: string): string[] | null {
  const trimmed = body.trim()
  if (!trimmed) return ['']

  const paragraphs = trimmed.split(/\n[ \t]*\n+/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (paragraph.length > SERVICE_ITEM_LIMITS.blockBody) return null
    const combined = current ? `${current}\n\n${paragraph}` : paragraph
    if (combined.length > SERVICE_ITEM_LIMITS.blockBody) {
      chunks.push(current)
      current = paragraph
    } else {
      current = combined
    }
  }

  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : ['']
}

export function normalizeServiceText(text: string): NormalizedServiceText {
  const expanded: ServiceTextBlock[] = []

  for (const block of textToBlocks(text)) {
    if (block.heading && block.heading.length > SERVICE_ITEM_LIMITS.blockHeading) {
      return { blocks: [], warning: 'heading-too-long' }
    }

    const bodyParts = splitBodyAtParagraphs(block.body)
    if (!bodyParts) return { blocks: [], warning: 'paragraph-too-long' }

    bodyParts.forEach((body, index) => {
      expanded.push({
        ...(index === 0 && block.heading ? { heading: block.heading, level: block.level ?? 'h2' } : {}),
        body,
      })
    })
  }

  if (expanded.length > SERVICE_ITEM_LIMITS.blocks) {
    const lastIndex = SERVICE_ITEM_LIMITS.blocks - 1
    const last = expanded[lastIndex]
    const overflow = expanded
      .slice(SERVICE_ITEM_LIMITS.blocks)
      .map((block) => [block.heading, block.body].filter(Boolean).join('\n\n'))
      .filter(Boolean)
    const mergedBody = [last.body, ...overflow].filter(Boolean).join('\n\n')
    if (mergedBody.length > SERVICE_ITEM_LIMITS.blockBody) return { blocks: [], warning: 'block-limit' }
    expanded.splice(lastIndex, expanded.length - lastIndex, { ...last, body: mergedBody })
  }

  return { blocks: expanded, warning: null }
}

// "Words" are runs of letters/digits (any script, so ç ğ ı ö ş ü count), joined by an inner apostrophe or hyphen.
const WORD = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu

/** Unicode-aware word count; markdown markers ("##", "- ") and punctuation never count. */
export function countWords(text: string | undefined | null): number {
  if (!text) return 0
  return text.match(WORD)?.length ?? 0
}

/** Words of every block (subheading + body) combined. */
export function countBlockWords(blocks: ReadonlyArray<BlockLike> | undefined): number {
  return (blocks ?? []).reduce((sum, b) => sum + countWords(b.heading) + countWords(b.body), 0)
}

export const SERVICE_MIN_WORDS = 300

export type WordGoal = { count: number; goal: number; reached: boolean }

export function wordGoalStatus(count: number, goal: number = SERVICE_MIN_WORDS): WordGoal {
  return { count, goal, reached: count >= goal }
}

export const META_DESCRIPTION_RANGE = { min: 120, max: 160, soft: 200 } as const

export type MetaLengthState = 'empty' | 'good' | 'short' | 'long' | 'over'

/** green 120-160 ("good"), amber outside it, "over" beyond the soft limit. Never blocks saving. */
export function metaDescriptionState(text: string | undefined | null): { length: number; state: MetaLengthState } {
  const length = Array.from((text ?? '').trim()).length
  if (length === 0) return { length, state: 'empty' }
  if (length > META_DESCRIPTION_RANGE.soft) return { length, state: 'over' }
  if (length > META_DESCRIPTION_RANGE.max) return { length, state: 'long' }
  if (length < META_DESCRIPTION_RANGE.min) return { length, state: 'short' }
  return { length, state: 'good' }
}

/**
 * Icons the services editor offers. The homepage renderer resolves any lucide
 * name, so this is a curated, searchable subset; a stored name outside it keeps
 * rendering and is only replaced when the owner picks another one.
 */
const EXTRA_ICON_LABELS = {
  check: ['Onay işareti', 'Check'],
  search: ['Arama', 'Search'],
  shield: ['Koruma', 'Protection'],
  briefcase: ['İş', 'Business'],
  code: ['Yazılım', 'Code'],
  megaphone: ['Duyuru', 'Marketing'],
  'chart-line': ['Grafik', 'Analytics'],
  lightbulb: ['Fikir', 'Idea'],
  car: ['Araç', 'Vehicle'],
  plane: ['Seyahat', 'Travel'],
  dumbbell: ['Spor', 'Fitness'],
  'graduation-cap': ['Eğitim', 'Education'],
  'paw-print': ['Evcil hayvan', 'Pets'],
  droplets: ['Su', 'Water'],
  flame: ['Isıtma', 'Heating'],
  sun: ['Güneş', 'Sun'],
  plug: ['Elektrik', 'Electric'],
  paintbrush: ['Boya', 'Paint'],
  sofa: ['Mobilya', 'Furniture'],
  shirt: ['Giyim', 'Clothing'],
  music: ['Müzik', 'Music'],
  sprout: ['Bahçe', 'Garden'],
  'file-text': ['Belge', 'Document'],
  'shopping-bag': ['Alışveriş', 'Shopping'],
} as const satisfies Record<string, readonly [string, string]>

export const SERVICE_ICONS = [...HERO_STRIP_ICONS, ...(Object.keys(EXTRA_ICON_LABELS) as Array<keyof typeof EXTRA_ICON_LABELS>)] as readonly string[]

const ALL_LABELS: Record<string, readonly [string, string]> = { ...HERO_STRIP_ICON_LABELS, ...EXTRA_ICON_LABELS }

export const SERVICE_DEFAULT_ICON = 'sparkles'

export function isServiceIcon(value: unknown): value is string {
  return typeof value === 'string' && SERVICE_ICONS.includes(value)
}

export function serviceIconLabel(key: string, lang: 'tr' | 'en'): string {
  const pair = ALL_LABELS[key]
  return pair ? pair[lang === 'tr' ? 0 : 1] : key
}

export function filterServiceIcons(query: string): string[] {
  const q = query.trim().toLocaleLowerCase('tr')
  if (!q) return [...SERVICE_ICONS]
  return SERVICE_ICONS.filter((key) => {
    const pair = ALL_LABELS[key] ?? ['', '']
    return [key, pair[0], pair[1]].some((v) => v.toLocaleLowerCase('tr').includes(q))
  })
}

type SeoEntry = { title: string; description: string; seoTitle?: string; seoDescription?: string }

/**
 * Render-time SEO for one service. Legacy `seoTitle` / `seoDescription` win when
 * set (existing sites keep their Google text); otherwise the card text is used:
 * "<Başlık> | <Firma adı>" and the Kısa açıklama.
 */
export function resolveServiceSeo(entry: SeoEntry, siteName: string): { title: string; description: string } {
  const legacyTitle = entry.seoTitle?.trim()
  const legacyDescription = entry.seoDescription?.trim()
  const name = siteName.trim()
  const base = entry.title.trim()
  return {
    title: legacyTitle || (name ? `${base} | ${name}` : base),
    description: legacyDescription || entry.description.replace(/\s+/g, ' ').trim(),
  }
}

/** True when a legacy override exists, so the editor shows the "Gelişmiş" section. */
export function hasLegacyServiceSeo(item: { seoTitle?: string; seoDescription?: string }): boolean {
  return !!(item.seoTitle?.trim() || item.seoDescription?.trim())
}
