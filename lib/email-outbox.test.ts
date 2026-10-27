import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>

const db = vi.hoisted(() => ({
  events: [] as Row[],
  projects: [] as Row[],
  users: new Map<string, { email: string | null; user_metadata: Record<string, unknown> }>(),
  plan: null as string | null,
  send: vi.fn(),
  seq: 0,
}))

vi.mock('next/server', () => ({
  after: () => {
    throw new Error('outside request scope')
  },
}))

vi.mock('@/lib/domains', () => ({ tenantUrl: (slug: string) => `https://${slug}.gloval.site` }))
vi.mock('@/lib/billing', () => ({ getPlanCodeForUser: async () => db.plan }))
vi.mock('@/lib/notify', () => ({
  SUPPORT_EMAIL: 'support@gloval.ai',
  sendTransactionalEmailDetailed: (...args: unknown[]) => db.send(...args),
}))

vi.mock('@/lib/supabase/admin', () => {
  type Filter = (row: Row) => boolean

  class Query {
    private op: 'select' | 'insert' | 'update' = 'select'
    private filters: Filter[] = []
    private patch: Row = {}
    private payload: Row = {}
    private returning = false
    private sortBy: { column: string; ascending: boolean } | null = null
    private max = Infinity
    private pick: 'maybe' | 'one' | null = null

    constructor(private table: Row[]) {}

    select() {
      this.returning = true
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
    lte(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) <= value)
      return this
    }
    lt(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) < value)
      return this
    }
    gte(column: string, value: string) {
      this.filters.push((row) => typeof row[column] === 'string' && (row[column] as string) >= value)
      return this
    }
    in() {
      return this
    }
    limit(n: number) {
      this.max = n
      return this
    }
    orderBy(column: string, ascending: boolean) {
      this.sortBy = { column, ascending }
      return this
    }
    maybeSingle() {
      this.pick = 'maybe'
      return this
    }
    singleRow() {
      this.pick = 'one'
      return this
    }

    private run(): { data: unknown; error: { code?: string; message: string; status?: number } | null } {
      const matches = (row: Row) => this.filters.every((f) => f(row))

      if (this.op === 'insert') {
        const payload = this.payload
        const duplicate = this.table.some((row) => {
          if (row.user_id !== payload.user_id || row.kind !== payload.kind) return false
          if (payload.kind === 'account_welcome') return true
          if (row.project_id !== payload.project_id) return false
          return payload.kind === 'project_first_published' || row.transition_id === payload.transition_id
        })
        if (duplicate) return { data: null, error: { code: '23505', message: 'duplicate' } }
        const row: Row = {
          id: `evt-${++db.seq}`,
          status: 'pending',
          attempts: 0,
          next_attempt_at: new Date().toISOString(),
          lease_until: null,
          last_error: null,
          created_at: new Date().toISOString(),
          project_id: null,
          transition_id: null,
          ...payload,
        }
        this.table.push(row)
        return { data: { id: row.id }, error: null }
      }

      let rows = this.table.filter(matches)
      if (this.op === 'update') for (const row of rows) Object.assign(row, this.patch)
      if (this.sortBy) {
        const { column, ascending } = this.sortBy
        rows = [...rows].sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
      }
      rows = rows.slice(0, this.max)
      const data = this.op === 'update' && !this.returning ? null : rows.map((row) => ({ ...row }))
      if (this.pick) return { data: (data as Row[] | null)?.[0] ?? null, error: null }
      return { data, error: null }
    }

    then<T>(resolve: (value: ReturnType<Query['run']>) => T) {
      return Promise.resolve(this.run()).then(resolve)
    }
  }

  const withOrder = (query: Query) => {
    const original = query as Query & { order?: unknown }
    ;(original as unknown as { order: (c: string, o: { ascending: boolean }) => Query }).order = (
      column: string,
      options: { ascending: boolean },
    ) => query.orderBy(column, options.ascending)
    ;(original as unknown as { single: () => Query }).single = () => query.singleRow()
    return query
  }

  return {
    createAdminClient: () => ({
      from: (name: string) => {
        const table = name === 'email_events' ? db.events : db.projects
        return withOrder(new Query(table))
      },
      auth: {
        admin: {
          getUserById: async (id: string) => {
            const user = db.users.get(id)
            return user
              ? { data: { user: { id, ...user } }, error: null }
              : { data: { user: null }, error: { message: 'not found', status: 404 } }
          },
        },
      },
    }),
  }
})

import {
  ensureAndSendWelcomeEmail,
  enqueueProjectFirstPublishedEmail,
  enqueueProjectUnpublishedEmail,
  processDueEmailEvents,
  processEventById,
} from '@/lib/email-outbox'
import { MAX_ATTEMPTS } from '@/lib/email-outbox-policy'

const USER = 'user-1'
const PROJECT = 'project-1'

function seedEvent(patch: Row = {}): Row {
  const row: Row = {
    id: `evt-${++db.seq}`,
    user_id: USER,
    kind: 'account_welcome',
    project_id: null,
    transition_id: null,
    status: 'pending',
    attempts: 0,
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    lease_until: null,
    last_error: null,
    created_at: new Date().toISOString(),
    ...patch,
  }
  db.events.push(row)
  return row
}

const ok = (messageId = 'msg-1') => ({ ok: true, messageId })

beforeEach(() => {
  db.events.length = 0
  db.projects.length = 0
  db.users.clear()
  db.users.set(USER, { email: 'owner@example.com', user_metadata: { full_name: 'Ayşe Yılmaz' } })
  db.projects.push({ id: PROJECT, name: 'Fırın', slug: 'firin' })
  db.plan = null
  db.seq = 0
  db.send.mockReset()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('email outbox delivery', () => {
  it('sends once even when two workers race for the same event', async () => {
    const event = seedEvent()
    db.send.mockResolvedValue(ok())

    await Promise.all([processEventById(event.id as string), processEventById(event.id as string)])

    expect(db.send).toHaveBeenCalledTimes(1)
    expect(db.send.mock.calls[0][0].idempotencyKey).toBe(`email-event-${event.id}`)
    expect(event.status).toBe('sent')
    expect(event.attempts).toBe(1)
    expect(event.provider_message_id).toBe('msg-1')
  })

  it('schedules a retry with backoff after a 5xx and keeps a sanitized code', async () => {
    const event = seedEvent()
    db.send.mockResolvedValue({ ok: false, reason: 'http', status: 503 })

    await processEventById(event.id as string)

    expect(event.status).toBe('pending')
    expect(event.attempts).toBe(1)
    expect(event.last_error).toBe('http_503')
    expect(new Date(event.next_attempt_at as string).getTime()).toBeGreaterThan(Date.now() + 30_000)
  })

  it('marks a permanent 4xx as failed without retrying', async () => {
    const event = seedEvent()
    db.send.mockResolvedValue({ ok: false, reason: 'http', status: 422 })

    await processEventById(event.id as string)

    expect(event.status).toBe('failed')
    expect(event.last_error).toBe('http_422')
  })

  it('never stores an address or free text from a thrown error', async () => {
    const event = seedEvent()
    db.send.mockRejectedValue(new Error('rejected owner@example.com with key re_secret'))

    await processEventById(event.id as string)

    expect(String(event.last_error)).not.toMatch(/@|re_secret/)
  })

  it('parks the event without using an attempt when mail is not configured', async () => {
    const event = seedEvent()
    db.send.mockResolvedValue({ ok: false, reason: 'not_configured' })

    await processEventById(event.id as string)

    expect(event.status).toBe('pending')
    expect(event.attempts).toBe(0)
    expect(event.last_error).toBe('not_configured')
  })

  it('does not send for an event that is not due yet', async () => {
    const event = seedEvent({ next_attempt_at: new Date(Date.now() + 60_000).toISOString() })

    await processEventById(event.id as string)

    expect(db.send).not.toHaveBeenCalled()
    expect(event.attempts).toBe(0)
  })

  it('recovers an expired lease, and fails one that already used every attempt', async () => {
    const expired = new Date(Date.now() - 1000).toISOString()
    const stuck = seedEvent({ status: 'processing', attempts: 1, lease_until: expired })
    const exhausted = seedEvent({ status: 'processing', attempts: MAX_ATTEMPTS, lease_until: expired })
    db.send.mockResolvedValue(ok())

    const result = await processDueEmailEvents({ deadlineMs: Date.now() + 10_000 })

    expect(result.expiredLeases).toBe(2)
    expect(stuck.status).toBe('sent')
    expect(exhausted.status).toBe('failed')
    expect(exhausted.last_error).toBe('max_attempts')
    expect(db.send).toHaveBeenCalledTimes(1)
  })

  it('ignores a processing row whose lease is still valid', async () => {
    seedEvent({ status: 'processing', attempts: 1, lease_until: new Date(Date.now() + 60_000).toISOString() })

    const result = await processDueEmailEvents({ deadlineMs: Date.now() + 10_000 })

    expect(result.expiredLeases).toBe(0)
    expect(db.send).not.toHaveBeenCalled()
  })
})

describe('email outbox producers', () => {
  it('queues the first-publish email once per project', async () => {
    await enqueueProjectFirstPublishedEmail({ projectId: PROJECT, ownerId: USER })
    await enqueueProjectFirstPublishedEmail({ projectId: PROJECT, ownerId: USER })

    expect(db.events).toHaveLength(1)
    expect(db.events[0].kind).toBe('project_first_published')
  })

  it('collapses repeated unpublishes within the dedupe window into one email', async () => {
    await enqueueProjectUnpublishedEmail({ projectId: PROJECT, ownerId: USER })
    await enqueueProjectUnpublishedEmail({ projectId: PROJECT, ownerId: USER })

    expect(db.events).toHaveLength(1)
    expect(db.events[0].transition_id).toBeTruthy()
  })
})

describe('email outbox content', () => {
  async function sendFor(kind: string, extra: Row = {}) {
    const event = seedEvent({ kind, project_id: kind === 'account_welcome' ? null : PROJECT, ...extra })
    db.send.mockResolvedValue(ok())
    await processEventById(event.id as string)
    expect(db.send).toHaveBeenCalledTimes(1)
    return db.send.mock.calls[0][0] as { to: string; subject: string; html: string; text: string }
  }

  it('welcomes a new FREE user with credits, limits and the edit CTA', async () => {
    const mail = await sendFor('account_welcome')
    expect(mail.to).toBe('owner@example.com')
    expect(mail.subject).toBe("GLOVAL AI'a hoş geldin, Ayşe")
    expect(mail.text).toContain('50 yapay zekâ kredin')
    expect(mail.text).toContain('1 site ve 5 sayfa')
    expect(mail.text).toContain('adin.gloval.site')
    expect(mail.html).toContain('Sitemi düzenle')
  })

  it('shows a soft plan hint, not a sales pitch, to a FREE owner on first publish', async () => {
    const mail = await sendFor('project_first_published')
    expect(mail.subject).toBe('Siteniz yayında: Fırın')
    expect(mail.text).toContain('https://firin.gloval.site')
    expect(mail.text).toContain('https://gloval.ai/billing')
    expect(mail.text).not.toContain('/dashboard/domains')
  })

  it('points a paid owner to domain connection instead of plans', async () => {
    db.plan = 'pro'
    const mail = await sendFor('project_first_published')
    expect(mail.text).toContain('https://gloval.ai/dashboard/domains')
    expect(mail.text).not.toContain('/billing')
  })

  it('tells the owner their content is kept when a site is unpublished', async () => {
    const mail = await sendFor('project_unpublished', { transition_id: 't-1' })
    expect(mail.subject).toBe('Siteniz yayından kaldırıldı: Fırın')
    expect(mail.text).toContain('saklanıyor')
    expect(mail.html).toContain('Siteyi aç')
  })

  it('fails the event when the user no longer exists', async () => {
    db.users.clear()
    const event = seedEvent()
    await processEventById(event.id as string)
    expect(event.status).toBe('failed')
    expect(event.last_error).toBe('user_missing')
    expect(db.send).not.toHaveBeenCalled()
  })
})

describe('welcome email after verification', () => {
  const fresh = () => ({
    id: USER,
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  it('queues and sends once when the trigger left no row', async () => {
    db.send.mockResolvedValue(ok())

    await Promise.all([ensureAndSendWelcomeEmail(fresh()), ensureAndSendWelcomeEmail(fresh())])

    const rows = db.events.filter((row) => row.kind === 'account_welcome')
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('sent')
    expect(db.send).toHaveBeenCalledTimes(1)
  })

  it('sends a pending trigger row immediately and never twice', async () => {
    const event = seedEvent()
    db.send.mockResolvedValue(ok())

    await ensureAndSendWelcomeEmail(fresh())
    await ensureAndSendWelcomeEmail(fresh())

    expect(event.status).toBe('sent')
    expect(db.send).toHaveBeenCalledTimes(1)
  })

  it('does nothing for an unverified address', async () => {
    await ensureAndSendWelcomeEmail({ ...fresh(), email_confirmed_at: null })
    expect(db.events).toHaveLength(0)
    expect(db.send).not.toHaveBeenCalled()
  })

  it('does not backfill a welcome email for an account older than 24 hours', async () => {
    const old = new Date(Date.now() - 25 * 60 * 60_000).toISOString()
    await ensureAndSendWelcomeEmail({ ...fresh(), created_at: old })
    expect(db.events).toHaveLength(0)
    expect(db.send).not.toHaveBeenCalled()
  })

  it('leaves a failed send pending for the cron retry', async () => {
    db.send.mockResolvedValue({ ok: false, reason: 'http', status: 503 })

    await ensureAndSendWelcomeEmail(fresh())

    expect(db.events[0].status).toBe('pending')
    expect(db.events[0].last_error).toBe('http_503')
  })
})
