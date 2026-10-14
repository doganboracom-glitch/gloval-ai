import type { PlanCode } from '@/lib/pricing-config'
import type { WebsiteSchema } from '@/lib/website-schema'

/* -------------------------------------------------------------------------- */
/*  Social media links: normalization, validation, resolution, plan gate      */
/* -------------------------------------------------------------------------- */

/**
 * The networks a site can link to. The order here is the display order in the
 * contact block, footer and header.
 */
export const SOCIAL_NETWORKS = [
  'instagram',
  'facebook',
  'x',
  'linkedin',
  'youtube',
  'tiktok',
  'pinterest',
  'telegram',
  'whatsappChannel',
] as const

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number]

/** The persisted `social` object: one string per network plus the header switch. */
export type SocialData = Partial<Record<SocialNetwork, string>> & {
  showInHeader?: boolean
}

export type ResolvedSocialLink = {
  network: SocialNetwork
  /** Accessible, human name, e.g. "Instagram". */
  label: string
  /** Normalized, https-only URL. */
  url: string
}

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
  telegram: 'Telegram',
  whatsappChannel: 'WhatsApp Kanalı',
}

/** Hostnames accepted for each network (the host itself or any subdomain). */
const ALLOWED_HOSTS: Record<SocialNetwork, readonly string[]> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  pinterest: ['pinterest.com'],
  telegram: ['t.me'],
  whatsappChannel: ['whatsapp.com'],
}

/**
 * What a bare username (or channel code) is turned into. `null` means the
 * network has no username form and only a full link is accepted.
 */
const USERNAME_FORMS: Record<
  SocialNetwork,
  { pattern: RegExp; toUrl: (name: string) => string }
> = {
  instagram: { pattern: /^[A-Za-z0-9._]{1,30}$/, toUrl: (n) => `https://instagram.com/${n}` },
  facebook: { pattern: /^[A-Za-z0-9.]{5,50}$/, toUrl: (n) => `https://facebook.com/${n}` },
  x: { pattern: /^[A-Za-z0-9_]{1,15}$/, toUrl: (n) => `https://x.com/${n}` },
  linkedin: { pattern: /^[A-Za-z0-9-]{3,100}$/, toUrl: (n) => `https://linkedin.com/in/${n}` },
  youtube: { pattern: /^[A-Za-z0-9._-]{3,30}$/, toUrl: (n) => `https://youtube.com/@${n}` },
  tiktok: { pattern: /^[A-Za-z0-9._]{1,24}$/, toUrl: (n) => `https://tiktok.com/@${n}` },
  pinterest: { pattern: /^[A-Za-z0-9_]{3,30}$/, toUrl: (n) => `https://pinterest.com/${n}` },
  telegram: { pattern: /^[A-Za-z0-9_]{5,32}$/, toUrl: (n) => `https://t.me/${n}` },
  whatsappChannel: {
    pattern: /^[A-Za-z0-9_-]{10,40}$/,
    toUrl: (n) => `https://whatsapp.com/channel/${n}`,
  },
}

export type SocialInputResult =
  | { status: 'empty' }
  | { status: 'ok'; url: string }
  | { status: 'invalid' }

function hostMatches(hostname: string, allowed: readonly string[]): boolean {
  return allowed.some((h) => hostname === h || hostname.endsWith(`.${h}`))
}

/** True when the input is written as a link rather than as a bare username. */
function looksLikeLink(network: SocialNetwork, value: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true
  if (value.includes('/')) return true
  const lowered = value.toLowerCase()
  return lowered.startsWith('www.') || ALLOWED_HOSTS[network].some((h) => lowered.startsWith(h))
}

/**
 * Turns whatever the owner typed into a clean https URL for `network`.
 *
 *  - empty / whitespace            -> `empty` (the network is simply not shown)
 *  - `@name` or `name`             -> the network's profile URL
 *  - `instagram.com/name`          -> `https://instagram.com/name`
 *  - `https://www.instagram.com/x` -> kept (only the allowed hosts pass)
 *  - `http://...`, other schemes, other domains, credentials, ports,
 *    lookalike hosts (`evilinstagram.com`) -> `invalid`
 */
export function normalizeSocialInput(network: SocialNetwork, raw: unknown): SocialInputResult {
  if (typeof raw !== 'string') return { status: 'empty' }
  const value = raw.trim()
  if (!value) return { status: 'empty' }
  if (value.length > 300 || /\s/.test(value)) return { status: 'invalid' }

  if (!looksLikeLink(network, value)) {
    const name = value.replace(/^@/, '')
    const form = USERNAME_FORMS[network]
    return form.pattern.test(name) ? { status: 'ok', url: form.toUrl(name) } : { status: 'invalid' }
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
  if (!hasScheme && /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[^/]+:\d+(\/|$)/.test(value)) {
    // `javascript:`, `mailto:`, `data:` and friends.
    return { status: 'invalid' }
  }

  let url: URL
  try {
    url = new URL(hasScheme ? value : `https://${value}`)
  } catch {
    return { status: 'invalid' }
  }

  if (url.protocol !== 'https:') return { status: 'invalid' }
  if (url.username || url.password || url.port) return { status: 'invalid' }
  if (!hostMatches(url.hostname.toLowerCase(), ALLOWED_HOSTS[network])) return { status: 'invalid' }
  // A bare domain is not a profile.
  if (url.pathname.replace(/\//g, '') === '') return { status: 'invalid' }

  return { status: 'ok', url: `https://${url.hostname.toLowerCase()}${url.pathname}${url.search}` }
}

/**
 * Cleans a stored/submitted `social` value: every network goes through
 * `normalizeSocialInput`, empty and invalid ones are dropped, so nothing that
 * was not validated can ever be saved. Returns `undefined` when nothing is left.
 */
export function sanitizeSocial(raw: unknown): SocialData | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  const clean: SocialData = {}
  for (const network of SOCIAL_NETWORKS) {
    const result = normalizeSocialInput(network, source[network])
    if (result.status === 'ok') clean[network] = result.url
  }
  if (source.showInHeader === true) clean.showInHeader = true
  const hasNetwork = SOCIAL_NETWORKS.some((n) => clean[n])
  if (!hasNetwork && !clean.showInHeader) return undefined
  return clean
}

/**
 * The links a site actually shows, in display order. Values are re-validated
 * on every read, so an unvalidated or tampered value in storage never renders.
 * Empty networks are absent: nothing is rendered for them.
 */
export function resolveSocialLinks(
  site: Pick<WebsiteSchema, 'social'> | null | undefined,
): ResolvedSocialLink[] {
  const social = site?.social
  if (!social) return []
  const links: ResolvedSocialLink[] = []
  for (const network of SOCIAL_NETWORKS) {
    const result = normalizeSocialInput(network, social[network])
    if (result.status === 'ok') links.push({ network, label: SOCIAL_LABELS[network], url: result.url })
  }
  return links
}

/**
 * The footer repeats the social icons ONLY when the site has no visible contact
 * section (deleted or hidden), which otherwise already carries them. That keeps
 * the owner's links reachable without duplicating them everywhere.
 */
export function resolveFooterSocialLinks(
  site: Pick<WebsiteSchema, 'social' | 'sections'> | null | undefined,
): ResolvedSocialLink[] {
  if (!site) return []
  const hasVisibleContact = site.sections.some((s) => s.type === 'contact' && !s.hidden)
  return hasVisibleContact ? [] : resolveSocialLinks(site)
}

/** Header icons need the owner's switch AND at least one link. */
export function resolveHeaderSocialLinks(
  site: Pick<WebsiteSchema, 'social'> | null | undefined,
): ResolvedSocialLink[] {
  return site?.social?.showInHeader === true ? resolveSocialLinks(site) : []
}

/* -------------------------------------------------------------------------- */
/*  Plan gate                                                                 */
/* -------------------------------------------------------------------------- */

/** Social links are open on STARTER, PRO and E-COMMERCE; FREE is locked. */
export function canUseSocialLinks(plan: PlanCode): boolean {
  return plan !== 'free'
}

/**
 * The server-side authority. A plan without the feature can never change
 * `social`: whatever it submitted is ignored and the stored value is kept.
 * Allowed plans get the submitted value sanitized.
 */
export function enforceSocialPlan(
  next: WebsiteSchema,
  stored: Pick<WebsiteSchema, 'social'> | null | undefined,
  plan: PlanCode,
): WebsiteSchema {
  const social = canUseSocialLinks(plan) ? sanitizeSocial(next.social) : stored?.social
  if (social === undefined) {
    if (next.social === undefined) return next
    const { social: _dropped, ...rest } = next
    return rest as WebsiteSchema
  }
  return { ...next, social }
}
