import { describe, expect, it } from 'vitest'
import { dictionary, SUPPORTED_LOCALES, type Lang } from '@/lib/i18n'

const NEW_BADGE_COPY: Record<Lang, string> = {
  tr: 'Yeni',
  en: 'New',
  de: 'Neu',
  fr: 'Nouveau',
  es: 'Nuevo',
  it: 'Nuovo',
  az: 'Yeni',
  et: 'Uus',
  ar: 'جديد',
  pt: 'Novo',
  ru: 'Новое',
  pl: 'Nowe',
}

describe('GLOVAL Ads new badge translations', () => {
  it.each(SUPPORTED_LOCALES)('%s has localized badge copy', (locale) => {
    expect(dictionary[locale].ads.newBadge).toBe(NEW_BADGE_COPY[locale])
  })

  it('keeps the platform coming-soon copy independent', () => {
    expect(dictionary.tr.ads.comingSoon).toBe('Yakında')
    expect(dictionary.en.ads.comingSoon).toBe('Coming soon')
  })
})
