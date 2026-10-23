import { canAddEntry, canRemoveEntry } from '@/lib/list-limits'
import {
  HERO_LAYOUTS,
  clampOverlay,
  type HeroAlign,
  type HeroImageFit,
  type HeroLayout,
} from '@/lib/hero-layout'
import {
  ANNOUNCEMENT_MAX_ITEMS,
  ANNOUNCEMENT_SPEEDS,
  ANNOUNCEMENT_TEXT_MAX,
  countAnnouncements,
  type AnnouncementSpeed,
  type BlogProfile,
  type BlogSettings,
  type Section,
  type SectionType,
  isStorefront,
  type WebsiteSchema,
} from '@/lib/website-schema'
import { emptyProductDraft } from '@/lib/corporate-products'
import { isBlockedProductOperation } from '@/lib/storefront-product-lock'
import { sanitizeFooterColumns, sanitizeFooterLegalLinks } from '@/lib/footer-links'
import { isBusinessType, normalizeCompanyValue, type CompanyField } from '@/lib/company-profile'
import { sanitizeLegalMarkup } from '@/lib/legal-markup'
import { setBlogLatestEnabled } from '@/lib/section-order'
import {
  SOCIAL_NETWORKS,
  normalizeSocialInput,
  type SocialData,
  type SocialNetwork,
} from '@/lib/social-links'
import { canHideLegalDoc, isSiteLegalSlug, legalSlugKeys } from '@/lib/site-legal-docs'
import { uniquePageSlug } from '@/lib/page-slugs'
import { addMissingToMenu } from '@/lib/site-menu'

type HeroSection = Extract<Section, { type: 'hero' }>

/** The hero's own copy as a slide, used when a single hero first becomes a slider. */
function slideFromHero(hero: HeroSection): NonNullable<HeroSection['slides']>[number] {
  return {
    badge: hero.badge,
    title: hero.title,
    description: hero.description,
    primaryButton: hero.primaryButton,
    secondaryButton: hero.secondaryButton,
    image: hero.image ? { ...hero.image } : undefined,
    imagePrompt: hero.imagePrompt,
  }
}

/** The first slide is what the hero shows first, so its copy mirrors the hero's own fields. */
function mirrorFirstSlide(hero: HeroSection): void {
  const first = hero.slides?.[0]
  if (!first) return
  hero.title = first.title
  hero.description = first.description ?? ''
  hero.primaryButton = first.primaryButton
  if (first.image) hero.image = { ...first.image }
}

function newPageId(pages: { id?: string }[], slug: string): string {
  const used = new Set(pages.map((p) => p.id))
  const base = `pg-${slug}`.slice(0, 56)
  let id = base
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`
  return id
}
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { isUnsafeTrackingCode } from '@/lib/site-tracking'
import { MAX_ABOUT_IMAGES, isAboutLayout } from '@/lib/about-media'
import { MAX_DETAIL_IMAGES, cleanDetailBlocks } from '@/lib/section-detail'
import { cleanServiceSlug, syncSectionPages } from '@/lib/service-pages'
import { SERVICE_ITEM_LIMITS, SERVICE_LIST_LIMITS } from '@/lib/service-item-limits'
import { PRODUCT_IMAGES_MAX, PRODUCT_SPECS_MAX } from '@/lib/list-limits'
import { suggestProductImageAlt } from '@/lib/product-image-rules'
import { isUsableImageSrc } from '@/lib/about-media'
import { parseVideoUrl } from '@/lib/catalog-public'
import { addGalleryImages } from '@/lib/gallery-editor'
import {
  cleanProductDescription,
  cleanShortNote,
  homeHasRoom,
  makeProductsInline,
  withHomeFlags,
  withProductSlugs,
  withRenamedProduct,
} from '@/lib/product-items'
import {
  addCategory,
  categoryPatchValue,
  moveCategory,
  removeCategory,
  renameCategory,
  withCategories,
} from '@/lib/product-categories'
import {
  addAlbum,
  addVideo,
  moveAlbum,
  moveVideo,
  removeAlbum,
  removeVideo,
  renameAlbum,
  setImageAlbum,
  updateVideo,
  type GalleryResult,
} from '@/lib/gallery-albums'

const COMPANY_FIELDS: readonly CompanyField[] = [
  'businessType',
  'tradeName',
  'city',
  'district',
  'addressLine',
  'taxOffice',
  'taxId',
  'mersis',
  'tradeRegistryNo',
  'phone',
  'email',
  'kepAddress',
  'website',
]
import { resolveShowcaseCollection, type ShowcaseLimit, type ShowcaseSource } from '@/lib/store-showcase'

/* -------------------------------------------------------------------------- */
/*  Typed edit operations                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every change made in the editor — whether from a visual control or applied on
 * behalf of the AI — is expressed as one of these typed operations and run
 * through `applyOperation`. This gives the editor a single, pure, predictable
 * mutation path that is trivial to snapshot for undo/redo.
 *
 * Operations are intentionally granular (a real diff/patch model): editing the
 * hero title only touches the hero section, never the whole site.
 */
export type EditOperation =
  | { op: 'updateMeta'; name?: string; tagline?: string; seoTitle?: string }
  /** One of the owner-supplied third-party code slots. */
  | { op: 'updateTracking'; field: 'head' | 'bodyStart' | 'bodyEnd'; value: string }
  /**
   * The floating phone + WhatsApp buttons. `enabled: false` removes the pair,
   * and clearing a single number hides just that button.
   */
  | {
      op: 'updateContactActions'
      enabled?: boolean
      phone?: string
      whatsapp?: string
      whatsappMessage?: string
    }
  /**
   * Social media links. Each network value is a username or full link; it is
   * validated and normalized to https, an empty string removes that network and
   * an invalid value is ignored (the previous value is kept).
   */
  | { op: 'updateSocialLinks'; patch: Partial<Record<SocialNetwork, string>>; showInHeader?: boolean }
  /** Owner company details (legal identity). Empty string removes a field. */
  | { op: 'updateCompany'; patch: Partial<Record<CompanyField, string>> }
  | { op: 'updateBlogProfile'; profile: BlogProfile | null }
  /** Owner choices for the blog menu link and latest-posts block; only the given keys change. */
  | { op: 'updateBlogSettings'; patch: BlogSettings }
  /** Saves an owner-edited legal text (sanitised markup). Empty body = back to the template. */
  | { op: 'updateLegalDoc'; slug: string; body: string }
  | { op: 'resetLegalDoc'; slug: string }
  | { op: 'setLegalDocHidden'; slug: string; hidden: boolean }
  | { op: 'updatePalette'; role: string; hex: string }
  | { op: 'updateTypography'; headingFont?: string; bodyFont?: string }
  | { op: 'updateNavigation'; logoText?: string }
  /**
   * The header brand mark. `src: null` (or an empty string) removes the logo so
   * the header falls back to the logo text; a data URI / URL sets it.
   * Layout fields (`width`/`height`/`mobileWidth`/`align`) are set independently
   * of `src` — omitting them keeps the current value.
   */
  | {
      op: 'updateNavLogo'
      src?: string | null
      variant?: number
      source?: 'generated' | 'upload' | 'ai'
      alt?: string
      width?: number | null
      height?: number | null
      mobileWidth?: number | null
      align?: 'left' | 'center' | 'right'
      /** false hides the logo text next to the mark (the logo already spells the name). */
      showLogoText?: boolean
    }
  /** The browser-tab favicon. `src: null` removes it (falls back to the platform default). */
  | { op: 'updateFavicon'; src: string | null }
  | { op: 'updateHero'; patch: HeroPatch }
  | { op: 'updateHeroLayout'; patch: HeroLayoutPatch }
  | { op: 'updateHeroImage'; patch: HeroImagePatch }
  /** A single slider slide's image (slider hero variant). */
  | { op: 'updateSlideImage'; slideIndex: number; patch: HeroImagePatch }
  /**
   * Text + button of one hero slide. A hero without a `slides` list is its own
   * single slide (index 0), so the same op edits it in place. An empty button
   * label AND href removes the button.
   */
  | { op: 'updateHeroSlide'; slideIndex: number; patch: HeroSlidePatch }
  | { op: 'addHeroSlide' }
  | { op: 'removeHeroSlide'; slideIndex: number }
  | { op: 'moveHeroSlide'; from: number; to: number }
  | { op: 'updateSectionField'; index: number; field: SectionTextField; value: string }
  /**
   * The about section's imagery block. Only the given keys change; `cta`
   * set to null removes it, and `images` replaces the whole (max 3) list.
   */
  | {
      op: 'updateAboutMedia'
      index: number
      patch: {
        enabled?: boolean
        layout?: string
        label?: string
        images?: { src?: string; alt?: string; imagePrompt?: string; origin?: string }[]
        cta?: { label: string; href: string } | null
      }
    }
  /**
   * The about section's "Daha fazlası…" detail page. Only the given keys change;
   * any manual change clears the platform `sample` flag (the owner has reviewed it).
   * `blocks`/`images` replace the whole list. The page itself is kept in step
   * by `syncDetailPages` on normalize.
   */
  | {
      op: 'updateSectionDetail'
      index: number
      patch: {
        linkEnabled?: boolean
        linkLabel?: string
        pageEnabled?: boolean
        heading?: string
        blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
        images?: { src?: string; alt?: string }[]
        approve?: boolean
      }
    }
  /** The services section's list page + links ("Tüm hizmetlerimiz", /hizmetlerimiz). */
  | {
      op: 'updateServicesDetail'
      index: number
      patch: {
        linkEnabled?: boolean
        linkLabel?: string
        pageEnabled?: boolean
        heading?: string
        ctaTitle?: string
        ctaText?: string
        ctaLabel?: string
      }
    }
  /**
   * One service's own page: slug, image, on/off, SEO and long text (`blocks`
   * replaces the list). Editing the text or approving clears the platform `sample` flag.
   */
  | {
      op: 'updateServiceItem'
      index: number
      item: number
      patch: {
        slug?: string
        src?: string
        alt?: string
        pageEnabled?: boolean
        seoTitle?: string
        seoDescription?: string
        blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
        approve?: boolean
      }
    }
  /**
   * Corporate product catalog (inline `products` section, no cart): switches the
   * section's own /urunlerimiz pages on or off. Never touches a storefront.
   */
  | { op: 'updateProductsCatalog'; index: number; inline: boolean }
  /**
   * One corporate product's page: slug, code, price mode, gallery, specs, video,
   * SEO and long text (`blocks` replaces the list). Editing the text or approving
   * clears the platform `sample` flag.
   */
  | {
      op: 'updateProductItem'
      index: number
      item: number
      patch: {
        slug?: string
        sku?: string
        priceMode?: 'show' | 'ask'
        showOnHome?: boolean
        seoTitle?: string
        seoDescription?: string
        videoUrl?: string
        images?: { src: string; alt?: string }[]
        specs?: { name: string; value: string }[]
        blocks?: { heading?: string; level?: 'h2' | 'h3'; body: string }[]
        approve?: boolean
        /** The single "Açıklama" text (replaces the short line and the long blocks). */
        description?: string
        /** One-line note under the price on the product page, at most 80 characters. */
        shortNote?: string
        /** Category name; empty or "Diğer" files the product under "Diğer". */
        category?: string
      }
    }
  /** Corporate catalog categories: add, rename (products follow), reorder and delete (products fall back to "Diğer"). */
  | { op: 'addProductCategory'; index: number; name: string }
  | { op: 'renameProductCategory'; index: number; from: string; name: string }
  | { op: 'moveProductCategory'; index: number; name: string; direction: -1 | 1 }
  | { op: 'removeProductCategory'; index: number; name: string }
  | { op: 'addAlbum'; index: number; name: string }
  | { op: 'renameAlbum'; index: number; albumId: string; name: string }
  | { op: 'moveAlbum'; index: number; albumId: string; direction: 'up' | 'down' }
  | { op: 'removeAlbum'; index: number; albumId: string }
  /** `albumId` omitted puts the image into "Genel". */
  | { op: 'setImageAlbum'; index: number; itemIndex: number; albumId?: string }
  /** Several uploaded photos at once; photos past the 60-image limit are skipped. */
  | { op: 'addGalleryImages'; index: number; images: { src: string; alt?: string; album?: string }[] }
  | { op: 'addVideo'; index: number; url: string; name?: string; cover?: { src: string; alt?: string } }
  | {
      op: 'updateVideo'
      index: number
      id: string
      name?: string
      url?: string
      /** `null` clears the cover image. */
      cover?: { src: string; alt?: string } | null
    }
  | { op: 'moveVideo'; index: number; id: string; direction: 'up' | 'down' }
  | { op: 'removeVideo'; index: number; id: string }
  /** Banner image above the /urunlerimiz list, category and product pages. Empty `src` restores the default. */
  | { op: 'updateProductsPageImage'; index: number; src: string; alt?: string }
  /** Closes an editor suggestion for good. Stored on the draft, never rendered. */
  | { op: 'dismissHint'; hint: 'aboutImage' | 'serviceDetail' }
  /** Any scalar (string) field on the section, including ones outside the text set. */
  | { op: 'updateSectionValue'; index: number; field: string; value: string }
  /** A section button (hero/cta) label or href. */
  | {
      op: 'updateSectionButton'
      index: number
      which: 'primary' | 'secondary'
      field: 'label' | 'href'
      value: string
    }
  /** A field of one item inside the section's collection (items/plans/steps/members/columns). */
  | { op: 'updateItemField'; index: number; itemIndex: number; field: string; value: string }
  /** The resolved image (and optional prompt) of one collection item. */
  | {
      op: 'updateItemImage'
      index: number
      itemIndex: number
      src?: string
      imagePrompt?: string
    }
  /** A string array on one collection item (e.g. a pricing plan's features). */
  | { op: 'updateItemList'; index: number; itemIndex: number; field: string; values: string[] }
  /** A link inside one collection item (e.g. a footer column's links). */
  | {
      op: 'updateItemLink'
      index: number
      itemIndex: number
      linkIndex: number
      field: 'label' | 'href'
      /** `null` for both fields removes the link. */
      value: string | null
    }
  | { op: 'addItemLink'; index: number; itemIndex: number; label: string }
  | { op: 'addItem'; index: number }
  | { op: 'removeItem'; index: number; itemIndex: number }
  | { op: 'moveItem'; index: number; itemIndex: number; direction: 'up' | 'down' }
  /** One entry of a plain string array on the section (highlights, contact fields). */
  | {
      op: 'updateStringListItem'
      index: number
      field: string
      itemIndex: number
      /** `null` removes the entry; a string sets it. */
      value: string | null
    }
  | { op: 'addStringListItem'; index: number; field: string; value: string }
  /** Display settings of a storefront's product showcase (the catalog itself lives in the database). */
  | {
      op: 'updateProductsShowcase'
      index: number
      source?: ShowcaseSource
      limit?: ShowcaseLimit
      /** Collection slug to show; `null` or an empty string unbinds the section. */
      collection?: string | null
      /** Label of the "view all products" link; an empty string hides it. */
      viewAllLabel?: string
    }
  /** Navigation links and CTA. */
  | { op: 'updateNavLink'; linkIndex: number; field: 'label' | 'href'; value: string }
  | { op: 'addNavLink'; label: string }
  | { op: 'removeNavLink'; linkIndex: number }
  | { op: 'updateNavCta'; field: 'label' | 'href'; value: string }
  /**
   * Header menu entries of a MULTI-page site come from `pages`, not from
   * `navigation.links`. Removing a page only drops its menu entry; the
   * sections it showed stay on the homepage untouched.
   */
  | { op: 'updatePageTitle'; pageIndex: number; title: string }
  | { op: 'removePage'; pageIndex: number }
  /**
   * Real pages: each one is served at its own clean URL. Adding is subject to
   * the plan page limit, which the server checks on the resulting page count.
   */
  | { op: 'addPage'; title: string; slug?: string }
  /**
   * Adds a ready-made info page (FAQ, About, Shipping, ...) built by
   * `buildInfoPage`. Placeholder items carry `sample: true`, so they stay
   * hidden publicly and are caught by the publish gate until the owner edits
   * or approves them.
   */
  | {
      op: 'addInfoPage'
      page: { slug: string; title: string; sections: Section[]; seo?: { title?: string; description?: string } }
    }
  | { op: 'renamePage'; pageIndex: number; title: string; slug?: string }
  | { op: 'setPageSeo'; pageIndex: number; title?: string; description?: string; indexable?: boolean }
  | { op: 'movePage'; pageIndex: number; direction: 'up' | 'down' }
  /** Header/footer switches and short label of one page. An empty `menuLabel` clears it. */
  | { op: 'setPageMenu'; pageIndex: number; showInHeader?: boolean; showInFooter?: boolean; menuLabel?: string }
  /** Header order as page ids (plus `blog`). An empty list restores the page order. */
  | { op: 'setMenuOrder'; order: string[] }
  /** Turns the category sub-menu under the products entry on (default) or off. */
  | { op: 'setProductsSubmenu'; enabled: boolean }
  /** Adds the Contact entry to the header (accepting the suggestion) or closes the suggestion for good. */
  | { op: 'resolveContactSuggestion'; accept: boolean; lang?: 'tr' | 'en' }
  /**
   * Replaces a footer's link columns and/or official-text bar. Entries with an
   * empty label or an invalid target are NOT saved (no dead links).
   */
  | {
      op: 'updateFooterLinks'
      index: number
      columns?: Array<{ title: string; links: Array<{ label: string; href: string }> }>
      legal?: { hidden?: boolean; links?: Array<{ label: string; href: string }> }
    }
  /** Behavior flags of the site-wide announcement band (items use the generic item ops). */
  | {
      op: 'updateAnnouncement'
      index: number
      patch: {
        speed?: AnnouncementSpeed
        pauseOnHover?: boolean
        dismissible?: boolean
        useAccentColor?: boolean
      }
    }
  | { op: 'setSectionHidden'; index: number; hidden: boolean }
  | { op: 'setContactShowLogo'; index: number; show: boolean }
  | { op: 'moveSection'; index: number; direction: 'up' | 'down' }
  | { op: 'removeSection'; index: number }
  | { op: 'addSection'; sectionType: SectionType; index?: number }
  | { op: 'changeSectionType'; index: number; sectionType: SectionType }
  | { op: 'replaceSchema'; schema: WebsiteSchema }

export type HeroPatch = {
  badge?: string
  title?: string
  description?: string
  trustText?: string
  primaryButtonLabel?: string
  secondaryButtonLabel?: string
}

/** Visual style of the hero; values are normalized by `lib/hero-layout.ts`. */
export type HeroLayoutPatch = {
  layout?: HeroLayout
  align?: HeroAlign
  overlay?: number
  imageFit?: HeroImageFit
}

/**
 * A manual hero image change. `imagePrompt` is the human description of the
 * desired visual, `src` a direct image URL. Setting `src` to an empty string
 * clears the resolved image so the renderer falls back to the placeholder.
 */
export type HeroImagePatch = {
  imagePrompt?: string
  src?: string
  alt?: string
}

/** Text + primary button of a single hero slide; only the given keys change. */
export type HeroSlidePatch = {
  title?: string
  description?: string
  buttonLabel?: string
  buttonHref?: string
}

/** String fields that the generic section text editor can set. */
export type SectionTextField =
  | 'title'
  | 'subtitle'
  | 'description'
  | 'body'
  | 'badge'
  | 'trustText'
  | 'tagline'

/* -------------------------------------------------------------------------- */
/*  Pure reducer                                                              */
/* -------------------------------------------------------------------------- */

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
}

/**
 * Applies a single operation to a schema and returns a NEW schema (immutable).
 * Every operation is defensive: out-of-range indices and unknown roles are
 * ignored rather than throwing, so a stale index from the UI can never crash
 * the editor.
 */
export function applyOperation(
  site: WebsiteSchema,
  operation: EditOperation,
): WebsiteSchema {
  // A storefront's products live in the database; the schema never takes them.
  if (isBlockedProductOperation(site, operation)) return site

  const next = clone(site)

  switch (operation.op) {
    case 'updateProductsShowcase': {
      const section = next.sections[operation.index]
      if (section?.type === 'products') {
        if (operation.source !== undefined) section.source = operation.source
        if (operation.limit !== undefined) section.limit = operation.limit
        if (operation.collection !== undefined) {
          const slug = resolveShowcaseCollection({ collection: operation.collection })
          if (slug) section.collection = slug
          else delete section.collection
        }
        if (operation.viewAllLabel !== undefined) section.viewAllLabel = operation.viewAllLabel
      }
      return next
    }

    case 'updateMeta': {
      if (operation.name !== undefined) {
        const previousName = next.meta.name
        next.meta.name = operation.name
        // Site adı alanı, oluşturulan sitelerde logo metninin kaynağıdır.
        // Logo metni kullanıcı tarafından ayrıca özelleştirilmediyse başlık
        // değişikliğini aynı anda yansıt; özel logo metnini ezme.
        if (
          next.navigation.logoText.trim() === previousName.trim() ||
          next.navigation.logoText.trim() === ''
        ) {
          next.navigation.logoText = operation.name
        }
      }
      if (operation.tagline !== undefined) next.meta.tagline = operation.tagline
      // An empty SEO title clears the field entirely, so the published <title>
      // falls back to the plain site name.
      if (operation.seoTitle !== undefined) {
        const seoTitle = operation.seoTitle.trim()
        next.meta.seoTitle = seoTitle ? operation.seoTitle : undefined
      }
      return next
    }

    case 'updateTracking': {
      const current = next.tracking ?? {}
      const value = operation.value
      if (isUnsafeTrackingCode(value)) return next
      next.tracking = { ...current, [operation.field]: value.trim() ? value : undefined }
      return next
    }

    case 'updateBlogProfile': {
      if (!operation.profile) {
        delete next.blogProfile
        return next
      }
      const cleaned: BlogProfile = {}
      for (const key of ['offering', 'region', 'difference', 'audience', 'contact'] as const) {
        const value = operation.profile[key]?.trim()
        if (value) cleaned[key] = value
      }
      if (Object.keys(cleaned).length === 0) delete next.blogProfile
      else next.blogProfile = cleaned
      return next
    }

    case 'updateBlogSettings': {
      next.blogSettings = { ...(next.blogSettings ?? {}), ...operation.patch }
      if (typeof operation.patch.showLatest === 'boolean') {
        return setBlogLatestEnabled(next, operation.patch.showLatest)
      }
      return next
    }

    case 'updateCompany': {
      const company = { ...(next.company ?? {}) } as Record<string, string | undefined>
      for (const [field, raw] of Object.entries(operation.patch)) {
        if (!COMPANY_FIELDS.includes(field as CompanyField) || typeof raw !== 'string') continue
        const value = normalizeCompanyValue(raw)
        if (field === 'businessType' && value !== undefined && !isBusinessType(value)) continue
        if (value === undefined) delete company[field]
        else company[field] = value
      }
      company.updatedAt = new Date().toISOString()
      next.company = company as WebsiteSchema['company']
      return next
    }

    case 'updateLegalDoc': {
      if (!isSiteLegalSlug(operation.slug)) return next
      const body = sanitizeLegalMarkup(operation.body)
      const docs = { ...(next.legalDocs?.docs ?? {}) }
      for (const key of legalSlugKeys(operation.slug)) delete docs[key]
      if (body) docs[operation.slug] = { body, updatedAt: new Date().toISOString() }
      next.legalDocs = { ...next.legalDocs, docs }
      return next
    }

    case 'resetLegalDoc': {
      if (!isSiteLegalSlug(operation.slug) || !next.legalDocs?.docs) return next
      const docs = { ...next.legalDocs.docs }
      for (const key of legalSlugKeys(operation.slug)) delete docs[key]
      next.legalDocs = { ...next.legalDocs, docs }
      return next
    }

    case 'setLegalDocHidden': {
      if (!canHideLegalDoc(next, operation.slug)) return next
      const hidden = new Set(next.legalDocs?.hidden ?? [])
      for (const key of legalSlugKeys(operation.slug)) hidden.delete(key)
      if (operation.hidden) hidden.add(operation.slug)
      next.legalDocs = { ...next.legalDocs, hidden: [...hidden] }
      return next
    }

    case 'updateAboutMedia': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'about') return next
      const { patch } = operation
      const media = { ...(section.media ?? {}) }
      if (patch.enabled !== undefined) media.enabled = patch.enabled
      if (patch.layout !== undefined && isAboutLayout(patch.layout)) media.layout = patch.layout
      if (patch.label !== undefined) media.label = patch.label.trim() || undefined
      if (patch.images !== undefined) media.images = patch.images.slice(0, MAX_ABOUT_IMAGES)
      if (patch.cta !== undefined) {
        media.cta = patch.cta && patch.cta.label.trim() ? { label: patch.cta.label.trim(), href: patch.cta.href.trim() } : undefined
      }
      next.sections[operation.index] = { ...section, media }
      return next
    }

    case 'updateSectionDetail': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'about') return next
      const { patch } = operation
      const current = section.detail ?? {}
      const detail = { ...current }
      if (patch.linkEnabled !== undefined) detail.linkEnabled = patch.linkEnabled
      if (patch.linkLabel !== undefined) detail.linkLabel = patch.linkLabel.trim().slice(0, 60) || undefined
      if (patch.pageEnabled !== undefined) detail.pageEnabled = patch.pageEnabled
      if (patch.heading !== undefined) detail.heading = patch.heading.trim().slice(0, 140) || undefined
      if (patch.blocks !== undefined) detail.blocks = cleanDetailBlocks(patch.blocks)
      if (patch.images !== undefined) detail.images = patch.images.slice(0, MAX_DETAIL_IMAGES)
      // Editing the content, or explicitly approving it, makes it the owner's own.
      if (patch.approve || patch.blocks !== undefined || patch.heading !== undefined || patch.images !== undefined) {
        detail.sample = undefined
      }
      next.sections[operation.index] = { ...section, detail }
      return syncSectionPages(next)
    }

    case 'updateServicesDetail': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'services') return next
      const { patch } = operation
      const detail = { ...(section.detail ?? {}) }
      if (patch.linkEnabled !== undefined) detail.linkEnabled = patch.linkEnabled
      if (patch.linkLabel !== undefined) detail.linkLabel = patch.linkLabel.trim().slice(0, SERVICE_LIST_LIMITS.linkLabel) || undefined
      if (patch.pageEnabled !== undefined) detail.pageEnabled = patch.pageEnabled
      if (patch.heading !== undefined) detail.heading = patch.heading.trim().slice(0, SERVICE_LIST_LIMITS.heading) || undefined
      if (patch.ctaTitle !== undefined) detail.ctaTitle = patch.ctaTitle.trim().slice(0, SERVICE_LIST_LIMITS.ctaTitle) || undefined
      if (patch.ctaText !== undefined) detail.ctaText = patch.ctaText.trim().slice(0, SERVICE_LIST_LIMITS.ctaText) || undefined
      if (patch.ctaLabel !== undefined) detail.ctaLabel = patch.ctaLabel.trim().slice(0, SERVICE_LIST_LIMITS.ctaLabel) || undefined
      next.sections[operation.index] = { ...section, detail }
      return syncSectionPages(next)
    }

    case 'updateServiceItem': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'services') return next
      const item = section.items[operation.item]
      if (!item) return next
      const { patch } = operation
      const updated = { ...item }
      if (patch.slug !== undefined) updated.slug = cleanServiceSlug(patch.slug, item.title)
      if (patch.src !== undefined) updated.src = patch.src.trim() || undefined
      if (patch.alt !== undefined) updated.alt = patch.alt.trim().slice(0, SERVICE_ITEM_LIMITS.alt) || undefined
      if (patch.pageEnabled !== undefined) updated.pageEnabled = patch.pageEnabled
      if (patch.seoTitle !== undefined) updated.seoTitle = patch.seoTitle.trim().slice(0, SERVICE_ITEM_LIMITS.seoTitle) || undefined
      if (patch.seoDescription !== undefined) updated.seoDescription = patch.seoDescription.trim().slice(0, SERVICE_ITEM_LIMITS.seoDescription) || undefined
      if (patch.blocks !== undefined) updated.detail = cleanDetailBlocks(patch.blocks)
      if (patch.approve || patch.blocks !== undefined) updated.sample = undefined
      const items = section.items.map((it, i) => (i === operation.item ? updated : it))
      next.sections[operation.index] = { ...section, items }
      return syncSectionPages(next)
    }

    case 'dismissHint': {
      const hints = new Set(next.dismissedHints ?? [])
      hints.add(operation.hint)
      next.dismissedHints = [...hints].slice(0, 10)
      return next
    }

    case 'updateProductsCatalog': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'products') return next
      next.sections[operation.index] = operation.inline
        ? makeProductsInline(section)
        : { ...section, inline: undefined }
      return next
    }

    case 'updateProductItem': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'products') return next
      const item = section.items[operation.item]
      if (!item) return next
      const { patch } = operation
      const updated = { ...item }
      if (patch.sku !== undefined) updated.sku = patch.sku.trim().slice(0, 60) || undefined
      if (patch.priceMode !== undefined) updated.priceMode = patch.priceMode
      if (patch.showOnHome !== undefined) updated.showOnHome = patch.showOnHome
      if (patch.seoTitle !== undefined) updated.seoTitle = patch.seoTitle.trim().slice(0, SERVICE_ITEM_LIMITS.seoTitle) || undefined
      if (patch.seoDescription !== undefined) {
        updated.seoDescription = patch.seoDescription.trim().slice(0, SERVICE_ITEM_LIMITS.seoDescription) || undefined
      }
      if (patch.videoUrl !== undefined) {
        const url = patch.videoUrl.trim()
        if (!url) updated.videoUrl = undefined
        else if (parseVideoUrl(url)) updated.videoUrl = url.slice(0, 300)
      }
      if (patch.images !== undefined) {
        const images = patch.images
          .filter((image) => isUsableImageSrc(image.src))
          .slice(0, PRODUCT_IMAGES_MAX)
          .map((image, position) => ({
            src: image.src.trim(),
            // Alt text is required per image: an empty one falls back to a name-based suggestion.
            alt: (image.alt?.trim() || suggestProductImageAlt(item.name, position)).slice(0, SERVICE_ITEM_LIMITS.alt),
          }))
        updated.images = images.length > 0 ? images : undefined
        // The showcase card reads `src`, so it follows the first gallery image (the cover); an emptied gallery clears it.
        if (images.length > 0) {
          updated.src = images[0].src
          updated.alt = images[0].alt
        } else {
          updated.src = undefined
          updated.alt = undefined
        }
      }
      if (patch.specs !== undefined) {
        const specs = patch.specs
          .map((spec) => ({ name: spec.name.trim().slice(0, 60), value: spec.value.trim().slice(0, 200) }))
          .slice(0, PRODUCT_SPECS_MAX)
        updated.specs = specs.length > 0 ? specs : undefined
      }
      if (patch.blocks !== undefined) updated.detail = cleanDetailBlocks(patch.blocks)
      if (patch.description !== undefined) {
        // One text replaces the short line and the long blocks; the blocks were already folded into the editor box.
        updated.description = cleanProductDescription(patch.description) || undefined
        updated.detail = undefined
      }
      if (patch.shortNote !== undefined) updated.shortNote = cleanShortNote(patch.shortNote) || undefined
      if (patch.category !== undefined) updated.category = categoryPatchValue(section, patch.category)
      if (patch.approve || patch.blocks !== undefined || patch.description !== undefined) updated.sample = undefined
      // Turning one product off on a legacy site (no flags yet) must not hide the rest.
      const base = patch.showOnHome !== undefined && section.inline ? withHomeFlags(section) : section
      const edited = { ...base, items: base.items.map((it, i) => (i === operation.item ? updated : it)) }
      const withList = patch.category !== undefined ? withCategories(edited) : edited
      next.sections[operation.index] = withList.inline ? withProductSlugs(withList) : withList
      return next
    }

    case 'addProductCategory':
    case 'renameProductCategory':
    case 'moveProductCategory':
    case 'removeProductCategory': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'products') return next
      const result =
        operation.op === 'addProductCategory'
          ? addCategory(section, operation.name)
          : operation.op === 'renameProductCategory'
            ? renameCategory(section, operation.from, operation.name)
            : operation.op === 'moveProductCategory'
              ? moveCategory(section, operation.name, operation.direction)
              : removeCategory(section, operation.name)
      if (!result.ok) return next
      next.sections[operation.index] = result.section.inline ? withProductSlugs(result.section) : result.section
      return next
    }

    case 'addGalleryImages': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'gallery') return next
      next.sections[operation.index] = addGalleryImages(section, operation.images, {
        businessName: next.meta.name,
        lang: next.meta.language === 'en' ? 'en' : 'tr',
      }).section
      return next
    }

    case 'addAlbum':
    case 'renameAlbum':
    case 'moveAlbum':
    case 'removeAlbum':
    case 'setImageAlbum':
    case 'addVideo':
    case 'updateVideo':
    case 'moveVideo':
    case 'removeVideo': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'gallery') return next
      let result: GalleryResult
      switch (operation.op) {
        case 'addAlbum':
          result = addAlbum(section, operation.name)
          break
        case 'renameAlbum':
          result = renameAlbum(section, operation.albumId, operation.name)
          break
        case 'moveAlbum':
          result = moveAlbum(section, operation.albumId, operation.direction)
          break
        case 'removeAlbum':
          result = removeAlbum(section, operation.albumId)
          break
        case 'setImageAlbum':
          result = setImageAlbum(section, operation.itemIndex, operation.albumId)
          break
        case 'addVideo':
          result = addVideo(section, operation, (n) => pick(next.meta.language, `Video ${n}`, `Video ${n}`))
          break
        case 'updateVideo':
          result = updateVideo(section, operation.id, operation)
          break
        case 'moveVideo':
          result = moveVideo(section, operation.id, operation.direction)
          break
        default:
          result = removeVideo(section, operation.id)
      }
      if (result.ok) next.sections[operation.index] = result.section
      return next
    }

    case 'updateProductsPageImage': {
      const section = next.sections[operation.index]
      if (!section || section.type !== 'products') return next
      const src = operation.src.trim()
      if (!src || !isUsableImageSrc(src)) {
        const { pageImage: _cleared, ...rest } = section
        next.sections[operation.index] = rest
        return next
      }
      next.sections[operation.index] = {
        ...section,
        pageImage: { src, ...(operation.alt?.trim() ? { alt: operation.alt.trim().slice(0, SERVICE_ITEM_LIMITS.alt) } : {}) },
      }
      return next
    }

    case 'updateContactActions': {
      const current = next.contactActions ?? {}
      const patch = { ...current }
      if (operation.enabled !== undefined) patch.enabled = operation.enabled
      // An empty string is written through deliberately: it means "the owner
      // cleared this number", which hides that button. Leaving the key absent
      // would instead inherit the number from the contact section.
      if (operation.phone !== undefined) patch.phone = operation.phone
      if (operation.whatsapp !== undefined) patch.whatsapp = operation.whatsapp
      if (operation.whatsappMessage !== undefined) {
        const message = operation.whatsappMessage.trim()
        patch.whatsappMessage = message ? operation.whatsappMessage : undefined
      }
      next.contactActions = patch
      return next
    }

    case 'updateSocialLinks': {
      const social: SocialData = { ...(next.social ?? {}) }
      for (const network of SOCIAL_NETWORKS) {
        if (!(network in operation.patch)) continue
        const result = normalizeSocialInput(network, operation.patch[network])
        if (result.status === 'ok') social[network] = result.url
        else if (result.status === 'empty') delete social[network]
      }
      if (operation.showInHeader !== undefined) social.showInHeader = operation.showInHeader
      next.social = social
      return next
    }

    case 'updatePalette': {
      const entry = next.theme.palette.find(
        (c) => c.name.toLowerCase() === operation.role.toLowerCase(),
      )
      if (entry) entry.hex = operation.hex
      else next.theme.palette.push({ name: operation.role, hex: operation.hex })
      return next
    }

    case 'updateTypography': {
      if (operation.headingFont) next.typography.headingFont = operation.headingFont
      if (operation.bodyFont) next.typography.bodyFont = operation.bodyFont
      return next
    }

    case 'updateNavigation': {
      if (operation.logoText !== undefined) next.navigation.logoText = operation.logoText
      return next
    }

    case 'updateNavLogo': {
      // An explicit null / empty src removes the mark entirely (layout fields
      // go with it — there is nothing left to size or align).
      if (operation.src === null || operation.src === '') {
        next.navigation.logo = undefined
        next.navigation.showLogoText = undefined
        return next
      }
      if (operation.showLogoText !== undefined) {
        next.navigation.showLogoText = operation.showLogoText ? undefined : false
      }
      const current = next.navigation.logo
      const src = operation.src ?? current?.src
      if (!src) return next
      next.navigation.logo = {
        src,
        variant: operation.variant ?? current?.variant,
        source: operation.source ?? current?.source,
        alt: operation.alt ?? current?.alt,
        // `null` clears a layout field back to the default box; `undefined`
        // (the field being omitted) keeps whatever was already set.
        width:
          operation.width === null ? undefined : (operation.width ?? current?.width),
        height:
          operation.height === null ? undefined : (operation.height ?? current?.height),
        mobileWidth:
          operation.mobileWidth === null
            ? undefined
            : (operation.mobileWidth ?? current?.mobileWidth),
        align: operation.align ?? current?.align,
      }
      return next
    }

    case 'updateFavicon': {
      next.navigation.favicon = operation.src ? { src: operation.src } : undefined
      return next
    }

    case 'updateHero': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const p = operation.patch
        if (p.badge !== undefined) hero.badge = p.badge
        if (p.title !== undefined) hero.title = p.title
        if (p.description !== undefined) hero.description = p.description
        if (p.trustText !== undefined) hero.trustText = p.trustText
        if (p.primaryButtonLabel !== undefined) {
          hero.primaryButton = {
            label: p.primaryButtonLabel,
            href: hero.primaryButton?.href ?? '#',
          }
        }
        if (p.secondaryButtonLabel !== undefined) {
          hero.secondaryButton = p.secondaryButtonLabel
            ? { label: p.secondaryButtonLabel, href: hero.secondaryButton?.href ?? '#' }
            : undefined
        }
      }
      return next
    }

    case 'updateHeroLayout': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const p = operation.patch
        if (p.layout !== undefined && HERO_LAYOUTS.includes(p.layout)) hero.layout = p.layout
        if (p.align !== undefined) hero.align = p.align
        if (p.overlay !== undefined) hero.overlay = clampOverlay(p.overlay)
        if (p.imageFit !== undefined) hero.imageFit = p.imageFit
        // Centered copy is only valid on full-bleed; never persist it elsewhere.
        const layout = hero.layout ?? 'split'
        if (hero.align === 'center' && layout !== 'full-bleed') hero.align = 'left'
      }
      return next
    }

    case 'updateHeroImage': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const p = operation.patch
        const current = hero.image
        const image = {
          imagePrompt: p.imagePrompt ?? current?.imagePrompt ?? next.meta.name,
          // An empty string explicitly clears the resolved image.
          src: p.src === '' ? undefined : (p.src ?? current?.src),
          alt: p.alt ?? current?.alt,
          aspectRatio: current?.aspectRatio ?? ('16/9' as const),
        }
        hero.image = image
        // Keep the first slide in sync — it is what a slider hero shows first.
        const first = hero.slides?.[0]
        if (first) first.image = { ...image }
      }
      return next
    }

    case 'updateSlideImage': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const slide = hero.slides?.[operation.slideIndex]
        if (slide) {
          const p = operation.patch
          const current = slide.image
          const image = {
            imagePrompt: p.imagePrompt ?? current?.imagePrompt ?? next.meta.name,
            // An empty string explicitly clears the resolved image.
            src: p.src === '' ? undefined : (p.src ?? current?.src),
            alt: p.alt ?? current?.alt,
            aspectRatio: current?.aspectRatio ?? ('16/9' as const),
          }
          slide.image = image
          // The first slide is what a slider shows initially, so it mirrors the
          // hero's own image field — keep the two in sync when it changes.
          if (operation.slideIndex === 0) hero.image = { ...image }
        }
      }
      return next
    }

    case 'updateHeroSlide': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const p = operation.patch
        const slide = hero.slides?.[operation.slideIndex]
        const target: {
          title: string
          description?: string
          primaryButton?: { label: string; href: string }
        } | undefined = hero.slides?.length ? slide : operation.slideIndex === 0 ? hero : undefined
        if (target) {
          if (p.title !== undefined) target.title = p.title
          if (p.description !== undefined) target.description = p.description
          if (p.buttonLabel !== undefined || p.buttonHref !== undefined) {
            const label = p.buttonLabel ?? target.primaryButton?.label ?? ''
            const href = (p.buttonHref ?? target.primaryButton?.href ?? '').trim()
            target.primaryButton = label || href ? { label, href: href || '#' } : undefined
          }
          if (hero.slides?.length && operation.slideIndex === 0) mirrorFirstSlide(hero)
        }
      }
      return next
    }

    case 'addHeroSlide': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero') {
        const current = hero.slides?.length ? hero.slides : [slideFromHero(hero)]
        if (canAddEntry('heroSlides', current.length)) {
          const fresh = {
            title: next.meta.language === 'en' ? 'New slide' : 'Yeni slayt',
            description: '',
            image: { imagePrompt: next.meta.name, alt: '', aspectRatio: '16/9' as const },
          }
          hero.slides = [...current, fresh]
          hero.variant = 'slider'
        }
      }
      return next
    }

    case 'removeHeroSlide': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero' && hero.slides && canRemoveEntry('heroSlides', hero.slides.length)) {
        if (operation.slideIndex >= 0 && operation.slideIndex < hero.slides.length) {
          hero.slides = hero.slides.filter((_, i) => i !== operation.slideIndex)
          mirrorFirstSlide(hero)
        }
      }
      return next
    }

    case 'moveHeroSlide': {
      const hero = next.sections.find((s) => s.type === 'hero')
      if (hero && hero.type === 'hero' && hero.slides) {
        const { from, to } = operation
        const last = hero.slides.length - 1
        if (from !== to && from >= 0 && to >= 0 && from <= last && to <= last) {
          const slides = [...hero.slides]
          const [moved] = slides.splice(from, 1)
          slides.splice(to, 0, moved)
          hero.slides = slides
          mirrorFirstSlide(hero)
        }
      }
      return next
    }

    case 'updateSectionField': {
      const section = next.sections[operation.index]
      if (section) {
        // The field set is validated by the caller's TS types; sections are a
        // union so we index through a permissive record here.
        ;(section as Record<string, unknown>)[operation.field] = operation.value
      }
      return next
    }

    case 'updateSectionValue': {
      const section = next.sections[operation.index]
      if (section) (section as Record<string, unknown>)[operation.field] = operation.value
      return next
    }

    case 'updateSectionButton': {
      const section = next.sections[operation.index] as Record<string, unknown> | undefined
      if (!section) return next
      const key = operation.which === 'primary' ? 'primaryButton' : 'secondaryButton'
      const current = (section[key] as { label?: string; href?: string } | undefined) ?? {}
      section[key] = {
        label: operation.field === 'label' ? operation.value : (current.label ?? ''),
        href: operation.field === 'href' ? operation.value : (current.href ?? '#'),
      }
      return next
    }

    case 'updateItemField': {
      const section = next.sections[operation.index]
      const item = collectionOf(section)?.[operation.itemIndex]
      if (section?.type === 'products' && section.inline && operation.field === 'name' && item) {
        next.sections[operation.index] = withRenamedProduct(section, operation.itemIndex, operation.value)
        return next
      }
      if (item) {
  const value =
  section?.type === 'announcement' && operation.field === 'text'
  ? operation.value.slice(0, ANNOUNCEMENT_TEXT_MAX)
  : section?.type === 'announcement' && operation.field === 'link'
  ? operation.value.trim().slice(0, 500)
  : operation.value
        ;(item as Record<string, unknown>)[operation.field] = value
      }
      return next
    }

    case 'updateItemImage': {
      const item = collectionOf(next.sections[operation.index])?.[operation.itemIndex] as
        | Record<string, unknown>
        | undefined
      if (item) {
        // An empty string explicitly clears the resolved image.
        if (operation.src !== undefined) {
          item.src = operation.src === '' ? undefined : operation.src
        }
        if (operation.imagePrompt !== undefined) item.imagePrompt = operation.imagePrompt
      }
      return next
    }

    case 'updateItemList': {
      const item = collectionOf(next.sections[operation.index])?.[operation.itemIndex]
      if (item) (item as Record<string, unknown>)[operation.field] = operation.values
      return next
    }

    case 'updateItemLink': {
      const item = collectionOf(next.sections[operation.index])?.[operation.itemIndex] as
        | Record<string, unknown>
        | undefined
      const links = item?.links
      if (!Array.isArray(links)) return next
      const link = links[operation.linkIndex] as { label: string; href: string } | undefined
      if (!link) return next
      if (operation.value === null) links.splice(operation.linkIndex, 1)
      else link[operation.field] = operation.value
      return next
    }

    case 'addItemLink': {
      const item = collectionOf(next.sections[operation.index])?.[operation.itemIndex] as
        | Record<string, unknown>
        | undefined
      if (!item) return next
      const entry = { label: operation.label, href: '#' }
      if (Array.isArray(item.links)) item.links.push(entry)
      else item.links = [entry]
      return next
    }

    case 'addItem': {
      const section = next.sections[operation.index]
      const list = collectionOf(section)
      if (section && list && !canAddEntry(section.type, list.length)) return next
      if (section && list) {
        const blank = blankItem(section.type, next.meta.language)
        if (section.type === 'products' && section.inline) {
          // A new product starts on the home page only while the showcase still has room.
          const flagged = withHomeFlags(section)
          flagged.items.forEach((it, i) => { section.items[i] = it })
          Object.assign(blank, { showOnHome: homeHasRoom(section) })
        }
        list.push(blank)
      }
      return next
    }

    case 'removeItem': {
      const section = next.sections[operation.index]
      const list = collectionOf(section)
      // The schema's per-section minimum (see lib/list-limits) is the floor.
      if (section && list && canRemoveEntry(section.type, list.length) && list[operation.itemIndex]) {
        list.splice(operation.itemIndex, 1)
      }
      return next
    }

    case 'moveItem': {
      const list = collectionOf(next.sections[operation.index])
      if (!list) return next
      const to = operation.itemIndex + (operation.direction === 'up' ? -1 : 1)
      if (to < 0 || to >= list.length) return next
      const [moved] = list.splice(operation.itemIndex, 1)
      list.splice(to, 0, moved)
      return next
    }

    case 'updateStringListItem': {
      const section = next.sections[operation.index] as Record<string, unknown> | undefined
      const list = section?.[operation.field]
      if (!Array.isArray(list)) return next
      if (operation.value === null) list.splice(operation.itemIndex, 1)
      else list[operation.itemIndex] = operation.value
      return next
    }

    case 'addStringListItem': {
      const section = next.sections[operation.index] as Record<string, unknown> | undefined
      if (!section) return next
      const list = section[operation.field]
      if (Array.isArray(list)) list.push(operation.value)
      else section[operation.field] = [operation.value]
      return next
    }

    case 'updateNavLink': {
      const link = next.navigation.links[operation.linkIndex]
      if (link) link[operation.field] = operation.value
      return next
    }

    case 'addNavLink': {
      next.navigation.links.push({ label: operation.label, href: '#' })
      return next
    }

    case 'removeNavLink': {
      if (next.navigation.links.length > 1) next.navigation.links.splice(operation.linkIndex, 1)
      return next
    }

    case 'updateNavCta': {
      const current = next.navigation.cta
      next.navigation.cta = {
        label: operation.field === 'label' ? operation.value : (current?.label ?? ''),
        href: operation.field === 'href' ? operation.value : (current?.href ?? '#'),
      }
      return next
    }

    case 'updatePageTitle': {
      const page = next.pages[operation.pageIndex]
      if (page && operation.title.trim()) page.title = operation.title
      return next
    }

    case 'addPage': {
      const title = operation.title.trim().slice(0, 60)
      if (!title || next.pages.length >= SITE_PAGE_HARD_CAP) return next
      const slug = uniquePageSlug(operation.slug?.trim() || title, next.pages.map((p) => p.slug))
      next.pages.push({ slug, title, kind: 'custom', sections: [], id: newPageId(next.pages, slug) })
      return next
    }

    case 'addInfoPage': {
      const title = operation.page.title.trim().slice(0, 60)
      if (!title || next.pages.length >= SITE_PAGE_HARD_CAP) return next
      const slug = uniquePageSlug(operation.page.slug?.trim() || title, next.pages.map((p) => p.slug))
      next.pages.push({
        slug,
        title,
        kind: 'info',
        sections: structuredClone(operation.page.sections),
        seo: operation.page.seo,
        id: newPageId(next.pages, slug),
      })
      return next
    }

    case 'setPageMenu': {
      const page = next.pages[operation.pageIndex]
      if (!page) return next
      if (operation.showInHeader !== undefined) page.showInHeader = operation.showInHeader
      if (operation.showInFooter !== undefined) page.showInFooter = operation.showInFooter
      if (operation.menuLabel !== undefined) page.menuLabel = operation.menuLabel.trim().slice(0, 40) || undefined
      return next
    }

    case 'setMenuOrder': {
      const known = new Set<string>(['blog', ...next.pages.flatMap((p) => (p.id ? [p.id] : [p.slug]))])
      const order = [...new Set(operation.order)].filter((key) => known.has(key)).slice(0, 40)
      next.navigation.menuOrder = order.length > 0 ? order : undefined
      return next
    }

    case 'setProductsSubmenu': {
      next.navigation.productsSubmenu = operation.enabled
      return next
    }

    case 'resolveContactSuggestion': {
      const resolved = operation.accept ? addMissingToMenu(next, operation.lang) : next
      resolved.navigation = { ...resolved.navigation, contactSuggestionDismissed: true }
      return resolved
    }

    case 'renamePage': {
      const page = next.pages[operation.pageIndex]
      if (!page) return next
      if (operation.title.trim()) page.title = operation.title.trim().slice(0, 60)
      if (operation.slug?.trim() && !page.isHome) {
        const others = next.pages.filter((p) => p !== page).map((p) => p.slug)
        page.slug = uniquePageSlug(operation.slug, others)
      }
      return next
    }

    case 'movePage': {
      const target = operation.direction === 'up' ? operation.pageIndex - 1 : operation.pageIndex + 1
      if (!next.pages[operation.pageIndex] || !next.pages[target]) return next
      const [moved] = next.pages.splice(operation.pageIndex, 1)
      next.pages.splice(target, 0, moved)
      return next
    }

    case 'setPageSeo': {
      const page = next.pages[operation.pageIndex]
      if (!page) return next
      const seo = { ...(page.seo ?? {}) }
      if (operation.title !== undefined) seo.title = operation.title.trim().slice(0, 120) || undefined
      if (operation.description !== undefined) seo.description = operation.description.trim().slice(0, 320) || undefined
      page.seo = seo.title || seo.description ? seo : undefined
      if (operation.indexable !== undefined) page.indexable = operation.indexable
      return next
    }

    case 'removePage': {
      if (next.pages.length <= 1) return next
      const homeIndex = Math.max(
        0,
        next.pages.findIndex((p) => p.isHome === true),
      )
      if (operation.pageIndex === homeIndex) return next
      if (operation.pageIndex < 0 || operation.pageIndex >= next.pages.length) return next
      const [removed] = next.pages.splice(operation.pageIndex, 1)
      if (next.navigation.menuOrder) {
        const key = removed.id ?? removed.slug
        const order = next.navigation.menuOrder.filter((k) => k !== key)
        next.navigation.menuOrder = order.length > 0 ? order : undefined
      }
      // `pages` drives the header of a multi-page site while `navigation.links`
      // is what a single-page render, the published site and exports read.
      // Drop the page's own link in the same step so the two never disagree.
      const title = removed.title.trim().toLowerCase()
      const slug = removed.slug.trim().toLowerCase()
      const pointsAtRemovedPage = (link: { label: string; href: string }) => {
        const href = link.href.trim().toLowerCase().replace(/\/+$/, '')
        return (
          link.label.trim().toLowerCase() === title ||
          href === `#${slug}` ||
          href.endsWith(`/${slug}`)
        )
      }
      const kept = next.navigation.links.filter((l) => !pointsAtRemovedPage(l))
      if (kept.length > 0) next.navigation.links = kept
      return next
    }

    case 'setSectionHidden': {
      const section = next.sections[operation.index]
      if (section) section.hidden = operation.hidden
      return next
    }

    case 'setContactShowLogo': {
      const section = next.sections[operation.index]
      if (section?.type !== 'contact') return next
      if (operation.show) delete section.showLogo
      else section.showLogo = false
      return next
    }

    case 'updateAnnouncement': {
      const section = next.sections[operation.index]
      if (section?.type !== 'announcement') return next
      const { speed, pauseOnHover, dismissible, useAccentColor } = operation.patch
      if (speed && ANNOUNCEMENT_SPEEDS.includes(speed)) section.speed = speed
      if (pauseOnHover !== undefined) section.pauseOnHover = pauseOnHover
      if (dismissible !== undefined) section.dismissible = dismissible
      if (useAccentColor !== undefined) section.useAccentColor = useAccentColor
      return next
    }

    case 'updateFooterLinks': {
      const section = next.sections[operation.index]
      if (section?.type !== 'footer') return next
      if (operation.columns) {
        section.columns = sanitizeFooterColumns(operation.columns, next)
      }
      if (operation.legal) {
        section.legal = {
          hidden: operation.legal.hidden === true ? true : undefined,
          links: operation.legal.links
            ? sanitizeFooterLegalLinks(operation.legal.links, next)
            : undefined,
        }
      }
      return next
    }

    case 'moveSection': {
      const from = operation.index
      const to = operation.direction === 'up' ? from - 1 : from + 1
      if (from < 0 || from >= next.sections.length) return next
      if (to < 0 || to >= next.sections.length) return next
      const [moved] = next.sections.splice(from, 1)
      next.sections.splice(to, 0, moved)
      return next
    }

    case 'removeSection': {
      if (operation.index >= 0 && operation.index < next.sections.length) {
        next.sections.splice(operation.index, 1)
      }
      return next
    }

    case 'addSection': {
      if (operation.sectionType === 'announcement') {
        // One band per site. A new one starts first (above the header); the
        // owner can move it anywhere in the list afterwards.
        if (countAnnouncements(next.sections) > 0) return next
        next.sections.unshift(blankSection('announcement', next.meta.language))
        return next
      }
      const section = blankSection(operation.sectionType, next.meta.language, { corporate: !isStorefront(next) })
      const insertAt =
        operation.index !== undefined
          ? operation.index
          : defaultInsertIndex(next.sections)
      next.sections.splice(insertAt, 0, section)
      return next
    }

    case 'changeSectionType': {
      const current = next.sections[operation.index]
      if (!current) return next
      // The band can neither be converted into a page section nor be created
      // by converting one (that could duplicate it).
      if (current.type === 'announcement' || operation.sectionType === 'announcement') return next
      const replacement = blankSection(operation.sectionType, next.meta.language, { corporate: !isStorefront(next) })
      // Preserve a shared title/subtitle where both types have one.
      const currentTitle = (current as Record<string, unknown>).title
      if (typeof currentTitle === 'string' && 'title' in replacement) {
        ;(replacement as Record<string, unknown>).title = currentTitle
      }
      replacement.hidden = current.hidden
      next.sections[operation.index] = replacement
      return next
    }

    case 'replaceSchema': {
      return clone(operation.schema)
    }

    default:
      return next
  }
}

/* -------------------------------------------------------------------------- */
/*  Collections: the repeatable list each section type carries                */
/* -------------------------------------------------------------------------- */

/**
 * The property name of the repeatable list a section type carries. Having this
 * in one place is what lets the editor edit, add, remove and reorder items of
 * ANY section without a hand-written form per type.
 */
export const SECTION_COLLECTION_KEY: Partial<Record<SectionType, string>> = {
  announcement: 'items',
  slider: 'slides',
  services: 'items',
  features: 'items',
  stats: 'items',
  testimonials: 'items',
  gallery: 'items',
  portfolio: 'items',
  products: 'items',
  categories: 'items',
  faq: 'items',
  pricing: 'plans',
  process: 'steps',
  team: 'members',
  footer: 'columns',
}

/** Section types whose items carry their own generated image. */
export const IMAGE_ITEM_SECTIONS: SectionType[] = [
  'slider',
  'gallery',
  'portfolio',
  'products',
  'categories',
  'team',
]

/** Returns the section's live collection array (mutable), or null. */
export function collectionOf(section: Section | undefined): Record<string, unknown>[] | null {
  if (!section) return null
  const key = SECTION_COLLECTION_KEY[section.type]
  if (!key) return null
  const list = (section as unknown as Record<string, unknown>)[key]
  return Array.isArray(list) ? (list as Record<string, unknown>[]) : null
}

/** A schema-valid empty entry for the section's collection. */
export function blankItem(type: SectionType, lang: Lang): Record<string, unknown> {
  switch (type) {
    case 'announcement':
      return { text: pick(lang, 'Yeni duyuru', 'New announcement'), sample: true }
    case 'slider':
      return {
        caption: pick(lang, 'Yeni', 'New'),
        title: pick(lang, 'Yeni slayt', 'New slide'),
        description: pick(lang, 'Kısa açıklama metni.', 'A short description.'),
        buttonText: pick(lang, 'İncele', 'View'),
        href: '#',
        imagePrompt: pick(lang, 'yeni slayt görseli', 'new slide image'),
      }
    case 'stats':
      return { value: '0', label: pick(lang, 'Etiket', 'Label'), icon: 'star' }
    case 'testimonials':
      return {
        quote: pick(lang, 'Yorum metni.', 'Testimonial text.'),
        author: pick(lang, 'Müşteri', 'Customer'),
        role: '',
      }
    case 'gallery':
      return {
        caption: '',
        imagePrompt: pick(lang, 'yeni galeri görseli', 'new gallery image'),
        aspectRatio: '4/3',
      }
    case 'portfolio':
      return {
        title: pick(lang, 'Yeni proje', 'New project'),
        category: '',
        description: '',
        imagePrompt: pick(lang, 'yeni proje görseli', 'new project image'),
      }
    case 'products':
      return {
        name: pick(lang, 'Yeni ürün', 'New product'),
        price: pick(lang, '₺0', '$0'),
        oldPrice: '',
        badge: '',
        category: '',
        imagePrompt: pick(lang, 'yeni ürün fotoğrafı', 'new product photo'),
        buttonText: pick(lang, 'İncele', 'View'),
        href: '#products',
      }
    case 'categories':
      return {
        name: pick(lang, 'Yeni kategori', 'New category'),
        count: '',
        imagePrompt: pick(lang, 'yeni kategori görseli', 'new category image'),
        href: '#products',
      }
    case 'team':
      return {
        name: pick(lang, 'İsim Soyisim', 'Full Name'),
        role: pick(lang, 'Ünvan', 'Role'),
        bio: '',
        imagePrompt: pick(lang, 'ekip üyesi portresi', 'team member portrait'),
      }
    case 'faq':
      return { question: pick(lang, 'Yeni soru?', 'New question?'), answer: pick(lang, 'Cevap', 'Answer') }
    case 'pricing':
      return {
        name: pick(lang, 'Yeni plan', 'New plan'),
        price: pick(lang, '₺0', '$0'),
        period: pick(lang, '/ay', '/mo'),
        description: '',
        features: [pick(lang, 'Özellik', 'Feature')],
      }
    case 'process':
      return {
        title: pick(lang, 'Yeni adım', 'New step'),
        description: pick(lang, 'Açıklama', 'Description'),
        icon: 'check',
      }
    case 'footer':
      return { title: pick(lang, 'Başlık', 'Title'), links: [] }
    default:
      return {
        title: pick(lang, 'Yeni öğe', 'New item'),
        description: pick(lang, 'Açıklama', 'Description'),
        icon: 'sparkles',
      }
  }
}

/** Inserts new sections before a trailing footer (so the footer stays last). */
function defaultInsertIndex(sections: Section[]): number {
  const last = sections[sections.length - 1]
  return last && last.type === 'footer' ? sections.length - 1 : sections.length
}

/* -------------------------------------------------------------------------- */
/*  Blank-section templates (for "+ Add Section" and type conversion)         */
/* -------------------------------------------------------------------------- */

type Lang = 'tr' | 'en'
const pick = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

/** Section types offered in the "+ Add Section" menu, in a sensible order. */
export const ADDABLE_SECTION_TYPES: SectionType[] = [
  'announcement',
  'hero',
  'slider',
  'about',
  'services',
  'features',
  'stats',
  'products',
  'categories',
  'portfolio',
  'gallery',
  'testimonials',
  'pricing',
  'process',
  'team',
  'faq',
  'contact',
  'cta',
]

/**
 * Produces a minimal but schema-valid section of the requested type, with
 * placeholder copy in the site's language. Used by both "+ Add Section" and
 * section type conversion.
 */
export function blankSection(type: SectionType, lang: Lang, opts?: { corporate?: boolean }): Section {
  if (type === 'products' && opts?.corporate) {
    // A corporate catalog never starts with invented products: one empty draft
    // row the owner fills in. The renderer skips it until it has a name.
    return {
      type: 'products',
      title: pick(lang, 'Ürünlerimiz', 'Our products'),
      layout: 'grid',
      inline: true,
      items: [emptyProductDraft()],
    }
  }
  switch (type) {
    case 'announcement':
      return {
        type: 'announcement',
        items: [{ text: pick(lang, 'Yeni duyuru', 'New announcement'), sample: true }],
        sample: true,
        speed: 'normal',
        pauseOnHover: true,
        dismissible: false,
      }
    case 'hero':
      return {
        type: 'hero',
        badge: pick(lang, 'Yeni', 'New'),
        title: pick(lang, 'Yeni başlık', 'New headline'),
        description: pick(lang, 'Kısa açıklama metni buraya gelir.', 'A short supporting description goes here.'),
        primaryButton: { label: pick(lang, 'Başla', 'Get started'), href: '#' },
      }
    case 'slider':
      return {
        type: 'slider',
        variant: 'card',
        title: pick(lang, 'Öne çıkanlar', 'Highlights'),
        subtitle: pick(lang, 'Kampanya ve duyurular', 'Campaigns & announcements'),
        slides: [
          {
            caption: pick(lang, 'Kampanya', 'Campaign'),
            title: pick(lang, 'Yeni sezon indirimi', 'New season sale'),
            description: pick(lang, 'Seçili ürünlerde büyük fırsatlar.', 'Great deals on selected items.'),
            buttonText: pick(lang, 'Keşfet', 'Explore'),
            href: '#',
            imagePrompt: pick(lang, 'kampanya görseli 1', 'campaign image 1'),
          },
          {
            caption: pick(lang, 'Yeni', 'New'),
            title: pick(lang, 'Öne çıkan koleksiyon', 'Featured collection'),
            description: pick(lang, 'En çok tercih edilen ürünler.', 'Our most popular picks.'),
            buttonText: pick(lang, 'İncele', 'View'),
            href: '#',
            imagePrompt: pick(lang, 'kampanya görseli 2', 'campaign image 2'),
          },
        ],
      }
    case 'about':
      return {
        type: 'about',
        title: pick(lang, 'Hakkımızda', 'About us'),
        body: pick(lang, 'Kısa hikayenizi buraya yazın.', 'Tell your short story here.'),
        highlights: [pick(lang, 'Kaliteye odaklı', 'Quality focused')],
      }
    case 'services':
      return {
        type: 'services',
        title: pick(lang, 'Hizmetler', 'Services'),
        subtitle: pick(lang, 'Sunduğumuz hizmetler', 'What we offer'),
        items: [
          { title: pick(lang, 'Hizmet 1', 'Service 1'), description: pick(lang, 'Açıklama', 'Description'), icon: 'sparkles' },
          { title: pick(lang, 'Hizmet 2', 'Service 2'), description: pick(lang, 'Açıklama', 'Description'), icon: 'star' },
        ],
      }
    case 'features':
      return {
        type: 'features',
        title: pick(lang, 'Özellikler', 'Features'),
        subtitle: pick(lang, 'Öne çıkanlar', 'Highlights'),
        items: [
          { title: pick(lang, 'Özellik 1', 'Feature 1'), description: pick(lang, 'Açıklama', 'Description'), icon: 'zap' },
          { title: pick(lang, 'Özellik 2', 'Feature 2'), description: pick(lang, 'Açıklama', 'Description'), icon: 'shield' },
        ],
      }
    case 'stats':
      return {
        type: 'stats',
        title: pick(lang, 'Rakamlarla biz', 'By the numbers'),
        items: [
          { value: '10+', label: pick(lang, 'Yıl', 'Years'), icon: 'calendar' },
          { value: '500+', label: pick(lang, 'Müşteri', 'Clients'), icon: 'users' },
        ],
      }
    case 'pricing':
      return {
        type: 'pricing',
        title: pick(lang, 'Fiyatlandırma', 'Pricing'),
        subtitle: pick(lang, 'Size uygun plan', 'A plan that fits'),
        plans: [
          {
            name: pick(lang, 'Başlangıç', 'Starter'),
            price: pick(lang, '₺0', '$0'),
            period: pick(lang, '/ay', '/mo'),
            features: [pick(lang, 'Temel özellikler', 'Core features')],
          },
        ],
      }
    case 'testimonials':
      return {
        type: 'testimonials',
        title: pick(lang, 'Yorumlar', 'Testimonials'),
        items: [
          { quote: pick(lang, 'Harika bir deneyim.', 'A great experience.'), author: pick(lang, 'Müşteri', 'Customer') },
        ],
      }
    case 'gallery':
      return {
        type: 'gallery',
        title: pick(lang, 'Galeri', 'Gallery'),
        items: [
          { imagePrompt: pick(lang, 'galeri görseli 1', 'gallery image 1'), aspectRatio: '4/3' },
          { imagePrompt: pick(lang, 'galeri görseli 2', 'gallery image 2'), aspectRatio: '4/3' },
        ],
      }
    case 'portfolio':
      return {
        type: 'portfolio',
        title: pick(lang, 'Portföy', 'Portfolio'),
        subtitle: pick(lang, 'Seçili projeler', 'Selected work'),
        items: [
          { title: pick(lang, 'Proje 1', 'Project 1'), imagePrompt: pick(lang, 'proje görseli 1', 'project image 1') },
          { title: pick(lang, 'Proje 2', 'Project 2'), imagePrompt: pick(lang, 'proje görseli 2', 'project image 2') },
        ],
      }
    case 'products':
      return {
        type: 'products',
        title: pick(lang, 'Öne çıkan ürünler', 'Featured products'),
        subtitle: pick(lang, 'En çok tercih edilenler', 'Our best sellers'),
        layout: 'grid',
        items: [
          {
            name: pick(lang, 'Ürün 1', 'Product 1'),
            price: pick(lang, '₺899', '$29'),
            badge: pick(lang, 'Yeni', 'New'),
            imagePrompt: pick(lang, 'ürün fotoğrafı 1', 'product photo 1'),
            buttonText: pick(lang, 'İncele', 'View'),
            href: '#products',
          },
          {
            name: pick(lang, 'Ürün 2', 'Product 2'),
            price: pick(lang, '₺1.299', '$39'),
            imagePrompt: pick(lang, 'ürün fotoğrafı 2', 'product photo 2'),
            buttonText: pick(lang, 'İncele', 'View'),
            href: '#products',
          },
        ],
      }
    case 'categories':
      return {
        type: 'categories',
        title: pick(lang, 'Kategoriler', 'Categories'),
        subtitle: pick(lang, 'Aradığınızı kolayca bulun', 'Find what you need'),
        items: [
          {
            name: pick(lang, 'Kategori 1', 'Category 1'),
            count: pick(lang, '24 ürün', '24 products'),
            imagePrompt: pick(lang, 'kategori görseli 1', 'category image 1'),
            href: '#products',
          },
          {
            name: pick(lang, 'Kategori 2', 'Category 2'),
            count: pick(lang, '18 ürün', '18 products'),
            imagePrompt: pick(lang, 'kategori görseli 2', 'category image 2'),
            href: '#products',
          },
        ],
      }
    case 'process':
      return {
        type: 'process',
        title: pick(lang, 'Sürecimiz', 'Our process'),
        steps: [
          { title: pick(lang, 'Adım 1', 'Step 1'), description: pick(lang, 'Açıklama', 'Description'), icon: 'search' },
          { title: pick(lang, 'Adım 2', 'Step 2'), description: pick(lang, 'Açıklama', 'Description'), icon: 'check' },
        ],
      }
    case 'team':
      return {
        type: 'team',
        title: pick(lang, 'Ekibimiz', 'Our team'),
        members: [{ name: pick(lang, 'İsim Soyisim', 'Full Name'), role: pick(lang, 'Ünvan', 'Role') }],
      }
    case 'faq':
      return {
        type: 'faq',
        title: pick(lang, 'Sık sorulan sorular', 'FAQ'),
        items: [
          { question: pick(lang, 'Soru 1?', 'Question 1?'), answer: pick(lang, 'Cevap', 'Answer') },
          { question: pick(lang, 'Soru 2?', 'Question 2?'), answer: pick(lang, 'Cevap', 'Answer') },
        ],
      }
    case 'blogLatest':
      return { type: 'blogLatest' }
    case 'contact':
      return {
        type: 'contact',
        title: pick(lang, 'İletişim', 'Contact'),
        description: pick(lang, 'Bize ulaşın.', 'Get in touch.'),
        fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'E-posta', 'Email'), pick(lang, 'Mesaj', 'Message')],
      }
    case 'cta':
      return {
        type: 'cta',
        title: pick(lang, 'Hazır mısınız?', 'Ready to start?'),
        description: pick(lang, 'Hemen başlayın.', 'Get started today.'),
        primaryButton: { label: pick(lang, 'İletişime geç', 'Contact us'), href: '#contact' },
      }
    case 'footer':
      return {
        type: 'footer',
        tagline: pick(lang, 'Bizimle çalışın.', 'Work with us.'),
        copyright: '© ' + new Date().getFullYear(),
      }
  }
}
