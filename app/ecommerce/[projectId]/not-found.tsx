import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function EcommerceNotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold tracking-tight text-balance">
        Proje bulunamadı veya bu projeye erişim yetkiniz yok.
      </h1>
      <p className="mt-2 max-w-md text-pretty text-muted-foreground">
        Bu mağaza mevcut değil ya da bir e-ticaret projesi değil.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <ArrowLeft className="size-4" />
        Projelerim
      </Link>
    </main>
  )
}
