/**
 * Guards for Supabase query results in critical flows (money, deletion,
 * publishing, identity). supabase-js never throws on a failed query: it
 * resolves `{ data: null, error }`, so code that only reads `data` cannot tell
 * "no row" from "the query failed" and silently carries on.
 *
 * `requireOk` turns a failed query into a thrown `DbQueryError`. A missing row
 * is NOT an error (`maybeSingle()` resolves `{ data: null, error: null }`), so
 * callers keep distinguishing "no record" from "query failed".
 *
 * Only the scope label and the Postgres/PostgREST error code are logged or put
 * on the error; never the message, which can echo row values.
 */

export class DbQueryError extends Error {
  readonly scope: string
  readonly code: string

  constructor(scope: string, code: string) {
    super(`db_query_failed:${scope}:${code}`)
    this.name = 'DbQueryError'
    this.scope = scope
    this.code = code
  }
}

type QueryResult = { error: { code?: string | null } | null }

function codeOf(res: QueryResult): string {
  return res.error?.code || 'unknown'
}

/** Throws `DbQueryError` when the query failed; otherwise returns it untouched. */
export function requireOk<T extends QueryResult>(scope: string, res: T): T {
  if (res.error) {
    const code = codeOf(res)
    console.error('[db] query failed', { scope, code })
    throw new DbQueryError(scope, code)
  }
  return res
}

/**
 * For best-effort side effects (audit/notification rows) that must never abort
 * the main operation: the failure is logged with its code instead of vanishing.
 */
export function warnOnError<T extends QueryResult>(scope: string, res: T): T {
  if (res.error) console.warn('[db] best-effort query failed', { scope, code: codeOf(res) })
  return res
}

export function isDbQueryError(err: unknown): err is DbQueryError {
  return err instanceof DbQueryError
}

type StrictOptions = {
  /** Postgres/PostgREST codes that are expected and must stay non-fatal (e.g. '23505' on an idempotent insert). */
  tolerate?: readonly string[]
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

function guardBuilder<T extends object>(builder: T, scope: string, options: StrictOptions): T {
  return new Proxy(builder, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (prop === 'then' && typeof value === 'function') {
        return (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          (value as PromiseLike<QueryResult>['then']).call(target, (res: QueryResult) => {
            const code = res?.error ? codeOf(res) : null
            if (res?.error && !(code && options.tolerate?.includes(code))) {
              console.error('[db] query failed', { scope, code })
              throw new DbQueryError(scope, code ?? 'unknown')
            }
            return res
          }).then(onFulfilled, onRejected)
      }
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return typeof out === 'object' && out !== null ? guardBuilder(out as object, scope, options) : out
        }
      }
      return value
    },
  })
}

/**
 * Wraps a Supabase client so every awaited `from(...)` / `rpc(...)` query that
 * resolves with an `error` THROWS a `DbQueryError` instead of handing back
 * `{ data: null }` that callers cannot tell apart from "no row".
 *
 * Use it in flows where a failed query must stop the work (money, deletion,
 * publishing, identity). A missing row is still `{ data: null, error: null }`.
 * The success path is unchanged. For best-effort queries keep the plain client
 * (and use `warnOnError`), or list expected codes in `tolerate`.
 */
export function strictDb<T extends object>(client: T, scope: string, options: StrictOptions = {}): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if ((prop === 'from' || prop === 'rpc') && typeof value === 'function') {
        return (...args: unknown[]) => {
          const out = (value as (...a: unknown[]) => unknown).apply(target, args)
          return typeof out === 'object' && out !== null ? guardBuilder(out as object, scope, options) : out
        }
      }
      return value
    },
  })
}
