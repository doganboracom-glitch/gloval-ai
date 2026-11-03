import type { LogoStyleId } from '@/lib/logo-studio/rules'

/**
 * Logo Studio V2 sector knowledge base. A "profile" is a finer-grained sector
 * than the 17 dropdown choices (e.g. "urban renewal" and "real estate" both
 * live under Construction). Each profile carries the real-world motifs of its
 * trade, the clichés a distinctive mark must avoid, a type/style pairing that
 * only uses fonts the studio already ships (see `STYLE_SPECS`), palette ideas
 * and the keywords used to recognise it in free text.
 *
 * Pure data: matching lives in `direction.ts`, drawings in `sector-symbols.ts`.
 */

export type SectorProfileId =
  | 'construction'
  | 'urban-renewal'
  | 'real-estate'
  | 'jewelry'
  | 'beauty-salon'
  | 'education'
  | 'music-education'
  | 'nature'
  | 'restaurant'
  | 'law'
  | 'finance'
  | 'clinic'
  | 'software'
  | 'ecommerce'
  | 'events'
  | 'sport'
  | 'automotive'
  | 'media'
  | 'service'
  | 'travel'
  | 'generic'

export type SectorProfile = {
  id: SectorProfileId
  /** Value of the sector dropdown this profile belongs to (`LOGO_STUDIO_SECTORS` id). */
  sectorId: string
  label: { tr: string; en: string }
  /** TR/EN keywords. A leading "=" means exact word only (no suffix tolerance). */
  keywords: string[]
  /** English, concrete, drawable motifs handed to the AI prompt. */
  motifs: string[]
  /** Overused imagery a distinctive mark must avoid. */
  cliches: string[]
  /** Recommended studio style; its font family is what `STYLE_SPECS` ships. */
  style: LogoStyleId
  fontNote: { tr: string; en: string }
  palettes: { tr: string; en: string }[]
  toneWords: string[]
}

export const SECTOR_PROFILES: SectorProfile[] = [
  {
    id: 'construction',
    sectorId: 'construction',
    label: { tr: 'İnşaat ve mimarlık', en: 'Construction and architecture' },
    keywords: ['müteahhit', 'inşaat', 'mimar', 'mimarlık', 'yapı', 'taahhüt', 'şantiye', 'construction', 'architect', 'architecture', 'contractor', 'building'],
    motifs: [
      'a keystone locked into a load-bearing arch',
      'rising stacked modules or a floor cross-section',
      'a beam-and-column frame',
      'a doorway threshold',
      'measured plan lines on a grid',
      'a geometric A / lambda form built from two beams',
    ],
    cliches: ['a plain house roof outline', 'a hard hat', 'a tower crane'],
    style: 'classic',
    fontNote: { tr: 'Güçlü serif başlık (Playfair Display) + küçük harf aralıklı sans alt satır', en: 'Strong serif title (Playfair Display) with a small letter-spaced sans tagline' },
    palettes: [
      { tr: 'Lacivert + altın', en: 'Navy and gold' },
      { tr: 'Antrasit + bronz', en: 'Anthracite and bronze' },
      { tr: 'Beton gri + turuncu', en: 'Concrete grey and orange' },
    ],
    toneWords: ['solid', 'enduring', 'precise'],
  },
  {
    id: 'urban-renewal',
    sectorId: 'construction',
    label: { tr: 'Kentsel dönüşüm', en: 'Urban renewal' },
    keywords: ['kentsel dönüşüm', 'riskli yapı', 'yerinde dönüşüm', 'urban renewal', 'urban regeneration'],
    motifs: [
      'a new building rising out of old block fragments',
      'a key combined with a building silhouette',
      'a doorway threshold between old and new',
      'a keystone locked into a load-bearing arch',
      'stacked modules growing upward',
    ],
    cliches: ['a plain house roof outline', 'a hard hat', 'a wrecking ball'],
    style: 'classic',
    fontNote: { tr: 'Güçlü serif başlık (Playfair Display) + küçük harf aralıklı sans alt satır', en: 'Strong serif title (Playfair Display) with a small letter-spaced sans tagline' },
    palettes: [
      { tr: 'Lacivert + altın', en: 'Navy and gold' },
      { tr: 'Beton gri + turuncu', en: 'Concrete grey and orange' },
    ],
    toneWords: ['renewal', 'trustworthy', 'rising'],
  },
  {
    id: 'real-estate',
    sectorId: 'construction',
    label: { tr: 'Emlak', en: 'Real estate' },
    keywords: ['emlak', 'gayrimenkul', 'emlakçı', 'konut', 'real estate', 'realtor', 'property'],
    motifs: [
      'a doorway threshold',
      'a floor-plan grid',
      'a key merged with an abstract roof line',
      'a city skyline of three blocks',
      'a location pin integrated with a building',
    ],
    cliches: ['a plain flat house icon'],
    style: 'modern',
    fontNote: { tr: 'Güçlü sans (Poppins)', en: 'Strong sans (Poppins)' },
    palettes: [{ tr: 'Lacivert + turuncu', en: 'Navy and orange' }],
    toneWords: ['reliable', 'home', 'clear'],
  },
  {
    id: 'jewelry',
    sectorId: 'beauty',
    label: { tr: 'Mücevher', en: 'Jewelry' },
    keywords: ['mücevher', 'mücevherat', 'takı', 'pırlanta', 'kuyumcu', 'yüzük', '=altın', '=gümüş', 'jewelry', 'jewellery', 'diamond', 'gemstone'],
    motifs: [
      'faceted gemstone surfaces seen from the side',
      'a four-prong setting holding a stone',
      'a light fracture across a facet',
      'a crescent moon paired with a stone',
      'a necklace chain ending in a drop',
      'a fine ring line with a small stone',
    ],
    cliches: ['a generic diamond icon'],
    style: 'luxury',
    fontNote: { tr: 'Zarif serif (Cormorant Garamond) + geniş aralıklı sans', en: 'Elegant serif (Cormorant Garamond) with wide-spaced sans' },
    palettes: [
      { tr: 'Siyah + altın', en: 'Black and gold' },
      { tr: 'Gül altını', en: 'Rose gold' },
      { tr: 'Gümüş + lacivert', en: 'Silver and navy' },
    ],
    toneWords: ['refined', 'precious', 'luminous'],
  },
  {
    id: 'beauty-salon',
    sectorId: 'beauty',
    label: { tr: 'Güzellik ve kuaför', en: 'Beauty and salon' },
    keywords: ['kuaför', 'güzellik', 'berber', 'spa', 'masaj', 'makyaj', 'salon', 'estetisyen', 'hairdresser', 'barber', 'beauty', 'cosmetic', 'nail'],
    motifs: [
      'a flowing hair line',
      'a flower silhouette',
      'a sparkle of light',
      'a single drop',
      'a lotus',
    ],
    cliches: ['crossed scissors and comb'],
    style: 'luxury',
    fontNote: { tr: 'Zarif serif (Cormorant Garamond) + ince sans (Inter)', en: 'Elegant serif (Cormorant Garamond) with thin sans (Inter)' },
    palettes: [
      { tr: 'Pudra + gül altını', en: 'Powder and rose gold' },
      { tr: 'Siyah + altın', en: 'Black and gold' },
    ],
    toneWords: ['soft', 'graceful', 'radiant'],
  },
  {
    id: 'education',
    sectorId: 'education',
    label: { tr: 'Eğitim', en: 'Education' },
    keywords: ['eğitim', 'kurs', 'dershane', 'okul', 'akademi', 'öğretmen', 'üniversite', 'education', 'school', 'academy', 'course', 'tutoring'],
    motifs: [
      'rising steps',
      'an open book with a direction arrow',
      'a pen nib leaving a trail',
      'a compass divider',
      'an atom orbit',
      'a learning curve',
    ],
    cliches: ['a graduation cap', 'a light bulb'],
    style: 'classic',
    fontNote: { tr: 'Dostça geometrik sans (Poppins) + serif başlık (Playfair Display)', en: 'Friendly geometric sans (Poppins) with a serif title (Playfair Display)' },
    palettes: [
      { tr: 'Derin mavi + turuncu', en: 'Deep blue and orange' },
      { tr: 'Bordo + krem', en: 'Burgundy and cream' },
    ],
    toneWords: ['curious', 'growing', 'friendly'],
  },
  {
    id: 'music-education',
    sectorId: 'education',
    label: { tr: 'DJ ve müzik eğitimi', en: 'DJ and music education' },
    keywords: ['dj eğitim', 'dj kurs', 'dj okul', 'müzik eğitim', 'müzik kurs', 'müzik okul', 'dj academy', 'dj school', 'music school', 'music lessons', 'music education'],
    motifs: [
      'a record groove paired with an open book',
      'a sound wave rising like steps',
      'a record label disc with a cue dot',
      'rhythm rings around a book spine',
    ],
    cliches: ['a graduation cap', 'a single music note'],
    style: 'modern',
    fontNote: { tr: 'Dostça geometrik sans (Poppins) + serif başlık (Playfair Display)', en: 'Friendly geometric sans (Poppins) with a serif title (Playfair Display)' },
    palettes: [
      { tr: 'Derin mavi + turuncu', en: 'Deep blue and orange' },
      { tr: 'Neon mor + siyah', en: 'Neon purple and black' },
    ],
    toneWords: ['rhythmic', 'curious', 'energetic'],
  },
  {
    id: 'nature',
    sectorId: 'nature',
    label: { tr: 'Doğa ve tarım', en: 'Nature and agriculture' },
    keywords: ['çiçek', 'tarım', 'organik', 'bahçe', 'çiftlik', 'fidan', 'tohum', 'peyzaj', 'farm', 'agriculture', 'organic', 'garden', 'florist', 'harvest'],
    motifs: [
      'a leaf vein structure',
      'a sprout growing from a seed',
      'a rising sun over field lines',
      'a drop joined with a leaf',
      'tree growth rings',
      'mountain and water lines',
    ],
    cliches: ['a lone clip-art leaf'],
    style: 'minimal',
    fontNote: { tr: 'Yuvarlak sans (Poppins) veya kalın serif (Playfair Display)', en: 'Rounded sans (Poppins) or bold serif (Playfair Display)' },
    palettes: [
      { tr: 'Orman yeşili + krem', en: 'Forest green and cream' },
      { tr: 'Toprak + hardal', en: 'Earth and mustard' },
    ],
    toneWords: ['natural', 'fresh', 'grounded'],
  },
  {
    id: 'restaurant',
    sectorId: 'food',
    label: { tr: 'Restoran ve kafe', en: 'Restaurant and cafe' },
    keywords: ['kahve', 'restoran', 'pasta', 'pastane', 'lokanta', 'kafe', 'fırın', 'mutfak', 'yemek', 'cafe', 'bakery', 'restaurant', 'coffee', 'kitchen', 'bistro'],
    motifs: [
      'a serving dome with rising steam',
      'a plate ring',
      'a signature ingredient such as wheat, a coffee bean or an olive',
      'a stove flame',
      'steam rising from a cup',
    ],
    cliches: ['a crossed fork and knife pair'],
    style: 'classic',
    fontNote: { tr: 'Sıcak serif (Playfair Display), el yazısı vurgu yerine ince sans', en: 'Warm serif (Playfair Display); a thin sans accent instead of handwriting' },
    palettes: [
      { tr: 'Bordo + krem', en: 'Burgundy and cream' },
      { tr: 'Kömür + turuncu', en: 'Charcoal and orange' },
    ],
    toneWords: ['warm', 'inviting', 'crafted'],
  },
  {
    id: 'law',
    sectorId: 'legal',
    label: { tr: 'Hukuk ve danışmanlık', en: 'Law and consulting' },
    keywords: ['avukat', 'hukuk', 'danışmanlık', 'noter', 'arabulucu', 'law', 'lawyer', 'attorney', 'legal', 'consulting', 'consultancy'],
    motifs: [
      'a balanced scale beam',
      'a column and arch',
      'a monogram inside a seal',
      'a book of statutes',
      'tightly kerned letters forming one shape',
    ],
    cliches: ['a gavel', 'a statue of Justice'],
    style: 'classic',
    fontNote: { tr: 'Klasik serif (Playfair Display)', en: 'Classic serif (Playfair Display)' },
    palettes: [
      { tr: 'Lacivert + altın', en: 'Navy and gold' },
      { tr: 'Bordo + krem', en: 'Burgundy and cream' },
    ],
    toneWords: ['authoritative', 'steady', 'dignified'],
  },
  {
    id: 'finance',
    sectorId: 'legal',
    label: { tr: 'Finans ve muhasebe', en: 'Finance and accounting' },
    keywords: ['muhasebe', 'finans', 'sigorta', 'mali müşavir', 'vergi', 'bankacılık', 'yatırım', 'accounting', 'finance', 'insurance', 'tax', 'investment', 'bookkeeping'],
    motifs: [
      'a rising growth line',
      'stylised column bars',
      'a lock or key',
      'an abstract ring',
    ],
    cliches: ['a coin', 'a dollar sign'],
    style: 'classic',
    fontNote: { tr: 'Ciddi serif (Playfair Display) veya sans (Inter)', en: 'Serious serif (Playfair Display) or sans (Inter)' },
    palettes: [{ tr: 'Lacivert + yeşil + altın', en: 'Navy, green and gold' }],
    toneWords: ['trusted', 'exact', 'secure'],
  },
  {
    id: 'clinic',
    sectorId: 'health',
    label: { tr: 'Sağlık ve klinik', en: 'Health and clinic' },
    keywords: ['diş', 'dişçi', 'klinik', 'doktor', 'estetik', 'fizyoterapi', 'dental', 'hastane', 'eczane', 'veteriner', 'psikolog', 'terapi', 'sağlık', 'diyet', 'clinic', 'doctor', 'physio', 'physiotherapy', 'health', 'pharmacy', 'therapy'],
    motifs: [
      'a pulse line',
      'a drop',
      'a hand cradling a leaf',
      'a DNA helix',
      'an abstract smile arc',
    ],
    cliches: ['a medical cross as the only option'],
    style: 'minimal',
    fontNote: { tr: 'Temiz humanist sans (Inter)', en: 'Clean humanist sans (Inter)' },
    palettes: [
      { tr: 'Turkuaz + beyaz', en: 'Teal and white' },
      { tr: 'Yeşil + beyaz', en: 'Green and white' },
    ],
    toneWords: ['calm', 'caring', 'clean'],
  },
  {
    id: 'software',
    sectorId: 'tech',
    label: { tr: 'Teknoloji ve yazılım', en: 'Technology and software' },
    keywords: ['yazılım', 'bilişim', '=saas', 'yapay zeka', 'bulut', 'siber', 'uygulama', 'software', 'artificial intelligence', 'cloud', 'cyber', 'startup', 'devops'],
    motifs: [
      'connected nodes',
      'a data bus',
      'a signal arc',
      'a hex grid',
      'brackets with an arrow',
    ],
    cliches: ['a plain cube', 'an orbit ring', 'a brain'],
    style: 'modern',
    fontNote: { tr: 'Geometrik sans (Poppins)', en: 'Geometric sans (Poppins)' },
    palettes: [
      { tr: 'Elektrik mavisi + mor', en: 'Electric blue and purple' },
      { tr: 'Siyah + neon', en: 'Black and neon' },
    ],
    toneWords: ['precise', 'forward', 'sharp'],
  },
  {
    id: 'ecommerce',
    sectorId: 'retail',
    label: { tr: 'E-ticaret ve mağaza', en: 'Ecommerce and retail' },
    keywords: ['e-ticaret', 'eticaret', 'mağaza', 'butik', 'perakende', 'toptan', 'online satış', 'ecommerce', 'retail', 'shop', 'store', 'boutique'],
    motifs: [
      'a folding parcel',
      'a price tag',
      'a delivery loop arrow',
      'an abstract bag',
    ],
    cliches: ['a shopping cart icon'],
    style: 'modern',
    fontNote: { tr: 'Modern sans (Poppins)', en: 'Modern sans (Poppins)' },
    palettes: [{ tr: 'Canlı mor + turuncu', en: 'Vivid purple and orange' }],
    toneWords: ['lively', 'friendly', 'easy'],
  },
  {
    id: 'events',
    sectorId: 'events',
    label: { tr: 'Etkinlik ve DJ', en: 'Events and DJ' },
    keywords: ['=dj', 'müzik', 'konser', 'organizasyon', 'düğün', 'eğlence', 'festival', 'event', 'events', 'music', 'concert', 'wedding', 'party', 'nightclub'],
    motifs: [
      'a record groove with concentric rings',
      'a sound wave',
      'a cue point dot',
      'a rhythm ring',
      'a stage light beam',
      'headphones',
    ],
    cliches: ['a single musical note'],
    style: 'modern',
    fontNote: { tr: 'Geometrik / kalın sans (Poppins)', en: 'Geometric / bold sans (Poppins)' },
    palettes: [
      { tr: 'Neon mor + siyah', en: 'Neon purple and black' },
      { tr: 'Kırmızı + siyah', en: 'Red and black' },
    ],
    toneWords: ['energetic', 'loud', 'rhythmic'],
  },
  {
    id: 'sport',
    sectorId: 'sport',
    label: { tr: 'Spor ve fitness', en: 'Sports and fitness' },
    keywords: ['spor', 'fitness', 'pilates', 'yoga', '=gym', 'antrenör', 'crossfit', 'sports', 'workout', 'training', 'trainer'],
    motifs: [
      'a motion line',
      'a shield with an arrow',
      'a pulse trace',
      'a mountain summit',
      'an abstract athletic form',
    ],
    cliches: ['a dumbbell'],
    style: 'modern',
    fontNote: { tr: 'Kalın sans (Poppins)', en: 'Bold sans (Poppins)' },
    palettes: [{ tr: 'Siyah + turuncu', en: 'Black and orange' }],
    toneWords: ['dynamic', 'strong', 'fast'],
  },
  {
    id: 'automotive',
    sectorId: 'transport',
    label: { tr: 'Otomotiv ve lojistik', en: 'Automotive and logistics' },
    keywords: ['=oto', 'otomotiv', 'kiralama', 'nakliyat', 'lojistik', 'rent a car', 'araç', 'filo', 'taşımacılık', 'kargo', 'automotive', 'logistics', 'transport', 'freight', 'car rental', 'garage'],
    motifs: [
      'a speed line',
      'a road in perspective',
      'a key',
      'a wheel ring',
      'a route pin',
    ],
    cliches: ['a car silhouette'],
    style: 'modern',
    fontNote: { tr: 'Sert sans (Poppins)', en: 'Hard-edged sans (Poppins)' },
    palettes: [{ tr: 'Antrasit + kırmızı', en: 'Anthracite and red' }],
    toneWords: ['fast', 'reliable', 'driven'],
  },
  {
    id: 'media',
    sectorId: 'creative',
    label: { tr: 'Fotoğraf ve medya', en: 'Photo and media' },
    keywords: ['fotoğraf', 'video', 'ajans', 'medya', 'stüdyo', 'sanat', 'tasarım', 'reklam', 'photo', 'photography', 'agency', 'media', 'studio', 'design', 'film'],
    motifs: [
      'a lens ring',
      'framing corner marks',
      'a light beam',
      'an ink drop',
    ],
    cliches: ['a camera silhouette'],
    style: 'minimal',
    fontNote: { tr: 'Zarif sans (Inter)', en: 'Elegant sans (Inter)' },
    palettes: [{ tr: 'Siyah + beyaz + kırmızı', en: 'Black, white and red' }],
    toneWords: ['visual', 'quiet', 'sharp'],
  },
  {
    id: 'service',
    sectorId: 'energy',
    label: { tr: 'Hizmet ve teknik servis', en: 'Services and repair' },
    keywords: ['temizlik', 'tamir', 'servis', 'tesisat', 'onarım', 'boya', 'elektrik', 'enerji', 'güneş', 'cleaning', 'repair', 'plumbing', 'maintenance', 'solar', 'energy', 'handyman'],
    motifs: [
      'a sparkle',
      'a drop',
      'a trust shield',
      'a key',
      'a completed ring',
    ],
    cliches: ['a broom', 'a wrench'],
    style: 'modern',
    fontNote: { tr: 'Dostça sans (Poppins)', en: 'Friendly sans (Poppins)' },
    palettes: [{ tr: 'Turkuaz + turuncu', en: 'Teal and orange' }],
    toneWords: ['dependable', 'friendly', 'clean'],
  },
  {
    id: 'travel',
    sectorId: 'travel',
    label: { tr: 'Seyahat ve turizm', en: 'Travel and tourism' },
    keywords: ['seyahat', 'turizm', 'otel', 'tatil', 'acente', 'rehber', 'travel', 'tourism', 'hotel', 'holiday', 'vacation', 'resort'],
    motifs: [
      'a compass rose with one offset point',
      'a lighthouse lens',
      'a route marker at a crossing',
      'a horizon line over waves',
    ],
    cliches: ['a plane silhouette', 'a globe'],
    style: 'classic',
    fontNote: { tr: 'Zarif serif (Playfair Display)', en: 'Elegant serif (Playfair Display)' },
    palettes: [{ tr: 'Okyanus mavisi + kum', en: 'Ocean blue and sand' }],
    toneWords: ['open', 'adventurous', 'calm'],
  },
  {
    id: 'generic',
    sectorId: 'other',
    label: { tr: 'Genel işletme', en: 'General business' },
    keywords: [],
    motifs: [
      'an abstract geometric form with a negative-space cut',
      'an interlocking crafted knot',
      'a balanced grid',
      'a folded ribbon joint',
    ],
    cliches: ['a plain globe', 'a handshake'],
    style: 'modern',
    fontNote: { tr: 'Geometrik sans (Poppins)', en: 'Geometric sans (Poppins)' },
    palettes: [{ tr: 'Marka renkleri', en: 'The brand colours' }],
    toneWords: ['clear', 'balanced'],
  },
]

export const PROFILE_BY_ID = new Map(SECTOR_PROFILES.map((profile) => [profile.id, profile]))

/** Profile shown when the user picked a dropdown sector and wrote nothing more specific. */
const DEFAULT_PROFILE_BY_SECTOR: Record<string, SectorProfileId> = {
  food: 'restaurant',
  health: 'clinic',
  beauty: 'jewelry',
  tech: 'software',
  construction: 'construction',
  education: 'education',
  sport: 'sport',
  legal: 'law',
  retail: 'ecommerce',
  transport: 'automotive',
  energy: 'service',
  events: 'events',
  travel: 'travel',
  nature: 'nature',
  creative: 'media',
  generic: 'generic',
  other: 'generic',
}

export function defaultProfileFor(sectorId: string): SectorProfile {
  return PROFILE_BY_ID.get(DEFAULT_PROFILE_BY_SECTOR[sectorId] ?? 'generic')!
}
