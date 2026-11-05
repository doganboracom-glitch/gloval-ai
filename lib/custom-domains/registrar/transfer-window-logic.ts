export const TRANSFER_WINDOW_MS = 72 * 60 * 60 * 1000
export const TRANSFER_WINDOW_MAX_MS = 7 * 24 * 60 * 60 * 1000
export const TRANSFER_WINDOW_EXTENSION_MS = 72 * 60 * 60 * 1000
export const TRANSFER_WINDOW_MAX_EXTENSIONS = 2
export const TRANSFER_WINDOW_MAX_RELOCK_ATTEMPTS = 5
export const TRANSFER_WINDOW_PENDING_DELAY_MS = 24 * 60 * 60 * 1000
export const TRANSFER_LOCK_READBACK_RETRIES = 4
export const TRANSFER_LOCK_READBACK_DELAY_MS = 1_500
/** The registry may apply an accepted unlock a few minutes after the request. */
export const TRANSFER_UNLOCK_PENDING_GRACE_MS = 3 * 60 * 1000

/** True while an accepted unlock request is still within its expected delay. */
export function isTransferUnlockPending(openedAt: string, nowMs = Date.now()): boolean {
  const openedMs = Date.parse(openedAt)
  return Number.isFinite(openedMs) && nowMs - openedMs >= 0 && nowMs - openedMs < TRANSFER_UNLOCK_PENDING_GRACE_MS
}

const DOMAIN_STATUS_BY_CODE: Record<number, string> = {
  0: 'Active',
  1: 'WaitingForRegistration',
  2: 'WaitingForDocument',
  3: 'WaitingForIncomingTransfer',
  4: 'TransferredOut',
  7: 'PendingDelete',
  8: 'Deleted',
  9: 'ConfirmationEmailSend',
  11: 'WaitingForOutgoingTransfer',
  12: 'PendingHold',
  15: 'ModificationPending',
  18: 'InCase',
  19: 'PendingRestore',
}

const KNOWN_HELD_STATUSES = new Set(
  Object.values(DOMAIN_STATUS_BY_CODE)
    .filter((status) => status !== 'WaitingForOutgoingTransfer' && status !== 'TransferredOut' && status !== 'Deleted')
    .map((status) => status.toLowerCase()),
)

export type RegistrarTransferState = 'pending_outgoing' | 'held' | 'transferred_out' | 'unknown'

/** DomainNameAPI's GetDetails `Status` is normalized from numeric code 11. */
export function getRegistrarTransferState(status: unknown): RegistrarTransferState {
  if (typeof status === 'number' && Number.isInteger(status)) {
    status = DOMAIN_STATUS_BY_CODE[status] ?? String(status)
  }

  if (typeof status !== 'string') return 'unknown'
  const normalized = status.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!normalized) return 'unknown'
  if (normalized === '11' || normalized === 'waitingforoutgoingtransfer') return 'pending_outgoing'
  if (normalized === '4' || normalized === '8' || normalized === 'transferredout' || normalized === 'deleted') {
    return 'transferred_out'
  }
  if (KNOWN_HELD_STATUSES.has(normalized)) return 'held'
  return 'unknown'
}

export function initialTransferRelockAt(openedAtMs: number): string {
  return new Date(openedAtMs + TRANSFER_WINDOW_MS).toISOString()
}

export function nextTransferExtensionAt(
  window: { opened_at: string; relock_at: string; extensions: number },
  nowMs = Date.now(),
): string | null {
  if (window.extensions >= TRANSFER_WINDOW_MAX_EXTENSIONS) return null
  const openedAt = Date.parse(window.opened_at)
  const relockAt = Date.parse(window.relock_at)
  if (!Number.isFinite(openedAt) || !Number.isFinite(relockAt) || relockAt <= nowMs) return null

  const maximum = openedAt + TRANSFER_WINDOW_MAX_MS
  const next = Math.min(relockAt + TRANSFER_WINDOW_EXTENSION_MS, maximum)
  return next > relockAt ? new Date(next).toISOString() : null
}

export function nextPendingTransferRelockAt(
  window: { opened_at: string; relock_at: string },
  nowMs = Date.now(),
): string | null {
  const openedAt = Date.parse(window.opened_at)
  const relockAt = Date.parse(window.relock_at)
  if (!Number.isFinite(openedAt) || !Number.isFinite(relockAt)) return null

  const maximum = openedAt + TRANSFER_WINDOW_MAX_MS
  const next = Math.max(relockAt, nowMs) + TRANSFER_WINDOW_PENDING_DELAY_MS
  return next <= maximum ? new Date(next).toISOString() : null
}

export function isTransferWindowExpired(relockAt: string, nowMs = Date.now()): boolean {
  const timestamp = Date.parse(relockAt)
  return !Number.isFinite(timestamp) || timestamp <= nowMs
}
