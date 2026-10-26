import { describe, expect, it } from 'vitest'
import { buildLifecycleCopy, firstNameOf, lifecycleCopyToText } from '@/lib/email/lifecycle-copy'

const base = { dashboardUrl: 'https://gloval.ai/dashboard', supportEmail: 'support@gloval.ai' }

describe('lifecycle email copy', () => {
  it('welcomes by first name in Turkish with the gift credits', () => {
    const copy = buildLifecycleCopy({ kind: 'account_welcome', lang: 'tr', name: 'Ayşe', ...base })
    expect(copy.subject).toBe("GLOVAL AI'a hoş geldin, Ayşe")
    expect(copy.paragraphs[0]).toBe('Hesabın hazır. 50 yapay zekâ kredin tanımlandı (tek seferlik hediye).')
    expect(copy.steps?.items).toHaveLength(3)
  })

  it('drops the name from the subject when it is unknown, in both languages', () => {
    expect(buildLifecycleCopy({ kind: 'account_welcome', lang: 'tr', name: '', ...base }).subject).toBe(
      "GLOVAL AI'a hoş geldin",
    )
    expect(buildLifecycleCopy({ kind: 'account_welcome', lang: 'en', name: 'Sam', ...base }).subject).toBe(
      'Welcome to GLOVAL AI, Sam',
    )
  })

  it('keeps names on one line so they cannot inject headers', () => {
    expect(firstNameOf('Ayşe\r\nBcc: x@y.com Yılmaz')).toBe('Ayşe')
    expect(firstNameOf(42)).toBe('')
  })

  it('links the live site in the first-publish email', () => {
    const copy = buildLifecycleCopy({
      kind: 'project_first_published',
      lang: 'en',
      name: '',
      siteName: 'Bakery',
      siteUrl: 'https://bakery.gloval.site',
      ...base,
    })
    expect(copy.subject).toBe('Your site is live: Bakery')
    expect(copy.cta.href).toBe('https://bakery.gloval.site')
    expect(lifecycleCopyToText(copy)).toContain('https://bakery.gloval.site')
  })

  it('points the unpublish email at the dashboard and support', () => {
    const copy = buildLifecycleCopy({
      kind: 'project_unpublished',
      lang: 'tr',
      name: '',
      siteName: 'Fırın',
      siteUrl: 'https://firin.gloval.site',
      ...base,
    })
    expect(copy.cta.href).toBe(base.dashboardUrl)
    expect(copy.paragraphs.join(' ')).toContain('support@gloval.ai')
  })
})
