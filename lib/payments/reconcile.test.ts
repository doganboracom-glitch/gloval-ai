import { describe, expect, it, vi } from 'vitest'
import {
  RECONCILE_GRACE_MS,
  classifyRetrieval,
  decideReconcileAction,
  isReconcilableLedgerKey,
  runReconciliation,
  type PendingPayment,
  type ReconcileDeps,
  type RetrieveVerdict,
} from './reconcile'

const NOW = Date.parse('2026-10-28T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MIN = 60 * 1000

describe('isReconcilableLedgerKey', () => {
  it.each(['topup_ai_100_abc', 'sub_123_initial', 'upgrade_123_1700000000', 'ent_proj_branding_removal'])(
    'includes %s',
    (key) => expect(isReconcilableLedgerKey(key)).toBe(true),
  )

  it.each(['domain_order_1', 'domain_transfer_1', 'domain_renew_1', 'renewal_sub_1', 'addon_p1', '', null, undefined])(
    'excludes %s',
    (key) => expect(isReconcilableLedgerKey(key)).toBe(false),
  )
})

describe('classifyRetrieval', () => {
  it('treats a paid retrieval as paid', () => {
    expect(classifyRetrieval({ paid: true, raw: { status: 'success' } })).toMatchObject({ kind: 'paid' })
  })

  it('separates an explicit FAILURE from a still-open payment', () => {
    expect(classifyRetrieval({ paid: false, raw: { status: 'success', paymentStatus: 'FAILURE' } })).toEqual({
      kind: 'not_paid',
      explicitFailure: true,
    })
    expect(classifyRetrieval({ paid: false, raw: { status: 'success', paymentStatus: 'INIT_THREEDS' } })).toEqual({
      kind: 'not_paid',
      explicitFailure: false,
    })
  })

  it('treats credential or signature trouble as transient, never as a verdict on the payment', () => {
    expect(classifyRetrieval({ paid: false, raw: { status: 'failure', errorMessage: 'Invalid signature' } })).toEqual({
      kind: 'transient',
    })
  })

  it('treats a request-level failure about the token as an unknown token', () => {
    expect(
      classifyRetrieval({ paid: false, raw: { status: 'failure', errorMessage: 'Checkout form bulunamadı' } }),
    ).toEqual({ kind: 'unknown_token' })
  })
})

describe('decideReconcileAction', () => {
  const decide = (verdict: RetrieveVerdict, ageMs: number) =>
    decideReconcileAction({ verdict, createdAtMs: NOW - ageMs, nowMs: NOW })

  it('settles a paid payment immediately, even seconds after creation', () => {
    expect(decide({ kind: 'paid', raw: {} }, 5 * 1000)).toBe('settle_paid')
  })

  it('settles a paid payment that arrives long after being written off', () => {
    expect(decide({ kind: 'paid', raw: {} }, 3 * 24 * 60 * MIN)).toBe('settle_paid')
  })

  it('never touches the record on transient provider trouble, at any age', () => {
    expect(decide({ kind: 'transient' }, 1 * MIN)).toBe('skip_transient')
    expect(decide({ kind: 'transient' }, 5 * 60 * MIN)).toBe('skip_transient')
  })

  it('does not write failure or abandonment before created_at + 35 minutes', () => {
    expect(decide({ kind: 'not_paid', explicitFailure: true }, RECONCILE_GRACE_MS - 1)).toBe('skip_young')
    expect(decide({ kind: 'not_paid', explicitFailure: false }, 10 * MIN)).toBe('skip_young')
    expect(decide({ kind: 'unknown_token' }, 34 * MIN)).toBe('skip_young')
  })

  it('writes an explicit failure once the window has passed', () => {
    expect(decide({ kind: 'not_paid', explicitFailure: true }, RECONCILE_GRACE_MS)).toBe('settle_failed')
  })

  it('abandons an unpaid or unknown-token payment once the window has passed', () => {
    expect(decide({ kind: 'not_paid', explicitFailure: false }, RECONCILE_GRACE_MS)).toBe('abandon')
    expect(decide({ kind: 'unknown_token' }, 2 * 60 * MIN)).toBe('abandon')
  })
})

describe('runReconciliation', () => {
  const payment = (id: string, ageMs: number, source: PendingPayment['source'] = 'ledger'): PendingPayment => ({
    id,
    source,
    token: `tok_${id}`,
    createdAt: ago(ageMs),
  })

  function deps(pending: PendingPayment[], verdicts: Record<string, RetrieveVerdict | Error>) {
    const settle = vi.fn<ReconcileDeps['settle']>(async () => {})
    const abandon = vi.fn<ReconcileDeps['abandon']>(async () => {})
    const impl: ReconcileDeps = {
      now: () => NOW,
      listPending: async () => pending,
      retrieve: async (token) => {
        const verdict = verdicts[token]
        if (verdict instanceof Error) throw verdict
        return verdict ?? { kind: 'transient' }
      },
      settle,
      abandon,
    }
    return { impl, settle, abandon }
  }

  it('applies the right action to each row and summarises them', async () => {
    const { impl, settle, abandon } = deps(
      [
        payment('paid_young', 2 * MIN),
        payment('failed_old', 60 * MIN),
        payment('abandoned_old', 60 * MIN, 'addon'),
        payment('open_young', 10 * MIN),
        payment('transient_old', 90 * MIN),
      ],
      {
        tok_paid_young: { kind: 'paid', raw: { paidPrice: '99.00' } },
        tok_failed_old: { kind: 'not_paid', explicitFailure: true },
        tok_abandoned_old: { kind: 'unknown_token' },
        tok_open_young: { kind: 'not_paid', explicitFailure: false },
        tok_transient_old: { kind: 'transient' },
      },
    )

    const summary = await runReconciliation(impl, { limit: 50 })

    expect(summary).toEqual({
      checked: 5,
      paid: 1,
      failed: 1,
      abandoned: 1,
      skippedYoung: 1,
      skippedTransient: 1,
      errors: 0,
    })
    expect(settle).toHaveBeenCalledWith('tok_paid_young', 'paid', { paidPrice: '99.00' })
    expect(settle).toHaveBeenCalledWith('tok_failed_old', 'failed')
    expect(abandon).toHaveBeenCalledTimes(1)
    expect(abandon.mock.calls[0][0]).toMatchObject({ id: 'abandoned_old', source: 'addon' })
  })

  it('keeps going and counts the error when one row throws', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { impl, settle } = deps([payment('boom', 60 * MIN), payment('ok', 1 * MIN)], {
      tok_boom: new Error('network down'),
      tok_ok: { kind: 'paid', raw: {} },
    })
    const summary = await runReconciliation(impl, { limit: 50 })
    expect(summary).toMatchObject({ checked: 2, paid: 1, errors: 1 })
    expect(settle).toHaveBeenCalledTimes(1)
  })

  it('stops before the next row once the deadline has passed', async () => {
    const { impl, settle } = deps([payment('a', 1 * MIN), payment('b', 1 * MIN)], {
      tok_a: { kind: 'paid', raw: {} },
      tok_b: { kind: 'paid', raw: {} },
    })
    const summary = await runReconciliation(impl, { limit: 50, deadlineMs: NOW })
    expect(summary.checked).toBe(0)
    expect(settle).not.toHaveBeenCalled()
  })
})
