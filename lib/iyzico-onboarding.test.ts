import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Simulated tests: Supabase, the owner guard and iyzico's `fetch` are mocked, and
 * the request table is an in-memory fake. They verify the server-action contract
 * (consent, feature gating, counting before the call, no personal data stored,
 * no secrets leaked) — NOT the SQL in scripts/057, which needs a real database.
 */

const SECRETS = {
  IYZICO_INSTANT_DEVELOPER_KEY: 'fake-developer-key-9f3a',
  IYZICO_INSTANT_APP_NAME: 'fake-app-name',
  IYZICO_INSTANT_SALT_KEY: 'fake-salt-key-77c1',
}
const USER = 'user-1'
const PROJECT = 'project-1'

type Row = {
  id: number
  project_id: string
  user_id: string
  status: string
  http_status: number | null
  consent_version: string
  consent_at: string
  requested_at: string
}

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  nextId: 1,
  tableMissing: false,
  userId: 'user-1',
  owners: new Map<string, string>(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/store-payments/owner-auth', () => ({
  authorizeProjectOwner: vi.fn(async (projectId: string) => {
    if (state.owners.get(projectId) !== state.userId) throw new Error('NOT_FOUND')
    return { ownerId: state.userId, actorId: state.userId }
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            email: 'sahip@example.com',
            phone: '',
            user_metadata: { full_name: 'Ayşe Yılmaz', phone: '0532 123 45 67' },
          },
        },
      }),
    },
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Array<(row: Row) => boolean> = []
      let mode: 'select' | 'insert' | 'update' = 'select'
      let payload: Record<string, unknown> = {}
      let head = false
      let single = false
      const missing = { data: null, error: { code: '42P01' } }
      const run = () => {
        if (state.tableMissing) return missing
        const all = state.rows as unknown as Row[]
        if (mode === 'insert') {
          const row = {
            ...payload,
            id: state.nextId++,
            requested_at: new Date().toISOString(),
          } as Record<string, unknown>
          state.rows.push(row)
          return { data: single ? { id: row.id } : [{ id: row.id }], error: null }
        }
        const matched = all.filter((row) => filters.every((f) => f(row)))
        if (mode === 'update') {
          for (const row of matched) Object.assign(row, payload)
          return { data: null, error: null }
        }
        return { data: head ? null : matched, error: null }
      }
      const builder: Record<string, unknown> = {
        insert(row: Record<string, unknown>) {
          mode = 'insert'
          payload = row
          return builder
        },
        update(values: Record<string, unknown>) {
          mode = 'update'
          payload = values
          return builder
        },
        select(_columns?: string, options?: { head?: boolean }) {
          head = Boolean(options?.head)
          return builder
        },
        single() {
          single = true
          return builder
        },
        limit: () => builder,
        eq(column: keyof Row, value: unknown) {
          filters.push((row) => row[column] === value)
          return builder
        },
        lt(column: keyof Row, value: number) {
          filters.push((row) => (row[column] as number) < value)
          return builder
        },
        gte(column: keyof Row, value: string) {
          filters.push((row) => String(row[column]) >= value)
          return builder
        },
        in(column: keyof Row, values: unknown[]) {
          filters.push((row) => values.includes(row[column]))
          return builder
        },
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve)
        },
      }
      return builder
    },
  }),
}))

import { getIyzicoInstantPrefill, submitIyzicoInstant } from './iyzico-onboarding'

const INPUT = { firstName: 'Ayşe', lastName: 'Yılmaz', email: 'ayse@example.com', phone: '0532 123 45 67' }

const fetchMock = vi.fn()
let logged: string[] = []

function ok(status = 200) {
  return new Response('{"merchant":"ayse@example.com 0532 123 45 67"}', { status })
}

function loggedText() {
  return logged.join('\n')
}

beforeEach(() => {
  state.rows = []
  state.nextId = 1
  state.tableMissing = false
  state.userId = USER
  state.owners = new Map([[PROJECT, USER]])
  for (const [key, value] of Object.entries(SECRETS)) vi.stubEnv(key, value)
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => ok())
  vi.stubGlobal('fetch', fetchMock)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  logged = []
  for (const method of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(' '))
    })
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('consent (enforced on the server)', () => {
  it.each([false, undefined, null, 'true', 1] as unknown[])('rejects consent=%s without any request or record', async (consent) => {
    const result = await submitIyzicoInstant(PROJECT, INPUT, consent as boolean)
    expect(result).toEqual({ ok: false, error: 'consent_required' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.rows).toHaveLength(0)
  })

  it('records the consent version and time with the request', async () => {
    await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(state.rows[0]).toMatchObject({
      consent_version: 'instant-consent-v1',
      consent_at: '2026-01-01T10:00:00.000Z',
    })
  })
})

describe('feature gating', () => {
  it.each(Object.keys(SECRETS))('is off when %s is missing', async (name) => {
    vi.stubEnv(name, '')
    expect(await getIyzicoInstantPrefill(PROJECT)).toMatchObject({ enabled: false })
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.rows).toHaveLength(0)
  })

  it('is off while the request table does not exist, and never calls iyzico', async () => {
    state.tableMissing = true
    expect(await getIyzicoInstantPrefill(PROJECT)).toMatchObject({ enabled: false })
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is on and prefilled when secrets and table exist', async () => {
    expect(await getIyzicoInstantPrefill(PROJECT)).toEqual({
      enabled: true,
      email: 'sahip@example.com',
      phone: '0532 123 45 67',
      firstName: 'Ayşe',
      lastName: 'Yılmaz',
    })
  })
})

describe('authorization and validation', () => {
  it('rejects another store owner before anything happens', async () => {
    state.userId = 'intruder'
    await expect(submitIyzicoInstant(PROJECT, INPUT, true)).rejects.toThrow('NOT_FOUND')
    await expect(getIyzicoInstantPrefill(PROJECT)).rejects.toThrow('NOT_FOUND')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.rows).toHaveLength(0)
  })

  it('reports field errors without a request or a record', async () => {
    expect(await submitIyzicoInstant(PROJECT, { ...INPUT, email: 'x' }, true)).toEqual({ ok: false, error: 'invalid_email' })
    expect(await submitIyzicoInstant(PROJECT, { ...INPUT, phone: '12' }, true)).toEqual({ ok: false, error: 'invalid_phone' })
    expect(await submitIyzicoInstant(PROJECT, { ...INPUT, firstName: '' }, true)).toEqual({ ok: false, error: 'invalid_name' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(state.rows).toHaveLength(0)
  })
})

describe('successful submission', () => {
  it('sends exactly four fields to the fixed host with signed headers and records the outcome', async () => {
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://onboarding.iyzipay.com/api/v1/merchants')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      contactName: 'Ayşe',
      contactSurname: 'Yılmaz',
      registrationEmail: 'ayse@example.com',
      gsmNumber: '+905321234567',
    })
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
      'content-type',
      'x-iyzi-app-name',
      'x-iyzi-developer-key-v2',
      'x-iyzi-rnd',
    ])

    expect(state.rows).toHaveLength(1)
    expect(state.rows[0]).toMatchObject({ project_id: PROJECT, user_id: USER, status: 'submitted', http_status: 200 })
  })

  it('stores no personal data and no response body', async () => {
    await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(Object.keys(state.rows[0]).sort()).toEqual([
      'consent_at',
      'consent_version',
      'http_status',
      'id',
      'project_id',
      'requested_at',
      'status',
      'user_id',
    ])
    const stored = JSON.stringify(state.rows)
    for (const forbidden of ['ayse@example.com', '5321234567', '532 123', 'Ayşe', 'Yılmaz', 'merchant']) {
      expect(stored).not.toContain(forbidden)
    }
  })
})

describe('repeat application', () => {
  it('does not resend when the store already has a successful application in the last 24 hours', async () => {
    await submitIyzicoInstant(PROJECT, INPUT, true)
    const again = await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(again).toEqual({ ok: false, error: 'already_submitted' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.rows.map((row) => row.status)).toEqual(['submitted', 'rate_limited'])
  })

  it('allows a new application once 24 hours have passed', async () => {
    await submitIyzicoInstant(PROJECT, INPUT, true)
    vi.setSystemTime(new Date('2026-01-02T10:00:01Z'))
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('lets only one of two simultaneous submissions reach iyzico', async () => {
    let release: (response: Response) => void = () => undefined
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (release = resolve)))

    const first = submitIyzicoInstant(PROJECT, INPUT, true)
    const second = submitIyzicoInstant(PROJECT, INPUT, true)
    await vi.waitFor(() => expect(state.rows).toHaveLength(2))
    await expect(second).resolves.toEqual({ ok: false, error: 'in_progress' })

    release(ok())
    await expect(first).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('database-backed rate limits', () => {
  it('allows at most 2 attempts per store in 24 hours, then reports rate_limited without calling iyzico', async () => {
    fetchMock.mockImplementation(async () => ok(500))
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'rate_limited' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(state.rows.map((row) => row.status)).toEqual(['failed', 'failed', 'rate_limited'])
  })

  it('does not count blocked attempts against the window', async () => {
    fetchMock.mockImplementation(async () => ok(500))
    for (let i = 0; i < 4; i++) await submitIyzicoInstant(PROJECT, INPUT, true)
    vi.setSystemTime(new Date('2026-01-02T10:00:01Z'))
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('allows at most 5 attempts per user a day across stores', async () => {
    fetchMock.mockImplementation(async () => ok(500))
    for (let i = 1; i <= 6; i++) state.owners.set(`store-${i}`, USER)
    for (let i = 1; i <= 5; i++) {
      expect(await submitIyzicoInstant(`store-${i}`, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    }
    expect(await submitIyzicoInstant('store-6', INPUT, true)).toEqual({ ok: false, error: 'rate_limited' })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('counts the user limit per user, not globally', async () => {
    fetchMock.mockImplementation(async () => ok(500))
    for (let i = 1; i <= 5; i++) {
      state.owners.set(`store-${i}`, USER)
      await submitIyzicoInstant(`store-${i}`, INPUT, true)
    }
    state.userId = 'user-2'
    state.owners.set('other-store', 'user-2')
    expect(await submitIyzicoInstant('other-store', INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })
})

describe('iyzico failures', () => {
  it('classifies a 4xx by status only and never exposes or logs the body', async () => {
    fetchMock.mockImplementation(
      async () => new Response('{"message":"ayse@example.com +905321234567 duplicate"}', { status: 400 }),
    )
    const result = await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(result).toEqual({ ok: false, error: 'rejected' })
    expect(JSON.stringify(result)).not.toMatch(/ayse|5321234567|duplicate/)
    expect(state.rows[0]).toMatchObject({ status: 'failed', http_status: 400 })
    expect(loggedText()).toContain('iyzico_http_400')
    expect(loggedText()).not.toMatch(/ayse|5321234567|duplicate/)
  })

  it.each([401, 403, 429, 500, 503])('maps %s to unavailable', async (status) => {
    fetchMock.mockImplementation(async () => ok(status))
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(state.rows[0]).toMatchObject({ status: 'failed', http_status: status })
  })

  it('handles a network error and records http_status 0', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed: connect ECONNREFUSED ayse@example.com'))
    const result = await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(result).toEqual({ ok: false, error: 'unavailable' })
    expect(state.rows[0]).toMatchObject({ status: 'failed', http_status: 0 })
    expect(loggedText()).toContain('iyzico_network_error')
    expect(loggedText()).not.toContain('ayse@example.com')
  })

  it('handles a timeout and passes an abort signal to fetch', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    fetchMock.mockRejectedValue(timeout)
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: false, error: 'unavailable' })
    expect(state.rows[0]).toMatchObject({ status: 'failed', http_status: 0 })
    expect(loggedText()).toContain('iyzico_timeout')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('lets the owner retry right after a network error (a finished failure is not "in progress")', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await submitIyzicoInstant(PROJECT, INPUT, true)
    expect(await submitIyzicoInstant(PROJECT, INPUT, true)).toEqual({ ok: true })
  })
})

describe('secrets', () => {
  it('never appear in results, stored rows or logs, on success or failure', async () => {
    const results = [await submitIyzicoInstant(PROJECT, INPUT, true)]
    state.rows = []
    fetchMock.mockRejectedValue(new Error(`boom ${SECRETS.IYZICO_INSTANT_SALT_KEY}`))
    results.push(await submitIyzicoInstant(PROJECT, INPUT, true))
    results.push(await getIyzicoInstantPrefill(PROJECT) as never)

    const everything = JSON.stringify(results) + JSON.stringify(state.rows) + loggedText()
    for (const secret of Object.values(SECRETS)) expect(everything).not.toContain(secret)
  })
})
