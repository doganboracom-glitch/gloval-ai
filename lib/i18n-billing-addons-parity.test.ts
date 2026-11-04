import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'

const COPY_KEYS = [
  'websiteAllowanceDescription',
  'websiteAllowanceDescriptionYearly',
  'emailAllowanceDescription',
  'emailAllowanceDescriptionYearly',
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

  it('keeps Arabic allowance descriptions in Arabic script', () => {
    const copy = dictionary.ar.billing.addOns
    for (const key of COPY_KEYS) {
      expect(copy[key]).toMatch(/[\u0600-\u06FF]/)
    }
  })
})
