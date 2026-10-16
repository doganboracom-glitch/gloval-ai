import { AsyncLocalStorage } from 'node:async_hooks'

export type EvalCtx = { plan: 'starter' | 'pro'; inputTokens: number; outputTokens: number }

/** Per-request plan and token counters, so concurrent cases never mix up usage. */
export const evalContext = new AsyncLocalStorage<EvalCtx>()
