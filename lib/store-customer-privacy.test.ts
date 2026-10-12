import { describe, expect, it } from 'vitest'
import {
  anonymizedEmail,
  buildAnonymizePatch,
  buildAuditEvent,
  buildCustomersCsv,
  confirmPhraseMatches,
  csvCell,
  emailConfirmMatches,
  escapeLikePattern,
  hasBlockingOrders,
  isBlockingOrder,
  isMissingDeletionSchema,
  normalizeCustomerSearch,
  pageOffset,
  parseCustomerSort,
  summarizeOrders,
} from '@/lib/store-customer-privacy'

describe('blocking orders', () => {
  it('blocks in-flight orders', () => {
    expect(isBlockingOrder({ status: 'paid', shipping_status: 'preparing' })).toBe(true)
    expect(isBlockingOrder({ status: 'processing' })).toBe(true)
    expect(isBlockingOrder({ status: 'shipped', shipping_status: 'shipped' })).toBe(true)
    expect(isBlockingOrder({ status: 'pending', payment_status: 'pending' })).toBe(true)
  })
  it('does not block settled orders', () => {
    for (const status of ['cancelled', 'refunded', 'completed', 'delivered', 'failed']) {
      expect(isBlockingOrder({ status })).toBe(false)
    }
    expect(isBlockingOrder({ status: 'paid', shipping_status: 'delivered' })).toBe(false)
    expect(isBlockingOrder({ status: 'pending', payment_status: 'failed' })).toBe(false)
  })
  it('blocks unknown statuses', () => {
    expect(isBlockingOrder({ status: 'brand_new_status' })).toBe(true)
  })
  it('aggregates', () => {
    expect(hasBlockingOrders([])).toBe(false)
    expect(hasBlockingOrders([{ status: 'completed' }, { status: 'paid' }])).toBe(true)
  })
})

describe('anonymization patch', () => {
  const now = '2026-01-01T00:00:00.000Z'
  const patch = buildAnonymizePatch('abc', now)
  it('wipes every personal field', () => {
    expect(patch).toMatchObject({
      name: '',
      phone: '',
      city: '',
      address: '',
      invoice: null,
      password_hash: '',
      reset_token_hash: null,
      reset_token_expires: null,
    })
  })
  it('uses a unique unroutable email and kills sessions', () => {
    expect(patch.email).toBe(anonymizedEmail('abc'))
    expect(patch.email).toMatch(/@invalid\.local$/)
    expect(anonymizedEmail('abc')).not.toBe(anonymizedEmail('abd'))
    expect(patch.deleted_at).toBe(now)
    expect(patch.password_changed_at).toBe(now)
  })
})

describe('confirmation', () => {
  it('accepts SİL variants and DELETE', () => {
    for (const v of ['SİL', 'SIL', 'sil', 'sıl', ' Sil ', 'delete']) expect(confirmPhraseMatches(v)).toBe(true)
    for (const v of ['', 'si', 'silx', null, 3]) expect(confirmPhraseMatches(v)).toBe(false)
  })
  it('matches owner email case-insensitively and never when empty', () => {
    expect(emailConfirmMatches(' A@B.com ', 'a@b.com')).toBe(true)
    expect(emailConfirmMatches('x@b.com', 'a@b.com')).toBe(false)
    expect(emailConfirmMatches('', '')).toBe(false)
  })
})

describe('schema detection', () => {
  it('detects missing migration', () => {
    expect(isMissingDeletionSchema({ code: '42703' })).toBe(true)
    expect(isMissingDeletionSchema({ message: 'column store_customers.deleted_at does not exist' })).toBe(true)
    expect(isMissingDeletionSchema({ code: '23505', message: 'dup' })).toBe(false)
    expect(isMissingDeletionSchema(null)).toBe(false)
  })
})

describe('search, sort and paging', () => {
  it('escapes ILIKE wildcards', () => {
    expect(escapeLikePattern('50%_off\\')).toBe('50\\%\\_off\\\\')
  })
  it('requires two characters', () => {
    expect(normalizeCustomerSearch('a')).toBeNull()
    expect(normalizeCustomerSearch(' ab ')).toBe('ab')
    expect(normalizeCustomerSearch('a%')).toBe('a\\%')
    expect(normalizeCustomerSearch(undefined)).toBeNull()
    expect(normalizeCustomerSearch('x'.repeat(500))).toHaveLength(100)
  })
  it('whitelists sort', () => {
    expect(parseCustomerSort('spent')).toBe('spent')
    expect(parseCustomerSort('last_order')).toBe('last_order')
    expect(parseCustomerSort('; drop table')).toBe('newest')
  })
  it('clamps pages', () => {
    expect(pageOffset('3', 25)).toEqual({ page: 3, offset: 50 })
    expect(pageOffset('-4', 25)).toEqual({ page: 1, offset: 0 })
    expect(pageOffset('abc', 25)).toEqual({ page: 1, offset: 0 })
    expect(pageOffset(undefined, 25).page).toBe(1)
    expect(pageOffset('99999999', 25).page).toBe(10_000)
  })
})

describe('csv', () => {
  it('neutralizes formula injection and quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+90 555')).toBe("'+90 555")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(null)).toBe('')
    expect(csvCell(5)).toBe('5')
  })
  it('builds a BOM-prefixed file without secrets', () => {
    const csv = buildCustomersCsv([
      {
        name: 'Ayşe',
        email: 'a@b.com',
        phone: '+90 555',
        city: 'İzmir',
        created_at: '2026-01-01',
        order_count: 2,
        total_spent_cents: 12345,
        last_order_at: null,
      },
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('123.45')
    expect(csv).toContain("'+90 555")
    expect(csv.toLowerCase()).not.toContain('password')
    expect(csv.split('\r\n')).toHaveLength(3)
  })
})

describe('order summary and audit', () => {
  it('counts spend only for paid, non-reversed orders', () => {
    expect(
      summarizeOrders([
        { status: 'paid', payment_status: 'paid', total_cents: 1000 },
        { status: 'refunded', payment_status: 'paid', total_cents: 500 },
        { status: 'pending', payment_status: 'pending', total_cents: 700 },
        { status: 'failed', payment_status: 'failed', total_cents: 900 },
      ]),
    ).toEqual({ orderCount: 3, totalSpentCents: 1000 })
  })
  it('audit event carries ids only', () => {
    const e = buildAuditEvent({ projectId: 'p', customerId: 'c', event: 'anonymized_by_owner', actorUserId: 'u' })
    expect(Object.keys(e).sort()).toEqual(['actor_user_id', 'customer_id', 'event', 'project_id'])
  })
})
