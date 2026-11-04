import { escape, renderEmailLayout, renderEmailPlainText, renderTable, type EmailLang } from './layout'

export type ReferralPartnerActivationNotice = {
  lang: EmailLang
  referralCode: string
  activatedAt: string
}

export function buildReferralPartnerActivationAdminEmail({
  lang,
  referralCode,
  activatedAt,
}: ReferralPartnerActivationNotice) {
  const title = lang === 'tr'
    ? 'Yeni satış ortağı etkinleştirildi'
    : 'New referral partner activated'
  const intro = lang === 'tr'
    ? 'Yeni bir satış ortağı yönlendirme programına katıldı.'
    : 'A new partner joined the referral program.'
  const date = Number.isFinite(Date.parse(activatedAt))
    ? new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(activatedAt))
    : activatedAt
  const codeLabel = lang === 'tr' ? 'Yönlendirme kodu' : 'Referral code'
  const dateLabel = lang === 'tr' ? 'Etkinleştirme tarihi (UTC)' : 'Activation date (UTC)'
  const footer = lang === 'tr'
    ? 'Bu otomatik bir yönetim bildirimidir.'
    : 'This is an automated admin notification.'
  const body = `<p style="margin:0 0 12px;">${escape(intro)}</p>${renderTable([
    [codeLabel, referralCode],
    [dateLabel, date],
  ])}`

  return {
    subject: title,
    html: renderEmailLayout({ lang, previewText: title, title, body, footer }),
    text: renderEmailPlainText(
      title,
      `${intro}\n\n${codeLabel}: ${referralCode}\n${dateLabel}: ${date}`,
      footer,
    ),
  }
}
