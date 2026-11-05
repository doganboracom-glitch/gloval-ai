'use client'

import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import type { ReferralCustomer, ReferralCustomerStatus } from '@/lib/referrals/partner-types'

type DetailsCopy = {
  details: string
  customerCount: string
  customers: string
  noCustomers: string
  statuses: Record<ReferralCustomerStatus, string>
  date: string
  deleted: string
  deletedAccount: string
}

const COPY = {
  tr: {
    details: 'Ayrıntılar',
    customerCount: 'yönlendirilen müşteri',
    customers: 'Yönlendirilen müşteriler',
    noCustomers: 'Henüz yönlendirilen müşteri yok.',
    statuses: { signup: 'Kayıt oldu', verified: 'Doğrulandı', paid: 'Ücretli' },
    date: 'Kayıt tarihi',
    deleted: 'Üye tarafından silindi',
    deletedAccount: 'Silinmiş hesap',
  },
  en: {
    details: 'Details',
    customerCount: 'referred customers',
    customers: 'Referred customers',
    noCustomers: 'No referred customers yet.',
    statuses: { signup: 'Signed up', verified: 'Verified', paid: 'Paid' },
    date: 'Signup date',
    deleted: 'Deleted by member',
    deletedAccount: 'Deleted account',
  },
} satisfies Record<'tr' | 'en', DetailsCopy>

const STATUS_VARIANT: Record<ReferralCustomerStatus, 'secondary' | 'default'> = {
  signup: 'secondary',
  verified: 'secondary',
  paid: 'default',
}

export function ReferralCustomerDetails({ customers }: { customers: ReferralCustomer[] }) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const dateFormatter = new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
  })

  return (
    <details id="referral-customer-details" aria-label={copy.details} className="rounded-md border border-border/70">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-foreground marker:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        {copy.details}
        <span className="ms-2 font-normal text-muted-foreground">
          ({customers.length} {copy.customerCount})
        </span>
      </summary>
      <div className="border-t border-border px-3 py-3">
        {customers.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.noCustomers}</p>
        ) : (
          <ul aria-label={copy.customers} className="divide-y divide-border">
            {customers.map((customer) => (
              <li
                key={`${customer.maskedEmail}-${customer.createdAt}`}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="break-all text-sm font-medium text-foreground">
                  {customer.accountDeleted ? copy.deletedAccount : customer.maskedEmail}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="text-sm" variant={STATUS_VARIANT[customer.status]}>
                      {copy.statuses[customer.status]}
                    </Badge>
                    {customer.accountDeleted && (
                      <Badge className="text-sm" variant="outline">
                        {copy.deleted}
                      </Badge>
                    )}
                  </div>
                  <time
                    dateTime={customer.createdAt}
                    aria-label={`${copy.date}: ${dateFormatter.format(new Date(customer.createdAt))}`}
                    className="text-sm text-muted-foreground"
                  >
                    {dateFormatter.format(new Date(customer.createdAt))}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
