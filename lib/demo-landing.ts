import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { aboutLabel } from '@/lib/about-media'
import { buildStarterAboutDetail, findAboutSection, syncDetailPages } from '@/lib/section-detail'
import { demoReferenceItems } from '@/lib/demo-references'
import { demoTestimonialItems } from '@/lib/demo-testimonials'
import { LANDING_SERVICES_CTA, LANDING_SERVICE_PAGES, servicePageBlocks } from '@/lib/demo-landing-services'
import { defaultServicesLinkLabel, syncServicesPage } from '@/lib/service-pages'

/**
 * Sector landing demos
 * --------------------
 * One-page example sites for trades that sell through a single action (call,
 * survey, service visit, quote). They are registered in `lib/demos.ts` next to
 * the showcase demos and rendered by the same `WebsiteRenderer`; only the copy
 * and the palette are decided here.
 *
 * Copy rules: no customer counts, years, awards, certificates,
 * round-the-clock or guarantee claims, and no digits at all. The phone number
 * is the fixed placeholder below, there is no street address and no real
 * company name. Region names carry an explicit "(örnek)" marker.
 * Reviews and reference logos are fictional, flagged `sample` and labelled as
 * examples; they have no standalone pages. Photos are generated illustrations
 * (`LANDING_MEDIA`): no faces, plates, text or logos, so none can pass for a
 * real business.
 */

type Lang = 'tr' | 'en'
type L = { tr: string; en: string }
type IconItem = { icon: string; title: L; text: L }
type Question = { q: L; a: L }

export const LANDING_DEMO_PHONE = '0212 000 00 00'

export type LandingDemoContent = {
  theme: WebsiteSchema['theme']
  typography: WebsiteSchema['typography']
  tagline: L
  tone: L
  audience: L
  /** The sector's single call to action, used by the header and the hero. */
  cta: L
  hero: { badge: L; title: L; text: L }
  services: { subtitle: L; items: IconItem[] }
  process: { subtitle: L; steps: IconItem[] }
  why: { subtitle: L; items: IconItem[] }
  area: { body: L; places: L[] }
  faq: Question[]
  contact: { title: L; text: L; email: string }
}

type Photo = { src: string; alt: L }
type LandingMedia = {
  hero: Photo
  gallery: Photo[]
  /** Keyed by the Turkish service title; services without a photo are left out of the page. */
  services: Record<string, Photo>
}

const photo = (src: string, tr: string, en: string): Photo => ({ src, alt: { tr, en } })

/**
 * Illustrative stock-style photography generated for the demos. No real business,
 * no people's faces, no plates, no text and no logos appear in any of them.
 */
const LANDING_MEDIA: Record<string, LandingMedia> = {
  'oto-cekici': {
    hero: photo('/demos/oto-cekici/hero.21be1322.webp', 'Kayar kasa çekici otoyolda alacakaranlıkta', 'A flatbed tow truck on a motorway at dusk'),
    gallery: [
      photo('/demos/oto-cekici/g1.1d13cdff.webp', 'Gece aracın çekici kasasına çekilmesi', 'A vehicle being winched onto a flatbed at night'),
      photo('/demos/oto-cekici/g2.8f8ddcdb.webp', 'Yol yardım aracı otoyolda', 'A roadside rescue vehicle on the motorway'),
      photo('/demos/oto-cekici/g3.bef238cd.webp', 'Dörtlü flaşörleri yanan arızalı binek araç', 'A broken-down car with its hazard lights on'),
      photo('/demos/oto-cekici/g4.895b49b6.webp', 'Gece otoyolunda araç ışıkları', 'Vehicle lights on a night motorway'),
    ],
    services: {
      'Oto çekici': photo('/demos/oto-cekici/services/oto-cekici.ad8f5ca7.webp', 'Kayar kasa çekici', 'A flatbed tow truck'),
      'Yol yardım': photo('/demos/oto-cekici/services/yol-yardim.d4a254fc.webp', 'Yol kenarında yardım', 'Roadside help'),
      'Akü takviye': photo('/demos/oto-cekici/services/aku-takviye.47c6ad4a.webp', 'Akü takviye kabloları', 'Jump-start cables on a battery'),
      'Lastik desteği': photo('/demos/oto-cekici/services/lastik-destegi.08ec6c55.webp', 'Lastik değişimi', 'A tyre change'),
    },
  },
  nakliyat: {
    hero: photo('/demos/nakliyat/hero.63738dff.webp', 'Nakliyat kamyonu gün ışığında', 'A moving truck in daylight'),
    gallery: [
      photo('/demos/nakliyat/g1.762d12d9.webp', 'Oturma odasında taşınma kolileri', 'Moving boxes in a living room'),
      photo('/demos/nakliyat/g2.fa432c88.webp', 'Koruyucu örtüyle sarılmış koltuk', 'A sofa wrapped in protective cover'),
      photo('/demos/nakliyat/g3.2ec0b532.webp', 'Eşyalarla dolu kamyon kasası', 'A truck loaded with furniture and boxes'),
      photo('/demos/nakliyat/g4.c47c099c.webp', 'Paketleme malzemeleri', 'Packing supplies laid out'),
    ],
    services: {
      'Evden eve taşıma': photo('/demos/nakliyat/services/evden-eve.7b3303c3.webp', 'Taşınma sırasında ev içi', 'A home interior mid-move'),
      'Ofis taşıma': photo('/demos/nakliyat/services/ofis-tasima.108a22d0.webp', 'Taşınmakta olan ofis', 'An office being moved'),
      'Asansörlü taşıma': photo('/demos/nakliyat/services/asansorlu.43747bcb.webp', 'Dış cephe asansörü', 'An exterior furniture lift'),
      Paketleme: photo('/demos/nakliyat/services/paketleme.722ef3ba.webp', 'Kırılacak eşya paketleme', 'Packing fragile items'),
    },
  },
  'kombi-klima': {
    hero: photo('/demos/kombi-klima/hero.c93c3fef.webp', 'Duvara monte klima ve kombi bulunan aydınlık oturma odası', 'A bright living room with a wall-mounted AC and a combi boiler'),
    gallery: [
      photo('/demos/kombi-klima/g1.4aa11444.webp', 'Kombi bakımı yapan teknisyen', 'A technician servicing a boiler'),
      photo('/demos/kombi-klima/g2.86c53995.webp', 'Klima montajı yapan teknisyen', 'A technician installing an air conditioner'),
      photo('/demos/kombi-klima/g3.346e9f10.webp', 'Kapısı açık, alet dolu servis aracı', 'A service van with its side door open and tools inside'),
      photo('/demos/kombi-klima/g4.a1f800ed.webp', 'Duvardaki petek', 'A wall radiator'),
    ],
    services: {
      'Kombi bakımı': photo('/demos/kombi-klima/services/kombi-bakimi.d53c149e.webp', 'Kombi bakımı', 'Boiler maintenance'),
      'Klima montajı': photo('/demos/kombi-klima/services/klima-montaji.2a65e5d1.webp', 'Klima montajı', 'AC installation'),
      'Petek temizliği': photo('/demos/kombi-klima/services/petek-temizligi.a53d2dfc.webp', 'Petek temizliği', 'Radiator flushing'),
      'Klima bakımı': photo('/demos/kombi-klima/services/klima-bakimi.5a03d6df.webp', 'Klima bakımı', 'AC maintenance'),
    },
  },
  insaat: {
    hero: photo('/demos/insaat/hero.f89cf15a.webp', 'Vinç ve iskele ile yükselen bir yapı', 'A building rising under a crane and scaffolding'),
    gallery: [
      photo('/demos/insaat/g1.90a83574.webp', 'Şantiyede kule vinç', 'A tower crane on a building site'),
      photo('/demos/insaat/g2.eabea145.webp', 'Masada mimari plan', 'An architectural plan on a table'),
      photo('/demos/insaat/g3.5c71d9c7.webp', 'Tamamlanmış bir cephe', 'A completed building facade'),
      photo('/demos/insaat/g4.8dd360c8.webp', 'Kazı yapan iş makinesi', 'An excavator at work'),
    ],
    services: {
      'Konut inşaatı': photo('/demos/insaat/services/konut-insaati.8eadcabb.webp', 'Yapım aşamasında konut', 'A home under construction'),
      'Tadilat ve yenileme': photo('/demos/insaat/services/tadilat.c588d20c.webp', 'Tadilat çalışması', 'Renovation work'),
      'Kaba yapı': photo('/demos/insaat/services/kaba-yapi.fc121289.webp', 'Kaba yapı çalışması', 'Structural work'),
      'Keşif ve metraj': photo('/demos/insaat/services/kesif-metraj.e233598d.webp', 'Keşif ve ölçüm', 'Survey and measuring'),
    },
  },
}

export function getLandingDemoHeroImage(slug: string): { src: string; alt: string } | null {
  const hero = LANDING_MEDIA[slug]?.hero
  if (!hero) return null

  return { src: hero.src, alt: hero.alt.tr }
}

const l = (tr: string, en: string): L => ({ tr, en })
const item = (icon: string, title: L, text: L): IconItem => ({ icon, title, text })
const qa = (q: L, a: L): Question => ({ q, a })

const COMMON = {
  services: l('Hizmetler', 'Services'),
  process: l('Nasıl çalışır?', 'How it works'),
  why: l('Neden biz?', 'Why us'),
  area: l('Hizmet bölgemiz', 'Service area'),
  faq: l('Sıkça sorulan sorular', 'Frequently asked questions'),
  gallery: l('Galeri', 'Gallery'),
  gallerySub: l('Bu demodaki görseller örnek amaçlıdır.', 'The images in this demo are illustrative.'),
  reviews: l('Örnek müşteri yorumları', 'Sample customer reviews'),
  reviewsSub: l(
    'Bu demodaki yorumlar kurgusaldır; sektörün nasıl görüneceğini göstermek için yazılmıştır.',
    'The reviews in this demo are fictional, written to show how this kind of site would look.',
  ),
  references: l('Örnek referanslar', 'Sample references'),
  referencesSub: l(
    'Bu demodaki firmalar kurgusaldır; logo alanının nasıl görüneceğini göstermek için eklenmiştir.',
    'The companies in this demo are fictional, added to show how the logo area would look.',
  ),
  contactNav: l('İletişim', 'Contact'),
  processNav: l('Nasıl Çalışır', 'How It Works'),
  whyNav: l('Neden Biz', 'Why Us'),
  aboutNav: l('Hakkımızda', 'About'),
  faqNav: l('SSS', 'FAQ'),
  samplePhone: l('Örnek numara', 'Sample number'),
  samplePlace: l('örnek', 'sample'),
  name: l('Ad Soyad', 'Full name'),
  phone: l('Telefon', 'Phone'),
  message: l('Mesaj', 'Message'),
}

export const LANDING_DEMOS: Record<string, LandingDemoContent> = {
  'oto-cekici': {
    theme: {
      mode: 'dark',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#f5b301' },
        { name: 'accent', hex: '#ff8a1f' },
        { name: 'background', hex: '#0b1730' },
        { name: 'foreground', hex: '#f4f6fb' },
      ],
    },
    typography: { headingFont: 'Archivo', bodyFont: 'Inter' },
    tagline: l('Yolda kaldığınızda çekici bir telefon uzağınızda', 'A tow truck is one call away'),
    tone: l('Net, hızlı, güven veren', 'Clear, fast, reassuring'),
    audience: l('Aracı yolda kalan sürücüler', 'Drivers whose vehicle has broken down'),
    cta: l('Hemen ara', 'Call now'),
    hero: {
      badge: l('Oto Kurtarıcı & Çekici', 'Towing & Recovery'),
      title: l('Yolda kaldıysanız çekici bir telefon uzağınızda', 'Stuck on the road? A tow truck is one call away'),
      text: l(
        'Arıza, kaza veya lastik sorunu fark etmez. Konumunuzu paylaşın, aracınızı istediğiniz servise ya da adrese taşıyalım.',
        'Breakdown, accident or flat tyre: share your location and we will take your vehicle to the garage or address you choose.',
      ),
    },
    services: {
      subtitle: l('Aracınızın durumuna göre doğru desteği seçin', 'Pick the help that fits your situation'),
      items: [
        item(
          'truck',
          l('Oto çekici', 'Vehicle towing'),
          l('Arızalanan veya kaza yapan aracınızı kayar kasa çekiciyle taşırız.', 'We carry your broken-down or damaged vehicle on a flatbed truck.'),
        ),
        item(
          'life-buoy',
          l('Yol yardım', 'Roadside assistance'),
          l('Yerinde çözülebilecek küçük arızalar için yol kenarında destek veririz.', 'Help at the roadside for small faults that can be fixed on the spot.'),
        ),
        item(
          'battery-charging',
          l('Akü takviye', 'Battery jump-start'),
          l('Aküsü biten aracınızı takviye ile yeniden çalıştırırız.', 'We jump-start your vehicle when the battery is flat.'),
        ),
        item(
          'circle-dot',
          l('Lastik desteği', 'Tyre help'),
          l('Patlayan lastiği stepneyle değiştirir ya da aracı lastikçiye ulaştırırız.', 'We fit your spare wheel or take the vehicle to a tyre shop.'),
        ),
        item(
          'route',
          l('Şehirler arası taşıma', 'Long-distance transport'),
          l('Aracınızı başka bir şehre kayar kasa ile taşırız.', 'We move your vehicle to another city on a flatbed.'),
        ),
        item(
          'bike',
          l('Motosiklet taşıma', 'Motorcycle transport'),
          l('Motosikletinizi kasaya sabitleyerek taşırız.', 'We strap your motorcycle to the bed and transport it.'),
        ),
      ],
    },
    process: {
      subtitle: l('Aramadan teslimata dört adım', 'Four steps from call to drop-off'),
      steps: [
        item('phone-call', l('Arayın', 'Call'), l('Bizi arayın ve aracınızın durumunu kısaca anlatın.', 'Call us and briefly describe what happened.')),
        item('map-pin', l('Konum paylaşın', 'Share your location'), l('Bulunduğunuz yeri telefonla ya da mesajla iletin.', 'Tell us where you are by phone or message.')),
        item('receipt', l('Ücreti öğrenin', 'Hear the price'), l('Mesafe ve araç tipine göre ücreti yola çıkmadan önce söyleriz.', 'We tell you the price, based on distance and vehicle type, before we set off.')),
        item('truck', l('Aracınız taşınsın', 'Vehicle transported'), l('Çekici gelir, aracınızı yükler ve istediğiniz adrese bırakır.', 'The truck arrives, loads your vehicle and drops it at the address you choose.')),
      ],
    },
    why: {
      subtitle: l('Zor bir anda işinizi kolaylaştıran çalışma şekli', 'A way of working that makes a bad moment easier'),
      items: [
        item('message-circle', l('Önce net bilgi', 'Clear information first'), l('Ücreti ve tahmini varış bilgisini yola çıkmadan paylaşırız.', 'We share the price and an estimated arrival before we set off.')),
        item('shield-check', l('Özenli yükleme', 'Careful loading'), l('Aracınız kayar kasaya sabitlenerek taşınır.', 'Your vehicle is secured to the flatbed for the journey.')),
        item('map', l('Bölgeyi bilen ekip', 'A team that knows the area'), l('Yolları ve servisleri tanıyan sürücülerle çalışırız.', 'Our drivers know the roads and the local garages.')),
        item('file-text', l('Belgeli işlem', 'Documented service'), l('Taşıma sonrasında fiş veya fatura düzenlenir.', 'You receive a receipt or invoice after the job.')),
      ],
    },
    area: {
      body: l(
        'Şehir merkezi, çevre ilçeler ve otoyol güzergâhlarında hizmet veriyoruz. Bölge adları örnek olarak yazılmıştır.',
        'We cover the city centre, nearby districts and motorway routes. The area names are written as examples.',
      ),
      places: [
        l('Şehir merkezi', 'City centre'),
        l('Çevre ilçeler', 'Nearby districts'),
        l('Otoyol ve çevre yolu', 'Motorway and ring road'),
        l('Şehirler arası', 'Between cities'),
      ],
    },
    faq: [
      qa(
        l('Çekici ne kadar sürede gelir?', 'How long does the truck take to arrive?'),
        l('Süre; bulunduğunuz konuma, trafiğe ve o anki yoğunluğa göre değişir. Aradığınızda tahmini varış bilgisini paylaşırız.', 'It depends on where you are, the traffic and how busy we are. We give you an estimate when you call.'),
      ),
      qa(
        l('Ücret nasıl belirlenir?', 'How is the price set?'),
        l('Mesafe, araç tipi ve yol durumuna göre belirlenir. Net ücreti çekici yola çıkmadan önce öğrenirsiniz.', 'It depends on distance, vehicle type and road conditions. You hear the exact price before the truck sets off.'),
      ),
      qa(
        l('Hangi araçları taşıyorsunuz?', 'Which vehicles do you carry?'),
        l('Otomobil, hafif ticari araç ve motosiklet taşıyoruz. Farklı bir araç için arayıp sorabilirsiniz.', 'Cars, light commercial vehicles and motorcycles. Call us to ask about anything else.'),
      ),
      qa(
        l('Şehir dışına taşıma yapıyor musunuz?', 'Do you transport to other cities?'),
        l('Evet. Şehirler arası taşıma için güzergâhı ve günü birlikte planlarız.', 'Yes. For long-distance jobs we plan the route and the day with you.'),
      ),
      qa(
        l('Ödemeyi nasıl yapabilirim?', 'How can I pay?'),
        l('Ödeme seçeneklerini aradığınızda öğrenebilirsiniz.', 'We tell you the payment options when you call.'),
      ),
    ],
    contact: {
      title: l('Çekici çağırın', 'Call a tow truck'),
      text: l('Arayın ya da formu doldurun, size dönelim. Telefon numarası örnektir.', 'Call us or fill in the form and we will get back to you. The phone number is a sample.'),
      email: 'bilgi@ornek-otokurtarma.demo',
    },
  },

  nakliyat: {
    theme: {
      mode: 'light',
      radius: 'large',
      palette: [
        { name: 'primary', hex: '#1d4ed8' },
        { name: 'accent', hex: '#c2410c' },
        { name: 'background', hex: '#f4f8ff' },
        { name: 'foreground', hex: '#0f2147' },
      ],
    },
    typography: { headingFont: 'Poppins', bodyFont: 'Inter' },
    tagline: l('Eviniz özenle paketlenir, yeni adresinize taşınır', 'Your home packed with care and moved'),
    tone: l('Düzenli, sakin, güven veren', 'Organised, calm, reassuring'),
    audience: l('Evini ya da ofisini taşıyacak kişiler', 'People moving home or office'),
    cta: l('Ücretsiz keşif iste', 'Request a free survey'),
    hero: {
      badge: l('Nakliyat & Evden Eve Taşıma', 'Moving & Relocation'),
      title: l('Eviniz özenle paketlensin, yeni adresinize taşınsın', 'Your home packed with care and moved to your new address'),
      text: l(
        'Keşifle başlarız: eşyalarınızı yerinde görür, taşınmayı birlikte planlar ve yazılı teklif veririz.',
        'We start with a survey: we see your belongings on site, plan the move with you and give you a written quote.',
      ),
    },
    services: {
      subtitle: l('Taşınmanın her aşaması için tek ekip', 'One team for every stage of the move'),
      items: [
        item(
          'house',
          l('Evden eve taşıma', 'Home moving'),
          l('Eşyalarınızı paketler, taşır, mobilyaları söküp yeni evinizde kurarız.', 'We pack and move your belongings, and take apart and reassemble the furniture.'),
        ),
        item(
          'building-2',
          l('Ofis taşıma', 'Office moving'),
          l('Mobilya, dosya ve ekipmanları iş akışınıza göre planlayarak taşırız.', 'We move furniture, files and equipment on a plan built around your workday.'),
        ),
        item(
          'arrow-up-from-line',
          l('Asansörlü taşıma', 'Furniture lift'),
          l('Yüksek katlarda eşyalar dış cephe asansörüyle indirilir ve çıkarılır.', 'On upper floors, items go up and down with an exterior furniture lift.'),
        ),
        item(
          'package',
          l('Paketleme', 'Packing'),
          l('Kırılacak eşyalar ve mobilyalar türüne uygun malzemeyle paketlenir.', 'Fragile items and furniture are packed in materials suited to each.'),
        ),
        item(
          'route',
          l('Şehirler arası nakliyat', 'Long-distance moving'),
          l('Başka bir şehre taşınırken güzergâhı ve teslim gününü birlikte belirleriz.', 'For a move to another city we agree the route and the delivery day with you.'),
        ),
        item(
          'warehouse',
          l('Eşya depolama', 'Storage'),
          l('Taşınma tarihleri uyuşmadığında eşyalarınız için depolama seçeneği sunarız.', 'When your dates do not line up, we offer storage for your belongings.'),
        ),
      ],
    },
    process: {
      subtitle: l('Keşiften yerleşmeye dört adım', 'Four steps from survey to settling in'),
      steps: [
        item('clipboard-list', l('Keşif isteyin', 'Request a survey'), l('Formu doldurun ya da arayın, uygun bir keşif günü belirleyelim.', 'Fill in the form or call, and we set a day for the survey.')),
        item('search-check', l('Yerinde keşif', 'On-site survey'), l('Eşyalarınızı ve bina koşullarını yerinde görürüz.', 'We see your belongings and the building in person.')),
        item('file-text', l('Yazılı teklif', 'Written quote'), l('Kapsamı ve ücreti içeren teklifi size iletiriz.', 'We send you a quote covering the scope and the price.')),
        item('truck', l('Taşınma günü', 'Moving day'), l('Ekip eşyalarınızı paketler, taşır ve yeni adreste yerleştirir.', 'The team packs, moves and places your belongings at the new address.')),
      ],
    },
    why: {
      subtitle: l('Taşınma gününü öngörülebilir kılan çalışma şekli', 'A way of working that keeps moving day predictable'),
      items: [
        item('file-text', l('Yazılı teklif', 'Written quote'), l('Ücret ve kapsam taşınmadan önce yazılı olarak netleşir.', 'Price and scope are settled in writing before the move.')),
        item('package', l('Özenli paketleme', 'Careful packing'), l('Eşyalar türüne uygun malzemeyle korunur.', 'Each item is protected with the right material.')),
        item('users', l('Aynı ekip', 'The same team'), l('Paketleme, taşıma ve yerleştirme aynı ekip tarafından yapılır.', 'Packing, moving and placing are done by one team.')),
        item('calendar-check', l('Planlı taşınma', 'A planned move'), l('Gün ve saat sizinle birlikte belirlenir.', 'The day and time are agreed with you.')),
      ],
    },
    area: {
      body: l(
        'Şehir içi ve şehirler arası taşıma yapıyoruz. Bölge adları örnek olarak yazılmıştır.',
        'We handle moves within the city and between cities. The area names are written as examples.',
      ),
      places: [
        l('Şehir içi taşıma', 'Moves within the city'),
        l('Çevre ilçeler', 'Nearby districts'),
        l('Şehirler arası taşıma', 'Moves between cities'),
      ],
    },
    faq: [
      qa(
        l('Keşif ücretli mi?', 'Is the survey paid?'),
        l('Hayır, keşif ücretsizdir. Eşyalarınızı yerinde görerek teklif hazırlarız.', 'No, the survey is free. We prepare the quote after seeing your belongings on site.'),
      ),
      qa(
        l('Fiyat nasıl belirlenir?', 'How is the price set?'),
        l('Eşya miktarı, kat, mesafe ve asansör ihtiyacına göre belirlenir. Net ücret keşiften sonra yazılı teklifle bildirilir.', 'It depends on the volume, the floor, the distance and whether a lift is needed. The exact price comes in the written quote after the survey.'),
      ),
      qa(
        l('Eşyalarımı kim paketliyor?', 'Who packs my belongings?'),
        l('Paketlemeyi ekibimiz yapar. Dilerseniz özel eşyalarınızı kendiniz de paketleyebilirsiniz.', 'Our team does the packing. You can pack personal items yourself if you prefer.'),
      ),
      qa(
        l('Taşınma ne kadar sürer?', 'How long does the move take?'),
        l('Süre; eşya miktarına, kat durumuna ve mesafeye göre değişir. Keşif sonrasında tahmini süreyi paylaşırız.', 'It depends on the volume, the floor and the distance. We share an estimate after the survey.'),
      ),
      qa(
        l('Ne kadar önceden haber vermeliyim?', 'How far ahead should I get in touch?'),
        l('Taşınma tarihiniz belli olur olmaz keşif istemeniz planlamayı kolaylaştırır.', 'Requesting a survey as soon as you know your date makes planning easier.'),
      ),
    ],
    contact: {
      title: l('Ücretsiz keşif isteyin', 'Request a free survey'),
      text: l('Formu doldurun ya da arayın, keşif için uygun günü birlikte belirleyelim. Telefon numarası örnektir.', 'Fill in the form or call and we will agree a day for the survey. The phone number is a sample.'),
      email: 'bilgi@ornek-nakliyat.demo',
    },
  },

  'kombi-klima': {
    theme: {
      mode: 'light',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#14306b' },
        { name: 'accent', hex: '#0369a1' },
        { name: 'background', hex: '#f8fafc' },
        { name: 'foreground', hex: '#0f1f3a' },
      ],
    },
    typography: { headingFont: 'Sora', bodyFont: 'Inter' },
    tagline: l('Kombi ve klimanız için randevulu servis', 'Service visits for your boiler and air conditioner'),
    tone: l('Teknik, açık, düzenli', 'Technical, plain-spoken, orderly'),
    audience: l('Kombisi ya da kliması için servis arayanlar', 'People who need a boiler or AC technician'),
    cta: l('Servis çağır', 'Request service'),
    hero: {
      badge: l('Kombi & Klima Servisi', 'Boiler & AC Service'),
      title: l('Kombi ve klimanız için servis çağırın', 'Request a service visit for your boiler or AC'),
      text: l(
        'Bakım, onarım ve montaj için randevu oluşturun. Yapılacak işlem ve ücret, işlemden önce size anlatılır.',
        'Book a visit for maintenance, repair or installation. The work and the price are explained before anything starts.',
      ),
    },
    services: {
      subtitle: l('Isıtma ve soğutma cihazlarınız için bakım, onarım ve montaj', 'Maintenance, repair and installation for heating and cooling'),
      items: [
        item('flame', l('Kombi bakımı', 'Boiler maintenance'), l('Cihazın genel kontrolü ve temizliği yapılır.', 'A general check and clean of the unit.')),
        item('wrench', l('Kombi onarımı', 'Boiler repair'), l('Arıza yerinde tespit edilir, gerekli işlem size anlatılır.', 'The fault is found on site and the fix is explained to you.')),
        item('heater', l('Petek temizliği', 'Radiator flushing'), l('Isınmayan petekler için tesisat temizliği yapılır.', 'The system is flushed when radiators stay cold.')),
        item('snowflake', l('Klima bakımı', 'AC maintenance'), l('Filtre ve ünite temizliği ile genel kontrol yapılır.', 'Filters and units are cleaned and the system is checked.')),
        item('fan', l('Klima montajı', 'AC installation'), l('Klimanın yeri belirlenir, montajı ve ilk çalıştırması yapılır.', 'We choose the position, install the unit and run it for the first time.')),
        item('droplets', l('Gaz kontrolü ve dolumu', 'Refrigerant check and refill'), l('Soğutması zayıflayan klimalarda gaz kontrol edilir, gerekiyorsa tamamlanır.', 'When cooling weakens, the refrigerant is checked and topped up if needed.')),
      ],
    },
    process: {
      subtitle: l('Kayıttan teslime dört adım', 'Four steps from request to handover'),
      steps: [
        item('phone-call', l('Servis çağırın', 'Request service'), l('Arayın ya da formu doldurun, cihazı ve sorunu kısaca anlatın.', 'Call or fill in the form and briefly describe the unit and the problem.')),
        item('calendar-check', l('Randevu alın', 'Book a time'), l('Size uygun gün ve saat aralığını birlikte belirleriz.', 'We agree a day and time window that suits you.')),
        item('search-check', l('Yerinde inceleme', 'On-site inspection'), l('Teknisyen cihazı inceler, yapılacak işlemi ve ücreti anlatır.', 'The technician inspects the unit and explains the work and the price.')),
        item('wrench', l('İşlem ve teslim', 'Work and handover'), l('Onayınızla işlem yapılır, cihaz çalışır durumda teslim edilir.', 'With your approval the work is done and the unit is handed over running.')),
      ],
    },
    why: {
      subtitle: l('Evinize gelen servisten beklediğiniz düzen', 'The order you expect from a technician in your home'),
      items: [
        item('receipt', l('Önce bilgi, sonra işlem', 'Information before work'), l('Yapılacak işlem ve ücret anlatılır, onayınız olmadan başlanmaz.', 'The work and the price are explained, and nothing starts without your approval.')),
        item('calendar-check', l('Randevulu servis', 'Visits by appointment'), l('Teknisyen, belirlenen gün ve saat aralığında gelir.', 'The technician comes on the agreed day and time window.')),
        item('sparkles', l('Temiz çalışma', 'Tidy work'), l('İşlem sonrasında çalışma alanı toplanarak bırakılır.', 'The work area is tidied before we leave.')),
        item('clipboard-check', l('İşlem kaydı', 'A record of the work'), l('Yapılan işlem ve değişen parçalar servis formuna yazılır.', 'The work done and any parts replaced are written on the service form.')),
      ],
    },
    area: {
      body: l(
        'Şehir merkezi ve çevre ilçelerde ev ve iş yerlerine servis veriyoruz. Bölge adları örnek olarak yazılmıştır.',
        'We visit homes and workplaces in the city centre and nearby districts. The area names are written as examples.',
      ),
      places: [
        l('Şehir merkezi', 'City centre'),
        l('Çevre ilçeler', 'Nearby districts'),
        l('Siteler ve iş yerleri', 'Housing estates and workplaces'),
      ],
    },
    faq: [
      qa(
        l('Servis ne zaman gelir?', 'When can the technician come?'),
        l('Randevu, yoğunluğa ve adresinize göre belirlenir. Aradığınızda en yakın uygun zamanı söyleriz.', 'It depends on how busy we are and on your address. We tell you the nearest available time when you call.'),
      ),
      qa(
        l('Ücret nasıl belirlenir?', 'How is the price set?'),
        l('Yapılacak işleme ve gereken parçaya göre belirlenir. Teknisyen ücreti işlemden önce bildirir.', 'It depends on the work and the parts needed. The technician tells you the price before starting.'),
      ),
      qa(
        l('Hangi markalara bakıyorsunuz?', 'Which brands do you service?'),
        l('Farklı marka ve modellerde kombi ve klimalara servis veriyoruz. Cihazınızın markasını arayarak sorabilirsiniz.', 'We service boilers and air conditioners of various brands and models. Call us to ask about yours.'),
      ),
      qa(
        l('Kombi bakımı ne zaman yaptırılmalı?', 'When should a boiler be serviced?'),
        l('Genel öneri, ısıtma sezonu başlamadan önce bakım yaptırmaktır. Cihazınızın kullanım kılavuzundaki önerileri de dikkate alın.', 'The general advice is to have it serviced before the heating season. Follow the recommendations in your unit’s manual as well.'),
      ),
      qa(
        l('Klima montajı için ne gerekiyor?', 'What is needed for an AC installation?'),
        l('Cihazın takılacağı yerin ve iç ile dış ünite arasındaki mesafenin görülmesi gerekir. Keşif sonrasında gerekli malzemeyi bildiririz.', 'We need to see where the unit will go and the distance between the indoor and outdoor units. After the visit we tell you which materials are needed.'),
      ),
    ],
    contact: {
      title: l('Servis çağırın', 'Request a service visit'),
      text: l('Cihazınızı ve sorunu yazın, sizi arayalım. Telefon numarası örnektir.', 'Tell us about the unit and the problem and we will call you. The phone number is a sample.'),
      email: 'bilgi@ornek-kombiklima.demo',
    },
  },

  insaat: {
    theme: {
      mode: 'light',
      radius: 'small',
      palette: [
        { name: 'primary', hex: '#2a2f35' },
        { name: 'accent', hex: '#b45309' },
        { name: 'background', hex: '#f4f3f0' },
        { name: 'foreground', hex: '#1c2024' },
      ],
    },
    typography: { headingFont: 'Space Grotesk', bodyFont: 'Inter' },
    tagline: l('Keşiften teslime tek ekip', 'One team from survey to handover'),
    tone: l('Sağlam, planlı, açık', 'Solid, planned, transparent'),
    audience: l('Konut, iş yeri ya da tadilat işi yaptıracaklar', 'People planning a build or a renovation'),
    cta: l('Teklif al', 'Get a quote'),
    hero: {
      badge: l('İnşaat & Taahhüt', 'Construction & Contracting'),
      title: l('Projenizi keşiften teslime tek ekiple yürütün', 'Run your project with one team, from survey to handover'),
      text: l(
        'Konut, iş yeri ve tadilat işlerinde keşif yapar, kapsamı ve bütçeyi yazılı teklifle netleştirir, işi programına göre yürütürüz.',
        'For homes, workplaces and renovations we survey the site, settle scope and budget in a written quote, and run the job to a programme.',
      ),
    },
    services: {
      subtitle: l('Kaba yapıdan ince işlere uygulama', 'From structure to finishes'),
      items: [
        item('building-2', l('Konut inşaatı', 'Residential construction'), l('Müstakil ev ve apartman projelerinde yapım işlerini yürütürüz.', 'We carry out the build for houses and apartment blocks.')),
        item('hard-hat', l('Taahhüt işleri', 'Contracting'), l('Projesi hazır işlerin yapımını sözleşme kapsamında üstleniriz.', 'We take on designed projects and build them under contract.')),
        item('paint-roller', l('Tadilat ve yenileme', 'Renovation'), l('Daire, ofis ve dükkânlarda kapsamlı tadilat yaparız.', 'Full renovations for flats, offices and shops.')),
        item('brick-wall', l('Kaba yapı', 'Structural work'), l('Temel, betonarme ve duvar işleri.', 'Foundations, reinforced concrete and masonry.')),
        item('layers', l('İnce işler', 'Finishing work'), l('Sıva, şap, seramik, boya ve doğrama uygulamaları.', 'Plaster, screed, tiling, painting and joinery.')),
        item('ruler', l('Keşif ve metraj', 'Survey and take-off'), l('Yerinde ölçüm yapılır, iş kalemleri ve miktarlar çıkarılır.', 'We measure on site and list the work items and quantities.')),
      ],
    },
    process: {
      subtitle: l('İlk görüşmeden teslime dört adım', 'Four steps from first meeting to handover'),
      steps: [
        item('message-circle', l('İlk görüşme', 'First meeting'), l('İhtiyacınızı ve varsa projenizi dinleriz.', 'We listen to what you need and look at any drawings you have.')),
        item('ruler', l('Keşif ve metraj', 'Survey and take-off'), l('Alanı yerinde görür, iş kalemlerini çıkarırız.', 'We see the site in person and list the work items.')),
        item('file-text', l('Teklif ve sözleşme', 'Quote and contract'), l('Kapsam, bütçe ve iş programı yazılı olarak netleşir.', 'Scope, budget and programme are settled in writing.')),
        item('hammer', l('Uygulama ve teslim', 'Build and handover'), l('İş programına göre ilerler, tamamlanan işi birlikte kontrol ederek teslim ederiz.', 'We follow the programme, then check the finished work together and hand it over.')),
      ],
    },
    why: {
      subtitle: l('Şantiyede sürpriz bırakmayan çalışma şekli', 'A way of working that leaves no surprises on site'),
      items: [
        item('file-text', l('Yazılı kapsam', 'Scope in writing'), l('Yapılacak işler ve malzemeler teklifte kalem kalem yer alır.', 'The work and the materials are itemised in the quote.')),
        item('calendar-check', l('İş programı', 'A work programme'), l('İşin aşamaları ve sırası baştan planlanır.', 'The stages and their order are planned from the start.')),
        item('message-circle', l('Düzenli bilgilendirme', 'Regular updates'), l('İlerleme durumunu belirli aralıklarla paylaşırız.', 'We share progress at regular intervals.')),
        item('users', l('Tek muhatap', 'One point of contact'), l('Süreç boyunca aynı proje sorumlusuyla görüşürsünüz.', 'You deal with the same project lead throughout.')),
      ],
    },
    area: {
      body: l(
        'Şehir merkezi ve çevre ilçelerde proje alıyoruz. Bölge adları örnek olarak yazılmıştır.',
        'We take on projects in the city centre and nearby districts. The area names are written as examples.',
      ),
      places: [
        l('Şehir merkezi', 'City centre'),
        l('Çevre ilçeler', 'Nearby districts'),
        l('Yakın iller', 'Neighbouring provinces'),
      ],
    },
    faq: [
      qa(
        l('Teklif almak ücretli mi?', 'Is there a charge for a quote?'),
        l('Ön görüşme ve teklif için ücret alınmaz. Ayrıca projelendirme gereken işlerde bunu önceden belirtiriz.', 'The first meeting and the quote are free. If a job needs separate design work, we tell you beforehand.'),
      ),
      qa(
        l('Fiyat nasıl belirlenir?', 'How is the price set?'),
        l('Keşif ve metraj sonrasında iş kalemleri, malzeme ve işçilik üzerinden hesaplanır ve yazılı teklifle iletilir.', 'After the survey and take-off it is calculated from the work items, materials and labour, and sent as a written quote.'),
      ),
      qa(
        l('İş ne kadar sürer?', 'How long does the job take?'),
        l('Süre; işin kapsamına, mevsime ve izin süreçlerine göre değişir. İş programını teklifle birlikte paylaşırız.', 'It depends on the scope, the season and the permit process. We share the programme with the quote.'),
      ),
      qa(
        l('Malzemeyi kim seçiyor?', 'Who chooses the materials?'),
        l('Malzeme seçeneklerini birlikte değerlendiririz, seçilen ürünler teklifte belirtilir.', 'We go through the options together, and the chosen products are named in the quote.'),
      ),
      qa(
        l('Ruhsat ve izin işlemlerinde destek oluyor musunuz?', 'Do you help with permits?'),
        l('Gerekli başvurular hakkında bilgi verir, süreci birlikte planlarız.', 'We explain which applications are needed and plan the process with you.'),
      ),
    ],
    contact: {
      title: l('Teklif alın', 'Get a quote'),
      text: l('Projenizi kısaca anlatın, keşif için sizi arayalım. Telefon numarası örnektir.', 'Tell us briefly about your project and we will call to arrange a survey. The phone number is a sample.'),
      email: 'bilgi@ornek-insaat.demo',
    },
  },
}

export const landingDemoSlugs = Object.keys(LANDING_DEMOS)

/**
 * The "Hakkımızda" story under the feature strip. Fictional, claim-free copy
 * (no founding year, customer count, award or certificate), the same way the
 * showcase demos word theirs. The three photos are generated illustrations
 * that differ from the gallery and service shots.
 */
type Story = { body: L; highlights: L[]; images: Photo[] }

// URLs are written out literally so scripts/hash-demo-assets.mjs can rewrite
// them to their content-hashed names (a template string would stay unhashed).
const aboutPhotos = (shots: [string, L][]): Photo[] => shots.map(([url, alt]) => photo(url, alt.tr, alt.en))

const LANDING_STORY: Record<string, Story> = {
  'oto-cekici': {
    body: l(
      'Yolda kalmak kimsenin planında yoktur. Biz, o anda sürücünün stresini azaltmak için işe net bilgiyle başlarız. Konumunuzu alır, ücreti ve süreyi yola çıkmadan paylaşırız. Aracınızı özenle yükler, istediğiniz adrese bırakırız. Bu sayfa kurgusal bir örnektir.',
      'Nobody plans to be stranded. We start with clear information to ease the moment for the driver. We take your location and share the price and timing before we set off. We load your vehicle with care and drop it where you choose. This page is a fictional example.',
    ),
    highlights: [l('Net bilgi', 'Clear information'), l('Özenli yükleme', 'Careful loading'), l('Bölgeyi bilen ekip', 'A team that knows the area')],
    images: aboutPhotos([
      ['/demos/oto-cekici/about1.b1e99cbf.webp', l('Çekici sürücüsünün geceleri yol kenarında çalıştığı bir sahne', 'A tow driver working at the roadside at night')],
      ['/demos/oto-cekici/about2.a924dd0c.webp', l('Aracın kayar kasaya sabitlenmesi', 'A vehicle being secured to a flatbed')],
      ['/demos/oto-cekici/about3.b2cd8182.webp', l('Boş bir yolda duran çekici', 'A tow truck parked on a quiet road')],
    ]),
  },
  nakliyat: {
    body: l(
      'Taşınmak yorucudur; biz bunu planlı ve sakin bir işe çeviririz. Önce eşyalarınızı yerinde görür, ihtiyacı birlikte netleştiririz. Paketlemeyi özenle yapar, tarihinize göre taşıma programı hazırlarız. Fiyatı yazılı teklifle paylaşırız. Bu sayfa kurgusal bir örnektir.',
      'Moving is tiring; we turn it into a planned, calm job. We first see your belongings on site and settle what is needed together. We pack with care and build the schedule around your date. The price comes in a written quote. This page is a fictional example.',
    ),
    highlights: [l('Ücretsiz keşif', 'Free survey'), l('Özenli paketleme', 'Careful packing'), l('Yazılı teklif', 'Written quote')],
    images: aboutPhotos([
      ['/demos/nakliyat/about1.e59536f9.webp', l('Koliler ve eşyalar taşıma için hazırlanmış bir oda', 'A room with boxes and furniture ready to move')],
      ['/demos/nakliyat/about2.b8607030.webp', l('Kırılacak eşyanın koruyucu malzemeyle sarılması', 'Fragile items wrapped in protective material')],
      ['/demos/nakliyat/about3.4556ec17.webp', l('Taşıma aracına yerleştirilmiş koliler', 'Boxes arranged inside a moving vehicle')],
    ]),
  },
  'kombi-klima': {
    body: l(
      'Konforun sürmesi için cihazların zamanında bakımı gerekir. Ekibimiz bakım ve servis işini sakin ve açık bir iletişimle yürütür. Arızayı yerinde inceler, ne yapılacağını işlemden önce anlatırız. Sezon öncesi kontrollerle sürprizleri azaltmayı hedefleriz. Bu sayfa kurgusal bir örnektir.',
      'Keeping a home comfortable means servicing its appliances on time. Our team handles maintenance and service calmly, with open communication. We inspect the fault on site and explain what will be done before we start. Checks before the season help reduce surprises. This page is a fictional example.',
    ),
    highlights: [l('Periyodik bakım', 'Regular maintenance'), l('Yerinde tespit', 'On-site diagnosis'), l('Net bilgilendirme', 'Clear explanations')],
    images: aboutPhotos([
      ['/demos/kombi-klima/about1.f2ca6718.webp', l('Alet çantası açık bir servis tezgâhı', 'A service bench with an open tool bag')],
      ['/demos/kombi-klima/about2.2f5f9b28.webp', l('Duvardaki klima iç ünitesine yakın bakış', 'A close look at a wall-mounted indoor AC unit')],
      ['/demos/kombi-klima/about3.47cce841.webp', l('Kombi bağlantılarının yakın çekimi', 'A close-up of boiler pipe connections')],
    ]),
  },
  insaat: {
    body: l(
      'İyi bir yapı, iyi bir planla başlar. Projeyi baştan sona düzenli yöneterek süreci şeffaf tutarız. Her aşamada neyin yapıldığını sizinle paylaşır, seçili tedarikçilerle çalışırız. Siz tek bir muhatapla ilerler, anahtar teslim sonucu bekleriz. Bu sayfa kurgusal bir örnektir.',
      'A good building starts with a good plan. We manage the project from start to finish and keep the process transparent. We share what is being done at each stage and work with selected suppliers. You deal with one contact and we aim for a turnkey result. This page is a fictional example.',
    ),
    highlights: [l('Proje yönetimi', 'Project management'), l('Şeffaf süreç', 'Transparent process'), l('Tek muhatap', 'One point of contact')],
    images: aboutPhotos([
      ['/demos/insaat/about1.2d36fbf0.webp', l('Şantiye ofisinde plan inceleyen bir masa', 'A site-office table with plans being reviewed')],
      ['/demos/insaat/about2.575dd29a.webp', l('Yükselen bir betonarme iskelet', 'A rising reinforced-concrete frame')],
      ['/demos/insaat/about3.5d2a1bd2.webp', l('Hazır bir iç mekânın yakın çekimi', 'A close shot of a finished interior')],
    ]),
  },
}

function storySection(slug: string, lang: Lang): Section[] {
  const story = LANDING_STORY[slug]
  if (!story) return []
  return [
    {
      type: 'about',
      title: lang === 'tr' ? 'Hakkımızda' : 'About us',
      body: story.body[lang],
      highlights: story.highlights.map((h) => h[lang]),
      media: {
        enabled: true,
        layout: 'collage',
        images: story.images.map((image) => ({ src: image.src, alt: image.alt[lang], origin: 'generated' })),
        label: aboutLabel(lang),
        cta: { label: lang === 'tr' ? 'İletişime geç' : 'Get in touch', href: '#contact' },
      },
    },
  ]
}

function iconItems(items: IconItem[], lang: Lang) {
  return items.map(({ icon, title, text }) => ({ icon, title: title[lang], description: text[lang] }))
}

function buildSections(slug: string, content: LandingDemoContent, brand: string, lang: Lang): Section[] {
  const cta = { label: content.cta[lang], href: '#contact' }
  const media = LANDING_MEDIA[slug]
  const heroImage = media
    ? {
        imagePrompt: content.hero.title[lang],
        src: media.hero.src,
        alt: media.hero.alt[lang],
        aspectRatio: '16/9' as const,
      }
    : undefined
  const serviceItems = iconItems(content.services.items, lang)
    .map((service, i): { icon: string; title: string; description: string; src?: string; alt?: string } => {
      const shot = media?.services[content.services.items[i].title.tr]
      return shot ? { ...service, src: shot.src, alt: shot.alt[lang] } : service
    })
    .filter((service) => !media || Boolean(service.src))
  const reviews = demoTestimonialItems(slug, lang)
  const referenceItems = media ? demoReferenceItems(slug) : []

  const gallery: Section[] = media
    ? [
        {
          type: 'gallery',
          title: COMMON.gallery[lang],
          subtitle: COMMON.gallerySub[lang],
          items: media.gallery.map((shot) => ({
            imagePrompt: shot.alt[lang],
            src: shot.src,
            alt: shot.alt[lang],
            aspectRatio: '4/3' as const,
          })),
        },
      ]
    : []
  const testimonials: Section[] = reviews.length
    ? [
        {
          type: 'testimonials',
          title: COMMON.reviews[lang],
          subtitle: COMMON.reviewsSub[lang],
          items: reviews,
          showAvatars: true,
          pageEnabled: false,
          linkEnabled: false,
        },
      ]
    : []
  const references: Section[] = referenceItems.length
    ? [
        {
          type: 'references',
          title: COMMON.references[lang],
          subtitle: COMMON.referencesSub[lang],
          items: referenceItems,
          pageEnabled: false,
          linkEnabled: false,
          autoplay: true,
        },
      ]
    : []

  return [
    {
      type: 'hero',
      variant: heroImage ? 'showcase' : 'centered',
      ...(heroImage ? { layout: 'full-bleed' as const, align: 'center' as const, overlay: 55, image: heroImage } : {}),
      badge: content.hero.badge[lang],
      title: content.hero.title[lang],
      description: content.hero.text[lang],
      // One action only: on a phone a second button would sit under the floating call buttons.
      primaryButton: cta,
      trustText: `${COMMON.samplePhone[lang]}: ${LANDING_DEMO_PHONE}`,
    },
    ...storySection(slug, lang),
    {
      type: 'services',
      title: COMMON.services[lang],
      subtitle: content.services.subtitle[lang],
      items: serviceItems,
    },
    ...gallery,
    {
      type: 'process',
      title: COMMON.process[lang],
      subtitle: content.process.subtitle[lang],
      steps: iconItems(content.process.steps, lang),
    },
    {
      type: 'features',
      title: COMMON.why[lang],
      subtitle: content.why.subtitle[lang],
      items: iconItems(content.why.items, lang),
    },
    ...testimonials,
    ...references,
    {
      type: 'about',
      title: COMMON.area[lang],
      body: content.area.body[lang],
      highlights: content.area.places.map((place) => `${place[lang]} (${COMMON.samplePlace[lang]})`),
    },
    {
      type: 'faq',
      title: COMMON.faq[lang],
      items: content.faq.map(({ q, a }) => ({ question: q[lang], answer: a[lang] })),
    },
    {
      type: 'contact',
      title: content.contact.title[lang],
      description: content.contact.text[lang],
      phone: LANDING_DEMO_PHONE,
      email: content.contact.email,
      fields: [COMMON.name[lang], COMMON.phone[lang], COMMON.message[lang]],
    },
    {
      type: 'footer',
      tagline: content.tagline[lang],
      copyright: `© ${new Date().getFullYear()} ${brand}`,
    },
  ]
}

/**
 * Turns the generated base site into the sector landing page for `slug`, in
 * place. Returns false (site untouched) for every other demo.
 */
export function applyDemoLanding(
  site: WebsiteSchema,
  demo: { slug: string; brand: L; tag: L },
  lang: Lang,
): boolean {
  const content = LANDING_DEMOS[demo.slug]
  if (!content) return false
  const brand = demo.brand[lang]

  site.meta = {
    ...site.meta,
    name: brand,
    seoTitle: demo.tag[lang],
    tagline: content.tagline[lang],
    description:
      lang === 'tr'
        ? `${demo.tag.tr} için örnek demo sitesi. GLOVAL AI ile oluşturuldu.`
        : `A sample demo site for ${demo.tag.en.toLowerCase()}. Built with GLOVAL AI.`,
    tone: content.tone[lang],
    audience: content.audience[lang],
  }
  site.theme = content.theme
  site.typography = content.typography
  site.navigation = {
    logoText: brand,
    links: [
      { label: COMMON.services[lang], href: '#services' },
      { label: COMMON.processNav[lang], href: '#process' },
      { label: COMMON.whyNav[lang], href: '#features' },
      { label: COMMON.aboutNav[lang], href: '#about' },
      { label: COMMON.faqNav[lang], href: '#faq' },
      { label: COMMON.contactNav[lang], href: '#contact' },
    ],
    cta: { label: content.cta[lang], href: '#contact' },
  }
  site.pages = [{ slug: 'home', title: brand, isHome: true }]
  site.sections = buildSections(demo.slug, content, brand, lang)

  // The story's long page (`/demo/<slug>/hakkimizda`) backs its "Daha fazlası…" link.
  const about = findAboutSection(site)
  if (about && LANDING_STORY[demo.slug]) {
    const detail = { ...buildStarterAboutDetail(site, about), sample: false }
    site.sections = site.sections.map((section) => (section === about ? { ...about, detail } : section))
    site.pages = syncDetailPages(site).pages
  }

  attachServicePages(site, demo.slug, lang)
  return true
}

/**
 * Gives every service card its own page (`/demo/<slug>/hizmet/<item>`) plus the
 * list page (`/demo/<slug>/hizmetler`), through the same `detail` fields and
 * `syncServicesPage` the showcase demos use. Card titles and photos stay as they
 * are; only the slug and the page text are added.
 */
function attachServicePages(site: WebsiteSchema, slug: string, lang: Lang): void {
  const pagesByTitle = LANDING_SERVICE_PAGES[slug]
  const section = site.sections.find((s): s is Extract<Section, { type: 'services' }> => s.type === 'services')
  if (!pagesByTitle || !section) return

  const items = section.items.map((item) => {
    const source = LANDING_DEMOS[slug].services.items.find((i) => i.title[lang] === item.title)
    const page = source ? pagesByTitle[source.title.tr] : undefined
    if (!page) return item
    return {
      ...item,
      slug: page.slug,
      pageEnabled: true,
      sample: true,
      detail: servicePageBlocks(page, lang),
    }
  })

  const detail = {
    pageEnabled: true,
    linkEnabled: true,
    linkLabel: defaultServicesLinkLabel(lang),
    ctaTitle: LANDING_SERVICES_CTA.title[lang],
    ctaText: LANDING_SERVICES_CTA.text[lang],
    ctaLabel: LANDING_SERVICES_CTA.label[lang],
  }
  site.sections = site.sections.map((s) => (s === section ? { ...section, items, detail } : s))
  const synced = syncServicesPage(site)
  site.pages = synced.pages
  site.sections = synced.sections
}
