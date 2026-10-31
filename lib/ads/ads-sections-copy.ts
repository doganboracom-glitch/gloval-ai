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
    title: 'Dakikalar içinde siteden reklam planına',
    intro: 'Örnek kart, kurgusal bir yerel hizmet işletmesi için hazırlanmış arama reklamı görünümünü gösterir.',
    sampleLabel: 'Örnek',
    calloutsLabel: 'Reklam planında hazırlananlar',
    callouts: [
      'Sitendeki hizmetlere göre başlıklar',
      'İşletmene özel reklam metni (30/90 karakter sınırı kontrollü)',
      'Anahtar kelime ve negatif kelime önerisi',
      'Hedef konum ve dil önerisi',
      'Günlük bütçe önerisi ve üst sınır',
      'Onayın olmadan yayınlanmaz',
    ],
    searchQuery: 'klima bakımı İzmir',
    sponsoredLabel: 'Sponsorlu',
    displayUrl: 'ornek-klima-servisi.test › bakım',
    headlineOne: 'Örnek Klima Servisi',
    headlineTwo: 'Bakım Seçenekleri',
    description: 'İzmir’de bakım seçeneklerini inceleyin. Hizmet kapsamı ve randevu bilgilerine göz atın.',
    sitelinkServices: 'Hizmetler',
    sitelinkContact: 'Randevu bilgisi',
    keywordLabel: 'Örnek anahtar kelimeler',
    keywords: ['klima bakımı', 'klima servisi', 'İzmir klima bakımı'],
    sampleBudgetLabel: 'Örnek günlük bütçe',
    sampleBudgetValue: '₺300 / gün',
    disclaimer: 'Bu bir örnek tasarımdır; reklam yayınlanmış değildir.',
  },
  credits: {
    title: 'Kredi kullanımı',
    panelLabel: 'Kredi bilgileri',
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
    supportText: 'Sorunuz mu var? Destek ekibimiz size yardımcı olabilir.',
    supportButton: 'Destek ekibine ulaşın',
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
    title: 'From website to ad plan in minutes',
    intro: 'A sample search ad for a fictional local service business.',
    sampleLabel: 'Sample',
    calloutsLabel: 'Included in the ad plan',
    callouts: [
      'Headlines based on services listed on your site',
      'Business-specific ad copy (30/90-character limits checked)',
      'Keyword and negative keyword suggestions',
      'Suggested target location and language',
      'Daily budget recommendation with a cap',
      'Nothing publishes without your approval',
    ],
    searchQuery: 'air conditioning maintenance in Izmir',
    sponsoredLabel: 'Sponsored',
    displayUrl: 'sample-climate-service.test › maintenance',
    headlineOne: 'Sample Climate Service',
    headlineTwo: 'Maintenance Options',
    description: 'Explore maintenance options in Izmir. Review service details and appointment information.',
    sitelinkServices: 'Services',
    sitelinkContact: 'Appointments',
    keywordLabel: 'Example keywords',
    keywords: ['air conditioning maintenance', 'climate service', 'maintenance options'],
    sampleBudgetLabel: 'Example daily budget',
    sampleBudgetValue: 'TRY 300 / day',
    disclaimer: 'This is a sample design; no ad has been published.',
  },
  credits: {
    title: 'Credit usage',
    panelLabel: 'Credit details',
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
    supportText: 'Have a question? Our support team is here to help.',
    supportButton: 'Contact support',
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
