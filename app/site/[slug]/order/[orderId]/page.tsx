import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { formatIban } from '@/lib/iban'
import { getOrderConfirmation } from '@/lib/store-order-access'
import { formatPrice } from '@/lib/format'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sipariş onayı',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; orderId: string }>
  searchParams: Promise<{ t?: string | string[] }>
}) {
  const { slug, orderId } = await params
  const { t } = await searchParams
  const order = await getOrderConfirmation(orderId, slug, Array.isArray(t) ? t[0] : t)
  if (!order) notFound()

  const paid = order.payment_status === 'paid'
  const failed = order.payment_status === 'failed'
  const cancelled = order.status === 'cancelled'
  const awaitingTransfer = order.bank !== null
  const awaitingDelivery =
    order.payment_provider === 'cash_on_delivery' &&
    order.payment_status === 'pending' &&
    !cancelled

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          {paid ? (
            <CheckCircle2 className="size-14 text-accent" />
          ) : failed ? (
            <XCircle className="size-14 text-destructive" />
          ) : (
            <Clock className="size-14 text-muted-foreground" />
          )}
          <h1 className="font-display text-2xl font-bold text-balance">
            {paid
              ? 'Siparişin alındı!'
              : cancelled
                ? 'Sipariş iptal edildi'
                : failed
                  ? 'Ödeme başarısız'
                  : awaitingTransfer
                    ? 'Siparişin alındı, havale bekleniyor'
                    : awaitingDelivery
                      ? 'Siparişin alındı, kapıda ödeme'
                      : 'Siparişin işleniyor'}
          </h1>
          <p className="text-muted-foreground">
            {paid
              ? `Teşekkürler ${order.first_name}. Onay e-postası ${order.masked_email} adresine gönderilecek.`
              : awaitingDelivery
                ? 'Ödemeyi siparişin teslim edilirken yapacaksın.'
                : 'Sipariş durumunu aşağıda görebilirsin.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Sipariş No: <span className="font-mono">{order.id.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>

        {order.bank && (
          <section
            aria-labelledby="bank-heading"
            className="mt-8 rounded-2xl border border-border bg-card p-6"
          >
            <h2 id="bank-heading" className="font-display text-lg font-bold">
              Havale / EFT bilgileri
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tutarı aşağıdaki hesaba gönderirken açıklamaya{' '}
              <span className="font-mono">{order.id.slice(0, 8).toUpperCase()}</span> yaz. Ödeme{' '}
              {new Date(order.bank.dueAt).toLocaleDateString('tr-TR')} tarihine kadar yapılmazsa
              sipariş otomatik iptal edilir.
            </p>
            <dl className="mt-4 grid gap-2 text-sm">
              {order.bank.bankName && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Banka</dt>
                  <dd className="font-medium">{order.bank.bankName}</dd>
                </div>
              )}
              {order.bank.accountHolder && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Hesap sahibi</dt>
                  <dd className="font-medium">{order.bank.accountHolder}</dd>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">IBAN</dt>
                <dd className="font-mono font-medium">{formatIban(order.bank.iban)}</dd>
              </div>
              {order.bank.instructions && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Not</dt>
                  <dd className="text-right">{order.bank.instructions}</dd>
                </div>
              )}
            </dl>
          </section>
        )}

        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Sipariş detayı</h2>
          <ul className="mt-4 divide-y divide-border">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-3 text-sm">
                <span className="line-clamp-1">
                  {item.name}{' '}
                  <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {formatPrice(item.line_total_cents, order.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">Toplam</span>
            <span className="font-display text-xl font-bold">
              {formatPrice(order.total_cents, order.currency)}
            </span>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Link href={`/site/${slug}/store`}>
            <Button variant="outline">Alışverişe devam et</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
