/**
 * Decides which language a generated website is written in.
 *
 * The site language used to be whatever the visitor's UI language was, so an
 * English brief typed in the Turkish UI produced a Turkish site (and the other
 * way round). The brief now decides; the UI language is only the tie-breaker.
 *
 * Priority: explicit request in the brief ("İngilizce olsun", "in Turkish")
 * > language detected from the brief text > UI language > Turkish.
 */

export type SiteLang = 'tr' | 'en'

const fold = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** Directive words that turn "ingilizce"/"türkçe" into a language request. */
const TR_DIRECTIVE =
  'olsun|olacak|yaz|yazin|yazar misin|dilinde|site|sitesi|web|icerik|metin|arayuz|versiyon|versiyonu|hazirla|yap|olarak'

const REQUEST_TURKISH = new RegExp(
  [
    `\\bturkce(?:si)?\\s+(?:${TR_DIRECTIVE})\\b`,
    '\\bturkceye\\s+(?:cevir|donustur)',
    '\\bin turkish\\b',
    '\\bturkish (?:version|content|text|site|website|only)\\b',
    '\\b(?:write|make|build|create) (?:it |this |the site |the website )?(?:in|as) turkish\\b',
  ].join('|'),
)

const REQUEST_ENGLISH = new RegExp(
  [
    `\\bingilizce(?:si)?\\s+(?:${TR_DIRECTIVE})\\b`,
    '\\bingilizceye\\s+(?:cevir|donustur)',
    '\\bin english\\b',
    '\\benglish (?:version|content|text|site|website|only)\\b',
    '\\b(?:write|make|build|create) (?:it |this |the site |the website )?(?:in|as) english\\b',
  ].join('|'),
)

/** The language the brief explicitly asks for, if it names one. */
export function explicitLanguageRequest(brief: string): SiteLang | null {
  const folded = fold(brief)
  const turkish = REQUEST_TURKISH.test(folded)
  const english = REQUEST_ENGLISH.test(folded)
  if (turkish === english) return null
  return turkish ? 'tr' : 'en'
}

const TURKISH_WORDS = new Set(
  (
    'bir ve icin ile bana benim bizim ben biz olan olsun olacak istiyorum istiyoruz yap yapin yapar ' +
    'olustur olusturun hazirla hazirlar misin sitesi sitem site web sayfa sayfasi firma firmasi ' +
    'hizmet hizmetleri hakkinda gibi daha cok icin bu su mi mu mi da de ki ama veya ya ' +
    'musteri musterilere urun urunleri magaza online satis kurumsal tanitim ozel profesyonel ' +
    'lutfen merhaba kendi sahip uzerinden her tum icinde modern sade renkli'
  ).split(' '),
)

const ENGLISH_WORDS = new Set(
  (
    'the and for with a an my i we our your their want need needs create build make design ' +
    'website site web page pages business company store shop online that this these those about ' +
    'of to in on at is are be please it its from by or as like using modern simple clean ' +
    'services products customers offers selling sell sells service product'
  ).split(' '),
)

/** Letters that only exist in Turkish among the languages the product writes. */
const TURKISH_ONLY_CHARS = /[ğşıİçöüĞŞÇÖÜ]/g

/**
 * Detects the language of a free-form brief. Returns `null` when the text is
 * too short or too mixed to call (a name, a handful of nouns, another script).
 */
export function detectBriefLanguage(brief: string): SiteLang | null {
  const raw = brief.slice(0, 2000)
  const turkishChars = (raw.match(TURKISH_ONLY_CHARS) ?? []).length
  const words = fold(raw).split(' ').filter(Boolean)

  let turkish = turkishChars * 1.5
  let english = 0
  for (const word of words) {
    if (TURKISH_WORDS.has(word)) turkish += 1
    if (ENGLISH_WORDS.has(word)) english += 1
  }

  if (turkish === english) return null
  if (Math.max(turkish, english) < 1) return null
  // Require a real lead; one stray shared word must not flip the language.
  if (Math.abs(turkish - english) < 1) return null
  return turkish > english ? 'tr' : 'en'
}

/** The UI language as a site language. Only Turkish UI means Turkish. */
export function uiLanguageToSiteLang(uiLang: string | null | undefined): SiteLang {
  return uiLang === 'en' ? 'en' : 'tr'
}

/** Final language of the generated site for this brief. */
export function resolveGenerationLanguage(
  brief: string,
  uiLang: string | null | undefined,
): SiteLang {
  return (
    explicitLanguageRequest(brief) ??
    detectBriefLanguage(brief) ??
    uiLanguageToSiteLang(uiLang)
  )
}
