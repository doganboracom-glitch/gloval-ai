import { describe, expect, it } from 'vitest'
import { detectSector } from './sector-profiles'
import { starterSectorFor } from './starter-blog'

describe('detectSector: technical service', () => {
  it('does not treat a boiler/AC service as a beauty salon', () => {
    expect(detectSector('Teknik Servis Pro kombi klima bakım ve onarım')).toBe('default')
    expect(starterSectorFor({ name: 'Teknik Servis Pro', description: 'Kombi ve klima bakımı', storefront: false })).toBe('default')
  })

  it('still detects a real beauty salon', () => {
    expect(detectSector('Cilt bakımı ve güzellik salonu')).toBe('beauty')
  })

  it('keeps e-commerce intent on top', () => {
    expect(detectSector('klima satışı için e-ticaret sitesi')).toBe('ecommerce')
  })
})
