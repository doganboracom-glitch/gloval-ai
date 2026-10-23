import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getPublishedSite } from "@/lib/projects";
import { getStoreCollections, getStoreProducts } from "@/lib/store";
import { WebsiteRenderer } from "@/components/website-renderer/website-renderer";
import type { StoreCatalog } from "@/components/website-renderer/store-catalog-context";
import { getStoreShippingInfo } from "@/lib/store-shipping-settings";
import { getPublishedSiteRouting } from "@/lib/commerce-mode-server";
import { loadCatalogPaths } from "@/lib/catalog-public-server";
import { getSiteBlogData } from "@/lib/blog-server";
import { isSiteBrandingRemoved } from "@/lib/project-entitlements";
import { getSiteSeoContext } from "@/lib/seo/site-seo";
import { isStorefront } from "@/lib/website-schema";
import { getStorePaymentBadges } from "@/lib/store-payment-badges";
import { contactSecret, signContactToken } from "@/lib/site-contact-guard";
import { findPublicPage, isPageIndexable, pagePath } from "@/lib/website-pages";
import { detailDescription, resolveAboutDetail } from "@/lib/section-detail";
import {
  buildBreadcrumbJsonLd,
  buildBreadcrumbTrailJsonLd,
  buildServiceJsonLd,
} from "@/lib/seo/breadcrumb-jsonld";
import {
  findPublicService,
  serviceDescription,
  servicePath,
} from "@/lib/service-pages";
import {
  findPublicAlbum,
  galleryAlbumPath,
  galleryDescription,
  resolveGalleryPages,
} from "@/lib/gallery-pages";
import { resolveTestimonials, testimonialsDescription } from "@/lib/testimonials";

/**
 * Metadata for the home page (`pageSlug` null) or one real page. Titles,
 * descriptions, canonical and og:url are per page; a page the owner marked
 * non-indexable is `noindex`.
 */
export async function buildSitePageMetadata(
  slug: string,
  pageSlug: string | null,
  itemSlug: string | null = null,
): Promise<Metadata> {
  const site = await getPublishedSite(slug);
  if (!site) return { title: "Site bulunamadı" };
  const page = pageSlug ? findPublicPage(site.schema, pageSlug) : null;
  if (pageSlug && !page)
    return {
      title: "Sayfa bulunamadı",
      robots: { index: false, follow: false },
    };

  if (page && itemSlug && page.detailOf === "gallery") {
    const album = findPublicAlbum(site.schema, page.slug, itemSlug);
    if (!album || album.kind !== "album")
      return {
        title: "Sayfa bulunamadı",
        robots: { index: false, follow: false },
      };
    const { origin } = await getSiteSeoContext(slug);
    const canonical = `${origin}${galleryAlbumPath(page.slug, album.entry.slug)}`;
    const title = `${album.entry.name} | ${page.title} | ${site.name}`;
    const description = galleryDescription(
      site.schema,
      "gallery",
      `${site.name} - ${album.entry.name}`,
      album.entry.photos.length,
    );
    return {
      title,
      description,
      metadataBase: new URL(origin),
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        images: [album.entry.cover.src],
      },
      robots: { index: isPageIndexable(page), follow: true },
    };
  }

  if (page && itemSlug) {
    const found = findPublicService(site.schema, page.slug, itemSlug);
    if (!found)
      return {
        title: "Sayfa bulunamadı",
        robots: { index: false, follow: false },
      };
    const { entry } = found;
    const { origin } = await getSiteSeoContext(slug);
    const canonical = `${origin}${servicePath(found.resolved.listSlug, entry.slug)}`;
    const title = `${entry.title} | ${site.name}`;
    const description =
      serviceDescription(entry) ||
      site.schema.meta.description ||
      site.schema.meta.tagline;
    return {
      title,
      description,
      metadataBase: new URL(origin),
      alternates: { canonical },
      openGraph: {
        title,
        description,
        url: canonical,
        ...(entry.image ? { images: [entry.image.src] } : {}),
      },
      robots: { index: isPageIndexable(page), follow: true },
    };
  }

  const aboutDetail =
    page?.kind === "detail" ? resolveAboutDetail(site.schema) : null;
  const galleryKind =
    page?.detailOf === "gallery" || page?.detailOf === "videos"
      ? page.detailOf
      : null;
  const galleryPages = galleryKind ? resolveGalleryPages(site.schema) : null;
  const galleryText =
    galleryKind && galleryPages
      ? galleryDescription(
          site.schema,
          galleryKind,
          site.name,
          galleryKind === "videos"
            ? galleryPages.videos.items.length
            : galleryPages.gallery.photos.length,
        )
      : "";
  const testimonialsText =
    page?.detailOf === "testimonials"
      ? testimonialsDescription(
          site.schema,
          site.name,
          resolveTestimonials(site.schema).items.length,
        )
      : "";
  const description =
    page?.seo?.description?.trim() ||
    (aboutDetail ? detailDescription(aboutDetail) : "") ||
    galleryText ||
    testimonialsText ||
    site.schema.meta.description ||
    site.schema.meta.tagline;
  const seoTitle = site.schema.meta.seoTitle?.trim();
  const siteTitle = seoTitle ? `${site.name} - ${seoTitle}` : site.name;
  const title = page
    ? page.seo?.title?.trim() || `${page.title} | ${site.name}`
    : siteTitle;

  // Tenant pages are canonical to their OWN public origin (a live custom
  // domain when bound, else the subdomain), never to gloval.ai.
  const { origin } = await getSiteSeoContext(slug);
  const canonical = page
    ? `${origin}${pagePath(site.schema, page.slug)}`
    : origin;
  const indexable = page ? isPageIndexable(page) : true;
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical },
    openGraph: { title, description, url: canonical },
    robots: { index: indexable, follow: true },
  };
}

export async function PublicSiteView({
  slug,
  pageSlug,
  itemSlug = null,
}: {
  slug: string;
  pageSlug: string | null;
  itemSlug?: string | null;
}) {
  const [site, brandingRemoved, products, collections, shipping, blog] =
    await Promise.all([
      getPublishedSite(slug),
      isSiteBrandingRemoved(slug),
      // Real catalog for this store. Empty for corporate sites: then the site
      // renders exactly as before (no cart, display-only sections).
      getStoreProducts(slug),
      getStoreCollections(slug),
      getStoreShippingInfo(slug),
      getSiteBlogData(slug),
    ]);
  if (!site) notFound();

  let page: ReturnType<typeof findPublicPage> = null;
  if (pageSlug) {
    page = findPublicPage(site.schema, pageSlug);
    if (!page) {
      // A renamed page keeps answering on its old URL with a permanent redirect.
      const moved = site.schema.pageRedirects?.find(
        (r) => r.from === `/${pageSlug.toLowerCase()}`,
      );
      if (moved && findPublicPage(site.schema, moved.to.replace(/^\//, "")))
        permanentRedirect(moved.to);
      notFound();
    }
  }

  let service: ReturnType<typeof findPublicService> = null;
  let album: ReturnType<typeof findPublicAlbum> = null;
  if (itemSlug && page?.detailOf === "gallery") {
    album = findPublicAlbum(site.schema, page.slug, itemSlug);
    if (album?.kind === "moved") permanentRedirect(album.to);
    if (!album) notFound();
  } else if (itemSlug) {
    service = page ? findPublicService(site.schema, page.slug, itemSlug) : null;
    if (!service) {
      const moved = site.schema.pageRedirects?.find(
        (r) =>
          r.from === `/${pageSlug?.toLowerCase()}/${itemSlug.toLowerCase()}`,
      );
      if (moved) {
        const [to1, to2] = moved.to.replace(/^\//, "").split("/");
        if (to1 && to2 && findPublicService(site.schema, to1, to2))
          permanentRedirect(moved.to);
      }
      notFound();
    }
  }

  const { origin } = await getSiteSeoContext(slug);
  const serviceJsonLd: string[] = [];
  let serviceBreadcrumb: string | null = null;
  if (page && service) {
    const url = `${origin}${servicePath(service.resolved.listSlug, service.entry.slug)}`;
    serviceBreadcrumb = buildBreadcrumbTrailJsonLd({
      origin,
      trail: [
        { name: site.name, path: "" },
        { name: page.title, path: pagePath(site.schema, page.slug) },
        {
          name: service.entry.title,
          path: servicePath(service.resolved.listSlug, service.entry.slug),
        },
      ],
    });
    const ld = buildServiceJsonLd({
      origin,
      url,
      name: service.entry.title,
      description: serviceDescription(service.entry),
      imageSrc: service.entry.image?.src,
      providerName: site.name,
    });
    if (ld) serviceJsonLd.push(ld);
  }
  if (page && album?.kind === "album") {
    serviceBreadcrumb = buildBreadcrumbTrailJsonLd({
      origin,
      trail: [
        { name: site.name, path: "" },
        { name: page.title, path: pagePath(site.schema, page.slug) },
        {
          name: album.entry.name,
          path: galleryAlbumPath(page.slug, album.entry.slug),
        },
      ],
    });
  }
  const breadcrumb = serviceBreadcrumb
    ? serviceBreadcrumb
    : page?.kind === "detail"
      ? buildBreadcrumbJsonLd({
          origin,
          homeName: site.name,
          pageName: page.title,
          pagePath: pagePath(site.schema, page.slug),
        })
      : null;

  const paymentBadges = isStorefront(site.schema) ? await getStorePaymentBadges(slug) : null

  const routing = products.length > 0 ? await getPublishedSiteRouting(slug) : null
  const catalogPaths =
    routing?.catalogPaths && routing.id
      ? await loadCatalogPaths(routing.id, products).catch(() => undefined)
      : undefined

  const store: StoreCatalog | null =
    products.length > 0
      ? {
          slug,
          products,
          catalogPaths,
          collections: collections.map((c) => ({
            slug: c.slug,
            name: c.name,
            product_ids: c.product_ids,
          })),
          shipping,
          bySlug: Object.fromEntries(
            products.map((p) => [
              p.slug,
              {
                id: p.id,
                slug: p.slug,
                priceCents: p.price_cents,
                currency: p.currency,
                stock: p.stock,
                image: p.images[0]?.url ?? null,
              },
            ]),
          ),
        }
      : null;

  // Without the server secret the form stays inert instead of accepting unsigned posts.
  const secret = contactSecret();
  const contactForm = secret
    ? { slug, token: signContactToken(secret, slug, Date.now()) }
    : null;

  return (
    <main className="min-h-svh bg-white text-black">
      {breadcrumb ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: breadcrumb }}
        />
      ) : null}
      {serviceJsonLd.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ld }}
        />
      ))}
      {/* The "Gloval AI ile oluşturuldu." credit is on unless this specific
          site's owner bought the one-time Copyright Kaldırma right. */}
      <WebsiteRenderer
        site={site.schema}
        showBranding={!brandingRemoved}
        planCode={site.ownerPlanCode}
        store={store}
        paymentBadges={paymentBadges}
        contactForm={contactForm}
        initialPage={page?.slug ?? null}
        initialService={service?.entry.slug ?? null}
        initialAlbum={album?.kind === "album" ? album.entry.slug : null}
        blog={blog}
        pageRouting
      />
    </main>
  );
}
