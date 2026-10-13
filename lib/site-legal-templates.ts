/**
 * SINGLE SOURCE for every legal text a published site serves.
 *
 * Edit the wording here (and only here): the `/site/<slug>/yasal/<doc>` pages,
 * the checkout consent modals (Mesafeli Satış + KVKK) and the tests all read
 * from this file. Texts are generic, merchant-agnostic templates filled with
 * the site owner's details; they are NOT legal advice and must be reviewed by
 * the owner (see `SITE_LEGAL_DISCLAIMER`, rendered permanently under each page).
 *
 * These are DISTINCT from the platform's own SaaS documents (`lib/legal/*`,
 * served at gloval.ai `/yasal/*`), which describe GLOVAL AI's software service.
 *
 * Company details come from the site's contact section (title, address,
 * phone, e-mail). The schema has no tax number / MERSİS field yet; they are
 * supported here (`taxNo`, `mersis`) and appear automatically once provided.
 */

export type StoreLegalSection = { heading: string; paragraphs: string[] }
export type StoreLegalDoc = { title: string; sections: StoreLegalSection[] }

export type SiteLegalCompany = {
  /** Trade name shown as seller / data controller (site name). */
  name: string
  address?: string
  phone?: string
  email?: string
  taxNo?: string
  mersis?: string
}

/** Shown permanently at the bottom of every legal page. */
export const SITE_LEGAL_DISCLAIMER =
  'Bu metin şablondur, sitenizin yasal gerekliliklerine uygun şekilde gözden geçirin. Gloval AI hukuki danışmanlık vermez; işletme sahibi bu metnin faaliyetine uygunluğundan sorumludur.'

type CompanyInput = string | SiteLegalCompany

function company(input: CompanyInput): SiteLegalCompany {
  const c = typeof input === 'string' ? { name: input } : input
  const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined)
  return {
    name: clean(c.name) ?? 'Satıcı',
    address: clean(c.address),
    phone: clean(c.phone),
    email: clean(c.email),
    taxNo: clean(c.taxNo),
    mersis: clean(c.mersis),
  }
}

/** "Ünvan: X. Adres: Y. ..." with only the fields that are actually known. */
export function companyDetailsLine(input: CompanyInput): string {
  const c = company(input)
  const parts = [`Ünvan: ${c.name}`]
  if (c.address) parts.push(`Adres: ${c.address}`)
  if (c.phone) parts.push(`Telefon: ${c.phone}`)
  if (c.email) parts.push(`E-posta: ${c.email}`)
  if (c.taxNo) parts.push(`Vergi No: ${c.taxNo}`)
  if (c.mersis) parts.push(`MERSİS No: ${c.mersis}`)
  return parts.join('. ') + '.'
}

function hasContactDetails(c: SiteLegalCompany): boolean {
  return Boolean(c.address || c.phone || c.email)
}

function contactChannels(c: SiteLegalCompany): string {
  const channels = [c.email, c.phone].filter(Boolean).join(' / ')
  return channels ? `iletişim bilgileri (${channels})` : 'sitedeki iletişim bilgileri'
}

function intro(name: string): string {
  return `Bu metin, "${name}" sitesinin ziyaretçileri ve müşterileri için genel bir bilgilendirme niteliğindedir. İşletme sahibi, kendi faaliyetine göre gözden geçirmekle yükümlüdür.`
}

/** Mesafeli Satış Sözleşmesi + Ön Bilgilendirme (özet, mağaza bazlı). */
export function buildDistanceSalesNotice(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  return {
    title: 'Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme',
    sections: [
      {
        heading: '1. Taraflar ve Konu',
        paragraphs: [
          `İşbu sözleşme, bir tarafta satıcı "${c.name}" ile diğer tarafta siparişi veren alıcı arasında, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca elektronik ortamda kurulur.`,
          'Sözleşmenin konusu, alıcının elektronik ortamda sipariş verdiği ürünlerin satışı ve teslimidir. Sipariş özeti, ürün adı, adedi ve toplam bedeli ödeme adımında alıcıya gösterilir.',
        ],
      },
      {
        heading: '2. Satıcı Bilgileri',
        paragraphs: [
          hasContactDetails(c) || c.taxNo || c.mersis
            ? companyDetailsLine(c)
            : `Satıcı unvanı: ${c.name}. Satıcının açık adres, telefon ve e-posta bilgileri, mağazanın iletişim bölümünde ve sipariş onay e-postasında yer alır.`,
        ],
      },
      {
        heading: '3. Cayma Hakkı',
        paragraphs: [
          'Alıcı, malı teslim aldığı tarihten itibaren 14 (on dört) gün içinde herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayma hakkına sahiptir.',
          'Cayma hakkının kullanıldığına dair bildirimin bu süre içinde satıcıya yöneltilmesi yeterlidir. Cayma hakkının kullanılması hâlinde ürün bedeli 14 gün içinde iade edilir.',
          'Niteliği gereği iade edilemeyecek ürünler (kişiye özel üretilenler, hızlı bozulan veya son kullanma tarihi geçebilecek ürünler, tesliminden sonra ambalajı açılan hijyenik ürünler vb.) mevzuat gereği cayma hakkı kapsamı dışındadır.',
        ],
      },
      {
        heading: '4. Teslimat',
        paragraphs: [
          'Ürünler, alıcının sipariş sırasında bildirdiği teslimat adresine kargo ile gönderilir. Teslimat süreleri ürün ve bölgeye göre değişebilir; kargo durumu "Hesabım > Siparişlerim" bölümünden takip edilebilir.',
        ],
      },
      {
        heading: '5. Uyuşmazlıkların Çözümü',
        paragraphs: [
          'Alıcı, sipariş ile ilgili şikâyet ve itirazlarını, mevzuatça belirlenen parasal sınırlar dâhilinde ikametgâhının bulunduğu yerdeki Tüketici Hakem Heyetine veya Tüketici Mahkemesine iletebilir.',
        ],
      },
    ],
  }
}

/** KVKK Aydınlatma Metni (özet, mağaza bazlı). */
export function buildKvkkNotice(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  return {
    title: 'KVKK Aydınlatma Metni',
    sections: [
      {
        heading: 'Veri Sorumlusu',
        paragraphs: [
          `Kişisel verileriniz, veri sorumlusu sıfatıyla "${c.name}" tarafından 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında işlenmektedir.`,
          ...(hasContactDetails(c) || c.taxNo || c.mersis ? [companyDetailsLine(c)] : []),
        ],
      },
      {
        heading: 'İşlenen Veriler ve Amaç',
        paragraphs: [
          'Ad-soyad, iletişim (telefon, e-posta), teslimat/fatura adresi ve sipariş bilgileriniz; siparişinizin alınması, hazırlanması, kargolanması, faturalandırılması ve yasal yükümlülüklerin yerine getirilmesi amacıyla işlenir.',
          'Fatura için verdiğiniz TC kimlik veya vergi bilgileri yalnızca yasal fatura düzenleme amacıyla kullanılır.',
        ],
      },
      {
        heading: 'Aktarım',
        paragraphs: [
          'Verileriniz; siparişin teslimi için kargo firmalarıyla, ödeme işlemleri için ödeme kuruluşlarıyla ve yasal olarak yetkili kamu kurumlarıyla, yalnızca ilgili amaçla sınırlı olarak paylaşılır.',
        ],
      },
      {
        heading: 'Haklarınız',
        paragraphs: [
          `KVKK md. 11 uyarınca; verilerinize erişme, düzeltilmesini veya silinmesini isteme ve işlenmesine itiraz etme haklarına sahipsiniz. Taleplerinizi ${contactChannels(c)} üzerinden iletebilirsiniz.`,
        ],
      },
    ],
  }
}

export function buildPrivacyPolicy(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  const kvkk = buildKvkkNotice(c)
  return {
    title: 'Gizlilik Politikası',
    sections: [
      { heading: 'Genel', paragraphs: [intro(c.name)] },
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

export function buildTermsOfService(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  return {
    title: 'Hizmet Sözleşmesi',
    sections: [
      { heading: 'Genel', paragraphs: [intro(c.name)] },
      {
        heading: 'Hizmet Sağlayıcı',
        paragraphs: [companyDetailsLine(c)],
      },
      {
        heading: 'Hizmetin Kapsamı',
        paragraphs: [
          `"${c.name}" tarafından sunulan ürün ve hizmetlerin tanıtımı bu sitede yapılır. Sitede yer alan bilgiler önceden haber verilmeksizin güncellenebilir.`,
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

export function buildCancellationAndRefund(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  return {
    title: 'İptal ve İade',
    sections: [
      { heading: 'Genel', paragraphs: [intro(c.name)] },
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
          `İade talebinizi "${c.name}" ile ${contactChannels(c)} üzerinden bildirmeniz yeterlidir. Ürün, kullanılmamış ve ambalajı bozulmamış şekilde gönderilmelidir.`,
          ...(c.address ? [`İade adresi: ${c.address}.`] : []),
          'Ürünün iade alınmasından sonra ödeme, kullandığınız ödeme yöntemiyle en geç 14 gün içinde iade edilir.',
        ],
      },
      {
        heading: 'Sipariş İptali',
        paragraphs: [
          `Kargoya verilmemiş siparişler iptal edilebilir. İptal talebini ${contactChannels(c)} üzerinden iletebilirsiniz.`,
        ],
      },
    ],
  }
}

export function buildMembershipAgreement(input: CompanyInput): StoreLegalDoc {
  const c = company(input)
  return {
    title: 'Üyelik Sözleşmesi',
    sections: [
      { heading: 'Genel', paragraphs: [intro(c.name)] },
      {
        heading: 'Üyelik',
        paragraphs: [
          `Üyelik, "${c.name}" sitesinde hesap oluşturan kişinin bu sözleşmeyi kabul etmesiyle kurulur. Üye, verdiği bilgilerin doğru ve güncel olduğunu beyan eder.`,
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

export const SITE_LEGAL_BUILDERS = {
  'gizlilik-politikasi': buildPrivacyPolicy,
  'mesafeli-satis-sozlesmesi': buildDistanceSalesNotice,
  'hizmet-sozlesmesi': buildTermsOfService,
  'iptal-ve-iade': buildCancellationAndRefund,
  'uyelik-sozlesmesi': buildMembershipAgreement,
} as const

export type SiteLegalSlug = keyof typeof SITE_LEGAL_BUILDERS

/** Resolves a legal slug to the site-scoped document, or null when unknown. */
export function getSiteLegalDoc(slug: string, input: CompanyInput): StoreLegalDoc | null {
  if (!Object.prototype.hasOwnProperty.call(SITE_LEGAL_BUILDERS, slug)) return null
  return SITE_LEGAL_BUILDERS[slug as SiteLegalSlug](input)
}

/** Builds the company details from a site name and its (optional) contact section. */
export function companyFromSite(
  name: string,
  sections: ReadonlyArray<{ type: string; [k: string]: unknown }>,
): SiteLegalCompany {
  const contact = sections.find((s) => s.type === 'contact') as
    | { address?: string; phone?: string; email?: string }
    | undefined
  return {
    name,
    address: contact?.address,
    phone: contact?.phone,
    email: contact?.email,
  }
}
