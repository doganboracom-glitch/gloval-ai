/**
 * schema.org BreadcrumbList (Home > page) as a script-safe JSON string.
 * `<` is escaped so page names can never close the surrounding script tag.
 */
export function buildBreadcrumbJsonLd(input: {
  origin: string
  homeName: string
  pageName: string
  pagePath: string
}): string {
  const origin = input.origin.replace(/\/+$/, '')
  const path = input.pagePath.startsWith('/') ? input.pagePath : `/${input.pagePath}`
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: input.homeName, item: origin },
      { '@type': 'ListItem', position: 2, name: input.pageName, item: `${origin}${path}` },
    ],
  }).replace(/</g, '\\u003c')
}

const safeJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

/** BreadcrumbList for any depth: Home > list page > item page. */
export function buildBreadcrumbTrailJsonLd(input: {
  origin: string
  trail: Array<{ name: string; path: string }>
}): string {
  const origin = input.origin.replace(/\/+$/, '')
  return safeJson({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: input.trail.map((entry, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: entry.name,
      item: entry.path === '' ? origin : `${origin}${entry.path.startsWith('/') ? entry.path : `/${entry.path}`}`,
    })),
  })
}

/**
 * schema.org Service for one service page. Only fields the owner really
 * provided are emitted: name and url always, description and image only when
 * there is real text/a real picture. Never a price, area, rating or offer.
 * Returns null when there is no real description to describe the service.
 */
export function buildServiceJsonLd(input: {
  origin: string
  url: string
  name: string
  description: string
  imageSrc?: string | null
  providerName: string
}): string | null {
  const description = input.description.replace(/\s+/g, ' ').trim()
  if (!input.name.trim() || !description) return null
  const origin = input.origin.replace(/\/+$/, '')
  const image = input.imageSrc?.trim()
  return safeJson({
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: input.name.trim(),
    description,
    url: input.url,
    provider: { '@type': 'Organization', name: input.providerName, url: origin },
    ...(image ? { image: image.startsWith('http') ? image : `${origin}${image.startsWith('/') ? '' : '/'}${image}` } : {}),
  })
}
