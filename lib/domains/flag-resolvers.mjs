/**
 * Environment flag rules shared by next.config.mjs (build time) and the app.
 * Plain ESM with no imports so the Next config can load it directly.
 */

/** @param {string | undefined} raw @returns {boolean | undefined} */
export function parseBooleanFlag(raw) {
  const value = (raw ?? '').trim().toLowerCase()
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return undefined
}

/**
 * True only for Vercel preview/development deployments, or for a local run
 * outside Vercel where NODE_ENV is not "production". Production, any unknown
 * VERCEL_ENV value and a self-hosted production build are all "not safe".
 * @param {Record<string, string | undefined>} env
 */
export function isNonProductionEnv(env) {
  const vercelEnv = (env.VERCEL_ENV ?? '').trim().toLowerCase()
  if (vercelEnv) return vercelEnv === 'preview' || vercelEnv === 'development'
  return (env.NODE_ENV ?? '').trim().toLowerCase() !== 'production'
}

/**
 * WHOIS_LOOKUP_ENABLED=1|true turns /whois on, 0|false turns it off.
 * Unset: on outside production, OFF in production until it is set explicitly.
 * @param {Record<string, string | undefined>} env
 */
export function resolveWhoisEnabled(env) {
  const explicit = parseBooleanFlag(env.WHOIS_LOOKUP_ENABLED)
  return explicit !== undefined ? explicit : isNonProductionEnv(env)
}

/**
 * ADS_FEATURE_UI=1|true turns the GLOVAL Ads (BETA) pages and entry links on.
 * Unlike /whois there is no non-production default: anything but an explicit
 * on value (unset, 0, false, typos) keeps the whole feature off everywhere.
 * @param {Record<string, string | undefined>} env
 */
export function resolveAdsFeatureUi(env) {
  return parseBooleanFlag(env.ADS_FEATURE_UI) === true
}

/**
 * DOMAIN_SEARCH_DEMO=1 shows the domain search page with fake results. It can
 * never be on in production, whatever the variable says.
 * @param {Record<string, string | undefined>} env
 */
export function resolveDomainSearchDemo(env) {
  return parseBooleanFlag(env.DOMAIN_SEARCH_DEMO) === true && isNonProductionEnv(env)
}
