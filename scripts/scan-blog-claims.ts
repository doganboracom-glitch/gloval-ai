import { detectUnverifiedClaims } from '../lib/blog-trust'
import { originalPosts } from './blog-originals'

type Rule = { name: string; pattern: RegExp; only?: (post: { slug: string; category: string }) => boolean }

const isGloval = (post: { slug: string; category: string }) => post.category === 'gloval'
const isStore = (post: { slug: string; category: string }) => post.category === 'ecommerce' || post.slug.includes('e-ticaret')
const isDomain = (post: { slug: string }) => post.slug.includes('alan-adi')
const isLegal = (post: { slug: string }) => post.slug.includes('kvkk') || post.slug.includes('gizlilik')

const RULES: Rule[] = [
  { name: 'rakam', pattern: /\d/u },
  { name: 'yuzde/istatistik', pattern: /yüzde|istatistik|oranında|katına|kat daha|kat artış/iu },
  { name: 'arastirma', pattern: /araştırma|çalışmalara göre|anket|rapora göre|uzmanlara göre/iu },
  { name: 'odul', pattern: /\bödül|ödüllü|ödülü/iu },
  { name: 'musteri yorumu', pattern: /müşteri yorumu|müşterilerimiz|müşterimiz|referans(?:lar)?ımız|memnun müşteri/iu },
  { name: 'en iyi / 1 numara', pattern: /\ben iyi\b|\b1 numara|\bbir numara|numaralı|lider\b|rakipsiz|garanti/iu },
  {
    name: 'gloval fiyat/sure/limit/kredi/plan',
    pattern: /gloval[^.\n]{0,160}(?:fiyat|ücret|dakika|saniye|saat|süre|limit|kredi|plan|paket|abonelik|sınırsız|kota|TL|₺)|(?:fiyat|ücret|dakika|saniye|limit|kredi|paket|abonelik|sınırsız|kota)[^.\n]{0,160}gloval/iu,
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

const findings: Array<{ slug: string; rule: string; excerpt: string }> = []

for (const post of originalPosts) {
  for (const claim of detectUnverifiedClaims(post.body)) {
    findings.push({ slug: post.slug, rule: `blog-trust:${claim.kind}`, excerpt: claim.excerpt })
  }
  const lines = post.body.split('\n')
  for (const rule of RULES) {
    if (rule.only && !rule.only(post)) continue
    for (const line of lines) {
      const match = rule.pattern.exec(line)
      if (!match) continue
      const start = Math.max(0, match.index - 50)
      findings.push({ slug: post.slug, rule: rule.name, excerpt: line.slice(start, match.index + 80).trim() })
    }
  }
}

const only = process.argv[2]
const shown = only ? findings.filter((f) => f.slug === only || f.rule === only) : findings
for (const f of shown) console.log(`${f.slug} | ${f.rule} | ${f.excerpt}`)
console.log(JSON.stringify({ posts: originalPosts.length, findings: findings.length, postsWithFindings: new Set(findings.map((f) => f.slug)).size }))
if (findings.length) process.exit(1)
