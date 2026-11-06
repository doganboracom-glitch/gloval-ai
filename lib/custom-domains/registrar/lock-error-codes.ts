/**
 * Maps the provider's lock-change error codes onto the transfer error codes the
 * UI already renders. Only the code is ever inspected, never a message or body,
 * so nothing provider-specific can leak into a user-facing string.
 */

export type LockFailureError =
  | 'PENDING_OPERATION'
  | 'LOCK_STATE_BLOCKED'
  | 'OPERATION_INCOMPLETE'
  | 'PROVIDER_ERROR'

/** Characters a provider error code may contain before it is stored or compared. */
export const SAFE_PROVIDER_CODE = /^[A-Za-z0-9_:.]{1,80}$/

export function classifyLockFailureCode(code: string | null | undefined): LockFailureError {
  if (!code || !SAFE_PROVIDER_CODE.test(code)) return 'PROVIDER_ERROR'
  // Ownership change pending on the domain.
  if (/(?:^|:)Domain:10032$/.test(code)) return 'PENDING_OPERATION'
  // The domain's current status does not permit a lock change.
  if (/(?:^|:)Domain:10016$/.test(code)) return 'LOCK_STATE_BLOCKED'
  // The registry operation did not complete.
  if (/(?:^|:)Epp:10001$/.test(code)) return 'OPERATION_INCOMPLETE'
  // DnaValidationError / 10007 and every unknown code stay generic.
  return 'PROVIDER_ERROR'
}
