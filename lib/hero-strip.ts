import { HERO_STRIP_ITEM_COUNT, HERO_STRIP_TEXT_MAX, HERO_STRIP_TITLE_MAX } from '@/lib/list-limits'

/**
 * "Slider Altı Kutu" (hero features strip) helpers. This module is a leaf: the
 * schema, the renderer, the editor and the AI guards all import from it, so it
 * must not import the website schema.
 */

/** Preset icon keys (lucide names). The owner picks from this set, never types a name. */
export const HERO_STRIP_ICONS = [
  'shield-check',
  'truck',
  'headphones',
  'award',
  'clock',
  'credit-card',
  'map-pin',
  'phone',
  'sparkles',
  'star',
  'heart',
  'users',
  'package',
  'leaf',
  'wrench',
  'badge-check',
] as const

export type HeroStripIcon = (typeof HERO_STRIP_ICONS)[number]

export const HERO_STRIP_DEFAULT_ICON: HeroStripIcon = 'sparkles'

export const HERO_STRIP_ICON_LABELS: Record<HeroStripIcon, [tr: string, en: string]> = {
  'shield-check': ['Güvence', 'Assurance'],
  truck: ['Teslimat', 'Delivery'],
  headphones: ['Destek', 'Support'],
  award: ['Kalite', 'Quality'],
  clock: ['Zaman', 'Time'],
  'credit-card': ['Ödeme', 'Payment'],
  'map-pin': ['Konum', 'Location'],
  phone: ['Telefon', 'Phone'],
  sparkles: ['Özel', 'Special'],
  star: ['Yıldız', 'Star'],
  heart: ['Kalp', 'Heart'],
  users: ['Ekip', 'Team'],
  package: ['Paket', 'Package'],
  leaf: ['Doğal', 'Natural'],
  wrench: ['Servis', 'Service'],
  'badge-check': ['Onay', 'Verified'],
}

export type HeroStripItemLike = {
  icon: string
  title: string
  text: string
  sample?: boolean
}

export function isHeroStripIcon(value: unknown): value is HeroStripIcon {
  return typeof value === 'string' && (HERO_STRIP_ICONS as readonly string[]).includes(value)
}

export function clampHeroStripTitle(value: string): string {
  return value.slice(0, HERO_STRIP_TITLE_MAX)
}

export function clampHeroStripText(value: string): string {
  return value.slice(0, HERO_STRIP_TEXT_MAX)
}

/** Generic placeholders: nothing a visitor could take for a claim, every one flagged `sample`. */
export function blankHeroStripItems(lang: 'tr' | 'en'): HeroStripItemLike[] {
  const tr = lang === 'tr'
  return [
    { icon: 'shield-check', title: tr ? 'Başlık 1' : 'Heading 1', text: tr ? 'Kısa açıklama' : 'Short description', sample: true },
    { icon: 'truck', title: tr ? 'Başlık 2' : 'Heading 2', text: tr ? 'Kısa açıklama' : 'Short description', sample: true },
    { icon: 'headphones', title: tr ? 'Başlık 3' : 'Heading 3', text: tr ? 'Kısa açıklama' : 'Short description', sample: true },
    { icon: 'award', title: tr ? 'Başlık 4' : 'Heading 4', text: tr ? 'Kısa açıklama' : 'Short description', sample: true },
  ]
}

/* -------------------------------------------------------------------------- */
/*  Unverifiable claims                                                       */
/* -------------------------------------------------------------------------- */

const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])'

/**
 * Numbers, percentages, "N yıllık", "lider", "en iyi", "resmi yetkili" and their
 * English counterparts: claims a platform cannot know about the owner's business.
 * Unicode-aware on purpose (`\b` does not treat Turkish letters as word characters).
 */
const unverifiableClaimPatterns: RegExp[] = [
  /\d/u,
  /%/u,
  new RegExp(`${NOT_LETTER_BEFORE}(?:yüzde|percent(?:age)?)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`${NOT_LETTER_BEFORE}(?:yıllık|yillik|years?|decades?|onlarca|yüzlerce|binlerce)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`${NOT_LETTER_BEFORE}(?:lider\\p{L}*|leading|leader\\p{L}*|number\\s*one|no\\.?\\s*1)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(`${NOT_LETTER_BEFORE}(?:en\\s+iyi\\p{L}*|best|top[-\\s]?rated|#\\s*1)${NOT_LETTER_AFTER}`, 'iu'),
  new RegExp(
    `${NOT_LETTER_BEFORE}(?:resmi\\s+yetkili\\p{L}*|yetkili\\s+(?:satıcı|bayi|servis)\\p{L}*|official\\p{L}*|authori[sz]ed)${NOT_LETTER_AFTER}`,
    'iu',
  ),
]

export function isUnverifiableHeroStripClaim(value: unknown): boolean {
  return typeof value === 'string' && unverifiableClaimPatterns.some((pattern) => pattern.test(value))
}

/* -------------------------------------------------------------------------- */
/*  Visibility                                                                */
/* -------------------------------------------------------------------------- */

/** A box a visitor can see: not a sample, and it says something. */
export function isRealHeroStripItem(item: Pick<HeroStripItemLike, 'title' | 'text' | 'sample'>): boolean {
  return !item.sample && (item.title.trim() !== '' || item.text.trim() !== '')
}

/**
 * Whether the strip renders at all. Public pages need at least one real box
 * (sample boxes never show there); the editor preview also shows the sample
 * placeholders so the owner can see what to fill in.
 */
export function heroStripBoxes<T extends Pick<HeroStripItemLike, 'title' | 'text' | 'sample'>>(
  items: readonly T[],
  opts: { includeSamples: boolean },
): T[] {
  const real = items.filter(isRealHeroStripItem)
  if (real.length === 0 && !opts.includeSamples) return []
  return opts.includeSamples ? items.filter((i) => i.title.trim() !== '' || i.text.trim() !== '') : real
}

export const HERO_STRIP_WARNING = {
  tr: 'Yalnızca doğrulayabileceğiniz bilgileri yazın (ör. sayı, yüzde, "lider" gibi iddialardan kaçının).',
  en: 'Only write what you can verify (avoid claims such as numbers, percentages or "leader").',
} as const

export function heroStripCounts() {
  return { count: HERO_STRIP_ITEM_COUNT, titleMax: HERO_STRIP_TITLE_MAX, textMax: HERO_STRIP_TEXT_MAX }
}
