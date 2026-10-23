/**
 * "Kadromuz" / "Our Team" (the existing `team` section)
 * -----------------------------------------------------
 * Pure helpers shared by the renderer and the editor: field limits, phone and social-link validation,
 * and avatar resolution (the same 12 ready-made avatars as reviews, alternating woman / man).
 */
import { nextAvatarForNewItem, resolveAvatar, type ResolvedAvatar } from '@/lib/testimonial-avatars'

export const TEAM_NAME_MAX = 50
export const TEAM_ROLE_MAX = 40
export const TEAM_PHONE_MAX = 20
export const TEAM_LINK_MAX = 200

export type TeamSocialKey = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'email'
export const TEAM_SOCIAL_KEYS: readonly TeamSocialKey[] = ['facebook', 'instagram', 'x', 'linkedin', 'email']

export interface TeamMemberLike {
  name: string
  role: string
  bio?: string
  src?: string
  phone?: string
  avatar?: string
  social?: Partial<Record<TeamSocialKey, string>>
}

const PLATFORM_HOSTS: Record<Exclude<TeamSocialKey, 'email'>, readonly string[]> = {
  facebook: ['facebook.com'],
  instagram: ['instagram.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
}

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

/** Keeps only digits, +, spaces, dashes and parentheses, capped at the limit. */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9+\s\-()]/g, '').slice(0, TEAM_PHONE_MAX)
}

export function isValidPhone(value: string | undefined): boolean {
  const text = (value ?? '').trim()
  if (!text || text.length > TEAM_PHONE_MAX) return false
  if (!/^[0-9+\s\-()]+$/.test(text)) return false
  return text.replace(/\D/g, '').length >= 7
}

/** `tel:` link for a valid phone, otherwise null (an empty or invalid phone is never shown). */
export function telHref(value: string | undefined): string | null {
  if (!isValidPhone(value)) return null
  const text = (value ?? '').trim()
  return `tel:${text.startsWith('+') ? '+' : ''}${text.replace(/\D/g, '')}`
}

export function isValidEmail(value: string | undefined): boolean {
  const text = (value ?? '').trim().replace(/^mailto:/i, '')
  return text.length > 0 && text.length <= TEAM_LINK_MAX && EMAIL_PATTERN.test(text)
}

/**
 * Normalises one social link. Returns the safe href, or null when it must not render.
 * Only https on the platform's own host (or a real subdomain of it): `x.com.evil.com`,
 * `x.com@evil.com`, `http://` and `javascript:` are all rejected. Email becomes `mailto:`.
 */
export function safeSocialHref(key: TeamSocialKey, raw: string | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text || text.length > TEAM_LINK_MAX) return null

  if (key === 'email') {
    const address = text.replace(/^mailto:/i, '')
    return isValidEmail(address) ? `mailto:${address}` : null
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text.replace(/^\/\//, '')}`
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const allowed = PLATFORM_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`))
  return allowed ? url.href : null
}

export interface TeamSocialLink {
  key: TeamSocialKey
  href: string
}

/** The valid links a person has, in the fixed display order. */
export function memberSocials(member: Pick<TeamMemberLike, 'social'>): TeamSocialLink[] {
  const out: TeamSocialLink[] = []
  for (const key of TEAM_SOCIAL_KEYS) {
    const href = safeSocialHref(key, member.social?.[key])
    if (href) out.push({ key, href })
  }
  return out
}

/** What fills the portrait area: the uploaded photo, otherwise an avatar (explicit choice or by position). */
export type TeamPortrait = { kind: 'photo'; src: string } | { kind: 'avatar'; avatar: ResolvedAvatar }

export function resolveTeamPortrait(member: Pick<TeamMemberLike, 'src' | 'avatar'>, position: number): TeamPortrait {
  const src = member.src?.trim()
  const choice = member.avatar?.trim()
  // A person with a photo shows it unless they explicitly picked a preset / initials avatar.
  if (src && (!choice || choice === 'photo')) return { kind: 'photo', src }
  const avatar = resolveAvatar({ avatar: choice, photo: src ? { src } : undefined }, position, true, 'sequence')
  return { kind: 'avatar', avatar }
}

/** The avatar a newly added person gets, in order, alternating woman / man. */
export function nextTeamAvatar(existingCount: number): string {
  return nextAvatarForNewItem(existingCount)
}

export function clampName(value: string): string {
  return value.slice(0, TEAM_NAME_MAX)
}

export function clampRole(value: string): string {
  return value.slice(0, TEAM_ROLE_MAX)
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + last).toLocaleUpperCase('tr')
}
