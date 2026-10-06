import type { ContactActions, WebsiteSchema } from '@/lib/website-schema'
import { isStorefront } from '@/lib/website-schema'
import { createPhoneUrl, createWhatsAppUrl, generalMessage, DEMO_PHONE } from '@/lib/contact-links'
import { canUseContactActions, toPlanCode, type PlanCode } from '@/lib/pricing-config'

/**
 * Floating phone + WhatsApp actions for GENERATED sites
 * -----------------------------------------------------
 * Every generated site ships the same pair of pinned call buttons the demo
 * sites have. The numbers are NOT invented by the model — they are seeded
 * deterministically from the site's own contact section, so a brand-new site
 * always has working buttons and an existing site (saved before this feature
 * existed) gets them without a database migration.
 *
 * The owner stays in full control from the editor: editing a number updates the
 * button, clearing a number hides that single button, and `enabled: false`
 * removes the pair entirely.
 */

/** A number is only usable once it has enough digits to dial. */
const MIN_DIALABLE_DIGITS = 7

/** Digits only, so "+90 212 555 12 34" and "0212 555 12 34" compare equal. */
function digitsOf(value: string): string {
  return value.replace(/[^\d]/g, '')
}

function isDialable(value: string | undefined): value is string {
  return !!value && digitsOf(value).length >= MIN_DIALABLE_DIGITS
}

/**
 * Normalizes a Turkish-style local number to an international `wa.me` target.
 * WhatsApp requires a country code, so a leading domestic `0` is swapped for
 * Turkey's `90` — without this, "0212..." produces a dead chat link.
 */
function toWhatsAppDigits(value: string): string {
  const digits = digitsOf(value)
  if (value.trim().startsWith('+')) return digits
  if (digits.startsWith('90')) return digits
  if (digits.startsWith('0')) return `90${digits.slice(1)}`
  return digits
}

/** Pulls the first dialable phone number out of the site's own content. */
function phoneFromSections(site: WebsiteSchema): string | undefined {
  for (const section of site.sections) {
    if (section.type === 'contact' && isDialable(section.phone)) return section.phone
  }
  // Footer link lists often carry the phone as a plain label on smaller sites.
  for (const section of site.sections) {
    if (section.type !== 'footer') continue
    for (const column of section.columns ?? []) {
      for (const link of column.links) {
        if (link.href.startsWith('tel:') && isDialable(link.href)) return link.href.slice(4)
        if (isDialable(link.label) && /^[\d\s+()-]+$/.test(link.label)) return link.label
      }
    }
  }
  return undefined
}

/**
 * The number the floating buttons fall back to when the owner hasn't set one.
 *
 * Business sites inherit only a real number found in their own content (we
 * never invent one). E-COMMERCE sites, however, must always ship active
 * phone + WhatsApp buttons — a store without a visible contact channel is
 * broken — so when the generated contact section carries no phone we seed the
 * shared placeholder (`+90 850 000 00 00`) that the demo stores use. The owner
 * edits it to their real number in the editor; until then the buttons are
 * present and clearly a placeholder, rather than silently absent.
 */
function fallbackPhone(site: WebsiteSchema): string | undefined {
  const own = phoneFromSections(site)
  if (own) return own
  return isStorefront(site) ? DEMO_PHONE.display : undefined
}

export type ResolvedContactActions = {
  /** Rendered phone button, or null when there is no usable number. */
  phone: { display: string; href: string } | null
  /** Rendered WhatsApp button, or null when there is no usable number. */
  whatsapp: { display: string; href: string } | null
}

/**
 * Resolves what the floating buttons should render for a site.
 *
 * Returns null when nothing should be shown at all — either the owner turned
 * the buttons off, the site has no dialable number anywhere, or the owner's
 * plan does not include the feature.
 *
 * `planCode` is the SITE OWNER's plan (not the viewer's). The phone/WhatsApp
 * buttons are a paid feature: on FREE — including `null`, meaning no active
 * subscription — they are hidden entirely, so the public page matches the
 * editor's paywall. Pass `undefined` ONLY to skip plan gating entirely (e.g.
 * demo catalog renders that manage their own buttons).
 */
export function resolveContactActions(
  site: WebsiteSchema,
  planCode?: PlanCode | string | null,
): ResolvedContactActions | null {
  // Plan gate first. `undefined` = caller opted out of gating; any other value
  // (including `null` → FREE via toPlanCode) is evaluated against the feature.
  // E-commerce sites are exempt: their contact buttons are an essential store
  // feature and must stay active on every plan, including FREE.
  if (
    planCode !== undefined &&
    !isStorefront(site) &&
    !canUseContactActions(toPlanCode(planCode))
  ) {
    return null
  }

  const configured = site.contactActions

  // An explicit opt-out always wins, so "telefon butonunu kaldır" really removes it.
  if (configured?.enabled === false) return null

  const fallback = fallbackPhone(site)

  // `undefined` means "not configured yet" and inherits the site's own number.
  // An explicit empty string means the owner cleared it, which hides that button.
  const phone = configured?.phone === undefined ? fallback : configured.phone
  // Inherits from `fallback`, never from the resolved `phone`: clearing the
  // phone number must hide only the call button, not take WhatsApp down with it.
  const whatsapp = configured?.whatsapp === undefined ? fallback : configured.whatsapp

  const message =
    configured?.whatsappMessage?.trim() || generalMessage(site.meta.name, site.meta.language)

  const resolved: ResolvedContactActions = {
    phone: isDialable(phone) ? { display: phone, href: createPhoneUrl(phone) } : null,
    whatsapp: isDialable(whatsapp)
      ? { display: whatsapp, href: createWhatsAppUrl(toWhatsAppDigits(whatsapp), message) }
      : null,
  }

  if (!resolved.phone && !resolved.whatsapp) return null
  return resolved
}

/**
 * The values the editor should show in its input fields. Mirrors
 * `resolveContactActions`, but returns the raw numbers (not links) so the owner
 * sees the inherited number rather than an empty box on a site that has never
 * been configured.
 */
export function contactActionsForEditor(site: WebsiteSchema): Required<
  Pick<ContactActions, 'enabled'>
> &
  Pick<ContactActions, 'phone' | 'whatsapp' | 'whatsappMessage'> {
  const configured = site.contactActions
  const fallback = fallbackPhone(site)
  const phone = configured?.phone === undefined ? fallback : configured.phone
  return {
    enabled: configured?.enabled !== false,
    phone: phone ?? '',
    whatsapp: (configured?.whatsapp === undefined ? fallback : configured.whatsapp) ?? '',
    whatsappMessage: configured?.whatsappMessage ?? '',
  }
}

/**
 * Persists the seeded numbers onto a freshly generated site, so the buttons are
 * part of the saved schema from the very first save instead of being re-derived
 * on every render.
 */
export function seedContactActions(site: WebsiteSchema): WebsiteSchema {
  if (site.contactActions) return site
  // Storefronts fall back to the shared placeholder number, so a freshly
  // generated store always saves with active phone + WhatsApp buttons even
  // when the model omitted a phone from the contact section.
  const phone = fallbackPhone(site)
  if (!isDialable(phone)) return site
  return { ...site, contactActions: { enabled: true, phone, whatsapp: phone } }
}
