import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getPublishedSite } from '@/lib/projects'
import { CustomerAccount } from '@/components/store/customer-account'
import {
  getCurrentStoreCustomer,
  getStoreCustomerOrders,
} from '@/lib/store-customer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Hesabım' }

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

  const customer = await getCurrentStoreCustomer(slug)
  const orders = customer ? await getStoreCustomerOrders(slug) : []

  return (
    <CustomerAccount
      slug={slug}
      storeName={site.name}
      customer={customer}
      orders={orders}
      redirect={redirect}
    />
  )
}
