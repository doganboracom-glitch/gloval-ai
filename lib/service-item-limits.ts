/**
 * Single source of truth for the length limits of the service-page fields
 * (item slug / alt / SEO text / detail blocks, list-page heading and CTA).
 * The schema, the edit operations, the editor and the background writer all
 * read these numbers, so a limit can only ever change in this file.
 * Leaf module on purpose: it imports nothing, so the schema can use it
 * without creating an import cycle.
 */
export const SERVICE_ITEM_LIMITS = {
  slug: 80,
  alt: 200,
  seoTitle: 120,
  seoDescription: 320,
  blocks: 12,
} as const

export const SERVICE_LIST_LIMITS = {
  linkLabel: 60,
  heading: 140,
  ctaTitle: 140,
  ctaText: 300,
  ctaLabel: 60,
} as const
