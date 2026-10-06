'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Panel, DataTable, Th, Td, Tr, StatusBadge } from '@/components/admin/admin-ui'
import { changeUserPlan, setUserSiteLimitOverride, setUserPeriodEnd } from '@/lib/admin/actions'
import { SITE_LIMITS, PAGE_LIMITS, PRODUCT_LIMITS } from '@/lib/pricing-config'
import type { AdminPackageDetail, AdminUser } from '@/lib/admin/queries'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { fmt } from '@/lib/admin/package-i18n'

const input =
  'h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/50'

function fmtMoney(lang: string, cents: number, currency: string) {
  return new Intl.NumberFormat(lang, { style: 'currency', currency: currency || 'TRY' }).format(cents / 100)
}

function fmtDate(lang: string, value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(lang, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function toLocalInput(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 16)
}

function summarize(v: unknown, lang: string, none: string): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if ('plan_name' in o) return String(o.plan_name ?? '—')
    if ('site_limit' in o) return o.site_limit == null ? none : `${o.site_limit}${o.expires_at ? ` (→ ${fmtDate(lang, String(o.expires_at))})` : ''}`
    return JSON.stringify(v)
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDate(lang, v)
  return String(v)
}

export function PackageManager({ user, detail }: { user: AdminUser; detail: AdminPackageDetail }) {
  const router = useRouter()
  const { lang } = useLanguage()
  const p = adminT(lang).pkg
  const date = (v: string | null | undefined) => fmtDate(lang, v)
  const sub = detail.subscription
  const planKey = (user.planCode ?? 'free') as keyof typeof SITE_LIMITS
  const planSiteLimit = SITE_LIMITS[planKey] ?? SITE_LIMITS.free
  const effectiveSiteLimit = detail.override?.siteLimit ?? planSiteLimit
  const providerBacked = Boolean(sub && sub.provider !== 'mock' && sub.providerRef)

  const [planId, setPlanId] = useState('')
  const [planReason, setPlanReason] = useState('')
  const [ack, setAck] = useState(false)
  const [limitValue, setLimitValue] = useState(detail.override ? String(detail.override.siteLimit) : '')
  const [limitExpiry, setLimitExpiry] = useState(toLocalInput(detail.override?.expiresAt))
  const [limitReason, setLimitReason] = useState(detail.override?.reason ?? '')
  const [periodEnd, setPeriodEnd] = useState(toLocalInput(sub?.currentPeriodEnd))
  const [periodReason, setPeriodReason] = useState('')
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [pending, start] = useTransition()
  const keys = useRef({ plan: crypto.randomUUID(), limit: crypto.randomUUID(), period: crypto.randomUUID() })

  function report(res: { ok: boolean; error?: string }, success: string, k: 'plan' | 'limit' | 'period') {
    if (res.ok) {
      keys.current[k] = crypto.randomUUID()
      setNotice({ tone: 'ok', text: success })
      router.refresh()
    } else {
      setNotice({ tone: 'err', text: p.err[res.error ?? ''] ?? p.err.generic })
    }
  }

  function submitPlan(e: React.FormEvent) {
    e.preventDefault()
    const target = detail.plans.find((p) => p.id === planId)
    if (!target) return
    const ok = window.confirm(
      fmt(p.confirmPlan, { email: user.email ?? p.userFallback, from: sub?.planName ?? p.none, to: target.name }),
    )
    if (!ok) return
    setNotice(null)
    start(async () => {
      const res = await changeUserPlan({
        userId: user.id,
        planId,
        reason: planReason,
        acknowledgeNoPaymentSync: ack,
        idempotencyKey: keys.current.plan,
      })
      report(res, p.okPlan, 'plan')
      if (res.ok) {
        setPlanId('')
        setPlanReason('')
        setAck(false)
      }
    })
  }

  function submitLimit(e: React.FormEvent, clear = false) {
    e.preventDefault()
    setNotice(null)
    start(async () => {
      const res = await setUserSiteLimitOverride({
        userId: user.id,
        siteLimit: clear ? null : Number(limitValue),
        expiresAt: clear || !limitExpiry ? null : new Date(limitExpiry).toISOString(),
        reason: limitReason,
        idempotencyKey: keys.current.limit,
      })
      report(res, clear ? p.okCleared : p.okLimit, 'limit')
      if (res.ok && clear) {
        setLimitValue('')
        setLimitExpiry('')
        setLimitReason('')
      }
    })
  }

  function submitPeriod(e: React.FormEvent) {
    e.preventDefault()
    if (!window.confirm(p.confirmPeriod)) return
    setNotice(null)
    start(async () => {
      const res = await setUserPeriodEnd({
        userId: user.id,
        periodEnd: periodEnd ? new Date(periodEnd).toISOString() : null,
        reason: periodReason,
        idempotencyKey: keys.current.period,
      })
      report(res, p.okPeriod, 'period')
      if (res.ok) setPeriodReason('')
    })
  }

  const overLimit = detail.publishedCount > effectiveSiteLimit

  return (
    <div className="flex flex-col gap-6">
      <div role="note" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground">
        <p className="font-medium">{p.internalOnlyTitle}</p>
        <p className="mt-1 text-muted-foreground">{p.internalOnlyBody}</p>
        {providerBacked ? (
          <p className="mt-2 font-medium text-amber-600 dark:text-amber-400">{fmt(p.liveWarning, { provider: sub?.provider ?? '' })}</p>
        ) : null}
      </div>
      <Panel title={p.planTitle} className="p-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Item label={p.plan} value={sub?.planName ?? p.noSub} />
          <Item label={p.status} value={sub ? `${sub.status}${sub.cancelAtPeriodEnd ? ` (${p.cancelAtEnd})` : ''}` : '—'} />
          <Item label={p.provider} value={sub ? `${sub.provider}${providerBacked ? ` (${p.liveSub})` : ''}` : '—'} />
          <Item label={p.period} value={sub ? `${date(sub.currentPeriodStart)} → ${date(sub.currentPeriodEnd)}` : '—'} />
          <Item label={p.siteLimit} value={`${detail.publishedCount} / ${effectiveSiteLimit}${detail.override ? ` (${p.exception})` : ''}`} />
          <Item label={p.pageLimit} value={String(PAGE_LIMITS[planKey] ?? PAGE_LIMITS.free)} />
          <Item label={p.productLimit} value={PRODUCT_LIMITS[planKey] === null ? '—' : String(PRODUCT_LIMITS[planKey])} />
          <Item label={p.pendingTransition} value={sub?.pendingPlanId ? p.pendingYes : p.none} />
        </dl>
        {overLimit ? (
          <p className="mt-3 text-xs text-muted-foreground">{p.overLimit}</p>
        ) : null}
        {notice ? (
          <p role="status" className={'mt-3 text-sm ' + (notice.tone === 'ok' ? 'text-brand' : 'text-destructive')}>
            {notice.text}
          </p>
        ) : null}
      </Panel>

      <Panel title={p.changeTitle} className="p-4">
        <form onSubmit={submitPlan} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {p.newPlan}
              <select required value={planId} onChange={(e) => setPlanId(e.target.value)} className={input + ' min-w-56'}>
                <option value="">{p.choose}</option>
                {detail.plans.map((pl) => (
                  <option key={pl.id} value={pl.id} disabled={pl.id === sub?.planId}>
                    {pl.name} — {pl.priceCents === 0 ? p.free : `${fmtMoney(lang, pl.priceCents, pl.currency)} / ${pl.interval === 'year' ? p.perYear : p.perMonth}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              {p.reasonOptional}
              <input value={planReason} onChange={(e) => setPlanReason(e.target.value)} maxLength={300} className={input} />
            </label>
            <Button type="submit" disabled={pending || !planId || (providerBacked && !ack)}>
              {p.apply}
            </Button>
          </div>
          {providerBacked ? (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
              <span>{fmt(p.ack, { provider: sub?.provider ?? '' })}</span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">{p.immediate}</p>
          )}
        </form>
      </Panel>

      <Panel title={p.limitTitle} className="p-4">
        <form onSubmit={(e) => submitLimit(e)} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {fmt(p.limitLabel, { n: planSiteLimit })}
            <input type="number" min={0} max={100} required value={limitValue} onChange={(e) => setLimitValue(e.target.value)} className={input + ' w-32'} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {p.expiryLabel}
            <input type="datetime-local" value={limitExpiry} onChange={(e) => setLimitExpiry(e.target.value)} className={input} />
          </label>
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
            {p.reason}
            <input required value={limitReason} onChange={(e) => setLimitReason(e.target.value)} maxLength={300} className={input} />
          </label>
          <Button type="submit" disabled={pending}>{p.save}</Button>
          {detail.override ? (
            <Button type="button" variant="outline" disabled={pending} onClick={(e) => submitLimit(e as unknown as React.FormEvent, true)}>
              {p.clear}
            </Button>
          ) : null}
        </form>
        {detail.override ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {fmt(p.activeOverride, {
              n: detail.override.siteLimit,
              until: detail.override.expiresAt ? fmt(p.untilDate, { date: date(detail.override.expiresAt) }) : p.indefinite,
              by: detail.override.updatedBy,
            })}
          </p>
        ) : null}
      </Panel>

      {sub && sub.status !== 'incomplete' ? (
        <Panel title={p.periodTitle} className="p-4">
          <form onSubmit={submitPeriod} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {p.periodLabel}
              <input type="datetime-local" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={input} />
            </label>
            <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-muted-foreground">
              {p.reason}
              <input required value={periodReason} onChange={(e) => setPeriodReason(e.target.value)} maxLength={300} className={input} />
            </label>
            <Button type="submit" variant="outline" disabled={pending}>{p.update}</Button>
          </form>
        </Panel>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-sm font-semibold">{p.payHistory}</h3>
        <DataTable
          isEmpty={detail.transactions.length === 0}
          empty={p.noPay}
          head={
            <>
              <Th>{p.colDate}</Th>
              <Th>{p.colAction}</Th>
              <Th>{p.colStatus}</Th>
              <Th className="text-end">{p.colAmount}</Th>
            </>
          }
        >
          {detail.transactions.map((tx) => (
            <Tr key={tx.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{date(tx.createdAt)}</Td>
              <Td>
                {tx.kind} <span className="text-muted-foreground">· {tx.provider}{tx.description ? ` · ${tx.description}` : ''}</span>
              </Td>
              <Td>
                <StatusBadge tone={tx.status === 'succeeded' ? 'success' : tx.status === 'failed' ? 'danger' : 'muted'}>{tx.status}</StatusBadge>
              </Td>
              <Td className="text-end tabular-nums">{fmtMoney(lang, tx.amountCents, tx.currency)}</Td>
            </Tr>
          ))}
        </DataTable>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-display text-sm font-semibold">{p.adminHistory}</h3>
        <DataTable
          isEmpty={detail.audit.length === 0}
          empty={p.noAudit}
          head={
            <>
              <Th>{p.colDate}</Th>
              <Th>{p.colAction}</Th>
              <Th>{p.colOldNew}</Th>
              <Th>{p.colAdminReason}</Th>
            </>
          }
        >
          {detail.audit.map((a) => (
            <Tr key={a.id}>
              <Td className="whitespace-nowrap text-muted-foreground">{date(a.createdAt)}</Td>
              <Td>
                {p.act[a.action as keyof typeof p.act] ?? a.action}
                {a.status !== 'success' ? (
                  <StatusBadge tone="danger">{a.status === 'blocked' ? p.blocked : p.failed}</StatusBadge>
                ) : null}
              </Td>
              <Td className="text-muted-foreground">
                {summarize(a.oldValue, lang, p.none)} → {summarize(a.newValue, lang, p.none)}
                {a.error ? <span className="block text-xs text-destructive">{p.err[a.error] ?? a.error}</span> : null}
              </Td>
              <Td className="text-muted-foreground">
                {a.adminEmail}
                {a.reason ? <span className="block text-xs">{a.reason}</span> : null}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </section>
    </div>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}
