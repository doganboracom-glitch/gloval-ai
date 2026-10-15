/**
 * Framework-free focus-trap rules for modal dialogs. Kept free of DOM globals
 * (it only needs objects with `focus()`) so the rules are unit-testable in node;
 * `components/editor/use-dialog-focus-trap.ts` wires them to the real DOM.
 */

export type FocusableLike = { focus: () => void }

export type TabKeyLike = {
  key: string
  shiftKey: boolean
  preventDefault: () => void
}

/** Elements a keyboard user can reach inside a dialog (disabled ones are skipped). */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Keeps Tab / Shift+Tab inside the dialog. Returns true when the key was
 * handled (default prevented). Tab wraps last -> first and Shift+Tab wraps
 * first -> last; focus that has escaped the dialog is pulled back in.
 */
export function trapTabKey<T extends FocusableLike>(
  event: TabKeyLike,
  focusables: readonly T[],
  active: unknown,
): boolean {
  if (event.key !== 'Tab') return false
  if (focusables.length === 0) {
    event.preventDefault()
    return true
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const index = focusables.findIndex((el) => el === active)

  if (event.shiftKey) {
    if (index <= 0) {
      event.preventDefault()
      last.focus()
      return true
    }
    return false
  }
  if (index === -1 || index === focusables.length - 1) {
    event.preventDefault()
    first.focus()
    return true
  }
  return false
}

/** Moves focus to the first focusable element. Returns false when there is none. */
export function focusFirst(focusables: readonly FocusableLike[]): boolean {
  if (focusables.length === 0) return false
  focusables[0].focus()
  return true
}

/** Returns focus to the control that opened the dialog, if it is still on the page. */
export function restoreFocus(opener: (FocusableLike & { isConnected?: boolean }) | null | undefined): boolean {
  if (!opener || opener.isConnected === false) return false
  opener.focus()
  return true
}
