import { PUBLIC_SEARCH_TLDS } from '@/lib/custom-domains/public-search/validate'
import type { Dict } from '@/lib/i18n'
import type { CriterionId, NoteCode, QualityScore, ScoreBand, TipCode } from '@/lib/domains/quality-score'

type Copy = Dict['domainSearch']

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

export function noteText(copy: Copy, code: NoteCode): string {
  return copy[`qsNote${capitalise(code)}` as keyof Copy] as string
}

export function tipText(copy: Copy, code: TipCode, asciiLabel: string): string {
  const template = copy[`qsTip${capitalise(code)}` as keyof Copy] as string
  return template.replace('{ascii}', asciiLabel)
}

const BAND_KEYS = {
  strong: 'qsBandStrong',
  good: 'qsBandGood',
  consider: 'qsBandConsider',
  retry: 'qsBandRetry',
} as const satisfies Record<ScoreBand, keyof Copy>

export function bandText(copy: Copy, band: ScoreBand): string {
  return copy[BAND_KEYS[band]]
}

const CRITERION_KEYS = {
  short: 'qsCritShort',
  spelling: 'qsCritSpelling',
  pronounce: 'qsCritPronounce',
  digits: 'qsCritDigits',
  extension: 'qsCritExtension',
} as const satisfies Record<CriterionId, keyof Copy>

export function criterionText(copy: Copy, id: CriterionId): string {
  return copy[CRITERION_KEYS[id]]
}

/** Text colour per band; shared by the gauge and the result-card badge. */
export const BAND_TEXT_CLASS: Record<ScoreBand, string> = {
  strong: 'text-emerald-500',
  good: 'text-brand',
  consider: 'text-amber-500',
  retry: 'text-destructive',
}

/**
 * Turns a score into a query the public search accepts: ASCII letters, no
 * underscores, and an extension only when the search sells it.
 */
export function toSearchQuery(score: Extract<QualityScore, { ok: true }>): string {
  const label = score.asciiLabel.replace(/_/g, '')
  const supported = score.tld !== null && (PUBLIC_SEARCH_TLDS as readonly string[]).includes(score.tld)
  return supported ? `${label}.${score.tld}` : label
}
