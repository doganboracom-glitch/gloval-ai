'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { BrandLogo } from '@/components/brand-logo'

/**
 * Shared visual wrapper for every auth screen. Keeps the GLOVAL aesthetic
 * (grid background, glow, gradient wordmark) consistent across login/signup.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { t } = useLanguage()

  return (
    <main className="relative flex min-h-svh items-center justify-center overflow-hidden px-4 py-12">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, var(--primary), transparent)' }}
        aria-hidden
      />

      <div className="relative w-full max-w-md animate-fade-up">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t.auth.backHome}
        </Link>

        <div className="mb-6">
          <Link href="/" aria-label="GLOVAL AI" className="inline-flex">
            <BrandLogo className="w-[140px] sm:w-[150px]" priority />
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card/70 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  )
}
