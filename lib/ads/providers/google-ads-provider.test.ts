import { describe, expect, it, vi } from 'vitest'
import { createGoogleAdsProvider, GOOGLE_ADS_API_VERSION } from '@/lib/ads/providers/google-ads-provider'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

type FetchCall = { url: string; init: RequestInit }

function makeFetch(responses: unknown[]) {
  const calls: FetchCall[] = []
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init })
    const body = responses.shift()
    if (body instanceof Response) return body
    return jsonResponse(body)
  }
  return { fetchImpl, calls }
}

describe('Google Ads read-only transport', () => {
  it('uses GET for listAccessibleCustomers and sends OAuth Authorization', async () => {
    const { fetchImpl, calls } = makeFetch([{ resourceNames: [] }])
    const provider = createGoogleAdsProvider({ clientId: 'client-id', clientSecret: 'client-secret', fetchImpl })

    await expect(provider.listAccounts('oauth-access-token')).resolves.toEqual([])

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`)
    expect(calls[0].init.method).toBe('GET')
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('authorization')).toBe('Bearer oauth-access-token')
    expect(headers.has('developer-token')).toBe(false)
  })

  it('uses POST searchStream and sends the manager login-customer-id for child accounts', async () => {
    const { fetchImpl, calls } = makeFetch([
      { resourceNames: ['customers/1234567890'] },
      [{ results: [{ customer: { id: '1234567890', descriptiveName: 'Northwind MCC', currencyCode: 'USD', manager: true } }] }],
      [{ results: [{ customerClient: { clientCustomer: 'customers/2345678901', descriptiveName: 'Northwind Store', currencyCode: 'TRY', manager: false } }] }],
    ])
    const provider = createGoogleAdsProvider({ clientId: 'client-id', clientSecret: 'client-secret', fetchImpl })

    const accounts = await provider.listAccounts('oauth-access-token')

    expect(calls).toHaveLength(3)
    expect(calls[0].init.method).toBe('GET')
    expect(calls[1].init.method).toBe('POST')
    expect(calls[2].init.method).toBe('POST')
    expect(calls[1].url).toBe(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/1234567890/googleAds:searchStream`)

    const detailHeaders = new Headers(calls[1].init.headers)
    const childHeaders = new Headers(calls[2].init.headers)
    expect(detailHeaders.get('authorization')).toBe('Bearer oauth-access-token')
    expect(detailHeaders.get('login-customer-id')).toBeNull()
    expect(childHeaders.get('authorization')).toBe('Bearer oauth-access-token')
    expect(childHeaders.get('login-customer-id')).toBe('1234567890')
    expect(childHeaders.has('developer-token')).toBe(false)

    expect(accounts).toEqual([
      {
        externalAccountId: '1234567890',
        name: 'Northwind MCC',
        currency: 'USD',
        loginCustomerId: null,
        isManager: true,
      },
      {
        externalAccountId: '2345678901',
        name: 'Northwind Store',
        currency: 'TRY',
        loginCustomerId: '1234567890',
        isManager: false,
      },
    ])
  })

  it('uses S256 PKCE in the authorization URL', () => {
    const provider = createGoogleAdsProvider({ clientId: 'client-id', clientSecret: 'client-secret' })
    const url = new URL(provider.buildAuthUrl({
      state: 'opaque-state',
      codeChallenge: 'challenge',
      redirectUri: 'https://app.example.com/api/ads/google/callback',
    }))

    expect(url.searchParams.get('code_challenge')).toBe('challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})
