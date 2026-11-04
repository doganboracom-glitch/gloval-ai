export const REFERRAL_TERMS_VERSION = 'v1.0'
export const REFERRAL_TERMS_UPDATED_AT = '2026-11-04'

export const REFERRAL_TERMS = {
  tr: {
    title: 'Satış Ortaklığı Programı Şartları',
    description:
      'GLOVAL AI Satış Ortaklığı Programı katılım, yönlendirme, uygunluk ve gizlilik şartları.',
    intro: [
      'Bu şartlar, GLOVAL AI Satış Ortaklığı Programı’na katılımı ve yönlendirme kayıtlarının takibini düzenler. Programa katılmadan önce metnin tamamını okuyunuz.',
    ],
    sections: [
      {
        heading: '1. Program ve ödeme koşulları',
        paragraphs: [
          'Yönlendirme kayıtları programın geçerli şartlarına göre değerlendirilir. Ödeme koşulları ayrıca duyurulacaktır.',
        ],
      },
      {
        heading: '2. Uygun yönlendirme ve yeni müşteri',
        paragraphs: [
          'Yönlendirme yalnızca daha önce Gloval AI hesabı bulunmayan yeni müşteriler için geçerlidir. Önceden hesabı, aboneliği veya ücretli planı olan kullanıcılar yeni müşteri sayılmaz.',
          'Kendi hesabınız, kontrol ettiğiniz hesaplar veya sizin adınıza hareket eden kişiler üzerinden kendinize yönlendirme yapamazsınız. Kendi yönlendirme bağlantınızı kullanarak kayıt veya ödeme oluşturmak yasaktır.',
        ],
      },
      {
        heading: '3. Tanıtım kuralları',
        paragraphs: [
          '“gloval” markalı kelimesini arama reklamlarında anahtar kelime olarak satın alamaz veya reklam metninde yanıltıcı biçimde kullanamazsınız. Gloval AI adına yetkili olduğunuzu ima edemezsiniz.',
          'Yanıltıcı veya kanıtlanmamış gelir beyanları, istenmeyen toplu ileti, sahte hesap, marka taklidi veya yürürlükteki mevzuata aykırı tanıtım yapılamaz.',
        ],
      },
      {
        heading: '4. İade, iptal ve geçersiz işlemler',
        paragraphs: [
          'İlk ücretli plan ödemesi iade edilir, iptal edilir, ters ibrazla geri alınır veya geçersiz işlem olarak belirlenirse ilgili yönlendirme uygun sayılmaz. Sahtecilik ya da kuralları aşma şüphesinde yönlendirmeler inceleme tamamlanana kadar bekletilebilir.',
        ],
      },
      {
        heading: '5. Vergi ve belgeler',
        paragraphs: [
          'Satış ortağı, kendi vergi statüsünün ve yükümlülüklerinin takibinden; mevzuatın gerektirdiği makbuz, fatura veya diğer belgelerin düzenlenmesinden ve doğru ödeme bilgisi sağlamaktan sorumludur.',
        ],
      },
      {
        heading: '6. Kişisel veriler ve gizlilik',
        paragraphs: [
          'Yönlendirilen müşterilerin e-posta adresleri panelde maskelenerek gösterilir. Yönlendirme tıklamalarını günlük olarak tekilleştirmek için ham IP adresi saklanmaz; günlük anahtarlı özet kullanılır. Bilgiler yalnız programın güvenliği, yönlendirme ilişkisinin doğrulanması ve istatistiklerin sunulması amacıyla işlenir.',
        ],
      },
      {
        heading: '7. Program durumu ve sürüm',
        paragraphs: [
          'Kural ihlali veya kötüye kullanım şüphesinde ortaklık durumu kapatılabilir. Ortak, ayarlar bölümünden ortaklığı kapatabilir. Bu belge sürüm v1.0 olarak 4 Kasım 2026 tarihinde yayımlanmıştır.',
        ],
      },
    ],
  },
  en: {
    title: 'Referral Partner Program Terms',
    description:
      'Participation, referral eligibility, promotion, and privacy terms for the GLOVAL AI Referral Partner Program.',
    intro: [
      'These terms govern participation in the GLOVAL AI Referral Partner Program and the tracking of referrals. Please read the complete terms before joining.',
    ],
    sections: [
      {
        heading: '1. Program and payment terms',
        paragraphs: [
          'Referral records are evaluated under the applicable program terms. Payment terms will be announced separately.',
        ],
      },
      {
        heading: '2. Eligible referrals and new customers',
        paragraphs: [
          'A referral is eligible only for a new customer who has never had a Gloval AI account. A person with a prior account, subscription, or paid plan is not a new customer.',
          'You may not refer yourself through your own account, accounts you control, or people acting on your behalf. Creating a registration or payment through your own referral link is prohibited.',
        ],
      },
      {
        heading: '3. Promotion rules',
        paragraphs: [
          'You may not buy the branded keyword “gloval” for search advertising or use it misleadingly in ad copy. You may not imply that you are authorized to act on behalf of Gloval AI.',
          'Misleading or unsubstantiated income claims, unsolicited bulk messages, fake accounts, impersonation, or promotion that violates applicable law are prohibited.',
        ],
      },
      {
        heading: '4. Refunds, cancellations, and invalid transactions',
        paragraphs: [
          'If the first paid-plan payment is refunded, cancelled, charged back, or determined to be invalid, the referral may be treated as ineligible. Referrals may be held for review when fraud or circumvention is suspected.',
        ],
      },
      {
        heading: '5. Taxes and records',
        paragraphs: [
          'The partner is responsible for determining and meeting their own tax obligations, issuing any receipt, invoice, or other document required by law, and providing accurate payout details.',
        ],
      },
      {
        heading: '6. Personal data and privacy',
        paragraphs: [
          'Referred customers’ email addresses are masked in the dashboard. Raw IP addresses are not stored for referral click deduplication; a daily keyed digest is used instead. Information is processed only to secure the program, verify referral relationships, and provide statistics.',
        ],
      },
      {
        heading: '7. Program status and version',
        paragraphs: [
          'Partnership status may be closed in response to a rule violation or suspected abuse. A partner may close their partnership from settings. This document is version v1.0, published November 4, 2026.',
        ],
      },
    ],
  },
} as const
