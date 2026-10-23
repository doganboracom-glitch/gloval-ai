import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  CONTACT_LOGO_PLATE_BACKGROUND,
  resolveContactLogo,
} from '@/lib/contact-logo'
import { applyOperation } from '@/lib/website-edit-operations'
import { ensureContactSection } from '@/lib/contact-section'
import { fallbackWebsite, websiteSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { ContactSection } from '@/components/website-renderer/sections/contact-section'

type ContactData = Extract<Section, { type: 'contact' }>

const withLogo = (): WebsiteSchema => {
  const site = ensureContactSection(fallbackWebsite('diş kliniği', 'tr'))
  return {
    ...site,
    navigation: {
      ...site.navigation,
      logo: { src: 'https://cdn.example.com/logo.png', alt: 'Logo', width: 200, height: 50 },
    },
  } as WebsiteSchema
}

const contactOf = (site: WebsiteSchema): { index: number; data: ContactData } => {
  const index = site.sections.findIndex((s) => s.type === 'contact')
  const data = site.sections[index]
  if (!data || data.type !== 'contact') throw new Error('no contact section')
  return { index, data }
}

const html = (site: WebsiteSchema) =>
  renderToStaticMarkup(createElement(ContactSection, { data: contactOf(site).data, lang: 'tr', site }))

describe('contact logo', () => {
  it('renders the header logo on a plate under the contact details by default', () => {
    const out = html(withLogo())
    expect(out).toContain('data-contact-logo')
    expect(out).toContain('https://cdn.example.com/logo.png')
    expect(out).toContain(CONTACT_LOGO_PLATE_BACKGROUND)
    expect(out).toContain('height="96"')
    expect(out).toContain('width="384"')
    expect(out).toContain(`alt="${withLogo().meta.name}"`)
  })

  it('renders nothing when the site has no logo', () => {
    const site = withLogo()
    const bare = { ...site, navigation: { ...site.navigation, logo: undefined } } as WebsiteSchema
    expect(resolveContactLogo(bare, contactOf(bare).data)).toBeNull()
    expect(html(bare)).not.toContain('data-contact-logo')
  })

  it('is hidden when the owner switches it off, and back on by removing the flag', () => {
    const { index } = contactOf(withLogo())
    const off = applyOperation(withLogo(), { op: 'setContactShowLogo', index, show: false })
    expect(contactOf(off).data.showLogo).toBe(false)
    expect(html(off)).not.toContain('data-contact-logo')

    const on = applyOperation(off, { op: 'setContactShowLogo', index, show: true })
    expect('showLogo' in contactOf(on).data).toBe(false)
    expect(html(on)).toContain('data-contact-logo')
  })

  it('ignores the op on non-contact sections', () => {
    const site = withLogo()
    const index = site.sections.findIndex((s) => s.type !== 'contact')
    const next = applyOperation(site, { op: 'setContactShowLogo', index, show: false })
    expect(JSON.stringify(next.sections[index])).not.toContain('showLogo')
  })

  it('keeps old sites valid without the field', () => {
    const site = withLogo()
    expect(websiteSchema.safeParse(site).success).toBe(true)
    expect(websiteSchema.safeParse({ ...site, sections: site.sections.map((s) => (s.type === 'contact' ? { ...s, showLogo: false } : s)) }).success).toBe(true)
  })
})
