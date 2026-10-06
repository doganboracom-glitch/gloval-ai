'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Simulated storefront membership for the commerce DEMO.
 * ------------------------------------------------------
 * The demo has no backend, so "accounts" live entirely in localStorage, scoped
 * per demo slug. This mirrors the shape of a real store's membership (register,
 * login, guest checkout, saved profile that prefills checkout) so the demo
 * accurately previews the published experience — but nothing leaves the
 * browser and no real credential is stored anywhere server-side. A published
 * store swaps this for real Supabase-backed customer accounts.
 */

export type DemoProfile = {
  name: string
  email: string
  phone: string
  city: string
  address: string
}

type StoredUser = DemoProfile & { password: string }

/** A simulated order kept in the browser for the demo's "Siparişlerim". */
export type DemoOrder = {
  id: string
  email: string
  createdAt: number
  method: string
  totalCents: number
  currency: string
  items: { name: string; quantity: number }[]
}

/** Deterministic simulated fulfilment state derived from the order's age. */
export type DemoShipmentStatus = 'preparing' | 'shipped' | 'in_transit' | 'delivered'

const usersKey = (slug: string) => `gloval:demo-users:${slug}`
const sessionKey = (slug: string) => `gloval:demo-session:${slug}`
const ordersKey = (slug: string) => `gloval:demo-orders:${slug}`
const EVENT = 'gloval-demo-account:change'

function readUsers(slug: string): StoredUser[] {
  try {
    const raw = localStorage.getItem(usersKey(slug))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUsers(slug: string, users: StoredUser[]) {
  localStorage.setItem(usersKey(slug), JSON.stringify(users))
}

function readOrders(slug: string): DemoOrder[] {
  try {
    const raw = localStorage.getItem(ordersKey(slug))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Append a simulated order. Safe to call from a guest checkout — orders are
 * keyed by the buyer email so the account page can list them after sign-in with
 * the same email. Exported so the demo checkout can record on completion.
 */
export function recordDemoOrder(slug: string, order: Omit<DemoOrder, 'id' | 'createdAt'>) {
  try {
    const orders = readOrders(slug)
    orders.unshift({
      ...order,
      email: order.email.trim().toLowerCase(),
      id: `DM-${Date.now().toString(36).toUpperCase()}`,
      createdAt: Date.now(),
    })
    localStorage.setItem(ordersKey(slug), JSON.stringify(orders.slice(0, 25)))
    emitChange()
  } catch {
    /* ignore quota / serialization errors in the demo */
  }
}

/**
 * Derive a plausible shipment status + tracking number from the order age, so
 * the demo shows a moving fulfilment timeline without any backend. Newer orders
 * are "preparing"; older ones progress through shipped → in transit → delivered.
 */
export function demoShipment(order: DemoOrder): {
  status: DemoShipmentStatus
  trackingNo: string | null
} {
  const ageHours = (Date.now() - order.createdAt) / 3_600_000
  const status: DemoShipmentStatus =
    ageHours < 2 ? 'preparing' : ageHours < 24 ? 'shipped' : ageHours < 72 ? 'in_transit' : 'delivered'
  const trackingNo =
    status === 'preparing' ? null : `TR${order.id.replace(/[^0-9A-Z]/g, '').slice(-9).padStart(9, '0')}`
  return { status, trackingNo }
}

function emitChange() {
  window.dispatchEvent(new CustomEvent(EVENT))
}

export type DemoAccountApi = {
  ready: boolean
  profile: DemoProfile | null
  /** Simulated orders placed with the signed-in member's email (newest first). */
  orders: DemoOrder[]
  /** Register + sign in. Returns an error code, or null on success. */
  register: (data: DemoProfile & { password: string }) => 'email_taken' | null
  /** Sign in with email + password. Returns an error code, or null on success. */
  login: (email: string, password: string) => 'invalid_credentials' | null
  logout: () => void
  /** Upsert a profile as an account (used by the post-order "save my info"). */
  createFromCheckout: (data: DemoProfile & { password: string }) => 'email_taken' | null
  /** Update the signed-in member's saved profile fields. */
  updateProfile: (patch: Partial<DemoProfile>) => void
  /** Simulated password reset — sets a new password for a known email. */
  resetPassword: (email: string, newPassword: string) => 'unknown_email' | null
}

export function useDemoAccount(slug: string): DemoAccountApi {
  const [profile, setProfile] = useState<DemoProfile | null>(null)
  const [orders, setOrders] = useState<DemoOrder[]>([])
  const [ready, setReady] = useState(false)

  const refresh = useCallback(() => {
    try {
      const email = localStorage.getItem(sessionKey(slug))
      if (!email) {
        setProfile(null)
        setOrders([])
        return
      }
      const user = readUsers(slug).find((u) => u.email === email)
      if (user) {
        const { password: _pw, ...rest } = user
        setProfile(rest)
        setOrders(readOrders(slug).filter((o) => o.email === email))
      } else {
        setProfile(null)
        setOrders([])
      }
    } catch {
      setProfile(null)
      setOrders([])
    }
  }, [slug])

  useEffect(() => {
    refresh()
    setReady(true)
    const handler = () => refresh()
    window.addEventListener(EVENT, handler)
    window.addEventListener('storage', handler)
    return () => {
      window.removeEventListener(EVENT, handler)
      window.removeEventListener('storage', handler)
    }
  }, [refresh])

  const register: DemoAccountApi['register'] = useCallback(
    (data) => {
      const users = readUsers(slug)
      const email = data.email.trim().toLowerCase()
      if (users.some((u) => u.email === email)) return 'email_taken'
      users.push({ ...data, email })
      writeUsers(slug, users)
      localStorage.setItem(sessionKey(slug), email)
      emitChange()
      return null
    },
    [slug],
  )

  const login: DemoAccountApi['login'] = useCallback(
    (email, password) => {
      const normalized = email.trim().toLowerCase()
      const user = readUsers(slug).find((u) => u.email === normalized)
      if (!user || user.password !== password) return 'invalid_credentials'
      localStorage.setItem(sessionKey(slug), normalized)
      emitChange()
      return null
    },
    [slug],
  )

  const logout: DemoAccountApi['logout'] = useCallback(() => {
    localStorage.removeItem(sessionKey(slug))
    emitChange()
  }, [slug])

  const createFromCheckout: DemoAccountApi['createFromCheckout'] = useCallback(
    (data) => register(data),
    [register],
  )

  const updateProfile: DemoAccountApi['updateProfile'] = useCallback(
    (patch) => {
      const email = localStorage.getItem(sessionKey(slug))
      if (!email) return
      const users = readUsers(slug)
      const idx = users.findIndex((u) => u.email === email)
      if (idx === -1) return
      // Email is the account key here, so it stays fixed; only mutable fields change.
      const { email: _ignored, ...rest } = patch
      users[idx] = { ...users[idx], ...rest }
      writeUsers(slug, users)
      emitChange()
    },
    [slug],
  )

  const resetPassword: DemoAccountApi['resetPassword'] = useCallback(
    (email, newPassword) => {
      const normalized = email.trim().toLowerCase()
      const users = readUsers(slug)
      const idx = users.findIndex((u) => u.email === normalized)
      if (idx === -1) return 'unknown_email'
      users[idx] = { ...users[idx], password: newPassword }
      writeUsers(slug, users)
      emitChange()
      return null
    },
    [slug],
  )

  return {
    ready,
    profile,
    orders,
    register,
    login,
    logout,
    createFromCheckout,
    updateProfile,
    resetPassword,
  }
}
