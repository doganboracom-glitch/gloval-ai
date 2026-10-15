/**
 * Slug rules for site pages. A page slug becomes a real URL (`/<slug>`), so it
 * must be ASCII, lowercase, dash-separated, short and must never collide with
 * a route the platform itself serves on a tenant host.
 */

export const PAGE_SLUG_MAX = 60

/** Routes a tenant host already serves; a page can never take one of these. */
export const RESERVED_PAGE_SLUGS: ReadonlySet<string> = new Set([
  'store',
  'blog',
  'checkout',
  'order',
  'hesap',
  'yasal',
  'api',
  'site',
  'sitemap.xml',
  'robots.txt',
])

const TURKISH_FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i̇: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u',
}

/** Folds Turkish characters, lowercases and dash-separates; never returns an empty string. */
export function slugifyPageSlug(input: string): string {
  const lowered = (input ?? '').toLocaleLowerCase('tr')
  const folded = Array.from(lowered)
    .map((ch) => TURKISH_FOLD[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
  const slug = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, PAGE_SLUG_MAX)
    .replace(/-+$/g, '')
  return slug || 'sayfa'
}

export function isReservedPageSlug(slug: string): boolean {
  return RESERVED_PAGE_SLUGS.has(slug.toLowerCase())
}

/**
 * A slug that is valid, not reserved and not already in `taken`. A clash gets a
 * numeric suffix (`hizmetler`, `hizmetler-2`, `hizmetler-3`...), keeping the
 * whole slug within the length limit.
 */
export function uniquePageSlug(desired: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (s) => s.toLowerCase()))
  const base = slugifyPageSlug(desired)
  const fits = (candidate: string) => !used.has(candidate) && !isReservedPageSlug(candidate)
  if (fits(base)) return base
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`
    const candidate = `${base.slice(0, PAGE_SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`
    if (fits(candidate)) return candidate
  }
  return `${base.slice(0, PAGE_SLUG_MAX - 8)}-${Date.now().toString(36)}`
}

export type SlugRedirect = { from: string; to: string }

type SlugPage = { slug: string; isHome?: boolean }

/**
 * Old-path -> new-path pairs for pages that kept their position in the list but
 * changed slug. Matching is by index first (a rename in place), which is how
 * the editor produces renames. The home page is `/` and never redirects.
 */
export function collectSlugRedirects(previous: SlugPage[], next: SlugPage[]): SlugRedirect[] {
  const out: SlugRedirect[] = []
  const nextSlugs = new Set(next.map((p) => p.slug))
  for (let i = 0; i < Math.min(previous.length, next.length); i++) {
    const before = previous[i]
    const after = next[i]
    if (before.isHome || after.isHome) continue
    if (!before.slug || before.slug === after.slug) continue
    if (nextSlugs.has(before.slug)) continue
    out.push({ from: `/${before.slug}`, to: `/${after.slug}` })
  }
  return out
}
