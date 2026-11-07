import type { ComponentType } from 'react'
import type { AdsPlatform, AdsProviderStatus } from '@/lib/ads/providers/types'
import type { AdsPlatformIconName } from '@/components/ads/sections/ads-platform-icon'
import { ADS_DASHBOARD_PATH } from '@/lib/ads/feature-flag'
import { sanitizeNextPath } from '@/lib/safe-redirect'

type AdsPlatformNameKey =
  | 'platformGoogleName'
  | 'platformMetaName'
  | 'platformTiktokName'
  | 'platformXName'
  | 'platformLinkedinName'
  | 'platformWhatsappName'

type AdsPlatformBodyKey =
  | 'platformGoogleBody'
  | 'platformMetaBody'
  | 'platformTiktokBody'
  | 'platformXBody'
  | 'platformLinkedinBody'
  | 'platformWhatsappBody'

export type AdsPlatformCatalogId = AdsPlatform | 'whatsapp'
export type AdsPlatformSlug = 'google' | 'meta' | 'tiktok' | 'x' | 'linkedin' | 'whatsapp'

/**
 * Server-evaluated access gates. A platform whose `gate` is not in the viewer's
 * `openGates` stays visible but is not reachable. `null` means no extra gate.
 */
export type AdsPlatformGate = 'google_connect' | 'meta_connect'

type AdsPlatformLogoComponent = ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export type AdsPlatformDefinition = {
  id: AdsPlatformCatalogId
  /** Stable value used in `?platform=` on the dashboard URL. */
  slug: AdsPlatformSlug
  label: string
  status: AdsProviderStatus
  gate: AdsPlatformGate | null
  /** Launched but still labelled Beta in the UI. */
  beta?: boolean
  accentColor: string
  nameKey: AdsPlatformNameKey
  bodyKey: AdsPlatformBodyKey
  icon: AdsPlatformIconName
  logo?: AdsPlatformLogoComponent | string
}

export const ADS_PLATFORM_REGISTRY = [
  {
    id: 'google_ads',
    slug: 'google',
    label: 'Google Ads',
    status: 'available',
    gate: 'google_connect',
    accentColor: '#4285f4',
    nameKey: 'platformGoogleName',
    bodyKey: 'platformGoogleBody',
    icon: 'googleads',
  },
  {
    id: 'meta',
    slug: 'meta',
    label: 'Meta Ads',
    status: 'available',
    gate: 'meta_connect',
    beta: true,
    accentColor: '#0866ff',
    nameKey: 'platformMetaName',
    bodyKey: 'platformMetaBody',
    icon: 'meta',
  },
  {
    id: 'tiktok',
    slug: 'tiktok',
    label: 'TikTok Ads',
    status: 'coming_soon',
    gate: null,
    accentColor: '#ff0050',
    nameKey: 'platformTiktokName',
    bodyKey: 'platformTiktokBody',
    icon: 'tiktok',
  },
  {
    id: 'x',
    slug: 'x',
    label: 'X Ads',
    status: 'coming_soon',
    gate: null,
    accentColor: '#111111',
    nameKey: 'platformXName',
    bodyKey: 'platformXBody',
    icon: 'x',
  },
  {
    id: 'linkedin',
    slug: 'linkedin',
    label: 'LinkedIn Ads',
    status: 'coming_soon',
    gate: null,
    accentColor: '#0a66c2',
    nameKey: 'platformLinkedinName',
    bodyKey: 'platformLinkedinBody',
    icon: 'linkedin',
  },
  {
    id: 'whatsapp',
    slug: 'whatsapp',
    label: 'WhatsApp Ads',
    status: 'coming_soon',
    gate: null,
    accentColor: '#25d366',
    nameKey: 'platformWhatsappName',
    bodyKey: 'platformWhatsappBody',
    icon: 'whatsapp',
  },
] as const satisfies readonly AdsPlatformDefinition[]

export const ADS_DEFAULT_PLATFORM_SLUG: AdsPlatformSlug = 'google'

export function getAdsPlatformDefinition(platformId: string | null | undefined): AdsPlatformDefinition | undefined {
  if (!platformId) return undefined
  return ADS_PLATFORM_REGISTRY.find((platform) => platform.id === platformId)
}

export function getAdsPlatformBySlug(slug: string | null | undefined): AdsPlatformDefinition | undefined {
  if (!slug) return undefined
  return ADS_PLATFORM_REGISTRY.find((platform) => platform.slug === slug)
}

/** What the current visitor is allowed to reach; evaluated on the server. */
export type AdsViewerAccess = {
  authenticated: boolean
  openGates: readonly AdsPlatformGate[]
}

export const ADS_ANONYMOUS_VIEWER: AdsViewerAccess = { authenticated: false, openGates: [] }

/** A platform is accessible when it is launched and its gate (if any) is open. */
export function isAdsPlatformAccessible(
  platform: Pick<AdsPlatformDefinition, 'status' | 'gate'>,
  openGates: readonly AdsPlatformGate[],
): boolean {
  if (platform.status !== 'available') return false
  return platform.gate === null || openGates.includes(platform.gate)
}

/**
 * Picks the platform the dashboard should show for a raw `?platform=` value.
 * Unknown or not-accessible values fall back to the first accessible platform.
 */
export function resolveDashboardPlatform(
  raw: string | null | undefined,
  openGates: readonly AdsPlatformGate[],
): AdsPlatformDefinition {
  const requested = getAdsPlatformBySlug(raw?.trim().toLowerCase())
  if (requested && isAdsPlatformAccessible(requested, openGates)) return requested
  const fallback = ADS_PLATFORM_REGISTRY.find((platform) => isAdsPlatformAccessible(platform, openGates))
  return fallback ?? ADS_PLATFORM_REGISTRY[0]
}

/**
 * Raw `?platform=` value to use for the dashboard. An explicit `platform` always wins; when it is
 * missing, a Meta OAuth result (`meta_flow` or `meta`) means the visitor belongs on the Meta tab,
 * so a callback URL without `platform` never falls back to Google.
 */
export function resolveRequestedPlatformSlug(input: {
  platform?: string | null
  meta?: string | null
  metaFlow?: string | null
}): string | null {
  const platform = input.platform?.trim()
  if (platform) return platform
  if (input.metaFlow?.trim() || input.meta?.trim()) return 'meta'
  return null
}

/** Facebook appends `#_=_` to redirects that carry no fragment of their own. */
export function isFacebookHashRemnant(hash: string): boolean {
  return hash === '#_=_' || hash === '_=_'
}

export function buildAdsDashboardHref(slug: AdsPlatformSlug): string {
  return `${ADS_DASHBOARD_PATH}?platform=${slug}`
}

/**
 * Login entry that returns to `target` afterwards. The target is validated with
 * the shared same-site check, so an off-site value collapses to the dashboard.
 */
export function buildAdsLoginHref(target: string): string {
  const safeTarget = sanitizeNextPath(target, ADS_DASHBOARD_PATH)
  return `/auth/login?next=${encodeURIComponent(safeTarget)}`
}

export type AdsPlatformCardTarget =
  | { kind: 'link'; href: string; requiresLogin: boolean }
  | { kind: 'passive'; reason: 'coming_soon' | 'limited' }

/** How the /ads channel card for `platform` behaves for this visitor. */
export function resolveAdsPlatformCardTarget(
  platform: Pick<AdsPlatformDefinition, 'slug' | 'status' | 'gate'>,
  viewer: AdsViewerAccess,
): AdsPlatformCardTarget {
  if (platform.status !== 'available') return { kind: 'passive', reason: 'coming_soon' }
  const dashboardHref = buildAdsDashboardHref(platform.slug)
  if (!viewer.authenticated) {
    return { kind: 'link', href: buildAdsLoginHref(dashboardHref), requiresLogin: true }
  }
  if (!isAdsPlatformAccessible(platform, viewer.openGates)) return { kind: 'passive', reason: 'limited' }
  return { kind: 'link', href: dashboardHref, requiresLogin: false }
}

/**
 * Relative URL (query + hash) that keeps the dashboard's other query params and
 * stores the active platform and tab, so a reload lands on the same view.
 */
export function buildDashboardViewUrl(currentSearch: string, slug: AdsPlatformSlug, tab: string): string {
  const params = new URLSearchParams(currentSearch)
  params.set('platform', slug)
  return `?${params.toString()}#${tab}`
}
