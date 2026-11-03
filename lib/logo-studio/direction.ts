import { fold } from '@/lib/visual-subjects'
import type { LogoStyleId } from '@/lib/logo-studio/rules'
import { SECTOR_PROFILES, defaultProfileFor, type SectorProfile } from '@/lib/logo-studio/sector-knowledge'

/**
 * Turns the free-text "sector note" and "creative direction" into decisions:
 * which sector profile they describe (the note wins over the dropdown), which
 * tone to suggest, and a stable signature used to tell whether generated AI
 * emblems were made with the inputs currently on screen.
 *
 * Matching is token based on diacritic-folded text. A keyword matches a whole
 * word, or a word that merely starts with it plus a short Turkish/English
 * suffix ("eğitimi", "inşaatları"), but never a word that only CONTAINS it
 * ("oluştur" must not read as "tur").
 */

const MAX_SUFFIX = 6
const MIN_PREFIX_KEY = 4

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

function keywordParts(keyword: string): { words: string[]; exact: boolean } {
  const exact = keyword.startsWith('=')
  return { words: tokens(exact ? keyword.slice(1) : keyword), exact }
}

function tokenMatches(token: string, key: string, exact: boolean): boolean {
  if (token === key) return true
  if (exact || key.length < MIN_PREFIX_KEY) return false
  return token.startsWith(key) && token.length - key.length <= MAX_SUFFIX
}

/** Index of the first token where `keyword` matches, or -1. */
export function keywordIndex(text: string, keyword: string): number {
  const words = tokens(text)
  const { words: key, exact } = keywordParts(keyword)
  if (key.length === 0) return -1
  for (let i = 0; i + key.length <= words.length; i++) {
    let hit = true
    for (let j = 0; j < key.length; j++) {
      const last = j === key.length - 1
      const ok = last ? tokenMatches(words[i + j], key[j], exact) : words[i + j] === key[j]
      if (!ok) {
        hit = false
        break
      }
    }
    if (hit) return i
  }
  return -1
}

export function includesKeyword(text: string, keyword: string): boolean {
  return keywordIndex(text, keyword) >= 0
}

export type EffectiveSector = {
  profile: SectorProfile
  /** `note` when the text decided it, `selection` when the dropdown did. */
  source: 'note' | 'selection'
  /** The keyword (as written in the dictionary) that decided it. */
  matched?: string
  /** True when the note moved the symbols away from the dropdown's own profile. */
  overridesSelection: boolean
}

type Candidate = { profile: SectorProfile; score: number; position: number; keyword: string }

/**
 * Note first, then creative direction. Score = number of words in the matched
 * keywords (a phrase like "kentsel dönüşüm" outweighs a single word) with the
 * note counting double. Ties go to the profile named LAST in the note, which is
 * the head noun in Turkish noun phrases ("DJ eğitimi" is an education offer).
 */
export function resolveEffectiveSector({
  selectedId,
  notes,
  direction,
}: {
  selectedId: string
  notes: string
  direction: string
}): EffectiveSector {
  const base = defaultProfileFor(selectedId)
  const sources: { text: string; weight: number }[] = [
    { text: notes, weight: 2 },
    { text: direction, weight: 1 },
  ]
  const candidates: Candidate[] = []
  for (const profile of SECTOR_PROFILES) {
    let score = 0
    let position = -1
    let keyword = ''
    for (const { text, weight } of sources) {
      if (!text.trim()) continue
      for (const key of profile.keywords) {
        const index = keywordIndex(text, key)
        if (index < 0) continue
        score += weight * keywordParts(key).words.length
        if (weight === 2 && index >= position) {
          position = index
          keyword = key
        } else if (!keyword) {
          keyword = key
        }
      }
    }
    if (score > 0) candidates.push({ profile, score, position, keyword })
  }

  if (candidates.length === 0) return { profile: base, source: 'selection', overridesSelection: false }

  candidates.sort((a, b) => b.score - a.score || b.position - a.position)
  const best = candidates[0]
  const selectedAlsoMatches = candidates.find((candidate) => candidate.profile.id === base.id)
  // The dropdown's own profile keeps the win when it is as strong as the best.
  const winner = selectedAlsoMatches && selectedAlsoMatches.score >= best.score ? selectedAlsoMatches : best
  return {
    profile: winner.profile,
    source: 'note',
    matched: winner.keyword.replace(/^=/, ''),
    overridesSelection: winner.profile.id !== base.id,
  }
}

export type ToneSuggestionId = 'luxury' | 'minimal' | 'corporate' | 'modern' | 'playful' | 'warm'

export type ToneSuggestion = {
  id: ToneSuggestionId
  style: LogoStyleId
  metallic: boolean
  /** The word in the user's text that triggered it. */
  word: string
}

const TONE_DICTIONARY: { id: ToneSuggestionId; style: LogoStyleId; metallic: boolean; words: string[] }[] = [
  { id: 'luxury', style: 'luxury', metallic: true, words: ['lüks', 'premium', 'elit', 'prestij', 'luxury', 'luxurious', 'elite', 'prestige', 'upscale'] },
  { id: 'minimal', style: 'minimal', metallic: false, words: ['sade', 'minimal', 'temiz', 'minimalist', 'clean', 'simple'] },
  { id: 'corporate', style: 'classic', metallic: false, words: ['kurumsal', 'güvenilir', 'ciddi', 'corporate', 'trustworthy', 'serious', 'formal'] },
  { id: 'modern', style: 'modern', metallic: false, words: ['modern', 'teknolojik', 'yenilikçi', 'technological', 'innovative', 'futuristic'] },
  { id: 'playful', style: 'modern', metallic: false, words: ['eğlenceli', 'genç', 'enerjik', 'fun', 'playful', 'young', 'energetic'] },
  { id: 'warm', style: 'modern', metallic: false, words: ['samimi', 'sıcak', 'doğal', 'friendly', 'warm', 'cozy', 'natural'] },
]

/** A suggestion only; callers must never apply it without the user's click. */
export function suggestTone(notes: string, direction: string): ToneSuggestion | null {
  const text = `${notes} ${direction}`
  let best: { entry: (typeof TONE_DICTIONARY)[number]; word: string; index: number } | null = null
  for (const entry of TONE_DICTIONARY) {
    for (const word of entry.words) {
      const index = keywordIndex(text, word)
      if (index >= 0 && (!best || index < best.index)) best = { entry, word, index }
    }
  }
  return best ? { id: best.entry.id, style: best.entry.style, metallic: best.entry.metallic, word: best.word } : null
}

/** Normalised so spacing/case/diacritic-free retyping does not count as a change. */
export function directionSignature({
  sectorId,
  notes,
  direction,
}: {
  sectorId: string
  notes: string
  direction: string
}): string {
  return JSON.stringify([sectorId, fold(notes), fold(direction)])
}
