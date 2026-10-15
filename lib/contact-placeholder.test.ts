import { describe, expect, it } from 'vitest'
import { flagPlaceholderContact } from '@/lib/contact-section'
import { collectSampleFindings, stripSampleContent } from '@/lib/sample-content'
import { resolveContactActions, seedContactActions } from '@/lib/site-contact-actions'
import { companyFromSite } from '@/lib/site-legal-templates'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

const PLACEHOLDER_CONTACT = {
  type: 'contact',
  title: 'İletişim',
  email: 'info@ornek.com',
  phone: '+90 532 111 22 33',
  address: 'Örnek Mah. 1. Sk. No:1 İstanbul',
  mapEmbed: 'https://www.google.com/maps/embed?pb=abc',
} as Section

function siteWith(contact: Section): WebsiteSchema {
  const base = fallbackWebsite('kahve dükkanı', 'tr')
  return { ...base, sections: [...base.sections.filter((s) => s.type !== 'contact'), contact] }
}

const contactOf = (site: WebsiteSchema) =>
  site.sections.find((s) => s.type === 'contact') as Extract<Section, { type: 'contact' }>

describe('flagPlaceholderContact', () => {
  it('flags every contact value the owner did not write in the brief', () => {
    const flagged = flagPlaceholderContact(siteWith(PLACEHOLDER_CONTACT), 'kahve dükkanı sitesi yap')
    expect(contactOf(flagged).sampleFields).toEqual(['email', 'phone', 'address', 'mapEmbed'])
  })

  it('keeps values that the brief itself contains', () => {
    const flagged = flagPlaceholderContact(
      siteWith(PLACEHOLDER_CONTACT),
      'telefonum 0532 111 22 33, mail info@ornek.com',
    )
    expect(contactOf(flagged).sampleFields).toEqual(['address', 'mapEmbed'])
  })
})

describe('placeholder contact on the public site', () => {
  const flagged = () => flagPlaceholderContact(siteWith(PLACEHOLDER_CONTACT), 'kahve dükkanı')

  it('lists each placeholder field in the publish findings', () => {
    const [finding] = collectSampleFindings(flagged())
    expect(finding.sectionType).toBe('contact')
    expect(finding.items.map((i) => i.kind)).toEqual(['contact', 'contact', 'contact', 'contact'])
  })

  it('strips placeholder values from the served schema', () => {
    const contact = contactOf(stripSampleContent(flagged()))
    expect(contact.email ?? '').toBe('')
    expect(contact.phone ?? '').toBe('')
    expect(contact.address ?? '').toBe('')
    expect(contact.mapEmbed ?? '').toBe('')
  })

  it('does not dial a placeholder number from the floating buttons', () => {
    const seeded = seedContactActions(flagged())
    expect(resolveContactActions(stripSampleContent(seeded))).toBeNull()
    expect(seeded.contactActions?.phone).toBeUndefined()
  })

  it('keeps a real phone number from the brief active', () => {
    const real = flagPlaceholderContact(siteWith(PLACEHOLDER_CONTACT), 'ara 0532 111 22 33')
    const resolved = resolveContactActions(stripSampleContent(seedContactActions(real)))
    expect(resolved?.phone?.href).toContain('tel:')
  })

  it('never puts placeholder values into legal texts', () => {
    const company = companyFromSite('Kahve', flagged().sections)
    expect(JSON.stringify(company)).not.toContain('ornek.com')
    expect(JSON.stringify(company)).not.toContain('532 111')
  })
})
