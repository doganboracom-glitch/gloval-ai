'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { BrandLogo } from '@/components/brand-logo'
import { createClient } from '@/lib/supabase/client'

/**
 * Full-screen notice shown when a suspended user hits any protected route
 * (middleware redirects them here). Mirrors the visual language of
 * `AdminUnauthorized` and points the user at support. Copy is TR-primary and
 * does not depend on the language provider so it renders standalone.
 */
export function AccountSuspended({ supportEmail }: { supportEmail: string }) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
    router.refresh()
  }

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
            Hesabınız askıya alındı
          </h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Hesabınız geçici olarak askıya alınmıştır ve yönetim paneline şu anda
            erişemezsiniz. Bunun bir hata olduğunu düşünüyorsanız ya da hesabınızı
            yeniden etkinleştirmek istiyorsanız destek ekibimizle iletişime geçin.
          </p>
        </div>

        <a
          href={`mailto:${supportEmail}`}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          {supportEmail} ile iletişime geç
        </a>

        <button
          type="button"
          onClick={handleSignOut}
          className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Çıkış yap
        </button>
      </div>
    </div>
  )
}
