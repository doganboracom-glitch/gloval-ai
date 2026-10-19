// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  MobileMenu,
  hamburgerBreakpoint,
  isHamburgerVisibleAt,
  type MobileMenuItem,
} from '@/components/website-renderer/sections/mobile-menu'

afterEach(() => {
  cleanup()
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
})

const items = (onSelect = vi.fn()): MobileMenuItem[] => [
  { key: 'home', label: 'Ana Sayfa', href: '#home', onSelect, active: true },
  { key: 'about', label: 'Hakkımızda', href: '#about', onSelect },
  { key: 'contact', label: 'İletişim', onSelect },
]

function setup(props: Partial<React.ComponentProps<typeof MobileMenu>> = {}) {
  render(<MobileMenu items={items()} {...props} />)
  const trigger = screen.getByRole('button', { name: 'Menüyü aç' })
  return { trigger }
}

describe('MobileMenu open/close', () => {
  it('starts closed with correct aria wiring', () => {
    const { trigger } = setup()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    const controlled = document.getElementById(trigger.getAttribute('aria-controls')!)
    expect(controlled).not.toBeNull()
    expect(controlled!.hasAttribute('hidden')).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens on click: aria-expanded, label, dialog, scroll lock, focus on the close button', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-label')).toBe('Menüyü kapat')
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(dialog.querySelector('button[aria-label="Menüyü kapat"]'))
  })

  it('closes on Escape, restores scroll and returns focus to the hamburger', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(document.documentElement.style.overflow).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on the X button', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.click(screen.getAllByRole('button', { name: 'Menüyü kapat' }).find((b) => b !== trigger)!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on outside (backdrop) click', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.click(document.querySelector('[data-mobile-menu-backdrop]')!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('does not close when clicking empty space inside the panel', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('closes after a link is chosen and still runs the link handler', () => {
    const onSelect = vi.fn()
    const { trigger } = setup({ items: items(onSelect) })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('link', { name: 'Hakkımızda' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('closes after a button item is chosen', () => {
    const onSelect = vi.fn()
    const { trigger } = setup({ items: items(onSelect) })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'İletişim' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes when the viewport grows past the breakpoint', () => {
    const listeners: Array<(e: { matches: boolean }) => void> = []
    const original = window.matchMedia
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb),
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia
    try {
      const { trigger } = setup()
      fireEvent.click(trigger)
      act(() => listeners.forEach((cb) => cb({ matches: true })))
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })
})

describe('MobileMenu accessibility and content', () => {
  it('marks the active page and renders links as links and the rest as buttons', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    expect(screen.getByRole('link', { name: 'Ana Sayfa' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Hakkımızda' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('button', { name: 'İletişim' })).toBeTruthy()
  })

  it('wraps focus: Tab on the last control goes to the first, Shift+Tab on the first goes to the last', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    const close = dialog.querySelector<HTMLButtonElement>('button[aria-label="Menüyü kapat"]')!
    const last = screen.getByRole('button', { name: 'İletişim' })

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('pulls focus back into the panel when it escapes', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    const { trigger } = setup()
    fireEvent.click(trigger)
    outside.focus()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    outside.remove()
  })

  it('keeps ten links reachable through a scrollable list', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ key: `k${i}`, label: `Sayfa ${i + 1}`, href: `#p${i}` }))
    const { trigger } = setup({ items: many })
    fireEvent.click(trigger)
    expect(screen.getAllByRole('link')).toHaveLength(10)
    const list = screen.getByRole('dialog').querySelector('nav')!.parentElement!
    expect(list.className).toContain('overflow-y-auto')
    expect(list.className).toContain('overscroll-contain')
  })

  it('gives every item a 44px+ touch target', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    expect(trigger.className).toContain('size-11')
    for (const el of [...screen.getAllByRole('link'), screen.getByRole('button', { name: 'İletişim' })]) {
      expect(el.className).toContain('min-h-12')
    }
  })

  it('renders the CTA and the social icons at the bottom of the panel, and closes on CTA click', () => {
    const { trigger } = setup({
      cta: <a href="#randevu">Randevu Al</a>,
      socialLinks: [{ network: 'instagram', label: 'Instagram', url: 'https://instagram.com/x' }],
    })
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    const cta = screen.getByRole('link', { name: 'Randevu Al' })
    const social = screen.getByRole('link', { name: 'Instagram' })
    expect(Boolean(cta.compareDocumentPosition(social) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
    expect(dialog.querySelector('nav')!.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(cta)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('uses logical properties and theme tokens so RTL and dark themes work', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('end-0')
    expect(dialog.style.backgroundColor).toBe('var(--site-bg)')
    expect(dialog.style.color).toBe('var(--site-fg)')
  })

  it('uses dvh so the iOS Safari address bar does not clip the panel', () => {
    const { trigger } = setup()
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog').className).toContain('h-dvh')
  })

  it('speaks English when asked', () => {
    render(<MobileMenu items={items()} lang="en" />)
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy()
  })
})

describe('hamburger visibility rule', () => {
  it('shows below 768px (375, 390) and hides from 768px for a normal menu', () => {
    const bp = hamburgerBreakpoint(5)
    expect(bp).toBe('md')
    expect(isHamburgerVisibleAt(375, bp)).toBe(true)
    expect(isHamburgerVisibleAt(390, bp)).toBe(true)
    expect(isHamburgerVisibleAt(767, bp)).toBe(true)
    expect(isHamburgerVisibleAt(768, bp)).toBe(false)
    expect(isHamburgerVisibleAt(1280, bp)).toBe(false)
  })

  it('keeps the hamburger on tablets when a long menu does not fit inline', () => {
    const bp = hamburgerBreakpoint(8)
    expect(bp).toBe('lg')
    expect(isHamburgerVisibleAt(768, bp)).toBe(true)
    expect(isHamburgerVisibleAt(1023, bp)).toBe(true)
    expect(isHamburgerVisibleAt(1024, bp)).toBe(false)
  })

  it('maps the breakpoint to the matching Tailwind hide class on the trigger', () => {
    const { rerender } = render(<MobileMenu items={items()} breakpoint="md" />)
    expect(screen.getByRole('button', { name: 'Menüyü aç' }).className).toContain('md:hidden')
    rerender(<MobileMenu items={items()} breakpoint="lg" />)
    expect(screen.getByRole('button', { name: 'Menüyü aç' }).className).toContain('lg:hidden')
  })
})
