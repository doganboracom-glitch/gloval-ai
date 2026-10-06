import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { getOrderConfirmation } from '@/lib/store'
import { formatPrice } from '@/lib/format'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Sipariş onayı' }

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; orderId: string }>
}) {
  const { slug, orderId } = await params
  const order = await getOrderConfirmation(orderId)
  if (!order) notFound()

  const paid = order.payment_status === 'paid'
  const failed = order.payment_status === 'failed'

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
              : failed
                ? 'Ödeme başarısız'
                : 'Siparişin işleniyor'}
          </h1>
          <p className="text-muted-foreground">
            {paid
              ? `Teşekkürler ${order.customer_name}. Onay e-postası ${order.customer_email} adresine gönderilecek.`
              : 'Sipariş durumunu aşağıda görebilirsin.'}
          </p>
          <p className="text-sm text-muted-foreground">
            Sipariş No: <span className="font-mono">{order.id.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>

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
