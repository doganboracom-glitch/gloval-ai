'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'

/**
 * Scroll helpers for generated sites.
 *
 * A generated site can live in three different scroll contexts:
 *  - the real published page (`/site/<slug>`) → the document scrolls,
 *  - the editor preview → the site is portalled into an <iframe>, so the
 *    scrolling window is the IFRAME's window, not the app window,
 *  - an embedded/overflowing wrapper → a scrollable ancestor element scrolls.
 *
 * Every helper below therefore resolves its scroll target from a DOM node that
 * belongs to the site itself, never from the global `window`.
 */

/** Nearest ancestor that actually scrolls, or null when the document scrolls. */
function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const view = node.ownerDocument?.defaultView
    const overflowY = view?.getComputedStyle(node).overflowY
    if (
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      node.scrollHeight > node.clientHeight + 4
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

/** Smoothly scrolls the site that `anchor` belongs to back to the very top. */
export function scrollSiteToTop(anchor: HTMLElement | null) {
  if (!anchor) return
  const scroller = scrollableAncestor(anchor)
  if (scroller) {
    scroller.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const view = anchor.ownerDocument?.defaultView
  view?.scrollTo({ top: 0, behavior: 'smooth' })
}

/**
 * BackToTop
 * ---------
 * Floating "scroll to top" control that appears once the visitor has passed the
 * halfway point of the page and disappears again near the top. Bottom-right so
 * it never overlaps the bottom-left phone/WhatsApp actions, and themed from the
 * site's own `--site-*` variables.
 */
export function BackToTop({
  anchorRef,
  lang = 'tr',
  resetKey,
}: {
  /** A node inside the generated site, used to resolve the scroll context. */
  anchorRef: React.RefObject<HTMLElement | null>
  lang?: 'tr' | 'en'
  /** Changes when the active page changes, so the listener re-resolves. */
  resetKey?: string
}) {
  const [visible, setVisible] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const doc = anchor.ownerDocument
    const view = doc?.defaultView
    if (!doc || !view) return

    const scroller = scrollableAncestor(anchor)

    const update = () => {
      const top = scroller ? scroller.scrollTop : view.scrollY || doc.documentElement.scrollTop
      const max = scroller
        ? scroller.scrollHeight - scroller.clientHeight
        : doc.documentElement.scrollHeight - view.innerHeight
      // Show past the halfway point, and only when there is a real page to
      // scroll (short pages never get a floating button).
      setVisible(max > 240 && top > max * 0.5)
    }

    const target: EventTarget = scroller ?? view
    target.addEventListener('scroll', update, { passive: true })
    view.addEventListener('resize', update)
    update()
    return () => {
      target.removeEventListener('scroll', update)
      view.removeEventListener('resize', update)
    }
  }, [anchorRef, resetKey])

  const label = lang === 'en' ? 'Back to top' : 'Yukarı çık'

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      onClick={() => scrollSiteToTop(buttonRef.current)}
      className={`fixed bottom-4 right-4 z-[9998] inline-flex h-12 w-12 items-center justify-center rounded-full shadow-lg outline-none transition-all duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14 ${
        visible
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      style={{
        backgroundColor: 'var(--site-primary)',
        color: 'var(--site-primary-fg)',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
      }}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
    </button>
  )
}
