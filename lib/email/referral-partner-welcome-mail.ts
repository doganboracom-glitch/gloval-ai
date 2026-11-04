import { CREDIT_MIN_CENTS, REFERRAL_COMMISSION_RATE_PERCENT, REFERRAL_HOLD_DAYS, REFERRAL_PAYOUT_MIN_TRY, TRY_PER_CREDIT_CENTS } from '@/lib/referrals/commission-config'
import { escape, renderEmailLayout, renderEmailPlainText, type EmailLang } from './layout'

export type ReferralPartnerWelcomeEmailInput = {
  lang: EmailLang
  referralCode: string
  cashPayoutsEnabled: boolean
}

export function buildReferralPartnerWelcomeEmail({
  lang,
  referralCode,
  cashPayoutsEnabled,
}: ReferralPartnerWelcomeEmailInput) {
  const isTurkish = lang === 'tr'
  const title = isTurkish ? 'Satış ortaklığına hoş geldiniz' : 'Welcome to the referral program'
  const intro = isTurkish
    ? 'GLOVAL AI satış ortaklığı programına katıldınız. Yönlendirme bağlantınız ve paneliniz hazır.'
    : 'Welcome to the GLOVAL AI referral program. Your referral link and dashboard are ready.'
  const referralLink = `https://gloval.ai/?ref=${encodeURIComponent(referralCode)}`
  const dashboardLink = 'https://gloval.ai/dashboard#satis-ortakligi'
  const referralLabel = isTurkish ? 'Yönlendirme bağlantınız' : 'Your referral link'
  const dashboardLabel = isTurkish ? 'Satış ortaklığı paneliniz' : 'Your partner dashboard'
  const formattedMinimum = new Intl.NumberFormat(isTurkish ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(REFERRAL_PAYOUT_MIN_TRY)
  const minimum = isTurkish ? `${formattedMinimum} TL` : `TRY ${formattedMinimum}`
  const formattedCreditMinimum = new Intl.NumberFormat(isTurkish ? 'tr-TR' : 'en-US', {
    maximumFractionDigits: 0,
  }).format(CREDIT_MIN_CENTS / 100)
  const creditMinimum = isTurkish ? `${formattedCreditMinimum} TL` : `TRY ${formattedCreditMinimum}`
  const creditValue = TRY_PER_CREDIT_CENTS / 100
  const cashPayoutRule = isTurkish
    ? cashPayoutsEnabled
      ? `IBAN nakit ödemesi için 14 günlük bekleme tamamlanmalı ve kullanılabilir bakiye en az ${minimum} olmalıdır.`
      : `IBAN nakit ödemesi etkinleştirildiğinde 14 günlük bekleme tamamlanmalı ve kullanılabilir bakiye en az ${minimum} olmalıdır.`
    : cashPayoutsEnabled
      ? `An IBAN cash payout requires the 14-day hold to end and at least ${minimum} in available balance.`
      : `When IBAN cash payouts are enabled, the 14-day hold must end and available balance must reach at least ${minimum}.`
  const rules = isTurkish
    ? [
        `Komisyon, yönlendirdiğiniz yeni müşterinin yalnızca ilk başarılı abonelik ödemesindeki KDV hariç tutarın %${REFERRAL_COMMISSION_RATE_PERCENT}’idir.`,
        `Nakit ödemeye uygun komisyonlar ödeme tarihinden ${REFERRAL_HOLD_DAYS} gün sonra kullanılabilir olur; iadeler ve ters ibrazlarda bakiyeden düşülür.`,
        `Toplam bakiye en az ${creditMinimum} olduğunda, bekleyen ve kullanılabilir komisyonların tamamını beklemeden AI kredisine çevirebilirsiniz. 1 kredi ${creditValue} TL değerindedir; kredi adedi yukarı yuvarlanır ve aradaki farkı GLOVAL AI karşılar.`,
        cashPayoutRule,
        'Vergi ve fatura yükümlülükleri ortaklık şartlarına göre uygulanır; ayrıntılar için paneldeki güncel şartları inceleyin.',
      ]
    : [
        `Commission is ${REFERRAL_COMMISSION_RATE_PERCENT}% of the VAT-exclusive amount of only the referred new customer’s first successful subscription payment.`,
        `Cash-eligible commissions become available ${REFERRAL_HOLD_DAYS} days after payment; refunds and chargebacks are deducted from the balance.`,
        `Once the total balance reaches ${creditMinimum}, all pending and available commissions can be converted to AI credits without waiting. One credit is worth ${creditValue} TRY; the credit count is rounded up and GLOVAL AI covers the difference.`,
        cashPayoutRule,
        'Tax and invoice obligations follow the partner terms; review the current terms in your dashboard.',
      ]
  const footer = isTurkish
    ? 'Bu e-posta satış ortaklığı hesabınız etkinleştirildiğinde gönderildi.'
    : 'This email was sent when your referral partner account was activated.'
  const linkMarkup = `<p style="margin:0 0 12px;"><strong>${escape(referralLabel)}</strong><br><a href="${escape(referralLink)}">${escape(referralLink)}</a></p><p style="margin:0 0 12px;"><strong>${escape(dashboardLabel)}</strong><br><a href="${escape(dashboardLink)}">${escape(dashboardLink)}</a></p>`
  const rulesMarkup = `<ul>${rules.map((rule) => `<li style="margin:0 0 8px;">${escape(rule)}</li>`).join('')}</ul>`
  const body = `<p style="margin:0 0 12px;">${escape(intro)}</p>${linkMarkup}<p style="margin:16px 0 8px;"><strong>${escape(isTurkish ? 'Kısa şartlar' : 'Key terms')}</strong></p>${rulesMarkup}`
  const text = [
    intro,
    `${referralLabel}: ${referralLink}`,
    `${dashboardLabel}: ${dashboardLink}`,
    '',
    `${isTurkish ? 'Kısa şartlar' : 'Key terms'}:`,
    ...rules.map((rule) => `- ${rule}`),
  ].join('\n')

  return {
    subject: title,
    html: renderEmailLayout({ lang, previewText: title, title, body, footer }),
    text: renderEmailPlainText(title, text, footer),
  }
}
