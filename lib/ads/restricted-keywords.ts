/**
 * Restricted-industry keyword detection for the Google Ads plan builder.
 *
 * Industry templates can produce search terms (locksmith, doctor, currency exchange ...) that Google Ads
 * restricts or sends to extra policy review. These terms are kept OUT of the default AI suggestion; the owner
 * may still add them by hand and then sees an amber "restricted industry" warning.
 *
 * Matching is word-boundary based on diacritic-folded text. A trailing `*` means "word prefix"
 * (`cilingir*` matches cilingir, cilingirler, cilingirci). Never use plain `includes` here: short stems would
 * match inside unrelated Turkish words.
 */

export type RestrictedSectorCategory = 'health' | 'financial' | 'gambling' | 'emergency_services' | 'adult'

const TERMS: Record<RestrictedSectorCategory, readonly string[]> = {
  health: [
    'doktor*', 'hekim*', 'disci*', 'dis hekimi*', 'klinik*', 'hastane*', 'muayene*', 'tedavi*', 'ameliyat*',
    'eczane*', 'ilac*', 'saglik', 'psikolog*', 'ambulans*', 'doctor*', 'physician*', 'dentist*', 'dental',
    'clinic*', 'hospital*', 'surgery', 'surgeon*', 'pharmacy', 'medication*', 'treatment*', 'ambulance*',
  ],
  financial: [
    'doviz*', 'kambiyo', 'sarraf*', 'kredi*', 'borsa*', 'forex', 'kripto*', 'bitcoin*', 'yatirim*', 'faiz*',
    'borclanma', 'currency exchange', 'exchange rate*', 'loan*', 'mortgage*', 'crypto*', 'investment*',
    'stock trading', 'trading signal*',
  ],
  gambling: [
    'bahis*', 'kumarhane*', 'kumar oyun*', 'kumar sitesi*', 'casino*', 'kasino*', 'iddaa', 'rulet', 'poker',
    'slot oyun*', 'canli bahis', 'betting', 'gambling', 'lottery', 'sportsbook',
  ],
  emergency_services: [
    'cilingir*', 'locksmith*', 'acil servis*', 'acil cilingir*', 'emergency service*', 'emergency room',
    '7/24 servis*',
  ],
  adult: [
    'yetiskin icerik*', 'yetiskin urun*', 'yetiskin magaza*', 'erotik*', 'escort*', 'eskort*', 'porn*',
    'sex shop*', 'sexshop*', 'seks shop*', 'adult content', 'adult shop*', 'adult toys',
  ],
}

export const RESTRICTED_SECTOR_CATEGORIES = Object.keys(TERMS) as RestrictedSectorCategory[]

function foldForMatch(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

const MATCHERS = (Object.entries(TERMS) as [RestrictedSectorCategory, readonly string[]][]).map(([category, terms]) => {
  const alternatives = terms.map((term) => {
    const prefix = term.endsWith('*')
    const body = escapeRegExp(foldForMatch(prefix ? term.slice(0, -1) : term))
    return prefix ? `${body}[\\p{L}\\p{N}]*` : body
  })
  return { category, pattern: new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'u') }
})

/** The first restricted-industry category the keyword falls into, or null when it is unrestricted. */
export function findRestrictedKeywordCategory(keyword: string): RestrictedSectorCategory | null {
  const folded = foldForMatch(keyword)
  if (!folded) return null
  for (const { category, pattern } of MATCHERS) {
    if (pattern.test(folded)) return category
  }
  return null
}

export type RestrictedKeywordHit = { keyword: string; category: RestrictedSectorCategory }

export function partitionRestrictedKeywords(keywords: readonly string[]): {
  allowed: string[]
  restricted: RestrictedKeywordHit[]
} {
  const allowed: string[] = []
  const restricted: RestrictedKeywordHit[] = []
  for (const keyword of keywords) {
    const category = findRestrictedKeywordCategory(keyword)
    if (category) restricted.push({ keyword, category })
    else allowed.push(keyword)
  }
  return { allowed, restricted }
}

const CATEGORY_LABELS: Record<RestrictedSectorCategory, readonly [string, string]> = {
  health: ['sağlık', 'health'],
  financial: ['finans/döviz', 'finance/currency'],
  gambling: ['kumar', 'gambling'],
  emergency_services: ['çilingir/acil servis', 'locksmith/emergency services'],
  adult: ['yetişkin içerik', 'adult content'],
}

export function restrictedCategoryLabel(category: RestrictedSectorCategory, isTr: boolean): string {
  return CATEGORY_LABELS[category][isTr ? 0 : 1]
}
