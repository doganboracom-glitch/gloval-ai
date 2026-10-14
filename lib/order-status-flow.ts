/**
 * Owner "Siparişler" status dropdown: option lists, the confirmation step for
 * cancel / refund, and the runner that performs a confirmed change. Kept free of
 * React and server imports so the whole flow is unit-testable; the server
 * actions are injected by the component.
 */
import type { OrderStatus } from '@/lib/ecommerce'
import { canRefundCardOrder, refundErrorMessage } from '@/lib/store-refund-status'

export type FlowOrder = {
  id: string
  status: OrderStatus
  payment_provider: string
  payment_status: string
  refund_status?: string | null
}

type Lang = 'tr' | 'en'

const DEFAULT_STATUS_OPTIONS: readonly OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
]

/** "Bekliyor" and "Başarısız" are deliberately absent: a paid card order never goes back. */
const PAID_CARD_STATUS_OPTIONS: readonly OrderStatus[] = [
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
]

/** Every payment type shares one dropdown; only a paid card order gets the shorter list. */
export function statusOptionsFor(order: FlowOrder): OrderStatus[] {
  return [...(canRefundCardOrder(order) ? PAID_CARD_STATUS_OPTIONS : DEFAULT_STATUS_OPTIONS)]
}

export function isAwaitingManualPayment(order: FlowOrder): boolean {
  return (
    (order.payment_provider === 'bank_transfer' || order.payment_provider === 'cash_on_delivery') &&
    order.payment_status === 'pending' &&
    order.status === 'pending'
  )
}

/** Retry stays available for a refund that failed/is unresolved, or a cancelled-but-still-paid card order. */
export function showRetryRefund(order: FlowOrder): boolean {
  return (
    canRefundCardOrder(order) &&
    (order.refund_status === 'failed' || order.refund_status === 'pending' || order.status === 'cancelled')
  )
}

export function requiresConfirmation(order: FlowOrder, next: OrderStatus): boolean {
  return next !== order.status && (next === 'cancelled' || next === 'refunded')
}

export type ConfirmCopy = {
  title: string
  body: string
  cancelLabel: string
  confirmLabel: string
}

export function confirmCopy(order: FlowOrder, next: OrderStatus, lang: Lang = 'tr'): ConfirmCopy {
  const refund = next === 'refunded'
  const card = canRefundCardOrder(order)
  if (lang === 'en') {
    return {
      title: card ? 'Cancel and refund order' : refund ? 'Mark order as refunded' : 'Cancel order',
      body: card
        ? 'You are about to cancel this order and refund the payment to the buyer’s card. This cannot be undone; the amount appears within a few business days depending on the bank.'
        : refund
          ? 'You are about to mark this order as refunded. No money moves from this panel; return the payment to the buyer yourself.'
          : 'You are about to cancel this order. Stock is returned and the buyer is notified.',
      cancelLabel: 'Keep order',
      confirmLabel: refund ? 'Confirm and refund' : 'Confirm and cancel',
    }
  }
  return {
    title: card ? 'Siparişi iptal et ve iade et' : refund ? 'Siparişi iade edildi olarak işaretle' : 'Siparişi iptal et',
    body: card
      ? 'Bu siparişi iptal edip ödemeyi müşterinin kartına iade etmek üzeresiniz. Bu işlem geri alınamaz; tutar bankaya göre birkaç iş günü içinde yansır.'
      : refund
        ? 'Siparişi iade edildi olarak işaretlemek üzeresiniz. Bu panelden para hareketi yapılmaz; ödemeyi müşteriye kendiniz iade etmelisiniz.'
        : 'Siparişi iptal etmek üzeresiniz. Stok geri eklenir ve müşteriye bildirim gider.',
    cancelLabel: 'Vazgeç',
    confirmLabel: refund ? 'Onayla ve iade et' : 'Onayla ve iptal et',
  }
}

export type ConfirmTarget = { orderId: string; next: OrderStatus }

export type ConfirmState = {
  target: ConfirmTarget | null
  busy: boolean
  error: string | null
}

export const INITIAL_CONFIRM_STATE: ConfirmState = { target: null, busy: false, error: null }

export type ConfirmEvent =
  | { type: 'open'; orderId: string; next: OrderStatus }
  | { type: 'dismiss' }
  | { type: 'start' }
  | { type: 'fail'; message: string }
  | { type: 'done' }

/** While a request is in flight the dialog cannot be dismissed, reopened or started twice. */
export function confirmReducer(state: ConfirmState, event: ConfirmEvent): ConfirmState {
  switch (event.type) {
    case 'open':
      return state.busy ? state : { target: { orderId: event.orderId, next: event.next }, busy: false, error: null }
    case 'dismiss':
      return state.busy ? state : INITIAL_CONFIRM_STATE
    case 'start':
      return !state.target || state.busy ? state : { ...state, busy: true, error: null }
    case 'fail':
      return state.target ? { ...state, busy: false, error: event.message } : state
    case 'done':
      return INITIAL_CONFIRM_STATE
  }
}

export type OrderPatch = {
  status?: OrderStatus
  payment_status?: string
  refund_status?: 'pending' | 'failed' | 'succeeded' | null
}

export type StatusChangeResult =
  | { ok: true; patch: OrderPatch; notice?: 'attention' }
  | { ok: false; message: string }

export type StatusChangeDeps = {
  refundCardOrder: (
    orderId: string,
  ) => Promise<
    | { ok: true; followUp?: 'done' | 'attention' }
    | { ok: false; message: string }
  >
  cancelOrderPayment: (
    orderId: string,
  ) => Promise<{ ok: true; oversold?: boolean } | { ok: false; error: string }>
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>
  manualErrorMessage: (error: string) => string
  statusUpdateError: string
}

/** Performs one status change. Only call it after the owner confirmed a cancel / refund. */
export async function runStatusChange(
  order: FlowOrder,
  next: OrderStatus,
  deps: StatusChangeDeps,
): Promise<StatusChangeResult> {
  if (canRefundCardOrder(order) && (next === 'cancelled' || next === 'refunded')) {
    try {
      const r = await deps.refundCardOrder(order.id)
      if (!r.ok) return { ok: false, message: r.message }
      return {
        ok: true,
        patch: { status: 'cancelled', payment_status: 'refunded', refund_status: 'succeeded' },
        notice: r.followUp === 'attention' ? 'attention' : undefined,
      }
    } catch {
      return { ok: false, message: refundErrorMessage('unavailable') }
    }
  }

  try {
    if (isAwaitingManualPayment(order) && next === 'cancelled') {
      const r = await deps.cancelOrderPayment(order.id)
      if (!r.ok) return { ok: false, message: deps.manualErrorMessage(r.error) }
      return { ok: true, patch: { status: 'cancelled' } }
    }
    await deps.updateOrderStatus(order.id, next)
    return { ok: true, patch: { status: next } }
  } catch {
    return { ok: false, message: deps.statusUpdateError }
  }
}
