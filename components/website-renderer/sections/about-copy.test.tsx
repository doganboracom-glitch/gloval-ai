import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AboutSection } from '@/components/website-renderer/sections/about-section'
import { SectionDetailPage } from '@/components/website-renderer/sections/section-detail-page'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite, type Section, type WebsiteSchema } from '@/lib/website-schema'

type About = Extract<Section, { type: 'about' }>

const LINK = { label: 'Devamını oku', href: '/hakkimizda' }

function baseAbout(extra: Partial<About> = {}, media?: About['media']): About {
  return {
    type: 'about',
    title: 'Hakkimizda',
    body: 'Ekibimiz ayni titizlikle calisiyor.',
    highlights: ['Hizli teslimat'],
    ...(media ? { media } : {}),
    ...extra,
  } as About
}

const WITH_IMAGE: About['media'] = {
  enabled: true,
  layout: 'corner',
  images: [{ src: '/ofis.jpg', alt: 'Kahve atölyesi ofisi' }],
} as About['media']

function renderAbout(data: About, moreLink: typeof LINK | null = LINK) {
  return renderToStaticMarkup(<AboutSection data={data} siteName="Acme" moreLink={moreLink} />)
}

describe('home about teaser', () => {
  it('shows the short text, the image with alt and the read-more link to /hakkimizda', () => {
    const html = renderAbout(baseAbout({ shortText: 'Kısa tanıtım metni. İkinci cümle.' }, WITH_IMAGE))
    expect(html).toContain('Kısa tanıtım metni. İkinci cümle.')
    expect(html).not.toContain('Ekibimiz ayni titizlikle')
    expect(html).toContain('alt="Kahve atölyesi ofisi"')
    expect(html).toMatch(/<a [^>]*href="\/hakkimizda"[^>]*>\s*Devamını oku/)
  })

  it('never renders more than 3 sentences of the short text', () => {
    const html = renderAbout(baseAbout({ shortText: 'Bir cümle. İki cümle. Üç cümle. Dört cümle.' }))
    expect(html).toContain('Üç cümle.')
    expect(html).not.toContain('Dört cümle')
  })

  it('works for the text-only layout too', () => {
    const html = renderAbout(baseAbout({ shortText: 'Sadece kısa metin.' }))
    expect(html).toContain('Sadece kısa metin.')
    expect(html).toContain('href="/hakkimizda"')
  })
})

describe('existing sites keep their look', () => {
  it('empty copy fields render byte-identical to a section without the fields', () => {
    const empty = { shortText: '', longText: '  ', vision: '', mission: '' }
    for (const media of [undefined, WITH_IMAGE]) {
      expect(renderAbout(baseAbout(empty, media))).toBe(renderAbout(baseAbout({}, media)))
    }
  })
})

function detailSite(copy: Record<string, string>): WebsiteSchema {
  const base = fallbackWebsite('kahve dükkanı ve atölye', 'tr')
  const index = base.sections.findIndex((s) => s.type === 'about')
  const withDetail = applyOperation(base, {
    op: 'updateSectionDetail',
    index,
    patch: {
      linkEnabled: true,
      pageEnabled: true,
      heading: 'Hakkımızda',
      blocks: [{ heading: 'Biz kimiz', level: 'h2', body: 'Ekibimiz her gün özenle çalışır.' }],
      approve: true,
    },
  })
  return applyOperation(withDetail, { op: 'updateAboutCopy', index, patch: copy })
}

function renderDetail(site: WebsiteSchema) {
  const style = themeToCssVars(resolveTheme(site))
  return renderToStaticMarkup(
    <div style={style}>
      <SectionDetailPage site={site} />
    </div>,
  )
}

describe('/hakkimizda page', () => {
  it('orders intro paragraph, extra paragraph, then Vizyonumuz and Misyonumuz cards', () => {
    const site = detailSite({
      longText: 'Ek paragraf cümlesi bir. İki. Üç. Dört.',
      vision: 'Vizyon metnimiz.',
      mission: 'Misyon metnimiz.',
    })
    const html = renderDetail(site)
    const intro = html.indexOf('data-gv-about-copy')
    const extra = html.indexOf('data-gv-about-long')
    const cards = html.indexOf('data-gv-about-cards')
    expect(intro).toBeGreaterThan(-1)
    expect(extra).toBeGreaterThan(intro)
    expect(cards).toBeGreaterThan(extra)
    expect(html).toContain('Vizyonumuz')
    expect(html).toContain('Misyonumuz')
    expect(html).toContain('Vizyon metnimiz.')
    expect(html.indexOf('Vizyonumuz')).toBeLessThan(html.indexOf('Misyonumuz'))
  })

  it('renders only the card that has text', () => {
    const html = renderDetail(detailSite({ vision: 'Sadece vizyon.' }))
    expect(html).toContain('Vizyonumuz')
    expect(html).not.toContain('Misyonumuz')
  })

  it('keeps the legacy detail layout when the long fields are empty', () => {
    const html = renderDetail(detailSite({ shortText: 'Sadece ana sayfa metni.' }))
    expect(html).not.toContain('data-gv-about-copy')
    expect(html).not.toContain('data-gv-about-cards')
    expect(html).toContain('Biz kimiz')
  })
})
