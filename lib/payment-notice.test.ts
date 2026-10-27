import { describe, expect, it } from 'vitest'
import {
  PENDING_PAYMENT_KEY,
  PENDING_PAYMENT_SLACK_MS,
  PENDING_PAYMENT_TTL_MS,
  clampSince,
  clearPendingPayment,
  decidePaymentOutcome,
  formatPaymentSuccess,
  readPendingPayment,
  savePendingPayment,
} from './payment-notice'
import { SUPPORTED_LOCALES, dictionary } from './i18n'

const tr = dictionary.tr

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

describe('formatPaymentSuccess', () => {
  const copy = tr.billing.paymentNotice

  it('names the credits for an AI credit pack', () => {
    expect(formatPaymentSuccess(copy, { kind: 'credits', credits: 50 })).toBe(
      'Ödemen alındı. +50 AI işlemi hesabına eklendi.',
    )
  })

  it('names the add-on for an add-on purchase', () => {
    expect(formatPaymentSuccess(copy, { kind: 'named', name: 'Marka kaldırma' })).toBe(
      'Ödemen alındı. Marka kaldırma hesabında etkinleştirildi.',
    )
  })
})

describe('decidePaymentOutcome', () => {
  const row = (status: string, minute: number) => ({
    status,
    created_at: new Date(Date.UTC(2026, 9, 27, 10, minute)).toISOString(),
  })

  it('reports nothing when the checkout left no rows', () => {
    expect(decidePaymentOutcome([])).toBe('none')
  })

  it('treats succeeded and granted as success', () => {
    expect(decidePaymentOutcome([row('succeeded', 1)])).toBe('success')
    expect(decidePaymentOutcome([row('granted', 1)])).toBe('success')
  })

  it('reports failure only when the newest row failed', () => {
    expect(decidePaymentOutcome([row('failed', 1)])).toBe('failed')
    expect(decidePaymentOutcome([row('failed', 1), row('succeeded', 2)])).toBe('success')
    expect(decidePaymentOutcome([row('succeeded', 1), row('failed', 2)])).toBe('failed')
  })

  it('never shows success while the payment is unsettled or needs a manual refund', () => {
    expect(decidePaymentOutcome([row('pending', 1)])).toBe('pending')
    expect(decidePaymentOutcome([row('paid', 1)])).toBe('pending')
    expect(decidePaymentOutcome([row('manual_refund_required', 1)])).toBe('pending')
  })
})

describe('pending payment hand-off', () => {
  const now = Date.UTC(2026, 9, 27, 10, 0)

  it('round-trips and backdates the start to cover the ledger write', () => {
    const storage = memoryStorage()
    savePendingPayment({ kind: 'credits', credits: 50 }, now, storage)
    expect(readPendingPayment(now + 1000, storage)).toEqual({
      since: now - PENDING_PAYMENT_SLACK_MS,
      target: { kind: 'credits', credits: 50 },
    })
  })

  it('drops expired or malformed records', () => {
    const storage = memoryStorage()
    savePendingPayment({ kind: 'named', name: 'X' }, now, storage)
    expect(readPendingPayment(now + PENDING_PAYMENT_TTL_MS + PENDING_PAYMENT_SLACK_MS + 1, storage)).toBeNull()
    expect(storage.getItem(PENDING_PAYMENT_KEY)).toBeNull()

    storage.setItem(PENDING_PAYMENT_KEY, '{"since":"x"}')
    expect(readPendingPayment(now, storage)).toBeNull()
    storage.setItem(PENDING_PAYMENT_KEY, 'not json')
    expect(readPendingPayment(now, storage)).toBeNull()
  })

  it('clears the record once the outcome is shown', () => {
    const storage = memoryStorage()
    savePendingPayment({ kind: 'credits', credits: 10 }, now, storage)
    clearPendingPayment(storage)
    expect(readPendingPayment(now, storage)).toBeNull()
  })
})

describe('clampSince', () => {
  const now = Date.UTC(2026, 9, 27, 10, 0)

  it('keeps the server query inside the TTL window and never in the future', () => {
    expect(clampSince(now - 10 * PENDING_PAYMENT_TTL_MS, now)).toBe(now - PENDING_PAYMENT_TTL_MS)
    expect(clampSince(now + 5000, now)).toBe(now)
    expect(clampSince(Number.NaN, now)).toBe(now - PENDING_PAYMENT_SLACK_MS)
  })
})

describe('paymentNotice translations', () => {
  it.each([...SUPPORTED_LOCALES])('keeps the placeholders and messages in %s', (locale) => {
    const n = dictionary[locale].billing.paymentNotice
    expect(SUPPORTED_LOCALES).toHaveLength(12)
    expect(n.successCredits).toContain('{credits}')
    expect(n.successNamed).toContain('{name}')
    expect(n.failed.length).toBeGreaterThan(10)
    expect(n.dismiss.length).toBeGreaterThan(2)
    expect(n.backToBilling.length).toBeGreaterThan(2)
  })
})
