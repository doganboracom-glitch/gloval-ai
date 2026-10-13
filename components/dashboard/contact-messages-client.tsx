'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Inbox, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { deleteContactMessageAction } from '@/lib/contact-messages-actions'
import type { ContactMessageRow } from '@/lib/site-contact-store'

const COPY = {
  tr: {
    back: 'Panele dön',
    title: 'Mesajlar',
    intro: 'Sitelerinizdeki iletişim formundan gelen mesajlar. Mesajlar 180 gün sonra otomatik silinir.',
    empty: 'Henüz mesaj yok.',
    date: 'Tarih',
    site: 'Site',
    from: 'Ad',
    email: 'E-posta',
    message: 'Mesaj',
    status: 'E-posta durumu',
    del: 'Sil',
    deleteFailed: 'Mesaj silinemedi.',
    statuses: { pending: 'Bekliyor', sent: 'Gönderildi', failed: 'Gönderilemedi', skipped: 'Atlandı' },
  },
  en: {
    back: 'Back to dashboard',
    title: 'Messages',
    intro: 'Messages sent through the contact form on your sites. They are deleted automatically after 180 days.',
    empty: 'No messages yet.',
    date: 'Date',
    site: 'Site',
    from: 'Name',
    email: 'Email',
    message: 'Message',
    status: 'Email status',
    del: 'Delete',
    deleteFailed: 'Could not delete the message.',
    statuses: { pending: 'Pending', sent: 'Sent', failed: 'Failed', skipped: 'Skipped' },
  },
} as const

const STATUS_STYLE: Record<string, string> = {
  sent: 'text-emerald-500',
  failed: 'text-destructive',
  pending: 'text-muted-foreground',
  skipped: 'text-muted-foreground',
}

function excerpt(text: string, max = 140) {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

export function ContactMessagesClient({ messages }: { messages: ContactMessageRow[] }) {
  const { lang } = useLanguage()
  const c = lang === 'tr' ? COPY.tr : COPY.en
  const [items, setItems] = useState(messages)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)

  const remove = (id: string) => {
    setError(null)
    startTransition(async () => {
      const { ok } = await deleteContactMessageAction(id)
      if (ok) setItems((prev) => prev.filter((m) => m.id !== id))
      else setError(c.deleteFailed)
    })
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {c.back}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-balance">{c.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground text-pretty">{c.intro}</p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-muted-foreground">
          <Inbox className="size-6" />
          <p className="text-sm">{c.empty}</p>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((m) => {
            const open = openId === m.id
            return (
              <li key={m.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">
                      {m.name} <span className="font-normal text-muted-foreground">&lt;{m.email}&gt;</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(m.createdAt).toLocaleString(lang === 'tr' ? 'tr-TR' : 'en-US')} · {m.siteName} ·{' '}
                      <span className={STATUS_STYLE[m.emailStatus]}>
                        {c.status}: {c.statuses[m.emailStatus]}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(m.id)}
                    aria-label={`${c.del}: ${m.name}`}
                  >
                    <Trash2 className="size-4" />
                    {c.del}
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : m.id)}
                  aria-expanded={open}
                  className="mt-3 block w-full text-left text-sm leading-relaxed text-foreground/90"
                >
                  <span className="whitespace-pre-wrap break-words">{open ? m.message : excerpt(m.message)}</span>
                </button>
                {m.phone && open && <p className="mt-2 text-xs text-muted-foreground">{m.phone}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
