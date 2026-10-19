'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Clock, Mail, MapPin, Menu, Navigation, Phone, X } from 'lucide-react'
import { SocialLinks } from '@/components/website-renderer/social-links'
import type { ResolvedSocialLink } from '@/lib/social-links'
import type { MenuContact } from '@/lib/menu-contact'

export type MobileMenuItem = {
  key: string
  label: string
  active?: boolean
  /** With an href the item renders as a link; without one it is a button. */
  href?: string
  onSelect?: (e: React.MouseEvent<HTMLElement>) => void
}

export type MobileMenuBreakpoint = 'md' | 'lg'

const BREAKPOINT_PX: Record<MobileMenuBreakpoint, number> = { md: 768, lg: 1024 }

/** Static class names so Tailwind can see them. */
export const HAMBURGER_HIDE_CLASS: Record<MobileMenuBreakpoint, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
}
export const DESKTOP_NAV_SHOW_CLASS: Record<MobileMenuBreakpoint, string> = {
  md: 'md:flex',
  lg: 'lg:flex',
}

/** Up to this many top-level entries fit the inline desktop nav from 768px; more switch to the menu until 1024px. */
const INLINE_NAV_MAX_ITEMS = 6

export function hamburgerBreakpoint(itemCount: number): MobileMenuBreakpoint {
  return itemCount > INLINE_NAV_MAX_ITEMS ? 'lg' : 'md'
}

/** Mirrors the Tailwind rule: the hamburger shows below its breakpoint only. */
export function isHamburgerVisibleAt(viewportWidth: number, breakpoint: MobileMenuBreakpoint): boolean {
  return viewportWidth < BREAKPOINT_PX[breakpoint]
}

export const MOBILE_MENU_LABELS = {
  tr: {
    open: 'Menüyü aç',
    close: 'Menüyü kapat',
    menu: 'Menü',
    social: 'Sosyal medya',
    contactHeading: 'İLETİŞİM',
    phone: 'Telefon',
    email: 'E-posta',
    address: 'Adres',
    hours: 'Çalışma saatleri',
    directions: 'Yol Tarifi Al',
    newTab: '(yeni sekmede açılır)',
  },
  en: {
    open: 'Open menu',
    close: 'Close menu',
    menu: 'Menu',
    social: 'Social media',
    contactHeading: 'CONTACT',
    phone: 'Phone',
    email: 'Email',
    address: 'Address',
    hours: 'Opening hours',
    directions: 'Get Directions',
    newTab: '(opens in a new tab)',
  },
} as const

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]'

/**
 * Hamburger button + modal side panel for a customer site header. Colors come
 * from the site theme tokens, document-level work (scroll lock, key handling,
 * media query) goes through the trigger's own document so it also works inside
 * the editor-preview iframe, and the layout uses logical properties for RTL.
 */
export function MobileMenu({
  items,
  cta,
  socialLinks,
  contact,
  lang = 'tr',
  breakpoint = 'md',
  onOpenChange,
}: {
  items: MobileMenuItem[]
  /** Pre-rendered main call-to-action, shown under the links. */
  cta?: React.ReactNode
  socialLinks?: ResolvedSocialLink[]
  /** Real contact details (`resolveMenuContact`); null/absent draws no contact block. */
  contact?: MenuContact | null
  lang?: 'tr' | 'en'
  breakpoint?: MobileMenuBreakpoint
  onOpenChange?: (open: boolean) => void
}) {
  const labels = MOBILE_MENU_LABELS[lang] ?? MOBILE_MENU_LABELS.tr
  const [open, setOpen] = useState(false)
  const rootId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const setOpenState = useCallback(
    (next: boolean) => {
      setOpen(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )

  const close = useCallback(
    (restoreFocus = true) => {
      setOpenState(false)
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
    },
    [setOpenState],
  )

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return
    const doc = trigger.ownerDocument
    const win = doc.defaultView

    const html = doc.documentElement
    const body = doc.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'

    closeRef.current?.focus({ preventScroll: true })

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = doc.activeElement
      if (!panel.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    const onFocusIn = (e: FocusEvent) => {
      // The trigger is exempt: closing hands focus back to it while this listener is still attached.
      if (e.target instanceof Node && e.target !== trigger && !panel.contains(e.target)) {
        closeRef.current?.focus({ preventScroll: true })
      }
    }

    doc.addEventListener('keydown', onKeyDown)
    doc.addEventListener('focusin', onFocusIn)

    const mql = win?.matchMedia?.(`(min-width: ${BREAKPOINT_PX[breakpoint]}px)`)
    const onViewportChange = (e: MediaQueryListEvent) => {
      if (e.matches) close(false)
    }
    mql?.addEventListener('change', onViewportChange)

    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      doc.removeEventListener('keydown', onKeyDown)
      doc.removeEventListener('focusin', onFocusIn)
      mql?.removeEventListener('change', onViewportChange)
    }
  }, [open, breakpoint, close])

  const onPanelClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target
    if (target instanceof Element && target.closest('a[href], [data-menu-item]')) close()
  }

  const itemClass = `flex min-h-12 w-full cursor-pointer items-center px-5 py-3 text-start text-base transition-opacity hover:opacity-70 ${FOCUS_RING}`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-mobile-menu-trigger
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        aria-controls={rootId}
        aria-haspopup="dialog"
        onClick={() => (open ? close() : setOpenState(true))}
        className={`inline-flex size-11 shrink-0 cursor-pointer items-center justify-center transition-opacity hover:opacity-70 ${HAMBURGER_HIDE_CLASS[breakpoint]} ${FOCUS_RING}`}
        style={{ borderRadius: 'var(--site-radius)', color: 'var(--site-fg)' }}
      >
        <Menu className="size-6" aria-hidden="true" />
      </button>

      <div
        id={rootId}
        hidden={!open}
        data-mobile-menu-root
        className={`fixed inset-x-0 top-0 z-50 h-dvh ${HAMBURGER_HIDE_CLASS[breakpoint]}`}
        style={open ? undefined : { display: 'none' }}
      >
        <div
          aria-hidden="true"
          data-mobile-menu-backdrop
          onClick={() => close()}
          className="absolute inset-0"
          style={{ backgroundColor: 'color-mix(in srgb, var(--site-fg) 45%, transparent)' }}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={labels.menu}
          data-mobile-menu-panel
          onClick={onPanelClick}
          className="absolute inset-y-0 end-0 flex h-dvh w-[min(88vw,22rem)] flex-col shadow-2xl"
          style={{
            backgroundColor: 'var(--site-bg)',
            color: 'var(--site-fg)',
            borderInlineStart: '1px solid var(--site-border)',
            fontFamily: 'var(--site-body-font)',
          }}
        >
          <div
            className="flex shrink-0 items-center justify-between ps-5 pe-3 py-2"
            style={{ borderBottom: '1px solid var(--site-border)' }}
          >
            <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-muted-fg)' }}>
              {labels.menu}
            </span>
            <button
              ref={closeRef}
              type="button"
              aria-label={labels.close}
              onClick={() => close()}
              className={`inline-flex size-11 cursor-pointer items-center justify-center transition-opacity hover:opacity-70 ${FOCUS_RING}`}
              style={{ borderRadius: 'var(--site-radius)', color: 'var(--site-fg)' }}
            >
              <X className="size-6" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <nav aria-label={labels.menu} className="py-2">
            <ul>
              {items.map((item) => {
                const style: React.CSSProperties = {
                  color: item.active ? 'var(--site-primary)' : 'var(--site-fg)',
                  fontWeight: item.active ? 700 : 500,
                  borderBottom: '1px solid color-mix(in srgb, var(--site-border) 60%, transparent)',
                }
                return (
                  <li key={item.key}>
                    {item.href ? (
                      <a
                        href={item.href}
                        aria-current={item.active ? 'page' : undefined}
                        onClick={(e) => item.onSelect?.(e)}
                        className={itemClass}
                        style={style}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        data-menu-item
                        aria-current={item.active ? 'page' : undefined}
                        onClick={(e) => item.onSelect?.(e)}
                        className={itemClass}
                        style={style}
                      >
                        {item.label}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>

          {contact ? (
            <section
              aria-labelledby={`${rootId}-contact`}
              data-mobile-menu-contact
              className="flex flex-col gap-1 px-5 pt-4 pb-4"
            >
              <h2
                id={`${rootId}-contact`}
                className="text-xs font-semibold tracking-wide"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {labels.contactHeading}
              </h2>
              <ul className="flex flex-col">
                {contact.phone ? (
                  <li>
                    <a
                      href={contact.phone.href}
                      className={`flex min-h-11 items-center gap-3 text-sm transition-opacity hover:opacity-70 ${FOCUS_RING}`}
                    >
                      <Phone className="size-4 shrink-0" aria-hidden="true" style={{ color: 'var(--site-primary)' }} />
                      <span className="sr-only">{labels.phone}: </span>
                      <span className="min-w-0 break-words">{contact.phone.display}</span>
                    </a>
                  </li>
                ) : null}
                {contact.email ? (
                  <li>
                    <a
                      href={contact.email.href}
                      className={`flex min-h-11 items-center gap-3 text-sm transition-opacity hover:opacity-70 ${FOCUS_RING}`}
                    >
                      <Mail className="size-4 shrink-0" aria-hidden="true" style={{ color: 'var(--site-primary)' }} />
                      <span className="sr-only">{labels.email}: </span>
                      <span className="min-w-0 break-all">{contact.email.display}</span>
                    </a>
                  </li>
                ) : null}
                {contact.address ? (
                  <li className="flex min-h-11 items-start gap-3 py-3 text-sm leading-relaxed">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                      style={{ color: 'var(--site-primary)' }}
                    />
                    <span className="sr-only">{labels.address}: </span>
                    <address className="min-w-0 break-words not-italic">{contact.address}</address>
                  </li>
                ) : null}
                {contact.hours ? (
                  <li className="flex min-h-11 items-start gap-3 py-3 text-sm leading-relaxed">
                    <Clock
                      className="mt-0.5 size-4 shrink-0"
                      aria-hidden="true"
                      style={{ color: 'var(--site-primary)' }}
                    />
                    <span className="sr-only">{labels.hours}: </span>
                    <span className="min-w-0 whitespace-pre-line break-words">{contact.hours}</span>
                  </li>
                ) : null}
              </ul>
              {contact.directionsUrl ? (
                <a
                  href={contact.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 text-sm font-semibold transition-opacity hover:opacity-80 ${FOCUS_RING}`}
                  style={{
                    border: '1px solid var(--site-primary)',
                    color: 'var(--site-primary)',
                    borderRadius: 'var(--site-radius)',
                  }}
                >
                  <Navigation className="size-4 shrink-0" aria-hidden="true" />
                  {labels.directions}
                  <span className="sr-only"> {labels.newTab}</span>
                </a>
              ) : null}
            </section>
          ) : null}
          </div>

          {cta || (socialLinks && socialLinks.length > 0) ? (
            <div
              className="flex shrink-0 flex-col gap-4 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
              style={{ borderTop: '1px solid var(--site-border)' }}
            >
              {cta ? <div className="[&>a]:flex [&>a]:min-h-11 [&>a]:w-full">{cta}</div> : null}
              <SocialLinks links={socialLinks} variant="menu" label={labels.social} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
