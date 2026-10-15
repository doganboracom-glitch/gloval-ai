'use server'

import { createHmac, randomBytes } from 'node:crypto'
import { checkRateLimit } from '@/lib/rate-limit'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { createClient } from '@/lib/supabase/server'

const ONBOARDING_URL = 'https://onboarding.iyzipay.com/api/v1/merchants'
const MAX_NAME_LENGTH = 80
const MAX_EMAIL_LENGTH = 254
const MAX_PHONE_LENGTH = 20

function configured() {
  return Boolean(
    process.env.IYZICO_INSTANT_DEVELOPER_KEY &&
      process.env.IYZICO_INSTANT_APP_NAME &&
      process.env.IYZICO_INSTANT_SALT_KEY,
  )
}

export type IyzicoInstantPrefill = {
  enabled: boolean
  email: string
  phone: string
  firstName: string
  lastName: string
}

export type IyzicoInstantResult =
  | { ok: true }
  | { ok: false; error: 'invalid_name' | 'invalid_email' | 'invalid_phone' | 'rate_limited' | 'unavailable' }

function normalizePhone(value: string): string | null {
  const digits = value.replace(/[\s().-]/g, '')
  if (/^05\d{9}$/.test(digits)) return `+90${digits.slice(1)}`
  if (/^5\d{9}$/.test(digits)) return `+90${digits}`
  if (/^90?5\d{9}$/.test(digits)) return `+${digits.startsWith('90') ? digits : `90${digits}`}`
  if (/^\+905\d{9}$/.test(digits)) return digits
  return null
}

function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export async function getIyzicoInstantPrefill(projectId: string): Promise<IyzicoInstantPrefill> {
  await authorizeProjectOwner(projectId)
  if (!configured()) return { enabled: false, email: '', phone: '', firstName: '', lastName: '' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const fullName = cleanName(metadata.full_name ?? metadata.name)
  const parts = fullName.split(' ').filter(Boolean)
  return {
    enabled: true,
    email: user?.email ?? '',
    phone: typeof user?.phone === 'string' ? user.phone : (typeof metadata.phone === 'string' ? metadata.phone : ''),
    firstName: cleanName(metadata.first_name ?? metadata.firstName ?? parts[0] ?? ''),
    lastName: cleanName(metadata.last_name ?? metadata.lastName ?? parts.slice(1).join(' ')),
  }
}

export async function submitIyzicoInstant(
  projectId: string,
  input: { firstName: string; lastName: string; email: string; phone: string },
): Promise<IyzicoInstantResult> {
  await authorizeProjectOwner(projectId)
  if (!configured()) return { ok: false, error: 'unavailable' }

  const firstName = cleanName(input.firstName)
  const lastName = cleanName(input.lastName)
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  if (!firstName || !lastName || firstName.length > MAX_NAME_LENGTH || lastName.length > MAX_NAME_LENGTH) {
    return { ok: false, error: 'invalid_name' }
  }
  if (email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'invalid_email' }
  }
  const gsmNumber = normalizePhone(input.phone)
  if (!gsmNumber || gsmNumber.length > MAX_PHONE_LENGTH) return { ok: false, error: 'invalid_phone' }

  const limit = checkRateLimit(`iyzico-instant:${projectId}`, 3, 60 * 60 * 1000)
  if (!limit.allowed) return { ok: false, error: 'rate_limited' }

  const randomKey = randomBytes(16).toString('hex')
  const appName = process.env.IYZICO_INSTANT_APP_NAME!
  const developerKey = process.env.IYZICO_INSTANT_DEVELOPER_KEY!
  const signature = createHmac('sha256', process.env.IYZICO_INSTANT_SALT_KEY!)
    .update(`${developerKey}|${appName}|${randomKey}`)
    .digest('hex')

  try {
    const response = await fetch(ONBOARDING_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-iyzi-rnd': randomKey,
        'x-iyzi-app-name': appName,
        'x-iyzi-developer-key-v2': signature,
      },
      body: JSON.stringify({ contactName: firstName, contactSurname: lastName, registrationEmail: email, gsmNumber }),
      cache: 'no-store',
    })
    if (!response.ok) return { ok: false, error: 'unavailable' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export { normalizePhone as normalizeIyzicoPhone }
