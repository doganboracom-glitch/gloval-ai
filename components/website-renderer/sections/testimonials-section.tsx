'use client'

import type { Section, WebsiteSchema } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import { useDemoHref, useDemoRoutes, useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import { TestimonialCard } from '@/components/website-renderer/sections/testimonial-card'
import { TESTIMONIALS_HOME_PREVIEW, testimonialsLink } from '@/lib/testimonials'

type TestimonialsData = Extract<Section, { type: 'testimonials' }>

export function TestimonialsSection({
  data,
  site = null,
  lang = 'tr',
}: {
  data: TestimonialsData
  site?: WebsiteSchema | null
  lang?: 'tr' | 'en'
}) {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  const demo = useDemoRoutes() !== null
  const link = site ? testimonialsLink(site, data, { demo }) : null
  const items = link ? data.items.slice(0, TESTIMONIALS_HOME_PREVIEW) : data.items
  const href = link ? demoHref(normalize(link.href)) : ''
  return (
    <SectionShell id="testimonials">
      <SectionHeading title={data.title} subtitle={data.subtitle?.trim() || undefined} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <TestimonialCard key={i} item={item} showAvatars={data.showAvatars === true} lang={lang} demo={demo} index={i} />
        ))}
      </div>
      {link ? (
        <div className="mt-8 text-center">
          <a
            href={href}
            onClick={(e) => onSiteNavClick(e, href, nav)}
            className="inline-flex cursor-pointer items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              border: '1px solid var(--site-border)',
              borderRadius: 'var(--site-radius)',
              color: 'var(--site-fg)',
            }}
          >
            {link.label}
          </a>
        </div>
      ) : null}
    </SectionShell>
  )
}
