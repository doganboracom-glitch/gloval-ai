import Link from 'next/link'
import { newTicketHref } from '@/lib/support/prefill'

export function SiteUnavailable({ projectId }: { projectId: string }) {
  const supportHref = newTicketHref({
    subject: 'Site açılmıyor',
    message: `Editörde sitem açılmıyor. Proje kimliği: ${projectId}`,
    projectId,
  })
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <h1 className="text-balance text-xl font-semibold text-foreground">Siteniz şu anda açılamıyor</h1>
      <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
        Sitenizin kayıtlı yapısı okunamadı. Verileriniz silinmedi. Destek ekibine yazarsanız sitenizi sizin için onarırız.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href={supportHref}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground"
        >
          Destek talebi oluştur
        </Link>
        <Link href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground">
          Panele dön
        </Link>
      </div>
    </main>
  )
}
