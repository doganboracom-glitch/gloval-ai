'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { MobileMenuItem } from '@/components/website-renderer/sections/mobile-menu'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]'

const LABELS = {
  tr: { toggle: (label: string) => `${label} alt menüsünü aç veya kapat` },
  en: { toggle: (label: string) => `Toggle ${label} sub-menu` },
} as const

/**
 * Desktop header entry that owns a single-level sub-menu. The entry itself stays
 * a real link; the chevron button is the keyboard/touch toggle (aria-expanded,
 * aria-haspopup). Hover and focus-within open the panel, Esc closes it. The
 * sub-menu links are always in the markup (hidden visually when closed), so
 * crawlers see real `<a href>` for every category.
 */
export function DesktopSubmenuItem({
  item,
  lang = 'tr',
}: {
  item: MobileMenuItem
  lang?: 'tr' | 'en'
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const children = item.children ?? []

  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) toggleRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const doc = rootRef.current?.ownerDocument
    if (!doc) return
    const onPointerDown = (e: Event) => {
      if (e.target instanceof Node && !rootRef.current?.contains(e.target)) close()
    }
    doc.addEventListener('pointerdown', onPointerDown)
    return () => doc.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  const labelColor = item.active ? 'var(--site-primary)' : 'var(--site-muted-fg)'

  return (
    <div
      ref={rootRef}
      data-submenu-root
      className="relative flex items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!(e.relatedTarget instanceof Node) || !rootRef.current?.contains(e.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          e.stopPropagation()
          close(true)
        }
      }}
    >
      <a
        href={item.href}
        aria-current={item.active ? 'page' : undefined}
        onClick={(e) => item.onSelect?.(e)}
        className={`cursor-pointer text-sm font-medium transition-opacity hover:opacity-70 ${FOCUS_RING}`}
        style={{ color: labelColor, fontWeight: item.active ? 700 : 500 }}
      >
        {item.label}
      </a>
      <button
        ref={toggleRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={(LABELS[lang] ?? LABELS.tr).toggle(item.label)}
        onClick={() => setOpen((v) => !v)}
        className={`ms-0.5 inline-flex size-6 cursor-pointer items-center justify-center transition-opacity hover:opacity-70 ${FOCUS_RING}`}
        style={{ color: labelColor }}
      >
        <ChevronDown
          className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      <ul
        id={panelId}
        data-submenu-panel
        className={`absolute start-0 top-full z-30 min-w-48 pt-2 ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        <li
          className="overflow-hidden py-1 shadow-lg"
          style={{
            backgroundColor: 'var(--site-bg)',
            border: '1px solid var(--site-border)',
            borderRadius: 'var(--site-radius)',
            listStyle: 'none',
          }}
        >
          <ul>
            {children.map((child) => (
              <li key={child.key}>
                <a
                  href={child.href}
                  onClick={(e) => {
                    child.onSelect?.(e)
                    setOpen(false)
                  }}
                  className={`block cursor-pointer px-4 py-2.5 text-sm transition-opacity hover:opacity-70 ${FOCUS_RING}`}
                  style={{ color: 'var(--site-fg)' }}
                >
                  {child.label}
                </a>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </div>
  )
}
