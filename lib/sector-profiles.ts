import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveVisualTopic, wordIncludes } from '@/lib/visual-subjects'
import { pickLang } from '@/lib/i18n'

/**
 * Sector profiles
 * ---------------
 * Turns a freeform prompt into a professional, sector-specific website:
 * a fitting palette + typography AND realistic, non-generic content
 * (navigation, services, stats, CTAs, signature sections) in TR or EN.
 *
 * This powers the deterministic fallback so that — even without the AI
 * Gateway — a dental clinic looks clean and clinical, a restaurant warm and
 * appetizing, a law firm serious and corporate, and so on. Each sector reads
 * visibly different from the others.
 */

export type Sector =
  | 'dental'
  | 'food'
  | 'law'
  | 'architecture'
  | 'beauty'
  | 'tech'
  | 'ecommerce'
  | 'photography'
  | 'automotive'
  | 'realestate'
  | 'default'

type Lang = 'tr' | 'en'
type Theme = WebsiteSchema['theme']
type Typography = WebsiteSchema['typography']
type Sections = WebsiteSchema['sections']
type Navigation = WebsiteSchema['navigation']

export type SectorBuild = {
  theme: Theme
  typography: Typography
  meta: { tagline: string; tone: string; audience: string }
  navigation: Navigation
  pages: WebsiteSchema['pages']
  sections: Sections
}

/* -------------------------------------------------------------------------- */
/*  Detection                                                                 */
/* -------------------------------------------------------------------------- */

const KEYWORDS: Record<Exclude<Sector, 'default'>, string[]> = {
  dental: ['diş', 'dis', 'dental', 'dentist', 'ortodonti', 'implant', 'ağız', 'agiz', 'gülüş', 'gulus', 'klinik'],
  food: ['kahve', 'kafe', 'coffee', 'cafe', 'restoran', 'restaurant', 'yemek', 'lokanta', 'bakery', 'fırın', 'firin', 'pastane', 'menü', 'menu', 'bistro', 'mutfak', 'pizza', 'burger'],
  law: ['hukuk', 'avukat', 'law', 'legal', 'attorney', 'finans', 'finance', 'danışman', 'danisman', 'consult', 'accounting', 'muhasebe', 'sigorta'],
  architecture: ['mimar', 'mimarlık', 'mimarlik', 'architect', 'architecture', 'inşaat', 'insaat', 'construction', 'iç mimar', 'interior', 'tasarım ofis', 'yapı', 'yapi'],
  beauty: ['güzellik', 'guzellik', 'kuaför', 'kuafor', 'salon', 'spa', 'beauty', 'wellness', 'estetik', 'bakım', 'bakim', 'makyaj', 'saç', 'sac', 'cilt', 'kozmetik'],
  tech: ['yazılım', 'yazilim', 'teknoloji', 'tech', 'saas', 'startup', 'uygulama', 'app', 'yapay zeka', 'software', 'platform', 'dashboard', 'ajans', 'agency', 'dijital'],
  ecommerce: ['e-ticaret', 'eticaret', 'ecommerce', 'e-commerce', 'mağaza', 'magaza', 'store', 'shop', 'ürün sat', 'urun sat', 'online satış', 'marka', 'butik', 'giyim'],
  photography: ['fotoğraf', 'fotograf', 'photo', 'photograph', 'düğün fotoğraf', 'dugun fotograf', 'wedding photo', 'çekim', 'cekim', 'portre', 'fotoğraf stüdyo', 'fotograf studyo', 'photo studio'],
  automotive: ['oto galeri', 'otogaleri', 'oto sat', 'oto alım', 'oto alim', 'otomobil', 'otomotiv', 'araç galeri', 'arac galeri', 'araba galeri', 'araç sat', 'arac sat', 'araba sat', 'galeri', 'car dealer', 'car dealership', 'automotive', 'vasıta', 'vasita', 'ikinci el araç', 'ikinci el arac', 'ikinci el oto', '2.el', 'sıfır km', 'sifir km', 'showroom', 'dealership'],
  realestate: ['emlak', 'gayrimenkul', 'gayri menkul', 'real estate', 'realty', 'konut', 'satılık', 'satilik', 'kiralık', 'kiralik', 'daire sat', 'ev sat', 'villa sat', 'proje pazarlama', 'müteahhit', 'muteahhit'],
}

/**
 * Strong e-commerce intent signals. When ANY of these appears the visitor is
 * unambiguously asking to sell products online (a cart + checkout store), so we
 * force the `ecommerce` sector even when a weaker sector word is also present
 * (e.g. "kozmetik satışı için e-ticaret sitesi" must be a store, not a beauty
 * salon). These are deliberately intent phrases — "e-ticaret", "sepet",
 * "ödeme sistemli", "sipariş" — not generic product nouns.
 */
const STRONG_ECOMMERCE: string[] = [
  'e-ticaret', 'eticaret', 'e ticaret', 'ecommerce', 'e-commerce',
  'online mağaza', 'online magaza', 'internet mağaza', 'internet magaza',
  'online satış', 'online satis', 'internetten sat', 'online store', 'web shop', 'webshop', 'web mağaza',
  'sepet', 'ödeme sistem', 'odeme sistem', 'ödeme sistemli', 'odeme sistemli',
  'sipariş al', 'siparis al', 'sipariş takib', 'siparis takib', 'sipariş sistem', 'siparis sistem',
  'ürün kataloğ', 'urun katalog', 'ürün sat', 'urun sat', 'satış sitesi', 'satis sitesi',
  'ürünlerimi sat', 'urunlerimi sat', 'ürün satışı', 'urun satisi', 'sell products', 'checkout',
]

/**
 * True when the brief clearly asks for an online store (products + cart +
 * checkout), so the generator produces a full e-commerce site instead of a
 * corporate one. Exported so the generation route and plan summary can label
 * the output as an "E-Ticaret Sitesi" and bias the AI prompt accordingly.
 */
export function isEcommerceIntent(prompt: string): boolean {
  const p = prompt.toLocaleLowerCase('tr')
  return STRONG_ECOMMERCE.some((w) => p.includes(w))
}

export function detectSector(prompt: string): Sector {
  const p = prompt.toLowerCase()
  // Strong e-commerce intent wins over every other sector: "kozmetik satışı
  // için e-ticaret sitesi" is a store, not a beauty salon.
  if (isEcommerceIntent(prompt)) return 'ecommerce'
  // Order matters: more specific sectors first.
  const order: Exclude<Sector, 'default'>[] = [
    'dental',
    'photography',
    'architecture',
    'law',
    'beauty',
    'food',
    'realestate',
    'automotive',
    'ecommerce',
    'tech',
  ]
  for (const sector of order) {
    if (KEYWORDS[sector].some((w) => p.includes(w))) return sector
  }
  return 'default'
}

/* -------------------------------------------------------------------------- */
/*  Themes per sector                                                         */
/* -------------------------------------------------------------------------- */

const THEMES: Record<Sector, { theme: Theme; typography: Typography }> = {
  dental: {
    theme: {
      mode: 'light',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#0ea5b7' },
        { name: 'accent', hex: '#0284c7' },
        { name: 'background', hex: '#f5fbfc' },
        { name: 'foreground', hex: '#0b2833' },
      ],
    },
    typography: { headingFont: 'Poppins', bodyFont: 'Inter' },
  },
  food: {
    theme: {
      mode: 'light',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#b45309' },
        { name: 'accent', hex: '#ea580c' },
        { name: 'background', hex: '#fbf7f0' },
        { name: 'foreground', hex: '#2b1a10' },
      ],
    },
    typography: { headingFont: 'Playfair Display', bodyFont: 'Inter' },
  },
  law: {
    theme: {
      mode: 'dark',
      radius: 'small',
      palette: [
        { name: 'primary', hex: '#1e3a8a' },
        { name: 'accent', hex: '#b8860b' },
        { name: 'background', hex: '#0b1220' },
        { name: 'foreground', hex: '#eef2f7' },
      ],
    },
    typography: { headingFont: 'Libre Baskerville', bodyFont: 'Inter' },
  },
  architecture: {
    theme: {
      mode: 'light',
      radius: 'none',
      palette: [
        { name: 'primary', hex: '#18181b' },
        { name: 'accent', hex: '#a16207' },
        { name: 'background', hex: '#fafaf9' },
        { name: 'foreground', hex: '#18181b' },
      ],
    },
    typography: { headingFont: 'Archivo', bodyFont: 'Inter' },
  },
  beauty: {
    theme: {
      mode: 'light',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#be185d' },
        { name: 'accent', hex: '#c084fc' },
        { name: 'background', hex: '#fdf2f8' },
        { name: 'foreground', hex: '#3b1a2b' },
      ],
    },
    typography: { headingFont: 'Cormorant Garamond', bodyFont: 'Inter' },
  },
  tech: {
    theme: {
      mode: 'dark',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#06b6d4' },
        { name: 'accent', hex: '#8b5cf6' },
        { name: 'background', hex: '#0a0f1e' },
        { name: 'foreground', hex: '#e6edf7' },
      ],
    },
    typography: { headingFont: 'Space Grotesk', bodyFont: 'Geist' },
  },
  ecommerce: {
    theme: {
      mode: 'light',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#4f46e5' },
        { name: 'accent', hex: '#f43f5e' },
        { name: 'background', hex: '#ffffff' },
        { name: 'foreground', hex: '#0f172a' },
      ],
    },
    typography: { headingFont: 'Sora', bodyFont: 'Inter' },
  },
  photography: {
    theme: {
      mode: 'dark',
      radius: 'none',
      palette: [
        { name: 'primary', hex: '#e7e5e4' },
        { name: 'accent', hex: '#a8a29e' },
        { name: 'background', hex: '#0a0a0a' },
        { name: 'foreground', hex: '#fafaf9' },
      ],
    },
    typography: { headingFont: 'Cormorant Garamond', bodyFont: 'Inter' },
  },
  automotive: {
    theme: {
      mode: 'dark',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#e11d48' },
        { name: 'accent', hex: '#38bdf8' },
        { name: 'background', hex: '#0a0d12' },
        { name: 'foreground', hex: '#f1f5f9' },
      ],
    },
    typography: { headingFont: 'Sora', bodyFont: 'Inter' },
  },
  realestate: {
    theme: {
      mode: 'dark',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#6366f1' },
        { name: 'accent', hex: '#22d3ee' },
        { name: 'background', hex: '#0f172a' },
        { name: 'foreground', hex: '#f1f5f9' },
      ],
    },
    typography: { headingFont: 'Sora', bodyFont: 'Inter' },
  },
  default: {
    theme: {
      mode: 'dark',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#7c3aed' },
        { name: 'accent', hex: '#22d3ee' },
        { name: 'background', hex: '#0f172a' },
        { name: 'foreground', hex: '#f8fafc' },
      ],
    },
    typography: { headingFont: 'Space Grotesk', bodyFont: 'Geist' },
  },
}

/* -------------------------------------------------------------------------- */
/*  Brand name derivation                                                     */
/* -------------------------------------------------------------------------- */

const STOPWORDS = new Set([
  'bir', 'için', 'icin', 've', 'ile', 'da', 'de', 'the', 'a', 'an', 'for', 'in', 'at', 'of', 'to',
  'premium', 'modern', 'profesyonel', 'professional', 'lüks', 'luks', 'luxury', 'şık', 'sik', 'sık',
  'yeni', 'new', 'güzel', 'guzel', 'kaliteli', 'merkezli', 'based', 'web', 'site', 'sitesi', 'website',
  'oluştur', 'olustur', 'yap', 'kur', 'create', 'build', 'make', 'güven', 'guven', 'veren', 'temiz',
])

const CITIES = new Set([
  'istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya', 'kadıköy', 'kadikoy',
  'beşiktaş', 'besiktas', 'şişli', 'sisli', 'london', 'paris', 'york', 'berlin', 'madrid',
])

const DEFAULT_BRANDS: Record<Sector, { tr: string; en: string }> = {
  dental: { tr: 'Denta Estetik', en: 'Denta Care' },
  food: { tr: 'Kahve Durağı', en: 'Roast House' },
  law: { tr: 'Adalet Hukuk', en: 'Meridian Law' },
  architecture: { tr: 'Atölye Mimarlık', en: 'Atelier Studio' },
  beauty: { tr: 'Zarafet Güzellik', en: 'Lumière Beauty' },
  tech: { tr: 'Nova Yazılım', en: 'Nova Labs' },
  ecommerce: { tr: 'Vitrin', en: 'Marketly' },
  photography: { tr: 'Kare Fotoğraf', en: 'Frame Studio' },
  automotive: { tr: 'Prestij Oto', en: 'Prestige Motors' },
  realestate: { tr: 'Emlak Vizyon', en: 'Vista Realty' },
  default: { tr: 'Marka', en: 'Brand' },
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Extracts a clean brand from the prompt, else uses a sector default. */
export function deriveBrandName(prompt: string, sector: Sector, lang: Lang): string {
  // Explicit quoted name wins.
  const quoted = prompt.match(/["'“”']([^"'“”']{2,40})["'“”']/)
  if (quoted?.[1]) return quoted[1].trim()

  const tokens = prompt
    .replace(/[.,!?;:()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !t.includes("'")) // drop inflected location tokens like "İstanbul'da"
    .filter((t) => {
      const low = t.toLocaleLowerCase('tr')
      return !STOPWORDS.has(low) && !CITIES.has(low)
    })

  // Keep only descriptive nouns, drop case-insensitive duplicates, then take up
  // to 2 distinct tokens so we never produce "Mimarlık Mimarlık".
  const seen = new Set<string>()
  const meaningful: string[] = []
  for (const t of tokens) {
    if (t.length <= 2) continue
    const key = t.toLocaleLowerCase('tr')
    if (seen.has(key)) continue
    seen.add(key)
    meaningful.push(t)
    if (meaningful.length === 2) break
  }
  if (meaningful.length >= 1) {
    const candidate = meaningful.map(titleCase).join(' ')
    // Avoid returning something that is just a sector word.
    if (candidate.length >= 3) return candidate
  }
  return pickLang(DEFAULT_BRANDS[sector], lang)
}

/* -------------------------------------------------------------------------- */
/*  SEO title derivation                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The search keyword each sector should rank for. Deliberately the phrase a
 * customer would actually type into Google ("diş kliniği", "oto galeri"),
 * not a marketing slogan.
 */
const SEO_KEYWORDS: Record<Sector, { tr: string; en: string }> = {
  dental: { tr: 'Diş Kliniği', en: 'Dental Clinic' },
  food: { tr: 'Restoran ve Kafe', en: 'Restaurant & Cafe' },
  law: { tr: 'Hukuk Bürosu', en: 'Law Firm' },
  architecture: { tr: 'Mimarlık ve İç Tasarım', en: 'Architecture & Interior Design' },
  beauty: { tr: 'Güzellik Salonu', en: 'Beauty Salon' },
  tech: { tr: 'Yazılım ve Dijital Çözümler', en: 'Software & Digital Solutions' },
  ecommerce: { tr: 'Online Mağaza', en: 'Online Store' },
  photography: { tr: 'Fotoğraf Stüdyosu', en: 'Photography Studio' },
  automotive: { tr: 'Oto Galeri', en: 'Car Dealership' },
  realestate: { tr: 'Emlak ve Gayrimenkul', en: 'Real Estate Agency' },
  default: { tr: 'Profesyonel Hizmetler', en: 'Professional Services' },
}

/**
 * More specific search keywords for businesses the coarse `Sector` list cannot
 * express (nakliyat, temizlik, veteriner, tesisat, …). Matched against the
 * prompt before falling back to the sector keyword.
 */
const NICHE_SEO_KEYWORDS: { match: string[]; tr: string; en: string }[] = [
  { match: ['nakliyat', 'nakliye', 'evden eve', 'taşımacılık', 'tasimacilik', 'moving'], tr: 'Evden Eve Nakliyat', en: 'Moving Company' },
  { match: ['kargo', 'lojistik', 'logistics', 'freight'], tr: 'Kargo ve Lojistik', en: 'Logistics & Freight' },
  { match: ['temizlik', 'cleaning'], tr: 'Temizlik Hizmetleri', en: 'Cleaning Services' },
  { match: ['kuru temizleme', 'çamaşır', 'camasir', 'laundry'], tr: 'Kuru Temizleme', en: 'Dry Cleaning' },
  { match: ['veteriner', 'veterinary', 'pet klinik'], tr: 'Veteriner Kliniği', en: 'Veterinary Clinic' },
  { match: ['yoga'], tr: 'Yoga Stüdyosu', en: 'Yoga Studio' },
  { match: ['pilates'], tr: 'Pilates Stüdyosu', en: 'Pilates Studio' },
  { match: ['spor salonu', 'fitness', 'gym'], tr: 'Spor Salonu', en: 'Fitness Studio' },
  { match: ['otel', 'hotel', 'pansiyon', 'konaklama'], tr: 'Otel ve Konaklama', en: 'Hotel & Accommodation' },
  { match: ['tur', 'seyahat', 'travel agency', 'acenta', 'acente'], tr: 'Tur ve Seyahat', en: 'Travel Agency' },
  { match: ['kurs', 'eğitim', 'egitim', 'akademi', 'dershane', 'academy'], tr: 'Eğitim ve Kurs', en: 'Training Academy' },
  { match: ['kreş', 'kres', 'anaokul', 'daycare', 'preschool'], tr: 'Kreş ve Anaokulu', en: 'Preschool & Daycare' },
  { match: ['tesisat', 'elektrik', 'su tesisat', 'kombi', 'plumbing', 'electrician'], tr: 'Tesisat ve Elektrik', en: 'Plumbing & Electrical' },
  { match: ['peyzaj', 'bahçe', 'bahce', 'landscap'], tr: 'Peyzaj ve Bahçe', en: 'Landscaping & Garden' },
  { match: ['mobilya', 'furniture', 'dekorasyon'], tr: 'Mobilya ve Dekorasyon', en: 'Furniture & Decoration' },
  { match: ['çiçek', 'cicek', 'flower', 'florist'], tr: 'Çiçekçi', en: 'Flower Shop' },
  { match: ['düğün', 'dugun', 'organizasyon', 'wedding', 'event'], tr: 'Düğün ve Organizasyon', en: 'Wedding & Events' },
  { match: ['catering', 'yemek servis'], tr: 'Catering Hizmetleri', en: 'Catering Services' },
  { match: ['pastane', 'fırın', 'firin', 'bakery', 'patisserie'], tr: 'Pastane ve Fırın', en: 'Bakery & Patisserie' },
  { match: ['eczane', 'pharmacy', 'medikal'], tr: 'Eczane ve Medikal', en: 'Pharmacy & Medical' },
  { match: ['fizyoterapi', 'diyetisyen', 'psikolog', 'terapi', 'therapy'], tr: 'Sağlık ve Terapi', en: 'Health & Therapy' },
  { match: ['berber', 'barber', 'erkek kuaför', 'erkek kuafor'], tr: 'Berber ve Erkek Kuaförü', en: 'Barbershop' },
  { match: ['kuyumcu', 'jewel', 'takı', 'taki'], tr: 'Kuyumcu ve Takı', en: 'Jewellery Store' },
  { match: ['gözlük', 'gozluk', 'optik', 'optic'], tr: 'Optik ve Gözlük', en: 'Optician & Eyewear' },
  { match: ['dövme', 'dovme', 'tattoo'], tr: 'Dövme Stüdyosu', en: 'Tattoo Studio' },
  { match: ['güvenlik', 'guvenlik', 'kamera sistem', 'alarm', 'security'], tr: 'Güvenlik Sistemleri', en: 'Security Systems' },
  { match: ['matbaa', 'tabela', 'baskı', 'baski', 'printing', 'signage'], tr: 'Matbaa ve Tabela', en: 'Printing & Signage' },
  { match: ['tekstil', 'terzi', 'textile', 'tailor'], tr: 'Tekstil ve Terzi', en: 'Textile & Tailoring' },
  { match: ['oto servis', 'oto tamir', 'lastik', 'kaporta', 'auto repair'], tr: 'Oto Servis ve Tamir', en: 'Auto Repair Service' },
  { match: ['araç kiralama', 'arac kiralama', 'rent a car', 'transfer', 'car rental'], tr: 'Araç Kiralama', en: 'Car Rental' },
  { match: ['sigorta', 'insurance'], tr: 'Sigorta Acentesi', en: 'Insurance Agency' },
  { match: ['muhasebe', 'accounting', 'mali müşavir', 'mali musavir'], tr: 'Muhasebe ve Mali Müşavirlik', en: 'Accounting Services' },
  { match: ['güneş enerji', 'gunes enerji', 'solar', 'enerji sistem'], tr: 'Güneş Enerjisi Sistemleri', en: 'Solar Energy Systems' },
  { match: ['asansör', 'asansor', 'elevator'], tr: 'Asansör Sistemleri', en: 'Elevator Systems' },
  { match: ['doğrama', 'dograma', 'pvc', 'pencere', 'window'], tr: 'PVC Kapı ve Pencere', en: 'Doors & Windows' },
  { match: ['mermer', 'granit', 'doğal taş', 'dogal tas', 'marble'], tr: 'Mermer ve Doğal Taş', en: 'Marble & Natural Stone' },
]

/** Cities worth putting in front of the keyword ("İstanbul Nakliyat"). */
const SEO_CITIES: { match: string[]; label: string }[] = [
  { match: ['istanbul'], label: 'İstanbul' },
  { match: ['ankara'], label: 'Ankara' },
  { match: ['izmir'], label: 'İzmir' },
  { match: ['bursa'], label: 'Bursa' },
  { match: ['antalya'], label: 'Antalya' },
  { match: ['adana'], label: 'Adana' },
  { match: ['konya'], label: 'Konya' },
  { match: ['kadıköy', 'kadikoy'], label: 'Kadıköy' },
  { match: ['beşiktaş', 'besiktas'], label: 'Beşiktaş' },
  { match: ['şişli', 'sisli'], label: 'Şişli' },
  { match: ['london'], label: 'London' },
  { match: ['paris'], label: 'Paris' },
  { match: ['berlin'], label: 'Berlin' },
  { match: ['new york', 'york'], label: 'New York' },
]

/**
 * Builds a keyword-first SEO title from the brief, e.g.
 * "İstanbul'da evden eve nakliyat sitesi" -> "İstanbul Evden Eve Nakliyat".
 * Never includes the brand name — the published `<title>` already prefixes it
 * as `Brand - SEO Title`.
 */
export function deriveSeoTitle(prompt: string, sector: Sector, lang: Lang): string {
  // Word-boundary matching (not plain includes): otherwise a short niche key
  // like "tur" matches inside "oluştur" and every site is titled
  // "Tur ve Seyahat".
  const niche = NICHE_SEO_KEYWORDS.find((n) => n.match.some((w) => wordIncludes(prompt, w)))
  const keyword = niche ? pickLang(niche, lang) : pickLang(SEO_KEYWORDS[sector], lang)
  const city = SEO_CITIES.find((c) => c.match.some((w) => wordIncludes(prompt, w)))
  return city ? `${city.label} ${keyword}` : keyword
}

/* -------------------------------------------------------------------------- */
/*  Content builders                                                          */
/* -------------------------------------------------------------------------- */

const YEAR = new Date().getFullYear()

function pick<T>(lang: Lang, tr: T, en: T): T {
  return lang === 'tr' ? tr : en
}

function footer(name: string, tagline: string): Extract<Sections[number], { type: 'footer' }> {
  return { type: 'footer', tagline, copyright: `© ${YEAR} ${name}` }
}

/**
 * Builds the full sector-specific site. Each branch returns navigation +
 * an ordered, realistic section list. Content is intentionally concrete
 * (real service names, real CTAs) rather than generic placeholders.
 */
export function buildSectorSite(
  prompt: string,
  lang: Lang,
): { name: string; seoTitle: string; build: SectorBuild } {
  const sector = detectSector(prompt)
  const { theme, typography } = THEMES[sector]
  const name = deriveBrandName(prompt, sector, lang)

  const build = BUILDERS[sector](name, lang)
  return {
    name,
    seoTitle: deriveSeoTitle(prompt, sector, lang),
    build: { theme, typography, ...build },
  }
}

/**
 * Sector-specific guidance injected into the AI system prompt so the model
 * produces a structure and palette that matches the detected business type —
 * the same intelligence the deterministic fallback uses, shared with the AI.
 */
const SECTOR_HINTS: Record<Sector, string> = {
  dental: 'a dental / clinic site: calm clinical blues/teals, reassuring tone. Recommended sections: hero, stats, services, features, team (doctors), testimonials, faq, contact. Add a booking CTA.',
  food: 'a restaurant / cafe site: warm, appetizing palette, elegant serif headings. Recommended sections: hero, about, gallery (dishes/space), services (menu highlights), stats, testimonials, contact. Add a reservation CTA.',
  law: 'a law / finance / consulting site: dark, authoritative navy/gold, serious tone. Recommended sections: hero, stats, services (practice areas), process, about, team, testimonials, contact.',
  architecture: 'an architecture / construction / design studio: minimal, editorial, monochrome with one accent, sharp corners. Recommended sections: hero, portfolio (projects), process, services, about, team, contact.',
  beauty: 'a beauty / salon / spa site: soft, premium, elegant palette. Recommended sections: hero, services (treatments), gallery, pricing, testimonials, team, contact. Add a booking CTA.',
  tech: 'a tech / SaaS / agency site: modern, futuristic dark UI with a vivid accent. Recommended sections: hero, features, stats, services, pricing, testimonials, faq, cta.',
  ecommerce:
    'a real ONLINE STORE / e-commerce site (products + shopping cart + checkout), NOT a corporate brochure. ' +
    'Use a bold, product-forward palette. Produce the full storefront structure IN THIS ORDER: ' +
    'a "slider" hero (rotating campaign/season slides), a "categories" section (shop by category), ' +
    'a "products" section of featured/best-selling products (real names, prices, an oldPrice + badge on ' +
    'discounted items, and a "Sepete Ekle" buttonText), a "features" section of trust badges ' +
    '(fast shipping, easy returns, secure payment, support), a "stats" section, a second "products" ' +
    'section for weekly deals (layout "carousel"), "testimonials", "faq" (shipping/returns/payment) and a ' +
    'closing "cta". Include a "products" page in pages. Every product/category needs a descriptive imagePrompt.',
  photography: 'a photography / studio site: image-led, minimal, dark or neutral. Recommended sections: hero, portfolio, gallery, about, pricing (packages), testimonials, contact.',
  automotive: 'a car dealership / auto gallery site: premium, sleek, dark showroom aesthetic with a bold accent. Use a full-bleed hero (showcase or slider) featuring luxury/premium vehicles. Recommended sections: hero, stats, gallery (featured vehicles / stock), services (financing, trade-in, warranty), features (why buy from us), process (buying steps), testimonials, faq, contact, cta. Add a "browse inventory" and "book a test drive" CTA.',
  realestate: 'a real estate agency site: modern, trustworthy, premium dark palette with a vivid accent. Use a full-bleed hero (showcase) featuring a premium property. Recommended sections: hero, stats, gallery (featured listings with price captions), services (buy, sell, rent, consulting), features (why work with us), testimonials, contact. Add "browse listings" and "book a viewing" CTAs.',
  default: 'a general business site: modern, clean, trustworthy. Recommended sections: hero, features, stats, services, about, testimonials, faq, contact, cta.',
}

/**
 * Sector guidance for the AI system prompt. When the brief names a specific
 * business the coarse `Sector` list cannot express (nakliyat, temizlik,
 * veteriner, tesisat, …), the resolved visual topic is appended so the model
 * writes an ON-TOPIC hero `imagePrompt` instead of a generic office scene.
 */
export function sectorPromptHint(prompt: string): string {
  const base = SECTOR_HINTS[detectSector(prompt)]
  const topic = resolveVisualTopic(prompt)
  if (!topic) return base
  return (
    `${base} This is specifically a ${topic.business}: every image prompt must depict ` +
    `that real-world activity — for the hero use exactly this scene: "${topic.subject}". ` +
    `Never use unrelated stock scenery (landscapes, empty offices) for this business.`
  )
}

type Builder = (name: string, lang: Lang) => Omit<SectorBuild, 'theme' | 'typography'>

/* ------------------------------- Dental ---------------------------------- */

const dental: Builder = (name, lang) => {
  const tr = lang === 'tr'
  return {
    meta: {
      tagline: pick(lang, 'Sağlıklı gülüşler için modern diş hekimliği', 'Modern dentistry for healthy smiles'),
      tone: pick(lang, 'Premium, temiz, güven veren', 'Premium, clean, reassuring'),
      audience: pick(lang, 'Estetik ve sağlıklı bir gülüş isteyen hastalar', 'Patients seeking a healthy, beautiful smile'),
    },
    navigation: {
      logoText: name,
      links: [
        { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
        { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
        { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
        { label: pick(lang, 'Doktorlarımız', 'Our Doctors'), href: '#team' },
        { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
      ],
      cta: { label: pick(lang, 'Randevu Al', 'Book Appointment'), href: '#contact' },
    },
    pages: [
      { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
      { slug: 'services', title: pick(lang, 'Hizmetler', 'Services') },
      { slug: 'doctors', title: pick(lang, 'Doktorlar', 'Doctors') },
      { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
    ],
    sections: [
      {
        type: 'hero',
        variant: 'split',
        badge: pick(lang, 'Ağız ve Diş Sağlığı Kliniği', 'Oral & Dental Health Clinic'),
        title: pick(lang, `${name} ile sağlıklı ve estetik gülüşler`, `Healthy, beautiful smiles with ${name}`),
        description: pick(
          lang,
          'Son teknoloji cihazlar ve uzman hekim kadromuzla, ağrısız ve konforlu tedavi deneyimi sunuyoruz.',
          'With state-of-the-art technology and expert dentists, we deliver painless, comfortable treatment.',
        ),
        primaryButton: { label: pick(lang, 'Randevu Al', 'Book Appointment'), href: '#contact' },
        secondaryButton: { label: pick(lang, 'Hizmetleri İncele', 'View Services'), href: '#services' },
        trustText: pick(lang, '15.000+ mutlu hasta • %98 memnuniyet', '15,000+ happy patients • 98% satisfaction'),
        image: {
          imagePrompt: 'A bright, modern dental clinic interior with a smiling patient',
          alt: pick(lang, 'Modern diş kliniği', 'Modern dental clinic'),
          aspectRatio: '4/3',
        },
      },
      {
        type: 'stats',
        title: pick(lang, 'Rakamlarla biz', 'By the numbers'),
        items: [
          { value: '20+', label: pick(lang, 'Yıllık deneyim', 'Years of experience'), icon: 'calendar' },
          { value: '15K+', label: pick(lang, 'Mutlu hasta', 'Happy patients'), icon: 'smile' },
          { value: '%98', label: pick(lang, 'Memnuniyet', 'Satisfaction'), icon: 'heart' },
          { value: '8', label: pick(lang, 'Uzman hekim', 'Specialist dentists'), icon: 'stethoscope' },
        ],
      },
      {
        type: 'services',
        title: pick(lang, 'Tedavi ve hizmetlerimiz', 'Our treatments & services'),
        subtitle: pick(lang, 'Her ihtiyaca yönelik uzman çözümler', 'Expert solutions for every need'),
        items: [
          { title: pick(lang, 'İmplant Tedavisi', 'Dental Implants'), description: pick(lang, 'Eksik dişler için kalıcı ve doğal görünümlü çözümler.', 'Permanent, natural-looking solutions for missing teeth.'), icon: 'anchor' },
          { title: pick(lang, 'Zirkonyum Kaplama', 'Zirconium Crowns'), description: pick(lang, 'Doğal diş görünümünde estetik ve dayanıklı kaplamalar.', 'Aesthetic, durable crowns with a natural look.'), icon: 'gem' },
          { title: pick(lang, 'Diş Beyazlatma', 'Teeth Whitening'), description: pick(lang, 'Güvenli yöntemlerle birkaç ton daha beyaz dişler.', 'Several shades whiter with safe, proven methods.'), icon: 'sparkles' },
          { title: pick(lang, 'Gülüş Tasarımı', 'Smile Design'), description: pick(lang, 'Yüz hatlarınıza özel, kişiye uygun gülüş planlaması.', 'A smile plan tailored to your facial features.'), icon: 'smile' },
          { title: pick(lang, 'Ortodonti', 'Orthodontics'), description: pick(lang, 'Şeffaf plak ve tel tedavileriyle düzgün dişler.', 'Straight teeth with clear aligners and braces.'), icon: 'align-center' },
          { title: pick(lang, 'Kanal Tedavisi', 'Root Canal'), description: pick(lang, 'Ağrısız tekniklerle dişinizi kurtaran tedaviler.', 'Painless techniques that save your natural tooth.'), icon: 'activity' },
        ],
      },
      {
        type: 'process',
        title: pick(lang, 'Tedavi süreci', 'Your treatment journey'),
        subtitle: pick(lang, 'İlk temastan gülüşünüze kadar 4 adım', 'Four steps from first contact to your new smile'),
        steps: [
          { title: pick(lang, 'Randevu', 'Appointment'), description: pick(lang, 'Size uygun gün ve saatte kolayca randevu oluşturun.', 'Book easily at a time that suits you.'), icon: 'calendar-check' },
          { title: pick(lang, 'Muayene', 'Examination'), description: pick(lang, 'Dijital röntgen ve detaylı ağız içi muayene.', 'Digital X-rays and a detailed oral exam.'), icon: 'search' },
          { title: pick(lang, 'Tedavi Planı', 'Treatment Plan'), description: pick(lang, 'Size özel, şeffaf fiyatlı bir tedavi planı.', 'A personalized plan with transparent pricing.'), icon: 'clipboard-list' },
          { title: pick(lang, 'Tedavi', 'Treatment'), description: pick(lang, 'Konforlu ortamda uzman hekimlerle tedavi.', 'Treatment with expert dentists in comfort.'), icon: 'check-circle' },
        ],
      },
      {
        type: 'team',
        title: pick(lang, 'Uzman hekim kadromuz', 'Our specialist dentists'),
        subtitle: pick(lang, 'Alanında deneyimli, güler yüzlü ekip', 'An experienced, friendly team'),
        members: [
          { name: pick(lang, 'Dr. Elif Yılmaz', 'Dr. Elif Yilmaz'), role: pick(lang, 'İmplantoloji', 'Implantology'), imagePrompt: 'Professional female dentist portrait' },
          { name: pick(lang, 'Dr. Mert Demir', 'Dr. Mert Demir'), role: pick(lang, 'Ortodonti', 'Orthodontics'), imagePrompt: 'Professional male dentist portrait' },
          { name: pick(lang, 'Dr. Ayşe Kaya', 'Dr. Ayse Kaya'), role: pick(lang, 'Estetik Diş Hekimliği', 'Cosmetic Dentistry'), imagePrompt: 'Professional female dentist portrait smiling' },
        ],
      },
      {
        type: 'testimonials',
        title: pick(lang, 'Hastalarımız ne diyor?', 'What our patients say'),
        items: [
          { quote: pick(lang, 'İmplant tedavim boyunca hiç ağrı hissetmedim, sonuç mükemmel.', 'I felt no pain during my implant treatment and the result is perfect.'), author: 'Serkan A.', role: pick(lang, 'İmplant hastası', 'Implant patient') },
          { quote: pick(lang, 'Gülüş tasarımından sonra özgüvenim tamamen değişti.', 'My confidence completely changed after the smile design.'), author: 'Deniz K.', role: pick(lang, 'Gülüş tasarımı', 'Smile design') },
        ],
      },
      {
        type: 'faq',
        title: pick(lang, 'Sıkça sorulan sorular', 'Frequently asked questions'),
        items: [
          { question: pick(lang, 'Tedavi ağrılı mı?', 'Is the treatment painful?'), answer: pick(lang, 'Modern anestezi ve tekniklerle işlemler ağrısız şekilde yapılır.', 'With modern anesthesia and techniques, procedures are painless.') },
          { question: pick(lang, 'Randevu nasıl alabilirim?', 'How do I book an appointment?'), answer: pick(lang, 'İletişim formundan veya telefonla hemen randevu oluşturabilirsiniz.', 'You can book instantly via the contact form or by phone.') },
          { question: pick(lang, 'Taksit imkanı var mı?', 'Do you offer installments?'), answer: pick(lang, 'Tedavilerde esnek ödeme ve taksit seçenekleri sunuyoruz.', 'We offer flexible payment and installment options.') },
        ],
      },
      {
        type: 'cta',
        title: pick(lang, 'Yeni gülüşünüz bir randevu uzağınızda', 'Your new smile is one appointment away'),
        description: pick(lang, 'Ücretsiz ön muayene için hemen randevu alın.', 'Book now for a free initial consultation.'),
        primaryButton: { label: pick(lang, 'Randevu Al', 'Book Appointment'), href: '#contact' },
        secondaryButton: { label: pick(lang, 'WhatsApp\'tan Yaz', 'Message on WhatsApp'), href: '#contact' },
      },
      {
        type: 'contact',
        title: pick(lang, 'Bize ulaşın', 'Get in touch'),
        description: pick(lang, 'Sorularınız için buradayız. Size en kısa sürede dönüş yapıyoruz.', 'We are here for your questions and respond promptly.'),
        email: 'randevu@dentaestetik.com',
        phone: '+90 212 000 00 00',
        address: pick(lang, 'Bağdat Cad. No:100, İstanbul', 'Bagdat Ave. No:100, Istanbul'),
        fields: [pick(lang, 'Ad Soyad', 'Full Name'), pick(lang, 'Telefon', 'Phone'), pick(lang, 'Mesaj', 'Message')],
      },
      footer(name, pick(lang, 'Sağlıklı gülüşler için modern diş hekimliği.', 'Modern dentistry for healthy smiles.')),
    ],
  }
}

/* -------------------------------- Food ------------------------------------ */

const food: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Taze çekirdekler, sıcak bir atmosfer', 'Fresh beans, a warm atmosphere'),
    tone: pick(lang, 'Sıcak, davetkar, iştah açıcı', 'Warm, inviting, appetizing'),
    audience: pick(lang, 'İyi kahve ve keyifli mekan arayanlar', 'People seeking great coffee and a cozy space'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Menü', 'Menu'), href: '#services' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'Galeri', 'Gallery'), href: '#gallery' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Rezervasyon', 'Reserve'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'menu', title: pick(lang, 'Menü', 'Menu') },
    { slug: 'gallery', title: pick(lang, 'Galeri', 'Gallery') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'showcase',
      badge: pick(lang, 'Üçüncü Nesil Kahve', 'Third Wave Coffee'),
      title: pick(lang, `${name}`, `${name}`),
      description: pick(
        lang,
        'Özenle kavrulmuş çekirdekler, ustaların elinden geçen demleme ve sıcacık bir mekan sizi bekliyor.',
        'Carefully roasted beans, barista-crafted brews and a cozy space await you.',
      ),
      primaryButton: { label: pick(lang, 'Menüye Göz At', 'View Menu'), href: '#services' },
      secondaryButton: { label: pick(lang, 'Rezervasyon Yap', 'Make a Reservation'), href: '#contact' },
      trustText: pick(lang, 'Her gün taze kavrum • Kadıköy', 'Roasted fresh daily • Kadikoy'),
      image: {
        imagePrompt: 'A warm, cozy specialty coffee shop interior with latte art on the counter',
        alt: pick(lang, 'Sıcak kahve dükkanı iç mekanı', 'Cozy coffee shop interior'),
        aspectRatio: '4/3',
      },
    },
    {
      type: 'about',
      title: pick(lang, 'Hikayemiz', 'Our story'),
      body: pick(
        lang,
        `${name}, kahveyi bir tutku olarak görüyor. Doğrudan üreticiden aldığımız çekirdekleri kendi atölyemizde kavuruyor, her fincanı özenle hazırlıyoruz.`,
        `${name} treats coffee as a craft. We source beans directly from farmers, roast in-house, and prepare every cup with care.`,
      ),
      highlights: [
        pick(lang, 'Doğrudan üreticiden çekirdek', 'Direct-trade beans'),
        pick(lang, 'Günlük taze kavrum', 'Roasted fresh daily'),
        pick(lang, 'Uzman barista ekibi', 'Expert barista team'),
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Menümüzden seçkiler', 'Menu highlights'),
      subtitle: pick(lang, 'En sevilen lezzetlerimiz', 'Our most-loved picks'),
      items: [
        { title: pick(lang, 'Espresso Bazlı', 'Espresso Based'), description: pick(lang, 'Latte, cappuccino, flat white ve daha fazlası.', 'Latte, cappuccino, flat white and more.'), icon: 'coffee' },
        { title: pick(lang, 'Filtre Kahve', 'Filter Coffee'), description: pick(lang, 'V60, Chemex ve Aeropress ile demleme.', 'Brewed with V60, Chemex and Aeropress.'), icon: 'filter' },
        { title: pick(lang, 'Tatlılar', 'Desserts'), description: pick(lang, 'Günlük taze pasta, cheesecake ve kurabiyeler.', 'Freshly baked cakes, cheesecake and cookies.'), icon: 'cake' },
        { title: pick(lang, 'Kahvaltı', 'Breakfast'), description: pick(lang, 'Serpme kahvaltı ve enfes brunch tabakları.', 'Generous breakfasts and delicious brunch plates.'), icon: 'egg-fried' },
      ],
    },
    {
      type: 'gallery',
      title: pick(lang, 'Mekandan kareler', 'From our space'),
      subtitle: pick(lang, 'Atmosferimize göz atın', 'A look at our atmosphere'),
      items: [
        { imagePrompt: 'Latte art in a ceramic cup on a wooden table', caption: pick(lang, 'Barista işçiliği', 'Barista craft'), aspectRatio: '4/3' },
        { imagePrompt: 'Cozy coffee shop seating with warm light', caption: pick(lang, 'Oturma alanı', 'Seating area'), aspectRatio: '4/3' },
        { imagePrompt: 'Coffee beans being roasted', caption: pick(lang, 'Kavurma atölyesi', 'Roastery'), aspectRatio: '4/3' },
        { imagePrompt: 'Freshly baked pastries on display', caption: pick(lang, 'Tatlı vitrini', 'Pastry case'), aspectRatio: '4/3' },
      ],
    },
    {
      type: 'stats',
      items: [
        { value: '2019', label: pick(lang, 'Kuruluş', 'Est.'), icon: 'calendar' },
        { value: '30+', label: pick(lang, 'Kahve çeşidi', 'Coffee varieties'), icon: 'coffee' },
        { value: '4.9', label: pick(lang, 'Google puanı', 'Google rating'), icon: 'star' },
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Misafirlerimiz', 'Our guests'),
      items: [
        { quote: pick(lang, 'Şehrin en iyi flat white\'ı burada. Atmosferi de harika.', 'Best flat white in the city, and the atmosphere is wonderful.'), author: 'Ceren T.' },
        { quote: pick(lang, 'Çalışmak için ideal, kahvesi bir başka.', 'Perfect for working and the coffee is exceptional.'), author: 'Baran E.' },
      ],
    },
    {
      type: 'contact',
      title: pick(lang, 'Rezervasyon & iletişim', 'Reservations & contact'),
      description: pick(lang, 'Masa ayırtmak veya sorularınız için bize yazın.', 'Reserve a table or reach out with any questions.'),
      email: 'merhaba@kahveduragi.com',
      phone: '+90 216 000 00 00',
      address: pick(lang, 'Moda Cad. No:12, Kadıköy', 'Moda Ave. No:12, Kadikoy'),
      fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'Kişi Sayısı', 'Party Size'), pick(lang, 'Tarih & Saat', 'Date & Time')],
    },
    footer(name, pick(lang, 'Taze çekirdekler, sıcak bir atmosfer.', 'Fresh beans, a warm atmosphere.')),
  ],
})

/* -------------------------------- Law ------------------------------------- */

const law: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Haklarınızı güçlü bir şekilde savunuyoruz', 'Defending your rights with strength'),
    tone: pick(lang, 'Kurumsal, güven veren, ciddi', 'Corporate, trustworthy, serious'),
    audience: pick(lang, 'Hukuki danışmanlık arayan birey ve şirketler', 'Individuals and companies seeking legal counsel'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'Çalışma Alanları', 'Practice Areas'), href: '#services' },
      { label: pick(lang, 'Ekip', 'Team'), href: '#team' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Danışmanlık Al', 'Request Consultation'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'practice', title: pick(lang, 'Çalışma Alanları', 'Practice Areas') },
    { slug: 'team', title: pick(lang, 'Ekip', 'Team') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'split',
      badge: pick(lang, 'Hukuk & Danışmanlık Bürosu', 'Law & Advisory Firm'),
      title: pick(lang, `${name} — güvenilir hukuki çözüm ortağınız`, `${name} — your trusted legal partner`),
      description: pick(
        lang,
        'Ticaret hukukundan aile hukukuna kadar geniş bir yelpazede, sonuç odaklı ve etik hukuki danışmanlık sunuyoruz.',
        'From commercial to family law, we provide results-driven, ethical legal counsel across a broad range of areas.',
      ),
      primaryButton: { label: pick(lang, 'Danışmanlık Al', 'Request Consultation'), href: '#contact' },
      secondaryButton: { label: pick(lang, 'Çalışma Alanları', 'Practice Areas'), href: '#services' },
      trustText: pick(lang, '25 yıllık deneyim • 1.200+ dava', '25 years of experience • 1,200+ cases'),
      image: {
        imagePrompt: 'An elegant law office with bookshelves and a city view',
        alt: pick(lang, 'Hukuk bürosu', 'Law office'),
        aspectRatio: '4/3',
      },
    },
    {
      type: 'stats',
      items: [
        { value: '25+', label: pick(lang, 'Yıllık deneyim', 'Years of experience'), icon: 'scale' },
        { value: '1.2K+', label: pick(lang, 'Sonuçlanan dava', 'Resolved cases'), icon: 'gavel' },
        { value: '%94', label: pick(lang, 'Başarı oranı', 'Success rate'), icon: 'trophy' },
        { value: '6', label: pick(lang, 'Uzman avukat', 'Expert lawyers'), icon: 'users' },
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Çalışma alanlarımız', 'Our practice areas'),
      subtitle: pick(lang, 'Uzmanlaştığımız başlıca hukuk dalları', 'The main areas we specialize in'),
      items: [
        { title: pick(lang, 'Ticaret Hukuku', 'Commercial Law'), description: pick(lang, 'Şirketler, sözleşmeler ve ticari uyuşmazlıklar.', 'Companies, contracts and commercial disputes.'), icon: 'briefcase' },
        { title: pick(lang, 'Aile Hukuku', 'Family Law'), description: pick(lang, 'Boşanma, velayet ve nafaka süreçleri.', 'Divorce, custody and alimony matters.'), icon: 'heart-handshake' },
        { title: pick(lang, 'İş Hukuku', 'Labor Law'), description: pick(lang, 'İşçi-işveren uyuşmazlıkları ve tazminat.', 'Employer-employee disputes and compensation.'), icon: 'hard-hat' },
        { title: pick(lang, 'Gayrimenkul Hukuku', 'Real Estate Law'), description: pick(lang, 'Tapu, kira ve mülkiyet uyuşmazlıkları.', 'Title, lease and property disputes.'), icon: 'building' },
        { title: pick(lang, 'Ceza Hukuku', 'Criminal Law'), description: pick(lang, 'Soruşturma ve kovuşturma süreçlerinde savunma.', 'Defense across investigation and prosecution.'), icon: 'shield' },
        { title: pick(lang, 'Fikri Mülkiyet', 'Intellectual Property'), description: pick(lang, 'Marka, patent ve telif hakkı koruması.', 'Trademark, patent and copyright protection.'), icon: 'copyright' },
      ],
    },
    {
      type: 'process',
      title: pick(lang, 'Çalışma sürecimiz', 'How we work'),
      steps: [
        { title: pick(lang, 'İlk Görüşme', 'Initial Meeting'), description: pick(lang, 'Durumunuzu dinler, hukuki değerlendirme yaparız.', 'We listen and provide a legal assessment.'), icon: 'message-square' },
        { title: pick(lang, 'Strateji', 'Strategy'), description: pick(lang, 'Size özel, net bir yol haritası oluştururuz.', 'We build a clear, tailored roadmap.'), icon: 'map' },
        { title: pick(lang, 'Temsil', 'Representation'), description: pick(lang, 'Sürecin her aşamasında yanınızda oluruz.', 'We stand with you at every stage.'), icon: 'scale' },
      ],
    },
    {
      type: 'team',
      title: pick(lang, 'Avukatlarımız', 'Our lawyers'),
      members: [
        { name: pick(lang, 'Av. Kaan Öztürk', 'Kaan Ozturk, Esq.'), role: pick(lang, 'Kurucu Ortak', 'Founding Partner'), imagePrompt: 'Professional male lawyer portrait in a suit' },
        { name: pick(lang, 'Av. Selin Aydın', 'Selin Aydin, Esq.'), role: pick(lang, 'Ticaret Hukuku', 'Commercial Law'), imagePrompt: 'Professional female lawyer portrait in a suit' },
        { name: pick(lang, 'Av. Emre Şahin', 'Emre Sahin, Esq.'), role: pick(lang, 'Ceza Hukuku', 'Criminal Law'), imagePrompt: 'Professional male lawyer portrait' },
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Müvekkillerimiz', 'Our clients'),
      items: [
        { quote: pick(lang, 'Ticari davamızı büyük bir titizlikle takip ettiler ve kazandık.', 'They handled our commercial case meticulously and we won.'), author: pick(lang, 'A. Yıldırım', 'A. Yildirim'), role: pick(lang, 'Şirket sahibi', 'Business owner') },
        { quote: pick(lang, 'Her adımda bilgilendirildim, kendimi güvende hissettim.', 'I was informed at every step and felt secure.'), author: 'M. Demir' },
      ],
    },
    {
      type: 'cta',
      title: pick(lang, 'Hukuki desteğe mi ihtiyacınız var?', 'Need legal support?'),
      description: pick(lang, 'İlk görüşme için hemen randevu oluşturun.', 'Schedule your first consultation today.'),
      primaryButton: { label: pick(lang, 'Danışmanlık Al', 'Request Consultation'), href: '#contact' },
    },
    {
      type: 'contact',
      title: pick(lang, 'İletişim', 'Contact'),
      description: pick(lang, 'Gizlilik ilkesiyle, sorularınızı yanıtlıyoruz.', 'We answer your questions in strict confidence.'),
      email: 'info@adalethukuk.com',
      phone: '+90 212 000 00 00',
      address: pick(lang, 'Levent Mah. No:5, İstanbul', 'Levent Dist. No:5, Istanbul'),
      fields: [pick(lang, 'Ad Soyad', 'Full Name'), pick(lang, 'E-posta', 'Email'), pick(lang, 'Konu', 'Subject'), pick(lang, 'Mesaj', 'Message')],
    },
    footer(name, pick(lang, 'Haklarınızı güçlü bir şekilde savunuyoruz.', 'Defending your rights with strength.')),
  ],
})

/* --------------------------- Architecture --------------------------------- */

const architecture: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Mekanı yeniden düşünen mimari tasarım', 'Architecture that rethinks space'),
    tone: pick(lang, 'Güçlü, modern, mimari', 'Strong, modern, architectural'),
    audience: pick(lang, 'Konut ve ticari projeler için mimari arayanlar', 'Clients seeking residential and commercial architecture'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Projeler', 'Projects'), href: '#portfolio' },
      { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
      { label: pick(lang, 'Stüdyo', 'Studio'), href: '#team' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Teklif Al', 'Request a Quote'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'projects', title: pick(lang, 'Projeler', 'Projects') },
    { slug: 'studio', title: pick(lang, 'Stüdyo', 'Studio') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'showcase',
      badge: pick(lang, 'Mimarlık & İç Mimarlık Ofisi', 'Architecture & Interior Studio'),
      title: pick(lang, `${name}`, `${name}`),
      description: pick(
        lang,
        'İşlevi ve estetiği bir araya getiren, ışığı ve malzemeyi ustalıkla kullanan mimari projeler tasarlıyoruz.',
        'We design architecture that unites function and aesthetics, mastering light and material.',
      ),
      primaryButton: { label: pick(lang, 'Projeleri Gör', 'View Projects'), href: '#portfolio' },
      secondaryButton: { label: pick(lang, 'Teklif Al', 'Request a Quote'), href: '#contact' },
      trustText: pick(lang, '120+ tamamlanmış proje • Ulusal ödüller', '120+ completed projects • National awards'),
      image: {
        imagePrompt: 'A striking modern architectural building with concrete and glass, dramatic light',
        alt: pick(lang, 'Modern mimari yapı', 'Modern architecture'),
        aspectRatio: '16/9',
      },
    },
    {
      type: 'stats',
      items: [
        { value: '120+', label: pick(lang, 'Tamamlanan proje', 'Completed projects'), icon: 'building-2' },
        { value: '18', label: pick(lang, 'Yıllık deneyim', 'Years of experience'), icon: 'ruler' },
        { value: '9', label: pick(lang, 'Ulusal ödül', 'National awards'), icon: 'award' },
      ],
    },
    {
      type: 'portfolio',
      title: pick(lang, 'Seçili projeler', 'Selected projects'),
      subtitle: pick(lang, 'Konut, ticari ve kamusal yapılar', 'Residential, commercial and public works'),
      items: [
        { title: pick(lang, 'Sahil Villası', 'Coastal Villa'), category: pick(lang, 'Konut', 'Residential'), imagePrompt: 'Minimalist coastal villa with large glass windows' },
        { title: pick(lang, 'Şehir Ofisi', 'Urban Office'), category: pick(lang, 'Ticari', 'Commercial'), imagePrompt: 'Modern office building facade with clean lines' },
        { title: pick(lang, 'Kültür Merkezi', 'Culture Center'), category: pick(lang, 'Kamusal', 'Public'), imagePrompt: 'Contemporary culture center with concrete forms' },
        { title: pick(lang, 'Loft Daire', 'Loft Apartment'), category: pick(lang, 'İç Mimarlık', 'Interior'), imagePrompt: 'Industrial loft interior with warm materials' },
        { title: pick(lang, 'Butik Otel', 'Boutique Hotel'), category: pick(lang, 'Konaklama', 'Hospitality'), imagePrompt: 'Boutique hotel lobby with dramatic lighting' },
        { title: pick(lang, 'Bahçe Evi', 'Garden House'), category: pick(lang, 'Konut', 'Residential'), imagePrompt: 'Modern house integrated with a lush garden' },
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Hizmetlerimiz', 'Our services'),
      items: [
        { title: pick(lang, 'Mimari Tasarım', 'Architectural Design'), description: pick(lang, 'Konsept ve uygulama projeleri.', 'Concept and construction documentation.'), icon: 'pen-tool' },
        { title: pick(lang, 'İç Mimarlık', 'Interior Design'), description: pick(lang, 'Mekan, malzeme ve mobilya tasarımı.', 'Space, material and furniture design.'), icon: 'sofa' },
        { title: pick(lang, '3B Görselleştirme', '3D Visualization'), description: pick(lang, 'Gerçekçi render ve tur sunumları.', 'Photoreal renders and walkthroughs.'), icon: 'box' },
        { title: pick(lang, 'Proje Yönetimi', 'Project Management'), description: pick(lang, 'Uygulama ve şantiye takibi.', 'Construction and site supervision.'), icon: 'clipboard-check' },
      ],
    },
    {
      type: 'process',
      title: pick(lang, 'Tasarım süreci', 'Design process'),
      steps: [
        { title: pick(lang, 'Keşif', 'Discovery'), description: pick(lang, 'İhtiyaç, arsa ve bütçe analizi.', 'Needs, site and budget analysis.'), icon: 'compass' },
        { title: pick(lang, 'Konsept', 'Concept'), description: pick(lang, 'Eskiz ve 3B konsept çalışmaları.', 'Sketches and 3D concept studies.'), icon: 'lightbulb' },
        { title: pick(lang, 'Uygulama', 'Documentation'), description: pick(lang, 'Detaylı uygulama projeleri.', 'Detailed construction drawings.'), icon: 'file-text' },
        { title: pick(lang, 'İnşa', 'Build'), description: pick(lang, 'Şantiye takibi ve teslim.', 'Site supervision and delivery.'), icon: 'hammer' },
      ],
    },
    {
      type: 'cta',
      title: pick(lang, 'Projenizi birlikte tasarlayalım', 'Let us design your project together'),
      description: pick(lang, 'Fikrinizi anlatın, size özel bir teklif hazırlayalım.', 'Tell us your idea and we will prepare a tailored proposal.'),
      primaryButton: { label: pick(lang, 'Teklif Al', 'Request a Quote'), href: '#contact' },
    },
    {
      type: 'contact',
      title: pick(lang, 'İletişim', 'Contact'),
      email: 'studio@atolyemimarlik.com',
      phone: '+90 212 000 00 00',
      address: pick(lang, 'Karaköy, İstanbul', 'Karakoy, Istanbul'),
      fields: [pick(lang, 'Ad Soyad', 'Full Name'), pick(lang, 'E-posta', 'Email'), pick(lang, 'Proje Türü', 'Project Type'), pick(lang, 'Mesaj', 'Message')],
    },
    footer(name, pick(lang, 'Mekanı yeniden düşünen mimari tasarım.', 'Architecture that rethinks space.')),
  ],
})

/* ------------------------------- Beauty ----------------------------------- */

const beauty: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Güzelliğinize özenle dokunuyoruz', 'A refined touch for your beauty'),
    tone: pick(lang, 'Premium, zarif, görsel', 'Premium, elegant, visual'),
    audience: pick(lang, 'Bakım ve güzellik hizmeti arayan misafirler', 'Guests seeking beauty and wellness care'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
      { label: pick(lang, 'Galeri', 'Gallery'), href: '#gallery' },
      { label: pick(lang, 'Fiyatlar', 'Pricing'), href: '#pricing' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Randevu Al', 'Book Now'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'services', title: pick(lang, 'Hizmetler', 'Services') },
    { slug: 'pricing', title: pick(lang, 'Fiyatlar', 'Pricing') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'showcase',
      badge: pick(lang, 'Güzellik & Bakım Merkezi', 'Beauty & Wellness Center'),
      title: pick(lang, `${name} ile kendinize zaman ayırın`, `Make time for yourself at ${name}`),
      description: pick(
        lang,
        'Cilt bakımından saç tasarımına, uzman ekibimizle sizi yenileyen premium bir bakım deneyimi sunuyoruz.',
        'From skincare to hair styling, our experts offer a premium, rejuvenating experience.',
      ),
      primaryButton: { label: pick(lang, 'Randevu Al', 'Book Now'), href: '#contact' },
      secondaryButton: { label: pick(lang, 'Hizmetleri Gör', 'View Services'), href: '#services' },
      trustText: pick(lang, '10.000+ mutlu misafir • Uzman ekip', '10,000+ happy guests • Expert team'),
      image: {
        imagePrompt: 'An elegant, softly lit beauty salon interior',
        alt: pick(lang, 'Güzellik merkezi', 'Beauty salon'),
        aspectRatio: '4/3',
      },
    },
    {
      type: 'services',
      title: pick(lang, 'Hizmetlerimiz', 'Our services'),
      subtitle: pick(lang, 'Baştan ayağa bakım', 'Head-to-toe care'),
      items: [
        { title: pick(lang, 'Cilt Bakımı', 'Skincare'), description: pick(lang, 'Kişiye özel yüz bakımı ve peeling.', 'Personalized facials and peels.'), icon: 'sparkles' },
        { title: pick(lang, 'Saç Tasarımı', 'Hair Styling'), description: pick(lang, 'Kesim, boya ve bakım uygulamaları.', 'Cuts, color and treatments.'), icon: 'scissors' },
        { title: pick(lang, 'Makyaj', 'Makeup'), description: pick(lang, 'Gündüz, gece ve özel gün makyajı.', 'Day, night and special-occasion makeup.'), icon: 'brush' },
        { title: pick(lang, 'Manikür & Pedikür', 'Mani & Pedi'), description: pick(lang, 'Bakımlı eller ve ayaklar.', 'Beautifully groomed hands and feet.'), icon: 'hand' },
        { title: pick(lang, 'Masaj & Spa', 'Massage & Spa'), description: pick(lang, 'Rahatlatıcı masaj ve spa ritüelleri.', 'Relaxing massage and spa rituals.'), icon: 'flower' },
        { title: pick(lang, 'Kaş & Kirpik', 'Brows & Lashes'), description: pick(lang, 'Kaş tasarımı ve kirpik lifting.', 'Brow shaping and lash lifting.'), icon: 'eye' },
      ],
    },
    {
      type: 'gallery',
      title: pick(lang, 'Çalışmalarımız', 'Our work'),
      items: [
        { imagePrompt: 'Elegant hair styling result', caption: pick(lang, 'Saç tasarımı', 'Hair styling'), aspectRatio: '3/4' },
        { imagePrompt: 'Glowing skin after facial treatment', caption: pick(lang, 'Cilt bakımı', 'Skincare'), aspectRatio: '3/4' },
        { imagePrompt: 'Beautiful bridal makeup', caption: pick(lang, 'Makyaj', 'Makeup'), aspectRatio: '3/4' },
        { imagePrompt: 'Manicure with soft neutral colors', caption: pick(lang, 'Manikür', 'Manicure'), aspectRatio: '3/4' },
      ],
    },
    {
      type: 'stats',
      items: [
        { value: '10K+', label: pick(lang, 'Mutlu misafir', 'Happy guests'), icon: 'users' },
        { value: '4.9', label: pick(lang, 'Ortalama puan', 'Average rating'), icon: 'star' },
        { value: '12', label: pick(lang, 'Uzman', 'Specialists'), icon: 'heart' },
      ],
    },
    {
      type: 'pricing',
      title: pick(lang, 'Paketlerimiz', 'Our packages'),
      subtitle: pick(lang, 'Size uygun bakım paketini seçin', 'Choose the care package that suits you'),
      plans: [
        { name: pick(lang, 'Bakım', 'Refresh'), price: '₺750', description: pick(lang, 'Temel bakım paketi', 'Essential care package'), features: [pick(lang, 'Cilt bakımı', 'Facial'), pick(lang, 'Manikür', 'Manicure'), pick(lang, 'Fön', 'Blow-dry')] },
        { name: pick(lang, 'Premium', 'Premium'), price: '₺1.450', highlighted: true, description: pick(lang, 'En çok tercih edilen', 'Most popular'), features: [pick(lang, 'Cilt bakımı & peeling', 'Facial & peel'), pick(lang, 'Saç tasarımı', 'Hair styling'), pick(lang, 'Makyaj', 'Makeup'), pick(lang, 'Masaj', 'Massage')], buttonText: pick(lang, 'Randevu Al', 'Book Now') },
        { name: pick(lang, 'Gelin', 'Bridal'), price: '₺3.900', description: pick(lang, 'Özel gün paketi', 'Special-day package'), features: [pick(lang, 'Deneme çalışması', 'Trial session'), pick(lang, 'Gelin saçı & makyaj', 'Bridal hair & makeup'), pick(lang, 'Cilt & tırnak', 'Skin & nails')] },
      ],
    },
    {
      type: 'contact',
      title: pick(lang, 'Randevu & iletişim', 'Booking & contact'),
      email: 'randevu@zarafet.com',
      phone: '+90 216 000 00 00',
      address: pick(lang, 'Nişantaşı, İstanbul', 'Nisantasi, Istanbul'),
      fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'Telefon', 'Phone'), pick(lang, 'Hizmet', 'Service')],
    },
    footer(name, pick(lang, 'Güzelliğinize özenle dokunuyoruz.', 'A refined touch for your beauty.')),
  ],
})

/* -------------------------------- Tech ------------------------------------ */

const tech: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'İşinizi büyüten dijital ürünler', 'Digital products that grow your business'),
    tone: pick(lang, 'Teknoloji odaklı, modern, net', 'Tech-forward, modern, clear'),
    audience: pick(lang, 'Dijital dönüşüm arayan ekipler ve girişimler', 'Teams and startups seeking digital transformation'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Özellikler', 'Features'), href: '#features' },
      { label: pick(lang, 'Çözümler', 'Solutions'), href: '#services' },
      { label: pick(lang, 'Fiyatlandırma', 'Pricing'), href: '#pricing' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Ücretsiz Dene', 'Start Free'), href: '#pricing' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'features', title: pick(lang, 'Özellikler', 'Features') },
    { slug: 'pricing', title: pick(lang, 'Fiyatlandırma', 'Pricing') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'split',
      badge: pick(lang, 'Yazılım & Dijital Çözümler', 'Software & Digital Solutions'),
      title: pick(lang, `${name} ile fikrinizi ürüne dönüştürün`, `Turn your idea into a product with ${name}`),
      description: pick(
        lang,
        'Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.',
        'From web and mobile apps to AI integrations, we build scalable digital products.',
      ),
      primaryButton: { label: pick(lang, 'Ücretsiz Dene', 'Start Free'), href: '#pricing' },
      secondaryButton: { label: pick(lang, 'Demo İste', 'Request a Demo'), href: '#contact' },
      trustText: pick(lang, '200+ projede güvenilen ekip', 'Trusted across 200+ projects'),
      image: {
        imagePrompt: 'A sleek software dashboard UI on a laptop, dark theme',
        alt: pick(lang, 'Yazılım arayüzü', 'Software dashboard'),
        aspectRatio: '16/9',
      },
    },
    {
      type: 'features',
      title: pick(lang, 'Neden biz?', 'Why choose us'),
      subtitle: pick(lang, 'Ürününüzü öne çıkaran yetkinlikler', 'Capabilities that set your product apart'),
      items: [
        { title: pick(lang, 'Hızlı Teslimat', 'Fast Delivery'), description: pick(lang, 'Çevik süreçlerle hızlı ve öngörülebilir teslim.', 'Agile delivery that is fast and predictable.'), icon: 'zap' },
        { title: pick(lang, 'Ölçeklenebilir Mimari', 'Scalable Architecture'), description: pick(lang, 'Büyümeye hazır, modern altyapı.', 'Modern infrastructure ready to scale.'), icon: 'layers' },
        { title: pick(lang, 'Yapay Zeka', 'AI Integration'), description: pick(lang, 'Ürününüze akıllı özellikler ekleyin.', 'Add intelligent features to your product.'), icon: 'brain-circuit' },
        { title: pick(lang, 'Güvenlik', 'Security'), description: pick(lang, 'En iyi güvenlik uygulamalarıyla koruma.', 'Protection with security best practices.'), icon: 'shield-check' },
      ],
    },
    {
      type: 'stats',
      items: [
        { value: '200+', label: pick(lang, 'Tamamlanan proje', 'Projects shipped'), icon: 'rocket' },
        { value: '%99.9', label: pick(lang, 'Çalışma süresi', 'Uptime'), icon: 'activity' },
        { value: '4.8', label: pick(lang, 'Müşteri puanı', 'Client rating'), icon: 'star' },
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Çözümlerimiz', 'Our solutions'),
      items: [
        { title: pick(lang, 'Web Uygulamaları', 'Web Apps'), description: pick(lang, 'Modern, hızlı ve SEO dostu web ürünleri.', 'Modern, fast, SEO-friendly web products.'), icon: 'globe' },
        { title: pick(lang, 'Mobil Uygulamalar', 'Mobile Apps'), description: pick(lang, 'iOS ve Android için native deneyim.', 'Native experiences for iOS and Android.'), icon: 'smartphone' },
        { title: pick(lang, 'API & Entegrasyon', 'API & Integrations'), description: pick(lang, 'Sistemlerinizi sorunsuzca birbirine bağlayın.', 'Connect your systems seamlessly.'), icon: 'plug' },
      ],
    },
    {
      type: 'pricing',
      title: pick(lang, 'Basit, şeffaf fiyatlandırma', 'Simple, transparent pricing'),
      subtitle: pick(lang, 'İhtiyacınıza göre büyüyen planlar', 'Plans that grow with your needs'),
      plans: [
        { name: pick(lang, 'Başlangıç', 'Starter'), price: '₺0', period: pick(lang, '/ay', '/mo'), description: pick(lang, 'Denemek için ideal', 'Great to get started'), features: [pick(lang, '1 proje', '1 project'), pick(lang, 'Topluluk desteği', 'Community support'), pick(lang, 'Temel analiz', 'Basic analytics')] },
        { name: pick(lang, 'Profesyonel', 'Pro'), price: '₺499', period: pick(lang, '/ay', '/mo'), highlighted: true, description: pick(lang, 'Büyüyen ekipler için', 'For growing teams'), features: [pick(lang, 'Sınırsız proje', 'Unlimited projects'), pick(lang, 'Öncelikli destek', 'Priority support'), pick(lang, 'Gelişmiş analiz', 'Advanced analytics'), pick(lang, 'Ekip yönetimi', 'Team management')], buttonText: pick(lang, 'Hemen Başla', 'Get Started') },
        { name: pick(lang, 'Kurumsal', 'Enterprise'), price: pick(lang, 'Teklif', 'Custom'), description: pick(lang, 'Özel ihtiyaçlar için', 'For custom needs'), features: [pick(lang, 'Özel entegrasyon', 'Custom integrations'), pick(lang, 'SLA garantisi', 'SLA guarantee'), pick(lang, 'Özel destek', 'Dedicated support')] },
      ],
    },
    {
      type: 'faq',
      title: pick(lang, 'Sıkça sorulan sorular', 'FAQ'),
      items: [
        { question: pick(lang, 'Proje ne kadar sürede teslim edilir?', 'How long does a project take?'), answer: pick(lang, 'Kapsamına göre değişir; net bir zaman planını ilk görüşmede paylaşırız.', 'It depends on scope; we share a clear timeline in the first call.') },
        { question: pick(lang, 'Bakım desteği veriyor musunuz?', 'Do you provide maintenance?'), answer: pick(lang, 'Evet, teslim sonrası bakım ve destek paketleri sunuyoruz.', 'Yes, we offer post-launch maintenance and support packages.') },
      ],
    },
    {
      type: 'cta',
      title: pick(lang, 'Ürününüzü birlikte inşa edelim', 'Let us build your product together'),
      description: pick(lang, 'Ücretsiz keşif görüşmesi planlayın.', 'Book a free discovery call.'),
      primaryButton: { label: pick(lang, 'Demo İste', 'Request a Demo'), href: '#contact' },
    },
    footer(name, pick(lang, 'İşinizi büyüten dijital ürünler.', 'Digital products that grow your business.')),
  ],
})

/* ----------------------------- E-commerce --------------------------------- */

const ecommerce: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Özenle seçilmiş ürünler, kapınızda', 'Curated products, delivered to your door'),
    tone: pick(lang, 'Ürün odaklı, dönüşüm odaklı, canlı', 'Product-focused, conversion-driven, vibrant'),
    audience: pick(lang, 'Kaliteli ürün arayan online alışveriş severler', 'Online shoppers looking for quality products'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Ürünler', 'Products'), href: '#gallery' },
      { label: pick(lang, 'Kampanyalar', 'Deals'), href: '#features' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Alışverişe Başla', 'Shop Now'), href: '#gallery' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'products', title: pick(lang, 'Ürünler', 'Products') },
    { slug: 'about', title: pick(lang, 'Hakkımızda', 'About') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'slider',
      badge: pick(lang, 'Yeni Sezon', 'New Season'),
      title: pick(lang, `${name} — tarzınızı yansıtan ürünler`, `${name} — products that match your style`),
      description: pick(
        lang,
        'Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.',
        'Explore our curated collection. Fast shipping, easy returns and secure checkout.',
      ),
      primaryButton: { label: pick(lang, 'Ürünleri İncele', 'Browse Products'), href: '#products' },
      secondaryButton: { label: pick(lang, 'Kampanyalar', 'View Deals'), href: '#categories' },
      trustText: pick(lang, 'Ücretsiz kargo • 14 gün iade', 'Free shipping • 14-day returns'),
      image: {
        imagePrompt: 'A stylish product flat-lay on a clean background',
        alt: pick(lang, 'Ürün vitrini', 'Product showcase'),
        aspectRatio: '4/3',
      },
      slides: [
        {
          badge: pick(lang, 'Yeni Sezon', 'New Season'),
          title: pick(lang, `${name} — tarzınızı yansıtan ürünler`, `${name} — products that match your style`),
          description: pick(lang, 'Özenle seçilmiş koleksiyonumuzu keşfedin.', 'Explore our carefully curated collection.'),
          primaryButton: { label: pick(lang, 'Ürünleri İncele', 'Browse Products'), href: '#products' },
          secondaryButton: { label: pick(lang, 'Kategoriler', 'Categories'), href: '#categories' },
          image: { imagePrompt: 'A stylish seasonal product flat-lay on a clean background', aspectRatio: '16/9' },
        },
        {
          badge: pick(lang, 'Sınırlı Süre', 'Limited Time'),
          title: pick(lang, 'Sezon sonu indirimleri başladı', 'End-of-season sale is on'),
          description: pick(lang, 'Seçili ürünlerde %50\'ye varan indirim fırsatı.', 'Up to 50% off on selected products.'),
          primaryButton: { label: pick(lang, 'Fırsatları Gör', 'Shop Deals'), href: '#products' },
          image: { imagePrompt: 'A vibrant sale promotion product display', aspectRatio: '16/9' },
        },
        {
          badge: pick(lang, 'Çok Satanlar', 'Best Sellers'),
          title: pick(lang, 'En çok tercih edilen ürünler', 'The pieces everyone loves'),
          description: pick(lang, 'Müşterilerimizin favorileriyle tanışın.', 'Meet our customers\' favorites.'),
          primaryButton: { label: pick(lang, 'Keşfet', 'Discover'), href: '#products' },
          image: { imagePrompt: 'A premium best-selling product lifestyle photo', aspectRatio: '16/9' },
        },
      ],
    },
    {
      type: 'features',
      title: pick(lang, 'Neden bizden alışveriş?', 'Why shop with us'),
      items: [
        { title: pick(lang, 'Hızlı Kargo', 'Fast Shipping'), description: pick(lang, 'Aynı gün kargo ve hızlı teslimat.', 'Same-day dispatch and fast delivery.'), icon: 'truck' },
        { title: pick(lang, 'Kolay İade', 'Easy Returns'), description: pick(lang, '14 gün içinde koşulsuz iade.', 'No-questions returns within 14 days.'), icon: 'rotate-ccw' },
        { title: pick(lang, 'Güvenli Ödeme', 'Secure Payment'), description: pick(lang, 'Tüm kartlar ve 3D güvenli ödeme.', 'All cards and 3D-secure checkout.'), icon: 'shield-check' },
        { title: pick(lang, '7/24 Destek', '24/7 Support'), description: pick(lang, 'Her zaman ulaşabileceğiniz destek.', 'Support you can always reach.'), icon: 'headphones' },
      ],
    },
    {
      type: 'categories',
      title: pick(lang, 'Kategoriler', 'Shop by category'),
      subtitle: pick(lang, 'Aradığınızı kolayca bulun', 'Find exactly what you need'),
      items: [
        { name: pick(lang, 'Yeni Gelenler', 'New Arrivals'), count: pick(lang, '64 ürün', '64 products'), imagePrompt: 'New arrivals fashion category flat-lay', href: '#products' },
        { name: pick(lang, 'Çok Satanlar', 'Best Sellers'), count: pick(lang, '48 ürün', '48 products'), imagePrompt: 'Best selling products display', href: '#products' },
        { name: pick(lang, 'Aksesuar', 'Accessories'), count: pick(lang, '32 ürün', '32 products'), imagePrompt: 'Premium accessories still life', href: '#products' },
        { name: pick(lang, 'İndirim', 'Sale'), count: pick(lang, '25 ürün', '25 products'), imagePrompt: 'Sale promotion product arrangement', href: '#products' },
      ],
    },
    {
      type: 'products',
      title: pick(lang, 'Öne çıkan ürünler', 'Featured products'),
      subtitle: pick(lang, 'En çok tercih edilenler', 'Our best sellers'),
      layout: 'grid',
      items: [
        { name: pick(lang, 'İmza Ürün', 'Signature Piece'), price: pick(lang, '₺899', '$29'), badge: pick(lang, 'Çok Satan', 'Bestseller'), category: pick(lang, 'Yeni Sezon', 'New Season'), imagePrompt: 'Premium product photo on neutral studio background', buttonText: pick(lang, 'İncele', 'View'), href: '#products' },
        { name: pick(lang, 'Sezon Favorisi', 'Season Favorite'), price: pick(lang, '₺1.299', '$39'), badge: pick(lang, 'Yeni', 'New'), category: pick(lang, 'Koleksiyon', 'Collection'), imagePrompt: 'Lifestyle product photograph, soft light', buttonText: pick(lang, 'İncele', 'View'), href: '#products' },
        { name: pick(lang, 'Sınırlı Üretim', 'Limited Edition'), price: pick(lang, '₺649', '$19'), oldPrice: pick(lang, '₺899', '$26'), badge: '%28', category: pick(lang, 'İndirim', 'Sale'), imagePrompt: 'Minimal product photo on clean surface', buttonText: pick(lang, 'İncele', 'View'), href: '#products' },
        { name: pick(lang, 'Premium Seçki', 'Premium Select'), price: pick(lang, '₺1.099', '$34'), category: pick(lang, 'Aksesuar', 'Accessories'), imagePrompt: 'Elegant product photo with shadow detail', buttonText: pick(lang, 'İncele', 'View'), href: '#products' },
      ],
    },
    {
      type: 'stats',
      items: [
        { value: '50K+', label: pick(lang, 'Mutlu müşteri', 'Happy customers'), icon: 'users' },
        { value: '4.8', label: pick(lang, 'Ürün puanı', 'Product rating'), icon: 'star' },
        { value: '48s', label: pick(lang, 'Ortalama teslim', 'Avg. delivery'), icon: 'truck' },
      ],
    },
    {
      type: 'products',
      title: pick(lang, 'Haftanın fırsatları', 'Deals of the week'),
      subtitle: pick(lang, 'Sınırlı süre, kaçırmayın', 'Limited time — do not miss out'),
      layout: 'carousel',
      items: [
        { name: pick(lang, 'Fırsat Ürünü 1', 'Deal Item 1'), price: pick(lang, '₺449', '$14'), oldPrice: pick(lang, '₺699', '$22'), badge: '%35', imagePrompt: 'Discounted product photo, bright background', buttonText: pick(lang, 'Sepete Ekle', 'Add to Cart'), href: '#products' },
        { name: pick(lang, 'Fırsat Ürünü 2', 'Deal Item 2'), price: pick(lang, '₺529', '$17'), oldPrice: pick(lang, '₺799', '$25'), badge: '%33', imagePrompt: 'Product on sale studio photo', buttonText: pick(lang, 'Sepete Ekle', 'Add to Cart'), href: '#products' },
        { name: pick(lang, 'Fırsat Ürünü 3', 'Deal Item 3'), price: pick(lang, '₺389', '$12'), oldPrice: pick(lang, '₺599', '$19'), badge: '%35', imagePrompt: 'Minimal discounted product photograph', buttonText: pick(lang, 'Sepete Ekle', 'Add to Cart'), href: '#products' },
        { name: pick(lang, 'Fırsat Ürünü 4', 'Deal Item 4'), price: pick(lang, '₺629', '$20'), oldPrice: pick(lang, '₺949', '$30'), badge: '%34', imagePrompt: 'Premium product on promotion, soft shadow', buttonText: pick(lang, 'Sepete Ekle', 'Add to Cart'), href: '#products' },
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Müşteri yorumları', 'Customer reviews'),
      items: [
        { quote: pick(lang, 'Ürün kalitesi beklentimin üzerinde, kargo çok hızlıydı.', 'Product quality exceeded expectations and shipping was fast.'), author: 'Zeynep K.' },
        { quote: pick(lang, 'İade süreci gerçekten sorunsuz. Kesinlikle tekrar alırım.', 'The return process was truly seamless. Will buy again.'), author: 'Onur B.' },
      ],
    },
    {
      type: 'cta',
      title: pick(lang, 'Yeni sezonu kaçırmayın', 'Do not miss the new season'),
      description: pick(lang, 'Üye olun, ilk siparişinize özel indirim kazanın.', 'Sign up and get a discount on your first order.'),
      primaryButton: { label: pick(lang, 'Alışverişe Başla', 'Shop Now'), href: '#products' },
    },
    {
      type: 'contact',
      title: pick(lang, 'İletişim', 'Contact'),
      email: 'destek@vitrin.com',
      fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'E-posta', 'Email'), pick(lang, 'Mesaj', 'Message')],
    },
    footer(name, pick(lang, 'Özenle seçilmiş ürünler, kapınızda.', 'Curated products, delivered to your door.')),
  ],
})

/* ----------------------------- Photography -------------------------------- */

const photography: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Anları zamansız karelere dönüştürüyoruz', 'Turning moments into timeless frames'),
    tone: pick(lang, 'Görsel, minimal, duygusal', 'Visual, minimal, emotive'),
    audience: pick(lang, 'Düğün ve özel anlarını ölümsüzleştirmek isteyenler', 'People wanting to capture weddings and special moments'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Portföy', 'Portfolio'), href: '#portfolio' },
      { label: pick(lang, 'Hakkımda', 'About'), href: '#about' },
      { label: pick(lang, 'Paketler', 'Packages'), href: '#pricing' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Tarih Ayırt', 'Check Availability'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'portfolio', title: pick(lang, 'Portföy', 'Portfolio') },
    { slug: 'packages', title: pick(lang, 'Paketler', 'Packages') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'slider',
      badge: pick(lang, 'Düğün & Portre Fotoğrafçısı', 'Wedding & Portrait Photographer'),
      title: pick(lang, `${name}`, `${name}`),
      description: pick(
        lang,
        'Doğal ışığı ve gerçek duyguları yakalayan, hikayenizi anlatan zamansız fotoğraflar.',
        'Timeless photographs that capture natural light, real emotion and your story.',
      ),
      primaryButton: { label: pick(lang, 'Portföyü Gör', 'View Portfolio'), href: '#portfolio' },
      secondaryButton: { label: pick(lang, 'Tarih Ayırt', 'Check Availability'), href: '#contact' },
      trustText: pick(lang, '300+ düğün • 8 yıllık deneyim', '300+ weddings • 8 years of experience'),
      image: {
        imagePrompt: 'A romantic wedding photograph with soft natural light',
        alt: pick(lang, 'Düğün fotoğrafı', 'Wedding photograph'),
        aspectRatio: '3/2',
        overlay: true,
      },
      slides: [
        {
          badge: pick(lang, 'Düğün Hikayeleri', 'Wedding Stories'),
          title: pick(lang, `${name}`, `${name}`),
          description: pick(lang, 'Doğal ışığı ve gerçek duyguları yakalayan zamansız kareler.', 'Timeless frames that capture natural light and real emotion.'),
          primaryButton: { label: pick(lang, 'Portföyü Gör', 'View Portfolio'), href: '#portfolio' },
          secondaryButton: { label: pick(lang, 'Tarih Ayırt', 'Check Availability'), href: '#contact' },
          image: { imagePrompt: 'A romantic wedding photograph with soft natural light, golden hour', aspectRatio: '16/9', overlay: true },
        },
        {
          badge: pick(lang, 'Portre', 'Portrait'),
          title: pick(lang, 'Sizi anlatan portreler', 'Portraits that tell your story'),
          description: pick(lang, 'Stüdyo ve açık hava portre çekimleriyle karakterinizi yansıtın.', 'Studio and outdoor sessions that reflect who you are.'),
          primaryButton: { label: pick(lang, 'Portföyü Gör', 'View Portfolio'), href: '#portfolio' },
          image: { imagePrompt: 'A dramatic studio portrait with soft directional lighting', aspectRatio: '16/9', overlay: true },
        },
        {
          badge: pick(lang, 'Nişan & Çift', 'Engagement & Couples'),
          title: pick(lang, 'Anın büyüsünü ölümsüzleştirin', 'Capture the magic of the moment'),
          description: pick(lang, 'Şehirden kıra, her mekanda hikayenizi anlatan çekimler.', 'From the city to the countryside, sessions that tell your story.'),
          primaryButton: { label: pick(lang, 'Tarih Ayırt', 'Check Availability'), href: '#contact' },
          image: { imagePrompt: 'A romantic couple engagement photo in an urban setting at dusk', aspectRatio: '16/9', overlay: true },
        },
      ],
    },
    {
      type: 'portfolio',
      title: pick(lang, 'Seçili çalışmalar', 'Selected work'),
      subtitle: pick(lang, 'Düğün, nişan ve portre çekimleri', 'Weddings, engagements and portraits'),
      items: [
        { title: pick(lang, 'Elif & Can', 'Elif & Can'), category: pick(lang, 'Düğün', 'Wedding'), imagePrompt: 'Elegant outdoor wedding couple portrait, golden hour' },
        { title: pick(lang, 'Deniz & Mert', 'Deniz & Mert'), category: pick(lang, 'Nişan', 'Engagement'), imagePrompt: 'Romantic engagement photo in a city street' },
        { title: pick(lang, 'Studio Portre', 'Studio Portrait'), category: pick(lang, 'Portre', 'Portrait'), imagePrompt: 'Dramatic studio portrait with soft lighting' },
        { title: pick(lang, 'Kır Düğünü', 'Garden Wedding'), category: pick(lang, 'Düğün', 'Wedding'), imagePrompt: 'Rustic garden wedding ceremony photo' },
        { title: pick(lang, 'Aile', 'Family'), category: pick(lang, 'Portre', 'Portrait'), imagePrompt: 'Warm family portrait outdoors' },
        { title: pick(lang, 'Şehir Çekimi', 'Urban Shoot'), category: pick(lang, 'Nişan', 'Engagement'), imagePrompt: 'Couple walking through an urban setting at dusk' },
      ],
    },
    {
      type: 'about',
      title: pick(lang, 'Merhaba, ben fotoğrafçınız', 'Hello, I am your photographer'),
      body: pick(
        lang,
        `${name} olarak, en özel günlerinizde arka planda kalıp gerçek anları yakalamayı seviyorum. Kurgudan uzak, samimi ve zamansız bir belgesel yaklaşımım var.`,
        `At ${name}, I love to stay in the background and capture genuine moments on your most special days — an intimate, timeless, documentary approach.`,
      ),
      highlights: [
        pick(lang, 'Belgesel yaklaşım', 'Documentary approach'),
        pick(lang, 'Doğal ışık', 'Natural light'),
        pick(lang, 'Hızlı teslim', 'Fast delivery'),
      ],
    },
    {
      type: 'pricing',
      title: pick(lang, 'Çekim paketleri', 'Photography packages'),
      subtitle: pick(lang, 'Her bütçeye uygun seçenekler', 'Options for every budget'),
      plans: [
        { name: pick(lang, 'Portre', 'Portrait'), price: '₺4.500', description: pick(lang, '1 saatlik çekim', '1-hour session'), features: [pick(lang, '1 saat çekim', '1 hour shoot'), pick(lang, '30 düzenlenmiş foto', '30 edited photos'), pick(lang, 'Online galeri', 'Online gallery')] },
        { name: pick(lang, 'Nişan', 'Engagement'), price: '₺8.900', highlighted: true, description: pick(lang, 'En çok tercih edilen', 'Most popular'), features: [pick(lang, '3 saat çekim', '3 hour shoot'), pick(lang, '80 düzenlenmiş foto', '80 edited photos'), pick(lang, '2 mekan', '2 locations'), pick(lang, 'Online galeri', 'Online gallery')], buttonText: pick(lang, 'Tarih Ayırt', 'Check Availability') },
        { name: pick(lang, 'Düğün', 'Wedding'), price: pick(lang, 'Teklif', 'Custom'), description: pick(lang, 'Tam gün hikaye anlatımı', 'Full-day storytelling'), features: [pick(lang, 'Tam gün çekim', 'Full-day coverage'), pick(lang, '500+ düzenlenmiş foto', '500+ edited photos'), pick(lang, 'İkinci fotoğrafçı', 'Second shooter'), pick(lang, 'Albüm', 'Album')] },
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Çiftlerimiz', 'Our couples'),
      items: [
        { quote: pick(lang, 'Fotoğraflara her baktığımızda o günü yeniden yaşıyoruz.', 'Every time we look at the photos we relive that day.'), author: 'Elif & Can' },
        { quote: pick(lang, 'Çok rahat hissettirdi, sonuçlar büyüleyici.', 'Made us feel at ease and the results are magical.'), author: 'Deniz & Mert' },
      ],
    },
    {
      type: 'contact',
      title: pick(lang, 'Tarihinizi ayırtın', 'Check your date'),
      description: pick(lang, 'Çekim tarihinizi ve detaylarınızı paylaşın.', 'Share your date and details.'),
      email: 'hello@karefotograf.com',
      phone: '+90 532 000 00 00',
      fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'Tarih', 'Date'), pick(lang, 'Çekim Türü', 'Shoot Type')],
    },
    footer(name, pick(lang, 'Anları zamansız karelere dönüştürüyoruz.', 'Turning moments into timeless frames.')),
  ],
})

/* ------------------------------- Default ---------------------------------- */

const generic: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Modern ve akılda kalıcı bir web deneyimi', 'A modern, memorable web experience'),
    tone: pick(lang, 'Modern, güven veren, sade', 'Modern, trustworthy, clean'),
    audience: pick(lang, 'Markanı keşfeden yeni ziyaretçiler', 'New visitors discovering your brand'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Başla', 'Get Started'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'about', title: pick(lang, 'Hakkımızda', 'About') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'split',
      badge: pick(lang, 'Hoş geldiniz', 'Welcome'),
      title: name,
      description: pick(lang, 'Markanız için modern ve akılda kalıcı bir web deneyimi.', 'A modern, memorable web experience for your brand.'),
      primaryButton: { label: pick(lang, 'Başla', 'Get Started'), href: '#contact' },
      secondaryButton: { label: pick(lang, 'Daha Fazla', 'Learn More'), href: '#about' },
      trustText: pick(lang, 'GLOVAL AI ile oluşturuldu', 'Built with GLOVAL AI'),
      image: { imagePrompt: 'A clean, modern abstract brand hero image', aspectRatio: '4/3' },
    },
    {
      type: 'features',
      title: pick(lang, 'Neden biz?', 'Why choose us'),
      items: [
        { title: pick(lang, 'Hızlı', 'Fast'), description: pick(lang, 'Hız ve performans için optimize edildi.', 'Optimized for speed and performance.'), icon: 'zap' },
        { title: pick(lang, 'Güvenilir', 'Reliable'), description: pick(lang, 'Tutarlı ve güven veren bir yapı.', 'Dependable and consistent.'), icon: 'shield' },
        { title: pick(lang, 'Şık', 'Beautiful'), description: pick(lang, 'Markana uygun, cilalı bir tasarım.', 'A polished, on-brand design.'), icon: 'sparkles' },
      ],
    },
    {
      type: 'stats',
      items: [
        { value: '10+', label: pick(lang, 'Yıllık deneyim', 'Years of experience'), icon: 'calendar' },
        { value: '2K+', label: pick(lang, 'Mutlu müşteri', 'Happy customers'), icon: 'users' },
        { value: '%98', label: pick(lang, 'Memnuniyet', 'Satisfaction'), icon: 'heart' },
      ],
    },
    {
      type: 'about',
      title: pick(lang, 'Hakkımızda', 'About us'),
      body: pick(lang, `${name}, gerçek değer sunmaya odaklanır.`, `${name} is dedicated to delivering real value.`),
      highlights: [pick(lang, 'Kaliteye odaklı', 'Quality-focused'), pick(lang, 'İnsani ve yardımsever', 'Human and helpful'), pick(lang, 'Sürekli gelişen', 'Always improving')],
    },
    {
      type: 'cta',
      title: pick(lang, 'Başlamaya hazır mısınız?', 'Ready to begin?'),
      description: pick(lang, 'Bugün başlayın ve farkı görün.', 'Start today and see the difference.'),
      primaryButton: { label: pick(lang, 'Başla', 'Get Started'), href: '#contact' },
    },
    {
      type: 'contact',
      title: pick(lang, 'İletişime geçin', 'Get in touch'),
      email: 'merhaba@ornek.com',
      fields: [pick(lang, 'Ad', 'Name'), pick(lang, 'E-posta', 'Email'), pick(lang, 'Mesaj', 'Message')],
    },
    footer(name, pick(lang, 'Modern bir web deneyimi.', 'A modern web experience.')),
  ],
})

/* ------------------------------ Automotive -------------------------------- */

const automotive: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Hayalinizdeki aracı bulun', 'Find the car of your dreams'),
    tone: pick(lang, 'Premium, prestijli, dinamik', 'Premium, prestigious, dynamic'),
    audience: pick(lang, 'Kaliteli ve güvenilir araç arayan sürücüler', 'Drivers seeking quality, trustworthy vehicles'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'Araçlar', 'Vehicles'), href: '#gallery' },
      { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Test Sürüşü', 'Book a Test Drive'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'vehicles', title: pick(lang, 'Araçlar', 'Vehicles') },
    { slug: 'services', title: pick(lang, 'Hizmetler', 'Services') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'showcase',
      badge: pick(lang, 'Premium Oto Galeri', 'Premium Auto Gallery'),
      title: pick(lang, `${name} ile hayalinizdeki araca ulaşın`, `Reach your dream car with ${name}`),
      description: pick(
        lang,
        'Özenle seçilmiş, ekspertiz raporlu premium araç filomuzu keşfedin. Şeffaf fiyat, güvenli alım ve esnek finansman.',
        'Explore our hand-picked, fully inspected fleet of premium vehicles. Transparent pricing, secure purchase and flexible financing.',
      ),
      primaryButton: { label: pick(lang, 'Araçları İncele', 'Browse Vehicles'), href: '#gallery' },
      secondaryButton: { label: pick(lang, 'Test Sürüşü Ayarla', 'Book a Test Drive'), href: '#contact' },
      trustText: pick(lang, '2.500+ satılan araç • %100 ekspertizli', '2,500+ cars sold • 100% inspected'),
      image: {
        imagePrompt:
          'Premium modern automotive dealership showroom with luxury cars, cinematic lighting, professional automotive photography, wide horizontal composition',
        alt: pick(lang, 'Premium oto galeri showroom', 'Premium car dealership showroom'),
        aspectRatio: '16/9',
      },
    },
    {
      type: 'stats',
      items: [
        { value: '2.5K+', label: pick(lang, 'Satılan araç', 'Cars sold'), icon: 'car' },
        { value: '18', label: pick(lang, 'Yıllık tecrübe', 'Years of experience'), icon: 'calendar' },
        { value: '%100', label: pick(lang, 'Ekspertizli araç', 'Inspected vehicles'), icon: 'shield-check' },
        { value: '4.9', label: pick(lang, 'Müşteri puanı', 'Customer rating'), icon: 'star' },
      ],
    },
    {
      type: 'gallery',
      title: pick(lang, 'Öne çıkan araçlar', 'Featured vehicles'),
      subtitle: pick(lang, 'Galerimizden seçkin modeller', 'Select models from our gallery'),
      items: [
        { imagePrompt: 'A luxury black sedan in a modern showroom, professional automotive photography', caption: pick(lang, 'Sedan • 2022', 'Sedan • 2022'), aspectRatio: '4/3' },
        { imagePrompt: 'A premium white SUV parked in a bright showroom, professional automotive photography', caption: pick(lang, 'SUV • 2023', 'SUV • 2023'), aspectRatio: '4/3' },
        { imagePrompt: 'A sporty red coupe on a clean studio background, dramatic lighting', caption: pick(lang, 'Coupe • 2021', 'Coupe • 2021'), aspectRatio: '4/3' },
        { imagePrompt: 'A modern electric car charging in a sleek showroom, professional automotive photography', caption: pick(lang, 'Elektrikli • 2023', 'Electric • 2023'), aspectRatio: '4/3' },
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Hizmetlerimiz', 'Our services'),
      subtitle: pick(lang, 'Alımdan sonra da yanınızdayız', 'We are with you beyond the sale'),
      items: [
        { title: pick(lang, 'Araç Finansmanı', 'Vehicle Financing'), description: pick(lang, 'Bankalarla anlaşmalı, düşük faizli kredi seçenekleri.', 'Low-interest loan options through our banking partners.'), icon: 'credit-card' },
        { title: pick(lang, 'Takas', 'Trade-in'), description: pick(lang, 'Mevcut aracınızı değerinde takas edin.', 'Trade in your current car at a fair value.'), icon: 'repeat' },
        { title: pick(lang, 'Ekspertiz', 'Inspection'), description: pick(lang, 'Her araç 150+ noktada detaylı kontrolden geçer.', 'Every car passes a detailed 150+ point inspection.'), icon: 'search-check' },
        { title: pick(lang, 'Garanti', 'Warranty'), description: pick(lang, 'Seçili araçlarda 12 aya varan garanti.', 'Up to 12 months warranty on selected vehicles.'), icon: 'shield' },
      ],
    },
    {
      type: 'process',
      title: pick(lang, 'Nasıl çalışır?', 'How it works'),
      subtitle: pick(lang, 'Aracınıza 4 adımda kavuşun', 'Get your car in four steps'),
      steps: [
        { title: pick(lang, 'Keşfet', 'Discover'), description: pick(lang, 'Galerimizden size uygun aracı seçin.', 'Pick the right car from our gallery.'), icon: 'car' },
        { title: pick(lang, 'Test Sürüşü', 'Test Drive'), description: pick(lang, 'Aracı deneyimlemek için randevu alın.', 'Book an appointment to experience the car.'), icon: 'steering-wheel' },
        { title: pick(lang, 'Finansman', 'Financing'), description: pick(lang, 'Size en uygun ödeme planını birlikte belirleyelim.', 'We find the payment plan that fits you best.'), icon: 'credit-card' },
        { title: pick(lang, 'Teslimat', 'Delivery'), description: pick(lang, 'Aracınızı güvenle teslim alın.', 'Take delivery of your car with confidence.'), icon: 'key' },
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Müşterilerimiz ne diyor?', 'What our customers say'),
      items: [
        { quote: pick(lang, 'Aracımı çok şeffaf bir süreçle aldım, ekspertiz raporu tam açıklandı.', 'I bought my car through a very transparent process with a full inspection report.'), author: 'Emre T.', role: pick(lang, 'SUV alıcısı', 'SUV buyer') },
        { quote: pick(lang, 'Takas değeri gayet adildi, finansman desteği çok işime yaradı.', 'The trade-in value was fair and the financing support was a big help.'), author: 'Selin A.', role: pick(lang, 'Sedan alıcısı', 'Sedan buyer') },
      ],
    },
    {
      type: 'faq',
      title: pick(lang, 'Sıkça sorulan sorular', 'Frequently asked questions'),
      items: [
        { question: pick(lang, 'Araçlar ekspertizli mi?', 'Are the cars inspected?'), answer: pick(lang, 'Tüm araçlarımız 150+ noktada detaylı ekspertizden geçer ve raporu sizinle paylaşılır.', 'All our cars pass a detailed 150+ point inspection and the report is shared with you.') },
        { question: pick(lang, 'Takas yapıyor musunuz?', 'Do you accept trade-ins?'), answer: pick(lang, 'Evet, mevcut aracınızı değerinde takas edebilirsiniz.', 'Yes, you can trade in your current vehicle at a fair value.') },
        { question: pick(lang, 'Finansman desteği var mı?', 'Is financing available?'), answer: pick(lang, 'Anlaşmalı bankalarımızla düşük faizli kredi seçenekleri sunuyoruz.', 'We offer low-interest loan options through our partner banks.') },
      ],
    },
    {
      type: 'cta',
      title: pick(lang, 'Hayalinizdeki araç sizi bekliyor', 'Your dream car is waiting'),
      description: pick(lang, 'Hemen test sürüşü randevusu oluşturun.', 'Book your test drive appointment today.'),
      primaryButton: { label: pick(lang, 'Test Sürüşü Ayarla', 'Book a Test Drive'), href: '#contact' },
      secondaryButton: { label: pick(lang, 'Araçları Gör', 'View Vehicles'), href: '#gallery' },
    },
    {
      type: 'contact',
      title: pick(lang, 'Bize ulaşın', 'Get in touch'),
      description: pick(lang, 'Sorularınız ve randevu için buradayız.', 'We are here for your questions and appointments.'),
      email: 'info@prestijoto.com',
      phone: '+90 212 000 00 00',
      address: pick(lang, 'Oto Sanayi Cad. No:42, İstanbul', 'Auto District Ave. No:42, Istanbul'),
      fields: [pick(lang, 'Ad Soyad', 'Full Name'), pick(lang, 'Telefon', 'Phone'), pick(lang, 'İlgilendiğiniz Araç', 'Vehicle of Interest')],
    },
    footer(name, pick(lang, 'Hayalinizdeki aracı bulun.', 'Find the car of your dreams.')),
  ],
})

/* ---------------------------- Real estate --------------------------------- */

const realestate: Builder = (name, lang) => ({
  meta: {
    tagline: pick(lang, 'Hayalinizdeki eve giden en güvenilir yol', 'The most trusted path to your dream home'),
    tone: pick(lang, 'Modern, güven veren, profesyonel', 'Modern, trustworthy, professional'),
    audience: pick(lang, 'Ev almak, satmak veya kiralamak isteyenler', 'People looking to buy, sell or rent property'),
  },
  navigation: {
    logoText: name,
    links: [
      { label: pick(lang, 'Ana Sayfa', 'Home'), href: '#hero' },
      { label: pick(lang, 'İlanlar', 'Listings'), href: '#gallery' },
      { label: pick(lang, 'Hizmetler', 'Services'), href: '#services' },
      { label: pick(lang, 'Hakkımızda', 'About'), href: '#about' },
      { label: pick(lang, 'İletişim', 'Contact'), href: '#contact' },
    ],
    cta: { label: pick(lang, 'Randevu Al', 'Book a Viewing'), href: '#contact' },
  },
  pages: [
    { slug: 'home', title: pick(lang, 'Ana Sayfa', 'Home'), isHome: true },
    { slug: 'listings', title: pick(lang, 'İlanlar', 'Listings') },
    { slug: 'services', title: pick(lang, 'Hizmetler', 'Services') },
    { slug: 'contact', title: pick(lang, 'İletişim', 'Contact') },
  ],
  sections: [
    {
      type: 'hero',
      variant: 'showcase',
      badge: pick(lang, 'Premium Gayrimenkul', 'Premium Real Estate'),
      title: pick(lang, `${name} ile doğru evi bulun`, `Find the right home with ${name}`),
      description: pick(
        lang,
        'Seçkin konut ve yatırım fırsatlarını sizin için bir araya getiriyoruz. Uzman ekibimizle güvenle alın, satın ve kiralayın.',
        'We bring together premium homes and investment opportunities. Buy, sell and rent with confidence, guided by our expert team.',
      ),
      primaryButton: { label: pick(lang, 'İlanları Görüntüle', 'Browse Listings'), href: '#gallery' },
      secondaryButton: { label: pick(lang, 'Randevu Al', 'Book a Viewing'), href: '#contact' },
      trustText: pick(lang, '1.200+ mutlu aile • 3 şehirde ofis', '1,200+ happy families • Offices in 3 cities'),
      image: {
        imagePrompt: 'A luxury modern house exterior at dusk with warm interior lights',
        alt: pick(lang, 'Lüks modern konut', 'Luxury modern home'),
        aspectRatio: '16/9',
        overlay: true,
      },
    },
    {
      type: 'stats',
      items: [
        { value: '1.200+', label: pick(lang, 'Tamamlanan satış', 'Closed deals'), icon: 'home' },
        { value: '15', label: pick(lang, 'Yıllık tecrübe', 'Years of experience'), icon: 'award' },
        { value: '%98', label: pick(lang, 'Müşteri memnuniyeti', 'Client satisfaction'), icon: 'smile' },
        { value: '3', label: pick(lang, 'Şehirde ofis', 'City offices'), icon: 'map-pin' },
      ],
    },
    {
      type: 'gallery',
      title: pick(lang, 'Öne çıkan ilanlar', 'Featured listings'),
      subtitle: pick(lang, 'Portföyümüzden seçkin fırsatlar', 'Standout opportunities from our portfolio'),
      items: [
        { imagePrompt: 'A modern luxury villa with a pool', caption: pick(lang, 'Deniz Manzaralı Villa • ₺24.500.000', 'Sea-View Villa • $780,000'), aspectRatio: '4/3' },
        { imagePrompt: 'A bright modern apartment living room with city view', caption: pick(lang, 'Merkez 3+1 Daire • ₺8.900.000', 'Central 3+1 Apartment • $285,000'), aspectRatio: '4/3' },
        { imagePrompt: 'A contemporary duplex house exterior', caption: pick(lang, 'Bahçeli Dubleks • ₺15.750.000', 'Garden Duplex • $505,000'), aspectRatio: '4/3' },
        { imagePrompt: 'A luxury penthouse terrace with skyline view', caption: pick(lang, 'Panoramik Çatı Katı • ₺32.000.000', 'Panoramic Penthouse • $1,020,000'), aspectRatio: '4/3' },
      ],
    },
    {
      type: 'services',
      title: pick(lang, 'Hizmetlerimiz', 'Our services'),
      subtitle: pick(lang, 'Baştan sona yanınızdayız', 'With you from start to finish'),
      items: [
        { title: pick(lang, 'Konut Satışı', 'Home Sales'), description: pick(lang, 'Doğru alıcıyla en iyi fiyata buluşun.', 'Meet the right buyer at the best price.'), icon: 'home' },
        { title: pick(lang, 'Kiralama', 'Rentals'), description: pick(lang, 'Güvenli ve hızlı kiralama süreçleri.', 'Safe and fast rental processes.'), icon: 'key' },
        { title: pick(lang, 'Yatırım Danışmanlığı', 'Investment Advisory'), description: pick(lang, 'Getirisi yüksek fırsatları birlikte değerlendirelim.', 'Let us evaluate high-yield opportunities together.'), icon: 'trending-up' },
        { title: pick(lang, 'Değerleme', 'Valuation'), description: pick(lang, 'Mülkünüzün güncel piyasa değerini öğrenin.', 'Learn the current market value of your property.'), icon: 'calculator' },
      ],
    },
    {
      type: 'features',
      title: pick(lang, 'Neden bizimle çalışmalısınız?', 'Why work with us'),
      items: [
        { title: pick(lang, 'Şeffaf Süreç', 'Transparent Process'), description: pick(lang, 'Her adımda net bilgi ve dürüst iletişim.', 'Clear information and honest communication at every step.'), icon: 'eye' },
        { title: pick(lang, 'Uzman Ekip', 'Expert Team'), description: pick(lang, 'Bölgeyi tanıyan deneyimli danışmanlar.', 'Experienced advisors who know the area.'), icon: 'users' },
        { title: pick(lang, 'Geniş Portföy', 'Wide Portfolio'), description: pick(lang, 'Bütçenize uygun yüzlerce ilan.', 'Hundreds of listings to fit your budget.'), icon: 'layers' },
        { title: pick(lang, 'Hukuki Destek', 'Legal Support'), description: pick(lang, 'Tapu ve sözleşme süreçlerinde tam destek.', 'Full support through title deed and contracts.'), icon: 'shield-check' },
      ],
    },
    {
      type: 'about',
      title: pick(lang, 'Hakkımızda', 'About us'),
      body: pick(
        lang,
        `${name}, 15 yılı aşkın tecrübesiyle ailelerin doğru evi bulmasına yardımcı oluyor. Yerel piyasa bilgimiz ve şeffaf yaklaşımımızla her işlemi güvenle tamamlıyoruz.`,
        `${name} has helped families find the right home for over 15 years. With deep local market knowledge and a transparent approach, we close every deal with confidence.`,
      ),
      highlights: [
        pick(lang, 'Yerel piyasa uzmanlığı', 'Local market expertise'),
        pick(lang, 'Uçtan uca danışmanlık', 'End-to-end advisory'),
        pick(lang, 'Güvenli işlem güvencesi', 'Secure transaction guarantee'),
      ],
    },
    {
      type: 'testimonials',
      title: pick(lang, 'Müşterilerimiz ne diyor?', 'What our clients say'),
      items: [
        { quote: pick(lang, 'İlk evimizi almak stresli olabilirdi ama süreç sorunsuz geçti.', 'Buying our first home could have been stressful, but the process was seamless.'), author: 'Merve & Kaan', role: pick(lang, 'Ev sahibi', 'Homeowners') },
        { quote: pick(lang, 'Yatırım için aldığım daireyi hızlıca ve iyi bir fiyata kiraya verdiler.', 'They rented out my investment apartment quickly at a great price.'), author: 'Serkan A.', role: pick(lang, 'Yatırımcı', 'Investor') },
      ],
    },
    {
      type: 'contact',
      title: pick(lang, 'Randevu & iletişim', 'Book a viewing & contact'),
      description: pick(lang, 'İlanlarımızı yerinde görmek veya danışmanlık almak için bize ulaşın.', 'Reach out to view our listings in person or get advisory support.'),
      email: 'info@emlakvizyon.com',
      phone: '+90 212 000 00 00',
      address: pick(lang, 'Levent Mah. No:34, İstanbul', 'Levent Ave. No:34, Istanbul'),
      fields: [pick(lang, 'Ad Soyad', 'Full Name'), pick(lang, 'Telefon', 'Phone'), pick(lang, 'İlgilendiğiniz İlan', 'Listing of Interest')],
    },
    footer(name, pick(lang, 'Doğru ev, doğru danışman.', 'The right home, the right advisor.')),
  ],
})

const BUILDERS: Record<Sector, Builder> = {
  dental,
  food,
  law,
  architecture,
  beauty,
  tech,
  ecommerce,
  photography,
  automotive,
  realestate,
  default: generic,
}
