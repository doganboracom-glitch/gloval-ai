import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { CheckoutForm } from '@/components/store/checkout-form'
import { getStorePaymentMethods } from '@/lib/store'
import { getCurrentStoreCustomer } from '@/lib/store-customer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Ödeme' }

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const site = await getPublishedSite(slug)
  if (!site) notFound()

  const { available, reason, methods, publicConfig } = await getStorePaymentMethods(slug)
  const customer = await getCurrentStoreCustomer(slug)

  return (
    <CheckoutForm
      slug={slug}
      storeName={site.name}
      paymentUnavailableReason={available ? null : (reason ?? 'not_configured')}
      methods={methods}
      publicConfig={publicConfig}
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
  )
}
