import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { CheckoutForm } from '@/components/store/checkout-form'
import { getStorePaymentMethods } from '@/lib/store'
import { getCurrentStoreCustomer } from '@/lib/store-customer'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'
import { StoreSiteShell } from '@/components/store/store-site-shell'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ödeme',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  const { available, reason, methods, publicConfig, demo, guestCheckout, codFeeCents } = await getStorePaymentMethods(slug)
  const customer = await getCurrentStoreCustomer(slug)
  const shipping = await getStoreShippingInfo(slug)

  return (
    <StoreSiteShell site={site.schema} slug={slug} shipping={shipping}>
      <CheckoutForm
        slug={slug}
        shipping={shipping}
        storeName={site.name}
        paymentUnavailableReason={available ? null : (reason ?? 'not_configured')}
        methods={methods}
        publicConfig={publicConfig}
        demo={demo}
        guestCheckout={guestCheckout}
        codFeeCents={codFeeCents}
        customer={
          customer
            ? {
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                city: customer.city,
                address: customer.address,
                invoice: customer.invoice,
              }
            : null
        }
      />
    </StoreSiteShell>
  )
}
