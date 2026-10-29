import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/notify', () => ({ SUPPORT_EMAIL: 'support@gloval.ai', sendTransactionalEmailDetailed: vi.fn() }))

import { buildReplyForTicket, resolveReplyRecipient, type ReplyTicket } from '@/lib/support/ticket-reply-mail'

const guestTicket: ReplyTicket = {
  id: 't-guest',
  user_id: null,
  subject: 'İletişim formu: Ali',
  ticket_number: 'GLV-AAAAAA',
  contact_email: 'ali@example.com',
  contact_name: 'Ali Veli',
}

const accountTicket: ReplyTicket = {
  ...guestTicket,
  id: 't-account',
  user_id: 'user-1',
  ticket_number: 'GLV-BBBBBB',
  contact_email: null,
  contact_name: null,
}

describe('resolveReplyRecipient (server-side audience decision)', () => {
  it('treats a ticket without an owner account as a guest, using the visitor language', async () => {
    const recipient = await resolveReplyRecipient(guestTicket, { guestLang: async () => 'en' })
    expect(recipient).toEqual({ to: 'ali@example.com', audience: 'guest', lang: 'en', name: 'Ali Veli' })
  })

  it('treats a ticket whose owner resolves to a user as an account', async () => {
    const recipient = await resolveReplyRecipient(accountTicket, {
      lookupOwner: async () => ({ email: 'owner@example.com', metadata: { full_name: 'Owner', email_locale: 'tr' } }),
    })
    expect(recipient).toMatchObject({ to: 'owner@example.com', audience: 'account', lang: 'tr', name: 'Owner' })
  })

  it('falls back to guest when the owner account no longer exists but a contact email does', async () => {
    const recipient = await resolveReplyRecipient(
      { ...accountTicket, contact_email: 'fallback@example.com' },
      { lookupOwner: async () => null, guestLang: async () => 'tr' },
    )
    expect(recipient).toMatchObject({ to: 'fallback@example.com', audience: 'guest' })
  })

  it('returns null when there is nobody to write to', async () => {
    expect(await resolveReplyRecipient(accountTicket, { lookupOwner: async () => null })).toBeNull()
  })
})

describe('buildReplyForTicket', () => {
  it('guest mail has no dashboard link, account mail has the view button', async () => {
    const guest = await buildReplyForTicket(guestTicket, 'Merhaba', { guestLang: async () => 'tr' })
    const account = await buildReplyForTicket(accountTicket, 'Merhaba', {
      lookupOwner: async () => ({ email: 'owner@example.com', metadata: {} }),
    })
    expect(guest?.mail.subject).toBe('Talebinize yanıt verildi (GLV-AAAAAA) | GLOVAL AI')
    expect(guest?.mail.html).not.toContain('Talebi görüntüle')
    expect(guest?.mail.html).not.toContain('/support/')
    expect(account?.mail.subject).toBe('Talebinize yanıt verildi (GLV-BBBBBB) | GLOVAL AI')
    expect(account?.mail.html).toContain('Talebi görüntüle')
    expect(account?.mail.html).toContain('/support/t-account')
  })
})
