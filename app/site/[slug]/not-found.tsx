import { platformUrl } from '@/lib/domains'

export default function SiteNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Bu site yayında değil
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Aradığın site bulunamadı ya da yayından kaldırılmış olabilir.
        </p>
        {/* Absolute platform URL — a relative "/" would stay on the tenant
            subdomain (e.g. test123.gloval.site) and 404 again. */}
        <a
          href={platformUrl('/')}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          GLOVAL AI&apos;a git
        </a>
      </div>
    </main>
  )
}
