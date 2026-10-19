import { describe, expect, it } from 'vitest'
import { resolveMenuContact } from '@/lib/menu-contact'
import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

function siteWith(contact: Record<string, unknown>, extra: Record<string, unknown> = {}): WebsiteSchema {
  return {
    meta: { name: 'Mavi Kafe', description: 'Kafe', language: 'tr' },
    navigation: { logoText: 'Mavi Kafe', links: [] },
    sections: [{ type: 'contact', title: 'İletişim', ...contact }],
    ...extra,
  } as unknown as WebsiteSchema
}

describe('resolveMenuContact', () => {
  it('returns real phone, email, address, hours and a directions link', () => {
    const contact = resolveMenuContact(
      siteWith({
        phone: '+90 532 481 27 36',
        email: 'ayse@mavikafe.com.tr',
        address: 'Bağdat Caddesi 45, Kadıköy, İstanbul',
        hours: 'Hergün 09:00 - 22:00',
      }),
    )
    expect(contact?.phone).toEqual({ display: '+90 532 481 27 36', href: 'tel:+905324812736' })
    expect(contact?.email?.href).toBe('mailto:ayse@mavikafe.com.tr')
    expect(contact?.hours).toBe('Hergün 09:00 - 22:00')
    const url = new URL(contact!.directionsUrl!)
    expect(url.searchParams.get('destination')).toBe('Bağdat Caddesi 45, Kadıköy, İstanbul')
  })

  it('drops placeholder values and the shared demo line', () => {
    expect(
      resolveMenuContact(
        siteWith({ phone: '+90 850 000 00 00', email: 'info@example.com', address: 'Örnek Sokak No: 1' }),
      ),
    ).toBeNull()
  })

  it('drops values flagged as unconfirmed samples', () => {
    const contact = resolveMenuContact(
      siteWith({ phone: '0532 481 27 36', email: 'ayse@mavikafe.com.tr', sample: true, sampleFields: ['phone'] }),
    )
    expect(contact?.phone).toBeUndefined()
    expect(contact?.email?.display).toBe('ayse@mavikafe.com.tr')
  })

  it('ignores hidden contact sections', () => {
    expect(resolveMenuContact(siteWith({ address: 'Bağdat Caddesi 45, Kadıköy, İstanbul', hidden: true }))).toBeNull()
  })

  it('has no directions link without an address or a map', () => {
    const contact = resolveMenuContact(siteWith({ phone: '0532 481 27 36' }))
    expect(contact?.directionsUrl).toBeUndefined()
  })

  it('aims directions at the map destination when the pasted map carries one', () => {
    const contact = resolveMenuContact(
      siteWith({
        address: 'Kadıköy, İstanbul',
        mapEmbed: 'https://www.google.com/maps/embed/v1/place?key=k&q=Mavi+Kafe+Moda',
      }),
    )
    expect(new URL(contact!.directionsUrl!).searchParams.get('destination')).toBe('Mavi Kafe Moda')
  })

  it('falls back to the business name for a map without a readable destination', () => {
    const contact = resolveMenuContact(
      siteWith({ mapEmbed: '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12"></iframe>' }),
    )
    expect(new URL(contact!.directionsUrl!).searchParams.get('destination')).toBe('Mavi Kafe')
  })

  it('accepts the optional hours field in the site schema', () => {
    const parsed = websiteSchema.shape.sections.element.safeParse({
      type: 'contact',
      title: 'İletişim',
      hours: 'Pzt-Cum 09:00-18:00',
    })
    expect(parsed.success).toBe(true)
  })
})
