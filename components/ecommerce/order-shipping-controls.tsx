'use client'

import { useState, useTransition } from 'react'
import { Check, ExternalLink, Loader2, Pencil, Truck } from 'lucide-react'
import { markStoreOrderDelivered, markStoreOrderUndelivered, shipStoreOrder } from '@/lib/store-shipping-actions'
import { buildTrackingUrl, carrierName, CARRIERS, isCarrierId } from '@/lib/shipping-carriers'
import { shipGate } from '@/lib/store-shipping-rules'
import type { OrderWithItems } from '@/lib/ecommerce'

export type ShippingPatch = Partial<
  Pick<
    OrderWithItems,
    'status' | 'shipping_status' | 'tracking_carrier' | 'tracking_number' | 'shipped_at' | 'delivered_at'
  >
>

const shipErrors: Record<string, string> = {
  invalid_carrier: 'Kargo firmasını seçin.',
  invalid_tracking: 'Takip kodu 6-40 karakter olmalı (harf, rakam, tire).',
  payment_pending: 'Ödeme onaylanmadan sipariş kargoya verilemez.',
  cancelled: 'İptal edilmiş sipariş kargoya verilemez.',
  conflict: 'Sipariş zaten güncellendi. Sayfayı yenileyin.',
  not_found: 'Sipariş bulunamadı.',
  failed: 'Kargo bilgisi kaydedilemedi. Tekrar deneyin.',
}

const undeliverErrors: Record<string, string> = {
  not_delivered: 'Sipariş teslim edilmiş değil.',
  cancelled: 'İptal edilmiş sipariş güncellenemez.',
  conflict: 'Sipariş zaten güncellendi. Sayfayı yenileyin.',
  not_found: 'Sipariş bulunamadı.',
  failed: 'Teslim durumu geri alınamadı. Tekrar deneyin.',
}

const deliverErrors: Record<string, string> = {
  not_shipped: 'Sipariş henüz kargoya verilmedi.',
  already_delivered: 'Sipariş zaten teslim edildi.',
  cancelled: 'İptal edilmiş sipariş güncellenemez.',
  conflict: 'Sipariş zaten güncellendi. Sayfayı yenileyin.',
  not_found: 'Sipariş bulunamadı.',
  failed: 'Teslim durumu kaydedilemedi. Tekrar deneyin.',
}

export function OrderShippingControls({
  projectId,
  order,
  defaultCarrier,
  onChange,
}: {
  projectId: string
  order: OrderWithItems
  defaultCarrier: string | null
  onChange: (patch: ShippingPatch) => void
}) {
  const [pending, startTransition] = useTransition()
  const shippingStatus = order.shipping_status ?? 'preparing'
  const shipped = shippingStatus === 'shipped' || shippingStatus === 'in_transit'
  const delivered = shippingStatus === 'delivered'
  const gate = shipGate(order)

  const [editing, setEditing] = useState(false)
  const [carrier, setCarrier] = useState(
    isCarrierId(order.tracking_carrier) ? order.tracking_carrier : (defaultCarrier ?? ''),
  )
  const [code, setCode] = useState(order.tracking_number ?? '')
  const [renotify, setRenotify] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (gate === 'cancelled') return null
  if (gate === 'payment_pending' && !shipped && !delivered) {
    return (
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Kargo için önce ödemenin onaylanması gerekir.
      </p>
    )
  }

  const trackingUrl = buildTrackingUrl(order.tracking_carrier, order.tracking_number)
  const showForm = !shipped && !delivered ? true : editing

  function submit() {
    setMessage(null)
    startTransition(async () => {
      try {
        const wasShipped = shipped
        const result = await shipStoreOrder(projectId, order.id, {
          carrier,
          trackingNumber: code,
          renotify: wasShipped ? renotify : false,
        })
        if (!result.ok) {
          setMessage(shipErrors[result.error] ?? shipErrors.failed)
          return
        }
        const trimmed = code.trim()
        onChange(
          result.kind === 'shipped'
            ? {
                status: 'shipped',
                shipping_status: 'shipped',
                tracking_carrier: carrier,
                tracking_number: trimmed,
                shipped_at: new Date().toISOString(),
              }
            : { tracking_carrier: carrier, tracking_number: trimmed },
        )
        setEditing(false)
        setRenotify(false)
      } catch {
        setMessage(shipErrors.failed)
      }
    })
  }

  function undeliver() {
    if (!window.confirm('Teslim durumu geri alınsın mı?')) return
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await markStoreOrderUndelivered(projectId, order.id)
        if (!result.ok) {
          setMessage(undeliverErrors[result.error] ?? undeliverErrors.failed)
          return
        }
        onChange({ status: 'shipped', shipping_status: 'shipped', delivered_at: null })
      } catch {
        setMessage(undeliverErrors.failed)
      }
    })
  }

  function deliver() {
    if (!window.confirm('Sipariş teslim edildi olarak işaretlensin mi?')) return
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await markStoreOrderDelivered(projectId, order.id)
        if (!result.ok) {
          setMessage(deliverErrors[result.error] ?? deliverErrors.failed)
          return
        }
        onChange({
          status: 'completed',
          shipping_status: 'delivered',
          delivered_at: new Date().toISOString(),
        })
      } catch {
        setMessage(deliverErrors.failed)
      }
    })
  }

  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Truck className="size-3.5" aria-hidden />
        Kargo
      </p>

      {(shipped || delivered) && !editing && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p>
              {carrierName(order.tracking_carrier) || 'Kargo'}
              {order.tracking_number && (
                <span className="ml-2 font-mono text-muted-foreground">{order.tracking_number}</span>
              )}
            </p>
            {trackingUrl && (
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Takip sayfası
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>
          <div className="flex items-center gap-2">
            {delivered ? (
              <button
                type="button"
                disabled={pending}
                onClick={undeliver}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                Teslim durumunu geri al
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={deliver}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="size-4" aria-hidden />
                Teslim edildi
              </button>
            )}
            {!delivered && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setEditing(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <Pencil className="size-4" aria-hidden />
                Düzenle
              </button>
            )}
            {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </div>
      )}

      {showForm && !delivered && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Kargo firması</span>
              <select
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background/60 px-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Seçin</option>
                {CARRIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">Takip kodu</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={40}
                autoComplete="off"
                className="h-9 rounded-lg border border-input bg-background/60 px-3 font-mono text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          {shipped && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={renotify}
                onChange={(e) => setRenotify(e.target.checked)}
                className="size-4 accent-primary"
              />
              Müşteriye güncel bilgiyi tekrar e-postayla gönder
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Truck className="size-4" aria-hidden />
              {shipped ? 'Kargo bilgisini kaydet' : 'Kargoya verildi'}
            </button>
            {shipped && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditing(false)
                  setMessage(null)
                }}
                className="inline-flex h-9 items-center rounded-lg border border-input px-3 text-sm transition-colors hover:bg-muted"
              >
                Vazgeç
              </button>
            )}
            {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
        </form>
      )}

      {message && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {message}
        </p>
      )}
    </div>
  )
}
