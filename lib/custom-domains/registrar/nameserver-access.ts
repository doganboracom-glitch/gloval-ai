import type { ManagedDomainDetails } from './types'

export function isActiveAndUnexpired(
  details: Pick<ManagedDomainDetails, 'status' | 'expiresAt' | 'remainingDays'>,
  now = Date.now(),
): boolean {
  if (details.status.trim().toLowerCase() !== 'active') return false

  const expiresAt = details.expiresAt ? Date.parse(details.expiresAt) : Number.NaN
  if (Number.isFinite(expiresAt)) return expiresAt > now

  return details.remainingDays !== null && Number.isFinite(details.remainingDays) && details.remainingDays > 0
}
