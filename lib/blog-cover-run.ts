import {
  buildCoverPrompt,
  deriveCoverConcepts,
  generateAcceptedCover,
  type ConceptDeps,
  type CoverStyle,
  type CoverVerdict,
} from '@/lib/blog-cover'

/**
 * The cover generation pipeline with every side effect injected, so the credit
 * rule can be tested against a fake client:
 *
 *   credits are charged ONLY for an image that was generated, accepted by the
 *   quality gate, stored, and finished inside the time budget. Every other
 *   outcome (timeout, model error, rejected image, storage failure, client
 *   gone) returns `charged: 0` and never calls `charge`.
 *
 * The time budget is deliberately shorter than the editor's 120 s request
 * timeout, so the server gives up (and refuses to charge) before the client
 * does. Once the charge call itself has started the budget no longer cancels
 * it: the response then reports the charge honestly instead of racing it.
 */

/** Server-side deadline for the whole pipeline; the editor aborts at 120 s. */
export const COVER_BUDGET_MS = 100_000
export const COVER_ATTEMPT_TIMEOUT_MS = 45_000

export type CoverRunError =
  | 'out_of_credits'
  | 'generation_failed'
  | 'rejected'
  | 'storage_failed'
  | 'timeout'
  | 'aborted'

export type CoverRunDeps = {
  getBalance: () => Promise<number>
  concepts: ConceptDeps['complete']
  /** Resolves to the image, or null when the model produced none. May reject. */
  generate: (prompt: string) => Promise<{ src: string } | null>
  inspect: (src: string) => Promise<CoverVerdict>
  /** Resolves to a stored URL; anything that is not https:// or a site path counts as failed. */
  persist: (src: string) => Promise<string>
  charge: (amount: number, reason: string) => Promise<{ ok: boolean; balance: number }>
}

export type CoverRunInput = {
  title: string
  excerpt: string
  style: CoverStyle
  colors: string[]
  cost: number
  reason: string
  signal?: AbortSignal
  budgetMs?: number
  attemptTimeoutMs?: number
}

export type CoverRunResult =
  | { ok: true; url: string; charged: number; balance: number; style: CoverStyle; attempts: number; conceptSource: 'model' | 'fallback' }
  | { ok: false; error: CoverRunError; status: number; charged: 0; balance: number }

const STATUS: Record<CoverRunError, number> = {
  out_of_credits: 402,
  generation_failed: 502,
  rejected: 502,
  storage_failed: 502,
  timeout: 504,
  aborted: 499,
}

function failure(error: CoverRunError, balance: number): CoverRunResult {
  return { ok: false, error, status: STATUS[error], charged: 0, balance }
}

const isStoredUrl = (url: unknown): url is string =>
  typeof url === 'string' && (url.startsWith('https://') || url.startsWith('/'))

export async function runCoverGeneration(deps: CoverRunDeps, input: CoverRunInput): Promise<CoverRunResult> {
  const budgetMs = input.budgetMs ?? COVER_BUDGET_MS
  const attemptTimeoutMs = input.attemptTimeoutMs ?? COVER_ATTEMPT_TIMEOUT_MS

  const balance = await deps.getBalance()
  if (balance < input.cost) return failure('out_of_credits', balance)

  let cancelled: CoverRunError | null = null
  let committing = false
  const timers: ReturnType<typeof setTimeout>[] = []
  let onAbort: (() => void) | undefined

  const cancellation = new Promise<CoverRunResult>((resolve) => {
    const cancel = (error: CoverRunError) => {
      if (committing || cancelled) return
      cancelled = error
      resolve(failure(error, balance))
    }
    timers.push(setTimeout(() => cancel('timeout'), budgetMs))
    if (input.signal) {
      if (input.signal.aborted) cancel('aborted')
      else {
        onAbort = () => cancel('aborted')
        input.signal.addEventListener('abort', onAbort, { once: true })
      }
    }
  })

  const withAttemptTimeout = <T,>(work: Promise<T>): Promise<T | null> =>
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), attemptTimeoutMs)
      timers.push(timer)
      work.then(
        (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        () => {
          clearTimeout(timer)
          resolve(null)
        },
      )
    })

  const pipeline = async (): Promise<CoverRunResult> => {
    const { concepts, source } = await deriveCoverConcepts(
      { title: input.title, excerpt: input.excerpt },
      { complete: deps.concepts },
    )
    const prompt = buildCoverPrompt({ concepts, style: input.style, colors: input.colors })

    const gate = await generateAcceptedCover({
      generate: () => withAttemptTimeout(deps.generate(prompt)),
      inspect: async (src) => {
        try {
          return await deps.inspect(src)
        } catch {
          return { text: 'unknown', people: 'unknown' }
        }
      },
    })
    if (cancelled) return failure(cancelled, balance)
    if (!gate.ok) return failure(gate.reason, balance)

    let url: string | null = null
    try {
      const stored = await deps.persist(gate.src)
      url = isStoredUrl(stored) ? stored : null
    } catch (err) {
      console.error('[blog-cover] storage failed, nothing charged:', err instanceof Error ? err.message : err)
      url = null
    }
    if (cancelled) return failure(cancelled, balance)
    if (!url) return failure('storage_failed', balance)

    // No await between this check and the charge call: nothing can cancel in between.
    committing = true
    const charge = await deps.charge(input.cost, input.reason).catch(() => ({ ok: false, balance }))
    if (!charge.ok) return failure('out_of_credits', charge.balance)
    return {
      ok: true,
      url,
      charged: input.cost,
      balance: charge.balance,
      style: input.style,
      attempts: gate.attempts,
      conceptSource: source,
    }
  }

  try {
    return await Promise.race([pipeline().catch(() => failure('generation_failed', balance)), cancellation])
  } finally {
    for (const timer of timers) clearTimeout(timer)
    if (onAbort) input.signal?.removeEventListener('abort', onAbort)
  }
}
