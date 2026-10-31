import { describe, expect, it, vi } from 'vitest'
import { newTicketPathWithParams } from '@/lib/support/prefill'

const state = vi.hoisted(() => ({ user: null as { id: string; email?: string } | null }))

vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`)
  },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/support/queries', () => ({ listMyProjects: vi.fn(async () => []) }))
vi.mock('@/components/support/new-ticket-form', () => ({ NewTicketForm: () => null }))

import NewSupportTicketPage from './page'

describe('new support ticket authentication redirect', () => {
  it('sends signed-out visitors to signup and preserves the support path and query', async () => {
    state.user = null
    const params = { department: 'gloval-ads', subject: 'Ads help' }
    const next = newTicketPathWithParams(params)

    await expect(NewSupportTicketPage({ searchParams: Promise.resolve(params) })).rejects.toThrow(
      `NEXT_REDIRECT:/auth/sign-up?next=${encodeURIComponent(next)}`,
    )
  })
})
