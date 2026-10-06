import type { BlogCategory, BlogCategoryId, BlogPost } from './types'

/**
 * Blog source of truth.
 *
 * Static for now — see `types.ts` for why the shape mirrors a database row.
 * Adding an article means appending one object here; no route or component
 * changes are required, because `/blog` and `/blog/[slug]` are both driven by
 * these service functions.
 */

export const categories: BlogCategory[] = [
  { id: 'ai', label: { tr: 'Yapay Zeka', en: 'AI' } },
  { id: 'web-design', label: { tr: 'Web Tasarım', en: 'Web Design' } },
  { id: 'seo', label: { tr: 'SEO', en: 'SEO' } },
  { id: 'marketing', label: { tr: 'Dijital Pazarlama', en: 'Digital Marketing' } },
  { id: 'ecommerce', label: { tr: 'E-Ticaret', en: 'E-Commerce' } },
  { id: 'gloval', label: { tr: 'GLOVAL AI', en: 'GLOVAL AI' } },
  { id: 'guides', label: { tr: 'Rehberler', en: 'Guides' } },
]

const posts: BlogPost[] = [
  {
    slug: 'yapay-zeka-ile-web-sitesi-nasil-olusturulur',
    featured: true,
    category: 'ai',
    author: 'GLOVAL AI',
    publishedAt: '2026-07-28',
    updatedAt: '2026-07-28',
    title: {
      tr: 'Yapay Zeka ile Web Sitesi Nasıl Oluşturulur?',
      en: 'How to Build a Website with AI',
    },
    excerpt: {
      tr: 'Yapay zeka ile web sitesi kurmanın adımlarını, iyi bir istem yazmanın püf noktalarını ve yayına almadan önce kontrol etmeniz gerekenleri anlatıyoruz.',
      en: 'The steps for building a website with AI, how to write a good prompt, and what to check before you publish.',
    },
    seoTitle: {
      tr: 'Yapay Zeka ile Web Sitesi Nasıl Oluşturulur? Adım Adım Rehber',
      en: 'How to Build a Website with AI: A Step-by-Step Guide',
    },
    seoDescription: {
      tr: 'Yapay zeka ile web sitesi oluşturma adımları: doğru istem yazma, tasarımı düzenleme ve siteyi yayına alma. GLOVAL AI ile kod yazmadan başlayın.',
      en: 'Steps for building a website with AI: writing the right prompt, editing the design, and publishing. Get started with GLOVAL AI without writing code.',
    },
    keywords: {
      tr: ['yapay zeka web sitesi', 'ai ile web sitesi kurma', 'kod yazmadan web sitesi'],
      en: ['ai website builder', 'build website with ai', 'no code website'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'Yapay zeka ile web sitesi oluşturmak, klasik yöntemlere göre çok daha kısa bir başlangıç süresi sunar. Boş bir sayfayla ya da karmaşık bir tasarım aracıyla uğraşmak yerine, ne istediğinizi anlatarak üzerine çalışabileceğiniz bir taslakla başlarsınız.',
          en: 'Building a website with AI gives you a much shorter path to a starting point than traditional methods. Instead of facing an empty page or a complex design tool, you describe what you want and begin from a draft you can work on.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'İyi bir istem nasıl yazılır?', en: 'How to write a good prompt' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Sonucun kalitesi, verdiğiniz bilginin netliğiyle doğru orantılıdır. "Bana bir web sitesi yap" yerine işinizi, hedef kitlenizi ve sitede olmasını istediğiniz bölümleri belirtin.',
          en: 'The quality of the result is proportional to how clear your input is. Instead of "build me a website", describe your business, your audience, and the sections you want.',
        },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Sektörünüzü ve ne yaptığınızı yazın: "İstanbul’da diş kliniği".',
            'Hedefinizi belirtin: randevu almak, teklif toplamak veya ürün satmak.',
            'İstediğiniz bölümleri sayın: hizmetler, ekip, referanslar, iletişim.',
            'Tonu tarif edin: sade ve güven veren, ya da enerjik ve renkli.',
          ],
          en: [
            'Say what you do and where: "a dental clinic in Istanbul".',
            'State your goal: booking appointments, collecting quotes, or selling products.',
            'List the sections you want: services, team, testimonials, contact.',
            'Describe the tone: calm and trustworthy, or energetic and colorful.',
          ],
        },
      },
      {
        type: 'heading',
        text: { tr: 'Taslağı düzenleme', en: 'Editing the draft' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'İlk çıktı bir başlangıç noktasıdır, son hâli değil. Metinleri kendi diliniz ve gerçek bilgilerinizle güncelleyin. Özellikle iletişim bilgileri, fiyatlar ve hizmet açıklamaları gibi alanları mutlaka kendiniz kontrol edin.',
          en: 'The first output is a starting point, not a finished site. Update the copy with your own voice and real details. Contact information, prices, and service descriptions in particular are worth reviewing yourself.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Yayına almadan önce', en: 'Before you publish' },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Sayfayı mobil görünümde kontrol edin.',
            'Tüm bağlantıların doğru sayfalara gittiğinden emin olun.',
            'İletişim formunun size ulaştığını test edin.',
            'Sayfa başlığı ve açıklamasını arama motorları için düzenleyin.',
          ],
          en: [
            'Check the page on a mobile viewport.',
            'Make sure every link goes where it should.',
            'Test that the contact form actually reaches you.',
            'Edit the page title and description for search engines.',
          ],
        },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Yayına aldıktan sonra da site üzerinde çalışmaya devam edebilirsiniz. Değişiklikleri yeniden yayınlayabilir, gerekirse siteyi geçici olarak yayından kaldırabilirsiniz.',
          en: 'You can keep working on the site after publishing. You can republish changes, and take the site offline temporarily if you need to.',
        },
      },
    ],
  },
  {
    slug: 'kodlama-bilmeden-web-sitesi-yapilir-mi',
    featured: true,
    category: 'guides',
    author: 'GLOVAL AI',
    publishedAt: '2026-07-21',
    updatedAt: '2026-07-21',
    title: {
      tr: 'Kodlama Bilmeden Web Sitesi Yapılır mı?',
      en: 'Can You Build a Website Without Coding?',
    },
    excerpt: {
      tr: 'Kod yazmadan web sitesi kurmak artık mümkün. Bu yaklaşımın nerede işinizi kolaylaştırdığını, nerede sınırlarına geldiğini dürüstçe anlatıyoruz.',
      en: 'Building a website without code is possible today. Here is an honest look at where it helps and where it hits its limits.',
    },
    seoTitle: {
      tr: 'Kodlama Bilmeden Web Sitesi Yapılır mı? Gerçekçi Bir Bakış',
      en: 'Can You Build a Website Without Coding? A Realistic Look',
    },
    seoDescription: {
      tr: 'Kod yazmadan web sitesi kurmanın avantajları ve sınırları. Hangi durumlarda yeterli, hangi durumlarda geliştirici desteği gerekir?',
      en: 'The advantages and limits of building a website without code, and when you still need a developer.',
    },
    keywords: {
      tr: ['kodlama bilmeden web sitesi', 'kod yazmadan site kurma', 'no code'],
      en: ['website without coding', 'no code website builder', 'no code'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'Kısa cevap: evet. Bugün bir web sitesini tek satır kod yazmadan kurup yayına alabilirsiniz. Uzun cevap ise neye ihtiyacınız olduğuna bağlı.',
          en: 'The short answer is yes. You can set up and publish a website today without writing a single line of code. The longer answer depends on what you need.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Kod yazmadan neler yapılabilir?', en: 'What works without code' },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Kurumsal tanıtım siteleri ve hizmet sayfaları.',
            'Portföy ve referans sayfaları.',
            'Tek sayfalık tanıtım ve kampanya sayfaları.',
            'Ürün listeleme ve sepet akışı olan mağazalar.',
          ],
          en: [
            'Corporate sites and service pages.',
            'Portfolio and testimonial pages.',
            'Single-page landing and campaign pages.',
            'Stores with product listings and a cart flow.',
          ],
        },
      },
      {
        type: 'heading',
        text: { tr: 'Sınırlar nerede başlıyor?', en: 'Where the limits begin' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Kendi iş mantığınızı yürüten özel hesaplama araçları, başka sistemlerle derin entegrasyonlar veya çok özel bir arayüz davranışı gerektiren projelerde geliştirici desteğine ihtiyaç duyabilirsiniz. Bu bir eksiklik değil, doğru aracı seçme meselesidir.',
          en: 'Projects that need custom calculators running your own business logic, deep integrations with other systems, or very specific interface behavior may still need a developer. That is not a shortcoming — it is a question of choosing the right tool.',
        },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Çoğu küçük ve orta ölçekli işletme için ise kod yazmadan kurulan bir site, ihtiyacı fazlasıyla karşılar. Önemli olan sitenin teknik olarak ne kadar karmaşık olduğu değil, ziyaretçinin aradığını bulup sizinle iletişime geçebilmesidir.',
          en: 'For most small and mid-sized businesses, a site built without code covers the need well. What matters is not technical complexity but whether visitors find what they came for and can reach you.',
        },
      },
    ],
  },
  {
    slug: 'kucuk-isletmeler-icin-web-sitesi-neden-onemlidir',
    featured: true,
    category: 'marketing',
    author: 'GLOVAL AI',
    publishedAt: '2026-07-14',
    updatedAt: '2026-07-14',
    title: {
      tr: 'Küçük İşletmeler İçin Web Sitesi Neden Önemlidir?',
      en: 'Why Small Businesses Need a Website',
    },
    excerpt: {
      tr: 'Sosyal medya hesabı varken web sitesine neden ihtiyaç duyulur? Kendi alan adınızda bir siteye sahip olmanın somut faydalarına bakıyoruz.',
      en: 'Why have a website when you already have social media? A look at the concrete benefits of owning a site on your own domain.',
    },
    seoTitle: {
      tr: 'Küçük İşletmeler İçin Web Sitesi Neden Önemlidir?',
      en: 'Why a Website Matters for Small Businesses',
    },
    seoDescription: {
      tr: 'Küçük işletmeler için web sitesinin faydaları: güven, aramada bulunurluk, kendi alan adınıza sahip olmak ve müşteriye ulaşmak.',
      en: 'The benefits of a website for small businesses: trust, search visibility, owning your domain, and reaching customers.',
    },
    keywords: {
      tr: ['küçük işletme web sitesi', 'işletme için web sitesi', 'kurumsal site'],
      en: ['small business website', 'website for business', 'corporate site'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'Birçok işletme sosyal medya hesabının yeterli olduğunu düşünür. Sosyal medya erişim için değerlidir, ancak kendi alan adınızda bir siteye sahip olmak farklı bir şey sağlar: kontrol.',
          en: 'Many businesses assume a social media account is enough. Social media is valuable for reach, but a site on your own domain gives you something different: control.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Güven', en: 'Trust' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Bir müşteri sizi araştırdığında kendi alan adınızda düzenli bir site görmesi, ciddiyet göstergesi olarak algılanır. Adres, çalışma saatleri ve hizmet açıklamaları gibi bilgilerin tek bir yerde net durması karar vermeyi kolaylaştırır.',
          en: 'When a customer looks you up, finding a tidy site on your own domain reads as a sign of seriousness. Having your address, hours, and service descriptions clearly in one place makes deciding easier.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Aramada bulunurluk', en: 'Being found in search' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'İnsanlar bir hizmete ihtiyaç duyduğunda arama motorlarını kullanır. Kendi siteniz, hizmetlerinizi ve bulunduğunuz bölgeyi anlatan sayfalarla bu aramalarda görünme şansı yaratır. Sonuçlar rekabete göre değişir, ancak sitesi olmayan bir işletmenin bu şansı hiç olmaz.',
          en: 'People turn to search engines when they need a service. Your own site creates a chance to appear in those searches with pages describing your services and location. Results vary with competition, but a business without a site has no chance at all.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Sahiplik', en: 'Ownership' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Sosyal medya platformları kurallarını değiştirebilir, erişiminizi azaltabilir. Kendi alan adınız ve siteniz size aitir. Kurumsal e-posta adresi de aynı alan adı üzerinden çalıştığında iletişiminiz daha profesyonel görünür.',
          en: 'Social platforms can change their rules and reduce your reach. Your own domain and site belong to you. When your business email runs on that same domain, your communication looks more professional too.',
        },
      },
    ],
  },
  {
    slug: 'web-sitesi-seosu-nasil-yapilir',
    featured: false,
    category: 'seo',
    author: 'GLOVAL AI',
    publishedAt: '2026-07-07',
    updatedAt: '2026-07-07',
    title: {
      tr: 'Web Sitesi SEO’su Nasıl Yapılır?',
      en: 'How to Do SEO for Your Website',
    },
    excerpt: {
      tr: 'SEO’nun temellerini abartısız anlatıyoruz: sayfa başlıkları, içerik yapısı, teknik hijyen ve gerçekçi beklentiler.',
      en: 'SEO basics without the hype: page titles, content structure, technical hygiene, and realistic expectations.',
    },
    seoTitle: {
      tr: 'Web Sitesi SEO’su Nasıl Yapılır? Temel Rehber',
      en: 'How to Do Website SEO: A Practical Guide',
    },
    seoDescription: {
      tr: 'Web sitesi SEO’sunun temelleri: başlık ve açıklama etiketleri, içerik yapısı, mobil uyumluluk ve gerçekçi hedefler.',
      en: 'The fundamentals of website SEO: title and description tags, content structure, mobile friendliness, and realistic goals.',
    },
    keywords: {
      tr: ['seo nasıl yapılır', 'web sitesi seo', 'arama motoru optimizasyonu'],
      en: ['how to do seo', 'website seo', 'search engine optimization'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'SEO, sitenizin arama motorlarında daha iyi anlaşılmasını sağlama işidir. Sihirli bir kısayolu yoktur; temel işleri düzgün yapmak çoğu site için farkın büyük kısmını oluşturur.',
          en: 'SEO is the work of helping search engines understand your site better. There is no magic shortcut — for most sites, doing the basics properly accounts for most of the difference.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Başlık ve açıklama', en: 'Titles and descriptions' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Her sayfanın kendine özgü bir başlığı ve açıklaması olmalı. Başlıkta sayfanın gerçekten ne hakkında olduğunu yazın; aynı başlığı tüm sayfalarda tekrarlamak arama motorlarının sayfaları ayırt etmesini zorlaştırır.',
          en: 'Every page should have its own title and description. Say what the page is actually about; repeating one title across all pages makes it harder for search engines to tell them apart.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'İçerik yapısı', en: 'Content structure' },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Bir sayfada tek bir ana başlık kullanın, alt başlıklarla bölün.',
            'Ziyaretçinin sorduğu soruyu doğrudan yanıtlayan metinler yazın.',
            'Hizmet ve bölge bilgisini içerik içinde doğal biçimde geçirin.',
            'Görsellere açıklayıcı alt metni ekleyin.',
          ],
          en: [
            'Use one main heading per page and break it up with subheadings.',
            'Write copy that answers the question the visitor actually asked.',
            'Mention your service and area naturally within the content.',
            'Add descriptive alt text to images.',
          ],
        },
      },
      {
        type: 'heading',
        text: { tr: 'Gerçekçi beklenti', en: 'Realistic expectations' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'SEO sonuçları zaman alır ve rekabete bağlıdır. Belirli bir kelimede birinci sıra sözü veren yaklaşımlara mesafeli olun. Ölçülebilir hedef, doğru ziyaretçinin sitenizi bulup harekete geçmesidir.',
          en: 'SEO results take time and depend on competition. Be skeptical of anyone promising a number-one position for a given keyword. The measurable goal is the right visitors finding your site and taking action.',
        },
      },
    ],
  },
  {
    slug: 'alan-adi-nedir-ve-nasil-secilir',
    featured: false,
    category: 'guides',
    author: 'GLOVAL AI',
    publishedAt: '2026-06-30',
    updatedAt: '2026-06-30',
    title: {
      tr: 'Alan Adı Nedir ve Nasıl Seçilir?',
      en: 'What Is a Domain Name and How Do You Choose One?',
    },
    excerpt: {
      tr: 'Alan adı seçerken nelere dikkat etmeli, uzantı nasıl belirlenir ve DNS doğrulaması pratikte nasıl işler?',
      en: 'What to look for when choosing a domain, how to pick an extension, and how DNS verification works in practice.',
    },
    seoTitle: {
      tr: 'Alan Adı Nedir ve Nasıl Seçilir? Kapsamlı Rehber',
      en: 'What Is a Domain Name and How to Choose One',
    },
    seoDescription: {
      tr: 'Alan adı nedir, nasıl seçilir, hangi uzantı kullanılmalı ve DNS doğrulaması nasıl yapılır? Adım adım açıklıyoruz.',
      en: 'What a domain name is, how to choose one, which extension to use, and how DNS verification works.',
    },
    keywords: {
      tr: ['alan adı nedir', 'domain seçimi', 'dns doğrulama'],
      en: ['what is a domain name', 'choosing a domain', 'dns verification'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'Alan adı, ziyaretçilerin sitenize ulaşmak için tarayıcıya yazdığı adrestir. Markanızın internetteki karşılığı olduğu için acele seçilmemesi gereken bir karardır.',
          en: 'A domain name is the address visitors type to reach your site. It is your brand’s equivalent on the internet, so it is not a decision to rush.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Seçerken dikkat edilecekler', en: 'What to watch for' },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Kısa ve telefonda söylenebilir olsun.',
            'Yazım karışıklığı yaratan harf tekrarlarından kaçının.',
            'Türkçe karakter yerine sade latin harfleri tercih edin.',
            'Marka adınızla tutarlı olsun.',
          ],
          en: [
            'Keep it short and easy to say over the phone.',
            'Avoid repeated letters that invite typos.',
            'Prefer plain latin characters over special characters.',
            'Keep it consistent with your brand name.',
          ],
        },
      },
      {
        type: 'heading',
        text: { tr: 'Uzantı seçimi', en: 'Choosing an extension' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Ağırlıklı olarak Türkiye’ye hizmet veriyorsanız .com.tr veya .com yaygın tercihlerdir. Uluslararası bir hedefiniz varsa .com hâlâ en tanıdık uzantıdır. Sektöre özel uzantılar akılda kalıcı olabilir, ancak ziyaretçinin aşina olmadığı bir uzantı güven kaybına yol açabilir.',
          en: 'If you mainly serve one country, its local extension or .com are common choices. For an international audience, .com remains the most familiar. Industry-specific extensions can be memorable, but an unfamiliar one can cost you some trust.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'DNS doğrulaması', en: 'DNS verification' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Alan adınızı bir platforma bağladığınızda, alan adının gerçekten size ait olduğunu göstermek için birkaç DNS kaydı eklemeniz istenir. Bu kayıtları alan adı sağlayıcınızın panelinde tanımlarsınız. Kayıtların internete yayılması genellikle kısa sürer, ancak sağlayıcıya bağlı olarak biraz zaman alabilir.',
          en: 'When you connect a domain to a platform, you are asked to add a few DNS records to prove the domain is really yours. You create those records in your domain provider’s panel. Propagation is usually quick, though it can take a little time depending on the provider.',
        },
      },
    ],
  },
  {
    slug: 'e-ticaret-sitesi-nasil-kurulur',
    featured: false,
    category: 'ecommerce',
    author: 'GLOVAL AI',
    publishedAt: '2026-06-23',
    updatedAt: '2026-06-23',
    title: {
      tr: 'E-Ticaret Sitesi Nasıl Kurulur?',
      en: 'How to Set Up an E-Commerce Site',
    },
    excerpt: {
      tr: 'Ürün sayfalarından sepet akışına, ödeme ve yasal hazırlıklara kadar bir online mağaza açmanın adımlarını sıralıyoruz.',
      en: 'The steps to opening an online store, from product pages and cart flow to payments and legal preparation.',
    },
    seoTitle: {
      tr: 'E-Ticaret Sitesi Nasıl Kurulur? Başlangıç Rehberi',
      en: 'How to Set Up an E-Commerce Site: A Starter Guide',
    },
    seoDescription: {
      tr: 'E-ticaret sitesi kurma adımları: ürün yapısı, ürün sayfaları, sepet akışı, ödeme altyapısı ve yasal gereklilikler.',
      en: 'Steps for setting up an e-commerce site: product structure, product pages, cart flow, payments, and legal requirements.',
    },
    keywords: {
      tr: ['e-ticaret sitesi kurma', 'online mağaza açma', 'ürün satışı'],
      en: ['set up ecommerce site', 'open online store', 'sell products online'],
    },
    body: [
      {
        type: 'paragraph',
        text: {
          tr: 'Online mağaza açmak, tanıtım sitesi kurmaktan biraz daha fazla hazırlık gerektirir. Teknik kısım kadar ürün bilgileriniz ve operasyonunuz da hazır olmalıdır.',
          en: 'Opening an online store takes a bit more preparation than a brochure site. Your product data and operations need to be as ready as the technical side.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Ürün yapınızı hazırlayın', en: 'Prepare your product structure' },
      },
      {
        type: 'list',
        items: {
          tr: [
            'Her ürün için net bir isim ve açıklama yazın.',
            'Fiyat ve varsa varyant bilgilerini netleştirin.',
            'Ürün görsellerini benzer oranlarda hazırlayın.',
            'Kategorilerinizi ziyaretçinin arayacağı şekilde adlandırın.',
          ],
          en: [
            'Write a clear name and description for every product.',
            'Settle prices and any variant details.',
            'Prepare product images at consistent proportions.',
            'Name categories the way visitors would search for them.',
          ],
        },
      },
      {
        type: 'heading',
        text: { tr: 'Satın alma akışı', en: 'The purchase flow' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Ziyaretçinin ürünü bulmasından siparişi tamamlamasına kadar geçen yolu mümkün olduğunca kısa tutun. Ürün listesi, ürün detayı, sepet ve ödeme adımlarının her birinde ne olacağı ziyaretçi için tahmin edilebilir olmalı.',
          en: 'Keep the path from finding a product to completing an order as short as possible. At each step — listing, product detail, cart, checkout — what happens next should be predictable for the visitor.',
        },
      },
      {
        type: 'heading',
        text: { tr: 'Ödeme ve yasal hazırlık', en: 'Payments and legal preparation' },
      },
      {
        type: 'paragraph',
        text: {
          tr: 'Ödeme altyapısı, mesafeli satış sözleşmesi, iade koşulları ve gizlilik politikası gibi konular ülkenizin mevzuatına göre değişir. Mağazanızı yayına almadan önce bu gereklilikleri kendi ülkenizdeki güncel kurallara göre kontrol etmenizi öneririz.',
          en: 'Payment infrastructure, distance selling terms, return conditions, and privacy policies vary by jurisdiction. We recommend checking these requirements against the current rules in your own country before you launch.',
        },
      },
    ],
  },
]

/** All posts, newest first. */
export function getPosts(): BlogPost[] {
  return [...posts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))
}

/** The curated subset shown on the homepage. */
export function getFeaturedPosts(limit = 3): BlogPost[] {
  return getPosts()
    .filter((post) => post.featured)
    .slice(0, limit)
}

export function getPost(slug: string): BlogPost | null {
  return posts.find((post) => post.slug === slug) ?? null
}

/**
 * Related posts for a detail page: same category first, then newest others as
 * filler so the section is never empty for a single-post category.
 */
export function getRelatedPosts(slug: string, limit = 3): BlogPost[] {
  const current = getPost(slug)
  if (!current) return []
  const others = getPosts().filter((post) => post.slug !== slug)
  const sameCategory = others.filter((post) => post.category === current.category)
  const rest = others.filter((post) => post.category !== current.category)
  return [...sameCategory, ...rest].slice(0, limit)
}

export function getCategory(id: BlogCategoryId): BlogCategory | null {
  return categories.find((category) => category.id === id) ?? null
}

/** Categories that actually have at least one post, for filter UI. */
export function getUsedCategories(): BlogCategory[] {
  const used = new Set(posts.map((post) => post.category))
  return categories.filter((category) => used.has(category.id))
}
