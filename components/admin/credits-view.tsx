'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { grantCredits } from '@/lib/admin/actions'
import { Button } from '@/components/ui/button'
import { PageHeader, StatCard, Panel, DataTable, Th, Td, Tr } from '@/components/admin/admin-ui'
import { CreditKindBadge } from '@/components/admin/credit-kind-badge'
import type { AdminCreditUser, AdminCreditTx } from '@/lib/admin/queries'

export function CreditsView({
  users,
  recent,
  totalGifted,
}: {
  users: AdminCreditUser[]
  recent: AdminCreditTx[]
  totalGifted: number
}) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const dtFmt = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  // Resolve the typed email to a known user id (grantCredits needs an id).
  const emailToId = useMemo(() => {
    const map = new Map<string, string>()
    for (const u of users) if (u.email) map.set(u.email.toLowerCase(), u.userId)
    return map
  }, [users])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const userId = emailToId.get(email.trim().toLowerCase())
    if (!userId) {
      setMessage({ ok: false, text: t.credits.userNotFound })
      return
    }
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed === 0) return
    startTransition(async () => {
      const res = await grantCredits({ userId, amount: parsed, reason })
      if (res.ok) {
        setEmail('')
        setAmount('')
        setReason('')
        setMessage({ ok: true, text: t.credits.granted })
        router.refresh()
      } else {
        setMessage({
          ok: false,
          text: res.error === 'user_not_found' ? t.credits.userNotFound : t.credits.grantFailed,
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.credits.title} subtitle={t.credits.subtitle} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label={t.credits.totalGifted} value={totalGifted.toLocaleString(locale)} />
        <StatCard label={t.users.title} value={users.length} />
      </dl>

      <Panel title={t.credits.grantTitle} className="p-4">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {t.credits.grantUser}
            <input
              type="email"
              list="credit-user-emails"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-9 min-w-[14rem] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
            <datalist id="credit-user-emails">
              {users.map((u) => (u.email ? <option key={u.userId} value={u.email} /> : null))}
            </datalist>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.credits.grantAmount}
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="h-9 w-32 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {t.credits.grantReason}
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-9 min-w-[12rem] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? t.common.loading : t.credits.grant}
          </Button>
          {message ? (
            <p className={'w-full text-xs ' + (message.ok ? 'text-brand' : 'text-destructive')}>
              {message.text}
            </p>
          ) : null}
        </form>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-sm font-semibold">{t.credits.balance}</h3>
          <DataTable
            isEmpty={users.length === 0}
            empty={t.common.empty}
            head={
              <>
                <Th>{t.users.email}</Th>
                <Th className="text-right">{t.credits.gifted}</Th>
                <Th className="text-right">{t.credits.balance}</Th>
              </>
            }
          >
            {users.map((u) => (
              <Tr key={u.userId}>
                <Td>
                  <Link href={`/admin/users/${u.userId}`} className="font-medium hover:text-brand">
                    {u.email ?? t.common.none}
                  </Link>
                </Td>
                <Td className="text-right tabular-nums text-muted-foreground">
                  {u.gifted.toLocaleString(locale)}
                </Td>
                <Td className="text-right font-medium tabular-nums">{u.balance.toLocaleString(locale)}</Td>
              </Tr>
            ))}
          </DataTable>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="font-display text-sm font-semibold">{t.credits.recent}</h3>
          <DataTable
            isEmpty={recent.length === 0}
            empty={t.common.empty}
            head={
              <>
                <Th>{t.common.created}</Th>
                <Th>{t.users.email}</Th>
                <Th className="text-right">{t.credits.amount}</Th>
              </>
            }
          >
            {recent.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap text-muted-foreground">{dtFmt.format(new Date(c.createdAt))}</Td>
                <Td>
                  <Link href={`/admin/users/${c.userId}`} className="hover:text-brand">
                    {c.userEmail ?? t.common.none}
                  </Link>
                  <span className="ml-2 inline-flex">
                    <CreditKindBadge kind={c.kind} />
                  </span>
                </Td>
                <Td className={'text-right font-medium tabular-nums ' + (c.amount >= 0 ? 'text-brand' : 'text-destructive')}>
                  {c.amount >= 0 ? '+' : ''}
                  {c.amount.toLocaleString(locale)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </section>
      </div>
    </div>
  )
}
