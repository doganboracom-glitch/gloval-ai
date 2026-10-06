import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'
import { pickLang, type Lang } from '@/lib/i18n'
import type { CatalogItem } from '@/lib/demo-catalog'

/**
 * CatalogGrid
 * -----------
 * Generic responsive grid of catalog/service cards, themed via `--site-*`.
 * Each card links to its detail route. Shared by every demo's product and
 * service listing pages.
 */
export function CatalogGrid({
  title,
  subtitle,
  items,
  detailHref,
  lang,
}: {
  title: string
  subtitle: string
  items: CatalogItem[]
  detailHref: (itemSlug: string) => string
  lang: Lang
}) {
  const detailCta = lang === 'tr' ? 'İncele' : 'View'

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <header className="mb-8 sm:mb-10">
        <h1
          className="text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
        >
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
          {subtitle}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.slug}
            href={detailHref(item.slug)}
            className="group flex flex-col overflow-hidden transition-transform hover:-translate-y-1"
            style={{
              borderRadius: 'var(--site-radius)',
              border: '1px solid var(--site-border)',
              backgroundColor: 'var(--site-card)',
            }}
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={item.image || '/placeholder.svg'}
                alt={pickLang(item.name, lang)}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              {item.category ? (
                <span
                  className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-medium backdrop-blur"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--site-bg) 80%, transparent)', color: 'var(--site-fg)' }}
                >
                  {pickLang(item.category, lang)}
                </span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-2 p-5">
              <div className="flex items-start justify-between gap-3">
                <h2
                  className="text-lg font-semibold leading-tight"
                  style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
                >
                  {pickLang(item.name, lang)}
                </h2>
                {item.price ? (
                  <span className="shrink-0 text-sm font-semibold" style={{ color: 'var(--site-primary)' }}>
                    {pickLang(item.price, lang)}
                  </span>
                ) : null}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
                {pickLang(item.short, lang)}
              </p>
              <span
                className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium"
                style={{ color: 'var(--site-primary)' }}
              >
                {detailCta}
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
