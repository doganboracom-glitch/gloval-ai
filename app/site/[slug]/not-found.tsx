'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { siteHomeHref } from '@/lib/site-availability'

export default function SiteNotFound() {
  const home = siteHomeHref(usePathname())
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Sayfa bulunamadı</h1>
        <p className="mt-3 text-pretty text-muted-foreground">Aradığınız sayfa bu sitede bulunmuyor.</p>
        <Link href={home} className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
          Ana sayfaya dön
        </Link>
      </div>
    </main>
  )
}
