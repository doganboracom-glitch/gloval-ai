import type { Section } from '@/lib/website-schema'

/**
 * About copy
 * ----------
 * Four optional, owner-editable texts on the about section:
 *  - `shortText`: the home teaser under the hero (max 3 sentences) + "Devamını oku" link,
 *  - `longText`: the extra paragraph (4 sentences) on the /hakkimizda page,
 *  - `vision` / `mission`: the "Vizyonumuz" / "Misyonumuz" cards on that page.
 * Every field is optional. A section with all four empty keeps its legacy
 * rendering byte for byte, which is what protects already published sites.
 * Everything here is pure so the renderer, editor, generator and tests share it.
 */

type AboutData = Extract<Section, { type: 'about' }>

export const ABOUT_COPY_LIMITS = { shortText: 600, longText: 1500, vision: 600, mission: 600 } as const
export const SHORT_TEXT_MAX_SENTENCES = 3
export const LONG_TEXT_MAX_SENTENCES = 4
export const CARD_TEXT_MAX_SENTENCES = 2

export const ABOUT_COPY_FIELDS = ['shortText', 'longText', 'vision', 'mission'] as const
export type AboutCopyField = (typeof ABOUT_COPY_FIELDS)[number]
export type AboutCopy = Partial<Record<AboutCopyField, string>>

const READ_MORE_LABELS = { tr: 'Devamını oku', en: 'Read more' } as const
const CARD_TITLES = {
  tr: { vision: 'Vizyonumuz', mission: 'Misyonumuz' },
  en: { vision: 'Our vision', mission: 'Our mission' },
} as const

export function readMoreLabel(lang: 'tr' | 'en'): string {
  return READ_MORE_LABELS[lang]
}

export function aboutCardTitles(lang: 'tr' | 'en') {
  return CARD_TITLES[lang]
}

/* -------------------------------------------------------------------------- */
/*  Sentences                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Splits on sentence punctuation followed by whitespace and an uppercase/quote
 * start, so "3.5 kg" or "www.site.com" never break a sentence in half.
 */
export function splitSentences(text: string): string[] {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) return []
  return flat
    .split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"“'‘(])/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function clampSentences(text: string, max: number): string {
  return splitSentences(text).slice(0, max).join(' ')
}

export function countSentences(text: string): number {
  return splitSentences(text).length
}

/* -------------------------------------------------------------------------- */
/*  Resolution                                                                 */
/* -------------------------------------------------------------------------- */

function clean(value: string | undefined): string | null {
  const v = (value ?? '').replace(/[ \t]+\n/g, '\n').trim()
  return v ? v : null
}

export type ResolvedAboutCopy = {
  /** Home teaser, already clamped to 3 sentences; null = keep the legacy `body`. */
  shortText: string | null
  longText: string | null
  vision: string | null
  mission: string | null
  /** True when the detail page must use the intro + extra paragraph + cards layout. */
  detailLayout: boolean
}

export function resolveAboutCopy(section: Pick<AboutData, 'shortText' | 'longText' | 'vision' | 'mission'>): ResolvedAboutCopy {
  const short = clean(section.shortText)
  const longText = clean(section.longText)
  const vision = clean(section.vision)
  const mission = clean(section.mission)
  return {
    shortText: short ? clampSentences(short, SHORT_TEXT_MAX_SENTENCES) : null,
    longText,
    vision,
    mission,
    detailLayout: !!(longText || vision || mission),
  }
}

export function hasAboutCopy(section: Pick<AboutData, 'shortText' | 'longText' | 'vision' | 'mission'>): boolean {
  return ABOUT_COPY_FIELDS.some((f) => !!clean(section[f]))
}

/** Stable text used to tell whether the owner changed the copy (sample approval digest). */
export function aboutCopyDigestParts(section: Pick<AboutData, 'shortText' | 'longText' | 'vision' | 'mission'>): string[] | null {
  if (!hasAboutCopy(section)) return null
  return ABOUT_COPY_FIELDS.map((f) => clean(section[f]) ?? '')
}

/** Keeps the owner's about copy when an AI rewrite of the section drops these fields. */
export function preserveAboutCopy<T extends { sections: Section[] }>(previous: T, next: T): T {
  const before = previous.sections.find((s) => s.type === 'about') as AboutData | undefined
  if (!before || !hasAboutCopy(before)) return next
  let touched = false
  const sections = next.sections.map((s) => {
    if (s.type !== 'about' || hasAboutCopy(s)) return s
    touched = true
    const out: AboutData = { ...s }
    for (const f of ABOUT_COPY_FIELDS) if (before[f]) out[f] = before[f]
    return out
  })
  return touched ? { ...next, sections } : next
}

/* -------------------------------------------------------------------------- */
/*  Grounding guard: no invented numbers, awards, founding years, team names   */
/* -------------------------------------------------------------------------- */

const PLACEHOLDER = /lorem|ipsum|placeholder|yer tutucu|örnek metin|sample text|\[[^\]]*\]|xxx/i

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Wording that always states a verifiable fact the brief cannot back up on its own. */
const UNVERIFIABLE: RegExp[] = [
  /\bodul/,
  /\baward/,
  /\bsertifika/,
  /\bcertified\b|\bcertificate/,
  /\bkuruld|\bkurulus|\bkurulm|\bkurucu/,
  /\bfounded\b|\bfounder\b|\bestablished (in|since)\b|\bsince\b/,
  /\byildir\b|\byillik\b|\byillardir\b|\byili askin|\byillik tecrube|\byil once/,
  /\b(decades?|years of|over \w+ years)\b/,
  /\bbinlerce\b|\byuzlerce\b|\bonlarca\b|\bmilyonlarca\b/,
  /\b(thousands|hundreds|millions|dozens) of\b/,
  /\bsektorun lideri\b|\bpazar lideri\b|\bmarket leader\b|\bnumber one\b/,
  /\bmemnun musteri\b|\bhappy (clients|customers)\b/,
]

/** "Dr. Ahmet", "CEO Ayşe": a title followed by a capitalized name. */
const TITLED_NAME =
  /\b(?:Kurucumuz|Kurucusu|Founder|CEO|Genel Müdür|Müdürümüz|Dr|Uzm|Op|Av|Prof|Doç|Mimar|Mr|Mrs|Ms)\.?\s+[A-ZÇĞİÖŞÜ]\p{Ll}{2,}/u

function numbersIn(text: string): string[] {
  return (text.match(/\d[\d.,]*/g) ?? []).map((n) => n.replace(/[.,]+$/, ''))
}

export type GroundingFacts = {
  /** Text whose numbers and names are allowed (the owner's own brief, business name). */
  allowed: string
}

/** True when a sentence is safe to publish given what the owner actually said. */
export function isGroundedSentence(sentence: string, facts: GroundingFacts): boolean {
  if (PLACEHOLDER.test(sentence)) return false
  const known = new Set(numbersIn(facts.allowed))
  if (!numbersIn(sentence).every((n) => known.has(n))) return false
  const folded = fold(sentence)
  if (UNVERIFIABLE.some((re) => re.test(folded) && !re.test(fold(facts.allowed)))) return false
  const named = sentence.match(TITLED_NAME)
  if (named && !facts.allowed.includes(named[0])) return false
  return true
}

/**
 * Drops every sentence that is not grounded, then clamps. Returns '' when
 * nothing safe is left: unsure information is left out instead of guessed.
 */
export function groundText(text: string, facts: GroundingFacts, maxSentences: number): string {
  return splitSentences(text)
    .filter((s) => isGroundedSentence(s, facts))
    .slice(0, maxSentences)
    .join(' ')
}
