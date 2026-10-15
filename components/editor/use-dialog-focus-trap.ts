'use client'

import { useEffect, type RefObject } from 'react'
import { FOCUSABLE_SELECTOR, focusFirst, restoreFocus, trapTabKey } from '@/lib/dialog-focus'

/**
 * Modal focus management: on mount focus moves to the first control inside the
 * dialog, Tab/Shift+Tab cycle within it, and on unmount focus returns to the
 * control that was focused when it opened.
 */
export function useDialogFocusTrap(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

    if (!focusFirst(focusables())) container.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      const items = focusables()
      // While every control is disabled (publishing) keep focus on the dialog itself.
      if (items.length === 0 && event.key === 'Tab') container.focus()
      trapTabKey(event, items, document.activeElement)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreFocus(opener)
    }
  }, [containerRef])
}
