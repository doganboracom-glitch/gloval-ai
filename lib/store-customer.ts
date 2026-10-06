'use server'

import 'server-only'
import { cookies, headers } from 'next/headers'
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/notify'

/**
 * Per-store customer accounts — fully separate from the platform/owner
 * Supabase Auth session. A customer belongs to exactly one store (project) and
 * authenticates with email + password. Passwords are scrypt-hashed; the
 * session is a short signed cookie carrying only the customer id + project id.
 *
 * All DB access uses the service-role admin client (store_customers is RLS
 * deny-by-default), and every read is scoped by project_id so one store can
 * never see another store's customers.
 */

/**
 * Invoice profile captured at checkout / editable in the account. Individual
 * (bireysel) collects an optional TC kimlik no; corporate (kurumsal) collects
 * company title + tax office + tax number, as required by Turkish e-invoice
 * practice.
 */
export type InvoiceInfo = {
  type: 'individual' | 'corporate'
  // Individual
  tckn?: string
  // Corporate
  companyName?: string
  taxOffice?: string
  taxNumber?: string
  // Shared
  address?: string
}

export type StoreCustomer = {
  id: string
  email: string
  name: string
  phone: string
  city: string
  address: string
  invoice: InvoiceInfo | null
}

export type CustomerResult =
  | { ok: true; customer: StoreCustomer }
  | { ok: false; error: string }

const COOKIE_PREFIX = 'store_customer_'
const SESSION_TTL_DAYS = 30

/* ----------------------------- password hashing ---------------------------- */

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('base64')}:${derived.toString('base64')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(':')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  const derived = scryptSync(password, salt, expected.length)
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

/* ------------------------------ session cookie ------------------------------ */

function sessionSecret(): string {
  const s = process.env.SUPABASE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No secret available for customer sessions.')
  return s
}

function sign(value: string): string {
  return createHmac('sha256', sessionSecret()).update(value).digest('base64url')
}

function makeToken(customerId: string, projectId: string): string {
  const exp = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const payload = `${customerId}.${projectId}.${exp}`
  return `${payload}.${sign(payload)}`
}

function parseToken(
  token: string | undefined,
): { customerId: string; projectId: string } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [customerId, projectId, expStr, sig] = parts
  const payload = `${customerId}.${projectId}.${expStr}`
  // Constant-time signature comparison.
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }
  if (Number(expStr) < Date.now()) return null
  return { customerId, projectId }
}

function cookieName(projectId: string): string {
  return `${COOKIE_PREFIX}${projectId.slice(0, 8)}`
}

/* ------------------------------- project lookup ----------------------------- */

async function resolveProjectId(storeSlug: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('projects')
    .select('id')
    .eq('slug', storeSlug)
    .eq('published', true)
    .maybeSingle()
  return data?.id ?? null
}

function toCustomer(row: {
  id: string
  email: string
  name: string
  phone: string
  city: string
  address: string
  invoice?: unknown
}): StoreCustomer {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? '',
    phone: row.phone ?? '',
    city: row.city ?? '',
    address: row.address ?? '',
    invoice: normalizeInvoice(row.invoice),
  }
}

/** Coerces a stored jsonb value into a valid InvoiceInfo (or null). */
function normalizeInvoice(raw: unknown): InvoiceInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const type = r.type === 'corporate' ? 'corporate' : 'individual'
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  return {
    type,
    tckn: str(r.tckn),
    companyName: str(r.companyName),
    taxOffice: str(r.taxOffice),
    taxNumber: str(r.taxNumber),
    address: str(r.address),
  }
}

async function setSession(projectId: string, customerId: string) {
  const jar = await cookies()
  jar.set(cookieName(projectId), makeToken(customerId, projectId), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

/* -------------------------------- public API -------------------------------- */

export async function registerStoreCustomer(input: {
  storeSlug: string
  email: string
  password: string
  name?: string
  phone?: string
  city?: string
  address?: string
}): Promise<CustomerResult> {
  const email = input.email.trim().toLowerCase()
  const password = input.password
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Geçerli bir e-posta girin.' }
  }
  if (!password || password.length < 6) {
    return { ok: false, error: 'Şifre en az 6 karakter olmalıdır.' }
  }

  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false, error: 'Mağaza bulunamadı.' }

  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('store_customers')
    .select('id')
    .eq('project_id', projectId)
    .ilike('email', email)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'Bu e-posta ile zaten bir hesap var. Giriş yapın.' }
  }

  const { data, error } = await admin
    .from('store_customers')
    .insert({
      project_id: projectId,
      email,
      password_hash: hashPassword(password),
      name: input.name?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      city: input.city?.trim() ?? '',
      address: input.address?.trim() ?? '',
    })
    .select('id, email, name, phone, city, address, invoice')
    .single()

  if (error || !data) {
    return { ok: false, error: 'Hesap oluşturulamadı. Tekrar deneyin.' }
  }

  await setSession(projectId, data.id)
  return { ok: true, customer: toCustomer(data) }
}

export async function loginStoreCustomer(input: {
  storeSlug: string
  email: string
  password: string
}): Promise<CustomerResult> {
  const email = input.email.trim().toLowerCase()
  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false, error: 'Mağaza bulunamadı.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('id, email, name, phone, city, address, invoice, password_hash')
    .eq('project_id', projectId)
    .ilike('email', email)
    .maybeSingle()

  if (!data || !verifyPassword(input.password, data.password_hash)) {
    return { ok: false, error: 'E-posta veya şifre hatalı.' }
  }

  await setSession(projectId, data.id)
  return { ok: true, customer: toCustomer(data) }
}

export async function logoutStoreCustomer(storeSlug: string): Promise<void> {
  const projectId = await resolveProjectId(storeSlug)
  if (!projectId) return
  const jar = await cookies()
  jar.delete(cookieName(projectId))
}

/**
 * Returns the logged-in customer for a store, or null. Safe to call from
 * server components; reads the signed cookie and re-loads from the DB scoped
 * to the resolved project.
 */
export async function getCurrentStoreCustomer(
  storeSlug: string,
): Promise<StoreCustomer | null> {
  const projectId = await resolveProjectId(storeSlug)
  if (!projectId) return null

  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('id, email, name, phone, city, address, invoice')
    .eq('project_id', projectId)
    .eq('id', parsed.customerId)
    .maybeSingle()

  return data ? toCustomer(data) : null
}

/**
 * Internal helper for order attribution — resolves the current customer id for
 * a given already-known project id (avoids a second slug lookup in createOrder).
 */
export async function getCurrentCustomerIdForProject(
  projectId: string,
): Promise<string | null> {
  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) return null
  return parsed.customerId
}

export type ShippingStatus =
  | 'preparing'
  | 'shipped'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'

export type CustomerOrder = {
  id: string
  created_at: string
  status: string
  total_cents: number
  currency: string
  item_count: number
  shipping_status: ShippingStatus
  tracking_carrier: string | null
  tracking_number: string | null
  shipped_at: string | null
  delivered_at: string | null
}

const SHIPPING_STATUSES: ShippingStatus[] = [
  'preparing',
  'shipped',
  'in_transit',
  'delivered',
  'cancelled',
]

function toShippingStatus(v: unknown): ShippingStatus {
  return SHIPPING_STATUSES.includes(v as ShippingStatus)
    ? (v as ShippingStatus)
    : 'preparing'
}

/** Order history (with shipping/tracking) for the logged-in store customer. */
export async function getStoreCustomerOrders(
  storeSlug: string,
): Promise<CustomerOrder[]> {
  const projectId = await resolveProjectId(storeSlug)
  if (!projectId) return []
  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('ecommerce_orders')
    .select(
      'id, created_at, status, total_cents, currency, shipping_status, tracking_carrier, tracking_number, shipped_at, delivered_at, ecommerce_order_items(count)',
    )
    .eq('project_id', projectId)
    .eq('customer_id', parsed.customerId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (!data) return []
  return data.map((o) => {
    const rel = (o as { ecommerce_order_items?: { count: number }[] })
      .ecommerce_order_items
    return {
      id: o.id,
      created_at: o.created_at,
      status: o.status,
      total_cents: o.total_cents ?? 0,
      currency: o.currency ?? 'TRY',
      item_count: Array.isArray(rel) && rel[0] ? rel[0].count : 0,
      shipping_status: toShippingStatus(o.shipping_status),
      tracking_carrier: o.tracking_carrier ?? null,
      tracking_number: o.tracking_number ?? null,
      shipped_at: o.shipped_at ?? null,
      delivered_at: o.delivered_at ?? null,
    }
  })
}

/* --------------------------- profile & invoice edit -------------------------- */

/** Updates the logged-in customer's contact + saved invoice profile. */
export async function updateStoreCustomerProfile(input: {
  storeSlug: string
  name?: string
  phone?: string
  city?: string
  address?: string
  invoice?: InvoiceInfo | null
}): Promise<CustomerResult> {
  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false, error: 'Mağaza bulunamadı.' }
  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) {
    return { ok: false, error: 'Oturum bulunamadı. Giriş yapın.' }
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.phone !== undefined) patch.phone = input.phone.trim()
  if (input.city !== undefined) patch.city = input.city.trim()
  if (input.address !== undefined) patch.address = input.address.trim()
  if (input.invoice !== undefined) patch.invoice = input.invoice

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_customers')
    .update(patch)
    .eq('project_id', projectId)
    .eq('id', parsed.customerId)
    .select('id, email, name, phone, city, address, invoice')
    .single()

  if (error || !data) return { ok: false, error: 'Güncellenemedi. Tekrar deneyin.' }
  return { ok: true, customer: toCustomer(data) }
}

/** Changes the logged-in customer's password (requires the current one). */
export async function changeStoreCustomerPassword(input: {
  storeSlug: string
  currentPassword: string
  newPassword: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.newPassword || input.newPassword.length < 6) {
    return { ok: false, error: 'Yeni şifre en az 6 karakter olmalıdır.' }
  }
  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false, error: 'Mağaza bulunamadı.' }
  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) {
    return { ok: false, error: 'Oturum bulunamadı. Giriş yapın.' }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('password_hash')
    .eq('project_id', projectId)
    .eq('id', parsed.customerId)
    .maybeSingle()

  if (!data || !verifyPassword(input.currentPassword, data.password_hash)) {
    return { ok: false, error: 'Mevcut şifre hatalı.' }
  }

  const { error } = await admin
    .from('store_customers')
    .update({ password_hash: hashPassword(input.newPassword) })
    .eq('project_id', projectId)
    .eq('id', parsed.customerId)

  if (error) return { ok: false, error: 'Şifre değiştirilemedi.' }
  return { ok: true }
}

/* ------------------------------ password reset ------------------------------ */

function hashResetToken(token: string): string {
  return createHmac('sha256', sessionSecret()).update(token).digest('hex')
}

/**
 * Starts a password reset: generates a one-time token, stores its hash with a
 * 1-hour expiry, and returns the raw token + email so the caller can send the
 * reset link. To avoid account enumeration, callers should show the same
 * "if an account exists, we sent an email" message regardless of the result.
 */
export async function requestStoreCustomerPasswordReset(input: {
  storeSlug: string
  email: string
}): Promise<{ ok: boolean; token?: string; email?: string; customerName?: string }> {
  const email = input.email.trim().toLowerCase()
  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false }

  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('id, name')
    .eq('project_id', projectId)
    .ilike('email', email)
    .maybeSingle()

  if (!data) return { ok: false }

  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  await admin
    .from('store_customers')
    .update({ reset_token_hash: hashResetToken(token), reset_token_expires: expires })
    .eq('project_id', projectId)
    .eq('id', data.id)

  return { ok: true, token, email, customerName: data.name ?? '' }
}

/**
 * Public action for the "forgot password" form: generates a reset token, emails
 * the customer a reset link (via Resend), and ALWAYS returns ok — the UI shows
 * the same confirmation whether or not the email exists, to prevent account
 * enumeration. No-ops gracefully when email delivery isn't configured.
 */
export async function sendStoreCustomerPasswordReset(input: {
  storeSlug: string
  email: string
}): Promise<{ ok: true }> {
  const result = await requestStoreCustomerPasswordReset(input)
  if (result.ok && result.token && result.email) {
    try {
      const h = await headers()
      const host = h.get('x-forwarded-host') || h.get('host') || ''
      const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
      const base = host ? `${proto}://${host}` : ''
      const url =
        `${base}/site/${encodeURIComponent(input.storeSlug)}/hesap/sifre-yenile` +
        `?email=${encodeURIComponent(result.email)}&token=${encodeURIComponent(result.token)}`

      await sendTransactionalEmail({
        to: result.email,
        subject: 'Şifre sıfırlama talebi',
        text: `Şifrenizi sıfırlamak için bağlantıya gidin (1 saat geçerli): ${url}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:#1a1a1a">
          <p>Merhaba${result.customerName ? ' ' + result.customerName : ''},</p>
          <p>Hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıya tıklayın. Bağlantı <strong>1 saat</strong> geçerlidir.</p>
          <p style="margin:24px 0"><a href="${url}" style="background:#7c3aed;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Şifremi sıfırla</a></p>
          <p style="color:#666">Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.</p>
        </div>`,
      })
    } catch (err) {
      console.log('[v0] reset email error:', err instanceof Error ? err.message : err)
    }
  }
  return { ok: true }
}

/** Completes a password reset given the raw token + new password. */
export async function resetStoreCustomerPassword(input: {
  storeSlug: string
  email: string
  token: string
  newPassword: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.newPassword || input.newPassword.length < 6) {
    return { ok: false, error: 'Yeni şifre en az 6 karakter olmalıdır.' }
  }
  const email = input.email.trim().toLowerCase()
  const projectId = await resolveProjectId(input.storeSlug)
  if (!projectId) return { ok: false, error: 'Mağaza bulunamadı.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('id, reset_token_hash, reset_token_expires')
    .eq('project_id', projectId)
    .ilike('email', email)
    .maybeSingle()

  if (!data || !data.reset_token_hash || !data.reset_token_expires) {
    return { ok: false, error: 'Bağlantı geçersiz veya süresi dolmuş.' }
  }
  if (new Date(data.reset_token_expires).getTime() < Date.now()) {
    return { ok: false, error: 'Bağlantının süresi dolmuş. Yeniden isteyin.' }
  }
  const expected = Buffer.from(data.reset_token_hash)
  const actual = Buffer.from(hashResetToken(input.token))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, error: 'Bağlantı geçersiz.' }
  }

  const { error } = await admin
    .from('store_customers')
    .update({
      password_hash: hashPassword(input.newPassword),
      reset_token_hash: null,
      reset_token_expires: null,
    })
    .eq('project_id', projectId)
    .eq('id', data.id)

  if (error) return { ok: false, error: 'Şifre sıfırlanamadı.' }
  return { ok: true }
}
