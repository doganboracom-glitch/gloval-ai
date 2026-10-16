import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { modeHasTransactions } from '@/lib/commerce-mode'
import { getPublishedSiteCommerceMode } from '@/lib/commerce-mode-server'
import { CheckoutForm } from '@/components/store/checkout-form'
import { getStorePaymentMethods } from '@/lib/store'
import { getCurrentStoreCustomer } from '@/lib/store-customer'
import { getStoreShippingInfo } from '@/lib/store-shipping-settings'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getSiteBlogData } from '@/lib/blog-server'
import { companyForSite, resolveLegalDoc } from '@/lib/site-legal-docs'
import { sellerSummary } from '@/lib/company-profile'

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
  if (!modeHasTransactions(await getPublishedSiteCommerceMode(slug))) notFound()

  const { available, reason, methods, publicConfig, demo, guestCheckout, codFeeCents } = await getStorePaymentMethods(slug)
  const customer = await getCurrentStoreCustomer(slug)
  const shipping = await getStoreShippingInfo(slug)

  const docHref = (doc: string) =>
    resolveLegalDoc(doc, site.schema, site.name) ? `/site/${slug}/yasal/${doc}` : undefined
  const legalLinks = {
    sales: docHref('mesafeli-satis-sozlesmesi'),
    returns: docHref('teslimat-ve-iade'),
    kvkk: docHref('gizlilik-politikasi'),
  }
  const seller = sellerSummary(companyForSite(site.schema, site.name).seller)

  return (
    <StoreSiteShell site={site.schema} slug={slug} shipping={shipping} blog={await getSiteBlogData(slug)}>
      <CheckoutForm
        slug={slug}
        shipping={shipping}
        storeName={site.name}
        legalLinks={legalLinks}
        seller={seller}
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
                district: customer.district,
                postalCode: customer.postalCode,
                address: customer.address,
                invoice: customer.invoice,
              }
            : null
        }
      />
    </StoreSiteShell>
  )
}
