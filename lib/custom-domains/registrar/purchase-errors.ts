import { RegistrarError } from './types'
import type { PurchaseErrorCode } from './actions'

/**
 * Maps a registrar failure to a buyer-safe purchase code. Only the code ever
 * leaves the server: the registrar's message, diagnostic and balance details
 * stay in server logs.
 */
export function purchaseCodeFromRegistrarError(error: unknown): PurchaseErrorCode {
  if (!(error instanceof RegistrarError)) return 'FAILED'
  if (error.diagnostic?.httpStatus === 429) return 'RATE_LIMITED'
  switch (error.code) {
    case 'NOT_CONFIGURED':
      return 'NOT_CONFIGURED'
    case 'INVALID_DOMAIN':
    case 'UNSUPPORTED_TLD':
      return 'INVALID_DOMAIN'
    case 'UNAVAILABLE':
      return 'UNAVAILABLE'
    case 'PROVIDER_ERROR':
    case 'INSUFFICIENT_BALANCE':
    case 'REGISTRATION_FAILED':
    case 'OUTCOME_UNKNOWN':
      return 'REGISTRAR_ERROR'
    default:
      return 'FAILED'
  }
}
