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
    hero: '/demos/kahve/hero.3085d2c4.webp',
    gallery: [
      '/demos/kahve/g1.e9e9cded.webp',
      '/demos/kahve/g2.986eb490.webp',
      '/demos/kahve/g3.e96921f7.webp',
      '/demos/kahve/g4.5e182192.webp',
    ],
  },
  restoran: {
    hero: '/demos/restoran/hero.0d999bfc.webp',
    gallery: [
      '/demos/restoran/g1.77b6033a.webp',
      '/demos/restoran/g2.2ae429c0.webp',
      '/demos/restoran/g3.4340bfcf.webp',
      '/demos/restoran/g4.3109bd80.webp',
    ],
  },
  mimarlik: {
    hero: '/demos/mimarlik/hero.7d45722d.webp',
    portfolio: [
      '/demos/mimarlik/p1.effec99e.webp',
      '/demos/mimarlik/p2.c2160830.webp',
      '/demos/mimarlik/p3.d039185b.webp',
      '/demos/mimarlik/p4.b36867f8.webp',
      '/demos/mimarlik/p5.9d09f813.webp',
      '/demos/mimarlik/p6.07f650d9.webp',
    ],
  },
  'dis-klinigi': {
    hero: '/demos/dis-klinigi/hero.280202f3.webp',
    team: [
      '/demos/dis-klinigi/t1.d7d7e544.webp',
      '/demos/dis-klinigi/t2.9c5503e2.webp',
      '/demos/dis-klinigi/t3.850e1dd3.webp',
    ],
  },
  hukuk: {
    hero: '/demos/hukuk/hero.23598daa.webp',
    team: [
      '/demos/hukuk/t1.ff0ae575.webp',
      '/demos/hukuk/t2.044ea0fa.webp',
      '/demos/hukuk/t3.931e9535.webp',
    ],
  },
  guzellik: {
    hero: '/demos/guzellik/hero.e6c9f6fc.webp',
    gallery: [
      '/demos/guzellik/g1.f1d9f8d1.webp',
      '/demos/guzellik/g2.2fca69c8.webp',
      '/demos/guzellik/g3.345677e5.webp',
      '/demos/guzellik/g4.4cc6242e.webp',
    ],
  },
  eticaret: {
    hero: '/demos/eticaret/hero.b20cad83.webp',
    slides: [
      '/demos/eticaret/slide1.73000c0f.webp',
      '/demos/eticaret/slide2.36d7a4f1.webp',
      '/demos/eticaret/slide3.aa8c52da.webp',
    ],
    categories: [
      '/demos/eticaret/c1.f7a31f0d.webp',
      '/demos/eticaret/c2.2320fff1.webp',
      '/demos/eticaret/c3.a482f80f.webp',
      '/demos/eticaret/c4.c4ecb8c1.webp',
    ],
    products: [
      '/demos/eticaret/p1.d84cd720.webp',
      '/demos/eticaret/p2.7491fe55.webp',
      '/demos/eticaret/p3.35593314.webp',
      '/demos/eticaret/p4.fe9c9b0f.webp',
      '/demos/eticaret/p5.024f1ef8.webp',
      '/demos/eticaret/p6.63b307f4.webp',
      '/demos/eticaret/p7.83de2a06.webp',
      '/demos/eticaret/p8.bf418c7a.webp',
    ],
  },
  emlak: {
    hero: '/demos/emlak/hero.ed7d04c8.webp',
    gallery: [
      '/demos/emlak/g1.a8cd95c3.webp',
      '/demos/emlak/g2.166a0c0f.webp',
      '/demos/emlak/g3.36fb46ab.webp',
      '/demos/emlak/g4.d6db172d.webp',
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
