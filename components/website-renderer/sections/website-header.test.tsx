// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { WebsiteHeader } from '@/components/website-renderer/sections/website-header'
import type { WebsiteSchema } from '@/lib/website-schema'

vi.mock('@/lib/store-session-client', () => ({
  fetchStoreSession: async () => ({ loggedIn: false }),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  cleanup()
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
})

type Navigation = WebsiteSchema['navigation']

function navigation(partial: Partial<Navigation> = {}): Navigation {
  return {
    logoText: 'Demo',
    links: [
      { label: 'Hizmetler', href: '#services' },
      { label: 'Hakkımızda', href: '#about' },
      { label: 'İletişim', href: '#contact' },
    ],
    cta: { label: 'Randevu Al', href: '#contact' },
    ...partial,
  } as Navigation
}

function renderHeader(props: Partial<React.ComponentProps<typeof WebsiteHeader>> & { nav?: Navigation } = {}) {
  const { nav, ...rest } = props
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <WebsiteHeader navigation={nav ?? navigation()} {...rest} />
    </SWRConfig>,
  )
}

const trigger = () => document.querySelector<HTMLButtonElement>('[data-mobile-menu-trigger]')

describe('WebsiteHeader hamburger on corporate sites', () => {
  it('renders the hamburger only below md and keeps the desktop nav inline from md', () => {
    renderHeader()
    expect(trigger()).not.toBeNull()
    expect(trigger()!.className).toContain('md:hidden')
    const desktopNav = document.querySelector('header > div:nth-of-type(2) > nav')!
    expect(desktopNav.className).toContain('hidden')
    expect(desktopNav.className).toContain('md:flex')
    expect(within(desktopNav as HTMLElement).getAllByRole('link')).toHaveLength(3)
  })

  it('keeps the logo on the left and the hamburger last in the right-hand group', () => {
    renderHeader()
    const row = document.querySelector('header > div:nth-of-type(2)')!
    expect(row.firstElementChild!.getAttribute('aria-label')).toBe('Demo')
    const group = row.lastElementChild!
    // Only the (fixed, off-flow) panel root may follow the hamburger.
    expect(trigger()!.nextElementSibling).toBe(group.lastElementChild)
    expect(group.lastElementChild!.hasAttribute('data-mobile-menu-root')).toBe(true)
  })

  it('shows the main CTA inline from md and inside the menu panel below it', () => {
    renderHeader()
    const inline = document.querySelector('header > div:nth-of-type(2) > div:last-child > div.hidden.md\\:block')
    expect(inline?.textContent).toBe('Randevu Al')
    fireEvent.click(trigger()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Randevu Al' })).toBeTruthy()
    for (const name of ['Hizmetler', 'Hakkımızda', 'İletişim']) {
      expect(within(dialog).getByRole('link', { name })).toBeTruthy()
    }
  })

  it('shows social icons at the bottom of the panel', () => {
    renderHeader({ socialLinks: [{ network: 'instagram', label: 'Instagram', url: 'https://instagram.com/x' }] })
    fireEvent.click(trigger()!)
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('[data-social-links="menu"]')).not.toBeNull()
  })

  it('moves to the lg breakpoint when ten links would not fit on a tablet', () => {
    const links = Array.from({ length: 10 }, (_, i) => ({ label: `Sayfa ${i + 1}`, href: `#s${i}` }))
    renderHeader({ nav: navigation({ links }) })
    expect(trigger()!.className).toContain('lg:hidden')
    const desktopNav = document.querySelector('header > div:nth-of-type(2) > nav')!
    expect(desktopNav.className).toContain('lg:flex')
    expect(desktopNav.className).not.toContain('md:flex')
    fireEvent.click(trigger()!)
    expect(within(screen.getByRole('dialog')).getAllByRole('link').length).toBeGreaterThanOrEqual(10)
  })

  it('switches pages in memory from the menu on a multi-page site and marks the active one', () => {
    const onNavigate = vi.fn()
    renderHeader({
      pages: [
        { slug: 'ana-sayfa', title: 'Ana Sayfa', isHome: true },
        { slug: 'hakkimizda', title: 'Hakkımızda', isHome: false },
      ],
      activeSlug: 'ana-sayfa',
      onNavigate,
    })
    fireEvent.click(trigger()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Ana Sayfa' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hakkımızda' }))
    expect(onNavigate).toHaveBeenCalledWith('hakkimizda')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders no hamburger when there is nothing to put in it', () => {
    renderHeader({ nav: navigation({ links: [], cta: undefined }) })
    expect(trigger()).toBeNull()
  })

  it('lifts the header above floating actions while the menu is open', () => {
    renderHeader()
    const header = document.querySelector('header')!
    expect(header.className).toContain('z-20')
    fireEvent.click(trigger()!)
    expect(header.className).toContain('z-50')
  })
})

describe('WebsiteHeader hamburger on storefronts', () => {
  const store = {
    storeSlug: 'dukkan',
    cartSlug: 'dukkan',
    nav: navigation({
      links: [
        { label: 'Ürünler', href: '#products' },
        { label: 'Hakkımızda', href: '#about' },
      ],
      cta: { label: 'Sepet', href: '/cart' },
    }),
  }

  it('keeps account and cart side by side, with the hamburger right after them', () => {
    renderHeader(store)
    const account = document.querySelector('[data-header-account]')!
    const cart = document.querySelector('[data-header-cart]')!
    expect(account.parentElement).toBe(cart.parentElement)
    expect(cart.parentElement).toBe(trigger()!.parentElement)
    const order = Array.from(account.parentElement!.children)
    expect(order.indexOf(account)).toBeLessThan(order.indexOf(cart))
    expect(order.indexOf(cart)).toBeLessThan(order.indexOf(trigger()!))
  })

  it('keeps the cart reachable by name even when only its icon shows on narrow screens', () => {
    renderHeader(store)
    expect(screen.getByRole('button', { name: 'Sepet' })).toBeTruthy()
  })

  it('does not duplicate the cart CTA in the panel and links the product list to the store', () => {
    renderHeader(store)
    fireEvent.click(trigger()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('link', { name: 'Sepet' })).toBeNull()
    expect(within(dialog).getByRole('link', { name: 'Ürünler' }).getAttribute('href')).toBe('/site/dukkan/store')
  })

  it('turns page entries into real links on store sub-pages that have no page switcher', () => {
    renderHeader({
      ...store,
      pages: [
        { slug: 'ana-sayfa', title: 'Ana Sayfa', isHome: true },
        { slug: 'hakkimizda', title: 'Hakkımızda', isHome: false },
      ],
    })
    fireEvent.click(trigger()!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Ana Sayfa' }).getAttribute('href')).toBe('/site/dukkan')
    expect(within(dialog).getByRole('link', { name: 'Hakkımızda' }).getAttribute('href')).toBe('/site/dukkan/hakkimizda')
  })
})
