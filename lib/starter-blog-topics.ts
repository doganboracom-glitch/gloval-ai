import type { Sector } from '@/lib/sector-profiles'

/**
 * Topic pools for the starter blog posts written at a site's first publish.
 * Twelve general, evergreen subjects per sector. There is deliberately NO
 * generic pool for unknown businesses: a made-up "any business" topic reads as
 * unrelated to the real field, so those sites get AI-suggested topics instead. Titles are Turkish on purpose:
 * for an English site the writer is told to cover the same subject in English.
 * None of them names a business or promises a result.
 */
export type PooledSector = Exclude<Sector, 'default'>

export const STARTER_BLOG_TOPICS: Record<PooledSector, readonly string[]> = {
  dental: [
    'Günlük ağız bakımında sık yapılan hatalar',
    'Diş hekimine ne sıklıkla gitmek gerekir?',
    'Çocuklarda sağlıklı diş alışkanlıkları nasıl kazandırılır?',
    'Diş fırçası ve diş ipi seçerken nelere dikkat edilir?',
    'Diş hassasiyeti neden olur, neler yardımcı olabilir?',
    'Diş beyazlatma öncesinde bilinmesi gerekenler',
    'Beslenme alışkanlıklarının diş sağlığına etkisi',
    'İlk diş hekimi randevusuna nasıl hazırlanılır?',
    'Diş eti sağlığını korumanın yolları',
    'Dolgu, kanal ve kaplama: temel kavramlar',
    'Hamilelik döneminde ağız ve diş bakımı',
    'Ortodontik tedavi sürecinde günlük bakım',
  ],
  food: [
    'Mevsimine göre menü seçerken nelere dikkat edilir?',
    'Taze malzeme seçmenin yemeğe etkisi',
    'Özel günler için masa ve menü planlama rehberi',
    'Evde ve dışarıda dengeli beslenme tercihleri',
    'Kahve çeşitleri ve demleme yöntemleri',
    'Yemekte sunumun önemi',
    'Grup yemekleri için organizasyon önerileri',
    'Alerjisi olanlar için menüde nelere dikkat edilmeli?',
    'Yerel lezzetleri tanımanın yolları',
    'Hafif ve doyurucu öğle yemeği fikirleri',
    'Doğru rezervasyon yapmanın incelikleri',
    'Tatlı ve içecek eşleştirmesi için temel ipuçları',
  ],
  law: [
    'Bir avukata başvurmadan önce hazırlanması gereken belgeler',
    'Sözleşme imzalarken dikkat edilmesi gerekenler',
    'Hukuki danışmanlık ne zaman gerekir?',
    'İlk görüşmeye nasıl hazırlanılır?',
    'Yazılı iletişimin ve kayıt tutmanın önemi',
    'Dava ile arabuluculuk arasındaki temel fark',
    'Vekaletname nedir, nelere dikkat edilmelidir?',
    'Kira sözleşmelerinde sık karşılaşılan sorular',
    'Şirket kurarken bilinmesi gereken temel hukuki başlıklar',
    'Hak kaybını önlemek için süre kavramı',
    'Noter işlemleri hakkında genel bilgiler',
    'Hukuki süreçlerde sabırlı olmanın önemi',
  ],
  architecture: [
    'Mimari projeye başlamadan önce hazırlanması gerekenler',
    'Küçük mekanlarda ferah yaşam için tasarım fikirleri',
    'Doğal ışığı iç mekanda kullanmanın yolları',
    'Malzeme seçiminde dayanıklılık ve estetik dengesi',
    'Ev yenilemede planlama aşamaları',
    'Ofis tasarımında verimli çalışma alanı oluşturmak',
    'Sürdürülebilir yapı malzemeleri hakkında temel bilgiler',
    'Renk ve doku seçiminin mekan algısına etkisi',
    'Mimar, iç mimar ve müteahhit: roller nasıl ayrışır?',
    'Bütçe planlarken göz önünde bulundurulacaklar',
    'Depolama çözümleriyle düzenli bir yaşam alanı',
    'Cephe ve dış mekan tasarımında dikkat edilecekler',
  ],
  beauty: [
    'Cilt tipine göre günlük bakım rutini',
    'Saç bakımında sık yapılan hatalar',
    'Güneşten korunmanın cilt için önemi',
    'Düğün ve özel günler için hazırlık takvimi',
    'Doğru bakım ürünü seçerken dikkat edilecekler',
    'Tırnak sağlığını korumanın yolları',
    'Mevsim geçişlerinde cilt bakımı',
    'Saç boyası sonrası bakım önerileri',
    'Makyaj fırçalarının temizliği ve hijyen',
    'Uyku ve su tüketiminin cilde etkisi',
    'Salon ziyaretine hazırlanırken nelere dikkat edilir?',
    'Erkekler için temel bakım alışkanlıkları',
  ],
  tech: [
    'Doğru yazılım çözümünü seçerken sorulacak sorular',
    'Küçük işletmeler için dijital dönüşümün ilk adımları',
    'Veri güvenliği için temel alışkanlıklar',
    'Bulut hizmetlerinin işletmelere sağladığı kolaylıklar',
    'Proje yönetiminde iletişimin önemi',
    'Web sitesi ile mobil uygulama arasındaki fark',
    'Güçlü parola ve iki adımlı doğrulama rehberi',
    'Yedekleme stratejisi neden önemlidir?',
    'Yapay zeka araçlarını iş süreçlerinde kullanmanın temelleri',
    'Teknik destek talebi açarken nelere dikkat edilir?',
    'Ürün geliştirme sürecinin aşamaları',
    'Kullanıcı deneyimi neden önemlidir?',
  ],
  ecommerce: [
    'Online alışverişte güvenli ödeme için dikkat edilecekler',
    'Ürün açıklamalarını doğru okumanın yolları',
    'Beden ve ölçü seçerken sık yapılan hatalar',
    'Hediye seçerken kişiye uygun ürünü bulmak',
    'Sipariş verirken teslimat bilgilerini kontrol etmek',
    'Ürün bakımı ve ömrünü uzatma ipuçları',
    'İade ve değişim sürecine hazırlıklı olmak',
    'Kampanya dönemlerinde bilinçli alışveriş',
    'Ürün fotoğraflarını değerlendirirken nelere bakılır?',
    'Paketleme ve kargo sürecinde ürünü korumak',
    'Mevsimlik ürünleri planlayarak almak',
    'Online mağazada ürün karşılaştırma rehberi',
  ],
  photography: [
    'Portre çekimine hazırlanırken nelere dikkat edilir?',
    'Doğal ışıkta fotoğraf çekmenin temel kuralları',
    'Düğün fotoğrafçılığında planlamanın önemi',
    'Çekim öncesi kıyafet ve renk seçimi',
    'Kompozisyon kuralları: üçler kuralı ve ötesi',
    'Ürün fotoğrafçılığında arka plan seçimi',
    'Fotoğrafları yedeklemenin ve arşivlemenin yolları',
    'Aile çekimlerinde çocuklarla rahat poz vermek',
    'Düzenleme (rötuş) ile doğallık arasındaki denge',
    'Mekan ve lokasyon seçerken dikkat edilecekler',
    'Baskı ve albüm: fotoğrafları kalıcı hale getirmek',
    'Kurumsal çekimlerde marka dilini yansıtmak',
  ],
  automotive: [
    'Aracın periyodik bakımı neden önemlidir?',
    'Lastik seçimi ve basınç kontrolünde dikkat edilecekler',
    'İkinci el araç alırken kontrol listesi',
    'Mevsim geçişlerinde araç hazırlığı',
    'Araçta ses ve titreşim: ne zaman servise gidilmeli?',
    'Yakıt tasarrufu için sürüş alışkanlıkları',
    'Akü bakımı ve ömrünü uzatma yolları',
    'Fren sistemi belirtilerini tanımak',
    'Araç temizliği ve boya koruma önerileri',
    'Uzun yol öncesi yapılması gereken kontroller',
    'Sigorta ve kasko seçerken temel kavramlar',
    'Servis randevusuna hazırlanırken nelere dikkat edilir?',
  ],
  realestate: [
    'Ev alırken bakılması gereken temel kriterler',
    'Kiralık konut ararken sık yapılan hatalar',
    'Tapu işlemleri hakkında genel bilgiler',
    'Konut değerini etkileyen faktörler',
    'Taşınma öncesi hazırlık listesi',
    'Mahalle seçerken göz önünde bulundurulacaklar',
    'Kira sözleşmesinde dikkat edilecek maddeler',
    'Yatırım amaçlı gayrimenkul değerlendirmesinde temel sorular',
    'Eviniz satışa hazırlanırken küçük düzenlemeler',
    'Aidat ve ortak giderleri anlamak',
    'Gayrimenkul danışmanıyla çalışmanın avantajları',
    'Yeni inşaat ile ikinci el konut karşılaştırması',
  ],
}

export const STARTER_POST_COUNT = 3

/** FNV-1a: small, stable, and spreads UUIDs evenly. */
export function seedFrom(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Three different topics for one site. The seed picks the start and a stride
 * that is coprime with the pool size, so two sites of the same sector rarely
 * receive the same trio and a single site never gets a repeat.
 */
export function pickStarterTopics(sector: Sector, seed: string, count = STARTER_POST_COUNT): string[] {
  if (sector === 'default') return []
  const pool = STARTER_BLOG_TOPICS[sector]
  const hash = seedFrom(seed)
  const strides = [1, 5, 7, 11].filter((stride) => pool.length % stride !== 0 || stride === 1)
  const start = hash % pool.length
  const stride = strides[Math.floor(hash / pool.length) % strides.length]
  const picked: string[] = []
  for (let i = 0; picked.length < Math.min(count, pool.length); i++) {
    picked.push(pool[(start + i * stride) % pool.length])
  }
  return picked
}

const normalizeTopic = (topic: string) => topic.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const POOL_TOPIC_OWNER = new Map<string, PooledSector>(
  (Object.entries(STARTER_BLOG_TOPICS) as [PooledSector, readonly string[]][]).flatMap(([sector, topics]) =>
    topics.map((topic) => [normalizeTopic(topic), sector] as const),
  ),
)

/**
 * True when a topic is a ready-made pool topic of a DIFFERENT sector than the
 * site's own (e.g. an architecture topic suggested for a coffee shop). A model
 * answer like that is cross-contamination, never a good topic.
 */
export function isForeignPoolTopic(topic: string, ownSector: Sector): boolean {
  const owner = POOL_TOPIC_OWNER.get(normalizeTopic(topic))
  return owner !== undefined && owner !== ownSector
}
