'use client'

import { useCallback, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ClipboardList, Loader2, Package, Undo2, X } from 'lucide-react'
import {
  cancelOrderPayment,
  confirmOrderPayment,
  refundCardOrder,
  updateOrderStatus,
  type ManualOrderActionResult,
  type OrderWithItems,
  type OrderStatus,
} from '@/lib/ecommerce'
import { useLanguage } from '@/components/language-provider'
import { formatVatLine, summarizeVat } from '@/lib/store-vat'
import { paymentStatusLabel } from '@/lib/payment-status-label'
import { OrderShippingControls } from '@/components/ecommerce/order-shipping-controls'
import { OwnerPaymentId } from '@/components/ecommerce/owner-payment-id'
import { ownerPaymentId } from '@/lib/owner-payment-id'
import { needsAttention } from '@/lib/store-order-attention'
import { REFUND_DISPLAY_LABEL, refundDisplay, refundErrorMessage } from '@/lib/store-refund-status'
import { OrderActionConfirmDialog } from '@/components/ecommerce/order-action-confirm-dialog'
import {
  INITIAL_CONFIRM_STATE,
  confirmCopy,
  confirmReducer,
  isAwaitingManualPayment,
  requiresConfirmation,
  runStatusChange,
  showRetryRefund,
  statusOptionsFor,
  type OrderPatch,
  type StatusChangeDeps,
  type StatusChangeResult,
} from '@/lib/order-status-flow'

export function OrdersClient({
  projectId,
  projectName,
  initialOrders,
  defaultCarrier = null,
  deletedOrderIds = [],
}: {
  projectId: string
  projectName: string
  initialOrders: OrderWithItems[]
  defaultCarrier?: string | null
  deletedOrderIds?: string[]
}) {
  const deletedOrders = useMemo(() => new Set(deletedOrderIds), [deletedOrderIds])
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [orders, setOrders] = useState<OrderWithItems[]>(initialOrders)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const currencyFmt = useMemo(
    () =>
      new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
        style: 'currency',
        currency: 'TRY',
        maximumFractionDigits: 2,
      }),
    [lang],
  )

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [lang],
  )

  const statusLabel = (s: OrderStatus) =>
    ({
      pending: t.ecom.oStatusPending,
      paid: t.ecom.oStatusPaid,
      processing: t.ecom.oStatusProcessing,
      shipped: t.ecom.oStatusShipped,
      completed: t.ecom.oStatusCompleted,
      cancelled: t.ecom.oStatusCancelled,
      failed: t.ecom.oStatusFailed,
      refunded: t.ecom.oStatusRefunded,
      fulfilled: t.ecom.oStatusFulfilled,
    })[s]

  const statusClass = (s: OrderStatus) => {
    if (s === 'paid' || s === 'completed' || s === 'fulfilled') return 'bg-accent/15 text-accent'
    if (s === 'failed' || s === 'cancelled') return 'bg-destructive/15 text-destructive'
    if (s === 'refunded') return 'bg-muted text-muted-foreground'
    return 'bg-primary/15 text-primary'
  }

  const tr = lang === 'tr'
  const providerLabel = (id: string) =>
    id === 'bank_transfer'
      ? tr ? 'Havale/EFT' : 'Bank transfer'
      : id === 'cash_on_delivery'
        ? tr ? 'Kapıda ödeme' : 'Cash on delivery'
        : id

  const manualErrorMessage = (error: string) =>
    error === 'not_pending'
      ? tr ? 'Bu sipariş artık beklemede değil. Sayfa yenileniyor.' : 'This order is no longer pending. Refreshing.'
      : t.ecom.statusUpdateError

  function handleManualAction(orderId: string, action: 'confirm' | 'cancel') {
    const message =
      action === 'confirm'
        ? tr
          ? 'Ödemenin hesabınıza ulaştığını onaylıyor musunuz? Müşteriye ödeme alındı e-postası gönderilir.'
          : 'Confirm the payment has been received? The buyer is emailed a payment confirmation.'
        : tr
          ? 'Siparişi iptal etmek istiyor musunuz? Ayrılan stok geri verilir.'
          : 'Cancel this order? Reserved stock is returned.'
    if (!window.confirm(message)) return
    setError(null)
    setPendingId(orderId)
    startTransition(async () => {
      try {
        const result =
          action === 'confirm'
            ? await confirmOrderPayment(projectId, orderId)
            : await cancelOrderPayment(projectId, orderId)
        if (!result.ok) setError(manualErrorMessage(result.error))
        else if (result.ok && result.oversold) {
          setError(
            tr
              ? 'Ödeme onaylandı ancak stok yetersiz kaldı; siparişi manuel kontrol edin.'
              : 'Payment confirmed but stock ran short; please review the order manually.',
          )
        }
        router.refresh()
        if (result.ok) {
          setOrders((os) =>
            os.map((o) =>
              o.id === orderId
                ? action === 'confirm'
                  ? { ...o, status: 'paid', payment_status: 'paid' }
                  : { ...o, status: 'cancelled' }
                : o,
            ),
          )
        }
      } catch {
        setError(t.ecom.statusUpdateError)
      } finally {
        setPendingId(null)
      }
    })
  }

  const [confirmState, dispatchConfirm] = useReducer(confirmReducer, INITIAL_CONFIRM_STATE)
  // Synchronous guard: state updates land on the next render, so two fast clicks could both start a request.
  const inFlight = useRef(false)
  const dismissConfirm = useCallback(() => dispatchConfirm({ type: 'dismiss' }), [])

  const flowDeps: StatusChangeDeps = {
    refundCardOrder: (id) => refundCardOrder(projectId, id),
    cancelOrderPayment: (id) => cancelOrderPayment(projectId, id),
    updateOrderStatus: (id, status) => updateOrderStatus(projectId, id, status),
    manualErrorMessage,
    statusUpdateError: t.ecom.statusUpdateError,
  }

  function applyPatch(orderId: string, patch: OrderPatch) {
    setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, ...patch } : o)))
  }

  function applyNotice(result: Extract<StatusChangeResult, { ok: true }>) {
    if (result.notice === 'attention') {
      setError(
        tr
          ? 'İade yapıldı; stok veya müşteri bildirimi tamamlanamadı, sistem otomatik tekrar deneyecek.'
          : 'Refund done; stock or the buyer e-mail did not finish, the system will retry automatically.',
      )
    }
  }

  function handleStatusChange(orderId: string, next: OrderStatus) {
    const order = orders.find((o) => o.id === orderId)
    if (!order || inFlight.current) return
    // Cancel / refund never run straight from the dropdown; the select stays on the old value until confirmed.
    if (requiresConfirmation(order, next)) {
      dispatchConfirm({ type: 'open', orderId, next })
      return
    }
    inFlight.current = true
    setError(null)
    setPendingId(orderId)
    const prev = orders
    // Optimistic update; revert on failure.
    applyPatch(orderId, { status: next })
    startTransition(async () => {
      try {
        const result = await runStatusChange(order, next, flowDeps)
        if (!result.ok) {
          setOrders(prev)
          setError(result.message)
        } else {
          applyNotice(result)
        }
        router.refresh()
      } finally {
        inFlight.current = false
        setPendingId(null)
      }
    })
  }

  function handleConfirm() {
    const target = confirmState.target
    if (!target || inFlight.current) return
    const order = orders.find((o) => o.id === target.orderId)
    if (!order) {
      dispatchConfirm({ type: 'dismiss' })
      return
    }
    inFlight.current = true
    dispatchConfirm({ type: 'start' })
    setError(null)
    setPendingId(order.id)
    startTransition(async () => {
      try {
        const result = await runStatusChange(order, target.next, flowDeps)
        if (!result.ok) {
          dispatchConfirm({ type: 'fail', message: result.message })
        } else {
          applyPatch(order.id, result.patch)
          applyNotice(result)
          dispatchConfirm({ type: 'done' })
        }
        router.refresh()
      } finally {
        inFlight.current = false
        setPendingId(null)
      }
    })
  }

  const confirmOrder = confirmState.target
    ? orders.find((o) => o.id === confirmState.target?.orderId)
    : undefined

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/ecommerce/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t.ecom.backToProducts}
          </Link>
        </div>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-primary">
            <ClipboardList className="size-5" />
            <span className="text-sm font-medium uppercase tracking-wide">{projectName}</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance">
            {t.ecom.ordersTitle}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {t.ecom.ordersSubtitle} · {orders.length} {t.ecom.orderCount}
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {orders.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ClipboardList className="size-7" />
            </div>
            <p className="mt-5 text-lg font-medium">{t.ecom.ordersEmpty}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.ecom.ordersEmptyCta}</p>
          </div>
        ) : (
          <ul className="mt-8 flex flex-col gap-4">
            {orders.map((o) => (
              <li
                key={o.id}
                id={`order-${o.id}`}
                className="scroll-mt-24 rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-medium">{o.customer_name}</h2>
                      {deletedOrders.has(o.id) && (
                        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Silinmiş müşteri
                        </span>
                      )}
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(o.status)}`}
                      >
                        {statusLabel(o.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {o.customer_email}
                      {o.customer_phone ? ` · ${o.customer_phone}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t.ecom.orderDate}: {dateFmt.format(new Date(o.created_at))} ·{' '}
                      {t.ecom.payment}: {providerLabel(o.payment_provider)} ({paymentStatusLabel(o.payment_status, lang === 'tr' ? 'tr' : 'en')})
                    </p>
                    {refundDisplay(o) !== 'none' && (
                      <p className="mt-1 text-xs font-medium text-muted-foreground">
                        {REFUND_DISPLAY_LABEL[refundDisplay(o) as Exclude<ReturnType<typeof refundDisplay>, 'none'>]}
                        {o.refund_status === 'failed' && o.refund_error === 'verify'
                          ? ` · ${refundErrorMessage('verify_manually').replace('İade başarısız: ', '')}`
                          : ''}
                      </p>
                    )}
                    {needsAttention(o) && (
                      <p
                        role="alert"
                        className="mt-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                      >
                        <span className="font-medium">
                          {o.refund_status
                            ? tr
                              ? 'Dikkat gerekiyor: iade yapıldı, işlem tamamlanamadı.'
                              : 'Needs attention: refund made, order could not be completed.'
                            : tr
                              ? 'Dikkat gerekiyor: ödeme alındı, işlem tamamlanamadı.'
                              : 'Needs attention: payment received, order could not be completed.'}
                        </span>{' '}
                        {tr
                          ? 'Sistem otomatik olarak tekrar deniyor; çözülmezse iyzico paymentId ile destek isteyin.'
                          : 'The system keeps retrying; if it persists, contact support with the iyzico paymentId.'}
                      </p>
                    )}
                    {o.refund_status === 'pending' && o.payment_status === 'paid' && o.refund_error && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tr
                          ? 'Önceki iade denemesinin sonucu belirsiz. iyzico panelinde ödemenin durumunu kontrol edip yeniden deneyin.'
                          : 'The previous refund attempt has an unknown result. Check the payment in the iyzico panel, then retry.'}
                      </p>
                    )}
                    {ownerPaymentId(o) && (
                      <OwnerPaymentId paymentId={ownerPaymentId(o)!} lang={tr ? 'tr' : 'en'} />
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <p className="text-lg font-semibold">
                      {currencyFmt.format(o.total_cents / 100)}
                    </p>
                    {isAwaitingManualPayment(o) ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isPending && pendingId === o.id}
                          onClick={() => handleManualAction(o.id, 'confirm')}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                          <Check className="size-4" aria-hidden />
                          {o.payment_provider === 'cash_on_delivery'
                            ? tr ? 'Ödeme alındı' : 'Mark as paid'
                            : tr ? 'Ödemeyi onayla' : 'Confirm payment'}
                        </button>
                        <button
                          type="button"
                          disabled={isPending && pendingId === o.id}
                          onClick={() => handleManualAction(o.id, 'cancel')}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <X className="size-4" aria-hidden />
                          {tr ? 'İptal et' : 'Cancel'}
                        </button>
                        {isPending && pendingId === o.id && (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        )}
                      </div>
                    ) : (
                      <>
                        <label className="flex items-center gap-1.5">
                          <span className="sr-only">{t.ecom.orderStatus}</span>
                          <select
                            value={o.status}
                            disabled={pendingId === o.id}
                            onChange={(e) =>
                              handleStatusChange(o.id, e.target.value as OrderStatus)
                            }
                            className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                          >
                            {statusOptionsFor(o).map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(s)}
                              </option>
                            ))}
                          </select>
                          {pendingId === o.id && (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          )}
                        </label>
                        {showRetryRefund(o) && (
                          <button
                            type="button"
                            disabled={pendingId === o.id}
                            onClick={() => dispatchConfirm({ type: 'open', orderId: o.id, next: 'refunded' })}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Undo2 className="size-4" aria-hidden />
                            {tr ? 'İadeyi yeniden dene' : 'Retry refund'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {o.items.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Package className="size-3.5" />
                      {t.ecom.orderItems}
                    </p>
                    <ul className="flex flex-col gap-1">
                      {o.items.map((it) => (
                        <li
                          key={it.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="min-w-0 truncate">
                            {it.name}{' '}
                            <span className="text-muted-foreground">
                              × {it.quantity} {t.ecom.qtyShort}
                            </span>
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {currencyFmt.format(it.line_total_cents / 100)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {(() => {
                      const vatLine = formatVatLine(
                        summarizeVat(o.items),
                        (cents) => currencyFmt.format(cents / 100),
                        lang === 'tr' ? 'tr' : 'en',
                      )
                      return vatLine ? (
                        <p className="mt-2 text-xs text-muted-foreground">{vatLine}</p>
                      ) : null
                    })()}
                    {o.cod_fee_cents > 0 && (
                      <p className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-sm">
                        <span className="text-muted-foreground">
                          {lang === 'tr' ? 'Kapıda ödeme ücreti' : 'Cash on delivery fee'}
                        </span>
                        <span className="shrink-0 font-medium">
                          {currencyFmt.format(o.cod_fee_cents / 100)}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                <OrderShippingControls
                  key={`${o.id}-${o.shipping_status ?? ''}`}
                  projectId={projectId}
                  order={o}
                  defaultCarrier={defaultCarrier}
                  onChange={(patch) => {
                    setOrders((os) => os.map((x) => (x.id === o.id ? { ...x, ...patch } : x)))
                    router.refresh()
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmOrder && confirmState.target && (
        <OrderActionConfirmDialog
          {...(() => {
            const copy = confirmCopy(confirmOrder, confirmState.target.next, tr ? 'tr' : 'en')
            return {
              title: copy.title,
              description: copy.body,
              cancelLabel: copy.cancelLabel,
              confirmLabel: copy.confirmLabel,
            }
          })()}
          busy={confirmState.busy}
          error={confirmState.error}
          onConfirm={handleConfirm}
          onDismiss={dismissConfirm}
        />
      )}
    </div>
  )
}
