import { describe, expect, it } from 'vitest'
import {
  buildMakerRequestAcknowledgementEmail,
  buildMakerRequestAdminEmail,
  buildMakerRequestReplyEmail,
} from './maker-request-mail'
import type { MakerRequest } from '@/lib/maker-requests/types'

const request: MakerRequest = {
  id: '456e7890-e89b-42d3-a456-426614174000',
  created_at: '2026-11-04T12:00:00.000Z',
  user_id: null,
  full_name: '<script>alert(1)</script>',
  phone: '+90 555 123 45 67',
  email: 'derya@example.net',
  budget_range: '10000-25000',
  reference_links: ['https://example.com/?q=<script>'],
  status: 'new',
  consent_version: 'kvkk-maker-request-v1',
  consent_at: '2026-11-04T12:00:00.000Z',
  ip_hash: 'a'.repeat(64),
  admin_notes: '',
  replied_at: null,
  reply_text: null,
}

describe('maker request email templates', () => {
  it('keeps user-provided values escaped in admin and reply email HTML', () => {
    const adminEmail = buildMakerRequestAdminEmail(request)
    const replyEmail = buildMakerRequestReplyEmail({ fullName: request.full_name, reply: '<img src=x onerror=alert(1)>', lang: 'en' })

    expect(adminEmail.html).not.toContain('<script>')
    expect(adminEmail.html).toContain('&lt;script&gt;')
    expect(replyEmail.html).not.toContain('<img src=x')
    expect(replyEmail.html).toContain('&lt;img')
  })

  it('builds the acknowledgment in the submitted language without a price promise', () => {
    const tr = buildMakerRequestAcknowledgementEmail(request, 'tr')
    const en = buildMakerRequestAcknowledgementEmail(request, 'en')

    expect(tr.subject).toContain('alındı')
    expect(tr.text).toContain('1 iş günü')
    expect(en.subject).toContain('received')
    expect(en.text).toContain('one business day')
    expect(tr.text).not.toMatch(/fiyat|teklifiniz hazır/i)
  })
})
