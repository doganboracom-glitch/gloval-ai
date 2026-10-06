/**
 * GLOVAL AI — Yasal doküman içerikleri (TR + EN).
 *
 * Bu metinler GLOVAL AI'ın GERÇEK iş modeline göre yazılmıştır: yapay zeka
 * destekli web sitesi oluşturma, yayınlama, barındırma/yayın altyapısı, özel
 * alan adı bağlama ve SaaS paketleri sunan dijital bir hizmet platformu.
 * Fiziksel ürün, kargo, stok gibi ifadeler bilinçli olarak kullanılmaz;
 * "teslimat" kavramı dijital hizmetin kullanıma açılması bağlamındadır.
 *
 * Her doküman iki dilde tutulur (`tr` / `en`); render sırasında aktif dile
 * göre seçilir. Şirket bilgileri `COMPANY` üzerinden gelir (uydurulmaz; eksikse
 * placeholder görünür).
 */

import { COMPANY } from '@/lib/legal/company'

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }

export type LegalSection = { heading: string; blocks: LegalBlock[] }

/** Tek bir dile ait doküman gövdesi. */
export type LegalContent = {
  title: string
  /** Meta açıklama (SEO). */
  description: string
  /** Başlık altındaki kısa özet paragrafları. */
  intro: string[]
  sections: LegalSection[]
}

/** İki dilli yasal doküman. */
export type LegalDoc = {
  slug: string
  tr: LegalContent
  en: LegalContent
}

const p = (text: string): LegalBlock => ({ type: 'p', text })
const list = (items: string[]): LegalBlock => ({ type: 'list', items })

/* -------------------------------------------------------------------------- */
/* Gizlilik Politikası — Privacy Policy                                        */
/* -------------------------------------------------------------------------- */

const privacy: LegalDoc = {
  slug: 'gizlilik-politikasi',
  tr: {
    title: 'Gizlilik Politikası',
    description:
      'GLOVAL AI olarak hangi kişisel verileri, hangi amaçla topladığımızı, ne kadar süre sakladığımızı ve haklarınızı açıklıyoruz.',
    intro: [
      `${COMPANY.brandName} ("Platform"), ${COMPANY.legalName} tarafından işletilir. Bu Gizlilik Politikası, ${COMPANY.domain} üzerinden sunulan hizmetleri kullandığınızda kişisel verilerinizin nasıl işlendiğini açıklar.`,
      'Politika yalnızca hizmetin işleyişi kapsamında gerçekten toplanan verileri kapsar; kullanmadığımız veri türlerini içermez.',
    ],
    sections: [
      {
        heading: '1. İşlenen Kişisel Veriler',
        blocks: [
          p('Hizmeti sunabilmek için aşağıdaki verileri işleriz:'),
          list([
            'Hesap bilgileri: ad-soyad (veya görünen ad) ve e-posta adresi.',
            'İletişim ve destek verileri: destek taleplerinizde ilettiğiniz bilgiler.',
            'Oluşturduğunuz içerik: yapay zeka ile ürettiğiniz web sitesi metinleri, sayfa yapıları ve yüklediğiniz görseller.',
            'Alan adı bilgileri: bağladığınız veya talep ettiğiniz alan adlarına ilişkin bilgiler.',
            'Ödeme ile ilgili bilgiler: paket, tutar, ödeme durumu ve fatura kayıtları. Kart bilgileriniz Platform tarafından SAKLANMAZ; ödeme, lisanslı ödeme kuruluşu (ör. PayTR) altyapısında işlenir.',
            'Teknik/log verileri: IP adresi, oturum ve güvenlik kayıtları, tarayıcı/cihaz bilgisi.',
            'Kullanım ve analitik verileri: sayfa görüntüleme ve özellik kullanımı (yalnızca açık rızaya bağlı analitik çerezler etkinse).',
          ]),
        ],
      },
      {
        heading: '2. Toplama Amaçları ve Hukuki Sebepler',
        blocks: [
          list([
            'Hesabınızı oluşturmak ve hizmeti sunmak — sözleşmenin kurulması ve ifası.',
            'Ödeme, faturalama ve abonelik yönetimi — sözleşmenin ifası ve yasal yükümlülük.',
            'Güvenlik, dolandırıcılık önleme ve kayıt tutma — meşru menfaat ve yasal yükümlülük.',
            'Destek taleplerini yanıtlamak — sözleşmenin ifası ve meşru menfaat.',
            'Zorunlu hizmet bildirimleri göndermek (ödeme sonucu, güvenlik, hizmet durumu) — sözleşmenin ifası.',
            'İzin verdiyseniz pazarlama iletileri ve analitik — açık rıza.',
          ]),
        ],
      },
      {
        heading: '3. Saklama Süreleri',
        blocks: [
          p(
            'Verilerinizi yalnızca işleme amacının gerektirdiği ve mevzuatın öngördüğü süre boyunca saklarız. Hesap ve içerik verileri hesabınız aktif olduğu sürece; faturalama ve işlem kayıtları ilgili vergi/ticaret mevzuatının öngördüğü süre boyunca (genel olarak on yıla varan süreler) tutulur. Süre dolduğunda veriler silinir, yok edilir veya anonim hâle getirilir.',
          ),
        ],
      },
      {
        heading: '4. Verilerin Paylaşımı',
        blocks: [
          p('Verilerinizi yalnızca hizmetin sunumu için gerekli olduğunda paylaşırız:'),
          list([
            'Ödeme kuruluşu: ödeme işlemlerinin gerçekleştirilmesi amacıyla.',
            'Barındırma ve altyapı sağlayıcıları: sitelerin yayınlanması ve saklanması amacıyla.',
            'Yapay zeka altyapı sağlayıcıları: içerik üretimi için verdiğiniz istemlerin işlenmesi amacıyla.',
            'E-posta gönderim sağlayıcıları: zorunlu bildirimlerin ve (izinliyse) iletilerin gönderimi amacıyla.',
            'Yetkili kamu kurumları: yalnızca yasal zorunluluk hâlinde.',
          ]),
          p('Kişisel verilerinizi reklam amacıyla üçüncü taraflara satmayız.'),
        ],
      },
      {
        heading: '5. Haklarınız',
        blocks: [
          p(
            '6698 sayılı KVKK kapsamında; verilerinize erişme, düzeltilmesini veya silinmesini isteme, işlenmesine itiraz etme ve aktarım yapılan tarafları öğrenme haklarına sahipsiniz. Başvurularınızı ' +
              `${COMPANY.kvkkEmail} adresine iletebilirsiniz. Detaylar için KVKK Aydınlatma Metni sayfamıza bakınız.`,
          ),
        ],
      },
      {
        heading: '6. Güvenlik',
        blocks: [
          p(
            'Verilerinizi korumak için erişim denetimi, şifreleme ve güvenli oturum yönetimi gibi teknik ve idari tedbirleri uygularız. Parolalar geri döndürülemez biçimde saklanır.',
          ),
        ],
      },
      {
        heading: '7. Çerezler',
        blocks: [
          p(
            'Platform, zorunlu çerezlerin yanı sıra yalnızca açık rızanıza bağlı analitik ve pazarlama çerezleri kullanabilir. Tercihlerinizi Çerez Politikası sayfasından dilediğiniz zaman değiştirebilirsiniz.',
          ),
        ],
      },
      {
        heading: '8. İletişim ve Değişiklikler',
        blocks: [
          p(
            `Bu politikayı zaman zaman güncelleyebiliriz; güncel sürüm her zaman bu sayfada yayımlanır. Sorularınız için ${COMPANY.supportEmail} adresinden bize ulaşabilirsiniz.`,
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Privacy Policy',
    description:
      'We explain which personal data GLOVAL AI collects, for what purpose, how long we keep it, and your rights.',
    intro: [
      `${COMPANY.brandName} (the "Platform") is operated by ${COMPANY.legalName}. This Privacy Policy explains how your personal data is processed when you use the services offered through ${COMPANY.domain}.`,
      'This policy covers only data actually collected in the course of operating the service; it does not describe data types we do not use.',
    ],
    sections: [
      {
        heading: '1. Personal Data We Process',
        blocks: [
          p('To provide the service, we process the following data:'),
          list([
            'Account details: full name (or display name) and email address.',
            'Contact and support data: information you share in your support requests.',
            'Content you create: website copy, page structures generated with AI, and images you upload.',
            'Domain information: details relating to domains you connect or request.',
            'Payment-related information: package, amount, payment status and invoice records. Your card details are NOT stored by the Platform; payment is processed on the infrastructure of a licensed payment institution (e.g. PayTR).',
            'Technical/log data: IP address, session and security logs, browser/device information.',
            'Usage and analytics data: page views and feature usage (only if consent-based analytics cookies are enabled).',
          ]),
        ],
      },
      {
        heading: '2. Purposes and Legal Grounds',
        blocks: [
          list([
            'Creating your account and providing the service — formation and performance of the contract.',
            'Payment, invoicing and subscription management — performance of the contract and legal obligation.',
            'Security, fraud prevention and record-keeping — legitimate interest and legal obligation.',
            'Responding to support requests — performance of the contract and legitimate interest.',
            'Sending mandatory service notifications (payment result, security, service status) — performance of the contract.',
            'Marketing messages and analytics where you have opted in — explicit consent.',
          ]),
        ],
      },
      {
        heading: '3. Retention Periods',
        blocks: [
          p(
            'We keep your data only for as long as the processing purpose requires and applicable law prescribes. Account and content data are kept while your account is active; invoicing and transaction records are kept for the period required by tax/commercial legislation (generally up to ten years). Once the period expires, data is deleted, destroyed or anonymised.',
          ),
        ],
      },
      {
        heading: '4. Sharing of Data',
        blocks: [
          p('We share your data only when necessary to provide the service:'),
          list([
            'Payment institution: to carry out payment transactions.',
            'Hosting and infrastructure providers: to publish and store sites.',
            'AI infrastructure providers: to process the prompts you submit for content generation.',
            'Email delivery providers: to send mandatory notifications and (if opted in) messages.',
            'Authorised public authorities: only where legally required.',
          ]),
          p('We do not sell your personal data to third parties for advertising.'),
        ],
      },
      {
        heading: '5. Your Rights',
        blocks: [
          p(
            'Under Law No. 6698 (KVKK), you have the right to access your data, request its correction or deletion, object to its processing, and learn the parties to whom it is transferred. You can send your requests to ' +
              `${COMPANY.kvkkEmail}. For details, see our Data Protection Notice.`,
          ),
        ],
      },
      {
        heading: '6. Security',
        blocks: [
          p(
            'To protect your data we apply technical and administrative measures such as access control, encryption and secure session management. Passwords are stored in an irreversible form.',
          ),
        ],
      },
      {
        heading: '7. Cookies',
        blocks: [
          p(
            'In addition to essential cookies, the Platform may use analytics and marketing cookies solely subject to your explicit consent. You can change your preferences at any time from the Cookie Policy page.',
          ),
        ],
      },
      {
        heading: '8. Contact and Changes',
        blocks: [
          p(
            `We may update this policy from time to time; the current version is always published on this page. For questions, contact us at ${COMPANY.supportEmail}.`,
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* KVKK Aydınlatma Metni — Data Protection Notice                              */
/* -------------------------------------------------------------------------- */

const kvkk: LegalDoc = {
  slug: 'kvkk',
  tr: {
    title: 'KVKK Aydınlatma Metni',
    description:
      '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında GLOVAL AI veri işleme faaliyetlerine ilişkin aydınlatma metni.',
    intro: [
      `İşbu Aydınlatma Metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") 10. maddesi uyarınca, veri sorumlusu ${COMPANY.legalName} tarafından hazırlanmıştır.`,
    ],
    sections: [
      {
        heading: '1. Veri Sorumlusu',
        blocks: [
          list([
            `Unvan: ${COMPANY.legalName}`,
            `Adres: ${COMPANY.address}`,
            `Başvuru e-posta: ${COMPANY.kvkkEmail}`,
          ]),
        ],
      },
      {
        heading: '2. İşlenen Kişisel Veriler',
        blocks: [
          list([
            'Kimlik ve iletişim: ad-soyad, e-posta, (varsa) telefon.',
            'Müşteri işlem: paket, abonelik, ödeme ve fatura kayıtları.',
            'İşlem güvenliği: IP, log ve oturum kayıtları.',
            'Kullanıcı içeriği: oluşturduğunuz site verileri ve yüklediğiniz görseller.',
          ]),
        ],
      },
      {
        heading: '3. İşleme Amaçları',
        blocks: [
          list([
            'Hizmetin sunulması, hesabın yönetilmesi ve sitelerin yayınlanması.',
            'Ödeme ve faturalandırma süreçlerinin yürütülmesi.',
            'Bilgi güvenliğinin sağlanması ve hukuki yükümlülüklerin yerine getirilmesi.',
            'Talep ve şikâyetlerin yönetilmesi.',
          ]),
        ],
      },
      {
        heading: '4. Hukuki Sebepler',
        blocks: [
          p(
            'Kişisel verileriniz; bir sözleşmenin kurulması veya ifası için gerekli olması, veri sorumlusunun hukuki yükümlülüğünü yerine getirmesi, bir hakkın tesisi/kullanılması/korunması, ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaati ve — gereken hâllerde — açık rızanız hukuki sebeplerine dayanılarak işlenir.',
          ),
        ],
      },
      {
        heading: '5. Aktarım',
        blocks: [
          p(
            'Verileriniz; ödeme kuruluşları, barındırma ve yapay zeka altyapı sağlayıcıları, e-posta gönderim hizmet sağlayıcıları ve yasal olarak yetkili kamu kurumlarıyla, yalnızca ilgili amaçla sınırlı olarak ve mevzuata uygun biçimde paylaşılabilir. Yurt dışı aktarım söz konusu olduğunda KVKK’nın öngördüğü şartlara uyulur.',
          ),
        ],
      },
      {
        heading: '6. İlgili Kişinin Hakları (KVKK m.11)',
        blocks: [
          list([
            'Kişisel verilerinizin işlenip işlenmediğini öğrenme.',
            'İşlenmişse buna ilişkin bilgi talep etme.',
            'Amacına uygun kullanılıp kullanılmadığını öğrenme.',
            'Yurt içi/yurt dışı aktarıldığı üçüncü kişileri bilme.',
            'Eksik/yanlış işlenmişse düzeltilmesini isteme.',
            'Şartları oluşmuşsa silinmesini/yok edilmesini isteme.',
            'Otomatik sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme.',
            'Kanuna aykırı işleme nedeniyle zararınızın giderilmesini talep etme.',
          ]),
        ],
      },
      {
        heading: '7. Başvuru Yöntemi',
        blocks: [
          p(
            `Haklarınızı kullanmak için taleplerinizi ${COMPANY.kvkkEmail} adresine iletebilirsiniz. Başvurunuz en geç 30 gün içinde sonuçlandırılır.`,
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Data Protection Notice (KVKK)',
    description:
      'Disclosure notice regarding GLOVAL AI data processing activities under Turkish Personal Data Protection Law No. 6698 (KVKK).',
    intro: [
      `This Disclosure Notice has been prepared by the data controller ${COMPANY.legalName} pursuant to Article 10 of the Turkish Personal Data Protection Law No. 6698 ("KVKK").`,
    ],
    sections: [
      {
        heading: '1. Data Controller',
        blocks: [
          list([
            `Legal name: ${COMPANY.legalName}`,
            `Address: ${COMPANY.address}`,
            `Application email: ${COMPANY.kvkkEmail}`,
          ]),
        ],
      },
      {
        heading: '2. Personal Data Processed',
        blocks: [
          list([
            'Identity and contact: full name, email, phone (if provided).',
            'Customer transactions: package, subscription, payment and invoice records.',
            'Transaction security: IP, log and session records.',
            'User content: site data you create and images you upload.',
          ]),
        ],
      },
      {
        heading: '3. Purposes of Processing',
        blocks: [
          list([
            'Providing the service, managing the account and publishing sites.',
            'Carrying out payment and invoicing processes.',
            'Ensuring information security and fulfilling legal obligations.',
            'Managing requests and complaints.',
          ]),
        ],
      },
      {
        heading: '4. Legal Grounds',
        blocks: [
          p(
            'Your personal data is processed on the following legal grounds: it being necessary for the establishment or performance of a contract, the data controller fulfilling a legal obligation, the establishment/exercise/protection of a right, the legitimate interest of the data controller provided it does not harm your fundamental rights and freedoms, and — where required — your explicit consent.',
          ),
        ],
      },
      {
        heading: '5. Transfers',
        blocks: [
          p(
            'Your data may be shared with payment institutions, hosting and AI infrastructure providers, email delivery service providers and legally authorised public authorities, limited to the relevant purpose and in compliance with legislation. Where a cross-border transfer is involved, the conditions required by KVKK are observed.',
          ),
        ],
      },
      {
        heading: '6. Rights of the Data Subject (KVKK Art. 11)',
        blocks: [
          list([
            'To learn whether your personal data is processed.',
            'To request information if it has been processed.',
            'To learn whether it is used in accordance with its purpose.',
            'To know the third parties to whom it is transferred domestically or abroad.',
            'To request correction if processed incompletely/incorrectly.',
            'To request deletion/destruction where the conditions are met.',
            'To object to a result against you arising from analysis by automated systems.',
            'To claim compensation for damage due to unlawful processing.',
          ]),
        ],
      },
      {
        heading: '7. Application Method',
        blocks: [
          p(
            `To exercise your rights, you can send your requests to ${COMPANY.kvkkEmail}. Your application will be concluded within 30 days at the latest.`,
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Çerez Politikası — Cookie Policy                                            */
/* -------------------------------------------------------------------------- */

const cookies: LegalDoc = {
  slug: 'cerez-politikasi',
  tr: {
    title: 'Çerez Politikası',
    description:
      'GLOVAL AI’ın kullandığı çerez türleri, amaçları ve çerez tercihlerinizi nasıl yöneteceğiniz.',
    intro: [
      'Bu politika, Platform’da kullanılan çerezleri ve benzer teknolojileri, bunların amaçlarını ve tercihlerinizi nasıl yönetebileceğinizi açıklar.',
    ],
    sections: [
      {
        heading: '1. Çerez Nedir?',
        blocks: [
          p(
            'Çerezler, ziyaret ettiğiniz siteler tarafından cihazınıza kaydedilen küçük metin dosyalarıdır. Oturumun sürdürülmesi ve tercihlerin hatırlanması gibi işlevler için kullanılır.',
          ),
        ],
      },
      {
        heading: '2. Kullandığımız Çerez Türleri',
        blocks: [
          list([
            'Zorunlu çerezler: Oturum açma, güvenlik, dil tercihi ve çerez onayınızın hatırlanması gibi temel işlevler için gereklidir. Bu çerezler olmadan hizmet çalışmaz; rıza gerektirmez.',
            'Analitik çerezler: Hizmetin nasıl kullanıldığını anlamak için toplu/istatistiksel ölçüm sağlar. Yalnızca açık rızanızla etkinleşir.',
            'Pazarlama çerezleri: Kampanya ve tanıtım faaliyetlerinin ölçümü için kullanılabilir. Yalnızca açık rızanızla etkinleşir.',
          ]),
        ],
      },
      {
        heading: '3. Tercihlerinizi Yönetme',
        blocks: [
          p(
            'Siteyi ilk ziyaretinizde bir çerez tercih bildirimi gösterilir. Zorunlu çerezler dışındaki analitik ve pazarlama çerezlerini ayrı ayrı kabul edebilir veya reddedebilirsiniz. Tercihlerinizi daha sonra sayfanın altındaki "Çerez tercihleri" bağlantısından dilediğiniz zaman değiştirebilirsiniz.',
          ),
          p(
            'Ayrıca tarayıcınızın ayarlarından da çerezleri silebilir veya engelleyebilirsiniz; ancak zorunlu çerezleri engellemeniz hizmetin çalışmasını etkileyebilir.',
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Cookie Policy',
    description:
      'The cookie types GLOVAL AI uses, their purposes, and how to manage your cookie preferences.',
    intro: [
      'This policy explains the cookies and similar technologies used on the Platform, their purposes, and how you can manage your preferences.',
    ],
    sections: [
      {
        heading: '1. What Is a Cookie?',
        blocks: [
          p(
            'Cookies are small text files stored on your device by the sites you visit. They are used for functions such as maintaining a session and remembering preferences.',
          ),
        ],
      },
      {
        heading: '2. Types of Cookies We Use',
        blocks: [
          list([
            'Essential cookies: Required for core functions such as sign-in, security, language preference and remembering your cookie consent. The service does not work without them; they require no consent.',
            'Analytics cookies: Provide aggregate/statistical measurement to understand how the service is used. Enabled only with your explicit consent.',
            'Marketing cookies: May be used to measure campaigns and promotional activity. Enabled only with your explicit consent.',
          ]),
        ],
      },
      {
        heading: '3. Managing Your Preferences',
        blocks: [
          p(
            'On your first visit a cookie preference notice is shown. You can accept or reject analytics and marketing cookies separately from essential cookies. You can change your preferences at any time later via the "Cookie preferences" link at the bottom of the page.',
          ),
          p(
            'You can also delete or block cookies from your browser settings; however, blocking essential cookies may affect how the service works.',
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Kullanım Koşulları — Terms of Use                                           */
/* -------------------------------------------------------------------------- */

const terms: LegalDoc = {
  slug: 'kullanim-kosullari',
  tr: {
    title: 'Kullanım Koşulları',
    description:
      'GLOVAL AI hizmetlerini kullanırken geçerli olan koşullar; hesap, içerik, limitler, ödeme ve sorumluluklar.',
    intro: [
      `Bu Kullanım Koşulları, ${COMPANY.brandName} hizmetlerini kullanımınızı düzenler. Hizmeti kullanarak bu koşulları kabul etmiş sayılırsınız.`,
    ],
    sections: [
      {
        heading: '1. Hizmetin Tanımı',
        blocks: [
          p(
            'GLOVAL AI; yapay zeka ile web sitesi oluşturma, düzenleme, yayınlama, barındırma/yayın altyapısı, özel alan adı bağlama ve ilgili dijital hizmetleri sunan bir SaaS platformudur.',
          ),
        ],
      },
      {
        heading: '2. Hesap Oluşturma ve Güvenlik',
        blocks: [
          list([
            'Doğru ve güncel bilgilerle hesap oluşturmakla yükümlüsünüz.',
            'Hesap güvenliğinizden ve giriş bilgilerinizin gizliliğinden siz sorumlusunuz.',
            'Yetkisiz kullanım fark ederseniz derhal bize bildirmelisiniz.',
          ]),
        ],
      },
      {
        heading: '3. Yapay Zeka ile Üretilen ve Kullanıcı İçeriği',
        blocks: [
          list([
            'Ürettiğiniz veya yüklediğiniz içeriklerden ve bunların hukuka uygunluğundan siz sorumlusunuz.',
            'Yapay zeka çıktıları hatalı olabilir; yayımlamadan önce kontrol etmek sizin sorumluluğunuzdadır.',
            'Başkasının fikri mülkiyet haklarını ihlal eden içerik yükleyemezsiniz.',
          ]),
        ],
      },
      {
        heading: '4. Yasaklı Kullanım',
        blocks: [
          p('Aşağıdaki fiiller yasaktır:'),
          list([
            'Hukuka aykırı, yanıltıcı, nefret içeren veya dolandırıcılık amaçlı içerik yayımlamak.',
            'Kimlik avı (phishing), zararlı yazılım dağıtımı veya sistemleri kötüye kullanmak.',
            'Platform altyapısına yetkisiz erişim veya aşırı yük oluşturma girişimleri.',
          ]),
        ],
      },
      {
        heading: '5. Planlar, Limitler ve Ödeme',
        blocks: [
          p(
            'Hizmet; ücretsiz ve ücretli paketler hâlinde sunulur. Her paketin site/sayfa limitleri, AI kredi kuralları ve özellik kapsamı fiyatlandırma sayfasında belirtilir. Ücretli paketler seçtiğiniz ödeme dönemine göre (aylık/yıllık) ücretlendirilir.',
          ),
        ],
      },
      {
        heading: '6. Hesabın Askıya Alınması ve Sonlandırma',
        blocks: [
          p(
            'Bu koşulların ihlali, yasa dışı kullanım veya ödemenin gerçekleşmemesi hâlinde hesabınızı askıya alabilir veya sonlandırabiliriz. Hesabınızı dilediğiniz zaman kapatabilirsiniz.',
          ),
        ],
      },
      {
        heading: '7. Fikri Mülkiyet',
        blocks: [
          p(
            'Platform’un yazılımı, tasarımı ve markaları GLOVAL AI’a aittir. Oluşturduğunuz site içeriğinin hak sahibi ise sizsiniz; hizmeti sunabilmemiz için gerekli sınırlı kullanım hakkını bize vermiş olursunuz.',
          ),
        ],
      },
      {
        heading: '8. Üçüncü Taraf Hizmetler ve Alan Adı',
        blocks: [
          p(
            'Alan adı kaydı/yenilemesi ve bazı entegrasyonlar üçüncü taraf sağlayıcılar üzerinden yürür. Bu hizmetlerin kendi koşulları ve ücretleri geçerli olabilir.',
          ),
        ],
      },
      {
        heading: '9. Sorumluluğun Sınırı',
        blocks: [
          p(
            'Hizmet "olduğu gibi" sunulur. Mevzuatın izin verdiği ölçüde, dolaylı zararlardan sorumlu değiliz. Tüketici mevzuatından doğan haklarınız saklıdır.',
          ),
        ],
      },
      {
        heading: '10. Değişiklikler ve İletişim',
        blocks: [
          p(
            `Bu koşulları güncelleyebiliriz; güncel sürüm bu sayfada yayımlanır. Sorularınız için ${COMPANY.supportEmail}.`,
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Terms of Use',
    description:
      'The terms that apply when using GLOVAL AI services; account, content, limits, payment and responsibilities.',
    intro: [
      `These Terms of Use govern your use of the ${COMPANY.brandName} services. By using the service, you are deemed to have accepted these terms.`,
    ],
    sections: [
      {
        heading: '1. Description of the Service',
        blocks: [
          p(
            'GLOVAL AI is a SaaS platform that offers AI-powered website creation, editing, publishing, hosting/publishing infrastructure, custom domain connection and related digital services.',
          ),
        ],
      },
      {
        heading: '2. Account Creation and Security',
        blocks: [
          list([
            'You are responsible for creating your account with accurate and up-to-date information.',
            'You are responsible for your account security and the confidentiality of your login credentials.',
            'You must notify us immediately if you notice unauthorised use.',
          ]),
        ],
      },
      {
        heading: '3. AI-Generated and User Content',
        blocks: [
          list([
            'You are responsible for the content you generate or upload and for its lawfulness.',
            'AI output may be inaccurate; it is your responsibility to review it before publishing.',
            'You may not upload content that infringes the intellectual property rights of others.',
          ]),
        ],
      },
      {
        heading: '4. Prohibited Use',
        blocks: [
          p('The following actions are prohibited:'),
          list([
            'Publishing unlawful, misleading, hateful or fraudulent content.',
            'Phishing, distributing malware or abusing systems.',
            'Attempting unauthorised access to, or overloading, the Platform infrastructure.',
          ]),
        ],
      },
      {
        heading: '5. Plans, Limits and Payment',
        blocks: [
          p(
            'The service is offered in free and paid packages. Each package’s site/page limits, AI credit rules and feature scope are stated on the pricing page. Paid packages are charged according to the billing cycle you choose (monthly/yearly).',
          ),
        ],
      },
      {
        heading: '6. Suspension and Termination of Account',
        blocks: [
          p(
            'We may suspend or terminate your account in case of breach of these terms, unlawful use or non-payment. You may close your account at any time.',
          ),
        ],
      },
      {
        heading: '7. Intellectual Property',
        blocks: [
          p(
            'The Platform’s software, design and trademarks belong to GLOVAL AI. You own the rights to the site content you create; you grant us the limited right of use necessary for us to provide the service.',
          ),
        ],
      },
      {
        heading: '8. Third-Party Services and Domains',
        blocks: [
          p(
            'Domain registration/renewal and some integrations run through third-party providers. These services may have their own terms and fees.',
          ),
        ],
      },
      {
        heading: '9. Limitation of Liability',
        blocks: [
          p(
            'The service is provided "as is". To the extent permitted by law, we are not liable for indirect damages. Your rights arising from consumer legislation are reserved.',
          ),
        ],
      },
      {
        heading: '10. Changes and Contact',
        blocks: [
          p(
            `We may update these terms; the current version is published on this page. For questions, ${COMPANY.supportEmail}.`,
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Mesafeli Satış Sözleşmesi — Distance Sales Agreement                        */
/* -------------------------------------------------------------------------- */

const distanceSales: LegalDoc = {
  slug: 'mesafeli-satis-sozlesmesi',
  tr: {
    title: 'Mesafeli Satış Sözleşmesi',
    description:
      'GLOVAL AI dijital hizmet/abonelik satışına ilişkin mesafeli satış sözleşmesi.',
    intro: [
      'İşbu Mesafeli Satış Sözleşmesi, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamında, dijital hizmet aboneliği satışına ilişkin olarak taraflar arasında elektronik ortamda kurulmuştur.',
    ],
    sections: [
      {
        heading: '1. Taraflar — Hizmet Sağlayıcı (Satıcı)',
        blocks: [
          list([
            `Unvan: ${COMPANY.legalName}`,
            `Adres: ${COMPANY.address}`,
            `E-posta: ${COMPANY.supportEmail}`,
            `Telefon: ${COMPANY.phone}`,
          ]),
        ],
      },
      {
        heading: '2. Taraflar — Alıcı (Müşteri)',
        blocks: [
          p(
            'Alıcı, hesap oluştururken ve ödeme aşamasında verdiği ad-soyad, e-posta ve fatura bilgileriyle belirlenen kullanıcıdır. Bu bilgiler sipariş kaydında saklanır.',
          ),
        ],
      },
      {
        heading: '3. Sözleşmenin Konusu ve Hizmetin Niteliği',
        blocks: [
          p(
            'Sözleşmenin konusu, Alıcı’nın Platform üzerinden seçtiği dijital hizmet paketidir (ör. STARTER, PRO, E-Ticaret veya siteye özel ek haklar). Hizmet fiziksel bir ürün olmayıp elektronik ortamda sunulan dijital bir hizmettir.',
          ),
        ],
      },
      {
        heading: '4. Fiyat, Vergiler ve Ödeme',
        blocks: [
          list([
            'Seçilen paketin fiyatı, vergiler dâhil toplam tutar olarak ödeme ekranında gösterilir.',
            'Ödeme, lisanslı ödeme kuruluşunun (ör. PayTR) güvenli altyapısı üzerinden yapılır; kart bilgileri Satıcı tarafından saklanmaz.',
            'Ödeme onaylanmadan hizmet aktif edilmez.',
          ]),
        ],
      },
      {
        heading: '5. Hizmetin İfası (Aktivasyon)',
        blocks: [
          p(
            'Ödeme onayının alınmasının ardından, seçilen paket hesabınıza tanımlanır ve ilgili özellikler kullanıma açılır. Dijital hizmette "teslimat", paketin hesabınızda aktive edilmesi ve panelden erişilebilir hâle gelmesidir.',
          ),
        ],
      },
      {
        heading: '6. Sözleşme Süresi ve Yenileme',
        blocks: [
          p(
            'Abonelik, seçilen ödeme dönemi (aylık/yıllık) boyunca geçerlidir. Yenileme koşulları paket sayfasında belirtildiği şekilde uygulanır; aboneliğinizi dönem sonunda iptal edebilirsiniz.',
          ),
        ],
      },
      {
        heading: '7. Cayma Hakkı',
        blocks: [
          p(
            'Mesafeli Sözleşmeler Yönetmeliği uyarınca, tüketicinin onayıyla ifasına başlanan ve anında ifa edilen dijital içerik/hizmetlerde cayma hakkı, ifaya başlanmasıyla sona erebilir. Bu nedenle satın alma sırasında, hizmetin hemen ifa edilmesini onayladığınızda ve bu durumda cayma hakkınızın sona erebileceğini kabul ettiğinizde, aktivasyon sonrası cayma hakkı kullanılamayabilir.',
          ),
          p(
            'Hizmetin ifasına henüz başlanmamışsa, teslimden (aktivasyondan) itibaren 14 gün içinde cayma hakkınızı kullanabilirsiniz. Somut durumun değerlendirilmesi için İptal ve İade Koşulları sayfamıza bakınız.',
          ),
        ],
      },
      {
        heading: '8. Tarafların Yükümlülükleri',
        blocks: [
          list([
            'Satıcı, hizmeti tanımlandığı şekilde sunmakla yükümlüdür.',
            'Alıcı, doğru bilgi vermek ve hizmeti Kullanım Koşulları’na uygun kullanmakla yükümlüdür.',
          ]),
        ],
      },
      {
        heading: '9. Uyuşmazlıkların Çözümü',
        blocks: [
          p(
            'Uyuşmazlıklarda, ilgili mevzuatın belirlediği parasal sınırlar dâhilinde Tüketici Hakem Heyetleri ve Tüketici Mahkemeleri yetkilidir.',
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Distance Sales Agreement',
    description:
      'Distance sales agreement for the sale of GLOVAL AI digital services/subscriptions.',
    intro: [
      'This Distance Sales Agreement has been established electronically between the parties in relation to the sale of a digital service subscription, within the scope of Turkish Consumer Protection Law No. 6502 and the Regulation on Distance Contracts.',
    ],
    sections: [
      {
        heading: '1. Parties — Service Provider (Seller)',
        blocks: [
          list([
            `Legal name: ${COMPANY.legalName}`,
            `Address: ${COMPANY.address}`,
            `Email: ${COMPANY.supportEmail}`,
            `Phone: ${COMPANY.phone}`,
          ]),
        ],
      },
      {
        heading: '2. Parties — Buyer (Customer)',
        blocks: [
          p(
            'The Buyer is the user identified by the full name, email and billing details provided during account creation and at the payment stage. This information is kept in the order record.',
          ),
        ],
      },
      {
        heading: '3. Subject of the Agreement and Nature of the Service',
        blocks: [
          p(
            'The subject of the agreement is the digital service package the Buyer selects on the Platform (e.g. STARTER, PRO, E-Commerce or site-specific add-on rights). The service is not a physical product but a digital service provided electronically.',
          ),
        ],
      },
      {
        heading: '4. Price, Taxes and Payment',
        blocks: [
          list([
            'The price of the selected package is shown on the payment screen as a total amount including taxes.',
            'Payment is made through the secure infrastructure of a licensed payment institution (e.g. PayTR); card details are not stored by the Seller.',
            'The service is not activated until payment is confirmed.',
          ]),
        ],
      },
      {
        heading: '5. Performance of the Service (Activation)',
        blocks: [
          p(
            'After payment confirmation is received, the selected package is assigned to your account and the relevant features are made available. In a digital service, "delivery" means the package being activated on your account and made accessible from the dashboard.',
          ),
        ],
      },
      {
        heading: '6. Term and Renewal',
        blocks: [
          p(
            'The subscription is valid for the selected billing cycle (monthly/yearly). Renewal conditions apply as stated on the package page; you can cancel your subscription at the end of the period.',
          ),
        ],
      },
      {
        heading: '7. Right of Withdrawal',
        blocks: [
          p(
            'Pursuant to the Regulation on Distance Contracts, for digital content/services whose performance begins with the consumer’s consent and which are performed instantly, the right of withdrawal may end once performance has begun. Therefore, when at the time of purchase you approve immediate performance of the service and accept that your right of withdrawal may thereby end, the right of withdrawal may not be exercisable after activation.',
          ),
          p(
            'If performance of the service has not yet begun, you may exercise your right of withdrawal within 14 days of delivery (activation). See our Cancellation & Refund page for assessment of the specific situation.',
          ),
        ],
      },
      {
        heading: '8. Obligations of the Parties',
        blocks: [
          list([
            'The Seller is obliged to provide the service as described.',
            'The Buyer is obliged to provide accurate information and to use the service in accordance with the Terms of Use.',
          ]),
        ],
      },
      {
        heading: '9. Dispute Resolution',
        blocks: [
          p(
            'In disputes, the Consumer Arbitration Committees and Consumer Courts have jurisdiction within the monetary limits set by the relevant legislation.',
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Ön Bilgilendirme Formu — Pre-Sale Information Form                          */
/* -------------------------------------------------------------------------- */

const preInfo: LegalDoc = {
  slug: 'on-bilgilendirme-formu',
  tr: {
    title: 'Ön Bilgilendirme Formu',
    description:
      'Ödeme öncesinde dijital hizmet aboneliğine ilişkin temel bilgiler: hizmet, fiyat, vergiler, süre, iptal ve cayma.',
    intro: [
      'Bu form, ödeme yapmadan önce satın alacağınız dijital hizmete ilişkin temel bilgileri sunar. Paketinize özgü kesin bilgiler (seçilen paket, fiyat, vergiler ve toplam tutar) ödeme ekranında ayrıca gösterilir.',
    ],
    sections: [
      {
        heading: '1. Hizmet Sağlayıcı',
        blocks: [
          list([
            `Unvan: ${COMPANY.legalName}`,
            `Adres: ${COMPANY.address}`,
            `E-posta: ${COMPANY.supportEmail}`,
            `Telefon: ${COMPANY.phone}`,
          ]),
        ],
      },
      {
        heading: '2. Hizmetin Temel Özellikleri',
        blocks: [
          p(
            'Yapay zeka destekli web sitesi oluşturma, yayınlama, barındırma ve seçilen pakete göre ek özellikler (özel alan adı, artırılmış site/sayfa limitleri, AI kredileri, e-ticaret modülü vb.). Paket kapsamı fiyatlandırma sayfasında ayrıntılıdır.',
          ),
        ],
      },
      {
        heading: '3. Fiyat, Vergiler ve Ödeme Yöntemi',
        blocks: [
          list([
            'Seçtiğiniz paketin vergiler dâhil toplam tutarı ödeme ekranında gösterilir.',
            'Ödeme, lisanslı ödeme kuruluşu (ör. PayTR) üzerinden kredi/banka kartı ile yapılır.',
          ]),
        ],
      },
      {
        heading: '4. Hizmetin Başlaması ve Süresi',
        blocks: [
          p(
            'Ödeme onaylandıktan sonra paket hesabınıza tanımlanır ve hizmet aktif olur. Abonelik seçtiğiniz ödeme dönemi boyunca geçerlidir.',
          ),
        ],
      },
      {
        heading: '5. İptal, İade ve Cayma Hakkı',
        blocks: [
          p(
            'Aboneliğinizi dilediğiniz zaman iptal edebilirsiniz. Anında ifa edilen dijital hizmetlerde, ifaya başlanmasıyla cayma hakkı sona erebilir. Ayrıntılar İptal ve İade Koşulları ile Mesafeli Satış Sözleşmesi sayfalarındadır.',
          ),
        ],
      },
      {
        heading: '6. Şikâyet ve Başvuru',
        blocks: [
          p(
            `Talep ve şikâyetlerinizi ${COMPANY.supportEmail} adresine iletebilir; ayrıca yasal başvuru mercilerine (Tüketici Hakem Heyeti/Mahkemesi) başvurabilirsiniz.`,
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Pre-Sale Information Form',
    description:
      'Key information about the digital service subscription before payment: service, price, taxes, term, cancellation and withdrawal.',
    intro: [
      'This form provides key information about the digital service you are about to purchase before you pay. The exact details specific to your package (selected package, price, taxes and total amount) are shown separately on the payment screen.',
    ],
    sections: [
      {
        heading: '1. Service Provider',
        blocks: [
          list([
            `Legal name: ${COMPANY.legalName}`,
            `Address: ${COMPANY.address}`,
            `Email: ${COMPANY.supportEmail}`,
            `Phone: ${COMPANY.phone}`,
          ]),
        ],
      },
      {
        heading: '2. Main Features of the Service',
        blocks: [
          p(
            'AI-powered website creation, publishing, hosting and, depending on the selected package, additional features (custom domain, increased site/page limits, AI credits, e-commerce module, etc.). The package scope is detailed on the pricing page.',
          ),
        ],
      },
      {
        heading: '3. Price, Taxes and Payment Method',
        blocks: [
          list([
            'The total amount of your selected package, including taxes, is shown on the payment screen.',
            'Payment is made by credit/debit card through a licensed payment institution (e.g. PayTR).',
          ]),
        ],
      },
      {
        heading: '4. Commencement and Term of the Service',
        blocks: [
          p(
            'After payment is confirmed, the package is assigned to your account and the service becomes active. The subscription is valid for the billing cycle you selected.',
          ),
        ],
      },
      {
        heading: '5. Cancellation, Refund and Right of Withdrawal',
        blocks: [
          p(
            'You can cancel your subscription at any time. For digital services performed instantly, the right of withdrawal may end once performance has begun. Details are on the Cancellation & Refund and Distance Sales Agreement pages.',
          ),
        ],
      },
      {
        heading: '6. Complaints and Applications',
        blocks: [
          p(
            `You can send your requests and complaints to ${COMPANY.supportEmail}; you may also apply to the legal bodies (Consumer Arbitration Committee/Court).`,
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* İptal ve İade Koşulları — Cancellation & Refund                             */
/* -------------------------------------------------------------------------- */

const refund: LegalDoc = {
  slug: 'iptal-ve-iade',
  tr: {
    title: 'İptal ve İade Koşulları',
    description:
      'GLOVAL AI aboneliklerinde iptal, iade, yenileme ve üçüncü taraf (alan adı) maliyetlerine ilişkin koşullar.',
    intro: [
      'Bu politika, dijital hizmet/abonelik yapısına uygun olarak iptal ve iade koşullarını açıklar. Tüketici mevzuatından doğan haklarınız saklıdır.',
    ],
    sections: [
      {
        heading: '1. Abonelik İptali',
        blocks: [
          p(
            'Aboneliğinizi hesabınızın Faturalandırma bölümünden dilediğiniz zaman iptal edebilirsiniz. İptal, mevcut ödeme döneminin sonunda geçerli olur; dönem sonuna kadar hizmete erişiminiz sürer.',
          ),
        ],
      },
      {
        heading: '2. Ödeme Sonrası İade',
        blocks: [
          list([
            'Henüz ifasına başlanmamış (aktive edilmemiş) hizmetlerde, mevzuat kapsamındaki cayma süresi içinde iade talep edebilirsiniz.',
            'Kullanılmaya başlanmış (aktive edilmiş) dijital hizmetlerde, anında ifa nedeniyle iade her zaman mümkün olmayabilir; talebiniz somut duruma göre değerlendirilir.',
            'Onaylı iadeler, ödemeyi yaptığınız yöntem üzerinden makul süre içinde gerçekleştirilir.',
          ]),
        ],
      },
      {
        heading: '3. Paket Değişikliği ve Yenileme',
        blocks: [
          p(
            'Paketler arasında yükseltme/düşürme yapabilirsiniz; fark tutarı kıst esasına göre hesaplanabilir. Yenileme, seçilen ödeme dönemine göre uygulanır.',
          ),
        ],
      },
      {
        heading: '4. Başarısız, Yanlış veya Mükerrer Ödemeler',
        blocks: [
          p(
            `Başarısız ödemelerde hizmet aktive edilmez. Yanlış veya mükerrer (çift) tahsilat durumunda, tespit edilen fazla tutar iade edilir. Bu tür durumları ${COMPANY.supportEmail} adresine bildirin.`,
          ),
        ],
      },
      {
        heading: '5. Alan Adı ve Üçüncü Taraf Maliyetleri',
        blocks: [
          p(
            'Alan adı kaydı/yenilemesi gibi üçüncü taraf sağlayıcılara ödenen ve geri alınamayan maliyetler, ilgili işlem tamamlandıktan sonra kural olarak iade edilmez. Bu maliyetler, abonelik ücretinden ayrı olarak değerlendirilir.',
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Cancellation & Refund Terms',
    description:
      'Terms for cancellation, refund, renewal and third-party (domain) costs on GLOVAL AI subscriptions.',
    intro: [
      'This policy explains cancellation and refund terms in line with the digital service/subscription model. Your rights arising from consumer legislation are reserved.',
    ],
    sections: [
      {
        heading: '1. Subscription Cancellation',
        blocks: [
          p(
            'You can cancel your subscription at any time from the Billing section of your account. Cancellation takes effect at the end of the current billing period; your access to the service continues until the end of the period.',
          ),
        ],
      },
      {
        heading: '2. Refund After Payment',
        blocks: [
          list([
            'For services whose performance has not yet begun (not activated), you can request a refund within the withdrawal period provided by legislation.',
            'For digital services already in use (activated), a refund may not always be possible due to instant performance; your request is assessed based on the specific situation.',
            'Approved refunds are processed within a reasonable time through the method you used to pay.',
          ]),
        ],
      },
      {
        heading: '3. Package Change and Renewal',
        blocks: [
          p(
            'You can upgrade/downgrade between packages; the difference may be calculated on a pro-rata basis. Renewal applies according to the selected billing cycle.',
          ),
        ],
      },
      {
        heading: '4. Failed, Incorrect or Duplicate Payments',
        blocks: [
          p(
            `The service is not activated for failed payments. In case of an incorrect or duplicate (double) charge, the excess amount identified is refunded. Report such cases to ${COMPANY.supportEmail}.`,
          ),
        ],
      },
      {
        heading: '5. Domain and Third-Party Costs',
        blocks: [
          p(
            'Non-recoverable costs paid to third-party providers, such as domain registration/renewal, are as a rule not refunded once the relevant transaction is complete. These costs are assessed separately from the subscription fee.',
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Dijital Hizmet Sunumu — Digital Service Delivery Terms                      */
/* -------------------------------------------------------------------------- */

const delivery: LegalDoc = {
  slug: 'hizmet-sunumu',
  tr: {
    title: 'Dijital Hizmet Sunum Koşulları',
    description:
      'GLOVAL AI dijital hizmetinin nasıl sunulduğu (aktivasyon, panel erişimi, yayınlama) ve zamanlaması.',
    intro: [
      'GLOVAL AI fiziksel ürün satmaz; kargo veya fiziksel teslimat yoktur. Hizmet tamamen dijital ortamda sunulur. Bu sayfa, hizmetin size nasıl ulaştığını açıklar.',
    ],
    sections: [
      {
        heading: '1. Hesap Oluşturma',
        blocks: [
          p(
            'E-posta ile ücretsiz hesap oluşturarak Platform’a erişirsiniz. Ücretsiz paket kapsamında site oluşturmaya hemen başlayabilirsiniz.',
          ),
        ],
      },
      {
        heading: '2. Ödeme Onayı ve Aktivasyon',
        blocks: [
          p(
            'Ücretli bir paket satın aldığınızda, ödeme onayının alınmasının ardından paket hesabınıza tanımlanır. Aktivasyon normal şartlarda anında gerçekleşir; ödeme kuruluşu kaynaklı doğrulama süreçlerinde kısa gecikmeler olabilir.',
          ),
        ],
      },
      {
        heading: '3. Panel Erişimi ve Site Oluşturma',
        blocks: [
          p(
            'Aktivasyon sonrası paketinizin özellikleri (artırılmış limitler, AI kredileri, e-ticaret modülü vb.) panelinizde kullanıma açılır. Yapay zeka ile sitenizi oluşturabilir ve düzenleyebilirsiniz.',
          ),
        ],
      },
      {
        heading: '4. Yayınlama ve Alan Adı Bağlama',
        blocks: [
          p(
            'Sitenizi tek tıkla yayınlayabilirsiniz. Yayınlanan siteniz varsayılan olarak bir alt alan adında erişilebilir; dilerseniz kendi özel alan adınızı bağlayabilirsiniz. Alan adı doğrulama/DNS süreçleri sağlayıcıya bağlı olarak zaman alabilir.',
          ),
        ],
      },
      {
        heading: '5. Hizmetin Kullanılabilir Hâle Gelme Zamanı',
        blocks: [
          p(
            'Özetle: ödeme onaylandığı anda hizmet kullanıma açılır. Herhangi bir gecikme yaşarsanız destek ekibimizle iletişime geçebilirsiniz.',
          ),
        ],
      },
    ],
  },
  en: {
    title: 'Digital Service Delivery Terms',
    description:
      'How the GLOVAL AI digital service is delivered (activation, dashboard access, publishing) and its timing.',
    intro: [
      'GLOVAL AI does not sell physical products; there is no shipping or physical delivery. The service is provided entirely in digital form. This page explains how the service reaches you.',
    ],
    sections: [
      {
        heading: '1. Account Creation',
        blocks: [
          p(
            'You access the Platform by creating a free account with your email. Within the free package you can start creating a site right away.',
          ),
        ],
      },
      {
        heading: '2. Payment Confirmation and Activation',
        blocks: [
          p(
            'When you purchase a paid package, the package is assigned to your account after payment confirmation is received. Activation normally happens instantly; there may be short delays during verification processes originating from the payment institution.',
          ),
        ],
      },
      {
        heading: '3. Dashboard Access and Site Creation',
        blocks: [
          p(
            'After activation, your package’s features (increased limits, AI credits, e-commerce module, etc.) become available in your dashboard. You can create and edit your site with AI.',
          ),
        ],
      },
      {
        heading: '4. Publishing and Domain Connection',
        blocks: [
          p(
            'You can publish your site with one click. Your published site is accessible on a subdomain by default; you may connect your own custom domain if you wish. Domain verification/DNS processes may take time depending on the provider.',
          ),
        ],
      },
      {
        heading: '5. When the Service Becomes Available',
        blocks: [
          p(
            'In short: the service becomes available the moment payment is confirmed. If you experience any delay, you can contact our support team.',
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Hakkımızda — About Us                                                       */
/* -------------------------------------------------------------------------- */

const about: LegalDoc = {
  slug: 'hakkimizda',
  tr: {
    title: 'Hakkımızda',
    description:
      'GLOVAL AI; yapay zeka ile herkesin dakikalar içinde gerçek bir web sitesi kurabilmesini sağlayan dijital hizmet platformudur.',
    intro: [
      `${COMPANY.brandName}, ${COMPANY.legalName} tarafından işletilen, yapay zeka destekli bir web sitesi oluşturma ve yayınlama platformudur.`,
    ],
    sections: [
      {
        heading: 'Ne Yapıyoruz?',
        blocks: [
          p(
            'Amacımız, teknik bilgi gerektirmeden herkesin fikrini anlatarak dakikalar içinde çalışan, gerçek bir web sitesine sahip olmasını sağlamak. Kullanıcılar ne istediklerini yazar; GLOVAL AI içeriği, tasarımı ve sayfaları oluşturur.',
          ),
        ],
      },
      {
        heading: 'Sunduğumuz Hizmetler',
        blocks: [
          list([
            'Yapay zeka ile web sitesi oluşturma ve düzenleme.',
            'Tek tıkla yayınlama ve barındırma/yayın altyapısı.',
            'Özel alan adı bağlama.',
            'Kurumsal e-posta ve e-ticaret gibi ek dijital hizmetler.',
          ]),
        ],
      },
      {
        heading: 'İletişim',
        blocks: [
          p(
            `Sorularınız ve iş birlikleri için ${COMPANY.supportEmail} adresinden bize ulaşabilirsiniz. Kurumsal bilgilerimizin tamamı İletişim sayfamızda yer alır.`,
          ),
        ],
      },
    ],
  },
  en: {
    title: 'About Us',
    description:
      'GLOVAL AI is a digital service platform that lets anyone build a real website in minutes with AI.',
    intro: [
      `${COMPANY.brandName} is an AI-powered website creation and publishing platform operated by ${COMPANY.legalName}.`,
    ],
    sections: [
      {
        heading: 'What We Do',
        blocks: [
          p(
            'Our goal is to let anyone own a real, working website in minutes just by describing their idea, with no technical knowledge required. Users write what they want; GLOVAL AI creates the content, design and pages.',
          ),
        ],
      },
      {
        heading: 'Services We Offer',
        blocks: [
          list([
            'Website creation and editing with AI.',
            'One-click publishing and hosting/publishing infrastructure.',
            'Custom domain connection.',
            'Additional digital services such as business email and e-commerce.',
          ]),
        ],
      },
      {
        heading: 'Contact',
        blocks: [
          p(
            `For questions and partnerships, you can reach us at ${COMPANY.supportEmail}. All of our corporate details are on our Contact page.`,
          ),
        ],
      },
    ],
  },
}

/* -------------------------------------------------------------------------- */
/* Kayıt — Registry                                                            */
/* -------------------------------------------------------------------------- */

export const LEGAL_DOCS: Record<string, LegalDoc> = {
  [privacy.slug]: privacy,
  [kvkk.slug]: kvkk,
  [cookies.slug]: cookies,
  [terms.slug]: terms,
  [distanceSales.slug]: distanceSales,
  [preInfo.slug]: preInfo,
  [refund.slug]: refund,
  [delivery.slug]: delivery,
  [about.slug]: about,
}

export const LEGAL_SLUGS = Object.keys(LEGAL_DOCS)

export function getLegalDoc(slug: string): LegalDoc | null {
  return LEGAL_DOCS[slug] ?? null
}

/** Canonical in-app path for a legal document. */
export function legalPath(slug: string): string {
  return `/yasal/${slug}`
}
