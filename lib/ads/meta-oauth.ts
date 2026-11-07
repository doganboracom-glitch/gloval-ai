export const META_GRAPH_API_VERSION = 'v23.0'
export const META_OAUTH_DIALOG_URL = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`
export const META_OAUTH_CALLBACK_COOKIE_PATH = '/api/ads/meta/callback'
export const META_OAUTH_COOKIE_PREFIX = 'gloval_ads_meta_oauth_'

/** Permissions the Meta connection must end up with, in both login modes. */
export const META_REQUIRED_PERMISSIONS = [
  'ads_read',
  'business_management',
  'pages_show_list',
  'instagram_basic',
] as const

export type MetaLoginMode = 'config_id' | 'scope'

export function resolveMetaLoginMode(loginConfigId: string | null): MetaLoginMode {
  return loginConfigId ? 'config_id' : 'scope'
}

export function buildMetaAuthUrl(input: {
  appId: string
  redirectUri: string
  state: string
  loginConfigId: string | null
}): string {
  const url = new URL(META_OAUTH_DIALOG_URL)
  url.searchParams.set('client_id', input.appId)
  url.searchParams.set('redirect_uri', input.redirectUri)
  url.searchParams.set('state', input.state)
  url.searchParams.set('response_type', 'code')

  if (input.loginConfigId) {
    // Facebook Login for Business: permissions come from the Configuration,
    // so `scope` must NOT be sent. The override makes Meta return a code
    // instead of the token type the configuration defaults to.
    url.searchParams.set('config_id', input.loginConfigId)
    url.searchParams.set('override_default_response_type', 'true')
  } else {
    url.searchParams.set('scope', META_REQUIRED_PERMISSIONS.join(','))
  }
  return url.toString()
}

export type MetaPermissionCheck =
  | { ok: true; missing: [] }
  | {
      ok: false
      missing: string[]
      code: 'missing_permissions' | 'login_config_missing_permissions'
      message: string
    }

export function metaOAuthCookieName(flowId: string): string {
  return `${META_OAUTH_COOKIE_PREFIX}${flowId}`
}

/** Compares the permissions Meta reports as granted with the required ones. Works in both modes. */
export function checkMetaGrantedPermissions(
  mode: MetaLoginMode,
  granted: readonly string[],
): MetaPermissionCheck {
  const grantedSet = new Set(granted)
  const missing = META_REQUIRED_PERMISSIONS.filter((permission) => !grantedSet.has(permission))
  if (missing.length === 0) return { ok: true, missing: [] }

  const list = missing.join(', ')
  if (mode === 'config_id') {
    return {
      ok: false,
      missing,
      code: 'login_config_missing_permissions',
      message: `Meta bağlantı yapılandırması eksik izin veriyor: ${list}`,
    }
  }
  return {
    ok: false,
    missing,
    code: 'missing_permissions',
    message: `Meta bağlantısında gerekli izinler verilmedi: ${list}`,
  }
}
