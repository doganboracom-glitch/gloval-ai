import { z } from 'zod'

/**
 * Per-site "cursor aura" effect (a soft, blurred dust trail that follows the
 * mouse). It is an ADMIN-ONLY site setting stored in `schema_data.effects`.
 *
 * Only validated values are ever accepted: `#RRGGBB` colours and bounded
 * numbers. No free-form CSS or JS can reach the public page through it.
 */

export const CURSOR_AURA_HEX = /^#[0-9a-fA-F]{6}$/

export const CURSOR_AURA_LIMITS = {
  colors: { min: 1, max: 6 },
  intensity: { min: 0.1, max: 1 },
  size: { min: 60, max: 320 },
} as const

export const cursorAuraSchema = z.object({
  enabled: z.boolean(),
  colors: z
    .array(z.string().regex(CURSOR_AURA_HEX))
    .min(CURSOR_AURA_LIMITS.colors.min)
    .max(CURSOR_AURA_LIMITS.colors.max),
  intensity: z.number().min(CURSOR_AURA_LIMITS.intensity.min).max(CURSOR_AURA_LIMITS.intensity.max),
  size: z.number().min(CURSOR_AURA_LIMITS.size.min).max(CURSOR_AURA_LIMITS.size.max),
  // Set only by the owner action. An owner-sourced effect renders only while the
  // site still holds an active `aura_cursor` right; an admin-sourced one never depends on it.
  source: z.literal('owner').optional(),
})

export const effectsSchema = z.object({
  cursorAura: cursorAuraSchema.optional(),
})

export type CursorAuraConfig = z.infer<typeof cursorAuraSchema>
export type SiteEffects = z.infer<typeof effectsSchema>

/** Suggested palette: blue-violet, pink-red, green, cyan. */
export const CURSOR_AURA_PRESET_COLORS = ['#6366F1', '#A855F7', '#EC4899', '#EF4444', '#22C55E', '#06B6D4'] as const

export const DEFAULT_CURSOR_AURA: CursorAuraConfig = {
  enabled: false,
  colors: ['#6366F1', '#A855F7', '#EC4899', '#06B6D4'],
  intensity: 0.6,
  size: 160,
}

/** Validates admin input and normalises colours to upper-case `#RRGGBB`. Null when invalid. */
export function parseCursorAuraInput(raw: unknown): CursorAuraConfig | null {
  const parsed = cursorAuraSchema.safeParse(raw)
  if (!parsed.success) return null
  const { source: _source, ...config } = parsed.data
  return { ...config, colors: config.colors.map((c) => c.toUpperCase()) }
}

/** Who wrote the stored effect: `'owner'` (needs the right to render) or `'admin'` (also legacy values). */
export function cursorAuraSource(effects: unknown): 'owner' | 'admin' {
  const parsed = effectsSchema.safeParse(effects)
  return parsed.success && parsed.data.cursorAura?.source === 'owner' ? 'owner' : 'admin'
}

/**
 * Tighter bounds for site OWNERS who hold the paid right (admins keep the wider
 * `CURSOR_AURA_LIMITS`): at most 3 colours, a gentler intensity and a smaller cloud.
 */
export const OWNER_CURSOR_AURA_LIMITS = {
  colors: { min: 1, max: 3 },
  intensity: { min: 0.2, max: 0.7 },
  size: { min: 80, max: 200 },
} as const

/** Validates owner input against the owner bounds. Null when invalid (never clamps silently). */
export function parseOwnerCursorAuraInput(raw: unknown): CursorAuraConfig | null {
  const config = parseCursorAuraInput(raw)
  if (!config) return null
  const { colors, intensity, size } = OWNER_CURSOR_AURA_LIMITS
  if (config.colors.length < colors.min || config.colors.length > colors.max) return null
  if (config.intensity < intensity.min || config.intensity > intensity.max) return null
  if (config.size < size.min || config.size > size.max) return null
  return config
}

/** Brings a stored (possibly admin-set) config into the owner bounds, for display in the owner editor. */
export function clampToOwnerLimits(config: CursorAuraConfig): CursorAuraConfig {
  const { colors, intensity, size } = OWNER_CURSOR_AURA_LIMITS
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  return {
    enabled: config.enabled,
    colors: config.colors.slice(0, colors.max),
    intensity: clamp(config.intensity, intensity.min, intensity.max),
    size: clamp(config.size, size.min, size.max),
  }
}

/**
 * The config the public page should run, or null when the effect is off,
 * missing or invalid. A missing flag means no effect code is ever loaded.
 */
export function resolveCursorAura(effects: unknown): CursorAuraConfig | null {
  const parsed = effectsSchema.safeParse(effects)
  if (!parsed.success) return null
  const aura = parsed.data.cursorAura
  if (!aura || !aura.enabled) return null
  return parseCursorAuraInput(aura)
}

/**
 * Admin-only guard for write paths used by site owners (autosave, publish,
 * restore, create): whatever `effects` the payload carries is discarded and the
 * already stored value is kept. Only the admin action changes it.
 */
export function withStoredEffects<T extends { effects?: unknown }>(next: T, stored: unknown): T {
  const { effects: _discarded, ...rest } = next
  const current =
    stored && typeof stored === 'object' ? effectsSchema.safeParse((stored as { effects?: unknown }).effects) : null
  if (current?.success && current.data.cursorAura) return { ...rest, effects: current.data } as T
  return rest as T
}

export type AuraEnvironment = {
  reducedMotion: boolean
  coarsePointer: boolean
  noHover: boolean
}

/** Touch devices and reduced-motion users never run the effect. */
export function canRunCursorAura(env: AuraEnvironment): boolean {
  return !env.reducedMotion && !env.coarsePointer && !env.noHover
}

export function hexToRgb(hex: string): [number, number, number] | null {
  if (!CURSOR_AURA_HEX.test(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
