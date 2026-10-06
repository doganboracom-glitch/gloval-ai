'use client'

import { PLATFORM_CANONICAL_HOST } from '@/lib/domains'

/**
 * GlovalBadge
 * -----------
 * Persistent "made with" credit shown on every generated site. It is always
 * rendered from hardcoded component markup — never from the editable site
 * schema — so an owner cannot edit or delete it from the editor. The only way
 * to remove it is the one-time "Copyright Kaldırma" entitlement, which makes
 * the renderer skip this component entirely.
 *
 * Two placements:
 * - `inline`   — sits in the footer's bottom bar, opposite the copyright line.
 *                This is the normal placement.
 * - `floating` — pinned above the BackToTop control. Used only as a fallback
 *                when the active page has no visible footer section, so hiding
 *                the footer can never make the credit disappear.
 *
 * Styling is deliberately neutral (its own dark chip) instead of the site's
 * `--site-*` palette, so the credit stays legible on any generated theme.
 */
export function GlovalBadge({
  lang = 'tr',
  variant = 'inline',
}: {
  lang?: 'tr' | 'en'
  variant?: 'inline' | 'floating'
}) {
  const label = lang === 'en' ? 'Built with Gloval AI' : 'Gloval AI ile oluşturuldu.'
  const href = `https://${PLATFORM_CANONICAL_HOST}`

  const chip = (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={label}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-neutral-900/90 px-3 py-1.5 text-[11px] font-medium leading-none text-white no-underline shadow-lg backdrop-blur-sm transition-opacity hover:opacity-90 sm:text-xs"
    >
      <span
        aria-hidden
        className="inline-block size-1.5 shrink-0 rounded-full bg-emerald-400"
      />
      {label}
    </a>
  )

  if (variant === 'floating') {
    return (
      <div
        className="pointer-events-none fixed right-4 z-[9999] flex justify-end sm:right-6"
        style={{
          // Stacked above the BackToTop button (h-12 mobile / h-14 desktop).
          bottom: 'calc(4.25rem + env(safe-area-inset-bottom))',
        }}
        data-gloval-badge
      >
        {chip}
      </div>
    )
  }

  return (
    <div className="flex shrink-0 justify-end" data-gloval-badge>
      {chip}
    </div>
  )
}
