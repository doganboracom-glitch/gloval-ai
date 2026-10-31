import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/components/language-provider'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'

const state = vi.hoisted(() => ({
  site: null as null | { name: string; schema: unknown; ownerPlanCode: string | null },
  boundProject: null as string | null,
  publishedSlug: null as string | null,
}))

vi.mock('@/lib/projects', () => ({
  getPublishedSite: async () => state.site,
}))
vi.mock('@/lib/custom-domains/service', () => ({
  resolveActiveDomainForHost: async () =>
    state.boundProject ? { websiteProjectId: state.boundProject } : null,
  getPublishedSlugForProjectId: async () => state.publishedSlug,
}))
vi.mock('@/lib/seo/site-seo', () => ({
  getSiteSeoContext: async (slug: string) => ({
    origin: `https://${slug}.gloval.site`,
    isCustomDomain: false,
    lastModified: null,
  }),
}))
vi.mock('@/lib/supabase/proxy', async () => {
  const { NextResponse } = await import('next/server')
  return { updateSession: async () => NextResponse.next() }
})

import PublishedSiteLayout, { generateMetadata } from '@/app/site/[slug]/layout'
import { middleware } from '@/middleware'

const VERIFICATION = '<meta name="google-site-verification" content="tok_abc123" />'

function siteWithHead(head: string): WebsiteSchema {
  return { ...fallbackWebsite('kahve dükkanı', 'tr'), tracking: { head } }
}

function publish(head: string) {
  state.site = { name: 'Kahve', schema: siteWithHead(head), ownerPlanCode: 'starter' }
}

async function renderHead(slug: string) {
  const params = Promise.resolve({ slug })
  const metadata = await generateMetadata({ params })
  const element = await PublishedSiteLayout({
    children: createElement('main', null, 'sayfa'),
    params,
  })
  // The root layout supplies LanguageProvider in the real app; the card reads it.
  const full = renderToStaticMarkup(createElement(LanguageProvider, { initialLang: 'tr', children: element }))
  // The platform's own cookie-banner theme <style> is not owner head code.
  const html = full.replace(/<style>:root\{--cookie-[^<]*\}<\/style>/, '')
  return { metadata, html, full }
}

async function rewriteTarget(url: string) {
  const request = new NextRequest(url, { headers: { host: new URL(url).host } })
  const response = await middleware(request)
  const rewrite = response.headers.get('x-middleware-rewrite')
  return rewrite ? new URL(rewrite).pathname : null
}

beforeEach(() => {
  state.site = null
  state.boundProject = null
  state.publishedSlug = null
})

describe('cookie banner theme in the published layout', () => {
  it('emits the tenant --cookie-* variables on :root', async () => {
    publish('')
    const { full } = await renderHead('kahve')
    expect(full).toMatch(/<style>:root\{--cookie-brand:#[0-9a-f]{6}/)
  })
})

describe('Google Search Console verification in the published <head>', () => {
  it('preserves the customer token while disabling the platform token', async () => {
    publish(VERIFICATION)
    const { metadata } = await renderHead('kahve')
    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(metadata.verification).toEqual({ google: null })
  })

  it('keeps verification in metadata, not raw head markup, and preserves scripts', async () => {
    publish(`${VERIFICATION}<script>window.gtag=1</script>`)
    const { metadata, html } = await renderHead('kahve')
    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(html).not.toContain('google-site-verification')
    expect(html).toContain('<script>window.gtag=1</script>')
    expect(html).toContain('sayfa')
  })

  it('renders nothing extra for a site without custom code', async () => {
    state.site = { name: 'Kahve', schema: fallbackWebsite('kahve', 'tr'), ownerPlanCode: 'starter' }
    const { metadata, html } = await renderHead('kahve')
    expect(metadata.other).toBeUndefined()
    expect(html).toBe('<main>sayfa</main>')
  })
})

describe('every entry path serves the same customer verification metadata', () => {
  beforeEach(() => publish(VERIFICATION))

  it('subdomain <slug>.gloval.site rewrites to /site/<slug>', async () => {
    expect(await rewriteTarget('https://kahve.gloval.site/')).toBe('/site/kahve')
    const { metadata } = await renderHead('kahve')
    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(metadata.verification).toEqual({ google: null })
  })

  it('verified custom domain rewrites to the bound site', async () => {
    state.boundProject = 'project-1'
    state.publishedSlug = 'kahve'
    expect(await rewriteTarget('https://www.kahvem.com/')).toBe('/site/kahve')
    const { metadata } = await renderHead('kahve')
    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(metadata.verification).toEqual({ google: null })
  })

  it('an unbound or unpublished custom domain does not rewrite to any site', async () => {
    state.boundProject = 'project-1'
    state.publishedSlug = null
    expect(await rewriteTarget('https://www.kahvem.com/')).toBeNull()
  })

  it('/site/<slug> on the platform host is served as is', async () => {
    expect(await rewriteTarget('https://gloval.ai/site/kahve')).toBeNull()
    const { metadata } = await renderHead('kahve')
    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(metadata.verification).toEqual({ google: null })
  })
})

describe('generated social and canonical metadata wins over snippet conflicts', () => {
  it('keeps Google verification but strips conflicting OG, Twitter, and canonical tags', async () => {
    publish(`${VERIFICATION}<meta property="og:image" content="https://attacker.example/fake.png"><meta name="twitter:image" content="https://attacker.example/twitter.png"><link rel="alternate canonical" href="https://attacker.example/"><script>window.gtag=1</script>`)
    const { metadata, html } = await renderHead('kahve')

    expect(metadata.other).toEqual({ 'google-site-verification': 'tok_abc123' })
    expect(metadata.openGraph?.images).toBeDefined()
    expect(metadata.twitter?.images).toBeDefined()
    expect(html).toContain('<script>window.gtag=1</script>')
    expect(html).not.toContain('attacker.example')
    expect(html).not.toContain('canonical')
  })
})

describe('harmful head code is never rendered', () => {
  const harmful = [
    '<meta http-equiv="refresh" content="0;url=https://evil.example" />',
    '<base href="https://evil.example/" />',
    '<script src="http://cdn.example/a.js"></script>',
    '<a href="javascript:alert(1)">x</a>',
  ]

  it.each(harmful)('drops the whole snippet: %s', async (snippet) => {
    publish(`${VERIFICATION}${snippet}`)
    const { metadata, html } = await renderHead('kahve')
    expect(metadata.other).toBeUndefined()
    expect(html).toBe('<main>sayfa</main>')
  })
})
