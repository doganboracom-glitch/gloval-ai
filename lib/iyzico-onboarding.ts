'use server'

import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { createClient } from '@/lib/supabase/server'
import {
  claimOnboardingSlot,
  finalizeOnboardingRequest,
  isOnboardingStoreReady,
} from '@/lib/iyzico-onboarding-store'
import {
  IYZICO_ONBOARDING_URL,
  buildIyzicoInstantHeaders,
  classifyIyzicoStatus,
  cleanName,
  isIyzicoCampaignEnabled,
  readIyzicoInstantCredentials,
  validateIyzicoInstantInput,
  type IyzicoInstantError,
  type IyzicoInstantInput,
} from '@/lib/iyzico-onboarding-shared'

/**
 * iyzico "Instant" pre-application. The three IYZICO_INSTANT_* secrets stay on
 * the server: they never reach the client, a URL, a log line or an error. The
 * feature is off when any secret is missing OR the request table does not exist
 * yet. Only { contactName, contactSurname, registrationEmail, gsmNumber } is sent,
 * to one fixed host; none of it is stored, and iyzico's response body is never
 * read, shown or logged (only a status code is).
 */

export type IyzicoInstantPrefill = {
  enabled: boolean
  email: string
  phone: string
  firstName: string
  lastName: string
  showCampaign: boolean
}

export type IyzicoInstantResult = { ok: true } | { ok: false; error: IyzicoInstantError }

const DISABLED: IyzicoInstantPrefill = { enabled: false, email: '', phone: '', firstName: '', lastName: '', showCampaign: false }

const REQUEST_TIMEOUT_MS = 15_000

export async function getIyzicoInstantPrefill(projectId: string): Promise<IyzicoInstantPrefill> {
  await authorizeProjectOwner(projectId)
  if (!readIyzicoInstantCredentials()) return DISABLED
  if (!(await isOnboardingStoreReady())) return DISABLED

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
    showCampaign: isIyzicoCampaignEnabled(),
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
  consent: boolean,
): Promise<IyzicoInstantResult> {
  const { actorId } = await authorizeProjectOwner(projectId)
  const credentials = readIyzicoInstantCredentials()
  if (!credentials) return { ok: false, error: 'unavailable' }

  if (consent !== true) return { ok: false, error: 'consent_required' }

  const validation = validateIyzicoInstantInput(input)
  if (!validation.ok) return { ok: false, error: validation.error }

  const claim = await claimOnboardingSlot(projectId, actorId)
  if (claim.kind === 'unavailable') return { ok: false, error: 'unavailable' }
  if (claim.kind === 'blocked') {
    if (claim.reason === 'already_submitted') return { ok: false, error: 'already_submitted' }
    if (claim.reason === 'in_progress') return { ok: false, error: 'in_progress' }
    return { ok: false, error: 'rate_limited' }
  }

  try {
    const response = await fetch(IYZICO_ONBOARDING_URL, {
      method: 'POST',
      headers: buildIyzicoInstantHeaders(credentials),
      body: JSON.stringify(validation.payload),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    await response.body?.cancel().catch(() => undefined)

    const outcome = classifyIyzicoStatus(response.status)
    if (outcome.ok) {
      await finalizeOnboardingRequest(claim.id, 'submitted', response.status)
      return { ok: true }
    }
    console.error('[iyzico-instant]', outcome.code)
    await finalizeOnboardingRequest(claim.id, 'failed', response.status)
    return { ok: false, error: outcome.error }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    console.error('[iyzico-instant]', timedOut ? 'iyzico_timeout' : 'iyzico_network_error')
    await finalizeOnboardingRequest(claim.id, 'failed', 0)
    return { ok: false, error: 'unavailable' }
  }
}
