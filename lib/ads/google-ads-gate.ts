type GoogleAdsGateEnvironment = Readonly<Record<string, string | undefined>>

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function resolveGoogleAdsConnectEnabled(env: GoogleAdsGateEnvironment = process.env): boolean {
  const value = env.GOOGLE_ADS_CONNECT_ENABLED?.trim().toLowerCase()
  return value === '1' || value === 'true'
}

export function parseGoogleAdsConnectAllowedUserIds(raw: string | undefined): ReadonlySet<string> {
  const ids = (raw ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => USER_ID_PATTERN.test(value))

  return new Set(ids)
}

export function isGoogleAdsConnectAllowed(
  userId: string | null | undefined,
  env: GoogleAdsGateEnvironment = process.env,
): boolean {
  if (!resolveGoogleAdsConnectEnabled(env) || !userId || !USER_ID_PATTERN.test(userId)) return false
  return parseGoogleAdsConnectAllowedUserIds(env.GOOGLE_ADS_CONNECT_ALLOWED_USER_IDS).has(userId.toLowerCase())
}

export function canDisconnectGoogleAdsConnection(hasOwnedConnection: boolean): boolean {
  return hasOwnedConnection
}
