import { META_GRAPH_API_VERSION } from '@/lib/ads/meta-oauth'

type FetchLike = typeof fetch

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

export async function exchangeMetaCode(
  input: { appId: string; appSecret: string; redirectUri: string; code: string },
  fetchImpl: FetchLike = fetch,
): Promise<string | null> {
  const url = new URL(`${GRAPH_BASE}/oauth/access_token`)
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('client_secret', input.appSecret)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('code', input.code)
  const response = await fetchImpl(url, { cache: 'no-store' })
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null
  return typeof body?.access_token === 'string' && body.access_token ? body.access_token : null
}

export type MetaTokenInspection = { valid: boolean; appId: string; grantedPermissions: string[] }

/** Reads the permissions actually granted to a token via debug_token. */
export async function inspectMetaToken(
  input: { appId: string; appSecret: string; accessToken: string },
  fetchImpl: FetchLike = fetch,
): Promise<MetaTokenInspection | null> {
  const url = new URL(`${GRAPH_BASE}/debug_token`)
  url.searchParams.set('input_token', input.accessToken)
  url.searchParams.set('access_token', `${input.appId}|${input.appSecret}`)
  const response = await fetchImpl(url, { cache: 'no-store' })
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as {
    data?: {
      is_valid?: unknown
      app_id?: unknown
      scopes?: unknown
      granular_scopes?: unknown
    }
  } | null
  const data = body?.data
  if (!data) return null

  const granted = new Set<string>()
  if (Array.isArray(data.scopes)) {
    for (const scope of data.scopes) if (typeof scope === 'string') granted.add(scope)
  }
  if (Array.isArray(data.granular_scopes)) {
    for (const item of data.granular_scopes) {
      const scope = (item as { scope?: unknown } | null)?.scope
      if (typeof scope === 'string') granted.add(scope)
    }
  }
  return {
    valid: data.is_valid === true,
    appId: String(data.app_id ?? ''),
    grantedPermissions: [...granted],
  }
}
