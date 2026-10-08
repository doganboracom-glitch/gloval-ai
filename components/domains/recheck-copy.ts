/**
 * Display-only copy for the "Bağlantı durumu" re-check button. Kept apart from
 * the shared i18n dictionary on purpose. Turkish is the primary language; every
 * other locale falls back to English.
 */
export type RecheckCopy = {
  button: string
  checking: string
  error: string
}

const TR: RecheckCopy = {
  button: 'Yeniden kontrol et',
  checking: 'Kontrol ediliyor…',
  error: 'Kontrol tamamlanamadı. Lütfen biraz sonra tekrar deneyin.',
}

const EN: RecheckCopy = {
  button: 'Re-check',
  checking: 'Checking…',
  error: 'The check could not be completed. Please try again shortly.',
}

export function getRecheckCopy(lang: string): RecheckCopy {
  return lang === 'tr' ? TR : EN
}
