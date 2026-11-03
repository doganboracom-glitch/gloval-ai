import type { EmblemAsset } from '@/lib/logo-studio/compose'
import {
  gearPath,
  libraryGlyphDraw,
  renderGlyphEmblem,
  starPath,
  type Draw,
  type Treatment,
} from '@/lib/logo-studio/emblem-local'
import type { LogoColors, LogoStyleId } from '@/lib/logo-studio/rules'
import { PROFILE_BY_ID, type SectorProfileId } from '@/lib/logo-studio/sector-knowledge'

/**
 * Free, deterministic, text-free sector symbols for Logo Studio V2. Every
 * symbol is flat geometry drawn with the same three colour roles as the legacy
 * library (a = main, b = secondary, k = cut-out), so the compositor can turn
 * them into metallic gold/silver/bronze by token mapping alone.
 */

const R = (x: number, y: number, w: number, h: number, f: string, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} fill="${f}"/>`
const C = (cx: number, cy: number, r: number, f: string) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`
const P = (d: string, f: string) => `<path fill="${f}" d="${d}"/>`
const PE = (d: string, f: string) => `<path fill-rule="evenodd" fill="${f}" d="${d}"/>`
const S = (d: string, c: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const SC = (cx: number, cy: number, r: number, c: string, w: number, dash?: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`

/** Symbols drawn for V2 (the legacy library glyphs are referenced separately). */
const NEW_SYMBOLS: Record<string, Draw> = {
  'rising-modules': (a, _b, k) =>
    R(10, 62, 26, 28, a, 2) + R(37, 38, 26, 52, a, 2) + R(64, 12, 26, 78, a, 2) + S('M16 72H30M43 50H57M70 26H84', k, 4),
  'beam-frame': (a, b, k) =>
    R(12, 12, 14, 78, a, 2) + R(74, 12, 14, 78, a, 2) + R(12, 12, 76, 14, a, 2) + S('M26 28L74 78M74 28L26 78', b, 6) + C(50, 53, 6, k),
  lambda: (a, b) => PE('M50 6L94 92H72L50 46L28 92H6Z', a) + R(34, 70, 32, 9, b, 3),
  threshold: (a, b, k) =>
    PE('M16 92V42A34 34 0 0 1 84 42V92Z M34 92V44A16 16 0 0 1 66 44V92Z', a) + R(8, 90, 84, 6, b, 3) + C(50, 62, 4, k),
  'plan-lines': (a, b) => S('M10 10H90V90H10Z M10 42H60 M60 10V90 M60 64H90', a, 6) + C(34, 68, 9, b),
  'old-to-new': (a, b, k) =>
    R(8, 66, 16, 24, b, 2) + R(26, 76, 14, 14, b, 2) + R(10, 52, 10, 8, b, 2) + R(50, 12, 24, 78, a, 2) + R(76, 36, 16, 54, a, 2) + S('M56 28H68M56 44H68M56 60H68', k, 4),
  'key-building': (a, b, k) =>
    R(48, 14, 42, 76, a, 2) + S('M56 30H80M56 46H80M56 62H80', k, 4) + `<circle cx="24" cy="40" r="13" fill="none" stroke="${b}" stroke-width="8"/>` + S('M24 54V90M24 70H34M24 82H34', b, 7),
  'pin-tower': (a, _b, k) =>
    P('M50 95C26 67 17 53 17 38A33 33 0 0 1 83 38C83 53 74 67 50 95Z', a) + R(38, 22, 24, 32, k, 3) + S('M44 32H56M44 42H56', a, 3),
  skyline: (a, b, k) =>
    R(8, 50, 20, 40, a, 1) + R(32, 24, 24, 66, a, 1) + R(60, 38, 18, 52, a, 1) + R(82, 58, 12, 32, a, 1) + S('M4 94H96', b, 5) + S('M38 36H50M38 50H50', k, 4),
  'key-roof': (a, b, k) =>
    S('M10 50L50 14L90 50', a, 9) + `<circle cx="50" cy="62" r="13" fill="none" stroke="${b}" stroke-width="8"/>` + R(46, 75, 8, 19, b, 2) + R(54, 84, 10, 5, k, 1),
  facets: (a, b, k) => P('M50 8L90 36L50 92L10 36Z', a) + S('M10 36H90M30 36L50 8L70 36M30 36L50 92M70 36L50 92', k, 4) + C(50, 36, 4, b),
  'prong-solitaire': (a, b) =>
    `<circle cx="50" cy="68" r="24" fill="none" stroke="${a}" stroke-width="8"/>` + P('M34 36L42 14H58L66 36L50 48Z', b) + S('M34 36L40 46M66 36L60 46', a, 5),
  'light-fracture': (a, b, k) =>
    P('M26 46L50 22L74 46L50 80Z', a) + S('M50 6V14M16 22L22 28M84 22L78 28M8 52H16M92 52H84', b, 5) + S('M38 46H62', k, 3),
  'crescent-gem': (a, b) => P('M64 10A40 40 0 1 0 64 90A30 30 0 1 1 64 10Z', a) + P('M72 34L82 48L72 64L62 48Z', b),
  'chain-drop': (a, b, k) =>
    S('M16 10C16 40 36 54 50 54C64 54 84 40 84 10', a, 5) + P('M50 60C60 72 66 78 66 84C66 91 59 95 50 95C41 95 34 91 34 84C34 78 40 72 50 60Z', b) + C(50, 84, 4, k),
  'ring-line': (a, b) => `<circle cx="50" cy="58" r="32" fill="none" stroke="${a}" stroke-width="6"/>` + P('M50 6L61 19L50 32L39 19Z', b),
  'flow-hair': (a, b) => S('M30 94C8 60 42 40 36 8M52 94C30 60 64 40 58 8', a, 7) + S('M74 94C52 60 86 40 80 8', b, 7),
  lotus: (a, b, k) =>
    P('M50 16C64 36 64 62 50 82C36 62 36 36 50 16Z', a) + P('M50 82C28 80 10 64 6 42C28 46 42 60 50 82Z', b) + P('M50 82C72 80 90 64 94 42C72 46 58 60 50 82Z', b) + C(50, 90, 4, k),
  sparkle: (a, b) =>
    P('M50 6C54 34 66 46 94 50C66 54 54 66 50 94C46 66 34 54 6 50C34 46 46 34 50 6Z', a) + C(82, 20, 6, b) + C(20, 80, 5, b),
  steps: (a, b) => R(8, 66, 22, 26, a, 2) + R(34, 46, 22, 46, a, 2) + R(60, 26, 22, 66, a, 2) + S('M18 50L70 12M56 12H70V26', b, 6),
  'book-arrow': (a, b) =>
    P('M6 34C24 28 40 30 50 38V92C40 84 24 82 6 88Z', a) + P('M94 34C76 28 60 30 50 38V92C60 84 76 82 94 88Z', a) + S('M56 22L84 8M72 6H86V20', b, 6),
  'nib-trail': (a, b, k) =>
    P('M50 6L76 40L50 72L24 40Z', a) + C(50, 40, 5, k) + S('M50 46V72', k, 4) + S('M10 92C26 80 40 94 56 84C68 76 80 86 92 80', b, 6),
  'learn-curve': (a, b) => S('M10 10V90H92', b, 4) + S('M14 84C34 82 42 66 54 46C64 28 76 18 90 14', a, 8) + C(90, 14, 7, b),
  atom: (a, b) =>
    [0, 60, 120].map((r) => `<ellipse cx="50" cy="50" rx="42" ry="16" fill="none" stroke="${a}" stroke-width="5" transform="rotate(${r} 50 50)"/>`).join('') + C(50, 50, 8, b),
  'groove-book': (a, b, k) =>
    C(50, 38, 32, a) + SC(50, 38, 22, k, 3) + SC(50, 38, 13, k, 3) + C(50, 38, 4, b) + R(14, 78, 72, 14, a, 4) + S('M50 78V92', k, 3),
  'wave-steps': (a, b) => R(8, 66, 12, 26, a, 5) + R(26, 52, 12, 40, a, 5) + R(44, 36, 12, 56, a, 5) + R(62, 22, 12, 70, a, 5) + R(80, 8, 12, 84, b, 5),
  'record-groove': (a, b, k) =>
    C(46, 54, 40, a) + SC(46, 54, 32, k, 2.4) + SC(46, 54, 24, k, 2.4) + C(46, 54, 13, b) + C(46, 54, 4, a) + P('M84 4L96 10L68 50L60 46Z', b) + C(88, 8, 6, b),
  'rhythm-rings': (a, b) => C(50, 50, 11, a) + SC(50, 50, 24, b, 6) + SC(50, 50, 39, a, 7, '44 16'),
  'cue-wave': (a, b, k) =>
    [[8, 20], [22, 44], [36, 70], [50, 90], [64, 56], [78, 36], [92, 18]]
      .map(([x, h], i) => R(x - 4, 50 - h / 2, 8, h, i === 3 ? b : a, 4))
      .join('') + C(50, 50, 3, k),
  beam: (a, b, k) => R(34, 6, 32, 14, b, 3) + P('M38 24H62L92 94H8Z', a) + S('M50 34V84', k, 4),
  headphones: (a, b) => S('M16 62V50A34 34 0 0 1 84 50V62', a, 8) + R(8, 56, 20, 34, b, 9) + R(72, 56, 20, 34, b, 9),
  wheat: (a) =>
    S('M50 94V26', a, 5) +
    [0, 20, 40].map((y) => `<g transform="translate(0 ${y})">${P('M50 30C40 28 34 20 34 10C44 12 50 20 50 30Z', a)}${P('M50 30C60 28 66 20 66 10C56 12 50 20 50 30Z', a)}</g>`).join(''),
  bean: (a, _b, k) => `<g transform="rotate(32 50 50)">${`<ellipse cx="50" cy="50" rx="28" ry="42" fill="${a}"/>`}${S('M50 12C62 34 38 66 50 88', k, 5)}</g>`,
  'plate-ring': (a, b, k) => SC(50, 50, 38, a, 8) + SC(50, 50, 21, b, 5) + C(50, 50, 6, k),
  olive: (a, b, k) => `<ellipse cx="50" cy="58" rx="26" ry="34" fill="${a}"/>` + S('M50 24C50 14 58 8 70 8', b, 5) + C(42, 50, 5, k),
  seal: (a, b, k) => P(gearPath(16, 46, 41), a) + SC(50, 50, 30, k, 2.5) + P(starPath(5, 18, 7), b),
  ledger: (a, _b, k) => R(18, 8, 64, 84, a, 5) + S('M30 8V92', k, 4) + S('M44 30H70M44 46H70M44 62H62', k, 4),
  'pillars-gap': (a, b) => R(14, 24, 16, 62, a, 2) + R(42, 24, 16, 62, a, 2) + R(70, 24, 16, 62, a, 2) + P('M8 24L50 6L92 24Z', b) + R(8, 88, 84, 6, b, 2),
  'growth-line': (a, b) => S('M10 82L36 54L52 66L88 22', a, 9) + S('M70 22H88V40', a, 9) + C(36, 54, 6, b),
  'column-bars': (a, b) => R(10, 56, 18, 34, a, 3) + R(36, 38, 18, 52, a, 3) + R(62, 18, 18, 72, a, 3) + S('M6 95H94', b, 4),
  'lock-key': (a, b, k) =>
    R(22, 44, 56, 48, a, 8) + S('M34 44V32A16 16 0 0 1 66 32V44', b, 8) + C(50, 64, 7, k) + R(47, 66, 6, 14, k, 2),
  'ring-open': (a, b) => SC(50, 50, 36, a, 12, '170 56') + C(80, 22, 7, b),
  'pulse-line': (a, b) => S('M6 54H28L38 26L54 78L64 46H94', a, 8) + C(64, 46, 5, b),
  helix: (a, b) =>
    S('M30 8C30 34 70 34 70 56C70 76 30 76 30 92', a, 7) + S('M70 8C70 34 30 34 30 56C30 76 70 76 70 92', b, 7) + S('M40 20H60M36 46H64', b, 4),
  'hand-leaf': (a, b, k) =>
    P('M50 8C72 22 78 46 50 68C22 46 28 22 50 8Z', a) + S('M50 24V60', k, 4) + S('M8 66C24 80 38 92 50 92C66 92 84 80 92 66', b, 8),
  'smile-arc': (a, b) => S('M14 44C28 82 72 82 86 44', a, 10) + C(32, 26, 6, b) + C(68, 26, 6, b),
  'signal-arc': (a, b) => C(22, 78, 8, b) + S('M22 54A24 24 0 0 1 46 78M22 32A46 46 0 0 1 68 78M22 10A68 68 0 0 1 90 78', a, 8),
  'data-bus': (a, b) => S('M8 30H44V70H92M8 70H28M60 30H92', a, 7) + C(44, 30, 7, b) + C(44, 70, 7, b),
  'fold-parcel': (a, _b, k) => P('M50 8L90 28V72L50 92L10 72V28Z', a) + S('M10 28L50 48L90 28M50 48V92', k, 4),
  'delivery-loop': (a, b) => S('M82 32A35 35 0 1 0 84 66', a, 9) + P('M94 10V42H62Z', b),
  'motion-lines': (a, b) => S('M8 30H58M20 50H84M8 70H50', a, 8) + C(84, 30, 8, b),
  'shield-arrow': (a, _b, k) =>
    P('M50 6L88 20V50C88 72 70 88 50 95C30 88 12 72 12 50V20Z', a) + P('M50 26L70 50H57V74H43V50H30Z', k),
  'athletic-form': (a, b) => C(50, 16, 10, b) + S('M50 28V58M50 40L28 54M50 40L74 26M50 58L34 90M50 58L70 90', a, 8),
  'speed-lines': (a, b) => S('M8 36H52M8 54H70M8 72H40', a, 8) + P('M62 30L94 54L62 78Z', b),
  'road-perspective': (a, _b, k) => P('M43 6H57L94 94H6Z', a) + S('M50 18V30M50 42V58M50 70V86', k, 5),
  'key-solo': (a, b) => `<circle cx="32" cy="50" r="19" fill="none" stroke="${a}" stroke-width="9"/>` + S('M51 50H92M78 50V66M90 50V62', a, 9) + C(32, 50, 5, b),
  'wheel-ring': (a, b, k) =>
    SC(50, 50, 38, a, 12) + C(50, 50, 9, b) + S('M50 14V40M50 60V86M14 50H40M60 50H86', a, 5) + C(50, 50, 3, k),
  'route-pin': (a, b, k) =>
    P('M70 8C56 8 46 18 46 31C46 46 70 68 70 68C70 68 94 46 94 31C94 18 84 8 70 8Z', a) + C(70, 31, 8, k) + S('M14 92C26 76 34 94 46 80C54 70 58 74 66 70', b, 5),
  'lens-ring': (a, b, k) => SC(50, 50, 38, a, 9) + SC(50, 50, 21, b, 6) + C(50, 50, 8, k),
  'frame-corners': (a, b) => S('M10 32V10H32M68 10H90V32M90 68V90H68M32 90H10V68', a, 8) + C(50, 50, 12, b),
  'ink-drop': (a, _b, k) => P('M50 6C70 34 84 50 84 66C84 82 69 94 50 94C31 94 16 82 16 66C16 50 30 34 50 6Z', a) + S('M36 66C36 58 44 52 50 52', k, 5),
  'trust-shield': (a, _b, k) => P('M50 6L88 20V50C88 72 70 88 50 95C30 88 12 72 12 50V20Z', a) + S('M33 52L46 65L68 38', k, 8),
  'done-ring': (a, b) => SC(50, 50, 38, a, 9) + S('M31 52L45 66L70 34', b, 9),
  'route-marker': (a, b, k) => C(50, 50, 38, a) + S('M50 14V86M14 50H86', k, 5) + P('M50 26L62 50L50 74L38 50Z', b),
  'leaf-vein': (a, _b, k) => P('M50 6C80 26 86 62 50 94C14 62 20 26 50 6Z', a) + S('M50 18V84M50 42L34 30M50 56L68 42M50 70L34 58', k, 4),
  'sun-field': (a, b) => P('M20 56A30 30 0 0 1 80 56Z', a) + S('M8 68H92M8 80H92M8 92H92', b, 5) + S('M50 8V16M18 22L24 28M82 22L76 28', a, 5),
  'ring-growth': (a, b, k) => SC(50, 50, 42, a, 5) + SC(50, 50, 29, a, 5) + SC(50, 50, 16, b, 5) + C(50, 50, 4, k),
  'drop-leaf': (a, b) => P('M12 88C12 44 44 12 88 12C88 56 56 88 12 88Z', a) + P('M70 56C78 66 82 70 82 76C82 83 76 88 70 88C64 88 58 83 58 76C58 70 62 66 70 56Z', b),
  'slash-disc': (a, b, k) => C(50, 50, 42, a) + P('M26 74L74 26L80 32L32 80Z', k) + C(50, 50, 6, b),
}

/** [sector, glyph] pairs of the legacy library that read well as V2 symbols. */
const LIBRARY_REFS: Record<string, [string, string]> = {
  'keystone-arch': ['construction', 'keystone'],
  arch: ['construction', 'arch'],
  towers: ['construction', 'towers'],
  bezel: ['beauty', 'bezel'],
  petals: ['beauty', 'petals'],
  mirror: ['beauty', 'mirror'],
  drop: ['health', 'drop'],
  heart: ['health', 'heart'],
  cross: ['health', 'cross'],
  nodes: ['tech', 'nodes'],
  hexagon: ['tech', 'hexagon'],
  brackets: ['tech', 'brackets'],
  chip: ['tech', 'chip'],
  abacus: ['education', 'abacus'],
  cloche: ['food', 'cloche'],
  flame: ['food', 'flame'],
  cup: ['food', 'cup'],
  'beam-scale': ['legal', 'beam-scale'],
  columns: ['legal', 'columns'],
  shield: ['legal', 'shield'],
  retail_tag: ['retail', 'tag'],
  retail_bag: ['retail', 'bag'],
  retail_quad: ['retail', 'quad'],
  'parcel-knot': ['retail', 'parcel-knot'],
  peak: ['sport', 'peak'],
  carabiner: ['sport', 'carabiner'],
  'hub-cross-section': ['transport', 'hub-cross-section'],
  sun: ['energy', 'sun'],
  burst: ['events', 'burst'],
  waves: ['travel', 'waves'],
  compass: ['travel', 'compass'],
  sail: ['travel', 'sail'],
  horizon: ['travel', 'horizon'],
  'luggage-clasp': ['travel', 'luggage-clasp'],
  tree: ['nature', 'tree'],
  sprout: ['nature', 'sprout'],
  peaks: ['nature', 'peaks'],
  seedpod: ['nature', 'seedpod'],
  aperture: ['creative', 'aperture'],
  nib: ['creative', 'nib'],
  frame: ['creative', 'frame'],
  triangle: ['generic', 'triangle'],
  checker: ['generic', 'checker'],
  loop: ['generic', 'loop'],
  orbit: ['generic', 'orbit'],
  'joinery-knot': ['generic', 'joinery-knot'],
}

function resolveSymbol(id: string): Draw | null {
  const fresh = NEW_SYMBOLS[id]
  if (fresh) return fresh
  const ref = LIBRARY_REFS[id]
  return ref ? libraryGlyphDraw(ref[0], ref[1]) : null
}

/** Ordered symbol ids per profile; at least six each, trade-specific first. */
export const SYMBOLS_BY_PROFILE: Record<SectorProfileId, string[]> = {
  construction: ['keystone-arch', 'rising-modules', 'beam-frame', 'threshold', 'plan-lines', 'lambda', 'arch', 'towers'],
  'urban-renewal': ['old-to-new', 'key-building', 'threshold', 'keystone-arch', 'rising-modules', 'towers'],
  'real-estate': ['threshold', 'plan-lines', 'key-roof', 'skyline', 'pin-tower', 'towers'],
  jewelry: ['facets', 'prong-solitaire', 'light-fracture', 'crescent-gem', 'chain-drop', 'ring-line', 'bezel'],
  'beauty-salon': ['flow-hair', 'lotus', 'sparkle', 'petals', 'drop', 'mirror'],
  education: ['steps', 'book-arrow', 'nib-trail', 'learn-curve', 'atom', 'abacus'],
  'music-education': ['groove-book', 'wave-steps', 'record-groove', 'cue-wave', 'book-arrow', 'rhythm-rings'],
  nature: ['leaf-vein', 'sprout', 'sun-field', 'ring-growth', 'drop-leaf', 'peaks', 'seedpod', 'tree'],
  restaurant: ['cloche', 'plate-ring', 'wheat', 'bean', 'flame', 'cup', 'olive'],
  law: ['beam-scale', 'columns', 'seal', 'ledger', 'pillars-gap', 'shield'],
  finance: ['growth-line', 'column-bars', 'lock-key', 'ring-open', 'shield', 'columns'],
  clinic: ['pulse-line', 'helix', 'hand-leaf', 'smile-arc', 'drop', 'heart', 'cross'],
  software: ['nodes', 'signal-arc', 'data-bus', 'hexagon', 'brackets', 'chip'],
  ecommerce: ['fold-parcel', 'delivery-loop', 'retail_tag', 'retail_bag', 'retail_quad', 'parcel-knot'],
  events: ['record-groove', 'rhythm-rings', 'cue-wave', 'beam', 'headphones', 'burst'],
  sport: ['motion-lines', 'shield-arrow', 'peak', 'pulse-line', 'athletic-form', 'carabiner'],
  automotive: ['speed-lines', 'road-perspective', 'key-solo', 'wheel-ring', 'route-pin', 'hub-cross-section'],
  media: ['lens-ring', 'frame-corners', 'beam', 'ink-drop', 'aperture', 'nib'],
  service: ['sparkle', 'drop', 'trust-shield', 'key-solo', 'done-ring', 'sun'],
  travel: ['compass', 'route-marker', 'sail', 'horizon', 'waves', 'luggage-clasp'],
  generic: ['slash-disc', 'joinery-knot', 'checker', 'loop', 'triangle', 'orbit'],
}

export type SectorSymbolPick = {
  /** Stable key: profile, symbol and treatment. */
  key: string
  symbol: string
  treatment: Treatment
  variant: number
}

/**
 * The free symbols for a profile: every symbol plain first, then framed
 * variants of the leading ones, capped at `count`. Synchronous and
 * deterministic so changing the sector updates the row instantly.
 */
export function sectorSymbolPicks(profileId: SectorProfileId, count = 8): SectorSymbolPick[] {
  const ids = (SYMBOLS_BY_PROFILE[profileId] ?? SYMBOLS_BY_PROFILE.generic).filter((id) => resolveSymbol(id))
  const picks: SectorSymbolPick[] = ids.map((symbol, i) => ({ key: `${profileId}:${symbol}:plain`, symbol, treatment: 'plain', variant: i }))
  ids.forEach((symbol, i) => {
    picks.push({ key: `${profileId}:${symbol}:framed`, symbol, treatment: 'framed', variant: i })
  })
  return picks.slice(0, Math.max(1, count))
}

export function drawSectorSymbol(pick: SectorSymbolPick, style: LogoStyleId, colors: LogoColors): EmblemAsset {
  const draw = resolveSymbol(pick.symbol) ?? NEW_SYMBOLS['slash-disc']
  return renderGlyphEmblem({ id: `sym-${pick.symbol}-${pick.treatment}`, draw, treatment: pick.treatment, variant: pick.variant, style, colors })
}

export function profileSymbolCount(profileId: SectorProfileId): number {
  return (SYMBOLS_BY_PROFILE[profileId] ?? []).filter((id) => resolveSymbol(id)).length
}

export function allProfileIds(): SectorProfileId[] {
  return [...PROFILE_BY_ID.keys()]
}
