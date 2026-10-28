import { describe, expect, it } from 'vitest'
import { deriveInvoiceEmailStatus, type InvoiceEmailEvent } from '@/lib/invoices/email-status'

const event = (overrides: Partial<InvoiceEmailEvent>): InvoiceEmailEvent => ({
  status: 'sent',
  attachment_state: 'attached',
  file_sha256: 'aaa',
  sent_at: '2026-10-28T10:00:00Z',
  created_at: '2026-10-28T09:59:00Z',
  ...overrides,
})

describe('deriveInvoiceEmailStatus', () => {
  it('is not_sent without events or without a current file', () => {
    expect(deriveInvoiceEmailStatus([], 'aaa').state).toBe('not_sent')
    expect(deriveInvoiceEmailStatus([event({})], null).state).toBe('not_sent')
  })

  it('maps event statuses', () => {
    expect(deriveInvoiceEmailStatus([event({})], 'aaa')).toEqual({ state: 'sent', sentAt: '2026-10-28T10:00:00Z' })
    expect(deriveInvoiceEmailStatus([event({ status: 'pending', sent_at: null })], 'aaa').state).toBe('sending')
    expect(deriveInvoiceEmailStatus([event({ status: 'processing', sent_at: null })], 'aaa').state).toBe('sending')
    expect(deriveInvoiceEmailStatus([event({ status: 'failed', sent_at: null })], 'aaa').state).toBe('failed')
    expect(deriveInvoiceEmailStatus([event({ attachment_state: 'omitted' })], 'aaa').state).toBe('sent_without_attachment')
  })

  it('ignores events for a replaced file', () => {
    expect(deriveInvoiceEmailStatus([event({ file_sha256: 'old' })], 'aaa').state).toBe('not_sent')
  })

  it('uses the latest event for the current file', () => {
    const failed = event({ status: 'failed', sent_at: null, created_at: '2026-10-28T09:00:00Z' })
    const retried = event({ created_at: '2026-10-28T11:00:00Z' })
    expect(deriveInvoiceEmailStatus([retried, failed], 'aaa').state).toBe('sent')
    expect(deriveInvoiceEmailStatus([failed, event({ status: 'pending', sent_at: null, created_at: '2026-10-28T12:00:00Z' })], 'aaa').state).toBe('sending')
  })
})
