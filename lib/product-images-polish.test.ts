import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProductImagePlaceholder } from '@/components/store/product-image-placeholder'
import { ProductGallery } from '@/components/store/product-gallery'
import { lacksImage, placeholderInitial } from './product-image-placeholder'
import { galleryView } from './product-gallery-view'
import { canPlayHoverGallery, nextGalleryIndex } from './product-card-gallery'

describe('placeholderInitial', () => {
  it('uses the first letter, upper-cased with Turkish rules', () => {
    expect(placeholderInitial('pırlanta küpe')).toBe('P')
    expect(placeholderInitial('ince zincir')).toBe('İ')
    expect(placeholderInitial('  "Altın" yüzük')).toBe('A')
  })

  it('returns an empty string when there is no letter', () => {
    expect(placeholderInitial('')).toBe('')
    expect(placeholderInitial(null)).toBe('')
    expect(placeholderInitial('---')).toBe('')
  })
})

describe('lacksImage', () => {
  it('is true for missing, empty or url-less image lists', () => {
    expect(lacksImage({ images: [] })).toBe(true)
    expect(lacksImage({ images: null })).toBe(true)
    expect(lacksImage({ images: [{ url: '' }] })).toBe(true)
  })

  it('is false once any image has a url', () => {
    expect(lacksImage({ images: [{ url: '/a.png' }] })).toBe(false)
  })
})

describe('ProductImagePlaceholder', () => {
  it('renders a decorative themed placeholder with the initial and no <img>', () => {
    const html = renderToStaticMarkup(createElement(ProductImagePlaceholder, { name: 'Pırlanta Küpe' }))
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('>P<')
    expect(html).toContain('--site-primary')
    expect(html).not.toContain('<img')
  })
})

describe('ProductGallery', () => {
  const image = (n: number) => ({ url: `/img-${n}.png`, alt: `Görsel ${n}` })

  it('shows the placeholder (no img, no strip) with zero images', () => {
    const html = renderToStaticMarkup(createElement(ProductGallery, { images: [], name: 'Zincir' }))
    expect(html).toContain('data-image-placeholder')
    expect(html).not.toContain('<img')
  })

  it('shows a single image without strip, arrows or counter', () => {
    const html = renderToStaticMarkup(createElement(ProductGallery, { images: [image(1)], name: 'Zincir' }))
    expect(html).toContain('/img-1.png')
    expect(html).not.toContain('data-image-placeholder')
    expect(html).not.toContain('1 / 1')
    expect(galleryView(1, 0)).toMatchObject({ showStrip: false, showArrows: false, counter: null })
  })

  it('shows thumbnails and a counter with 2+ images', () => {
    const html = renderToStaticMarkup(createElement(ProductGallery, { images: [image(1), image(2), image(3)], name: 'Zincir' }))
    expect(html).toContain('/img-2.png')
    expect(html).toContain('/img-3.png')
    expect(html).toContain('1 / 3')
  })
})

describe('card hover gallery', () => {
  it('cycles only with 2+ images on hover-capable, motion-allowed devices', () => {
    const base = { hoverCapable: true, reducedMotion: false }
    expect(canPlayHoverGallery({ ...base, imageCount: 0 })).toBe(false)
    expect(canPlayHoverGallery({ ...base, imageCount: 1 })).toBe(false)
    expect(canPlayHoverGallery({ ...base, imageCount: 3 })).toBe(true)
    expect(canPlayHoverGallery({ imageCount: 3, hoverCapable: false, reducedMotion: false })).toBe(false)
    expect(nextGalleryIndex(2, 3)).toBe(0)
  })
})
