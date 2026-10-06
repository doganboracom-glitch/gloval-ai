import { z } from 'zod'
import { buildSectorSite } from '@/lib/sector-profiles'

/**
 * WebsiteSchema
 * -------------
 * A structured, serializable representation of a generated website.
 *
 * The AI produces this JSON — never raw React/HTML. Everything downstream
 * (renderer, live preview, conversational editing, save, publish) operates on
 * this schema, which keeps the pipeline safe (no code execution) and
 * extensible (add a section type without touching the generator contract).
 */

/* -------------------------------------------------------------------------- */
/*  Primitives                                                                */
/* -------------------------------------------------------------------------- */

export const colorSchema = z.object({
  name: z.string().describe('Semantic role, e.g. "primary", "accent", "background"'),
  hex: z.string().describe('A valid hex color like #7c3aed'),
})

export const linkSchema = z.object({
  label: z.string(),
  href: z.string().describe('An in-page anchor like "#services" or a path like "/about"'),
})

export const buttonSchema = z.object({
  label: z.string(),
  href: z.string().describe('Anchor or path the button points to'),
})

/**
 * A structured image reference. The renderer shows a themed gradient
 * placeholder today, but this shape is future-proof: when a real image
 * generation API is connected, only `imagePrompt` -> `src` needs wiring, and no
 * component needs rewriting. Missing/failed images always fall back to the
 * gradient placeholder.
 */
export const imageSchema = z.object({
  imagePrompt: z.string().describe('A prompt describing the desired image'),
  /**
   * A resolved image URL/path (e.g. an https URL or a data URI). Populated
   * server-side after generation by the image provider abstraction. When
   * absent the renderer gracefully falls back to the themed gradient
   * placeholder, so this stays fully optional and backward compatible.
   */
  src: z.string().optional().describe('A resolved image URL or data URI, if generated'),
  alt: z.string().optional().describe('Accessible alt text'),
  aspectRatio: z
    .enum(['1/1', '4/3', '3/2', '16/9', '3/4', '9/16'])
    .optional()
    .describe('Preferred aspect ratio'),
  position: z
    .enum(['left', 'right', 'center', 'background'])
    .optional()
    .describe('Where the image sits relative to its section'),
  overlay: z
    .boolean()
    .optional()
    .describe('Whether a dark overlay is applied (for text over the image)'),
})

/* -------------------------------------------------------------------------- */
/*  Section content blocks (discriminated by `type`)                          */
/* -------------------------------------------------------------------------- */

/**
 * Optional editor metadata carried by every section. `hidden` lets the visual
 * editor hide a section non-destructively (so it can be shown again and the
 * change is captured by undo/redo). It is optional so every previously
 * generated schema remains valid — the renderer simply treats it as visible.
 */
const sectionEditorMeta = {
  hidden: z.boolean().optional().describe('If true, the section is hidden in the preview'),
} as const

/**
 * A single hero slide. Used only by the `slider` hero variant. Each slide is a
 * self-contained hero (own headline, copy, image and buttons) so the slider can
 * rotate through several full-bleed messages. Kept structurally close to the
 * hero itself so the renderer can treat a slide and the hero uniformly.
 */
export const heroSlideSchema = z.object({
  badge: z.string().optional(),
  title: z.string().describe('The slide headline'),
  description: z.string().optional().describe('The supporting subheadline'),
  primaryButton: buttonSchema.optional(),
  secondaryButton: buttonSchema.optional(),
  image: imageSchema.optional().describe('The structured slide image reference'),
  imagePrompt: z.string().optional().describe('Legacy simple slide image prompt'),
})

export const heroSection = z.object({
  type: z.literal('hero'),
  ...sectionEditorMeta,
  /**
   * Selects the hero layout. Optional so every previously generated schema
   * stays valid — when omitted the renderer picks a sensible default:
   * `slider` if `slides` exist, else `split` when an image is present, else
   * `centered`.
   */
  variant: z
    .enum(['split', 'centered', 'showcase', 'slider'])
    .optional()
    .describe(
      'Hero layout: "split" (text + image side by side), "centered" (text only, centered), "showcase" (full-width background image with overlaid text), or "slider" (rotating full-bleed slides).',
    ),
  badge: z.string().optional().describe('A small eyebrow/badge above the headline'),
  title: z.string().describe('The main headline'),
  description: z.string().describe('The supporting subheadline'),
  primaryButton: buttonSchema.optional(),
  secondaryButton: buttonSchema.optional(),
  trustText: z
    .string()
    .optional()
    .describe('A short trust line below the buttons, e.g. "Trusted by 500+ clients"'),
  image: imageSchema.optional().describe('The structured hero image reference'),
  imagePrompt: z
    .string()
    .optional()
    .describe('Legacy simple hero image prompt (prefer `image`)'),
  slides: z
    .array(heroSlideSchema)
    .min(1)
    .max(6)
    .optional()
    .describe('Slides for the "slider" variant. Ignored by other variants.'),
})

/**
 * A single standalone-slider slide. Unlike the hero slide (which nests a
 * structured `image`), this mirrors the flat `imagePrompt`/`src` shape used by
 * gallery/products items, so the SAME image pipeline (demo images + AI
 * generation) and the SAME generic editor (SectionInspector item cards) resolve
 * and edit its photo for free.
 */
export const sliderSlideSchema = z.object({
  caption: z.string().optional().describe('A small eyebrow/label above the slide title'),
  title: z.string().describe('The slide headline'),
  description: z.string().optional().describe('The supporting text'),
  buttonText: z.string().optional().describe('Optional call-to-action label'),
  href: z.string().optional().describe('Where the slide button points'),
  imagePrompt: z.string().describe('A prompt describing this slide background image'),
  src: z.string().optional().describe('A resolved image URL or path, if available'),
  alt: z.string().optional().describe('Accessible alt text'),
})

/**
 * A standalone content slider — a rotating band of full-width slides placed
 * ANYWHERE in the page (a "second slider", distinct from the hero's own
 * `slider` variant). Each slide carries its own image, headline and optional
 * CTA, so it doubles as a promo/campaign carousel on storefronts.
 */
export const sliderSection = z.object({
  type: z.literal('slider'),
  ...sectionEditorMeta,
  title: z.string().optional().describe('Optional heading shown above the slider'),
  subtitle: z.string().optional().describe('Optional supporting line under the heading'),
  variant: z
    .enum(['full', 'card'])
    .optional()
    .describe('"card" (contained, rounded band) or "full" (edge-to-edge). Defaults to "card".'),
  slides: z
    .array(sliderSlideSchema)
    .min(1)
    .max(8)
    .describe('The rotating slides.'),
})

export const aboutSection = z.object({
  type: z.literal('about'),
  ...sectionEditorMeta,
  title: z.string(),
  body: z.string().describe('One or two short paragraphs'),
  highlights: z.array(z.string()).max(6).optional().describe('Short bullet highlights'),
})

export const servicesSection = z.object({
  type: z.literal('services'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        icon: z.string().optional().describe('A lucide-react icon name, e.g. "sparkles"'),
      }),
    )
    .min(2)
    .max(8),
})

export const featuresSection = z.object({
  type: z.literal('features'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        icon: z.string().optional().describe('A lucide-react icon name'),
      }),
    )
    .min(2)
    .max(8),
})

export const statsSection = z.object({
  type: z.literal('stats'),
  ...sectionEditorMeta,
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        value: z.string().describe('The headline figure, e.g. "10K+", "%98", "24/7"'),
        label: z.string(),
        icon: z.string().optional().describe('A lucide-react icon name'),
      }),
    )
    .min(2)
    .max(6),
})

export const pricingSection = z.object({
  type: z.literal('pricing'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  plans: z
    .array(
      z.object({
        name: z.string(),
        price: z.string().describe('e.g. "₺499", "$29", "Ücretsiz"'),
        period: z.string().optional().describe('Billing period, e.g. "/ay", "/month"'),
        description: z.string().optional(),
        features: z.array(z.string()).min(1).max(10),
        highlighted: z.boolean().optional().describe('Marks the recommended plan'),
        buttonText: z.string().optional(),
      }),
    )
    .min(1)
    .max(4),
})

export const testimonialsSection = z.object({
  type: z.literal('testimonials'),
  ...sectionEditorMeta,
  title: z.string(),
  items: z
    .array(
      z.object({
        quote: z.string(),
        author: z.string(),
        role: z.string().optional(),
      }),
    )
    .min(1)
    .max(6),
})

export const gallerySection = z.object({
  type: z.literal('gallery'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        caption: z.string().optional(),
        imagePrompt: z.string().describe('A prompt describing this gallery image'),
        src: z.string().optional().describe('A resolved image URL or path, if available'),
        alt: z.string().optional(),
        aspectRatio: z.enum(['1/1', '4/3', '3/2', '16/9', '3/4', '9/16']).optional(),
      }),
    )
    .min(2)
    .max(12),
})

export const portfolioSection = z.object({
  type: z.literal('portfolio'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        title: z.string(),
        category: z.string().optional().describe('Project category/tag'),
        description: z.string().optional(),
        imagePrompt: z.string().describe('A prompt describing this portfolio image'),
        src: z.string().optional().describe('A resolved image URL or path, if available'),
        alt: z.string().optional(),
      }),
    )
    .min(2)
    .max(9),
})

/**
 * A product showcase — the heart of an e-commerce storefront. Each item is a
 * real product card (image, name, price, optional old price / badge / CTA).
 * `imagePrompt` + `src` mirror the gallery/portfolio shape so the same image
 * pipeline (demo images and AI generation) resolves product photos for free.
 */
export const productsSection = z.object({
  type: z.literal('products'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  /** Optional layout hint: a horizontally scrolling row vs. a wrapped grid. */
  layout: z
    .enum(['grid', 'carousel'])
    .optional()
    .describe('"grid" (wrapped card grid) or "carousel" (horizontally scrolling row)'),
  items: z
    .array(
      z.object({
        name: z.string(),
        price: z.string().describe('Display price, e.g. "₺899", "$29"'),
        oldPrice: z.string().optional().describe('Original price shown struck through, e.g. "₺1.299"'),
        badge: z.string().optional().describe('Corner badge, e.g. "Yeni", "%20", "Çok Satan"'),
        category: z.string().optional().describe('Short category/tag label'),
        description: z.string().optional().describe('A very short one-line product note'),
        imagePrompt: z.string().describe('A prompt describing this product photo'),
        src: z.string().optional().describe('A resolved image URL or path, if available'),
        alt: z.string().optional(),
        buttonText: z.string().optional().describe('Card action label, e.g. "İncele", "Sepete Ekle"'),
        href: z.string().optional().describe('Where the card/action points'),
      }),
    )
    .min(2)
    .max(12),
})

/**
 * A category grid — lets shoppers jump into a department (Kadın, Erkek,
 * Aksesuar…). Visual tiles with an image, name and optional item count.
 */
export const categoriesSection = z.object({
  type: z.literal('categories'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        count: z.string().optional().describe('Item-count label, e.g. "48 ürün", "24 products"'),
        imagePrompt: z.string().describe('A prompt describing this category image'),
        src: z.string().optional().describe('A resolved image URL or path, if available'),
        alt: z.string().optional(),
        href: z.string().optional().describe('Where the tile points'),
      }),
    )
    .min(2)
    .max(8),
})

export const processSection = z.object({
  type: z.literal('process'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        icon: z.string().optional().describe('A lucide-react icon name'),
      }),
    )
    .min(2)
    .max(6),
})

export const teamSection = z.object({
  type: z.literal('team'),
  ...sectionEditorMeta,
  title: z.string(),
  subtitle: z.string().optional(),
  members: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        bio: z.string().optional(),
        imagePrompt: z.string().optional().describe('A prompt describing this person\'s portrait'),
        src: z.string().optional().describe('A resolved portrait image URL or path, if available'),
      }),
    )
    .min(1)
    .max(8),
})

export const faqSection = z.object({
  type: z.literal('faq'),
  ...sectionEditorMeta,
  title: z.string(),
  items: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .min(2)
    .max(10),
})

export const contactSection = z.object({
  type: z.literal('contact'),
  ...sectionEditorMeta,
  title: z.string(),
  description: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  fields: z
    .array(z.string())
    .max(6)
    .optional()
    .describe('Labels for the contact form fields, e.g. ["Name", "Email", "Message"]'),
})

export const ctaSection = z.object({
  type: z.literal('cta'),
  ...sectionEditorMeta,
  title: z.string(),
  description: z.string().optional(),
  primaryButton: buttonSchema,
  secondaryButton: buttonSchema.optional(),
})

export const footerSection = z.object({
  type: z.literal('footer'),
  ...sectionEditorMeta,
  tagline: z.string().optional(),
  columns: z
    .array(
      z.object({
        title: z.string(),
        links: z.array(linkSchema).max(8),
      }),
    )
    .max(5)
    .optional(),
  copyright: z.string().optional(),
})

export const sectionSchema = z.discriminatedUnion('type', [
  heroSection,
  sliderSection,
  aboutSection,
  servicesSection,
  featuresSection,
  statsSection,
  testimonialsSection,
  gallerySection,
  portfolioSection,
  productsSection,
  categoriesSection,
  processSection,
  teamSection,
  pricingSection,
  faqSection,
  contactSection,
  ctaSection,
  footerSection,
])

/* -------------------------------------------------------------------------- */
/*  Top-level website schema                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Site metadata. `seoTitle` is an OPTIONAL, user-authored SEO title used to
 * build the published `<title>` as `name - seoTitle`. It is optional so every
 * previously saved schema stays valid (and the title falls back to `name`).
 */
export const siteMetaSchema = z.object({
  name: z.string().describe('The website / brand name'),
  tagline: z.string().describe('A one-line tagline'),
  description: z.string().describe('A short SEO description'),
  language: z.enum(['tr', 'en']),
  tone: z.string().describe('Two or three words describing the visual tone'),
  audience: z.string().describe('Who the site is for, in a few words'),
  seoTitle: z
    .string()
    .optional()
    .describe('SEO title used in the browser tab and Google results, e.g. "İstanbul Nakliyeci"'),
})

/**
 * Third-party code the site owner pastes in (analytics, tag manager, pixels,
 * verification tags). Stored verbatim and injected into the PUBLISHED site
 * only — never into the editor preview. Every field is optional so existing
 * sites keep working untouched.
 */
export const trackingSchema = z.object({
  head: z.string().optional().describe('Raw code injected into <head>'),
  bodyStart: z.string().optional().describe('Raw code injected right after <body>'),
  bodyEnd: z.string().optional().describe('Raw code injected right before </body>'),
})

/**
 * The brand mark shown in the site header. OPTIONAL on purpose: every site
 * saved before logos existed stays valid, and a site with no logo simply falls
 * back to the `logoText` wordmark.
 *
 * `src` is either a locally generated inline SVG data URI (see
 * `lib/logo-mark.ts`) or an image the owner uploaded from their computer, so no
 * image-generation credits are ever spent on a logo.
 */
export const logoSchema = z.object({
  src: z.string().describe('Logo image as a data URI or absolute URL'),
  variant: z
    .number()
    .int()
    .optional()
    .describe('Which generated mark style is in use, so "refresh" can cycle on'),
  source: z
    .enum(['generated', 'upload', 'ai'])
    .optional()
    .describe(
      'Whether the mark was generated locally, uploaded by the owner, or produced by a real AI image request',
    ),
  alt: z.string().optional().describe('Accessible alt text for the logo image'),
  /**
   * Owner-authored header layout. All optional so every previously saved
   * schema keeps rendering exactly as before (the header falls back to its
   * current fixed h-12/h-16 box when these are unset).
   */
  width: z.number().int().positive().optional().describe('Desktop logo width in pixels'),
  height: z.number().int().positive().optional().describe('Desktop logo height in pixels'),
  mobileWidth: z.number().int().positive().optional().describe('Mobile logo width in pixels'),
  align: z
    .enum(['left', 'center', 'right'])
    .optional()
    .describe('Horizontal alignment of the logo within its header slot'),
})

/**
 * The browser tab / bookmark icon. Deliberately SEPARATE from `logoSchema`:
 * the header logo is free to be a wide horizontal wordmark, but a favicon
 * must be a small square glyph, so the two are never auto-derived from one
 * another when the logo isn't already square (a locally generated mark IS
 * square, so the editor may offer to reuse it — see `logo-field.tsx`).
 */
export const faviconSchema = z.object({
  src: z.string().describe('Favicon image as a data URI (ideally square, e.g. 64x64 or larger)'),
})

/**
 * The floating phone + WhatsApp call buttons pinned to every page of a
 * generated site (the same pair the demo sites ship with).
 *
 * Every field is optional so sites saved before this existed stay valid — they
 * are seeded deterministically from the contact section by
 * `lib/contact-actions.ts` rather than being invented by the model.
 *
 * Removal and editing are both first-class: clearing a number hides that one
 * button, and `enabled: false` removes the pair entirely.
 */
export const contactActionsSchema = z.object({
  enabled: z
    .boolean()
    .optional()
    .describe('Set to false to remove the floating phone + WhatsApp buttons entirely'),
  phone: z
    .string()
    .optional()
    .describe('Phone number for the call button, e.g. "+90 212 555 12 34". Empty hides the button'),
  whatsapp: z
    .string()
    .optional()
    .describe('WhatsApp number for the chat button. Empty hides the button'),
  whatsappMessage: z
    .string()
    .optional()
    .describe('Prefilled WhatsApp message shown when a visitor opens the chat'),
})

export const navigationSchema = z.object({
  logoText: z.string(),
  links: z.array(linkSchema).min(1).max(7),
  cta: buttonSchema.optional(),
  logo: logoSchema.optional().describe('Optional brand mark shown instead of the logo text'),
  favicon: faviconSchema.optional().describe('Optional browser tab icon, separate from the header logo'),
})

export const websiteSchema = z.object({
  meta: siteMetaSchema,
  theme: z.object({
    mode: z.enum(['light', 'dark']),
    palette: z.array(colorSchema).min(3).max(6).describe('A cohesive palette of 3-6 colors'),
    radius: z
      .enum(['none', 'small', 'medium', 'large'])
      .describe('Overall corner rounding style'),
  }),
  typography: z.object({
    headingFont: z.string().describe('A Google Font family name for headings'),
    bodyFont: z.string().describe('A Google Font family name for body text'),
  }),
  navigation: navigationSchema,
  contactActions: contactActionsSchema
    .optional()
    .describe('Floating phone + WhatsApp buttons shown on every page'),
  pages: z
    .array(
      z.object({
        slug: z.string().describe('URL slug, e.g. "home", "about"'),
        title: z.string(),
        isHome: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(8),
  sections: z
    .array(sectionSchema)
    .min(3)
    .max(12)
    .describe('The ordered homepage sections'),
  tracking: trackingSchema.optional().describe('Owner-supplied third-party code snippets'),
})

/**
 * The schema used when a site is FIRST created. `meta.seoTitle` is required
 * here so the model always produces a keyword-rich SEO title for the sector,
 * while `tracking` stays out (there is nothing to track yet, and the owner
 * fills it in later from the editor).
 */
export const websiteGenerationSchema = websiteSchema
  .omit({ tracking: true, contactActions: true })
  .extend({
    meta: siteMetaSchema.extend({
      seoTitle: z
        .string()
        .describe(
          'A short, keyword-rich SEO title (3-6 words) that helps this business rank on Google. ' +
            'Combine the main service keyword with the city/region when one is known, e.g. ' +
            '"Istanbul Moving Company" or "Kadıköy Dental Implants". No brand name, no punctuation.',
        ),
    }),
  })

/**
 * The schema handed to the AI *editor*. It deliberately EXCLUDES the
 * owner-authored fields (`tracking` snippets, `meta.seoTitle` and the brand
 * logo) so an unrelated edit can never rewrite or drop them — the route merges
 * them back from the current schema instead.
 */
export const websiteEditSchema = websiteSchema.omit({ tracking: true }).extend({
  meta: siteMetaSchema.omit({ seoTitle: true }),
  navigation: navigationSchema.omit({ logo: true, favicon: true }),
})

/* -------------------------------------------------------------------------- */
/*  TypeScript types                                                          */
/* -------------------------------------------------------------------------- */

export type Color = z.infer<typeof colorSchema>
export type NavLink = z.infer<typeof linkSchema>
export type CTAButton = z.infer<typeof buttonSchema>
export type SiteImageRef = z.infer<typeof imageSchema>
export type SiteLogo = z.infer<typeof logoSchema>
export type SiteFavicon = z.infer<typeof faviconSchema>
export type Section = z.infer<typeof sectionSchema>
export type SectionType = Section['type']
export type TrackingCodes = z.infer<typeof trackingSchema>
export type ContactActions = z.infer<typeof contactActionsSchema>
export type WebsiteSchema = z.infer<typeof websiteSchema>

/* -------------------------------------------------------------------------- */
/*  Adapter: WebsiteSchema -> lightweight Plan summary                         */
/* -------------------------------------------------------------------------- */

/**
 * The shape consumed by the landing-page <PlanResult /> card. Kept structural
 * (not imported from the component) so this lib stays framework-agnostic.
 */
export type WebsitePlan = {
  siteName: string
  tagline: string
  tone: string
  audience: string
  /**
   * Coarse site kind, so the landing plan card can announce an "E-Ticaret
   * Sitesi" when the generated structure is a storefront (has product/category
   * sections). Optional so any older caller stays valid.
   */
  siteType?: 'ecommerce' | 'business'
  palette: { name: string; hex: string }[]
  pages: string[]
  sections: { title: string; description: string }[]
}

/** Human-readable section title used in the plan summary, per language. */
function sectionLabel(type: SectionType, lang: 'tr' | 'en'): string {
  const map: Record<SectionType, [tr: string, en: string]> = {
    hero: ['Kahraman', 'Hero'],
    slider: ['Kayan Görsel', 'Slider'],
    about: ['Hakkında', 'About'],
    services: ['Hizmetler', 'Services'],
    features: ['Özellikler', 'Features'],
    stats: ['İstatistikler', 'Stats'],
    testimonials: ['Yorumlar', 'Testimonials'],
    gallery: ['Galeri', 'Gallery'],
    portfolio: ['Portföy', 'Portfolio'],
    products: ['Ürünler', 'Products'],
    categories: ['Kategoriler', 'Categories'],
    process: ['Süreç', 'Process'],
    team: ['Ekip', 'Team'],
    pricing: ['Fiyatlandırma', 'Pricing'],
    faq: ['SSS', 'FAQ'],
    contact: ['İletişim', 'Contact'],
    cta: ['Eylem Çağrısı', 'Call to action'],
    footer: ['Alt Bilgi', 'Footer'],
  }
  const entry = map[type]
  return lang === 'tr' ? entry[0] : entry[1]
}

/** Short description of a section for the plan summary. */
function sectionSummary(section: Section): string {
  switch (section.type) {
    case 'hero':
      return section.title
    case 'slider':
      return section.subtitle ?? section.title ?? section.slides[0]?.title ?? ''
    case 'about':
      return section.title
    case 'services':
    case 'features':
      return section.subtitle ?? section.title
    case 'stats':
      return section.subtitle ?? section.title ?? ''
    case 'pricing':
    case 'portfolio':
    case 'products':
    case 'categories':
    case 'process':
    case 'team':
      return section.subtitle ?? section.title
    case 'testimonials':
    case 'gallery':
    case 'faq':
      return section.title
    case 'contact':
      return section.description ?? section.title
    case 'cta':
      return section.description ?? section.title
    case 'footer':
      return section.tagline ?? ''
  }
}

/**
 * A generated storefront always carries product/category sections, so we infer
 * "is this an e-commerce site?" straight from the structure rather than
 * re-parsing the original prompt (which most callers no longer have). Shared by
 * the plan summary and the floating contact-actions logic so both agree on what
 * counts as a store.
 */
export function isStorefront(site: WebsiteSchema): boolean {
  return site.sections.some((s) => s.type === 'products' || s.type === 'categories')
}

/**
 * Derives the lightweight Plan summary shown in the landing hero from a full
 * WebsiteSchema, so a single `website`-mode generation powers both the summary
 * card and the live preview without a second request.
 */
export function websiteToPlan(site: WebsiteSchema): WebsitePlan {
  const lang = site.meta.language
  const isStore = isStorefront(site)
  return {
    siteName: site.meta.name,
    tagline: site.meta.tagline,
    tone: site.meta.tone,
    audience: site.meta.audience,
    siteType: isStore ? 'ecommerce' : 'business',
    palette: site.theme.palette.map((c) => ({ name: c.name, hex: c.hex })),
    pages: site.pages.map((p) => p.title),
    sections: site.sections
      .filter((s) => s.type !== 'footer')
      .map((s) => ({
        title: sectionLabel(s.type, lang),
        description: sectionSummary(s),
      })),
  }
}

/* -------------------------------------------------------------------------- */
/*  Deterministic fallback (used when the AI Gateway is unavailable)          */
/* -------------------------------------------------------------------------- */

/**
 * Builds a complete, professional, sector-specific website WITHOUT the AI
 * Gateway. Theme, typography, navigation and all content come from
 * `buildSectorSite`, which reads the prompt to pick a sector (dental, food,
 * law, architecture, beauty, tech, ecommerce, photography) and produces
 * realistic, non-generic copy in the requested language.
 */
export function fallbackWebsite(prompt: string, lang: 'tr' | 'en'): WebsiteSchema {
  const { name, seoTitle, build } = buildSectorSite(prompt, lang)
  return {
    meta: {
      name,
      // Keyword-first SEO title derived from the brief, so even the offline
      // fallback ships a searchable <title> like "Marka - İstanbul Nakliyat".
      seoTitle,
      tagline: build.meta.tagline,
      description:
        lang === 'tr'
          ? `${name} — GLOVAL AI ile oluşturuldu.`
          : `${name} — built with GLOVAL AI.`,
      language: lang,
      tone: build.meta.tone,
      audience: build.meta.audience,
    },
    theme: build.theme,
    typography: build.typography,
    navigation: build.navigation,
    pages: build.pages,
    sections: build.sections,
  }
}
