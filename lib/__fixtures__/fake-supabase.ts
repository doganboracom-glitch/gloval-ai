/**
 * Minimal in-memory stand-in for the slice of the Supabase query builder that the
 * backup/restore code uses. It exists so tests can assert real read/write ORDER
 * and row effects (which table was touched, in what sequence) without a database.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>
export type Op = { table: string; op: 'select' | 'insert' | 'update' | 'delete'; detail?: unknown }
export type Tables = Record<string, Row[]>

type FakeError = { code: string; message: string }

export type FakeDbOptions = {
  /** Row-level visibility, used to model RLS on a session client. Omit for the service role. */
  visible?: (table: string, row: Row) => boolean
  log?: Op[]
  now?: () => string
  /** Returns a key that must be unique per table (models unique indexes); null skips the check. */
  uniqueKey?: (table: string, row: Row) => string | null
}

let idCounter = 0

class Query implements PromiseLike<{ data: unknown; error: FakeError | null }> {
  private op: Op['op'] = 'select'
  private payload: Row | Row[] | null = null
  private returning = false
  private filters: Array<(row: Row) => boolean> = []
  private orderBy: { col: string; asc: boolean } | null = null
  private max: number | null = null

  constructor(
    private readonly tables: Tables,
    private readonly table: string,
    private readonly options: FakeDbOptions,
  ) {}

  select(_columns?: string) {
    if (this.op !== 'select') this.returning = true
    return this
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert'
    this.payload = payload
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.payload = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value)
    return this
  }
  lt(col: string, value: string) {
    this.filters.push((row) => String(row[col]) < value)
    return this
  }
  gt(col: string, value: string) {
    this.filters.push((row) => String(row[col]) > value)
    return this
  }
  in(col: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[col]))
    return this
  }
  or(expression: string) {
    const parts = expression.split(',').map((part) => part.split('.'))
    this.filters.push((row) =>
      parts.some(([col, operator, ...rest]) => {
        const value = rest.join('.')
        if (operator === 'is' && value === 'null') return row[col] === null || row[col] === undefined
        if (operator === 'neq') return row[col] !== value
        return false
      }),
    )
    return this
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false }
    return this
  }
  limit(count: number) {
    this.max = count
    return this
  }
  async maybeSingle() {
    const result = this.exec()
    const list = Array.isArray(result.data) ? result.data : []
    return { data: list[0] ?? null, error: result.error }
  }
  async single() {
    return this.maybeSingle()
  }
  then<TResult1 = { data: unknown; error: FakeError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: FakeError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected)
  }

  private matching(): Row[] {
    const rows = (this.tables[this.table] ??= [])
    let found = rows.filter(
      (row) => (this.options.visible?.(this.table, row) ?? true) && this.filters.every((fn) => fn(row)),
    )
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      found = [...found].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1))
    }
    if (this.max !== null) found = found.slice(0, this.max)
    return found
  }

  private exec(): { data: unknown; error: FakeError | null } {
    const log = this.options.log
    const clone = (row: Row): Row => JSON.parse(JSON.stringify(row))
    if (this.op === 'select') {
      log?.push({ table: this.table, op: 'select' })
      return { data: this.matching().map(clone), error: null }
    }
    if (this.op === 'insert') {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
      for (const input of rows) {
        const row: Row = { id: `fake-${++idCounter}`, created_at: this.options.now?.() ?? new Date().toISOString(), ...input }
        const key = this.options.uniqueKey?.(this.table, row) ?? null
        if (key !== null) {
          const clash = (this.tables[this.table] ?? []).some((existing) => this.options.uniqueKey?.(this.table, existing) === key)
          if (clash) return { data: null, error: { code: '23505', message: 'duplicate key value' } }
        }
        ;(this.tables[this.table] ??= []).push(row)
        log?.push({ table: this.table, op: 'insert', detail: clone(row) })
      }
      return { data: null, error: null }
    }
    if (this.op === 'update') {
      const rows = this.matching()
      for (const row of rows) Object.assign(row, this.payload)
      log?.push({ table: this.table, op: 'update', detail: this.payload })
      return { data: this.returning ? rows.map(clone) : null, error: null }
    }
    const rows = this.matching()
    this.tables[this.table] = (this.tables[this.table] ?? []).filter((row) => !rows.includes(row))
    log?.push({ table: this.table, op: 'delete', detail: rows.map((row) => row.id) })
    return { data: this.returning ? rows.map(clone) : null, error: null }
  }
}

export function createFakeClient(tables: Tables, options: FakeDbOptions = {}) {
  return {
    from: (table: string) => new Query(tables, table, options),
  }
}
