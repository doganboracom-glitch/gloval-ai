import { describe, expect, it } from 'vitest'
import { buildAddressEmbedSrc, buildDirectionsUrl, parseMapInput, sanitizeMapSrc } from '@/lib/map-embed'
import { resolveShortMapLink } from '@/lib/map-short-link'

const GOOGLE_IFRAME =
  '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1d3010&amp;x=1" width="600" height="450" style="border:0;" allowfullscreen="" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'

describe('parseMapInput', () => {
  it('treats blank input as empty', () => {
    expect(parseMapInput('   ')).toEqual({ kind: 'empty' })
  })

  it('extracts only the src of a Google iframe and decodes entities', () => {
    const result = parseMapInput(GOOGLE_IFRAME)
    expect(result).toEqual({ kind: 'embed', src: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1d3010&x=1' })
  })

  it('rejects scripts and javascript: urls', () => {
    expect(parseMapInput(`${GOOGLE_IFRAME}<script>alert(1)</script>`)).toEqual({ kind: 'invalid', reason: 'unsafe' })
    expect(parseMapInput('<iframe src="javascript:alert(1)"></iframe>')).toEqual({ kind: 'invalid', reason: 'unsafe' })
  })

  it('rejects iframes pointing at other domains, including look-alikes', () => {
    for (const src of [
      'https://evil.com/maps/embed',
      'https://www.google.com.evil.com/maps/embed',
      'https://www.google.com@evil.com/maps/embed',
      'http://www.google.com/maps/embed',
    ]) {
      expect(parseMapInput(`<iframe src="${src}"></iframe>`)).toEqual({ kind: 'invalid', reason: 'not-google' })
    }
  })

  it('rejects an iframe without a src', () => {
    expect(parseMapInput('<iframe width="1"></iframe>')).toEqual({ kind: 'invalid', reason: 'no-src' })
  })

  it('converts a place link to a keyless embed', () => {
    const result = parseMapInput('https://www.google.com/maps/place/Galata+Kulesi/@41.0256,28.9741,17z/data=!3m1')
    expect(result).toEqual({ kind: 'embed', src: 'https://www.google.com/maps?q=Galata+Kulesi&output=embed' })
  })

  it('converts a ?q= link and a coordinates link', () => {
    expect(parseMapInput('https://maps.google.com/maps?q=Ankara')).toMatchObject({ kind: 'embed' })
    expect(parseMapInput('https://www.google.com/maps/@41.0,29.0,15z')).toEqual({
      kind: 'embed',
      src: 'https://www.google.com/maps?q=41.0%2C29.0&output=embed',
    })
  })

  it('refuses directions links and other domains', () => {
    expect(parseMapInput('https://www.google.com/maps/dir/A/B')).toEqual({ kind: 'invalid', reason: 'unsupported-link' })
    expect(parseMapInput('https://example.com/maps/place/x')).toEqual({ kind: 'invalid', reason: 'not-google' })
  })

  it('flags short links for server resolution', () => {
    expect(parseMapInput('https://maps.app.goo.gl/abc123')).toEqual({
      kind: 'short-link',
      url: 'https://maps.app.goo.gl/abc123',
    })
  })
})

describe('sanitizeMapSrc', () => {
  it('accepts only Google embed endpoints', () => {
    expect(sanitizeMapSrc('https://www.google.com/maps/embed?pb=1')).not.toBeNull()
    expect(sanitizeMapSrc('https://www.google.com/maps?q=x&output=embed')).not.toBeNull()
    expect(sanitizeMapSrc('https://www.google.com/maps?q=x')).toBeNull()
    expect(sanitizeMapSrc('https://www.google.com/maps/embedx')).toBeNull()
    expect(sanitizeMapSrc('https://www.google.com/maps/embed/../../x')).toBeNull()
    expect(sanitizeMapSrc('data:text/html,hi')).toBeNull()
    expect(sanitizeMapSrc(undefined)).toBeNull()
  })
})

describe('address helpers', () => {
  it('builds a keyless embed and an official one when a key exists', () => {
    expect(buildAddressEmbedSrc('Kadıköy, İstanbul')).toContain('output=embed')
    expect(buildAddressEmbedSrc('Kadıköy', 'KEY')).toContain('/maps/embed/v1/place')
    expect(buildAddressEmbedSrc('   ')).toBeNull()
    expect(sanitizeMapSrc(buildAddressEmbedSrc('Kadıköy'))).not.toBeNull()
  })

  it('builds a directions url', () => {
    expect(buildDirectionsUrl('Kadıköy')).toContain('destination=')
    expect(buildDirectionsUrl('')).toBeNull()
  })
})

describe('resolveShortMapLink', () => {
  const redirect = (location: string) => async () => ({
    status: 302,
    headers: { get: (n: string) => (n.toLowerCase() === 'location' ? location : null) },
  })

  it('follows a redirect to a Google Maps place', async () => {
    const result = await resolveShortMapLink(
      'https://maps.app.goo.gl/x',
      redirect('https://www.google.com/maps/place/Ofis/@41,29,15z'),
    )
    expect(result).toEqual({ ok: true, src: 'https://www.google.com/maps?q=Ofis&output=embed' })
  })

  it('refuses redirects that leave Google and non-short-link inputs', async () => {
    expect(await resolveShortMapLink('https://maps.app.goo.gl/x', redirect('https://evil.com/'))).toEqual({ ok: false })
    expect(await resolveShortMapLink('https://evil.com/x', redirect('https://www.google.com/maps/place/A'))).toEqual({ ok: false })
  })
})
