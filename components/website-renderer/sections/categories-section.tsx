'use client'

import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'

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
      <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {data.items.map((item, i) => (
          <CategoryTile key={i} item={item} seed={i + 1} featured={i === 0} />
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
  const hue = (seed * 47) % 360
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
      {/* Image (or themed gradient fallback) */}
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
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 55% 55% / 0.55), color-mix(in srgb, var(--site-accent) 40%, var(--site-card)))`,
          }}
          aria-hidden="true"
        />
      )}

      {/* Legibility overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.05) 100%)',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 p-4">
        <h3
          className="text-pretty text-base font-semibold text-white sm:text-lg"
          style={{ fontFamily: 'var(--site-heading-font)' }}
        >
          {item.name}
        </h3>
        {item.count ? (
          <span className="mt-0.5 block text-xs font-medium text-white/80">
            {item.count}
          </span>
        ) : item.description ? (
          <span className="mt-0.5 block text-xs text-white/80">{item.description}</span>
        ) : null}
      </div>
    </a>
  )
}
