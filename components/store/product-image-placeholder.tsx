import { placeholderInitial } from '@/lib/product-image-placeholder'

const ACCENT = 'var(--site-primary, var(--primary))'
const SURFACE = 'var(--site-card, var(--card))'
const MUTED = 'var(--site-muted, var(--muted))'

/**
 * Themed stand-in for a product without photos. Purely decorative: no text
 * for assistive tech, no image, so there is nothing to describe.
 */
export function ProductImagePlaceholder({ name, className = '' }: { name: string; className?: string }) {
  const initial = placeholderInitial(name)
  return (
    <span
      aria-hidden
      data-product-placeholder
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
