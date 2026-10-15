import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { modeHasTransactions } from '@/lib/commerce-mode'
import { getPublishedSiteCommerceMode } from '@/lib/commerce-mode-server'
import { CustomerAccount } from '@/components/store/customer-account'
import {
  getCurrentStoreCustomer,
  getStoreCustomerOrders,
} from '@/lib/store-customer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Hesabım',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ redirect?: string }>
}) {
  const { slug } = await params
  const { redirect } = await searchParams
  const site = await getPublishedSite(slug)
  if (!site) notFound()
  if (!modeHasTransactions(await getPublishedSiteCommerceMode(slug))) notFound()

  const customer = await getCurrentStoreCustomer(slug)
  const loaded = customer ? await getStoreCustomerOrders(slug) : []

  return (
    <CustomerAccount
      slug={slug}
      storeName={site.name}
      customer={customer}
      orders={loaded ?? []}
      ordersFailed={loaded === null}
      redirect={redirect}
    />
  )
}
