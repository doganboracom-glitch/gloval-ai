'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import { PageHeader } from '@/components/website-renderer/sections/gallery-detail-page'
import { ReferenceLogo } from '@/components/website-renderer/sections/reference-logo'
import { resolveReferences } from '@/lib/references'

/** `/referanslar`: every real reference as a logo grid. */
export function ReferencesDetailPage({ site }: { site: WebsiteSchema }) {
  const { lang, items, section, title, active } = resolveReferences(site)
  if (!active || !section) return null
  return (
    <div id="references-detail" data-gv-detail-page>
      <PageHeader
        lang={lang}
        trail={[{ label: title }]}
        title={title}
        subtitle={section.subtitle?.trim() || undefined}
      />
      <div className="px-6 py-12 sm:py-16">
        <ul className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <li key={i}>
              <ReferenceLogo item={item} size="lg" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
