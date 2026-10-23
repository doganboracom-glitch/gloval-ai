'use client'

import { useId, useState } from 'react'
import { MessageCircle, Phone, Play } from 'lucide-react'
import { ProductGallery } from '@/components/store/product-gallery'
import type { CatalogLabels } from '@/lib/catalog-view'
import {
  catalogCategoryPath,
  catalogListPath,
  catalogPriceText,
  parseVideoUrl,
  type CatalogItem,
  type VideoEmbed,
} from '@/lib/catalog-public'
import { discountPercent } from '@/lib/store-product-display'
import { CatalogCard } from '@/components/catalog/catalog-card'

const primaryStyle = { backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }
const buttonClass =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--site-radius,0.75rem)] px-5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'

/** The iframe is created only after the click, so no third-party request is made before consent-by-action. */
function LazyVideo({ video, title }: { video: VideoEmbed; title: string }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="relative aspect-video overflow-hidden rounded-[var(--site-radius,1rem)] border border-border bg-muted">
      {playing ? (
        <iframe
          src={video.embedUrl}
          title={`${title} videosu`}
          className="size-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          className="flex size-full flex-col items-center justify-center gap-3 text-foreground"
          aria-label={`${title} videosunu oynat`}
        >
          <span className="flex size-16 items-center justify-center rounded-full" style={primaryStyle}>
            <Play className="size-7" aria-hidden />
          </span>
          <span className="text-sm font-medium">Videoyu izle</span>
          <span className="max-w-xs px-4 text-center text-xs text-muted-foreground">
            {video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} oynatıcısı yalnızca oynat&apos;a bastığınızda yüklenir.
          </span>
        </button>
      )}
    </div>
  )
}

type TabKey = 'description' | 'specs' | 'video'

export function CatalogProductView({
  storeName,
  item,
  related,
  whatsappHref,
  phone,
  labels,
}: {
  labels: CatalogLabels
  storeName: string
  item: CatalogItem
  related: CatalogItem[]
  whatsappHref: string | null
  phone: { display: string; href: string } | null
}) {
  const tabsId = useId()
  const video = parseVideoUrl(item.videoUrl)
  const askPrice = item.priceMode === 'ask'
  const discount = askPrice ? null : discountPercent(item.priceCents, item.compareAtCents)
  const paragraphs = (item.description ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const summary = paragraphs[0] ?? null

  const tabs: { key: TabKey; label: string }[] = []
  const blocks = item.blocks ?? []
  if (paragraphs.length || blocks.length) tabs.push({ key: 'description', label: 'Açıklama' })
  if (item.specs.length) tabs.push({ key: 'specs', label: 'Ürün Özellikleri' })
  if (video) tabs.push({ key: 'video', label: 'Ürün Videosu' })
  const [active, setActive] = useState<TabKey | null>(null)
  const currentTab = tabs.find((t) => t.key === active)?.key ?? tabs[0]?.key ?? null

  return (
    <div className="flex flex-col">
    <header className="border-b border-border bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 md:py-8">
        <p className="text-sm font-medium text-muted-foreground">Ürün Detayı</p>
        <p className="text-2xl font-bold md:text-3xl" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>{item.name}</p>
      </div>
    </header>
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-6 pb-28 md:py-10 md:pb-10">
      <nav aria-label="Kırıntı yolu" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <li><a href="/" className="hover:underline">Ana sayfa</a></li>
          <li aria-hidden>›</li>
          <li><a href={catalogListPath()} className="hover:underline">Ürünlerimiz</a></li>
          <li aria-hidden>›</li>
          <li><a href={catalogCategoryPath(item.categorySlug)} className="hover:underline">{item.categoryName}</a></li>
          <li aria-hidden>›</li>
          <li aria-current="page" className="text-foreground">{item.name}</li>
        </ol>
      </nav>

      <div className="grid gap-10 md:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] md:items-start">
        <ProductGallery images={item.images} name={item.name} />

        <section className="flex flex-col gap-5">
          {discount !== null && (
            <span data-sale-badge className="self-start rounded-full bg-destructive px-3 py-1 text-xs font-bold text-destructive-foreground">İndirimli</span>
          )}
          <h1 className="text-balance text-3xl font-bold leading-tight md:text-4xl" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>
            {item.name}
          </h1>
          <div className="flex flex-wrap items-end gap-3">
            <span className="text-3xl font-bold">{catalogPriceText(item, labels.askPrice)}</span>
            {discount !== null && item.compareAtCents != null && (
              <span className="text-lg text-muted-foreground line-through" data-old-price>
                {catalogPriceText({ ...item, priceCents: item.compareAtCents })}
              </span>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {whatsappHref && (
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-whatsapp-order className={`${buttonClass} ${phone ? '' : 'sm:col-span-2'}`} style={primaryStyle}>
                <MessageCircle className="size-4" aria-hidden />
                {labels.orderWhatsapp}
              </a>
            )}
            {phone && (
              <a
                href={phone.href}
                className={`${buttonClass} border ${whatsappHref ? '' : 'sm:col-span-2'}`}
                style={{ borderColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary, var(--primary))' }}
              >
                <Phone className="size-4" aria-hidden />
                Hemen Ara
                <span className="sr-only">{phone.display}</span>
              </a>
            )}
          </div>

          {summary && <p className="line-clamp-4 leading-relaxed text-muted-foreground">{summary}</p>}

          <dl className="divide-y divide-border rounded-[var(--site-radius,0.75rem)] border border-border text-sm">
            {item.sku && (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground">Ürün Kodu</dt>
                <dd className="font-medium">{item.sku}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-muted-foreground">Kategori</dt>
              <dd className="font-medium">
                <a href={catalogCategoryPath(item.categorySlug)} className="hover:underline">{item.categoryName}</a>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {tabs.length > 0 && currentTab && (
        <section aria-label="Ürün detayları" className="flex flex-col gap-6">
          <div role="tablist" aria-label="Ürün bilgileri" className="flex gap-1 border-b border-border">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                role="tab"
                type="button"
                id={`${tabsId}-${tab.key}-tab`}
                aria-selected={currentTab === tab.key}
                aria-controls={`${tabsId}-${tab.key}`}
                onClick={() => setActive(tab.key)}
                className={`-mb-px min-h-11 border-b-2 px-4 text-sm font-semibold ${currentTab === tab.key ? 'border-[var(--site-primary,var(--primary))] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${tabsId}-${currentTab}`} aria-labelledby={`${tabsId}-${currentTab}-tab`} className="max-w-3xl">
            {currentTab === 'description' && (
              <div className="flex flex-col gap-4 leading-relaxed text-muted-foreground">
                {paragraphs.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
                {blocks.map((block, i) => (
                  <div key={`block-${i}`} className="flex flex-col gap-2">
                    {block.heading && (
                      block.level === 'h3'
                        ? <h3 className="text-lg font-semibold text-foreground">{block.heading}</h3>
                        : <h2 className="text-xl font-bold text-foreground">{block.heading}</h2>
                    )}
                    {block.body.split(/\n\s*\n/).map((part, k) => part.trim() && <p key={k} className="whitespace-pre-line">{part.trim()}</p>)}
                  </div>
                ))}
              </div>
            )}
            {currentTab === 'specs' && (
              <dl className="divide-y divide-border rounded-[var(--site-radius,0.75rem)] border border-border text-sm">
                {item.specs.map((spec, i) => (
                  <div key={`${spec.name}-${i}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 px-4 py-3">
                    <dt className="text-muted-foreground">{spec.name}</dt>
                    <dd className="font-medium">{spec.value || '✓'}</dd>
                  </div>
                ))}
              </dl>
            )}
            {currentTab === 'video' && video && <LazyVideo video={video} title={item.name} />}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby={`${tabsId}-related`} className="flex flex-col gap-5">
          <h2 id={`${tabsId}-related`} className="text-2xl font-bold" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>
            Aynı kategoriden diğer ürünler
          </h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((product) => (
              <li key={product.id}><CatalogCard item={product} askLabel={labels.askPrice} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
    </div>
  )
}
