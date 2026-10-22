import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'

/**
 * Shown instead of a 404 when an owner opens the store tools of a site that
 * is not a store (`commerce_mode = 'none'`), so the page explains itself.
 */
export function StoreNotEnabled({ projectId }: { projectId: string }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-2xl font-bold tracking-tight text-balance">
        Bu site bir e-ticaret mağazası değil
      </h1>
      <p className="mt-2 max-w-md text-pretty text-muted-foreground">
        Ürün, sipariş ve ödeme araçları yalnızca mağaza olarak oluşturulan sitelerde kullanılabilir. Satış yapmak
        için Projelerim sayfasından yeni bir e-ticaret mağazası oluşturabilirsiniz.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/editor/${projectId}`}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Pencil className="size-4" />
          Siteyi düzenle
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-4" />
          Projelerim
        </Link>
      </div>
    </main>
  )
}
