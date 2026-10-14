import { describe, expect, it, vi } from 'vitest'
import {
  INITIAL_CONFIRM_STATE,
  confirmCopy,
  confirmReducer,
  requiresConfirmation,
  runStatusChange,
  showRetryRefund,
  statusOptionsFor,
  type ConfirmState,
  type FlowOrder,
  type StatusChangeDeps,
} from './order-status-flow'

const paidCard: FlowOrder = {
  id: 'o1',
  status: 'paid',
  payment_provider: 'iyzico',
  payment_status: 'paid',
  refund_status: null,
}
const bankPending: FlowOrder = {
  id: 'o2',
  status: 'pending',
  payment_provider: 'bank_transfer',
  payment_status: 'pending',
}
const codPaid: FlowOrder = {
  id: 'o3',
  status: 'processing',
  payment_provider: 'cash_on_delivery',
  payment_status: 'paid',
}

function makeDeps(overrides: Partial<StatusChangeDeps> = {}): StatusChangeDeps {
  return {
    refundCardOrder: vi.fn(async () => ({ ok: true as const, followUp: 'done' as const })),
    cancelOrderPayment: vi.fn(async () => ({ ok: true as const })),
    updateOrderStatus: vi.fn(async () => undefined),
    manualErrorMessage: (e) => `manual:${e}`,
    statusUpdateError: 'Durum güncellenemedi. Lütfen tekrar dene.',
    ...overrides,
  }
}

describe('statusOptionsFor', () => {
  it('paid card order: Ödendi..Tamamlandı, İptal, İade; no Bekliyor / Başarısız', () => {
    const options = statusOptionsFor(paidCard)
    expect(options).toEqual(['paid', 'processing', 'shipped', 'completed', 'cancelled', 'refunded'])
    expect(options).not.toContain('pending')
    expect(options).not.toContain('failed')
  })

  it('also applies to a shipped paid card order', () => {
    expect(statusOptionsFor({ ...paidCard, status: 'shipped' })).not.toContain('pending')
  })

  it('bank transfer and cash on delivery keep the existing list', () => {
    const expected = ['pending', 'paid', 'processing', 'shipped', 'completed', 'cancelled', 'refunded']
    expect(statusOptionsFor(bankPending)).toEqual(expected)
    expect(statusOptionsFor(codPaid)).toEqual(expected)
  })

  it('an already refunded card order is no longer a paid card order', () => {
    const refunded = { ...paidCard, status: 'cancelled' as const, payment_status: 'refunded', refund_status: 'succeeded' }
    expect(statusOptionsFor(refunded)).toContain('pending')
  })
})

describe('requiresConfirmation', () => {
  it('requires it for cancel and refund on every payment type', () => {
    for (const o of [paidCard, bankPending, codPaid]) {
      expect(requiresConfirmation(o, 'cancelled')).toBe(true)
      expect(requiresConfirmation(o, 'refunded')).toBe(true)
    }
  })

  it('does not require it for fulfilment statuses', () => {
    for (const s of ['paid', 'processing', 'shipped', 'completed'] as const) {
      expect(requiresConfirmation(paidCard, s)).toBe(false)
    }
  })
})

describe('confirmCopy', () => {
  it('card order: exact Turkish text and buttons', () => {
    const c = confirmCopy(paidCard, 'cancelled')
    expect(c.body).toBe(
      'Bu siparişi iptal edip ödemeyi müşterinin kartına iade etmek üzeresiniz. Bu işlem geri alınamaz; tutar bankaya göre birkaç iş günü içinde yansır.',
    )
    expect(c.cancelLabel).toBe('Vazgeç')
    expect(c.confirmLabel).toBe('Onayla ve iptal et')
    expect(confirmCopy(paidCard, 'refunded').confirmLabel).toBe('Onayla ve iade et')
    expect(confirmCopy(paidCard, 'refunded').body).toBe(c.body)
  })

  it('bank transfer / cash on delivery cancel: stock and notification text', () => {
    for (const o of [bankPending, codPaid]) {
      const c = confirmCopy(o, 'cancelled')
      expect(c.body).toBe('Siparişi iptal etmek üzeresiniz. Stok geri eklenir ve müşteriye bildirim gider.')
      expect(c.confirmLabel).toBe('Onayla ve iptal et')
    }
  })

  it('manual refund does not promise a card refund', () => {
    expect(confirmCopy(bankPending, 'refunded').body).not.toContain('kartına')
  })

  it('has an English variant', () => {
    expect(confirmCopy(paidCard, 'cancelled', 'en').cancelLabel).toBe('Keep order')
  })
})

describe('confirmReducer', () => {
  const open: ConfirmState = confirmReducer(INITIAL_CONFIRM_STATE, { type: 'open', orderId: 'o1', next: 'cancelled' })

  it('opening only records the target; nothing runs', () => {
    expect(open).toEqual({ target: { orderId: 'o1', next: 'cancelled' }, busy: false, error: null })
  })

  it('dismiss (Vazgeç / Esc / close) clears the target', () => {
    expect(confirmReducer(open, { type: 'dismiss' })).toEqual(INITIAL_CONFIRM_STATE)
  })

  it('while busy: no dismiss, no second start, no reopen', () => {
    const busy = confirmReducer(open, { type: 'start' })
    expect(busy.busy).toBe(true)
    expect(confirmReducer(busy, { type: 'dismiss' })).toBe(busy)
    expect(confirmReducer(busy, { type: 'start' })).toBe(busy)
    expect(confirmReducer(busy, { type: 'open', orderId: 'o9', next: 'refunded' })).toBe(busy)
  })

  it('failure keeps the dialog open with the message and allows retry', () => {
    const failed = confirmReducer(confirmReducer(open, { type: 'start' }), {
      type: 'fail',
      message: 'İade başarısız: iyzico şu anda yanıt vermiyor; birazdan tekrar deneyin.',
    })
    expect(failed.busy).toBe(false)
    expect(failed.target).toEqual(open.target)
    expect(failed.error).toContain('İade başarısız')
    expect(confirmReducer(failed, { type: 'start' }).busy).toBe(true)
    expect(confirmReducer(failed, { type: 'start' }).error).toBeNull()
  })

  it('success closes the dialog', () => {
    expect(confirmReducer(confirmReducer(open, { type: 'start' }), { type: 'done' })).toEqual(INITIAL_CONFIRM_STATE)
  })

  it('start without an open dialog is ignored', () => {
    expect(confirmReducer(INITIAL_CONFIRM_STATE, { type: 'start' })).toBe(INITIAL_CONFIRM_STATE)
  })
})

describe('selecting İptal does not call iyzico before confirmation', () => {
  it('open and Vazgeç leave every action untouched; confirm calls refund exactly once', async () => {
    const deps = makeDeps()
    let state = INITIAL_CONFIRM_STATE
    expect(requiresConfirmation(paidCard, 'cancelled')).toBe(true)
    state = confirmReducer(state, { type: 'open', orderId: paidCard.id, next: 'cancelled' })
    state = confirmReducer(state, { type: 'dismiss' })
    expect(state.target).toBeNull()
    expect(deps.refundCardOrder).not.toHaveBeenCalled()
    expect(deps.updateOrderStatus).not.toHaveBeenCalled()

    state = confirmReducer(state, { type: 'open', orderId: paidCard.id, next: 'cancelled' })
    state = confirmReducer(state, { type: 'start' })
    const result = await runStatusChange(paidCard, state.target!.next, deps)
    expect(result.ok).toBe(true)
    expect(deps.refundCardOrder).toHaveBeenCalledTimes(1)
    expect(deps.refundCardOrder).toHaveBeenCalledWith('o1')
    expect(deps.updateOrderStatus).not.toHaveBeenCalled()
  })
})

describe('runStatusChange', () => {
  it('paid card cancel/refund goes through refundCardOrder and marks cancelled + refunded', async () => {
    for (const next of ['cancelled', 'refunded'] as const) {
      const deps = makeDeps()
      const r = await runStatusChange(paidCard, next, deps)
      expect(r).toEqual({
        ok: true,
        patch: { status: 'cancelled', payment_status: 'refunded', refund_status: 'succeeded' },
        notice: undefined,
      })
      expect(deps.cancelOrderPayment).not.toHaveBeenCalled()
    }
  })

  it('flags follow-up attention from the refund', async () => {
    const deps = makeDeps({ refundCardOrder: vi.fn(async () => ({ ok: true as const, followUp: 'attention' as const })) })
    const r = await runStatusChange(paidCard, 'cancelled', deps)
    expect(r.ok && r.notice).toBe('attention')
  })

  it('refund failure returns the Turkish message and changes nothing', async () => {
    const message = 'İade başarısız: iyzico iadeyi kabul etmedi (kod 10223).'
    const deps = makeDeps({ refundCardOrder: vi.fn(async () => ({ ok: false as const, message })) })
    expect(await runStatusChange(paidCard, 'cancelled', deps)).toEqual({ ok: false, message })
  })

  it('a thrown refund error becomes the generic unavailable message', async () => {
    const deps = makeDeps({ refundCardOrder: vi.fn(async () => { throw new Error('boom iyzico raw') }) })
    const r = await runStatusChange(paidCard, 'cancelled', deps)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toContain('iyzico şu anda yanıt vermiyor')
    expect(!r.ok && r.message).not.toContain('boom')
  })

  it('paid card moved to Hazırlanıyor/Kargoda/Tamamlandı only updates the status', async () => {
    for (const next of ['processing', 'shipped', 'completed'] as const) {
      const deps = makeDeps()
      const r = await runStatusChange(paidCard, next, deps)
      expect(r).toEqual({ ok: true, patch: { status: next } })
      expect(deps.updateOrderStatus).toHaveBeenCalledWith('o1', next)
      expect(deps.refundCardOrder).not.toHaveBeenCalled()
    }
  })

  it('awaiting bank transfer / COD cancel uses the existing cancel flow', async () => {
    const deps = makeDeps()
    const r = await runStatusChange(bankPending, 'cancelled', deps)
    expect(r).toEqual({ ok: true, patch: { status: 'cancelled' } })
    expect(deps.cancelOrderPayment).toHaveBeenCalledWith('o2')
    expect(deps.refundCardOrder).not.toHaveBeenCalled()
  })

  it('maps a manual cancel failure through manualErrorMessage', async () => {
    const deps = makeDeps({ cancelOrderPayment: vi.fn(async () => ({ ok: false as const, error: 'not_pending' })) })
    expect(await runStatusChange(bankPending, 'cancelled', deps)).toEqual({ ok: false, message: 'manual:not_pending' })
  })

  it('other cancel (e.g. paid COD) goes through updateOrderStatus and never iyzico', async () => {
    const deps = makeDeps()
    const r = await runStatusChange(codPaid, 'cancelled', deps)
    expect(r).toEqual({ ok: true, patch: { status: 'cancelled' } })
    expect(deps.updateOrderStatus).toHaveBeenCalledWith('o3', 'cancelled')
    expect(deps.refundCardOrder).not.toHaveBeenCalled()
  })

  it('updateOrderStatus failure returns the existing Turkish error', async () => {
    const deps = makeDeps({ updateOrderStatus: vi.fn(async () => { throw new Error('PAYMENT_PAID') }) })
    expect(await runStatusChange(codPaid, 'shipped', deps)).toEqual({
      ok: false,
      message: 'Durum güncellenemedi. Lütfen tekrar dene.',
    })
  })

  it('retry after a failure can run again (no stuck state in the runner)', async () => {
    const refund = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: 'İade başarısız: x' })
      .mockResolvedValueOnce({ ok: true, followUp: 'done' })
    const deps = makeDeps({ refundCardOrder: refund })
    expect((await runStatusChange(paidCard, 'cancelled', deps)).ok).toBe(false)
    expect((await runStatusChange(paidCard, 'cancelled', deps)).ok).toBe(true)
    expect(refund).toHaveBeenCalledTimes(2)
  })
})

describe('showRetryRefund', () => {
  it('shows for failed / unresolved refunds and cancelled-but-still-paid card orders', () => {
    expect(showRetryRefund({ ...paidCard, refund_status: 'failed' })).toBe(true)
    expect(showRetryRefund({ ...paidCard, refund_status: 'pending' })).toBe(true)
    expect(showRetryRefund({ ...paidCard, status: 'cancelled' })).toBe(true)
  })

  it('hidden for a normal paid card order, finished refunds and other payment types', () => {
    expect(showRetryRefund(paidCard)).toBe(false)
    expect(
      showRetryRefund({ ...paidCard, status: 'cancelled', payment_status: 'refunded', refund_status: 'succeeded' }),
    ).toBe(false)
    expect(showRetryRefund({ ...codPaid, status: 'cancelled' })).toBe(false)
    expect(showRetryRefund(bankPending)).toBe(false)
  })
})
