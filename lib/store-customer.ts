'use server'

import 'server-only'
import { cookies, headers } from 'next/headers'
import { after } from 'next/server'
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { hmacBase64Url, hmacHex } from '@/lib/store-customer-keys'
import { anyRateLimited, type RateLimitRule } from '@/lib/store-auth-rate-limit'
import { sanitizeInvoice } from '@/lib/store-invoice'
import {
  RESET_TOKEN_TTL_MINUTES,
  buildPasswordResetUrl,
  renderStoreResetEmail,
} from '@/lib/store-customer-email'

/**
 * Per-store customer accounts — fully separate from the platform/owner
 * Supabase Auth session. A customer belongs to exactly one store (project) and
 * authenticates with email + password. Passwords are scrypt-hashed; the
 * session is a signed cookie carrying the customer id, project id, expiry and
 * a password version.
 *
 * Security properties (see lib/store-customer.test.ts):
 * - Every export of this file is a client-callable server action, so none of
 *   them returns secrets (reset tokens, hashes) to the caller.
 * - Sessions are bound to `password_changed_at`: changing or resetting the
 *   password invalidates every session issued before it.
 * - Session signatures, reset-token hashes and rate-limit keys use separate
 *   derived keys (lib/store-customer-keys.ts).
 * - Reset links are built from configuration, never from request headers.
 * - Register / login / reset request / reset completion are rate limited.
 *
 * All DB access uses the service-role admin client (store_customers is RLS
 * deny-by-default), and every read is scoped by project_id so one store can
 * never see another store's customers. E-mail lookups are exact equality on
 * the lower-cased address (never LIKE/ILIKE, so `%` and `_` are plain chars).
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

const LIMITS = {
  email: 254,
  passwordMin: 6,
  passwordMax: 128,
  name: 100,
  phone: 30,
  city: 100,
  address: 500,
  token: 200,
} as const

const MSG = {
  rateLimited: 'Çok fazla deneme, lütfen daha sonra tekrar deneyin.',
  invalidEmail: 'Geçerli bir e-posta girin.',
  passwordShort: `Şifre en az ${LIMITS.passwordMin} karakter olmalıdır.`,
  passwordLong: `Şifre en fazla ${LIMITS.passwordMax} karakter olabilir.`,
  storeNotFound: 'Mağaza bulunamadı.',
  loginFailed: 'E-posta veya şifre hatalı.',
  emailTaken: 'Bu e-posta ile zaten bir hesap var. Giriş yapın.',
  noSession: 'Oturum bulunamadı. Giriş yapın.',
  invalidInput: 'Girilen bilgiler geçersiz.',
  invalidInvoice: 'Fatura bilgileri geçersiz.',
  resetInvalid: 'Bağlantı geçersiz veya süresi dolmuş. Yeniden isteyin.',
} as const

type DbError = { code?: string; message?: string } | null

type CustomerRow = {
  id: string
  email: string
  name: string | null
  phone: string | null
  city: string | null
  address: string | null
  invoice?: unknown
  password_hash: string
  password_changed_at?: string | null
}

/* ----------------------------- password hashing ---------------------------- */

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, 64)
  return `${salt.toString('base64')}:${derived.toString('base64')}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = (stored ?? '').split(':')
  if (!saltB64 || !hashB64) return false
  const salt = Buffer.from(saltB64, 'base64')
  const expected = Buffer.from(hashB64, 'base64')
  if (expected.length === 0) return false
  const derived = await scryptAsync(password, salt, expected.length)
  return expected.length === derived.length && timingSafeEqual(expected, derived)
}

let dummyHash: Promise<string> | null = null

/**
 * Verifies against a throwaway hash so "no such account" costs the same scrypt
 * work as "wrong password" (no timing oracle for account existence).
 */
async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(password, await dummyHash)
}

/* ------------------------------ session cookie ------------------------------ */

function sign(value: string): string {
  return hmacBase64Url('session', `session|${value}`)
}

/** Session version derived from the row's `password_changed_at` (0 if unset). */
function sessionVersion(row: { password_changed_at?: string | null }): number {
  const t = row.password_changed_at ? Date.parse(row.password_changed_at) : NaN
  return Number.isFinite(t) ? t : 0
}

function makeToken(customerId: string, projectId: string, version: number): string {
  const exp = Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000
  const payload = `${customerId}.${projectId}.${exp}.${version}`
  return `${payload}.${sign(payload)}`
}

function parseToken(
  token: string | undefined,
): { customerId: string; projectId: string; version: number } | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 5) return null
  const [customerId, projectId, expStr, versionStr, sig] = parts
  const payload = `${customerId}.${projectId}.${expStr}.${versionStr}`
  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }
  if (!(Number(expStr) >= Date.now())) return null
  const version = Number(versionStr)
  if (!Number.isFinite(version)) return null
  return { customerId, projectId, version }
}

function cookieName(projectId: string): string {
  return `${COOKIE_PREFIX}${projectId.slice(0, 8)}`
}

async function setSession(projectId: string, customerId: string, version: number) {
  const jar = await cookies()
  jar.set(cookieName(projectId), makeToken(customerId, projectId, version), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  })
}

/* ------------------------------ shared helpers ------------------------------ */

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

function normalizeEmail(raw: unknown): string {
  return asString(raw).trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= LIMITS.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
}

async function clientIp(): Promise<string> {
  const h = await headers()
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (forwarded || h.get('x-real-ip')?.trim() || 'unknown').slice(0, 64)
}

async function resolveProject(
  storeSlug: string,
): Promise<{ id: string; name: string } | null> {
  const slug = asString(storeSlug)
  if (!slug || slug.length > 100) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('projects')
    .select('id, name')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle()
  return data ? { id: data.id, name: asString(data.name) } : null
}

function toCustomer(row: {
  id: string
  email: string
  name?: string | null
  phone?: string | null
  city?: string | null
  address?: string | null
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

async function findCustomerByEmail(
  projectId: string,
  email: string,
): Promise<CustomerRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('*')
    .eq('project_id', projectId)
    .eq('email', email)
    .limit(1)
  const rows = (data ?? []) as CustomerRow[]
  return rows[0] ?? null
}

async function findCustomerById(
  projectId: string,
  customerId: string,
): Promise<CustomerRow | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('store_customers')
    .select('*')
    .eq('project_id', projectId)
    .eq('id', customerId)
    .maybeSingle()
  return (data as CustomerRow | null) ?? null
}

/**
 * Resolves the logged-in customer of a project from the signed cookie AND the
 * database: the cookie's password version must equal the row's current one, so
 * a password change/reset revokes every earlier session server-side.
 */
async function authenticate(projectId: string): Promise<CustomerRow | null> {
  const jar = await cookies()
  const parsed = parseToken(jar.get(cookieName(projectId))?.value)
  if (!parsed || parsed.projectId !== projectId) return null
  const row = await findCustomerById(projectId, parsed.customerId)
  if (!row || sessionVersion(row) !== parsed.version) return null
  return row
}

function isMissingColumn(error: DbError): boolean {
  if (!error) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /password_changed_at/.test(error.message ?? '')
  )
}

/**
 * Runs a password-changing write that also bumps `password_changed_at`.
 * If that column does not exist yet (migration 031 not applied) the write is
 * retried without it so customers can still change/reset their password; the
 * session revocation only takes effect once the migration is applied.
 */
async function writeWithPasswordVersion<T>(
  run: (extra: { password_changed_at?: string }) => PromiseLike<{ data: T | null; error: DbError }>,
): Promise<{ data: T | null; error: DbError; version: number }> {
  const changedAt = new Date().toISOString()
  const res = await run({ password_changed_at: changedAt })
  if (res.error && isMissingColumn(res.error)) {
    console.log('[v0] store_customers.password_changed_at missing; apply scripts/031 to revoke sessions on password change')
    const retry = await run({})
    return { ...retry, version: 0 }
  }
  return { ...res, version: Date.parse(changedAt) }
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return MSG.invalidInput
  if (password.length < LIMITS.passwordMin) return MSG.passwordShort
  if (password.length > LIMITS.passwordMax) return MSG.passwordLong
  return null
}

type ProfileFields = { name?: unknown; phone?: unknown; city?: unknown; address?: unknown }

const PROFILE_LABELS = {
  name: 'Ad',
  phone: 'Telefon',
  city: 'Şehir',
  address: 'Adres',
} as const

/** Trims and length-checks the optional contact fields that were provided. */
function parseProfileFields(
  input: ProfileFields,
): { ok: true; value: Partial<Record<keyof typeof PROFILE_LABELS, string>> } | { ok: false; error: string } {
  const value: Partial<Record<keyof typeof PROFILE_LABELS, string>> = {}
  for (const key of Object.keys(PROFILE_LABELS) as Array<keyof typeof PROFILE_LABELS>) {
    const raw = input[key]
    if (raw === undefined) continue
    if (typeof raw !== 'string') return { ok: false, error: MSG.invalidInput }
    const trimmed = raw.trim()
    if (trimmed.length > LIMITS[key]) {
      return { ok: false, error: `${PROFILE_LABELS[key]} en fazla ${LIMITS[key]} karakter olabilir.` }
    }
    value[key] = trimmed
  }
  return { ok: true, value }
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
  const ip = await clientIp()
  if (await anyRateLimited([{ name: 'register-ip', key: ip, limit: 5, windowSeconds: 3600 }])) {
    return { ok: false, error: MSG.rateLimited }
  }

  const email = normalizeEmail(input?.email)
  if (!isValidEmail(email)) return { ok: false, error: MSG.invalidEmail }
  const passwordError = validatePassword(input?.password)
  if (passwordError) return { ok: false, error: passwordError }
  const profile = parseProfileFields(input)
  if (!profile.ok) return { ok: false, error: profile.error }

  const project = await resolveProject(input.storeSlug)
  if (!project) return { ok: false, error: MSG.storeNotFound }

  // Hash before the existence check so "taken" and "free" cost the same time.
  const passwordHash = await hashPassword(input.password)

  if (await findCustomerByEmail(project.id, email)) {
    return { ok: false, error: MSG.emailTaken }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_customers')
    .insert({
      project_id: project.id,
      email,
      password_hash: passwordHash,
      name: profile.value.name ?? '',
      phone: profile.value.phone ?? '',
      city: profile.value.city ?? '',
      address: profile.value.address ?? '',
    })
    .select('*')
    .single()

  if (error?.code === '23505') return { ok: false, error: MSG.emailTaken }
  if (error || !data) {
    return { ok: false, error: 'Hesap oluşturulamadı. Tekrar deneyin.' }
  }

  const row = data as CustomerRow
  await setSession(project.id, row.id, sessionVersion(row))
  return { ok: true, customer: toCustomer(row) }
}

export async function loginStoreCustomer(input: {
  storeSlug: string
  email: string
  password: string
}): Promise<CustomerResult> {
  const email = normalizeEmail(input?.email)
  const password = asString(input?.password)
  const ip = await clientIp()
  const slug = asString(input?.storeSlug)

  const rules: RateLimitRule[] = [
    { name: 'login', key: `${slug}|${ip}|${email}`, limit: 10, windowSeconds: 15 * 60 },
    // Caps CPU spent on scrypt by one source rotating through many e-mails.
    { name: 'login-ip', key: ip, limit: 60, windowSeconds: 15 * 60 },
  ]
  if (await anyRateLimited(rules)) return { ok: false, error: MSG.rateLimited }

  if (!isValidEmail(email) || password.length > LIMITS.passwordMax) {
    await burnPasswordCheck(password.slice(0, LIMITS.passwordMax))
    return { ok: false, error: MSG.loginFailed }
  }

  const project = await resolveProject(slug)
  if (!project) {
    await burnPasswordCheck(password)
    return { ok: false, error: MSG.storeNotFound }
  }

  const row = await findCustomerByEmail(project.id, email)
  if (!row) {
    await burnPasswordCheck(password)
    return { ok: false, error: MSG.loginFailed }
  }
  if (!(await verifyPassword(password, row.password_hash))) {
    return { ok: false, error: MSG.loginFailed }
  }

  await setSession(project.id, row.id, sessionVersion(row))
  return { ok: true, customer: toCustomer(row) }
}

export async function logoutStoreCustomer(storeSlug: string): Promise<void> {
  const project = await resolveProject(storeSlug)
  if (!project) return
  const jar = await cookies()
  jar.delete(cookieName(project.id))
}

/**
 * Returns the logged-in customer for a store, or null. Safe to call from
 * server components; validates the signed cookie against the database.
 */
export async function getCurrentStoreCustomer(
  storeSlug: string,
): Promise<StoreCustomer | null> {
  const project = await resolveProject(storeSlug)
  if (!project) return null
  const row = await authenticate(project.id)
  return row ? toCustomer(row) : null
}

/**
 * Internal helper for order attribution — resolves the current customer id for
 * a given already-known project id (avoids a second slug lookup in createOrder).
 */
export async function getCurrentCustomerIdForProject(
  projectId: string,
): Promise<string | null> {
  const row = await authenticate(asString(projectId))
  return row?.id ?? null
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
  const project = await resolveProject(storeSlug)
  if (!project) return []
  const customer = await authenticate(project.id)
  if (!customer) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('ecommerce_orders')
    .select(
      'id, created_at, status, total_cents, currency, shipping_status, tracking_carrier, tracking_number, shipped_at, delivered_at, ecommerce_order_items(count)',
    )
    .eq('project_id', project.id)
    .eq('customer_id', customer.id)
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
  const project = await resolveProject(input?.storeSlug)
  if (!project) return { ok: false, error: MSG.storeNotFound }
  const customer = await authenticate(project.id)
  if (!customer) return { ok: false, error: MSG.noSession }

  const fields = parseProfileFields(input)
  if (!fields.ok) return { ok: false, error: fields.error }

  const patch: Record<string, unknown> = { ...fields.value }
  if (input.invoice !== undefined) {
    const invoice = sanitizeInvoice(input.invoice, 'strict')
    if (!invoice.ok) return { ok: false, error: MSG.invalidInvoice }
    patch.invoice = invoice.value
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, customer: toCustomer(customer) }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('store_customers')
    .update(patch)
    .eq('project_id', project.id)
    .eq('id', customer.id)
    .select('*')
    .single()

  if (error || !data) return { ok: false, error: 'Güncellenemedi. Tekrar deneyin.' }
  return { ok: true, customer: toCustomer(data as CustomerRow) }
}

/**
 * Changes the logged-in customer's password (requires the current one).
 * Every other session is revoked; the current device gets a fresh cookie.
 */
export async function changeStoreCustomerPassword(input: {
  storeSlug: string
  currentPassword: string
  newPassword: string
}): Promise<{ ok: boolean; error?: string }> {
  const newPasswordError = validatePassword(input?.newPassword)
  if (newPasswordError) {
    return { ok: false, error: newPasswordError.replace('Şifre', 'Yeni şifre') }
  }
  const currentPassword = asString(input.currentPassword)
  if (currentPassword.length > LIMITS.passwordMax) {
    return { ok: false, error: 'Mevcut şifre hatalı.' }
  }

  const project = await resolveProject(input.storeSlug)
  if (!project) return { ok: false, error: MSG.storeNotFound }
  const customer = await authenticate(project.id)
  if (!customer) return { ok: false, error: MSG.noSession }

  if (
    await anyRateLimited([
      { name: 'change-password', key: customer.id, limit: 10, windowSeconds: 15 * 60 },
    ])
  ) {
    return { ok: false, error: MSG.rateLimited }
  }

  if (!(await verifyPassword(currentPassword, customer.password_hash))) {
    return { ok: false, error: 'Mevcut şifre hatalı.' }
  }

  const newHash = await hashPassword(input.newPassword)
  const admin = createAdminClient()
  const { error, version } = await writeWithPasswordVersion((extra) =>
    admin
      .from('store_customers')
      .update({
        password_hash: newHash,
        reset_token_hash: null,
        reset_token_expires: null,
        ...extra,
      })
      .eq('project_id', project.id)
      .eq('id', customer.id)
      .select('id'),
  )

  if (error) return { ok: false, error: 'Şifre değiştirilemedi.' }
  await setSession(project.id, customer.id, version)
  return { ok: true }
}

/* ------------------------------ password reset ------------------------------ */

function hashResetToken(token: string): string {
  return hmacHex('reset-token', token)
}

/** Creates + stores a single-use reset token and e-mails it to the account. */
async function issueAndSendReset(args: {
  storeSlug: string
  storeName: string
  projectId: string
  customer: CustomerRow
  lang: ReturnType<typeof resolveEmailLang>
}): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000).toISOString()

  const admin = createAdminClient()
  const { error } = await admin
    .from('store_customers')
    .update({ reset_token_hash: hashResetToken(token), reset_token_expires: expires })
    .eq('project_id', args.projectId)
    .eq('id', args.customer.id)
  if (error) {
    console.log('[v0] reset token store failed:', error.message)
    return
  }

  const url = buildPasswordResetUrl(args.storeSlug, token)
  const mail = renderStoreResetEmail({
    lang: args.lang,
    storeName: args.storeName,
    storeSlug: args.storeSlug,
    customerName: args.customer.name ?? '',
    url,
  })
  // Always the registered account address, never the raw form input.
  await sendTransactionalEmail({ to: args.customer.email, ...mail })
}

/**
 * Runs `work` after the response is sent so the response time is identical for
 * existing and unknown accounts. Outside a request scope (after() unavailable)
 * it runs inline.
 */
async function runAfterResponse(work: () => Promise<void>): Promise<void> {
  const safe = async () => {
    try {
      await work()
    } catch (err) {
      console.log('[v0] reset email error:', err instanceof Error ? err.message : err)
    }
  }
  try {
    after(safe)
  } catch {
    await safe()
  }
}

const RESET_GENERIC_OK = { ok: true } as const

/**
 * Public action for the "forgot password" form. The result is a constant: it
 * never carries a token, an e-mail address or any hint whether the account
 * exists. If it does, a single-use link (30 min) is e-mailed to the REGISTERED
 * address after the response has been sent. The only non-generic outcome is
 * the rate limit, which applies identically to every e-mail address.
 */
export async function sendStoreCustomerPasswordReset(input: {
  storeSlug: string
  email: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = normalizeEmail(input?.email)
  const slug = asString(input?.storeSlug)
  const ip = await clientIp()

  if (
    await anyRateLimited([
      { name: 'reset-email', key: `${slug}|${email}`, limit: 3, windowSeconds: 3600 },
      { name: 'reset-ip', key: ip, limit: 3, windowSeconds: 3600 },
    ])
  ) {
    return { ok: false, error: MSG.rateLimited }
  }

  if (!isValidEmail(email)) return RESET_GENERIC_OK

  const project = await resolveProject(slug)
  if (!project) return RESET_GENERIC_OK

  const customer = await findCustomerByEmail(project.id, email)
  if (!customer) return RESET_GENERIC_OK

  const h = await headers()
  const lang = resolveEmailLang(h.get('accept-language')?.split(',')[0])

  await runAfterResponse(() =>
    issueAndSendReset({
      storeSlug: slug,
      storeName: project.name || slug,
      projectId: project.id,
      customer,
      lang,
    }),
  )
  return RESET_GENERIC_OK
}

/**
 * Completes a password reset with the raw token from the e-mailed link. The
 * token is looked up by its hash and consumed atomically (single use), must
 * not be expired, and revokes every existing session of the account.
 */
export async function resetStoreCustomerPassword(input: {
  storeSlug: string
  token: string
  newPassword: string
}): Promise<{ ok: boolean; error?: string }> {
  const passwordError = validatePassword(input?.newPassword)
  if (passwordError) return { ok: false, error: passwordError.replace('Şifre', 'Yeni şifre') }

  const ip = await clientIp()
  if (
    await anyRateLimited([{ name: 'reset-complete-ip', key: ip, limit: 10, windowSeconds: 3600 }])
  ) {
    return { ok: false, error: MSG.rateLimited }
  }

  const token = asString(input.token)
  if (token.length < 20 || token.length > LIMITS.token) {
    return { ok: false, error: MSG.resetInvalid }
  }

  const project = await resolveProject(input.storeSlug)
  if (!project) return { ok: false, error: MSG.storeNotFound }

  const newHash = await hashPassword(input.newPassword)
  const admin = createAdminClient()
  const { data, error } = await writeWithPasswordVersion<Array<{ id: string }>>((extra) =>
    admin
      .from('store_customers')
      .update({
        password_hash: newHash,
        reset_token_hash: null,
        reset_token_expires: null,
        ...extra,
      })
      .eq('project_id', project.id)
      .eq('reset_token_hash', hashResetToken(token))
      .gt('reset_token_expires', new Date().toISOString())
      .select('id'),
  )

  if (error) return { ok: false, error: 'Şifre sıfırlanamadı.' }
  if (!data || data.length === 0) return { ok: false, error: MSG.resetInvalid }
  return { ok: true }
}
