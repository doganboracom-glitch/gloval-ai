import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'

type Tree = Record<string, unknown>

function collectStrings(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out.set(prefix + key, value)
    else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of collectStrings(value as Tree, `${prefix}${key}.`)) out.set(k, v)
    }
  }
  return out
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',')

const english = collectStrings(dictionary.en.domains as unknown as Tree)
const otherLocales = SUPPORTED_LOCALES.filter((l) => l !== 'en')

// Every user-facing domains string must be genuinely translated in every
// locale. A value identical to English is only accepted when it is a proper
// noun / technical term that is legitimately spelled the same way, and each
// such exception is listed explicitly per locale so nothing slips through as
// a silent English fallback.
const hasWords = (s: string) => /[A-Za-z]{4,}/.test(s)
const ALLOWED_IDENTICAL: Partial<Record<string, readonly string[]>> = {
  fr: ['dnsType'],
  de: [
    'navLabel',
    'transferDomainLabel',
    'transfersTitle',
    'mgStatus',
    'addLabel',
    'connectStepDomain',
    'connection.host',
    'dnsHost',
    'dnsGroupWebsite',
    'websiteTitle',
    'websiteLive',
    'adminNav',
  ],
  it: ['buyEmail', 'connection.host', 'dnsGroupEmail', 'emailTitle'],
  pl: ['mgStatus', 'connection.host'],
  es: ['connection.hostError', 'connection.sslError'],
  az: ['mgStatus'],
}

const ARABIC_SCRIPT = /[\u0600-\u06FF]/
// An example domain shown as an input placeholder; it is Latin in every locale.
const ARABIC_LATIN_OK = new Set(['addPlaceholder'])

describe('domains i18n across all locales', () => {
  it('covers all 12 supported locales', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual(
      ['ar', 'az', 'de', 'en', 'es', 'et', 'fr', 'it', 'pl', 'pt', 'ru', 'tr'],
    )
  })

  it.each(otherLocales)('%s resolves every domains key to a non-empty string', (locale) => {
    const strings = collectStrings(dictionary[locale].domains as unknown as Tree)
    const missing = [...english.keys()].filter((k) => !strings.get(k)?.trim())
    expect(missing).toEqual([])
  })

  it.each(otherLocales)('%s keeps the same {placeholders} as English', (locale) => {
    const strings = collectStrings(dictionary[locale].domains as unknown as Tree)
    const mismatched = [...english.entries()]
      .filter(([k, v]) => placeholders(strings.get(k) ?? '') !== placeholders(v))
      .map(([k]) => k)
    expect(mismatched).toEqual([])
  })

  it.each(otherLocales)('%s has no domains string left as the English fallback', (locale) => {
    const strings = collectStrings(dictionary[locale].domains as unknown as Tree)
    const allowed = new Set(ALLOWED_IDENTICAL[locale] ?? [])
    const untranslated = [...english.entries()]
      .filter(([k, v]) => hasWords(v) && strings.get(k) === v && !allowed.has(k))
      .map(([k]) => k)
    expect(untranslated).toEqual([])
  })

  it.each(otherLocales.filter((l) => l !== 'tr'))(
    '%s translates the transfer, management, transfer-out, error and buy groups',
    (locale) => {
      const strings = collectStrings(dictionary[locale].domains as unknown as Tree)
      const groups = /^(transfer|transfers|mg|out|err|buy)/
      const keys = [...english.keys()].filter((k) => groups.test(k))
      expect(keys.length).toBeGreaterThan(100)
      for (const k of keys) {
        expect(strings.get(k), `${locale}.${k}`).toBeTruthy()
      }
    },
  )

  it('keeps Arabic domains copy in Arabic script (RTL), with placeholders intact', () => {
    const strings = collectStrings(dictionary.ar.domains as unknown as Tree)
    const notArabic = [...english.entries()]
      .filter(([k, v]) => hasWords(v) && !ARABIC_LATIN_OK.has(k) && !ARABIC_SCRIPT.test(strings.get(k) ?? ''))
      .map(([k]) => k)
    expect(notArabic).toEqual([])
  })

  it('marks Arabic as right-to-left', async () => {
    const { isRTL } = await import('@/lib/i18n')
    expect(isRTL('ar')).toBe(true)
    expect(isRTL('tr')).toBe(false)
  })
})
