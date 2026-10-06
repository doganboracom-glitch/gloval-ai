'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { deleteUser, setUserStatus } from '@/lib/admin/actions'
import { Button } from '@/components/ui/button'
import { PageHeader, DataTable, Th, Td, Tr, StatusBadge } from '@/components/admin/admin-ui'
import type { AdminUser } from '@/lib/admin/queries'

type Filter = 'all' | 'active' | 'suspended'

export function UsersView({ users }: { users: AdminUser[] }) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (filter !== 'all' && u.status !== filter) return false
      if (!q) return true
      return (
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.fullName ?? '').toLowerCase().includes(q)
      )
    })
  }, [users, query, filter])

  function removeUser(u: AdminUser) {
    if (!window.confirm(t.users.deleteConfirm)) return
    setPendingId(u.id)
    startTransition(async () => {
      const result = await deleteUser(u.id)
      setPendingId(null)
      if (!result.ok) window.alert(result.error === 'cannot_delete_self' ? t.users.cannotDeleteSelf : t.users.deleteFailed)
      else router.refresh()
    })
  }

  function toggleStatus(u: AdminUser) {
    const next = u.status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && !confirm(t.users.suspendConfirm)) return
    setPendingId(u.id)
    startTransition(async () => {
      await setUserStatus(u.id, next)
      setPendingId(null)
      router.refresh()
    })
  }

  const filters: Filter[] = ['all', 'active', 'suspended']

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.users.title} subtitle={t.users.subtitle} />

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
              {f === 'all' ? t.common.all : f === 'active' ? t.status.active : t.status.suspended}
            </button>
          ))}
        </div>
      </div>

      <DataTable
        isEmpty={filtered.length === 0}
        empty={t.common.empty}
        head={
          <>
            <Th>{t.users.email}</Th>
            <Th>{t.users.plan}</Th>
            <Th className="text-right">{t.users.credits}</Th>
            <Th className="text-right">{t.users.sites}</Th>
            <Th>{t.common.created}</Th>
            <Th>{t.common.status}</Th>
            <Th className="text-right">{t.common.actions}</Th>
          </>
        }
      >
        {filtered.map((u) => (
          <Tr key={u.id}>
            <Td>
              <Link href={`/admin/users/${u.id}`} className="font-medium hover:text-brand">
                {u.email ?? t.common.none}
              </Link>
              {u.fullName ? (
                <span className="block text-xs text-muted-foreground">{u.fullName}</span>
              ) : null}
            </Td>
            <Td className="text-muted-foreground">
              {u.planName ?? t.users.noPlan}
              {u.subscriptionStatus && u.subscriptionStatus !== 'active' ? (
                <span className="ml-1 text-xs">({u.subscriptionStatus})</span>
              ) : null}
              {u.periodEnd ? (
                <span className="block text-xs">
                  {new Date(u.periodEnd).toLocaleDateString('tr-TR')} tarihine kadar
                </span>
              ) : null}
            </Td>
            <Td className="text-right tabular-nums">{u.creditBalance.toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')}</Td>
            <Td className="text-right tabular-nums">{u.siteCount}</Td>
            <Td className="text-muted-foreground whitespace-nowrap">{dateFmt.format(new Date(u.createdAt))}</Td>
            <Td>
              <StatusBadge tone={u.status === 'active' ? 'success' : 'muted'}>
                {u.status === 'active' ? t.status.active : t.status.suspended}
              </StatusBadge>
            </Td>
              <Td className="text-right">
              <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant={u.status === 'active' ? 'outline' : 'default'}
                disabled={pendingId === u.id}
                onClick={() => toggleStatus(u)}
              >
                {pendingId === u.id
                  ? t.common.loading
                  : u.status === 'active'
                    ? t.users.suspend
                    : t.users.activate}
              </Button>
              <Button size="sm" variant="destructive" disabled={pendingId === u.id} onClick={() => removeUser(u)}>
                {t.users.delete}
              </Button>
              </div>
            </Td>
          </Tr>
        ))}
      </DataTable>
    </div>
  )
}
