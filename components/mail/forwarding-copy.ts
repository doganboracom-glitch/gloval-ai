/**
 * Display-only copy for mailbox forwarding. Kept apart from the shared i18n
 * dictionary on purpose. Turkish is the primary language; every other locale
 * falls back to English.
 */
export type ForwardingCopy = {
  action: string
  title: string
  body: string
  destinationsLabel: string
  destinationsHint: string
  addLabel: string
  addPlaceholder: string
  add: string
  remove: string
  externalBadge: string
  keepCopy: string
  keepCopyHint: string
  save: string
  turnOff: string
  turnOffConfirm: string
  badgeOn: string
  badgeOff: string
  forwardsTo: string
  keepsCopy: string
  invalidAddress: string
  selfAddress: string
  tooMany: string
  unknownInternal: string
  noDestinations: string
  unreadableTitle: string
  unreadableBody: string
  overwrite: string
  saved: string
  disabled: string
  errInvalidDestination: string
  errTooMany: string
  errSelf: string
  errConflict: string
  errUnreadable: string
  errUpdateFailed: string
}

const TR: ForwardingCopy = {
  action: 'Yönlendir',
  title: 'E-posta yönlendirme',
  body: 'Bu posta kutusuna gelen tüm postayı başka adreslere de gönder.',
  destinationsLabel: 'Yönlendirilecek adresler',
  destinationsHint: 'Aynı alan adındaki bir posta kutusu veya yönlendirme ya da harici bir adres ekleyebilirsin.',
  addLabel: 'Adres ekle',
  addPlaceholder: 'ornek@gmail.com',
  add: 'Ekle',
  remove: 'Kaldır',
  externalBadge: 'harici',
  keepCopy: 'Kopyasını bu posta kutusunda da tut',
  keepCopyHint: 'Kapalıysa posta yalnızca yönlendirilen adreslere gider ve bu posta kutusuna düşmez.',
  save: 'Kaydet',
  turnOff: 'Yönlendirmeyi kapat',
  turnOffConfirm: 'Bu posta kutusunun yönlendirmesi kapatılsın mı?',
  badgeOn: 'Yönlendiriliyor',
  badgeOff: 'Yönlendirme pasif',
  forwardsTo: 'Yönlendirilen adresler',
  keepsCopy: 'kopyası saklanıyor',
  invalidAddress: 'Geçerli tek bir e-posta adresi gir.',
  selfAddress: 'Bir posta kutusu kendi adresine yönlendirilemez.',
  tooMany: 'En fazla 10 adrese yönlendirebilirsin.',
  unknownInternal: 'Bu alan adında böyle bir posta kutusu veya yönlendirme yok.',
  noDestinations: 'Yönlendirmeyi açmak için en az bir adres ekle.',
  unreadableTitle: 'Mevcut bir yönlendirme kuralı var',
  unreadableBody:
    'Bu posta kutusunda daha önce elle oluşturulmuş bir yönlendirme kuralı var ve buradan okunamıyor. Kaydedersen bu kural değiştirilir.',
  overwrite: 'Mevcut kuralın üzerine yaz',
  saved: 'Yönlendirme güncellendi',
  disabled: 'Yönlendirme kapatıldı',
  errInvalidDestination: 'Adreslerden biri geçerli değil veya bu alan adında bulunmuyor.',
  errTooMany: 'En fazla 10 adrese yönlendirebilirsin.',
  errSelf: 'Bir posta kutusu kendi adresine yönlendirilemez.',
  errConflict:
    'Bu posta kutusunda zaten etkin başka bir filtre var. Önce onu kapat veya sil, sonra yönlendirmeyi aç.',
  errUnreadable: 'Mevcut yönlendirme kuralı okunamadı. Üzerine yazmayı onaylayarak devam edebilirsin.',
  errUpdateFailed: 'Yönlendirme kaydedilemedi. Lütfen tekrar dene.',
}

const EN: ForwardingCopy = {
  action: 'Forward',
  title: 'Email forwarding',
  body: 'Also send everything this mailbox receives to other addresses.',
  destinationsLabel: 'Forward to',
  destinationsHint: 'Add a mailbox or alias on the same domain, or an external address.',
  addLabel: 'Add address',
  addPlaceholder: 'name@gmail.com',
  add: 'Add',
  remove: 'Remove',
  externalBadge: 'external',
  keepCopy: 'Keep a copy in this mailbox',
  keepCopyHint: 'When off, mail goes only to the forwarding addresses and does not land in this mailbox.',
  save: 'Save',
  turnOff: 'Turn off forwarding',
  turnOffConfirm: 'Turn off forwarding for this mailbox?',
  badgeOn: 'Forwarding',
  badgeOff: 'Forwarding paused',
  forwardsTo: 'Forwarding to',
  keepsCopy: 'copy kept',
  invalidAddress: 'Enter a single valid email address.',
  selfAddress: 'A mailbox cannot forward to itself.',
  tooMany: 'You can forward to at most 10 addresses.',
  unknownInternal: 'There is no such mailbox or alias on this domain.',
  noDestinations: 'Add at least one address to turn forwarding on.',
  unreadableTitle: 'An existing forwarding rule was found',
  unreadableBody:
    'This mailbox has a forwarding rule that was created by hand and cannot be read here. Saving will replace it.',
  overwrite: 'Replace the existing rule',
  saved: 'Forwarding updated',
  disabled: 'Forwarding turned off',
  errInvalidDestination: 'One of the addresses is not valid or does not exist on this domain.',
  errTooMany: 'You can forward to at most 10 addresses.',
  errSelf: 'A mailbox cannot forward to itself.',
  errConflict:
    'This mailbox already has another active filter. Turn it off or delete it first, then turn forwarding on.',
  errUnreadable: 'The existing forwarding rule could not be read. You can confirm replacing it to continue.',
  errUpdateFailed: 'Forwarding could not be saved. Please try again.',
}

export function getForwardingCopy(lang: string): ForwardingCopy {
  return lang === 'tr' ? TR : EN
}
