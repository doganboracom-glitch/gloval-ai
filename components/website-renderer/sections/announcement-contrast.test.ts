import { describe, expect, it } from 'vitest'
import {
  announcementTextColor,
  contrastRatio,
} from '@/components/website-renderer/sections/announcement-contrast'
import { resolveTheme, themeToCssVars } from '@/components/website-renderer/theme'
import { buildDemoSite, demos } from '@/lib/demos'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'

/** Output of the shared `readableOn` on main (luminance > 0.5 -> dark, else white). Must never move. */
const READABLE_ON_GOLDEN: Record<string, '#0b0b0f' | '#ffffff'> = {
  '#ffffff': '#0b0b0f',
  '#000000': '#ffffff',
  '#0d9488': '#ffffff',
  '#14b8a6': '#ffffff',
  '#4f46e5': '#ffffff',
  '#6366f1': '#ffffff',
  '#f59e0b': '#ffffff',
  '#fbbf24': '#0b0b0f',
  '#22c55e': '#ffffff',
  '#16a34a': '#ffffff',
  '#ef4444': '#ffffff',
  '#0ea5e9': '#ffffff',
  '#7c3aed': '#ffffff',
  '#facc15': '#0b0b0f',
  '#808080': '#ffffff',
  '#1e293b': '#ffffff',
  '#e11d48': '#ffffff',
  '#84cc16': '#ffffff',
}

function siteWithColors(primary: string, accent: string): WebsiteSchema {
  const site = fallbackWebsite('test', 'tr')
  return {
    ...site,
    theme: {
      ...site.theme,
      palette: [
        { name: 'Primary', hex: primary },
        { name: 'Accent', hex: accent },
      ],
    },
  }
}

describe('shared theme text colours are untouched', () => {
  it('keeps readableOn outputs identical (primaryFg and accent-fg)', () => {
    for (const [hex, expected] of Object.entries(READABLE_ON_GOLDEN)) {
      const site = siteWithColors(hex, hex)
      const theme = resolveTheme(site)
      expect(theme.primaryFg, `primaryFg ${hex}`).toBe(expected)
      const vars = themeToCssVars(theme) as Record<string, unknown>
      expect(vars['--site-primary-fg'], `--site-primary-fg ${hex}`).toBe(expected)
      expect(vars['--site-accent-fg'], `--site-accent-fg ${hex}`).toBe(expected)
    }
  })
})

describe('announcement band text colour', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('picks the higher-contrast of white and black, white on near ties', () => {
    expect(announcementTextColor('#ffffff')).toBe('#000000')
    expect(announcementTextColor('#000000')).toBe('#ffffff')
    expect(announcementTextColor('#4f46e5')).toBe('#ffffff')
    // Mid-tone teals: black is clearly better than white.
    expect(announcementTextColor('#14b8a6')).toBe('#000000')
    expect(announcementTextColor('#0d9488')).toBe('#000000')
    // White 4.54:1 vs black 4.62:1 - both pass AA and are within the margin: white wins.
    expect(contrastRatio('#767676', '#ffffff')).toBeGreaterThanOrEqual(4.5)
    expect(announcementTextColor('#767676')).toBe('#ffffff')
  })

  it('always reaches AA (4.5:1) on any background', () => {
    for (let r = 0; r <= 255; r += 15) {
      for (let g = 0; g <= 255; g += 15) {
        for (let b = 0; b <= 255; b += 15) {
          const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
          expect(contrastRatio(hex, announcementTextColor(hex)), hex).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })

  it('reaches AA on the band of all 8 demos, in both languages and both band colours', () => {
    expect(demos).toHaveLength(8)
    for (const demo of demos) {
      for (const lang of ['tr', 'en'] as const) {
        const theme = resolveTheme(buildDemoSite(demo, lang))
        for (const bg of [theme.primary, theme.accent]) {
          const ratio = contrastRatio(bg, announcementTextColor(bg))
          expect(ratio, `${demo.slug}/${lang} ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
