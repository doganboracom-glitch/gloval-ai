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
