/**
 * Display-only copy for the mailbox password flow (create + "set new
 * password"). Kept apart from the shared i18n dictionary on purpose. Turkish is
 * the primary language; every other locale falls back to English.
 */
export type PasswordCopy = {
  password: string
  passwordConfirm: string
  newPassword: string
  newPasswordConfirm: string
  show: string
  hide: string
  suggest: string
  copy: string
  copied: string
  ruleMinLength: string
  ruleLetter: string
  ruleDigit: string
  ruleMatch: string
  mismatch: string
  resetTitle: string
  resetBody: string
  save: string
  updated: string
  invalid: string
  updateFailed: string
}

const TR: PasswordCopy = {
  password: 'Şifre',
  passwordConfirm: 'Şifre (tekrar)',
  newPassword: 'Yeni şifre',
  newPasswordConfirm: 'Yeni şifre (tekrar)',
  show: 'Şifreyi göster',
  hide: 'Şifreyi gizle',
  suggest: 'Güçlü şifre öner',
  copy: 'Şifreyi kopyala',
  copied: 'Kopyalandı',
  ruleMinLength: 'En az 10 karakter',
  ruleLetter: 'En az bir harf',
  ruleDigit: 'En az bir rakam',
  ruleMatch: 'Şifreler eşleşiyor',
  mismatch: 'Şifreler eşleşmiyor.',
  resetTitle: 'Yeni şifre belirle',
  resetBody: 'Bu posta kutusu için yeni bir şifre yaz. Şifre kaydedildikten sonra tekrar gösterilmez.',
  save: 'Şifreyi kaydet',
  updated: 'Şifre güncellendi',
  invalid: 'Şifre kurallara uymuyor. Lütfen aşağıdaki koşulları kontrol edin.',
  updateFailed: 'Şifre güncellenemedi. Lütfen daha sonra tekrar deneyin.',
}

const EN: PasswordCopy = {
  password: 'Password',
  passwordConfirm: 'Password (repeat)',
  newPassword: 'New password',
  newPasswordConfirm: 'New password (repeat)',
  show: 'Show password',
  hide: 'Hide password',
  suggest: 'Suggest a strong password',
  copy: 'Copy password',
  copied: 'Copied',
  ruleMinLength: 'At least 10 characters',
  ruleLetter: 'At least one letter',
  ruleDigit: 'At least one digit',
  ruleMatch: 'Passwords match',
  mismatch: 'Passwords do not match.',
  resetTitle: 'Set new password',
  resetBody: 'Type a new password for this mailbox. It is not shown again after saving.',
  save: 'Save password',
  updated: 'Password updated',
  invalid: 'The password does not meet the requirements. Please check the conditions below.',
  updateFailed: 'The password could not be updated. Please try again later.',
}

export function getPasswordCopy(lang: string): PasswordCopy {
  return lang === 'tr' ? TR : EN
}
