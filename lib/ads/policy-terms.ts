/**
 * Deterministic ad-policy vocabulary (Turkish + English).
 *
 * Terms are written already folded: lowercase ASCII, diacritics removed
 * ("uyuşturucu" -> "uyusturucu"). Matching (lib/ads/policy.ts) is word-bounded:
 * a term only matches whole words, so a short key can never fire inside a longer
 * unrelated word. A trailing `*` means "this word and any Turkish/English suffix
 * of it" (`silahlar`, `casinolar`), and is only used on stems that cannot start an
 * innocent word. Ambiguous common words ("kumar" is also a very common surname,
 * "tutun", "sigara", "ilac") are deliberately NOT listed alone; only their
 * commercial / promotional phrases are.
 */

export type PolicyCategory =
  | 'adult'
  | 'weapons'
  | 'counterfeit'
  | 'drugs'
  | 'prescription_drugs'
  | 'gambling'
  | 'spyware_hacking'
  | 'dishonest_practices'
  | 'tobacco'
  | 'alcohol'
  | 'financial'
  | 'health'
  | 'cannabis_cbd'
  | 'dating'

/**
 * `blocked`: no plan is produced for the site.
 * `restricted`: a plan is produced with a "Google may require extra verification" warning.
 */
export type PolicySeverity = 'blocked' | 'restricted'

export type PolicyCategoryDefinition = {
  category: PolicyCategory
  severity: PolicySeverity
  /** Direct signals that can reach the category's configured severity. */
  terms: string[]
  /** Lower-confidence signals that only produce a restricted finding. */
  reviewTerms?: string[]
}

export const POLICY_CATEGORIES: PolicyCategoryDefinition[] = [
  {
    category: 'adult',
    severity: 'blocked',
    terms: [
      'porno*', 'porn', 'pornography', 'pornografi*', 'xxx', 'sex shop', 'seks shop', 'sexshop*', 'seksshop*',
      'seks hatti', 'seks sohbet', 'sex chat', 'canli seks', 'escort', 'escorts', 'eskort*', 'erotik masaj', 'fuhus*',
      'genelev*', 'yetiskin icerik', 'adult content', 'adult entertainment', 'sexual content', 'sexually explicit',
      'webcam show', 'nude photos', 'ciplak fotograf*', 'adult product*', 'adult toy*', 'adult shop*', 'adult store*',
      'sex toy*', 'sex product*', 'erotic product*', 'erotic shop*', 'erotik*', 'erotik urun*', 'erotik magaza*',
      'cinsel icerik', 'cinsel oyuncak*', 'cinsel urun*', 'yetiskin urun*', 'yetiskin oyuncak*', 'vibrator*', 'dildo*',
      'masturbator*',
    ],
  },
  {
    category: 'weapons',
    severity: 'blocked',
    terms: [
      'silah satis*', 'silah satin al', 'silah magazasi', 'ruhsatsiz silah', 'tabanca satis*', 'tabanca*', 'tufek*',
      'av tufegi', 'patlayici madde*', 'patlayici*', 'mermi satis*', 'gun shop', 'gun store', 'firearm*', 'handgun*',
      'rifle*', 'ammunition', 'explosive*', 'buy guns', 'buy a gun',
    ],
  },
  {
    category: 'counterfeit',
    severity: 'blocked',
    terms: [
      'sahte kimlik*', 'sahte pasaport*', 'sahte diploma*', 'sahte ehliyet*', 'sahte rapor*', 'sahte fatura*',
      'sahte para', 'diploma satin al', 'ehliyet satin al', 'replika saat*', 'replica watch*', 'replica watches',
      'birebir kopya', 'super kopya', 'ayna kalite', 'fake id', 'fake ids', 'fake passport*', 'fake diploma*',
      'counterfeit', 'counterfeits', 'knockoff*', 'sinav kopya*', 'kopya cihazi*',
    ],
  },
  {
    category: 'drugs',
    severity: 'blocked',
    terms: [
      'uyusturucu satis*', 'uyusturucu satin al', 'esrar satis*', 'esrar satin al', 'kokain*', 'eroin', 'metamfetamin',
      'ecstasy', 'mdma', 'bonzai', 'sentetik kannabinoid*', 'buy weed', 'buy cocaine', 'buy heroin', 'buy meth',
      'buy drugs', 'magic mushroom*', 'psychedelic*',
    ],
  },
  {
    category: 'prescription_drugs',
    severity: 'blocked',
    terms: [
      'recetesiz ilac*', 'receteli ilac satis*', 'recetesiz antibiyotik*', 'viagra', 'cialis', 'xanax', 'tramadol',
      'rivotril', 'no prescription', 'without prescription', 'buy prescription drugs', 'buy xanax', 'buy viagra',
    ],
  },
  {
    category: 'gambling',
    severity: 'blocked',
    terms: [
      'bahis', 'bahis sitesi*', 'bahis oyna*', 'canli bahis', 'spor bahis*', 'kacak bahis', 'kacak iddaa', 'iddaa',
      'kumarhane*', 'kumar oyna*', 'kumar sitesi*', 'kumar oyunlari', 'casino*', 'kasino*', 'rulet', 'blackjack',
      'slot oyunlari', 'poker online', 'online poker', 'betting', 'sportsbook', 'online casino', 'sports betting',
    ],
  },
  {
    category: 'spyware_hacking',
    severity: 'blocked',
    terms: [
      'casus yazilim*', 'spyware', 'stalkerware', 'keylogger*', 'whatsapp hackleme', 'instagram hackleme',
      'hesap hackleme', 'hesap hacklemek', 'sifre kirma', 'sifre kirici', 'password cracker', 'phone spy',
      'telefon dinleme programi', 'telefon dinleme yazilimi', 'ddos satin al', 'carding', 'cc dump*', 'hack service*',
      'hacker kirala*', 'hire a hacker',
    ],
  },
  {
    category: 'dishonest_practices',
    severity: 'blocked',
    terms: [
      'takipci satin al', 'begeni satin al', 'izlenme satin al', 'yorum satin al', 'sahte yorum*', 'sahte takipci*',
      'buy followers', 'buy likes', 'buy instagram followers', 'buy reviews', 'buy fake reviews', 'fake reviews',
      'fake followers',
    ],
  },
  {
    category: 'tobacco',
    severity: 'blocked',
    terms: [
      'sigara satis*', 'sigara satin al', 'tutun urunleri', 'elektronik sigara*', 'e-sigara*', 'e sigara*', 'vape',
      'vapes', 'puro satis*', 'nargile tutunu', 'snus', 'cigarette*', 'e-cigarette*', 'tobacco', 'tobacco products',
    ],
  },
  {
    category: 'alcohol',
    severity: 'restricted',
    terms: [
      'alkol*', 'alcohol', 'icki*', 'sarap*', 'bira', 'viski', 'votka', 'raki*', 'wine', 'beer', 'vodka', 'whisky',
      'whiskey', 'brewery', 'winery', 'distillery',
    ],
  },
  {
    category: 'financial',
    severity: 'restricted',
    terms: [
      'kredi*', 'forex', 'kripto*', 'bitcoin', 'borsa', 'faiz*', 'yatirim danismanlig*', 'ikili opsiyon*',
      'hisse senedi', 'hisse senetleri', 'loan', 'loans', 'crypto', 'cryptocurrency', 'binary option*',
      'trading signals', 'mortgage', 'payday loan*',
    ],
  },
  {
    category: 'health',
    severity: 'restricted',
    terms: [
      'tedavi*', 'mucize', 'kesin cozum', 'kesin tedavi', 'zayiflama*', 'zayiflatici*', 'diyet hapi', 'takviye*',
      'gida takviyesi', 'supplement*', 'eczane*', 'pharmacy', 'ilac*', 'weight loss', 'miracle cure', 'cure',
      'kanser tedavisi',
    ],
  },
  {
    category: 'cannabis_cbd',
    severity: 'restricted',
    terms: ['cbd', 'kenevir*', 'cannabis', 'hemp', 'marijuana', 'marihuana'],
  },
  {
    category: 'dating',
    severity: 'restricted',
    terms: ['arkadaslik sitesi*', 'flort', 'dating', 'dating site*', 'singles', 'matchmaking'],
  },
]

/**
 * Domain names glue words together ("canlibahis24.com"), so a word boundary cannot
 * work on the host: these blocked-category stems are matched as substrings of it.
 */
export const HOST_STEMS: Array<{ category: PolicyCategory; stem: string }> = [
  { category: 'gambling', stem: 'casino' },
  { category: 'gambling', stem: 'kasino' },
  { category: 'gambling', stem: 'bahis' },
  { category: 'gambling', stem: 'iddaa' },
  { category: 'gambling', stem: 'rulet' },
  { category: 'adult', stem: 'porno' },
  { category: 'adult', stem: 'porn' },
  { category: 'adult', stem: 'escort' },
  { category: 'adult', stem: 'eskort' },
  { category: 'adult', stem: 'sexshop' },
  { category: 'adult', stem: 'seksshop' },
]
