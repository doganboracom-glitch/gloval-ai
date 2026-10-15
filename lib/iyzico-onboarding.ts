'use server'

import { checkRateLimit } from '@/lib/rate-limit'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { createClient } from '@/lib/supabase/server'
import {
  IYZICO_ONBOARDING_URL,
  buildIyzicoInstantHeaders,
  cleanName,
  readIyzicoInstantCredentials,
  validateIyzicoInstantInput,
  type IyzicoInstantInput,
} from '@/lib/iyzico-onboarding-shared'

/**
 * iyzico "Instant" pre-application. The three IYZICO_INSTANT_* secrets stay on
 * the server: they never reach the client, a URL, a log line or an error. When
 * any is missing the feature is simply off (prefill reports `enabled: false`).
 * Only { contactName, contactSurname, registrationEmail, gsmNumber } is sent,
 * to one fixed host.
 */

export type IyzicoInstantPrefill = {
  enabled: boolean
  email: string
  phone: string
  firstName: string
  lastName: string
}

export type IyzicoInstantResult =
  | { ok: true }
  | {
      ok: false
      error: 'invalid_name' | 'invalid_email' | 'invalid_phone' | 'rate_limited' | 'unavailable'
    }

const DISABLED: IyzicoInstantPrefill = { enabled: false, email: '', phone: '', firstName: '', lastName: '' }

export async function getIyzicoInstantPrefill(projectId: string): Promise<IyzicoInstantPrefill> {
  await authorizeProjectOwner(projectId)
  if (!readIyzicoInstantCredentials()) return DISABLED

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>
  const parts = cleanName(metadata.full_name ?? metadata.name)
    .split(' ')
    .filter(Boolean)
  return {
    enabled: true,
    email: user?.email ?? '',
    phone:
      typeof user?.phone === 'string' && user.phone
        ? user.phone
        : typeof metadata.phone === 'string'
          ? metadata.phone
          : '',
    firstName: cleanName(metadata.first_name ?? metadata.firstName ?? parts[0] ?? ''),
    lastName: cleanName(metadata.last_name ?? metadata.lastName ?? parts.slice(1).join(' ')),
  }
}

export async function submitIyzicoInstant(
  projectId: string,
  input: IyzicoInstantInput,
): Promise<IyzicoInstantResult> {
  const { actorId } = await authorizeProjectOwner(projectId)
  const credentials = readIyzicoInstantCredentials()
  if (!credentials) return { ok: false, error: 'unavailable' }

  const validation = validateIyzicoInstantInput(input)
  if (!validation.ok) return { ok: false, error: validation.error }

  const hour = 60 * 60 * 1000
  const byProject = checkRateLimit(`iyzico-instant:project:${projectId}`, 3, hour)
  const byUser = checkRateLimit(`iyzico-instant:user:${actorId}`, 5, hour)
  if (!byProject.allowed || !byUser.allowed) return { ok: false, error: 'rate_limited' }

  try {
    const response = await fetch(IYZICO_ONBOARDING_URL, {
      method: 'POST',
      headers: buildIyzicoInstantHeaders(credentials),
      body: JSON.stringify(validation.payload),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    })
    return response.ok ? { ok: true } : { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
