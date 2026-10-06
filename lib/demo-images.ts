import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Canonical demo imagery
 * -----------------------
 * Real, on-brand images that live under `public/demos/<slug>/`. They are the
 * single source of truth for every image shown inside a `/demo/[slug]` page,
 * so the rendered demo matches the polished Showcase card instead of falling
 * back to gradient placeholders.
 *
 * `applyDemoImages` walks the deterministic schema produced by
 * `buildSectorSite` and attaches a resolved `src` to each image-bearing block
 * (hero, gallery, portfolio, team) by position. Any block without a mapped
 * image simply keeps the graceful gradient placeholder, so this stays fully
 * backward compatible.
 */

export type DemoImageSet = {
  hero?: string
  /** Full-bleed background images for a multi-slide (slider) hero, by order. */
  slides?: string[]
  gallery?: string[]
  portfolio?: string[]
  team?: string[]
  products?: string[]
  categories?: string[]
}

export const demoImages: Record<string, DemoImageSet> = {
  kahve: {
    hero: '/demos/kahve/hero.webp',
    gallery: [
      '/demos/kahve/g1.webp',
      '/demos/kahve/g2.webp',
      '/demos/kahve/g3.webp',
      '/demos/kahve/g4.webp',
    ],
  },
  restoran: {
    hero: '/demos/restoran/hero.webp',
    gallery: [
      '/demos/restoran/g1.webp',
      '/demos/restoran/g2.webp',
      '/demos/restoran/g3.webp',
      '/demos/restoran/g4.webp',
    ],
  },
  mimarlik: {
    hero: '/demos/mimarlik/hero.webp',
    portfolio: [
      '/demos/mimarlik/p1.webp',
      '/demos/mimarlik/p2.webp',
      '/demos/mimarlik/p3.webp',
      '/demos/mimarlik/p4.webp',
      '/demos/mimarlik/p5.webp',
      '/demos/mimarlik/p6.webp',
    ],
  },
  'dis-klinigi': {
    hero: '/demos/dis-klinigi/hero.webp',
    team: [
      '/demos/dis-klinigi/t1.webp',
      '/demos/dis-klinigi/t2.webp',
      '/demos/dis-klinigi/t3.webp',
    ],
  },
  hukuk: {
    hero: '/demos/hukuk/hero.webp',
    team: [
      '/demos/hukuk/t1.webp',
      '/demos/hukuk/t2.webp',
      '/demos/hukuk/t3.webp',
    ],
  },
  guzellik: {
    hero: '/demos/guzellik/hero.webp',
    gallery: [
      '/demos/guzellik/g1.webp',
      '/demos/guzellik/g2.webp',
      '/demos/guzellik/g3.webp',
      '/demos/guzellik/g4.webp',
    ],
  },
  eticaret: {
    hero: '/demos/eticaret/hero.webp',
    slides: [
      '/demos/eticaret/slide1.webp',
      '/demos/eticaret/slide2.webp',
      '/demos/eticaret/slide3.webp',
    ],
    categories: [
      '/demos/eticaret/c1.webp',
      '/demos/eticaret/c2.webp',
      '/demos/eticaret/c3.webp',
      '/demos/eticaret/c4.webp',
    ],
    products: [
      '/demos/eticaret/p1.webp',
      '/demos/eticaret/p2.webp',
      '/demos/eticaret/p3.webp',
      '/demos/eticaret/p4.webp',
      '/demos/eticaret/p5.webp',
      '/demos/eticaret/p6.webp',
      '/demos/eticaret/p7.webp',
      '/demos/eticaret/p8.webp',
    ],
  },
  emlak: {
    hero: '/demos/emlak/hero.webp',
    gallery: [
      '/demos/emlak/g1.webp',
      '/demos/emlak/g2.webp',
      '/demos/emlak/g3.webp',
      '/demos/emlak/g4.webp',
    ],
  },
}

/**
 * Attaches resolved image `src` values from a demo's image set onto the built
 * schema, in place. The schema passed in is always freshly built per request
 * by `buildSectorSite`, so mutating it is safe.
 */
export function applyDemoImages(
  site: WebsiteSchema,
  images?: DemoImageSet,
): WebsiteSchema {
  if (!images) return site

  let galleryIdx = 0
  let portfolioIdx = 0
  let teamIdx = 0
  let productIdx = 0
  let categoryIdx = 0

  for (const section of site.sections) {
    if (section.type === 'hero') {
      if (images.hero) {
        const existing = section.image
        section.image = {
          imagePrompt: existing?.imagePrompt ?? section.title,
          alt: existing?.alt,
          aspectRatio: existing?.aspectRatio ?? '16/9',
          position: existing?.position,
          overlay: existing?.overlay,
          src: images.hero,
        }
      }
      // Full-bleed slider slides get their own background images so the
      // rotating hero shows real photography instead of gradient backdrops.
      if (images.slides?.length && section.slides?.length) {
        section.slides.forEach((slide, i) => {
          const existing = slide.image
          slide.image = {
            imagePrompt: existing?.imagePrompt ?? slide.title,
            alt: existing?.alt,
            aspectRatio: existing?.aspectRatio ?? '16/9',
            position: existing?.position,
            overlay: existing?.overlay,
            src: images.slides![i % images.slides!.length],
          }
        })
      }
    } else if (section.type === 'slider' && images.slides?.length) {
      // The standalone (second) slider reuses the wide slide photography.
      section.slides.forEach((slide, i) => {
        slide.src = images.slides![i % images.slides!.length]
      })
    } else if (section.type === 'gallery' && images.gallery?.length) {
      for (const item of section.items) {
        item.src = images.gallery[galleryIdx % images.gallery.length]
        galleryIdx++
      }
    } else if (section.type === 'portfolio' && images.portfolio?.length) {
      for (const item of section.items) {
        item.src = images.portfolio[portfolioIdx % images.portfolio.length]
        portfolioIdx++
      }
    } else if (section.type === 'products' && images.products?.length) {
      for (const item of section.items) {
        item.src = images.products[productIdx % images.products.length]
        productIdx++
      }
    } else if (section.type === 'categories' && images.categories?.length) {
      for (const item of section.items) {
        item.src = images.categories[categoryIdx % images.categories.length]
        categoryIdx++
      }
    } else if (section.type === 'team' && images.team?.length) {
      for (const member of section.members) {
        member.src = images.team[teamIdx % images.team.length]
        teamIdx++
      }
    }
  }

  return site
}
