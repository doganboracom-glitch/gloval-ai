/**
 * Copy for store-customer account deletion. Pure data (no server imports) so the
 * account UI, the owner panel and the e-mail template share one source.
 */

export const ACCOUNT_DELETION_COPY = {
  tr: {
    sectionTitle: 'Hesabı sil',
    sectionIntro:
      'Hesabınızı sildiğinizde kişisel bilgileriniz kalıcı olarak kaldırılır ve bu işlem geri alınamaz.',
    removedTitle: 'Silinecekler',
    removed: [
      'Ad, e-posta, telefon, şehir ve adres bilgileriniz',
      'Kayıtlı fatura bilgileriniz',
      'Şifreniz ve tüm açık oturumlarınız',
    ],
    keptTitle: 'Yasal nedenlerle saklananlar',
    kept: [
      'Geçmiş siparişlerinizin kaydı (muhasebe, vergi ve kargo yükümlülükleri için); bu kayıtlar artık hesabınıza bağlı değildir',
    ],
    blockedTitle: 'Şu an silinemiyor',
    blocked:
      'Devam eden siparişleriniz var. Siparişleriniz teslim edildikten veya iptal olduktan sonra hesabınızı silebilirsiniz.',
    blockedContact: 'Acil bir durumda mağaza ile iletişime geçebilirsiniz.',
    passwordLabel: 'Şifreniz',
    confirmLabel: 'Onaylamak için SİL yazın',
    confirmPlaceholder: 'SİL',
    submit: 'Hesabımı kalıcı olarak sil',
    working: 'Siliniyor…',
    wrongPassword: 'Şifre hatalı.',
    wrongConfirm: 'Onay için SİL yazmalısınız.',
    failed: 'Hesap silinemedi. Lütfen daha sonra tekrar deneyin.',
    migrationPending: 'Hesap silme özelliği şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
    deletedNotice: 'Hesabınız silindi.',
  },
  en: {
    sectionTitle: 'Delete account',
    sectionIntro:
      'When you delete your account your personal data is permanently removed. This cannot be undone.',
    removedTitle: 'Will be deleted',
    removed: [
      'Your name, email, phone, city and address',
      'Your saved invoice details',
      'Your password and all signed-in sessions',
    ],
    keptTitle: 'Kept for legal reasons',
    kept: [
      'A record of your past orders (for accounting, tax and shipping obligations); these records are no longer linked to your account',
    ],
    blockedTitle: 'Cannot be deleted right now',
    blocked:
      'You have orders in progress. You can delete your account once they are delivered or cancelled.',
    blockedContact: 'In an urgent case, please contact the store.',
    passwordLabel: 'Your password',
    confirmLabel: 'Type DELETE to confirm',
    confirmPlaceholder: 'DELETE',
    submit: 'Permanently delete my account',
    working: 'Deleting…',
    wrongPassword: 'Incorrect password.',
    wrongConfirm: 'Type DELETE to confirm.',
    failed: 'Your account could not be deleted. Please try again later.',
    migrationPending: 'Account deletion is not available right now. Please try again later.',
    deletedNotice: 'Your account has been deleted.',
  },
} as const

export const ACCOUNT_DELETED_EMAIL_COPY = {
  tr: {
    subject: (store: string) => `${store} hesabınız silindi`,
    preview: 'Hesabınız ve kişisel bilgileriniz silindi.',
    title: 'Hesabınız silindi',
    hello: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    introByCustomer: (store: string) =>
      `${store} mağazasındaki hesabınız talebiniz üzerine silindi.`,
    introByOwner: (store: string) =>
      `${store} mağazasındaki hesabınız mağaza yönetimi tarafından silindi.`,
    removed: 'Kişisel bilgileriniz (ad, e-posta, telefon, adres, fatura bilgileri) ve şifreniz kaldırıldı.',
    kept: 'Geçmiş siparişlerinizin kaydı, muhasebe ve vergi yükümlülükleri nedeniyle hesabınızdan bağımsız olarak saklanır.',
    contact: (email: string) =>
      email
        ? `Bu işlemi siz yapmadıysanız veya sorunuz varsa ${email} adresinden mağaza ile iletişime geçin.`
        : 'Bu işlemi siz yapmadıysanız veya sorunuz varsa mağaza ile iletişime geçin.',
    footer: 'Bu, hesabınızla ilgili gönderilen son e-postadır.',
  },
  en: {
    subject: (store: string) => `Your ${store} account was deleted`,
    preview: 'Your account and personal data were deleted.',
    title: 'Your account was deleted',
    hello: (name: string) => (name ? `Hello ${name},` : 'Hello,'),
    introByCustomer: (store: string) => `Your ${store} account was deleted at your request.`,
    introByOwner: (store: string) => `Your ${store} account was deleted by the store.`,
    removed: 'Your personal data (name, email, phone, address, invoice details) and password were removed.',
    kept: 'A record of your past orders is kept, independent of your account, for accounting and tax obligations.',
    contact: (email: string) =>
      email
        ? `If you did not expect this or have questions, contact the store at ${email}.`
        : 'If you did not expect this or have questions, please contact the store.',
    footer: 'This is the last email you will receive about this account.',
  },
} as const

/** Owner-panel copy for the 30-day suspension flow (Turkish only, like the panel). */
export const OWNER_DELETION_COPY = {
  tabActive: 'Aktif',
  tabPending: 'Silinme bekleyen',
  suspendButton: 'Hesabı sil (müşteri talebi)',
  suspendNotice:
    'Hesap 30 gün askıya alınır; bu süre içinde geri alabilirsiniz. Süre dolunca kişisel veriler kalıcı silinir (siparişler yasal saklama gereği korunur).',
  suspendSubmit: 'Hesabı askıya al',
  suspendedToast: 'Hesap askıya alındı.',
  pendingEmpty: 'Silinme bekleyen hesap yok.',
  suspendedAt: 'Askıya alınma',
  remaining: (days: number) => (days === 1 ? 'Kalan: 1 gün' : `Kalan: ${days} gün`),
  banner: (date: string) => `Bu hesap ${date} tarihinde kalıcı olarak silinecek.`,
  restore: 'Kurtar',
  restoreTitle: 'Hesabı kurtar',
  restoreBody: 'Hesap eski hâline döner; müşteri aynı şifresiyle tekrar giriş yapabilir ve kendisine bilgi e-postası gönderilir.',
  restoreSubmit: 'Hesabı kurtar',
  purge: 'Hemen kalıcı sil',
  purgeTitle: 'Hemen kalıcı sil',
  purgeBody:
    'Kişisel veriler şimdi kalıcı olarak silinir ve bu işlem geri alınamaz. Siparişler yasal saklama gereği korunur.',
  purgeConfirm: 'Onaylamak için müşterinin e-postasını yazın',
  purgeSubmit: 'Kalıcı olarak sil',
  cancel: 'Vazgeç',
  errors: {
    unauthorized: 'Yetkisiz erişim.',
    notFound: 'Müşteri bulunamadı.',
    alreadyPending: 'Bu hesap zaten silinme sürecinde.',
    notPending: 'Bu hesap silinme sürecinde değil.',
    notRestorable: 'Süresi dolmuş veya silinmiş hesap kurtarılamaz.',
    blocked: 'Müşterinin devam eden siparişi var; tamamlanınca veya iptal edilince silinebilir.',
    confirmEmail: 'Onay için müşterinin e-posta adresini yazın.',
    migrationPending: 'Bu özellik için veritabanı güncellemesi bekleniyor.',
    failed: 'İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.',
  },
} as const

export const ACCOUNT_SUSPENSION_MESSAGES = {
  login: 'Hesabınız silinme sürecinde. Bilgi için mağaza ile iletişime geçin.',
  register: 'Bu e-posta ile bir hesap silinme sürecinde. Mağaza ile iletişime geçin.',
} as const

export const ACCOUNT_SUSPENDED_EMAIL_COPY = {
  tr: {
    subject: (store: string) => `${store} hesabınız silinme sürecine alındı`,
    preview: 'Hesabınız silinme sürecine alındı.',
    title: 'Hesabınız silinme sürecinde',
    hello: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    intro: (store: string) => `${store} mağazasındaki hesabınız mağaza tarafından silinme sürecine alındı.`,
    schedule: (date: string) => `Hesabınız ${date} tarihinde kalıcı olarak silinecek.`,
    contact: (email: string) =>
      email
        ? `Hata olduğunu düşünüyorsanız ${email} adresinden mağaza ile iletişime geçin.`
        : 'Hata olduğunu düşünüyorsanız mağaza ile iletişime geçin.',
    footer: 'Bu süre içinde mağaza hesabınızı yeniden etkinleştirebilir.',
  },
  en: {
    subject: (store: string) => `Your ${store} account is scheduled for deletion`,
    preview: 'Your account was scheduled for deletion.',
    title: 'Your account is scheduled for deletion',
    hello: (name: string) => (name ? `Hello ${name},` : 'Hello,'),
    intro: (store: string) => `Your ${store} account was scheduled for deletion by the store.`,
    schedule: (date: string) => `Your account will be permanently deleted on ${date}.`,
    contact: (email: string) =>
      email
        ? `If you think this is a mistake, contact the store at ${email}.`
        : 'If you think this is a mistake, please contact the store.',
    footer: 'Until then the store can reactivate your account.',
  },
} as const

export const ACCOUNT_RESTORED_EMAIL_COPY = {
  tr: {
    subject: (store: string) => `${store} hesabınız yeniden etkinleştirildi`,
    preview: 'Hesabınız yeniden etkinleştirildi.',
    title: 'Hesabınız yeniden etkinleştirildi',
    hello: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    intro: (store: string) => `${store} mağazasındaki hesabınız yeniden etkinleştirildi; silinme işlemi iptal edildi.`,
    detail: 'Mevcut e-posta ve şifrenizle tekrar giriş yapabilirsiniz.',
    contact: (email: string) =>
      email
        ? `Sorunuz varsa ${email} adresinden mağaza ile iletişime geçin.`
        : 'Sorunuz varsa mağaza ile iletişime geçin.',
    footer: 'Bilgilendirme amaçlı gönderilmiştir.',
  },
  en: {
    subject: (store: string) => `Your ${store} account was reactivated`,
    preview: 'Your account was reactivated.',
    title: 'Your account was reactivated',
    hello: (name: string) => (name ? `Hello ${name},` : 'Hello,'),
    intro: (store: string) => `Your ${store} account was reactivated and the deletion was cancelled.`,
    detail: 'You can sign in again with your existing email and password.',
    contact: (email: string) =>
      email ? `If you have questions, contact the store at ${email}.` : 'If you have questions, please contact the store.',
    footer: 'Sent for your information.',
  },
} as const
