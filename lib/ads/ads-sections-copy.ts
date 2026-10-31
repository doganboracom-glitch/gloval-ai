const tr = {
  how: {
    title: 'Nasıl çalışır?',
    intro: 'Web sitenden başlayıp, kontrolü sende kalan bir arama reklamı taslağına ilerle.',
    steps: [
      {
        title: 'Adresini yaz',
        body: 'Web sitenin herkese açık adresini gir.',
        badge: '',
      },
      {
        title: 'Siteni okuyup plan çıkarırız',
        body: 'Sitenin herkese açık içeriğini tarayıp reklam kampanyası için bir plan taslağı hazırlarız.',
        badge: '',
      },
      {
        title: 'Önizlemeyi incele',
        body: 'Google arama reklamı görünümünü, önerilen anahtar kelimeleri ve bütçeyi kontrol et.',
        badge: '',
      },
      {
        title: 'Hesabını bağla, onayla ve yayınla',
        body: 'Google Ads hesabı bağlantısı ve onaylı yayınlama akışı hazırlandığında açılacak.',
        badge: 'Yakında',
      },
    ],
  },
  preview: {
    title: 'Google arama reklamı örneği',
    intro: 'Bu temsili kart, hazırlanabilecek bir arama reklamının görünümünü gösterir.',
    sampleLabel: 'Örnek',
    searchQuery: 'hizmet seçenekleri',
    sponsoredLabel: 'Sponsorlu',
    displayUrl: 'ornek-isletme.test › hizmetler',
    headline: 'Uzman desteği ve hizmetler | Bilgi alın',
    description: 'İhtiyacınıza uygun hizmetleri keşfedin. Seçenekler hakkında bilgi alın ve size uygun çözümü bulun.',
    sitelinkServices: 'Hizmetleri incele',
    sitelinkContact: 'İletişim seçenekleri',
    disclaimer: 'Gerçek bir marka kullanılmamıştır. Bu bir örnek tasarımdır; reklam yayınlanmış değildir.',
  },
  credits: {
    title: 'Kredi kullanımı',
    intro: 'Tarama ve plan önizlemesinde günlük ücretsiz haklar önce kullanılır. Diğer işlemler açıldığında krediyle çalışır.',
    actionHeader: 'İşlem',
    costHeader: 'Kredi',
    statusHeader: 'Durum',
    scanTitle: 'Site taraması + plan önizlemesi',
    signedInQuota: 'Giriş yapan hesap • günlük ücretsiz hak',
    guestQuota: 'Misafir • günlük ücretsiz hak',
    afterFreeQuota: 'Ücretsiz haklar bitince tarama başına',
    imageTitle: 'Reklam görseli üretimi',
    publishTitle: 'Kampanya yayınlama',
    reviseTitle: 'Kampanyayı yeniden düzenleme',
    weeklyOptimizationTitle: 'Haftalık optimizasyon',
    assistantTitle: 'Reklam asistanına soru',
    availableNow: 'Kullanıma açık',
    comingSoon: 'Yakında',
    creditUnit: 'kredi',
    balanceNote: 'Krediler mevcut AI kredi bakiyenle aynıdır.',
    billingLink: 'Kredi al',
  },
  faq: {
    title: 'Sık sorulan sorular',
    items: [
      {
        question: 'Ücretli mi?',
        answer: 'Günlük ücretsiz tarama hakları vardır. Haklar bittikten sonraki tarama ve plan önizlemesi kredi tablosundaki güncel tutarı kullanır; Google Ads reklam bütçesi bu kredilerden ayrıdır.',
      },
      {
        question: 'Reklam bütçesini kime öderim?',
        answer: 'Reklam harcaması doğrudan Google tarafından tahsil edilir. GLOVAL reklam bütçeni almaz veya yönetmez.',
      },
      {
        question: 'Sitem GLOVAL ile yapılmadıysa kullanabilir miyim?',
        answer: 'Evet. Herkese açık web sitenin adresini girmen yeterlidir.',
      },
      {
        question: 'Hangi platformlar var?',
        answer: 'Kanallar sırayla açılacak; ilk sırada Google Ads. Diğer platformlar hazır oldukça kullanıma açılacak.',
      },
      {
        question: 'Verilerim nasıl kullanılır?',
        answer: 'Girdiğin web adresinin herkese açık içerikleri tarama ve reklam planı önizlemesi hazırlamak için işlenir. Gizli ya da kişisel bilgileri paylaşma. Ayrıntılar için:',
        privacyLinkLabel: 'GLOVAL Gizlilik Politikası',
      },
      {
        question: 'Reklam politikası dışında kalan siteler yayınlanabilir mi?',
        answer: 'Google Ads politikalarını ihlal eden reklamlar yayınlanamaz; kısıtlı içerik türleri ek şartlara tabi olabilir. Uygunluk Google’ın güncel politikalarına göre değerlendirilir.',
      },
      {
        question: 'Ne zaman yayınlayabilirim?',
        answer: 'Yayınlama özelliği şu an Yakında. Hazır olduğunda açılacak; henüz bir tarih açıklanmadı.',
      },
      {
        question: 'Sonuç garantisi var mı?',
        answer: 'Hayır. Tıklama, dönüşüm veya satış artışı vaat etmiyoruz. Reklam performansı arama terimlerine, rekabete, site içeriğine ve bütçeye göre değişir.',
      },
    ],
  },
}

type AdsSectionsCopy = typeof tr

const en: AdsSectionsCopy = {
  how: {
    title: 'How it works',
    intro: 'Start with your website and review a search ad draft while keeping control.',
    steps: [
      {
        title: 'Enter your address',
        body: 'Add the public address of your website.',
        badge: '',
      },
      {
        title: 'We read your site and prepare a plan',
        body: 'We review publicly available site content to prepare a search campaign draft.',
        badge: '',
      },
      {
        title: 'Review the preview',
        body: 'Check the Google Search ad layout, suggested keywords, and proposed budget.',
        badge: '',
      },
      {
        title: 'Connect your account, approve, and publish',
        body: 'Google Ads account linking and publishing after your approval are still being prepared.',
        badge: 'Coming soon',
      },
    ],
  },
  preview: {
    title: 'Google Search ad example',
    intro: 'This sample card shows how a search ad draft could look.',
    sampleLabel: 'Example',
    searchQuery: 'service options',
    sponsoredLabel: 'Sponsored',
    displayUrl: 'sample-business.test › services',
    headline: 'Expert support and services | Learn more',
    description: 'Explore services that fit your needs. Compare options and find information about the right solution for you.',
    sitelinkServices: 'Explore services',
    sitelinkContact: 'Contact options',
    disclaimer: 'No real brand is used. This is a sample design, not a published ad.',
  },
  credits: {
    title: 'Credit usage',
    intro: 'Daily free allowances are used first for scans and plan previews. Other actions will use credits when available.',
    actionHeader: 'Action',
    costHeader: 'Credits',
    statusHeader: 'Status',
    scanTitle: 'Website scan + plan preview',
    signedInQuota: 'Signed-in account • free per day',
    guestQuota: 'Guest • free per day',
    afterFreeQuota: 'Per scan after free allowance',
    imageTitle: 'Ad image generation',
    publishTitle: 'Campaign publishing',
    reviseTitle: 'Campaign revision',
    weeklyOptimizationTitle: 'Weekly optimization',
    assistantTitle: 'Ask the Ads assistant',
    availableNow: 'Available now',
    comingSoon: 'Coming soon',
    creditUnit: 'credits',
    balanceNote: 'These credits use the same balance as your existing AI credits.',
    billingLink: 'Get credits',
  },
  faq: {
    title: 'Frequently asked questions',
    items: [
      {
        question: 'Is GLOVAL Ads paid?',
        answer: 'A daily free scan allowance is available. After it runs out, scans and plan previews use the current amount shown in the credit table; the Google Ads budget is separate from those credits.',
      },
      {
        question: 'Who do I pay for the ad budget?',
        answer: 'Google charges advertising spend directly. GLOVAL does not collect or manage your ad budget.',
      },
      {
        question: 'Can I use it if my site was not built with GLOVAL?',
        answer: 'Yes. You only need to enter the public address of your website.',
      },
      {
        question: 'Which advertising platforms are available?',
        answer: 'Channels will open one by one, starting with Google Ads. Other platforms will become available as they are ready.',
      },
      {
        question: 'How is my data used?',
        answer: 'We process publicly accessible content from the website address you enter to prepare a scan and campaign-plan preview. Do not share private or sensitive information. See the Privacy Policy for details:',
        privacyLinkLabel: 'GLOVAL Privacy Policy',
      },
      {
        question: 'Can sites outside advertising policies be published?',
        answer: 'Ads that violate Google Ads policies cannot be published; restricted content categories may have additional requirements. Eligibility is assessed against Google’s current policies.',
      },
      {
        question: 'When can I publish an ad?',
        answer: 'Publishing is currently marked as coming soon. It will open when ready; no date has been announced.',
      },
      {
        question: 'Are results guaranteed?',
        answer: 'We do not promise a particular number of clicks, conversions, or sales. Performance varies with search terms, competition, website content, budget, and other factors.',
      },
    ],
  },
}

export const adsSectionsCopy = { tr, en }
