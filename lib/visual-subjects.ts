/**
 * Visual subject intelligence (pure, client-safe)
 * -----------------------------------------------
 * The hero/slider image is only as good as the SUBJECT we hand to the image
 * model. Previously the subject came from a short list of "sectors"
 * (dental / food / law / …), so anything outside that list — a moving company
 * ("nakliyat"), a cleaning service, a vet, a driving school — fell back to
 * "a clean modern professional workspace" and produced an unrelated office or
 * landscape photo.
 *
 * This module solves that generically:
 *  1. `resolveVisualTopic` maps ANY business keyword (TR or EN) found in the
 *     brief to a concrete, photographable scene.
 *  2. `describeVisualRequest` turns a freeform Turkish image request
 *     ("kamyonete ürün yükleyen personelli bir görsel") into explicit English
 *     visual nouns the image model actually understands.
 *  3. `detectHeroImageIntent` recognises "change the main/hero image" style
 *     instructions so the editor can regenerate the image deterministically
 *     instead of asking the LLM to rewrite the whole site (which used to drop
 *     the image entirely).
 *
 * Everything here is a pure function of strings — no server-only imports — so
 * both the client editor and the API routes can use it.
 */

/** Lowercases with Turkish rules, then folds diacritics for robust matching. */
export function fold(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Escapes regex metacharacters so a literal key can be embedded in a pattern. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Word-boundary containment on ALREADY-FOLDED ASCII text. This is the critical
 * guard that stops a short key like "tur" from matching inside an unrelated
 * word — most importantly "oluştur" (folded "olustur"), the Turkish verb
 * "create" that appears in almost every site-generation prompt. Plain
 * `String.includes` matched it and mislabeled nearly every brief as a travel
 * agency. We anchor on non-alphanumeric boundaries (the folded text is only
 * lowercase ascii + spaces) instead of `\b`, because JS `\b` treats the
 * remaining non-ascii edge cases inconsistently.
 */
function foldedWordIncludes(foldedText: string, foldedKey: string): boolean {
  const key = foldedKey.trim()
  if (!key) return false
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(key)}(?:[^a-z0-9]|$)`).test(foldedText)
}

/**
 * Public helper: word-boundary containment that folds BOTH operands first, so
 * callers can pass raw Turkish text and keys. Use this instead of
 * `text.includes(key)` whenever a key may be a short word that could appear as
 * a substring of a longer, unrelated word.
 */
export function wordIncludes(text: string, key: string): boolean {
  return foldedWordIncludes(fold(text), fold(key))
}

export type VisualTopic = {
  /** Short English label for the business, e.g. "moving & relocation company". */
  business: string
  /** A concrete, photographable scene for the hero image. */
  subject: string
}

type TopicEntry = VisualTopic & { keys: string[] }

/**
 * Keyword → scene dictionary. Keys are already diacritic-folded. Order matters:
 * the FIRST entry with a matching key wins, so more specific businesses are
 * listed before broader ones.
 */
const TOPICS: TopicEntry[] = [
  {
    keys: ['nakliyat', 'nakliye', 'evden eve', 'tasimacilik', 'tasima hizmet', 'moving company', 'movers', 'relocation', 'ev tasima', 'ofis tasima'],
    business: 'moving & relocation company',
    subject:
      'two uniformed movers carrying wrapped furniture and stacked cardboard boxes into an open white moving truck parked on a city street, hand truck and moving blankets visible, daytime',
  },
  {
    keys: ['lojistik', 'logistics', 'kargo', 'cargo', 'freight', 'tir filo', 'filo', 'depolama', 'warehouse', 'ambar', 'tedarik zinciri', 'supply chain'],
    business: 'logistics & freight company',
    subject:
      'a logistics warehouse loading dock with a truck backed in, a forklift moving stacked pallets and workers in high-visibility vests scanning parcels',
  },
  {
    keys: ['kurye', 'courier', 'teslimat', 'delivery', 'paket servis', 'son kilometre'],
    business: 'courier & delivery service',
    subject:
      'a courier in uniform handing a parcel to a customer next to a delivery van on a sunny residential street',
  },
  {
    keys: ['temizlik', 'cleaning', 'hijyen', 'housekeeping', 'ilaclama', 'pest control', 'haseresiz'],
    business: 'professional cleaning company',
    subject:
      'a professional cleaning team in matching uniforms with color-coded equipment cleaning a bright, spotless modern living room',
  },
  {
    keys: ['kuru temizleme', 'dry clean', 'camasirhane', 'laundry'],
    business: 'dry cleaning & laundry service',
    subject:
      'a tidy dry-cleaning shop counter with freshly pressed garments in protective covers on a conveyor rail',
  },
  {
    keys: ['oto servis', 'oto tamir', 'kaporta', 'lastik', 'oto yikama', 'car wash', 'auto repair', 'car service', 'mekanik', 'egzoz'],
    business: 'auto service & repair shop',
    subject:
      'a clean modern auto repair workshop with a car on a lift and a mechanic in uniform working with professional tools',
  },
  {
    keys: ['rent a car', 'arac kirala', 'araba kirala', 'car rental', 'transfer hizmet', 'vip transfer', 'taksi', 'taxi', 'sofor'],
    business: 'car rental & transfer service',
    subject:
      'a row of clean rental cars lined up in front of a modern rental office with a chauffeur opening a passenger door',
  },
  {
    keys: ['veteriner', 'veterinary', 'pet klinik', 'petshop', 'pet shop', 'evcil hayvan', 'kopek', 'kedi'],
    business: 'veterinary clinic',
    subject:
      'a friendly veterinarian in scrubs examining a happy dog on a clean stainless steel table in a bright modern vet clinic',
  },
  {
    keys: ['yoga', 'meditasyon', 'meditation'],
    business: 'yoga studio',
    subject:
      'a calm, sunlit yoga studio with rolled yoga mats on a light wooden floor, large windows with soft natural light, plants and a peaceful stretching and meditation space, no weight machines',
  },
  {
    keys: ['pilates', 'reformer'],
    business: 'pilates studio',
    subject:
      'a bright, minimal pilates studio with pilates reformer machines lined up on a light wooden floor, an instructor guiding a client through a controlled movement, soft natural light, no weight racks',
  },
  {
    keys: ['spor salon', 'spor salonu', 'spor salonlari', 'fitness', 'gym', 'crossfit', 'antrenman', 'personal train'],
    business: 'fitness studio / gym',
    subject:
      'a spacious modern gym interior with matte black equipment, a trainer coaching an athlete, dramatic side lighting',
  },
  {
    keys: ['otel', 'hotel', 'pansiyon', 'butik otel', 'konaklama', 'apart', 'resort', 'villa kirala'],
    business: 'hotel / hospitality business',
    subject:
      'an elegant boutique hotel lobby and terrace at golden hour with warm lighting, plants and a welcoming reception',
  },
  {
    keys: ['tur', 'turizm', 'seyahat', 'travel agency', 'tour', 'gezi', 'tatil'],
    business: 'travel agency / tour operator',
    subject:
      'a smiling travel guide with a small group of travellers overlooking a scenic coastal landmark, bright natural light',
  },
  {
    keys: ['kurs', 'egitim', 'dershane', 'akademi', 'dil okul', 'language school', 'education', 'training center', 'ozel ders'],
    business: 'education & training academy',
    subject:
      'a bright modern classroom with engaged adult students and an instructor at a large display screen',
  },
  {
    keys: ['kres', 'anaokul', 'kindergarten', 'daycare', 'cocuk kulubu'],
    business: 'preschool / daycare',
    subject:
      'a colorful, safe preschool playroom with soft mats, wooden toys and natural daylight through big windows',
  },
  {
    keys: ['elektrik', 'electrician', 'tesisat', 'plumb', 'su tesisat', 'kombi', 'klima', 'hvac', 'dogalgaz'],
    business: 'electrical & plumbing services',
    subject:
      'a technician in branded workwear with a tool bag installing equipment in a residential utility area, focused and professional',
  },
  {
    keys: ['peyzaj', 'landscap', 'bahce', 'garden', 'cim', 'havuz', 'pool'],
    business: 'landscaping & garden design',
    subject:
      'a beautifully landscaped garden with trimmed lawn, stone path and modern outdoor lighting at dusk',
  },
  {
    keys: ['mobilya', 'furniture', 'dekorasyon', 'decor', 'ic mimar', 'interior design', 'perde', 'mutfak dolab'],
    business: 'furniture & interior decoration',
    subject:
      'a styled contemporary living room with designer furniture, layered textures and soft natural light',
  },
  {
    keys: ['cicek', 'florist', 'flower'],
    business: 'flower shop',
    subject:
      'a charming florist workshop bench with fresh seasonal bouquets being arranged, soft daylight',
  },
  {
    keys: ['dugun', 'wedding', 'organizasyon', 'event', 'davet', 'nikah'],
    business: 'wedding & event planning',
    subject:
      'an elegantly decorated wedding reception table setting with candles and florals under warm string lights',
  },
  {
    keys: ['catering', 'yemek fabrika', 'toplu yemek'],
    business: 'catering company',
    subject:
      'a catering team plating refined canapés on a long buffet at an upscale event, warm ambient light',
  },
  {
    keys: ['pastane', 'patisserie', 'bakery', 'firin', 'tatli', 'pasta siparis'],
    business: 'bakery & patisserie',
    subject:
      'a warm bakery display filled with fresh pastries and layered cakes behind glass, morning light',
  },
  {
    keys: ['market', 'bakkal', 'kasap', 'butcher', 'sarkuteri', 'manav', 'grocery'],
    business: 'grocery / butcher shop',
    subject:
      'an inviting neighbourhood grocery interior with abundant fresh produce neatly displayed under clean lighting',
  },
  {
    keys: ['eczane', 'pharmacy', 'medikal', 'medical supply', 'saglik market'],
    business: 'pharmacy / medical supplies',
    subject:
      'a clean modern pharmacy interior with organized shelves and a pharmacist in a white coat at the counter',
  },
  {
    keys: ['fizyoterapi', 'physiotherapy', 'diyetisyen', 'dietitian', 'psikolog', 'psycholog', 'terapi', 'danismanlik merkez'],
    business: 'health & therapy practice',
    subject:
      'a calm, minimal therapy room with soft neutral tones, a comfortable seating arrangement and gentle daylight',
  },
  {
    keys: ['hastane', 'poliklinik', 'tip merkez', 'clinic', 'saglik merkez', 'goz merkez', 'estetik cerrah'],
    business: 'medical clinic',
    subject:
      'a bright, modern medical clinic reception with clean white surfaces and reassuring soft blue accents',
  },
  {
    keys: ['berber', 'barber', 'erkek kuafor'],
    business: 'barbershop',
    subject:
      'a stylish barbershop interior with leather chairs, warm Edison lighting and a barber finishing a haircut',
  },
  {
    keys: ['kuyumcu', 'jewel', 'takı', 'taki', 'gold shop'],
    business: 'jewellery store',
    subject:
      'a luxurious jewellery display case with fine gold and diamond pieces under focused spotlighting on dark velvet',
  },
  {
    keys: ['gozluk', 'optik', 'optic', 'eyewear'],
    business: 'optician / eyewear store',
    subject:
      'a modern optician showroom with rows of designer eyeglasses on backlit shelves',
  },
  {
    keys: ['dovme', 'tattoo', 'piercing'],
    business: 'tattoo studio',
    subject:
      'a clean professional tattoo studio with an artist working under a focused lamp, moody atmosphere',
  },
  {
    keys: ['guvenlik', 'security', 'kamera sistem', 'alarm sistem', 'cctv'],
    business: 'security systems company',
    subject:
      'a security control room with multiple monitors showing camera feeds and a technician installing a CCTV camera',
  },
  {
    keys: ['matbaa', 'printing', 'baski', 'reklam ajans', 'tabela', 'signage'],
    business: 'printing & signage company',
    subject:
      'a large-format printing workshop with a wide printer producing vivid graphics and stacked printed sheets',
  },
  {
    keys: ['tekstil', 'textile', 'konfeksiyon', 'terzi', 'tailor', 'kumas'],
    business: 'textile & tailoring workshop',
    subject:
      'a tailoring atelier with fabric rolls, a sewing machine in use and garments on a rack, warm workshop light',
  },
  {
    keys: ['tarim', 'agriculture', 'sera', 'greenhouse', 'ciftlik', 'farm', 'hayvancilik', 'zeytinyag', 'bal '],
    business: 'agriculture / farm business',
    subject:
      'a sunlit farm field with rows of healthy crops and a farmer inspecting produce, golden hour',
  },
  {
    keys: ['hafriyat', 'excavat', 'insaat', 'construction', 'muteahhit', 'beton', 'demir celik', 'iskele'],
    business: 'construction company',
    subject:
      'an active construction site with an excavator, steel framework and engineers in hard hats reviewing plans',
  },
  {
    keys: ['mermer', 'granit', 'dogal tas', 'marble', 'stone works'],
    business: 'marble & natural stone works',
    subject:
      'a stone workshop with polished marble slabs standing in racks and a craftsman finishing an edge',
  },
  {
    keys: ['celik kapi', 'pvc dogram', 'aluminyum', 'cam balkon', 'joinery', 'window'],
    business: 'doors & windows manufacturer',
    subject:
      'a modern showroom of aluminium and PVC window systems with a technician measuring a frame',
  },
  {
    keys: ['gunes panel', 'solar', 'enerji', 'energy', 'yenilenebilir'],
    business: 'solar & renewable energy company',
    subject:
      'technicians installing solar panels on a large rooftop under a clear blue sky, wide cinematic view',
  },
  {
    keys: ['bilgisayar tamir', 'telefon tamir', 'teknik servis', 'repair service', 'beyaz esya servis'],
    business: 'technical repair service',
    subject:
      'a technician at a well-lit repair bench with precision tools disassembling a device, organized parts trays',
  },
  {
    keys: ['sigorta', 'insurance'],
    business: 'insurance agency',
    subject:
      'an advisor explaining a policy to a couple across a bright office desk, trustworthy and calm atmosphere',
  },
  {
    keys: ['muhasebe', 'accounting', 'mali musavir', 'bookkeeping', 'vergi'],
    business: 'accounting firm',
    subject:
      'an accountant reviewing financial reports and charts at a tidy desk in a bright professional office',
  },
  {
    keys: ['su aritma', 'water treatment', 'ariti sistem'],
    business: 'water treatment systems',
    subject:
      'a clean water filtration system installation in a bright utility room with a technician checking the unit',
  },
  {
    keys: ['asansor', 'elevator', 'yuruyen merdiven'],
    business: 'elevator systems company',
    subject:
      'a modern stainless steel elevator interior in a contemporary building lobby with a technician servicing the panel',
  },
]

/**
 * Resolves the most fitting photographable scene for a freeform brief.
 * Returns `null` when nothing matches, so the caller can fall back to its own
 * sector-based default.
 */
export function resolveVisualTopic(text: string): VisualTopic | null {
  const t = fold(text)
  if (!t) return null
  for (const entry of TOPICS) {
    // Word-boundary match: a short key like "tur" must NOT match inside
    // "olustur" (the folded "oluştur" present in nearly every prompt).
    if (entry.keys.some((k) => foldedWordIncludes(t, k))) {
      return { business: entry.business, subject: entry.subject }
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*  Freeform image request → explicit English visual terms                    */
/* -------------------------------------------------------------------------- */

/**
 * Turkish → English visual vocabulary. Image models are English-centric, so a
 * request like "kamyonete koli yükleyen personel" must become
 * "workers loading cardboard boxes into a van" to be rendered faithfully.
 * Longest keys first so multi-word phrases win over single words.
 */
const VISUAL_TERMS: Record<string, string> = {
  'evden eve nakliyat': 'house-to-house moving service',
  'esya tasima': 'furniture moving',
  'urun yukleme': 'loading goods',
  'yukleme yapan': 'loading',
  'kamyonet': 'white delivery van',
  'kamyon': 'moving truck',
  'tir': 'semi truck',
  'minibus': 'minibus',
  'forklift': 'forklift',
  'palet': 'pallets',
  'koli': 'cardboard boxes',
  'kutu': 'cardboard boxes',
  'ambalaj': 'packaging materials',
  'paketleme': 'packing with stretch wrap and bubble wrap',
  'esya': 'household furniture and belongings',
  'mobilya': 'furniture',
  'personel': 'uniformed staff members',
  'isci': 'uniformed workers',
  'calisan': 'uniformed employees',
  'ekip': 'a professional team',
  'usta': 'a skilled craftsman',
  'sofor': 'a driver',
  'musteri': 'a customer',
  'asansorlu tasima': 'exterior furniture lift used for moving',
  'depo': 'warehouse',
  'vinc': 'crane',
  'merdiven': 'ladder',
  'uniforma': 'branded uniforms',
  'gulen': 'smiling',
  'aile': 'a family',
  'ofis': 'office',
  'ev': 'home',
  'sokak': 'street',
  'sehir': 'city',
  'gunduz': 'daytime',
  'gece': 'night',
  'yagmur': 'rain',
  'kar': 'snow',
}

/**
 * Turns a freeform (usually Turkish) image request into an explicit English
 * subject line. The original wording is preserved as supporting context so
 * nothing the user asked for is lost.
 */
export function describeVisualRequest(request: string): string {
  const folded = fold(request)
  const hits: string[] = []
  for (const key of Object.keys(VISUAL_TERMS).sort((a, b) => b.length - a.length)) {
    if (folded.includes(key) && !hits.includes(VISUAL_TERMS[key])) hits.push(VISUAL_TERMS[key])
  }
  if (hits.length === 0) return request.trim()
  return `${hits.join(', ')} (as requested: "${request.trim()}")`
}

/* -------------------------------------------------------------------------- */
/*  Hero image edit intent                                                    */
/* -------------------------------------------------------------------------- */

/** Words that mean "image" in the editor instructions we accept. */
const IMAGE_WORDS = /(gorsel|resim|fotograf|foto|image|photo|picture|banner|slider|slayt|kapak)/
/** Words that mean the user wants it changed/created. */
const CHANGE_WORDS =
  /(degistir|guncelle|yenile|olustur|tasarla|ekle|koy|yap|uret|change|replace|update|regenerate|generate|create|design|swap)/
/** Explicitly about the main/hero visual rather than a gallery/team photo. */
const HERO_WORDS = /(ana|hero|kapak|ust|birinci|slider|slayt|main|header|banner)/

export type HeroImageIntent = {
  /** The visual description extracted from the instruction (may be empty). */
  request: string
}

/**
 * Detects "change the hero image" style instructions and extracts the visual
 * description. Returns `null` when the instruction is not about the hero image,
 * so the caller can continue with its normal editing pipeline.
 */
export function detectHeroImageIntent(instruction: string): HeroImageIntent | null {
  const folded = fold(instruction)
  if (!IMAGE_WORDS.test(folded)) return null
  if (!CHANGE_WORDS.test(folded)) return null
  // A gallery/team/portfolio photo request is NOT a hero image edit.
  if (/(galeri|gallery|ekip|team|portfoy|portfolio|urun kart|logo|favicon)/.test(folded)) return null
  // Require a hero cue OR a bare "görseli değiştir" (no other section named).
  const mentionsHero = HERO_WORDS.test(folded)
  const mentionsOtherSection = /(hizmet|service|hakkimizda|about|yorum|fiyat|iletisim|contact|sss|faq)/.test(folded)
  if (!mentionsHero && mentionsOtherSection) return null

  // Strip the command scaffolding so only the visual description remains.
  const request = instruction
    .replace(/^(lutfen|please)\s+/i, '')
    .replace(
      /\b(ana|hero|kapak|slider|slayt|main|header|banner)\s*(g[öo]rsel\w*|resm\w*|foto\w*|image|photo|picture)?\s*(i[çc]in|for)?\b/gi,
      ' ',
    )
    .replace(
      /\b(ile\s+)?(de[ğg]i[şs]tir\w*|g[üu]ncelle\w*|yenile\w*|olu[şs]tur\w*|tasarla\w*|yap\w*|[üu]ret\w*|change|replace|update|regenerate|generate|create|design)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  return { request }
}
