import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRedirectUrl, unstable_getResponseFromNextConfig } from 'next/experimental/testing/server'
import nextConfig from '../next.config.mjs'
import { readAttribution, snapshotFromLocation, writeAttribution } from './attribution'

const redirects = [
  {
    source: '/instagram',
    destination: '/?utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=bio_tr',
    params: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'bio_tr' },
  },
  {
    source: '/instagram-en',
    destination: '/?lang=en&utm_source=instagram&utm_medium=social&utm_campaign=launch&utm_content=bio_en',
    params: { utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'bio_en' },
  },
  {
    source: '/x',
    destination: '/?utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=bio_tr',
    params: { utm_source: 'x', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'bio_tr' },
  },
  {
    source: '/x-en',
    destination: '/?lang=en&utm_source=x&utm_medium=social&utm_campaign=launch&utm_content=bio_en',
    params: { utm_source: 'x', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'bio_en' },
  },
  {
    source: '/linkedin',
    destination: '/?lang=en&utm_source=linkedin&utm_medium=social&utm_campaign=launch&utm_content=company_page',
    params: { utm_source: 'linkedin', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'company_page' },
  },
  {
    source: '/facebook',
    destination: '/?utm_source=facebook&utm_medium=social&utm_campaign=launch&utm_content=page_tr',
    params: { utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'launch', utm_content: 'page_tr' },
  },
] as const

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('social campaign short links', () => {
  it.each(redirects)('$source redirects temporarily with campaign attribution', async ({ source, destination, params }) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://gloval.ai${source}`,
      nextConfig: { redirects: nextConfig.redirects },
    })

    expect(response.status).toBe(307)
    const redirectUrl = getRedirectUrl(response)
    if (!redirectUrl) throw new Error('Expected a redirect location')
    expect(redirectUrl).toBe(`https://gloval.ai${destination}`)

    vi.stubGlobal('window', { location: new URL(redirectUrl) })
    const documentMock = { referrer: '', cookie: '' }
    vi.stubGlobal('document', documentMock)

    const attribution = snapshotFromLocation()
    if (!attribution) throw new Error('Expected attribution on the redirected homepage')

    expect(attribution.landing_path).toBe('/')
    expect(attribution.params).toEqual(params)

    writeAttribution(attribution)
    expect(readAttribution()).toMatchObject({ landing_path: '/', params })
  })
})
