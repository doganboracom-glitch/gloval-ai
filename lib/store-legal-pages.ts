import {
  buildDistanceSalesNotice,
  buildKvkkNotice,
  type StoreLegalDoc,
} from '@/lib/store-legal'
import { isFooterLegalSlug } from '@/lib/footer-links'

/**
 * Official-text pages every PUBLISHED site serves under `/yasal/<slug>`
 * (linked from the footer's bottom bar). They are scoped to the site owner,
 * NOT to the GLOVAL AI platform (the platform's own `/yasal/*` documents
 * describe its SaaS service). The text is a generic baseline; the owner is
 * expected to review it for their business.
 */

function intro(name: string): string {
  return `Bu metin, "${name}" sitesinin ziyaretçileri ve müşterileri için genel bir bilgilendirme niteliğindedir. İşletme sahibi, kendi faaliyetine göre gözden geçirmekle yükümlüdür.`
}

export function buildPrivacyPolicy(name: string): StoreLegalDoc {
  const kvkk = buildKvkkNotice(name)
  return {
    title: 'Gizlilik Politikası',
    sections: [
      { heading: 'Genel', paragraphs: [intro(name)] },
      {
        heading: 'Toplanan Bilgiler',
        paragraphs: [
          'İletişim formları, sipariş ve üyelik işlemleri sırasında paylaştığınız ad, e-posta, telefon ve adres bilgileri; yalnızca talebinizi yerine getirmek, siparişinizi teslim etmek ve yasal yükümlülükleri karşılamak amacıyla işlenir.',
          'Sitenin çalışması için gerekli çerezler kullanılabilir. Tarayıcı ayarlarınızdan çerezleri dilediğiniz zaman yönetebilirsiniz.',
        ],
      },
      {
        heading: 'Paylaşım ve Saklama',
        paragraphs: [
          'Kişisel verileriniz, hukuki zorunluluklar ve hizmetin sunulması (kargo, ödeme kuruluşu gibi) dışında üçüncü kişilerle paylaşılmaz ve gerekli süre boyunca saklanır.',
          'Ödeme kartı bilgileriniz işletme tarafından saklanmaz; ödeme altyapısı sağlayıcısı tarafından işlenir.',
        ],
      },
      ...kvkk.sections,
    ],
  }
}

export function buildTermsOfService(name: string): StoreLegalDoc {
  return {
    title: 'Hizmet Sözleşmesi',
    sections: [
      { heading: 'Genel', paragraphs: [intro(name)] },
      {
        heading: 'Hizmetin Kapsamı',
        paragraphs: [
          `"${name}" tarafından sunulan ürün ve hizmetlerin tanıtımı bu sitede yapılır. Sitede yer alan bilgiler önceden haber verilmeksizin güncellenebilir.`,
        ],
      },
      {
        heading: 'Kullanım Koşulları',
        paragraphs: [
          'Siteyi kullanan herkes, yürürlükteki mevzuata uygun davranmayı ve siteye zarar verecek işlemlerden kaçınmayı kabul eder.',
          'Sitedeki metin, görsel ve marka unsurlarının hakları işletmeye aittir; izinsiz kopyalanamaz.',
        ],
      },
      {
        heading: 'Sorumluluk',
        paragraphs: [
          'İşletme, sitedeki bilgilerin doğruluğu için makul özeni gösterir; ancak teknik aksaklıklardan veya üçüncü taraf bağlantılarından doğan zararlardan sorumlu tutulamaz.',
        ],
      },
    ],
  }
}

export function buildCancellationAndRefund(name: string): StoreLegalDoc {
  return {
    title: 'İptal ve İade',
    sections: [
      { heading: 'Genel', paragraphs: [intro(name)] },
      {
        heading: 'Cayma Hakkı',
        paragraphs: [
          'Tüketici, mesafeli satışlarda ürünün tesliminden itibaren 14 gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.',
          'Hijyen, kişiye özel üretim ve çabuk bozulabilen ürünlerde mevzuat gereği cayma hakkı kullanılamayabilir.',
        ],
      },
      {
        heading: 'İade Süreci',
        paragraphs: [
          `İade talebinizi "${name}" ile iletişim bilgileri üzerinden bildirmeniz yeterlidir. Ürün, kullanılmamış ve ambalajı bozulmamış şekilde gönderilmelidir.`,
          'Ürünün iade alınmasından sonra ödeme, kullandığınız ödeme yöntemiyle en geç 14 gün içinde iade edilir.',
        ],
      },
      {
        heading: 'Sipariş İptali',
        paragraphs: [
          'Kargoya verilmemiş siparişler iptal edilebilir. İptal talebini iletişim bilgileri üzerinden iletebilirsiniz.',
        ],
      },
    ],
  }
}

export function buildMembershipAgreement(name: string): StoreLegalDoc {
  return {
    title: 'Üyelik Sözleşmesi',
    sections: [
      { heading: 'Genel', paragraphs: [intro(name)] },
      {
        heading: 'Üyelik',
        paragraphs: [
          `Üyelik, "${name}" sitesinde hesap oluşturan kişinin bu sözleşmeyi kabul etmesiyle kurulur. Üye, verdiği bilgilerin doğru ve güncel olduğunu beyan eder.`,
        ],
      },
      {
        heading: 'Hesap Güvenliği',
        paragraphs: [
          'Hesap bilgilerinin gizliliğinden üye sorumludur. Yetkisiz kullanım şüphesinde işletmeye derhal bildirimde bulunulmalıdır.',
        ],
      },
      {
        heading: 'Üyeliğin Sona Ermesi',
        paragraphs: [
          'Üye dilediği zaman hesabının kapatılmasını talep edebilir. Sözleşmeye aykırı kullanım halinde işletme üyeliği askıya alabilir veya sonlandırabilir.',
        ],
      },
    ],
  }
}

/** Resolves a footer legal slug to the site-scoped document, or null. */
export function getStoreLegalPage(slug: string, siteName: string): StoreLegalDoc | null {
  if (!isFooterLegalSlug(slug)) return null
  switch (slug) {
    case 'gizlilik-politikasi':
      return buildPrivacyPolicy(siteName)
    case 'mesafeli-satis-sozlesmesi':
      return buildDistanceSalesNotice(siteName)
    case 'hizmet-sozlesmesi':
      return buildTermsOfService(siteName)
    case 'iptal-ve-iade':
      return buildCancellationAndRefund(siteName)
    case 'uyelik-sozlesmesi':
      return buildMembershipAgreement(siteName)
  }
}
