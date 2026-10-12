import { PRODUCT_IMAGE_LIMITS } from '@/lib/product-images'

/** Client-safe pieces of the image assistant (no sharp, no server-only imports). */

export const IMAGE_STYLES = [
  {
    id: 'white-studio',
    label: 'Beyaz stüdyo',
    description: 'Temiz beyaz fon, yumuşak ışık',
    scene: 'clean seamless pure white studio backdrop, soft even light, subtle natural contact shadow',
  },
  {
    id: 'lifestyle',
    label: 'Yaşam tarzı',
    description: 'Ürüne uygun gerçekçi ortam',
    scene:
      'natural everyday setting that suits this kind of product, shallow depth of field, warm realistic light, uncluttered',
  },
  {
    id: 'dark-luxury',
    label: 'Koyu lüks',
    description: 'Koyu yüzey, dramatik ışık',
    scene: 'dark matte surface and deep charcoal backdrop, dramatic low-key lighting with soft highlights, premium look',
  },
  {
    id: 'natural-light',
    label: 'Doğal ışık',
    description: 'Pencere ışığı, açık tonlar',
    scene: 'bright window daylight on a light neutral surface, soft shadows, airy natural tones',
  },
] as const

export type ImageStyleId = (typeof IMAGE_STYLES)[number]['id']

export function isImageStyleId(value: unknown): value is ImageStyleId {
  return IMAGE_STYLES.some((style) => style.id === value)
}

/** Whether one more image fits in a gallery that currently holds `count` images. */
export function canAddToGallery(count: unknown): boolean {
  return typeof count === 'number' && Number.isInteger(count) && count >= 0 && count < PRODUCT_IMAGE_LIMITS.maxCount
}

/**
 * Alt text for an accepted image: the source image's description when it has one
 * (the text assistant fills those in when its alt suggestions are applied), else
 * the product name. Markup is stripped and the length capped like any saved alt.
 */
export function pickAcceptedAlt(sourceAlt: unknown, productName: unknown): string {
  const clean = (value: unknown) =>
    typeof value === 'string' ? value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim() : ''
  const chosen = clean(sourceAlt) || clean(productName)
  return chosen.slice(0, PRODUCT_IMAGE_LIMITS.maxAlt).trim()
}
