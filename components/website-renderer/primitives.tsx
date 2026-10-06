'use client'

import type { CTAButton, SiteImageRef } from '@/lib/website-schema'
import { useSiteNav, type SiteNavHandler } from '@/components/website-renderer/site-nav-context'
import { canonicalSectionAnchor } from '@/lib/website-pages'

/**
 * Small presentational primitives shared by every generated section. They read
 * their colors from the scoped `--site-*` CSS variables set by the renderer
 * root, so they always reflect the generated site's own theme.
 */

/**
 * Unified in-site link behavior shared by buttons and nav links:
 * - `#anchor` → smooth-scroll to the matching section on the current page.
 * - `/route`  → let the renderer's nav handler take over (in-memory page switch
 *   in the preview / multi-page site); if it declines, navigate normally so a
 *   published site's real routes (product detail, cart) still work.
 * - empty / `#` → no-op (never a dead jump-to-top).
 *
 * Pass the handler from `useSiteNav()` as `navHandler`; components that render
 * inside the site tree can read it and forward it here.
 */
export function onSiteNavClick(
  e: React.MouseEvent<HTMLAnchorElement>,
  href?: string,
  navHandler?: SiteNavHandler | null,
): void {
  const target = (href || '').trim()
  if (target.startsWith('#') && target.length > 1) {
    e.preventDefault()
    // Resolve against the anchor's own document so section scrolling works both
    // on the published page and inside the editor-preview iframe.
    const doc = e.currentTarget.ownerDocument
    const id = target.slice(1)
    const alias = canonicalSectionAnchor(id)
    const el = doc.getElementById(id) ?? (alias ? doc.getElementById(alias) : null)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // The section lives on another page of this multi-page site: let the
    // renderer switch to that page and scroll once it has rendered.
    else if (navHandler) navHandler(target)
    return
  }
  if (target.startsWith('/')) {
    // Give the renderer a chance to handle it in-memory (page switch / preview
    // swallow). Only when it declines do we allow a real browser navigation.
    if (navHandler && navHandler(target)) e.preventDefault()
    return
  }
  // Everything else (empty, "#", non-anchors) is inert.
  e.preventDefault()
}

export function SiteButton({
  button,
  variant = 'primary',
}: {
  button: CTAButton
  variant?: 'primary' | 'outline'
}) {
  const nav = useSiteNav()
  const base: React.CSSProperties = {
    borderRadius: 'var(--site-radius)',
    fontFamily: 'var(--site-body-font)',
  }
  const style: React.CSSProperties =
    variant === 'primary'
      ? {
          ...base,
          backgroundColor: 'var(--site-primary)',
          color: 'var(--site-primary-fg)',
        }
      : {
          ...base,
          backgroundColor: 'transparent',
          color: 'var(--site-fg)',
          border: '1px solid var(--site-border)',
        }

  return (
    <a
      href={button.href || '#'}
      onClick={(e) => onSiteNavClick(e, button.href, nav)}
      className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
      style={style}
    >
      {button.label}
    </a>
  )
}

export function SectionShell({
  id,
  children,
  tinted = false,
  className = '',
}: {
  id?: string
  children: React.ReactNode
  tinted?: boolean
  className?: string
}) {
  return (
    <section
      id={id}
  className={`scroll-mt-20 px-6 py-16 sm:py-20 ${className}`}
  style={tinted ? { backgroundColor: 'var(--site-card)' } : undefined}
    >
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  )
}

export function SectionHeading({
  title,
  subtitle,
  center = true,
}: {
  title: string
  subtitle?: string
  center?: boolean
}) {
  return (
    <div className={center ? 'text-center' : ''}>
      <h2
        className="text-pretty text-2xl font-bold sm:text-3xl"
        style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
      >
        {title}
      </h2>
      {subtitle ? (
        <p
          className={`mt-3 text-pretty text-sm leading-relaxed sm:text-base ${
            center ? 'mx-auto max-w-2xl' : ''
          }`}
          style={{ color: 'var(--site-muted-fg)' }}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

/** A deterministic soft gradient placeholder for image-based blocks. */
export function ImagePlaceholder({
  label,
  className = '',
  seed = 0,
}: {
  label?: string
  className?: string
  seed?: number
}) {
  const hue = (seed * 47) % 360
  return (
    <div
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{
        borderRadius: 'var(--site-radius)',
        border: '1px solid var(--site-border)',
        background: `linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 22%, var(--site-card)), color-mix(in srgb, var(--site-accent) 18%, var(--site-card)))`,
      }}
      aria-hidden={label ? undefined : true}
    >
      {label ? (
        <span
          className="px-3 text-center text-xs font-medium"
          style={{ color: 'var(--site-muted-fg)' }}
        >
          {label}
        </span>
      ) : (
        <span
          className="h-10 w-10 rounded-full"
          style={{ backgroundColor: `hsl(${hue} 60% 60% / 0.4)` }}
        />
      )}
    </div>
  )
}

/**
 * Renders a structured image reference. When the ref carries a resolved `src`
 * (produced server-side by the image provider) it renders a real `<img>` with
 * `object-fit: cover`; otherwise it draws the themed gradient placeholder as a
 * graceful fallback. Callers never change based on whether an image resolved.
 */
export function SiteImage({
  image,
  seed = 0,
  className = '',
  rounded = true,
}: {
  image?:
    | SiteImageRef
    | { imagePrompt?: string; alt?: string; aspectRatio?: string; src?: string }
    | null
  seed?: number
  className?: string
  rounded?: boolean
}) {
  const aspect = (image && 'aspectRatio' in image && image.aspectRatio) || undefined
  const src = (image && 'src' in image && image.src) || undefined
  const hue = (seed * 47) % 360

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{
        aspectRatio: aspect,
        borderRadius: rounded ? 'var(--site-radius)' : 0,
        border: '1px solid var(--site-border)',
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 24%, var(--site-card)), color-mix(in srgb, var(--site-accent) 20%, var(--site-card)))',
      }}
      role="img"
      aria-label={image?.alt || image?.imagePrompt || undefined}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src || '/placeholder.svg'}
          alt={image?.alt || image?.imagePrompt || ''}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        /* Subtle decorative mark so empty placeholders never look broken */
        <svg
          width="34"
          height="34"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ color: `hsl(${hue} 55% 62% / 0.55)` }}
          aria-hidden="true"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      )}
    </div>
  )
}
