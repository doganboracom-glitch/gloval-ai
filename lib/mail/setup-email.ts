import 'server-only'

import { getMailSetupCopy } from '@/components/mail/setup-copy'
import {
  escape,
  mailSetupFooter,
  renderEmailLayout,
  renderEmailPlainText,
  renderSection,
  renderStepCard,
  renderSupportUrl,
  renderTable,
} from '@/lib/email/layout'
import { resolveEmailLang } from '@/lib/email/lang'

const IMAP_PORT = '993'
const SMTP_PORT = '465'

function settingsRows(lang: 'tr' | 'en', address: string, host: string): Array<[string, string]> {
  const c = getMailSetupCopy(lang)
  return [
    [c.username, address],
    [c.password, c.passwordValue],
    [c.incomingRow, `${host} / ${IMAP_PORT} / SSL/TLS`],
    [c.outgoingRow, `${host} / ${SMTP_PORT} / SSL/TLS`],
    [c.alternativeRow, c.alternativeValue],
  ]
}

export function renderMailSetupHtml(lang: string, address: string, webmail: string, host: string) {
  const l = resolveEmailLang(lang)
  const c = getMailSetupCopy(l)
  const supportUrl = renderSupportUrl()
  const body = [
    `<p style="margin:0 0 4px;">${escape(c.greeting)}</p>`,
    renderSection(c.settingsTitle, renderTable(settingsRows(l, address, host))),
    `<p style="margin:0;font-size:13px;">${escape(c.passwordNote)}</p>`,
    renderSection(c.appsTitle, ''),
    renderStepCard(c.android, c.androidSteps),
    renderStepCard(c.iphone, c.iphoneSteps),
    renderStepCard(c.outlook, c.outlookSteps),
    renderStepCard(c.browser, [c.browserText]),
    renderSection(c.helpTitle, `<p style="margin:0;">${escape(c.help)} ${escape(c.supportLead)} <a class="link" href="${escape(supportUrl)}" style="color:#6d43bd;text-decoration:underline;">${escape(c.supportText)}</a>.</p>`),
  ].join('')

  return renderEmailLayout({
    lang: l,
    previewText: c.greeting,
    title: c.heading,
    body,
    cta: { label: c.openWebmail, href: webmail },
    footer: mailSetupFooter(l, address),
  })
}

export function renderMailSetupText(lang: string, address: string, webmail: string, host: string) {
  const l = resolveEmailLang(lang)
  const c = getMailSetupCopy(l)
  const rows = settingsRows(l, address, host).map(([label, value]) => `${label}: ${value}`).join('\n')
  const steps = (title: string, list: readonly string[]) => `${title}\n${list.map((step, i) => `${i + 1}. ${step}`).join('\n')}`
  const content = [
    c.greeting,
    `${c.openWebmail}: ${webmail}`,
    `${c.settingsTitle}\n${rows}`,
    c.passwordNote,
    steps(c.android, c.androidSteps),
    steps(c.iphone, c.iphoneSteps),
    steps(c.outlook, c.outlookSteps),
    `${c.browser}\n${c.browserText}`,
    `${c.helpTitle}\n${c.help} ${c.supportLead} ${renderSupportUrl()}`,
  ].join('\n\n')
  return renderEmailPlainText(c.heading, content, mailSetupFooter(l, address))
}

export function mailSetupSubject(lang: string, address: string, kind: 'created' | 'resend' = 'created') {
  const c = getMailSetupCopy(resolveEmailLang(lang))
  return kind === 'resend' ? c.resendSubject(address) : c.subject(address)
}
