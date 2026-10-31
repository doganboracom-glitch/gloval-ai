import type { PolicyCategory } from './policy-terms'

export type PolicyBlockedMessageKey = 'errPolicyBlockedAdultConsumed' | 'errPolicyBlockedAdultNotConsumed'

export function policyBlockedMessageKey(
  blockedCategories: readonly PolicyCategory[],
  policyAttemptCounted: boolean,
): PolicyBlockedMessageKey | null {
  if (!blockedCategories.includes('adult')) return null
  return policyAttemptCounted ? 'errPolicyBlockedAdultConsumed' : 'errPolicyBlockedAdultNotConsumed'
}
