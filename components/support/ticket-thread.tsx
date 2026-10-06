'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Paperclip, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SupportShell, TicketStatusBadge, useSupportCopy } from '@/components/support/support-shell'
import { replyToOwnTicket } from '@/lib/support/actions'
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_FILES, MESSAGE_MAX } from '@/lib/support/constants'
import type { SupportTicketDetail } from '@/lib/support/queries'
import { cn } from '@/lib/utils'

export function TicketThread({ ticket }: { ticket: SupportTicketDetail }) {
  const c = useSupportCopy()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.delete('files')
    for (const f of files) formData.append('files', f)
    formData.set('ticketId', ticket.id)
    setError(null)
    startTransition(async () => {
      try {
        const res = await replyToOwnTicket(formData)
        if (!res.ok) {
          setError(c.errors[res.error] ?? c.errors.generic)
          return
        }
        formRef.current?.reset()
        setFiles([])
        router.refresh()
      } catch {
        setError(c.errors.generic)
      }
    })
  }

  return (
    <SupportShell title={ticket.subject} backHref="/support" backLabel={c.backToList} actions={<TicketStatusBadge status={ticket.status} />}>
      <p className="-mt-4 mb-6 font-mono text-xs text-muted-foreground">
        {ticket.ticketNumber} · {c.departments[ticket.department]}
        {ticket.service ? ` · ${c.services[ticket.service]}` : ''}
        {ticket.projectName ? ` · ${ticket.projectName}` : ''} · {c.createdAt}{' '}
        {new Date(ticket.createdAt).toLocaleString()}
      </p>

      <ol className="flex flex-col gap-4">
        {ticket.messages.map((m) => {
          const mine = m.authorType === 'user'
          return (
            <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-xl border px-4 py-3 text-sm',
                  mine ? 'border-brand/40 bg-brand/10' : 'border-border bg-card',
                )}
              >
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {mine ? c.you : c.team} · {new Date(m.createdAt).toLocaleString()}
                </p>
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
            </li>
          )
        })}
      </ol>

      <form ref={formRef} onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.yourReply}</span>
          <textarea
            name="message"
            required
            rows={4}
            maxLength={MESSAGE_MAX}
            placeholder={c.replyPlaceholder}
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-xs font-medium hover:bg-secondary/80">
            <Paperclip className="size-3.5" />
            {c.attachments}
            <input
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="sr-only"
              onChange={(e) => {
                setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, ATTACHMENT_MAX_FILES))
                e.target.value = ''
              }}
            />
          </label>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-md bg-secondary/50 px-2 py-1 text-xs">
              {f.name}
              <button
                type="button"
                aria-label={c.remove}
                onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <Button type="submit" disabled={pending} className="ml-auto gap-2">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {c.send}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </SupportShell>
  )
}
