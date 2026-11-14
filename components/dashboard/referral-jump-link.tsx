'use client'

import { useEffect, useState, type RefObject } from 'react'

/** Soft keyboard / pinch-zoom: visual viewport much shorter than the layout viewport. */
const KEYBOARD_HEIGHT_THRESHOLD = 150

/**
 * The button is ~40px tall and sits ~84px above the viewport bottom. Shrinking the
 * observer root by this much hides it BEFORE the section's heading can slide under it.
 * (A ratio threshold such as 20% fails here: the section is tall, so its heading would
 * already be on screen long before 20% of the section is visible.)
 */
const ROOT_MARGIN_BOTTOM = '-96px'

const MODAL_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]'

function isModalOpen() {
  return document.body.style.overflow === 'hidden' || document.body.hasAttribute('data-scroll-locked') || document.querySelector(MODAL_SELECTOR) !== null
}

function isKeyboardOpen() {
  const viewport = window.visualViewport
  if (!viewport) return false
  return viewport.scale <= 1.01 && window.innerHeight - viewport.height > KEYBOARD_HEIGHT_THRESHOLD
}

export function ReferralJumpLink({
  sectionRef,
  sectionId,
  label,
  ariaLabel,
}: {
  sectionRef: RefObject<HTMLElement | null>
  sectionId: string
  label: string
  ariaLabel: string
}) {
  const [sectionBelow, setSectionBelow] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // Visible only while the section is still below the viewport; it disappears as soon as
  // the section is reached and does not return once the user scrolled past it.
  useEffect(() => {
    const section = sectionRef.current
    if (!section || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const sectionTop = entry.boundingClientRect?.top
        const isBelowViewport = sectionTop === undefined || sectionTop > 0
        setSectionBelow(!entry.isIntersecting && isBelowViewport)
      },
      { rootMargin: `0px 0px ${ROOT_MARGIN_BOTTOM} 0px`, threshold: 0 },
    )
    observer.observe(section)
    return () => observer.disconnect()
  }, [sectionRef])

  useEffect(() => {
    const update = () => setModalOpen(isModalOpen())
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style', 'data-scroll-locked'],
      childList: true,
      subtree: true,
    })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const update = () => setKeyboardOpen(isKeyboardOpen())
    update()
    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [])

  if (!sectionBelow || modalOpen || keyboardOpen) return null

  return (
    <a
      href={`#${sectionId}`}
      onClick={(event) => {
        event.preventDefault()
        const section = sectionRef.current
        if (!section) return
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        section.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
      }}
      aria-label={ariaLabel}
      className="cookie-float-bottom fixed right-4 z-30 [--cookie-float-gap:5.25rem] inline-flex min-h-10 items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-[color,background-color,bottom] sm:right-6"
    >
      {label}
    </a>
  )
}
