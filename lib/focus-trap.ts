/**
 * Index of the element that should receive focus when Tab / Shift+Tab is
 * pressed inside a modal with `count` focusable elements. Focus wraps around
 * at both ends, and an element outside the modal (`current === -1`) is pulled
 * back in.
 */
export function nextTrapIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1
  if (current < 0) return backwards ? count - 1 : 0
  if (backwards) return current === 0 ? count - 1 : current - 1
  return current === count - 1 ? 0 : current + 1
}
