// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildDemoSite, demos } from '@/lib/demos'

beforeAll(() => {
  class NoopResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', NoopResizeObserver)
  Element.prototype.scrollIntoView = () => {}
  window.scrollTo = () => {}
})

afterEach(cleanup)

describe('demo home "Daha fazlası…" link', () => {
  it('opens the long about page in place instead of leaving the demo', () => {
    const site = buildDemoSite(demos[0], 'tr')
    const { container } = render(<WebsiteRenderer site={site} />)

    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(link).toBeTruthy()
    expect(link!.getAttribute('href')).toBe('/hakkimizda')

    // fireEvent returns false when preventDefault was called, i.e. the browser
    // will not navigate to gloval.ai/hakkimizda (which is a 404).
    const notPrevented = fireEvent.click(link!)
    expect(notPrevented).toBe(false)
    expect(container.querySelector('a[href="/hakkimizda"]')).toBeNull()
  })

  it('soft-navigates to /demo/<slug>/hakkimizda and back to the demo home via the breadcrumb', async () => {
    const { resolveAboutDetail } = await import('@/lib/section-detail')
    const site = buildDemoSite(demos[0], 'tr')
    const aboutPageSlug = resolveAboutDetail(site)?.pageSlug ?? null
    expect(aboutPageSlug).toBeTruthy()
    const slug = demos[0].slug
    const demoRoutes = { home: `/demo/${slug}`, about: `/demo/${slug}/hakkimizda`, aboutPageSlug }
    const onDemoRoute = vi.fn()

    const home = render(<WebsiteRenderer site={site} demoRoutes={demoRoutes} onDemoRoute={onDemoRoute} />)
    const more = Array.from(home.container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(fireEvent.click(more!)).toBe(false)
    expect(onDemoRoute).toHaveBeenCalledWith(`/demo/${slug}/hakkimizda`)
    home.unmount()

    onDemoRoute.mockClear()
    const about = render(
      <WebsiteRenderer site={site} initialPage={aboutPageSlug} demoRoutes={demoRoutes} onDemoRoute={onDemoRoute} />,
    )
    const crumb = about.container.querySelector('nav[aria-label="Breadcrumb"] a')
    expect(crumb).toBeTruthy()
    expect(fireEvent.click(crumb!)).toBe(false)
    expect(onDemoRoute).toHaveBeenCalledWith(`/demo/${slug}`)
  })

  it('still lets a published multi-page site navigate for real', () => {
    const site = buildDemoSite(demos[0], 'tr')
    const { container } = render(<WebsiteRenderer site={site} pageRouting />)
    const link = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Daha fazlası'))
    expect(link).toBeTruthy()
  })
})
