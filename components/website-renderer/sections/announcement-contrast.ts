/**
 * Text colour for the announcement band only. It is deliberately separate from the
 * shared theme (`readableOn` / `--site-primary-fg`), which every other component
 * relies on and must keep resolving exactly as before.
 */

export const ANNOUNCEMENT_LIGHT_TEXT = '#ffffff'
// Pure black: with it, max(white, black) contrast is >= 4.58:1 for any background.
export const ANNOUNCEMENT_DARK_TEXT = '#000000'

/** WCAG AA for normal-size text. */
const AA = 4.5
/** Below this gap in ratio the two choices read about the same, so white wins. */
const TIE_MARGIN = 0.5

function channel(value: number): number {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a `#rgb` / `#rrggbb` colour; unparsable input counts as black. */
export function relativeLuminance(hex: string): number {
  let h = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : ''
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0
  const r = channel(parseInt(h.slice(0, 2), 16))
  const g = channel(parseInt(h.slice(2, 4), 16))
  const b = channel(parseInt(h.slice(4, 6), 16))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1–21) between two colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * White or black text, whichever has the higher WCAG contrast on `background`.
 * White is preferred when the two are close (within {@link TIE_MARGIN}) and it
 * still meets AA, so the band keeps its usual look wherever both are fine.
 */
export function announcementTextColor(background: string): string {
  const white = contrastRatio(background, ANNOUNCEMENT_LIGHT_TEXT)
  const black = contrastRatio(background, ANNOUNCEMENT_DARK_TEXT)
  if (white >= black) return ANNOUNCEMENT_LIGHT_TEXT
  if (white >= AA && black - white < TIE_MARGIN) return ANNOUNCEMENT_LIGHT_TEXT
  return ANNOUNCEMENT_DARK_TEXT
}
