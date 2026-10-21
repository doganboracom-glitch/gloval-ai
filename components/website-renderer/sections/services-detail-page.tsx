'use client'

import { ArrowRight, ChevronRight } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { SiteButton, onSiteNavClick } from '@/components/website-renderer/primitives'
import { DynamicIcon } from '@/components/website-renderer/icon'
import { BlockBody } from '@/components/website-renderer/sections/section-detail-page'
import { useDemoHref, useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { resolveServices, servicePath, type ServiceEntry } from '@/lib/service-pages'

const CONTACT_PAGE_SLUGS = new Set(['iletisim', 'contact', 'contact-us'])

function useLink() {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  return {
    href: (raw: string) => demoHref(normalize(raw)),
    onClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => onSiteNavClick(e, href, nav),
  }
}

function Breadcrumb({
  homeLabel,
  trail,
}: {
  homeLabel: string
  trail: Array<{ label: string; href?: string }>
}) {
  const link = useLink()
  const crumbs = [{ label: homeLabel, href: '/' }, ...trail]
  return (
    <nav aria-label="Breadcrumb" data-gv-breadcrumb>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
        {crumbs.map((crumb, i) => (
          <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {crumb.href ? (
              <a
                href={link.href(crumb.href)}
                onClick={(e) => link.onClick(e, link.href(crumb.href as string))}
                className="underline-offset-4 hover:underline"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {crumb.label}
              </a>
            ) : (
              <span aria-current="page" className="font-medium" style={{ color: 'var(--site-fg)' }}>
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function ServiceCard({ entry, href, label }: { entry: ServiceEntry; href: string | null; label: string }) {
  const link = useLink()
  const target = href ? link.href(href) : null
  const Wrapper = (
    props: { children: React.ReactNode; className: string; style: React.CSSProperties },
  ) =>
    target ? (
      <a href={target} onClick={(e) => link.onClick(e, target)} {...props} />
    ) : (
      <div {...props} />
    )
  return (
    <Wrapper
      className={`block overflow-hidden p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        target ? 'transition-opacity hover:opacity-90' : ''
      }`}
      style={{
        backgroundColor: 'var(--site-card)',
        border: '1px solid var(--site-border)',
        borderRadius: 'var(--site-radius)',
        outlineColor: 'var(--site-primary)',
      }}
    >
      {entry.image ? (
        <span className="-m-5 mb-4 block overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.image.src}
            alt={entry.image.alt}
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full object-cover"
          />
        </span>
      ) : (
        <span
          className="inline-flex h-10 w-10 items-center justify-center"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--site-primary) 16%, transparent)',
            color: 'var(--site-primary)',
            borderRadius: 'var(--site-radius)',
          }}
        >
          <DynamicIcon name={entry.icon} className="h-5 w-5" />
        </span>
      )}
      <span
        className={`${entry.image ? '' : 'mt-4 '}block text-base font-semibold`}
        style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
      >
        {entry.title}
      </span>
      <span className="mt-2 block text-sm leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
        {entry.description}
      </span>
      {target ? (
        <span
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--site-primary)' }}
        >
          {label}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
    </Wrapper>
  )
}

function ContactCta({
  site,
  copy,
}: {
  site: WebsiteSchema
  copy: { title: string; text: string; label: string }
}) {
  const demoHref = useDemoHref()
  const contactPage = (site.pages ?? []).find((p) => CONTACT_PAGE_SLUGS.has((p.slug ?? '').toLowerCase()))
  const hasContact = site.sections.some((s) => s.type === 'contact' && !s.hidden)
  const raw = contactPage ? `/${contactPage.slug}` : hasContact ? '/#contact' : null
  if (!raw) return null
  return (
    <section
      data-gv-detail-cta
      className="px-6 py-12 sm:py-16"
      style={{ backgroundColor: 'var(--site-card)', borderTop: '1px solid var(--site-border)' }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <h2
            className="text-balance text-2xl font-bold"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {copy.title}
          </h2>
          <p className="mt-2 text-pretty" style={{ color: 'var(--site-muted-fg)' }}>
            {copy.text}
          </p>
        </div>
        <SiteButton button={{ label: copy.label, href: demoHref(raw) }} />
      </div>
    </section>
  )
}

/**
 * The services section's list page (`/hizmetlerimiz`) and one page per service
 * (`/hizmetlerimiz/<slug>`). Content lives on the section, so editing a service
 * edits both its card and its page. `itemSlug` null renders the list.
 */
export function ServicesDetailPage({ site, itemSlug }: { site: WebsiteSchema; itemSlug: string | null }) {
  const link = useLink()
  const resolved = resolveServices(site)
  if (!resolved) return null

  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const homeLabel = lang === 'en' ? 'Home' : 'Ana sayfa'
  const listHref = `/${resolved.listSlug}`
  const found = itemSlug ? resolved.items.find((i) => i.slug.toLowerCase() === itemSlug.toLowerCase()) : null
  const entry = found?.pageEnabled ? found : null

  if (!entry) {
    return (
      <div id="services-detail" data-gv-detail-page>
        <header
          className="px-6 py-10 sm:py-14"
          style={{ backgroundColor: 'var(--site-card)', borderBottom: '1px solid var(--site-border)' }}
        >
          <div className="mx-auto w-full max-w-5xl">
            <Breadcrumb homeLabel={homeLabel} trail={[{ label: resolved.listTitle }]} />
            <h1
              className="mt-4 text-balance text-3xl font-bold sm:text-4xl lg:text-5xl"
              style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
            >
              {resolved.heading}
            </h1>
            {resolved.section.subtitle ? (
              <p className="mt-3 max-w-2xl text-pretty text-base sm:text-lg" style={{ color: 'var(--site-muted-fg)' }}>
                {resolved.section.subtitle}
              </p>
            ) : null}
          </div>
        </header>
        <div className="px-6 py-12 sm:py-16">
          <div className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {resolved.items.map((item) => (
              <ServiceCard
                key={item.slug}
                entry={item}
                href={item.pageEnabled ? servicePath(resolved.listSlug, item.slug) : null}
                label={resolved.itemLinkLabel}
              />
            ))}
          </div>
        </div>
        <ContactCta site={site} copy={resolved.cta} />
      </div>
    )
  }

  const others = resolved.items.filter((i) => i.slug !== entry.slug && i.pageEnabled)
  const blocks = entry.blocks

  return (
    <div id="service-detail" data-gv-detail-page>
      <header
        className="px-6 py-10 sm:py-14"
        style={{ backgroundColor: 'var(--site-card)', borderBottom: '1px solid var(--site-border)' }}
      >
        <div className="mx-auto w-full max-w-5xl">
          <Breadcrumb
            homeLabel={homeLabel}
            trail={[{ label: resolved.listTitle, href: listHref }, { label: entry.title }]}
          />
          <h1
            className="mt-4 text-balance text-3xl font-bold sm:text-4xl lg:text-5xl"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {entry.title}
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-base sm:text-lg" style={{ color: 'var(--site-muted-fg)' }}>
            {entry.description}
          </p>
        </div>
      </header>

      <div className="px-6 py-12 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-14">
          <article className="grid content-start gap-10">
            {entry.image ? (
              <div
                className="overflow-hidden"
                style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.image.src}
                  alt={entry.image.alt}
                  decoding="async"
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            ) : null}
            {blocks.length > 0 ? (
              blocks.map((block, i) => {
                const Tag = block.level === 'h3' ? 'h3' : 'h2'
                return (
                  <section key={`${block.heading ?? 'block'}-${i}`}>
                    {block.heading ? (
                      <Tag
                        className={`text-pretty font-bold ${block.level === 'h3' ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'}`}
                        style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                      >
                        {block.heading}
                      </Tag>
                    ) : null}
                    {block.body ? <BlockBody body={block.body} /> : null}
                  </section>
                )
              })
            ) : (
              <p className="text-pretty text-base leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
                {entry.description}
              </p>
            )}
          </article>

          {others.length > 0 ? (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div
                className="p-5"
                style={{
                  borderRadius: 'var(--site-radius)',
                  border: '1px solid var(--site-border)',
                  backgroundColor: 'var(--site-card)',
                }}
              >
                <h2
                  className="text-base font-bold"
                  style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
                >
                  {lang === 'en' ? 'Other services' : 'Diğer hizmetler'}
                </h2>
                <ul className="mt-3 grid gap-2">
                  {others.map((item) => {
                    const href = link.href(servicePath(resolved.listSlug, item.slug))
                    return (
                      <li key={item.slug}>
                        <a
                          href={href}
                          onClick={(e) => link.onClick(e, href)}
                          className="text-sm underline-offset-4 hover:underline"
                          style={{ color: 'var(--site-primary)' }}
                        >
                          {item.title}
                        </a>
                      </li>
                    )
                  })}
                </ul>
                <a
                  href={link.href(listHref)}
                  onClick={(e) => link.onClick(e, link.href(listHref))}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline"
                  style={{ color: 'var(--site-fg)' }}
                >
                  {resolved.link?.label ?? resolved.listTitle}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
      <ContactCta site={site} copy={resolved.cta} />
    </div>
  )
}
