import { Children, isValidElement, type ElementType, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '@/lib/supabase/auth-state'
import { Pricing } from '@/components/pricing'

const mocks = vi.hoisted(() => ({ getRequestUser: vi.fn() }))

vi.mock('@/lib/supabase/request-user', () => ({
  getRequestUser: mocks.getRequestUser,
}))

import Page from './page'

function findElementByType<P>(node: ReactNode, type: ElementType): ReactElement<P> | null {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue
    if (child.type === type) return child as ReactElement<P>

    const nestedChildren = (child.props as { children?: ReactNode }).children
    const nested = findElementByType<P>(nestedChildren, type)
    if (nested) return nested
  }

  return null
}

const user = {
  id: 'homepage-user',
  email: 'homepage@example.test',
  email_confirmed_at: '2025-02-03T04:05:06.000Z',
  created_at: '2025-02-01T04:05:06.000Z',
}

const authCases: Array<{ label: string; state: AuthState; isAuthenticated: boolean }> = [
  {
    label: 'verified users',
    state: { kind: 'authenticated', user },
    isAuthenticated: true,
  },
  {
    label: 'signed-out visitors',
    state: { kind: 'unauthenticated' },
    isAuthenticated: false,
  },
  {
    label: 'unavailable auth',
    state: { kind: 'unavailable' },
    isAuthenticated: false,
  },
]

beforeEach(() => {
  mocks.getRequestUser.mockReset()
})

describe('homepage pricing auth state', () => {
  it.each(authCases)('passes $label state to pricing without extra lookups', async ({ state, isAuthenticated }) => {
    mocks.getRequestUser.mockResolvedValue(state)

    const page = await Page()
    const pricing = findElementByType<{ isAuthenticated: boolean }>(page, Pricing)

    expect(mocks.getRequestUser).toHaveBeenCalledTimes(1)
    expect(pricing?.props.isAuthenticated).toBe(isAuthenticated)
  })
})
