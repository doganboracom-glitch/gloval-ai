import { describe, expect, it } from 'vitest'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { applyOperation } from '@/lib/website-edit-operations'
import { contactSectionCopy, ensureContactSection, hasContactSection } from '@/lib/contact-section'

const PROMPTS = [
  'diş kliniği web sitesi',
  'restoran ve kafe',
  'avukatlık bürosu',
  'mimarlık ofisi',
  'güzellik salonu',
  'yazılım ve teknoloji şirketi',
  'online mağaza e-ticaret',
  'fotoğrafçı portfolyo',
  'oto galeri araç satış',
  'emlak danışmanlığı',
  'genel bir iş sitesi',
]

function contacts(site: Pick<WebsiteSchema, 'sections'>) {
  return site.sections.filter((s) => s.type === 'contact')
}

describe('ensureContactSection', () => {
  it.each(PROMPTS)('ships exactly one contact section before the footer: %s', (prompt) => {
    for (const lang of ['tr', 'en'] as const) {
      const site = ensureContactSection(fallbackWebsite(prompt, lang))
      expect(contacts(site)).toHaveLength(1)
      const contactIndex = site.sections.findIndex((s) => s.type === 'contact')
      const footerIndex = site.sections.findIndex((s) => s.type === 'footer')
      if (footerIndex !== -1) expect(contactIndex).toBeLessThan(footerIndex)
    }
  })

  it('adds an empty contact section before the footer when missing', () => {
    const base = fallbackWebsite('yazılım şirketi', 'tr')
    const without = {
      ...base,
      sections: base.sections.filter((s) => s.type !== 'contact'),
    }
    const result = ensureContactSection(without)
    expect(hasContactSection(without)).toBe(false)
    expect(hasContactSection(result)).toBe(true)
    expect(result.sections.at(-1)?.type).toBe('footer')
    expect(result.sections.at(-2)?.type).toBe('contact')
    expect(result.sections).toHaveLength(without.sections.length + 1)
  })

  it('appends when there is no footer', () => {
    const base = fallbackWebsite('restoran', 'en')
    const noFooterNoContact = {
      ...base,
      sections: base.sections.filter((s) => s.type !== 'contact' && s.type !== 'footer'),
    }
    const result = ensureContactSection(noFooterNoContact)
    expect(result.sections.at(-1)?.type).toBe('contact')
  })

  it('leaves a site that already has a contact section untouched, hidden or not', () => {
    const site = fallbackWebsite('avukat', 'tr')
    expect(ensureContactSection(site)).toBe(site)
    const hidden = {
      ...site,
      sections: site.sections.map((s) => (s.type === 'contact' ? { ...s, hidden: true } : s)),
    }
    expect(ensureContactSection(hidden)).toBe(hidden)
  })

  it('does not mutate its input', () => {
    const base = fallbackWebsite('teknoloji', 'tr')
    const without = { ...base, sections: base.sections.filter((s) => s.type !== 'contact') }
    const before = without.sections.length
    ensureContactSection(without)
    expect(without.sections).toHaveLength(before)
  })

  it('creates the section in the site language', () => {
    const base = fallbackWebsite('teknoloji', 'en')
    const without = { ...base, sections: base.sections.filter((s) => s.type !== 'contact') }
    const sections: Section[] = ensureContactSection(without).sections
    const contact = sections.find((s) => s.type === 'contact')
    expect(contact && 'title' in contact ? contact.title : '').toBe('Contact')
  })
})

describe('editor suggestion', () => {
  it('shows only while the contact section is missing', () => {
    const base = fallbackWebsite('teknoloji', 'tr')
    const without = { ...base, sections: base.sections.filter((s) => s.type !== 'contact') }
    expect(hasContactSection(without)).toBe(false)
    expect(hasContactSection(fallbackWebsite('avukatlık bürosu', 'tr'))).toBe(true)
  })

  it('one-click add inserts the contact section before the footer and hides the suggestion', () => {
    const base = fallbackWebsite('teknoloji', 'tr')
    const without = { ...base, sections: base.sections.filter((s) => s.type !== 'contact') }
    const next = applyOperation(without, { op: 'addSection', sectionType: 'contact' })
    expect(hasContactSection(next)).toBe(true)
    expect(next.sections.at(-1)?.type).toBe('footer')
    expect(next.sections.at(-2)?.type).toBe('contact')
  })

  it('has Turkish and English copy including the delete warning', () => {
    expect(contactSectionCopy('tr').removeWarning).toMatch(/gizleyebilirsiniz/)
    expect(contactSectionCopy('en').removeWarning).toMatch(/hide/)
    expect(contactSectionCopy('tr').suggestionText).not.toBe(contactSectionCopy('en').suggestionText)
  })
})
