import { escape, renderEmailLayout, renderEmailPlainText, renderTable, type EmailLang } from './layout'

export type ReferralPayoutNoticeType =
  | 'referral_partner_signup'
  | 'referral_partner_signup_digest'
  | 'referral_commission_earned'
  | 'referral_cash_requested'
  | 'referral_cash_paid'
  | 'referral_cash_rejected'
  | 'referral_cash_admin'
  | 'referral_credit_converted'
  | 'referral_tax_verification_required'

export type ReferralPayoutNotice = {
  lang: EmailLang
  type: ReferralPayoutNoticeType
  amountCents?: number
  commissionCents?: number
  availableAt?: string
  creditAmount?: number
  systemTopupCents?: number
  signupCount?: number
  requestReference?: string
  maskedEmail?: string | null
  signupDate?: string
}

function formatTry(cents: number, lang: EmailLang) {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

function formatDate(value: string | undefined, lang: EmailLang) {
  if (!value || !Number.isFinite(Date.parse(value))) return lang === 'tr' ? 'Belirtilmedi' : 'Not provided'
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function buildReferralPayoutNoticeEmail(input: ReferralPayoutNotice) {
  const { lang, type } = input
  const copy = lang === 'tr'
    ? {
        signupTitle: 'Yeni bir yönlendirmeniz var',
        signupIntro: 'Yönlendirme bağlantınız üzerinden yeni bir hesap oluşturuldu.',
        signupEmail: 'E-posta',
        signupDate: 'Kayıt tarihi (UTC)',
        deletedAccount: 'Silinmiş hesap',
        digestTitle: 'Yönlendirme özeti',
        digestIntro: 'Son bildirim penceresinde yeni hesaplar oluşturuldu.',
        count: 'Yeni hesap sayısı',
        commissionTitle: 'Yeni komisyon kaydedildi',
        commissionIntro: 'İlk başarılı abonelik ödemesi için komisyonunuz kaydedildi. Komisyon 14 günlük bekleme süresi boyunca beklemede kalır.',
        commission: 'Komisyon',
        availableAt: 'Kullanılabilir olacağı tarih (UTC)',
        requestedTitle: 'Nakit ödeme talebiniz alındı',
        requestedIntro: 'Talebiniz yönetim incelemesine alındı.',
        adminTitle: 'Yeni nakit ödeme talebi',
        adminIntro: 'Satış ortaklığı nakit ödeme talebi yönetici incelemesi bekliyor.',
        requestReference: 'Talep kimliği',
        amount: 'Ödeme tutarı',
        paidTitle: 'Nakit ödemeniz işlendi',
        paidIntro: 'Ödeme talebiniz tamamlandı.',
        rejectedTitle: 'Ödeme talebiniz reddedildi',
        rejectedIntro: 'Talep tamamlanamadı. Gerekirse ödeme bilgilerinizi kontrol edip destek ekibiyle iletişime geçin.',
        creditTitle: 'AI kredisi dönüşümü tamamlandı',
        creditIntro: 'Komisyon bakiyeniz AI kredisine dönüştürüldü.',
        credits: 'Eklenen AI kredisi',
        topup: 'GLOVAL AI tarafından karşılanan küsurat farkı',
        taxTitle: 'Vergi bilgisi doğrulaması gerekiyor',
        taxIntro: 'İlk ödeme işleminiz tamamlandı; vergi bilgileriniz yönetim tarafından doğrulanana kadar yeni yönlendirme kabulü duraklatıldı.',
        footer: 'Bu otomatik bir satış ortaklığı bildirimidir. Tam IBAN bilgisi e-posta ile paylaşılmaz.',
      }
    : {
        signupTitle: 'You have a new referral',
        signupIntro: 'A new account was created through your referral link.',
        signupEmail: 'Email',
        signupDate: 'Signup date (UTC)',
        deletedAccount: 'Deleted account',
        digestTitle: 'Referral activity summary',
        digestIntro: 'New accounts were created during the latest notification window.',
        count: 'New account count',
        commissionTitle: 'A new commission was recorded',
        commissionIntro: 'Your commission for the first successful subscription payment was recorded. It remains pending during the 14-day hold.',
        commission: 'Commission',
        availableAt: 'Available after (UTC)',
        requestedTitle: 'Your cash payout request was received',
        requestedIntro: 'Your request is queued for admin review.',
        adminTitle: 'New cash payout request',
        adminIntro: 'A referral partner cash payout request is waiting for administrator review.',
        requestReference: 'Request ID',
        amount: 'Payout amount',
        paidTitle: 'Your cash payout was processed',
        paidIntro: 'Your payout request is complete.',
        rejectedTitle: 'Your payout request was rejected',
        rejectedIntro: 'The request could not be completed. Review your payout details and contact support if needed.',
        creditTitle: 'AI credit conversion complete',
        creditIntro: 'Your commission balance was converted to AI credits.',
        credits: 'AI credits added',
        topup: 'Fractional difference covered by GLOVAL AI',
        taxTitle: 'Tax information verification required',
        taxIntro: 'Your first payout was processed. New referrals are paused until an administrator verifies your tax information.',
        footer: 'This is an automated referral program notice. Full IBAN details are never included in email.',
      }

  let title = copy.signupTitle
  let intro = copy.signupIntro
  let rows: [string, string][] = []

  switch (type) {
    case 'referral_partner_signup':
      rows = [
        [copy.signupEmail, input.maskedEmail || copy.deletedAccount],
        [copy.signupDate, formatDate(input.signupDate, lang)],
      ]
      break
    case 'referral_partner_signup_digest':
      title = copy.digestTitle
      intro = copy.digestIntro
      rows = [[copy.count, String(input.signupCount ?? 0)]]
      break
    case 'referral_commission_earned':
      title = copy.commissionTitle
      intro = copy.commissionIntro
      rows = [
        [copy.commission, formatTry(input.commissionCents ?? 0, lang)],
        [copy.availableAt, formatDate(input.availableAt, lang)],
      ]
      break
    case 'referral_cash_requested':
      title = copy.requestedTitle
      intro = copy.requestedIntro
      rows = [[copy.amount, formatTry(input.amountCents ?? 0, lang)]]
      break
    case 'referral_cash_paid':
      title = copy.paidTitle
      intro = copy.paidIntro
      rows = [[copy.amount, formatTry(input.amountCents ?? 0, lang)]]
      break
    case 'referral_cash_admin':
      title = copy.adminTitle
      intro = copy.adminIntro
      rows = [
        [copy.requestReference, input.requestReference ?? ''],
        [copy.amount, formatTry(input.amountCents ?? 0, lang)],
      ]
      break
    case 'referral_cash_rejected':
      title = copy.rejectedTitle
      intro = copy.rejectedIntro
      break
    case 'referral_credit_converted':
      title = copy.creditTitle
      intro = copy.creditIntro
      rows = [
        [copy.credits, String(input.creditAmount ?? 0)],
        [copy.topup, formatTry(input.systemTopupCents ?? 0, lang)],
      ]
      break
    case 'referral_tax_verification_required':
      title = copy.taxTitle
      intro = copy.taxIntro
      break
  }

  const body = `<p style="margin:0 0 12px;">${escape(intro)}</p>${rows.length ? renderTable(rows) : ''}`
  return {
    subject: title,
    html: renderEmailLayout({ lang, previewText: title, title, body, footer: copy.footer }),
    text: renderEmailPlainText(
      title,
      `${intro}${rows.length ? `\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}` : ''}`,
      copy.footer,
    ),
  }
}
