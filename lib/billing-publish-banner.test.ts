import { describe, expect, it } from 'vitest'
import { resolvePublishBanner } from '@/lib/billing-publish-banner'

const base = { hasProject: true, suspended: false, hasPaidSubscription: false, options: null } as const

describe('resolvePublishBanner', () => {
  it('shows nothing without a publish target', () => {
    expect(resolvePublishBanner({ ...base, hasProject: false })).toBeNull()
  })

  it('offers FREE publishing, never "choose a plan first", to a FREE account', () => {
    expect(resolvePublishBanner({ ...base, options: { mode: 'free_choice' } })).toEqual({ kind: 'free_choice' })
  })

  it('explains the block when FREE cannot publish this site', () => {
    const options = { mode: 'packages_only', block: 'storefront' } as const
    expect(resolvePublishBanner({ ...base, options })).toEqual({ kind: 'blocked', options })
  })

  it('continues straight away for a paid plan', () => {
    expect(
      resolvePublishBanner({ ...base, hasPaidSubscription: true, options: { mode: 'direct' } }),
    ).toEqual({ kind: 'continue', paid: true })
  })

  it('keeps the suspended payment notice', () => {
    expect(resolvePublishBanner({ ...base, suspended: true, options: { mode: 'free_choice' } })).toEqual({
      kind: 'suspended',
    })
  })
})
