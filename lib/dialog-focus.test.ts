import { describe, expect, it, vi } from 'vitest'
import { FOCUSABLE_SELECTOR, focusFirst, restoreFocus, trapTabKey } from '@/lib/dialog-focus'

const el = (name: string) => ({ name, focus: vi.fn() })
const tab = (shiftKey = false) => ({ key: 'Tab', shiftKey, preventDefault: vi.fn() })

describe('trapTabKey', () => {
  const [a, b, c] = [el('a'), el('b'), el('c')]
  const items = [a, b, c]

  it('wraps Tab from the last control back to the first', () => {
    const event = tab()
    expect(trapTabKey(event, items, c)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(a.focus).toHaveBeenCalledTimes(1)
  })

  it('wraps Shift+Tab from the first control to the last', () => {
    const event = tab(true)
    expect(trapTabKey(event, items, a)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(c.focus).toHaveBeenCalledTimes(1)
  })

  it('lets the browser move focus between controls inside the dialog', () => {
    const forward = tab()
    const backward = tab(true)
    expect(trapTabKey(forward, items, a)).toBe(false)
    expect(trapTabKey(backward, items, c)).toBe(false)
    expect(forward.preventDefault).not.toHaveBeenCalled()
    expect(backward.preventDefault).not.toHaveBeenCalled()
  })

  it('pulls focus that escaped the dialog back inside', () => {
    const outside = {}
    const event = tab()
    expect(trapTabKey(event, items, outside)).toBe(true)
    expect(a.focus).toHaveBeenCalled()
    const back = tab(true)
    trapTabKey(back, items, outside)
    expect(c.focus).toHaveBeenCalled()
  })

  it('keeps focus in place when there is nothing focusable', () => {
    const event = tab()
    expect(trapTabKey(event, [], null)).toBe(true)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    const event = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() }
    expect(trapTabKey(event, items, c)).toBe(false)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('a single control traps both directions on itself', () => {
    const only = el('only')
    const forward = tab()
    const backward = tab(true)
    trapTabKey(forward, [only], only)
    trapTabKey(backward, [only], only)
    expect(only.focus).toHaveBeenCalledTimes(2)
  })
})

describe('focusFirst and restoreFocus', () => {
  it('moves focus to the first control on open', () => {
    const [a, b] = [el('a'), el('b')]
    expect(focusFirst([a, b])).toBe(true)
    expect(a.focus).toHaveBeenCalledTimes(1)
    expect(b.focus).not.toHaveBeenCalled()
  })

  it('reports when there is no control to focus', () => {
    expect(focusFirst([])).toBe(false)
  })

  it('returns focus to the opener on close when it is still on the page', () => {
    const opener = { focus: vi.fn(), isConnected: true }
    expect(restoreFocus(opener)).toBe(true)
    expect(opener.focus).toHaveBeenCalledTimes(1)
  })

  it('skips a missing or detached opener', () => {
    const detached = { focus: vi.fn(), isConnected: false }
    expect(restoreFocus(detached)).toBe(false)
    expect(detached.focus).not.toHaveBeenCalled()
    expect(restoreFocus(null)).toBe(false)
  })

  it('ignores disabled controls and keeps tabindex=-1 out of the tab order', () => {
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])')
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
