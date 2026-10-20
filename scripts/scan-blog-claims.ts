import { detectUnverifiedClaims } from '../lib/blog-trust'
import { originalPosts } from './blog-originals'

type Rule = { name: string; pattern: RegExp; only?: (post: { slug: string; category: string }) => boolean }

const isGloval = (post: { slug: string; category: string }) => post.category === 'gloval'
const isStore = (post: { slug: string; category: string }) => post.category === 'ecommerce' || post.slug.includes('e-ticaret')
const isDomain = (post: { slug: string }) => post.slug.includes('alan-adi')
const isLegal = (post: { slug: string }) => post.slug.includes('kvkk') || post.slug.includes('gizlilik')

const RULES: Rule[] = [
  { name: 'rakam', pattern: /\d+\s*(?:%|TL|₺|dakika|dk|saat|gün|saniye|yıl|kat\b|bin\b|milyon|kullanıcı|müşteri|ziyaretçi|işletme|adet|kişi)|%\s*\d/iu },
  { name: 'yuzde/istatistik', pattern: /\byüzde\b|\bistatistik\b|oranında|katına|kat daha|kat artış/iu },
  { name: 'arastirma', pattern: /araştırma|çalışmalara göre|anket|rapora göre|uzmanlara göre/iu },
  { name: 'odul', pattern: /\bödül|ödüllü|ödülü/iu },
  { name: 'musteri yorumu', pattern: /müşteri yorumu|müşterilerimiz|müşterimiz|referans(?:lar)?ımız/iu },
  { name: 'en iyi / 1 numara', pattern: /\b1 numara|numaralı|\blider\b|rakipsiz|garanti(?!\s*(?:edil|edem|ver|var mı)|si\b|sini\b)|\ben iyi (?:fiyat|hizmet|çözüm|platform|araç|site|ajans|firma)/iu },
  {
    name: 'gloval fiyat/sure/limit/kredi/plan',
    pattern: /gloval[^.\n]{0,160}(?:fiyat|ücret|dakika|saniye|saat|süre|limit|kredi|plan|paket|abonelik|sınırsız|kota|\bTL\b|₺)|(?:fiyat|ücret|dakika|saniye|limit|kredi|paket|abonelik|sınırsız|kota)[^.\n]{0,160}gloval/iu,
    only: isGloval,
  },
  {
    name: 'odeme vaadi',
    pattern: /kart(?:la)? ödeme|canlı ödeme|iyzico|paytr|stripe|paypal|havale|taksit|kredi kartı|ödeme sağlayıcı|ödeme altyapı|ödeme al|3d secure|3ds/iu,
    only: isStore,
  },
  {
    name: 'alan adi vaadi',
    pattern: /otomatik|dns|satın al|webmail|e-posta kutusu|e-posta adresi|kayıt|yönlendir|tek tık|dakikalar içinde/iu,
    only: isDomain,
  },
  {
    name: 'kvkk hukuki',
    pattern: /ceza|madde|kanun|yaptırım|idari para|zorunlu|zorunludur|yükümlü|mutlaka|hukuken|yasal olarak|mevzuat|VERBİS|aydınlatma metni|açık rıza|kurul/iu,
    only: isLegal,
  },
]

// Satırlar uyarı bağlamındaysa (yazı okuru uydurma/garanti vaadinden kaçınmaya çağırıyorsa) iddia sayılmaz.
const WARNING_CONTEXT = /uydur|kanıtlanamayan|kimseye ait|doğrulanmamış|vaat edemezsiniz|garanti edilemez|garanti edemez/iu
const HELD_BACK = new Set([
  'gloval-ai-ile-e-ticaret-magazasi-kurma',
  'gloval-ai-ile-kendi-alan-adini-baglama',
  'odeme-guvenligi-ve-guven-unsurlari',
  'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
])

const findings: Array<{ slug: string; rule: string; excerpt: string }> = []

for (const post of originalPosts) {
  for (const claim of detectUnverifiedClaims(post.body)) {
    findings.push({ slug: post.slug, rule: `blog-trust:${claim.kind}`, excerpt: claim.excerpt })
  }
  const lines = post.body.split('\n')
  for (const rule of RULES) {
    if (rule.only && !rule.only(post)) continue
    for (const line of lines) {
      if (WARNING_CONTEXT.test(line)) continue
      const match = rule.pattern.exec(line)
      if (!match) continue
      const start = Math.max(0, match.index - 50)
      findings.push({ slug: post.slug, rule: rule.name, excerpt: line.slice(start, match.index + 80).trim() })
    }
  }
}

const only = process.argv[2]
const shown = only ? findings.filter((f) => f.slug === only || f.rule === only) : findings
for (const f of shown) console.log(`${HELD_BACK.has(f.slug) ? '[HELD_BACK] ' : ''}${f.slug} | ${f.rule} | ${f.excerpt}`)
const publishable = findings.filter((f) => !HELD_BACK.has(f.slug))
console.log(JSON.stringify({ posts: originalPosts.length, findings: findings.length, publishableFindings: publishable.length, publishablePostsWithFindings: new Set(publishable.map((f) => f.slug)).size }))
if (publishable.length) process.exit(1)
