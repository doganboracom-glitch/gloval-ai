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

const META_ACCESS_COPY_KEYS = [
  'metaApprovalPendingButton',
  'metaApprovalPendingTooltip',
  'metaApprovalPendingShort',
  'metaAccessReadOnlyLabel',
  'metaAccessManagedLabel',
  'metaConnectionReadOnlyBody',
  'metaConnectionManagedBody',
  'metaConnectReadScopesNote',
] as const

describe('GLOVAL Ads new badge and access translations', () => {
  it.each(SUPPORTED_LOCALES)('%s has localized badge copy', (locale) => {
    expect(dictionary[locale].ads.newBadge).toBe(NEW_BADGE_COPY[locale])
  })

  it.each(SUPPORTED_LOCALES)('%s has localized Meta approval and permission copy', (locale) => {
    const adsCopy = dictionary[locale].ads

    for (const key of META_ACCESS_COPY_KEYS) {
      expect(adsCopy[key].trim()).not.toBe('')
      if (locale !== 'en') expect(adsCopy[key]).not.toBe(dictionary.en.ads[key])
    }
  })

  it('keeps the requested Turkish approval copy and platform coming-soon copy independent', () => {
    expect(dictionary.tr.ads.metaApprovalPendingButton).toBe('Meta onayı bekleniyor')
    expect(dictionary.tr.ads.metaApprovalPendingTooltip).toBe('Meta uygulama incelemesi tamamlanınca açılacak')
    expect(dictionary.tr.ads.metaApprovalPendingShort).toBe('Onay bekleniyor')
    expect(dictionary.tr.ads.comingSoon).toBe('Yakında')
    expect(dictionary.en.ads.comingSoon).toBe('Coming soon')
  })
})
