import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'

const COPY_KEYS = [
  'websiteAllowanceDescription',
  'websiteAllowanceDescriptionYearly',
  'emailAllowanceDescription',
  'emailAllowanceDescriptionYearly',
] as const

const MULTILANG_KEYS = [
  'title',
  'description',
  'featureLanguages',
  'featureTranslation',
  'featurePublished',
  'active',
  'manageSite',
  'buyAnotherSite',
] as const

describe('billing add-on allowance copy across locales', () => {
  it('covers every supported locale', () => {
    expect([...SUPPORTED_LOCALES].sort()).toEqual([
      'ar',
      'az',
      'de',
      'en',
      'es',
      'et',
      'fr',
      'it',
      'pl',
      'pt',
      'ru',
      'tr',
    ])
  })

  it.each(SUPPORTED_LOCALES)('%s has localized monthly and yearly allowance descriptions', (locale) => {
    const copy = dictionary[locale].billing.addOns

    for (const key of COPY_KEYS) {
      expect(copy[key]?.trim(), `${locale}.billing.addOns.${key}`).toBeTruthy()
      if (locale !== 'en') {
        expect(copy[key], `${locale}.billing.addOns.${key}`).not.toBe(
          dictionary.en.billing.addOns[key],
        )
      }
    }

    expect(copy.websiteAllowanceDescriptionYearly).not.toBe(copy.websiteAllowanceDescription)
    expect(copy.emailAllowanceDescriptionYearly).not.toBe(copy.emailAllowanceDescription)
  })

  it.each(SUPPORTED_LOCALES)('%s has localized multilang add-on copy', (locale) => {
    const copy = dictionary[locale].billing.addOns.multilang

    for (const key of MULTILANG_KEYS) {
      expect(copy[key]?.trim(), `${locale}.billing.addOns.multilang.${key}`).toBeTruthy()
      if (locale !== 'en') {
        expect(copy[key], `${locale}.billing.addOns.multilang.${key}`).not.toBe(
          dictionary.en.billing.addOns.multilang[key],
        )
      }
    }
  })

  it('keeps Arabic multilang add-on copy in Arabic script', () => {
    const copy = dictionary.ar.billing.addOns.multilang
    for (const key of MULTILANG_KEYS) {
      expect(copy[key]).toMatch(/[\u0600-\u06FF]/)
    }
  })

  it('keeps Arabic allowance descriptions in Arabic script', () => {
    const copy = dictionary.ar.billing.addOns
    for (const key of COPY_KEYS) {
      expect(copy[key]).toMatch(/[\u0600-\u06FF]/)
    }
  })
})
