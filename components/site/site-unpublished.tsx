import { platformUrl } from '@/lib/domains'

export function SiteUnpublished() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold text-foreground">Bu site yayında değil</h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Site sahibi bu siteyi şu an yayından kaldırmış ya da henüz yayınlamamış olabilir.
        </p>
        <a
          href={platformUrl('/')}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          GLOVAL
        </a>
      </div>
    </main>
  )
}
