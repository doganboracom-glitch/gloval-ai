import { ADS_CREDIT_COSTS } from '@/lib/ads/credit-costs'
import { policyBlockedMessageKey } from '@/lib/ads/policy-message'
import type { ClientScanError } from '@/lib/ads/scan-client'

export type ScanErrorAction = 'retry' | 'login' | 'credits' | 'newScan' | 'none'

export type ScanErrorCopy = {
  errInvalidRequest: string
  errSessionRequired: string
  errRateLimited: string
  errLoginRequired: string
  errAnonCapacity: string
  errCreditsRequired: string
  errDuplicate: string
  errDuplicateLost: string
  errUnreachable: string
  errInsufficientContent: string
  errPolicyBlocked: string
  errPolicyBlockedAdultConsumed: string
  errPolicyBlockedAdultNotConsumed: string
  errPolicyBlockedLimit: string
  errPolicyConsumed: string
  errGenerationFailed: string
  errTimeout: string
  errServiceUnavailable: string
  errNetwork: string
}

export type ScanErrorView = { message: string; action: ScanErrorAction }

/** Turns a failure code into the translated message and the one action that fits it. */
export function describeScanError(error: ClientScanError, copy: ScanErrorCopy): ScanErrorView {
  switch (error.code) {
    case 'invalid_request':
      return { message: copy.errInvalidRequest, action: 'none' }
    case 'session_required':
      return { message: copy.errSessionRequired, action: 'retry' }
    case 'rate_limited':
      return { message: copy.errRateLimited, action: 'retry' }
    case 'login_required':
      return { message: copy.errLoginRequired, action: 'login' }
    case 'anon_capacity':
      return { message: copy.errAnonCapacity, action: 'login' }
    case 'credits_required':
      return {
        message: copy.errCreditsRequired
          .replace('{cost}', String(ADS_CREDIT_COSTS.scanAndPreview))
          .replace('{n}', String(error.balance ?? 0)),
        action: 'credits',
      }
    case 'duplicate':
      return { message: copy.errDuplicate, action: 'newScan' }
    case 'duplicate_lost':
      return { message: copy.errDuplicateLost, action: 'newScan' }
    case 'unreachable':
      return { message: copy.errUnreachable, action: 'retry' }
    case 'insufficient_content':
      return { message: copy.errInsufficientContent, action: 'none' }
    case 'policy_blocked': {
      const key = policyBlockedMessageKey(error.blockedCategories ?? [], Boolean(error.consumed))
      const message =
        key === 'errPolicyBlocked'
          ? error.consumed
            ? `${copy.errPolicyBlocked} ${copy.errPolicyConsumed}`
            : copy.errPolicyBlocked
          : copy[key]
      return { message, action: 'none' }
    }
    case 'policy_limit':
      return { message: copy.errPolicyBlockedLimit, action: 'none' }
    case 'generation_failed':
      return { message: copy.errGenerationFailed, action: 'retry' }
    case 'timeout':
      return { message: copy.errTimeout, action: 'retry' }
    case 'service_unavailable':
      return { message: copy.errServiceUnavailable, action: 'retry' }
    case 'network':
      return { message: copy.errNetwork, action: 'retry' }
  }
}
