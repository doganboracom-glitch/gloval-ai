import { TENANT_ROOT_DOMAIN, isForeignHost } from '@/lib/domains'
import { isValidGaId, isValidPixelId } from '@/lib/analytics-events'

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced
// statically. A missing or malformed ID resolves to null and nothing loads.
const rawGaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
const rawPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim()

export const GA_MEASUREMENT_ID: string | null = isValidGaId(rawGaId) ? rawGaId.toUpperCase() : null
export const META_PIXEL_ID: string | null = isValidPixelId(rawPixelId) ? rawPixelId : null

/**
 * Measurement runs on the gloval.ai platform (marketing site, dashboard,
 * editor, billing) and its previews only. Published customer sites -
 * `<slug>.gloval.site`, their custom domains and the `/site/*` routes - are
 * never measured, because the owner's visitors never consented to GLOVAL's
 * tracking.
 */
export function isMeasurementSurface(hostname: string, pathname: string): boolean {
  const host = hostname.toLowerCase()
  if (!host) return false
  if (isForeignHost(host)) return false
  if (host === TENANT_ROOT_DOMAIN || host.endsWith(`.${TENANT_ROOT_DOMAIN}`)) return false
  if (pathname === '/site' || pathname.startsWith('/site/')) return false
  return true
}
