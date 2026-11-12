import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { DRAFT_REMINDER_KINDS } from './core'
import { buildDraftReminderEmail } from './template'

const base = {
  projectId: 'proj-1',
  isEcommerce: false,
  unsubscribeUrl: 'https://gloval.ai/api/draft-reminders/unsubscribe?token=abc',
}

describe('draft reminder email', () => {
  it.each(DRAFT_REMINDER_KINDS)('renders %s in both languages with editor, support and opt-out links', (kind) => {
    for (const lang of ['tr', 'en'] as const) {
      const mail = buildDraftReminderEmail({ ...base, kind, lang })
      expect(mail.subject.length).toBeGreaterThan(5)
      expect(mail.html).toContain('/editor/proj-1')
      expect(mail.html).toContain(`utm_content=${kind}`)
      expect(mail.html).toContain('/support/new')
      expect(mail.html).toContain('draft-reminders/unsubscribe')
      expect(mail.text).toContain('draft-reminders/unsubscribe')
    }
  })

  it('adds the e-commerce package note only for stores', () => {
    const store = buildDraftReminderEmail({ ...base, kind: 'd7', lang: 'tr', isEcommerce: true })
    const site = buildDraftReminderEmail({ ...base, kind: 'd7', lang: 'tr' })
    expect(store.html).toContain('E-Ticaret paketi')
    expect(site.html).not.toContain('E-Ticaret paketi')
  })

  it('places the opt-out link in the footer, below the footer text and above the brand link', () => {
    for (const lang of ['tr', 'en'] as const) {
      const { html, text } = buildDraftReminderEmail({ ...base, kind: 'd7', lang })
      const stop = html.indexOf('draft-reminders/unsubscribe')
      const footerText = html.indexOf(lang === 'tr' ? 'hizmet bildirimidir' : 'service notice')
      const brand = html.indexOf('>gloval.ai</a>')
      const secondaryCta = html.indexOf('/support/new')
      expect(secondaryCta).toBeGreaterThan(-1)
      expect(stop).toBeGreaterThan(secondaryCta)
      expect(stop).toBeGreaterThan(footerText)
      expect(stop).toBeLessThan(brand)
      expect(text.trimEnd().split('\n').at(-1)).toContain(base.unsubscribeUrl)
    }
  })

  it('escapes the opt-out URL and keeps the final reminder wording honest', () => {
    const mail = buildDraftReminderEmail({ ...base, kind: 'm12', lang: 'en', unsubscribeUrl: 'https://x.test/?a=1&b="2"' })
    expect(mail.html).toContain('a=1&amp;b=&quot;2&quot;')
    expect(mail.html).toContain('last reminder')
  })
})
