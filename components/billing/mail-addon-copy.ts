/**
 * Display-only copy for the GLOVAL Mail add-on group. Kept apart from the shared
 * i18n dictionary on purpose. Turkish is the primary language; every other
 * locale falls back to English. `{n}` / `{total}` are replaced by the caller.
 */
export type MailAddOnCopy = {
  group: string
  groupDesc: string
  /** `{n}` mailboxes. */
  unit: string
  notEligible: string
  mailLimit: string
  /** `{total}` mailboxes in total. */
  successTotal: string
  getMore: string
}

const TR: MailAddOnCopy = {
  group: 'GLOVAL Mail',
  groupDesc: 'Alan adınıza bağlı ek posta kutuları. Paketinizdeki kutulara eklenir.',
  unit: '{n} posta kutusu',
  notEligible: 'Ek posta kutusu satın almak için aktif bir aboneliğiniz olmalı.',
  mailLimit: 'Posta kutusu limiti',
  successTotal: 'Toplam posta kutusu limitiniz: {total}',
  getMore: 'Ek posta kutusu al',
}

const EN: MailAddOnCopy = {
  group: 'GLOVAL Mail',
  groupDesc: 'Extra mailboxes on your domain. They add to the mailboxes included in your plan.',
  unit: '{n} mailboxes',
  notEligible: 'You need an active subscription to buy extra mailboxes.',
  mailLimit: 'Mailbox limit',
  successTotal: 'Your total mailbox limit: {total}',
  getMore: 'Get more mailboxes',
}

export function getMailAddOnCopy(lang: string): MailAddOnCopy {
  return lang === 'tr' ? TR : EN
}
