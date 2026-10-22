import { describe, expect, it } from 'vitest'
import { addContactToMenu, findContactMenuGap } from '@/lib/site-menu'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

function onePageSite(): WebsiteSchema {
  const site = fallbackWebsite('Bir restoran sitesi', 'tr')
  site.pages = [{ slug: 'home', title: 'Ana Sayfa', isHome: true } as WebsiteSchema['pages'][number]]
  if (!site.sections.some((s) => s.type === 'contact')) {
    site.sections.push({ type: 'contact' } as WebsiteSchema['sections'][number])
  }
  site.navigation.links = [{ label: 'Hakkımızda', href: '#about' }]
  return site
}

describe('contact in the header menu', () => {
  it('finds the gap on a one-page site that has a contact section but no link', () => {
    expect(findContactMenuGap(onePageSite())).toEqual({ kind: 'link' })
  })

  it('adds the contact anchor exactly once', () => {
    const fixed = addContactToMenu(onePageSite(), 'tr')
    expect(fixed.navigation.links.at(-1)).toEqual({ label: 'İletişim', href: '#contact' })
    expect(findContactMenuGap(fixed)).toBeNull()
    expect(addContactToMenu(fixed, 'tr')).toBe(fixed)
  })

  it('does nothing when a contact link already exists', () => {
    const site = onePageSite()
    site.navigation.links.push({ label: 'İletişim', href: '#contact' })
    expect(findContactMenuGap(site)).toBeNull()
  })

  it('does nothing without a contact section', () => {
    const site = onePageSite()
    site.sections = site.sections.filter((s) => s.type !== 'contact')
    expect(findContactMenuGap(site)).toBeNull()
  })

  it('respects the owner switching the contact page off', () => {
    const site = onePageSite()
    site.pages = [
      { slug: 'home', title: 'Ana Sayfa', isHome: true },
      { slug: 'iletisim', title: 'İletişim', showInHeader: false },
    ] as WebsiteSchema['pages']
    expect(findContactMenuGap(site)).toBeNull()
  })

  it('accepting writes the link and closes the suggestion; dismissing leaves links alone', () => {
    const accepted = applyOperation(onePageSite(), { op: 'resolveContactSuggestion', accept: true, lang: 'tr' })
    expect(accepted.navigation.links.some((l) => l.href === '#contact')).toBe(true)
    expect(accepted.navigation.contactSuggestionDismissed).toBe(true)

    const before = onePageSite()
    const dismissed = applyOperation(before, { op: 'resolveContactSuggestion', accept: false })
    expect(dismissed.navigation.links).toEqual(before.navigation.links)
    expect(dismissed.navigation.contactSuggestionDismissed).toBe(true)
  })
})
