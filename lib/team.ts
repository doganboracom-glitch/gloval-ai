/**
 * "Kadromuz" / "Our Team" (the existing `team` section)
 * -----------------------------------------------------
 * Pure helpers shared by the renderer and the editor: field limits, phone and social-link validation,
 * and avatar resolution (the same 12 ready-made avatars as reviews, alternating woman / man).
 */
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { uniquePageSlug } from '@/lib/page-slugs'
import { isAllowedLogoDataUri } from '@/lib/references'
import { nextAvatarForNewItem, resolveAvatar, type ResolvedAvatar } from '@/lib/testimonial-avatars'

type Lang = 'tr' | 'en'
type TeamSection = Extract<Section, { type: 'team' }>

export const TEAM_NAME_MAX = 50
export const TEAM_ROLE_MAX = 40
export const TEAM_PHONE_MAX = 20
export const TEAM_LINK_MAX = 200
export const TEAM_TITLE_MAX = 80
export const TEAM_SUBTITLE_MAX = 200
/** Photo uploads: PNG / JPG / WebP, at most 5 MB each. SVG is never accepted. */
export const TEAM_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const TEAM_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const TEAM_PHOTO_RECOMMENDED = { width: 800, height: 1000 } as const

export type TeamSocialKey = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'email'
export const TEAM_SOCIAL_KEYS: readonly TeamSocialKey[] = ['facebook', 'instagram', 'x', 'linkedin', 'email']

export interface TeamMemberLike {
  name: string
  role: string
  bio?: string
  src?: string
  phone?: string
  avatar?: string
  sample?: boolean
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

/** True when the file's declared type is one of the accepted photo types (the real check is byte-based, see `isAllowedTeamPhotoDataUri`). */
export function isAcceptedPhotoMime(type: string): boolean {
  return (TEAM_PHOTO_TYPES as readonly string[]).includes(type.toLowerCase())
}

/** Decoded size of a base64 data URI in bytes. */
export function dataUriBytes(src: string): number {
  const comma = src.indexOf(',')
  const b64 = comma >= 0 ? src.slice(comma + 1) : src
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

/** Server-side photo check: a real PNG / JPEG / WebP by magic bytes (never SVG), within the size cap. */
export function isAllowedTeamPhotoDataUri(src: string): boolean {
  return isAllowedLogoDataUri(src) && dataUriBytes(src) <= TEAM_PHOTO_MAX_BYTES
}

/**
 * Server-side enforcement of the field rules for one person, whatever path wrote the data (editor, AI, import, API):
 * name <= 50, job title <= 40, phone only digits / + / spaces / dashes / parentheses and <= 20, social links only
 * when they pass `safeSocialHref`, and a data-URI photo only when its bytes are a real PNG / JPEG / WebP <= 5 MB.
 * Returns the same object when nothing needed changing.
 */
export function clampMember<M extends TeamMemberLike>(member: M): M {
  let next = member
  const set = (patch: Partial<TeamMemberLike>) => {
    next = { ...next, ...patch }
  }
  if (member.name.length > TEAM_NAME_MAX) set({ name: clampName(member.name) })
  if (member.role.length > TEAM_ROLE_MAX) set({ role: clampRole(member.role) })
  if (member.phone !== undefined) {
    const phone = sanitizePhone(member.phone)
    if (phone !== member.phone) set({ phone: phone.trim() ? phone : undefined })
  }
  if (member.social) {
    const kept: Partial<Record<TeamSocialKey, string>> = {}
    for (const key of TEAM_SOCIAL_KEYS) {
      const raw = member.social[key]
      if (raw && safeSocialHref(key, raw)) kept[key] = raw
    }
    const same = TEAM_SOCIAL_KEYS.every((key) => (member.social?.[key] || undefined) === kept[key])
    if (!same) set({ social: Object.keys(kept).length > 0 ? kept : undefined })
  }
  if (member.src?.startsWith('data:') && !isAllowedTeamPhotoDataUri(member.src)) {
    set({ src: undefined, ...(member.avatar === 'photo' ? { avatar: undefined } : {}) })
  }
  return next
}

function clampTeamSections<T extends WebsiteSchema>(site: T): T {
  let changed = false
  const clampSection = (section: Section): Section => {
    if (section.type !== 'team') return section
    const members = section.members.map(clampMember)
    if (members.every((m, i) => m === section.members[i])) return section
    changed = true
    return { ...section, members }
  }
  const sections = site.sections.map(clampSection)
  const pages = site.pages?.map((page) => (page.sections ? { ...page, sections: page.sections.map(clampSection) } : page))
  return changed ? { ...site, sections, ...(pages ? { pages } : {}) } : site
}

// --- Page, visibility and AI guard --------------------------------------------------------------

const SLUGS: Record<Lang, string> = { tr: 'kadromuz', en: 'our-team' }
const TITLES: Record<Lang, string> = { tr: 'Kadromuz', en: 'Our Team' }

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function teamPageTitle(lang: Lang): string {
  return TITLES[lang]
}
export function teamExampleTagLabel(lang: Lang): string {
  return lang === 'en' ? 'Example content' : 'Örnek içerik'
}
export function teamDescription(site: Pick<WebsiteSchema, 'meta'>, name: string, count: number): string {
  return siteLang(site) === 'en' ? `Meet the ${count} people at ${name}.` : `${name} kadrosu (${count} kişi).`
}

/** A person who may appear publicly: they need a name. */
export function isRealMember(member: Pick<TeamMemberLike, 'name'>): boolean {
  return member.name.trim().length > 0
}

export function realMembers<M extends Pick<TeamMemberLike, 'name'>>(section: { members: M[] }): M[] {
  return section.members.filter(isRealMember)
}

function teamSections(site: Pick<WebsiteSchema, 'sections' | 'pages'>): TeamSection[] {
  const all = [...site.sections, ...(site.pages ?? []).flatMap((p) => p.sections ?? [])]
  return all.filter((s): s is TeamSection => s.type === 'team' && !s.hidden)
}

export function findTeamPage(site: Pick<WebsiteSchema, 'pages'>) {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === 'team') ?? null
}

export type ResolvedTeam = {
  lang: Lang
  slug: string
  title: string
  section: TeamSection | null
  members: TeamSection['members']
  /** The system page exists, its switch is on and at least one real person backs it. */
  active: boolean
}

export function resolveTeam(site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>): ResolvedTeam {
  const lang = siteLang(site)
  const page = findTeamPage(site)
  let section: TeamSection | null = null
  let members: TeamSection['members'] = []
  for (const candidate of teamSections(site)) {
    const real = realMembers(candidate)
    if (real.length > 0) {
      section = candidate
      members = real
      break
    }
  }
  return {
    lang,
    slug: page?.slug || SLUGS[lang],
    title: page?.title || TITLES[lang],
    section,
    members,
    active: !!page && !!section && section.pageEnabled === true && members.length > 0,
  }
}

/** The home block renders only with at least one named person and while its switch is not off. */
export function teamShownOnHome(section: Pick<TeamSection, 'members' | 'showOnHome'>): boolean {
  return section.showOnHome !== false && realMembers(section).length > 0
}

/**
 * Keeps the `/kadromuz` page in step with the section: created while a section with `pageEnabled` has a
 * named person, dropped again when not. Counts toward the plan page limit. Idempotent; returns the same
 * object when nothing changes. A page the owner already runs on the same address is left alone.
 */
export function syncTeamPage<T extends WebsiteSchema>(input: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const site = clampTeamSections(input)
  const pages = site.pages ?? []
  const existing = findTeamPage(site)
  const wanted = teamSections(site).some((s) => s.pageEnabled === true && realMembers(s).length > 0)
  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }
  if (existing) return site

  const lang = siteLang(site)
  const own = new Set([SLUGS.tr, SLUGS.en])
  if (pages.some((p) => !p.isHome && own.has((p.slug || '').toLowerCase()))) return site
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return site

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = taken.has(SLUGS[lang]) ? uniquePageSlug(SLUGS[lang], taken) : SLUGS[lang]
  const created = { slug, title: TITLES[lang], kind: 'detail' as const, detailOf: 'team' as const }
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...site, pages: [...base, created] }
}

/**
 * AI guard. The model must never invent staff, and must not touch photos, phones or links: whatever it
 * returns for a `team` section's people is replaced by the owner's existing entries (matched by position
 * in the previous site) or emptied. Title / subtitle edits are kept.
 */
export function stripAiTeam<T extends { sections: Section[] }>(next: T, previous?: { sections: Section[] } | null): T {
  const prior = previous?.sections.filter((s): s is TeamSection => s.type === 'team') ?? []
  let seen = 0
  let changed = false
  const sections = next.sections.map((section): Section => {
    if (section.type !== 'team') return section
    const before = prior[seen++]
    if (!before) {
      if (section.members.length === 0) return section
      changed = true
      return { ...section, members: [] }
    }
    if (section.members === before.members) return section
    changed = true
    return { ...section, members: before.members }
  })
  return changed ? { ...next, sections } : next
}

export const TEAM_HOME_PREVIEW = 4

/**
 * "All team" link under the home block. Shown whenever the `/kadromuz` page is live (so it never points at a 404);
 * while it is live the home block shows only the first `TEAM_HOME_PREVIEW` people. With the page off, everyone stays
 * visible on the home block and there is no link.
 */
export function teamLink(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
  section: TeamSection,
): { label: string; href: string } | null {
  const resolved = resolveTeam(site)
  if (!resolved.active || resolved.section !== section) return null
  return {
    label: resolved.lang === 'en' ? 'All team' : 'Tüm kadro',
    href: `/${resolved.slug}`,
  }
}

/**
 * A team section written before the "Kadromuz" feature: no switches, and no person carries an avatar, phone,
 * social link or sample flag. Such sections (e.g. the architecture studio's) keep their original look.
 */
export function isLegacyTeam(
  section: Pick<TeamSection, 'members' | 'showOnHome' | 'pageEnabled'>,
): boolean {
  if (section.showOnHome !== undefined || section.pageEnabled !== undefined) return false
  if (section.members.length === 0) return false
  return section.members.every((m) => !m.avatar && !m.phone && !m.social && !m.sample)
}
