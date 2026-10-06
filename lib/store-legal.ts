/**
 * Store-facing legal notices for END-CUSTOMER purchases (physical/retail goods).
 *
 * These are DISTINCT from the platform's own SaaS legal documents under
 * `/yasal/*` (`lib/legal/documents.ts`), which describe GLOVAL AI's software
 * service and explicitly disclaim physical goods/shipping. Reusing those for a
 * shopper buying a product would be legally wrong, so the checkout renders
 * these store-scoped notices inline instead.
 *
 * The text is intentionally generic + merchant-agnostic: it states the mandatory
 * distance-selling disclosures (seller identity placeholder, 14-day right of
 * withdrawal, delivery, dispute resolution) and a KVKK clarification, worded so
 * any store owner can rely on it as a baseline. It is informational and should
 * be reviewed by the merchant for their specifics.
 */

export type StoreLegalSection = { heading: string; paragraphs: string[] }
export type StoreLegalDoc = { title: string; sections: StoreLegalSection[] }

/** Mesafeli Satış Sözleşmesi + Ön Bilgilendirme (özet, mağaza bazlı). */
export function buildDistanceSalesNotice(storeName: string): StoreLegalDoc {
  const seller = storeName?.trim() || 'Satıcı'
  return {
    title: 'Mesafeli Satış Sözleşmesi ve Ön Bilgilendirme',
    sections: [
      {
        heading: '1. Taraflar ve Konu',
        paragraphs: [
          `İşbu sözleşme, bir tarafta satıcı "${seller}" ile diğer tarafta siparişi veren alıcı arasında, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca elektronik ortamda kurulur.`,
          'Sözleşmenin konusu, alıcının elektronik ortamda sipariş verdiği ürünlerin satışı ve teslimidir. Sipariş özeti, ürün adı, adedi ve toplam bedeli ödeme adımında alıcıya gösterilir.',
        ],
      },
      {
        heading: '2. Satıcı Bilgileri',
        paragraphs: [
          `Satıcı unvanı: ${seller}. Satıcının açık adres, telefon ve e-posta bilgileri, mağazanın iletişim bölümünde ve sipariş onay e-postasında yer alır.`,
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
export function buildKvkkNotice(storeName: string): StoreLegalDoc {
  const seller = storeName?.trim() || 'Satıcı'
  return {
    title: 'KVKK Aydınlatma Metni',
    sections: [
      {
        heading: 'Veri Sorumlusu',
        paragraphs: [
          `Kişisel verileriniz, veri sorumlusu sıfatıyla "${seller}" tarafından 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında işlenmektedir.`,
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
          'KVKK md. 11 uyarınca; verilerinize erişme, düzeltilmesini veya silinmesini isteme ve işlenmesine itiraz etme haklarına sahipsiniz. Taleplerinizi mağazanın iletişim kanalları üzerinden iletebilirsiniz.',
        ],
      },
    ],
  }
}
