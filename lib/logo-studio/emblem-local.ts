import type { EmblemAsset, LogoPalette } from '@/lib/logo-studio/compose'
import {
  styleSpec,
  type FrameId,
  type LogoColors,
  type LogoStyleId,
} from '@/lib/logo-studio/rules'
import { wordIncludes } from '@/lib/visual-subjects'

/**
 * Deterministic, text-free emblem library: 16 sectors x 4 glyphs x 2
 * treatments (plain / framed) = 128 emblems, 8 per sector. Glyphs are flat,
 * built from simple geometry inside a shared 4..96 safe box so they stay crisp
 * at favicon size. A glyph is drawn with three colours:
 *   a = main shape, b = independent secondary shapes, k = cut-outs inside `a`
 * (k is the accent in plain mode and the badge colour inside filled frames).
 */

type Draw = (a: string, b: string, k: string) => string
type Glyph = { id: string; draw: Draw }
type Sector = { id: string; keys: string[]; subject: string; glyphs: Glyph[] }

const C = (cx: number, cy: number, r: number, f: string) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}"/>`
const R = (x: number, y: number, w: number, h: number, f: string, rx = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}"${rx ? ` rx="${rx}"` : ''} fill="${f}"/>`
const P = (d: string, f: string) => `<path fill="${f}" d="${d}"/>`
const PE = (d: string, f: string) => `<path fill-rule="evenodd" fill="${f}" d="${d}"/>`
const S = (d: string, c: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
const SC = (cx: number, cy: number, r: number, c: string, w: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w}"/>`
const E = (cx: number, cy: number, rx: number, ry: number, f: string, rot = 0) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${f}"${rot ? ` transform="rotate(${rot} 50 50)"` : ''}/>`

const n2 = (n: number) => (Math.round(n * 100) / 100).toString()

function starPath(points: number, outer: number, inner: number): string {
  const pts: string[] = []
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 === 0 ? outer : inner
    const ang = -Math.PI / 2 + (k * Math.PI) / points
    pts.push(`${n2(50 + r * Math.cos(ang))} ${n2(50 + r * Math.sin(ang))}`)
  }
  return `M${pts.join('L')}Z`
}

function gearPath(teeth: number, outer: number, root: number): string {
  const step = (Math.PI * 2) / teeth
  const pts: string[] = []
  for (let i = 0; i < teeth; i++) {
    const t = i * step - Math.PI / 2
    for (const [r, off] of [
      [root, -0.3],
      [outer, -0.16],
      [outer, 0.16],
      [root, 0.3],
    ] as const) {
      pts.push(`${n2(50 + r * Math.cos(t + off * step))} ${n2(50 + r * Math.sin(t + off * step))}`)
    }
  }
  return `M${pts.join('L')}Z`
}

const SECTORS: Sector[] = [
  {
    id: 'food',
    keys: ['kafe', 'cafe', 'restoran', 'restaurant', 'gida', 'yemek', 'pastane', 'firin', 'lokanta', 'kahve', 'mutfak', 'bar'],
    subject: 'a coffee cup, a fork and spoon, a flame or a leaf — food and hospitality',
    glyphs: [
      {
        id: 'cup',
        draw: (a, b, k) =>
          P('M14 40H78V58C78 78 64 92 46 92C28 92 14 78 14 58Z', a) +
          S('M78 48H84A10 10 0 0 1 84 72H75', a, 8) +
          S('M32 10C26 18 38 22 32 30M52 10C46 18 58 22 52 30', b, 6) +
          S('M30 60C32 70 40 76 48 76', k, 5),
      },
      {
        id: 'leaf',
        draw: (a, _b, k) => P('M8 92C8 40 40 8 92 8C92 60 60 92 8 92Z', a) + S('M14 86L60 40', k, 5),
      },
      {
        id: 'cutlery',
        draw: (a, b, k) =>
          S('M18 10V36C18 46 40 46 40 36V10', a, 7) +
          S('M29 46V92', a, 7) +
          E(72, 30, 13, 22, b) +
          S('M72 52V92', b, 7) +
          C(72, 30, 5, k),
      },
      {
        id: 'flame',
        draw: (a, _b, k) =>
          P('M50 6C58 28 82 38 82 62C82 80 68 94 50 94C32 94 18 80 18 62C18 48 28 40 34 28C38 38 42 40 44 40C46 30 46 18 50 6Z', a) +
          P('M50 56C56 66 66 70 66 78C66 86 58 92 50 92C42 92 34 86 34 78C34 70 44 66 50 56Z', k),
      },
    ],
  },
  {
    id: 'health',
    keys: ['klinik', 'doktor', 'dis', 'eczane', 'hastane', 'veteriner', 'tip', 'psikolog', 'terapi', 'saglik', 'dental', 'clinic', 'poliklinik', 'diyet'],
    subject: 'a medical cross, a heart with a pulse line, a drop or a tooth — healthcare',
    glyphs: [
      {
        id: 'cross',
        draw: (a, _b, k) => P('M35 6H65V35H94V65H65V94H35V65H6V35H35Z', a) + C(50, 50, 10, k),
      },
      {
        id: 'heart',
        draw: (a, _b, k) =>
          P('M50 90C20 68 8 50 8 33C8 18 19 8 32 8C41 8 47 13 50 20C53 13 59 8 68 8C81 8 92 18 92 33C92 50 80 68 50 90Z', a) +
          S('M22 46H38L44 34L54 58L60 46H78', k, 5),
      },
      {
        id: 'drop',
        draw: (a, _b, k) =>
          P('M50 6C70 34 84 50 84 66C84 82 69 94 50 94C31 94 16 82 16 66C16 50 30 34 50 6Z', a) +
          S('M32 64C32 74 38 82 46 84', k, 6),
      },
      {
        id: 'tooth',
        draw: (a, _b, k) =>
          P('M26 10C14 10 8 22 10 38C12 56 22 60 26 76C28 88 32 94 38 94C44 94 44 78 50 78C56 78 56 94 62 94C68 94 72 88 74 76C78 60 88 56 90 38C92 22 86 10 74 10C64 10 58 16 50 16C42 16 36 10 26 10Z', a) +
          S('M34 36C42 44 58 44 66 36', k, 5),
      },
    ],
  },
  {
    id: 'beauty',
    keys: ['kuyum', 'mucevher', 'guzellik', 'kuafor', 'moda', 'parfum', 'luks', 'luxury', 'berber', 'makyaj', 'salon', 'estetik', 'giyim', 'tekstil'],
    subject: 'a diamond, a flower, a hand mirror or a crown — beauty, fashion and jewelry',
    glyphs: [
      {
        id: 'diamond',
        draw: (a, b) => PE('M50 6L94 50L50 94L6 50Z M50 28L72 50L50 72L28 50Z', a) + P('M50 40L60 50L50 60L40 50Z', b),
      },
      {
        id: 'petals',
        draw: (a, _b, k) =>
          [0, 90, 180, 270].map((r) => E(50, 27, 14, 22, a, r)).join('') + C(50, 50, 9, k),
      },
      {
        id: 'mirror',
        draw: (a, _b, k) => SC(50, 36, 27, a, 10) + R(44, 64, 12, 30, a, 6) + C(50, 36, 8, k),
      },
      {
        id: 'crown',
        draw: (a, b, k) =>
          P('M8 74L16 26L36 48L50 12L64 48L84 26L92 74Z', a) + R(8, 80, 84, 12, b, 3) + C(50, 50, 6, k),
      },
    ],
  },
  {
    id: 'tech',
    keys: ['yazilim', 'teknoloji', 'bilisim', 'tech', 'software', 'dijital', 'digital', 'ajans', 'startup', 'bilgisayar', 'internet', 'uygulama', 'siber'],
    subject: 'a hexagon, connected nodes, code brackets or a chip — technology and software',
    glyphs: [
      {
        id: 'hexagon',
        draw: (a, b) =>
          PE('M50 4L90 27V73L50 96L10 73V27Z M50 22L74 36V64L50 78L26 64V36Z', a) + C(50, 50, 9, b),
      },
      {
        id: 'nodes',
        draw: (a, b) => S('M26 28L74 28L50 72Z', a, 6) + C(26, 28, 14, a) + C(74, 28, 14, a) + C(50, 74, 14, b),
      },
      {
        id: 'brackets',
        draw: (a, b) => S('M34 16L10 50L34 84', a, 10) + S('M66 16L90 50L66 84', a, 10) + S('M56 24L44 76', b, 9),
      },
      {
        id: 'chip',
        draw: (a, b, k) =>
          R(22, 22, 56, 56, a, 8) +
          R(38, 38, 24, 24, k, 4) +
          S('M36 8V22M50 8V22M64 8V22M36 78V92M50 78V92M64 78V92M8 36H22M8 50H22M8 64H22M78 36H92M78 50H92M78 64H92', b, 6),
      },
    ],
  },
  {
    id: 'construction',
    keys: ['mimar', 'insaat', 'emlak', 'otel', 'hotel', 'ev', 'dekorasyon', 'mobilya', 'tadilat', 'gayrimenkul', 'konut', 'yapi', 'proje', 'architect', 'real'],
    subject: 'an arch, a house, building blocks or a roof — architecture, construction and real estate',
    glyphs: [
      {
        id: 'arch',
        draw: (a, b) =>
          PE('M10 94V50A40 40 0 0 1 90 50V94Z M32 94V52A18 18 0 0 1 68 52V94Z', a) + C(50, 70, 9, b),
      },
      {
        id: 'house',
        draw: (a, _b, k) => P('M50 8L94 46H82V92H18V46H6Z', a) + R(40, 58, 20, 34, k, 3),
      },
      {
        id: 'towers',
        draw: (a, b) => R(8, 52, 26, 40, a, 2) + R(37, 16, 26, 76, b, 2) + R(66, 38, 26, 54, a, 2),
      },
      {
        id: 'roof',
        draw: (a, _b, k) =>
          S('M8 54L50 14L92 54', a, 12) + P('M22 58L50 32L78 58V92H22Z', a) + R(42, 66, 16, 26, k, 2),
      },
    ],
  },
  {
    id: 'education',
    keys: ['egitim', 'okul', 'kurs', 'danismanlik', 'akademi', 'universite', 'ders', 'ogretmen', 'kres', 'anaokulu', 'school', 'academy', 'koc', 'dershane'],
    subject: 'an open book, a graduation cap, a star or a ring — education and learning',
    glyphs: [
      {
        id: 'book',
        draw: (a, b) =>
          P('M8 20C24 14 40 16 50 26V90C40 80 24 78 8 84Z', a) + P('M92 20C76 14 60 16 50 26V90C60 80 76 78 92 84Z', b),
      },
      {
        id: 'cap',
        draw: (a, b) =>
          P('M50 12L94 36L50 60L6 36Z', a) + P('M24 54V72C24 82 76 82 76 72V54L50 68Z', a) + R(87, 40, 6, 34, b, 3),
      },
      {
        id: 'ringdot',
        draw: (a, b) => SC(50, 50, 42, a, 16) + C(50, 50, 15, b),
      },
      {
        id: 'star',
        draw: (a, _b, k) => P(starPath(5, 46, 20), a) + C(50, 53, 8, k),
      },
    ],
  },
  {
    id: 'sport',
    keys: ['spor', 'fitness', 'gym', 'pilates', 'yoga', 'antrenor', 'futbol', 'basketbol', 'dovus', 'yuzme', 'sport', 'crossfit'],
    subject: 'a dumbbell, a kettlebell, a mountain or a speed dial — sport and fitness',
    glyphs: [
      {
        id: 'dumbbell',
        draw: (a, b) =>
          R(4, 34, 14, 32, a, 4) + R(20, 22, 14, 56, a, 4) + R(34, 44, 32, 12, b, 3) + R(66, 22, 14, 56, a, 4) + R(82, 34, 14, 32, a, 4),
      },
      {
        id: 'kettlebell',
        draw: (a, _b, k) => C(50, 62, 32, a) + S('M32 40C32 8 68 8 68 40', a, 9) + C(50, 64, 10, k),
      },
      {
        id: 'peak',
        draw: (a, _b, k) => P('M4 88L36 26L52 54L64 36L96 88Z', a) + P('M36 26L46 44L36 40L28 44Z', k),
      },
      {
        id: 'dial',
        draw: (a, b) => S('M14 80A44 44 0 1 1 86 80', a, 12) + S('M50 50L70 28', b, 9) + C(50, 50, 8, a),
      },
    ],
  },
  {
    id: 'legal',
    keys: ['guvenlik', 'hukuk', 'avukat', 'noter', 'muhasebe', 'mali', 'denetim', 'alarm', 'finans', 'sigorta', 'banka', 'yatirim', 'danisman', 'law', 'bank'],
    subject: 'a shield, classical columns, a coin or rising bars — law, finance and security',
    glyphs: [
      {
        id: 'shield',
        draw: (a, _b, k) =>
          P('M50 4L92 18V50C92 76 74 92 50 98C26 92 8 76 8 50V18Z', a) + S('M32 50L45 63L69 37', k, 9),
      },
      {
        id: 'columns',
        draw: (a, b) =>
          P('M8 30L50 8L92 30Z', a) + R(18, 38, 12, 40, a, 2) + R(44, 38, 12, 40, a, 2) + R(70, 38, 12, 40, a, 2) + R(8, 84, 84, 10, b, 2),
      },
      {
        id: 'coin',
        draw: (a, _b, k) => C(50, 50, 44, a) + SC(50, 50, 28, k, 7),
      },
      {
        id: 'growth',
        draw: (a, b) => R(10, 60, 18, 32, a, 2) + R(41, 40, 18, 52, a, 2) + R(72, 14, 18, 78, b, 2),
      },
    ],
  },
  {
    id: 'retail',
    keys: ['magaza', 'market', 'butik', 'toptan', 'e-ticaret', 'eticaret', 'pazar', 'hediye', 'oyuncak', 'alisveris', 'shop', 'store', 'bakkal', 'perakende'],
    subject: 'a shopping bag, a price tag, a cart or a tiled quad — retail and e-commerce',
    glyphs: [
      {
        id: 'bag',
        draw: (a, _b, k) => P('M14 30H86L92 94H8Z', a) + S('M34 40V28C34 16 42 8 50 8C58 8 66 16 66 28V40', a, 8) + S('M36 56C36 68 64 68 64 56', k, 6),
      },
      {
        id: 'quad',
        draw: (a, b) => C(28, 28, 22, a) + R(56, 6, 38, 38, b) + R(6, 56, 38, 38, b, 10) + P('M94 56V94H56Z', a),
      },
      {
        id: 'tag',
        draw: (a, _b, k) => P('M8 10H48L92 54L54 92L8 48Z', a) + C(28, 30, 8, k),
      },
      {
        id: 'cart',
        draw: (a, b) => S('M6 12H20L32 64H80L90 28H26', a, 8) + C(40, 82, 8, b) + C(74, 82, 8, b),
      },
    ],
  },
  {
    id: 'transport',
    keys: ['nakliyat', 'lojistik', 'kargo', 'ulasim', 'tasimacilik', 'otomotiv', 'oto', 'galeri', 'yol', 'kurye', 'servis', 'tir', 'transport', 'taksi', 'lastik'],
    subject: 'chevrons, a wheel, a direction arrow or a cube — transport and logistics',
    glyphs: [
      {
        id: 'chevrons',
        draw: (a, b) => P('M6 38L50 6L94 38V60L50 28L6 60Z', a) + P('M6 76L50 44L94 76V98L50 66L6 98Z', b),
      },
      {
        id: 'wheel',
        draw: (a, b) => SC(50, 50, 38, a, 10) + S('M50 22V78M22 50H78', b, 6) + C(50, 50, 10, a),
      },
      {
        id: 'arrow',
        draw: (a, b) => P('M8 40H56V20L94 50L56 80V60H8Z', a) + S('M10 92H60', b, 7),
      },
      {
        id: 'cube',
        draw: (a, b, k) => P('M50 6L90 26V74L50 94L10 74V26Z', a) + P('M50 6L90 26L50 46L10 26Z', b) + S('M50 46V94', k, 5),
      },
    ],
  },
  {
    id: 'energy',
    keys: ['elektrik', 'enerji', 'solar', 'gunes', 'tesisat', 'klima', 'teknik', 'bakim', 'isitma', 'enerjisi', 'electric', 'power', 'makine', 'sanayi'],
    subject: 'a lightning bolt, a sun, a gear or a plug — energy and technical services',
    glyphs: [
      {
        id: 'bolt',
        draw: (a, b) => P('M58 6L14 56H46L38 94L86 40H54Z', a) + C(82, 16, 8, b),
      },
      {
        id: 'sun',
        draw: (a, b) => C(50, 50, 22, a) + S('M50 6V18M50 82V94M6 50H18M82 50H94M19 19L27 27M73 73L81 81M81 19L73 27M27 73L19 81', b, 7),
      },
      {
        id: 'gear',
        draw: (a, _b, k) => P(gearPath(8, 46, 36), a) + C(50, 50, 14, k),
      },
      {
        id: 'plug',
        draw: (a, b) => R(28, 40, 44, 36, a, 6) + R(36, 8, 9, 34, b, 3) + R(55, 8, 9, 34, b, 3) + S('M50 76V92', a, 10),
      },
    ],
  },
  {
    id: 'events',
    keys: ['etkinlik', 'eglence', 'cocuk', 'organizasyon', 'dugun', 'muzik', 'parti', 'oyun', 'konser', 'dj', 'davet', 'event', 'party', 'music'],
    subject: 'a burst, a music note, equalizer bars or a balloon — events and entertainment',
    glyphs: [
      {
        id: 'burst',
        draw: (a, _b, k) => P(starPath(8, 46, 30), a) + C(50, 50, 11, k),
      },
      {
        id: 'note',
        draw: (a, b) => C(28, 78, 16, a) + C(72, 68, 16, a) + R(38, 18, 8, 60, a) + R(82, 10, 8, 58, a) + P('M42 16L90 6V28L42 38Z', b),
      },
      {
        id: 'equalizer',
        draw: (a, b) => R(10, 44, 14, 48, a, 4) + R(32, 20, 14, 72, a, 4) + R(54, 6, 14, 86, a, 4) + R(76, 30, 14, 62, b, 4),
      },
      {
        id: 'balloon',
        draw: (a, b, k) => E(50, 38, 28, 32, a) + P('M43 70H57L50 79Z', a) + S('M50 79C42 85 58 89 50 94', b, 4) + S('M34 28C36 22 40 18 46 16', k, 5),
      },
    ],
  },
  {
    id: 'travel',
    keys: ['su', 'deniz', 'havuz', 'temizlik', 'yikama', 'turizm', 'tur', 'seyahat', 'plaj', 'balik', 'tatil', 'kamp', 'travel', 'tour', 'yat', 'gemi'],
    subject: 'waves, a compass, a sail or a half sun over the horizon — travel, tourism and water',
    glyphs: [
      {
        id: 'waves',
        draw: (a, b) =>
          P('M4 28C20 8 36 8 52 28C68 48 84 48 96 32L96 54C84 70 68 70 52 50C36 30 20 30 4 50Z', a) +
          P('M4 62C20 42 36 42 52 62C68 82 84 82 96 66L96 88C84 104 68 104 52 84C36 64 20 64 4 84Z', b),
      },
      {
        id: 'compass',
        draw: (a, b, k) => SC(50, 50, 40, a, 8) + P('M50 20L60 50L50 80L40 50Z', b) + C(50, 50, 5, k),
      },
      {
        id: 'sail',
        draw: (a, b) => P('M46 8V70H12Z', a) + P('M54 22V70H88Z', b) + P('M10 78H90L78 94H22Z', a),
      },
      {
        id: 'horizon',
        draw: (a, b) => P('M8 68A42 42 0 0 1 92 68Z', a) + R(8, 76, 84, 8, b, 4) + R(24, 88, 52, 6, b, 3),
      },
    ],
  },
  {
    id: 'nature',
    keys: ['doga', 'organik', 'cicek', 'bahce', 'spa', 'wellness', 'vegan', 'tarim', 'ciftlik', 'hayvan', 'petshop', 'evcil', 'orman', 'peyzaj', 'garden', 'farm'],
    subject: 'a tree, a sprout, twin peaks or a paw print — nature, agriculture and animals',
    glyphs: [
      {
        id: 'tree',
        draw: (a, b) => C(50, 34, 28, a) + C(30, 50, 20, a) + C(70, 50, 20, a) + R(44, 56, 12, 38, b, 3),
      },
      {
        id: 'sprout',
        draw: (a, b) =>
          S('M50 94V50', a, 8) + P('M50 54C26 56 14 40 12 18C36 16 50 30 50 54Z', a) + P('M50 44C50 24 62 12 88 12C90 36 74 50 50 44Z', b),
      },
      {
        id: 'peaks',
        draw: (a, b) => P('M4 90L30 34L54 90Z', a) + P('M34 90L66 20L96 90Z', b),
      },
      {
        id: 'paw',
        draw: (a) => C(50, 66, 22, a) + C(22, 44, 10, a) + C(40, 28, 10, a) + C(60, 28, 10, a) + C(78, 44, 10, a),
      },
    ],
  },
  {
    id: 'creative',
    keys: ['sanat', 'fotograf', 'tasarim', 'studio', 'stüdyo', 'video', 'cekim', 'reklam', 'baski', 'matbaa', 'galeri', 'photo', 'design', 'art', 'grafik'],
    subject: 'a camera, a paint palette, a pen nib or a frame — creative studios and photography',
    glyphs: [
      {
        id: 'camera',
        draw: (a, b, k) => R(8, 28, 84, 60, a, 10) + P('M32 28L38 14H62L68 28Z', a) + C(50, 58, 20, k) + C(50, 58, 10, b),
      },
      {
        id: 'palette',
        draw: (a, _b, k) =>
          P('M50 8C24 8 6 28 6 52C6 76 24 92 46 92C58 92 58 82 52 76C46 70 52 62 62 62H76C88 62 94 54 94 46C94 24 76 8 50 8Z', a) +
          C(30, 44, 7, k) + C(50, 30, 7, k) + C(70, 38, 7, k),
      },
      {
        id: 'nib',
        draw: (a, _b, k) => P('M50 6L78 46L50 94L22 46Z', a) + C(50, 46, 7, k) + S('M50 53V90', k, 4),
      },
      {
        id: 'frame',
        draw: (a, b) =>
          `<rect x="10" y="10" width="80" height="80" fill="none" stroke="${a}" stroke-width="10"/>` + C(50, 50, 16, b),
      },
    ],
  },
  {
    id: 'generic',
    keys: [],
    subject: 'an abstract geometric mark such as an orbit, a triangle, a checker or a loop — any business',
    glyphs: [
      {
        id: 'orbit',
        draw: (a, b) =>
          `<ellipse cx="50" cy="50" rx="44" ry="18" fill="none" stroke="${a}" stroke-width="8" transform="rotate(-30 50 50)"/>` + C(50, 50, 16, b),
      },
      {
        id: 'triangle',
        draw: (a) => PE('M50 8L94 90H6Z M50 42L68 76H32Z', a),
      },
      {
        id: 'checker',
        draw: (a, b) => R(8, 8, 40, 40, a, 6) + R(52, 8, 40, 40, b, 20) + R(8, 52, 40, 40, b, 20) + R(52, 52, 40, 40, a, 6),
      },
      {
        id: 'loop',
        draw: (a) => S('M50 50C50 30 30 22 20 36C10 50 22 72 40 66C48 62 50 50 50 50C50 50 52 62 60 66C78 72 90 50 80 36C70 22 50 30 50 50Z', a, 10),
      },
    ],
  },
]

export type SectorInfo = { id: string; subject: string }
export const SECTOR_IDS = SECTORS.map((s) => s.id)

export function sectorOf(text: string): SectorInfo {
  const hit = SECTORS.find((s) => s.keys.some((k) => wordIncludes(text, k)))
  const s = hit ?? SECTORS[SECTORS.length - 1]
  return { id: s.id, subject: s.subject }
}

/* ---- frames ------------------------------------------------------------- */

type FrameMeta = {
  filled: boolean
  round: boolean
  /** Glyph scale inside the frame. */
  scale: number
  shape: (color: string, weight: number) => string
}

const FRAME_META: Record<FrameId, FrameMeta> = {
  plain: { filled: false, round: false, scale: 1, shape: () => '' },
  disc: { filled: true, round: true, scale: 0.56, shape: (c) => `<circle cx="50" cy="50" r="50" fill="${c}"/>` },
  squircle: { filled: true, round: false, scale: 0.56, shape: (c) => `<rect width="100" height="100" rx="26" fill="${c}"/>` },
  ring: {
    filled: false,
    round: true,
    scale: 0.54,
    shape: (c, w) => `<circle cx="50" cy="50" r="${n2(50 - w / 2)}" fill="none" stroke="${c}" stroke-width="${w}"/>`,
  },
  tile: {
    filled: false,
    round: false,
    scale: 0.54,
    shape: (c, w) =>
      `<rect x="${n2(w / 2)}" y="${n2(w / 2)}" width="${n2(100 - w)}" height="${n2(100 - w)}" rx="20" fill="none" stroke="${c}" stroke-width="${w}"/>`,
  },
  diamond: {
    filled: false,
    round: false,
    scale: 0.46,
    shape: (c, w) => {
      const side = (50 - w) * Math.SQRT2
      return `<rect x="${n2(50 - side / 2)}" y="${n2(50 - side / 2)}" width="${n2(side)}" height="${n2(side)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="miter" transform="rotate(45 50 50)"/>`
    },
  },
}

const SAFE = { x: 4, y: 4, w: 92, h: 92 }
const FULL = { x: 0, y: 0, w: 100, h: 100 }
const glyphTransform = (s: number) => `translate(${n2(50 * (1 - s))} ${n2(50 * (1 - s))}) scale(${s})`

/* ---- library ------------------------------------------------------------ */

export type Treatment = 'plain' | 'framed'
export type LibraryEntry = { id: string; sector: string; glyph: string; treatment: Treatment }

/** Interleaved so neighbouring suggestions never share a glyph. */
const ORDER: [number, Treatment][] = [
  [0, 'plain'], [1, 'framed'], [2, 'plain'], [3, 'framed'],
  [0, 'framed'], [1, 'plain'], [2, 'framed'], [3, 'plain'],
]

export const EMBLEM_LIBRARY: LibraryEntry[] = SECTORS.flatMap((s) =>
  ORDER.map(([g, treatment]) => ({
    id: `${s.id}-${s.glyphs[g].id}-${treatment}`,
    sector: s.id,
    glyph: s.glyphs[g].id,
    treatment,
  })),
)

export const LOCAL_EMBLEM_COUNT = EMBLEM_LIBRARY.length
export const LOCAL_SECTOR_COUNT = SECTORS.length

const ENTRY_BY_ID = new Map(EMBLEM_LIBRARY.map((e) => [e.id, e]))
const GLYPH_DRAW = new Map(SECTORS.flatMap((s) => s.glyphs.map((g) => [`${s.id}-${g.id}`, g.draw] as const)))

/** A reference to a library emblem; recolour/restyle by drawing it again. */
export type LocalPick = { entry: string; variant: number }

export function drawLocalEmblem(pick: LocalPick, style: LogoStyleId, colors: LogoColors): EmblemAsset {
  const entry = ENTRY_BY_ID.get(pick.entry) ?? EMBLEM_LIBRARY[0]
  const draw = GLYPH_DRAW.get(`${entry.sector}-${entry.glyph}`)!
  const spec = styleSpec(style)
  const frameId: FrameId = entry.treatment === 'plain' ? 'plain' : spec.frames[pick.variant % spec.frames.length]
  const frame = FRAME_META[frameId]
  const { a, b, fg } = colors

  const simpleFrame = FRAME_META[spec.simpleFrame]
  const simple =
    simpleFrame.shape(a, spec.ringWeight) +
    `<g transform="${glyphTransform(0.64)}">${draw(fg, fg, a)}</g>`

  if (frameId === 'plain') {
    return {
      id: `${entry.id}-${style}`,
      source: 'local',
      inner: draw(a, b, b),
      viewBox: { w: 100, h: 100 },
      bbox: SAFE,
      simple,
    }
  }
  const glyph = frame.filled ? draw(fg, fg, a) : draw(a, b, b)
  return {
    id: `${entry.id}-${style}-${frameId}`,
    source: 'local',
    inner: `${frame.shape(a, spec.ringWeight)}<g transform="${glyphTransform(frame.scale)}">${glyph}</g>`,
    viewBox: { w: 100, h: 100 },
    bbox: FULL,
    round: frame.round,
    simple,
  }
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function rotate<T>(list: T[], by: number): T[] {
  if (list.length === 0) return list
  const k = by % list.length
  return [...list.slice(k), ...list.slice(0, k)]
}

function roundRobin<T>(lists: T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lists.map((l) => l.length))
  for (let i = 0; i < longest; i++) for (const l of lists) if (i < l.length) out.push(l[i])
  return out
}

/**
 * Picks `count` distinct emblems, deterministically from the brand name AND
 * the sector text: sectors that match by keyword lead, the rest follow, and a
 * hash of the brand rotates the order so two businesses in the same sector
 * rarely get the same marks. `seed` walks the list so "suggest others" keeps
 * producing new ones.
 */
export function pickLocalEmblems({
  count,
  brand,
  context,
  seed,
}: {
  count: number
  brand: string
  context: string
  seed: number
}): LocalPick[] {
  const text = `${brand} ${context}`
  const h = hash(`${brand.toLocaleLowerCase('tr')}|${context.toLocaleLowerCase('tr')}`)
  const entriesOf = (id: string) => EMBLEM_LIBRARY.filter((e) => e.sector === id)
  const preferred = SECTORS.filter((s) => s.keys.some((k) => wordIncludes(text, k)))
  const rest = SECTORS.filter((s) => !preferred.includes(s))
  const ordered = [
    ...roundRobin(preferred.map((s) => rotate(entriesOf(s.id), h >>> 5))),
    ...roundRobin(rotate(rest, h >>> 3).map((s) => rotate(entriesOf(s.id), h >>> 7))),
  ]
  return Array.from({ length: Math.min(count, ordered.length) }, (_, i) => {
    const n = seed * count + i
    const entry = ordered[n % ordered.length]
    const round = Math.floor(n / ordered.length)
    return { entry: entry.id, variant: (h >>> 9) + n + round }
  })
}

/** Convenience: picks + draws with colours taken straight from a site palette. */
export function localEmblems({
  count,
  palette,
  brand,
  context,
  seed,
  style = 'modern',
}: {
  count: number
  palette: LogoPalette
  brand: string
  context: string
  seed: number
  style?: LogoStyleId
}): EmblemAsset[] {
  const colors: LogoColors = { a: palette.primary, b: palette.accent, ink: palette.primary, fg: palette.primaryFg }
  return pickLocalEmblems({ count, brand, context, seed }).map((p) => drawLocalEmblem(p, style, colors))
}
