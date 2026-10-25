import { describe, expect, it } from 'vitest'
import { isFreePlanShown, resolveImplicitFreePlan } from '@/lib/billing-summary'

const plans = [
  { id: 'a', code: 'starter_monthly', price_cents: 29900 },
  { id: 'b', code: 'free', price_cents: 0 },
  { id: 'c', code: 'pro_yearly', price_cents: 99900 },
]

describe('automatic FREE plan', () => {
  it('is active for an account with no subscription row', () => {
    expect(resolveImplicitFreePlan(null, plans)?.code).toBe('free')
    expect(resolveImplicitFreePlan(undefined, plans)?.code).toBe('free')
  })

  it('is not implied once a subscription exists', () => {
    expect(resolveImplicitFreePlan({ id: 's1' }, plans)).toBeNull()
  })

  it('is not implied when the catalog has no free plan', () => {
    expect(resolveImplicitFreePlan(null, [plans[0]])).toBeNull()
  })

  it('shows no renewal date or cancel link for FREE, but does for paid plans', () => {
    expect(isFreePlanShown(plans[1])).toBe(true)
    expect(isFreePlanShown(plans[0])).toBe(false)
    expect(isFreePlanShown(null)).toBe(false)
  })
})
