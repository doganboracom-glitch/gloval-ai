/** First letter of the product name for the themed no-image placeholder ('' when there is none). */
export function placeholderInitial(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim().replace(/^[^\p{L}\p{N}]+/u, ''))[0]
  return first ? first.toLocaleUpperCase('tr') : ''
}

/** True when the product has no usable image URL. */
export function lacksImage(product: { images?: ReadonlyArray<{ url?: string | null }> | null }): boolean {
  return !product.images?.some((image) => !!image?.url)
}
