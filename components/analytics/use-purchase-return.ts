'use client'

import { useEffect } from 'react'
import { isPurchaseKind, type PurchaseKind } from '@/lib/analytics-events'
import { trackPurchase } from '@/lib/analytics'

export const PURCHASE_QUERY_KEYS = ['gl_tx', 'gl_v', 'gl_c', 'gl_k'] as const

type VerifiedPurchase = {
  transaction_id: string
  value: number
  currency: string
  item_category: PurchaseKind
}

function parsePurchase(input: { id: unknown; value: unknown; currency: unknown; kind: unknown }): VerifiedPurchase | null {
  const id = typeof input.id === 'string' ? input.id : ''
  const value = Number(input.value)
  const currency = typeof input.currency === 'string' ? input.currency.toUpperCase() : ''
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null
  if (!Number.isFinite(value) || value <= 0 || value > 10_000_000) return null
  if (!/^[A-Z]{3}$/.test(currency)) return null
  if (!isPurchaseKind(input.kind)) return null
  return { transaction_id: id, value, currency, item_category: input.kind }
}

/**
 * Fires the `purchase` event from a server-verified payment result. The iyzico
 * callback only attaches the purchase details after retrieving the payment
 * from iyzico and confirming it as paid; they reach this hook either as a
 * same-origin postMessage (popup/iframe flows) or as `gl_*` query params on the
 * full-page return URL, which are stripped right after reading. Duplicate
 * deliveries are ignored by `trackPurchase`.
 */
export function usePurchaseReturn(pathname: string) {
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (data?.source !== 'gloval-payment' || data.status !== 'success' || !data.purchase) return
      const purchase = parsePurchase({
        id: data.purchase.id,
        value: data.purchase.value,
        currency: data.purchase.currency,
        kind: data.purchase.kind,
      })
      if (purchase) trackPurchase(purchase)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    if (!PURCHASE_QUERY_KEYS.some((key) => url.searchParams.has(key))) return
    const purchase = parsePurchase({
      id: url.searchParams.get('gl_tx'),
      value: url.searchParams.get('gl_v'),
      currency: url.searchParams.get('gl_c'),
      kind: url.searchParams.get('gl_k'),
    })
    PURCHASE_QUERY_KEYS.forEach((key) => url.searchParams.delete(key))
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    if (purchase) trackPurchase(purchase)
  }, [pathname])
}
