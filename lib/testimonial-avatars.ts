/**
 * Ready-made review avatars
 * -------------------------
 * 12 original flat illustrations in `public/avatars/v1/avatar-01.svg` .. `avatar-12.svg`. Odd numbers are
 * women, even numbers are men, so walking `preset:1 .. preset:12` alternates woman, man, woman, man ...
 * and wraps back to the start after the twelfth.
 *
 * A review item stores its choice in the optional `avatar` field:
 *   `preset:1`..`preset:12` -> that illustration
 *   `initials`              -> the coloured initials circle
 *   `photo`                 -> the owner's uploaded `photo`
 *   unset (legacy)          -> uploaded photo if there is one, otherwise (avatars on) the initials circle, as before
 * Pure and shared by the renderer and the editor. Choosing or cycling an avatar never costs credits.
 */

export const AVATAR_PRESET_COUNT = 12
export const AVATAR_BASE_PATH = '/avatars/v1'

export type AvatarChoice =
  | { kind: 'preset'; n: number }
  | { kind: 'initials' }
  | { kind: 'photo' }

/** Wraps any position (0-based, may be negative) onto 1..12. */
export function presetForPosition(position: number): number {
  const size = AVATAR_PRESET_COUNT
  return ((((Math.trunc(position) % size) + size) % size) || 0) + 1
}

export function presetValue(n: number): string {
  return `preset:${presetForPosition(n - 1)}`
}

export function presetSrc(n: number): string {
  return `${AVATAR_BASE_PATH}/avatar-${String(presetForPosition(n - 1)).padStart(2, '0')}.svg`
}

export function isFemalePreset(n: number): boolean {
  return presetForPosition(n - 1) % 2 === 1
}

/** Reads a stored `avatar` value. Anything unknown is treated as "not chosen" (null). */
export function parseAvatar(value: unknown): AvatarChoice | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === 'initials') return { kind: 'initials' }
  if (text === 'photo') return { kind: 'photo' }
  const match = /^preset:(\d{1,2})$/.exec(text)
  if (!match) return null
  const n = Number(match[1])
  return n >= 1 && n <= AVATAR_PRESET_COUNT ? { kind: 'preset', n } : null
}

/** The avatar a new review gets: in order, by how many reviews the section already has. */
export function nextAvatarForNewItem(existingCount: number): string {
  return presetValue(presetForPosition(existingCount))
}

/** What "Change avatar" does: the next illustration after the current one, wrapping after 12. */
export function cycleAvatar(current: unknown, position: number): string {
  const choice = parseAvatar(current)
  if (choice?.kind === 'preset') return presetValue(choice.n + 1)
  const shown = presetForPosition(position)
  // An unset (legacy) item already displays the illustration for its position, so "next" moves past it.
  // Initials / photo were not showing an illustration, so the first click lands on the positional one.
  return presetValue(choice ? shown : shown + 1)
}

export type ResolvedAvatar =
  | { kind: 'none' }
  | { kind: 'preset'; n: number; src: string }
  | { kind: 'initials' }
  | { kind: 'photo' }

/**
 * Decides what a review card shows.
 * `fallback` is what an item without an `avatar` field gets when avatars are switched on. The default `'initials'` is the original
 * initials circle, so every existing site (live sites and showcase demos) keeps its exact HTML; `'sequence'` walks the
 * illustrations by position. New reviews get an explicit `preset:n` instead (see nextAvatarForNewItem).
 */
export function resolveAvatar(
  item: { avatar?: unknown; photo?: { src?: string } | undefined },
  position: number,
  showAvatars: boolean,
  fallback: 'sequence' | 'initials' = 'initials',
): ResolvedAvatar {
  const hasPhoto = !!item.photo?.src
  const choice = parseAvatar(item.avatar)

  if (choice?.kind === 'photo') return hasPhoto ? { kind: 'photo' } : showAvatars ? fallbackAvatar(position, fallback) : { kind: 'none' }
  if (choice && !showAvatars) return { kind: 'none' }
  if (choice?.kind === 'preset') return { kind: 'preset', n: choice.n, src: presetSrc(choice.n) }
  if (choice?.kind === 'initials') return { kind: 'initials' }

  if (hasPhoto) return { kind: 'photo' }
  return showAvatars ? fallbackAvatar(position, fallback) : { kind: 'none' }
}

function fallbackAvatar(position: number, fallback: 'sequence' | 'initials'): ResolvedAvatar {
  if (fallback === 'initials') return { kind: 'initials' }
  const n = presetForPosition(position)
  return { kind: 'preset', n, src: presetSrc(n) }
}
