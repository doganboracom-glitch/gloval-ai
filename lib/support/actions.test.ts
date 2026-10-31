import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createAdminClient: vi.fn(),
  insertTicket: vi.fn(),
  recordNotification: vi.fn(),
  sendTransactionalEmail: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/notify', () => ({
  recordNotification: mocks.recordNotification,
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import { createSupportTicket } from '@/lib/support/actions'

function ticketForm(department: string) {
  const formData = new FormData()
  formData.set('department', department)
  formData.set('priority', 'normal')
  formData.set('service', 'none')
  formData.set('projectId', 'none')
  formData.set('subject', 'GLOVAL Ads question')
  formData.set('message', 'Please help with my campaign.')
  return formData
}

function adminClient() {
  return {
    from: vi.fn((table: string) => ({
      insert: vi.fn((row: unknown) => {
        if (table === 'support_tickets') mocks.insertTicket(row)
        return {
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: table === 'support_tickets'
                ? { id: 'ticket-1', ticket_number: 'GLV-1234' }
                : { id: 'message-1' },
              error: null,
            }),
          })),
        }
      }),
    })),
  }
}

beforeEach(() => {
  mocks.getUser.mockReset().mockResolvedValue({
    data: { user: { id: 'user-1', email: 'owner@gloval.ai' } },
    error: null,
  })
  mocks.createAdminClient.mockReset()
  mocks.insertTicket.mockReset()
  mocks.recordNotification.mockReset().mockResolvedValue(undefined)
  mocks.sendTransactionalEmail.mockReset().mockResolvedValue(true)
  mocks.revalidatePath.mockReset()
})

describe('createSupportTicket department validation', () => {
  it('accepts gloval-ads and stores it on the ticket', async () => {
    mocks.createAdminClient.mockReturnValue(adminClient())

    const result = await createSupportTicket(ticketForm('gloval-ads'))

    expect(result).toEqual({ ok: true, ticketId: 'ticket-1', ticketNumber: 'GLV-1234' })
    expect(mocks.insertTicket).toHaveBeenCalledWith(expect.objectContaining({ department: 'gloval-ads' }))
  })

  it('rejects an unknown department before writing to Supabase', async () => {
    const result = await createSupportTicket(ticketForm('gloval-ad'))

    expect(result).toEqual({ ok: false, error: 'invalid_department' })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })
})
