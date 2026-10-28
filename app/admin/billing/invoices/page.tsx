import { InvoicesView } from '@/components/admin/invoices-view'
import { listInvoiceRows } from '@/lib/invoices/service'
import { parseInvoiceFilters } from '@/lib/invoices/filter'

export const dynamic = 'force-dynamic'

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseInvoiceFilters(await searchParams)
  const result = await listInvoiceRows(filters)
  return <InvoicesView result={result} filters={filters} />
}
