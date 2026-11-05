'use server'

import { requireRequestUser } from '@/lib/supabase/request-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEmailLang } from '@/lib/email/lang'
import { getDomainRegistrarProvider } from './provider'
import { isManageCapable, isTransferCapable, RegistrarError } from './types'
import type { OwnedDomainInfo, ManagedDomainDetails, DomainManageCapable, DomainTransferCapable } from './types'
import { requireRegisteredByUs } from './ownership'
import { parsePurchaseDomain } from './service'
import { isTransferSupportedTld } from './transfer-service'
import { isTransferLockChangeEnabled } from './capabilities'
import { reserveUserDailyTransferExtension, reserveUserHourly } from './rate-limit'
import { recordDomainAuditEvent, type DomainAuditReason } from './audit'
import {
  findOpenTransferWindow,
  getOwnedCustomDomainId,
  insertOpenTransferWindow,
  updateOpenTransferWindow,
  updateOpenTransferWindowIfExtensionsMatch,
  type DomainTransferWindow,
} from './transfer-window-store'
import {
  getRegistrarTransferState,
  initialTransferRelockAt,
  isTransferUnlockPending,
  isTransferWindowExpired,
  nextTransferExtensionAt,
} from './transfer-window-logic'
import { isActiveAndUnexpired } from './nameserver-access'
import { sendTransferWindowNotice } from './transfer-window-notice'
import type { TransferErrorCode, TransferWindowSummary } from './transfer-actions'

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

type WindowRegistrar = NonNullable<ReturnType<typeof getDomainRegistrarProvider>> & DomainManageCapable
type TransferWindowRegistrar = WindowRegistrar & DomainTransferCapable

function toSummary(window: DomainTransferWindow): TransferWindowSummary {
  return {
    id: window.id,
    openedAt: window.opened_at,
    relockAt: window.relock_at,
    extensions: window.extensions,
  }
}

async function getActor() {
  const user = await requireRequestUser()
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>
  return {
    userId: user.id,
    email: user.email ?? '',
    lang: resolveEmailLang(metadata.email_locale),
  }
}

type TransferEligibility = {
  error: TransferErrorCode | null
  reason: DomainAuditReason | null
  requiresStartDateConfirmation: boolean
}

function isEligibleForTransfer(info: OwnedDomainInfo, nowMs = Date.now()): TransferEligibility {
  if (typeof info.locked !== 'boolean') {
    return { error: 'STATUS_UNVERIFIED', reason: 'locked_unreadable', requiresStartDateConfirmation: false }
  }

  const transferState = getRegistrarTransferState(info.status)
  if (transferState === 'unknown') {
    return { error: 'STATUS_UNVERIFIED', reason: 'status_unknown', requiresStartDateConfirmation: false }
  }
  if (transferState === 'transferred_out') {
    return { error: 'NOT_FOUND', reason: null, requiresStartDateConfirmation: false }
  }
  if (!isActiveAndUnexpired({ status: info.status, expiresAt: info.expiresAt, remainingDays: info.remainingDays ?? null }, nowMs)) {
    return { error: 'NOT_TRANSFERABLE', reason: null, requiresStartDateConfirmation: false }
  }

  const startedMs = info.startedAt ? Date.parse(info.startedAt) : Number.NaN
  if (!Number.isFinite(startedMs)) {
    return {
      error: null,
      reason: info.startedAtRaw ? 'start_date_unparseable' : 'start_date_missing',
      requiresStartDateConfirmation: true,
    }
  }
  if (startedMs + SIXTY_DAYS_MS > nowMs) {
    return { error: 'RESTRICTED_60_DAYS', reason: null, requiresStartDateConfirmation: false }
  }
  return { error: null, reason: null, requiresStartDateConfirmation: false }
}

function providerCodeFromError(error: unknown): string | undefined {
  if (!(error instanceof RegistrarError)) return undefined
  return error.message.match(/^[A-Za-z0-9_:]{1,80}/)?.[0]
}

function shapeProviderDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  return Array.from(value)
    .slice(0, 120)
    .map((character) => (/[\p{N}]/u.test(character) ? '9' : /[\p{L}]/u.test(character) ? 'a' : character))
    .join('')
}

type TransferEligibilityAudit = { reason?: DomainAuditReason; startDateShape?: string }

function eligibilityAuditDetails(
  info: OwnedDomainInfo,
  reason: DomainAuditReason | null | undefined,
): TransferEligibilityAudit {
  const startDateShape = reason === 'start_date_unparseable' ? shapeProviderDate(info.startedAtRaw) : undefined
  return {
    ...(reason ? { reason } : {}),
    ...(startDateShape ? { startDateShape } : {}),
  }
}

async function reserveCodeView(userId: string, domain: string): Promise<TransferErrorCode | null> {
  const reservation = await reserveUserHourly('transfer-code', 'domain:transfer-code', userId)
  if (reservation === 'allowed') return null
  await recordDomainAuditEvent({
    userId,
    domain,
    eventType: 'transfer_code_viewed',
    details: { outcome: reservation === 'limited' ? 'rate_limited' : 'failed' },
  })
  return reservation === 'limited' ? 'RATE_LIMITED' : 'FAILED'
}

async function ensureTransferLock(registrar: WindowRegistrar, domain: string): Promise<boolean> {
  try {
    await registrar.changeLock(domain, true)
  } catch {
    // Read-back below distinguishes an already-successful write from an unknown result.
  }
  try {
    return (await registrar.getManagedDetails(domain))?.locked === true
  } catch {
    return false
  }
}

async function scheduleImmediateRelockRecovery(
  admin: ReturnType<typeof createAdminClient>,
  customDomainId: string,
  domain: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString()
  const inserted = await insertOpenTransferWindow(admin, {
    custom_domain_id: customDomainId,
    domain,
    user_id: userId,
    opened_at: now,
    relock_at: now,
  })
  if (inserted.ok) {
    await updateOpenTransferWindow(admin, inserted.value.id, {
      last_error_code: 'unlock_outcome_unconfirmed',
    })
  }
}

async function relockAfterFailedCode(
  registrar: WindowRegistrar,
  admin: ReturnType<typeof createAdminClient>,
  window: DomainTransferWindow,
  userId: string,
  errorCode: string,
): Promise<boolean> {
  let confirmed = false
  let relockError: unknown = null
  if (isManageCapable(registrar)) {
    try {
      await registrar.changeLock(window.domain, true)
      const readback = await registrar.getManagedDetails(window.domain)
      confirmed = readback?.locked === true
    } catch (error) {
      confirmed = false
      relockError = error
    }
  }

  const now = new Date().toISOString()
  await updateOpenTransferWindow(
    admin,
    window.id,
    confirmed
      ? { status: 'failed', closed_at: now, last_error_code: errorCode, relock_lease_until: null }
      : { relock_at: now, last_error_code: `${errorCode}_relock_unconfirmed`, relock_lease_until: null },
  )
  const providerCode = providerCodeFromError(relockError)
  await recordDomainAuditEvent({
    userId,
    customDomainId: window.custom_domain_id,
    domain: window.domain,
    eventType: 'transfer_lock_changed',
    details: {
      outcome: confirmed ? 'failed' : 'unconfirmed',
      locked: confirmed ? true : null,
      stage: 'code_fetch',
      ...(providerCode ? { providerCode } : {}),
      source: 'user_code_request',
    },
  })
  return confirmed
}

async function fetchWindowCode(
  registrar: TransferWindowRegistrar,
  admin: ReturnType<typeof createAdminClient>,
  window: DomainTransferWindow,
  userId: string,
  email: string,
  lang: ReturnType<typeof resolveEmailLang>,
  created: boolean,
  rateAlreadyReserved = false,
  eligibilityAudit: TransferEligibilityAudit = {},
): Promise<TransferWindowCodeResult> {
  if (!rateAlreadyReserved) {
    const limitError = await reserveCodeView(userId, window.domain)
    if (limitError) return { ok: false, error: limitError }
  }
  if (!isTransferCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }

  try {
    const authCode = await registrar.getAuthCode(window.domain)
    if (!authCode) {
      await recordDomainAuditEvent({
        userId,
        customDomainId: window.custom_domain_id,
        domain: window.domain,
        eventType: 'transfer_code_viewed',
        details: {
          outcome: 'failed',
          stage: 'code_fetch',
          ...eligibilityAudit,
        },
      })
      await relockAfterFailedCode(registrar, admin, window, userId, 'auth_code_unavailable')
      return { ok: false, error: 'PROVIDER_ERROR' }
    }

    await recordDomainAuditEvent({
      userId,
      customDomainId: window.custom_domain_id,
      domain: window.domain,
      eventType: 'transfer_code_viewed',
      details: {
        outcome: 'success',
        stage: 'code_fetch',
        ...eligibilityAudit,
      },
    })

    if (created) {
      await sendTransferWindowNotice({
        kind: 'opened',
        email,
        lang,
        domain: window.domain,
        customDomainId: window.custom_domain_id ?? '',
        windowId: window.id,
        relockAt: window.relock_at,
      })
    }

    return { ok: true, authCode, window: toSummary(window), created }
  } catch (error) {
    const providerCode = providerCodeFromError(error)
    await recordDomainAuditEvent({
      userId,
      customDomainId: window.custom_domain_id,
      domain: window.domain,
      eventType: 'transfer_code_viewed',
      details: {
        outcome: 'failed',
        stage: 'code_fetch',
        ...(providerCode ? { providerCode } : {}),
        ...eligibilityAudit,
      },
    })
    await relockAfterFailedCode(registrar, admin, window, userId, 'auth_code_unavailable')
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
}

export type TransferWindowCodeResult =
  | { ok: true; authCode: string; window: TransferWindowSummary; created: boolean }
  | { ok: false; error: TransferErrorCode }

export async function requestMyTransferOutCode(
  domainInput: string,
  confirmedDomain?: string,
  confirmedStartDateRisk = false,
): Promise<TransferWindowCodeResult> {
  const { userId, email, lang } = await getActor()
  if (!isTransferLockChangeEnabled()) return { ok: false, error: 'UNSUPPORTED' }

  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: false, error: 'NOT_FOUND' }
  const parsed = parsePurchaseDomain(domain)
  if (!parsed || !isTransferSupportedTld(parsed.tld)) return { ok: false, error: 'UNSUPPORTED_TLD' }

  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar) || !isTransferCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }

  const admin = createAdminClient()
  const existingResult = await findOpenTransferWindow(admin, domain)
  if (!existingResult.ok) return { ok: false, error: 'WINDOW_UNAVAILABLE' }

  let info: OwnedDomainInfo | null
  try {
    info = await registrar.getOwnedDomainInfo(domain)
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
  if (!info) return { ok: false, error: 'NOT_FOUND' }

  const eligibility = isEligibleForTransfer(info)
  if (eligibility.error) {
    if (eligibility.error === 'STATUS_UNVERIFIED' && eligibility.reason) {
      await recordDomainAuditEvent({
        userId,
        domain,
        eventType: 'transfer_code_viewed',
        details: { outcome: 'failed', ...eligibilityAuditDetails(info, eligibility.reason) },
      })
    }
    return { ok: false, error: eligibility.error }
  }
  if (eligibility.requiresStartDateConfirmation && confirmedStartDateRisk !== true) {
    await recordDomainAuditEvent({
      userId,
      domain,
      eventType: 'transfer_code_viewed',
      details: {
        outcome: 'failed',
        ...eligibilityAuditDetails(info, eligibility.reason ?? 'start_date_missing'),
      },
    })
    return { ok: false, error: 'START_DATE_CONFIRMATION_REQUIRED' }
  }
  const eligibilityAudit = eligibility.requiresStartDateConfirmation
    ? eligibilityAuditDetails(info, eligibility.reason ?? 'start_date_missing')
    : {}

  const existing = existingResult.value
  if (existing) {
    if (existing.user_id !== userId) return { ok: false, error: 'WINDOW_NOT_OPEN' }
    if (info.locked === true) {
      // A just-accepted unlock may not be visible yet; keep the window open.
      if (isTransferUnlockPending(existing.opened_at)) return { ok: false, error: 'DOMAIN_LOCKED' }
      await updateOpenTransferWindow(admin, existing.id, {
        status: 'cancelled',
        closed_at: new Date().toISOString(),
        relock_lease_until: null,
      })
      return { ok: false, error: 'DOMAIN_LOCKED' }
    }
    if (isTransferWindowExpired(existing.relock_at)) return { ok: false, error: 'WINDOW_EXPIRED' }
    return fetchWindowCode(registrar, admin, existing, userId, email, lang, false, false, eligibilityAudit)
  }

  if (info.locked !== true) return { ok: false, error: 'WINDOW_NOT_OPEN' }
  if (getRegistrarTransferState(info.status) !== 'held') return { ok: false, error: 'NOT_TRANSFERABLE' }
  const rateError = await reserveCodeView(userId, domain)
  if (rateError) return { ok: false, error: rateError }
  if (confirmedDomain !== domain) return { ok: false, error: 'CONFIRMATION_MISMATCH' }

  const customDomainId = await getOwnedCustomDomainId(admin, userId, domain)
  if (!customDomainId) return { ok: false, error: 'NOT_FOUND' }

  let unlockChange: Awaited<ReturnType<WindowRegistrar['changeLock']>>
  try {
    unlockChange = await registrar.changeLock(domain, false, { acceptUnconfirmed: true })
  } catch (error) {
    const relocked = await ensureTransferLock(registrar, domain)
    if (!relocked) await scheduleImmediateRelockRecovery(admin, customDomainId, domain, userId)
    const providerCode = providerCodeFromError(error)
    await recordDomainAuditEvent({
      userId,
      customDomainId,
      domain,
      eventType: 'transfer_lock_changed',
      details: {
        outcome: relocked ? 'failed' : 'unconfirmed',
        locked: relocked ? true : null,
        stage: 'unlock_request',
        ...(providerCode ? { providerCode } : {}),
        source: 'user_code_request',
        ...eligibilityAudit,
      },
    })
    return { ok: false, error: 'PROVIDER_ERROR' }
  }

  // The provider accepted the unlock without an error. The registry can apply
  // it minutes later, so a not-yet-unlocked read-back is not a failure: the
  // window opens and the scheduled relock/status checks remain the safety net.
  const unlockPending = unlockChange.pending === true
  await recordDomainAuditEvent({
    userId,
    customDomainId,
    domain,
    eventType: 'transfer_lock_changed',
    details: {
      outcome: unlockPending ? 'deferred' : 'success',
      changed: true,
      locked: unlockPending ? null : false,
      stage: unlockPending ? 'unlock_pending' : 'unlock_confirmed',
      source: 'user_code_request',
      ...eligibilityAudit,
    },
  })

  const openedAtMs = Date.now()
  const inserted = await insertOpenTransferWindow(admin, {
    custom_domain_id: customDomainId,
    domain,
    user_id: userId,
    opened_at: new Date(openedAtMs).toISOString(),
    relock_at: initialTransferRelockAt(openedAtMs),
  })

  if (!inserted.ok) {
    if (inserted.error === 'unique') {
      const winner = await findOpenTransferWindow(admin, domain)
      if (winner.ok && winner.value?.user_id === userId && !isTransferWindowExpired(winner.value.relock_at)) {
        await recordDomainAuditEvent({
          userId,
          customDomainId,
          domain,
          eventType: 'transfer_lock_changed',
          details: {
            outcome: 'success',
            changed: true,
            locked: false,
            stage: 'window_insert',
            source: 'user_code_request',
            ...eligibilityAudit,
          },
        })
        return fetchWindowCode(registrar, admin, winner.value, userId, email, lang, false, true, eligibilityAudit)
      }
    }

    let relocked = false
    let relockError: unknown = null
    try {
      await registrar.changeLock(domain, true)
      relocked = (await registrar.getManagedDetails(domain))?.locked === true
    } catch (error) {
      relocked = false
      relockError = error
    }
    if (!relocked) await scheduleImmediateRelockRecovery(admin, customDomainId, domain, userId)
    await recordDomainAuditEvent({
      userId,
      customDomainId,
      domain,
      eventType: 'transfer_lock_changed',
      details: {
        outcome: relocked ? 'failed' : 'unconfirmed',
        locked: relocked ? true : null,
        stage: 'window_insert',
        ...(providerCodeFromError(relockError) ? { providerCode: providerCodeFromError(relockError) } : {}),
        source: 'user_code_request',
        ...eligibilityAudit,
      },
    })
    return { ok: false, error: inserted.error === 'unique' ? 'WINDOW_NOT_OPEN' : 'WINDOW_UNAVAILABLE' }
  }

  await recordDomainAuditEvent({
    userId,
    customDomainId,
    domain,
    eventType: 'transfer_lock_changed',
    details: {
      outcome: 'success',
      changed: true,
      locked: false,
      stage: 'window_insert',
      source: 'user_code_request',
      ...eligibilityAudit,
    },
  })
  return fetchWindowCode(registrar, admin, inserted.value, userId, email, lang, true, true, eligibilityAudit)
}

export type TransferWindowMutationResult =
  | { ok: true; window: TransferWindowSummary }
  | { ok: true; locked: true }
  | { ok: false; error: TransferErrorCode }

export async function extendMyTransferWindow(domainInput: string): Promise<TransferWindowMutationResult> {
  const { userId, email, lang } = await getActor()
  if (!isTransferLockChangeEnabled()) return { ok: false, error: 'UNSUPPORTED' }

  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: false, error: 'NOT_FOUND' }
  const parsed = parsePurchaseDomain(domain)
  if (!parsed || !isTransferSupportedTld(parsed.tld)) return { ok: false, error: 'UNSUPPORTED_TLD' }

  const admin = createAdminClient()
  const windowResult = await findOpenTransferWindow(admin, domain, userId)
  if (!windowResult.ok) return { ok: false, error: 'WINDOW_UNAVAILABLE' }
  const window = windowResult.value
  if (!window) return { ok: false, error: 'WINDOW_NOT_OPEN' }
  if (isTransferWindowExpired(window.relock_at)) return { ok: false, error: 'WINDOW_EXPIRED' }

  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }
  let details: ManagedDomainDetails | null
  try {
    details = await registrar.getManagedDetails(domain)
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
  if (!details || details.locked === null || getRegistrarTransferState(details.status) === 'unknown') {
    return { ok: false, error: 'STATUS_UNVERIFIED' }
  }
  if (details.locked === true) {
    await updateOpenTransferWindow(admin, window.id, {
      status: 'cancelled',
      closed_at: new Date().toISOString(),
      relock_lease_until: null,
    })
    return { ok: false, error: 'DOMAIN_LOCKED' }
  }
  if (!isActiveAndUnexpired(details)) return { ok: false, error: 'NOT_TRANSFERABLE' }

  const reservation = await reserveUserDailyTransferExtension(userId)
  if (reservation !== 'allowed') return { ok: false, error: reservation === 'limited' ? 'RATE_LIMITED' : 'FAILED' }

  const relockAt = nextTransferExtensionAt(window)
  if (!relockAt) return { ok: false, error: 'WINDOW_LIMIT_REACHED' }
  const nextExtensions = window.extensions + 1
  const update = await updateOpenTransferWindowIfExtensionsMatch(admin, window.id, window.extensions, {
    relock_at: relockAt,
    extensions: nextExtensions,
  })
  if (!update.ok) return { ok: false, error: 'WINDOW_UNAVAILABLE' }
  if (!update.value) return { ok: false, error: 'WINDOW_NOT_OPEN' }

  const updatedWindow = { ...window, relock_at: relockAt, extensions: nextExtensions }
  await recordDomainAuditEvent({
    userId,
    customDomainId: window.custom_domain_id,
    domain,
    eventType: 'transfer_lock_changed',
    details: { outcome: 'success', locked: false, source: 'window_extended', extensions: nextExtensions },
  })
  if (window.custom_domain_id) {
    await sendTransferWindowNotice({
      kind: 'extended',
      email,
      lang,
      domain,
      customDomainId: window.custom_domain_id,
      windowId: window.id,
      relockAt,
      extensionCount: nextExtensions,
    })
  }
  return { ok: true, window: toSummary(updatedWindow) }
}

export async function relockMyTransferWindow(domainInput: string): Promise<TransferWindowMutationResult> {
  const { userId } = await getActor()
  if (!isTransferLockChangeEnabled()) return { ok: false, error: 'UNSUPPORTED' }

  const domain = await requireRegisteredByUs(userId, domainInput)
  if (!domain) return { ok: false, error: 'NOT_FOUND' }
  const parsed = parsePurchaseDomain(domain)
  if (!parsed || !isTransferSupportedTld(parsed.tld)) return { ok: false, error: 'UNSUPPORTED_TLD' }

  const registrar = getDomainRegistrarProvider()
  if (!isManageCapable(registrar)) return { ok: false, error: 'NOT_CONFIGURED' }
  let details: ManagedDomainDetails | null
  try {
    details = await registrar.getManagedDetails(domain)
  } catch {
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
  if (!details || details.locked === null || getRegistrarTransferState(details.status) === 'unknown') {
    return { ok: false, error: 'STATUS_UNVERIFIED' }
  }

  const admin = createAdminClient()
  const openResult = await findOpenTransferWindow(admin, domain)
  const window = openResult.ok ? openResult.value : null
  if (details.locked === true) {
    if (window) {
      await updateOpenTransferWindow(admin, window.id, {
        status: 'cancelled',
        closed_at: new Date().toISOString(),
        relock_lease_until: null,
      })
    }
    await recordDomainAuditEvent({
      userId,
      customDomainId: window?.custom_domain_id,
      domain,
      eventType: 'transfer_lock_changed',
      details: { outcome: 'unchanged', changed: false, locked: true, source: 'user_relock' },
    })
    return { ok: true, locked: true }
  }

  const reservation = await reserveUserHourly('transfer-lock', 'domain:transfer-lock', userId)
  if (reservation !== 'allowed') return { ok: false, error: reservation === 'limited' ? 'RATE_LIMITED' : 'FAILED' }

  let readback: ManagedDomainDetails | null = null
  try {
    await registrar.changeLock(domain, true)
    readback = await registrar.getManagedDetails(domain)
  } catch {
    await recordDomainAuditEvent({
      userId,
      customDomainId: window?.custom_domain_id,
      domain,
      eventType: 'transfer_lock_changed',
      details: { outcome: 'unconfirmed', locked: null, source: 'user_relock' },
    })
    return { ok: false, error: 'PROVIDER_ERROR' }
  }
  if (readback?.locked !== true) {
    await recordDomainAuditEvent({
      userId,
      customDomainId: window?.custom_domain_id,
      domain,
      eventType: 'transfer_lock_changed',
      details: { outcome: 'unconfirmed', locked: readback?.locked ?? null, source: 'user_relock' },
    })
    return { ok: false, error: 'STATUS_UNVERIFIED' }
  }

  if (window) {
    await updateOpenTransferWindow(admin, window.id, {
      status: 'cancelled',
      closed_at: new Date().toISOString(),
      relock_lease_until: null,
    })
  }
  await recordDomainAuditEvent({
    userId,
    customDomainId: window?.custom_domain_id,
    domain,
    eventType: 'transfer_lock_changed',
    details: { outcome: 'success', changed: true, locked: true, source: 'user_relock' },
  })
  return { ok: true, locked: true }
}
