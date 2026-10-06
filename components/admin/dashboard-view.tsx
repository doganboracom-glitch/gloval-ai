'use client'

import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { formatMoney } from '@/lib/billing-utils'
import { tenantUrl } from '@/lib/domains'
import { PageHeader, StatCard, Panel, StatusBadge } from '@/components/admin/admin-ui'
import type { AdminOverview } from '@/lib/admin/queries'

export function DashboardView({ overview }: { overview: AdminOverview }) {
  const { lang } = useLanguage()
  const t = adminT(lang)

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t.nav.dashboard} subtitle={t.dashboard.subtitle} />

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t.dashboard.users}
          value={overview.userCount}
          hint={`${overview.activeUserCount} ${t.dashboard.activeUsers}`}
        />
        <StatCard
          label={t.dashboard.sites}
          value={overview.siteCount}
          hint={`${overview.publishedSiteCount} ${t.dashboard.publishedSites}`}
        />
        <StatCard
          label={t.dashboard.mrr}
          value={formatMoney(overview.monthlyRecurringCents, 'TRY')}
          hint={`${overview.activeSubscriptions} ${t.dashboard.activeSubs}`}
        />
        <StatCard label={t.dashboard.openTickets} value={overview.openTickets} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.dashboard.recentUsers}>
          <ul className="divide-y divide-border/60">
            {overview.recentUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <Link
                  href={`/admin/users/${u.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand"
                >
                  {u.email ?? u.fullName ?? u.id.slice(0, 8)}
                </Link>
                <StatusBadge tone={u.status === 'active' ? 'success' : 'muted'}>
                  {u.status === 'active' ? t.status.active : t.status.suspended}
                </StatusBadge>
              </li>
            ))}
            {overview.recentUsers.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t.common.empty}
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel title={t.dashboard.recentSites}>
          <ul className="divide-y divide-border/60">
            {overview.recentSites.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  {s.published && s.slug ? (
                    <a
                      href={tenantUrl(s.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-xs text-muted-foreground hover:text-brand"
                    >
                      {`${s.slug}.gloval.site`}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground">{dateFmt.format(new Date(s.createdAt))}</p>
                  )}
                </div>
                <StatusBadge tone={s.published ? 'success' : 'muted'}>
                  {s.published ? t.status.published : t.status.draft}
                </StatusBadge>
              </li>
            ))}
            {overview.recentSites.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t.common.empty}
              </li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
