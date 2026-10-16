/**
 * Deterministic pre-checks for editor instructions (TR + EN). They run BEFORE
 * any AI call, cost nothing, and answer honestly instead of letting a model
 * invent a fake result (a made-up "Login" page, a blank "make it nicer" rewrite).
 * Pure functions: instruction in, decision out.
 */

export type EditGateKind = 'blog-menu' | 'unsupported' | 'vague'

export type EditGate = {
  kind: EditGateKind
  message: string
}

type Lang = 'tr' | 'en'

const say = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

/** Lowercases with Turkish rules, folds diacritics and collapses whitespace. */
export function foldInstruction(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Removes text the owner quoted: it is content to copy, never an instruction. */
export function stripQuoted(raw: string): string {
  return raw.replace(/["“”«»][^"“”«»]*["“”«»]/g, ' ').replace(/\s+/g, ' ').trim()
}

const BUILD_VERB = /\b(ekle\w*|olustur\w*|kur\w*|yap\w*|entegre\w*|aktif\w*|ac\w*|add|create|build|implement|enable|set up|setup|integrate|connect)\b/
const MOVE_VERB = /\b(tasi\w*|gecir\w*|degistir\w*|yukselt\w*|migrate|move|switch|upgrade)\b/

const MENU_WORD = /(\bmenu|navigasyon|navigation|\bnavbar\b|\bnav\b|\bheader\b|ust bilgi)/
const BLOG_MENU_REMOVE = /\b(kaldir\w*|sil\w*|cikar\w*|gizle\w*|kapat\w*|remove|delete|hide)\b/
const BLOG_MENU_ADD = /\b(ekle\w*|goster\w*|ac\w*|koy\w*|add|show|put|include)\b/

const CONCRETE_TARGET =
  /(reng|renk|color|font|yazi|baslik|title|logo|menu|buton|button|gorsel|resim|foto|image|metin|text|hero|sayfa|page|telefon|phone|mail|adres|address|slogan|isim|\bad\b|adi|sosyal|instagram|facebook|footer|alt bilgi|blog|seo|hizmet|service|urun|product|galeri|gallery|ekip|team|iletisim|contact|hakkimizda|about|sss|faq|fiyat|price|referans|yorum|bolum|section)/

const VAGUE_WORD =
  /\b(guzel\w*|iyi\w*|hos\w*|sik|modern\w*|profesyonel\w*|duzelt\w*|degistir\w*|yenile\w*|iyilestir\w*|better|nicer|prettier|improve|fix|change|update|guncelle\w*|redesign)\b/

/** Capabilities the site schema simply has no field for. */
const UNSUPPORTED: { id: string; test: (n: string) => boolean; tr: string; en: string }[] = [
  {
    id: 'accounts',
    test: (n) =>
      /(kullanici (girisi|hesabi|kaydi|paneli)|uyelik|uye giris\w*|uye ol\b|\blogin\b|log in|sign ?in|sign ?up|kayit ol\b|membership|user accounts?|authentication|giris sistemi)/.test(n) &&
      BUILD_VERB.test(n),
    tr: 'kullanıcı girişi ve üyelik sistemi',
    en: 'user login and membership',
  },
  {
    id: 'hosting',
    test: (n) => /(sunucu\w*|hosting|barindirma|\bserver\b|veri merkezi)/.test(n) && MOVE_VERB.test(n),
    tr: 'sunucu veya barındırma değişikliği',
    en: 'server or hosting changes',
  },
  {
    id: 'integration',
    test: (n) =>
      /(stripe|paypal|veritabani|database|\bcrm\b|\berp\b|webhook|entegrasyon\w*|integration\w*)/.test(n) &&
      !/(analytics|pixel|google tag|takip|izleme|harita|\bmap\b|whatsapp|instagram|sosyal|social)/.test(n) &&
      BUILD_VERB.test(n),
    tr: 'harici sistem veya veritabanı entegrasyonu',
    en: 'external system or database integration',
  },
]

/** True when an instruction is too short and unspecific to act on. */
function isVague(instruction: string): boolean {
  if (/["“”«»]/.test(instruction)) return false
  const n = foldInstruction(instruction).replace(/[.!?,;:]+/g, ' ').trim()
  const words = n.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 5) return false
  if (CONCRETE_TARGET.test(n)) return false
  return VAGUE_WORD.test(n)
}

/**
 * Classifies an instruction that must NOT reach the AI. Returns null for
 * everything else. `vague` is only meaningful for whole-site edits: when the
 * owner has selected a section, "make it nicer" is a valid scoped request.
 */
export function classifyEditInstruction(
  instruction: string,
  lang: Lang,
  options: { scoped?: boolean } = {},
): EditGate | null {
  const text = instruction.trim()
  if (text.length < 2) return null
  const n = foldInstruction(stripQuoted(text))

  if (/\bblog\w*/.test(n) && MENU_WORD.test(n)) {
    if (BLOG_MENU_REMOVE.test(n)) {
      return {
        kind: 'blog-menu',
        message: say(
          lang,
          'Blog bağlantısını menüden ayrıca kaldırmak şu an desteklenmiyor: bağlantı, yayınlanmış blog yazın olduğu sürece otomatik görünür. Tüm yazıları taslağa alırsan menüden kalkar. Sitede bir değişiklik yapmadım.',
          'Removing the Blog link from the menu separately is not supported right now: the link shows automatically while you have published posts. Set every post to draft and it disappears. I changed nothing on the site.',
        ),
      }
    }
    if (BLOG_MENU_ADD.test(n)) {
      return {
        kind: 'blog-menu',
        message: say(
          lang,
          'Blog bağlantısını menüye elle eklemek şu an desteklenmiyor. Yayınlanmış en az bir blog yazın olduğunda üst menüde "Blog" kendiliğinden görünür. Menüde bir değişiklik yapmadım.',
          'Adding the Blog link to the menu by hand is not supported right now. Once you have at least one published post, "Blog" appears in the top menu by itself. I changed nothing.',
        ),
      }
    }
  }

  const unsupported = UNSUPPORTED.find((u) => u.test(n))
  if (unsupported) {
    return {
      kind: 'unsupported',
      message: say(
        lang,
        `Bunu yapamıyorum: ${unsupported.tr} site düzenleyicisinde desteklenmiyor. Sitede hiçbir değişiklik yapmadım ve kredi harcanmadı.`,
        `I can't do that: ${unsupported.en} isn't supported in the site editor. I changed nothing and no credit was spent.`,
      ),
    }
  }

  if (!options.scoped && isVague(text)) {
    return {
      kind: 'vague',
      message: say(
        lang,
        'Neyi değiştirmemi istediğini anlayamadım, o yüzden hiçbir şeye dokunmadım. Örneğin: "Ana rengi mavi yap", "Hizmetler bölümünü yukarı taşı" ya da "Hero başlığını \'…\' yap". Hangi bölüm veya öğeyi kastettiğini yazar mısın?',
        'I couldn\'t tell what to change, so I touched nothing. For example: "Make the main color blue", "Move the Services section up" or "Set the hero title to \'…\'". Which section or element do you mean?',
      ),
    }
  }

  return null
}
