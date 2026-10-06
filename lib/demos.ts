import type { Lang } from '@/lib/i18n'
import { pickLang, toBilingual } from '@/lib/i18n'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'
import { demoImages, applyDemoImages } from '@/lib/demo-images'
import { getCatalog } from '@/lib/demo-catalog'

/**
 * Showcase demos
 * --------------
 * A curated set of example businesses that power both the landing-page
 * Showcase grid and the fully rendered `/demo/[slug]` preview pages.
 *
 * Each demo carries a bilingual `prompt`. The demo pages feed that prompt into
 * the SAME deterministic `fallbackWebsite` pipeline the product uses, so every
 * card links to a real, working site rendered by `WebsiteRenderer` — not a
 * static screenshot. Quoted brand names in the prompt produce clean titles.
 */

export type Demo = {
  slug: string
  brand: { tr: string; en: string }
  tag: { tr: string; en: string }
  description: { tr: string; en: string }
  prompt: { tr: string; en: string }
}

export const demos: Demo[] = [
  {
    slug: 'kahve',
    brand: { tr: 'Kahve Durağı', en: 'Roast House' },
    tag: { tr: 'Kahve Dükkanı', en: 'Coffee Shop' },
    description: {
      tr: 'Modern üçüncü nesil kahve dükkanı için sıcak ve davetkâr bir site.',
      en: 'A warm, inviting site for a modern third-wave coffee shop.',
    },
    prompt: {
      tr: '"Kahve Durağı" için modern, üçüncü nesil bir kahve dükkanı web sitesi: menü, hikayemiz ve rezervasyon.',
      en: 'A modern third-wave coffee shop website for "Roast House": menu, our story and reservations.',
    },
  },
  {
    slug: 'mimarlik',
    brand: { tr: 'Atölye Mimarlık', en: 'Atelier Studio' },
    tag: { tr: 'Mimarlık Ofisi', en: 'Architecture' },
    description: {
      tr: 'Premium bir mimarlık ofisi için minimal, editoryal proje portföyü.',
      en: 'A minimal, editorial project portfolio for a premium architecture studio.',
    },
    prompt: {
      tr: '"Atölye Mimarlık" için premium bir mimarlık ofisi web sitesi: projeler, süreç ve ekip.',
      en: 'A premium architecture studio website for "Atelier Studio": projects, process and team.',
    },
  },
  {
    slug: 'dis-klinigi',
    brand: { tr: 'Denta Estetik', en: 'Denta Care' },
    tag: { tr: 'Diş Kliniği', en: 'Dental Clinic' },
    description: {
      tr: 'Modern bir diş kliniği için güven veren, temiz ve klinik bir tasarım.',
      en: 'A reassuring, clean, clinical design for a modern dental clinic.',
    },
    prompt: {
      tr: '"Denta Estetik" için modern bir diş kliniği web sitesi: tedaviler, doktorlar ve randevu.',
      en: 'A modern dental clinic website for "Denta Care": treatments, doctors and appointments.',
    },
  },
  {
    slug: 'emlak',
    brand: { tr: 'Emlak Vizyon', en: 'Vista Realty' },
    tag: { tr: 'Gayrimenkul', en: 'Real Estate' },
    description: {
      tr: 'Bir gayrimenkul ofisi için modern, güven veren ve profesyonel bir site.',
      en: 'A modern, trustworthy and professional site for a real estate agency.',
    },
    prompt: {
      tr: '"Emlak Vizyon" için modern bir gayrimenkul ve emlak ofisi web sitesi: ilanlar, hizmetler ve iletişim.',
      en: 'A modern real estate agency website for "Vista Realty": listings, services and contact.',
    },
  },
  {
    slug: 'guzellik',
    brand: { tr: 'Zarafet Güzellik', en: 'Lumière Beauty' },
    tag: { tr: 'Güzellik & Bakım', en: 'Beauty & Care' },
    description: {
      tr: 'Güzellik ve bakım salonu için zarif, premium ve davetkâr bir tasarım.',
      en: 'An elegant, premium and inviting design for a beauty and wellness salon.',
    },
    prompt: {
      tr: '"Zarafet Güzellik" için zarif bir güzellik ve bakım salonu web sitesi: hizmetler, galeri ve randevu.',
      en: 'An elegant beauty and wellness salon website for "Lumière Beauty": services, gallery and booking.',
    },
  },
  {
    slug: 'hukuk',
    brand: { tr: 'Adalet Hukuk', en: 'Meridian Law' },
    tag: { tr: 'Hukuk Bürosu', en: 'Law Firm' },
    description: {
      tr: 'Bir hukuk bürosu için kurumsal, ciddi ve güven veren bir site.',
      en: 'A corporate, serious and trustworthy site for a law firm.',
    },
    prompt: {
      tr: '"Adalet Hukuk" için kurumsal bir hukuk bürosu web sitesi: uzmanlık alanları, süreç ve ekip.',
      en: 'A corporate law firm website for "Meridian Law": practice areas, process and team.',
    },
  },
  {
    slug: 'restoran',
    brand: { tr: 'Lezzet Durağı', en: 'Savor Kitchen' },
    tag: { tr: 'Restoran', en: 'Restaurant' },
    description: {
      tr: 'Modern bir restoran için sıcak, iştah açıcı ve şık bir tasarım.',
      en: 'A warm, appetizing and elegant design for a modern restaurant.',
    },
    prompt: {
      tr: '"Lezzet Durağı" için modern bir restoran web sitesi: menü, galeri ve rezervasyon.',
      en: 'A modern restaurant website for "Savor Kitchen": menu, gallery and reservations.',
    },
  },
  {
    slug: 'eticaret',
    brand: { tr: 'Vitrin Studio', en: 'Vitrin Studio' },
    tag: { tr: 'E-Ticaret', en: 'E-Commerce' },
    description: {
      tr: 'Kaydırmalı vitrin, kategoriler ve ürünlerle tam donanımlı bir online mağaza.',
      en: 'A full online store with a hero slider, categories and products.',
    },
    prompt: {
      tr: '"Vitrin Studio" için profesyonel bir e-ticaret mağazası: kaydırmalı vitrin, kategoriler, ürünler ve kampanyalar.',
      en: 'A professional e-commerce store for "Vitrin Studio": hero slider, categories, products and deals.',
    },
  },
]

export function getDemo(slug: string): Demo | undefined {
  return demos.find((d) => d.slug === slug)
}

export const demoSlugs = demos.map((d) => d.slug)

/**
 * Builds the full, renderable website schema for a demo in the given language,
 * then attaches the demo's canonical images so the rendered site matches its
 * Showcase card instead of showing gradient placeholders.
 */
export function buildDemoSite(demo: Demo, lang: Lang): WebsiteSchema {
  const site = fallbackWebsite(pickLang(demo.prompt, lang), toBilingual(lang))
  applyDemoImages(site, demoImages[demo.slug])
  customizeDemoSite(site, demo.slug, lang)
  return site
}

/**
 * Demo-only routing overrides. The sector builders stay fully generic (so real
 * product sites never get demo-specific links); all wiring to the bespoke demo
 * sub-routes (catalog, services, contact) is applied here, at the demo layer,
 * driven by the shared demo catalog so every demo behaves consistently.
 */
function customizeDemoSite(site: WebsiteSchema, slug: string, lang: Lang): void {
  const catalog = getCatalog(slug)
  if (!catalog) return

  const productsHref = catalog.productsHref(lang)
  const servicesHref = `/demo/${slug}/hizmetler?lang=${lang}`
  const contactHref = `/demo/${slug}/iletisim?lang=${lang}`

  // Collapse to a single home page so the real-route nav links render (the
  // multi-page renderer hides nav links behind client-side page switching).
  site.pages = [{ slug: 'home', title: site.navigation.logoText, isHome: true }]

  site.navigation.links = [
    { label: lang === 'tr' ? 'Ana Sayfa' : 'Home', href: '#hero' },
    { label: pickLang(catalog.productsLabel, lang), href: productsHref },
    { label: pickLang(catalog.servicesLabel, lang), href: servicesHref },
    { label: lang === 'tr' ? 'İletişim' : 'Contact', href: contactHref },
  ]
  if (site.navigation.cta) {
    site.navigation.cta.href = contactHref
    site.navigation.cta.label = pickLang(catalog.primaryCtaLabel, lang)
  }

  // Point the hero's primary CTA at the catalog (menu/listings/packages...) and
  // the secondary CTA at contact, so the landing page's main actions work.
  const hero = site.sections.find((s) => s.type === 'hero')
  if (hero && hero.type === 'hero') {
    if (hero.primaryButton) hero.primaryButton.href = productsHref
    if (hero.secondaryButton) hero.secondaryButton.href = contactHref
  }

  // Wire common section CTAs (contact/cta sections) to the contact route.
  for (const section of site.sections) {
    if (section.type === 'cta') {
      if (section.primaryButton) section.primaryButton.href = contactHref
      if (section.secondaryButton) section.secondaryButton.href = productsHref
    }
  }

  // Point the slider hero's per-slide buttons at the real catalog listing so
  // every slide's call-to-action navigates to a working page.
  if (hero && hero.type === 'hero' && hero.slides?.length) {
    for (const slide of hero.slides) {
      if (slide.primaryButton) slide.primaryButton.href = productsHref
      if (slide.secondaryButton) slide.secondaryButton.href = productsHref
    }
  }

  // Map the homepage product cards onto the real demo catalog so each card
  // shows a real product (name/price/image) and links to its working detail
  // page. A running cursor spreads products across the multiple product blocks
  // (featured grid, then deals carousel) so they never repeat back to back.
  const catalogProducts = catalog.products
  if (catalog.commerce && catalogProducts.length > 0) {
    let cursor = 0
    for (const section of site.sections) {
      if (section.type === 'products') {
        for (const item of section.items) {
          const product = catalogProducts[cursor % catalogProducts.length]
          cursor++
          item.name = pickLang(product.name, lang)
          item.href = `/demo/${slug}/urun/${product.slug}?lang=${lang}`
          item.src = product.image
          item.category = product.category ? pickLang(product.category, lang) : item.category
          if (product.price) item.price = pickLang(product.price, lang)
          if (product.oldPrice) {
            item.oldPrice = pickLang(product.oldPrice, lang)
            item.badge = discountBadge(
              product.price ? pickLang(product.price, lang) : undefined,
              pickLang(product.oldPrice, lang),
            )
          } else {
            // Avoid a misleading discount badge on a full-price product.
            item.oldPrice = undefined
            item.badge = undefined
          }
        }
      } else if (section.type === 'categories') {
        // Categories link into the product listing.
        for (const item of section.items) {
          item.href = productsHref
        }
      }
    }

    // Add a SECOND, standalone slider (distinct from the hero) as a promo
    // carousel built from real catalog products, placed right after the hero so
    // the storefront opens with a rotating campaign band. Demo-only: real sites
    // add sliders through the editor/AI, never through this demo wiring.
    if (!site.sections.some((s) => s.type === 'slider')) {
      const featured = catalogProducts.slice(0, 4)
      if (featured.length > 0) {
        const slides = featured.map((product) => ({
          caption: product.category ? pickLang(product.category, lang) : pickLang(catalog.productsLabel, lang),
          title: pickLang(product.name, lang),
          description: product.price
            ? `${pickLang(product.price, lang)}${product.oldPrice ? ` · ${lang === 'tr' ? 'İndirimde' : 'On sale'}` : ''}`
            : undefined,
          buttonText: lang === 'tr' ? 'İncele' : 'View',
          href: `/demo/${slug}/urun/${product.slug}?lang=${lang}`,
          imagePrompt: pickLang(product.name, lang),
          src: product.image,
          alt: pickLang(product.name, lang),
        }))
        const heroIndex = site.sections.findIndex((s) => s.type === 'hero')
        const insertAt = heroIndex === -1 ? 0 : heroIndex + 1
        site.sections.splice(insertAt, 0, {
          type: 'slider',
          variant: 'card',
          title: lang === 'tr' ? 'Öne çıkanlar' : 'Highlights',
          subtitle: lang === 'tr' ? 'Kampanyalı ve yeni ürünler' : 'Deals & new arrivals',
          slides,
        })
      }
    }
  }
}

/** Builds a "%NN" discount badge from localized price strings, or undefined. */
function discountBadge(price?: string, oldPrice?: string): string | undefined {
  const toNumber = (s?: string) => {
    if (!s) return NaN
    const cleaned = s.replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
    return parseFloat(cleaned)
  }
  const now = toNumber(price)
  const was = toNumber(oldPrice)
  if (!Number.isFinite(now) || !Number.isFinite(was) || was <= now || was <= 0) return undefined
  const pct = Math.round((1 - now / was) * 100)
  return pct > 0 ? `%${pct}` : undefined
}
