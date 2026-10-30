import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { buildCleanSite } from '@/lib/__fixtures__/sample-site'
import { DEFAULT_CURSOR_AURA } from '@/lib/cursor-aura'
import type { WebsiteSchema } from '@/lib/website-schema'

const state = vi.hoisted(() => ({ schema: null as unknown }))

vi.mock('@/lib/projects', () => ({
  getPublishedSite: async () => ({ schema: state.schema }),
}))
vi.mock('@/components/cookie-consent', () => ({ CookieConsent: () => <div data-testid="cookie" /> }))
vi.mock('@/components/site/cursor-aura-gate', () => ({
  CursorAuraGate: ({ config }: { config: { colors: string[] } }) => (
    <div data-effect="cursor-aura" data-colors={config.colors.join(',')} />
  ),
}))

import PublishedSiteLayout from './layout'

async function render(schema: WebsiteSchema): Promise<string> {
  state.schema = schema
  const tree = await PublishedSiteLayout({
    children: <main>Sayfa içeriği</main>,
    params: Promise.resolve({ slug: 'kahve' }),
  })
  return renderToStaticMarkup(tree)
}

const legacy = (): WebsiteSchema => {
  const site = buildCleanSite()
  delete (site as { effects?: unknown }).effects
  return site
}

describe('tenant layout and effects', () => {
  it('legacy site without effects: renders the page and no effect output', async () => {
    const html = await render(legacy())
    expect(html).toContain('Sayfa içeriği')
    expect(html).not.toContain('data-effect')
  })

  it('legacy site without effects: output is identical to a site whose effect flag is off', async () => {
    const withoutEffects = await render(legacy())
    const flagOff = await render({ ...legacy(), effects: { cursorAura: { ...DEFAULT_CURSOR_AURA, enabled: false } } })
    expect(flagOff).toBe(withoutEffects)
  })

  it('flag off: no effect code in the page output even when a configuration is stored', async () => {
    const html = await render({
      ...legacy(),
      effects: { cursorAura: { ...DEFAULT_CURSOR_AURA, enabled: false, colors: ['#22C55E'] } },
    })
    expect(html).not.toContain('data-effect')
    expect(html).not.toContain('#22C55E')
    expect(html).not.toMatch(/aura/i)
  })

  it('flag on: the effect is rendered with the stored colours', async () => {
    const html = await render({
      ...legacy(),
      effects: { cursorAura: { ...DEFAULT_CURSOR_AURA, enabled: true, colors: ['#22C55E'] } },
    })
    expect(html).toContain('data-effect="cursor-aura"')
    expect(html).toContain('#22C55E')
  })

  it('flag off: an invalid stored configuration renders nothing and does not break the page', async () => {
    const html = await render({ ...legacy(), effects: { cursorAura: { enabled: true, colors: ['red'] } } } as unknown as WebsiteSchema)
    expect(html).toContain('Sayfa içeriği')
    expect(html).not.toContain('data-effect')
  })
})
