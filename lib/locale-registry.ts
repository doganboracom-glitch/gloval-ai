/**
 * Central registry of every locale GLOVAL AI's platform UI supports. Adding a
 * new language should only ever require: (1) one entry here, and (2) one new
 * dictionary file under `lib/i18n-locales/`. Nothing else in the app should
 * need to change — `lib/i18n.ts` derives its types, cookie/query resolution,
 * and English-fallback merge entirely from this list.
 *
 * IMPORTANT: this governs the GLOVAL AI *platform* UI language only. It is
 * fully independent from the language of a user-generated website (see
 * `lib/website-schema.ts` / tenant rendering) — a platform running in Arabic
 * can perfectly well be editing a site whose own content is in English.
 */

export type SupportedLocale =
  | 'tr'
  | 'en'
  | 'fr'
  | 'de'
  | 'it'
  | 'et'
  | 'pl'
  | 'es'
  | 'pt'
  | 'ar'
  | 'ru'
  | 'az'

export type TextDirection = 'ltr' | 'rtl'

export type LocaleInfo = {
  code: SupportedLocale
  /** English name, used only internally/for logs. */
  name: string
  /** Name in the language's own script — this is what the switcher shows. */
  nativeName: string
  direction: TextDirection
}

export const LOCALE_REGISTRY: Record<SupportedLocale, LocaleInfo> = {
  tr: { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr' },
  en: { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  fr: { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
  de: { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  it: { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr' },
  et: { code: 'et', name: 'Estonian', nativeName: 'Eesti', direction: 'ltr' },
  pl: { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr' },
  es: { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  pt: { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
  ar: { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
  ru: { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr' },
  az: { code: 'az', name: 'Azerbaijani', nativeName: 'Azərbaycanca', direction: 'ltr' },
}

export const SUPPORTED_LOCALES = Object.keys(LOCALE_REGISTRY) as SupportedLocale[]

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return !!value && Object.prototype.hasOwnProperty.call(LOCALE_REGISTRY, value)
}

export function getDirection(locale: SupportedLocale): TextDirection {
  return LOCALE_REGISTRY[locale].direction
}

export function isRTL(locale: SupportedLocale): boolean {
  return LOCALE_REGISTRY[locale].direction === 'rtl'
}

/**
 * Maps a two-letter (or `lang-Script-REGION`) BCP-47 subtag to one of our
 * supported locales. Region/script suffixes are ignored — `en-GB`, `fr-CA`,
 * `de-AT`, `es-MX`, `pt-BR` and `az-Latn-AZ` all resolve to their base
 * language. Returns null for anything unsupported (e.g. `ja`, `zh`, `nl`) so
 * the caller can fall back to the default locale.
 */
export function matchLocaleTag(tag: string): SupportedLocale | null {
  const base = tag.toLowerCase().split('-')[0]
  return isSupportedLocale(base) ? base : null
}
