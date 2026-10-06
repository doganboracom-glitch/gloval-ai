'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Pencil } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { tenantUrl } from '@/lib/domains'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge } from '@/components/admin/admin-ui'
import type { AdminSite } from '@/lib/admin/queries'

type Filter = 'all' | 'published' | 'draft'

export function SitesView({ sites }: { sites: AdminSite[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sites.filter((s) => {
      if (filter === 'published' && !s.published) return false
      if (filter === 'draft' && s.published) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.ownerEmail ?? '').toLowerCase().includes(q) ||
        (s.slug ?? '').toLowerCase().includes(q)
      )
    })
  }, [sites, query, filter])

  const filters: Filter[] = ['all', 'published', 'draft']

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.sites.title} subtitle={t.sites.subtitle} />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.common.search}
          aria-label={t.common.search}
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-card/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        />
        <div className="flex gap-1 rounded-lg border border-border bg-card/70 p-1">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                'rounded-md px-3 py-1 text-xs font-medium transition-colors ' +
                (filter === f
                  ? 'bg-brand/15 text-brand'
                  : 'text-muted-foreground hover:text-foreground')
              }
            >
              {f === 'all' ? t.common.all : f === 'published' ? t.status.published : t.status.draft}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.common.empty}
        head={
          <>
            <Th>{t.sites.name}</Th>
            <Th>{t.common.owner}</Th>
            <Th>{t.sites.type}</Th>
            <Th>{t.common.status}</Th>
            <Th>{t.common.updated}</Th>
            <Th>{t.sites.url}</Th>
            <Th className="text-right">{t.common.actions}</Th>
          </>
        }
      >
        {filtered.map((s) => (
          <Tr key={s.id}>
            <Td className="font-medium">{s.name}</Td>
            <Td className="text-muted-foreground">
              {s.ownerEmail ? (
                <Link href={`/admin/users/${s.ownerId}`} className="hover:text-brand">
                  {s.ownerEmail}
                </Link>
              ) : (
                t.common.none
              )}
            </Td>
            <Td className="text-muted-foreground">
              {s.projectType === 'ecommerce' ? t.sites.ecommerce : t.sites.corporate}
            </Td>
            <Td>
              <StatusBadge tone={s.published ? 'success' : 'muted'}>
                {s.published ? t.status.published : t.status.draft}
              </StatusBadge>
            </Td>
            <Td className="whitespace-nowrap text-muted-foreground">
              {dateFmt.format(new Date(s.updatedAt))}
            </Td>
            <Td>
              {s.published && s.slug ? (
                <a
                  href={tenantUrl(s.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline"
                >
                  {`${s.slug}.gloval.site`}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : (
                <span className="text-muted-foreground">{t.common.none}</span>
              )}
            </Td>
            <Td className="text-right">
              <Link
                href={s.projectType === 'ecommerce' ? `/ecommerce/${s.id}` : `/editor/${s.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-brand/40 px-2.5 py-1 text-xs font-medium text-brand transition-colors hover:bg-brand/10"
              >
                <Pencil className="size-3.5" />
                {t.sites.edit}
              </Link>
            </Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  )
}
