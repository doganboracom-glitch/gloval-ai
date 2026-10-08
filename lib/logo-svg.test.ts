import { describe, expect, it } from 'vitest'
import { sanitizeLogoSvg } from './logo-svg'

const GOOD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">' +
  '<defs><linearGradient id="g"><stop offset="0" stop-color="#112233"/></linearGradient></defs>' +
  '<circle cx="128" cy="128" r="100" fill="url(#g)"/>' +
  '<text x="128" y="140" text-anchor="middle" font-family="Inter, Arial, sans-serif">G</text>' +
  '</svg>'

describe('sanitizeLogoSvg', () => {
  it('keeps a valid logo and forces size attributes', () => {
    const out = sanitizeLogoSvg(`Here you go:\n\`\`\`svg\n${GOOD}\n\`\`\``)
    expect(out).toContain('<circle')
    expect(out).toContain('width="256"')
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"')
  })

  it('removes scripts, handlers and external references', () => {
    const out = sanitizeLogoSvg(
      '<svg viewBox="0 0 256 256" onload="alert(1)">' +
        '<script>alert(1)</script>' +
        '<rect width="10" height="10" onclick="x()" fill="url(https://evil.test/a)"/>' +
        '<image href="https://evil.test/a.png"/>' +
        '<foreignObject><div>hi</div></foreignObject>' +
        '<circle cx="5" cy="5" r="5" fill="red"/>' +
        '</svg>',
    )
    expect(out).not.toBeNull()
    expect(out).not.toMatch(/script|onload|onclick|evil|image|foreignObject|alert/i)
    expect(out).toContain('<circle')
  })

  it('rejects malformed nesting, nested roots and empty drawings', () => {
    expect(sanitizeLogoSvg('<svg><g><circle r="1"/></svg>')).toBeNull()
    expect(sanitizeLogoSvg('<svg><svg><circle r="1"/></svg></svg>')).toBeNull()
    expect(sanitizeLogoSvg('<svg><g></g></svg>')).toBeNull()
    expect(sanitizeLogoSvg('no svg here')).toBeNull()
  })
})
