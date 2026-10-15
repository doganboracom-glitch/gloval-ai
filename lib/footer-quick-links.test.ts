import { describe, expect, it } from 'vitest'
import { canonicalSectionAnchor } from './website-pages'

describe('footer quick-link anchors', () => {
  it.each([
    ['about', 'about'],
    ['hakkimizda', 'about'],
    ['Hakkımızda', 'about'],
    ['services', 'services'],
    ['hizmetler', 'services'],
    ['gallery', 'gallery'],
    ['galeri', 'gallery'],
    ['reservation', 'contact'],
    ['rezervasyon', 'contact'],
    ['Rezervasyon', 'contact'],
    ['booking', 'contact'],
    ['randevu', 'contact'],
  ])('#%s -> %s', (anchor, section) => {
    expect(canonicalSectionAnchor(anchor)).toBe(section)
  })

  it('does not invent a target for unknown anchors', () => {
    expect(canonicalSectionAnchor('nonexistent-thing')).toBeNull()
  })
})
