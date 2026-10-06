import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Resolves a WebsiteSchema `theme` + `typography` into a flat set of concrete
 * values the renderer applies as scoped CSS variables. The generated site is
 * styled entirely from these values — never from the GLOVAL AI landing tokens.
 */

export type ResolvedTheme = {
  primary: string
  primaryFg: string
  accent: string
  background: string
  foreground: string
  muted: string
  mutedForeground: string
  card: string
  border: string
  radius: string
  headingFont: string
  bodyFont: string
}

/* ---- color helpers -------------------------------------------------------- */

function normalizeHex(hex: string): string | null {
  if (typeof hex !== 'string') return null
  let h = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
  return '#' + h.toLowerCase()
}

function toRgb(hex: string): [number, number, number] {
  const h = (normalizeHex(hex) ?? '#000000').replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = toRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Returns black or white — whichever is more readable on `hex`. */
function readableOn(hex: string): string {
  return luminance(hex) > 0.5 ? '#0b0b0f' : '#ffffff'
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a)
  const [r2, g2, b2] = toRgb(b)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const bl = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

/* ---- palette lookup ------------------------------------------------------- */

function find(
  palette: WebsiteSchema['theme']['palette'],
  names: string[],
): string | null {
  for (const wanted of names) {
    const hit = palette.find((c) => c.name?.toLowerCase().includes(wanted))
    if (hit) {
      const n = normalizeHex(hit.hex)
      if (n) return n
    }
  }
  return null
}

const RADIUS: Record<WebsiteSchema['theme']['radius'], string> = {
  none: '0px',
  small: '6px',
  medium: '12px',
  large: '20px',
}

export function resolveTheme(site: WebsiteSchema): ResolvedTheme {
  const { theme, typography } = site
  const palette = theme.palette ?? []
  const isDark = theme.mode === 'dark'

  const primary = find(palette, ['primary', 'brand']) ?? palette[0]?.hex ?? '#7c3aed'
  const accent =
    find(palette, ['accent', 'secondary']) ??
    palette[1]?.hex ??
    normalizeHex(primary) ??
    '#22d3ee'
  const background =
    find(palette, ['background', 'bg', 'base', 'surface']) ??
    (isDark ? '#0f1117' : '#ffffff')
  const foreground =
    find(palette, ['foreground', 'text', 'ink', 'body']) ??
    (isDark ? '#f5f6fa' : '#111827')

  const p = normalizeHex(primary) ?? '#7c3aed'

  return {
    primary: p,
    primaryFg: readableOn(p),
    accent: normalizeHex(accent) ?? '#22d3ee',
    background,
    foreground,
    // card: nudge the background slightly toward the foreground for contrast
    card: mix(background, foreground, isDark ? 0.05 : 0.03),
    muted: mix(background, foreground, isDark ? 0.1 : 0.06),
    mutedForeground: withAlpha(foreground, 0.65),
    border: withAlpha(foreground, isDark ? 0.14 : 0.12),
    radius: RADIUS[theme.radius] ?? '12px',
    headingFont: typography?.headingFont || 'Inter',
    bodyFont: typography?.bodyFont || 'Inter',
  }
}

/** CSS custom properties applied to the renderer root. */
export function themeToCssVars(t: ResolvedTheme): React.CSSProperties {
  return {
    // @ts-expect-error -- CSS custom properties
    '--site-primary': t.primary,
    '--site-primary-fg': t.primaryFg,
    '--site-accent': t.accent,
    '--site-bg': t.background,
    '--site-fg': t.foreground,
    '--site-card': t.card,
    '--site-muted': t.muted,
    '--site-muted-fg': t.mutedForeground,
    '--site-border': t.border,
    '--site-radius': t.radius,
    '--site-heading-font': `"${t.headingFont}", ui-sans-serif, system-ui, sans-serif`,
    '--site-body-font': `"${t.bodyFont}", ui-sans-serif, system-ui, sans-serif`,
    backgroundColor: 'var(--site-bg)',
    color: 'var(--site-fg)',
    fontFamily: 'var(--site-body-font)',
  }
}

/** Builds a Google Fonts stylesheet href for the site's heading + body fonts. */
export function googleFontsHref(t: ResolvedTheme): string {
  const families = Array.from(new Set([t.headingFont, t.bodyFont]))
    .filter(Boolean)
    .map(
      (f) =>
        `family=${encodeURIComponent(f.trim()).replace(/%20/g, '+')}:wght@400;500;600;700`,
    )
    .join('&')
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}
