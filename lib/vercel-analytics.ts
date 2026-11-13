import { track } from '@vercel/analytics'
import { readConsent, type CookieConsent } from '@/lib/cookie-consent-storage'
import { isAuthPath, isMeasurementHost } from '@/lib/analytics-config'

/**
 * Vercel Web Analytics (cookieless, aggregate) gate. It is independent from
 * GA4 / Meta Pixel, which stay behind the consent banner in all cases
 * (`components/analytics/analytics-loader.tsx`).
 *
 * `NEXT_PUBLIC_ANALYTICS_MODE`:
 *  - unset / "consent" (default): Vercel Analytics loads only after the visitor
 *    granted the analytics category, exactly as before;
 *  - "always": it loads for every visitor of the gloval.ai platform, regardless
 *    of the cookie choice. Published customer sites are never measured this
 *    way (they keep the consent behaviour).
 */
export type AnalyticsMode = 'consent' | 'always'

export function resolveAnalyticsMode(raw: string | undefined | null): AnalyticsMode {
  return raw?.trim().toLowerCase() === 'always' ? 'always' : 'consent'
}

// NEXT_PUBLIC_* values are inlined at build time, so it is referenced statically.
export const ANALYTICS_MODE: AnalyticsMode = resolveAnalyticsMode(process.env.NEXT_PUBLIC_ANALYTICS_MODE)

/**
 * Auth routes stay unmeasured (confirmation / recovery links carry tokens)
 * except the two entry screens, which the funnel needs. Only in "always" mode;
 * "consent" mode keeps excluding every auth route.
 */
const ALWAYS_MODE_AUTH_PATHS = new Set(['/auth/sign-up', '/auth/login'])

export function isVercelAnalyticsActive(input: {
  mode: AnalyticsMode
  consent: CookieConsent | null
  hostname: string
  pathname: string
}): boolean {
  const { mode, consent, hostname, pathname } = input
  if (mode === 'always') {
    if (isAuthPath(pathname) && !ALWAYS_MODE_AUTH_PATHS.has(pathname)) return false
    return isMeasurementHost(hostname, pathname)
  }
  return consent?.analytics === true && !isAuthPath(pathname)
}

/** Fixed funnel event names; no personal data or free text is ever attached. */
export const VERCEL_FUNNEL_EVENTS = {
  homePromptSubmit: 'home_prompt_submit',
  signupView: 'signup_view',
  signupSubmit: 'signup_submit',
  demoCtaClick: 'demo_cta_click',
  adsScanSubmit: 'ads_scan_submit',
} as const

export type VercelFunnelEvent = (typeof VERCEL_FUNNEL_EVENTS)[keyof typeof VERCEL_FUNNEL_EVENTS]

/** Property values are constrained to short fixed labels (method name, demo slug). */
export type FunnelProps = { method?: 'email' | 'google'; demo?: string; page?: 'sign-up' | 'login' }

const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/

function sanitizeProps(props?: FunnelProps): Record<string, string> | undefined {
  if (!props) return undefined
  const clean: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string' && SAFE_LABEL.test(value)) clean[key] = value
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/**
 * Sends an anonymous funnel event, only while Vercel Analytics itself is
 * allowed (same condition as mounting the component) and only in production.
 */
export function trackFunnelEvent(name: VercelFunnelEvent, props?: FunnelProps): boolean {
  if (typeof window === 'undefined') return false
  if (process.env.NODE_ENV !== 'production') return false
  const active = isVercelAnalyticsActive({
    mode: ANALYTICS_MODE,
    consent: readConsent(),
    hostname: window.location.hostname,
    pathname: window.location.pathname,
  })
  if (!active) return false
  try {
    // The Analytics script may not be injected yet (first paint); its own queue
    // stub keeps the event until the script loads. Mirrors @vercel/analytics.
    if (!window.va) {
      window.va = function va(...params) {
        ;(window.vaq = window.vaq || []).push(params)
      }
    }
    track(name, sanitizeProps(props))
    return true
  } catch {
    return false
  }
}
