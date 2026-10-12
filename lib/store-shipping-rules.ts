import { isCarrierId, type CarrierId } from '@/lib/shipping-carriers'

/**
 * Pure shipping rules shared by checkout (server), the cart / checkout summary
 * (client display) and the owner settings form. Amounts are integer kuruş.
 * The server is the only place that decides what a buyer is charged; the client
 * only mirrors `computeShippingCents` for display.
 */

export const SHIPPING_FEE_MAX_CENTS = 100_000 // 1.000 TL
export const FREE_SHIPPING_THRESHOLD_MAX_CENTS = 99_999_999
export const DELIVERY_NOTE_MAX_LENGTH = 80

export type ShippingSettings = {
  feeCents: number
  /** Subtotal at or above which shipping is free; null = no free-shipping rule. */
  freeThresholdCents: number | null
  defaultCarrier: CarrierId | null
  /** Short buyer-facing note such as "1-3 iş günü". */
  deliveryNote: string | null
}

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  feeCents: 0,
  freeThresholdCents: null,
  defaultCarrier: null,
  deliveryNote: null,
}

export type ShippingSettingsError =
  | 'invalid_fee'
  | 'invalid_threshold'
  | 'invalid_note'
  | 'invalid_carrier'

/** "49,90" / "49.90" / "50" -> kuruş, or null when it is not a clean TL amount. */
function parseTl(raw: string, maxCents: number, maxWholeDigits: number): number | null {
  const text = raw.trim().replace(/\s/g, '')
  const match = new RegExp(`^(\\d{1,${maxWholeDigits}})(?:[.,](\\d{1,2}))?$`).exec(text)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return cents <= maxCents ? cents : null
}

/** Blank = free shipping (0). Anything else must be a valid amount up to 1.000 TL. */
export function parseShippingFeeInput(raw: unknown): number | null {
  if (raw === null || raw === undefined) return 0
  const text = String(raw).trim()
  if (text === '') return 0
  return parseTl(text, SHIPPING_FEE_MAX_CENTS, 4)
}

/** Blank = no rule (null result is a VALID outcome); 0 or garbage is rejected. */
export function parseFreeThresholdInput(
  raw: unknown,
): { ok: true; cents: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, cents: null }
  const text = String(raw).trim()
  if (text === '') return { ok: true, cents: null }
  const cents = parseTl(text, FREE_SHIPPING_THRESHOLD_MAX_CENTS, 6)
  return cents !== null && cents > 0 ? { ok: true, cents } : { ok: false }
}

export function normalizeDeliveryNote(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false }
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned === '') return { ok: true, value: null }
  return cleaned.length <= DELIVERY_NOTE_MAX_LENGTH ? { ok: true, value: cleaned } : { ok: false }
}

export type ShippingSettingsInput = {
  fee?: unknown
  freeThreshold?: unknown
  defaultCarrier?: unknown
  deliveryNote?: unknown
}

/** Validates owner form input into a settings object, or names the bad field. */
export function parseShippingSettingsInput(
  input: ShippingSettingsInput,
): { ok: true; settings: ShippingSettings } | { ok: false; error: ShippingSettingsError } {
  const feeCents = parseShippingFeeInput(input.fee)
  if (feeCents === null) return { ok: false, error: 'invalid_fee' }

  const threshold = parseFreeThresholdInput(input.freeThreshold)
  if (!threshold.ok) return { ok: false, error: 'invalid_threshold' }

  const note = normalizeDeliveryNote(input.deliveryNote)
  if (!note.ok) return { ok: false, error: 'invalid_note' }

  let defaultCarrier: CarrierId | null = null
  if (typeof input.defaultCarrier === 'string' && input.defaultCarrier !== '') {
    if (!isCarrierId(input.defaultCarrier)) return { ok: false, error: 'invalid_carrier' }
    defaultCarrier = input.defaultCarrier
  }

  return {
    ok: true,
    settings: {
      feeCents,
      freeThresholdCents: threshold.cents,
      defaultCarrier,
      deliveryNote: note.value,
    },
  }
}

type SettingsRow = {
  shipping_fee_cents?: unknown
  free_shipping_threshold_cents?: unknown
  default_carrier?: unknown
  delivery_note?: unknown
}

const isCents = (v: unknown, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max

/** Row -> settings. Malformed columns fall back to the safe default for that field. */
export function readShippingSettings(row: unknown): ShippingSettings {
  const r = (row && typeof row === 'object' ? row : {}) as SettingsRow
  return {
    feeCents: isCents(r.shipping_fee_cents, SHIPPING_FEE_MAX_CENTS) ? r.shipping_fee_cents : 0,
    freeThresholdCents:
      isCents(r.free_shipping_threshold_cents, FREE_SHIPPING_THRESHOLD_MAX_CENTS) &&
      r.free_shipping_threshold_cents > 0
        ? r.free_shipping_threshold_cents
        : null,
    defaultCarrier: isCarrierId(r.default_carrier) ? r.default_carrier : null,
    deliveryNote: typeof r.delivery_note === 'string' && r.delivery_note.trim() ? r.delivery_note : null,
  }
}

/** The shipping charge for a cart subtotal. Free at or above the threshold. */
export function computeShippingCents(subtotalCents: number, settings: ShippingSettings): number {
  if (settings.feeCents <= 0) return 0
  if (settings.freeThresholdCents !== null && subtotalCents >= settings.freeThresholdCents) return 0
  return settings.feeCents
}

export type FreeShippingProgress =
  | { kind: 'none' }
  | { kind: 'always_free' }
  | { kind: 'reached' }
  | { kind: 'remaining'; remainingCents: number }

/** Cart helper: how far the buyer is from free shipping. */
export function freeShippingProgress(
  subtotalCents: number,
  settings: ShippingSettings,
): FreeShippingProgress {
  if (settings.feeCents <= 0) return { kind: 'always_free' }
  if (settings.freeThresholdCents === null) return { kind: 'none' }
  if (subtotalCents >= settings.freeThresholdCents) return { kind: 'reached' }
  return { kind: 'remaining', remainingCents: settings.freeThresholdCents - subtotalCents }
}

export function formatTl(cents: number): string {
  const whole = cents % 100 === 0
  const amount = (cents / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `₺${amount}`
}

/** One line for the owner form and product pages. */
export function describeShipping(settings: ShippingSettings): string {
  if (settings.feeCents <= 0) return 'Kargo ücretsiz'
  const fee = `Kargo ${formatTl(settings.feeCents)}`
  return settings.freeThresholdCents !== null
    ? `${fee}, ${formatTl(settings.freeThresholdCents)} ve üzeri ücretsiz`
    : fee
}

/** Cart message, or null when there is nothing useful to say. */
export function freeShippingMessage(progress: FreeShippingProgress): string | null {
  if (progress.kind === 'remaining') {
    return `Ücretsiz kargo için ${formatTl(progress.remainingCents)} daha ekleyin`
  }
  if (progress.kind === 'reached') return 'Kargo ücretsiz'
  return null
}

export type ShippingStage = 'preparing' | 'shipped' | 'in_transit' | 'delivered' | 'cancelled'

export type ShipGate = 'ok' | 'cancelled' | 'payment_pending'

/**
 * Whether an order may be handed to a carrier. Card / transfer orders need a
 * confirmed payment; cash-on-delivery orders ship while payment is still
 * pending (the courier collects it). Cancelled, failed and refunded orders
 * never ship.
 */
export function shipGate(order: {
  status: string
  payment_status: string
  payment_provider: string | null
}): ShipGate {
  if (['cancelled', 'failed', 'refunded'].includes(order.status)) return 'cancelled'
  if (order.payment_status === 'paid') return 'ok'
  if (order.payment_provider === 'cash_on_delivery' && order.payment_status === 'pending') return 'ok'
  return 'payment_pending'
}
