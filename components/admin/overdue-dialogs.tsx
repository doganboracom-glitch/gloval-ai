'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { addOverdueContactNote, grantGiftTime, markSubscriptionPaid } from '@/lib/admin/overdue-actions'
import { fillCopy, overdueT } from '@/lib/admin/overdue-copy'
import { GIFT_MONTH_OPTIONS } from '@/lib/admin/overdue-logic'
import { formatMoney } from '@/lib/billing-utils'
import type { OverdueRow } from '@/lib/admin/overdue-queries'

export type OverdueDialogMode = 'note' | 'paid' | 'gift' | 'history'

export function OverdueActionDialog({
  mode,
  row,
  onClose,
  onDone,
}: {
  mode: OverdueDialogMode
  row: OverdueRow
  onClose: () => void
  onDone: () => void
}) {
  const { lang } = useLanguage()
  const t = overdueT(lang)
  const titleId = useId()
  const [text, setText] = useState('')
  const [outcome, setOutcome] = useState('')
  const [promisedFor, setPromisedFor] = useState('')
  const [months, setMonths] = useState<number>(1)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // One token per opened dialog: a double click re-sends the same key and the server dedupes it.
  const idempotencyKey = useRef(crypto.randomUUID().replace(/-/g, '')).current

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'

  function submit() {
    setError(null)
    startTransition(async () => {
      try {
        const result =
          mode === 'note'
            ? await addOverdueContactNote({
                subscriptionId: row.subscriptionId,
                note: text,
                outcome: (outcome || null) as 'contacted' | 'unreachable' | 'promised' | null,
                promisedFor: promisedFor || null,
              })
            : mode === 'paid'
              ? await markSubscriptionPaid({ subscriptionId: row.subscriptionId, reason: text, idempotencyKey })
              : await grantGiftTime({ subscriptionId: row.subscriptionId, months, reason: text, idempotencyKey })
        if (!result.ok) {
          setError(t.errors[result.error] ?? t.errors.generic)
          return
        }
        onDone()
      } catch {
        setError(t.errors.generic)
      }
    })
  }

  const title = mode === 'note' ? t.note : mode === 'paid' ? t.paidTitle : mode === 'gift' ? t.giftTitle : t.history

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90svh] w-full max-w-md space-y-4 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div>
          <h3 id={titleId} className="font-display text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{row.email ?? row.userId}</p>
        </div>

        {mode === 'history' ? (
          <div className="space-y-4 text-sm">
            <section>
              <h4 className="mb-1 font-medium">{t.note}</h4>
              {row.notes.length === 0 ? <p className="text-muted-foreground">{t.noHistory}</p> : null}
              <ul className="space-y-2">
                {row.notes.map((n) => (
                  <li key={n.id} className="rounded-md border border-border p-2">
                    <div className="text-xs text-muted-foreground">
                      {dateFmt.format(new Date(n.createdAt))} · {n.adminEmail}
                      {n.outcome ? ` · ${t.outcome[n.outcome as keyof typeof t.outcome] ?? n.outcome}` : ''}
                      {n.promisedFor ? ` · ${n.promisedFor}` : ''}
                    </div>
                    <p className="text-pretty">{n.note}</p>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="mb-1 font-medium">{t.markPaid} / {t.gift}</h4>
              {row.audit.length === 0 ? <p className="text-muted-foreground">{t.noHistory}</p> : null}
              <ul className="space-y-2">
                {row.audit.map((a) => (
                  <li key={a.id} className="rounded-md border border-border p-2">
                    <div className="text-xs text-muted-foreground">
                      {dateFmt.format(new Date(a.createdAt))} · {a.adminEmail} · {a.action === 'gift' ? `${t.gift} (${a.months})` : formatMoney(a.amountCents, a.currency)}
                    </div>
                    <p className="text-pretty">{a.reason}</p>
                  </li>
                ))}
              </ul>
            </section>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            {mode === 'paid' ? (
              <p className="text-sm text-pretty text-muted-foreground">
                {fillCopy(t.paidBody, { plan: row.planName })}{' '}
                <strong className="text-foreground">{fillCopy(t.paidAmount, { amount: formatMoney(row.priceCents, row.currency) })}</strong>
              </p>
            ) : null}
            {mode === 'gift' ? (
              <>
                <p className="text-sm text-pretty text-muted-foreground">{t.giftBody}</p>
                <label className="block text-sm">
                  {t.giftMonths}
                  <select className={`${fieldClass} mt-1`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                    {GIFT_MONTH_OPTIONS.map((n) => (
                      <option key={n} value={n}>{fillCopy(t.giftMonthsOption, { n })}</option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {mode !== 'note' && row.providerManaged ? (
              <p role="alert" className="rounded-md border border-border bg-accent/10 p-2 text-xs text-pretty">
                {fillCopy(t.providerWarning, { provider: row.provider })}
              </p>
            ) : null}
            {mode === 'note' ? (
              <>
                <label className="block text-sm">
                  {t.outcomeLabel}
                  <select className={`${fieldClass} mt-1`} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                    <option value="">—</option>
                    {Object.entries(t.outcome).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </label>
                {outcome === 'promised' ? (
                  <label className="block text-sm">
                    {t.promisedFor}
                    <input type="date" className={`${fieldClass} mt-1`} value={promisedFor} onChange={(e) => setPromisedFor(e.target.value)} />
                  </label>
                ) : null}
              </>
            ) : null}
            <label className="block text-sm">
              {mode === 'note' ? t.noteLabel : t.reasonLabel}
              <textarea
                className={`${fieldClass} mt-1 min-h-24`}
                value={text}
                maxLength={mode === 'note' ? 1000 : 500}
                onChange={(e) => setText(e.target.value)}
                required
              />
            </label>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{t.cancel}</Button>
              <Button type="submit" disabled={pending || text.trim().length < (mode === 'note' ? 1 : 3)}>
                {pending ? t.working : mode === 'note' ? t.save : mode === 'paid' ? t.confirmPaid : t.confirmGift}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
