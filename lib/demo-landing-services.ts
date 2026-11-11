/**
 * Detail pages for the four sector landing demos (`/demo/<slug>/hizmet/<item>`).
 *
 * Keyed by the demo slug, then by the Turkish title of an existing service
 * card (the same key `LANDING_MEDIA.services` uses), so the card titles and
 * photos stay where they are and this file only adds the slug and the page
 * text. Copy is fictional and claim-free: no hours, years, counts, prices,
 * guarantees or time promises.
 */
type L = { tr: string; en: string }

export type LandingServicePage = {
  slug: string
  lead: L
  includes: L[]
  steps: L[]
}

const l = (tr: string, en: string): L => ({ tr, en })

export const LANDING_SERVICE_PAGES: Record<string, Record<string, LandingServicePage>> = {
  'oto-cekici': {
    'Oto çekici': {
      slug: 'oto-cekici',
      lead: l(
        'Arızalanan veya kaza yapan aracınızı kayar kasa çekiciyle, hasar görmeyecek şekilde sabitleyerek taşırız. Yola çıkmadan önce konumu ve gidilecek adresi netleştiririz.',
        'We carry your broken-down or damaged vehicle on a flatbed tow truck, secured so it is not harmed. Before we set off we settle the pick-up point and the destination.',
      ),
      includes: [
        l('Kayar kasa ile taşıma', 'Flatbed transport'),
        l('Aracın özenle yüklenmesi ve sabitlenmesi', 'Careful loading and securing of the vehicle'),
        l('İstediğiniz adrese teslim', 'Drop-off at the address you choose'),
        l('Yola çıkmadan önce ücret ve konum bilgisi', 'Price and location confirmed before we set off'),
      ],
      steps: [
        l('Konumunuzu ve aracınızın durumunu bize iletirsiniz.', 'You tell us your location and the state of the vehicle.'),
        l('Ücreti ve gidilecek adresi birlikte netleştiririz.', 'We settle the price and the destination together.'),
        l('Ekip gelir, aracı yükler ve sabitler.', 'The crew arrives, loads and secures the vehicle.'),
        l('Aracı belirlediğiniz adreste teslim ederiz.', 'We hand the vehicle over at the agreed address.'),
      ],
    },
    'Yol yardım': {
      slug: 'yol-yardim',
      lead: l(
        'Yerinde çözülebilecek küçük arızalarda aracı çekmeden, yol kenarında destek veririz. Çözülemeyen durumda aracınız için çekici seçeneği sunarız.',
        'For small faults that can be fixed on the spot, we help at the roadside without towing. If it cannot be solved there, we offer a tow for your vehicle.',
      ),
      includes: [
        l('Yol kenarında ilk kontrol', 'A first check at the roadside'),
        l('Yerinde çözülebilen arızalarda müdahale', 'Help with faults that can be fixed on site'),
        l('Çözülemeyen durumda çekici yönlendirmesi', 'Tow arranged when it cannot be fixed on site'),
      ],
      steps: [
        l('Yaşadığınız sorunu ve konumunuzu anlatırsınız.', 'You describe the problem and where you are.'),
        l('Ekip gelir ve aracı yerinde kontrol eder.', 'The crew arrives and checks the vehicle on site.'),
        l('Çözülebiliyorsa müdahale eder, çözülemiyorsa seçenekleri size anlatırız.', 'If it can be fixed we do it; if not, we explain your options.'),
      ],
    },
    'Akü takviye': {
      slug: 'aku-takviye',
      lead: l(
        'Akünüz bittiğinde aracı çalıştırmak için yerinde takviye yaparız. Akünün durumunu kontrol edip sonraki adım için sizi bilgilendiririz.',
        'When your battery is flat we jump-start the vehicle on the spot. We check the battery and tell you what to do next.',
      ),
      includes: [
        l('Yerinde akü takviyesi', 'On-site battery jump-start'),
        l('Akünün ve bağlantıların kontrolü', 'A check of the battery and its connections'),
        l('Gerekirse akü değişimi için bilgilendirme', 'Advice if the battery needs replacing'),
      ],
      steps: [
        l('Konumunuzu ve aracınızın durumunu iletirsiniz.', 'You share your location and the state of the vehicle.'),
        l('Ekip gelir, bağlantıları kontrol eder ve takviye yapar.', 'The crew arrives, checks the connections and jump-starts the car.'),
        l('Aracın çalıştığını birlikte doğrular, sonraki adımı anlatırız.', 'We confirm together that it runs and explain the next step.'),
      ],
    },
    'Lastik desteği': {
      slug: 'lastik-destegi',
      lead: l(
        'Patlayan veya inen lastikte yerinde destek veririz. Yedek lastik hazırsa değişimi yapar, değilse aracın güvenle taşınması için çözüm sunarız.',
        'We help on site with a flat or deflated tyre. If you have a spare we change it; if not, we arrange a safe way to move the vehicle.',
      ),
      includes: [
        l('Yerinde lastik değişimi desteği', 'On-site tyre change help'),
        l('Yedek lastiğin durumuna bakılması', 'A look at the condition of the spare'),
        l('Değişim mümkün değilse aracın taşınması', 'Transport if a change is not possible'),
      ],
      steps: [
        l('Konumunuzu ve lastik sorununu anlatırsınız.', 'You tell us where you are and what happened to the tyre.'),
        l('Ekip gelir ve yedek lastiği ile aracı kontrol eder.', 'The crew arrives and checks the spare and the vehicle.'),
        l('Değişimi yapar ya da aracı taşıma seçeneğini anlatırız.', 'We change the tyre or explain the towing option.'),
      ],
    },
  },
  nakliyat: {
    'Evden eve taşıma': {
      slug: 'evden-eve-tasima',
      lead: l(
        'Ev taşımayı planlı ve sakin bir işe çeviririz. Eşyalarınızı yerinde görür, taşınma gününe göre programı birlikte hazırlarız.',
        'We turn a home move into a planned, calm job. We see your belongings on site and build the schedule around your moving day.',
      ),
      includes: [
        l('Yerinde keşif ve yazılı teklif', 'An on-site survey and a written quote'),
        l('Eşyaların özenle yüklenmesi', 'Careful loading of your belongings'),
        l('Yeni adreste yerleştirme', 'Placing things at the new address'),
        l('Taşınma gününe göre program', 'A schedule built around your moving day'),
      ],
      steps: [
        l('Keşif isteğinizi iletirsiniz.', 'You send us a survey request.'),
        l('Eşyalarınızı ve binanın koşullarını yerinde görürüz.', 'We see your belongings and the building in person.'),
        l('Kapsamı ve ücreti içeren yazılı teklifi paylaşırız.', 'We share a written quote covering scope and price.'),
        l('Taşınma günü ekip yükler, taşır ve yerleştirir.', 'On moving day the crew loads, moves and places everything.'),
      ],
    },
    'Ofis taşıma': {
      slug: 'ofis-tasima',
      lead: l(
        'Ofis taşımasında iş akışınızın aksamaması için taşıma sırasını birlikte planlarız. Masa, dosya ve ekipmanlar etiketlenerek yeni yerde doğru noktaya konur.',
        'For an office move we plan the order together so your work is not disrupted. Desks, files and equipment are labelled and placed where they belong.',
      ),
      includes: [
        l('Taşıma sırasının birlikte planlanması', 'The moving order planned together'),
        l('Dosya ve ekipmanların etiketlenmesi', 'Labelling of files and equipment'),
        l('Mobilyaların sökülüp kurulması', 'Dismantling and reassembling furniture'),
        l('Yeni ofiste yerleşim planına göre yerleştirme', 'Placement following your layout plan'),
      ],
      steps: [
        l('İhtiyacınızı ve taşınma tarihinizi paylaşırsınız.', 'You share what you need and your moving date.'),
        l('Ofisi yerinde görür, taşıma planını çıkarırız.', 'We see the office and draw up the plan.'),
        l('Eşyalar paketlenir ve etiketlenir.', 'Items are packed and labelled.'),
        l('Taşır, yeni ofiste planınıza göre yerleştiririz.', 'We move them and set them up as planned.'),
      ],
    },
    'Asansörlü taşıma': {
      slug: 'asansorlu-tasima',
      lead: l(
        'Merdivenin elverişli olmadığı veya büyük eşyaların taşınacağı binalarda dış cephe asansörüyle eşyaları pencere veya balkondan indirir ya da çıkarırız.',
        'In buildings where the stairs are not practical or the items are large, we lower or raise belongings through a window or balcony with an exterior lift.',
      ),
      includes: [
        l('Dış cephe asansörü ile taşıma', 'Moving with an exterior furniture lift'),
        l('Büyük ve hacimli eşyalar için uygun çözüm', 'A fitting solution for large, bulky items'),
        l('Uygulama öncesi bina ve çevre kontrolü', 'A building and surroundings check beforehand'),
      ],
      steps: [
        l('Bina ve taşınacak eşyalar hakkında bilgi verirsiniz.', 'You tell us about the building and the items.'),
        l('Asansörün kurulacağı alanı yerinde kontrol ederiz.', 'We check the area where the lift will stand.'),
        l('Asansörü kurar, eşyaları güvenle indirir ya da çıkarırız.', 'We set up the lift and move the items safely.'),
      ],
    },
    Paketleme: {
      slug: 'paketleme',
      lead: l(
        'Kırılacak eşyalar ve mobilyalar türüne uygun malzemeyle paketlenir. İsterseniz yalnızca paketleme hizmetini de alabilirsiniz.',
        'Fragile items and furniture are packed in materials suited to each. You can also take the packing service on its own.',
      ),
      includes: [
        l('Eşya türüne uygun paketleme malzemesi', 'Packing material suited to each item'),
        l('Kırılacak eşyalar için ayrı koruma', 'Extra protection for fragile items'),
        l('Kolilerin odalara göre etiketlenmesi', 'Boxes labelled by room'),
        l('Taşınmadan sonra açma desteği', 'Help unpacking after the move'),
      ],
      steps: [
        l('Paketlenecek eşyaları birlikte belirleriz.', 'We agree together on what is to be packed.'),
        l('Her eşya için uygun malzemeyi seçeriz.', 'We pick the right material for each item.'),
        l('Eşyalar paketlenir ve etiketlenir.', 'Items are packed and labelled.'),
      ],
    },
  },
  'kombi-klima': {
    'Kombi bakımı': {
      slug: 'kombi-bakimi',
      lead: l(
        'Kombinin düzenli bakımı, soğuk günlerde sürprizleri azaltmaya yardımcı olur. Cihazın genel kontrolünü ve temizliğini yapar, gördüklerimizi size anlatırız.',
        'Regular boiler maintenance helps reduce surprises on cold days. We check and clean the unit and explain what we find.',
      ),
      includes: [
        l('Cihazın genel kontrolü', 'A general check of the unit'),
        l('Temizlik ve bağlantı kontrolleri', 'Cleaning and connection checks'),
        l('Bulguların sizinle paylaşılması', 'Findings shared with you'),
      ],
      steps: [
        l('Randevu günü ve cihaz bilgisini paylaşırsınız.', 'You share a convenient day and details of the unit.'),
        l('Teknisyen cihazı yerinde kontrol eder ve temizler.', 'The technician checks and cleans the unit on site.'),
        l('Yapılan işi ve varsa öneriyi size anlatır.', 'They explain what was done and any recommendation.'),
      ],
    },
    'Klima montajı': {
      slug: 'klima-montaji',
      lead: l(
        'Klimanın yeri önce yerinde belirlenir; ardından montaj ve ilk çalıştırma yapılır. Kullanım hakkında kısa bir bilgilendirme ile iş tamamlanır.',
        'We choose the position on site first, then install and start the unit for the first time. The job ends with a short briefing on how to use it.',
      ),
      includes: [
        l('Yerleşim için yerinde değerlendirme', 'An on-site assessment of the position'),
        l('İç ve dış ünitenin montajı', 'Installation of the indoor and outdoor units'),
        l('İlk çalıştırma ve kontrol', 'First start-up and check'),
        l('Kullanım hakkında bilgilendirme', 'A briefing on how to use it'),
      ],
      steps: [
        l('Cihaz ve mekân bilgisini iletirsiniz.', 'You tell us about the unit and the space.'),
        l('Ünitenin yerini birlikte belirleriz.', 'We decide the position of the unit together.'),
        l('Montajı yapar ve ilk çalıştırmayı gerçekleştiririz.', 'We install it and run the first start-up.'),
        l('Kullanımı anlatır, işi birlikte kontrol ederiz.', 'We explain its use and check the work together.'),
      ],
    },
    'Petek temizliği': {
      slug: 'petek-temizligi',
      lead: l(
        'Isınmayan veya eşit ısınmayan peteklerde tesisat temizliği yapılır. İş öncesinde sistemi kontrol eder, ne yapılacağını size anlatırız.',
        'We flush the system when radiators do not heat or heat unevenly. We check it first and explain what will be done.',
      ),
      includes: [
        l('Petek ve tesisat kontrolü', 'A check of radiators and pipework'),
        l('Tesisat temizliği', 'System flushing'),
        l('İş sonrası ısınmanın kontrolü', 'A check of the heating afterwards'),
      ],
      steps: [
        l('Sorunu ve hangi odaların etkilendiğini anlatırsınız.', 'You tell us the problem and which rooms are affected.'),
        l('Teknisyen sistemi yerinde inceler.', 'The technician inspects the system on site.'),
        l('Temizliği yapar, sonucu birlikte kontrol ederiz.', 'We flush the system and check the result together.'),
      ],
    },
    'Klima bakımı': {
      slug: 'klima-bakimi',
      lead: l(
        'Filtre ve ünite temizliği ile genel kontrol yapılır. Sezon öncesi bakım, cihazın düzenli çalışmasına yardımcı olur.',
        'We clean the filters and units and run a general check. Maintenance before the season helps the unit keep running steadily.',
      ),
      includes: [
        l('Filtre temizliği', 'Filter cleaning'),
        l('İç ve dış ünite kontrolü', 'Indoor and outdoor unit check'),
        l('Gerekirse gaz kontrolü hakkında bilgilendirme', 'Advice on a refrigerant check if needed'),
      ],
      steps: [
        l('Cihaz sayısını ve uygun günü paylaşırsınız.', 'You share how many units and a convenient day.'),
        l('Teknisyen filtreleri ve üniteleri temizler.', 'The technician cleans filters and units.'),
        l('Genel kontrolü yapar, bulguları size anlatır.', 'They run the general check and explain the findings.'),
      ],
    },
  },
  insaat: {
    'Konut inşaatı': {
      slug: 'konut-insaati',
      lead: l(
        'Müstakil ev ve apartman projelerinde yapım işlerini baştan sona düzenli yönetiriz. Her aşamada neyin yapıldığını sizinle paylaşırız.',
        'We manage the build for houses and apartment projects from start to finish. We share what is being done at every stage.',
      ),
      includes: [
        l('İş programının hazırlanması', 'A work programme'),
        l('Yapım sürecinin düzenli yönetimi', 'Orderly management of the build'),
        l('Aşama aşama bilgilendirme', 'Updates at each stage'),
        l('Tamamlanan işin birlikte kontrolü', 'A joint check of completed work'),
      ],
      steps: [
        l('Projenizi ve beklentilerinizi dinleriz.', 'We listen to your project and expectations.'),
        l('Kapsamı ve iş programını yazılı olarak netleştiririz.', 'We settle scope and programme in writing.'),
        l('Yapımı programa göre yürütür, sizi bilgilendiririz.', 'We carry out the build to the programme and keep you informed.'),
        l('Tamamlanan işi birlikte kontrol ederek teslim ederiz.', 'We check the finished work together and hand over.'),
      ],
    },
    'Tadilat ve yenileme': {
      slug: 'tadilat-ve-yenileme',
      lead: l(
        'Daire, ofis ve dükkânlarda kapsamlı tadilat yaparız. Önce mevcut durumu yerinde görür, yapılacak işleri birlikte listeleriz.',
        'We carry out full renovations for flats, offices and shops. We see the current state on site first and list the work together.',
      ),
      includes: [
        l('Mevcut durumun yerinde incelenmesi', 'An on-site look at the current state'),
        l('Yapılacak işlerin yazılı listesi', 'A written list of the work'),
        l('Yıkım, uygulama ve ince işler', 'Demolition, works and finishing'),
        l('Çalışma alanının düzenli bırakılması', 'The work area left tidy'),
      ],
      steps: [
        l('Mekânı ve isteklerinizi paylaşırsınız.', 'You share the space and your wishes.'),
        l('Yerinde inceler, iş kalemlerini listeleriz.', 'We inspect it and list the work items.'),
        l('Teklif ve iş programı üzerinde anlaşırız.', 'We agree on a quote and programme.'),
        l('Uygular ve işi birlikte kontrol ederek teslim ederiz.', 'We carry out the work and hand over after a joint check.'),
      ],
    },
    'Kaba yapı': {
      slug: 'kaba-yapi',
      lead: l(
        'Temel, betonarme ve duvar işlerini projesine uygun şekilde yürütürüz. Yapının taşıyıcı kısmını düzenli bir iş programıyla ilerletiriz.',
        'We carry out foundations, reinforced concrete and masonry in line with the project. The structure moves forward on an orderly programme.',
      ),
      includes: [
        l('Temel ve betonarme işleri', 'Foundation and reinforced-concrete work'),
        l('Duvar işleri', 'Masonry work'),
        l('Projeye uygun uygulama', 'Work in line with the project'),
      ],
      steps: [
        l('Proje ve iş kapsamını birlikte gözden geçiririz.', 'We review the project and scope together.'),
        l('İş programını ve sırayı netleştiririz.', 'We settle the programme and the order of work.'),
        l('Kaba yapı işlerini programa göre yürütürüz.', 'We carry out the structural work to the programme.'),
      ],
    },
    'Keşif ve metraj': {
      slug: 'kesif-ve-metraj',
      lead: l(
        'Yerinde ölçüm yapar, iş kalemlerini ve miktarlarını çıkarırız. Bu liste, teklifin ve iş programının dayanağı olur.',
        'We measure on site and list the work items and quantities. That list becomes the basis for the quote and the programme.',
      ),
      includes: [
        l('Yerinde ölçüm', 'On-site measurement'),
        l('İş kalemlerinin ve miktarların listesi', 'A list of work items and quantities'),
        l('Teklife esas olacak yazılı döküm', 'A written breakdown to base the quote on'),
      ],
      steps: [
        l('Keşif isteğinizi iletirsiniz.', 'You send us a survey request.'),
        l('Alanı yerinde görür ve ölçeriz.', 'We see and measure the site in person.'),
        l('İş kalemlerini ve miktarları yazılı olarak size iletiriz.', 'We send you the work items and quantities in writing.'),
      ],
    },
  },
}

const HEADINGS = {
  about: l('Hizmet hakkında', 'About this service'),
  includes: l('Hizmete neler dahil', 'What the service includes'),
  steps: l('Nasıl çalışıyoruz', 'How we work'),
}

const EXAMPLE_NOTE = l('Bu sayfa kurgusal bir örnektir.', 'This page is a fictional example.')

export const LANDING_SERVICES_CTA = {
  title: l('Talebinizi iletin', 'Send your request'),
  text: l(
    'İhtiyacınızı kısaca yazın, size dönüş yapalım. Bu bir örnek demodur; telefon numarası örnektir.',
    'Tell us briefly what you need and we will get back to you. This is a sample demo; the phone number is a sample.',
  ),
  label: l('Talep gönder', 'Send a request'),
}

const bullets = (items: L[], lang: 'tr' | 'en') => items.map((item) => `- ${item[lang]}`).join('\n')

export function servicePageBlocks(page: LandingServicePage, lang: 'tr' | 'en') {
  return [
    { heading: HEADINGS.about[lang], level: 'h2' as const, body: `${page.lead[lang]} ${EXAMPLE_NOTE[lang]}` },
    { heading: HEADINGS.includes[lang], level: 'h2' as const, body: bullets(page.includes, lang) },
    { heading: HEADINGS.steps[lang], level: 'h2' as const, body: bullets(page.steps, lang) },
  ]
}
