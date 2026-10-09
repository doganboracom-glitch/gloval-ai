import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

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
    expect(tr).toContain('Posta kutunuz hazır')
    expect(tr).toContain('Webmail’i aç')
    expect(tr).toContain(`href="${WEBMAIL}"`)
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
    expect(tr).toContain('#A36FFA')
    expect(tr).toContain('max-width:600px')
    expect(tr).toContain('Giriş yapamıyorum')
  })

  it('renders the English template', () => {
    expect(en).toContain('<html lang="en">')
    expect(en).toContain('Your mailbox is ready')
    expect(en).toContain('Open webmail')
    expect(en).toContain('This email was sent by GLOVAL AI because the info@firma.com mailbox was created.')
    expect(en).not.toContain('Posta kutunuz hazır')
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
