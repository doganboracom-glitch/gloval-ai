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
  draw: (a: string, b: string) => { inner: string; bbox: NonNullable<EmblemAsset['bbox']> }
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
  {
    id: 'cross',
    keys: ['klinik', 'doktor', 'dis', 'eczane', 'hastane', 'veteriner', 'tip', 'psikolog', 'terapi'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M35 0H65V35H100V65H65V100H35V65H0V35H35Z"/>` +
        `<circle cx="50" cy="50" r="10" fill="${b}"/>`,
      bbox: full,
    }),
  },
  {
    id: 'bolt',
    keys: ['elektrik', 'enerji', 'solar', 'gunes', 'tesisat', 'klima', 'teknik', 'servis', 'bakim'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M58 0L12 56H46L38 100L88 40H54Z"/>` +
        `<circle cx="80" cy="16" r="8" fill="${b}"/>`,
      bbox: { x: 12, y: 0, w: 76, h: 100 },
    }),
  },
  {
    id: 'shield',
    keys: ['guvenlik', 'hukuk', 'avukat', 'noter', 'muhasebe', 'mali', 'denetim', 'alarm'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M50 0L92 14V50C92 76 74 92 50 100C26 92 8 76 8 50V14Z"/>` +
        `<path d="M32 50L45 63L69 37" stroke="${b}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
      bbox: { x: 8, y: 0, w: 84, h: 100 },
    }),
  },
  {
    id: 'wave',
    keys: ['su', 'deniz', 'havuz', 'temizlik', 'yikama', 'turizm', 'tur', 'seyahat', 'plaj', 'balik'],
    draw: (a, b) => ({
      inner:
        `<path fill="${a}" d="M0 30C17 10 33 10 50 30C67 50 83 50 100 30L100 52C83 72 67 72 50 52C33 32 17 32 0 52Z"/>` +
        `<path fill="${b}" d="M0 68C17 48 33 48 50 68C67 88 83 88 100 68L100 90C83 110 67 110 50 90C33 70 17 70 0 90Z" transform="translate(0 -6)"/>`,
      bbox: { x: 0, y: 12, w: 100, h: 72 },
    }),
  },
]

type Frame = {
  id: string
  /** Filled frames recolour the glyph so it stays readable on the badge. */
  filled: boolean
  scale: number
  shape: (primary: string) => string
}

const FRAMES: Frame[] = [
  { id: 'plain', filled: false, scale: 1, shape: () => '' },
  {
    id: 'disc',
    filled: true,
    scale: 0.54,
    shape: (p) => `<circle cx="50" cy="50" r="50" fill="${p}"/>`,
  },
  {
    id: 'squircle',
    filled: true,
    scale: 0.54,
    shape: (p) => `<rect width="100" height="100" rx="26" fill="${p}"/>`,
  },
  {
    id: 'ring',
    filled: false,
    scale: 0.54,
    shape: (p) => `<circle cx="50" cy="50" r="46.5" fill="none" stroke="${p}" stroke-width="7"/>`,
  },
  {
    id: 'tile',
    filled: false,
    scale: 0.54,
    shape: (p) =>
      `<rect x="3.5" y="3.5" width="93" height="93" rx="24" fill="none" stroke="${p}" stroke-width="7"/>`,
  },
]

type Scheme = { id: string; pick: (p: LogoPalette) => [string, string] }

const SCHEMES: Scheme[] = [
  { id: 'duo', pick: (p) => [p.primary, p.accent] },
  { id: 'swap', pick: (p) => [p.accent, p.primary] },
  { id: 'mono', pick: (p) => [p.primary, p.primary] },
]

/** Distinct local emblems = glyph families x frames (colour schemes multiply this further). */
export const LOCAL_EMBLEM_COUNT = FAMILIES.length * FRAMES.length
export const LOCAL_FAMILY_COUNT = FAMILIES.length

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function drawEmblem(fam: Family, frame: Frame, scheme: Scheme, palette: LogoPalette): EmblemAsset {
  const [a, b] = scheme.pick(palette)
  const glyphColors: [string, string] = frame.filled ? [palette.primaryFg, palette.primaryFg] : [a, b]
  const strokeColor = frame.filled ? palette.primary : a
  const { inner, bbox } = fam.draw(glyphColors[0], glyphColors[1])
  if (frame.id === 'plain') {
    return { id: `${fam.id}-plain-${scheme.id}`, source: 'local', inner, viewBox: { w: 100, h: 100 }, bbox }
  }
  const s = frame.scale
  const gx = 50 - (bbox.x + bbox.w / 2) * s
  const gy = 50 - (bbox.y + bbox.h / 2) * s
  return {
    id: `${fam.id}-${frame.id}-${scheme.id}`,
    source: 'local',
    inner: `${frame.shape(strokeColor)}<g transform="translate(${gx.toFixed(2)} ${gy.toFixed(2)}) scale(${s})">${inner}</g>`,
    viewBox: { w: 100, h: 100 },
    bbox: full,
  }
}

/**
 * Returns `count` distinct local emblems, chosen deterministically from the
 * brand name AND the sector: families that suit the business (by keyword)
 * lead, while the frame (plain/disc/squircle/ring/tile) and colour scheme
 * come from a hash of the brand, so two businesses in the same sector rarely
 * receive the same mark. `seed` walks the list so "suggest another" keeps
 * producing new marks.
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
  const h = hash(`${brand.toLocaleLowerCase('tr')}|${context.toLocaleLowerCase('tr')}`)
  const rotate = <T,>(list: T[], by: number): T[] => {
    if (list.length === 0) return list
    const k = by % list.length
    return [...list.slice(k), ...list.slice(0, k)]
  }
  const preferred = FAMILIES.filter((fam) => fam.keys.some((k) => wordIncludes(text, k)))
  const rest = FAMILIES.filter((fam) => !preferred.includes(fam))
  const ordered = [...rotate(preferred, h >>> 5), ...rotate(rest, h)]

  return Array.from({ length: Math.min(count, ordered.length) }, (_, i) => {
    const n = seed * count + i
    const fam = ordered[n % ordered.length]
    const round = Math.floor(n / ordered.length)
    const frame = FRAMES[((h >>> 9) + n + round) % FRAMES.length]
    const scheme = SCHEMES[((h >>> 13) + n + round * 2) % SCHEMES.length]
    return drawEmblem(fam, frame, scheme, palette)
  })
}
