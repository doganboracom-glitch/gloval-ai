/**
 * Display-only copy for mail access banners and mailbox limits. Kept apart from
 * the shared i18n dictionary on purpose. Turkish is the primary language; every
 * other locale falls back to English.
 */
export type LimitsCopy = {
  graceTitle: string
  /** `{days}` is replaced with the remaining grace days. */
  graceBody: string
  suspendedTitle: string
  suspendedBody: string
  renew: string
  lockedHint: string
  overLimit: string
  overLimitHint: string
  limitFromPlan: string
  limitFromAddons: string
  errLimitReached: string
  errAccessInactive: string
}

const TR: LimitsCopy = {
  graceTitle: 'Aboneliğiniz sona erdi',
  graceBody:
    'Aboneliğiniz sona erdi. {days} gün içinde yenilemezseniz e-postalarınız durdurulacak. Şu an gelen postalar alınıyor ancak giriş ve gönderim kapalı.',
  suspendedTitle: 'E-posta hizmeti durduruldu',
  suspendedBody:
    'E-posta hizmetiniz durduruldu. Verileriniz saklanıyor; yenilediğinizde tekrar açılır.',
  renew: 'Yenile',
  lockedHint: 'Abonelik aktif olmadığı için kullanılamıyor. Yenilediğinizde açılır.',
  overLimit: 'Limitin üzerindesiniz',
  overLimitHint:
    'Yeni posta kutusu oluşturamazsınız. Mevcut kutularınız silinmedi; hangilerini askıya alacağınıza veya silineceğine siz karar verirsiniz.',
  limitFromPlan: 'Paket',
  limitFromAddons: 'Ek hizmet',
  errLimitReached: 'Paketinizin posta kutusu limitine ulaştınız.',
  errAccessInactive: 'Aboneliğiniz aktif olmadığı için yeni posta kutusu oluşturulamaz.',
}

const EN: LimitsCopy = {
  graceTitle: 'Your subscription has ended',
  graceBody:
    'Your subscription has ended. If you do not renew within {days} days, your email will be stopped. Incoming mail is still received, but sign-in and sending are off.',
  suspendedTitle: 'Email service stopped',
  suspendedBody:
    'Your email service has been stopped. Your data is kept; it turns back on when you renew.',
  renew: 'Renew',
  lockedHint: 'Unavailable while your subscription is not active. It opens again once you renew.',
  overLimit: 'You are over the limit',
  overLimitHint:
    'You cannot create new mailboxes. Your existing mailboxes were not deleted; you choose which ones to suspend or remove.',
  limitFromPlan: 'Plan',
  limitFromAddons: 'Add-ons',
  errLimitReached: 'You have reached your plan’s mailbox limit.',
  errAccessInactive: 'New mailboxes cannot be created while your subscription is not active.',
}

export function getLimitsCopy(lang: string): LimitsCopy {
  return lang === 'tr' ? TR : EN
}

export function formatGraceBody(copy: LimitsCopy, days: number | null): string {
  return copy.graceBody.replace('{days}', String(days ?? 0))
}
