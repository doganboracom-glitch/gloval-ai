import type { StoreCollection, StoreProduct } from '@/lib/store'

export const SORT_VALUES = ['yeni', 'artan', 'azalan', 'indirim'] as const
export type SortValue = (typeof SORT_VALUES)[number]

export const MAX_QUERY_LENGTH = 80
export const MAX_PRICE_TL = 10_000_000
export const MAX_CLIENT_PRODUCTS = 500
export const PAGE_SIZE = 24

export type DiscoveryFilters = {
  q: string
  kategori: string
  koleksiyon: string
  sirala: '' | SortValue
  min: string
  max: string
  indirim: boolean
  stok: boolean
}

export const DEFAULT_FILTERS: DiscoveryFilters = {
  q: '',
  kategori: '',
  koleksiyon: '',
  sirala: '',
  min: '',
  max: '',
  indirim: false,
  stok: false,
}

export type KnownValues = { categories: readonly string[]; collections: readonly string[] }
type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

/** Lowercase, Turkish-aware (ı/İ/I all fold to "i"), diacritics removed. */
export function foldText(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** A price in TL as typed ("12", "12,5", "12.50"); null when not a plain non-negative number. */
export function parsePriceTl(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) && value <= MAX_PRICE_TL ? value : null
}

function readParam(source: ParamSource, key: string): string {
  const raw = source instanceof URLSearchParams ? source.get(key) : source[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' ? value : ''
}

export function parseFilters(source: ParamSource, known: KnownValues): DiscoveryFilters {
  const q = readParam(source, 'q').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH)
  const kategori = readParam(source, 'kategori')
  const koleksiyon = readParam(source, 'koleksiyon')
  const sirala = readParam(source, 'sirala')

  let min = parsePriceTl(readParam(source, 'min'))
  let max = parsePriceTl(readParam(source, 'max'))
  if (min !== null && max !== null && min > max) [min, max] = [max, min]

  return {
    q,
    kategori: known.categories.includes(kategori) ? kategori : '',
    koleksiyon: known.collections.includes(koleksiyon) ? koleksiyon : '',
    sirala: (SORT_VALUES as readonly string[]).includes(sirala) ? (sirala as SortValue) : '',
    min: min === null ? '' : String(min),
    max: max === null ? '' : String(max),
    indirim: readParam(source, 'indirim') === '1',
    stok: readParam(source, 'stok') === '1',
  }
}

/** Query string (no leading "?") holding only non-default values. */
export function serializeFilters(filters: DiscoveryFilters): string {
  const params = new URLSearchParams()
  const q = filters.q.trim().slice(0, MAX_QUERY_LENGTH)
  if (q) params.set('q', q)
  if (filters.kategori) params.set('kategori', filters.kategori)
  if (filters.koleksiyon) params.set('koleksiyon', filters.koleksiyon)
  if (filters.sirala) params.set('sirala', filters.sirala)
  if (filters.min) params.set('min', filters.min)
  if (filters.max) params.set('max', filters.max)
  if (filters.indirim) params.set('indirim', '1')
  if (filters.stok) params.set('stok', '1')
  return params.toString()
}

/** Anything non-default, including a non-default sort order. */
export function hasActiveFilters(filters: DiscoveryFilters): boolean {
  return (
    filters.q.trim() !== '' ||
    filters.kategori !== '' ||
    filters.koleksiyon !== '' ||
    filters.sirala !== '' ||
    filters.min !== '' ||
    filters.max !== '' ||
    filters.indirim ||
    filters.stok
  )
}

/** Price bounds in cents. Invalid or reversed input never hides the whole catalog. */
export function priceRangeCents(filters: Pick<DiscoveryFilters, 'min' | 'max'>): {
  min: number
  max: number
} {
  const min = parsePriceTl(filters.min)
  const max = parsePriceTl(filters.max)
  const lo = min !== null && max !== null ? Math.min(min, max) : min
  const hi = min !== null && max !== null ? Math.max(min, max) : max
  return {
    min: lo === null ? 0 : Math.round(lo * 100),
    max: hi === null ? Number.POSITIVE_INFINITY : Math.round(hi * 100),
  }
}

function hasDiscount(p: StoreProduct): boolean {
  return typeof p.compare_at_price_cents === 'number' && p.compare_at_price_cents > p.price_cents
}

function discountRatio(p: StoreProduct): number {
  return hasDiscount(p)
    ? ((p.compare_at_price_cents as number) - p.price_cents) / (p.compare_at_price_cents as number)
    : 0
}

export function matchesQuery(p: StoreProduct, query: string): boolean {
  const tokens = foldText(query).split(' ').filter(Boolean)
  if (tokens.length === 0) return true
  const haystack = foldText([p.name, p.description ?? '', p.category_name ?? '', p.sku ?? ''].join(' '))
  return tokens.every((token) => haystack.includes(token))
}

export function applyDiscovery(
  products: readonly StoreProduct[],
  filters: DiscoveryFilters,
  collections: readonly StoreCollection[],
): StoreProduct[] {
  const collection = filters.koleksiyon
    ? collections.find((c) => c.slug === filters.koleksiyon)
    : undefined
  const rank = collection ? new Map(collection.product_ids.map((id, i) => [id, i])) : null
  const { min, max } = priceRangeCents(filters)

  const result = products.filter(
    (p) =>
      matchesQuery(p, filters.q) &&
      (!filters.kategori || p.category_name === filters.kategori) &&
      (!rank || rank.has(p.id)) &&
      p.price_cents >= min &&
      p.price_cents <= max &&
      (!filters.indirim || hasDiscount(p)) &&
      (!filters.stok || p.stock > 0),
  )

  switch (filters.sirala) {
    case 'yeni':
      return result.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    case 'artan':
      return result.sort((a, b) => a.price_cents - b.price_cents)
    case 'azalan':
      return result.sort((a, b) => b.price_cents - a.price_cents)
    case 'indirim':
      return result.sort((a, b) => discountRatio(b) - discountRatio(a))
    default:
      // "Önerilen": inside a collection, the owner's (or best-seller) order.
      return rank
        ? result.sort((a, b) => (rank.get(a.id) as number) - (rank.get(b.id) as number))
        : result
  }
}

export function categoryNames(products: readonly StoreProduct[]): string[] {
  const names = new Set<string>()
  for (const p of products) if (p.category_name) names.add(p.category_name)
  return [...names].sort((a, b) => a.localeCompare(b, 'tr'))
}
