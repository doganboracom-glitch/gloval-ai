import type { Lang } from '@/lib/i18n'

/**
 * Centralized contact-link helpers
 * --------------------------------
 * Every demo builds its phone/WhatsApp CTAs through these helpers so the
 * behavior (message templates, URL format) is identical everywhere. Phone
 * numbers are demo placeholders managed centrally — never a real person's line.
 */

/** Shared demo contact line used by all demos (placeholder, not a real number). */
export const DEMO_PHONE = {
  /** Human-readable, shown in the UI. */
  display: '+90 850 000 00 00',
  /** `tel:` target (E.164, no spaces). */
  tel: '+908500000000',
  /** wa.me target (digits only, no +). */
  whatsapp: '908500000000',
}

/** Builds a `tel:` URL. */
export function createPhoneUrl(tel: string): string {
  return `tel:${tel.replace(/\s+/g, '')}`
}

/** Builds a `https://wa.me/<digits>?text=<message>` URL. */
export function createWhatsAppUrl(whatsapp: string, message: string): string {
  const digits = whatsapp.replace(/[^\d]/g, '')
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`
}

/* Short aliases used by the shared demo-site components. */

/** `tel:` link. */
export function telHref(tel: string): string {
  return createPhoneUrl(tel)
}

/** wa.me link, optionally prefilled with a message. */
export function whatsappHref(whatsapp: string, message?: string): string {
  return createWhatsAppUrl(whatsapp, message ?? '')
}

/** `mailto:` link. */
export function mailHref(email: string): string {
  return `mailto:${email}`
}

/** WhatsApp message for a product/catalog item enquiry. */
export function productMessage(brand: string, product: string, lang: Lang): string {
  return lang === 'tr'
    ? `Merhaba, gloval.ai demo sitesindeki ${brand} — ${product} hakkında bilgi almak ve sipariş vermek istiyorum.`
    : `Hi, I'd like information about "${product}" from the ${brand} gloval.ai demo site and would like to place an order.`
}

/** WhatsApp message for a service enquiry. */
export function serviceMessage(brand: string, service: string, lang: Lang): string {
  return lang === 'tr'
    ? `Merhaba, gloval.ai demo sitesindeki ${brand} — ${service} hizmeti hakkında bilgi almak istiyorum.`
    : `Hi, I'd like information about the "${service}" service from the ${brand} gloval.ai demo site.`
}

/** Generic WhatsApp message for a business enquiry. */
export function generalMessage(brand: string, lang: Lang): string {
  return lang === 'tr'
    ? `Merhaba, ${brand} hakkında bilgi almak istiyorum.`
    : `Hi, I'd like some information about ${brand}.`
}
