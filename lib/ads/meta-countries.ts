/**
 * Country catalogue for Meta geo targeting. Pure (no I/O) and shared by the browser form and the server, which is
 * the side that actually enforces it.
 *
 * Codes are the officially assigned ISO 3166-1 alpha-2 set (249). Turkish names are derived at runtime from
 * `Intl.DisplayNames('tr', { type: 'region' })`, so there is no hand-typed name table to drift out of date.
 */

export const ISO_3166_1_ALPHA2_CODES: readonly string[] = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
]

const KNOWN_CODES: ReadonlySet<string> = new Set(ISO_3166_1_ALPHA2_CODES)

/** Server-side allow-list check; the input is expected to be an already upper-cased 2-letter code. */
export function isKnownCountryCode(code: unknown): code is string {
  return typeof code === 'string' && KNOWN_CODES.has(code)
}

/**
 * Countries for which Meta requires the DSA advertiser/payer details on the ad set. The app has no such fields
 * yet, so these are blocked at validate / approve / publish time: the 27 EU member states plus the 3 non-EU EEA
 * states (Iceland, Liechtenstein, Norway). Overseas territories (e.g. RE, GP, MQ) are intentionally not listed.
 */
export const EU_EEA_DSA_COUNTRY_CODES: readonly string[] = [
  // EU (27)
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  // EEA, not EU (3)
  'IS', 'LI', 'NO',
]

const DSA_CODES: ReadonlySet<string> = new Set(EU_EEA_DSA_COUNTRY_CODES)

export function isDsaCountry(code: string): boolean {
  return DSA_CODES.has(code.toUpperCase())
}

/** Returns the selected EU/EEA codes (upper-cased, de-duplicated, in input order). */
export function dsaBlockedCountries(codes: readonly string[]): string[] {
  const result: string[] = []
  for (const raw of codes) {
    const code = String(raw).toUpperCase()
    if (DSA_CODES.has(code) && !result.includes(code)) result.push(code)
  }
  return result
}

let displayNames: Intl.DisplayNames | null | undefined

function getDisplayNames(): Intl.DisplayNames | null {
  if (displayNames !== undefined) return displayNames
  try {
    displayNames = new Intl.DisplayNames(['tr'], { type: 'region' })
  } catch {
    displayNames = null
  }
  return displayNames
}

const nameCache = new Map<string, string>()

/** Turkish country name; falls back to the code itself when the runtime has no region data. */
export function countryName(code: string): string {
  const upper = code.toUpperCase()
  const cached = nameCache.get(upper)
  if (cached) return cached
  let name = upper
  try {
    const resolved = getDisplayNames()?.of(upper)
    if (resolved && resolved !== upper) name = resolved
  } catch {
    name = upper
  }
  nameCache.set(upper, name)
  return name
}

export type MetaCountryOption = { code: string; name: string }

let allCountries: MetaCountryOption[] | null = null

/** Every ISO country, sorted by Turkish collation. */
export function allMetaCountries(): readonly MetaCountryOption[] {
  if (allCountries) return allCountries
  const collator = new Intl.Collator('tr')
  allCountries = ISO_3166_1_ALPHA2_CODES
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => collator.compare(a.name, b.name))
  return allCountries
}

/** "Almanya, Estonya" for a list of codes, in the order given. */
export function countryNamesText(codes: readonly string[]): string {
  return codes.map((code) => countryName(code)).join(', ')
}

/**
 * Search key: case, Turkish dotted/dotless i and diacritics are ignored, so "aze" finds Azerbaycan and
 * "ISVICRE" finds İsviçre.
 */
export function foldCountrySearch(value: string): string {
  return value
    .replace(/[İIı]/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

/** Name substring match (names that start with the query first), or an exact 2-letter code match. */
export function filterMetaCountries(options: readonly MetaCountryOption[], query: string): MetaCountryOption[] {
  const needle = foldCountrySearch(query)
  if (!needle) return [...options]
  const starts: MetaCountryOption[] = []
  const contains: MetaCountryOption[] = []
  for (const option of options) {
    const folded = foldCountrySearch(option.name)
    if (folded.startsWith(needle) || (needle.length === 2 && option.code.toLowerCase() === needle)) starts.push(option)
    else if (folded.includes(needle)) contains.push(option)
  }
  return [...starts, ...contains]
}

export const DSA_COUNTRIES_FIELD_MESSAGE =
  'AB ülkeleri için ek bilgi gerekiyor, yakında. Meta, AB/AEA ülkelerinde reklam veren ve ödeyen bilgisi ister; bu bilgi henüz uygulamada yok.'

/** Field error for the countries input, naming the selected EU/EEA countries; null when none is selected. */
export function dsaCountriesMessage(codes: readonly string[]): string | null {
  const blocked = dsaBlockedCountries(codes)
  if (blocked.length === 0) return null
  return `${DSA_COUNTRIES_FIELD_MESSAGE} Seçimden çıkarın: ${countryNamesText(blocked)}.`
}
