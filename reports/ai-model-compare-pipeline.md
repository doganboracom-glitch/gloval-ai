# Model karşılaştırması (gpt-5-mini / claude-sonnet-5.5)

Tarih: 2026-10-14T19:56:32.551Z | Tekrar sayısı: 2 | Üretimdeki `AI_TIER_MODELS`: standard=`openai/gpt-5-mini`, advanced=`openai/gpt-5-mini` (bu araç değiştirmez)

## Gateway kimlik ve fiyat doğrulaması

| Model | Gateway'de çözüldü | Giriş $/1M token | Çıkış $/1M token |
|---|---|---|---|
| `openai/gpt-5-mini` | evet | 0.25 | 2.00 |
| `anthropic/claude-sonnet-5.5` | evet | 2.00 | 10.00 |

## Özet (işlem bazında, tüm brief ve tekrarlar)

Maliyet: USD, gateway liste fiyatı (token başına), önbellek/rejyonal ek ücret yok.

| İşlem | Model | Başarılı / Toplam | Şema hatası | Kural ihlali (başarılı çıktılarda) | Ort. süre (sn) | Ort. giriş tok. | Ort. çıkış tok. | Ort. maliyet ($) | Ort. İngilizce sızıntı | Ort. Türkçe karakter |
|---|---|---|---|---|---|---|---|---|---|---|
| Site üretimi | `gpt-5-mini` | 6/6 | 0 | 4/6 | 58.5 | 6475 | 9642 | 0.021 | 0.0 | 500 |
| Site üretimi | `claude-sonnet-5.5` | 6/6 | 0 | 6/6 | 44.8 | 12237 | 6881 | 0.093 | 0.0 | 468 |
| Bölüm düzenleme | `gpt-5-mini` | 6/6 | 0 | 0/6 | 6.5 | 4020 | 814 | 0.0026 | 0.0 | 48 |
| Bölüm düzenleme | `claude-sonnet-5.5` | 6/6 | 0 | 0/6 | 3.8 | 8690 | 603 | 0.023 | 0.0 | 45 |
| Ürün metni | `gpt-5-mini` | 6/6 | 0 | 0/6 | 11.1 | 465 | 1749 | 0.0036 | 0.0 | 58 |
| Ürün metni | `claude-sonnet-5.5` | 6/6 | 0 | 0/6 | 5.0 | 1070 | 584 | 0.0080 | 0.0 | 68 |

"Şema hatası": model çıktısı Zod şemasını geçemedi, süre aşımı veya API hatası; üretimde bu durumda determinist yedek (fallback) devreye girer. "Kural ihlali": şemayı geçti ama istem kuralını bozdu (ör. yanlış buton metni, contact konumu, uydurma ölçü).

## Mücevher e-ticaret

> Kadıköy merkezli, el yapımı gümüş ve altın takı satan şık bir online mağaza kurmak istiyorum. Yüzük, kolye ve bileklik koleksiyonları olacak, sepet ve ödeme olsun.

### Mücevher e-ticaret: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 88.2 sn | 9969 giriş / 14905 çıkış tok. | $0.032 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Kadıköy Takı Atölyesi | **Slogan:** El yapımı gümüş ve altın takılar | **SEO:** Kadıköy Gümüş Altın Takı
**Sayfalar:** Anasayfa, Ürünler, Sepet, Ödeme

1. **hero**
   - `badge`: Yeni Sezon
   - `trustText`: Ücretsiz kargo 500₺ ve üzeri • İstanbul içi aynı gün gönderim
   - `slides[0].badge`: El yapımı
   - `slides[0].title`: Kadıköy Atölyesinden Özel Koleksiyon
   - `slides[0].description`: El işçiliğiyle üretilmiş gümüş ve 14K altın parçalar — günlük kullanım için zarif tasarımlar.
   - `slides[0].primaryButton.label`: Şimdi Alışveriş Yap
   - `slides[0].secondaryButton.label`: Koleksiyona Gözat
   - `slides[0].image.alt`: Vitrinde altın ve pırlanta takılar, koyu kadife zemin
   - `slides[0].image.position`: background
2. **categories**
   - `title`: Mağaza
   - `subtitle`: Koleksiyonlara göre alışveriş yapın
   - `items[0].name`: Yüzükler
   - `items[0].description`: Günlük kullanıma uygun ince ve taşlı yüzükler.
   - `items[0].count`: 120 ürün
   - `items[0].alt`: Kadife üzerinde el yapımı gümüş yüzük
   - `items[1].name`: Kolye & Uçlar
   - `items[1].description`: Minimal ve gösterişli kolye seçenekleri, 14K altın seçenekleriyle.
   - `items[1].count`: 85 ürün
3. **products**
   - `title`: Öne Çıkan Ürünler
   - `subtitle`: Atölyemizin en çok beğenilen parçaları
   - `layout`: grid
   - `source`: manual
   - `collection`: onecikan-urunler
   - `viewAllLabel`: Tüm Ürünleri Gör
   - `items[0].name`: El Yapımı Gümüş İnce Yüzük
   - `items[0].price`: ₺399
   - `items[0].badge`: Yeni
4. **features**
   - `title`: Neden Biz
   - `subtitle`: Güvenle alışveriş yapmanın 4 nedeni
   - `items[0].title`: Hızlı Teslimat
   - `items[0].description`: İstanbul içi aynı gün veya ertesi gün teslimat seçenekleri.
   - `items[1].title`: Kolay İade
   - `items[1].description`: 14 gün koşulsuz iade garantisi ile güvenli alışveriş.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ve kartla güvenli ödeme altyapısı.
   - `items[3].title`: Uzman Destek
5. **stats**
   - `title`: Mağaza Bilgileri
   - `subtitle`: Kısa bilgiler
   - `items[0].value`: 5.000+
   - `items[0].label`: Memnun Müşteri
   - `items[1].value`: 1.200+
   - `items[1].label`: Satılan Parça
   - `items[2].value`: %99
   - `items[2].label`: Güvenli Ödeme Başarısı
   - `items[3].value`: 2 yıldır
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı süreli indirimli ürünler
   - `layout`: carousel
   - `source`: sale
   - `collection`: hafta-firsatlari
   - `viewAllLabel`: Tüm Fırsatları Gör
   - `items[0].name`: Sonsuzluk Gümüş Yüzük - İndirimli
   - `items[0].price`: ₺319
   - `items[0].oldPrice`: ₺399
7. **testimonials**
   - `title`: Müşteri Yorumları
   - `items[0].quote`: Kadıköy Takı Atölyesi'nden aldığım yüzük tam istediğim gibi; el işçiliği ve paketleme harika.
   - `items[0].author`: Elif A.
   - `items[0].role`: İstanbul
   - `items[1].quote`: Hızlı gönderim ve ürün açıklaması birebir uyuyordu. İade süreci de çok kolaydı.
   - `items[1].author`: Mert K.
   - `items[1].role`: Kadıköy
   - `items[2].quote`: Altın kolyem beklediğimden daha zarif çıktı. Atölye ile birebir iletişim faydalı oldu.
   - `items[2].author`: Ayşe D.
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürede teslim edilir?
   - `items[0].answer`: İstanbul içi aynı gün veya ertesi gün teslimat seçenekleri mevcut. Türkiye içi standart kargo 2-5 iş günü içinde teslim edilir.
   - `items[1].question`: İade şartları nelerdir?
   - `items[1].answer`: Ürün teslim tarihinden itibaren 14 gün içinde, orijinal ambalajı ve kullanılmamış olması koşuluyla iade kabul edilir. Kişiye özel/özel ölçü ürünlerde 
   - `items[2].question`: Ödemeyi nasıl yapabilirim?
   - `items[2].answer`: 3D Secure destekli kredi/banka kartı ile veya kapıda ödeme seçenekleri (bölgesel) kullanılabilir. Ayrıca taksit seçenekleri mevcuttur.
   - `items[3].question`: Ürün bakımı için önerileriniz var mı?
   - `items[3].answer`: Gümüş takılarınızı parlak tutmak için yumuşak bir bezle düzenli silin ve kimyasallardan uzak tutun. Altın parçalar için nazik temizlik öneriyoruz; ağı
9. **cta**
   - `title`: Şimdi Şık Bir Parça Seçin
   - `description`: Kadıköy atölyesinden çıkan el yapımı takılar az sayıda üretimle sunulur — favorinizi kaçırmayın.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Koleksiyonlara Gözat
10. **contact**
   - `title`: İletişim
   - `description`: Sipariş, bakım ve özel tasarım talepleriniz için bizimle iletişime geçin. Yanıtlarımız genellikle aynı iş günü içinde gönderilir.
   - `email`: <e-posta>
   - `recipientEmail`: <e-posta>
   - `phone`: <telefon>
   - `address`: Kadıköy, İstanbul
   - `fields[0]`: İsim
   - `fields[1]`: E-posta
   - `fields[2]`: Mesaj
11. **footer**
   - `tagline`: El işçiliğiyle Kadıköy'den sevgiyle gönderilir
   - `columns[0].title`: Alışveriş
   - `columns[0].links[0].label`: Ürünler
   - `columns[0].links[1].label`: Koleksiyonlar
   - `columns[0].links[2].label`: Haftanın Fırsatları
   - `columns[1].title`: Destek
   - `columns[1].links[0].label`: İade Politikası
   - `columns[1].links[1].label`: Kargo Bilgileri
   - `columns[1].links[2].label`: İletişim

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 42.3 sn | 4947 giriş / 7335 çıkış tok. | $0.016 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Kadıköy Atölye Takı | **Slogan:** El yapımı gümüş ve altın tasarımlar | **SEO:** Kadıköy El Yapımı Takı
**Sayfalar:** Ana Sayfa, Ürünler, Hakkımızda, İletişim

1. **hero**
   - `badge`: Yeni Koleksiyon
   - `title`: Kadıköy Atölye: El Yapımı Altın & Gümüş
   - `description`: Özenle işlenmiş yüzük, kolye ve bileklikler. Özel tasarım, sınırlı sayıda üretim. Güvenli ödeme, hızlı kargo.
   - `primaryButton.label`: Yeni Gelenler
   - `secondaryButton.label`: Koleksiyonlara Göz At
   - `trustText`: Kadıköy'den Türkiye'ye güvenli gönderim ve 14 gün iade
   - `slides[0].badge`: İlkbahar 2026
   - `slides[0].title`: İnci & Minimalizm
   - `slides[0].description`: El yapımı incili kolyelerimizle zarafeti keşfedin.
2. **categories**
   - `title`: Koleksiyonlar
   - `subtitle`: Tarzınıza uygun el yapımı parçalar
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tek taş, minimal ve imzalı yüzük tasarımları.
   - `items[0].count`: 120 ürün
   - `items[0].alt`: El yapımı altın ve gümüş yüzükler koyu kadife üzerinde
   - `items[1].name`: Kolye & İnci
   - `items[1].description`: İnci, zincir ve kişiye özel kolyeler.
   - `items[1].count`: 85 ürün
3. **products**
   - `title`: Öne Çıkan Ürünler
   - `subtitle`: El işçiliği ile hazırlanmış favorilerimiz
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm Ürünleri Gör
   - `items[0].name`: Luna 14K Altın İnce Yüzük
   - `items[0].price`: ₺2.499
   - `items[0].oldPrice`: ₺3.199
   - `items[0].badge`: %22
4. **features**
   - `title`: Neden Kadıköy Atölye?
   - `subtitle`: Güven ve kalite önceliğimizdir
   - `items[0].title`: Hızlı & İzlenebilir Kargo
   - `items[0].description`: Tüm siparişler Türkiye içi izlenebilir kargo ile gönderilir; ortalama 2-4 iş günü.
   - `items[1].title`: Kolay İade 14 Gün
   - `items[1].description`: Ürünü aldığınız gibi iade edebilir, değişim talep edebilirsiniz.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ile banka kartı ve taksit seçenekleri; SSL ile korunur.
   - `items[3].title`: Atölyeden Doğrudan
5. **stats**
   - `title`: Hızla Büyüyen Topluluk
   - `subtitle`: İstatistiklerimizle güven veriyoruz
   - `items[0].value`: 5K+
   - `items[0].label`: Memnun Müşteri
   - `items[1].value`: 12 Yıl
   - `items[1].label`: Sektör Deneyimi
   - `items[2].value`: 24/7
   - `items[2].label`: Müşteri Desteği
   - `items[3].value`: %98
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı süreli indirimler — stoklarla sınırlı
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm İndirimler
   - `items[0].name`: Luna 14K Altın İnce Yüzük
   - `items[0].price`: ₺2.499
   - `items[0].oldPrice`: ₺3.199
   - `items[0].badge`: %22
7. **testimonials**
   - `title`: Müşteri Yorumları
   - `items[0].quote`: Eşim için aldığım kolye tam istediğim gibi çıktı; işçilik mükemmel ve paketlemesi zarifti.
   - `items[0].author`: Merve A.
   - `items[0].role`: Kadıköy
   - `items[1].quote`: Hızlı gönderim ve nazik iletişim. İade süreci de çok kolaydı.
   - `items[1].author`: Kerem Y.
   - `items[1].role`: İstanbul
   - `items[2].quote`: El yapımı yüzükler hem rahat hem şık. Atölyeye uğrayıp tasarım yaptırdım, çok memnunum.
   - `items[2].author`: Selin D.
8. **faq**
   - `title`: Sıkça Sorulanlar
   - `items[0].question`: Kargolar ne kadar sürede teslim ediliyor?
   - `items[0].answer`: Türkiye içi teslimatlar genellikle 2-4 iş günü içinde teslim edilir. Özel tasarım talepleri için süre uzayabilir; ürün sayfasında belirtilir.
   - `items[1].question`: İade ve değişim koşulları nelerdir?
   - `items[1].answer`: Ürün teslim tarihinden itibaren 14 gün içinde iade kabul edilir. Ürün kullanılmamış, orijinal kutusunda ve etiketsiz olmalıdır. Kişiye özel gravürlü ü
   - `items[2].question`: Ödeme seçenekleri nelerdir?
   - `items[2].answer`: Kredi/banka kartı (3D Secure), kapıda ödeme (stoktaki ürünler için), ve taksit seçenekleri sunuyoruz. Bazı kampanyalar taksit sınırlamaları içerebilir
   - `items[3].question`: Ürün temizliği ve bakımı nasıl olmalı?
   - `items[3].answer`: Gümüş ürünler için nazikçe yumuşak bir bezle temizleyin. Altın ve pırlanta parçaları kimyasal maddelerden uzak tutun; uzun ömür için kullanım sonrası 
9. **cta**
   - `title`: Kadıköy Atölye'den Şimdi Alın
   - `description`: El yapımı takılarımızdan birini seçin — sınırlı sayıda ve stoklarla sınırlı. Güvenli ödeme ve özenli paketleme garantisi.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Bize Ulaşın
10. **contact**
   - `title`: İletişim
   - `description`: Sipariş, özel tasarım veya atölye randevuları için bize yazın. Yanıt genellikle 24 saat içinde.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Kadıköy, İstanbul — Atölye randevuları için lütfen önce mesaj atın
   - `fields[0]`: İsim
   - `fields[1]`: E-posta
   - `fields[2]`: Mesaj
11. **footer**
   - `tagline`: Kadıköy Atölye — El yapımı takıda kalite
   - `columns[0].title`: Mağaza
   - `columns[0].links[0].label`: Koleksiyonlar
   - `columns[0].links[1].label`: Yeni Gelenler
   - `columns[0].links[2].label`: Haftalık Fırsatlar
   - `columns[1].title`: Yardım
   - `columns[1].links[0].label`: SSS
   - `columns[1].links[1].label`: İade Politikası
   - `columns[1].links[2].label`: Kargo Bilgileri

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 75.9 sn | 21427 giriş / 12169 çıkış tok. | $0.165 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Kadıköy Atölye Takı | **Slogan:** El yapımı gümüş ve altın takılar, Kadıköy'den kapınıza | **SEO:** Kadıköy El Yapımı Gümüş Takı
**Sayfalar:** Ana Sayfa, Ürünler, Hakkımızda, İletişim

1. **hero**
   - `badge`: Yeni Sezon Koleksiyonu
   - `title`: El Yapımı Gümüş ve Altın Takılar
   - `description`: Kadıköy atölyemizde üretilen eşsiz parçalar.
   - `primaryButton.label`: Koleksiyonu Keşfet
   - `secondaryButton.label`: Fırsatları Gör
   - `trustText`: 2.500+ mutlu müşteri · Ücretsiz kargo 1.500₺ üzeri
   - `image.alt`: Kadife üzerinde ışıklandırılmış altın ve pırlanta takılar
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
2. **categories**
   - `title`: Koleksiyonlara Göz At
   - `subtitle`: Her tarza uygun el yapımı parçalar
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tek taş, alyans ve minimal yüzükler
   - `items[0].count`: 42 ürün
   - `items[0].alt`: Altın ve gümüş yüzükler
   - `items[1].name`: Kolyeler
   - `items[1].description`: Zarif zincirler ve özel tasarım kolye uçları
   - `items[1].count`: 36 ürün
3. **products**
   - `title`: Çok Satan Ürünler
   - `subtitle`: Müşterilerimizin en çok tercih ettiği el yapımı parçalar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Tek Taş Zirkon Gümüş Yüzük
   - `items[0].price`: ₺1.290
   - `items[0].oldPrice`: ₺1.590
   - `items[0].badge`: %19
4. **features**
   - `title`: Güvenle Alışveriş Yapın
   - `subtitle`: Her siparişte yanınızdayız
   - `items[0].title`: Hızlı Kargo
   - `items[0].description`: Siparişleriniz 1-2 iş gününde sigortalı olarak kargoya verilir.
   - `items[1].title`: Kolay İade
   - `items[1].description`: 14 gün içinde koşulsuz iade ve değişim imkânı.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ve 12 aya varan taksit seçenekleri.
   - `items[3].title`: Müşteri Desteği
5. **stats**
   - `title`: Rakamlarla Atölyemiz
   - `items[0].value`: 2.500+
   - `items[0].label`: Mutlu Müşteri
   - `items[1].value`: 120+
   - `items[1].label`: Özgün Tasarım
   - `items[2].value`: %98
   - `items[2].label`: Memnuniyet
   - `items[3].value`: 10 Yıl
   - `items[3].label`: Atölye Tecrübesi
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Bu hafta seçili parçalarda sınırlı süreli indirim
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatları gör
   - `items[0].name`: Gümüş Kalp Kolye
   - `items[0].price`: ₺740
   - `items[0].oldPrice`: ₺990
   - `items[0].badge`: %25
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Yüzük fotoğraftakinden bile güzel geldi. Paketleme çok özenliydi, nişan hediyesi olarak harikaydı.
   - `items[0].author`: Elif K.
   - `items[0].role`: Kadıköy
   - `items[1].quote`: El işçiliği gerçekten belli oluyor. Kolyem iki gündür hiç çıkmadı boynumdan.
   - `items[1].author`: Zeynep A.
   - `items[1].role`: İstanbul
   - `items[2].quote`: Beden değişimi çok kolay oldu, müşteri hizmetleri çok ilgiliydi.
   - `items[2].author`: Mert D.
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürede gelir?
   - `items[0].answer`: Siparişler 1-2 iş günü içinde sigortalı olarak kargoya verilir, teslimat genelde 2-4 iş günüdür. 1.500₺ üzeri siparişlerde kargo ücretsizdir.
   - `items[1].question`: İade ve değişim yapabilir miyim?
   - `items[1].answer`: Kullanılmamış ürünleri 14 gün içinde iade edebilir veya değiştirebilirsiniz. Kişiye özel kazımalı ürünler hariçtir.
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Tüm kredi/banka kartları, 3D Secure ile 12 aya varan taksit ve havale/EFT ile ödeme yapabilirsiniz.
   - `items[3].question`: Ürünler gerçek gümüş ve altın mı?
   - `items[3].answer`: Gümüş ürünlerimiz 925 ayar, altın ürünlerimiz 14 veya 18 ayardır ve ayar damgalıdır.
9. **cta**
   - `title`: Size Özel Bir Parça Bulalım
   - `description`: İlk siparişinizde HOSGELDIN10 koduyla %10 indirim kazanın.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Bize Ulaşın
10. **contact**
   - `title`: İletişim
   - `description`: Sorularınız veya kişiye özel tasarım talepleriniz için bize yazın. Kadıköy atölyemizde sizi ağırlamaktan memnuniyet duyarız.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Kadıköy, İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
11. **footer**
   - `tagline`: Kadıköy'de el yapımı gümüş ve altın takılar.
   - `columns[0].title`: Mağaza
   - `columns[0].links[0].label`: Yüzükler
   - `columns[0].links[1].label`: Kolyeler
   - `columns[0].links[2].label`: Bileklikler
   - `columns[1].title`: Yardım
   - `columns[1].links[0].label`: SSS
   - `columns[1].links[1].label`: İletişim
   - `columns[1].links[2].label`: Hakkımızda

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 40.6 sn | 10648 giriş / 6293 çıkış tok. | $0.084 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Moda Atölye Takı | **Slogan:** Kadıköy'den el yapımı gümüş ve altın takılar | **SEO:** Kadıköy El Yapımı Gümüş Altın Takı
**Sayfalar:** Ana Sayfa, Ürünler, Atölyemiz, İletişim

1. **hero**
   - `badge`: Yeni Sezon Koleksiyonu
   - `title`: El Yapımı Takılarla Işığınızı Yansıtın
   - `description`: Kadıköy atölyemizde ustalarımızın elinden çıkan gümüş ve altın takılar.
   - `primaryButton.label`: Koleksiyonu Keşfet
   - `secondaryButton.label`: Fırsatları Gör
   - `trustText`: 2.500+ mutlu müşteri · Ücretsiz hediye paketi
   - `image.alt`: Koyu kadife üzerinde spot ışığı altında altın ve elmas takılar sergilenen lüks vitrin
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
2. **categories**
   - `title`: Koleksiyonlara Göz Atın
   - `subtitle`: Her tarza ve her ana uygun el yapımı parçalar
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tek taş, alyans ve tasarım yüzükler
   - `items[0].count`: 64 ürün
   - `items[0].alt`: Altın ve gümüş yüzük koleksiyonu
   - `items[1].name`: Kolyeler
   - `items[1].description`: Zarif ince zincirler ve kolye uçları
   - `items[1].count`: 82 ürün
3. **products**
   - `title`: Çok Satan Takılar
   - `subtitle`: Müşterilerimizin en çok tercih ettiği el yapımı parçalar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Lale Tek Taş Yüzük
   - `items[0].price`: ₺2.450
   - `items[0].oldPrice`: ₺2.990
   - `items[0].badge`: %18
4. **features**
   - `title`: Güvenle Alışveriş Yapın
   - `subtitle`: Her siparişte yanınızdayız
   - `items[0].title`: Hızlı Kargo
   - `items[0].description`: Siparişleriniz 1-2 iş gününde sigortalı olarak kargoda.
   - `items[1].title`: 14 Gün Kolay İade
   - `items[1].description`: Memnun kalmazsanız koşulsuz iade ve değişim.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ve 12 aya varan taksit seçenekleri.
   - `items[3].title`: Hediye Paketi
5. **stats**
   - `title`: Rakamlarla Atölyemiz
   - `items[0].value`: 2.500+
   - `items[0].label`: Mutlu Müşteri
   - `items[1].value`: 12 Yıl
   - `items[1].label`: Usta İşçilik
   - `items[2].value`: 4,9/5
   - `items[2].label`: Müşteri Puanı
   - `items[3].value`: %99
   - `items[3].label`: Zamanında Teslimat
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sadece bu hafta geçerli özel fiyatlar
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatları gör
   - `items[0].name`: Damla Gümüş Kolye
   - `items[0].price`: ₺990
   - `items[0].oldPrice`: ₺1.450
   - `items[0].badge`: %32
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Nişan yüzüğümüzü atölyeden sipariş ettik, işçilik muhteşemdi. Kutusu ve paketlemesi de çok şıktı.
   - `items[0].author`: Elif Yıldız
   - `items[0].role`: Moda, İstanbul
   - `items[1].quote`: Annem için aldığım altın kolye tam zamanında geldi. Fotoğraflardan bile güzel görünüyordu.
   - `items[1].author`: Mert Kaya
   - `items[1].role`: Ankara
   - `items[2].quote`: Beden değişimi çok kolay oldu, destek ekibi hemen yardımcı oldu. Gümüş bileklik her gün takıyorum.
   - `items[2].author`: Zeynep Aksoy
8. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürer?
   - `items[0].answer`: Siparişler 1-2 iş günü içinde sigortalı olarak kargoya verilir; teslimat genellikle 2-4 iş günüdür. 1.500 TL üzeri siparişlerde kargo ücretsizdir.
   - `items[1].question`: İade ve değişim nasıl yapılır?
   - `items[1].answer`: Kullanılmamış ürünleri 14 gün içinde ücretsiz iade veya değiştirebilirsiniz. Kişiye özel kazımalı ürünlerde iade yapılamaz.
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Tüm kredi ve banka kartları, 3D Secure ile 12 aya varan taksit ve havale/EFT ile ödeme yapabilirsiniz.
   - `items[3].question`: Ürünler gerçek gümüş ve altın mı?
   - `items[3].answer`: Evet, gümüş ürünlerimiz 925 ayar, altın ürünlerimiz 14 veya 18 ayardır ve ayar damgalı olarak sertifikayla gönderilir.
9. **cta**
   - `title`: İlk Siparişinize %10 İndirim
   - `description`: Bültenimize katılın, HOSGELDIN10 koduyla ilk alışverişinizde indirim kazanın.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Bize Ulaşın
10. **contact**
   - `title`: Bize Ulaşın
   - `description`: Sipariş, kişiye özel tasarım ve ölçü konularında sorularınız için yazın; atölyemizi Kadıköy'de ziyaret edebilirsiniz.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Caferağa Mah. Moda Cd., Kadıköy / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
11. **footer**
   - `tagline`: Kadıköy'den el yapımı gümüş ve altın takılar.
   - `columns[0].title`: Alışveriş
   - `columns[0].links[0].label`: Yüzükler
   - `columns[0].links[1].label`: Kolyeler
   - `columns[0].links[2].label`: Bileklikler
   - `columns[0].links[3].label`: Küpeler
   - `columns[1].title`: Müşteri Hizmetleri
   - `columns[1].links[0].label`: Kargo ve Teslimat
   - `columns[1].links[1].label`: İade ve Değişim

</details>

### Mücevher e-ticaret: Bölüm düzenleme

Talimat: _Ana başlığı daha sıcak ve davetkar bir tonda yeniden yaz, birincil buton metnini "Koleksiyonu Keşfet" yap._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 7.1 sn | 4102 giriş / 883 çıkış tok. | $0.0028</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş'e hoş geldiniz — tarzınızı keşfetmeye davetlisiniz
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Yapımı Gümüş — tarzınızı yansıtan ürünler
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Ürünleri İncele
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 7.2 sn | 4102 giriş / 918 çıkış tok. | $0.0029</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş'e Hoş Geldiniz — Tarzınıza Sıcak Bir Dokunuş
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Yapımı Gümüş — tarzınızı yansıtan ürünler
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Ürünleri İncele
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.4 sn | 8836 giriş / 742 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: El emeği gümüşle tarzınıza sıcak bir dokunuş
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: El emeği gümüşle tarzınıza sıcak bir dokunuş
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Koleksiyonu Keşfet
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.5 sn | 8836 giriş / 746 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: El emeği gümüşlerle tarzınıza sıcak bir dokunuş
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: El emeği gümüşlerle tarzınıza sıcak bir dokunuş
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Koleksiyonu Keşfet
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

### Mücevher e-ticaret: Ürün metni

Ürün: **Zirkon Taşlı Tektaş Yüzük** (Renk: Gümüş)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 11.3 sn | 472 giriş / 1878 çıkış tok. | $0.0039</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, zarif ve sade bir görünüm sunar. Gümüş renkli tasarımıyla gündelik veya özel kullanımlarda kolayca kombinlenir.



- Zarif tektaş görünüm

- Parlak zirkon taş detayı

- Gümüş renkli şık tasarım

- Kolay kombinlenebilir

**Özellikler:** Ürün adı: Zirkon Taşlı Tektaş Yüzük; Taş: Zirkon; Stil: Tektaş; Renk: Gümüş; Malzeme: - (doğrula); Beden / Ölçü: - (doğrula); Ağırlık: - (doğrula); Marka: - (doğrula); Fotoğraf sayısı: 0

**SEO başlık (33):** Zirkon Taşlı Tektaş Yüzük - Gümüş

**SEO açıklama (100):** Gümüş renkli zirkon taşlı tektaş yüzük. Zarif ve sade tasarımıyla farklı kombinlerde kullanılabilir.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 10.2 sn | 472 giriş / 1612 çıkış tok. | $0.0033</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, tektaş formuyla sade ve gösterişli bir görünüm sunar. Gümüş renkli tasarımı zarif ve şık bir duruş sağlar.



- Zarif tektaş tasarım

**Özellikler:** Ürün Adı: Zirkon Taşlı Tektaş Yüzük; Renk: Gümüş; Taş: Zirkon; Model: Tektaş; Malzeme: - (doğrula); Beden / Numara: - (doğrula); Ağırlık: - (doğrula)

**SEO başlık (33):** Zirkon Taşlı Tektaş Yüzük - Gümüş

**SEO açıklama (82):** Zirkon taşlı tektaş yüzük, gümüş renkli zarif görünümüyle klasik bir şıklık sunar.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.1 sn | 1078 giriş / 475 çıkış tok. | $0.0069</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, sade ve zarif tasarımıyla günlük kullanımda da özel günlerde de şıklığınızı tamamlar. Gümüş rengi ve tek taş detayı sayesinde birçok kombinle kolayca uyum sağlar. Hem kendinize hem de sevdiklerinize düşünceli bir hediye seçeneği sunar.



- Tek taş zirkon detayıyla zarif görünüm

- Gümüş rengi sayesinde kolay kombinlenebilir

- Sade tasarımıyla günlük kullanıma uygun

- Hediye için şık bir seçenek

**Özellikler:** Renk: Gümüş; Taş: Zirkon; Model: Tektaş yüzük; Materyal: - (doğrula)

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük - Gümüş Renk

**SEO açıklama (113):** Zirkon taşlı gümüş renkli tektaş yüzük ile şıklığınızı tamamlayın. Sade, zarif ve günlük kullanıma uygun tasarım.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.4 sn | 1078 giriş / 520 çıkış tok. | $0.0074</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, sade ve şık tasarımıyla günlük kombinlerinize zarif bir dokunuş katar. Gümüş rengi ve tek taş detayı sayesinde hem gündüz hem özel davetlerde rahatça kullanılabilir. Kendiniz için ya da sevdikleriniz için düşünceli bir hediye seçeneğidir.



- Tek taş tasarımıyla zarif ve sade bir görünüm

- Gümüş rengi sayesinde birçok kombinle uyum sağlar

- Günlük kullanıma ve özel günlere uygun

- Hediye için şık bir seçenek

**Özellikler:** Renk: Gümüş; Taş Türü: Zirkon; Model: Tektaş yüzük; Materyal: - (doğrula); Ölçü: - (doğrula)

**SEO başlık (53):** Zirkon Taşlı Tektaş Yüzük - Gümüş Renk | Şık Aksesuar

**SEO açıklama (116):** Gümüş renkli Zirkon Taşlı Tektaş Yüzük ile tarzınızı tamamlayın. Sade, zarif ve her kombine uyumlu şık bir aksesuar.

</details>

## Yoga stüdyosu

> Beşiktaş'ta butik bir yoga ve pilates stüdyosu açtım. Sakin, doğal bir site istiyorum; ders programı, eğitmenler ve randevu alma bölümü olsun.

### Yoga stüdyosu: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 90.4 sn | 9799 giriş / 14977 çıkış tok. | $0.032 | ihlal: 2</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi) / hero badge yok

**Ad:** Beşiktaş Yoga & Pilates | **Slogan:** Butik stüdyo — sakin, doğal pratik | **SEO:** Beşiktaş Yoga Stüdyosu
**Sayfalar:** Ana Sayfa, Ürünler, Hakkımızda, Eğitmenler

1. **hero**
   - `trustText`: Beşiktaş'ta deneyimli eğitmenler — küçük gruplar ve özel ders
   - `slides[0].badge`: Yeni Dönem
   - `slides[0].title`: Yaz Dönemi Kursları Başladı
   - `slides[0].description`: Hatha, Vinyasa ve Pilates derslerimizle bedeninizi ve zihninizi dengeleyin. Küçük gruplar, maksimum özen.
   - `slides[0].primaryButton.label`: Ders Programı
   - `slides[0].secondaryButton.label`: Randevu Al
   - `slides[0].image.alt`: Gün ışığı alan sakin yoga stüdyosu, rulo matlar ve bitkilerle
   - `slides[0].image.position`: background
   - `slides[1].badge`: Butik Mağaza
2. **categories**
   - `title`: Alışveriş Kategorileri
   - `subtitle`: Stüdyo kalitesinde malzemeler ve ders paketleri
   - `items[0].name`: Mat & Aksesuar
   - `items[0].description`: Doğal kauçuk matlar, taşıma kayışları ve bloklar.
   - `items[0].count`: 24 ürün
   - `items[0].alt`: Mat ve aksesuarlar
   - `items[1].name`: Yoga Giysileri
   - `items[1].description`: Nefes alabilen, organik kumaşlardan tayt ve üstler.
   - `items[1].count`: 18 ürün
3. **products**
   - `title`: Öne Çıkan Ürünler
   - `subtitle`: Sınıf kalitesinde ekipmanlar — stüdyo onaylı
   - `layout`: grid
   - `source`: manual
   - `collection`: butik-urunler
   - `viewAllLabel`: Tüm Ürünleri Gör
   - `items[0].name`: Doğal Kauçuk Yoga Matı
   - `items[0].price`: ₺499
   - `items[0].oldPrice`: ₺599
4. **features**
   - `title`: Neden Biz
   - `subtitle`: Stüdyo değerlerimiz ve müşteri güvencemiz
   - `items[0].title`: Hızlı Teslimat
   - `items[0].description`: Stüdyo ve Beşiktaş içi hızlı teslimat seçenekleri.
   - `items[1].title`: Kolay İade
   - `items[1].description`: 14 gün içinde koşulsuz iade imkânı (kullanılmamış ürünlerde).
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ile banka ve kart güvenliği sağlanır.
   - `items[3].title`: Stüdyo Desteği
5. **stats**
   - `title`: Stüdyo Bilgileri
   - `subtitle`: Sayılarla küçük ama etkili
   - `items[0].value`: 5+
   - `items[0].label`: Yıllık Deneyim
   - `items[1].value`: 1.200+
   - `items[1].label`: Gerçekleştirilen Ders
   - `items[2].value`: 98%
   - `items[2].label`: Memnuniyet Oranı
   - `items[3].value`: 4.9/5
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı stok — kampanyaları kaçırmayın
   - `layout`: carousel
   - `source`: sale
   - `collection`: hafta-firsatlari
   - `viewAllLabel`: Tüm Fırsatları Gör
   - `items[0].name`: Mat + Havlu Seti
   - `items[0].price`: ₺559
   - `items[0].oldPrice`: ₺689
7. **testimonials**
   - `title`: Müşteri Yorumları
   - `items[0].quote`: Stüdyo ortamı gerçekten huzurlu; eğitmenler kişisel olarak ilgileniyor. Haftalık paketlerimle enerjim arttı.
   - `items[0].author`: Aylin K.
   - `items[0].role`: Düzenli Üye
   - `items[1].quote`: Mat ve havlu seti çok kaliteli, sıcak yogada kayma yaşamadım. Kargo hızlı geldi.
   - `items[1].author`: Murat T.
   - `items[1].role`: Ürün Alıcısı
   - `items[2].quote`: Özel dersler sayesinde bel ağrılarım azaldı. Eğitmenler profesyonel ve dikkatli.
   - `items[2].author`: Sebnem Ö.
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Kargo ve teslimat süreleri nasıl?
   - `items[0].answer`: Beşiktaş içi aynı gün ya da 1 iş günü; Türkiye içi kargo 2-4 iş günü arasında teslim edilir. Sipariş onayı sonrası bilgilendirme yapılır.
   - `items[1].question`: İade ve değişim şartları nelerdir?
   - `items[1].answer`: Kullanılmamış ürünler için 14 gün içinde iade kabul edilir. İade sürecinde ürünle birlikte fatura gereklidir. İade politikası detayları site üzerindek
   - `items[2].question`: Ders iptali veya randevu erteleme nasıl yapılır?
   - `items[2].answer`: Randevu veya ders iptali için dersin başlamasından en az 12 saat önce iletişime geçilmelidir. Geç iptaller için ders paketi içeriğine göre kurallar uy
   - `items[3].question`: Ödeme seçenekleri nelerdir?
   - `items[3].answer`: Kredi/banka kartı ile tek çekim, taksit seçenekleri ve kapıda ödeme (Beşiktaş içine özel) desteklenmektedir.
9. **cta**
   - `title`: Daha İyi Hissetmek İçin İlk Adımı Atın
   - `description`: Küçük gruplar veya özel derslerle bedeninizi ve zihninizi dengeleyin. İlk dersinizi şimdi planlayın.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ders Programı
10. **contact**
   - `title`: İletişim & Randevu
   - `description`: Ders programı ve bire bir randevu talepleriniz için formu doldurun veya aşağıdaki bilgilerden bize ulaşın.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Beşiktaş, İstanbul — Stüdyo Adresi (Randevu ile giriş)
   - `fields[0]`: İsim
   - `fields[1]`: E-posta
   - `fields[2]`: Ders/Tarih
   - `fields[3]`: Mesaj
11. **footer**
   - `tagline`: Beşiktaş'ta sakin ve özenli yoga deneyimi
   - `columns[0].title`: Keşfet
   - `columns[0].links[0].label`: Ders Programı
   - `columns[0].links[1].label`: Eğitmenler
   - `columns[0].links[2].label`: Ürünler
   - `columns[1].title`: Yardım
   - `columns[1].links[0].label`: Sıkça Sorulan Sorular
   - `columns[1].links[1].label`: İade Politikası
   - `columns[1].links[2].label`: Gizlilik

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 43.3 sn | 4862 giriş / 7216 çıkış tok. | $0.016 | ihlal: 2</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi) / seoTitle marka adını tekrar ediyor

**Ad:** Beşiktaş Yoga | **Slogan:** Butik yoga & pilates stüdyosu Beşiktaş'ta | **SEO:** Beşiktaş Yoga Stüdyosu
**Sayfalar:** Ana Sayfa, Ürünler, Eğitmenler, Ders Programı, Hakkımızda

1. **hero**
   - `badge`: Yeni Sezon
   - `title`: Beşiktaş'ta Sakin Bir Yoga Deneyimi
   - `description`: Küçük gruplar, dikkatli rehberlik ve doğal bir ortam. Mat kiralama, ders paketleri ve butik ekipmanlarla taşınabilir huzur.
   - `primaryButton.label`: Ders Programına Gözat
   - `secondaryButton.label`: Randevu Al
   - `trustText`: Ücretsiz tanışma dersi • 7/24 online rezervasyon
   - `slides[0].badge`: Hoş Geldiniz
   - `slides[0].title`: Butik stüdyo & küçük gruplar
   - `slides[0].description`: Sınırlı kontenjanlarla kişisel ilgi. Başlangıç seviyesinden ileriye uygun dersler.
2. **categories**
   - `title`: Kategorilerle Kolayca Seçin
   - `subtitle`: Ders paketleri, bireysel seanslar ve stüdyo aksesuarları
   - `items[0].name`: Ders Paketleri
   - `items[0].description`: 10'lu ve aylık sınıf paketleri — ekonomik ve esnek.
   - `items[0].count`: 10 paket
   - `items[0].alt`: Ders paketleri görseli
   - `items[1].name`: Tekli Ders & Özel Seans
   - `items[1].description`: Bire bir rehberlik, ihtiyaç odaklı planlama.
   - `items[1].count`: Özel oturumlar
3. **products**
   - `title`: Öne Çıkan Ürünler & Paketler
   - `subtitle`: En çok tercih edilen ders paketleri ve butik ekipmanlar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm Ürünleri Gör
   - `items[0].name`: 10'lu Grup Ders Paketi
   - `items[0].price`: ₺1.199
   - `items[0].oldPrice`: ₺1.499
   - `items[0].badge`: %20 İndirim
4. **features**
   - `title`: Neden Biz
   - `subtitle`: Butik deneyim, sürdürülebilir ekipman ve esnek rezervasyon
   - `items[0].title`: Hızlı Teslimat
   - `items[0].description`: Stüdyo ürünlerinde İstanbul içi aynı gün veya ertesi gün teslimat seçenekleri.
   - `items[1].title`: Kolay İade
   - `items[1].description`: Kullanılmamış ekipmanlarda 14 gün içinde koşulsuz iade.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure ve yerel ödeme yöntemleriyle güvenli işlem.
   - `items[3].title`: Yerel Destek & Danışmanlık
5. **stats**
   - `title`: Stüdyo Bilgileri
   - `subtitle`: Topluluğumuz hakkında kısa bilgiler
   - `items[0].value`: 5 Yıl
   - `items[0].label`: Deneyim
   - `items[1].value`: 1000+
   - `items[1].label`: Verilen Ders
   - `items[2].value`: 500+
   - `items[2].label`: Mutlu Öğrenci
   - `items[3].value`: 4.9
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı süreli indirimler — stoklarla sınırlıdır
   - `layout`: carousel
   - `source`: sale
   - `items[0].name`: Rahat Taşıma Çantası
   - `items[0].price`: ₺89
   - `items[0].oldPrice`: ₺129
   - `items[0].badge`: %30 İndirim
   - `items[0].category`: Aksesuar
7. **testimonials**
   - `title`: Öğrenci Yorumları
   - `items[0].quote`: Beşiktaş Yoga'daki küçük gruplar ve eğitmenler gerçekten fark yaratıyor. Hem beden hem zihin için dengeyi buldum.
   - `items[0].author`: Ayşe K.
   - `items[0].role`: Düzenli Öğrenci
   - `items[1].quote`: Özel seans aldım; kronik sırt ağrımda belirgin iyileşme oldu. Rehberlik çok profesyonel.
   - `items[1].author`: Murat S.
   - `items[1].role`: Birebir Danışan
   - `items[2].quote`: Atölyeler hem derinleştiriyor hem de topluluk hissi veriyor. Mekânın atmosferi çok sakinleştirici.
   - `items[2].author`: Elif D.
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Sipariş ve teslimat nasıl çalışıyor?
   - `items[0].answer`: Mat ve aksesuar siparişlerinde İstanbul içi aynı gün veya ertesi gün teslimat seçeneği sunuyoruz. Sipariş onayı ile tahmini teslim süresi paylaşılır.
   - `items[1].question`: Ders paketleri nasıl kullanılır ve geçerlilik süresi nedir?
   - `items[1].answer`: 10'lu paketler satın alımdan itibaren 12 ay, aylık üyelikler satın alındığı ay içinde geçerlidir. Paketleri çevrimiçi hesabınızdan yönetebilirsiniz.
   - `items[2].question`: İptal ve iade politikası nedir?
   - `items[2].answer`: Fiziksel ürünlerde 14 gün iade hakkı vardır (ürün kullanılmamış olmalıdır). Ders iptalleri rezervasyondan en az 12 saat önce yapılırsa ders kredisi ge
   - `items[3].question`: Özel seans rezervasyonu nasıl yapılır?
   - `items[3].answer`: Özel seanslar için rezervasyon formunu doldurun veya bizi arayın. Eğitmen uygunluğuna göre tarih ve saat belirlenir.
9. **cta**
   - `title`: Randevunuzu Bugün Alın
   - `description`: Sakin ve odaklanmış bir başlangıç için ücretsiz tanışma dersi veya birebir seans için rezervasyon yapın.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ders Programı
10. **contact**
   - `title`: İletişim & Randevu
   - `description`: Ders programı, özel seans talepleri ve ekipman soruları için bize ulaşın. Randevu formunu doldurun; en kısa sürede geri dönüş yapacağız.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Beşiktaş, İstanbul — Çarşı Mahallesi, Örnek Sokak 12
   - `fields[0]`: Adınız
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Talep / Mesaj
11. **footer**
   - `tagline`: Beşiktaş'ta sakin, butik yoga deneyimi
   - `columns[0].title`: Stüdyo
   - `columns[0].links[0].label`: Hakkımızda
   - `columns[0].links[1].label`: Eğitmenler
   - `columns[0].links[2].label`: Ders Programı
   - `columns[1].title`: Mağaza
   - `columns[1].links[0].label`: Tüm Ürünler
   - `columns[1].links[1].label`: Haftanın Fırsatları
   - `columns[1].links[2].label`: İade & Kargo

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 39.6 sn | 10509 giriş / 6120 çıkış tok. | $0.082 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Nefes Yoga & Pilates | **Slogan:** Beşiktaş'ta nefes al, dengeni bul | **SEO:** Beşiktaş Yoga ve Pilates Stüdyosu
**Sayfalar:** Ana Sayfa, Mağaza, Hakkımızda, İletişim

1. **hero**
   - `badge`: Beşiktaş'ın butik stüdyosu
   - `title`: Nefes Yoga & Pilates
   - `description`: Beşiktaş'ta butik stüdyo ve yoga ekipmanları mağazası.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Mağaza
   - `trustText`: 500+ mutlu üye · Küçük gruplar · Uzman eğitmenler
   - `image.alt`: Sakin yoga stüdyosu
   - `image.position`: background
   - `slides[0].badge`: Yeni Dönem
2. **categories**
   - `title`: Kategoriye Göre Keşfet
   - `subtitle`: Ders paketlerinden yoga ekipmanlarına
   - `items[0].name`: Yoga Matları
   - `items[0].description`: Kaymaz, doğal kauçuk matlar
   - `items[0].count`: 12 ürün
   - `items[0].alt`: Yoga matları
   - `items[1].name`: Aksesuarlar
   - `items[1].description`: Blok, kayış ve bolster
   - `items[1].count`: 18 ürün
3. **products**
   - `title`: Çok Satan Ürünler
   - `subtitle`: Üyelerimizin en sevdiği yoga ve pilates ürünleri
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Doğal Kauçuk Yoga Matı 5mm
   - `items[0].price`: ₺1.190
   - `items[0].oldPrice`: ₺1.490
   - `items[0].badge`: %20
4. **features**
   - `title`: Neden Nefes?
   - `subtitle`: Alışverişte ve derste gönül rahatlığı
   - `items[0].title`: Hızlı Kargo
   - `items[0].description`: Siparişleriniz 1-2 iş gününde kargoda. 750₺ üzeri ücretsiz gönderim.
   - `items[1].title`: Kolay İade
   - `items[1].description`: 14 gün içinde koşulsuz iade ve değişim imkanı.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL ile korunan ödeme, taksit seçenekleri.
   - `items[3].title`: Canlı Destek
5. **stats**
   - `title`: Rakamlarla Nefes
   - `items[0].value`: 500+
   - `items[0].label`: Mutlu Üye
   - `items[1].value`: 40+
   - `items[1].label`: Haftalık Ders
   - `items[2].value`: 6
   - `items[2].label`: Uzman Eğitmen
   - `items[3].value`: 4.9
   - `items[3].label`: Ortalama Puan
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Bu haftaya özel indirimli ürünler
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatları gör
   - `items[0].name`: Başlangıç Yoga Seti
   - `items[0].price`: ₺1.690
   - `items[0].oldPrice`: ₺2.250
   - `items[0].badge`: %25
7. **testimonials**
   - `title`: Üyelerimiz Ne Diyor?
   - `items[0].quote`: Stüdyonun atmosferi inanılmaz huzurlu. Haftada iki gün buraya gelmek bütün stresimi alıyor.
   - `items[0].author`: Elif K.
   - `items[0].role`: Yoga üyesi, Beşiktaş
   - `items[1].quote`: Küçük gruplar sayesinde eğitmenler her harekete tek tek yardımcı oluyor. Sırt ağrılarım belirgin azaldı.
   - `items[1].author`: Mert A.
   - `items[1].role`: Pilates üyesi
   - `items[2].quote`: Aldığım mat ve bloklar çok kaliteli, kargo da ertesi gün geldi. Hem ders hem ürün için tek adres.
   - `items[2].author`: Zeynep T.
8. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürede teslim edilir?
   - `items[0].answer`: Siparişler 1-2 iş günü içinde kargoya verilir, teslimat genellikle 2-4 iş günüdür. 750₺ üzeri alışverişlerde kargo ücretsizdir.
   - `items[1].question`: İade ve değişim koşulları nelerdir?
   - `items[1].answer`: Kullanılmamış ürünleri 14 gün içinde ücretsiz iade veya değiştirebilirsiniz.
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Tüm kredi/banka kartları, havale/EFT ve taksit seçenekleri mevcuttur. Ödemeler SSL ile korunur.
   - `items[3].question`: Hiç yoga yapmadım, derslere katılabilir miyim?
   - `items[3].answer`: Elbette. Yeni başlayanlara özel seviye gruplarımız var ve ilk deneme dersi hediyedir.
9. **cta**
   - `title`: İlk Dersin Bizden Hediye
   - `description`: Beşiktaş'taki stüdyomuza gel, matını ser ve bedenini dinle. Kontenjanlar sınırlı.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Mağazaya Git
10. **contact**
   - `title`: Randevu Al
   - `description`: Ders programı, eğitmenler veya deneme dersi için formu doldurun; size aynı gün içinde dönelim.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Beşiktaş, İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Tercih Ettiğiniz Ders
11. **footer**
   - `tagline`: Beşiktaş'ta butik yoga ve pilates stüdyosu.
   - `columns[0].title`: Stüdyo
   - `columns[0].links[0].label`: Dersler
   - `columns[0].links[1].label`: Randevu
   - `columns[0].links[2].label`: Yorumlar
   - `columns[1].title`: Mağaza
   - `columns[1].links[0].label`: Tüm Ürünler
   - `columns[1].links[1].label`: Fırsatlar
   - `columns[1].links[2].label`: SSS

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 50.3 sn | 10509 giriş / 7352 çıkış tok. | $0.095 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Nefes Alan Stüdyo | **Slogan:** Beşiktaş'ta nefes alan, sakin bir yoga ve pilates alanı | **SEO:** Beşiktaş Yoga ve Pilates Stüdyosu
**Sayfalar:** Ana Sayfa, Ürünler, Eğitmenler, Randevu & İletişim

1. **hero**
   - `badge`: Beşiktaş'ta Butik Stüdyo
   - `title`: Bedenine dön, nefesinle buluş
   - `description`: Küçük gruplarla yoga ve pilates dersleri, uzman eğitmenler ve evde pratiğini destekleyecek özenle seçilmiş ekipmanlar.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ürünleri Keşfet
   - `trustText`: 600+ üyenin tercih ettiği butik stüdyo
   - `image.alt`: Güneş alan sakin yoga stüdyosu
   - `image.position`: background
   - `slides[0].badge`: Haftalık Ders Programı
2. **categories**
   - `title`: Kategoriye Göre Alışveriş
   - `subtitle`: Derslerden ekipmana, pratiğin için ihtiyacın olan her şey
   - `items[0].name`: Yoga Matları
   - `items[0].description`: Kaymaz, doğal kauçuk ve mantar matlar
   - `items[0].count`: 14 ürün
   - `items[0].alt`: Yoga matları
   - `items[1].name`: Pilates Ekipmanları
   - `items[1].description`: Top, halka, bant ve pilates matları
   - `items[1].count`: 18 ürün
3. **products**
   - `title`: Çok Satan Ürünler
   - `subtitle`: Üyelerimizin en çok tercih ettikleri
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Doğal Kauçuk Yoga Matı 5 mm
   - `items[0].price`: ₺1.190
   - `items[0].oldPrice`: ₺1.490
   - `items[0].badge`: %20
4. **features**
   - `title`: Güvenle Alışveriş Yap
   - `subtitle`: Stüdyodan evine kadar yanındayız
   - `items[0].title`: Hızlı Kargo
   - `items[0].description`: Siparişler 1-2 iş gününde kargoda. 750 ₺ üzeri ücretsiz gönderim.
   - `items[1].title`: Kolay İade
   - `items[1].description`: Kullanılmamış ürünlerde 14 gün içinde koşulsuz iade.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL ve 3D Secure ile korumalı ödeme, taksit seçenekleri.
   - `items[3].title`: Birebir Destek
5. **stats**
   - `title`: Rakamlarla Nefes Alan Stüdyo
   - `items[0].value`: 600+
   - `items[0].label`: Mutlu Üye
   - `items[1].value`: 40+
   - `items[1].label`: Haftalık Ders
   - `items[2].value`: %98
   - `items[2].label`: Memnuniyet
   - `items[3].value`: 6
   - `items[3].label`: Uzman Eğitmen
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Bu hafta sonuna kadar geçerli indirimler
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatlar
   - `items[0].name`: Mantar Yoga Matı 4 mm
   - `items[0].price`: ₺1.390
   - `items[0].oldPrice`: ₺1.790
   - `items[0].badge`: %22
7. **team**
   - `title`: Eğitmenlerimiz
   - `subtitle`: Sertifikalı, deneyimli ve her seviyeye sabırlı
   - `members[0].name`: Elif Aydın
   - `members[0].role`: Hatha & Vinyasa Yoga Eğitmeni
   - `members[0].bio`: 500 saat RYT sertifikalı, 9 yıllık deneyim. Nefes odaklı akışlar.
   - `members[1].name`: Deniz Karaca
   - `members[1].role`: Reformer & Mat Pilates Eğitmeni
   - `members[1].bio`: Duruş, core gücü ve omurga sağlığı üzerine çalışır.
   - `members[2].name`: Mert Yılmaz
8. **testimonials**
   - `title`: Üyelerimiz Ne Diyor?
   - `items[0].quote`: Küçük gruplar sayesinde eğitmen herkesle ilgileniyor. Beşiktaş'ın ortasında gerçek bir huzur köşesi.
   - `items[0].author`: Zeynep K.
   - `items[0].role`: Üye, 1 yıldır
   - `items[1].quote`: Aldığım mat çok kaliteli, derslerde de evde de kullanıyorum. Kargo ertesi gün geldi.
   - `items[1].author`: Burak A.
   - `items[1].role`: Müşteri
   - `items[2].quote`: Sırt ağrılarım pilates derslerinden sonra belirgin şekilde azaldı. Deniz hocaya teşekkürler.
   - `items[2].author`: Ayşe T.
9. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: Ders programı nasıl işliyor, nasıl randevu alırım?
   - `items[0].answer`: Haftalık programda sabah 08:00-10:00 ve akşam 18:00-21:00 arası seanslar var. Aşağıdaki formdan veya telefonla dersinizi seçip yerinizi ayırabilirsini
   - `items[1].question`: Hiç yoga yapmadım, katılabilir miyim?
   - `items[1].answer`: Elbette. Başlangıç seviyesi derslerimiz ve ücretsiz deneme seansımız var.
   - `items[2].question`: Kargo ne kadar sürer, ücreti nedir?
   - `items[2].answer`: Siparişler 1-2 iş gününde kargoya verilir, 2-4 iş gününde teslim edilir. 750 ₺ üzeri ücretsiz.
   - `items[3].question`: İade ve değişim yapabilir miyim?
   - `items[3].answer`: Kullanılmamış ürünleri 14 gün içinde iade edebilirsiniz. Ders paketleri başlangıç yapılmadıysa iade edilir.
10. **cta**
   - `title`: İlk deneme dersin bizden
   - `description`: Beşiktaş'taki stüdyomuzda yerini ayır, nefesinle tanış.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ürünlere Göz At
11. **contact**
   - `title`: Randevu & İletişim
   - `description`: Ders seçin, uygun saati belirtin; stüdyomuz size en kısa sürede dönüş yapsın.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Beşiktaş, İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Ders Türü ve Tercih Edilen Saat
12. **footer**
   - `tagline`: Beşiktaş'ta nefes alan, sakin bir yoga ve pilates stüdyosu.
   - `columns[0].title`: Stüdyo
   - `columns[0].links[0].label`: Eğitmenler
   - `columns[0].links[1].label`: Randevu Al
   - `columns[0].links[2].label`: SSS
   - `columns[1].title`: Mağaza
   - `columns[1].links[0].label`: Kategoriler
   - `columns[1].links[1].label`: Çok Satanlar
   - `columns[1].links[2].label`: Ders Paketleri

</details>

### Yoga stüdyosu: Bölüm düzenleme

Talimat: _Ana başlığı daha huzurlu ve samimi yap, birincil buton metnini "Deneme Dersi Al" olarak değiştir._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 5.8 sn | 4092 giriş / 754 çıkış tok. | $0.0025</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — huzurlu ve samimi bir dokunuş
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — tarzınızı yansıtan ürünler
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Ürünleri İncele
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 8.0 sn | 4092 giriş / 997 çıkış tok. | $0.0030</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — huzurla kendinize zaman ayırın
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — tarzınızı yansıtan ürünler
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Ürünleri İncele
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.2 sn | 8822 giriş / 734 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — nefes alın, kendinize yakınlaşın
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — nefes alın, kendinize yakınlaşın
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Deneme Dersi Al
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.6 sn | 8822 giriş / 734 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — nefes al, kendine dön, huzuru bul
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — nefes al, kendine dön, huzuru bul
- `slides[0].description`: Özenle seçilmiş koleksiyonumuzu keşfedin.
- `slides[0].primaryButton.label`: Deneme Dersi Al
- `slides[0].secondaryButton.label`: Kategoriler
- `slides[1].badge`: Sınırlı Süre
- `slides[1].title`: Sezon sonu indirimleri başladı
- `slides[1].description`: Seçili ürünlerde %50'ye varan indirim fırsatı.
- `slides[1].primaryButton.label`: Fırsatları Gör
- `slides[2].badge`: Çok Satanlar
- `slides[2].title`: En çok tercih edilen ürünler
- `slides[2].description`: Müşterilerimizin favorileriyle tanışın.
- `slides[2].primaryButton.label`: Keşfet

</details>

### Yoga stüdyosu: Ürün metni

Ürün: **Kaymaz Yoga Matı 6 mm**

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 10.7 sn | 454 giriş / 1729 çıkış tok. | $0.0036</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve zemin egzersizleri için kaymaz yüzeye sahip bir mattır. 6 mm kalınlığıyla temel destek ve konfor sağlar.



- Kaymaz yüzey sayesinde egzersiz sırasında kavrama sunar.

- 6 mm kalınlıkla ekstra rahatlık ve yumuşak destek sağlar.

- Yoga ve esneme hareketleri için uygundur.

- Taşıma ve depolama için kompakt bir mat alternatifi olabilir

**Özellikler:** Ürün adı: Kaymaz Yoga Matı 6 mm; Kalınlık: 6 mm; Kaymaz yüzey: Var; Kullanım: Yoga

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (91):** 6 mm kalınlığında kaymaz yoga matı. Yoga ve zemin egzersizlerinde konfor ve kavrama sağlar.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 11.3 sn | 454 giriş / 1883 çıkış tok. | $0.0039</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga uygulamaları için adlandırılmış bir mattır. Ürün adı kaymaz yüzeyi ve 6 mm kalınlığını vurgular.



- Kaymaz yüzey sayesinde mat üzerinde tutuş sağlar

- 6 mm kalınlık bilgisi matın kalınlığını belirtir

- Yoga uygulamaları için adlandırılmış ve kullanıma yöneliktir

**Özellikler:** Ürün adı: Kaymaz Yoga Matı 6 mm; Özellik: Kaymaz; Kalınlık: 6 mm; Kullanım: Yoga

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (114):** Kaymaz Yoga Matı 6 mm — ürün adı kaymaz yüzey ve 6 mm kalınlığı belirtir, yoga uygulamaları için adlandırılmıştır.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.7 sn | 1056 giriş / 524 çıkış tok. | $0.0074</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve egzersiz rutinlerinizde size sabit ve rahat bir zemin sunmak için tasarlanmıştır. Kaymaz yapısı sayesinde duruşlarınızı daha güvenle yapabilirsiniz. 6 mm kalınlığı ile eklemlerinizin zemine temas ettiği noktalarda konforlu bir destek sağlar.



- Kaymaz yapısıyla duruşlarda daha iyi tutuş

- 6 mm kalınlıkla rahat ve destekli kullanım

- Yoga ve evde egzersiz çalışmaları için uygun

- Kolayca serilip toplanabilen pratik kullanım

**Özellikler:** Kalınlık: 6 mm; Yüzey: Kaymaz; Kullanım Alanı: Yoga ve egzersiz (doğrula); Malzeme: - (doğrula)

**SEO başlık (44):** Kaymaz Yoga Matı 6 mm | Rahat ve Sabit Zemin

**SEO açıklama (123):** Kaymaz Yoga Matı 6 mm ile yoga ve egzersizlerinizde sabit, konforlu bir zemin edinin. Pratik kullanım için hemen inceleyin.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 5.0 sn | 1056 giriş / 568 çıkış tok. | $0.0078</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga, pilates ve evde yapılan egzersiz rutinleriniz için tasarlanmış pratik bir matdır. Kaymaz yapısı sayesinde hareketlerinizi daha güvenle yapmanıza yardımcı olur. 6 mm kalınlığı ile yere karşı konforlu bir destek sunar.



- Kaymaz yapısıyla hareketlerde daha fazla denge sağlar

- 6 mm kalınlık ile diz, bilek ve omurga için rahat bir zemin sunar

- Yoga, pilates ve esneme egzersizleri için uygundur

- Evde ve spor salonunda kolayca kullanılabilir

**Özellikler:** Kalınlık: 6 mm; Yüzey Özelliği: Kaymaz; Kullanım Alanı: Yoga, pilates, egzersiz (doğrula); Malzeme: - (doğrula); Boyut: - (doğrula); Renk: - (doğrula)

**SEO başlık (46):** Kaymaz Yoga Matı 6 mm | Konforlu Egzersiz Matı

**SEO açıklama (131):** 6 mm kalınlığında kaymaz yoga matı ile yoga, pilates ve egzersizlerinizde konforlu ve dengeli bir zemin elde edin. Hemen inceleyin.

</details>

## Dijital ajans

> İstanbul'da faaliyet gösteren, SEO, sosyal medya yönetimi ve web tasarım hizmeti veren bir dijital ajans için kurumsal ve modern bir web sitesi.

### Dijital ajans: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 48.3 sn | 4636 giriş / 7488 çıkış tok. | $0.016</summary>

**Ad:** Nova Dijital | **Slogan:** İstanbul merkezli dijital pazarlama ve web ajansı | **SEO:** İstanbul Dijital Pazarlama Ajansı
**Sayfalar:** Ana Sayfa, Hakkımızda, Hizmetler, Portföy, İletişim

1. **hero**
   - `badge`: Kurumsal Çözümler
   - `title`: İstanbul'da Büyüyen Markalar İçin Dijital Çözümler
   - `description`: SEO, sosyal medya yönetimi ve yüksek dönüşümlü web tasarımı ile görünürlüğünüzü, etkileşiminizi ve satışlarınızı birlikte büyütüyoruz. Strateji odaklı
   - `primaryButton.label`: Teklif Al
   - `secondaryButton.label`: Hizmetlerimizi İncele
   - `trustText`: 120+ proje · %95 memnuniyet
   - `image.alt`: Ajans ekibi ekranlarda analiz ve web tasarım çalışırken
   - `image.position`: right
2. **features**
   - `title`: Uzmanlık Alanlarımız
   - `subtitle`: Teknoloji, yaratıcılık ve veri odaklı süreçlerle büyüme sağlıyoruz.
   - `items[0].title`: SEO & Teknik Optimizasyon
   - `items[0].description`: Site içi ve dışı SEO, içerik stratejisi, teknik altyapı iyileştirmeleri ve yerel SEO ile arama görünürlüğünüzü artırıyoruz.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Hedef kitlenize uygun içerik, kampanya ve reklam yönetimi ile markanızın etkileşimini ve bağlılığını yükseltiyoruz.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Dönüşüm odaklı, hızlı ve SEO uyumlu web siteleri. Mobil öncelikli, modern UI/UX çözümleri.
   - `items[3].title`: Performans Pazarlama
3. **services**
   - `title`: Detaylı Hizmetlerimiz
   - `subtitle`: Her hizmet, ölçülebilir KPI'lar ve düzenli raporlama ile yürütülür.
   - `items[0].title`: Teknik SEO & Site İçi Optimizasyon
   - `items[0].description`: Site hızı, yapılandırılmış veri, canonical yönetimi, URL yapısı ve mobil optimizasyonu. Aylık raporlama ve iyileştirme döngüsü.
   - `items[1].title`: İçerik Stratejisi & SEO İçerik Üretimi
   - `items[1].description`: Anahtar kelime araştırması, içerik takvimi ve SEO uyumlu metin üretimi ile organik trafik artışı.
   - `items[2].title`: Sosyal Medya ve Topluluk Yönetimi
   - `items[2].description`: Kreatif içerik üretimi, gönderi takvimi, topluluk etkileşimi ve aylık performans raporları.
   - `items[3].title`: Reklam Yönetimi (Google & Sosyal)
4. **stats**
   - `title`: Başarı Metriklerimiz
   - `subtitle`: Gerçek sonuçlar, şeffaf metriklerle.
   - `items[0].value`: 120+
   - `items[0].label`: Tamamlanan Proje
   - `items[1].value`: 85+
   - `items[1].label`: Süregelen Müşteri
   - `items[2].value`: %120
   - `items[2].label`: Ortalama Organik Trafik Artışı
   - `items[3].value`: 45+
5. **portfolio**
   - `title`: Seçme Çalışmalarımız
   - `subtitle`: İş hedeflerine göre tasarlanmış, ölçülebilir sonuçlar üreten projeler.
   - `items[0].title`: E-Ticaret SEO & CRO
   - `items[0].category`: E-Ticaret
   - `items[0].description`: Organik arama sonuçlarında önemli iyileşme, dönüşümlerde artış sağlayan teknik ve içerik çalışmaları.
   - `items[0].alt`: E-ticaret proje görseli
   - `items[1].title`: Kurumsal Web Yenileme
   - `items[1].category`: Kurumsal
   - `items[1].description`: Hızlı, SEO uyumlu ve kurumsal kimliğe uygun yeniden tasarım; mobil öncelikli UI/UX.
6. **pricing**
   - `title`: Fiyatlandırma
   - `subtitle`: İş modelinize uygun paketler. Özel ihtiyaçlar için kurumsal teklifler.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺2.499
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayan KOBİ'ler ve küçük e-ticaretler için temel dijital paket.
   - `plans[0].features[0]`: Aylık SEO temel optimizasyonu
   - `plans[0].features[1]`: Sosyal medya içerik planı (8 gönderi/ay)
   - `plans[0].features[2]`: Aylık performans raporu
7. **gallery**
   - `title`: İşlerden Görüntüler
   - `subtitle`: Tasarım ve kampanya görsellerinden seçmeler.
   - `items[0].caption`: Web tasarım mockupı
   - `items[0].alt`: Web tasarım mockup
   - `items[1].caption`: Sosyal medya kampanya görseli
   - `items[1].alt`: Sosyal medya kampanya görseli
   - `items[2].caption`: SEO rapor dashboard
   - `items[2].alt`: SEO raporu görseli
   - `items[3].caption`: Reklam performans ekranı
8. **team**
   - `title`: Ekibimiz
   - `subtitle`: Tasarımcılar, stratejistler ve veri analistlerinden oluşan çekirdek ekip.
   - `members[0].name`: Ayşe Demir
   - `members[0].role`: Kurucu & Strateji Direktörü
   - `members[0].bio`: 10+ yıllık dijital pazarlama tecrübesiyle bütünsel marka ve büyüme stratejileri geliştirir.
   - `members[1].name`: Mert Kaya
   - `members[1].role`: Baş SEO Uzmanı
   - `members[1].bio`: Teknik SEO, içerik optimizasyonu ve organik büyüme üzerine uzman. Teknik denetimler ve strateji uygular.
   - `members[2].name`: Seda Yılmaz
9. **contact**
   - `title`: İletişime Geçin
   - `description`: Projelerinizi ve hedeflerinizi konuşalım. İhtiyaçlarınıza göre 48 saat içinde özel teklif hazırlayalım.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: İstiklal Caddesi No:45, Beyoğlu, İstanbul
   - `fields[0]`: Adınız
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
10. **footer**
   - `tagline`: İstanbul merkezli, sonuç odaklı dijital çözümler.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[0].links[3].label`: Fiyatlandırma
   - `columns[1].title`: Şirket
   - `columns[1].links[0].label`: Hakkımızda
   - `columns[1].links[1].label`: Portföy

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 38.4 sn | 4636 giriş / 5933 çıkış tok. | $0.013</summary>

**Ad:** Nebula Dijital | **Slogan:** İstanbul merkezli performans odaklı dijital ajans | **SEO:** İstanbul Dijital Ajans
**Sayfalar:** Ana Sayfa, Hakkımızda, Hizmetler, Portföy, İletişim

1. **hero**
   - `badge`: Yeni Nesil Dijital Ajans
   - `title`: İstanbul'da SEO, Sosyal Medya ve Web Tasarım
   - `description`: Nebula Dijital; organik büyüme, dönüştüren web deneyimleri ve markanızı öne çıkaran sosyal stratejiler tasarlar. İstanbul pazarına özel performans oda
   - `primaryButton.label`: Teklif Al
   - `secondaryButton.label`: Hizmetlerimiz
   - `trustText`: İstanbul merkezli 300+ proje • %98 müşteri memnuniyeti
   - `image.alt`: Ajans ekibi analitik ve tasarım çalışıyor
   - `image.position`: right
2. **features**
   - `title`: Ne Yapıyoruz
   - `subtitle`: Markanız için strateji, görünürlük ve dönüşüm odaklı uygulamalar
   - `items[0].title`: SEO Optimizasyonu
   - `items[0].description`: Teknik SEO, içerik stratejisi ve yerel optimizasyon ile organik aramada sürdürülebilir büyüme sağlıyoruz.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Hedef kitle analizine dayalı içerik takvimleri, reklam optimizasyonu ve topluluk yönetimi.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, erişilebilir ve dönüşüm odaklı web siteleri; e-ticaret ve kurumsal çözümler.
   - `items[3].title`: Performans & Analitik
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: İhtiyacınıza göre ölçeklenen dijital servisler
   - `items[0].title`: Teknik SEO & Site Hızı
   - `items[0].description`: Site hızı, yapılandırılmış veri, kanonik yapı ve sunucu optimizasyonu ile sıralamada avantaj elde edin.
   - `items[1].title`: İçerik Stratejisi & Üretim
   - `items[1].description`: Kullanıcı odaklı içerik planları, blog, ürün tanıtımları ve SEO uyumlu metin üretimi.
   - `items[2].title`: Sosyal Reklam & Yönetim
   - `items[2].description`: Facebook, Instagram ve LinkedIn kampanyaları; hedefleme, bütçe optimizasyonu ve yaratıcı üretim.
   - `items[3].title`: UI/UX Tasarım ve Yeniden Markalaşma
4. **portfolio**
   - `title`: Seçilen Projeler
   - `subtitle`: İstanbul ve Türkiye'den başarı hikayeleri
   - `items[0].title`: TrendModa - E-ticaret Yenileme
   - `items[0].category`: E-ticaret
   - `items[0].description`: Dönüşümü %42 artıran hızlı, mobil öncelikli ürün sayfaları ve SEO optimizasyonu.
   - `items[0].alt`: TrendModa e-ticaret ana sayfa
   - `items[1].title`: İstanbul Lezzetleri - Yerel SEO
   - `items[1].category`: Yerel SEO
   - `items[1].description`: Yerel aramalarda ilk 3'e giren restoran zinciri için bölgesel SEO ve Google My Business yönetimi.
5. **gallery**
   - `title`: Görsel Galeri
   - `subtitle`: Ofisimizden ve projelerimizden kareler
   - `items[0].caption`: Ofiste strateji toplantısı
   - `items[0].alt`: Strateji toplantısı
   - `items[1].caption`: Sunum ve raporlama
   - `items[1].alt`: Sunum yapan ekip üyesi
   - `items[2].caption`: Tasarım ve prototip
   - `items[2].alt`: Tasarımcı prototip üzerinde
6. **team**
   - `title`: Ekibimiz
   - `subtitle`: Uzmanlardan oluşan küçük ve çevik ekip
   - `members[0].name`: Deniz Yılmaz
   - `members[0].role`: Kurucu / Strateji Direktörü
   - `members[0].bio`: 10+ yıl SEO ve dijital strateji deneyimi; büyüme odaklı kampanya yönetimi.
   - `members[1].name`: Ece Kaya
   - `members[1].role`: Sosyal Medya ve İçerik Yöneticisi
   - `members[1].bio`: Marka hikayeleri yaratan içerik uzmanı; kampanya performansında kanıtlanmış başarı.
   - `members[2].name`: Mert Arslan
7. **pricing**
   - `title`: Fiyatlandırma
   - `subtitle`: İhtiyacınıza uygun paketler — ölçeklendirilebilir ve şeffaf
   - `plans[0].name`: Temel
   - `plans[0].price`: ₺3.900
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayanlar için temel dijital görünürlük paketi
   - `plans[0].features[0]`: Aylık SEO raporu
   - `plans[0].features[1]`: 2 sosyal medya gönderisi/hafta
   - `plans[0].features[2]`: Hazır tema ile web sitesi (5 sayfa)
8. **testimonials**
   - `title`: Müşteri Yorumları
   - `items[0].quote`: Nebula ile 6 ay içinde organik trafikte %85 artış gördük. Strateji ve uygulama mükemmeldi.
   - `items[0].author`: Ayşegül Demir
   - `items[0].role`: TrendModa Pazarlama Müdürü
   - `items[1].quote`: Sosyal medya kampanyamız kısa sürede satışa dönüştü. Raporlama ve iletişim çok profesyoneldi.
   - `items[1].author`: Ozan K.
   - `items[1].role`: Kurucu, İstanbul Lezzetleri
   - `items[2].quote`: Web sitemiz daha hızlı, daha temiz ve gerçek müşteri dönüşümü sağlamaya başladı.
   - `items[2].author`: Selin Arı
9. **contact**
   - `title`: İletişime Geçin
   - `description`: Projelerinizi konuşmak veya ücretsiz keşif görüşmesi talep etmek için bize ulaşın. 48 saat içinde dönüş sağlıyoruz.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Bebek, Beşiktaş, İstanbul
   - `fields[0]`: Adınız
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon (isteğe bağlı)
   - `fields[3]`: Mesajınız
10. **footer**
   - `tagline`: İstanbul merkezli, sonuç odaklı dijital çözümler
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Şirket
   - `columns[1].links[0].label`: Hakkımızda
   - `columns[1].links[1].label`: Portföy
   - `columns[1].links[2].label`: İletişim

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 29.1 sn | 10165 giriş / 4344 çıkış tok. | $0.064 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Pikselhane | **Slogan:** Markanızı dijitalde büyüten İstanbul ajansı | **SEO:** İstanbul Dijital Ajans SEO Web Tasarım
**Sayfalar:** Ana Sayfa

1. **hero**
   - `badge`: İstanbul'un Veri Odaklı Dijital Ajansı
   - `title`: Markanızı Google'da ve Sosyal Medyada Öne Çıkarın
   - `description`: SEO, sosyal medya yönetimi ve web tasarımı tek çatı altında topluyoruz. Ölçülebilir sonuçlarla trafiğinizi, takipçinizi ve satışlarınızı büyütüyoruz.
   - `primaryButton.label`: Ücretsiz Analiz Al
   - `secondaryButton.label`: Hizmetlerimizi Keşfet
   - `trustText`: İstanbul'da 150+ markanın tercih ettiği dijital ortak
   - `image.alt`: Dijital ajans analitik paneli ve web tasarım ekranları
   - `image.position`: right
2. **stats**
   - `title`: Rakamlarla Pikselhane
   - `items[0].value`: 150+
   - `items[0].label`: Mutlu Marka
   - `items[1].value`: %240
   - `items[1].label`: Ortalama Organik Trafik Artışı
   - `items[2].value`: 300+
   - `items[2].label`: Yayına Alınan Web Sitesi
   - `items[3].value`: 8 Yıl
   - `items[3].label`: Sektör Deneyimi
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Dijital büyümenin her adımında yanınızdayız.
   - `items[0].title`: SEO Danışmanlığı
   - `items[0].description`: Teknik SEO, anahtar kelime stratejisi, içerik ve link çalışmalarıyla Google'da üst sıralara çıkın.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram, LinkedIn, TikTok ve X için içerik planı, tasarım, topluluk yönetimi ve reklam kampanyaları.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve dönüşüm odaklı kurumsal siteler ile e-ticaret projeleri.
   - `items[3].title`: Google & Meta Reklamları
4. **features**
   - `title`: Neden Pikselhane?
   - `subtitle`: Estetik ile performansı bir araya getiriyoruz.
   - `items[0].title`: Veri Odaklı Strateji
   - `items[0].description`: Her karar analitik verilere dayanır; tahminle değil ölçümle ilerleriz.
   - `items[1].title`: Yerel Pazar Uzmanlığı
   - `items[1].description`: İstanbul ve Türkiye pazarının dinamiklerini, arama alışkanlıklarını yakından biliriz.
   - `items[2].title`: Şeffaf İletişim
   - `items[2].description`: Tek bir proje yöneticisi, düzenli toplantılar ve anlık raporlama erişimi.
   - `items[3].title`: Hızlı ve Güvenli Altyapı
5. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Net adımlarla sonuca giden yol.
   - `steps[0].title`: Keşif & Analiz
   - `steps[0].description`: Markanızı, rakiplerinizi ve mevcut dijital performansınızı detaylıca inceleriz.
   - `steps[1].title`: Strateji
   - `steps[1].description`: Hedeflerinize uygun yol haritası, KPI'lar ve bütçe planı oluştururuz.
   - `steps[2].title`: Uygulama
   - `steps[2].description`: Tasarım, içerik, optimizasyon ve kampanyaları hızla hayata geçiririz.
   - `steps[3].title`: Ölçüm & Büyüme
6. **pricing**
   - `title`: Aylık Paketler
   - `subtitle`: İhtiyacınıza göre ölçeklenen şeffaf fiyatlar.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺12.900
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayan işletmeler için
   - `plans[0].features[0]`: Temel SEO optimizasyonu
   - `plans[0].features[1]`: Aylık 12 sosyal medya içeriği
   - `plans[0].features[2]`: 2 platform yönetimi
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselhane ile çalışmaya başladıktan sonra altı ayda organik trafiğimiz üç katına çıktı. Ekip hem hızlı hem çok profesyonel.
   - `items[0].author`: Elif Karaca
   - `items[0].role`: Kurucu, Moda Atölyesi – Kadıköy
   - `items[1].quote`: Yeni web sitemiz hem çok şık hem de çok hızlı. Online randevu taleplerimiz %65 arttı.
   - `items[1].author`: Dr. Murat Aydın
   - `items[1].role`: Klinik Sahibi, Şişli
   - `items[2].quote`: Sosyal medya hesaplarımızı baştan kurguladılar; etkileşim oranımız ve satışlarımız gözle görülür şekilde yükseldi.
   - `items[2].author`: Selin Yıldız
8. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: SEO sonuçları ne zaman görünür?
   - `items[0].answer`: Rekabete bağlı olarak ilk iyileşmeler genellikle 2-3 ay içinde görülür; kalıcı ve güçlü sonuçlar için 6 aylık bir süreç öneriyoruz.
   - `items[1].question`: Web sitesi projesi ne kadar sürer?
   - `items[1].answer`: Kurumsal bir web sitesi kapsamına göre 3-6 hafta içinde yayına alınır. E-ticaret projeleri biraz daha uzun sürebilir.
   - `items[2].question`: Reklam bütçesi paketlere dahil mi?
   - `items[2].answer`: Hayır, reklam bütçesi ayrıdır ve doğrudan reklam hesabınıza yatırılır. Biz yalnızca yönetim hizmeti sunarız.
   - `items[3].question`: Sözleşme süresi var mı?
   - `items[3].answer`: Aylık paketlerimizde minimum 3 aylık çalışma önerilir, ancak kilitleyici uzun vadeli taahhüt istemiyoruz.
9. **cta**
   - `title`: Dijitalde Büyümeye Hazır mısınız?
   - `description`: Web sitenizin ve dijital varlığınızın ücretsiz analizini hemen alın, size özel strateji önerimizi sunalım.
   - `primaryButton.label`: Ücretsiz Analiz Talep Et
   - `secondaryButton.label`: Bizi Arayın
10. **contact**
   - `title`: Bizimle İletişime Geçin
   - `description`: Projenizi anlatın, 24 saat içinde size dönüş yapalım.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Levent, Büyükdere Cad., 34394 Şişli / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
11. **footer**
   - `tagline`: Pikselhane – İstanbul'dan dijital dünyaya.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Neden Biz
   - `columns[1].links[1].label`: Süreç
   - `columns[1].links[2].label`: Paketler

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 33.3 sn | 10165 giriş / 5006 çıkış tok. | $0.070 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Pikselhane | **Slogan:** Markanızı dijitalde büyüten İstanbul ajansı | **SEO:** İstanbul Dijital Ajans SEO Web Tasarım
**Sayfalar:** Ana Sayfa, Hizmetler, Projeler, Hakkımızda, İletişim

1. **hero**
   - `badge`: İstanbul'un Veri Odaklı Dijital Ajansı
   - `title`: Markanızı Dijitalde Bir Üst Seviyeye Taşıyoruz
   - `description`: SEO, sosyal medya yönetimi ve web tasarımı tek çatı altında topluyoruz. Ölçülebilir stratejilerle trafiğinizi, etkileşiminizi ve satışlarınızı büyütüy
   - `primaryButton.label`: Ücretsiz Analiz Al
   - `secondaryButton.label`: Projelerimizi Gör
   - `trustText`: İstanbul'da 150+ markanın güvendiği dijital ortak
   - `image.alt`: Dijital ajans analitik paneli ve web tasarım örnekleri
   - `image.position`: right
2. **stats**
   - `title`: Rakamlarla Pikselhane
   - `items[0].value`: 150+
   - `items[0].label`: Tamamlanan Proje
   - `items[1].value`: %240
   - `items[1].label`: Ortalama Organik Trafik Artışı
   - `items[2].value`: 8 Yıl
   - `items[2].label`: Sektör Deneyimi
   - `items[3].value`: %96
   - `items[3].label`: Müşteri Memnuniyeti
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Dijital varlığınızın her adımını uzman ekibimizle yönetiyoruz.
   - `items[0].title`: SEO Danışmanlığı
   - `items[0].description`: Teknik SEO, içerik stratejisi ve link çalışmalarıyla Google'da hedef kelimelerinizde üst sıralara çıkın.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram, LinkedIn ve TikTok için içerik üretimi, topluluk yönetimi ve reklam kampanyaları.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve dönüşüm odaklı kurumsal siteler ile e-ticaret altyapıları.
   - `items[3].title`: Google & Meta Reklamları
4. **features**
   - `title`: Neden Pikselhane?
   - `subtitle`: Estetiği veriyle birleştiren, sonuç odaklı çalışma anlayışı.
   - `items[0].title`: Veri Odaklı Strateji
   - `items[0].description`: Her karar analitik verilere dayanır; tahmine değil ölçüme güveniriz.
   - `items[1].title`: Tek Çatı, Tam Entegrasyon
   - `items[1].description`: SEO, sosyal medya ve web ekibi aynı hedef için birlikte çalışır.
   - `items[2].title`: Şeffaf İletişim
   - `items[2].description`: Özel müşteri temsilcisi, haftalık görüşmeler ve anlaşılır raporlar.
   - `items[3].title`: Yerel Pazar Uzmanlığı
5. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Net adımlarla ilerleyen, öngörülebilir bir süreç.
   - `steps[0].title`: Keşif & Analiz
   - `steps[0].description`: Markanızı, rakiplerinizi ve mevcut dijital performansınızı detaylı inceleriz.
   - `steps[1].title`: Strateji
   - `steps[1].description`: Hedeflerinize uygun yol haritası ve KPI'ları birlikte belirleriz.
   - `steps[2].title`: Uygulama
   - `steps[2].description`: Tasarım, içerik ve optimizasyon çalışmalarını planlı şekilde hayata geçiririz.
   - `steps[3].title`: Ölçüm & Büyüme
6. **portfolio**
   - `title`: Seçili Projeler
   - `subtitle`: Markaların dijitaldeki büyüme hikâyelerinden örnekler.
   - `items[0].title`: Moda E-Ticaret Yenileme
   - `items[0].category`: Web Tasarım
   - `items[0].description`: Yeni arayüz ile dönüşüm oranında %85 artış.
   - `items[0].alt`: Moda e-ticaret sitesi
   - `items[1].title`: Klinik SEO Çalışması
   - `items[1].category`: SEO
   - `items[1].description`: 12 ayda organik trafikte %310 büyüme.
7. **pricing**
   - `title`: Paketlerimiz
   - `subtitle`: Büyüklüğünüze uygun esnek paketler. Özel ihtiyaçlar için teklif alın.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺14.900
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayan markalar için
   - `plans[0].features[0]`: Temel SEO optimizasyonu
   - `plans[0].features[1]`: Haftada 3 sosyal medya paylaşımı
   - `plans[0].features[2]`: 1 platform yönetimi
8. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselhane ile çalışmaya başladıktan sonra organik trafiğimiz 6 ayda iki katına çıktı. Ekip son derece profesyonel.
   - `items[0].author`: Elif Karaca
   - `items[0].role`: Pazarlama Müdürü, Lumora Giyim
   - `items[1].quote`: Yeni web sitemiz hem çok şık hem de çok hızlı. Online randevularımız belirgin şekilde arttı.
   - `items[1].author`: Dr. Murat Yıldız
   - `items[1].role`: Kurucu, Yıldız Diş Kliniği
   - `items[2].quote`: Sosyal medya hesaplarımıza yeni bir ses kazandırdılar. Şeffaf raporlama bizim için büyük artı.
   - `items[2].author`: Selin Aydın
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: SEO sonuçları ne kadar sürede alınır?
   - `items[0].answer`: Sektöre ve rekabete göre değişir; genellikle ilk iyileşmeleri 3-4. ayda görmeye başlarsınız, kalıcı sonuçlar 6-12 ay içinde oluşur.
   - `items[1].question`: Web sitesi projesi ne kadar sürer?
   - `items[1].answer`: Kurumsal bir site ortalama 3-5 hafta, e-ticaret projeleri ise kapsamına göre 6-10 hafta içinde tamamlanır.
   - `items[2].question`: Sözleşme süresi zorunlu mu?
   - `items[2].answer`: Aylık hizmetlerde minimum 3 aylık çalışma öneriyoruz; ancak uzun vadeli bağlayıcı taahhüt şartı yoktur.
   - `items[3].question`: Sadece İstanbul'daki firmalarla mı çalışıyorsunuz?
   - `items[3].answer`: Merkezimiz İstanbul'da, ancak Türkiye genelinde ve yurt dışındaki markalara da uzaktan hizmet veriyoruz.
10. **cta**
   - `title`: Dijitalde Büyümeye Hazır mısınız?
   - `description`: Web siteniz ve dijital kanallarınız için ücretsiz analiz alın, size özel büyüme planını birlikte çıkaralım.
   - `primaryButton.label`: Ücretsiz Analiz Al
   - `secondaryButton.label`: Bizi Arayın
11. **contact**
   - `title`: Bizimle İletişime Geçin
   - `description`: Projenizi anlatın, 24 saat içinde size dönüş yapalım.
   - `email`: <e-posta>
   - `phone`: <telefon>
   - `address`: Maslak Mah. Büyükdere Cad. No:128, Sarıyer / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
12. **footer**
   - `tagline`: Pikselhane — İstanbul merkezli dijital büyüme ortağınız.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Projeler
   - `columns[1].links[1].label`: Paketler
   - `columns[1].links[2].label`: SSS

</details>

### Dijital ajans: Bölüm düzenleme

Talimat: _Ana başlığı daha net ve sonuç odaklı yap, birincil buton metnini "Ücretsiz Analiz İste" olarak değiştir._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 5.3 sn | 3866 giriş / 756 çıkış tok. | $0.0025</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Faaliyet Gösteren ile fikrinizi hızla kullanılabilir bir ürüne dönüştürün
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 5.8 sn | 3866 giriş / 578 çıkış tok. | $0.0021</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi Ürüne Dönüştürün ve Hızla Pazara Çıkarın
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 2.6 sn | 8413 giriş / 334 çıkış tok. | $0.020</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi 90 günde çalışan, ölçeklenebilir bir dijital ürüne dönüştürüyoruz
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 2.6 sn | 8413 giriş / 326 çıkış tok. | $0.020</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi büyüyen, ölçeklenebilir bir dijital ürüne dönüştürün
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

### Dijital ajans: Ürün metni

Ürün: **Aylık SEO Raporu Şablonu (PDF)** (Format: PDF)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 12.3 sn | 469 giriş / 1799 çıkış tok. | $0.0037</summary>

**Açıklama**

Aylık SEO Raporu Şablonu (PDF), aylık SEO performansını raporlamak üzere hazırlanmış bir şablondur. Ürün PDF formatında sunulur.



- Aylık SEO raporlaması için hazırlanmış şablon.

- PDF formatında teslim edilir.

- Paylaşım ve arşivleme amaçlı uygun bir dosya formatı içerir.

**Özellikler:** Ürün Adı: Aylık SEO Raporu Şablonu (PDF); Format: PDF; Dijital Ürün: Muhtemelen dijital (PDF) (doğrula)

**SEO başlık (30):** Aylık SEO Raporu Şablonu (PDF)

**SEO açıklama (96):** Aylık SEO Raporu Şablonu, aylık SEO performansını belgelemek için PDF formatında hazırlanmıştır.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 10.9 sn | 469 giriş / 1595 çıkış tok. | $0.0033</summary>

**Açıklama**

Aylık SEO Raporu Şablonu (PDF), aylık SEO performansını düzenli şekilde raporlamak için hazırlanmış bir PDF şablonudur. Hazır düzeniyle rapor oluşturmayı kolaylaştırır ve sunum tutarlılığı sağlar.



- Aylık SEO verilerini düzenli biçimde raporlamaya uygundur

- PDF formatı sayesinde kolay paylaşım ve görüntüleme

- Hazır şablon düzeni ile rapor hazırlama süresini kısaltır

- Tutarlı ve profesyonel görünüm sağlar

**Özellikler:** Ürün adı: Aylık SEO Raporu Şablonu (PDF); Format: PDF; Tür: Şablon; Periyot: Aylık

**SEO başlık (45):** Aylık SEO Raporu Şablonu (PDF) — Hazır Şablon

**SEO açıklama (113):** Aylık SEO Raporu Şablonu PDF formatında, aylık SEO performans raporları hazırlamak için tasarlanmış hazır şablon.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.0 sn | 1076 giriş / 421 çıkış tok. | $0.0064</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, web sitenizin aylık SEO çalışmalarını düzenli ve anlaşılır biçimde raporlamanız için hazırlanmış PDF formatında bir şablondur. Dijital ürün olarak sunulur ve çalışmalarınızı takip etmeyi kolaylaştırmayı hedefler.



- PDF formatında kolay erişim

- Aylık raporlama sürecini düzenli hale getirir

- Farklı cihazlarda açılabilen yaygın dosya türü

- Dijital ürün olduğu için fiziksel gönderim gerektirmez

**Özellikler:** Format: PDF; Ürün Türü: Dijital şablon (doğrula)

**SEO başlık (30):** Aylık SEO Raporu Şablonu (PDF)

**SEO açıklama (137):** Aylık SEO çalışmalarınızı düzenli raporlamak için PDF formatında Aylık SEO Raporu Şablonu. Dijital ürün olarak hemen incelemeye başlayın.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 7.8 sn | 1076 giriş / 996 çıkış tok. | $0.012</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, SEO çalışmalarınızın aylık sonuçlarını düzenli bir şekilde raporlamanız için hazırlanmış bir PDF dosyasıdır. Her ay aynı yapıyı kullanarak çalışmalarınızı daha anlaşılır biçimde sunabilirsiniz.



- Aylık SEO raporlamanıza düzenli bir yapı kazandırır

- Rapor hazırlarken zaman kazanmanıza yardımcı olur

- PDF formatı sayesinde birçok cihazda kolayca açılır

- Çalışmalarınızı müşterilerinize ya da ekibinize net şekilde sunmanızı kolaylaştırır

**Özellikler:** Format: PDF; Ürün Türü: Dijital dosya (doğrula); Dil: Türkçe (doğrula)

**SEO başlık (54):** Aylık SEO Raporu Şablonu (PDF) | Dijital Rapor Şablonu

**SEO açıklama (147):** Aylık SEO Raporu Şablonu PDF formatında. SEO çalışmalarınızı aylık olarak raporlamak için hazır şablonla işinizi düzenli ve anlaşılır hale getirin.

</details>
