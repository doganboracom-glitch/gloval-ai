import { placeholderInitial } from '@/lib/product-image-placeholder'

const ACCENT = 'var(--site-primary, var(--primary))'
const SURFACE = 'var(--site-card, var(--card))'
const MUTED = 'var(--site-muted, var(--muted))'

/**
 * Single source of the themed "no image" card used by products, categories and
 * every other image slot: a soft tint of the site's primary colour with the
 * first letter of the item's name. Purely decorative (no text for assistive
 * tech, no image), so callers keep their own accessible name on the wrapper.
 *
 * Fills its parent (`size-full`); the parent must have a definite size.
 */
export function ThemedImagePlaceholder({ name, className = '' }: { name?: string | null; className?: string }) {
  const initial = placeholderInitial(name)
  return (
    <span
      aria-hidden
      data-image-placeholder
      className={`relative flex size-full items-center justify-center overflow-hidden ${className}`}
      style={{
        containerType: 'size',
        backgroundImage: [
          `radial-gradient(color-mix(in oklab, ${ACCENT} 14%, transparent) 1px, transparent 1.5px)`,
          `linear-gradient(135deg, color-mix(in oklab, ${ACCENT} 18%, ${SURFACE}), color-mix(in oklab, ${ACCENT} 6%, ${MUTED}))`,
        ].join(', '),
        backgroundSize: '14px 14px, 100% 100%',
      }}
    >
      {initial ? (
        <span
          className="select-none font-semibold leading-none"
          style={{
            fontFamily: 'var(--site-heading-font, inherit)',
            fontSize: '44cqmin',
            color: `color-mix(in oklab, ${ACCENT} 45%, transparent)`,
          }}
        >
          {initial}
        </span>
      ) : null}
    </span>
  )
}
