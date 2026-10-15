import type { StoreProduct } from '@/lib/store'

/** Prevent JSON-LD data from terminating its containing script element. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function buildProductJsonLd(product: StoreProduct, url?: string) {
  const availability = product.track_stock === false
    ? 'https://schema.org/InStock'
    : product.stock <= 0
      ? 'https://schema.org/OutOfStock'
      : 'https://schema.org/InStock'

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: product.images.map((item) => item.url),
    description: product.description ?? undefined,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(url ? { url } : {}),
    offers: {
      '@type': 'Offer',
      ...(url ? { url } : {}),
      price: (product.price_cents / 100).toFixed(2),
      priceCurrency: product.currency,
      availability,
    },
  }
}

export function productJsonLdScript(product: StoreProduct, url?: string): string {
  return safeJsonLd(buildProductJsonLd(product, url))
}
