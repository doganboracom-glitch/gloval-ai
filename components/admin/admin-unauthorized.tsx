import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'

/**
 * Shown when a SIGNED-IN user reaches the admin area without being on the
 * `ADMIN_EMAILS` allowlist. This intentionally replaces the old `notFound()`
 * behaviour so an unauthorized state is distinguishable from a missing route:
 * a real 404 now only ever means the route genuinely does not exist.
 *
 * Copy is bilingual-neutral (TR primary) and does not depend on the language
 * provider, so it renders even outside the app shell.
 */
export function AdminUnauthorized({ email }: { email?: string }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative flex max-w-md flex-col items-center gap-6">
        <Link href="/" aria-label="GLOVAL AI">
          <BrandLogo />
        </Link>

        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card/70">
          <ShieldAlert className="size-7 text-brand" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
            Bu alana erişim yetkiniz yok
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Yönetim paneli yalnızca yetkili hesaplara açıktır.
            {email ? ` (${email})` : ''} Bu sayfayı görmeniz gerektiğini düşünüyorsanız
            site yöneticisiyle iletişime geçin.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
          >
            Panele dön
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ana sayfa
          </Link>
        </div>
      </div>
    </div>
  )
}
