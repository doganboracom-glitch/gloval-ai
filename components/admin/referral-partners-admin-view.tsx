'use client'

import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ReferralAdminPartner } from '@/lib/referrals/partner-types'

type AdminLanguage = 'tr' | 'en'

const copyByLanguage: Record<
  AdminLanguage,
  {
    title: string
    description: string
    back: string
    records: string
    privacy: string
    empty: string
    referralCode: string
    email: string
    status: string
    joined: string
    iban: string
    clicks: string
    signups: string
    active: string
    suspended: string
    closed: string
  }
> = {
  tr: {
    title: 'Satış ortakları',
    description: 'Yönlendirme kayıtları ve toplam performans. Bu görünüm salt okunurdur.',
    back: 'Yönetim paneli',
    records: 'Ortaklık kayıtları',
    privacy: 'E-posta adresleri sunucu tarafında maskelenir; yalnızca IBAN’ın son 4 hanesi gösterilir.',
    empty: 'Henüz satış ortağı kaydı yok.',
    referralCode: 'Yönlendirme kodu',
    email: 'E-posta',
    status: 'Durum',
    joined: 'Katılım',
    iban: 'IBAN',
    clicks: 'Tıklama',
    signups: 'Kayıt',
    active: 'Aktif',
    suspended: 'Askıda',
    closed: 'Kapalı',
  },
  en: {
    title: 'Referral partners',
    description: 'Referral registrations and total performance. This view is read-only.',
    back: 'Admin dashboard',
    records: 'Partner records',
    privacy: 'Email addresses are masked server-side; only the last 4 IBAN digits are shown.',
    empty: 'No referral partners yet.',
    referralCode: 'Referral code',
    email: 'Email',
    status: 'Status',
    joined: 'Joined',
    iban: 'IBAN',
    clicks: 'Clicks',
    signups: 'Signups',
    active: 'Active',
    suspended: 'Suspended',
    closed: 'Closed',
  },
}

function formatDate(value: string, locale: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date)
}

function statusLabel(status: ReferralAdminPartner['status'], copy: (typeof copyByLanguage)['tr']): string {
  if (status === 'active') return copy.active
  if (status === 'suspended') return copy.suspended
  return copy.closed
}

export function ReferralPartnersAdminView({ partners }: { partners: ReferralAdminPartner[] }) {
  const { lang } = useLanguage()
  const language: AdminLanguage = lang === 'tr' ? 'tr' : 'en'
  const copy = copyByLanguage[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Link
          href="/admin"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {copy.back}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            {copy.records}
          </CardTitle>
          <CardDescription>{copy.privacy}</CardDescription>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="text-sm text-muted-foreground">{copy.empty}</p>
          ) : (
            <>
            <div className="flex flex-col gap-3 md:hidden">
              {partners.map((partner) => (
                <article key={partner.referralCode} className="rounded-xl border border-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs text-foreground">{partner.referralCode}</p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">{partner.maskedEmail}</p>
                    </div>
                    <Badge variant={partner.status === 'active' ? 'default' : 'secondary'}>
                      {statusLabel(partner.status, copy)}
                    </Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{copy.joined}</dt>
                      <dd className="mt-1">{formatDate(partner.activatedAt, locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{copy.iban}</dt>
                      <dd className="mt-1 font-mono text-xs">{partner.ibanLast4 ? `•••• ${partner.ibanLast4}` : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{copy.clicks}</dt>
                      <dd className="mt-1 tabular-nums">{partner.clicks.toLocaleString(locale)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{copy.signups}</dt>
                      <dd className="mt-1 tabular-nums">{partner.signups.toLocaleString(locale)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{copy.referralCode}</TableHead>
                    <TableHead>{copy.email}</TableHead>
                    <TableHead>{copy.status}</TableHead>
                    <TableHead>{copy.joined}</TableHead>
                    <TableHead>{copy.iban}</TableHead>
                    <TableHead className="text-right">{copy.clicks}</TableHead>
                    <TableHead className="text-right">{copy.signups}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => (
                    <TableRow key={partner.referralCode}>
                      <TableCell className="font-mono text-xs">{partner.referralCode}</TableCell>
                      <TableCell className="max-w-56 truncate">{partner.maskedEmail}</TableCell>
                      <TableCell>
                        <Badge variant={partner.status === 'active' ? 'default' : 'secondary'}>
                          {statusLabel(partner.status, copy)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(partner.activatedAt, locale)}</TableCell>
                      <TableCell className="font-mono text-xs">{partner.ibanLast4 ? `•••• ${partner.ibanLast4}` : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{partner.clicks.toLocaleString(locale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{partner.signups.toLocaleString(locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
