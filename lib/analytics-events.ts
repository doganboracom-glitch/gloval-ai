/**
 * Single source of truth for marketing-measurement events (gloval.ai platform
 * only, never customer sites): event names, the GA4 -> Meta Pixel mapping and
 * measurement-ID validation. Pure module, safe on client and server.
 */

export const ANALYTICS_EVENTS = {
  pageView: 'page_view',
  signUp: 'sign_up',
  generateSiteStarted: 'generate_site_started',
  generateSiteCompleted: 'generate_site_completed',
  publishSite: 'publish_site',
  beginCheckout: 'begin_checkout',
  purchase: 'purchase',
} as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

export type AnalyticsParams = Record<string, unknown>

export const PURCHASE_KINDS = [
  'subscription',
  'credit_topup',
  'branding_removal',
  'addon',
  'domain',
] as const

export type PurchaseKind = (typeof PURCHASE_KINDS)[number]

export function isPurchaseKind(value: unknown): value is PurchaseKind {
  return typeof value === 'string' && (PURCHASE_KINDS as readonly string[]).includes(value)
}

/** GA4 measurement ID: `G-` followed by letters/digits only. */
export function isValidGaId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^G-[A-Z0-9]{4,20}$/i.test(id)
}

/** Meta Pixel ID: digits only. */
export function isValidPixelId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^\d{6,20}$/.test(id)
}

type MetaMapping = { kind: 'standard' | 'custom'; name: string }

export const META_EVENT_MAP: Record<AnalyticsEventName, MetaMapping> = {
  page_view: { kind: 'standard', name: 'PageView' },
  sign_up: { kind: 'standard', name: 'CompleteRegistration' },
  generate_site_started: { kind: 'custom', name: 'GenerateSiteStarted' },
  generate_site_completed: { kind: 'custom', name: 'GenerateSiteCompleted' },
  publish_site: { kind: 'custom', name: 'PublishSite' },
  begin_checkout: { kind: 'standard', name: 'InitiateCheckout' },
  purchase: { kind: 'standard', name: 'Purchase' },
}

function pickPrimitives(params: AnalyticsParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value
    }
  }
  return out
}

/** Translates GA4-style params into the payload Meta Pixel expects for the same event. */
export function toMetaPayload(
  name: AnalyticsEventName,
  params: AnalyticsParams,
): { data: Record<string, unknown>; eventId?: string } {
  const flat = pickPrimitives(params)
  switch (name) {
    case 'page_view':
      return { data: {} }
    case 'sign_up':
      return { data: { status: true, ...(flat.method ? { content_name: flat.method } : {}) } }
    case 'begin_checkout':
      return {
        data: {
          ...(typeof flat.value === 'number' ? { value: flat.value } : {}),
          ...(typeof flat.currency === 'string' ? { currency: flat.currency } : {}),
          ...(typeof flat.item_category === 'string' ? { content_category: flat.item_category } : {}),
        },
      }
    case 'purchase':
      return {
        data: {
          value: flat.value,
          currency: flat.currency,
          content_type: 'product',
          ...(typeof flat.item_category === 'string' ? { content_category: flat.item_category } : {}),
        },
        eventId: typeof flat.transaction_id === 'string' ? flat.transaction_id : undefined,
      }
    default:
      return { data: flat }
  }
}
