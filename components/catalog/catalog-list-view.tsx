import { CatalogCard } from '@/components/catalog/catalog-card'
import { catalogCategoryPath, catalogListPath, type CatalogGroup } from '@/lib/catalog-public'

/** `/urunlerimiz` (all categories) and `/urunlerimiz/<kategori>` (one category). */
export function CatalogListView({
  storeName,
  groups,
  activeSlug,
}: {
  storeName: string
  groups: CatalogGroup[]
  activeSlug?: string
}) {
  const visible = activeSlug ? groups.filter((g) => g.slug === activeSlug) : groups
  const title = activeSlug ? visible[0]?.name ?? 'Ürünlerimiz' : 'Ürünlerimiz'
  const chip = 'inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 md:py-10">
      <nav aria-label="Kırıntı yolu" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-x-2">
          <li><a href="/" className="hover:underline">Ana sayfa</a></li>
          <li aria-hidden>›</li>
          {activeSlug ? (
            <>
              <li><a href={catalogListPath()} className="hover:underline">Ürünlerimiz</a></li>
              <li aria-hidden>›</li>
              <li aria-current="page" className="text-foreground">{title}</li>
            </>
          ) : (
            <li aria-current="page" className="text-foreground">Ürünlerimiz</li>
          )}
        </ol>
      </nav>

      <header className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--site-primary, var(--primary))' }}>{storeName}</p>
        <h1 className="text-balance text-3xl font-bold md:text-4xl" style={{ fontFamily: 'var(--site-heading-font, inherit)' }}>{title}</h1>
      </header>

      {groups.length > 1 && (
        <nav aria-label="Kategoriler" className="flex flex-wrap gap-2">
          <a href={catalogListPath()} aria-current={activeSlug ? undefined : 'page'} className={`${chip} ${activeSlug ? 'border-border' : 'border-transparent'}`} style={activeSlug ? undefined : { backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' }}>
            Tümü
          </a>
          {groups.map((group) => {
            const current = group.slug === activeSlug
            return (
              <a key={group.slug} href={catalogCategoryPath(group.slug)} aria-current={current ? 'page' : undefined} className={`${chip} ${current ? 'border-transparent' : 'border-border'}`} style={current ? { backgroundColor: 'var(--site-primary, var(--primary))', color: 'var(--site-primary-fg, var(--primary-foreground))' } : undefined}>
                {group.name} <span className="ms-1.5 text-xs opacity-70">{group.items.length}</span>
              </a>
            )
          })}
        </nav>
      )}

      {visible.length === 0 ? (
        <p className="rounded-[var(--site-radius,1rem)] border border-dashed border-border p-10 text-center text-muted-foreground">
          Henüz ürün eklenmedi.
        </p>
      ) : (
        visible.map((group) => (
          <section key={group.slug} aria-labelledby={`cat-${group.slug}`} className="flex flex-col gap-4">
            {!activeSlug && (
              <h2 id={`cat-${group.slug}`} className="text-xl font-bold">
                <a href={catalogCategoryPath(group.slug)} className="hover:underline">{group.name}</a>
              </h2>
            )}
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {group.items.map((item) => (
                <li key={item.id}><CatalogCard item={item} /></li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
