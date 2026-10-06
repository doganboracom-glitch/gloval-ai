'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CloudUpload, Lightbulb, Loader2, Clock, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SupportShell, useSupportCopy } from '@/components/support/support-shell'
import { createSupportTicket } from '@/lib/support/actions'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_FILES,
  MESSAGE_MAX,
  SUBJECT_MAX,
  TICKET_DEPARTMENTS,
  TICKET_PRIORITIES,
  TICKET_SERVICES,
} from '@/lib/support/constants'
import type { OwnProject } from '@/lib/support/queries'

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring'

export function NewTicketForm({ projects }: { projects: OwnProject[] }) {
  const c = useSupportCopy()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)].slice(0, ATTACHMENT_MAX_FILES))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.delete('files')
    for (const f of files) formData.append('files', f)
    formData.set('idempotencyKey', idempotencyKey.current)
    setError(null)
    startTransition(async () => {
      try {
        const res = await createSupportTicket(formData)
        if (!res.ok) {
          setError(c.errors[res.error] ?? c.errors.generic)
          return
        }
        router.push(`/support/${res.ticketId}`)
      } catch {
        setError(c.errors.generic)
      }
    })
  }

  return (
    <SupportShell
      title={c.createTitle}
      subtitle={c.createSubtitle}
      backHref="/support"
      backLabel={c.backToList}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {c.department} <span className="text-destructive">*</span>
              </span>
              <select name="department" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  {c.departmentPlaceholder}
                </option>
                {TICKET_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {c.departments[d]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{c.priority}</span>
              <select name="priority" defaultValue="normal" className={fieldClass}>
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {c.priorities[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {c.service} <span className="font-normal text-muted-foreground">{c.optional}</span>
              </span>
              <select name="service" defaultValue="none" className={fieldClass}>
                <option value="none">{c.serviceNone}</option>
                {TICKET_SERVICES.map((s) => (
                  <option key={s} value={s}>
                    {c.services[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">
                {c.project} <span className="font-normal text-muted-foreground">{c.optional}</span>
              </span>
              <select name="projectId" defaultValue="none" className={fieldClass}>
                <option value="none">{c.projectNone}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="-mt-3 text-xs text-muted-foreground">{c.serviceHint}</p>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {c.subject} <span className="text-destructive">*</span>
            </span>
            <input
              name="subject"
              required
              maxLength={SUBJECT_MAX}
              placeholder={c.subjectPlaceholder}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {c.message} <span className="text-destructive">*</span>
            </span>
            <textarea
              name="message"
              required
              maxLength={MESSAGE_MAX}
              rows={9}
              placeholder={c.messagePlaceholder}
              className={`${fieldClass} resize-y`}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              {c.attachments} <span className="font-normal text-muted-foreground">{c.optional}</span>
            </span>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                addFiles(e.dataTransfer.files)
              }}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-background px-3 py-3 text-sm"
            >
              <CloudUpload className="size-5 text-muted-foreground" />
              <span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {c.browse}
                </button>{' '}
                <span className="text-muted-foreground">{c.dropHint}</span>
              </span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{c.attachHint}</span>
            {files.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-1.5 text-xs"
                  >
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      aria-label={c.remove}
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-border pt-5">
            <Button type="button" variant="ghost" onClick={() => router.push('/support')} disabled={pending}>
              {c.cancel}
            </Button>
            <Button type="submit" disabled={pending} className="gap-2">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {pending ? c.sending : c.submit}
            </Button>
          </div>
        </form>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Lightbulb className="size-4 text-accent" />
              {c.beforeTitle}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">{c.beforeBody}</p>
            <Link
              href="/sss"
              className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              {c.beforeCta}
            </Link>
          </section>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Clock className="size-4 text-muted-foreground" />
              {c.nextTitle}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">{c.nextBody1}</p>
            <p className="mt-2 text-sm text-muted-foreground text-pretty">{c.nextBody2}</p>
          </section>
        </aside>
      </div>
    </SupportShell>
  )
}
