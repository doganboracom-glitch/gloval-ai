/**
 * Domain Quality Score. Pure and deterministic: no I/O, no clock, no randomness,
 * so the same code runs on the server and in the browser.
 *
 * It judges the SHAPE of a name only (length, spelling, sound, digits, extension).
 * It says nothing about whether the name is registrable, whether the brand is
 * free to use, or how the name would rank in search. Every piece of text is
 * resolved by the UI from note/tip codes, so this module carries no copy.
 */

export const MAX_INPUT_LENGTH = 100
export const MAX_LABEL_LENGTH = 63
export const MIN_LABEL_LENGTH = 2
export const CRITERION_MAX = 20

export type CriterionId = 'short' | 'spelling' | 'pronounce' | 'digits' | 'extension'
export type CriterionLevel = 'good' | 'ok' | 'weak'
export type ScoreBand = 'strong' | 'good' | 'consider' | 'retry'

export type NoteCode =
  | 'shortIdeal'
  | 'shortOk'
  | 'shortLong'
  | 'spellingClean'
  | 'spellingHyphen'
  | 'spellingUnderscore'
  | 'spellingRepeat'
  | 'spellingCluster'
  | 'spellingTurkish'
  | 'pronounceBalanced'
  | 'pronounceVowelPoor'
  | 'pronounceVowelRich'
  | 'pronounceConsonantRun'
  | 'pronounceNoLetters'
  | 'digitsNone'
  | 'digitsSome'
  | 'digitsMany'
  | 'extCom'
  | 'extComTr'
  | 'extNetOrg'
  | 'extCoInfo'
  | 'extOther'
  | 'extAssumed'

export type TipCode =
  | 'shorten'
  | 'removeHyphen'
  | 'removeUnderscore'
  | 'avoidRepeat'
  | 'simplifyCluster'
  | 'useAscii'
  | 'balanceVowels'
  | 'breakConsonants'
  | 'removeDigits'
  | 'considerCom'
  | 'none'

export type CriterionResult = {
  id: CriterionId
  score: number
  max: typeof CRITERION_MAX
  level: CriterionLevel
  notes: NoteCode[]
}

export type QualityScoreFailure = 'empty' | 'too_short' | 'too_long' | 'invalid'

export type QualityScore =
  | {
      ok: true
      /** Normalised "label" or "label.ext" that was scored. */
      domain: string
      label: string
      /** The extension typed by the user, or null when only a brand was given. */
      tld: string | null
      /** Label with Turkish letters replaced by their ASCII look-alikes. */
      asciiLabel: string
      total: number
      band: ScoreBand
      criteria: CriterionResult[]
      tips: TipCode[]
      /** Informational only; never part of the total. */
      wordCountHint: number
      maybeMultiWord: boolean
    }
  | { ok: false; reason: QualityScoreFailure }

const TURKISH_TO_ASCII: Record<string, string> = { ğ: 'g', ü: 'u', ş: 's', ı: 'i', ö: 'o', ç: 'c' }
const TURKISH_CHARS = /[ğüşıöç]/
const LABEL_CHARS = /^[a-z0-9ğüşıöç_-]+$/
const EXTENSION_CHARS = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/
const VOWELS = new Set(['a', 'e', 'ı', 'i', 'o', 'ö', 'u', 'ü'])
const LETTER = /[a-zğüşıöç]/

/** Letter pairs that are awkward to type or say in a row. */
const HARD_CLUSTERS = [
  'xq', 'qx', 'zx', 'xz', 'jq', 'qj', 'kq', 'qk', 'wq', 'qw', 'vq', 'qv', 'zq', 'qz', 'xj', 'jx', 'kx', 'xk', 'xv', 'vx',
] as const

const EXTENSION_SCORES: Record<string, { score: number; note: NoteCode }> = {
  com: { score: 20, note: 'extCom' },
  'com.tr': { score: 18, note: 'extComTr' },
  net: { score: 15, note: 'extNetOrg' },
  org: { score: 15, note: 'extNetOrg' },
  co: { score: 12, note: 'extCoInfo' },
  info: { score: 12, note: 'extCoInfo' },
}
const OTHER_EXTENSION_SCORE = 8

const clamp = (value: number) => Math.max(0, Math.min(CRITERION_MAX, value))

function levelOf(score: number): CriterionLevel {
  if (score >= 16) return 'good'
  if (score >= 10) return 'ok'
  return 'weak'
}

export function bandOf(total: number): ScoreBand {
  if (total >= 80) return 'strong'
  if (total >= 60) return 'good'
  if (total >= 40) return 'consider'
  return 'retry'
}

export function toAsciiLabel(label: string): string {
  return label.replace(/[ğüşıöç]/g, (char) => TURKISH_TO_ASCII[char] ?? char)
}

type Parsed = { label: string; tld: string | null }

function parseInput(raw: string): Parsed | QualityScoreFailure {
  if (raw.length > MAX_INPUT_LENGTH) return 'too_long'
  let value = raw
    .trim()
    .replace(/İ/g, 'i')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
  if (!value) return 'empty'
  if (value.startsWith('www.') && value.split('.').length > 2) value = value.slice(4)

  const dot = value.indexOf('.')
  const label = dot === -1 ? value : value.slice(0, dot)
  const tld = dot === -1 ? null : value.slice(dot + 1)

  if (!label || !LABEL_CHARS.test(label)) return 'invalid'
  if (tld !== null && !EXTENSION_CHARS.test(tld)) return 'invalid'
  if (label.length > MAX_LABEL_LENGTH) return 'too_long'
  if (label.length < MIN_LABEL_LENGTH) return 'too_short'
  return { label, tld }
}

function scoreShort(label: string): CriterionResult {
  const score = clamp(CRITERION_MAX - 2 * Math.max(0, label.length - 8))
  const note: NoteCode = label.length <= 8 ? 'shortIdeal' : score >= 10 ? 'shortOk' : 'shortLong'
  return { id: 'short', score, max: CRITERION_MAX, level: levelOf(score), notes: [note] }
}

function scoreSpelling(label: string): { result: CriterionResult; repeats: boolean; clusters: boolean } {
  const notes: NoteCode[] = []
  let score = CRITERION_MAX

  const hyphens = (label.match(/-/g) ?? []).length
  if (hyphens > 0) {
    score -= 6 * hyphens
    notes.push('spellingHyphen')
  }
  const underscores = (label.match(/_/g) ?? []).length
  if (underscores > 0) {
    score -= 10 * underscores
    notes.push('spellingUnderscore')
  }

  let repeats = false
  for (const run of label.match(/([a-zğüşıöç])\1+/g) ?? []) {
    score -= run.length >= 3 ? 5 : 2
    repeats = true
  }
  if (repeats) notes.push('spellingRepeat')

  const ascii = toAsciiLabel(label)
  let clusterHits = 0
  for (const pair of HARD_CLUSTERS) if (ascii.includes(pair)) clusterHits += 1
  if (clusterHits > 0) {
    score -= 4 * clusterHits
    notes.push('spellingCluster')
  }

  if (TURKISH_CHARS.test(label)) {
    score -= 5
    notes.push('spellingTurkish')
  }

  if (notes.length === 0) notes.push('spellingClean')
  const clamped = clamp(score)
  return {
    result: { id: 'spelling', score: clamped, max: CRITERION_MAX, level: levelOf(clamped), notes },
    repeats,
    clusters: clusterHits > 0,
  }
}

function scorePronounce(label: string): { result: CriterionResult; vowelPoor: boolean; vowelRich: boolean; runs: boolean } {
  const letters = [...label].filter((char) => LETTER.test(char))
  if (letters.length < 2) {
    return {
      result: { id: 'pronounce', score: 8, max: CRITERION_MAX, level: levelOf(8), notes: ['pronounceNoLetters'] },
      vowelPoor: false,
      vowelRich: false,
      runs: false,
    }
  }

  const notes: NoteCode[] = []
  let score = CRITERION_MAX
  const ratio = letters.filter((char) => VOWELS.has(char)).length / letters.length

  let vowelPoor = false
  let vowelRich = false
  if (ratio < 0.2) {
    score -= 8
    vowelPoor = true
  } else if (ratio < 0.28) {
    score -= 4
    vowelPoor = true
  } else if (ratio > 0.7) {
    score -= 8
    vowelRich = true
  } else if (ratio > 0.6) {
    score -= 4
    vowelRich = true
  }
  if (vowelPoor) notes.push('pronounceVowelPoor')
  if (vowelRich) notes.push('pronounceVowelRich')

  let runs = false
  for (const segment of label.split(/[^a-zğüşıöç]+/)) {
    let streak = 0
    const flush = () => {
      if (streak >= 3) {
        score -= 4 + 2 * (streak - 3)
        runs = true
      }
      streak = 0
    }
    for (const char of segment) {
      if (VOWELS.has(char)) flush()
      else streak += 1
    }
    flush()
  }
  if (runs) notes.push('pronounceConsonantRun')

  if (notes.length === 0) notes.push('pronounceBalanced')
  const clamped = clamp(score)
  return {
    result: { id: 'pronounce', score: clamped, max: CRITERION_MAX, level: levelOf(clamped), notes },
    vowelPoor,
    vowelRich,
    runs,
  }
}

const DIGIT_SCORES = [20, 14, 8, 4, 0] as const

function scoreDigits(label: string): CriterionResult {
  const count = (label.match(/[0-9]/g) ?? []).length
  const score = DIGIT_SCORES[Math.min(count, DIGIT_SCORES.length - 1)]
  const note: NoteCode = count === 0 ? 'digitsNone' : count <= 2 ? 'digitsSome' : 'digitsMany'
  return { id: 'digits', score, max: CRITERION_MAX, level: levelOf(score), notes: [note] }
}

function scoreExtension(tld: string | null): CriterionResult {
  // A bare brand is judged as the default .com so the total stays comparable.
  const key = tld ?? 'com'
  const known = EXTENSION_SCORES[key]
  const score = known ? known.score : OTHER_EXTENSION_SCORE
  const notes: NoteCode[] = [known ? known.note : 'extOther']
  if (tld === null) notes.push('extAssumed')
  return { id: 'extension', score, max: CRITERION_MAX, level: levelOf(score), notes }
}

export function scoreDomainQuality(input: unknown): QualityScore {
  if (typeof input !== 'string') return { ok: false, reason: 'invalid' }
  const parsed = parseInput(input)
  if (typeof parsed === 'string') return { ok: false, reason: parsed }
  const { label, tld } = parsed

  const short = scoreShort(label)
  const spelling = scoreSpelling(label)
  const pronounce = scorePronounce(label)
  const digits = scoreDigits(label)
  const extension = scoreExtension(tld)
  const criteria = [short, spelling.result, pronounce.result, digits, extension]
  const total = criteria.reduce((sum, criterion) => sum + criterion.score, 0)

  const tips: TipCode[] = []
  if (label.length > 8) tips.push('shorten')
  if (label.includes('-')) tips.push('removeHyphen')
  if (label.includes('_')) tips.push('removeUnderscore')
  if (spelling.repeats) tips.push('avoidRepeat')
  if (spelling.clusters) tips.push('simplifyCluster')
  if (TURKISH_CHARS.test(label)) tips.push('useAscii')
  if (pronounce.vowelPoor || pronounce.vowelRich) tips.push('balanceVowels')
  if (pronounce.runs) tips.push('breakConsonants')
  if (/[0-9]/.test(label)) tips.push('removeDigits')
  if (tld !== null && tld !== 'com') tips.push('considerCom')
  if (tips.length === 0) tips.push('none')

  const segments = label.split('-').filter(Boolean).length
  return {
    ok: true,
    domain: tld ? `${label}.${tld}` : label,
    label,
    tld,
    asciiLabel: toAsciiLabel(label),
    total,
    band: bandOf(total),
    criteria,
    tips,
    wordCountHint: Math.max(1, segments),
    maybeMultiWord: segments <= 1 && label.length > 12,
  }
}
