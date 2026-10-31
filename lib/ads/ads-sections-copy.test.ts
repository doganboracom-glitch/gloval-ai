import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES } from '@/lib/i18n'

function keyPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => keyPaths(entry, `${prefix}[]`))
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => keyPaths(entry, `${prefix}${key}.`))
  }

  return [prefix]
}

describe('GLOVAL Ads information translations', () => {
  it('keeps the Turkish and English section key trees in parity', () => {
    expect(keyPaths(dictionary.tr.ads.sections).sort()).toEqual(keyPaths(dictionary.en.ads.sections).sort())
  })

  it.each(SUPPORTED_LOCALES)('%s resolves every information section key', (locale) => {
    const paths = keyPaths(dictionary[locale].ads.sections)
    expect(paths.length).toBeGreaterThan(0)
    expect(paths).toEqual(keyPaths(dictionary.en.ads.sections))
  })
})
