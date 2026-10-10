'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, ClipboardList, Loader2, Package, X } from 'lucide-react'
import {
  cancelOrderPayment,
  confirmOrderPayment,
  updateOrderStatus,
  type ManualOrderActionResult,
  type OrderWithItems,
  type OrderStatus,
} from '@/lib/ecommerce'
import { useLanguage } from '@/components/language-provider'

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'completed',
  'cancelled',
  'refunded',
]

export function OrdersClient({
  projectId,
  projectName,
  initialOrders,
}: {
  projectId: string
  projectName: string
  initialOrders: OrderWithItems[]
}) {
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
  const isAwaitingManualPayment = (o: OrderWithItems) =>
    (o.payment_provider === 'bank_transfer' || o.payment_provider === 'cash_on_delivery') &&
    o.payment_status === 'pending' &&
    o.status === 'pending'

  const providerLabel = (id: string) =>
    id === 'bank_transfer'
      ? tr ? 'Havale/EFT' : 'Bank transfer'
      : id === 'cash_on_delivery'
        ? tr ? 'Kapıda ödeme' : 'Cash on delivery'
        : id

  const manualErrorMessage = (r: Extract<ManualOrderActionResult, { ok: false }>) =>
    r.error === 'not_pending'
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
        if (!result.ok) setError(manualErrorMessage(result))
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

  function handleStatusChange(orderId: string, next: OrderStatus) {
    setError(null)
    setPendingId(orderId)
    const prev = orders
    // Optimistic update; revert on failure.
    setOrders((os) => os.map((o) => (o.id === orderId ? { ...o, status: next } : o)))
    startTransition(async () => {
      try {
        await updateOrderStatus(projectId, orderId, next)
        router.refresh()
      } catch {
        setOrders(prev)
        setError(t.ecom.statusUpdateError)
      } finally {
        setPendingId(null)
      }
    })
  }

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
                className="rounded-xl border border-border bg-card/70 p-4 transition-colors hover:border-primary/40 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate font-medium">{o.customer_name}</h2>
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
                      {t.ecom.payment}: {providerLabel(o.payment_provider)} ({o.payment_status})
                    </p>
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
                    <label className="flex items-center gap-1.5">
                      <span className="sr-only">{t.ecom.orderStatus}</span>
                      <select
                        value={o.status}
                        disabled={isPending && pendingId === o.id}
                        onChange={(e) =>
                          handleStatusChange(o.id, e.target.value as OrderStatus)
                        }
                        className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
                      >
                        {ORDER_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                      {isPending && pendingId === o.id && (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      )}
                    </label>
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
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
