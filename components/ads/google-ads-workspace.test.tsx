// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useSWR: vi.fn() }))

vi.mock('swr', () => ({ default: (...args: unknown[]) => mocks.useSWR(...args) }))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: 'en' }) }))

import { GoogleAdsWorkspace } from '@/components/ads/google-ads-workspace'

beforeEach(() => {
  mocks.useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: false, mutate: vi.fn() })
})

afterEach(() => {
  cleanup()
  mocks.useSWR.mockReset()
})

describe('GoogleAdsWorkspace publish feature gate', () => {
  it('renders nothing and does not fetch when publish access is disabled', () => {
    const { container } = render(
      <GoogleAdsWorkspace enabled={false} connections={[]} initialAddress={null} />,
    )

    expect(container.firstChild).toBeNull()
    expect(mocks.useSWR).toHaveBeenCalledTimes(2)
    expect(mocks.useSWR.mock.calls.every(([key]) => key === null)).toBe(true)
  })
})
