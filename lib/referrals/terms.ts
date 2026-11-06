import {
  CREDIT_MIN_CENTS,
  REFERRAL_COMMISSION_RATE_PERCENT,
  REFERRAL_HOLD_DAYS,
  REFERRAL_MAX_CREDIT_TOPUP_CENTS,
  REFERRAL_PAYOUT_MIN_CENTS,
  REFERRAL_VAT_RATE_PERCENT,
  TRY_PER_CREDIT_CENTS,
} from './commission-config'

const minimumPayoutTry = REFERRAL_PAYOUT_MIN_CENTS / 100
const minimumPayoutTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(minimumPayoutTry)
const minimumPayoutEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(minimumPayoutTry)
const minimumCreditTry = CREDIT_MIN_CENTS / 100
const minimumCreditTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(minimumCreditTry)
const minimumCreditEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(minimumCreditTry)
const vatMultiplier = ((100 + REFERRAL_VAT_RATE_PERCENT) / 100).toFixed(2)
const creditValueTry = TRY_PER_CREDIT_CENTS / 100
const maxCreditTopupTry = REFERRAL_MAX_CREDIT_TOPUP_CENTS / 100
const maxCreditTopupTr = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(maxCreditTopupTry)
const maxCreditTopupEn = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(maxCreditTopupTry)

export const REFERRAL_TERMS_VERSION = 'v1.1'
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
        heading: '1. Program, komisyon ve ödeme koşulları',
        paragraphs: [
          `Komisyon yalnızca yönlendirilen yeni müşterinin ilk başarılı abonelik ödemesi için hesaplanır. Komisyon, KDV hariç tutarın %${REFERRAL_COMMISSION_RATE_PERCENT}’sidir; KDV hariç tutar, brüt ödeme tutarının ${vatMultiplier.replace('.', ',')}’ye bölünmesiyle hesaplanır ve kuruş aşağı yuvarlanır.`,
          `Komisyon ödeme tarihinden itibaren ${REFERRAL_HOLD_DAYS} gün beklemede kalır. İlk ödeme bu süre içinde iptal edilir, iade edilir veya ters ibraz edilirse komisyon ters kayıtla iptal edilir. Bekleme süresi geçtikten sonraki bir iade veya ters ibraz, ortak bakiyesinde negatif düzeltme oluşturabilir.`, 
          `Nakit ödeme talebi için en az ${minimumPayoutTr} TL kullanılabilir bakiye gerekir; bu tutarın tamamı veya en az bu eşik kadar bir bölümü istenebilir ve kalan bakiye ortak hesabında kalır. Aynı anda yalnızca bir açık nakit talebi bulunabilir. Fatura kesmesi gereken şirket ortakları (şahıs şirketleri dâhil) talep sırasında “KDV dahil, tutarın içinden” veya “KDV üstüne ekle” modunu seçer; fatura dökümü ve ödenecek tutar seçime göre hesaplanır, ödeme fatura onayından sonra işlenir. Bireysel/muaf ortaklardan fatura istenmez; gider belgesi GLOVAL tarafından düzenlenir. Vergi yükümlülüklerinin değerlendirilmesi ortağın sorumluluğundadır.`, 
          '14 günlük bekleme süresi dolmadan toplam komisyon bakiyenizi AI kredisine çevirebilirsiniz. Minimum dönüşüm tutarı yoktur ve krediye çevrim sırasında 1 kredi = 3 TL olarak hesaplanır.',
          `AI kredisine dönüştürmede 1 kredi ${creditValueTry} TL değerindedir; kredi adedi yukarı yuvarlanır ve aradaki en fazla ${maxCreditTopupTr} TL tutarındaki fark GLOVAL AI tarafından karşılanır. Dönüşüm için en az ${minimumCreditTr} TL gerekir; bekleyen ve kullanılabilir komisyonların tamamı veya bu eşiği karşılayan daha düşük bir tutar, toplam dönüştürülebilir bakiye sınırında ve 14 günlük bekleme süresi dolmadan AI kredisine çevrilebilir. Negatif gelecek bakiye düzeltmesi varken yalnızca bakiyenin tamamı dönüştürülebilir.`, 
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
          'Kural ihlali veya kötüye kullanım şüphesinde ortaklık askıya alınabilir veya kapatılabilir; kötüye kullanım hâlinde bekleyen komisyonlar iptal edilebilir. Askıya alınan ortak yeni tıklama ve kayıt kabul etmez. Bekleyen, kullanılabilir veya talep edilmiş pozitif bakiye ya da açık nakit talebi varken ortaklık kapatılamaz. Bu belge sürüm v1.1 olarak 4 Kasım 2026 tarihinde yayımlanmıştır.',
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
          'You can convert your total commission balance to AI credits before the 14-day waiting period ends. There is no minimum conversion amount, and one credit is calculated at TRY 3.',
          `For AI credit conversion, one credit is worth TRY ${creditValueTry}. The credit count is rounded up and GLOVAL AI covers the difference, up to TRY ${maxCreditTopupEn}. Conversion requires at least TRY ${minimumCreditEn}; all pending and available commissions or a smaller eligible amount up to the convertible balance can be converted before the 14-day hold ends. A partial conversion is unavailable while a future-dated negative balance adjustment exists.`, 
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
          'Partnership status may be suspended or closed in response to a rule violation or suspected abuse; pending commissions may be cancelled in cases of abuse. Suspended partners do not accept new clicks or signups. A partnership cannot be closed while a positive pending/available/requested balance or an open cash request remains. This document is version v1.1, published November 4, 2026.'
        ],
      },
    ],
  },
} as const
