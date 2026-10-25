// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

const search = '?token_hash=pkce_opaque&type=signup&next=%252Fdashboard'

function location(response: Response): URL {
  const value = response.headers.get('location')
  if (!value) throw new Error('Expected a redirect location')
  return new URL(value)
}

describe('GET /auth/callback/auth/confirm/verify', () => {
  it('redirects temporarily and preserves the query string byte-for-byte', async () => {
    const request = new NextRequest(`https://gloval.ai/auth/callback/auth/confirm/verify${search}`)

    const response = await GET(request)
    const target = location(response)

    expect(response.status).toBe(307)
    expect(target.pathname).toBe('/auth/confirm/verify')
    expect(target.search).toBe(search)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })
})
