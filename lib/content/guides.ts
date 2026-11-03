export type GuideLocale = 'tr' | 'en'

export type GuideCategoryId = 'getting-started' | 'site-management'

export type GuideStep = {
  title: string
  description: string
}

export type GuideSection = {
  heading: string
  paragraphs: string[]
  steps?: GuideStep[]
}

export type GuideContent = {
  title: string
  description: string
  sections: GuideSection[]
}

export type Guide = {
  slug: string
  category: GuideCategoryId
  content: Record<GuideLocale, GuideContent>
}

export const GUIDE_CATEGORY_ORDER: GuideCategoryId[] = ['getting-started', 'site-management']

export const GUIDE_CATEGORY_LABELS: Record<GuideLocale, Record<GuideCategoryId, string>> = {
  tr: {
    'getting-started': 'Başlarken',
    'site-management': 'Site yönetimi',
  },
  en: {
    'getting-started': 'Getting started',
    'site-management': 'Managing your site',
  },
}

export const HELP_CENTER_COPY = {
  tr: {
    title: 'Yardım Merkezi',
    subtitle: 'GLOVAL AI ile ilgili yanıtları ve adım adım rehberleri burada bulabilirsin.',
    tabsLabel: 'Yardım Merkezi bölümleri',
    tabs: {
      faq: 'Sık Sorulanlar',
      guides: 'Rehber',
      blog: 'Blog',
    },
  },
  en: {
    title: 'Help Center',
    subtitle: 'Find answers and practical, step-by-step guides for using GLOVAL AI.',
    tabsLabel: 'Help center sections',
    tabs: {
      faq: 'FAQs',
      guides: 'Guides',
      blog: 'Blog',
    },
  },
} as const

export const GUIDE_PAGE_COPY = {
  tr: {
    indexTitle: 'Rehberler',
    indexDescription: 'İlk siteni oluşturmaktan yayına almaya kadar ihtiyacın olan adımları keşfet.',
    breadcrumbHome: 'Ana sayfa',
    breadcrumbHelp: 'Yardım Merkezi',
    breadcrumbGuides: 'Rehberler',
    mobileMenuLabel: 'Rehber bölümleri',
    previous: 'Önceki rehber',
    next: 'Sonraki rehber',
    ctaTitle: 'İlk siteni oluşturmaya hazır mısın?',
    ctaDescription: 'Ücretsiz hesap açıp işin için bir web sitesi taslağı hazırlamaya başla.',
    ctaButton: 'Ücretsiz başla',
  },
  en: {
    indexTitle: 'Guides',
    indexDescription: 'Explore the steps you need, from creating your first site to publishing it.',
    breadcrumbHome: 'Home',
    breadcrumbHelp: 'Help Center',
    breadcrumbGuides: 'Guides',
    mobileMenuLabel: 'Guide sections',
    previous: 'Previous guide',
    next: 'Next guide',
    ctaTitle: 'Ready to create your first site?',
    ctaDescription: 'Create a free account and start a website draft for your business.',
    ctaButton: 'Start free',
  },
} as const

export const GUIDES: Guide[] = [
  {
    slug: 'gloval-ai-nedir',
    category: 'getting-started',
    content: {
      tr: {
        title: 'GLOVAL AI nedir?',
        description: 'GLOVAL AI, işletme web siteleri ve çevrim içi mağazalar oluşturup yayımlamana yardımcı olan bir platformdur.',
        sections: [
          {
            heading: 'Fikrinden çalışan bir siteye',
            paragraphs: [
              'İşini, sunduğun hizmetleri veya satmak istediğin ürünleri anlat; sistem bu bilgilere göre bir web sitesi taslağı hazırlar. Taslağı önizleyebilir, metinleri, görselleri ve sayfaları düzenleyebilirsin.',
              'Mağaza kuruyorsan ürün detay sayfaları ve sepet akışı ekleyebilirsin. Hazır olduğunda siteni yayımlarsın; ziyaretçilerin açıp kullanabileceği gerçek bir web sitesi elde edersin.',
            ],
          },
          {
            heading: 'Siten senin',
            paragraphs: [
              'Ücretsiz planla başlayabilir; alan adı ve ek özelliklerin hangi planlarda bulunduğunu fiyatlar sayfasından karşılaştırabilirsin. İhtiyacına göre siteyi tanıtım, hizmet veya ürün satışı için düzenle.',
              'Siten ve içeriğin sana aittir. GLOVAL AI, fikirden yayına giden işleri tek yerde toplar; teknik kurulum ayrıntılarıyla uğraşmadan işletmeni çevrim içi tanıtman veya ürünlerini satışa sunman için bir başlangıç noktası sağlar.',
            ],
          },
        ],
      },
      en: {
        title: 'What is GLOVAL AI?',
        description: 'GLOVAL AI helps you create and publish business websites and online stores.',
        sections: [
          {
            heading: 'From an idea to a working site',
            paragraphs: [
              'Describe your business, services, or products, and GLOVAL AI uses that information to prepare a website draft. Preview it, then update its text, images, and pages to fit your needs.',
              'If you are building a store, you can add product detail pages and a cart flow. When the site is ready, publish it as a real website that visitors can open and use.',
            ],
          },
          {
            heading: 'Your site belongs to you',
            paragraphs: [
              'You can start with the free plan and compare the pricing page to see which plans include domain connection and additional features. Shape the site around your business, services, or products.',
              'Your website and its content belong to you. GLOVAL AI brings the work from idea to publishing into one place, giving you a starting point to present your business online or offer products without handling technical setup.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'kimler-icin',
    category: 'getting-started',
    content: {
      tr: {
        title: 'GLOVAL AI kimler için?',
        description: 'GLOVAL AI, işletmesini çevrim içi anlatmak isteyen kişiler ve işletmeler için web sitesi kurmayı kolaylaştırır.',
        sections: [
          {
            heading: 'İşini çevrim içi anlatmak isteyenler',
            paragraphs: [
              'Bir hizmet sunuyor, ürün satıyor ya da çalışmalarını sergilemek istiyorsan, ihtiyacına uygun bir site taslağı hazırlayabilirsin. Yerel işletmeler, danışmanlar, üreticiler ve bağımsız çalışanlar; işlerini ve müşterilerinin bilmesi gerekenleri kendi cümleleriyle anlatarak başlayabilir.',
              'Önceden hazırlanmış teknik bir dosya gerekmez. Ne sunduğunu, kimlere hitap ettiğini ve ziyaretçilerin hangi adımı atmasını istediğini yazman yeterlidir. Taslağı gördükten sonra sayfa metinlerini, görselleri ve bölümleri ihtiyacına göre değiştirebilirsin.',
            ],
          },
          {
            heading: 'Kontrol sende',
            paragraphs: [
              'Siten ve içeriğin sana aittir. Yayınlamadan önce önizleme yapabilir, yayından sonra da değişikliklerini sürdürebilirsin. Ücretli aboneliğini istediğin zaman iptal edebilirsin.',
              'Ücretsiz seçenekle başlayabilir, alan adı ve kurumsal e-posta gibi özellikleri planlara göre karşılaştırabilirsin. GLOVAL Ads, GLOVAL Maker ve GLOVAL Partner ise yakında.',
            ],
          },
        ],
      },
      en: {
        title: 'Who is GLOVAL AI for?',
        description: 'GLOVAL AI makes it easier for people and businesses to build a website that explains what they do.',
        sections: [
          {
            heading: 'For businesses ready to go online',
            paragraphs: [
              'If you offer a service, sell products, or want to showcase your work, you can create a website draft that fits your needs. Local businesses, consultants, makers, and independent professionals can begin by describing their work and what visitors should know.',
              'You do not need a technical document to get started. Explain what you offer, who you serve, and what visitors should do next. After you see the draft, you can adjust its page text, images, and sections to suit your business.',
            ],
          },
          {
            heading: 'You stay in control',
            paragraphs: [
              'Your website and its content belong to you. Preview the site before publishing, and keep making changes after it is live. You can cancel a paid subscription at any time.',
              'Start with the free option and compare plans for features such as domain connection and business email. GLOVAL Ads, GLOVAL Maker, and GLOVAL Partner are coming soon.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'nasil-calisir',
    category: 'getting-started',
    content: {
      tr: {
        title: 'GLOVAL AI nasıl çalışır?',
        description: 'GLOVAL AI ile site oluşturma süreci, fikrini anlatmaktan yayına almaya uzanan dört anlaşılır adımdan oluşur.',
        sections: [
          {
            heading: 'Dört adımda site kur',
            paragraphs: [],
            steps: [
              {
                title: 'İşini anlat',
                description: 'Başlangıç alanına işletmeni, sunduğun hizmetleri veya ürünlerini yaz. Ziyaretçilerinin sitede ne bulmasını ve nasıl iletişim kurmasını istediğini de belirt.',
              },
              {
                title: 'Önizlemeyi incele',
                description: 'Hazırlanan sayfa ve içeriklere göz at. Genel yapının işini doğru anlattığını kontrol et; eksik gördüğün noktaları not al.',
              },
              {
                title: 'Düzenle',
                description: 'Metin, görsel ve bölümlerde istediğin değişiklikleri yap. Yayınlamadan önce sayfaların telefon ekranında nasıl göründüğünü de kontrol et.',
              },
              {
                title: 'Yayımla',
                description: 'Hazır olduğunda siteyi yayımla. Ücretsiz adresle başlayabilir, planında yer alıyorsa kendi alan adını bağlayabilirsin.',
              },
            ],
          },
          {
            heading: 'Sonradan da güncelleyebilirsin',
            paragraphs: [
              'Bu adımlar tek seferlik değildir: yayına çıktıktan sonra da içerik üzerinde çalışıp güncellemelerini yeniden yayımlayabilirsin. İlk taslağı dakikalar içinde görebilirsin; başlamak için teknik hazırlık yapman gerekmez.',
            ],
          },
        ],
      },
      en: {
        title: 'How does GLOVAL AI work?',
        description: 'Building a site with GLOVAL AI follows four clear steps, from describing your idea to publishing it.',
        sections: [
          {
            heading: 'Build a site in four steps',
            paragraphs: [],
            steps: [
              {
                title: 'Describe your business',
                description: 'Use the starting area to explain your business, services, or products. Include what visitors should find on the site and how they can contact you.',
              },
              {
                title: 'Review the preview',
                description: 'Look through the prepared pages and content. Check that the overall structure describes your work, and note anything that needs to change.',
              },
              {
                title: 'Make edits',
                description: 'Update the text, images, and sections as needed. Before publishing, check how the pages look on a phone screen too.',
              },
              {
                title: 'Publish',
                description: 'Publish when the site is ready. You can start with a GLOVAL address and connect your own domain if it is included in your plan.',
              },
            ],
          },
          {
            heading: 'Keep it up to date',
            paragraphs: [
              'The process does not end at publishing: you can return to the site, make changes, and publish the updated version. Your first draft can be ready in minutes, with no technical preparation required to begin.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'ilk-sitemi-olusturmak',
    category: 'getting-started',
    content: {
      tr: {
        title: 'İlk web sitemi nasıl oluştururum?',
        description: 'İlk site taslağını oluşturmak için iş bilgilerin ve nasıl görünmesini istediğine dair kısa bir açıklama yeterlidir.',
        sections: [
          {
            heading: 'Hesabını aç ve işini anlat',
            paragraphs: [
              'Başlamak için Ücretsiz başla bağlantısından mevcut kayıt sayfasına git. Hesabını oluşturduktan sonra yeni site oluşturma adımını izle; işletmenin adını, ne sunduğunu ve kimlere ulaştığını kendi cümlelerinle yaz.',
              'İş bilgilerini sade ve net tut: hizmetlerini, çalışma bölgeni, iletişim yöntemini ve ziyaretçinin atmasını istediğin adımı belirt. Özel bir format hazırlamana gerek yok; anlaşılır bir açıklama ilk taslağı gözden geçirmeyi kolaylaştırır.',
            ],
          },
          {
            heading: 'Taslağı gözden geçir',
            paragraphs: [
              'Oluşan siteyi sayfa sayfa önizle. İşletme bilgilerini, başlıkları, görselleri ve bağlantıları kontrol et; eksik ya da yanlış gördüğün yerleri düzenle.',
              'Yayınlamadan önce özellikle telefon ekranını ve iletişim bilgilerini kontrol et. Hazır olduğunda siteni yayımla; daha sonra içeriğe geri dönüp güncelleyebilirsin.',
            ],
          },
        ],
      },
      en: {
        title: 'How do I create my first website?',
        description: 'A few details about your business and a short description of the site you want are enough to start a draft.',
        sections: [
          {
            heading: 'Create an account and describe your work',
            paragraphs: [
              'Select Start free to open the existing sign-up page. After creating your account, follow the new-site flow and describe your business name, what you offer, and who you serve in your own words.',
              'Keep the details clear: include your services, service area, contact method, and what you want visitors to do. You do not need a special format; a straightforward description makes the first draft easier to review.',
            ],
          },
          {
            heading: 'Review the draft',
            paragraphs: [
              'Preview the site page by page. Check the business details, headings, images, and links, then edit anything that is missing or incorrect.',
              'Before publishing, check the phone layout and make sure your contact information is right. When the site is ready, publish it; you can return to the content and update it later.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'alan-adi-ve-kurumsal-e-posta',
    category: 'site-management',
    content: {
      tr: {
        title: 'Alan adı ve kurumsal e-posta nasıl bağlanır?',
        description: 'Kendi alan adını ve kurumsal e-posta adreslerini GLOVAL AI yönetim panelinden ayarlayabilirsin.',
        sections: [
          {
            heading: 'Alan adını bağlama',
            paragraphs: [
              'Alan adı bağlama ve kurumsal e-posta ücretli planlarda sunulur. Planında bu özellik varsa yönetim panelindeki alan adı bölümünden alan adını ekle. GLOVAL AI, alan adı sağlayıcında tanımlaman gereken DNS kayıtlarını gösterir.',
              'Kayıtları sağlayıcının paneline ekledikten sonra doğrulama tamamlanana kadar bekle. Alan adı hazır olduğunda siteni bu adreste açabilirsin. DNS kayıtlarını eklerken panelde gösterilen talimatları izle.',
            ],
          },
          {
            heading: 'Kurumsal e-posta adresleri',
            paragraphs: [
              'Alan adı doğrulandıktan sonra, planının izin verdiği sayıda kurumsal e-posta adresi oluşturabilirsin. Yönetim paneli, adresleri ekleyip yönetmen için gereken adımları gösterir.',
              'İzin verilen adres sayısını ve özellik kapsamını plan ayrıntılarından kontrol et. E-posta ayarlarını yapmadan önce güncel plan koşullarını incele. Böylece site adresini ve işletme iletişiminde kullandığın e-postaları markanla uyumlu biçimde yönetebilirsin.',
            ],
          },
        ],
      },
      en: {
        title: 'How do I connect a domain and business email?',
        description: 'Set up your own domain and business email addresses from the GLOVAL AI dashboard.',
        sections: [
          {
            heading: 'Connect a domain',
            paragraphs: [
              'Domain connection and business email are available on paid plans. If your plan includes them, add your domain from the domain area in the dashboard. GLOVAL AI shows the DNS records you need to add at your domain provider.',
              'After adding those records in your provider account, wait for verification to finish. Once the domain is ready, your site can open at that address. Follow the instructions shown in the dashboard when adding DNS records.',
            ],
          },
          {
            heading: 'Business email addresses',
            paragraphs: [
              'After your domain is verified, you can create the number of business email addresses your plan allows. The dashboard shows the steps for adding and managing those addresses.',
              'Check your plan details for the address limit and included features. This lets you manage your website address and the email used to contact customers in a way that matches your business.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'e-ticaret-sitesi-acmak',
    category: 'site-management',
    content: {
      tr: {
        title: 'E-ticaret sitesi nasıl açılır?',
        description: 'Ürünlerini sergilemek, sepet akışı oluşturmak ve siparişleri takip etmek için mağaza özelliklerini kullan.',
        sections: [
          {
            heading: 'Mağaza içeriğini düzenle',
            paragraphs: [
              'Ürün satmak istiyorsan mağaza yapısını kullanarak ürünlerini ekleyebilir, ürün detay sayfalarını ve sepet akışını oluşturabilirsin. Ürün adlarını, açıklamalarını, fiyatlarını ve görsellerini yayına almadan önce kontrol et; ziyaretçiler sipariş vermeden önce bu bilgileri görür.',
              'Mağazan hazır olduğunda siparişleri yönetim ekranından takip edebilirsin. Ürün, gönderim ve iade koşullarını işinin gerçek işleyişine göre düzenle; sitendeki bilgiler güncel ve anlaşılır olsun.',
            ],
          },
          {
            heading: 'Ödeme yöntemini seç',
            paragraphs: [
              'Kart ödemeleri için E-TİCARET planında mağaza sahibinin kendi iyzico hesabı bağlanır. Mağaza ayarlarında banka havalesi gibi desteklenen diğer ödeme yöntemlerini isteğe bağlı açabilir veya kapatabilirsin.',
              'Kart kabul etmeden önce iyzico hesabının kurulması ve bağlanması gerekir. Ödeme ve yasal gereklilikler ülkeye göre değişebilir; mağazanı yayına almadan önce kendi ülken için geçerli koşulları kontrol et.',
            ],
          },
        ],
      },
      en: {
        title: 'How do I open an online store?',
        description: 'Use the store features to show products, create a cart flow, and keep track of orders.',
        sections: [
          {
            heading: 'Set up your store content',
            paragraphs: [
              'If you want to sell products, add them to your store and create product detail pages and a cart flow. Review product names, descriptions, prices, and images before publishing so visitors can see accurate details before ordering.',
              'Once your store is ready, you can follow orders in the management area. Set product, shipping, and return information to match how your business actually works, and keep the details on your site clear and current.',
            ],
          },
          {
            heading: 'Choose payment methods',
            paragraphs: [
              'For card payments, the E-COMMERCE plan connects to the store owner’s own iyzico account. You can also enable or disable other supported methods, such as bank transfer, in the store settings.',
              'Your iyzico account must be set up and connected before you accept cards. Payment and legal requirements vary by country, so check the rules that apply to your business before publishing the store.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'siteyi-yayinlama-ve-duzenleme',
    category: 'site-management',
    content: {
      tr: {
        title: 'Sitemi nasıl yayımlar ve düzenlerim?',
        description: 'Yayından önce siteni kontrol et, yayımla ve ihtiyaç duydukça içeriğini güncelle.',
        sections: [
          {
            heading: 'Yayına çıkma',
            paragraphs: [
              'Önizlemede sayfaları kontrol et, iletişim bilgilerini ve bağlantıları doğrula. Her şey hazır olduğunda paneldeki yayımlama adımını tamamla. Ücretsiz yayında siten bir GLOVAL alt alan adında açılır; kendi alan adını bağlama ücretli planlarda sunulur.',
              'Kendi alan adın varsa panelden ekleyip gösterilen DNS kayıtlarını tanımla. Doğrulama tamamlandığında siteni bu adreste kullanabilirsin. Alan adı ayarlarında gösterilen adımları sırayla izle.',
            ],
          },
          {
            heading: 'Yayından sonra güncelle',
            paragraphs: [
              'Yayımlamak son düzenleme fırsatı değildir. Editöre geri dönüp metin, görsel, bağlantı ya da bölümleri değiştirebilirsin. Değişiklikleri kontrol ettikten sonra güncel sürümü yeniden yayımla.',
              'Bir paylaşım bağlantısı kullanıyorsan sayfa güncellendikten sonra aynı bağlantıyı açarak son görünümü kontrol et. Siten ve içeriğin sana aittir; hangi bilgilerin herkese açık olacağını sen belirlersin.',
            ],
          },
        ],
      },
      en: {
        title: 'How do I publish and edit my site?',
        description: 'Review your site before publishing, then update its content whenever your business needs change.',
        sections: [
          {
            heading: 'Publish your site',
            paragraphs: [
              'Review each page in the preview and check your contact details and links. When everything is ready, complete the publishing step in the dashboard. A free site opens at a GLOVAL subdomain; connecting your own domain is available on paid plans.',
              'If you have your own domain, add it in the dashboard and set the DNS records shown there. After verification is complete, your site can use that address. Follow the steps in the domain settings in order.',
            ],
          },
          {
            heading: 'Make changes after publishing',
            paragraphs: [
              'Publishing is not the last chance to edit. Return to the editor to update text, images, links, or sections, then review and publish the current version again.',
              'If you share a link, open that same address after an update to check the latest version. Your website and its content belong to you, and you choose which information is public.',
            ],
          },
        ],
      },
    },
  },
  {
    slug: 'ai-kredileri',
    category: 'site-management',
    content: {
      tr: {
        title: 'AI kredisi (AI işlemi) nedir?',
        description: 'Kredi, GLOVAL AI içindeki yapay zekâ işlemlerinin kullanım birimidir; her işlem aynı miktarda kredi harcamaz.',
        sections: [
          {
            heading: 'Krediler nasıl kullanılır?',
            paragraphs: [
              'Metin düzenleme, görsel oluşturma veya ürün içeriği hazırlama gibi yapay zekâ işlemleri farklı miktarlarda kredi kullanabilir. İşlem başlatmadan önce ekranda gösterilen maliyeti kontrol et. Kredi, para bakiyesi değildir; yalnızca yapay zekâ özelliklerinin kullanımını sayar.',
              'Ücretsiz plan 50 AI işlemi tek seferlik verir; bu miktar her ay yenilenmez. Planların kredi miktarı ve kullanım dönemi farklı olabilir. Güncel plan ayrıntılarını fiyatlandırma sayfasında karşılaştır.',
            ],
          },
          {
            heading: 'Ek işlem paketleri',
            paragraphs: [
              'İhtiyacın olursa 50, 100 veya 250 AI işlemlik ek paketlerden birini satın alabilirsin. Bunlar tek seferlik paketlerdir; seçenekleri abonelikler bölümünden veya ek işlemler ekranından görebilirsin.',
              'Bir paket seçmeden önce hangi özelliklerin kredi kullandığını ve gösterilen miktarı oku. Böylece çalışmana yetecek paketi seçebilir, mevcut plan ve paket bilgilerini panelden karşılaştırabilirsin.',
            ],
          },
        ],
      },
      en: {
        title: 'What are AI credits (AI actions)?',
        description: 'Credits measure the use of AI features in GLOVAL AI, and different actions can use different amounts.',
        sections: [
          {
            heading: 'How credits are used',
            paragraphs: [
              'AI features such as editing text, creating images, or preparing product content can use different amounts of credits. Check the cost shown on screen before starting an action. Credits are not a cash balance; they only measure the use of AI features.',
              'The free plan includes 50 AI actions as a one-time amount; it does not renew each month. Plan allowances and usage periods can differ, so compare the current plan details on the pricing page.',
            ],
          },
          {
            heading: 'Additional action packs',
            paragraphs: [
              'If you need more, you can buy an additional pack of 50, 100, or 250 AI actions. These are one-time packs; you can review the options in the subscriptions area or on the additional actions screen.',
              'Before choosing a pack, check which features use credits and the amount shown for each action. This helps you select a pack for your work and compare it with the plan details in your account.',
            ],
          },
        ],
      },
    },
  },
]

export function getGuideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug)
}

export function localizedGuideHref(path: string, locale: GuideLocale): string {
  return `${path}${locale === 'en' ? '?lang=en' : ''}`
}

export function guideHref(slug: string, locale: GuideLocale): string {
  return localizedGuideHref(`/sss/rehber/${slug}`, locale)
}

export function guideBodyText(content: GuideContent): string {
  return [
    content.description,
    ...content.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.steps ?? []).flatMap((step) => [step.title, step.description]),
    ]),
  ].join('\n\n')
}

export function countGuideWords(content: GuideContent): number {
  return guideBodyText(content).trim().split(/\s+/u).filter(Boolean).length
}
