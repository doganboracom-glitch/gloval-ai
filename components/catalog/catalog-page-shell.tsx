import type { ReactNode } from 'react'
import { StoreSiteShell } from '@/components/store/store-site-shell'
import { getSiteBlogData } from '@/lib/blog-server'
import type { PublicCatalog } from '@/lib/catalog-public-server'

export async function CatalogPageShell({ catalog, children }: { catalog: PublicCatalog; children: ReactNode }) {
  return (
    <StoreSiteShell
      site={catalog.site.schema}
      slug={catalog.slug}
      mode="catalog"
      whatsappNumber={catalog.whatsappNumber}
      origin={catalog.origin}
      blog={await getSiteBlogData(catalog.slug)}
    >
      {children}
    </StoreSiteShell>
  )
}
