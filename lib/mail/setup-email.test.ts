import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getMailSetupCopy } from '@/components/mail/setup-copy'
import { mailSetupSubject, renderMailSetupHtml, renderMailSetupText } from './setup-email'

const ADDRESS = 'info@firma.com'
const WEBMAIL = 'https://mailserver.gloval.ai/SOGo/'
const HOST = 'mailserver.gloval.ai'
const SECRET = 'S3cr3t-Pass!'

describe('mailbox setup email', () => {
  const tr = renderMailSetupHtml('tr', ADDRESS, WEBMAIL, HOST)
  const en = renderMailSetupHtml('en', ADDRESS, WEBMAIL, HOST)

  it('renders the Turkish template with required content', () => {
    expect(tr).toContain('<html lang="tr">')
    expect(tr).toContain('Posta kutusu ayarları')
    expect(tr).toContain(HOST)
    expect(tr).toContain('993')
    expect(tr).toContain('465')
    expect(tr).toContain('587 / STARTTLS')
    expect(tr).toContain('SSL/TLS')
    expect(tr.toLowerCase()).toContain('posta kutusu şifreniz')
    expect(tr).toContain('Bu e-posta info@firma.com posta kutusu oluşturulduğu için GLOVAL AI tarafından gönderildi.')
    expect(tr).toContain('alt="GLOVAL AI"')
    expect(tr).toContain('https://gloval.ai/logo.png')
    expect(tr).toContain('#0f0d14')
    expect(tr).toContain('max-width:600px')
  })

  it('renders the English template', () => {
    expect(en).toContain('<html lang="en">')
    expect(en).toContain('Mailbox settings')
    expect(en).toContain('This email was sent by GLOVAL AI because the info@firma.com mailbox was created.')
    expect(en).not.toContain('Posta kutunuz hazır')
  })

  const removed = {
    tr: ['Posta kutunuz hazır</h1>', 'Giriş yapamıyorum', 'Destek sayfamız', 'Hâlâ giriş yapamıyorsanız', 'Webmail’i aç', '/support'],
    en: ['Your mailbox is ready</h1>', 'Cannot sign in?', 'our support page', 'If you still cannot sign in', 'Open webmail', '/support'],
  }
  const visible = (html: string) => html.replace(/<div style="display:none[^>]*>.*?<\/div>/, '')

  it.each(['tr', 'en'] as const)('drops the intro block, help section and webmail button (%s)', (lang) => {
    const html = lang === 'tr' ? tr : en
    const text = renderMailSetupText(lang, ADDRESS, WEBMAIL, HOST)
    const copy = getMailSetupCopy(lang)
    for (const phrase of removed[lang]) {
      expect(html).not.toContain(phrase)
      expect(text).not.toContain(phrase)
    }
    expect(html).not.toContain('<h1')
    expect(visible(html)).not.toContain(copy.greeting)
    expect(text).not.toContain(copy.greeting)
    expect(text.startsWith(copy.settingsTitle)).toBe(true)
    // The first visible heading after the header band is the settings section.
    expect(visible(html).split('<h2')[1]).toContain(copy.settingsTitle)
  })

  it.each(['tr', 'en'] as const)('keeps the greeting only as the preheader (%s)', (lang) => {
    const html = lang === 'tr' ? tr : en
    expect(html.split(getMailSetupCopy(lang).greeting).length - 1).toBe(1)
  })

  it.each(['tr', 'en'] as const)('shows the webmail address as a clickable link in the browser card (%s)', (lang) => {
    const html = lang === 'tr' ? tr : en
    const text = renderMailSetupText(lang, ADDRESS, WEBMAIL, HOST)
    const copy = getMailSetupCopy(lang)
    expect(html).toContain(`<a class="link" href="${WEBMAIL}" style="color:#6d43bd;text-decoration:underline;">${WEBMAIL}</a>`)
    expect(html.indexOf(copy.browser)).toBeLessThan(html.indexOf(`href="${WEBMAIL}"`))
    expect(html.split(`href="${WEBMAIL}"`).length - 1).toBe(1)
    expect(text).toContain(`${copy.browser}\n1. ${copy.browserLead} ${WEBMAIL} ${copy.browserRest}`)
  })

  it('escapes a custom webmail address in the link', () => {
    const html = renderMailSetupHtml('tr', ADDRESS, 'https://x.test/a?b=1&c="2"', HOST)
    expect(html).toContain('href="https://x.test/a?b=1&amp;c=&quot;2&quot;"')
  })

  it('treats an unknown language as Turkish', () => {
    expect(renderMailSetupHtml('xx??', ADDRESS, WEBMAIL, HOST)).toContain('<html lang="tr">')
  })

  it('never includes a password or a tracking pixel', () => {
    for (const html of [tr, en]) {
      expect(html).not.toContain(SECRET)
      expect(html).not.toMatch(/<img[^>]+(width="1"|height="1")/)
      expect(html.match(/<img /g)?.length).toBe(1)
    }
  })

  it('escapes the address in HTML', () => {
    const html = renderMailSetupHtml('tr', 'a"<b>@x.com', WEBMAIL, HOST)
    expect(html).not.toContain('<b>@x.com')
    expect(html).toContain('a&quot;&lt;b&gt;@x.com')
  })

  it('provides a plain text version with the key details', () => {
    const text = renderMailSetupText('tr', ADDRESS, WEBMAIL, HOST)
    expect(text.length).toBeGreaterThan(200)
    expect(text).not.toContain('<')
    expect(text).toContain(HOST)
    expect(text).toContain(WEBMAIL)
    expect(text).toContain('993')
    expect(text).toContain('Posta kutusu şifreniz')
    expect(text).toContain('Bu e-posta info@firma.com')
    expect(text).not.toContain(SECRET)
  })

  it('writes the subject in the selected language', () => {
    expect(mailSetupSubject('tr', ADDRESS)).toBe(`${ADDRESS} posta kutunuz hazır: telefonunuza ve bilgisayarınıza nasıl eklersiniz?`)
    expect(mailSetupSubject('en', ADDRESS)).toBe(`Your mailbox ${ADDRESS} is ready: how to add it to your phone and computer`)
    expect(mailSetupSubject('fr', ADDRESS)).toBe(mailSetupSubject('en', ADDRESS))
    expect(mailSetupSubject('tr', ADDRESS, 'resend')).toBe(`${ADDRESS} posta kutusu kurulum bilgileri`)
    expect(mailSetupSubject('en', ADDRESS, 'resend')).toBe(`Setup instructions for ${ADDRESS}`)
  })
})
