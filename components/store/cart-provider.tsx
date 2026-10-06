'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type CartItem = {
  productId: string
  name: string
  priceCents: number
  currency: string
  image: string | null
  quantity: number
  maxStock: number
}

type CartContextValue = {
  items: CartItem[]
  count: number
  subtotalCents: number
  currency: string
  add: (item: Omit<CartItem, 'quantity'>, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

const MAX_QTY = 99

/**
 * Persistent, per-store cart. Cart state is keyed by store slug in
 * localStorage so a buyer's cart survives reloads and navigation between the
 * catalog, product detail, and checkout pages.
 */
export function CartProvider({
  slug,
  children,
}: {
  slug: string
  children: ReactNode
}) {
  const storageKey = `gloval:cart:${slug}`
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from storage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setItems(parsed)
      }
    } catch {
      // ignore corrupt cart
    }
    setHydrated(true)
  }, [storageKey])

  // Persist on change (after hydration to avoid clobbering).
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(items))
    } catch {
      // ignore quota errors
    }
  }, [items, hydrated, storageKey])

  const value = useMemo<CartContextValue>(() => {
    const clampQty = (qty: number, max: number) =>
      Math.max(1, Math.min(qty, Math.min(MAX_QTY, max || MAX_QTY)))

    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotalCents: items.reduce((n, i) => n + i.priceCents * i.quantity, 0),
      currency: items[0]?.currency ?? 'TRY',
      add: (item, qty = 1) =>
        setItems((prev) => {
          const existing = prev.find((i) => i.productId === item.productId)
          if (existing) {
            return prev.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: clampQty(i.quantity + qty, item.maxStock) }
                : i,
            )
          }
          return [...prev, { ...item, quantity: clampQty(qty, item.maxStock) }]
        }),
      setQty: (productId, qty) =>
        setItems((prev) =>
          prev.map((i) =>
            i.productId === productId
              ? { ...i, quantity: clampQty(qty, i.maxStock) }
              : i,
          ),
        ),
      remove: (productId) =>
        setItems((prev) => prev.filter((i) => i.productId !== productId)),
      clear: () => setItems([]),
    }
  }, [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}

/**
 * Cart accessor that never throws. Section components (products-section) are
 * rendered in three contexts: the editor preview and standalone marketing
 * pages (no cart), and inside a real/demo store (cart present). This lets a
 * shared "add to cart" button light up only where a cart actually exists and
 * otherwise fall back to a plain link, without duplicating the component.
 */
export function useOptionalCart() {
  return useContext(CartContext)
}

export type PendingAdd = {
  item: Omit<CartItem, 'quantity'>
  qty: number
}

/**
 * Add-to-cart flow with a duplicate confirmation step. When the product is
 * already in the cart, `requestAdd` does NOT add immediately — it stores the
 * pending add so the caller can render a themed "already in your cart, add
 * another?" dialog and then call `confirm()` (which increments the existing
 * line's quantity) or `cancel()`.
 *
 * Accepts the cart value (from `useCart` or `useOptionalCart`) so it works in
 * both the real store and the optional-cart demo/marketing contexts.
 */
export function useAddWithConfirm(cart: CartContextValue | null) {
  const [pending, setPending] = useState<PendingAdd | null>(null)

  const requestAdd = (item: Omit<CartItem, 'quantity'>, qty = 1) => {
    if (!cart) return
    const already = cart.items.some((i) => i.productId === item.productId)
    if (already) {
      setPending({ item, qty })
    } else {
      cart.add(item, qty)
    }
  }

  const confirm = () => {
    if (cart && pending) cart.add(pending.item, pending.qty)
    setPending(null)
  }

  const cancel = () => setPending(null)

  return { requestAdd, pending, confirm, cancel }
}

/**
 * Window event any component can dispatch to ask the nearest cart drawer to
 * open (e.g. after "add to cart"). Decouples the product cards from whichever
 * drawer implementation is mounted (demo island or store drawer).
 */
export const OPEN_CART_EVENT = 'gloval-cart:open'

export function requestOpenCart() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_CART_EVENT))
  }
}

/** Infers an ISO currency from a display price's symbol (defaults to TRY). */
export function inferCurrency(display: string): string {
  if (display.includes('$')) return 'USD'
  if (display.includes('€')) return 'EUR'
  return 'TRY'
}

/**
 * Parses a human display price ("₺1.299", "$39.90", "1.899,00 TL") into integer
 * cents. Handles both Turkish (1.299,00) and English (1,299.00) grouping by
 * treating the last separator as the decimal point.
 */
export function parsePriceToCents(display: string): number {
  const cleaned = (display || '').replace(/[^\d.,]/g, '')
  if (!cleaned) return 0
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : ''
  let intPart = cleaned
  let fracPart = ''
  if (decimalSep) {
    const idx = cleaned.lastIndexOf(decimalSep)
    const frac = cleaned.slice(idx + 1)
    // Only treat as decimals when it looks like 1-2 fractional digits.
    if (frac.length >= 1 && frac.length <= 2) {
      intPart = cleaned.slice(0, idx)
      fracPart = frac
    }
  }
  const digits = intPart.replace(/[.,]/g, '')
  const cents = parseInt(digits || '0', 10) * 100 + parseInt(fracPart.padEnd(2, '0') || '0', 10)
  return Number.isFinite(cents) ? cents : 0
}

export function formatPrice(cents: number, currency: string): string {
  const amount = (cents / 100).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const symbol = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency + ' '
  return `${symbol}${amount}`
}
