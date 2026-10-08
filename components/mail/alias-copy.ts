/**
 * Display-only copy for alias forwarding to mailboxes AND external addresses.
 * Kept apart from the shared i18n dictionary on purpose. Turkish is the primary
 * language; every other locale falls back to English.
 */
export type AliasCopy = {
  aliasesHint: string
  destinationsHint: string
  externalLabel: string
  externalPlaceholder: string
  add: string
  removeExternal: string
  externalBadge: string
  noDestinations: string
  invalidAddress: string
  selfAddress: string
  tooMany: string
  unknownInternal: string
  errInvalidDestination: string
  errTooMany: string
  errSelf: string
  errAliasExists: string
  errAddressIsMailbox: string
  warnMailboxAddress: string
  warnAliasAddress: string
  statusActive: string
  statusInactive: string
  enable: string
}

const TR: AliasCopy = {
  errAliasExists: 'Bu adres için zaten bir yönlendirme var.',
  errAddressIsMailbox: 'Bu adres zaten bir posta kutusu olarak kullanılıyor.',
  warnMailboxAddress: 'Bu adres zaten bir posta kutusu olarak kullanılıyor.',
  warnAliasAddress: 'Bu adres için zaten bir yönlendirme var.',
  statusActive: 'Aktif',
  statusInactive: 'Pasif',
  enable: 'Etkinleştir',
  aliasesHint: 'Bir adrese gelen postayı posta kutularına veya harici adreslere yönlendir.',
  destinationsHint: 'Gelen postanın gönderileceği adresleri seç veya harici bir adres ekle.',
  externalLabel: 'Harici adres ekle',
  externalPlaceholder: 'ornek@gmail.com',
  add: 'Ekle',
  removeExternal: 'Kaldır',
  externalBadge: 'harici',
  noDestinations: 'En az bir hedef (posta kutusu veya harici adres) seçmelisin.',
  invalidAddress: 'Geçerli tek bir e-posta adresi gir.',
  selfAddress: 'Bir yönlendirme kendi adresine yönlendirilemez.',
  tooMany: 'Bir yönlendirmenin en fazla 10 hedefi olabilir.',
  unknownInternal: 'Bu alan adında böyle bir posta kutusu veya yönlendirme yok.',
  errInvalidDestination: 'Hedeflerden biri geçerli bir adres değil veya bu alan adında bulunmuyor.',
  errTooMany: 'Bir yönlendirmenin en fazla 10 hedefi olabilir.',
  errSelf: 'Bir yönlendirme kendi adresine yönlendirilemez.',
}

const EN: AliasCopy = {
  errAliasExists: 'An alias already exists for this address.',
  errAddressIsMailbox: 'This address is already used by a mailbox.',
  warnMailboxAddress: 'This address is already used by a mailbox.',
  warnAliasAddress: 'An alias already exists for this address.',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  enable: 'Enable',
  aliasesHint: 'Forward mail sent to an address to mailboxes or external addresses.',
  destinationsHint: 'Choose where incoming mail should go, or add an external address.',
  externalLabel: 'Add external address',
  externalPlaceholder: 'name@gmail.com',
  add: 'Add',
  removeExternal: 'Remove',
  externalBadge: 'external',
  noDestinations: 'Choose at least one destination (a mailbox or an external address).',
  invalidAddress: 'Enter a single valid email address.',
  selfAddress: 'An alias cannot forward to itself.',
  tooMany: 'An alias can have at most 10 destinations.',
  unknownInternal: 'There is no such mailbox or alias on this domain.',
  errInvalidDestination: 'One of the destinations is not a valid address or does not exist on this domain.',
  errTooMany: 'An alias can have at most 10 destinations.',
  errSelf: 'An alias cannot forward to itself.',
}

export function getAliasCopy(lang: string): AliasCopy {
  return lang === 'tr' ? TR : EN
}
