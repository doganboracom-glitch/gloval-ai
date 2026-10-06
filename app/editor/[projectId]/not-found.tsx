import Link from 'next/link'

export default function EditorNotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Proje bulunamadı
        </h1>
        <p className="mt-3 text-pretty text-muted-foreground">
          Proje bulunamadı veya bu projeye erişim yetkiniz yok.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Projelerim&apos;e dön
        </Link>
      </div>
    </main>
  )
}
