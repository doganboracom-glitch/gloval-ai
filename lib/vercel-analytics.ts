import { track } from '@vercel/analytics'
import { readConsent, type CookieConsent } from '@/lib/cookie-consent-storage'
import { isAuthPath, isMeasurementHost } from '@/lib/analytics-config'
import { attributionEventParams } from '@/lib/attribution'

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
  landingView: 'landing_view',
  signupStart: 'signup_start',
  signUp: 'sign_up',
  siteGenerateStart: 'site_generate_start',
  siteGenerateSuccess: 'site_generate_success',
  publishSuccess: 'publish_success',
  beginCheckout: 'begin_checkout',
  purchase: 'purchase',
  homePromptSubmit: 'home_prompt_submit',
  signupView: 'signup_view',
  signupSubmit: 'signup_submit',
  signupError: 'signup_error',
  demoCtaClick: 'demo_cta_click',
  adsScanSubmit: 'ads_scan_submit',
  pricingView: 'pricing_view',
  planCtaClick: 'plan_cta_click',
  campaignWhatsappClick: 'campaign_whatsapp_click',
  campaignSignupClick: 'campaign_signup_click',
  campaignPricingClick: 'campaign_pricing_click',
  campaignFaqClick: 'campaign_faq_click',
  campaignDemoClick: 'campaign_demo_click',
} as const

export type VercelFunnelEvent = (typeof VERCEL_FUNNEL_EVENTS)[keyof typeof VERCEL_FUNNEL_EVENTS]

/** Funnel payloads admit only fixed labels, safe campaign values, and purchase totals. */
export type FunnelProps = {
  method?: 'email' | 'google'
  reason?: 'validation' | 'email_taken' | 'weak_password' | 'network' | 'other'
  demo?: string
  page?: 'sign-up' | 'login'
  plan?: 'free' | 'starter' | 'pro' | 'ecommerce'
  billing?: 'monthly' | 'yearly'
  campaign?: 'dbajans' | 'paketler'
  source?: 'ai' | 'fallback'
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  landing_path?: string
  value?: number
  currency?: string
}

const SAFE_LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/
const SAFE_CAMPAIGN_VALUE = /^[\p{L}\p{N} ._-]{1,100}$/u
const SAFE_LANDING_PATH = /^\/[\p{L}\p{N}/._-]{0,299}$/u

function sanitizeProps(props?: FunnelProps): Record<string, string | number> | undefined {
  if (!props) return undefined
  const clean: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(props)) {
    if (key === 'value' && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000_000) {
      clean[key] = value
    } else if (key === 'currency' && typeof value === 'string' && /^[A-Z]{3}$/.test(value)) {
      clean[key] = value
    } else if (key === 'landing_path' && typeof value === 'string' && SAFE_LANDING_PATH.test(value) && !/\d{7,}/u.test(value)) {
      clean[key] = value
    } else if (
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].includes(key) &&
      typeof value === 'string' &&
      value.length <= 100 &&
      !/@|\d{7,}/u.test(value) &&
      SAFE_CAMPAIGN_VALUE.test(value)
    ) {
      clean[key] = value
    } else if (typeof value === 'string' && SAFE_LABEL.test(value)) {
      clean[key] = value
    }
  }
  return Object.keys(clean).length > 0 ? clean : undefined
}

/**
 * Sends an anonymous funnel event, only while Vercel Analytics itself is
 * allowed (same condition as mounting the component) and only in production.
 */
const MAX_REMEMBERED_FUNNEL_EVENTS = 200
const rememberedFunnelEvents = new Set<string>()
const rememberedFunnelEventOrder: string[] = []

export function trackFunnelEvent(name: VercelFunnelEvent, props?: FunnelProps, eventKey?: string): boolean {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'production') return false
  if (eventKey && rememberedFunnelEvents.has(eventKey)) return true
  try {
    const active = isVercelAnalyticsActive({
      mode: ANALYTICS_MODE,
      consent: readConsent(),
      hostname: window.location.hostname,
      pathname: window.location.pathname,
    })
    if (!active) return false
    // The Analytics script may not be injected yet (first paint); its own queue
    // stub keeps the event until the script loads. Mirrors @vercel/analytics.
    if (!window.va) {
      window.va = function va(...params) {
        ;(window.vaq = window.vaq || []).push(params)
      }
    }
    const safeAttribution = sanitizeProps(attributionEventParams())
    const safeProps = { ...safeAttribution, ...sanitizeProps(props) }
    track(name, safeProps)
    if (eventKey) {
      rememberedFunnelEvents.add(eventKey)
      rememberedFunnelEventOrder.push(eventKey)
      if (rememberedFunnelEventOrder.length > MAX_REMEMBERED_FUNNEL_EVENTS) {
        const expired = rememberedFunnelEventOrder.shift()
        if (expired) rememberedFunnelEvents.delete(expired)
      }
    }
    return true
  } catch {
    return false
  }
}
