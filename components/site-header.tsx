'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, LayoutGrid } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { LinkButton } from '@/components/link-button'
import { BrandLogo } from '@/components/brand-logo'
import { ScrollToTop, scrollWindowToTop } from '@/components/scroll-to-top'
import { createClient } from '@/lib/supabase/client'

export function SiteHeader() {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  // Auth-aware header: logged-in visitors get a "My Projects" shortcut to the
  // dashboard; anonymous visitors keep the original sign-in + CTA exactly.
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setSignedIn(!!data.user)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // Section anchors only resolve on the homepage, so when the header renders on
  // a standalone route (/blog, /sss) they are prefixed with "/" to navigate home
  // first. Real routes are marked so they render as <Link> instead.
  const onHome = pathname === '/'
  // "Özellikler" başlıklı link, header'daki yatay sıkışıklığı azaltmak için
  // buradan çıkarıldı. Bölümün kendisi ve footer'daki /#features linki duruyor.
  const links = [
    { href: '#how', label: t.nav.how },
    { href: '#showcase', label: t.nav.showcase },
    { href: '#pricing', label: t.nav.pricing },
    { href: '/blog', label: t.nav.blog, route: true },
    { href: '/sss', label: t.nav.faq, route: true },
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/"
          aria-label="GLOVAL AI"
          className="flex shrink-0 items-center"
          onClick={(e) => {
            // Zaten ana sayfadaysak yeniden yönlendirme yerine sayfayı
            // yumuşak biçimde en başa kaydır; diğer rotalarda normal navigasyon.
            if (onHome) {
              e.preventDefault()
              scrollWindowToTop()
            }
          }}
        >
          <BrandLogo priority />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {links.map((l) =>
            l.route ? (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={onHome ? l.href : `/${l.href}`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {signedIn ? (
            <LinkButton
              href="/dashboard"
              size="sm"
              className="hidden gap-1.5 sm:inline-flex"
            >
              <LayoutGrid className="h-4 w-4" />
              {t.nav.myProjects}
            </LinkButton>
          ) : (
            <>
              <LinkButton
                href="/auth/login"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                {t.nav.signIn}
              </LinkButton>
              <LinkButton
                href={onHome ? '#hero-input' : '/#hero-input'}
                size="sm"
                className="hidden sm:inline-flex"
              >
                {t.nav.cta}
              </LinkButton>
            </>
          )}
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
            {links.map((l) =>
              l.route ? (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.href}
                  href={onHome ? l.href : `/${l.href}`}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {l.label}
                </a>
              ),
            )}
            {signedIn ? (
              <LinkButton
                href="/dashboard"
                className="mt-2 gap-1.5"
                onClick={() => setOpen(false)}
              >
                <LayoutGrid className="h-4 w-4" />
                {t.nav.myProjects}
              </LinkButton>
            ) : (
              <>
                <LinkButton
                  href="/auth/login"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setOpen(false)}
                >
                  {t.nav.signIn}
                </LinkButton>
                <LinkButton
                  href={onHome ? '#hero-input' : '/#hero-input'}
                  className="mt-1"
                  onClick={() => setOpen(false)}
                >
                  {t.nav.cta}
                </LinkButton>
              </>
            )}
          </nav>
        </div>
      )}

      {/* Sayfa aşağı kaydırılınca beliren "yukarı çık" butonu. */}
      <ScrollToTop />
    </header>
  )
}
