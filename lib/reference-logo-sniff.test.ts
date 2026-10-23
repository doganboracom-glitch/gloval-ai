import { describe, expect, it } from 'vitest'
import { isAllowedLogoDataUri, sniffLogoType } from '@/lib/references'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
const SVG = Array.from('<svg xmlns="http://w', (c) => c.charCodeAt(0))

const toDataUri = (mime: string, bytes: number[]) => {
  const padded = [...bytes, ...new Array(Math.max(0, 18 - bytes.length)).fill(0)]
  return `data:${mime};base64,${Buffer.from(padded).toString('base64')}`
}

describe('reference logo content sniffing', () => {
  it('recognises PNG, JPEG and WebP by their bytes', () => {
    expect(sniffLogoType(PNG)).toBe('image/png')
    expect(sniffLogoType(JPEG)).toBe('image/jpeg')
    expect(sniffLogoType(WEBP)).toBe('image/webp')
  })

  it('rejects SVG and unknown content', () => {
    expect(sniffLogoType(SVG)).toBeNull()
    expect(sniffLogoType([])).toBeNull()
  })

  it('accepts a data URI only when the bytes match an allowed type', () => {
    expect(isAllowedLogoDataUri(toDataUri('image/png', PNG))).toBe(true)
    expect(isAllowedLogoDataUri(toDataUri('image/jpeg', JPEG))).toBe(true)
    expect(isAllowedLogoDataUri(toDataUri('image/webp', WEBP))).toBe(true)
  })

  it('rejects an SVG renamed to an allowed MIME, and SVG data URIs', () => {
    expect(isAllowedLogoDataUri(toDataUri('image/png', SVG))).toBe(false)
    expect(isAllowedLogoDataUri(toDataUri('image/svg+xml', SVG))).toBe(false)
    expect(isAllowedLogoDataUri('https://example.com/logo.png')).toBe(false)
  })
})
