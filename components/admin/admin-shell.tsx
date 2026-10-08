'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CreditCard,
  FileText,
  Globe,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Mail,
  Sparkles,
  Users,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { adminT } from '@/lib/admin/i18n'
import { overdueT } from '@/lib/admin/overdue-copy'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { cn } from '@/lib/utils'

/**
 * Unified admin back office chrome.
 *
 * Previously this was Mail-only; it now hosts every operator surface (users,
 * sites, billing, credits, domains, support, notifications) plus the existing
 * Mail area as one entry in the nav. Each child page renders its own heading,
 * so the shell only owns the frame, brand, language switcher and navigation.
 */
export function AdminShell({
  adminEmail,
  children,
}: {
  adminEmail: string
  children: React.ReactNode
}) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const billingProfileCopy = getBillingProfileCopy(lang)
  const pathname = usePathname()

  const nav = [
    { href: '/admin', label: t.nav.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: t.nav.users, icon: Users },
    { href: '/admin/sites', label: t.nav.sites, icon: LayoutTemplate },
    { href: '/admin/billing', label: t.nav.billing, icon: CreditCard, exact: true },
    { href: '/admin/billing/profiles', label: billingProfileCopy.adminNav, icon: FileText },
    { href: '/admin/overdue', label: overdueT(lang).nav, icon: AlertCircle },
    { href: '/admin/credits', label: t.nav.credits, icon: Sparkles },
    { href: '/admin/domains', label: t.nav.domains, icon: Globe },
    { href: '/admin/support', label: t.nav.support, icon: LifeBuoy },
    { href: '/admin/notifications', label: t.nav.notifications, icon: Bell },
    { href: '/admin/mail', label: t.nav.mail, icon: Mail },
  ]

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden text-sm text-muted-foreground sm:inline">{adminEmail}</span>
          </div>
        </header>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.backToApp}
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">{t.title}</h1>

        <div className="mt-8 flex flex-col gap-8 lg:flex-row">
          <nav aria-label={t.title} className="lg:w-52 lg:shrink-0">
            <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
              {nav.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname.startsWith(href)
                return (
                  <li key={href} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                        active
                          ? 'bg-brand/15 font-medium text-brand'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </div>
  )
}
