'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import { ThemedImagePlaceholder } from '@/components/themed-image-placeholder'

type CategoriesData = Extract<Section, { type: 'categories' }>
type CategoryItem = CategoriesData['items'][number]

/**
 * Category grid. Each tile is an image-backed shortcut into a department, with
 * the name and an optional item count laid over a legibility gradient. The
 * first tile spans two columns on larger screens for an editorial, storefront
 * feel. Theme-driven via the scoped `--site-*` variables.
 */
export function CategoriesSection({ data }: { data: CategoriesData }) {
  return (
    <SectionShell id="categories" tinted>
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div
        className={
          data.items.length === 1
            ? 'mx-auto mt-10 grid max-w-md gap-4'
            : 'mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'
        }
        data-single-item={data.items.length === 1 ? 'true' : undefined}
      >
        {data.items.map((item, i) => (
          <CategoryTile key={i} item={item} seed={i + 1} featured={data.items.length > 1 && i === 0} />
        ))}
      </div>
    </SectionShell>
  )
}

function CategoryTile({
  item,
  seed,
  featured,
}: {
  item: CategoryItem
  seed: number
  featured: boolean
}) {
  const nav = useSiteNav()
  return (
    <a
      href={item.href || '#'}
      onClick={(e) => onSiteNavClick(e, item.href, nav)}
      className={`group relative flex min-h-[160px] items-end overflow-hidden sm:min-h-[200px] ${
        featured ? 'col-span-2 row-span-1' : ''
      }`}
      style={{
        borderRadius: 'var(--site-radius)',
        border: '1px solid var(--site-border)',
      }}
      aria-label={item.name}
    >
      {/* Image, or the shared themed placeholder (initial of the category name) */}
      {item.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.src || '/placeholder.svg'}
          alt={item.alt ?? item.name}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="absolute inset-0">
          <ThemedImagePlaceholder name={item.name} />
        </div>
      )}

      {/* Legibility overlay: only needed over photos, the placeholder is already a light tint */}
      {item.src ? (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.05) 100%)',
          }}
          aria-hidden="true"
        />
      ) : null}

      <div className="relative z-10 p-4">
        <h3
          className={`text-pretty text-base font-semibold sm:text-lg ${item.src ? 'text-white' : ''}`}
          style={{
            fontFamily: 'var(--site-heading-font)',
            color: item.src ? undefined : 'var(--site-fg)',
          }}
        >
          {item.name}
        </h3>
        {item.count ? (
          <span
            className={`mt-0.5 block text-xs font-medium ${item.src ? 'text-white/80' : ''}`}
            style={{ color: item.src ? undefined : 'var(--site-muted-fg)' }}
          >
            {item.count}
          </span>
        ) : item.description ? (
          <span
            className={`mt-0.5 block text-xs ${item.src ? 'text-white/80' : ''}`}
            style={{ color: item.src ? undefined : 'var(--site-muted-fg)' }}
          >
            {item.description}
          </span>
        ) : null}
      </div>
    </a>
  )
}
