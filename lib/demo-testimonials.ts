import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { MENU_MAX } from '@/lib/site-menu'
import { findTestimonialsPage, testimonialsLinkDefaultLabel, testimonialsPageTitle, type TestimonialItem } from '@/lib/testimonials'

/**
 * Showcase demo reviews
 * ---------------------
 * Fictional, sector-specific example reviews for the 8 showcase demos. Every item is flagged `sample`
 * and the demo card shows a small "Örnek yorum" tag, so nothing here reads as a real customer.
 * Content rules: made-up first name + initial, no real brand or company, no figures, percentages,
 * awards or "N years" claims, and no photos (initials avatars only). Turkish and English variants.
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

const DEMO_REVIEWS_EN: Record<string, Review[]> = {
  kahve: [
    { quote: 'It became my stop on the way to work. The filter coffee is balanced, and the barista explains why when I ask.', author: 'Alice K.', role: 'Regular guest' },
    { quote: 'I came with a laptop and stayed for hours; nobody rushed me. I took one of the beans home too.', author: 'Mark D.', role: 'Software developer' },
    { quote: 'The foam on the milk coffees is just right. The cookie on the side was a nice surprise.', author: 'Ella T.', role: 'Teacher' },
    { quote: 'We wanted a calm corner to meet friends and found it here. The music never gets in the way of talking.', author: 'Chris B.', role: 'Guest' },
    { quote: 'I did not know much about coffee. They asked what I like and suggested something to match. Glad they asked.', author: 'Zoe A.', role: 'Student' },
    { quote: 'We came for coffee after a weekend breakfast. A small place, but the attention is generous.', author: 'Owen S.', role: 'Guest' },
  ],
  mimarlik: [
    { quote: 'We talked through our home plan from the start. They listened to what we did not want too, which I found valuable.', author: 'Selin Y.', role: 'Homeowner' },
    { quote: 'When a small issue came up on site, a proposed fix arrived the same day. Communication was steady.', author: 'Ben E.', role: 'Project owner' },
    { quote: 'We rebuilt the layout of our office. People are more comfortable now and the meeting area is very useful.', author: 'Dana M.', role: 'Company manager' },
    { quote: 'The drawings were easy to follow, and the model made the decision simple.', author: 'Tom K.', role: 'Villa owner' },
    { quote: 'We discussed the budget openly from day one and had no surprises. That gave me confidence.', author: 'Nina C.', role: 'Homeowner' },
    { quote: 'While renovating our old flat, they showed us how to use natural light. We are happy with the result.', author: 'Eric G.', role: 'Flat owner' },
  ],
  'dis-klinigi': [
    { quote: 'I am nervous about dentists, but they explained what would happen beforehand. My tension dropped a lot.', author: 'Mara H.', role: 'Patient' },
    { quote: 'I was seen at my appointment time and did not wait. Care tips after the check-up came in writing.', author: 'Kyle U.', role: 'Patient' },
    { quote: 'It was my child first visit. The doctor spoke to them like it was a game, and we left without tears.', author: 'Gail P.', role: 'Parent' },
    { quote: 'My mouth felt fresh after the cleaning. They also explained how often I should come back.', author: 'Ben T.', role: 'Patient' },
    { quote: 'They went through the treatment options one by one and the decision was mine. I felt no pressure.', author: 'Sofia N.', role: 'Patient' },
    { quote: 'The clinic is clean and calm. The person at reception answered my questions patiently.', author: 'Oscar L.', role: 'Patient' },
  ],
  emlak: [
    { quote: 'They listened to my criteria and only showed suitable homes. I did not waste time viewing the wrong ones.', author: 'Paula A.', role: 'Tenant' },
    { quote: 'When we sold our home they explained the valuation openly. We were not left alone with the paperwork either.', author: 'Harry O.', role: 'Homeowner' },
    { quote: 'We were buying our first home and there was a lot we did not know. They told us what to do at every step.', author: 'Daisy R.', role: 'Buyer' },
    { quote: 'They were easy to reach by phone, and messages were answered the same day.', author: 'Sean V.', role: 'Investor' },
    { quote: 'Renting out my flat, I felt at ease about finding a tenant and the contract.', author: 'Alyn B.', role: 'Flat owner' },
    { quote: 'They told us the pros and the cons of the homes we viewed, honestly. I liked that.', author: 'Marc S.', role: 'Buyer' },
  ],
  guzellik: [
    { quote: 'My skin is sensitive, so I was wary. They asked about the ingredients first, then we chose a fitting treatment.', author: 'Ellie D.', role: 'Client' },
    { quote: 'I struggled to describe the hair color I wanted, so we decided together using a photo.', author: 'Bella K.', role: 'Client' },
    { quote: 'We did a trial before the wedding, and on the day I felt no stress. The team was calm and attentive.', author: 'Clara M.', role: 'Bride' },
    { quote: 'The salon is very clean and the tools are opened in front of you. Small things, but I notice them.', author: 'Nora T.', role: 'Client' },
    { quote: 'My hands looked neat for a week after the manicure. I will be back.', author: 'Iris Y.', role: 'Client' },
    { quote: 'The room temperature and music were just right during the massage. I left very relaxed.', author: 'Selma G.', role: 'Client' },
  ],
  hukuk: [
    { quote: 'They listened to my problem calmly in the first meeting and explained clearly which steps would follow.', author: 'Fiona C.', role: 'Client' },
    { quote: 'I was kept up to date on every development in my file. Information arrived without me having to call.', author: 'Leo A.', role: 'Client' },
    { quote: 'We had our contract reviewed before signing. They fixed two clauses we would not have noticed.', author: 'Grace S.', role: 'Small business owner' },
    { quote: 'I do not understand legal language, but they explained things plainly. I was never afraid to ask.', author: 'Cal R.', role: 'Client' },
    { quote: 'We talked about fees at the start, and there were no surprises later.', author: 'Ada P.', role: 'Client' },
    { quote: 'In an urgent situation they replied even on a weekend. That availability put me at ease.', author: 'Kent Y.', role: 'Client' },
  ],
  restoran: [
    { quote: 'We booked a table for dinner and it was ready. Service moved along without rushing us.', author: 'Dean K.', role: 'Guest' },
    { quote: 'The soup of the day surprised me, simple but very tasty. The main course portion was generous enough too.', author: 'Holly B.', role: 'Guest' },
    { quote: 'We went as a family, and when we asked for something separate for the kids they arranged it right away.', author: 'Tim M.', role: 'Guest' },
    { quote: 'I also recommend the dessert. The waiter helped us decide what to order.', author: 'Mel A.', role: 'Guest' },
    { quote: 'We chose it for a business lunch. The room was quiet, so talking was easy.', author: 'Ian T.', role: 'Guest' },
    { quote: 'When I mentioned my allergy, someone came out of the kitchen and went through the ingredients one by one. I trusted them.', author: 'Nell E.', role: 'Guest' },
  ],
  eticaret: [
    { quote: 'After I ordered, the shipping details came by message. The package was wrapped with care too.', author: 'Gemma A.', role: 'Buyer' },
    { quote: 'The product looked like the photos. I was unsure about the size and the support team helped.', author: 'Ben U.', role: 'Buyer' },
    { quote: 'I bought it as a gift and they sent it with a note. The person who got it was delighted.', author: 'Tessa R.', role: 'Buyer' },
    { quote: 'They made no fuss when I asked for an exchange. The process was simple and quickly sorted.', author: 'Vic D.', role: 'Buyer' },
    { quote: 'I found what I wanted on the site easily, and the payment steps were plain and clear.', author: 'Sue K.', role: 'Buyer' },
    { quote: 'I like buying from a small brand. The product is solid and the care felt personal.', author: 'Arlo N.', role: 'Buyer' },
  ],
}

export function demoTestimonialItems(slug: string, lang: 'tr' | 'en' = 'tr'): TestimonialItem[] {
  const source = lang === 'en' ? DEMO_REVIEWS_EN : DEMO_REVIEWS_TR
  return (source[slug] ?? []).map((review) => ({ ...review, sample: true }))
}

/** Where the home section goes: just above the contact block, so the page keeps its order. */
function insertionIndex(sections: Section[]): number {
  const contact = sections.findIndex((s) => s.type === 'contact')
  if (contact !== -1) return contact
  const footer = sections.findIndex((s) => s.type === 'footer')
  return footer === -1 ? sections.length : footer
}

/**
 * Gives a demo (Turkish or English) a labelled example-review section and its own reviews page at
 * `/demo/<slug>/musteri-yorumlari`, and puts the reviews link in the demo's menu. Other sections are not touched.
 */
export function applyDemoTestimonials(site: WebsiteSchema, slug: string, lang: 'tr' | 'en'): void {
  const items = demoTestimonialItems(slug, lang)
  if (items.length === 0) return
  if (site.sections.some((s) => s.type === 'testimonials')) return

  const section: Section = {
    type: 'testimonials',
    title: testimonialsPageTitle(lang),
    subtitle:
      lang === 'tr'
        ? 'Bu demodaki yorumlar kurgusaldır; sektörün nasıl görüneceğini göstermek için yazılmıştır.'
        : 'The reviews in this demo are fictional, written to show how this kind of site would look.',
    items,
    showAvatars: true,
    pageEnabled: true,
    linkEnabled: true,
    linkLabel: testimonialsLinkDefaultLabel(lang),
  }
  const at = insertionIndex(site.sections)
  site.sections = [...site.sections.slice(0, at), section, ...site.sections.slice(at)]

  const pages = site.pages ?? []
  if (!findTestimonialsPage(site)) {
    site.pages = [
      ...pages,
      { slug: 'musteri-yorumlari', title: testimonialsPageTitle(lang), kind: 'detail', detailOf: 'testimonials' },
    ]
  }

  const links = site.navigation.links
  if (links.length < MENU_MAX && !links.some((l) => l.href.includes('musteri-yorumlari'))) {
    const entry = { label: testimonialsPageTitle(lang), href: `/demo/${slug}/musteri-yorumlari?lang=${lang}` }
    const contactAt = links.findIndex((l) => l.href.includes('/iletisim'))
    links.splice(contactAt === -1 ? links.length : contactAt, 0, entry)
  }
}
