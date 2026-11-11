import type { HeroStripItemLike } from '@/lib/hero-strip'
import type { Section, WebsiteSchema } from '@/lib/website-schema'

/**
 * Demo-only "Slider Altı Kutu" strip. The copy is sector-fitting but carries no
 * numbers and no unverifiable claim (no "N years", "%100", "leader", "best",
 * "authorized"): every box is a plain statement of what the business does.
 * Boxes and the section are flagged `sample`, the same "Örnek içerik" pattern
 * the other demo sections use. Real, AI-generated customer sites never get one
 * automatically.
 */

type Box = readonly [icon: string, title: string, text: string]
type Bilingual = { tr: readonly Box[]; en: readonly Box[] }

export const DEMO_HERO_STRIP_BOXES: Record<string, Bilingual> = {
  'oto-cekici': {
    tr: [
      ['map-pin', 'Konum paylaşımı', 'Konumunuzu iletin, ekip yönlendirilsin'],
      ['message-circle', 'Önce net bilgi', 'Ücret ve süre çağrıda netleşir'],
      ['shield-check', 'Özenli yükleme', 'Aracınız dikkatle taşınır'],
      ['users', 'Bölgeyi bilen ekip', 'Şehir içi ve çevresi'],
    ],
    en: [
      ['map-pin', 'Share your location', 'Send where you are and we route a crew'],
      ['message-circle', 'Clear info first', 'Price and timing are settled on the call'],
      ['shield-check', 'Careful loading', 'Your vehicle is moved with care'],
      ['users', 'Local crew', 'In town and the surrounding area'],
    ],
  },
  nakliyat: {
    tr: [
      ['house', 'Ücretsiz keşif', 'Eşyalarınız yerinde görülür'],
      ['package', 'Özenli paketleme', 'Koli ve koruma malzemesi'],
      ['calendar', 'Planlı taşıma', 'Tarihinize göre program'],
      ['mail', 'Yazılı teklif', 'Net fiyat bilgisi'],
    ],
    en: [
      ['house', 'Free survey', 'We see your belongings on site'],
      ['package', 'Careful packing', 'Boxes and protective materials'],
      ['calendar', 'Planned move', 'A schedule built around your date'],
      ['mail', 'Written quote', 'Clear price information'],
    ],
  },
  'kombi-klima': {
    tr: [
      ['calendar', 'Periyodik bakım', 'Sezon öncesi kontrol'],
      ['wrench', 'Montaj ve servis', 'Kombi ve klima'],
      ['zap', 'Arıza tespiti', 'Yerinde inceleme'],
      ['message-circle', 'Net bilgilendirme', 'İşlem öncesi açıklama'],
    ],
    en: [
      ['calendar', 'Regular maintenance', 'A check before the season'],
      ['wrench', 'Installation and service', 'Boilers and air conditioners'],
      ['zap', 'Fault finding', 'Inspected on site'],
      ['message-circle', 'Clear explanations', 'We explain before we start'],
    ],
  },
  insaat: {
    tr: [
      ['ruler', 'Proje yönetimi', 'Planlamadan teslime'],
      ['hammer', 'Kaliteli malzeme', 'Seçili tedarikçiler'],
      ['badge-check', 'Şeffaf süreç', 'Düzenli bilgilendirme'],
      ['house', 'Anahtar teslim', 'Tek muhatap'],
    ],
    en: [
      ['ruler', 'Project management', 'From planning to handover'],
      ['hammer', 'Quality materials', 'Selected suppliers'],
      ['badge-check', 'Transparent process', 'Regular updates'],
      ['house', 'Turnkey', 'One point of contact'],
    ],
  },
  kahve: {
    tr: [
      ['coffee', 'Taze çekim', 'Kahveniz siparişle hazırlanır'],
      ['leaf', 'Seçili çekirdek', 'Özenle seçilmiş çekirdekler'],
      ['heart', 'Sıcak ortam', 'Rahat ve samimi mekân'],
      ['map-pin', 'Kolay ulaşım', 'Şehrin merkezinde'],
    ],
    en: [
      ['coffee', 'Fresh ground', 'Your coffee is made to order'],
      ['leaf', 'Selected beans', 'Carefully chosen beans'],
      ['heart', 'Warm space', 'A relaxed, friendly place'],
      ['map-pin', 'Easy to reach', 'In the middle of town'],
    ],
  },
  mimarlik: {
    tr: [
      ['ruler', 'Projeye özel', 'Her mekâna göre tasarım'],
      ['palette', 'Özgün tasarım', 'Zevkinize uygun çözümler'],
      ['hammer', 'Uygulama desteği', 'Yapım sürecinde yanınızda'],
      ['calendar', 'Keşif görüşmesi', 'Randevu ile mekânda inceleme'],
    ],
    en: [
      ['ruler', 'Made for the project', 'Designed around each space'],
      ['palette', 'Original design', 'Solutions that suit your taste'],
      ['hammer', 'Site support', 'With you during construction'],
      ['calendar', 'Discovery meeting', 'On-site review by appointment'],
    ],
  },
  'dis-klinigi': {
    tr: [
      ['stethoscope', 'Detaylı muayene', 'İhtiyacınıza göre değerlendirme'],
      ['shield-check', 'Hijyen odaklı', 'Temiz ve düzenli ortam'],
      ['calendar', 'Randevulu çalışma', 'Size ayrılmış zaman'],
      ['users', 'Güler yüzlü ekip', 'Sorularınıza açık yanıt'],
    ],
    en: [
      ['stethoscope', 'Thorough check-up', 'Assessed around your needs'],
      ['shield-check', 'Hygiene focused', 'A clean and orderly setting'],
      ['calendar', 'By appointment', 'Time set aside for you'],
      ['users', 'Friendly team', 'Clear answers to your questions'],
    ],
  },
  emlak: {
    tr: [
      ['house', 'Güncel ilanlar', 'Seçili portföyü inceleyin'],
      ['map-pin', 'Bölge bilgisi', 'Mahalleyi yakından tanırız'],
      ['calendar', 'Gezme randevusu', 'Uygun saatte birlikte görelim'],
      ['message-circle', 'Açık iletişim', 'Süreç boyunca bilgilendirme'],
    ],
    en: [
      ['house', 'Current listings', 'Browse the selected portfolio'],
      ['map-pin', 'Local knowledge', 'We know the neighbourhood'],
      ['calendar', 'Viewing slots', 'Let us visit at a good time'],
      ['message-circle', 'Clear updates', 'Kept informed throughout'],
    ],
  },
  guzellik: {
    tr: [
      ['sparkles', 'Kişiye özel bakım', 'İhtiyacınıza göre öneri'],
      ['scissors', 'Deneyimli eller', 'Özenli ve titiz uygulama'],
      ['calendar', 'Kolay randevu', 'Size uygun saati seçin'],
      ['heart', 'Rahat atmosfer', 'Kendinize vakit ayırın'],
    ],
    en: [
      ['sparkles', 'Personal care', 'Advice that fits your needs'],
      ['scissors', 'Skilled hands', 'Careful, precise work'],
      ['calendar', 'Easy booking', 'Pick a time that suits you'],
      ['heart', 'Calm atmosphere', 'Take time for yourself'],
    ],
  },
  hukuk: {
    tr: [
      ['scale', 'Hukuki danışma', 'Sorunuzu birlikte ele alalım'],
      ['lock', 'Gizlilik', 'Bilgileriniz sizinle kalır'],
      ['calendar', 'Randevulu görüşme', 'Dosyanıza ayrılmış zaman'],
      ['message-circle', 'Açık dil', 'Süreci sade anlatırız'],
    ],
    en: [
      ['scale', 'Legal advice', 'We look at your question together'],
      ['lock', 'Confidentiality', 'Your details stay with you'],
      ['calendar', 'By appointment', 'Time set aside for your file'],
      ['message-circle', 'Plain language', 'We explain the process simply'],
    ],
  },
  restoran: {
    tr: [
      ['utensils', 'Günlük mutfak', 'Menü mevsime göre şekillenir'],
      ['leaf', 'Taze malzeme', 'Özenle seçilmiş ürünler'],
      ['calendar', 'Masa ayırtma', 'Önceden yer ayırtabilirsiniz'],
      ['gift', 'Özel günler', 'Davetleriniz için uygun alan'],
    ],
    en: [
      ['utensils', 'Daily kitchen', 'The menu follows the season'],
      ['leaf', 'Fresh produce', 'Carefully chosen ingredients'],
      ['calendar', 'Table booking', 'Reserve a table in advance'],
      ['gift', 'Special occasions', 'A fitting space for your events'],
    ],
  },
  eticaret: {
    tr: [
      ['truck', 'Kargo takibi', 'Siparişinizi adım adım izleyin'],
      ['credit-card', 'Güvenli ödeme', 'Kart bilgileriniz korunur'],
      ['refresh-cw', 'Kolay iade', 'İade koşullarını sayfada görün'],
      ['headphones', 'Destek', 'Sorularınız için yanınızdayız'],
    ],
    en: [
      ['truck', 'Shipment tracking', 'Follow your order step by step'],
      ['credit-card', 'Secure payment', 'Your card details are protected'],
      ['refresh-cw', 'Easy returns', 'See the return terms on the page'],
      ['headphones', 'Support', 'Here for your questions'],
    ],
  },
}

export function demoHeroStripItems(slug: string, lang: 'tr' | 'en'): HeroStripItemLike[] | null {
  const boxes = DEMO_HERO_STRIP_BOXES[slug]?.[lang]
  if (!boxes) return null
  return boxes.map(([icon, title, text]) => ({ icon, title, text, sample: true }))
}

/** Right below the opening run of hero / slider sections, skipping an announcement band at the very top. */
export function demoHeroStripIndex(sections: readonly Section[]): number {
  let index = sections[0]?.type === 'announcement' ? 1 : 0
  while (index < sections.length && (sections[index].type === 'hero' || sections[index].type === 'slider')) index++
  return index
}

/** Adds the sample strip to a demo site, in place. Skipped when the home list has no hero or already has a strip. */
export function addDemoHeroStrip(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
  const items = demoHeroStripItems(slug, lang)
  if (!items) return
  if (site.sections.some((s) => s.type === 'heroStrip')) return
  if (!site.sections.some((s) => s.type === 'hero' || s.type === 'slider')) return
  site.sections.splice(demoHeroStripIndex(site.sections), 0, { type: 'heroStrip', items, sample: true } as Section)
}
