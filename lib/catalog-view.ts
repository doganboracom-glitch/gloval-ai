import { catalogListPath } from '@/lib/catalog-public'
import { dictionary, toBilingual, type Dict, type Lang } from '@/lib/i18n'

export const CATALOG_PAGE_SIZE = 12

export type CatalogLabels = Dict['catalog']

export function catalogLabels(lang: Lang): CatalogLabels {
  return dictionary[toBilingual(lang)].catalog
}

export function fillLabel(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''))
}

/** `?sayfa=` -> a 1-based page number; anything invalid is page 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n : 1
}

export function paginate<T>(items: T[], page: number, size: number = CATALOG_PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, totalPages)
  return { items: items.slice((current - 1) * size, current * size), page: current, totalPages, total: items.length }
}

/** `/urunlerimiz/<kategori>` + `?sayfa=N` (page 1 has no query, so it is its own canonical). */
export function catalogPageHref(basePath: string, page: number): string {
  return page > 1 ? `${basePath}?sayfa=${page}` : basePath
}

type HeroLike = { type: string; image?: { src?: string }; slides?: { src?: string }[] }

/** First resolved hero image of the site, used behind the catalog title band. */
export function findHeroImage(schema: { sections: unknown[]; pages?: { sections?: unknown[] }[] }): string | null {
  const lists = [schema.sections, ...(schema.pages ?? []).map((p) => p.sections ?? [])]
  for (const sections of lists) {
    for (const section of sections as HeroLike[]) {
      if (section.type !== 'hero') continue
      const src = section.image?.src ?? section.slides?.find((s) => s.src)?.src
      if (src) return src
    }
  }
  return null
}

export { catalogListPath }
