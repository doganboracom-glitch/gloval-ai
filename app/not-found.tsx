import { LinkButton } from '@/components/link-button'
import { BrandLogo } from '@/components/brand-logo'

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <BrandLogo />
      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-5xl font-semibold text-brand">404</p>
        <h1 className="text-balance text-2xl font-semibold text-foreground">
          Sayfa bulunamadı
        </h1>
        <p className="max-w-md text-pretty leading-relaxed text-muted-foreground">
          Aradığınız sayfa taşınmış veya hiç var olmamış olabilir. Ana sayfaya
          dönüp tekrar deneyebilirsiniz.
        </p>
      </div>
      <LinkButton href="/">Ana sayfaya dön</LinkButton>
    </main>
  )
}
