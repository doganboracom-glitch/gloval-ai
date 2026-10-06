'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, CircleX, Clock3 } from 'lucide-react'

export const dynamic = 'force-dynamic'

type Status = 'success' | 'failed' | 'error'

const content: Record<Status, { title: string; description: string; icon: typeof CheckCircle2 }> = {
  success: {
    title: 'Ödeme başarılı',
    description: 'Ödemeniz doğrulandı ve paketiniz aktif edildi.',
    icon: CheckCircle2,
  },
  failed: {
    title: 'Ödeme tamamlanamadı',
    description: 'Ödeme doğrulanamadı. Paketiniz aktif edilmedi. Lütfen tekrar deneyin.',
    icon: CircleX,
  },
  error: {
    title: 'Ödeme sonucu alınamadı',
    description: 'Ödeme sonucu doğrulanırken bir sorun oluştu. Lütfen destek ekibiyle iletişime geçmeden önce hesabınızı kontrol edin.',
    icon: Clock3,
  },
}

export default function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const router = useRouter()
  const [checkout, setCheckout] = useState<string | undefined>(undefined)

  useEffect(() => {
    searchParams.then((params) => setCheckout(params.checkout))
  }, [searchParams])

  useEffect(() => {
    if (checkout === 'success') {
      const timeout = window.setTimeout(() => router.replace('/billing'), 1400)
      return () => window.clearTimeout(timeout)
    }
  }, [checkout, router])

  const params = { checkout }
  const status: Status = params.checkout === 'success' || params.checkout === 'failed' ? params.checkout : 'error'
  const result = content[status]
  const Icon = result.icon

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-xl sm:p-10">
        <Icon className={`mx-auto size-16 ${status === 'success' ? 'text-emerald-500' : status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`} aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">GLOVAL AI</p>
        <h1 className="mt-3 text-balance text-3xl font-bold">{result.title}</h1>
        <p className="mx-auto mt-4 max-w-md text-pretty leading-7 text-muted-foreground">{result.description}</p>
        {status !== 'success' && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/auth/login" className="rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              Giriş yap
            </Link>
            <Link href="/" className="rounded-lg border border-border px-5 py-3 font-semibold transition-colors hover:bg-muted">
              Ana sayfaya dön
            </Link>
          </div>
        )}
      </section>
    </main>
  )
}
