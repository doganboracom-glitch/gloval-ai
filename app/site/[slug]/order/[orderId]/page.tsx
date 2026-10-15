import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { modeHasTransactions } from '@/lib/commerce-mode'
import { getPublishedSiteCommerceMode } from '@/lib/commerce-mode-server'
import { CheckCircle2, Clock, XCircle, Mail, Store } from 'lucide-react'
import { getOrderConfirmation } from '@/lib/store-order-access'
import { formatPrice } from '@/lib/format'
import { shippingRowValue } from '@/lib/store-shipping-display'
import { orderStatusCopy, safeStoreContactHref } from '@/lib/store-order-status'
import { formatVatLine, summarizeVat } from '@/lib/store-vat'
import { Button } from '@/components/ui/button'
import { BankTransferInstructions, BankTransferMissing } from '@/components/store/bank-transfer-instructions'

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
  if (!modeHasTransactions(await getPublishedSiteCommerceMode(slug))) notFound()
  const order = await getOrderConfirmation(orderId, slug, Array.isArray(t) ? t[0] : t)
  if (!order) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-12 text-center">
          <h1 className="font-display text-2xl font-bold text-balance">Bağlantı geçersiz</h1>
          <p className="mt-3 text-muted-foreground">
            Bu sipariş bağlantısı geçersiz veya süresi dolmuş olabilir. Mağazaya dönüp yeni bir bağlantı isteyin.
          </p>
          <Link href={`/site/${slug}/store`} className="mt-6">
            <Button variant="outline">Mağazaya dön</Button>
          </Link>
        </main>
      </div>
    )
  }

  const vatLine = formatVatLine(summarizeVat(order.items), (cents) => formatPrice(cents, order.currency))
  const paid = order.payment_status === 'paid'
  const copy = orderStatusCopy({ status: order.status, paymentStatus: order.payment_status, paymentProvider: order.payment_provider, shippingStatus: order.shipping_status, carrier: order.carrier, trackingNumber: order.tracking_number, attention: order.attention }, order.language)
  const contactHref = safeStoreContactHref(order.store_base_url, order.has_contact_section, order.contact_email, slug)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-4 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          {copy.icon === 'success' ? (
            <CheckCircle2 className="size-14 text-accent" aria-hidden="true" />
          ) : copy.icon === 'failed' ? (
            <XCircle className="size-14 text-destructive" aria-hidden="true" />
          ) : (
            <Clock className="size-14 text-muted-foreground" aria-hidden="true" />
          )}
          <h1 className="font-display text-2xl font-bold text-balance">{copy.title}</h1>
          <p className="max-w-lg text-muted-foreground">
            {paid && order.language === 'tr'
              ? `Teşekkürler ${order.first_name}. Onay e-postası ${order.masked_email} adresine gönderilecek.`
              : paid
                ? `Thank you ${order.first_name}. A confirmation email will be sent to ${order.masked_email}.`
                : copy.description}
          </p>
          <p className="text-sm text-muted-foreground">
            Sipariş No: <span className="font-mono">{order.id.slice(0, 8).toUpperCase()}</span>
          </p>
        </div>

        {order.bank && <BankTransferInstructions data={order.bank} language={order.language} className="mt-8 p-6" />}
      {order.bank_missing && <BankTransferMissing language={order.language} className="mt-8 p-6" />}

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
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Ara toplam</span>
            <span className="font-medium">{formatPrice(order.subtotal_cents, order.currency)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Kargo</span>
            <span className="font-medium">
              {shippingRowValue(order.shipping_cents, (cents) => formatPrice(cents, order.currency))}
            </span>
          </div>
          {order.cod_fee_cents > 0 && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Kapıda ödeme ücreti</span>
              <span className="font-medium">{formatPrice(order.cod_fee_cents, order.currency)}</span>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">Toplam</span>
            <span className="font-display text-xl font-bold">
              {formatPrice(order.total_cents, order.currency)}
            </span>
          </div>
          {vatLine && <p className="mt-2 text-right text-xs text-muted-foreground">{vatLine}</p>}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={`/site/${slug}/store`}>
            <Button variant="outline"><Store className="mr-2 size-4" aria-hidden="true" />Alışverişe devam et</Button>
          </Link>
          {contactHref && (
            <a href={contactHref} target={contactHref.startsWith('mailto:') ? undefined : '_blank'} rel={contactHref.startsWith('mailto:') ? undefined : 'noreferrer'}>
              <Button><Mail className="mr-2 size-4" aria-hidden="true" />{order.language === 'en' ? 'Contact store' : 'Mağazayla iletişime geç'}</Button>
            </a>
          )}
        </div>
      </main>
    </div>
  )
}
