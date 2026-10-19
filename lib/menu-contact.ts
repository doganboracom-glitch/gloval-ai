import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { createPhoneUrl, DEMO_PHONE, mailHref } from '@/lib/contact-links'
import { buildDirectionsUrl, parseMapInput } from '@/lib/map-embed'
import {
  isPlaceholderAddress,
  isPlaceholderEmail,
  isPlaceholderPhone,
  isPlaceholderText,
} from '@/lib/placeholder-contact'
import { stripSampleContent } from '@/lib/sample-content'
import { resolveContactActions } from '@/lib/site-contact-actions'

/**
 * Contact block of the mobile menu panel
 * --------------------------------------
 * Everything here comes from what the PUBLIC page shows: the site is run
 * through `stripSampleContent` first, then every value is checked against the
 * known placeholder patterns, so an unconfirmed sample value or the shared demo
 * line can never reach a visitor. Empty fields are simply absent and a site
 * with nothing real resolves to `null` (the menu then draws no block at all).
 */

export type MenuContact = {
  phone?: { display: string; href: string }
  email?: { display: string; href: string }
  address?: string
  hours?: string
  /** Google Maps directions link; absent when there is no address or map to aim at. */
  directionsUrl?: string
}

type ContactSection = Extract<Section, { type: 'contact' }>

const MIN_DIALABLE_DIGITS = 7
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function digitsOf(value: string): string {
  return value.replace(/\D/g, '')
}

function isDemoLine(value: string): boolean {
  const digits = digitsOf(value)
  return digits.length >= 10 && digits.slice(-10) === digitsOf(DEMO_PHONE.tel).slice(-10)
}

function realPhone(value: string | undefined | null): string | null {
  const phone = (value ?? '').trim()
  if (!phone || digitsOf(phone).length < MIN_DIALABLE_DIGITS) return null
  if (isPlaceholderPhone(phone) || isDemoLine(phone)) return null
  return phone
}

function visibleContactSections(site: WebsiteSchema): ContactSection[] {
  const sections: Section[] = [...site.sections, ...(site.pages ?? []).flatMap((page) => page.sections ?? [])]
  return sections.filter((section): section is ContactSection => section.type === 'contact' && !section.hidden)
}

function firstValue(sections: ContactSection[], pick: (section: ContactSection) => string | null): string | null {
  for (const section of sections) {
    const value = pick(section)
    if (value) return value
  }
  return null
}

/** Destination a pasted map points at, when it carries a readable one (`q=`); embeds with only `pb=` do not. */
export function mapDestination(mapEmbed: string | undefined): string | null {
  const parsed = parseMapInput(mapEmbed ?? '')
  if (parsed.kind !== 'embed') return null
  try {
    return new URL(parsed.src).searchParams.get('q')?.trim() || null
  } catch {
    return null
  }
}

function hasUsableMap(mapEmbed: string | undefined): boolean {
  const parsed = parseMapInput(mapEmbed ?? '')
  return parsed.kind === 'embed' || parsed.kind === 'short-link'
}

export function resolveMenuContact(site: WebsiteSchema): MenuContact | null {
  const published = stripSampleContent(site)
  const sections = visibleContactSections(published)
  const placeholderContext = { siteName: published.meta.name }

  const phone =
    realPhone(resolveContactActions(published)?.phone?.display) ??
    realPhone(firstValue(sections, (s) => realPhone(s.phone)))

  const email = firstValue(sections, (s) => {
    const value = (s.email ?? '').trim()
    return EMAIL_PATTERN.test(value) && !isPlaceholderEmail(value, placeholderContext) ? value : null
  })

  const address = firstValue(sections, (s) => {
    const value = (s.address ?? '').replace(/\s+/g, ' ').trim()
    return value && !isPlaceholderAddress(value) ? value : null
  })

  const hours = firstValue(sections, (s) => {
    const value = (s.hours ?? '').replace(/[ \t]+/g, ' ').trim()
    return value && !isPlaceholderText(value, placeholderContext) ? value : null
  })

  const map = firstValue(sections, (s) => (s.mapEmbed ?? '').trim() || null) ?? undefined
  const destination =
    mapDestination(map) ?? address ?? (hasUsableMap(map) ? published.meta.name?.trim() || null : null)
  const directionsUrl = destination ? (buildDirectionsUrl(destination) ?? undefined) : undefined

  const contact: MenuContact = {
    ...(phone ? { phone: { display: phone, href: createPhoneUrl(phone) } } : {}),
    ...(email ? { email: { display: email, href: mailHref(email) } } : {}),
    ...(address ? { address } : {}),
    ...(hours ? { hours } : {}),
    ...(directionsUrl ? { directionsUrl } : {}),
  }
  return Object.keys(contact).length > 0 ? contact : null
}
