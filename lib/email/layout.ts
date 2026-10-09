import 'server-only'

import { resolveEmailLang, type EmailLang } from './lang'

export type { EmailLang }

const SITE_URL = 'https://gloval.ai'
const LOGO_URL = `${SITE_URL}/logo.png`

export type EmailLayoutOptions = {
  lang: EmailLang
  previewText: string
  title: string
  body: string
  /** Omit the visible heading; `title` is still used for the document <title>. */
  hideHeading?: boolean
  cta?: { label: string; href: string }
  footer: string
  /** Target of the small brand link in the footer. */
  homeUrl?: string
}

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

// Mobile spacing plus a dark-mode variant for clients that honour the media
// queries. Every colour is also set inline, so clients that strip <style> still
// render a complete light layout.
const STYLES = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
@media only screen and (max-width:620px){
.px{padding-left:18px!important;padding-right:18px!important}
.outer{padding:12px 6px!important}
.h1{font-size:24px!important}
.cell-label,.cell-value{display:block!important;width:100%!important;box-sizing:border-box}
.cell-label{padding-bottom:0!important;border-bottom:0!important}
}
@media (prefers-color-scheme:dark){
.page{background:#0f0d14!important}
.card{background:#1a1722!important}
.h-text{color:#f4f1f8!important}
.b-text{color:#e4deec!important}
.muted{color:#b3abc0!important}
.panel{background:#221e2c!important;border-color:#3a3347!important}
.cell-label{color:#b3abc0!important;border-color:#3a3347!important}
.cell-value{color:#f4f1f8!important;border-color:#3a3347!important}
.link{color:#c9a8ff!important}
.rule{border-color:#3a3347!important}
}`

export function renderEmailLayout({ lang, previewText, title, body, hideHeading = false, cta, footer, homeUrl = SITE_URL }: EmailLayoutOptions) {
  const heading = hideHeading
    ? ''
    : `<h1 class="h1 h-text" style="margin:0 0 12px;color:#0f0d14;font-size:26px;line-height:1.2;">${escape(title)}</h1>`
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 4px;"><tr><td style="background:#A36FFA;border-radius:8px;"><a href="${escape(cta.href)}" style="display:inline-block;background:#A36FFA;color:#0f0d14;text-decoration:none;font-weight:700;font-size:16px;line-height:20px;padding:14px 24px;border-radius:8px;">${escape(cta.label)}</a></td></tr></table>`
    : ''
  const filler = '&#847;&zwnj;&nbsp;'.repeat(40)
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="x-apple-disable-message-reformatting"><title>${escape(title)}</title><style>${STYLES}</style></head><body class="page" style="margin:0;padding:0;background:#f4f1f8;color:#241f2b;font-family:Arial,Helvetica,sans-serif;line-height:1.55;-webkit-text-size-adjust:100%;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escape(previewText)}${filler}</div><table role="presentation" class="page outer" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f8;padding:24px 12px;"><tr><td align="center"><table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;"><tr><td class="px" style="background:#0f0d14;padding:22px 28px;"><a href="${escape(homeUrl)}" style="color:#ffffff;text-decoration:none;font-weight:800;letter-spacing:.08em;font-size:18px;"><img src="${LOGO_URL}" width="160" alt="GLOVAL AI" style="display:block;width:160px;max-width:100%;height:auto;border:0;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.08em;"><span style="display:block;color:#d9d2e6;margin-top:6px;font-size:12px;letter-spacing:.14em;">GLOVAL AI</span></a></td></tr><tr><td class="px" style="padding:32px 28px 24px;">${heading}<div class="b-text" style="color:#241f2b;font-size:15px;">${body}</div>${button}</td></tr><tr><td class="px rule muted" style="padding:20px 28px;border-top:1px solid #e7e1ee;color:#6b6473;font-size:13px;line-height:1.5;">${escape(footer)}<br><a class="link" href="${escape(homeUrl)}" style="color:#6d43bd;text-decoration:underline;">gloval.ai</a></td></tr></table></td></tr></table></body></html>`
}

export { escape }

export function renderTable(rows: Array<[string, string]>) {
  const last = rows.length - 1
  return `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8fc;border:1px solid #e7e1ee;border-radius:10px;margin:22px 0;">${rows
    .map(([label, value], index) => {
      const border = index === last ? '' : 'border-bottom:1px solid #e7e1ee;'
      return `<tr><td class="cell-label muted" style="padding:10px 14px;${border}color:#6b6473;font-weight:700;width:38%;vertical-align:top;font-size:14px;">${escape(label)}</td><td class="cell-value" style="padding:10px 14px;${border}color:#241f2b;font-size:14px;vertical-align:top;word-break:break-word;">${escape(value)}</td></tr>`
    })
    .join('')}</table>`
}

/** A step is plain text (escaped) or pre-escaped trusted HTML. */
export type EmailStep = string | { html: string }

export function renderStepCard(title: string, steps: readonly EmailStep[]) {
  return `<table role="presentation" class="panel" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;background:#faf8fc;border:1px solid #e7e1ee;border-radius:10px;"><tr><td style="padding:16px 18px;"><h2 class="h-text" style="margin:0 0 8px;font-size:17px;line-height:1.3;color:#0f0d14;">${escape(title)}</h2><ol style="margin:0;padding-left:22px;">${steps
    .map((step) => `<li style="margin:6px 0;">${typeof step === 'string' ? escape(step) : step.html}</li>`)
    .join('')}</ol></td></tr></table>`
}

export function renderSection(title: string, content: string) {
  return `<h2 class="h-text" style="margin:28px 0 8px;font-size:18px;line-height:1.3;color:#0f0d14;">${escape(title)}</h2>${content}`
}

export function renderEmailPlainText(title: string, content: string, footer: string) {
  const head = title ? `${title}\n\n` : ''
  return `${head}${content}\n\n${footer}\n${SITE_URL}`
}

export function mailSetupFooter(lang: EmailLang, address: string) {
  return lang === 'tr'
    ? `Bu e-posta ${address} posta kutusu oluşturulduğu için GLOVAL AI tarafından gönderildi.`
    : `This email was sent by GLOVAL AI because the ${address} mailbox was created.`
}

export function isSupportedEmailLang(value: unknown): value is EmailLang {
  return value === 'tr' || value === 'en'
}

export function resolveMailSetupLang(value: unknown): EmailLang {
  return resolveEmailLang(value)
}
