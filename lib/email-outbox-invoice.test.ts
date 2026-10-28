import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  events: [] as Row[],
  users: new Map<string, { email: string | null; user_metadata: Record<string, unknown> }>(),
  lookupError: null as { status: number } | null,
  failInsert: false,
  deliver: vi.fn(),
  seq: 0,
}))

vi.mock('next/server', () => ({
  after: () => {
    throw new Error('outside request scope')
  },
}))
vi.mock('@/lib/domains', () => ({ tenantUrl: (slug: string) => `https://${slug}.gloval.site` }))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => null }))
vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'support@gloval.ai',
  sendTransactionalEmailDetailed: vi.fn(),
}))
vi.mock('@/lib/invoices/email-delivery', () => ({ deliverInvoiceReady: (...args: unknown[]) => db.deliver(...args) }))

vi.mock('@/lib/supabase/admin', () => {
  type Filter = (row: Row) => boolean

  class Query {
    private op: 'select' | 'insert' | 'update' = 'select'
    private filters: Filter[] = []
    private patch: Row = {}
    private payload: Row = {}
    private max = Infinity
    private pick: 'maybe' | 'one' | null = null

    constructor(private table: Row[]) {}

    select() {
      return this
    }
    insert(payload: Row) {
      this.op = 'insert'
      this.payload = payload
      return this
    }
    update(patch: Row) {
      this.op = 'update'
      this.patch = patch
      return this
    }
    eq(column: string, value: unknown) {
      this.filters.push((row) => row[column] === value)
      return this
    }
    in(column: string, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]))
      return this
    }
    lte(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) <= value)
      return this
    }
    lt(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) < value)
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    maybeSingle() {
      this.pick = 'maybe'
      return this
    }
    single() {
      this.pick = 'one'
      return this
    }

    private run(): { data: unknown; error: { code?: string; message: string } | null } {
      if (this.op === 'insert') {
        if (db.failInsert) return { data: null, error: { message: 'insert exploded' } }
        const key = this.payload.dedupe_key
        if (key && this.table.some((row) => row.dedupe_key === key)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } }
        }
        const row: Row = {
          id: `evt-${++db.seq}`,
          status: 'pending',
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          lease_until: null,
          last_error: null,
          project_id: null,
          transition_id: null,
          ...this.payload,
        }
        this.table.push(row)
        return { data: { id: row.id }, error: null }
      }

      const matched = this.table.filter((row) => this.filters.every((f) => f(row))).slice(0, this.max)
      if (this.op === 'update') {
        for (const row of matched) Object.assign(row, this.patch)
      }
      if (this.pick) return { data: matched[0] ?? null, error: null }
      return { data: matched, error: null }
    }

    then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return Promise.resolve(this.run()).then(resolve, reject)
    }
  }

  return {
    createAdminClient: () => ({
      from: (name: string) => new Query(name === 'email_events' ? db.events : []),
      auth: {
        admin: {
          getUserById: async (id: string) => {
            if (db.lookupError) return { data: { user: null }, error: db.lookupError }
            const user = db.users.get(id)
            if (!user) return { data: { user: null }, error: { status: 404 } }
            return { data: { user: { id, ...user } }, error: null }
          },
        },
      },
    }),
  }
})

import { enqueueInvoiceReadyEmail, hasActiveInvoiceEmail, processEventById } from '@/lib/email-outbox'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const INVOICE = '33333333-3333-4333-8333-333333333333'
const OTHER_INVOICE = '44444444-4444-4444-8444-444444444444'
const SHA = 'a'.repeat(64)
const NEW_SHA = 'b'.repeat(64)

const invoiceEvents = () => db.events.filter((row) => row.kind === 'invoice_ready')

describe('enqueueInvoiceReadyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db.events.length = 0
    db.users.clear()
    db.lookupError = null
    db.failInsert = false
    db.seq = 0
    db.users.set(USER_A, { email: 'ayse@example.com', user_metadata: { full_name: 'Ayşe Yılmaz' } })
    db.users.set(USER_B, { email: 'bora@example.com', user_metadata: { email_locale: 'en' } })
    db.deliver.mockResolvedValue({ type: 'sent', messageId: 'msg_1', attachment: { state: 'attached', reason: null } })
  })

  it('queues one event for the invoice owner, keyed by invoice and checksum', async () => {
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })).resolves.toBe('queued')
    expect(invoiceEvents()).toHaveLength(1)
    expect(invoiceEvents()[0]).toMatchObject({
      user_id: USER_A,
      kind: 'invoice_ready',
      invoice_id: INVOICE,
      file_sha256: SHA,
      dedupe_key: `invoice:${INVOICE}:${SHA}`,
      status: 'pending',
    })
  })

  it('sends to the address of the event owner and never to another user', async () => {
    await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_B, fileSha256: SHA })
    await enqueueInvoiceReadyEmail({ invoiceId: OTHER_INVOICE, userId: USER_A, fileSha256: SHA })

    await processEventById(invoiceEvents()[0].id as string)

    expect(db.deliver).toHaveBeenCalledTimes(1)
    const [row, recipient] = db.deliver.mock.calls[0]
    expect(row).toMatchObject({ user_id: USER_B, invoice_id: INVOICE, file_sha256: SHA })
    expect(recipient).toMatchObject({ email: 'bora@example.com' })
    expect(JSON.stringify(db.deliver.mock.calls)).not.toContain('ayse@example.com')
    expect(invoiceEvents()[0]).toMatchObject({ status: 'sent', attachment_state: 'attached' })
    expect(invoiceEvents()[1]).toMatchObject({ status: 'pending' })
  })

  it('does not queue the automatic email twice for the same invoice and file', async () => {
    const first = await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    const second = await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    expect([first, second]).toEqual(['queued', 'duplicate'])
    expect(invoiceEvents()).toHaveLength(1)
  })

  it('queues a replacement file with its own email', async () => {
    await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: NEW_SHA })).resolves.toBe('queued')
    expect(invoiceEvents().map((row) => row.dedupe_key)).toEqual([`invoice:${INVOICE}:${SHA}`, `invoice:${INVOICE}:${NEW_SHA}`])
  })

  it('queues nothing when the invoice has no user or the user has no address', async () => {
    db.users.set(USER_B, { email: null, user_metadata: {} })
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: null, fileSha256: SHA })).resolves.toBe('no_recipient')
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_B, fileSha256: SHA })).resolves.toBe('no_recipient')
    await expect(
      enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: '99999999-9999-4999-8999-999999999999', fileSha256: SHA }),
    ).resolves.toBe('no_recipient')
    expect(invoiceEvents()).toHaveLength(0)
  })

  it('still queues when the address lookup itself fails, because delivery retries it', async () => {
    db.lookupError = { status: 500 }
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })).resolves.toBe('queued')
    expect(invoiceEvents()).toHaveLength(1)
  })

  it('reports failed instead of throwing when the insert breaks', async () => {
    db.failInsert = true
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })).resolves.toBe('failed')
  })
})

describe('invoice email resend', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    db.events.length = 0
    db.users.clear()
    db.lookupError = null
    db.failInsert = false
    db.seq = 0
    db.users.set(USER_A, { email: 'ayse@example.com', user_metadata: {} })
  })

  it('uses a unique key per resend, so it is not swallowed by the original dedupe key', async () => {
    await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    invoiceEvents()[0].status = 'sent'

    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('queued')
    invoiceEvents()[1].status = 'sent'
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('queued')

    const keys = invoiceEvents().map((row) => row.dedupe_key as string)
    expect(new Set(keys).size).toBe(3)
    expect(keys[1]).toMatch(new RegExp(`^invoice:${INVOICE}:${SHA}:resend:[0-9a-f-]{36}$`))
    expect(keys[2]).toMatch(/:resend:/)
  })

  it.each(['pending', 'processing'])('is refused while another email for the invoice is %s', async (status) => {
    await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    invoiceEvents()[0].status = status

    await expect(hasActiveInvoiceEmail(INVOICE)).resolves.toBe(true)
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('in_progress')
    expect(invoiceEvents()).toHaveLength(1)
  })

  it.each(['sent', 'failed'])('is allowed once the previous email is %s', async (status) => {
    await enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA })
    invoiceEvents()[0].status = status

    await expect(hasActiveInvoiceEmail(INVOICE)).resolves.toBe(false)
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('queued')
  })

  it('does not look at other invoices when deciding whether one is in flight', async () => {
    await enqueueInvoiceReadyEmail({ invoiceId: OTHER_INVOICE, userId: USER_A, fileSha256: SHA })
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('queued')
  })

  it('refuses a resend without a deliverable address', async () => {
    db.users.set(USER_A, { email: null, user_metadata: {} })
    await expect(enqueueInvoiceReadyEmail({ invoiceId: INVOICE, userId: USER_A, fileSha256: SHA, resend: true })).resolves.toBe('no_recipient')
    expect(invoiceEvents()).toHaveLength(0)
  })
})
