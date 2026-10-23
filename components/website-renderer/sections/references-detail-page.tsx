'use client'

import { useState } from 'react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { PageHeader } from '@/components/website-renderer/sections/gallery-detail-page'
import { ReferenceLogo } from '@/components/website-renderer/sections/reference-logo'
import { ReferenceExampleTag } from '@/components/website-renderer/sections/reference-example-tag'
import { useDemoRoutes } from '@/components/website-renderer/site-nav-context'
import { REFERENCES_PAGE_INITIAL, resolveReferences } from '@/lib/references'

/** `/referanslar`: the first logos as a grid, the rest behind a "show more" button. */
export function ReferencesDetailPage({ site }: { site: WebsiteSchema }) {
  const demo = useDemoRoutes() !== null
  const { lang, items, section, title, active } = resolveReferences(site, { demo })
  const [expanded, setExpanded] = useState(false)
  if (!active || !section) return null

  const hidden = Math.max(0, items.length - REFERENCES_PAGE_INITIAL)
  const showTag = demo && items.some((item) => item.sample)
  return (
    <div id="references-detail" data-gv-detail-page>
      <PageHeader
        lang={lang}
        trail={[{ label: title }]}
        title={title}
        subtitle={section.subtitle?.trim() || undefined}
      />
      <div className="px-6 py-12 sm:py-16">
        {showTag ? <ReferenceExampleTag lang={lang} /> : null}
        <ul className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <li key={i} hidden={!expanded && i >= REFERENCES_PAGE_INITIAL} className="flex flex-col items-center gap-2">
              <ReferenceLogo item={item} index={i} />
              {item.logo?.src && item.name.trim() ? (
                <p className="text-center text-sm font-medium" style={{ color: 'var(--site-fg)' }}>
                  {item.name.trim()}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        {hidden > 0 ? (
          <div className="mt-8 text-center">
            <button
              type="button"
              aria-expanded={expanded}
              data-references-more
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex cursor-pointer items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                border: '1px solid var(--site-border)',
                borderRadius: 'var(--site-radius)',
                color: 'var(--site-fg)',
              }}
            >
              {expanded
                ? lang === 'en'
                  ? 'Show fewer'
                  : 'Daha az göster'
                : lang === 'en'
                  ? `Show more (${hidden})`
                  : `Devamını göster (${hidden})`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
