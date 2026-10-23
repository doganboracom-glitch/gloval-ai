import { isStorefront, type Section, type WebsiteSchema } from '@/lib/website-schema'

type ContactData = Extract<Section, { type: 'contact' }>

export interface ContactLogo {
  src: string
  alt: string
  /** Intrinsic ratio hint (w/h) from the header layout, when the owner set both. */
  ratio: number | null
}

/**
 * Header logos are usually drawn for the header background (often a white
 * wordmark on a dark bar), so the contact section shows them on a plate
 * derived from that same theme token. `--site-bg` is the colour the header
 * is painted over; `--site-card` is the fallback when it is not defined.
 */
export const CONTACT_LOGO_PLATE_BACKGROUND = 'var(--site-bg, var(--site-card))'

export const CONTACT_LOGO_MAX_HEIGHT = 96
export const CONTACT_LOGO_MOBILE_MAX_HEIGHT = 72

/**
 * The logo shown under the contact details, or null when nothing should render:
 * no site, no logo, the owner switched it off, or the site is a storefront
 * (store pages keep their existing markup).
 */
export function resolveContactLogo(
  site: WebsiteSchema | null | undefined,
  section: ContactData,
): ContactLogo | null {
  if (!site) return null
  if (section.showLogo === false) return null
  if (isStorefront(site)) return null

  const logo = site.navigation.logo
  const src = logo?.src?.trim()
  if (!logo || !src) return null

  const ratio = logo.width && logo.height ? logo.width / logo.height : null
  const alt = site.meta.name?.trim() || site.navigation.logoText || logo.alt || ''
  return { src, alt, ratio }
}
