'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import { PageHeader } from '@/components/website-renderer/sections/gallery-detail-page'
import { TestimonialCard } from '@/components/website-renderer/sections/testimonial-card'
import { useDemoRoutes } from '@/components/website-renderer/site-nav-context'
import { resolveTestimonials } from '@/lib/testimonials'

/** `/musteri-yorumlari`: every real review. Platform placeholders never appear here. */
export function TestimonialsDetailPage({ site }: { site: WebsiteSchema }) {
  const demo = useDemoRoutes() !== null
  const { lang, items, section, title, active } = resolveTestimonials(site, { demo })
  if (!active || !section) return null
  return (
    <div id="testimonials-detail" data-gv-detail-page>
      <PageHeader
        lang={lang}
        trail={[{ label: title }]}
        title={title}
        subtitle={section.subtitle?.trim() || undefined}
      />
      <div className="px-6 py-12 sm:py-16">
        <div className="mx-auto grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <TestimonialCard key={i} item={item} showAvatars={section.showAvatars === true} lang={lang} demo={demo} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
