/** How long the deep-linked add-on card keeps its highlight ring. */
export const ADDON_HIGHLIGHT_MS = 2000

/**
 * The add-ons section animates open over 300ms; scrolling before that finishes
 * would aim at a still-collapsed layout.
 */
export const ADDON_SECTION_OPEN_MS = 350

const ADDON_CODE_PATTERN = /^[a-z0-9_]{1,64}$/

export function addonCardId(code: string): string {
  return `addon-${code}`
}

/** The `?addon=` value, or null when absent or not a plain add-on code. */
export function readAddonParam(search: string): string | null {
  const value = new URLSearchParams(search).get('addon')
  return value && ADDON_CODE_PATTERN.test(value) ? value : null
}
