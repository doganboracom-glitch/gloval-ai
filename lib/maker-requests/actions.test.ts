import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createAdminClient: vi.fn(),
  sendTransactionalEmailDetailed: vi.fn(),
}))

vi.mock('@/lib/mail/admin-guard', () => ({ requireAdmin: mocks.requireAdmin }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/notify', () => ({ sendTransactionalEmailDetailed: mocks.sendTransactionalEmailDetailed }))

import { closeMakerRequest, saveMakerRequestNotes, sendMakerRequestReply } from './actions'

const REQUEST_ID = '456e7890-e89b-42d3-a456-426614174000'

beforeEach(() => {
  mocks.requireAdmin.mockReset()
  mocks.requireAdmin.mockRejectedValue(new Error('not_admin'))
  mocks.createAdminClient.mockReset()
  mocks.sendTransactionalEmailDetailed.mockReset()
})

describe('maker request admin actions', () => {
  it('rejects non-admin access before reading, writing, or sending email', async () => {
    await expect(saveMakerRequestNotes(REQUEST_ID, 'private note')).rejects.toThrow('not_admin')
    await expect(closeMakerRequest(REQUEST_ID)).rejects.toThrow('not_admin')
    await expect(sendMakerRequestReply(REQUEST_ID, 'Reply', 'tr')).rejects.toThrow('not_admin')

    expect(mocks.requireAdmin).toHaveBeenCalledTimes(3)
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
    expect(mocks.sendTransactionalEmailDetailed).not.toHaveBeenCalled()
  })
})
