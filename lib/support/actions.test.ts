import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  createAdminClient: vi.fn(),
  recordNotification: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  ticketInserts: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: state.getUser } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: state.createAdminClient }))
vi.mock('@/lib/notify', () => ({
  recordNotification: state.recordNotification,
  sendTransactionalEmail: state.sendTransactionalEmail,
}))

import { createSupportTicket } from './actions'

function prepareAdminClient() {
  const ticket = { id: 'ticket-1', ticket_number: 'GLV-1' }
  const message = { id: 'message-1' }

  state.createAdminClient.mockReturnValue({
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'support_tickets') state.ticketInserts.push(row)
        return {
          select: () => ({
            single: async () => ({ data: table === 'support_tickets' ? ticket : message, error: null }),
          }),
        }
      },
    }),
  })
}

function ticketForm(department: string): FormData {
  const form = new FormData()
  form.set('department', department)
  form.set('subject', 'Ads campaign help')
  form.set('message', 'Please help with my Ads campaign.')
  return form
}

beforeEach(() => {
  state.getUser.mockReset().mockResolvedValue({
    data: { user: { id: 'user-1', email: 'owner@gloval.ai' } },
  })
  state.createAdminClient.mockReset()
  state.recordNotification.mockReset().mockResolvedValue(undefined)
  state.sendTransactionalEmail.mockReset().mockResolvedValue(true)
  state.ticketInserts.length = 0
  vi.stubEnv('ADMIN_NOTIFICATION_EMAIL', 'support@gloval.ai')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createSupportTicket department validation', () => {
  it('rejects an unknown department before creating an admin database client', async () => {
    const result = await createSupportTicket(ticketForm('not-a-department'))

    expect(result).toEqual({ ok: false, error: 'invalid_department' })
    expect(state.createAdminClient).not.toHaveBeenCalled()
  })

  it('accepts GLOVAL Ads and includes its department name in notifications and admin email', async () => {
    prepareAdminClient()

    const result = await createSupportTicket(ticketForm('gloval-ads'))

    expect(result).toEqual({ ok: true, ticketId: 'ticket-1', ticketNumber: 'GLV-1' })
    expect(state.ticketInserts[0]?.department).toBe('gloval-ads')
    expect(state.recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ticket_created',
        subject: expect.stringContaining('GLOVAL Ads'),
        body: expect.stringContaining('GLOVAL Ads'),
      }),
    )

    const email = state.sendTransactionalEmail.mock.calls[0]?.[0] as {
      subject: string
      text: string
      html: string
    }
    expect(email.subject).toContain('GLOVAL Ads')
    expect(email.text).toContain('GLOVAL Ads')
    expect(email.html).toContain('GLOVAL Ads')
  })
})
