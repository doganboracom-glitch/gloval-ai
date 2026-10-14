'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, CreditCard, Globe, Inbox, Mail, type LucideIcon } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'

type QuickLink = {
  key: 'domains' | 'email' | 'messages' | 'billing'
  href: string
  icon: LucideIcon
  label: string
  badge?: number
}

const COPY = {
  tr: { actions: 'İşlemler', messages: 'Mesajlar', unread: (n: number) => `${n} okunmamış mesaj` },
  en: { actions: 'Actions', messages: 'Messages', unread: (n: number) => `${n} unread messages` },
} as const

function badgeText(count: number) {
  return count > 99 ? '99+' : String(count)
}

function UnreadBadge({ count, label }: { count: number; label: string }) {
  return (
    <>
      <span
        aria-hidden
        className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-5 text-brand-foreground"
      >
        {badgeText(count)}
      </span>
      <span className="sr-only">{label}</span>
    </>
  )
}

const linkClass =
  'inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card/60 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Dashboard shortcuts (domains, email, messages, billing).
 * At 768px and above they are plain link buttons; below that they collapse into
 * one "Actions" disclosure menu. The switch is pure CSS, so there is no hydration
 * flash and the hidden variant is removed from the accessibility tree.
 */
export function DashboardQuickLinks({
  unreadMessages = 0,
}: {
  unreadMessages?: number
}) {
  const { t, lang } = useLanguage()
  const c = lang === 'tr' ? COPY.tr : COPY.en

  const links: QuickLink[] = [
    { key: 'domains', href: '/dashboard/domains', icon: Globe, label: t.domains.navLabel },
    { key: 'email', href: '/dashboard/email', icon: Mail, label: t.mail.navLabel },
    {
      key: 'messages',
      href: '/dashboard/messages',
      icon: Inbox,
      label: c.messages,
      badge: unreadMessages > 0 ? unreadMessages : undefined,
    },
    { key: 'billing', href: '/billing', icon: CreditCard, label: t.dash.billing },
  ]

  return (
    <nav aria-label={c.actions}>
      <ul className="hidden flex-wrap items-center gap-2 md:flex">
        {links.map(({ key, href, icon: Icon, label, badge }) => (
          <li key={key}>
            <Link href={href} className={linkClass}>
              <Icon className="size-4" aria-hidden />
              {label}
              {badge ? <UnreadBadge count={badge} label={c.unread(badge)} /> : null}
            </Link>
          </li>
        ))}
      </ul>
      <div className="md:hidden">
        <ActionsMenu links={links} label={c.actions} unreadLabel={c.unread} unread={unreadMessages} />
      </div>
    </nav>
  )
}

function ActionsMenu({
  links,
  label,
  unread,
  unreadLabel,
}: {
  links: QuickLink[]
  label: string
  unread: number
  unreadLabel: (n: number) => string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLUListElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLAnchorElement>('a'))
    if (items.length === 0) return
    e.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLAnchorElement)
    let next = current
    if (e.key === 'ArrowDown') next = (current + 1) % items.length
    else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else next = items.length - 1
    items[next]?.focus()
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className={linkClass}
      >
        {label}
        {unread > 0 && <UnreadBadge count={unread} label={unreadLabel(unread)} />}
        <ChevronDown
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul
          id={menuId}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 top-full z-30 mt-2 flex min-w-52 flex-col rounded-xl border border-border bg-card p-1 shadow-xl"
        >
          {links.map(({ key, href, icon: Icon, label: itemLabel, badge }) => (
            <li key={key}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                <span className="flex-1">{itemLabel}</span>
                {badge ? <UnreadBadge count={badge} label={unreadLabel(badge)} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
