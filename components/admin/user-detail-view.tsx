'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { deleteUser, sendUserPasswordReset, setUserPassword, setUserStatus, grantCredits } from '@/lib/admin/actions'
import { tenantUrl } from '@/lib/domains'
import { Button } from '@/components/ui/button'
import { PageHeader, StatCard, Panel, DataTable, Th, Td, Tr, StatusBadge } from '@/components/admin/admin-ui'
import { CreditKindBadge } from '@/components/admin/credit-kind-badge'
import type { AdminUser, AdminSite, AdminCreditTx } from '@/lib/admin/queries'

export function UserDetailView({
  user,
  sites,
  credits,
  packageSection,
}: {
  user: AdminUser
  sites: AdminSite[]
  credits: AdminCreditTx[]
  packageSection?: React.ReactNode
}) {
  const grantKey = useRef(crypto.randomUUID())
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [statusPending, startStatus] = useTransition()
  const [grantPending, startGrant] = useTransition()
  const [resetPending, startReset] = useTransition()
  const [deletePending, startDelete] = useTransition()

  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const dtFmt = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  function toggleStatus() {
    const next = user.status === 'active' ? 'suspended' : 'active'
    if (next === 'suspended' && !confirm(t.users.suspendConfirm)) return
    startStatus(async () => {
      await setUserStatus(user.id, next)
      router.refresh()
    })
  }

  function sendResetLink() {
    if (!user.email || !window.confirm(`${user.email}\n\n${t.users.resetConfirm}`)) return
    setMessage(null)
    startReset(async () => {
      const result = await sendUserPasswordReset(user.id)
      setMessage(result.ok ? t.users.resetSent : t.users.resetFailed)
    })
  }

  function confirmDelete() {
    startDelete(async () => {
      const result = await deleteUser(user.id)
      if (result.ok) {
        router.push('/admin/users')
        router.refresh()
      } else {
        setDeleteModalOpen(false)
        setMessage(t.users.deleteFailed)
      }
    })
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    startGrant(async () => {
      const result = await setUserPassword({ userId: user.id, password, passwordConfirmation })
      if (result.ok) {
        setPassword('')
        setPasswordConfirmation('')
        setMessage(t.users.passwordUpdated)
      } else {
        setMessage(result.error === 'password_mismatch' ? t.users.passwordMismatch : result.error === 'password_too_short' ? t.users.passwordTooShort : t.users.passwordFailed)
      }
    })
  }

  function submitGrant(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const parsed = Number(amount)
    if (!Number.isFinite(parsed) || parsed === 0) return
    startGrant(async () => {
      const res = await grantCredits({ userId: user.id, amount: parsed, reason, idempotencyKey: grantKey.current })
      if (res.ok) {
        grantKey.current = crypto.randomUUID()
        setAmount('')
        setReason('')
        setMessage(t.credits.granted)
        router.refresh()
      } else {
        setMessage(
          res.error === 'user_not_found'
            ? t.credits.userNotFound
            : res.error === 'insufficient_balance'
              ? 'Düşülecek miktar mevcut bakiyeden fazla.'
              : res.error === 'reason_required'
                ? 'Gerekçe zorunludur.'
                : t.credits.grantFailed,
        )
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.users.title}
      </Link>

      <PageHeader
        title={user.email ?? user.fullName ?? t.users.detailTitle}
        subtitle={user.fullName ?? undefined}
        action={
          <Button
            variant={user.status === 'active' ? 'outline' : 'default'}
            disabled={statusPending}
            onClick={toggleStatus}
          >
            {statusPending
              ? t.common.loading
              : user.status === 'active'
                ? t.users.suspend
                : t.users.activate}
          </Button>
        }
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={t.common.status} value={user.status === 'active' ? t.status.active : t.status.suspended} />
        <StatCard label={t.users.plan} value={user.planName ?? t.users.noPlan} />
        <StatCard label={t.users.credits} value={user.creditBalance.toLocaleString(locale)} />
        <StatCard label={t.users.sites} value={user.siteCount} />
      </dl>

      {packageSection}

      <Panel title={t.users.securityTitle} className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setPasswordModalOpen(true)}>
            {t.users.setPassword}
          </Button>
          <Button type="button" variant="outline" disabled={resetPending || !user.email} onClick={sendResetLink}>
            {resetPending ? t.common.loading : t.users.sendReset}
          </Button>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </div>
        {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}
      </Panel>

      <Panel title={t.users.accountManagement ?? 'Hesap Yönetimi'} className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">{t.users.deleteConfirm}</p>
        <Button type="button" variant="destructive" onClick={() => setDeleteModalOpen(true)}>
          {t.users.delete ?? 'Kullanıcıyı Sil'}
        </Button>
      </Panel>

      {passwordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="password-dialog-title">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl">
            <h2 id="password-dialog-title" className="text-lg font-semibold text-foreground">{t.users.passwordTitle}</h2>
            <form onSubmit={(event) => { submitPassword(event); if (password && password === passwordConfirmation) setPasswordModalOpen(false) }} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">{t.users.newPassword}<input autoFocus type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50" /></label>
              <label className="flex flex-col gap-1.5 text-sm text-muted-foreground">{t.users.confirmPassword}<input type="password" minLength={8} required value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50" /></label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setPasswordModalOpen(false)}>{t.common.cancel ?? 'İptal'}</Button>
                <Button type="submit" disabled={grantPending}>{grantPending ? t.common.loading : t.users.updatePassword ?? t.users.setPassword}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-6 shadow-2xl">
            <h2 id="delete-dialog-title" className="text-lg font-semibold text-foreground">{t.users.delete ?? 'Kullanıcıyı Sil'}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t.users.deleteConfirm}</p>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteModalOpen(false)}>{t.common.cancel ?? 'İptal'}</Button>
              <Button type="button" variant="destructive" disabled={deletePending} onClick={confirmDelete}>{deletePending ? t.common.loading : t.users.delete ?? 'Kullanıcıyı Sil'}</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Panel title={t.credits.grantTitle} className="p-4">
        <form onSubmit={submitGrant} className="flex flex-wrap items-end gap-3">
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
              required
              maxLength={300}
              className="h-9 min-w-[12rem] rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            />
          </label>
          <Button type="submit" disabled={grantPending}>
            {grantPending ? t.common.loading : t.credits.grant}
          </Button>
          {message ? <p className="w-full text-xs text-muted-foreground">{message}</p> : null}
        </form>
      </Panel>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-sm font-semibold">{t.users.userSites}</h3>
        <DataTable
          isEmpty={sites.length === 0}
          empty={t.common.empty}
          head={
            <>
              <Th>{t.sites.name}</Th>
              <Th>{t.common.status}</Th>
              <Th>{t.sites.url}</Th>
            </>
          }
        >
          {sites.map((s) => (
            <Tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td>
                <StatusBadge tone={s.published ? 'success' : 'muted'}>
                  {s.published ? t.status.published : t.status.draft}
                </StatusBadge>
              </Td>
              <Td>
                {s.published && s.slug ? (
                  <a
                    href={tenantUrl(s.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-brand"
                  >
                    {`${s.slug}.gloval.site`}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t.common.none}</span>
                )}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-sm font-semibold">{t.users.ledger}</h3>
        <DataTable
          isEmpty={credits.length === 0}
          empty={t.common.empty}
          head={
            <>
              <Th>{t.common.created}</Th>
              <Th>{t.credits.reason}</Th>
              <Th className="text-right">{t.credits.amount}</Th>
            </>
          }
        >
          {credits.map((c) => (
            <Tr key={c.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{dtFmt.format(new Date(c.createdAt))}</Td>
              <Td>
                <CreditKindBadge kind={c.kind} />
                {c.reason ? <span className="ml-2 text-muted-foreground">{c.reason}</span> : null}
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
  )
}
