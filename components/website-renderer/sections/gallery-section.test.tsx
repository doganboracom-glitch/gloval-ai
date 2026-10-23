import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GallerySection, HOME_GALLERY_LIMIT } from '@/components/website-renderer/sections/gallery-section'

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ caption: `Kare ${i + 1}`, src: `https://example.com/p${i}.jpg`, alt: `Kare ${i + 1}` }))
const data = (n: number) => ({ type: 'gallery' as const, title: 'Galeri', items: items(n) }) as never

describe('home gallery strip', () => {
  it('shows at most the preview limit and a compact 4-column grid', () => {
    const html = renderToStaticMarkup(<GallerySection data={data(12)} />)
    expect(html.match(/<figure/g)?.length).toBe(HOME_GALLERY_LIMIT)
    expect(html).toContain('lg:grid-cols-4')
  })

  it('renders the all-photos link only when the gallery page exists', () => {
    const none = renderToStaticMarkup(<GallerySection data={data(3)} />)
    expect(none).not.toContain('Tüm fotoğrafları gör')
    const link = renderToStaticMarkup(
      <GallerySection data={data(3)} moreLink={{ label: 'Tüm fotoğrafları gör', href: '/galeri' }} />,
    )
    expect(link).toContain('href="/galeri"')
    expect(link).toContain('Tüm fotoğrafları gör')
  })

  it('keeps a single photo small instead of full width', () => {
    const html = renderToStaticMarkup(<GallerySection data={data(1)} />)
    expect(html).toContain('max-w-xs')
    expect(html).toContain('data-single-item="true"')
  })
})
