import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { blankSection } from '@/lib/website-edit-operations'
import { CONTACT_SAMPLE_FIELDS, type ContactSampleField } from '@/lib/sample-content'

/** True when the site has a contact section, visible or hidden. */
export function hasContactSection(site: Pick<WebsiteSchema, 'sections'>): boolean {
  return site.sections.some((section) => section.type === 'contact')
}

/**
 * Deterministic post-generation guard: every NEWLY generated site (AI or
 * fallback, corporate or storefront) must carry a contact section. When none is
 * present an empty one (form, address and map slots) is inserted right before
 * the footer, or appended when there is no footer. Existing sites are never
 * passed through this; it only runs inside the generation route.
 */
export function ensureContactSection<T extends Pick<WebsiteSchema, 'sections' | 'meta'>>(site: T): T {
  if (hasContactSection(site)) return site

  const contact: Section = blankSection('contact', site.meta.language)
  const sections = [...site.sections]
  let footerIndex = -1
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].type === 'footer') {
      footerIndex = i
      break
    }
  }
  sections.splice(footerIndex === -1 ? sections.length : footerIndex, 0, contact)
  return { ...site, sections }
}

const digitsOnly = (value: string) => value.replace(/\D/g, '')

/** True when the owner's own brief contains this exact contact value. */
function promptContains(prompt: string, field: ContactSampleField, value: string): boolean {
  if (field === 'phone') {
    // Compare national digits so "+90 532…" and "0532…" count as the same number.
    const digits = digitsOnly(value).slice(-10)
    return digits.length >= 7 && digitsOnly(prompt).includes(digits)
  }
  return prompt.toLowerCase().includes(value.trim().toLowerCase())
}

/**
 * Marks every contact value of a NEWLY generated site that the owner did not
 * write in their brief as an unconfirmed placeholder (`sampleFields`). Models
 * and the deterministic fallbacks fill the contact section with invented
 * e-mail, phone, address and map values; those must never go live as if real.
 * Flagged values stay visible in the editor but are stripped from every public
 * surface until the owner edits them.
 */
export function flagPlaceholderContact<T extends Pick<WebsiteSchema, 'sections'>>(site: T, prompt: string): T {
  return {
    ...site,
    sections: site.sections.map((section): Section => {
      if (section.type !== 'contact') return section
      const flagged = CONTACT_SAMPLE_FIELDS.filter((field) => {
        const value = (section[field] ?? '').trim()
        return value !== '' && !promptContains(prompt, field, value)
      })
      if (flagged.length === 0) return section
      return { ...section, sample: true, sampleFields: flagged }
    }),
  }
}

type Copy = {
  suggestionText: string
  suggestionAction: string
  removeWarning: string
}

const TR: Copy = {
  suggestionText: 'Siteniz iletişim bölümü içermiyor.',
  suggestionAction: 'Ekleyin.',
  removeWarning:
    'İletişim bölümü müşterilerinizin sizinle ulaşması için önerilir. Yine de silmek istiyor musunuz? (Silmek yerine gizleyebilirsiniz.)',
}

const EN: Copy = {
  suggestionText: 'Your site has no contact section.',
  suggestionAction: 'Add one.',
  removeWarning:
    'A contact section is recommended so your customers can reach you. Delete it anyway? (You can hide it instead.)',
}

export function contactSectionCopy(lang: string): Copy {
  return lang === 'tr' ? TR : EN
}
