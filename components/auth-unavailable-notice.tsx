export function AuthUnavailableNotice() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 text-foreground">
      <section className="max-w-lg text-center" role="status" aria-live="polite">
        <h1 className="text-balance text-2xl font-semibold">
          Oturum doğrulanamıyor
        </h1>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          Kimlik doğrulama hizmeti geçici olarak yanıt vermiyor. Lütfen yeniden deneyin.
        </p>
      </section>
    </main>
  )
}
