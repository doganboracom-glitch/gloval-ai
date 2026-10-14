export type DbErrorLike = { code?: string; message?: string }

export type QueryFilter = { op: 'eq' | 'neq' | 'in' | 'is' | 'not' | 'lt'; column: string; value: unknown }

export type QueryCall = {
  table: string
  op: 'select' | 'insert' | 'update' | 'delete'
  values?: unknown
  columns?: string
  filters: QueryFilter[]
  single: boolean
}

export type QueryResult = { data?: unknown; error?: DbErrorLike | null }

/** True when `row` satisfies every filter the caller chained onto the query. */
export function matchesFilters(row: Record<string, unknown>, filters: QueryFilter[]): boolean {
  return filters.every((f) => {
    const v = row[f.column]
    switch (f.op) {
      case 'eq':
        return v === f.value
      case 'neq':
        return v !== f.value
      case 'in':
        return Array.isArray(f.value) && f.value.includes(v)
      case 'is':
        return f.value === null ? v === null || v === undefined : v === f.value
      case 'not':
        return f.value === null ? v !== null && v !== undefined : v !== f.value
      case 'lt':
        return String(v) < String(f.value)
    }
  })
}

/**
 * A chainable stand-in for the Supabase query builder. Every query is recorded
 * and answered by `respond`, so a test can return rows or inject a database
 * error for exactly the statement it wants to break.
 */
export function createQueryFake(
  respond: (call: QueryCall) => QueryResult | Promise<QueryResult>,
  rpcRespond: (name: string, args: Record<string, unknown>) => QueryResult | Promise<QueryResult> = () => ({
    data: null,
    error: null,
  }),
) {
  const calls: QueryCall[] = []
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = []

  function builder(table: string) {
    const call: QueryCall = { table, op: 'select', filters: [], single: false }
    const run = async (): Promise<{ data: unknown; error: DbErrorLike | null }> => {
      calls.push({ ...call, filters: [...call.filters] })
      const res = await respond(call)
      return { data: res.data ?? null, error: res.error ?? null }
    }
    const api: Record<string, unknown> = {
      select(columns?: string) {
        if (call.op === 'select') call.columns = columns
        return api
      },
      insert(values: unknown) {
        call.op = 'insert'
        call.values = values
        return api
      },
      update(values: unknown) {
        call.op = 'update'
        call.values = values
        return api
      },
      delete() {
        call.op = 'delete'
        return api
      },
      eq: (column: string, value: unknown) => (call.filters.push({ op: 'eq', column, value }), api),
      neq: (column: string, value: unknown) => (call.filters.push({ op: 'neq', column, value }), api),
      in: (column: string, value: unknown) => (call.filters.push({ op: 'in', column, value }), api),
      is: (column: string, value: unknown) => (call.filters.push({ op: 'is', column, value }), api),
      not: (column: string, _op: string, value: unknown) => (call.filters.push({ op: 'not', column, value }), api),
      lt: (column: string, value: unknown) => (call.filters.push({ op: 'lt', column, value }), api),
      order: () => api,
      limit: () => api,
      maybeSingle() {
        call.single = true
        return run()
      },
      single() {
        call.single = true
        return run()
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return run().then(resolve, reject)
      },
    }
    return api
  }

  const client = {
    from: (table: string) => builder(table),
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const res = await rpcRespond(name, args)
      return { data: res.data ?? null, error: res.error ?? null }
    },
  }

  return { client: client as never, calls, rpcCalls }
}
