import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { MENU_MAX } from '@/lib/site-menu'
import { findTestimonialsPage, testimonialsLinkDefaultLabel, testimonialsPageTitle, type TestimonialItem } from '@/lib/testimonials'

/**
 * Showcase demo reviews
 * ---------------------
 * Fictional, sector-specific example reviews for the 8 showcase demos. Every item is flagged `sample`
 * and the demo card shows a small "Örnek yorum" tag, so nothing here reads as a real customer.
 * Content rules: made-up first name + initial, no real brand or company, no figures, percentages,
 * awards or "N years" claims, and no photos (initials avatars only). Turkish only: the English demos
 * stay as they were.
 *
 * Demo-only. The generation pipeline never reads this file; new sites get the generic placeholders
 * from `seedTestimonialItems` in `lib/testimonials.ts`.
 */

type Review = { quote: string; author: string; role: string }

const DEMO_REVIEWS_TR: Record<string, Review[]> = {
  kahve: [
    { quote: 'Sabah işe giderken uğradığım yer oldu. Filtre kahvesi dengeli, barista sorduğumda nedenini de anlatıyor.', author: 'Ayşe K.', role: 'Kadıköy, düzenli misafir' },
    { quote: 'Dizüstü bilgisayarla gelip uzun oturdum, kimse acele ettirmedi. Çekirdeklerden birini eve de aldım.', author: 'Mert D.', role: 'Yazılımcı, Beşiktaş' },
    { quote: 'Süt kahvelerinde köpük tam kıvamında. Yanındaki kurabiye de ayrıca sevindirdi.', author: 'Elif T.', role: 'Öğretmen, Moda' },
    { quote: 'Arkadaşlarla buluşmak için sakin bir köşe arıyorduk, burada bulduk. Müzik sesi konuşmaya engel olmuyor.', author: 'Can B.', role: 'Misafir, Şişli' },
    { quote: 'Kahve konusunda pek bilgim yoktu. Ne sevdiğimi sordular, ona göre bir şey önerdiler. İyi ki sormuşlar.', author: 'Zeynep A.', role: 'Öğrenci, Bornova' },
    { quote: 'Hafta sonu kahvaltı sonrası kahve için geldik. Küçük bir mekan ama ilgi büyük.', author: 'Okan S.', role: 'Misafir, Cihangir' },
  ],
  mimarlik: [
    { quote: 'Evimizin planını baştan konuştuk. Ne istemediğimizi de dinlediler, bu bence çok değerliydi.', author: 'Selin Y.', role: 'Ev sahibi, Ankara' },
    { quote: 'Şantiyede küçük bir sorun çıktığında aynı gün çözüm önerisi geldi. Haberleşme düzenliydi.', author: 'Burak E.', role: 'Proje sahibi, İzmir' },
    { quote: 'Ofisimizin düzenini yeniden kurduk. Çalışanlar artık daha rahat, toplantı alanı da çok işe yarıyor.', author: 'Derya M.', role: 'Şirket yöneticisi, İstanbul' },
    { quote: 'Çizimler anlaşılırdı, maketle gösterdikleri için kararı vermek kolay oldu.', author: 'Tolga K.', role: 'Villa sahibi, Bodrum' },
    { quote: 'Bütçemizi baştan açıkça konuştuk ve sürpriz yaşamadık. Bu bana güven verdi.', author: 'Nazlı C.', role: 'Ev sahibi, Bursa' },
    { quote: 'Eski dairemizi yenilerken doğal ışığı nasıl kullanacağımızı onlar gösterdi. Sonuçtan memnunuz.', author: 'Emre G.', role: 'Daire sahibi, Eskişehir' },
  ],
  'dis-klinigi': [
    { quote: 'Dişçiden çekinirim ama burada ne yapılacağını önceden anlattılar. Gerginliğim çok azaldı.', author: 'Merve H.', role: 'Hasta, Kadıköy' },
    { quote: 'Randevu saatinde içeri alındım, beklemedim. Kontrol sonrası bakım önerileri de yazılı geldi.', author: 'Kaan U.', role: 'Hasta, Çankaya' },
    { quote: 'Çocuğumun ilk muayenesiydi. Doktor onunla oyun gibi konuştu, ağlamadan çıktık.', author: 'Gülay P.', role: 'Veli, Karşıyaka' },
    { quote: 'Diş taşı temizliği sonrası ağzım ferahladı. Ne sıklıkla gelmem gerektiğini de açıkladılar.', author: 'Barış T.', role: 'Hasta, Nilüfer' },
    { quote: 'Tedavi seçeneklerini sırayla anlattılar, karar bana kaldı. Baskı hissetmedim.', author: 'Sevgi N.', role: 'Hasta, Konak' },
    { quote: 'Klinik temiz ve sakin. Resepsiyondaki arkadaş sorularımı sabırla yanıtladı.', author: 'Oğuz L.', role: 'Hasta, Maltepe' },
  ],
  emlak: [
    { quote: 'Aradığım kriterleri dinleyip yalnızca uygun evleri gösterdiler. Boşuna gezmedim.', author: 'Pelin A.', role: 'Kiracı, Ankara' },
    { quote: 'Evimizi satarken değerleme sürecini açık anlattılar. Evrak işlerinde de yalnız kalmadık.', author: 'Hakan Ö.', role: 'Ev sahibi, İzmir' },
    { quote: 'İlk evimizi alıyorduk, bilmediğimiz çok şey vardı. Her adımda ne yapacağımızı söylediler.', author: 'Duygu R.', role: 'Alıcı, İstanbul' },
    { quote: 'Telefonla ulaşmak kolaydı, mesajlara aynı gün dönüş yapıldı.', author: 'Serkan V.', role: 'Yatırımcı, Bursa' },
    { quote: 'Dairemi kiraya verirken kiracı bulma ve sözleşme konusunda rahat ettim.', author: 'Aylin B.', role: 'Daire sahibi, Antalya' },
    { quote: 'Gezdiğimiz evler hakkında artıları da eksileri de dürüstçe söylediler. Bu hoşuma gitti.', author: 'Murat Ş.', role: 'Alıcı, Eskişehir' },
  ],
  guzellik: [
    { quote: 'Cildim hassas olduğu için çekiniyordum. Önce içeriği sordular, sonra uygun bakımı seçtik.', author: 'Esra D.', role: 'Danışan, Nişantaşı' },
    { quote: 'Saç rengi konusunda ne istediğimi anlatmaya çalışırken fotoğraf üzerinden birlikte karar verdik.', author: 'Büşra K.', role: 'Danışan, Çankaya' },
    { quote: 'Düğün öncesi deneme yaptık, günü gelince hiç stres yaşamadım. Ekip sakin ve ilgiliydi.', author: 'Ceren M.', role: 'Gelin, İzmir' },
    { quote: 'Salon çok temiz, malzemeler ayrı ayrı açılıyor. Küçük şeyler ama fark ediyorum.', author: 'Nur T.', role: 'Danışan, Bursa' },
    { quote: 'Manikür sonrası ellerim bir hafta boyunca düzgün kaldı. Tekrar geleceğim.', author: 'İrem Y.', role: 'Danışan, Kadıköy' },
    { quote: 'Masaj sırasında oda sıcaklığı ve müzik tam yerindeydi. Çıkarken çok rahatlamıştım.', author: 'Selma G.', role: 'Danışan, Bodrum' },
  ],
  hukuk: [
    { quote: 'Sorunumu ilk görüşmede sakin sakin dinlediler. Hangi adımların atılacağını açıkça anlattılar.', author: 'Fatma Ç.', role: 'Müvekkil, Ankara' },
    { quote: 'Dosyamla ilgili her gelişmeden haberdar oldum. Aramak zorunda kalmadan bilgi geldi.', author: 'Levent A.', role: 'Müvekkil, İstanbul' },
    { quote: 'Sözleşmemizi imzalamadan önce incelettik. Fark edemeyeceğimiz iki maddeyi düzelttiler.', author: 'Gamze S.', role: 'Küçük işletme sahibi, İzmir' },
    { quote: 'Hukuki dilden anlamam, ama bana anlaşılır bir dille anlattılar. Soru sormaktan çekinmedim.', author: 'Cem R.', role: 'Müvekkil, Bursa' },
    { quote: 'Ücret konusunu baştan konuştuk, sonradan sürpriz çıkmadı.', author: 'Aslı P.', role: 'Müvekkil, Eskişehir' },
    { quote: 'Acil bir durumda hafta sonu bile dönüş yaptılar. Bu ulaşılabilirlik beni rahatlattı.', author: 'Kemal Y.', role: 'Müvekkil, Antalya' },
  ],
  restoran: [
    { quote: 'Akşam yemeği için rezervasyon yaptık, masamız hazırdı. Servis acele ettirmeden ilerledi.', author: 'Deniz K.', role: 'Misafir, Beşiktaş' },
    { quote: 'Günün çorbası beni şaşırttı, sade ama çok lezzetliydi. Ana yemekte porsiyon da gayet yeterliydi.', author: 'Hülya B.', role: 'Misafir, Çankaya' },
    { quote: 'Ailece gittik, çocuklar için ayrı bir şey istediğimizde hemen ayarladılar.', author: 'Tuncay M.', role: 'Misafir, İzmir' },
    { quote: 'Tatlıyı ayrıca öneriyorum. Garson ne alacağımıza karar vermemizde çok yardımcı oldu.', author: 'Melis A.', role: 'Misafir, Kadıköy' },
    { quote: 'İş yemeği için seçtik. Ortam sessizdi, konuşmak rahat oldu.', author: 'Orhan T.', role: 'Misafir, Bursa' },
    { quote: 'Alerjim olduğunu söyleyince mutfaktan çıkıp içeriği tek tek anlattılar. Güvendim.', author: 'Neslihan E.', role: 'Misafir, Nilüfer' },
  ],
  eticaret: [
    { quote: 'Sipariş verdikten sonra kargo bilgisi mesajla geldi. Paket de özenle sarılmıştı.', author: 'Gizem A.', role: 'Alıcı, Ankara' },
    { quote: 'Ürün fotoğraflardaki gibi çıktı. Beden konusunda tereddüdüm vardı, destek ekibi yardımcı oldu.', author: 'Berk Ü.', role: 'Alıcı, İzmir' },
    { quote: 'Hediye olarak aldım, notla birlikte gönderdiler. Alan kişi çok sevindi.', author: 'Tuğba R.', role: 'Alıcı, İstanbul' },
    { quote: 'Değişim isteyince sorun çıkarmadılar. Süreç basitti, kısa sürede çözüldü.', author: 'Volkan D.', role: 'Alıcı, Bursa' },
    { quote: 'Sitede aradığımı kolayca buldum, ödeme adımları da sade ve anlaşılırdı.', author: 'Şule K.', role: 'Alıcı, Eskişehir' },
    { quote: 'Küçük bir markadan alışveriş yapmayı seviyorum. Ürün sağlam, ilgi de samimiydi.', author: 'Arda N.', role: 'Alıcı, Antalya' },
  ],
}

export function demoTestimonialItems(slug: string): TestimonialItem[] {
  return (DEMO_REVIEWS_TR[slug] ?? []).map((review) => ({ ...review, sample: true }))
}

/** Where the home section goes: just above the contact block, so the page keeps its order. */
function insertionIndex(sections: Section[]): number {
  const contact = sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = sections.findIndex((s) => s.type === 'footer')
  return footer === -1 ? sections.length : footer
}

/**
 * Gives a Turkish demo a labelled example-review section and its own reviews page, and puts
 * "Müşteri Yorumları" in the demo's menu. Other sections and English demos are not touched.
 */
export function applyDemoTestimonials(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
  if (lang !== 'tr') return
  const items = demoTestimonialItems(slug)
  if (items.length === 0) return
  if (site.sections.some((s) => s.type === 'testimonials')) return

  const section: Section = {
    type: 'testimonials',
    title: testimonialsPageTitle('tr'),
    subtitle: 'Bu demodaki yorumlar kurgusaldır; sektörün nasıl görüneceğini göstermek için yazılmıştır.',
    items,
    showAvatars: true,
    pageEnabled: true,
    linkEnabled: true,
    linkLabel: testimonialsLinkDefaultLabel('tr'),
  }
  const at = insertionIndex(site.sections)
  site.sections = [...site.sections.slice(0, at), section, ...site.sections.slice(at)]

  const pages = site.pages ?? []
  if (!findTestimonialsPage(site)) {
    site.pages = [
      ...pages,
      { slug: 'musteri-yorumlari', title: testimonialsPageTitle('tr'), kind: 'detail', detailOf: 'testimonials' },
    ]
  }

  const links = site.navigation.links
  if (links.length < MENU_MAX && !links.some((l) => l.href.includes('musteri-yorumlari'))) {
    const entry = { label: testimonialsPageTitle('tr'), href: `/demo/${slug}/musteri-yorumlari?lang=tr` }
    const contactAt = links.findIndex((l) => l.href.includes('/iletisim'))
    links.splice(contactAt === -1 ? links.length : contactAt, 0, entry)
  }
}
