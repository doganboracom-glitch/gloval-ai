'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRightLeft,
  Bell,
  ChevronDown,
  Clock3,
  CreditCard,
  FileText,
  Globe,
  Handshake,
  LayoutDashboard,
  LayoutTemplate,
  LifeBuoy,
  Mail,
  Megaphone,
  Newspaper,
  Receipt,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { blogAdminT } from '@/lib/blog-admin-copy'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { adminT } from '@/lib/admin/i18n'
import { overdueT } from '@/lib/admin/overdue-copy'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { getInvoiceCopy } from '@/lib/invoices/copy'
import { cn } from '@/lib/utils'

type AdminNavChild = {
  href: string
  label: string
}

type AdminNavItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  children?: AdminNavChild[]
}

function isAdminNavItemActive(pathname: string, href: string, exact = false) {
  return pathname === href || (!exact && pathname.startsWith(`${href}/`))
}

function AdminNavGroup({
  item,
  pathname,
}: {
  item: AdminNavItem
  pathname: string
}) {
  const active = isAdminNavItemActive(pathname, item.href)
  const [expanded, setExpanded] = useState(active)
  const Icon = item.icon

  return (
    <li className="shrink-0">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="admin-nav-referrals-sections"
        onClick={() => setExpanded((isExpanded) => !isExpanded)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          active
            ? 'bg-brand/15 font-medium text-brand'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{item.label}</span>
        <ChevronDown
          className={cn('ms-auto size-4 shrink-0 transition-transform duration-200', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      <ul
        id="admin-nav-referrals-sections"
        hidden={!expanded}
        className={cn('mt-1 flex flex-col gap-1', !expanded && 'hidden')}
      >
        {item.children?.map((child) => (
          <li key={child.href}>
            <Link
              href={child.href}
              className="flex items-center rounded-lg py-2 ps-9 pe-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {child.label}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  )
}

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
  referralsEnabled,
  children,
}: {
  adminEmail: string
  referralsEnabled: boolean
  children: React.ReactNode
}) {
  const { lang } = useLanguage()
  const t = adminT(lang)
  const billingProfileCopy = getBillingProfileCopy(lang)
  const pathname = usePathname()

  const nav: AdminNavItem[] = [
    { href: '/admin', label: t.nav.dashboard, icon: LayoutDashboard, exact: true },
    { href: '/admin/users', label: t.nav.users, icon: Users },
    { href: '/admin/sites', label: t.nav.sites, icon: LayoutTemplate },
    { href: '/admin/billing', label: t.nav.billing, icon: CreditCard, exact: true },
    { href: '/admin/billing/profiles', label: billingProfileCopy.adminNav, icon: FileText },
    { href: '/admin/billing/invoices', label: getInvoiceCopy(lang).nav, icon: Receipt },
    { href: '/admin/overdue', label: overdueT(lang).nav, icon: AlertCircle },
    { href: '/admin/credits', label: t.nav.credits, icon: Sparkles },
    ...(referralsEnabled
      ? [{
        href: '/admin/referrals',
        label: t.nav.referrals,
        icon: Handshake,
        children: [
          { href: '/admin/referrals#partners', label: t.nav.referralPartners },
          { href: '/admin/referrals#payouts', label: t.nav.referralPayoutRequests },
          { href: '/admin/referrals#reversals', label: t.nav.referralCommissionReversals },
        ],
      }]
      : []),
    { href: '/admin/ads-publishing', label: t.nav.adsPublishRecovery, icon: Clock3 },
    { href: '/admin/google-ads', label: 'Google Ads', icon: Megaphone },
    { href: '/admin/domains', label: t.nav.domains, icon: Globe, exact: true },
    { href: '/admin/domains/handover', label: t.nav.domainHandover, icon: ArrowRightLeft },
    { href: '/admin/blog', label: blogAdminT(lang).nav, icon: Newspaper },
    { href: '/admin/support', label: t.nav.support, icon: LifeBuoy },
    { href: '/admin/maker-requests', label: t.nav.makerRequests, icon: FileText },
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
              {nav.map((item) => {
                if (item.children) {
                  return (
                    <AdminNavGroup
                      key={`${item.href}:${pathname}`}
                      item={item}
                      pathname={pathname}
                    />
                  )
                }

                const active = isAdminNavItemActive(pathname, item.href, item.exact)
                const Icon = item.icon
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors',
                        active
                          ? 'bg-brand/15 font-medium text-brand'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
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
