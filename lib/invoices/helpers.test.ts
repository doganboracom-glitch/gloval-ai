import { describe, expect, it } from 'vitest'
import { INVOICE_MAX_BYTES } from '@/lib/invoices/constants'
import { buildInvoicesCsv } from '@/lib/invoices/csv'
import { redactAuditDetail } from '@/lib/invoices/audit-redact'
import {
  archiveStoragePath,
  inspectPdf,
  isArchiveStoragePath,
  isInvoiceStoragePath,
  sanitizeUploadedFileName,
} from '@/lib/invoices/pdf'
import type { AdminInvoiceRow } from '@/lib/invoices/types'

const pdf = (extra = '') => new TextEncoder().encode(`%PDF-1.4\n${extra}\n%%EOF`)

describe('inspectPdf', () => {
  it('accepts a real PDF signature and rejects everything else', () => {
    expect(inspectPdf(pdf())).toEqual({ ok: true })
    expect(inspectPdf(new TextEncoder().encode('<html>not a pdf at all</html>'))).toEqual({ ok: false, error: 'unsupported_type' })
    expect(inspectPdf(new Uint8Array())).toEqual({ ok: false, error: 'invalid_input' })
    expect(inspectPdf(new TextEncoder().encode(' %PDF-1.4 leading space'))).toEqual({ ok: false, error: 'unsupported_type' })
  })

  it('enforces the 5 MB limit and blocks script or launch actions', () => {
    const big = new Uint8Array(INVOICE_MAX_BYTES + 1)
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d])
    expect(inspectPdf(big)).toEqual({ ok: false, error: 'too_large' })
    expect(inspectPdf(pdf('/JavaScript (app.alert(1))'))).toEqual({ ok: false, error: 'active_content' })
  })
})

describe('sanitizeUploadedFileName', () => {
  it('keeps only a safe base name', () => {
    expect(sanitizeUploadedFileName('../../etc/passwd')).toBe('passwd.pdf')
    expect(sanitizeUploadedFileName('C:\\evil\\<fatura>.pdf')).toBe('fatura.pdf')
    expect(sanitizeUploadedFileName(undefined)).toBe('fatura.pdf')
    expect(sanitizeUploadedFileName('a'.repeat(400) + '.pdf').length).toBeLessThanOrEqual(200)
  })
})

describe('storage paths', () => {
  const id = '22222222-2222-4222-8222-222222222222'
  it('archive paths are valid archives but can never be signed as invoice files', () => {
    const path = archiveStoragePath(id, 1_790_000_000.9)
    expect(path).toBe(`_archived/${id}-1790000000.pdf`)
    expect(isArchiveStoragePath(path)).toBe(true)
    expect(isInvoiceStoragePath(path)).toBe(false)
  })

  it('keeps the archive path intact in audit detail while still redacting identity numbers', () => {
    const path = archiveStoragePath(id, 1_790_000_000)
    const detail = redactAuditDetail({ archivePath: path, tckn: '12345678901', note: 'id 12345678901' })
    expect(detail.archivePath).toBe(path)
    expect(detail.tckn).toBe('[redacted]')
    expect(detail.note).toBe('[redacted]')
  })
})

describe('buildInvoicesCsv', () => {
  const row = (overrides: Partial<AdminInvoiceRow>): AdminInvoiceRow => ({
    transactionId: 't1',
    transactionNumber: 'GLV-1',
    createdAt: '2026-10-01T10:00:00Z',
    userId: 'u1',
    email: 'a@example.com',
    fullName: 'Ali',
    provider: 'iyzico',
    category: 'subscription',
    description: 'Plan',
    amountKurus: 12000,
    currency: 'TRY',
    expectsInvoice: true,
    invoice: null,
    profileComplete: null,
    ...overrides,
  })

  it('neutralises formula-leading cells and never emits profile fields', () => {
    const csv = buildInvoicesCsv([
      row({ fullName: '=HYPERLINK("http://x")' }),
      row({ fullName: '+1', email: '-2', description: '@SUM(A1)' }),
    ])
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`)
    expect(csv).toContain(`"'+1"`)
    expect(csv).toContain(`"'-2"`)
    expect(csv).toContain(`"'@SUM(A1)"`)
    expect(csv.toLowerCase()).not.toMatch(/tckn|vkn|vergi no|kimlik/)
  })

  it('also neutralises cells that start with a tab or carriage return', () => {
    const csv = buildInvoicesCsv([row({ fullName: '\tcmd', description: '\r=1+1' })])
    expect(csv).toContain(`"'\tcmd"`)
    expect(csv).toContain(`"'\r=1+1"`)
  })
})
