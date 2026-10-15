import { describe, expect, it } from 'vitest'
import { isPlaceholderHref, isPlaceholderPhone, isPlaceholderText } from '@/lib/placeholder-contact'
import { collectSampleFindings } from '@/lib/sample-content'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

/** Real-shaped corporate (0850) lines: valid format, no invented-looking digits. */
const REAL_CORPORATE_LINES = ['0850 441 29 63', '+90 850 441 29 63', '0850 724 18 36', '(0850) 305 72 48', '08503034060']

/** Real-shaped landlines with a genuine Istanbul/Ankara/Izmir area code and arbitrary subscriber digits. */
const REAL_AREA_CODE_LINES = ['0212 347 58 91', '+90 212 836 47 15', '(0312) 428 63 09', '0232 519 74 82', '0216 392 85 07']

const contactSiteWith = (phone: string): WebsiteSchema => {
  const base = fallbackWebsite('kahve dükkanı', 'tr')
  const contact = { type: 'contact', title: 'İletişim', phone } as Section
  return { ...base, sections: [...base.sections.filter((s) => s.type !== 'contact'), contact] }
}

const detectedFindings = (site: WebsiteSchema) =>
  collectSampleFindings(site).flatMap((section) => section.items.filter((item) => item.detected))

describe('real phone numbers are not false positives', () => {
  it.each(REAL_CORPORATE_LINES)('keeps the real 0850 corporate line %s', (phone) => {
    expect(isPlaceholderPhone(phone)).toBe(false)
    expect(isPlaceholderHref(`tel:${phone.replace(/\s/g, '')}`)).toBe(false)
    expect(isPlaceholderText(`Bizi arayın: ${phone}`)).toBe(false)
    expect(detectedFindings(contactSiteWith(phone))).toEqual([])
  })

  it.each(REAL_AREA_CODE_LINES)('keeps the real area-code number %s', (phone) => {
    expect(isPlaceholderPhone(phone)).toBe(false)
    expect(isPlaceholderHref(`tel:${phone.replace(/[\s()]/g, '')}`)).toBe(false)
    expect(isPlaceholderText(`Telefon ${phone}`)).toBe(false)
    expect(detectedFindings(contactSiteWith(phone))).toEqual([])
  })

  it('still flags the invented shapes next to them, so the check is not simply switched off', () => {
    for (const phone of ['+90 850 000 00 00', '0850 000 12 34', '0212 XXX XX XX', '+90 212 555 01 23', '0000000', '+90 532 111 11 11', '1234567']) {
      expect(isPlaceholderPhone(phone), phone).toBe(true)
    }
    expect(detectedFindings(contactSiteWith('0212 XXX XX XX'))).toHaveLength(1)
  })
})
