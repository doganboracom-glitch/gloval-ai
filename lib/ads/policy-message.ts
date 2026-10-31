import type { PolicyCategory } from './policy-terms'

export type PolicyBlockedMessageKey =
  | 'errPolicyBlocked'
  | 'errPolicyBlockedAdultConsumed'
  | 'errPolicyBlockedAdultNotConsumed'

export function policyBlockedMessageKey(
  blockedCategories: readonly PolicyCategory[],
  blockedAttemptCounted: boolean,
): PolicyBlockedMessageKey {
  if (!blockedCategories.includes('adult')) return 'errPolicyBlocked'
  return blockedAttemptCounted ? 'errPolicyBlockedAdultConsumed' : 'errPolicyBlockedAdultNotConsumed'
}
