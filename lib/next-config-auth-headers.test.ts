import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config.mjs'

describe('auth response headers', () => {
  it('applies no-store and no-referrer to every auth route', async () => {
    const rules = (await nextConfig.headers()) as unknown as Array<{
      source: string
      headers: Array<{ key: string; value: string }>
    }>
    const authRule = rules.find(
      (rule) =>
        rule.source === '/auth/:path*' &&
        rule.headers.some((header) => header.key === 'Cache-Control'),
    )

    expect(authRule?.headers).toEqual(
      expect.arrayContaining([
        { key: 'Cache-Control', value: 'no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ]),
    )
  })
})
