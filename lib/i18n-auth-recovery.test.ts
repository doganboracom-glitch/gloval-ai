import { describe, expect, it } from 'vitest'
import { dictionary, type Lang } from './i18n'

const recoveryLanguages: Lang[] = ['tr', 'en', 'fr', 'de', 'es', 'it']
const recoveryKeys = [
  'recoveryConfirmTitle',
  'recoveryConfirmBody',
  'confirmRecovery',
  'recoveryErrorTitle',
  'recoveryLinkInvalid',
  'requestNewRecoveryLink',
] as const

describe('password recovery translations', () => {
  it.each(recoveryLanguages)('provides recovery copy in %s', (lang) => {
    for (const key of recoveryKeys) {
      expect(dictionary[lang].auth[key], `${lang}.${key}`).toBeTruthy()
    }
  })
})
