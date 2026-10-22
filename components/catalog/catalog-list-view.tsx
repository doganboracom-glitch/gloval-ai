import { CatalogCard } from '@/components/catalog/catalog-card'
import { catalogCategoryPath, catalogListPath, type CatalogGroup } from '@/lib/catalog-public'
import { catalogPageHref, fillLabel, paginate, type CatalogLabels } from '@/lib/catalog-view'

const primary = { backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }

function TitleBand({ title, storeName, heroImage, children }: { title: string; storeName: string; heroImage: string | null; children: React.ReactNode }) {
  return (
    <header
      className="relative isolate overflow-hidden"
      style={heroImage ? undefined : { backgroundImage: 'linear-gradient(135deg, var(--site-primary, var(--primary)), color-mix(in oklab, var(--site-primary, var(--primary)) 55%, black))' }}
    >
      {heroImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroImage} alt="" aria-hidden decoding="async" className="absolute inset-0 -z-20 size-full object-cover" />
      )}
      {heroImage && <div aria-hidden className="absolute inset-0 -z-10 bg-black/65" />}
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 md:py-14" style={{ color: heroImage ? '#fff' : 'var(--site-primary-fg, var(--primary-foreground))' }}>
        {children}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{storeName}</p>
        <h1 className="text-balance text-3xl font-bold md:text-5xl" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>{title}</h1>
      </div>
    </header>
  )
}

function CategoryCard({ group, labels }: { group: CatalogGroup; labels: CatalogLabels }) {
  const image = group.items.find((item) => item.images[0])?.images[0]
  return (
    <a
      href={catalogCategoryPath(group.slug)}
      className="group relative isolate flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-[var(--site-radius,1rem)] border border-border p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={image ? { color: '#fff' } : { ...primary, backgroundImage: 'linear-gradient(135deg, var(--site-primary, var(--primary)), color-mix(in oklab, var(--site-primary, var(--primary)) 60%, black))' }}
    >
      {image && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 -z-20 size-full object-cover transition-transform duration-300 group-hover:scale-105" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        </>
      )}
      <span className="text-balance text-lg font-bold leading-snug">{group.name}</span>
      <span className="text-xs opacity-85">{fillLabel(labels.productCount, { count: group.items.length })}</span>
    </a>
  )
}

function Pagination({ basePath, page, totalPages, labels }: { basePath: string; page: number; totalPages: number; labels: CatalogLabels }) {
  if (totalPages <= 1) return null
  const link = 'inline-flex min-h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium'
  return (
    <nav aria-label={labels.pagination} className="flex flex-wrap items-center justify-center gap-2 pt-4">
      {page > 1 && <a href={catalogPageHref(basePath, page - 1)} rel="prev" className={`${link} border-border`}>{labels.prev}</a>}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <a
          key={n}
          href={catalogPageHref(basePath, n)}
          aria-current={n === page ? 'page' : undefined}
          aria-label={fillLabel(labels.page, { n })}
          className={`${link} ${n === page ? 'border-transparent' : 'border-border'}`}
          style={n === page ? primary : undefined}
        >
          {n}
        </a>
      ))}
      {page < totalPages && <a href={catalogPageHref(basePath, page + 1)} rel="next" className={`${link} border-border`}>{labels.next}</a>}
    </nav>
  )
}

/** `/urunlerimiz` (all categories) and `/urunlerimiz/<kategori>` (one category). */
export function CatalogListView({
  storeName,
  groups,
  activeSlug,
  labels,
  page,
  heroImage,
  homeHref = '/',
}: {
  storeName: string
  groups: CatalogGroup[]
  activeSlug?: string
  labels: CatalogLabels
  page: number
  heroImage: string | null
  homeHref?: string
}) {
  const active = activeSlug ? groups.find((g) => g.slug === activeSlug) : undefined
  const items = (active ? [active] : groups).flatMap((g) => g.items)
  const title = active?.name ?? labels.title
  const basePath = active ? catalogCategoryPath(active.slug) : catalogListPath()
  const paged = paginate(items, page)
  const totalAll = groups.reduce((sum, g) => sum + g.items.length, 0)
  const chip = 'flex min-h-10 items-center justify-between gap-3 rounded-[var(--site-radius,0.75rem)] border px-3 text-sm font-medium'

  return (
    <div className="flex flex-col">
      <TitleBand title={title} storeName={storeName} heroImage={heroImage}>
        <nav aria-label={labels.breadcrumb} className="text-sm opacity-85">
          <ol className="flex flex-wrap items-center gap-x-2">
            <li><a href={homeHref} className="hover:underline">{labels.home}</a></li>
            <li aria-hidden>›</li>
            {active ? (
              <>
                <li><a href={catalogListPath()} className="hover:underline">{labels.title}</a></li>
                <li aria-hidden>›</li>
                <li aria-current="page" className="font-semibold">{active.name}</li>
              </>
            ) : (
              <li aria-current="page" className="font-semibold">{labels.title}</li>
            )}
          </ol>
        </nav>
      </TitleBand>

      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:py-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        {groups.length > 0 && (
          <aside aria-label={labels.categories} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{labels.categories}</h2>
            <ul className="flex flex-col gap-2">
              <li>
                <a href={catalogListPath()} aria-current={active ? undefined : 'page'} className={`${chip} ${active ? 'border-border' : 'border-transparent'}`} style={active ? undefined : primary}>
                  <span>{labels.all}</span><span className="text-xs opacity-70">{totalAll}</span>
                </a>
              </li>
              {groups.map((group) => {
                const current = group.slug === activeSlug
                return (
                  <li key={group.slug}>
                    <a href={catalogCategoryPath(group.slug)} aria-current={current ? 'page' : undefined} className={`${chip} ${current ? 'border-transparent' : 'border-border'}`} style={current ? primary : undefined}>
                      <span>{group.name}</span><span className="text-xs opacity-70">{group.items.length}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </aside>
        )}

        <div className="flex min-w-0 flex-col gap-8">
          {!active && groups.length > 1 && page === 1 && (
            <section aria-label={labels.categories}>
              <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {groups.map((group) => (
                  <li key={group.slug}><CategoryCard group={group} labels={labels} /></li>
                ))}
              </ul>
            </section>
          )}

          {items.length === 0 ? (
            <p className="rounded-[var(--site-radius,1rem)] border border-dashed border-border p-10 text-center text-muted-foreground">{labels.empty}</p>
          ) : (
            <section className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{fillLabel(labels.showing, { count: items.length })}</p>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {paged.items.map((item) => (
                  <li key={item.id}><CatalogCard item={item} askLabel={labels.askPrice} /></li>
                ))}
              </ul>
              <Pagination basePath={basePath} page={paged.page} totalPages={paged.totalPages} labels={labels} />
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
