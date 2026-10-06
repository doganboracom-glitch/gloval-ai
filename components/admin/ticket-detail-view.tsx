'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Paperclip } from 'lucide-react'
import type { TicketStatus } from '@/lib/support/constants'
import { useLanguage } from '@/components/language-provider'
import { adminT } from '@/lib/admin/i18n'
import { replyToTicket, setTicketStatus } from '@/lib/admin/actions'
import { Button } from '@/components/ui/button'
import { PageHeader, Panel } from '@/components/admin/admin-ui'
import { TicketStatusPill } from '@/components/support/ticket-status-pill'
import { cn } from '@/lib/utils'
import type { AdminTicket, AdminTicketMessage } from '@/lib/admin/queries'

const STATUS_ACTIONS: TicketStatus[] = ['in_progress', 'waiting_user', 'resolved']

export function TicketDetailView({
  ticket,
  messages,
}: {
  ticket: AdminTicket
  messages: AdminTicketMessage[]
}) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const router = useRouter()
  const [body, setBody] = useState('')
  const [replyPending, startReply] = useTransition()
  const [statusPending, startStatus] = useTransition()

  const dtFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  function submitReply(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    startReply(async () => {
      const res = await replyToTicket({ ticketId: ticket.id, body })
      if (res.ok) {
        setBody('')
        router.refresh()
      }
    })
  }

  function changeStatus(status: TicketStatus) {
    startStatus(async () => {
      await setTicketStatus(ticket.id, status)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/support"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t.support.title}
      </Link>

      <PageHeader
        title={ticket.subject}
        subtitle={ticket.userEmail ?? undefined}
        action={
<TicketStatusPill
          status={ticket.status}
          label={(t.status as Record<string, string>)[ticket.status]}
        />
        }
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_ACTIONS.filter((s) => s !== ticket.status).map((s) => (
          <Button key={s} size="sm" variant="outline" disabled={statusPending} onClick={() => changeStatus(s)}>
            {(t.status as Record<string, string>)[s]}
          </Button>
        ))}
        {ticket.status === 'resolved' ? (
          <Button size="sm" variant="outline" disabled={statusPending} onClick={() => changeStatus('open')}>
            {t.support.markOpen}
          </Button>
        ) : null}
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {ticket.ticketNumber} · {ticket.department}
        {ticket.service ? ` · ${ticket.service}` : ''}
        {ticket.projectName ? ` · ${ticket.projectName}` : ''}
      </p>

      <Panel title={t.support.thread} className="p-4">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t.common.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => {
              const isAdmin = m.authorType === 'admin'
              return (
                <li
                  key={m.id}
                  className={cn('flex flex-col gap-1', isAdmin ? 'items-end' : 'items-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
                      isAdmin ? 'bg-brand/15 text-foreground' : 'bg-muted text-foreground',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    {m.attachments.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1">
                        {m.attachments.map((a) => (
                          <li key={a.id}>
                            <a
                              href={`/api/support/attachments/${a.id}`}
                              className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                            >
                              <Paperclip className="size-3" />
                              {a.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {isAdmin ? t.support.byAdmin : t.support.byUser} · {dtFmt.format(new Date(m.createdAt))}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <form onSubmit={submitReply} className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="reply-body">
          {t.support.reply}
        </label>
        <textarea
          id="reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder={t.support.replyPlaceholder}
          className="w-full rounded-xl border border-border bg-card/70 p-3 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
        />
        <Button type="submit" disabled={replyPending || !body.trim()} className="self-end">
          {replyPending ? t.common.loading : t.support.reply}
        </Button>
      </form>
    </div>
  )
}
