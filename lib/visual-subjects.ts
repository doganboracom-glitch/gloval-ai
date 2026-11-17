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
  /** Look-alike subjects that must NOT appear (wrong-sector associations). */
  avoid?: string
}

type TopicEntry = VisualTopic & { keys: string[] }

/**
 * Keyword → scene dictionary. Keys are normalized with diacritic-folded word
 * matching; topic selection scores every entry rather than relying on order.
 */
const TOPICS: TopicEntry[] = [
  {
    keys: ['nakliyat', 'nakliye', 'evden eve', 'tasimacilik', 'tasima hizmet', 'moving company', 'movers', 'relocation', 'ev tasima', 'ofis tasima'],
    business: 'moving & relocation company',
    subject:
      'two uniformed movers carrying wrapped furniture and stacked cardboard boxes into an open white moving truck parked on a city street, hand truck and moving blankets visible, daytime',
  },
  {
    keys: ['lojistik', 'logistics', 'kargo', 'cargo', 'freight forwarding', 'freight forwarder', 'tir filo', 'fleet management', 'freight company', 'depolama', 'warehouse', 'ambar', 'tedarik zinciri', 'supply chain'],
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
    keys: ['oto servis', 'oto tamir', 'kaporta', 'oto yikama', 'car wash', 'auto repair', 'car service', 'egzoz'],
    business: 'auto service & repair shop',
    subject:
      'a clean modern auto repair workshop with a car on a lift and a mechanic in uniform working with professional tools',
  },
  {
    keys: ['rent a car', 'arac kirala', 'araba kirala', 'car rental', 'soforlu arac kiralama', 'chauffeur transfer', 'vip transfer', 'taksi', 'taxi'],
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
    keys: ['otel', 'hotel', 'pansiyon', 'butik otel', 'konaklama', 'apart otel', 'aparthotel', 'resort', 'villa kirala'],
    business: 'hotel / hospitality business',
    subject:
      'an elegant boutique hotel lobby and terrace at golden hour with warm lighting, plants and a welcoming reception',
  },
  {
    keys: ['seyahat acentesi', 'turizm acentesi', 'travel agency', 'tour operator', 'gezi turu', 'tur organizasyonu', 'tatil paketi', 'holiday booking'],
    business: 'travel agency / tour operator',
    subject:
      'a smiling travel guide with a small group of travellers overlooking a scenic coastal landmark, bright natural light',
  },
  {
    keys: ['kurs merkezi', 'meslek kursu', 'dil kursu', 'yazilim kursu', 'programlama kursu', 'dershane', 'dil okul', 'language school', 'training center', 'training academy', 'coding bootcamp', 'ozel ders'],
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
    keys: ['elektrikci', 'elektrik tesisati', 'elektrik taahhut', 'electrician', 'electrical contractor', 'electrical service'],
    business: 'electrical contractor',
    subject: 'a licensed electrician installing a residential electrical panel with organized wiring and safe professional tools, realistic utility-room setting',
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
    keys: ['cicekci', 'cicek dukkan', 'florist', 'flower shop'],
    business: 'flower shop',
    subject:
      'a charming florist workshop bench with fresh seasonal bouquets being arranged, soft daylight',
  },
  {
    keys: ['dugun', 'wedding', 'wedding planner', 'gelin', 'nikah'],
    business: 'wedding planning & celebration',
    subject:
      'an elegant wedding reception venue with refined floral arrangements, candlelit dining tables and soft ambient lighting',
    avoid: 'readable signage, logos, generic corporate offices, unrelated storefronts',
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
    // MUST stay before the grocery entry: "kasap" (butcher) used to share an
    // entry with "manav" and rendered a produce-stand hero for a meat shop.
    // "kasabi" is the possessive form seen in business names ("Mahalle Kasabı");
    // the town "kasaba" is deliberately NOT a key.
    keys: [
      'kasap',
      'kasaplar',
      'kasabi',
      'butcher',
      'butchery',
      'butcher shop',
      'et market',
      'et urunleri',
      'et ve et urunleri',
      'et dukkani',
      'sarkuteri',
      'charcuterie',
      'meat shop',
    ],
    business: 'butcher shop',
    subject:
      'a traditional butcher shop interior with a glass meat counter full of fresh cuts of red meat on display (beef steaks, lamb chops, ground meat, sausages), a butcher in an apron cutting meat on a wooden block, hanging cuts, clean white tiles and warm lighting',
    avoid:
      'fruits, vegetables, fresh produce, greengrocer stalls, supermarket aisles, grocery shelves, baskets of produce',
  },
  {
    keys: ['bakkal', 'manav', 'grocery store', 'food market', 'greengrocer', 'supermarket'],
    business: 'grocery store / greengrocer',
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
    keys: ['fizyoterapi', 'physiotherapy', 'diyetisyen', 'dietitian', 'psikolog', 'psycholog', 'psychotherapy practice', 'therapy practice', 'danismanlik merkez'],
    business: 'health & therapy practice',
    subject:
      'a calm, minimal therapy room with soft neutral tones, a comfortable seating arrangement and gentle daylight',
  },
  {
    keys: ['hastane', 'poliklinik', 'tip merkez', 'medical clinic', 'saglik merkez', 'goz merkez', 'estetik cerrah'],
    business: 'medical clinic',
    subject:
      'a bright, modern medical clinic reception with clean white surfaces and reassuring soft blue accents',
  },
  {
    keys: ['berber', 'berberi', 'berber salonu', 'barber', 'barbershop', 'erkek kuafor'],
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
    keys: ['guvenlik sistemleri', 'security systems', 'security camera', 'kamera sistemi', 'alarm sistemi', 'cctv installation'],
    business: 'security systems company',
    subject:
      'a security control room with multiple monitors showing camera feeds and a technician installing a CCTV camera',
  },
  {
    keys: [
      'radyo',
      'radyo istasyon',
      'radyo studyosu',
      'radyoculuk',
      'radio',
      'radio station',
      'radio studio',
      'radio broadcaster',
      'broadcast studio',
      'broadcasting',
      'yayincilik',
      'yayinci',
    ],
    business: 'radio station / broadcaster',
    subject:
      'an authentic on-air radio studio with a presenter speaking into a broadcast microphone, professional audio mixing console and over-ear headphones at the desk, acoustic treatment, a small ON AIR light and subtle music equipment, warm focused studio lighting',
    avoid:
      'bakery ovens, bread, pastries, restaurant kitchens, corporate suits, office meetings, generic business-office stock photography, unrelated stock scenery',
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
    keys: ['tarim', 'agriculture', 'sera', 'greenhouse', 'ciftlik', 'farm', 'hayvancilik', 'zeytinyag'],
    business: 'agriculture / farm business',
    subject:
      'a sunlit farm field with rows of healthy crops and a farmer inspecting produce, golden hour',
  },
  {
    keys: ['hafriyat', 'excavation', 'insaat firmasi', 'insaat sirketi', 'construction company', 'building contractor', 'muteahhit', 'muteahhitler', 'beton santrali', 'demir celik', 'iskele', 'celik konstruksiyon', 'steel construction', 'structural steel', 'steel fabrication', 'steel frame'],
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
    keys: ['pvc dogram', 'aluminyum dograma', 'aluminyum ve pvc dograma', 'aluminyum pvc', 'cam balkon', 'window systems', 'window manufacturer', 'joinery'],
    business: 'doors & windows manufacturer',
    subject:
      'a modern showroom of aluminium and PVC window systems with a technician measuring a frame',
  },
  {
    keys: ['gunes panel', 'gunes enerjisi', 'solar energy', 'solar panel installation', 'renewable energy', 'renewable energy company'],
    business: 'solar & renewable energy company',
    subject:
      'technicians installing solar panels on a large rooftop under a clear blue sky, wide cinematic view',
  },
  {
    keys: ['bilgisayar tamir', 'telefon tamir', 'teknik servis', 'device repair', 'electronics repair'],
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
  {
    keys: [
      'dj',
      'disc jockey',
      'nightclub',
      'night club',
      'nightlife',
      'gece kulubu',
      'gece hayati',
      'live music',
      'music venue',
      'music event',
      'music festival',
      'musician',
      'band',
      'concert',
      'konser',
    ],
    business: 'live music & nightlife venue',
    subject:
      'a DJ performing on a professional controller at a live music venue, concert lighting and speakers, a dancing crowd in silhouette, atmospheric event photography',
    avoid:
      'music classrooms, school desks, lesson settings, readable stage signs, logos, generic offices and unrelated retail products',
  },
  {
    keys: [
      'event planning',
      'event planner',
      'event organizer',
      'event organisation',
      'event organization',
      'event management',
      'event production',
      'etkinlik planlama',
      'etkinlik organizasyonu',
      'organizasyon firmasi',
      'davet organizasyonu',
      'party planning',
      'party planner',
      'party organizer',
      'parti organizasyonu',
      'kutlama organizasyonu',
      'celebration planning',
    ],
    business: 'event planning & production',
    subject:
      'a celebration venue being prepared for an event, coordinated banquet tables and floral decor, discreet event lighting and a production crew in the background',
    avoid: 'readable signage, logos, generic corporate offices, unrelated storefronts',
  },
  {
    keys: ['locksmith', 'cilingir', 'anahtarci', 'anahtar kopyalama', 'key cutting', 'lock repair', 'locksmith service'],
    business: 'locksmith & key service',
    subject: 'a professional locksmith at a clean key-cutting bench, precision key machine and neatly arranged lock cylinders, natural workshop light',
    avoid: 'mechanic garages, tire shops, unrelated construction sites, readable signs or logos',
  },
  {
    keys: ['ozel okul', 'private school', 'high school', 'primary school', 'elementary school', 'kolej', 'ilkokul', 'ortaokul', 'lise', 'school enrollment'],
    business: 'private school',
    subject: 'a welcoming school entrance and bright classroom with students learning together, books and learning materials visible, natural daylight',
  },
  {
    keys: ['music school', 'music academy', 'music lesson', 'music lessons', 'music class', 'music classes', 'music education', 'music teacher', 'muzik okulu', 'muzik akademisi', 'muzik dersi', 'muzik kursu', 'muzik egitimi', 'muzik ogretmeni'],
    business: 'music school',
    subject: 'a real music school lesson with a teacher guiding a student at a piano, instrument cases and sheet music in a bright practice room, no stage or nightclub lighting',
    avoid: 'concert stages, nightclubs, DJ booths, unrelated retail interiors',
  },
  {
    keys: ['ebe klinigi', 'ebelik', 'dogum evi', 'birth center', 'midwife clinic', 'midwifery clinic', 'midwife practice', 'maternity care clinic'],
    business: 'midwifery & maternity care clinic',
    subject: 'a calm, modern maternity care consultation room with a midwife speaking warmly with an expecting parent, clean clinical tools and soft daylight',
    avoid: 'surgical scenes, hospital emergency rooms, readable signage or logos',
  },
  {
    keys: ['kitapci', 'kitabevi', 'kitap evi', 'bookshop', 'bookstore', 'independent bookstore', 'indie bookstore'],
    business: 'independent bookstore',
    subject: 'an independent neighborhood bookstore with carefully arranged shelves, a small new-release display and a bookseller helping a visitor, warm natural light',
    avoid: 'library checkout machines, supermarket aisles, readable book titles, logos',
  },
  {
    keys: ['kombi servisi', 'kombi bakimi', 'kombi montaji', 'boiler service', 'boiler repair', 'boiler maintenance', 'heating system service'],
    business: 'boiler & heating service',
    subject: 'a qualified heating technician servicing a wall-mounted boiler in a tidy utility room, diagnostic tools and pipework clearly visible',
  },
  {
    keys: ['klima servisi', 'klima bakimi', 'klima montaji', 'air conditioning repair', 'air conditioning service', 'air conditioner installation', 'hvac service', 'hvac contractor'],
    business: 'air conditioning & HVAC service',
    subject: 'an HVAC technician carefully installing or servicing an indoor air-conditioning unit, gauges and clean tools visible in a real home interior',
  },
  {
    keys: ['tesisatci', 'tesisat ustasi', 'sihhi tesisat', 'su tesisati', 'su kacagi tamiri', 'plumber', 'plumbing service', 'pipe fitting', 'leak repair'],
    business: 'plumbing service',
    subject: 'a plumber in workwear repairing a clean residential water-pipe connection under a sink, practical tools and fittings visible',
  },
  {
    keys: ['beyaz esya servisi', 'beyaz esya tamiri', 'appliance repair', 'white goods repair', 'washer repair', 'refrigerator repair', 'dishwasher repair'],
    business: 'home appliance repair service',
    subject: 'a skilled appliance repair technician diagnosing a washing machine on a clean service bench, replacement parts and tools organized nearby',
  },
  {
    keys: ['boya badana', 'boya ustasi', 'ic cephe boya', 'ic mekan boya', 'painting contractor', 'house painter', 'interior painting'],
    business: 'painting & decorating contractor',
    subject: 'a professional decorator carefully painting a bright room, clean roller tools and neatly protected trim, natural daylight',
  },
  {
    keys: ['hali yikama', 'hali temizleme', 'carpet cleaning', 'rug cleaning', 'hali yikama fabrikasi'],
    business: 'carpet & rug cleaning service',
    subject: 'a carpet-cleaning professional using an extraction machine on a patterned rug in a tidy cleaning workshop, equipment and clean water visible',
  },
  {
    keys: ['hirdavat', 'hirdavatci', 'hirdavat magazasi', 'hardware store', 'builders merchant', 'building supplies store'],
    business: 'hardware & building supplies store',
    subject: 'a neighborhood hardware shop with organized hand tools, fasteners and building supplies on shelves, a shopkeeper helping a customer',
  },
  {
    keys: ['camci', 'cam ve ayna', 'cam ayna atoly', 'ayna imalat', 'ayna tasarim', 'glass and mirror', 'mirror shop', 'glazier', 'glass workshop', 'glass cutting service'],
    business: 'glass & mirror workshop',
    subject: 'a glazier measuring and finishing a glass panel at a clean glass-and-mirror workshop, protective gloves and cutting tools visible',
  },
  {
    keys: ['cati', 'cati kaplama', 'cati izolasyon', 'cati ustasi', 'cati ve izolasyon', 'su yalitim', 'roofing contractor', 'roof insulation', 'roofing company', 'waterproofing service'],
    business: 'roofing & waterproofing contractor',
    subject: 'roofing professionals applying a waterproof membrane to a real roof, safety harnesses and roofing tools visible under daylight',
  },
  {
    keys: ['asma tavan', 'tavan sistemleri', 'suspended ceiling', 'drop ceiling installer', 'acoustic ceiling installation'],
    business: 'suspended ceiling & interior systems contractor',
    subject: 'an installer fitting a clean suspended ceiling grid inside a modern room, measured panels and practical installation tools visible',
  },
  {
    keys: ['celik kapi', 'guvenlik kapi', 'celik guvenlik kapi', 'security door', 'steel security door', 'security gate installation'],
    business: 'security door & gate company',
    subject: 'a sturdy modern steel security door being installed by a technician at a finished residential entrance, accurate hardware and clean workmanship',
  },
  {
    keys: ['oto lastik', 'lastikci', 'lastik servisi', 'lastik tamiri', 'tire shop', 'tire service', 'tire repair', 'tyre shop', 'tyre fitting'],
    business: 'tire shop & service',
    subject: 'a tire technician fitting a new tire on a wheel-balancing machine inside a clean automotive tire service bay',
    avoid: 'general mechanic garages, engine repair, construction machinery, unrelated retail goods',
  },
  {
    keys: ['oto kuafor', 'arac detayli temizlik', 'oto detay', 'car detailing', 'auto detailing', 'paint correction', 'ceramic coating service', 'detailing studio'],
    business: 'automotive detailing studio',
    subject: 'a detailer carefully polishing a clean modern car in a bright detailing bay, microfiber cloths and paint-correction tools visible, premium documentary photography',
  },
  {
    keys: ['freight brokerage', 'freight broker', 'lojistik broker', 'tasimacilik araciligi', 'nakliye komisyoncusu'],
    business: 'freight brokerage & dispatch service',
    subject: 'a freight dispatcher coordinating truck routes at a professional logistics desk with a route board and a truck yard visible through the window',
  },
  {
    keys: ['fotograf ve video', 'video prodüksiyon', 'video production', 'photo video studio', 'film production', 'wedding photography', 'dugun fotografciligi', 'dugun fotografcisi', 'wedding photographer', 'fotograf studyosu'],
    business: 'photography & video production studio',
    subject: 'a professional photographer and videographer preparing a camera and lighting setup for a wedding shoot, real production equipment and an elegant venue in soft focus',
  },
  {
    keys: ['kuafor', 'hair salon', 'hairdresser', 'hair studio', 'hair styling salon'],
    business: 'hair salon',
    subject: 'a contemporary hair salon with styling chairs, mirrors and a stylist finishing a client haircut, bright natural light',
  },
  {
    keys: ['mental health counselor', 'mental health counselling', 'mental health counseling', 'psychotherapist', 'psychotherapy practice', 'counselor practice', 'counselling center', 'counseling center', 'psikoterapi', 'psikoterapi merkezi', 'psikolojik danismanlik', 'ruh sagligi danismani'],
    business: 'mental health counseling practice',
    subject: 'a calm, private counseling room with two comfortable chairs, a mental health professional listening attentively and soft natural light',
  },
  {
    keys: ['bal uretimi', 'bal ureticisi', 'aricilik', 'beekeeper', 'honey producer', 'honey farm', 'honey production'],
    business: 'beekeeping & honey producer',
    subject: 'a beekeeper in protective clothing inspecting healthy hives in a flowering orchard, honey jars and beekeeping tools nearby',
  },
  {
    keys: ['emlak', 'emlak ofisi', 'gayrimenkul danismanligi', 'real estate agency', 'real estate agent', 'property agency', 'property consultant'],
    business: 'real estate agency',
    subject: 'a real estate agent presenting a bright modern home interior to a couple, architectural details and a welcoming living space in view',
  },
  {
    keys: ['mimarlik', 'mimar', 'mimarlik ofisi', 'architecture studio', 'architectural design firm', 'architect office'],
    business: 'architecture studio',
    subject: 'an architect reviewing a refined building model and technical drawings inside a contemporary architecture studio with daylight',
  },
]

/**
 * Resolves all matching topics with source-weighted evidence. Specific phrases
 * score above incidental single-word matches; close competing topics are marked
 * ambiguous for the async brief fallback to resolve.
 */
export type VisualTopicSignals = {
  businessName?: string
  tagline?: string
  serviceTitles?: string[]
  audience?: string
  rest?: string
}

export type VisualTopicCandidate = {
  topic: VisualTopic
  score: number
  matchedKeys: string[]
  matchedSources: string[]
}

export type VisualTopicResolution = {
  topic: VisualTopic | null
  bestTopic: VisualTopic | null
  ambiguous: boolean
  candidates: VisualTopicCandidate[]
}

const MUSIC_EDUCATION_KEYS = [
  'music school', 'music academy', 'music lesson', 'music lessons', 'music class',
  'music classes', 'music education', 'music teacher', 'muzik okulu',
  'muzik akademisi', 'muzik dersi', 'muzik kursu', 'muzik egitimi', 'muzik ogretmeni',
]
const MUSIC_PERFORMANCE_KEYS = [
  'dj', 'disc jockey', 'nightclub', 'night club', 'nightlife', 'gece kulubu',
  'live music', 'music venue', 'music event', 'music festival', 'musician',
  'canli muzik', 'muzik etkinligi', 'muzik grubu',
]

const VISUAL_SIGNAL_WEIGHTS = {
  businessName: 18,
  tagline: 18,
  serviceTitle: 6,
  audience: 5,
  rest: 2,
} as const

function keySpecificity(key: string): number {
  const normalized = key.trim()
  const wordCount = normalized.split(/\s+/).length
  return 1 + Math.max(0, wordCount - 1) * 0.45 + Math.min(normalized.length, 40) / 160
}

function matchingTopicKey(keys: string[], text: string): string | undefined {
  return keys
    .filter((key) => foldedWordIncludes(text, key))
    .sort((a, b) => keySpecificity(b) - keySpecificity(a))[0]
}

export function resolveVisualTopicSignals(signals: VisualTopicSignals): VisualTopicResolution {
  const sourceTexts = [
    { name: 'businessName', text: signals.businessName || '', weight: VISUAL_SIGNAL_WEIGHTS.businessName },
    { name: 'tagline', text: signals.tagline || '', weight: VISUAL_SIGNAL_WEIGHTS.tagline },
    ...(signals.serviceTitles || []).map((text, index) => ({
      name: `serviceTitle:${index}`,
      text,
      weight: VISUAL_SIGNAL_WEIGHTS.serviceTitle,
    })),
    { name: 'audience', text: signals.audience || '', weight: VISUAL_SIGNAL_WEIGHTS.audience },
    { name: 'rest', text: signals.rest || '', weight: VISUAL_SIGNAL_WEIGHTS.rest },
  ].filter((source) => fold(source.text))

  const allText = fold(sourceTexts.map((source) => source.text).join(' '))
  const musicEducation = MUSIC_EDUCATION_KEYS.some((key) => foldedWordIncludes(allText, key))
  const explicitMusicPerformance = MUSIC_PERFORMANCE_KEYS.some((key) => foldedWordIncludes(allText, key))

  const candidates = TOPICS.flatMap((entry): VisualTopicCandidate[] => {
    if (entry.business === 'live music & nightlife venue' && musicEducation && !explicitMusicPerformance) {
      return []
    }

    const matchedKeys: string[] = []
    const matchedSources: string[] = []
    let score = 0

    for (const source of sourceTexts) {
      const key = matchingTopicKey(entry.keys, fold(source.text))
      if (!key) continue
      score += source.weight * keySpecificity(key)
      matchedKeys.push(key)
      matchedSources.push(source.name)
    }

    if (!score) return []
    return [{
      topic: { business: entry.business, subject: entry.subject, avoid: entry.avoid },
      score,
      matchedKeys,
      matchedSources,
    }]
  }).sort((a, b) => b.score - a.score)

  const best = candidates[0]
  const runnerUp = candidates[1]
  const ambiguous = Boolean(
    best && runnerUp && best.score - runnerUp.score <= Math.max(1, best.score * 0.12),
  )

  return {
    topic: !ambiguous ? best?.topic ?? null : null,
    bestTopic: best?.topic ?? null,
    ambiguous,
    candidates: candidates.slice(0, 5),
  }
}

/** Returns an unambiguous keyword topic, or `null` for no match / close tie. */
export function resolveVisualTopic(text: string): VisualTopic | null {
  return resolveVisualTopicSignals({ rest: text }).topic
}

/**
 * Finds the dictionary topic whose generated scene appears VERBATIM in `text`.
 * Used to tell a stale system-written prompt (e.g. the old greengrocer scene on
 * a butcher site) apart from wording the user actually typed: a person never
 * reproduces a whole dictionary sentence by hand.
 */
export function findGeneratedTopic(text: string): VisualTopic | null {
  for (const entry of TOPICS) {
    if (text.includes(entry.subject)) {
      return { business: entry.business, subject: entry.subject, avoid: entry.avoid }
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
  'radio station': 'radio broadcasting studio',
  'radio studio': 'radio broadcasting studio',
  'radyo istasyonu': 'radio broadcasting studio',
  'radyo studyosu': 'radio broadcasting studio',
  'broadcast studio': 'radio broadcasting studio',
  'canli yayin': 'live radio broadcast',
  'live broadcast': 'live radio broadcast',
  'audio mixer': 'audio mixing console',
  'mikser': 'audio mixing console',
  'mikrofon': 'broadcast microphone',
  'microphone': 'broadcast microphone',
  'kulaklik': 'over-ear studio headphones',
  'headphones': 'over-ear studio headphones',
  'spiker': 'radio presenter',
  'sunucu': 'radio presenter',
  'muzik': 'music programming',
  'music': 'music programming',
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
  const clean = stripImagePromptBoilerplate(request)
  const folded = fold(clean)
  const hits: string[] = []
  for (const key of Object.keys(VISUAL_TERMS).sort((a, b) => b.length - a.length)) {
    // Short keys ("ev", "tir", "kar") must match whole words, or they fire inside
    // English text ("every", "street"). Longer keys are stems that take Turkish
    // suffixes ("kamyonete"), so they only need a word-START boundary.
    const matches =
      key.length <= 3
        ? foldedWordIncludes(folded, key)
        : new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(key)}`).test(folded)
    if (matches && !hits.includes(VISUAL_TERMS[key])) hits.push(VISUAL_TERMS[key])
  }
  if (hits.length === 0) return clean
  // Only the English vocabulary goes to the image model. The user's own wording
  // used to be appended as `(as requested: "…")`, which leaked the Turkish brief
  // into the prompt and made image models draw text/captions from it.
  return hits.join(', ')
}

/**
 * Removes user-brief quotes that older versions of `describeVisualRequest`
 * stored inside image prompts (`(as requested: "…")`), so already-saved sites
 * stop leaking them on regenerate.
 */
export function stripRequestedQuote(text: string): string {
  return text
    .replace(/\s*\(as requested:\s*"[^"]*"\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Removes everything the prompt builders append around the real description
 * (medium line, style, composition, the STRICT RULE / Avoid block, the
 * negative-subject clause). The editor shows the stored prompt verbatim, so a
 * "regenerate" request usually carries all of it back; without stripping, the
 * rules were duplicated and the old boilerplate was re-interpreted as the user's
 * wording.
 */
export function stripImagePromptBoilerplate(text: string): string {
  return stripRequestedQuote(text.split(/STRICT RULE:/)[0])
    .replace(/(?:Photorealistic|Polished) hero banner (?:photograph|illustration) for a [^.]*\./gi, ' ')
    .replace(/Style: [^.]*\./g, ' ')
    .replace(/Wide cinematic composition[^.]*\./g, ' ')
    .replace(/Do NOT depict: [^.]*\./g, ' ')
    .replace(/Context: [^.]*\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VARIATION_CUES = [
  'shot from a low three-quarter angle',
  'wide establishing shot from eye level',
  'close-up detail composition with shallow depth of field',
  'shot from a slightly elevated angle',
  'symmetrical front-facing composition',
  'candid mid-shot with natural movement',
  'golden warm side lighting',
  'soft diffused daylight',
]

/**
 * A short random composition cue appended ONLY to the prompt sent to the image
 * model (never stored in the editable description), so pressing "regenerate"
 * with an unchanged description still yields a different picture.
 */
export function variationCue(random: () => number = Math.random): string {
  const pick = VARIATION_CUES[Math.floor(random() * VARIATION_CUES.length)]
  return `Composition variation: ${pick}.`
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
