import type { Lang } from '@/lib/i18n'
import { pickLang } from '@/lib/i18n'
import { DEMO_PHONE } from '@/lib/contact-links'

/**
 * Central demo catalog
 * --------------------
 * One data source that powers every demo's real sub-routes: product/catalog
 * listing + detail, service listing + detail, and contact. Each demo keeps its
 * own sector-appropriate labels ("Menü", "Projeler", "Paketler"...) while the
 * functional structure stays identical across all of them.
 *
 * The emlak demo intentionally keeps its bespoke `/ilanlar` + `/ilan/[slug]`
 * listing routes as its "products"; here it only declares services + contact,
 * and its `productsHref` points at the existing listings route.
 */

export type L = { tr: string; en: string }

export type CatalogItem = {
  slug: string
  name: L
  short: L
  description: L
  price?: L
  oldPrice?: L
  category?: L
  features: L[]
  image: string
  gallery?: string[]
}

export type DemoContact = {
  phoneDisplay: string
  phoneTel: string
  whatsapp: string
  email: string
  address: L
  hours: L
}

export type DemoCatalog = {
  slug: string
  /** When true, the demo behaves as a real store: cart, add-to-cart and a
   *  simulated checkout are enabled across its homepage and sub-routes. */
  commerce?: boolean
  brand: L
  /** Nav + page label for the product-like collection. */
  productsLabel: L
  productSingular: L
  /** Where the products nav item points (emlak → its listings route). */
  productsHref: (lang: Lang) => string
  servicesLabel: L
  serviceSingular: L
  /** Header primary CTA label, e.g. "Sipariş Ver" / "Teklif Al". */
  primaryCtaLabel: L
  products: CatalogItem[]
  services: CatalogItem[]
  contact: DemoContact
}

function contact(email: string, address: L, hours: L): DemoContact {
  return {
    phoneDisplay: DEMO_PHONE.display,
    phoneTel: DEMO_PHONE.tel,
    whatsapp: DEMO_PHONE.whatsapp,
    email,
    address,
    hours,
  }
}

const WEEKDAY_HOURS: L = {
  tr: 'Hafta içi 09:00 – 18:00, Cumartesi 10:00 – 16:00',
  en: 'Weekdays 9:00 AM – 6:00 PM, Saturday 10:00 AM – 4:00 PM',
}

export const demoCatalogs: DemoCatalog[] = [
  // ---------------------------------------------------------------- kahve
  {
    slug: 'kahve',
    brand: { tr: 'Kahve Durağı', en: 'Roast House' },
    productsLabel: { tr: 'Menü', en: 'Menu' },
    productSingular: { tr: 'Ürün', en: 'Item' },
    productsHref: (lang) => `/demo/kahve/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Sipariş Ver', en: 'Order Now' },
    products: [
      {
        slug: 'ethiopia-yirgacheffe',
        name: { tr: 'Ethiopia Yirgacheffe', en: 'Ethiopia Yirgacheffe' },
        short: { tr: 'Çiçeksi ve narenciye notalı tek çeşit kahve.', en: 'Single-origin with floral and citrus notes.' },
        description: {
          tr: 'Yüksek rakımda yetişen, el ile toplanmış Ethiopia Yirgacheffe çekirdekleri; çiçeksi aroması, canlı asiditesi ve narenciye notalarıyla filtre kahve için ideal. Orta kavrum ile dengeli bir fincan sunar.',
          en: 'High-altitude, hand-picked Ethiopia Yirgacheffe beans with a floral aroma, bright acidity and citrus notes — ideal for filter coffee. A balanced cup with a medium roast.',
        },
        price: { tr: '₺320 / 250g', en: '$18 / 250g' },
        category: { tr: 'Tek Çeşit', en: 'Single Origin' },
        features: [
          { tr: 'Orta kavrum', en: 'Medium roast' },
          { tr: 'Çiçeksi & narenciye', en: 'Floral & citrus' },
          { tr: 'El ile toplanmış', en: 'Hand-picked' },
          { tr: 'Filtre için ideal', en: 'Great for filter' },
        ],
        image: '/demos/kahve/g3.webp',
      },
      {
        slug: 'esmeralda-geisha',
        name: { tr: 'Esmeralda Geisha', en: 'Esmeralda Geisha' },
        short: { tr: 'Nadir bulunan, yasemin ve bergamot aromalı özel çekirdek.', en: 'A rare specialty bean with jasmine and bergamot.' },
        description: {
          tr: 'Panama’nın ünlü Esmeralda çiftliğinden gelen Geisha çekirdekleri; yasemin, bergamot ve tropikal meyve notalarıyla dünyanın en çok aranan kahvelerinden biri. Özel günler için sınırlı üretim.',
          en: 'Geisha beans from Panama’s famed Esmeralda estate — jasmine, bergamot and tropical fruit notes make it one of the most sought-after coffees in the world. Limited production for special occasions.',
        },
        price: { tr: '₺780 / 250g', en: '$42 / 250g' },
        category: { tr: 'Özel Üretim', en: 'Limited' },
        features: [
          { tr: 'Sınırlı üretim', en: 'Limited batch' },
          { tr: 'Yasemin & bergamot', en: 'Jasmine & bergamot' },
          { tr: 'Açık kavrum', en: 'Light roast' },
          { tr: 'Ödüllü çiftlik', en: 'Award-winning farm' },
        ],
        image: '/demos/kahve/g1.webp',
      },
      {
        slug: 'house-blend',
        name: { tr: 'House Blend', en: 'House Blend' },
        short: { tr: 'Her güne uygun, çikolatalı ve dengeli imza harman.', en: 'Our balanced, chocolatey everyday signature blend.' },
        description: {
          tr: 'Espresso ve süt bazlı içecekler için geliştirdiğimiz imza harmanımız; çikolata ve fındık notaları, yumuşak gövdesi ve kalıcı bitişiyle her güne uygun. Sütle mükemmel uyum sağlar.',
          en: 'Our signature blend crafted for espresso and milk-based drinks — chocolate and hazelnut notes, a smooth body and a lasting finish make it perfect every day. Pairs beautifully with milk.',
        },
        price: { tr: '₺260 / 250g', en: '$14 / 250g' },
        category: { tr: 'Harman', en: 'Blend' },
        features: [
          { tr: 'Espresso için ideal', en: 'Great for espresso' },
          { tr: 'Çikolata & fındık', en: 'Chocolate & hazelnut' },
          { tr: 'Orta-koyu kavrum', en: 'Medium-dark roast' },
          { tr: 'Sütle uyumlu', en: 'Pairs with milk' },
        ],
        image: '/demos/kahve/g4.webp',
      },
    ],
    services: [
      {
        slug: 'etkinlik-catering',
        name: { tr: 'Etkinlik Catering', en: 'Event Catering' },
        short: { tr: 'Etkinlikleriniz için mobil kahve barı ve barista.', en: 'A mobile coffee bar and barista for your events.' },
        description: {
          tr: 'Kurumsal etkinlikler, düğünler ve lansmanlar için mobil espresso barı kuruyor, deneyimli baristalarımızla misafirlerinize üçüncü nesil kahve deneyimi sunuyoruz. Menü ve sunum ihtiyacınıza göre özelleştirilir.',
          en: 'We set up a mobile espresso bar for corporate events, weddings and launches, serving your guests a third-wave coffee experience with our experienced baristas. Menu and presentation are tailored to your needs.',
        },
        features: [
          { tr: 'Mobil espresso barı', en: 'Mobile espresso bar' },
          { tr: 'Profesyonel barista', en: 'Professional barista' },
          { tr: 'Özelleştirilebilir menü', en: 'Customizable menu' },
          { tr: 'Tüm şehirlerde', en: 'Nationwide' },
        ],
        image: '/demos/kahve/services/catering.webp',
      },
      {
        slug: 'kurumsal-kahve-cozumleri',
        name: { tr: 'Kurumsal Kahve Çözümleri', en: 'Corporate Coffee Solutions' },
        short: { tr: 'Ofisiniz için ekipman, çekirdek ve düzenli tedarik.', en: 'Equipment, beans and regular supply for your office.' },
        description: {
          tr: 'Ofisinize profesyonel espresso makinesi kurulumu, düzenli taze çekirdek tedariki ve bakım hizmeti sunuyoruz. Ekibinizin her gün kaliteli kahveye erişmesini sağlıyoruz.',
          en: 'We install a professional espresso machine at your office, supply fresh beans on a regular schedule and handle maintenance — so your team enjoys quality coffee every day.',
        },
        features: [
          { tr: 'Ekipman kurulumu', en: 'Equipment setup' },
          { tr: 'Düzenli tedarik', en: 'Regular supply' },
          { tr: 'Bakım & servis', en: 'Maintenance & service' },
          { tr: 'Esnek abonelik', en: 'Flexible subscription' },
        ],
        image: '/demos/kahve/services/corporate.webp',
      },
      {
        slug: 'kahve-egitimi',
        name: { tr: 'Kahve Eğitimi', en: 'Coffee Training' },
        short: { tr: 'Barista teknikleri ve latte art atölyeleri.', en: 'Barista technique and latte art workshops.' },
        description: {
          tr: 'Başlangıç ve ileri seviye barista eğitimleri, demleme teknikleri ve latte art atölyeleri düzenliyoruz. Bireysel veya kurumsal gruplar için sertifikalı programlar sunuyoruz.',
          en: 'We run beginner and advanced barista courses, brewing technique sessions and latte art workshops — certified programs for individuals or corporate groups.',
        },
        features: [
          { tr: 'Sertifikalı program', en: 'Certified program' },
          { tr: 'Latte art atölyesi', en: 'Latte art workshop' },
          { tr: 'Demleme teknikleri', en: 'Brewing techniques' },
          { tr: 'Bireysel & grup', en: 'Individual & group' },
        ],
        image: '/demos/kahve/services/training.webp',
      },
    ],
    contact: contact(
      'merhaba@kahveduragi.demo',
      { tr: 'Moda Caddesi No:12, Kadıköy, İstanbul', en: '12 Moda Avenue, Kadıköy, Istanbul' },
      { tr: 'Her gün 08:00 – 22:00', en: 'Every day 8:00 AM – 10:00 PM' },
    ),
  },

  // ------------------------------------------------------------- mimarlik
  {
    slug: 'mimarlik',
    brand: { tr: 'Atölye Mimarlık', en: 'Atelier Studio' },
    productsLabel: { tr: 'Projeler', en: 'Projects' },
    productSingular: { tr: 'Proje', en: 'Project' },
    productsHref: (lang) => `/demo/mimarlik/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Teklif Al', en: 'Get a Quote' },
    products: [
      {
        slug: 'villa-projesi',
        name: { tr: 'Villa Projesi', en: 'Villa Project' },
        short: { tr: 'Doğayla iç içe modern bir yaşam villası.', en: 'A modern living villa in harmony with nature.' },
        description: {
          tr: 'Geniş cam yüzeyleri, açık plan yaşam alanları ve sürdürülebilir malzemeleriyle doğayla bütünleşen özel bir villa projesi. Peyzajdan iç mekâna bütüncül bir tasarım yaklaşımı.',
          en: 'A bespoke villa project integrated with nature through large glazed surfaces, open-plan living areas and sustainable materials — a holistic approach from landscape to interior.',
        },
        price: { tr: 'Proje bazlı', en: 'Project-based' },
        category: { tr: 'Konut', en: 'Residential' },
        features: [
          { tr: 'Açık plan tasarım', en: 'Open-plan design' },
          { tr: 'Sürdürülebilir malzeme', en: 'Sustainable materials' },
          { tr: 'Peyzaj entegrasyonu', en: 'Landscape integration' },
          { tr: 'Akıllı ev altyapısı', en: 'Smart-home wiring' },
        ],
        image: '/demos/mimarlik/p1.webp',
        gallery: ['/demos/mimarlik/p1.webp', '/demos/mimarlik/p2.webp', '/demos/mimarlik/p3.webp'],
      },
      {
        slug: 'ofis-projesi',
        name: { tr: 'Ofis Projesi', en: 'Office Project' },
        short: { tr: 'Verimliliği artıran modern çalışma alanları.', en: 'Modern workspaces that boost productivity.' },
        description: {
          tr: 'Esnek çalışma alanları, doğal ışık ve akustik konforu önceliklendiren kurumsal bir ofis tasarımı. Marka kimliğini mekâna taşıyan detaylı bir iç mimari çalışma.',
          en: 'A corporate office design prioritizing flexible workspaces, natural light and acoustic comfort — a detailed interior architecture that carries brand identity into the space.',
        },
        price: { tr: 'Proje bazlı', en: 'Project-based' },
        category: { tr: 'Ticari', en: 'Commercial' },
        features: [
          { tr: 'Esnek alanlar', en: 'Flexible zones' },
          { tr: 'Akustik konfor', en: 'Acoustic comfort' },
          { tr: 'Doğal ışık', en: 'Natural light' },
          { tr: 'Marka kimliği', en: 'Brand identity' },
        ],
        image: '/demos/mimarlik/p2.webp',
        gallery: ['/demos/mimarlik/p2.webp', '/demos/mimarlik/p4.webp', '/demos/mimarlik/p5.webp'],
      },
      {
        slug: 'rezidans-projesi',
        name: { tr: 'Rezidans Projesi', en: 'Residence Project' },
        short: { tr: 'Şehir yaşamı için çok katlı konut tasarımı.', en: 'Multi-storey residential design for city living.' },
        description: {
          tr: 'Ortak yaşam alanları, yeşil teraslar ve enerji verimli cephesiyle çağdaş bir rezidans projesi. Şehir yaşamına konfor ve estetiği bir arada sunan bütüncül bir yaklaşım.',
          en: 'A contemporary residence project with shared amenities, green terraces and an energy-efficient façade — a holistic approach bringing comfort and aesthetics to city living.',
        },
        price: { tr: 'Proje bazlı', en: 'Project-based' },
        category: { tr: 'Konut', en: 'Residential' },
        features: [
          { tr: 'Ortak yaşam alanları', en: 'Shared amenities' },
          { tr: 'Yeşil teraslar', en: 'Green terraces' },
          { tr: 'Enerji verimli cephe', en: 'Energy-efficient façade' },
          { tr: 'Otopark çözümleri', en: 'Parking solutions' },
        ],
        image: '/demos/mimarlik/p3.webp',
        gallery: ['/demos/mimarlik/p3.webp', '/demos/mimarlik/p6.webp', '/demos/mimarlik/p1.webp'],
      },
    ],
    services: [
      {
        slug: 'mimari-tasarim',
        name: { tr: 'Mimari Tasarım', en: 'Architectural Design' },
        short: { tr: 'Konsepten uygulama projesine mimari tasarım.', en: 'Architectural design from concept to construction.' },
        description: {
          tr: 'İhtiyaç programının belirlenmesinden konsept geliştirmeye, ön projeden uygulama projesine kadar tüm mimari tasarım sürecini yürütüyoruz. Her projede işlevsellik ve estetiği dengeliyoruz.',
          en: 'We lead the full architectural design process — from defining the brief and developing the concept to schematic and construction drawings — balancing function and aesthetics in every project.',
        },
        features: [
          { tr: 'Konsept geliştirme', en: 'Concept development' },
          { tr: 'Uygulama projesi', en: 'Construction drawings' },
          { tr: 'Ruhsat desteği', en: 'Permit support' },
          { tr: 'Malzeme seçimi', en: 'Material selection' },
        ],
        image: '/demos/mimarlik/p4.webp',
      },
      {
        slug: 'ic-mimarlik',
        name: { tr: 'İç Mimarlık', en: 'Interior Architecture' },
        short: { tr: 'Mekânı yaşayan bir deneyime dönüştüren iç tasarım.', en: 'Interior design that turns space into experience.' },
        description: {
          tr: 'Aydınlatma, malzeme, mobilya ve renk kurgusuyla mekânları yaşanabilir, işlevsel ve estetik deneyimlere dönüştürüyoruz. Konut ve ticari projelerde anahtar teslim iç mimari.',
          en: 'Through lighting, materials, furniture and color, we transform spaces into livable, functional and aesthetic experiences — turnkey interior architecture for residential and commercial projects.',
        },
        features: [
          { tr: 'Aydınlatma tasarımı', en: 'Lighting design' },
          { tr: 'Mobilya seçimi', en: 'Furniture curation' },
          { tr: 'Malzeme & doku', en: 'Materials & texture' },
          { tr: 'Anahtar teslim', en: 'Turnkey delivery' },
        ],
        image: '/demos/mimarlik/p5.webp',
      },
      {
        slug: '3d-gorsellestirme',
        name: { tr: '3D Görselleştirme', en: '3D Visualization' },
        short: { tr: 'Projelerinizi gerçekçi 3D görsellerle deneyimleyin.', en: 'Experience your project in photoreal 3D.' },
        description: {
          tr: 'Fotogerçekçi render ve sanal tur çalışmalarıyla projelerinizi inşa edilmeden önce deneyimlemenizi sağlıyoruz. Karar süreçlerini hızlandıran yüksek kaliteli görselleştirmeler.',
          en: 'With photoreal renders and virtual tours we let you experience your project before it is built — high-quality visualizations that speed up decision-making.',
        },
        features: [
          { tr: 'Fotogerçekçi render', en: 'Photoreal renders' },
          { tr: 'Sanal tur', en: 'Virtual tours' },
          { tr: 'Animasyon', en: 'Animation' },
          { tr: 'Hızlı revizyon', en: 'Fast revisions' },
        ],
        image: '/demos/mimarlik/p6.webp',
      },
    ],
    contact: contact(
      'studio@atolyemimarlik.demo',
      { tr: 'Karaköy, Kemankeş Cad. No:24, İstanbul', en: '24 Kemankeş St., Karaköy, Istanbul' },
      WEEKDAY_HOURS,
    ),
  },

  // ---------------------------------------------------------- dis-klinigi
  {
    slug: 'dis-klinigi',
    brand: { tr: 'Denta Estetik', en: 'Denta Care' },
    productsLabel: { tr: 'Tedaviler', en: 'Treatments' },
    productSingular: { tr: 'Tedavi', en: 'Treatment' },
    productsHref: (lang) => `/demo/dis-klinigi/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Randevu Al', en: 'Book Appointment' },
    products: [
      {
        slug: 'implant-tedavisi',
        name: { tr: 'İmplant Tedavisi', en: 'Dental Implants' },
        short: { tr: 'Eksik dişler için kalıcı ve doğal çözüm.', en: 'A permanent, natural solution for missing teeth.' },
        description: {
          tr: 'Titanyum implantlarla eksik dişlerinizi kalıcı olarak yeniliyoruz. 3 boyutlu planlama ve cerrahi kılavuzlarla konforlu, güvenli ve estetik sonuçlar sunuyoruz.',
          en: 'We permanently restore missing teeth with titanium implants. Using 3D planning and surgical guides, we deliver comfortable, safe and aesthetic results.',
        },
        price: { tr: 'Muayene sonrası', en: 'After consultation' },
        category: { tr: 'Cerrahi', en: 'Surgical' },
        features: [
          { tr: '3D planlama', en: '3D planning' },
          { tr: 'Titanyum implant', en: 'Titanium implant' },
          { tr: 'Doğal görünüm', en: 'Natural look' },
          { tr: 'Ömür boyu garanti', en: 'Lifetime warranty' },
        ],
        image: '/demos/dis-klinigi/products/implant.webp',
      },
      {
        slug: 'dis-beyazlatma',
        name: { tr: 'Diş Beyazlatma', en: 'Teeth Whitening' },
        short: { tr: 'Tek seansta birkaç ton daha beyaz gülüş.', en: 'A brighter smile in a single session.' },
        description: {
          tr: 'Klinik tipi beyazlatma ile tek seansta dişlerinizi birkaç ton açıyoruz. Diş minesine zarar vermeyen, hassasiyeti minimuma indiren güvenli uygulama.',
          en: 'With in-office whitening we lighten your teeth several shades in a single session — a safe application that protects enamel and minimizes sensitivity.',
        },
        price: { tr: 'Muayene sonrası', en: 'After consultation' },
        category: { tr: 'Estetik', en: 'Aesthetic' },
        features: [
          { tr: 'Tek seans', en: 'Single session' },
          { tr: 'Mineye zarar vermez', en: 'Enamel-safe' },
          { tr: 'Kalıcı sonuç', en: 'Lasting result' },
          { tr: 'Düşük hassasiyet', en: 'Low sensitivity' },
        ],
        image: '/demos/dis-klinigi/products/whitening.webp',
      },
      {
        slug: 'ortodonti',
        name: { tr: 'Ortodonti', en: 'Orthodontics' },
        short: { tr: 'Şeffaf plak ve tel ile diş düzeltme.', en: 'Straighten teeth with clear aligners or braces.' },
        description: {
          tr: 'Şeffaf plak (aligner) ve modern tel tedavileriyle diş sıralama bozukluklarını estetik ve konforlu şekilde düzeltiyoruz. Dijital tarama ile tedavi planı çıkarıyoruz.',
          en: 'We correct misaligned teeth aesthetically and comfortably with clear aligners and modern braces, creating a treatment plan from a digital scan.',
        },
        price: { tr: 'Muayene sonrası', en: 'After consultation' },
        category: { tr: 'Ortodonti', en: 'Orthodontics' },
        features: [
          { tr: 'Şeffaf plak', en: 'Clear aligners' },
          { tr: 'Dijital tarama', en: 'Digital scan' },
          { tr: 'Konforlu tedavi', en: 'Comfortable treatment' },
          { tr: 'Takip seansları', en: 'Follow-up visits' },
        ],
        image: '/demos/dis-klinigi/products/orthodontics.webp',
      },
    ],
    services: [
      {
        slug: 'genel-muayene',
        name: { tr: 'Genel Muayene', en: 'General Check-up' },
        short: { tr: 'Kapsamlı ağız ve diş sağlığı kontrolü.', en: 'A comprehensive oral health examination.' },
        description: {
          tr: 'Dijital röntgen ve detaylı klinik muayene ile ağız ve diş sağlığınızı baştan sona değerlendiriyor, size özel bir tedavi planı hazırlıyoruz.',
          en: 'With digital X-rays and a detailed clinical exam we assess your oral health end to end and prepare a personalized treatment plan.',
        },
        features: [
          { tr: 'Dijital röntgen', en: 'Digital X-ray' },
          { tr: 'Detaylı değerlendirme', en: 'Detailed assessment' },
          { tr: 'Tedavi planı', en: 'Treatment plan' },
          { tr: 'Ücretsiz danışmanlık', en: 'Free consultation' },
        ],
        image: '/demos/dis-klinigi/services/checkup.webp',
      },
      {
        slug: 'dis-temizligi',
        name: { tr: 'Diş Temizliği', en: 'Dental Cleaning' },
        short: { tr: 'Diş taşı temizliği ve profesyonel bakım.', en: 'Scaling and professional oral care.' },
        description: {
          tr: 'Ultrasonik cihazlarla diş taşı ve plak temizliği yapıyor, diş eti sağlığınızı koruyoruz. Düzenli bakım ile daha sağlıklı bir gülüş.',
          en: 'We remove tartar and plaque with ultrasonic tools and protect your gum health — a healthier smile through regular care.',
        },
        features: [
          { tr: 'Ultrasonik temizlik', en: 'Ultrasonic cleaning' },
          { tr: 'Diş eti bakımı', en: 'Gum care' },
          { tr: 'Leke giderme', en: 'Stain removal' },
          { tr: 'Koruyucu öneriler', en: 'Preventive advice' },
        ],
        image: '/demos/dis-klinigi/services/cleaning.webp',
      },
      {
        slug: 'dis-eti-tedavisi',
        name: { tr: 'Diş Eti Tedavisi', en: 'Gum Treatment' },
        short: { tr: 'Diş eti hastalıkları için uzman bakım.', en: 'Expert care for gum disease.' },
        description: {
          tr: 'Diş eti çekilmesi ve iltihabı gibi problemlerde uzman periodontoloji yaklaşımıyla tedavi sunuyoruz. Erken teşhis ile diş kayıplarını önlüyoruz.',
          en: 'For problems like gum recession and inflammation we provide expert periodontal treatment, preventing tooth loss through early diagnosis.',
        },
        features: [
          { tr: 'Periodontoloji uzmanı', en: 'Periodontology expert' },
          { tr: 'Erken teşhis', en: 'Early diagnosis' },
          { tr: 'Ağrısız uygulama', en: 'Painless procedure' },
          { tr: 'Kişisel bakım planı', en: 'Personal care plan' },
        ],
        image: '/demos/dis-klinigi/services/gum-care.webp',
      },
    ],
    contact: contact(
      'randevu@dentaestetik.demo',
      { tr: 'Bağdat Caddesi No:180, Kadıköy, İstanbul', en: '180 Bağdat Avenue, Kadıköy, Istanbul' },
      WEEKDAY_HOURS,
    ),
  },

  // --------------------------------------------------------------- emlak
  {
    slug: 'emlak',
    brand: { tr: 'Emlak Vizyon', en: 'Vista Realty' },
    productsLabel: { tr: 'İlanlar', en: 'Listings' },
    productSingular: { tr: 'İlan', en: 'Listing' },
    // Emlak keeps its bespoke listings route as its "products".
    productsHref: (lang) => `/demo/emlak/ilanlar?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Randevu Al', en: 'Book a Viewing' },
    products: [], // Provided by the dedicated emlak listings routes.
    services: [
      {
        slug: 'satis-danismanligi',
        name: { tr: 'Satış Danışmanlığı', en: 'Sales Advisory' },
        short: { tr: 'Alım-satım sürecinde uçtan uca danışmanlık.', en: 'End-to-end advisory for buying and selling.' },
        description: {
          tr: 'Gayrimenkulünüzün doğru fiyatlanmasından pazarlamasına, alıcı görüşmelerinden tapu işlemlerine kadar tüm satış sürecini uzman danışmanlarımızla yönetiyoruz.',
          en: 'From accurate pricing and marketing to buyer meetings and title transfer, our expert advisors manage the entire sales process for you.',
        },
        features: [
          { tr: 'Profesyonel pazarlama', en: 'Professional marketing' },
          { tr: 'Alıcı ağı', en: 'Buyer network' },
          { tr: 'Tapu işlemleri', en: 'Title transactions' },
          { tr: 'Pazar analizi', en: 'Market analysis' },
        ],
        image: '/demos/emlak/services/sales.webp',
      },
      {
        slug: 'degerleme',
        name: { tr: 'Değerleme', en: 'Valuation' },
        short: { tr: 'Gayrimenkulünüz için güncel piyasa değeri.', en: 'Up-to-date market value for your property.' },
        description: {
          tr: 'Konum, metrekare, bina yaşı ve güncel piyasa verilerini analiz ederek gayrimenkulünüzün gerçek değerini belirliyoruz. Bankalar için resmi ekspertiz raporu da sunuyoruz.',
          en: 'By analyzing location, area, building age and current market data we determine your property’s true value — including official appraisal reports for banks.',
        },
        features: [
          { tr: 'Piyasa analizi', en: 'Market analysis' },
          { tr: 'Resmi rapor', en: 'Official report' },
          { tr: 'Hızlı sonuç', en: 'Fast turnaround' },
          { tr: 'Tarafsız değerleme', en: 'Independent valuation' },
        ],
        image: '/demos/emlak/services/valuation.webp',
      },
      {
        slug: 'yatirim-danismanligi',
        name: { tr: 'Yatırım Danışmanlığı', en: 'Investment Advisory' },
        short: { tr: 'Getiri odaklı gayrimenkul yatırım planlaması.', en: 'Yield-focused real-estate investment planning.' },
        description: {
          tr: 'Bütçenize ve hedeflerinize uygun, yüksek getiri potansiyeli olan gayrimenkul yatırımlarını belirliyor, kira getirisi ve değer artışı projeksiyonları sunuyoruz.',
          en: 'We identify high-yield real-estate investments matched to your budget and goals, providing rental-income and appreciation projections.',
        },
        features: [
          { tr: 'Getiri projeksiyonu', en: 'Yield projection' },
          { tr: 'Portföy çeşitlendirme', en: 'Portfolio diversification' },
          { tr: 'Bölge analizi', en: 'Area analysis' },
          { tr: 'Uzun vadeli plan', en: 'Long-term plan' },
        ],
        image: '/demos/emlak/services/consulting.webp',
      },
    ],
    contact: contact(
      'iletisim@emlakvizyon.demo',
      { tr: 'Levent Mah. Büyükdere Cad. No:120, İstanbul', en: '120 Büyükdere Ave., Levent, Istanbul' },
      WEEKDAY_HOURS,
    ),
  },

  // ------------------------------------------------------------- guzellik
  {
    slug: 'guzellik',
    brand: { tr: 'Zarafet Güzellik', en: 'Lumière Beauty' },
    productsLabel: { tr: 'Paketler', en: 'Packages' },
    productSingular: { tr: 'Paket', en: 'Package' },
    productsHref: (lang) => `/demo/guzellik/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Randevu Al', en: 'Book Now' },
    products: [
      {
        slug: 'cilt-bakim-paketi',
        name: { tr: 'Cilt Bakım Paketi', en: 'Skincare Package' },
        short: { tr: 'Cildinizi yenileyen kapsamlı bakım seansları.', en: 'Comprehensive sessions that renew your skin.' },
        description: {
          tr: 'Cilt analizi, derin temizlik, peeling ve nemlendirme aşamalarından oluşan kapsamlı bakım paketi. Cildinizin ihtiyacına göre kişiselleştirilir ve düzenli seanslarla kalıcı sonuç verir.',
          en: 'A comprehensive package of skin analysis, deep cleansing, peeling and hydration — personalized to your skin’s needs, delivering lasting results with regular sessions.',
        },
        price: { tr: '₺2.400 / 4 seans', en: '$130 / 4 sessions' },
        category: { tr: 'Cilt Bakımı', en: 'Skincare' },
        features: [
          { tr: 'Cilt analizi', en: 'Skin analysis' },
          { tr: 'Derin temizlik', en: 'Deep cleansing' },
          { tr: 'Kişiye özel', en: 'Personalized' },
          { tr: '4 seans', en: '4 sessions' },
        ],
        image: '/demos/guzellik/g1.webp',
      },
      {
        slug: 'lazer-epilasyon-paketi',
        name: { tr: 'Lazer Epilasyon Paketi', en: 'Laser Hair Removal Package' },
        short: { tr: 'Tüm vücut için kalıcı epilasyon çözümü.', en: 'A permanent hair-removal solution for the whole body.' },
        description: {
          tr: 'Son teknoloji buz lazer cihazlarıyla acısız ve etkili epilasyon. Cilt tipinize uygun ayarlanan seanslarla kalıcı ve pürüzsüz sonuçlar elde edin.',
          en: 'Painless, effective hair removal with the latest ice-laser devices — sessions tuned to your skin type for permanent, smooth results.',
        },
        price: { tr: '₺5.900 / 6 seans', en: '$320 / 6 sessions' },
        category: { tr: 'Epilasyon', en: 'Hair Removal' },
        features: [
          { tr: 'Buz lazer teknolojisi', en: 'Ice-laser technology' },
          { tr: 'Acısız uygulama', en: 'Painless' },
          { tr: 'Tüm vücut', en: 'Full body' },
          { tr: '6 seans', en: '6 sessions' },
        ],
        image: '/demos/guzellik/g2.webp',
      },
      {
        slug: 'premium-bakim',
        name: { tr: 'Premium Bakım', en: 'Premium Care' },
        short: { tr: 'Yüz, vücut ve spa dahil ayrıcalıklı bakım.', en: 'A privileged package including face, body and spa.' },
        description: {
          tr: 'Yüz bakımı, vücut bakımı, masaj ve spa deneyimini bir araya getiren ayrıcalıklı paketimiz. Kendinizi ödüllendirmek isteyenler için baştan aşağı yenilenme.',
          en: 'Our privileged package combining facial care, body care, massage and a spa experience — head-to-toe renewal for those who want to reward themselves.',
        },
        price: { tr: '₺4.200 / seans', en: '$230 / session' },
        category: { tr: 'Premium', en: 'Premium' },
        features: [
          { tr: 'Yüz & vücut bakımı', en: 'Face & body care' },
          { tr: 'Masaj dahil', en: 'Massage included' },
          { tr: 'Spa erişimi', en: 'Spa access' },
          { tr: 'Kişisel danışman', en: 'Personal advisor' },
        ],
        image: '/demos/guzellik/g3.webp',
      },
    ],
    services: [
      {
        slug: 'lazer-epilasyon',
        name: { tr: 'Lazer Epilasyon', en: 'Laser Hair Removal' },
        short: { tr: 'İstenmeyen tüylere kalıcı çözüm.', en: 'A permanent solution to unwanted hair.' },
        description: {
          tr: 'Cilt tipinize uygun son teknoloji lazer cihazlarıyla güvenli ve etkili epilasyon uyguluyoruz. İlk seanstan itibaren fark edilir sonuçlar.',
          en: 'We apply safe, effective hair removal with the latest laser devices suited to your skin type — noticeable results from the first session.',
        },
        features: [
          { tr: 'Son teknoloji cihaz', en: 'Latest devices' },
          { tr: 'Uzman uygulayıcı', en: 'Expert practitioners' },
          { tr: 'Cilt tipine uygun', en: 'Skin-type matched' },
          { tr: 'Hijyenik ortam', en: 'Hygienic setting' },
        ],
        image: '/demos/guzellik/services/laser.webp',
      },
      {
        slug: 'masaj-terapi',
        name: { tr: 'Masaj & Terapi', en: 'Massage & Therapy' },
        short: { tr: 'Rahatlatıcı ve yenileyici masaj seansları.', en: 'Relaxing and restorative massage sessions.' },
        description: {
          tr: 'Klasik, aromaterapi ve sıcak taş masajı seçenekleriyle stresten arınmanızı sağlıyoruz. Uzman terapistlerimiz eşliğinde derin bir rahatlama deneyimi.',
          en: 'With classic, aromatherapy and hot-stone options we help you release stress — a deeply relaxing experience with our expert therapists.',
        },
        features: [
          { tr: 'Aromaterapi', en: 'Aromatherapy' },
          { tr: 'Sıcak taş masajı', en: 'Hot-stone massage' },
          { tr: 'Uzman terapist', en: 'Expert therapist' },
          { tr: 'Sakin ortam', en: 'Calm environment' },
        ],
        image: '/demos/guzellik/services/massage.webp',
      },
      {
        slug: 'cilt-bakimi',
        name: { tr: 'Cilt Bakımı', en: 'Facial Care' },
        short: { tr: 'Cildinize özel profesyonel yüz bakımı.', en: 'Professional facials tailored to your skin.' },
        description: {
          tr: 'Cilt analizine dayalı, kişiye özel yüz bakımı uygulamalarıyla cildinizi canlandırıyoruz. Nemlendirme, peeling ve maske aşamalarıyla ışıltılı bir cilt.',
          en: 'We revitalize your skin with personalized facials based on skin analysis — hydration, peeling and mask steps for a radiant complexion.',
        },
        features: [
          { tr: 'Cilt analizi', en: 'Skin analysis' },
          { tr: 'Nemlendirme', en: 'Hydration' },
          { tr: 'Peeling & maske', en: 'Peeling & mask' },
          { tr: 'Doğal ürünler', en: 'Natural products' },
        ],
        image: '/demos/guzellik/services/spa.webp',
      },
    ],
    contact: contact(
      'randevu@zarafetguzellik.demo',
      { tr: 'Nişantaşı, Teşvikiye Cad. No:45, İstanbul', en: '45 Teşvikiye Ave., Nişantaşı, Istanbul' },
      WEEKDAY_HOURS,
    ),
  },

  // ---------------------------------------------------------------- hukuk
  {
    slug: 'hukuk',
    brand: { tr: 'Adalet Hukuk', en: 'Meridian Law' },
    productsLabel: { tr: 'Uzmanlık Alanları', en: 'Practice Areas' },
    productSingular: { tr: 'Uzmanlık Alanı', en: 'Practice Area' },
    productsHref: (lang) => `/demo/hukuk/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Randevu Al', en: 'Request Consultation' },
    products: [
      {
        slug: 'ticaret-hukuku',
        name: { tr: 'Ticaret Hukuku', en: 'Corporate Law' },
        short: { tr: 'Şirketler ve ticari uyuşmazlıklarda uzmanlık.', en: 'Expertise in companies and commercial disputes.' },
        description: {
          tr: 'Şirket kuruluşları, birleşme ve devralmalar, sözleşme yönetimi ve ticari uyuşmazlıkların çözümünde kurumsal müvekkillerimize danışmanlık ve dava desteği sunuyoruz.',
          en: 'We advise and litigate for corporate clients on company formation, mergers and acquisitions, contract management and the resolution of commercial disputes.',
        },
        category: { tr: 'Kurumsal', en: 'Corporate' },
        features: [
          { tr: 'Şirket kuruluşu', en: 'Company formation' },
          { tr: 'Birleşme & devralma', en: 'M&A' },
          { tr: 'Sözleşme yönetimi', en: 'Contract management' },
          { tr: 'Ticari dava', en: 'Commercial litigation' },
        ],
        image: '/demos/hukuk/products/corporate.webp',
      },
      {
        slug: 'aile-hukuku',
        name: { tr: 'Aile Hukuku', en: 'Family Law' },
        short: { tr: 'Boşanma, velayet ve miras davalarında destek.', en: 'Support in divorce, custody and inheritance.' },
        description: {
          tr: 'Boşanma, nafaka, velayet ve miras davalarında hassas bir yaklaşımla müvekkillerimizin haklarını koruyoruz. Süreç boyunca şeffaf ve güven veren bir danışmanlık.',
          en: 'We protect our clients’ rights with a sensitive approach in divorce, alimony, custody and inheritance cases — transparent, reassuring counsel throughout.',
        },
        category: { tr: 'Bireysel', en: 'Individual' },
        features: [
          { tr: 'Boşanma davaları', en: 'Divorce cases' },
          { tr: 'Velayet & nafaka', en: 'Custody & alimony' },
          { tr: 'Miras hukuku', en: 'Inheritance law' },
          { tr: 'Arabuluculuk', en: 'Mediation' },
        ],
        image: '/demos/hukuk/products/family.webp',
      },
      {
        slug: 'gayrimenkul-hukuku',
        name: { tr: 'Gayrimenkul Hukuku', en: 'Real Estate Law' },
        short: { tr: 'Tapu, kira ve gayrimenkul uyuşmazlıkları.', en: 'Title, lease and real-estate disputes.' },
        description: {
          tr: 'Tapu işlemleri, kira uyuşmazlıkları, kat mülkiyeti ve gayrimenkul alım-satımına ilişkin sözleşmelerde hukuki güvence sağlıyoruz.',
          en: 'We provide legal assurance in title transactions, lease disputes, condominium matters and contracts for buying and selling real estate.',
        },
        category: { tr: 'Gayrimenkul', en: 'Property' },
        features: [
          { tr: 'Tapu işlemleri', en: 'Title transactions' },
          { tr: 'Kira uyuşmazlıkları', en: 'Lease disputes' },
          { tr: 'Kat mülkiyeti', en: 'Condominium law' },
          { tr: 'Sözleşme denetimi', en: 'Contract review' },
        ],
        image: '/demos/hukuk/products/property.webp',
      },
    ],
    services: [
      {
        slug: 'hukuki-danismanlik',
        name: { tr: 'Hukuki Danışmanlık', en: 'Legal Consultation' },
        short: { tr: 'Bireysel ve kurumsal hukuki danışmanlık.', en: 'Legal counsel for individuals and companies.' },
        description: {
          tr: 'Karşılaştığınız hukuki sorunlarda hızlı ve net yönlendirme sunuyoruz. Kurumsal müvekkiller için sürekli danışmanlık paketleri de mevcuttur.',
          en: 'We provide fast, clear guidance for the legal issues you face — ongoing advisory packages are also available for corporate clients.',
        },
        features: [
          { tr: 'İlk görüşme', en: 'Initial meeting' },
          { tr: 'Yazılı görüş', en: 'Written opinion' },
          { tr: 'Kurumsal paket', en: 'Corporate package' },
          { tr: 'Hızlı dönüş', en: 'Fast response' },
        ],
        image: '/demos/hukuk/services/consultation.webp',
      },
      {
        slug: 'dava-takibi',
        name: { tr: 'Dava Takibi', en: 'Litigation' },
        short: { tr: 'Tüm derece mahkemelerinde dava yönetimi.', en: 'Case management across all courts.' },
        description: {
          tr: 'Dava öncesi hazırlıktan duruşma sürecine ve kararın icrasına kadar tüm derece mahkemelerinde davalarınızı titizlikle yönetiyoruz.',
          en: 'From pre-trial preparation to hearings and enforcement of judgments, we manage your cases meticulously across all court levels.',
        },
        features: [
          { tr: 'Dava hazırlığı', en: 'Case preparation' },
          { tr: 'Duruşma temsili', en: 'Hearing representation' },
          { tr: 'İcra takibi', en: 'Enforcement' },
          { tr: 'Düzenli raporlama', en: 'Regular reporting' },
        ],
        image: '/demos/hukuk/services/litigation.webp',
      },
      {
        slug: 'sozlesme-hazirlama',
        name: { tr: 'Sözleşme Hazırlama', en: 'Contract Drafting' },
        short: { tr: 'Haklarınızı koruyan sağlam sözleşmeler.', en: 'Solid contracts that protect your rights.' },
        description: {
          tr: 'Ticari ve bireysel ihtiyaçlarınıza uygun, haklarınızı en üst düzeyde koruyan sözleşmeler hazırlıyor ve mevcut sözleşmelerinizi hukuki risk açısından denetliyoruz.',
          en: 'We draft contracts tailored to your commercial and personal needs that maximally protect your rights, and review existing contracts for legal risk.',
        },
        features: [
          { tr: 'Özel sözleşme', en: 'Bespoke drafting' },
          { tr: 'Risk denetimi', en: 'Risk review' },
          { tr: 'Revizyon desteği', en: 'Revision support' },
          { tr: 'Çok dilli', en: 'Multilingual' },
        ],
        image: '/demos/hukuk/services/contracts.webp',
      },
    ],
    contact: contact(
      'iletisim@adalethukuk.demo',
      { tr: 'Barbaros Bulvarı No:145, Beşiktaş, İstanbul', en: '145 Barbaros Blvd., Beşiktaş, Istanbul' },
      WEEKDAY_HOURS,
    ),
  },

  // ------------------------------------------------------------- restoran
  {
    slug: 'restoran',
    brand: { tr: 'Lezzet Durağı', en: 'Savor Kitchen' },
    productsLabel: { tr: 'Menü', en: 'Menu' },
    productSingular: { tr: 'Menü', en: 'Menu' },
    productsHref: (lang) => `/demo/restoran/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Rezervasyon', en: 'Reserve' },
    products: [
      {
        slug: 'izgara-menu',
        name: { tr: 'Izgara Menü', en: 'Grill Menu' },
        short: { tr: 'Kömür ateşinde özenle pişen et seçkisi.', en: 'A charcoal-grilled selection of premium meats.' },
        description: {
          tr: 'Günlük taze, özenle seçilmiş etlerin kömür ateşinde pişirildiği imza ızgara menümüz. Mevsim sebzeleri ve ev yapımı soslarla servis edilir.',
          en: 'Our signature grill menu of daily-fresh, carefully selected meats cooked over charcoal — served with seasonal vegetables and house-made sauces.',
        },
        price: { tr: '₺680', en: '$37' },
        category: { tr: 'Ana Yemek', en: 'Main' },
        features: [
          { tr: 'Kömür ateşi', en: 'Charcoal grill' },
          { tr: 'Günlük taze et', en: 'Daily-fresh meat' },
          { tr: 'Ev yapımı sos', en: 'House-made sauces' },
          { tr: 'Mevsim sebzeleri', en: 'Seasonal vegetables' },
        ],
        image: '/demos/restoran/g1.webp',
      },
      {
        slug: 'burger-menu',
        name: { tr: 'Burger Menü', en: 'Burger Menu' },
        short: { tr: 'El yapımı köfte ve taze malzemelerle burger.', en: 'Handmade patties with fresh ingredients.' },
        description: {
          tr: 'Kendi harmanımız dana köftesi, mayalı ekmek ve taze malzemelerle hazırlanan imza burgerimiz. Yanında çıtır patates ve özel sos ile servis edilir.',
          en: 'Our signature burger with an in-house beef patty, brioche bun and fresh ingredients — served with crispy fries and a special sauce.',
        },
        price: { tr: '₺420', en: '$23' },
        category: { tr: 'Ana Yemek', en: 'Main' },
        features: [
          { tr: 'El yapımı köfte', en: 'Handmade patty' },
          { tr: 'Mayalı ekmek', en: 'Brioche bun' },
          { tr: 'Çıtır patates', en: 'Crispy fries' },
          { tr: 'Özel sos', en: 'Special sauce' },
        ],
        image: '/demos/restoran/g2.webp',
      },
      {
        slug: 'ozel-kahvalti',
        name: { tr: 'Özel Kahvaltı', en: 'Signature Breakfast' },
        short: { tr: 'Zengin ve taze serpme kahvaltı tabağı.', en: 'A rich, fresh spread-style breakfast.' },
        description: {
          tr: 'Yöresel peynirler, ev yapımı reçeller, taze pişmiş hamur işleri ve sıcak menemenden oluşan zengin serpme kahvaltımız. Hafta sonları taze demlenmiş çay ile.',
          en: 'A rich spread of regional cheeses, homemade jams, freshly baked pastries and hot menemen — served with freshly brewed tea on weekends.',
        },
        price: { tr: '₺550 / kişi', en: '$30 / person' },
        category: { tr: 'Kahvaltı', en: 'Breakfast' },
        features: [
          { tr: 'Serpme kahvaltı', en: 'Spread breakfast' },
          { tr: 'Ev yapımı reçel', en: 'Homemade jam' },
          { tr: 'Taze hamur işi', en: 'Fresh pastries' },
          { tr: 'Sınırsız çay', en: 'Unlimited tea' },
        ],
        image: '/demos/restoran/g4.webp',
      },
    ],
    services: [
      {
        slug: 'catering',
        name: { tr: 'Catering', en: 'Catering' },
        short: { tr: 'Etkinlikleriniz için özel menü ve servis.', en: 'Custom menus and service for your events.' },
        description: {
          tr: 'Kurumsal etkinlikler, davetler ve özel günler için özenle hazırlanmış menüler ve profesyonel servis ekibi sunuyoruz. Menü, kişi sayınıza ve tercihinize göre planlanır.',
          en: 'We offer carefully prepared menus and a professional service team for corporate events, receptions and special occasions — planned around your guest count and preferences.',
        },
        features: [
          { tr: 'Özel menü', en: 'Custom menu' },
          { tr: 'Profesyonel servis', en: 'Professional service' },
          { tr: 'Esnek kişi sayısı', en: 'Flexible headcount' },
          { tr: 'Sunum & ekipman', en: 'Presentation & equipment' },
        ],
        image: '/demos/restoran/services/catering.webp',
      },
      {
        slug: 'ozel-etkinlik',
        name: { tr: 'Özel Etkinlik', en: 'Private Events' },
        short: { tr: 'Kutlamalarınız için özel salon ve menü.', en: 'A private room and menu for your celebrations.' },
        description: {
          tr: 'Doğum günü, yıldönümü ve kurumsal kutlamalar için özel salonumuzu, kişiye özel menü ve dekorasyon seçenekleriyle birlikte sizlere sunuyoruz.',
          en: 'For birthdays, anniversaries and corporate celebrations we offer our private room together with bespoke menu and decoration options.',
        },
        features: [
          { tr: 'Özel salon', en: 'Private room' },
          { tr: 'Kişiye özel menü', en: 'Bespoke menu' },
          { tr: 'Dekorasyon', en: 'Decoration' },
          { tr: 'Etkinlik planlama', en: 'Event planning' },
        ],
        image: '/demos/restoran/services/events.webp',
      },
      {
        slug: 'sef-masasi',
        name: { tr: 'Şef Masası', en: "Chef's Table" },
        short: { tr: 'Açık mutfakta özel şef deneyimi.', en: 'A special chef experience at the open kitchen.' },
        description: {
          tr: 'Açık mutfağımızın hemen yanında, şefimizin özel olarak hazırladığı tadım menüsünü deneyimleyeceğiniz ayrıcalıklı bir yemek deneyimi. Sınırlı kontenjan.',
          en: 'A privileged dining experience right beside our open kitchen, where you enjoy a tasting menu specially prepared by our chef. Limited seating.',
        },
        features: [
          { tr: 'Tadım menüsü', en: 'Tasting menu' },
          { tr: 'Açık mutfak', en: 'Open kitchen' },
          { tr: 'Şef eşliğinde', en: 'With the chef' },
          { tr: 'Sınırlı kontenjan', en: 'Limited seating' },
        ],
        image: '/demos/restoran/services/chef-table.webp',
      },
    ],
    contact: contact(
      'rezervasyon@lezzetduragi.demo',
      { tr: 'Cihangir, Sıraselviler Cad. No:66, İstanbul', en: '66 Sıraselviler Ave., Cihangir, Istanbul' },
      { tr: 'Her gün 12:00 – 24:00', en: 'Every day 12:00 PM – 12:00 AM' },
    ),
  },

  // ------------------------------------------------------------- eticaret
  {
    slug: 'eticaret',
    commerce: true,
    brand: { tr: 'Vitrin Studio', en: 'Vitrin Studio' },
    productsLabel: { tr: 'Ürünler', en: 'Products' },
    productSingular: { tr: 'Ürün', en: 'Product' },
    productsHref: (lang) => `/demo/eticaret/urunler?lang=${lang}`,
    servicesLabel: { tr: 'Hizmetler', en: 'Services' },
    serviceSingular: { tr: 'Hizmet', en: 'Service' },
    primaryCtaLabel: { tr: 'Alışverişe Başla', en: 'Shop Now' },
    products: [
      {
        slug: 'imza-canta',
        name: { tr: 'İmza Deri Çanta', en: 'Signature Leather Bag' },
        short: { tr: 'El yapımı, tam tahıllı deri omuz çantası.', en: 'Handcrafted full-grain leather shoulder bag.' },
        description: {
          tr: 'Tam tahıllı hakiki deriden el yapımı, günlük kullanıma uygun şık omuz çantası. Geniş iç hacmi ve dayanıklı dikişleriyle yıllarca yanınızda.',
          en: 'A handcrafted full-grain genuine leather shoulder bag for everyday elegance — spacious interior and durable stitching built to last for years.',
        },
        price: { tr: '₺2.499', en: '$79' },
        category: { tr: 'Aksesuar', en: 'Accessories' },
        features: [
          { tr: 'Tam tahıllı deri', en: 'Full-grain leather' },
          { tr: 'El yapımı', en: 'Handcrafted' },
          { tr: 'Geniş iç hacim', en: 'Spacious interior' },
          { tr: '2 yıl garanti', en: '2-year warranty' },
        ],
        image: '/demos/eticaret/products/canta.webp',
        gallery: ['/demos/eticaret/products/canta.webp', '/demos/eticaret/p1.webp'],
      },
      {
        slug: 'minimal-saat',
        name: { tr: 'Minimal Kol Saati', en: 'Minimal Wristwatch' },
        short: { tr: 'Safir cam, paslanmaz çelik kasa.', en: 'Sapphire glass, stainless steel case.' },
        description: {
          tr: 'İnce profili, safir camı ve paslanmaz çelik kasasıyla zamansız bir tasarım. Her kombine uyum sağlayan sade kadran ve suya dayanıklı yapı.',
          en: 'A timeless design with a slim profile, sapphire glass and a stainless steel case — a clean dial that pairs with any outfit, water-resistant build.',
        },
        price: { tr: '₺1.899', en: '$59' },
        oldPrice: { tr: '₺2.499', en: '$79' },
        category: { tr: 'Saat', en: 'Watches' },
        features: [
          { tr: 'Safir cam', en: 'Sapphire glass' },
          { tr: 'Paslanmaz çelik', en: 'Stainless steel' },
          { tr: '5 ATM su direnci', en: '5 ATM water resistance' },
          { tr: 'Değişebilir kordon', en: 'Swappable strap' },
        ],
        image: '/demos/eticaret/products/saat.webp',
        gallery: ['/demos/eticaret/products/saat.webp', '/demos/eticaret/p2.webp'],
      },
      {
        slug: 'premium-sneaker',
        name: { tr: 'Premium Sneaker', en: 'Premium Sneaker' },
        short: { tr: 'Nefes alan örgü, hafif taban.', en: 'Breathable knit, lightweight sole.' },
        description: {
          tr: 'Gün boyu konfor için nefes alan örgü üst yüzey ve hafif, esnek taban. Sade renk paletiyle hem spor hem günlük kullanıma uygun.',
          en: 'A breathable knit upper and a lightweight, flexible sole for all-day comfort — a clean color palette suited to both sport and casual wear.',
        },
        price: { tr: '₺1.299', en: '$39' },
        category: { tr: 'Ayakkabı', en: 'Footwear' },
        features: [
          { tr: 'Nefes alan örgü', en: 'Breathable knit' },
          { tr: 'Hafif taban', en: 'Lightweight sole' },
          { tr: 'Ortopedik iç taban', en: 'Cushioned insole' },
          { tr: 'Kaymaz dış taban', en: 'Non-slip outsole' },
        ],
        image: '/demos/eticaret/products/sneaker.webp',
        gallery: ['/demos/eticaret/products/sneaker.webp', '/demos/eticaret/p3.webp'],
      },
      {
        slug: 'gunes-gozlugu',
        name: { tr: 'Tasarım Güneş Gözlüğü', en: 'Designer Sunglasses' },
        short: { tr: 'Polarize cam, asetat çerçeve.', en: 'Polarized lenses, acetate frame.' },
        description: {
          tr: 'UV400 korumalı polarize camlar ve el işçiliğiyle şekillendirilmiş asetat çerçeve. Hafif yapısı ve zamansız formuyla her mevsim şık.',
          en: 'UV400-protected polarized lenses and a hand-shaped acetate frame — lightweight and timeless for every season.',
        },
        price: { tr: '₺1.149', en: '$35' },
        category: { tr: 'Aksesuar', en: 'Accessories' },
        features: [
          { tr: 'UV400 koruma', en: 'UV400 protection' },
          { tr: 'Polarize cam', en: 'Polarized lenses' },
          { tr: 'Asetat çerçeve', en: 'Acetate frame' },
          { tr: 'Koruma kılıfı', en: 'Protective case' },
        ],
        image: '/demos/eticaret/p4.webp',
      },
      {
        slug: 'deri-cuzdan',
        name: { tr: 'İnce Deri Cüzdan', en: 'Slim Leather Wallet' },
        short: { tr: 'RFID korumalı, ince tasarım.', en: 'RFID-protected, slim design.' },
        description: {
          tr: 'Cebinizde yer kaplamayan ince profil, RFID korumalı kart bölmeleri ve tam tahıllı deri. Günlük kullanımda zarif ve dayanıklı.',
          en: 'A slim profile that never bulks up your pocket, RFID-protected card slots and full-grain leather — elegant and durable for daily use.',
        },
        price: { tr: '₺699', en: '$22' },
        oldPrice: { tr: '₺899', en: '$28' },
        category: { tr: 'Aksesuar', en: 'Accessories' },
        features: [
          { tr: 'RFID koruma', en: 'RFID protection' },
          { tr: 'Tam tahıllı deri', en: 'Full-grain leather' },
          { tr: '6 kart bölmesi', en: '6 card slots' },
          { tr: 'İnce profil', en: 'Slim profile' },
        ],
        image: '/demos/eticaret/p5.webp',
      },
      {
        slug: 'imza-parfum',
        name: { tr: 'İmza Parfüm', en: 'Signature Perfume' },
        short: { tr: 'Odunsu-amber notalar, 50 ml.', en: 'Woody-amber notes, 50 ml.' },
        description: {
          tr: 'Odunsu ve amber notaların dengeli buluşması; gün boyu kalıcı, karakterli bir imza koku. Yeniden doldurulabilir cam şişe.',
          en: 'A balanced blend of woody and amber notes — a long-lasting, characterful signature scent in a refillable glass bottle.',
        },
        price: { tr: '₺1.499', en: '$46' },
        category: { tr: 'Kozmetik', en: 'Beauty' },
        features: [
          { tr: 'Odunsu-amber', en: 'Woody-amber' },
          { tr: 'Gün boyu kalıcı', en: 'Long-lasting' },
          { tr: '50 ml', en: '50 ml' },
          { tr: 'Yeniden doldurulabilir', en: 'Refillable' },
        ],
        image: '/demos/eticaret/p6.webp',
      },
      {
        slug: 'deri-kemer',
        name: { tr: 'Klasik Deri Kemer', en: 'Classic Leather Belt' },
        short: { tr: 'Fırçalanmış toka, hakiki deri.', en: 'Brushed buckle, genuine leather.' },
        description: {
          tr: 'Fırçalanmış metal toka ve hakiki deri ile klasik bir tamamlayıcı. Hem resmi hem günlük kombinlerle uyumlu, ayarlanabilir boy.',
          en: 'A classic finishing touch with a brushed metal buckle and genuine leather — adjustable length that suits both formal and casual outfits.',
        },
        price: { tr: '₺549', en: '$17' },
        category: { tr: 'Aksesuar', en: 'Accessories' },
        features: [
          { tr: 'Hakiki deri', en: 'Genuine leather' },
          { tr: 'Fırçalanmış toka', en: 'Brushed buckle' },
          { tr: 'Ayarlanabilir', en: 'Adjustable' },
          { tr: 'Klasik form', en: 'Classic form' },
        ],
        image: '/demos/eticaret/p7.webp',
      },
      {
        slug: 'yun-atki',
        name: { tr: 'Yün Atkı', en: 'Wool Scarf' },
        short: { tr: 'Yumuşak dokulu, sıcak tutan.', en: 'Soft-touch, warm knit.' },
        description: {
          tr: 'Yumuşacık dokusu ve sıcak tutan yapısıyla soğuk günlerin vazgeçilmezi. Nötr tonuyla her paltoya uyum sağlayan zamansız bir parça.',
          en: 'A cold-weather essential with a soft touch and warm knit — a timeless neutral tone that pairs with any coat.',
        },
        price: { tr: '₺449', en: '$14' },
        oldPrice: { tr: '₺649', en: '$20' },
        category: { tr: 'Tekstil', en: 'Textiles' },
        features: [
          { tr: 'Yumuşak dokulu', en: 'Soft-touch' },
          { tr: 'Sıcak tutar', en: 'Keeps warm' },
          { tr: 'Nötr ton', en: 'Neutral tone' },
          { tr: 'Zamansız', en: 'Timeless' },
        ],
        image: '/demos/eticaret/p8.webp',
      },
    ],
    services: [
      {
        slug: 'kargo',
        name: { tr: 'Hızlı & Ücretsiz Kargo', en: 'Fast & Free Shipping' },
        short: { tr: 'Aynı gün kargo, ücretsiz teslimat.', en: 'Same-day dispatch, free delivery.' },
        description: {
          tr: '500 TL ve üzeri siparişlerde ücretsiz kargo, saat 15:00 öncesi siparişlerde aynı gün gönderim. Siparişinizi adım adım takip edin.',
          en: 'Free shipping on orders over 500 TL and same-day dispatch for orders placed before 3 PM — track your order every step of the way.',
        },
        features: [
          { tr: 'Aynı gün gönderim', en: 'Same-day dispatch' },
          { tr: 'Ücretsiz kargo', en: 'Free shipping' },
          { tr: 'Kargo takibi', en: 'Order tracking' },
          { tr: 'Güvenli paketleme', en: 'Secure packaging' },
        ],
        image: '/demos/eticaret/services/kargo.webp',
      },
      {
        slug: 'iade',
        name: { tr: 'Kolay İade & Değişim', en: 'Easy Returns & Exchange' },
        short: { tr: '14 gün içinde koşulsuz iade.', en: 'No-questions returns within 14 days.' },
        description: {
          tr: 'Beğenmediğiniz ürünleri 14 gün içinde koşulsuz iade edin. Değişim ve iade süreçleri tamamen ücretsiz ve tek tıkla başlatılır.',
          en: 'Return anything you do not love within 14 days, no questions asked — exchanges and returns are entirely free and start with a single click.',
        },
        features: [
          { tr: '14 gün iade', en: '14-day returns' },
          { tr: 'Ücretsiz değişim', en: 'Free exchange' },
          { tr: 'Tek tıkla iade', en: 'One-click returns' },
          { tr: 'Hızlı geri ödeme', en: 'Fast refunds' },
        ],
        image: '/demos/eticaret/services/iade.webp',
      },
      {
        slug: 'uyelik',
        name: { tr: 'Üyelik & Sadakat', en: 'Membership & Loyalty' },
        short: { tr: 'Puan kazanın, özel indirimlere erişin.', en: 'Earn points, unlock exclusive deals.' },
        description: {
          tr: 'Her alışverişten puan kazanın, üyeye özel kampanyalara ve erken erişim fırsatlarına katılın. Doğum gününüze özel sürprizler sizi bekliyor.',
          en: 'Earn points on every purchase and unlock member-only campaigns and early-access drops — with special surprises waiting on your birthday.',
        },
        features: [
          { tr: 'Puan kazanımı', en: 'Reward points' },
          { tr: 'Üyeye özel indirim', en: 'Member discounts' },
          { tr: 'Erken erişim', en: 'Early access' },
          { tr: 'Doğum günü hediyesi', en: 'Birthday gift' },
        ],
        image: '/demos/eticaret/services/uyelik.webp',
      },
    ],
    contact: contact(
      'destek@vitrinstudio.demo',
      { tr: 'Nişantaşı, Teşvikiye Cad. No:12, İstanbul', en: '12 Teşvikiye Ave., Nişantaşı, Istanbul' },
      { tr: 'Hafta içi 09:00 – 19:00, Cumartesi 10:00 – 17:00', en: 'Weekdays 9 AM – 7 PM, Saturday 10 AM – 5 PM' },
    ),
  },
]

export function getCatalog(slug: string): DemoCatalog | undefined {
  return demoCatalogs.find((c) => c.slug === slug)
}

export function getProduct(slug: string, productSlug: string): CatalogItem | undefined {
  return getCatalog(slug)?.products.find((p) => p.slug === productSlug)
}

export function getService(slug: string, serviceSlug: string): CatalogItem | undefined {
  return getCatalog(slug)?.services.find((s) => s.slug === serviceSlug)
}

/** Convenience accessor for a bilingual field. */
export function tc(field: L, lang: Lang): string {
  return pickLang(field, lang)
}
