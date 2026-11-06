import {
  REFERRAL_COMMISSION_RATE_PERCENT,
  REFERRAL_HOLD_DAYS,
  REFERRAL_MAX_CREDIT_TOPUP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  REFERRAL_VAT_RATE_PERCENT,
  TRY_PER_CREDIT_CENTS,
} from './commission-config'

const minimumPayoutTry = REFERRAL_PAYOUT_MIN_CENTS / 100
const minimumPayoutEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(minimumPayoutTry)
const vatMultiplier = ((100 + REFERRAL_VAT_RATE_PERCENT) / 100).toFixed(2)
const creditValueTry = TRY_PER_CREDIT_CENTS / 100
const maxCreditTopupTry = REFERRAL_MAX_CREDIT_TOPUP_CENTS / 100
const maxCreditTopupEn = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(maxCreditTopupTry)

export const REFERRAL_TERMS_VERSION = 'v1.2'
export const REFERRAL_TERMS_UPDATED_AT = '2026-11-06'

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
        heading: '1. Program, komisyon ve ödeme koşulları',
        paragraphs: [
          'Komisyon, yalnızca yönlendirdiğiniz yeni müşterinin ilk başarılı abonelik ödemesi üzerinden, KDV hariç tutarın %20’si olarak hesaplanır.',
          'Kazanılan komisyon 14 gün beklemede kalır; bu süre içinde iptal, iade veya ters ibraz gerçekleşirse komisyon iptal edilir.',
          'Bekleme süresi sonrasında gerçekleşen iadeler bakiyenizde kesintiye veya negatif bakiyeye neden olabilir. Kullanılabilir bakiyeniz en az 1.000 TL olduğunda tamamını veya istediğiniz bir kısmını nakit olarak talep edebilirsiniz; aynı anda yalnızca bir açık ödeme talebiniz olabilir.',
          'Şirket sahibi veya şahıs şirketiyseniz ödeme talebinde KDV hesaplama yönteminizi seçerek fatura düzenlemelisiniz; bireysel veya muaf ortaklar için gider belgesi GLOVAL tarafından hazırlanır ve vergi yükümlülükleri ortağın sorumluluğundadır.',
          'Dilerseniz bekleyen komisyonlarınızı da 14 günün dolmasını beklemeden, en az 3 TL olmak şartıyla AI kredisine dönüştürebilirsiniz. 1 AI kredisi 3 TL değerindedir; kredi adedi yukarı yuvarlanır ve oluşan en fazla 2,99 TL fark GLOVAL AI tarafından karşılanır. Negatif bakiye düzeltmesi bulunan ortaklar yalnızca bakiyelerinin tamamını AI kredisine dönüştürebilir.',
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
          'İlk ücretli abonelik ödemesi iade edilir, iptal edilir, ters ibrazla geri alınır veya geçersiz işlem olarak belirlenirse ilgili komisyon ters kaydedilir. 14 günlük bekleme süresinden sonra oluşan iade veya ters ibraz, daha önce oluşmuş kullanılabilir ya da ödenmiş tutarlara karşı negatif bakiye oluşturabilir. Sahtecilik ya da kuralları aşma şüphesinde yönlendirmeler inceleme tamamlanana kadar bekletilebilir.',
        ],
      },
      {
        heading: '5. Vergi ve belgeler',
        paragraphs: [
          'Katılım formundaki mevcut vergi statüsü seçenekleri “Bireysel” ve “Şirket”tir. Program eşlemesinde “Şirket” (şahıs şirketleri dâhil) nakit ödeme için fatura gerektirir; “Bireysel” bu iş akışında fatura gerektirmez. Bu ürün eşlemesi vergi veya hukuk danışmanlığı değildir; ortağın kendi statüsüne uygulanacak yükümlülükleri doğrulaması gerekir.',
          'Vergi bilgileriniz doğrulanmadan önce yalnızca bir nakit ödeme yapılabilir. İlk nakit ödeme işlendiğinde bilgileriniz hâlâ doğrulanmamışsa ortaklığınız yeni yönlendirmeleri durdurmak üzere otomatik olarak askıya alınır; sonraki nakit ödeme için destek ekibimiz üzerinden doğrulama gerekir. TCKN veya vergi numarası bu uygulamada toplanmaz. Doğrulama, bu şartları yeniden kabul etmenizi gerektirmez.',
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
          'Kural ihlali veya kötüye kullanım şüphesinde ortaklık askıya alınabilir veya kapatılabilir; kötüye kullanım hâlinde bekleyen komisyonlar iptal edilebilir. Askıya alınan ortak yeni tıklama ve kayıt kabul etmez. Bekleyen, kullanılabilir veya talep edilmiş pozitif bakiye ya da açık nakit talebi varken ortaklık kapatılamaz. Bu belge sürüm v1.2 olarak 6 Kasım 2026 tarihinde yayımlanmıştır.',
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
        heading: '1. Program, commissions, and payouts',
        paragraphs: [
          `A commission is earned only on the referred new customer’s first successful paid subscription charge. The commission is ${REFERRAL_COMMISSION_RATE_PERCENT}% of the amount excluding VAT; the VAT-exclusive amount is the gross payment divided by ${vatMultiplier}, rounded down to the kuruş.`, 
          `A commission remains pending for ${REFERRAL_HOLD_DAYS} days after payment. If the first payment is cancelled, refunded, or charged back during that period, the commission is reversed. A refund or chargeback after the hold may create a negative adjustment to the partner balance.`, 
          `A cash payout requires at least TRY ${minimumPayoutEn} in available balance; the partner may request all of it or a portion at least that minimum, leaving the remainder in their account. Only one cash request may be open at a time. Partners who must issue invoices (Company, including sole proprietorships, under this program mapping) choose either “VAT included in the amount” or “add VAT on top” when requesting payment; the invoice breakdown and payout are calculated from that choice, and payment is processed after invoice confirmation. No invoice is requested from individual/exempt partners; GLOVAL issues an expense document. The partner remains responsible for determining their tax obligations.`, 
          'You can convert pending commissions to AI credits before the 14-day hold ends.',
          `AI credit conversion has no minimum amount. One credit is worth TRY ${creditValueTry}; the credit count is rounded up and GLOVAL AI covers the difference, up to TRY ${maxCreditTopupEn}. All pending and available commissions, or a smaller eligible amount up to the convertible balance, can be converted before the 14-day hold ends. A partial conversion is unavailable while a future-dated negative balance adjustment exists.`,  
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
          'If the first paid subscription charge is refunded, cancelled, charged back, or determined to be invalid, the related commission is reversed. A refund or chargeback after the 14-day hold may create a negative balance against previously available or paid amounts. Referrals may be held for review when fraud or circumvention is suspected.',
        ],
      },
      {
        heading: '5. Taxes and records',
        paragraphs: [
          'The current tax-status choices are Individual and Company. In this program mapping, Company (including sole proprietorships) requires an invoice for cash payouts; Individual does not require an invoice in this workflow. This product mapping is not tax or legal advice; the partner must verify the obligations that apply to their status.',
          'Only one cash payout may be processed before tax details are verified. If your details are still unverified when the first cash payout is processed, your partnership is automatically suspended from accepting new referrals; verification through our support team is required before the next cash payout. This application does not collect national ID or tax identification numbers. Verification does not require you to accept these terms again.',
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
          'Partnership status may be suspended or closed in response to a rule violation or suspected abuse; pending commissions may be cancelled in cases of abuse. Suspended partners do not accept new clicks or signups. A partnership cannot be closed while a positive pending/available/requested balance or an open cash request remains. This document is version v1.2, published November 6, 2026.'
        ],
      },
    ],
  },
} as const
