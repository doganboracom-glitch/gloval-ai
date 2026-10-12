/**
 * The fixed list of carriers an owner can pick from, and the ONLY place a
 * tracking link is ever built. Links come from the carrier's own public
 * tracking page template; a carrier whose template we are not sure about has
 * `trackingUrl: null` and the buyer just sees the tracking code. Nothing the
 * owner types ever becomes part of a URL host or path other than the already
 * validated tracking code.
 */

export const CARRIER_IDS = [
  'yurtici',
  'aras',
  'mng',
  'ptt',
  'surat',
  'hepsijet',
  'trendyol_express',
  'ups',
  'other',
] as const

export type CarrierId = (typeof CARRIER_IDS)[number]

export type Carrier = {
  id: CarrierId
  name: string
  /** Pure function: builds the https tracking link for a validated code, or null. */
  trackingUrl: (code: string) => string | null
}

const link = (base: string) => (code: string) => `${base}${encodeURIComponent(code)}`
const none = () => null

export const CARRIERS: readonly Carrier[] = [
  {
    id: 'yurtici',
    name: 'Yurtiçi Kargo',
    trackingUrl: link('https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code='),
  },
  {
    id: 'aras',
    name: 'Aras Kargo',
    trackingUrl: link('https://kargotakip.araskargo.com.tr/mainpage.aspx?code='),
  },
  { id: 'mng', name: 'MNG Kargo', trackingUrl: none },
  {
    id: 'ptt',
    name: 'PTT Kargo',
    trackingUrl: link('https://gonderitakip.ptt.gov.tr/Track/Verify?q='),
  },
  {
    id: 'surat',
    name: 'Sürat Kargo',
    trackingUrl: link('https://www.suratkargo.com.tr/KargoTakip/?kargotakipno='),
  },
  { id: 'hepsijet', name: 'HepsiJet', trackingUrl: none },
  { id: 'trendyol_express', name: 'Trendyol Express', trackingUrl: none },
  { id: 'ups', name: 'UPS', trackingUrl: link('https://www.ups.com/track?tracknum=') },
  { id: 'other', name: 'Diğer', trackingUrl: none },
]

export function isCarrierId(value: unknown): value is CarrierId {
  return typeof value === 'string' && (CARRIER_IDS as readonly string[]).includes(value)
}

export function getCarrier(id: unknown): Carrier | null {
  return CARRIERS.find((c) => c.id === id) ?? null
}

/**
 * Display name for a stored carrier value. Orders written before this module
 * may hold a free-text name; those are shown as they are.
 */
export function carrierName(stored: string | null | undefined): string {
  if (!stored) return ''
  return getCarrier(stored)?.name ?? stored
}

/** Tracking link for a stored carrier + code, or null when none can be built. */
export function buildTrackingUrl(
  stored: string | null | undefined,
  code: string | null | undefined,
): string | null {
  if (!code || !isValidTrackingNumber(code)) return null
  return getCarrier(stored)?.trackingUrl(code) ?? null
}

/** Tracking code: 6-40 ASCII letters, digits or hyphens (already trimmed). */
export function isValidTrackingNumber(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{6,40}$/.test(value)
}

/** Trims the owner's input and returns the code, or null when it is invalid. */
export function normalizeTrackingNumber(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return isValidTrackingNumber(trimmed) ? trimmed : null
}
