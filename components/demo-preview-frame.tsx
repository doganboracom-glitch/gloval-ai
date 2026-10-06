'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Renders a live, scaled-down thumbnail of a `/demo/[slug]` page by embedding
 * the real page in a non-interactive iframe. Because the preview is the actual
 * canonical renderer output (in `?preview=1` mode, which hides the demo chrome),
 * the Showcase card and the full demo page can never drift apart.
 *
 * The iframe is sized at 400% and scaled to 0.25 so its internal layout viewport
 * is ~4× the card width — enough to trigger the desktop layout — while visually
 * filling the card. It only mounts once scrolled near the viewport to avoid
 * loading eight full pages up front.
 */
export function DemoPreviewFrame({
  slug,
  lang,
  title,
}: {
  slug: string
  lang: 'tr' | 'en'
  title: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const src = `/demo/${slug}?preview=1${lang === 'en' ? '&lang=en' : ''}`

  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden bg-muted">
      {/* Subtle skeleton shimmer until the live preview paints. */}
      {!loaded && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />}
      {inView && (
        <iframe
          src={src}
          title={title}
          aria-hidden
          tabIndex={-1}
          loading="lazy"
          scrolling="no"
          onLoad={() => setLoaded(true)}
          className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-[0.25] border-0"
          style={{ opacity: loaded ? 1 : 0, transition: 'opacity 400ms ease' }}
        />
      )}
    </div>
  )
}
