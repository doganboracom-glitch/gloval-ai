import type { EmblemAsset, LogoPalette } from '@/lib/logo-studio/compose'
import { wordIncludes } from '@/lib/visual-subjects'

/**
 * Deterministic, text-free emblem library. Each emblem is flat, uses at most
 * two colours (the site's primary + accent) and is built from simple geometry
 * so it stays crisp at favicon size. Used for the free "suggest a logo" flow
 * and as the fallback when the AI emblem is unavailable.
 */

type Family = {
  id: string
  keys: string[]
  draw: (a: string, b: string) => { inner: string; bbox: EmblemAsset['bbox'] }
}

const full = { x: 0, y: 0, w: 100, h: 100 }

const FAMILIES: Family[] = [
  {
    id: 'ring-dot',
    keys: ['spor', 'fitness', 'egitim', 'okul', 'kurs', 'danismanlik', 'finans', 'sigorta'],
    draw: (a, b) => ({
      inner:
        `<circle cx="50" cy="50" r="42" fill="none" stroke="${a}" stroke-width="16"/>` +
        `<circle cx="50" cy="50" r="15" fill="${b}"/>`,
      bbox: full,
    }),
  },
  {
    id: 'diamond',
    keys: ['kuyum', 'mucevher', 'guzellik', 'kuafor', 'moda', 'butik', 'luks', 'luxury', 'parfum'],
    draw: (a, b) => ({
      inner:
        `<path fill-rule="evenodd" fill="${a}" d="M50 0L100 50L50 100L0 50Z M50 24L76 50L50 76L24 50Z"/>` +
        `<path fill="${b}" d="M50 38L62 50L50 62L38 50Z"/>`,
      bbox: full,
    }),
  },
  {
    id: 'hexagon',
    keys: ['yazilim', 'teknoloji', 'bilisim', 'tech', 'software', 'dijital', 'ajans', 'startup'],
    draw: (a, b) => ({
      inner:
        `<path fill-rule="evenodd" fill="${a}" d="M50 0L93.3 25L93.3 75L50 100L6.7 75L6.7 25Z M50 20L76 35L76 65L50 80L24 65L24 35Z"/>` +
        `<circle cx="50" cy="50" r="9" fill="${b}"/>`,
      bbox: { x: 6.7, y: 0, w: 86.6, h: 100 },
    }),
  },
  {
    id: 'chevrons',
    keys: ['nakliyat', 'lojistik', 'kargo', 'ulasim', 'tasimacilik', 'otomotiv', 'oto', 'galeri', 'yol'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M0 40L50 0L100 40L100 62L50 22L0 62Z"/>` +
        `<path fill="${b}" d="M0 78L50 38L100 78L100 100L50 60L0 100Z"/>`,
      bbox: full,
    }),
  },
  {
    id: 'quad',
    keys: ['magaza', 'market', 'butik', 'toptan', 'e-ticaret', 'eticaret', 'pazar', 'hediye', 'oyuncak'],
    draw: (a, b) => ({
      inner:
        `<circle cx="24" cy="24" r="24" fill="${a}"/>` +
        `<rect x="52" y="0" width="48" height="48" fill="${b}"/>` +
        `<path fill="${b}" d="M0 52A48 48 0 0 1 48 100L0 100Z"/>` +
        `<path fill="${a}" d="M52 100L100 100L100 52Z"/>`,
      bbox: full,
    }),
  },
  {
    id: 'leaf',
    keys: ['kafe', 'cafe', 'restoran', 'gida', 'saglik', 'doga', 'organik', 'cicek', 'bahce', 'spa', 'wellness', 'vegan', 'yemek'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M8 92C8 40 40 8 92 8C92 60 60 92 8 92Z"/>` +
        `<path d="M8 92L58 42" stroke="${b}" stroke-width="5" stroke-linecap="round" fill="none"/>`,
      bbox: { x: 5, y: 5, w: 90, h: 90 },
    }),
  },
  {
    id: 'arch',
    keys: ['mimar', 'insaat', 'emlak', 'otel', 'hotel', 'ev', 'dekorasyon', 'mobilya', 'tadilat', 'gayrimenkul'],
    draw: (a, b) => ({
      inner:
        `<path fill-rule="evenodd" fill="${a}" d="M10 100V50A40 40 0 0 1 90 50V100Z M32 100V52A18 18 0 0 1 68 52V100Z"/>` +
        `<circle cx="50" cy="68" r="9" fill="${b}"/>`,
      bbox: { x: 10, y: 10, w: 80, h: 90 },
    }),
  },
  {
    id: 'burst',
    keys: ['etkinlik', 'eglence', 'cocuk', 'organizasyon', 'dugun', 'muzik', 'sanat', 'parti', 'oyun'],
    draw: (a, b) => {
      const pts: string[] = []
      for (let k = 0; k < 16; k++) {
        const r = k % 2 === 0 ? 50 : 30
        const ang = -Math.PI / 2 + (k * Math.PI) / 8
        pts.push(`${(50 + r * Math.cos(ang)).toFixed(2)} ${(50 + r * Math.sin(ang)).toFixed(2)}`)
      }
      return {
        inner:
          `<path fill="${a}" d="M${pts.join('L')}Z"/>` + `<circle cx="50" cy="50" r="11" fill="${b}"/>`,
        bbox: full,
      }
    },
  },
]

export const LOCAL_EMBLEM_COUNT = FAMILIES.length

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * Returns `count` distinct local emblems. Families that suit the business
 * (by keyword) come first; `seed` rotates the choice so "suggest another"
 * keeps producing new marks.
 */
export function localEmblems({
  count,
  palette,
  brand,
  context,
  seed,
}: {
  count: number
  palette: LogoPalette
  brand: string
  context: string
  seed: number
}): EmblemAsset[] {
  const text = `${brand} ${context}`
  const preferred = FAMILIES.filter((fam) => fam.keys.some((k) => wordIncludes(text, k)))
  const rest = FAMILIES.filter((fam) => !preferred.includes(fam))
  const offset = hash(brand) % Math.max(rest.length, 1)
  const rotated = [...rest.slice(offset), ...rest.slice(0, offset)]
  const ordered = [...preferred, ...rotated]
  const start = (seed * count) % ordered.length
  const picked = Array.from({ length: Math.min(count, ordered.length) }, (_, i) => ordered[(start + i) % ordered.length])

  return picked.map((fam) => {
    const { inner, bbox } = fam.draw(palette.primary, palette.accent)
    return { id: fam.id, source: 'local', inner, viewBox: { w: 100, h: 100 }, bbox }
  })
}
