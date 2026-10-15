type Row = Record<string, any>
type Result = { data: any; error: { message: string; code?: string } | null; count?: number }

/**
 * Minimal in-memory Supabase stand-in shared by the publish-gate tests. It
 * supports just the query shapes lib/projects.ts and lib/content-attestations.ts
 * use, enforces the attestation unique key, and can be told to fail so the
 * fail-closed paths are exercised.
 */
export const fakeDb = {
  tables: {} as Record<string, Row[]>,
  user: { id: 'user-1', email: 'owner@example.com' } as { id: string; email: string } | null,
  attestationWriteError: null as string | null,
  attestationReadError: false,
  rpcRow: null as Row | null,
  reads: [] as string[],
  writes: [] as Array<{ table: string; op: string }>,
  seq: 0,

  reset() {
    this.tables = { projects: [], project_versions: [], content_attestations: [] }
    this.user = { id: 'user-1', email: 'owner@example.com' }
    this.attestationWriteError = null
    this.attestationReadError = false
    this.rpcRow = null
    this.reads = []
    this.writes = []
    this.seq = 0
  },

  rows(table: string): Row[] {
    return (this.tables[table] ??= [])
  },

  client() {
    const db = this
    return {
      auth: {
        getUser: async () => ({ data: { user: db.user } }),
      },
      rpc: async (): Promise<Result> => ({ data: db.rpcRow, error: null }),
      from: (table: string) => db.builder(table),
    }
  },

  builder(table: string) {
    const db = this
    const filters: Array<(row: Row) => boolean> = []
    let op: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: any
    let head = false
    let upsertKeys: string[] = []
    let ignoreDuplicates = false

    const matching = () => db.rows(table).filter((row) => filters.every((f) => f(row)))
    const shape = (rows: Row[], mode: 'many' | 'maybe' | 'single'): Result => {
      if (mode === 'many') return { data: rows, error: null }
      if (mode === 'maybe') return { data: rows[0] ?? null, error: null }
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } }
    }

    const run = async (mode: 'many' | 'maybe' | 'single'): Promise<Result> => {
      if (op === 'insert') {
        const list: Row[] = Array.isArray(payload) ? payload : [payload]
        const inserted = list.map((row) => ({ id: `${table}-${++db.seq}`, ...row }))
        db.rows(table).push(...inserted)
        db.writes.push({ table, op })
        return shape(inserted, mode)
      }
      if (op === 'upsert') {
        db.writes.push({ table, op })
        if (table === 'content_attestations' && db.attestationWriteError) {
          return { data: null, error: { message: db.attestationWriteError } }
        }
        const list: Row[] = Array.isArray(payload) ? payload : [payload]
        for (const row of list) {
          const exists = db.rows(table).some((r) => upsertKeys.every((k) => r[k] === row[k]))
          if (exists && ignoreDuplicates) continue
          db.rows(table).push({ id: `${table}-${++db.seq}`, ...row })
        }
        return { data: null, error: null }
      }
      if (op === 'update') {
        for (const row of matching()) Object.assign(row, payload)
        db.writes.push({ table, op })
        return { data: null, error: null }
      }
      db.reads.push(table)
      if (table === 'content_attestations' && db.attestationReadError) {
        return { data: null, error: { message: 'read failed' } }
      }
      const rows = matching()
      if (head) return { data: null, error: null, count: rows.length }
      return shape(rows, mode)
    }

    const api: any = {
      select(_columns?: string, options?: { head?: boolean }) {
        if (op === 'select') head = !!options?.head
        return api
      },
      insert(value: any) {
        op = 'insert'
        payload = value
        return api
      },
      update(value: any) {
        op = 'update'
        payload = value
        return api
      },
      upsert(value: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        op = 'upsert'
        payload = value
        upsertKeys = (options?.onConflict ?? 'id').split(',')
        ignoreDuplicates = !!options?.ignoreDuplicates
        return api
      },
      eq(key: string, value: unknown) {
        filters.push((row) => row[key] === value)
        return api
      },
      neq(key: string, value: unknown) {
        filters.push((row) => row[key] !== value)
        return api
      },
      order: () => api,
      maybeSingle: () => run('maybe'),
      single: () => run('single'),
      then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => run('many').then(resolve, reject),
    }
    return api
  },
}

fakeDb.reset()
