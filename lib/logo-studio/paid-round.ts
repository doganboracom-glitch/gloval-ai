import type { AiModelSelection } from '@/lib/ai-models'
import type { EmblemAsset } from '@/lib/logo-studio/compose'
import type { EmblemOutcome, EmblemResultKind, EmblemRound } from '@/lib/logo-studio/emblem-ai'

/**
 * Credit rule for a paid logo round: credits are charged AFTER drawing and only
 * for emblems that passed the quality gate and are being returned, so a failed,
 * rejected or timed-out emblem never costs anything and a round that returns
 * fewer than 4 emblems is charged for exactly that many (all failed = 0, with
 * `aiFailed`). A request id makes a double click or a retry of the same request
 * impossible to charge twice: the ledger row carries the id as its reason, and
 * concurrent duplicates are rejected while the first is still drawing.
 */

export type ChargeResult = { ok: true; balance: number } | { ok: false; balance: number }

export type CreditPort = {
  balance(userId: string): Promise<number>
  consume(userId: string, amount: number, reason: string): Promise<ChargeResult>
  refund(userId: string, amount: number, reason: string): Promise<unknown>
  hasLedgerReason(userId: string, reason: string): Promise<boolean>
}

/** One delivered emblem, as recorded for monitoring (no brand, user or SVG data). */
export type DeliveredEmblem = { model: string; kind: EmblemResultKind }

export type PaidRoundInput = {
  userId: string
  /** Client-generated id of this request. Omitted by old clients: no idempotency then. */
  requestId?: string
  selection: AiModelSelection
  /** Credits per emblem. */
  cost: number
  /** Emblems wanted in a full round. */
  maxCount: number
  round: Omit<EmblemRound, 'count' | 'selection'>
  credits: CreditPort
  generate: (round: EmblemRound) => Promise<EmblemOutcome[]>
  /** True once the client has gone away: the emblems can no longer be delivered. */
  isAborted?: () => boolean
  /** Receives delivered emblems after the charge succeeded. Must not throw into the caller. */
  record?: (delivered: DeliveredEmblem[]) => Promise<void> | void
}

export type PaidRoundResult =
  | { status: 'duplicate' }
  | { status: 'no_credits'; balance: number }
  | { status: 'aborted'; failures: string[] }
  | { status: 'failed'; failures: string[]; balance: number }
  | {
      status: 'ok'
      emblems: EmblemAsset[]
      charged: number
      balance: number
      requested: number
      failures: string[]
      /** Reason used for the ledger row; pass to `refundRound` if delivery fails. */
      reason: string
    }

export const LOGO_CREDIT_REASON = 'logoImage'

export function creditReasonFor(requestId?: string): string {
  return requestId ? `${LOGO_CREDIT_REASON}:${requestId}` : LOGO_CREDIT_REASON
}

const inFlight = new Set<string>()

export async function runPaidRound(input: PaidRoundInput): Promise<PaidRoundResult> {
  const { userId, credits, cost } = input
  const reason = creditReasonFor(input.requestId)
  const key = input.requestId ? `${userId}:${input.requestId}` : null

  // Synchronous check-and-add so two simultaneous duplicates cannot both pass.
  if (key) {
    if (inFlight.has(key)) return { status: 'duplicate' }
    inFlight.add(key)
  }
  try {
    if (key && (await credits.hasLedgerReason(userId, reason))) return { status: 'duplicate' }

    const startBalance = await credits.balance(userId)
    const count = Math.min(input.maxCount, Math.floor(startBalance / cost))
    if (count < 1) return { status: 'no_credits', balance: startBalance }

    const outcomes = await input.generate({ ...input.round, selection: input.selection, count })
    const passed: Extract<EmblemOutcome, { ok: true }>[] = []
    const failures: string[] = []
    for (const o of outcomes) {
      if (o.ok) passed.push(o)
      else failures.push(o.reason)
    }

    if (input.isAborted?.()) return { status: 'aborted', failures }
    if (passed.length === 0) return { status: 'failed', failures, balance: startBalance }

    let deliver = passed
    let charge = await credits.consume(userId, cost * deliver.length, reason)
    if (!charge.ok) {
      // Balance dropped while drawing (another tab). Deliver only what is still affordable.
      const affordable = Math.min(deliver.length, Math.floor(charge.balance / cost))
      if (affordable < 1) return { status: 'no_credits', balance: charge.balance }
      deliver = deliver.slice(0, affordable)
      charge = await credits.consume(userId, cost * deliver.length, reason)
      if (!charge.ok) return { status: 'no_credits', balance: charge.balance }
    }

    await Promise.resolve(input.record?.(deliver.map((o) => ({ model: o.model, kind: o.kind })))).catch(() => undefined)

    return {
      status: 'ok',
      emblems: deliver.map((o) => o.emblem),
      charged: cost * deliver.length,
      balance: charge.balance,
      requested: count,
      failures,
      reason,
    }
  } finally {
    if (key) inFlight.delete(key)
  }
}

/** Gives back a charge whose emblems could not be delivered after all. */
export async function refundRound(
  credits: CreditPort,
  userId: string,
  charged: number,
  reason: string,
): Promise<void> {
  if (charged < 1) return
  await credits.refund(userId, charged, `${reason}:refund`)
}
