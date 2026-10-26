import { describe, expect, it } from 'vitest'
import { buildLifecycleCopy, firstNameOf, lifecycleCopyToText } from '@/lib/email/lifecycle-copy'

const base = { dashboardUrl: 'https://gloval.ai/dashboard', supportEmail: 'support@gloval.ai' }

describe('lifecycle email copy', () => {
  it('welcomes by first name in Turkish with the gift credits and FREE limits', () => {
    const copy = buildLifecycleCopy({ kind: 'account_welcome', lang: 'tr', name: 'Ayşe', ...base })
    expect(copy.subject).toBe("GLOVAL AI'a hoş geldin, Ayşe")
    expect(copy.paragraphs[0]).toBe('Hesabın hazır. 50 yapay zekâ kredin tanımlandı (tek seferlik hediye).')
    expect(copy.paragraphs[1]).toContain('1 site ve 5 sayfa')
    expect(copy.paragraphs[1]).toContain('adin.gloval.site')
    expect(copy.cta).toEqual({ label: 'Sitemi düzenle', href: base.dashboardUrl })
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

  const published = {
    kind: 'project_first_published' as const,
    lang: 'en' as const,
    name: '',
    siteName: 'Bakery',
    siteUrl: 'https://bakery.gloval.site',
    ...base,
  }

  it('links the live site in the first-publish email', () => {
    const copy = buildLifecycleCopy(published)
    expect(copy.subject).toBe('Your site is live: Bakery')
    expect(copy.cta.href).toBe('https://bakery.gloval.site')
    expect(lifecycleCopyToText(copy)).toContain('https://bakery.gloval.site')
  })

  it('suggests the plans softly to a FREE owner and the domain screen to a paid one', () => {
    expect(buildLifecycleCopy({ ...published, plan: 'free' }).note?.href).toBe('https://gloval.ai/billing')
    expect(buildLifecycleCopy(published).note?.href).toBe('https://gloval.ai/billing')
    expect(buildLifecycleCopy({ ...published, plan: 'paid' }).note?.href).toBe('https://gloval.ai/dashboard/domains')
  })

  it('says the content is kept and can be republished when a site is unpublished', () => {
    const copy = buildLifecycleCopy({
      kind: 'project_unpublished',
      lang: 'tr',
      name: '',
      siteName: 'Fırın',
      siteUrl: 'https://firin.gloval.site',
      ...base,
    })
    expect(copy.subject).toBe('Siteniz yayından kaldırıldı: Fırın')
    expect(copy.cta).toEqual({ label: 'Siteyi aç', href: base.dashboardUrl })
    expect(copy.paragraphs.join(' ')).toContain('saklanıyor')
    expect(copy.paragraphs.join(' ')).toContain('tekrar yayınlayabilirsin')
    expect(copy.paragraphs.join(' ')).toContain('support@gloval.ai')
  })
})
