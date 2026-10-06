import Link from 'next/link'

export default function DemoNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Demo bulunamadı
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Aradığın örnek çalışma bulunamadı. Tüm demoları ana sayfada
          inceleyebilirsin.
        </p>
        <Link
          href="/#showcase"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Örnek çalışmalar
        </Link>
      </div>
    </main>
  )
}
