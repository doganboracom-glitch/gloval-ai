import { describe, expect, it } from 'vitest'
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
// @ts-expect-error next.config.mjs ships no type declarations
import nextConfig from '../next.config.mjs'

interface HeaderRule {
  source: string
  has?: { type: string; value?: string }[]
  headers: { key: string; value: string }[]
}

/** Mirrors Next.js: every matching rule applies in order, later values replace earlier ones. */
async function permissionsPolicyFor(host: string, path: string): Promise<string | undefined> {
  const rules = (await nextConfig.headers()) as HeaderRule[]
  const hostname = host.split(':')[0]
  let value: string | undefined
  for (const rule of rules) {
    if (!pathToRegexp(rule.source).test(path)) continue
    const hostMatches = (rule.has ?? []).every(
      (condition) => condition.type !== 'host' || new RegExp(`^(?:${condition.value})$`).test(hostname),
    )
    if (!hostMatches) continue
    const header = rule.headers.find((h) => h.key === 'Permissions-Policy')
    if (header) value = header.value
  }
  return value
}

const MIC_ALLOWED = 'camera=(), microphone=(self), geolocation=()'
const MIC_DENIED = 'camera=(), microphone=(), geolocation=()'

describe('Permissions-Policy microphone scoping', () => {
  it.each([
    ['gloval.ai', '/'],
    ['gloval.ai', '/editor/abc'],
    ['gloval.ai', '/dashboard'],
    ['www.gloval.ai', '/'],
    ['localhost:3000', '/'],
    ['gloval-ai-git-v0-voice-command.vercel.app', '/editor/abc'],
  ])('allows only the microphone on platform host %s%s', async (host, path) => {
    expect(await permissionsPolicyFor(host, path)).toBe(MIC_ALLOWED)
  })

  it.each([
    ['acme.gloval.site', '/'],
    ['acme.gloval.site', '/urunler'],
    ['acme.gloval.site', '/iletisim'],
    ['www.acme-bakery.com.tr', '/'],
    ['acme-bakery.com', '/'],
    ['gloval.site', '/'],
    ['gloval.ai.evil.example', '/'],
    ['evilgloval.ai', '/'],
  ])('keeps microphone=() on customer host %s%s', async (host, path) => {
    expect(await permissionsPolicyFor(host, path)).toBe(MIC_DENIED)
  })

  it('keeps microphone=() for tenant paths even when served from the platform host', async () => {
    expect(await permissionsPolicyFor('gloval.ai', '/site/acme')).toBe(MIC_DENIED)
    expect(await permissionsPolicyFor('gloval.ai', '/site')).toBe(MIC_DENIED)
    expect(await permissionsPolicyFor('gloval.ai', '/site/acme/urunler')).toBe(MIC_DENIED)
  })

  it('never re-allows camera or geolocation anywhere', async () => {
    for (const [host, path] of [
      ['gloval.ai', '/'],
      ['acme.gloval.site', '/'],
    ]) {
      const value = (await permissionsPolicyFor(host, path)) ?? ''
      expect(value).toContain('camera=()')
      expect(value).toContain('geolocation=()')
    }
  })
})
