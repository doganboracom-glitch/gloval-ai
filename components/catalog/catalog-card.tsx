import { catalogPriceText, catalogProductPath, type CatalogItem } from '@/lib/catalog-public'

export function CatalogCard({ item, askLabel }: { item: CatalogItem; askLabel?: string }) {
  const image = item.images[0]
  return (
    <a
      href={catalogProductPath(item.categorySlug, item.slug)}
      className="group flex h-full flex-col overflow-hidden rounded-[var(--site-radius,1rem)] border border-border bg-card text-card-foreground transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <div className="aspect-square overflow-hidden bg-muted">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.url} alt={image.alt || item.name} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex size-full items-center justify-center p-4 text-center text-sm text-muted-foreground">{item.name}</div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <span className="text-xs text-muted-foreground">{item.categoryName}</span>
        <h3 className="text-balance font-semibold leading-snug">{item.name}</h3>
        <span className="mt-auto pt-2 text-sm font-bold" style={{ color: 'var(--site-primary, var(--primary))' }}>{catalogPriceText(item, askLabel)}</span>
      </div>
    </a>
  )
}
