'use client'

import { Check, ChevronRight } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { SiteButton, onSiteNavClick } from '@/components/website-renderer/primitives'
import { useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import {
  detailLeadImage,
  detailStripImages,
  parseDetailBody,
  resolveAboutDetail,
  type DetailImage,
} from '@/lib/section-detail'

const CONTACT_PAGE_SLUGS = new Set(['iletisim', 'contact', 'contact-us'])

function Photo({ image, className = '' }: { image: DetailImage; className?: string }) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.src} alt={image.alt} loading="lazy" decoding="async" className="h-full w-full object-cover" />
    </div>
  )
}

function BlockBody({ body }: { body: string }) {
  return (
    <div className="mt-3 grid gap-4">
      {parseDetailBody(body).map((part, i) =>
        part.type === 'ul' ? (
          <ul key={i} className="grid gap-2">
            {part.items.map((item) => (
              <li key={item} className="flex items-start gap-3 text-base leading-relaxed">
                <Check className="mt-1 h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden="true" />
                <span style={{ color: 'var(--site-muted-fg)' }}>{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="text-pretty text-base leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
            {part.text}
          </p>
        ),
      )}
    </div>
  )
}

function Breadcrumb({ homeLabel, current }: { homeLabel: string; current: string }) {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const href = normalize('/')
  return (
    <nav aria-label="Breadcrumb" data-gv-breadcrumb>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
        <li>
          <a
            href={href}
            onClick={(e) => onSiteNavClick(e, href, nav)}
            className="underline-offset-4 hover:underline"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            {homeLabel}
          </a>
        </li>
        <li aria-hidden="true">
          <ChevronRight className="h-3.5 w-3.5" />
        </li>
        <li aria-current="page" className="font-medium" style={{ color: 'var(--site-fg)' }}>
          {current}
        </li>
      </ol>
    </nav>
  )
}

/**
 * Long-form "Hakkımızda" page that the home about section links to with
 * "Daha fazlası…". The text lives on the about section (`detail`), so editing
 * the section edits this page; the header and footer come from the shared site.
 */
export function SectionDetailPage({ site }: { site: WebsiteSchema }) {
  const resolved = resolveAboutDetail(site)
  if (!resolved) return null

  const { section, detail, blocks, pageTitle } = resolved
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const heading = detail.heading?.trim() || section.title
  const altBase = `${site.meta.name} - ${heading}`
  const lead = detailLeadImage(section, altBase)
  const strip = detailStripImages(section, altBase)
  const highlights = (section.highlights ?? []).filter(Boolean)

  const contactPage = (site.pages ?? []).find((p) => CONTACT_PAGE_SLUGS.has((p.slug ?? '').toLowerCase()))
  const hasContact = site.sections.some((s) => s.type === 'contact' && !s.hidden)
  const ctaHref = contactPage ? `/${contactPage.slug}` : hasContact ? '/#contact' : null
  const ctaCopy =
    lang === 'en'
      ? { title: `Talk to ${site.meta.name}`, text: 'Tell us what you need and we will get back to you.', button: 'Contact us' }
      : { title: `${site.meta.name} ile görüşün`, text: 'İhtiyacınızı bize iletin, size geri dönelim.', button: 'İletişime geçin' }

  return (
    <div id="about-detail" data-gv-detail-page>
      <header
        className="px-6 py-10 sm:py-14"
        style={{ backgroundColor: 'var(--site-card)', borderBottom: '1px solid var(--site-border)' }}
      >
        <div className="mx-auto w-full max-w-5xl">
          <Breadcrumb homeLabel={lang === 'en' ? 'Home' : 'Ana sayfa'} current={pageTitle} />
          <h1
            className="mt-4 text-balance text-3xl font-bold sm:text-4xl lg:text-5xl"
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {heading}
          </h1>
          {site.meta.tagline ? (
            <p className="mt-3 max-w-2xl text-pretty text-base sm:text-lg" style={{ color: 'var(--site-muted-fg)' }}>
              {site.meta.tagline}
            </p>
          ) : null}
        </div>
      </header>

      <div className="px-6 py-12 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-14">
          <article className="grid gap-10">
            {blocks.map((block, i) => {
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
            })}
          </article>

          {lead || highlights.length > 0 ? (
            <aside className="grid content-start gap-6 lg:sticky lg:top-24 lg:self-start">
              {lead ? <Photo image={lead} className="aspect-[4/3]" /> : null}
              {highlights.length > 0 ? (
                <div
                  className="p-5"
                  style={{
                    borderRadius: 'var(--site-radius)',
                    border: '1px solid var(--site-border)',
                    backgroundColor: 'var(--site-card)',
                  }}
                >
                  <ul className="grid gap-3">
                    {highlights.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden="true" />
                        <span style={{ color: 'var(--site-fg)' }}>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>

        {strip.length > 0 ? (
          <div
            data-gv-detail-strip
            className={`mx-auto mt-12 grid w-full max-w-5xl gap-3 ${strip.length === 1 ? '' : strip.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
          >
            {strip.map((image) => (
              <Photo key={image.src} image={image} className="aspect-[4/3]" />
            ))}
          </div>
        ) : null}
      </div>

      {ctaHref ? (
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
                {ctaCopy.title}
              </h2>
              <p className="mt-2 text-pretty" style={{ color: 'var(--site-muted-fg)' }}>
                {ctaCopy.text}
              </p>
            </div>
            <SiteButton button={{ label: ctaCopy.button, href: ctaHref }} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
