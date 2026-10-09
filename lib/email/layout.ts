import 'server-only'

export type EmailLayoutOptions = {
  lang: 'tr' | 'en'
  previewText: string
  title: string
  body: string
  cta?: { label: string; href: string }
  footer: string
  supportUrl: string
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function renderEmailLayout({ lang, previewText, title, body, cta, footer, supportUrl }: EmailLayoutOptions) {
  const button = cta ? `<a href="${escape(cta.href)}" style="display:inline-block;background:#A36FFA;color:#0f0d14;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px;">${escape(cta.label)}</a>` : ''
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escape(title)}</title></head><body style="margin:0;background:#f4f1f8;color:#241f2b;font-family:Arial,Helvetica,sans-serif;line-height:1.55;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(previewText)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1f8;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;"><tr><td style="background:#0f0d14;padding:22px 28px;"><a href="https://gloval.ai" style="color:#ffffff;text-decoration:none;font-weight:800;letter-spacing:.08em;font-size:18px;"><img src="https://gloval.ai/logo.png" width="160" alt="GLOVAL AI" style="display:block;width:160px;max-width:100%;height:auto;"><span style="display:block;color:#ffffff;margin-top:6px;font-size:13px;letter-spacing:.12em;">GLOVAL AI</span></a></td></tr><tr><td style="padding:32px 28px 24px;"><h1 style="margin:0 0 12px;color:#0f0d14;font-size:26px;line-height:1.2;">${escape(title)}</h1>${body}${button ? `<p style="margin:26px 0 4px;">${button}</p>` : ''}</td></tr><tr><td style="padding:20px 28px;border-top:1px solid #e7e1ee;color:#6b6473;font-size:12px;">${escape(footer)}<br><a href="${escape(supportUrl)}" style="color:#6d43bd;text-decoration:underline;">gloval.ai</a></td></tr></table></td></tr></table></body></html>`
}

export { escape }

export function renderTable(rows: Array<[string, string]>) { return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e7e1ee;border-radius:10px;margin:22px 0;overflow:hidden;">${rows.map(([label, value]) => `<tr><td style="padding:10px 12px;border-bottom:1px solid #e7e1ee;color:#6b6473;font-weight:700;width:38%;">${escape(label)}</td><td style="padding:10px 12px;border-bottom:1px solid #e7e1ee;color:#241f2b;">${escape(value)}</td></tr>`).join('')}</table>` }

export function renderStepCard(title: string, steps: readonly string[]) { return `<section style="margin:22px 0;padding:16px 18px;background:#faf8fc;border:1px solid #e7e1ee;border-radius:10px;"><h2 style="margin:0 0 8px;font-size:17px;color:#0f0d14;">${escape(title)}</h2><ol style="margin:0;padding-left:22px;">${steps.map((step) => `<li style="margin:6px 0;">${escape(step)}</li>`).join('')}</ol></section>` }

export function renderEmailPlainText(title: string, content: string, footer: string) { return `${title}\n\n${content}\n\n${footer}\nhttps://gloval.ai` }

export function renderSupportUrl() { return `${process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://gloval.ai'}/dashboard/support` }

export function renderMailSetupLayout(input: { lang: 'tr' | 'en'; title: string; intro: string; buttonLabel: string; webmail: string; body: string; footer: string }) { return renderEmailLayout({ lang: input.lang, previewText: input.intro, title: input.title, body: `<p style="margin:0 0 8px;">${escape(input.intro)}</p>${input.body}`, cta: { label: input.buttonLabel, href: input.webmail }, footer: input.footer, supportUrl: renderSupportUrl() }) }

export function mailSetupFooter(lang: 'tr' | 'en', address: string) { return lang === 'tr' ? `Bu e-posta ${address} posta kutusu oluşturulduğu için GLOVAL AI tarafından gönderildi.` : `This email was sent by GLOVAL AI because the ${address} mailbox was created.` }

export function isSupportedEmailLang(value: unknown): value is 'tr' | 'en' { return value === 'tr' || value === 'en' }

export function resolveMailSetupLang(value: unknown): 'tr' | 'en' { if (value == null || value === '') return 'tr'; return value === 'tr' ? 'tr' : value === 'en' ? 'en' : 'en' }
