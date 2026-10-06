import type { SectionType, WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { pickLang, type Lang } from '@/lib/i18n'

/* -------------------------------------------------------------------------- */
/*  Deterministic natural-language command parser (TR + EN)                   */
/* -------------------------------------------------------------------------- */

/**
 * Turns a plain-language editing instruction into one or more typed
 * `EditOperation`s WITHOUT calling the AI. This is the reliable path for common
 * edits ("marka adını X yap", "ana rengi turkuaz yap", "hizmetler bölümünü
 * yukarı taşı"): it is instant, offline, and never fails silently. Anything it
 * cannot confidently map returns `null`, so the caller can hand the instruction
 * to the AI instead.
 *
 * It is a PURE function of (instruction, schema): it reads the schema only to
 * resolve section indices, and emits operations for the existing
 * `applyOperation` reducer — it never mutates anything itself.
 */

export type ParsedCommand = {
  operations: EditOperation[]
  /** Human-readable confirmation, already written in the site's language. */
  feedback: string
}



/** Lowercases using Turkish rules so "İ"→"i" and "I"→"ı" behave correctly. */
function lower(s: string): string {
  return s.toLocaleLowerCase('tr')
}

/**
 * Diacritic-insensitive normalization: lowercases (Turkish rules) then folds
 * ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u and collapses whitespace. This lets "SSS",
 * "Sık Sorulan Sorular", "sik sorulan sorular" and "FAQ" all match reliably,
 * regardless of how the user typed the Turkish characters.
 */
function normalize(s: string): string {
  return lower(s)
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Strips trailing command verbs ("yap", "olarak değiştir", …), surrounding
 * quotes and stray punctuation from a captured value.
 */
function cleanValue(raw: string): string {
  let v = (raw || '').trim()
  const TRAIL =
    /[\s,]*(olarak\s+)?(yapar\s+m[ıi]s[ıi]n|yapal[ıi]m|yap|olsun|olarak\s+(de[ğg]i[şs]tir|g[üu]ncelle|ayarla)|de[ğg]i[şs]tir|g[üu]ncelle|ayarla|yaz)[.!?]*$/i
  v = v.replace(/[\s.!?,]+$/, '')
  let guard = 0
  while (TRAIL.test(v) && guard++ < 5) v = v.replace(TRAIL, '').trim()
  v = v.replace(/[\s.!?,]+$/, '')
  v = v.replace(/^["'“”‘’«»]+/, '').replace(/["'“”‘’«»]+$/, '').trim()
  return v
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re)
    if (m && m[1]) {
      const value = cleanValue(m[1])
      if (value.length > 0) return value
    }
  }
  return null
}

/* ---- colors --------------------------------------------------------------- */

const COLOR_NAMES: Record<string, string> = {
  turkuaz: '#14b8a6',
  turquoise: '#14b8a6',
  teal: '#14b8a6',
  lacivert: '#1e3a5f',
  navy: '#1e3a5f',
  mavi: '#2563eb',
  blue: '#2563eb',
  'açık mavi': '#38bdf8',
  gökmavisi: '#38bdf8',
  kırmızı: '#dc2626',
  red: '#dc2626',
  yeşil: '#16a34a',
  green: '#16a34a',
  zümrüt: '#059669',
  emerald: '#059669',
  altın: '#c9a227',
  gold: '#c9a227',
  sarı: '#eab308',
  yellow: '#eab308',
  turuncu: '#ea580c',
  orange: '#ea580c',
  mor: '#7c3aed',
  purple: '#7c3aed',
  menekşe: '#7c3aed',
  pembe: '#db2777',
  pink: '#db2777',
  fuşya: '#d946ef',
  fuchsia: '#d946ef',
  siyah: '#0a0a0a',
  black: '#0a0a0a',
  beyaz: '#ffffff',
  white: '#ffffff',
  gri: '#6b7280',
  gray: '#6b7280',
  grey: '#6b7280',
  kahverengi: '#78350f',
  brown: '#78350f',
  bordo: '#7f1d1d',
  maroon: '#7f1d1d',
  bej: '#d6c7a1',
  beige: '#d6c7a1',
  krem: '#f5f0e1',
  cream: '#f5f0e1',
}

function detectColorHex(textLower: string): { hex: string; name: string } | null {
  const hexMatch = textLower.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i)
  if (hexMatch) return { hex: '#' + hexMatch[1], name: '#' + hexMatch[1] }
  // Longest names first so "açık mavi" wins over "mavi".
  const names = Object.keys(COLOR_NAMES).sort((a, b) => b.length - a.length)
  for (const name of names) {
    if (textLower.includes(name)) return { hex: COLOR_NAMES[name], name }
  }
  return null
}

type PaletteRole = 'primary' | 'accent' | 'background' | 'foreground'

function detectColorRole(textLower: string): PaletteRole {
  if (/(arka\s*plan|arkaplan|background|zemin)/.test(textLower)) return 'background'
  if (/(yaz[ıi]|metin|text|font\s*color|yazı\s*reng)/.test(textLower)) return 'foreground'
  if (/(vurgu|accent|ikincil\s*renk|secondary\s*color)/.test(textLower)) return 'accent'
  return 'primary'
}

/* ---- section type detection ---------------------------------------------- */

/**
 * Section synonyms. All entries are already diacritic-normalized (see
 * `normalize`) so the instruction and section titles can be matched against
 * them without worrying about Turkish characters. Order matters: earlier, more
 * specific groups win over later, broader ones.
 */
const SECTION_SYNONYMS: [SectionType, string[]][] = [
  ['faq', ['sss', 'sik soru', 'sik sorulan soru', 'sikca sorulan soru', 'sikca soru', 'soru cevap', 'soru-cevap', 'faq', 'faqs', 'frequently asked question', 'frequently asked', 'questions']],
  ['services', ['hizmet', 'service']],
  ['categories', ['kategori', 'kategoriler', 'category', 'categories', 'departman', 'reyon']],
  ['products', ['urun', 'urunler', 'product', 'products', 'magaza', 'vitrin', 'katalog', 'shop', 'store']],
  ['testimonials', ['referans', 'musteri yorum', 'musteri gorus', 'yorum', 'gorus', 'testimonial', 'review']],
  ['stats', ['istatistik', 'rakam', 'sayilar', 'stat']],
  ['portfolio', ['portfoy', 'portfolyo', 'portfolio', 'proje', 'calismalar', 'case study', 'case']],
  ['gallery', ['galeri', 'gallery']],
  ['team', ['ekip', 'takim', 'team', 'kadro', 'hekimler', 'calisanlar', 'doktorlar']],
  ['process', ['surec', 'process', 'adimlar', 'asama', 'step']],
  ['pricing', ['fiyat', 'ucret', 'pricing', 'price', 'paket', 'plan']],
  ['contact', ['iletisim', 'contact', 'bize ulasin', 'rezervasyon']],
  ['about', ['hakkimizda', 'hakkinda', 'hakki', 'about', 'hikayemiz', 'our story']],
  ['features', ['ozellik', 'feature', 'avantaj']],
  ['cta', ['eylem cagri', 'cagri', 'call to action', 'cta']],
  ['slider', ['slider', 'slayt', 'kayan gorsel', 'kayan resim', 'carousel', 'karusel', 'kaydirmali']],
  ['hero', ['hero', 'kapak']],
  ['footer', ['alt bilgi', 'footer']],
]

const SECTION_LABEL: Record<SectionType, { tr: string; en: string }> = {
  hero: { tr: 'Hero', en: 'Hero' },
  slider: { tr: 'Kayan Görsel', en: 'Slider' },
  about: { tr: 'Hakkımızda', en: 'About' },
  services: { tr: 'Hizmetler', en: 'Services' },
  features: { tr: 'Özellikler', en: 'Features' },
  stats: { tr: 'İstatistikler', en: 'Stats' },
  testimonials: { tr: 'Referanslar', en: 'Testimonials' },
  gallery: { tr: 'Galeri', en: 'Gallery' },
  portfolio: { tr: 'Portföy', en: 'Portfolio' },
  products: { tr: 'Ürünler', en: 'Products' },
  categories: { tr: 'Kategoriler', en: 'Categories' },
  process: { tr: 'Süreç', en: 'Process' },
  team: { tr: 'Ekip', en: 'Team' },
  pricing: { tr: 'Fiyatlandırma', en: 'Pricing' },
  faq: { tr: 'SSS', en: 'FAQ' },
  contact: { tr: 'İletişim', en: 'Contact' },
  cta: { tr: 'Eylem Çağrısı', en: 'Call to action' },
  footer: { tr: 'Alt Bilgi', en: 'Footer' },
}

/** Detects the intended section type from a (normalized) instruction. */
function detectSectionType(textNorm: string): SectionType | null {
  for (const [type, syns] of SECTION_SYNONYMS) {
    if (syns.some((k) => textNorm.includes(k))) return type
  }
  return null
}

/** Returns the normalized title of a section, or '' when it has none. */
function sectionTitleNorm(section: WebsiteSchema['sections'][number]): string {
  const title = 'title' in section && typeof section.title === 'string' ? section.title : ''
  return normalize(title)
}

/**
 * Finds the index of the target section in the live schema, matching on BOTH
 * the section `type` AND its normalized `title` against the type's synonyms.
 * This means "SSS bölümünü kaldır", "FAQ'yı kaldır" and "Sık sorulan soruları
 * sil" all resolve to the same section even if its title is custom. Returns -1
 * when the section genuinely isn't present.
 */
function resolveSectionIndex(type: SectionType, site: WebsiteSchema): number {
  const byType = site.sections.findIndex((s) => s.type === type)
  if (byType !== -1) return byType

  // Fallback: match on the section title, but only against DISTINCTIVE
  // multi-word synonyms (e.g. "sikca sorulan soru", "bize ulasin"). Single
  // generic tokens like "proje" or "plan" are excluded here to avoid matching
  // an unrelated section whose title happens to contain them.
  const syns = (SECTION_SYNONYMS.find(([t]) => t === type)?.[1] ?? []).filter((sy) =>
    sy.includes(' '),
  )
  if (syns.length === 0) return -1
  return site.sections.findIndex((s) => {
    const title = sectionTitleNorm(s)
    return title.length > 0 && syns.some((sy) => title.includes(sy))
  })
}

/* ---- feedback helpers ----------------------------------------------------- */

const say = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

/* ---- header menu ---------------------------------------------------------- */

/** Matches a diacritic-folded instruction that talks about the header menu. */
const MENU_INTENT = /(\bust\s*menu|\bmenu|navigasyon|navigation|\bnavbar\b|\bnav\b|\bheader\b|ust\s*bilgi)/

/**
 * True when `label` (already normalized) is mentioned in the instruction. The
 * match is anchored on the START of a word only, so Turkish suffixes still
 * match ("ozellikler" in "ozellikleri", "hizmetler" in "hizmetlerini").
 */
function mentionsLabel(textNorm: string, label: string): boolean {
  if (label.length < 3) return false
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}`).test(textNorm)
}

/**
 * Resolves which menu entry an instruction points at and emits the operations
 * that remove EXACTLY that entry. A multi-page site renders its header from
 * `pages`, a single-page site from `navigation.links`, so both are checked.
 * The home page and the last remaining link can never be removed, and an
 * instruction that matches nothing is reported honestly rather than "done".
 */
function parseMenuRemoval(
  textNorm: string,
  sectionType: SectionType | null,
  site: WebsiteSchema,
  lang: Lang,
): ParsedCommand {
  // A section type contributes its synonyms ("ozellik" -> "Özellikler"), so a
  // menu label that differs from the instruction's stem still resolves.
  const synonyms = sectionType
    ? (SECTION_SYNONYMS.find(([t]) => t === sectionType)?.[1] ?? [])
    : []
  const matches = (rawLabel: string): boolean => {
    const label = normalize(rawLabel)
    if (!label) return false
    if (mentionsLabel(textNorm, label)) return true
    return synonyms.some((sy) => sy.length >= 3 && label.includes(sy))
  }

  const homeIndex = Math.max(
    0,
    site.pages.findIndex((p) => p.isHome === true),
  )
  const pageIndex = site.pages.length > 1 ? site.pages.findIndex((p, i) => i !== homeIndex && matches(p.title)) : -1
  const linkIndex = site.navigation.links.findIndex((l) => matches(l.label))

  const matchedLabel =
    pageIndex !== -1
      ? site.pages[pageIndex].title
      : linkIndex !== -1
        ? site.navigation.links[linkIndex].label
        : null

  const operations: EditOperation[] = []
  // `removePage` already drops the page's own menu link, so a separate
  // `removeNavLink` is only needed for links that have no page behind them.
  if (pageIndex !== -1) {
    operations.push({ op: 'removePage', pageIndex })
  } else if (linkIndex !== -1 && site.navigation.links.length > 1) {
    operations.push({ op: 'removeNavLink', linkIndex })
  }

  if (operations.length > 0) {
    return {
      operations,
      feedback: say(
        lang,
        `"${matchedLabel}" üst menüden kaldırıldı.`,
        `Removed "${matchedLabel}" from the top menu.`,
      ),
    }
  }

  if (matchedLabel) {
    return {
      operations: [],
      feedback: say(
        lang,
        `"${matchedLabel}" menüden kaldırılamadı: menüde en az bir öğe kalmalı.`,
        `Could not remove "${matchedLabel}": the menu needs at least one item.`,
      ),
    }
  }

  const homeMatched =
    site.pages.length > 1 && matches(site.pages[homeIndex].title)
  return {
    operations: [],
    feedback: homeMatched
      ? say(
          lang,
          'Ana sayfa üst menüden kaldırılamaz.',
          'The home page cannot be removed from the menu.',
        )
      : say(
          lang,
          'Üst menüde bu isimde bir öğe bulamadım. Menüdeki adı aynen yazar mısın?',
          "I couldn't find that item in the top menu. Could you type its exact name?",
        ),
  }
}

/* -------------------------------------------------------------------------- */
/*  Main parser                                                               */
/* -------------------------------------------------------------------------- */

export function parseCommand(
  instruction: string,
  site: WebsiteSchema,
): ParsedCommand | null {
  const lang: Lang = site.meta.language === 'en' ? 'en' : 'tr'
  const raw = instruction.trim()
  if (raw.length < 2) return null
  const text = lower(raw)
  const textNorm = normalize(raw)

  /* 1. Structural section operations (add / remove / hide / show / move) ---- */
  const wantsAdd = /(\bekle\b|\bekler misin\b|\badd\b|\binsert\b)/.test(text)
  const wantsRemove = /(kald[ıi]r|\bsil\b|\bçıkar\b|\bcikar\b|\bremove\b|\bdelete\b)/.test(text)
  const wantsHide = /(\bgizle\b|\bhide\b|\bkapat\b)/.test(text)
  const wantsShow = /(\bg[öo]ster\b|\bshow\b|\bg[öo]r[üu]n[üu]r\b)/.test(text)
  const wantsUp = /(yukar|\bup\b|öne al|basa|başa)/.test(text)
  const wantsDown = /(a[şs]a[ğg][ıi]|\bdown\b|sona)/.test(text)
  const wantsMove = /(ta[şs][ıi]|\bmove\b|s[ıi]rala|kayd[ıi]r)/.test(text) || wantsUp || wantsDown
  const sectionType = detectSectionType(textNorm)

  /* 0. Header menu removal ("Özellikler'i üst menüden kaldır") ---------------
   * Must run BEFORE the section block: the same words also match a section
   * ("Özellikler" -> features), and deleting that section would destroy page
   * content while leaving the menu entry exactly where it was. */
  if (!wantsAdd && (wantsRemove || wantsHide) && MENU_INTENT.test(textNorm)) {
    return parseMenuRemoval(textNorm, sectionType, site, lang)
  }

  if (sectionType && wantsAdd) {
    return {
      operations: [{ op: 'addSection', sectionType }],
      feedback: say(
        lang,
        `${SECTION_LABEL[sectionType].tr} bölümü eklendi.`,
        `Added the ${SECTION_LABEL[sectionType].en} section.`,
      ),
    }
  }

  if (sectionType && (wantsRemove || wantsHide || wantsShow || wantsMove)) {
    const index = resolveSectionIndex(sectionType, site)
    if (index === -1) {
      return {
        operations: [],
        feedback: say(
          lang,
          `Bu sitede ${SECTION_LABEL[sectionType].tr} bölümü bulunmuyor.`,
          `This site doesn't have a ${SECTION_LABEL[sectionType].en} section.`,
        ),
      }
    }
    const label = pickLang(SECTION_LABEL[sectionType], lang)
    if (wantsRemove) {
      return {
        operations: [{ op: 'removeSection', index }],
        feedback: say(lang, `${label} bölümü kaldırıldı.`, `Removed the ${label} section.`),
      }
    }
    if (wantsHide) {
      return {
        operations: [{ op: 'setSectionHidden', index, hidden: true }],
        feedback: say(lang, `${label} bölümü gizlendi.`, `Hid the ${label} section.`),
      }
    }
    if (wantsShow) {
      return {
        operations: [{ op: 'setSectionHidden', index, hidden: false }],
        feedback: say(lang, `${label} bölümü gösteriliyor.`, `Showing the ${label} section.`),
      }
    }
    // move
    const direction: 'up' | 'down' = wantsDown && !wantsUp ? 'down' : 'up'
    return {
      operations: [{ op: 'moveSection', index, direction }],
      feedback: say(
        lang,
        `${label} bölümü ${direction === 'up' ? 'yukarı' : 'aşağı'} taşındı.`,
        `Moved the ${label} section ${direction}.`,
      ),
    }
  }

  /* 2. Color / palette -------------------------------------------------------*/
  if (/(reng|renk|ren_|colour|color)/.test(text)) {
    const color = detectColorHex(text)
    if (color) {
      const role = detectColorRole(text)
      const roleLabel: Record<PaletteRole, { tr: string; en: string }> = {
        primary: { tr: 'Ana renk', en: 'Brand color' },
        accent: { tr: 'Vurgu rengi', en: 'Accent color' },
        background: { tr: 'Arka plan rengi', en: 'Background color' },
        foreground: { tr: 'Yazı rengi', en: 'Text color' },
      }
      return {
        operations: [{ op: 'updatePalette', role, hex: color.hex }],
        feedback: say(
          lang,
          `${roleLabel[role].tr} ${color.name} olarak güncellendi.`,
          `${roleLabel[role].en} updated to ${color.name}.`,
        ),
      }
    }
  }

  /* 3. Site name -------------------------------------------------------------*/
  const siteName = firstMatch(raw, [
    /(?:marka|firma|i[şs]letme|sit\w*)\s+(?:ad|isim|ism)\S*\s+(.+)/i,
    /(?:site|brand|company)\s*name\s*(?:to\s+)?(.+)/i,
    /(?:rename|call\s+it)\s+(?:to\s+)?(.+)/i,
  ])
  if (siteName) {
    return {
      // Update both the site name and the visible header logo so the brand
      // changes everywhere the user can see it.
      operations: [
        { op: 'updateMeta', name: siteName },
        { op: 'updateNavigation', logoText: siteName },
      ],
      feedback: say(
        lang,
        `Marka adı "${siteName}" olarak güncellendi.`,
        `Site name updated to "${siteName}".`,
      ),
    }
  }

  /* 3b. Header logo layout (size / alignment) — deterministic, zero AI cost --
   * These only ever touch `navigation.logo`'s layout fields (never `src`), so
   * they can never accidentally regenerate or remove the brand mark itself —
   * matching "AI should decide whether the instruction is about the logo
   * area or the header design, and only change what was asked for."          */
  if (/\blogo\w*/.test(textNorm)) {
    const hasLogo = Boolean(site.navigation.logo?.src)
    if (!hasLogo) {
      return {
        operations: [],
        feedback: say(
          lang,
          'Önce bir logo yüklemeniz veya oluşturmanız gerekiyor. Sağ paneldeki "Logo" alanından ekleyebilirsiniz.',
          'You need to add a logo first — use the "Logo" field in the right panel.',
        ),
      }
    }

    const currentWidth = site.navigation.logo?.width ?? 160
    const currentMobile = site.navigation.logo?.mobileWidth ?? site.navigation.logo?.width ?? 96
    const wantsMobile = /\bmobil\w*/.test(textNorm)
    const wantsBigger = /(b[uü]y[uü]t|daha b[uü]y[uü]k|genislet|larger|bigger|increase)/.test(textNorm)
    const wantsSmaller = /(k[uü][cç][uü]lt|daha k[uü][cç][uü]k|azalt|smaller|shrink|reduce)/.test(textNorm)
    const alignLeft = /(sola|sol\s*taraf|\bleft\b)/.test(textNorm)
    const alignCenter = /(ortaya|\borta\b|\bcenter\b|\bcentre\b)/.test(textNorm)
    const alignRight = /(saga|sag\s*taraf|\bright\b)/.test(textNorm)

    if (wantsMobile && (wantsBigger || wantsSmaller)) {
      const next = clamp(currentMobile + (wantsBigger ? 24 : -24), 48, 240)
      return {
        operations: [{ op: 'updateNavLogo', mobileWidth: next }],
        feedback: say(
          lang,
          `Logo mobil görünümde ${wantsBigger ? 'büyütüldü' : 'küçültüldü'}.`,
          `Logo made ${wantsBigger ? 'bigger' : 'smaller'} on mobile.`,
        ),
      }
    }

    if (wantsBigger || wantsSmaller) {
      const next = clamp(currentWidth + (wantsBigger ? 40 : -40), 60, 400)
      return {
        operations: [{ op: 'updateNavLogo', width: next }],
        feedback: say(
          lang,
          `Logo boyutu ${wantsBigger ? 'büyütüldü' : 'küçültüldü'}.`,
          `Logo size made ${wantsBigger ? 'bigger' : 'smaller'}.`,
        ),
      }
    }

    if (alignLeft || alignCenter || alignRight) {
      const align: 'left' | 'center' | 'right' = alignCenter ? 'center' : alignRight ? 'right' : 'left'
      const alignLabel: Record<'left' | 'center' | 'right', { tr: string; en: string }> = {
        left: { tr: 'sola', en: 'left' },
        center: { tr: 'ortaya', en: 'center' },
        right: { tr: 'sağa', en: 'right' },
      }
      return {
        operations: [{ op: 'updateNavLogo', align }],
        feedback: say(
          lang,
          `Logo ${alignLabel[align].tr} hizalandı.`,
          `Logo aligned to the ${alignLabel[align].en}.`,
        ),
      }
    }
    // Any other "logo" instruction (e.g. "profesyonel bir logo tasarla") falls
    // through to the AI — that needs real generation, not a deterministic rule.
  }

  /* 4. Hero fields -----------------------------------------------------------*/
  const heroTitle = firstMatch(raw, [
    /(?:hero\s*)?ba[şs]l[ıi][kğ]\S*\s+(.+)/i,
    /(?:hero\s*)?(?:title|headline)\s*(?:to\s+)?(.+)/i,
  ])
  if (heroTitle) {
    return {
      operations: [{ op: 'updateHero', patch: { title: heroTitle } }],
      feedback: say(
        lang,
        `Hero başlığı güncellendi: "${heroTitle}".`,
        `Hero title updated: "${heroTitle}".`,
      ),
    }
  }

  const heroDesc = firstMatch(raw, [
    /(?:hero\s*)?a[çc][ıi]klama\S*\s+(.+)/i,
    /(?:hero\s*)?(?:description|subtitle|subheadline)\s*(?:to\s+)?(.+)/i,
  ])
  if (heroDesc) {
    return {
      operations: [{ op: 'updateHero', patch: { description: heroDesc } }],
      feedback: say(lang, `Hero açıklaması güncellendi.`, `Hero description updated.`),
    }
  }

  const secondaryCta = firstMatch(raw, [
    /(?:ikincil)\s*(?:buton|d[üu][ğg]me)\S*\s+(.+)/i,
    /(?:secondary)\s*(?:button|cta)\s*(?:text\s*)?(?:to\s+)?(.+)/i,
  ])
  if (secondaryCta) {
    return {
      operations: [{ op: 'updateHero', patch: { secondaryButtonLabel: secondaryCta } }],
      feedback: say(lang, `İkincil buton güncellendi.`, `Secondary button updated.`),
    }
  }

  const primaryCta = firstMatch(raw, [
    /(?:ana|birincil|as[ıi]l)\s*(?:buton|d[üu][ğg]me)\S*\s+(.+)/i,
    /(?:primary|main)\s*(?:button|cta)\s*(?:text\s*)?(?:to\s+)?(.+)/i,
    /(?:buton|d[üu][ğg]me)(?:u|nu)?\s+(?:metnini\s+|yaz[ıi]s[ıi]n[ıi]\s+)?(.+)/i,
  ])
  if (primaryCta) {
    return {
      operations: [{ op: 'updateHero', patch: { primaryButtonLabel: primaryCta } }],
      feedback: say(lang, `Ana buton güncellendi.`, `Primary button updated.`),
    }
  }

  /* 5. Tagline ---------------------------------------------------------------*/
  const tagline = firstMatch(raw, [
    /(?:slogan|slogan[ıi]n[ıi]?)\s+(.+)/i,
    /(?:tagline)\s*(?:to\s+)?(.+)/i,
  ])
  if (tagline) {
    return {
      operations: [{ op: 'updateMeta', tagline }],
      feedback: say(lang, `Slogan güncellendi.`, `Tagline updated.`),
    }
  }

  return null
}
