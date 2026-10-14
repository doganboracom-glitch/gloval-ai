# Model karşılaştırması (gpt-5-mini / claude-sonnet-5.5 / claude-opus-5.5)

Tarih: 2026-10-14T19:31:25.068Z | Tekrar sayısı: 2 | Üretimdeki `AI_TIER_MODELS`: standard=`openai/gpt-5-mini`, advanced=`openai/gpt-5-mini` (bu araç değiştirmez)

## Gateway kimlik ve fiyat doğrulaması

| Model | Gateway'de çözüldü | Giriş $/1M token | Çıkış $/1M token |
|---|---|---|---|
| `openai/gpt-5-mini` | evet | 0.25 | 2.00 |
| `anthropic/claude-sonnet-5.5` | evet | 2.00 | 10.00 |
| `anthropic/claude-opus-5.5` | evet | 4.00 | 20.00 |

## Özet (işlem bazında, tüm brief ve tekrarlar)

Maliyet: USD, gateway liste fiyatı (token başına), önbellek/rejyonal ek ücret yok.

| İşlem | Model | Başarılı / Toplam | Şema hatası | Kural ihlali (başarılı çıktılarda) | Ort. süre (sn) | Ort. giriş tok. | Ort. çıkış tok. | Ort. maliyet ($) | Ort. İngilizce sızıntı | Ort. Türkçe karakter |
|---|---|---|---|---|---|---|---|---|---|---|
| Site üretimi | `gpt-5-mini` | 1/6 | 5 | 0/1 | 37.6 | 4636 | 6293 | 0.014 | 0.0 | 406 |
| Site üretimi | `claude-sonnet-5.5` | 3/6 | 3 | 3/3 | 35.7 | 10326 | 5408 | 0.075 | 0.0 | 486 |
| Site üretimi | `claude-opus-5.5` | 6/6 | 0 | 6/6 | 59.5 | 10441 | 6583 | 0.173 | 0.0 | 490 |
| Bölüm düzenleme | `gpt-5-mini` | 6/6 | 0 | 0/6 | 7.9 | 4020 | 871 | 0.0027 | 0.0 | 48 |
| Bölüm düzenleme | `claude-sonnet-5.5` | 6/6 | 0 | 0/6 | 5.1 | 8690 | 604 | 0.023 | 0.0 | 45 |
| Bölüm düzenleme | `claude-opus-5.5` | 6/6 | 0 | 0/6 | 6.9 | 8690 | 769 | 0.050 | 0.0 | 47 |
| Ürün metni | `gpt-5-mini` | 6/6 | 0 | 0/6 | 14.8 | 465 | 1975 | 0.0041 | 0.0 | 56 |
| Ürün metni | `claude-sonnet-5.5` | 6/6 | 0 | 0/6 | 6.1 | 1070 | 573 | 0.0079 | 0.0 | 67 |
| Ürün metni | `claude-opus-5.5` | 6/6 | 0 | 0/6 | 10.7 | 1070 | 680 | 0.018 | 0.0 | 76 |

"Şema hatası": model çıktısı Zod şemasını geçemedi, süre aşımı veya API hatası; üretimde bu durumda determinist yedek (fallback) devreye girer. "Kural ihlali": şemayı geçti ama istem kuralını bozdu (ör. yanlış buton metni, contact konumu, uydurma ölçü).

### Hatalar

- jewelry / Site üretimi / `openai/gpt-5-mini` (tekrar 1): No object generated: response did not match schema.
- jewelry / Site üretimi / `openai/gpt-5-mini` (tekrar 2): No object generated: response did not match schema.
- jewelry / Site üretimi / `anthropic/claude-sonnet-5.5` (tekrar 1): No object generated: response did not match schema.
- yoga / Site üretimi / `openai/gpt-5-mini` (tekrar 1): No object generated: response did not match schema.
- yoga / Site üretimi / `openai/gpt-5-mini` (tekrar 2): No object generated: response did not match schema.
- yoga / Site üretimi / `anthropic/claude-sonnet-5.5` (tekrar 1): No object generated: response did not match schema.
- yoga / Site üretimi / `anthropic/claude-sonnet-5.5` (tekrar 2): No object generated: response did not match schema.
- agency / Site üretimi / `openai/gpt-5-mini` (tekrar 2): No object generated: response did not match schema.

## Mücevher e-ticaret

> Kadıköy merkezli, el yapımı gümüş ve altın takı satan şık bir online mağaza kurmak istiyorum. Yüzük, kolye ve bileklik koleksiyonları olacak, sepet ve ödeme olsun.

### Mücevher e-ticaret: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): HATA | 50.1 sn | 4947 giriş / 7786 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): HATA | 50.0 sn | 4947 giriş / 7873 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): HATA | 36.2 sn | 10648 giriş / 5588 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 38.6 sn | 10648 giriş / 5847 çıkış tok. | $0.080 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Moda Atölye Takı | **Slogan:** Kadıköy'den el yapımı gümüş ve altın takılar | **SEO:** Kadıköy El Yapımı Gümüş Takı
**Sayfalar:** Ana Sayfa, Ürünler, Atölyemiz, İletişim

1. **hero**
   - `badge`: Yeni Sezon
   - `title`: El Yapımı Gümüş ve Altın Takılar
   - `description`: Kadıköy atölyemizde tasarlanan, size özel hazırlanan koleksiyonlar.
   - `trustText`: 2.000+ mutlu müşteri · Ücretsiz hediye paketi
   - `image.alt`: Kadife üzerinde altın ve elmas takılar
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
   - `slides[0].title`: El Yapımı Gümüş ve Altın Takılar
   - `slides[0].description`: Kadıköy atölyemizde tasarlanan, size özel hazırlanan koleksiyonlar.
2. **categories**
   - `title`: Koleksiyonlara Göz Atın
   - `subtitle`: Her tarza ve her ana uygun el yapımı parçalar
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tek taş, alyans ve minimal modeller
   - `items[0].count`: 64 ürün
   - `items[0].alt`: Yüzük koleksiyonu
   - `items[1].name`: Kolyeler
   - `items[1].description`: İsimli, taşlı ve zarif zincirler
   - `items[1].count`: 48 ürün
3. **products**
   - `title`: Çok Satanlar
   - `subtitle`: Müşterilerimizin en çok tercih ettiği parçalar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Tek Taş Zirkon Gümüş Yüzük
   - `items[0].price`: ₺1.490
   - `items[0].oldPrice`: ₺1.890
   - `items[0].badge`: %21
4. **features**
   - `title`: Güvenle Alışveriş Yapın
   - `subtitle`: Siparişinizden teslimata her adımda yanınızdayız
   - `items[0].title`: Hızlı Kargo
   - `items[0].description`: Siparişler 1-2 iş gününde sigortalı olarak gönderilir.
   - `items[1].title`: 14 Gün Kolay İade
   - `items[1].description`: Memnun kalmazsanız koşulsuz iade ve değişim.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL ve 3D Secure ile korumalı ödeme, taksit imkânı.
   - `items[3].title`: Müşteri Desteği
5. **stats**
   - `title`: Rakamlarla Atölyemiz
   - `items[0].value`: 15+
   - `items[0].label`: Yıllık Zanaat Deneyimi
   - `items[1].value`: 2.000+
   - `items[1].label`: Mutlu Müşteri
   - `items[2].value`: 150+
   - `items[2].label`: Özgün Tasarım
   - `items[3].value`: 4.9/5
   - `items[3].label`: Müşteri Puanı
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı süre ve stokla geçerli indirimler
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatları gör
   - `items[0].name`: Rose Gold Kaplama Bilezik
   - `items[0].price`: ₺1.290
   - `items[0].oldPrice`: ₺1.790
   - `items[0].badge`: %28
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Nişan yüzüğümü kişiye özel yaptırdım, işçilik mükemmel. Kutusuyla birlikte çok özenli geldi.
   - `items[0].author`: Elif K.
   - `items[0].role`: Kadıköy
   - `items[1].quote`: Annem için aldığım altın kolye fotoğraftakinden bile güzel. Kargo ertesi gün elimdeydi.
   - `items[1].author`: Murat A.
   - `items[1].role`: İstanbul
   - `items[2].quote`: Gümüş bileklik aylardır kullanıyorum, rengi hiç solmadı. Kesinlikle tavsiye ederim.
   - `items[2].author`: Zeynep T.
8. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürede ulaşır?
   - `items[0].answer`: Siparişler 1-2 iş günü içinde sigortalı kargoyla gönderilir, teslimat genellikle 1-3 iş günü sürer. 1.500 ₺ üzeri siparişlerde kargo ücretsizdir.
   - `items[1].question`: İade ve değişim koşulları nelerdir?
   - `items[1].answer`: Kullanılmamış ürünleri 14 gün içinde iade edebilir veya değiştirebilirsiniz. Kişiye özel yapılan ürünlerde iade yapılamaz.
   - `items[2].question`: Hangi ödeme yöntemlerini kullanabilirim?
   - `items[2].answer`: Kredi/banka kartı, 3D Secure ile taksit seçenekleri ve havale/EFT ile ödeme yapabilirsiniz.
   - `items[3].question`: Ürünler gerçek gümüş ve altın mı?
   - `items[3].answer`: Gümüş ürünlerimiz 925 ayar, altın ürünlerimiz 14 veya 18 ayardır. Her ürün ayar damgalı ve sertifikalı gönderilir.
9. **cta**
   - `title`: Size Özel Bir Parça Seçin
   - `description`: İlk siparişinizde HOSGELDIN10 koduyla %10 indirim ve ücretsiz hediye paketi sizi bekliyor.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Bize Ulaşın
10. **contact**
   - `title`: Bize Ulaşın
   - `description`: Sipariş, kişiye özel tasarım veya ölçü danışmanlığı için yazın; en kısa sürede dönüş yapalım.
   - `email`: merhaba@modaatolyetaki.com
   - `phone`: +90 216 555 01 23
   - `address`: Caferağa Mah. Moda Cad., Kadıköy / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
11. **footer**
   - `tagline`: Kadıköy'den, el emeğiyle üretilmiş gümüş ve altın takılar.
   - `columns[0].title`: Alışveriş
   - `columns[0].links[0].label`: Yüzükler
   - `columns[0].links[1].label`: Kolyeler
   - `columns[0].links[2].label`: Bileklikler
   - `columns[0].links[3].label`: Hediye Setleri
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Atölyemiz
   - `columns[1].links[1].label`: İletişim

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 61.5 sn | 10648 giriş / 6802 çıkış tok. | $0.179 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Moda Atölye Takı | **Slogan:** Kadıköy'de el yapımı gümüş ve altın takılar | **SEO:** Kadıköy El Yapımı Takı
**Sayfalar:** Ana Sayfa, Tüm Ürünler, Koleksiyonlar, Atölyemiz, İletişim

1. **hero**
   - `badge`: Kadıköy Atölyesinden
   - `title`: Elde Şekillenen Zarafet
   - `description`: 925 ayar gümüş ve 14 ayar altından, her biri Kadıköy atölyemizde elde işlenen yüzük, kolye ve bileklikler.
   - `primaryButton.label`: Koleksiyonu Keşfet
   - `secondaryButton.label`: Çok Satanlar
   - `trustText`: 3.000+ mutlu müşteri · Ücretsiz kargo · 14 gün kolay iade
   - `image.alt`: Koyu kadife üzerinde altın ve pırlanta takılar
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
2. **categories**
   - `title`: Koleksiyona Göre Alışveriş
   - `subtitle`: Her parça atölyemizde tek tek elde üretilir.
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tektaş, alyans ve el dövmesi modeller
   - `items[0].count`: 64 ürün
   - `items[0].alt`: Altın ve gümüş yüzük koleksiyonu
   - `items[1].name`: Kolyeler
   - `items[1].description`: Zincir, madalyon ve kişiye özel kolyeler
   - `items[1].count`: 48 ürün
3. **products**
   - `title`: Çok Satanlar
   - `subtitle`: Müşterilerimizin en çok sevdiği el yapımı parçalar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Moda Dövme Gümüş Yüzük
   - `items[0].price`: ₺1.190
   - `items[0].oldPrice`: ₺1.590
   - `items[0].badge`: %25
4. **features**
   - `title`: Gönül Rahatlığıyla Alışveriş
   - `subtitle`: Her siparişte aynı özen
   - `items[0].title`: Hızlı ve Ücretsiz Kargo
   - `items[0].description`: ₺750 üzeri siparişlerde ücretsiz, 1-3 iş gününde sigortalı teslimat.
   - `items[1].title`: 14 Gün Kolay İade
   - `items[1].description`: Beğenmediğiniz ürünü 14 gün içinde ücretsiz iade edin.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL, 3D Secure ve taksitli kredi kartı seçenekleri.
   - `items[3].title`: Ayar Sertifikası
5. **stats**
   - `title`: Atölyemizden Rakamlarla
   - `items[0].value`: 12 Yıl
   - `items[0].label`: Kadıköy'de el işçiliği
   - `items[1].value`: 3.000+
   - `items[1].label`: Mutlu müşteri
   - `items[2].value`: 180+
   - `items[2].label`: Özgün tasarım
   - `items[3].value`: 4,9/5
   - `items[3].label`: Ortalama müşteri puanı
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sınırlı stok, yalnızca bu hafta geçerli indirimler
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm indirimleri gör
   - `items[0].name`: Hasır Örgü Gümüş Bileklik
   - `items[0].price`: ₺1.090
   - `items[0].oldPrice`: ₺1.490
   - `items[0].badge`: %27
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Harf kolyemi annem için yaptırdım, kutusunu açtığında gözleri doldu. İşçilik fotoğraflardan bile güzel.
   - `items[0].author`: Elif K.
   - `items[0].role`: İstanbul
   - `items[1].quote`: Dövme gümüş yüzük tam ölçümde geldi, iki gün içinde elimdeydi. Atölye ruhu her detayda hissediliyor.
   - `items[1].author`: Mert A.
   - `items[1].role`: Ankara
   - `items[2].quote`: Alyanslarımızı burada seçtik. Ölçü konusunda WhatsApp'tan çok sabırlı yardım aldık.
   - `items[2].author`: Zeynep & Can
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürer?
   - `items[0].answer`: Stoktaki ürünler 1-3 iş günü, kişiye özel ürünler 5-7 iş günü içinde sigortalı kargoyla gönderilir. ₺750 üzeri siparişlerde kargo ücretsizdir.
   - `items[1].question`: İade ve değişim nasıl yapılır?
   - `items[1].answer`: Teslimattan itibaren 14 gün içinde kullanılmamış ürünleri ücretsiz iade edebilirsiniz. Kişiye özel kazımalı ürünlerde iade yapılamaz, ölçü değişimi üc
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Kredi kartı, banka kartı (3D Secure), 6 aya varan taksit seçenekleri ve havale/EFT ile ödeme yapabilirsiniz.
   - `items[3].question`: Yüzük ölçümü nasıl öğrenirim?
   - `items[3].answer`: Ürün sayfalarındaki ölçü rehberini kullanabilir ya da Kadıköy atölyemize uğrayarak ücretsiz ölçü aldırabilirsiniz.
9. **cta**
   - `title`: Size Özel Bir Takı Tasarlayalım
   - `description`: Aklınızdaki tasarımı anlatın, Kadıköy atölyemizde sizin için elde üretelim.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Özel Tasarım İste
10. **contact**
   - `title`: Bize Ulaşın
   - `description`: Sipariş, ölçü veya özel tasarım talepleriniz için yazın; atölyemizi ziyaret etmek isterseniz randevu alın.
   - `email`: merhaba@modaatolyetaki.com
   - `phone`: +90 216 555 42 42
   - `address`: Caferağa Mah. Moda Cad. No: 42, Kadıköy / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Sipariş No (varsa)
11. **footer**
   - `tagline`: Kadıköy'de elde üretilen gümüş ve altın takılar.
   - `columns[0].title`: Alışveriş
   - `columns[0].links[0].label`: Yüzükler
   - `columns[0].links[1].label`: Kolyeler
   - `columns[0].links[2].label`: Bileklikler
   - `columns[0].links[3].label`: Fırsatlar
   - `columns[1].title`: Yardım
   - `columns[1].links[0].label`: Kargo ve Teslimat
   - `columns[1].links[1].label`: İade ve Değişim

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 55.8 sn | 10648 giriş / 6262 çıkış tok. | $0.168 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 11 (7-10 istendi)

**Ad:** Moda Atölye Takı | **Slogan:** Kadıköy'de elde işlenen gümüş ve altın takılar | **SEO:** Kadıköy El Yapımı Takı
**Sayfalar:** Ana Sayfa, Ürünler, Koleksiyonlar, Atölyemiz, İletişim

1. **hero**
   - `badge`: Kadıköy'den El Yapımı
   - `title`: Elde işlenen, ömür boyu taşınan takılar
   - `description`: 925 ayar gümüş ve 14 ayar altından, Kadıköy atölyemizde tek tek şekillendirilen yüzük, kolye ve bileklikler.
   - `primaryButton.label`: Koleksiyonu Keşfet
   - `secondaryButton.label`: Haftanın Fırsatları
   - `trustText`: 5.000+ mutlu müşteri · Ücretsiz kargo · 14 gün kolay iade
   - `image.alt`: Koyu kadife üzerinde altın ve pırlanta takılar
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
2. **categories**
   - `title`: Koleksiyonlara Göz Atın
   - `subtitle`: Her parça Kadıköy atölyemizde elde işlenir
   - `items[0].name`: Yüzükler
   - `items[0].description`: Tektaş, alyans ve minimal yüzükler
   - `items[0].count`: 64 ürün
   - `items[0].alt`: El yapımı yüzükler
   - `items[1].name`: Kolyeler
   - `items[1].description`: Zincir, madalyon ve harf kolyeler
   - `items[1].count`: 52 ürün
3. **products**
   - `title`: Çok Satanlar
   - `subtitle`: Müşterilerimizin en sevdiği el yapımı parçalar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm ürünleri gör
   - `items[0].name`: Moda Burnu Altın Tektaş Yüzük
   - `items[0].price`: ₺8.450
   - `items[0].badge`: Çok Satan
   - `items[0].category`: Yüzük
4. **features**
   - `title`: Güvenle Alışveriş Yapın
   - `subtitle`: Her siparişte aynı özen
   - `items[0].title`: Ücretsiz ve Hızlı Kargo
   - `items[0].description`: ₺750 üzeri siparişlerde ücretsiz, 1-3 iş gününde sigortalı teslimat.
   - `items[1].title`: 14 Gün Kolay İade
   - `items[1].description`: Beğenmediğiniz ürünü 14 gün içinde ücretsiz iade edin.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 3D Secure altyapısı ve 12 aya varan taksit seçenekleri.
   - `items[3].title`: Ayar Sertifikası
5. **stats**
   - `title`: Atölyemizden Rakamlar
   - `items[0].value`: 5.000+
   - `items[0].label`: Mutlu müşteri
   - `items[1].value`: %100
   - `items[1].label`: El işçiliği
   - `items[2].value`: 4.9/5
   - `items[2].label`: Müşteri puanı
   - `items[3].value`: 12 yıl
   - `items[3].label`: Kadıköy'de zanaat
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Sadece bu hafta geçerli özel fiyatlar
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm indirimleri gör
   - `items[0].name`: Yıldız Gümüş Kolye
   - `items[0].price`: ₺790
   - `items[0].oldPrice`: ₺1.050
   - `items[0].badge`: %25
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Annemin adını işlettiğim kolye o kadar zarif geldi ki ağladı. Paketleme de çok özenliydi.
   - `items[0].author`: Elif K.
   - `items[0].role`: Kadıköy
   - `items[1].quote`: Dalga yüzüğü her gün takıyorum, hiç kararmadı. Ölçü değişimini de hemen yaptılar.
   - `items[1].author`: Burak T.
   - `items[1].role`: Ankara
   - `items[2].quote`: Nişan yüzüğünü buradan aldık; el işçiliği gerçekten fark ediliyor. Ertesi gün kargodaydı.
   - `items[2].author`: Selin & Mert
8. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Kargo ne kadar sürer ve ücreti nedir?
   - `items[0].answer`: Stoktaki ürünler 1-3 iş gününde sigortalı kargoyla gönderilir. ₺750 üzeri siparişlerde kargo ücretsizdir; kişiye özel ürünler 5-7 iş günü içinde hazır
   - `items[1].question`: İade ve değişim nasıl yapılır?
   - `items[1].answer`: Teslimattan itibaren 14 gün içinde ücretsiz iade veya değişim yapabilirsiniz. Kişiye özel işlenen ürünlerde yalnızca üretim hatası durumunda iade kabu
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Tüm kredi ve banka kartları, havale/EFT ile ödeme alıyoruz. Kredi kartına 12 aya varan taksit imkânı sunuyoruz.
   - `items[3].question`: Yüzük ölçümü nasıl bilirim?
   - `items[3].answer`: Ürün sayfalarındaki ölçü rehberini kullanabilir ya da WhatsApp'tan bize ulaşabilirsiniz. İlk ölçü değişimi ücretsizdir.
9. **cta**
   - `title`: İlk siparişinize %10 indirim
   - `description`: Bültenimize katılın, yeni koleksiyonlardan ve atölye fırsatlarından ilk siz haberdar olun.
   - `primaryButton.label`: Alışverişe Başla
   - `secondaryButton.label`: Koleksiyonları Gör
10. **contact**
   - `title`: Bize Ulaşın
   - `description`: Kişiye özel tasarım, ölçü ya da siparişinizle ilgili sorularınız için yazın; Kadıköy atölyemizi ziyaret etmek için randevu alabilirsiniz.
   - `email`: merhaba@modaatolyetaki.com
   - `phone`: +90 216 345 67 89
   - `address`: Caferağa Mah. Moda Cad. No:42, Kadıköy / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Sipariş No (varsa)
11. **footer**
   - `tagline`: Kadıköy'de elde işlenen gümüş ve altın takılar.
   - `columns[0].title`: Alışveriş
   - `columns[0].links[0].label`: Yüzükler
   - `columns[0].links[1].label`: Kolyeler
   - `columns[0].links[2].label`: Bileklikler
   - `columns[0].links[3].label`: Küpeler
   - `columns[1].title`: Yardım
   - `columns[1].links[0].label`: Kargo ve Teslimat
   - `columns[1].links[1].label`: İade ve Değişim

</details>

### Mücevher e-ticaret: Bölüm düzenleme

Talimat: _Ana başlığı daha sıcak ve davetkar bir tonda yeniden yaz, birincil buton metnini "Koleksiyonu Keşfet" yap._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 7.6 sn | 4102 giriş / 1044 çıkış tok. | $0.0031</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş — Tarzınızı Keşfetmeye Davetlisiniz
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

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 8.4 sn | 4102 giriş / 1224 çıkış tok. | $0.0035</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş'e Hoş Geldiniz — Tarzınızı Birlikte Keşfedelim
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

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.3 sn | 8836 giriş / 742 çıkış tok. | $0.025</summary>

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

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.4 sn | 8836 giriş / 742 çıkış tok. | $0.025</summary>

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

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 8.0 sn | 8836 giriş / 958 çıkış tok. | $0.055</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş'e hoş geldiniz — size özel parçaları birlikte keşfedelim
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Yapımı Gümüş'e hoş geldiniz — size özel parçaları birlikte keşfedelim
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

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 8.1 sn | 8836 giriş / 967 çıkış tok. | $0.055</summary>

- `badge`: Yeni Sezon
- `title`: Yapımı Gümüş'e hoş geldiniz — her parçada size özel bir dokunuş
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Koleksiyonu Keşfet
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Yapımı Gümüş'e hoş geldiniz — her parçada size özel bir dokunuş
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

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 10.3 sn | 472 giriş / 1441 çıkış tok. | $0.0030</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, gümüş renkli tasarımıyla sade ve şık bir görünüm sunar. Tektaş zirkon detayı dikkat çeker ve farklı stillerle kolayca kombinlenir.



- Tektaş zirkon detayıyla zarif ve göz alıcı görünüm

- Gümüş renkli tasarım, farklı kombinlere uyum sağlar

- Sade ve şık duruşuyla günlük ve özel kullanıma uygun

- Dikkat çeken tek taş vurgu ile klasik bir stil sunar

**Özellikler:** Ürün Adı: Zirkon Taşlı Tektaş Yüzük; Renk: Gümüş; Taş Türü: Zirkon; Stil: Tektaş; Malzeme: Gümüş renkli metal (doğrula)

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük — Gümüş Renk

**SEO açıklama (114):** Zirkon taşlı tektaş yüzük, gümüş renkli sade ve zarif tasarım. Tek taş detayıyla gündüzden geceye şık bir seçenek.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 17.1 sn | 472 giriş / 2609 çıkış tok. | $0.0053</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, tek bir zirkon taşına sahip bir yüzüktür. Ürün özelliklerinde renk "Gümüş" olarak belirtilmiştir. Beden ve malzeme bilgileri açıklamada yer almadığından satın almadan önce doğrulama önerilir.



- Tektaş düzen: üründe tek bir zirkon taşı bulunur.

- Gümüş renk: ürünün rengi gümüş olarak belirtilmiştir.

- Aksesuar kategorisinde listelenmiş bir yüzük.

**Özellikler:** Ürün Adı: Zirkon Taşlı Tektaş Yüzük; Taş: Zirkon; Stil: Tektaş; Renk: Gümüş; Malzeme: Gümüş renkli metal (doğrula); Beden/Numara: - (doğrula); Fotoğraf Sayısı: 0; Kategori: Aksesuarlar

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük — Gümüş Renk

**SEO açıklama (114):** Gümüş renkli zirkon taşlı tektaş yüzük. Taş tipi ve renk belirtilmiştir; beden ve malzeme için doğrulama önerilir.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 8.0 sn | 1078 giriş / 494 çıkış tok. | $0.0071</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, sade ve şık tasarımıyla günlük kombinlerinize zarif bir dokunuş katar. Gümüş rengi ve tek taş detayı sayesinde hem gündüz hem özel davetlerde rahatlıkla tercih edilebilir. Hediye olarak da düşünülebilecek klasik bir aksesuardır.



- Zarif tektaş tasarım

- Gümüş rengiyle kolay kombinlenir

- Günlük kullanıma uygun sade görünüm

- Özel günler için şık hediye seçeneği

**Özellikler:** Renk: Gümüş; Taş Tipi: Zirkon; Model: Tektaş; Ürün Tipi: Yüzük; Materyal: Gümüş (doğrula)

**SEO başlık (36):** Zirkon Taşlı Tektaş Yüzük Gümüş Renk

**SEO açıklama (133):** Zirkon taşlı gümüş renkli tektaş yüzük ile şık ve sade bir görünüm yakalayın. Günlük kullanım ve özel günler için zarif bir aksesuar.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 7.6 sn | 1078 giriş / 519 çıkış tok. | $0.0073</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, sade ve zarif tasarımıyla günlük kullanımda da özel davetlerde de şıklığını tamamlar. Gümüş rengi ve tek taşlı yapısı sayesinde birçok kombinle kolayca uyum sağlar. Hem kendiniz için hem de sevdikleriniz için hoş bir hediye seçeneğidir.



- Tek taşlı sade tasarım

- Gümüş rengiyle kolay kombinlenir

- Zirkon taşıyla ışıltılı görünüm

- Günlük ve özel günlerde kullanıma uygun

- Hediye için şık bir seçenek

**Özellikler:** Renk: Gümüş; Taş: Zirkon; Model: Tektaş; Ürün Tipi: Yüzük; Malzeme: Gümüş (doğrula)

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük - Gümüş Renk

**SEO açıklama (114):** Gümüş renkli Zirkon Taşlı Tektaş Yüzük ile şıklığınızı tamamlayın. Sade, zarif ve her kombine uyumlu bir aksesuar.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 11.2 sn | 1078 giriş / 696 çıkış tok. | $0.018</summary>

**Açıklama**

Zirkon taşlı tektaş yüzük, gümüş rengiyle sade ve zarif bir görünüm sunar. Tek taşlı klasik tasarımı, günlük kullanımda da özel günlerde de şık bir tamamlayıcı olur. Kendiniz için ya da sevdiklerinize hediye olarak tercih edebilirsiniz.



- Tektaş tasarımıyla zamansız ve klasik bir görünüm

- Zirkon taşıyla göz alıcı bir parıltı

- Gümüş rengi sayesinde birçok kombinle kolay uyum

- Günlük kullanıma ve özel günlere uygun

- Hediye için şık bir seçenek

**Özellikler:** Ürün Tipi: Yüzük; Model: Tektaş; Taş: Zirkon; Renk: Gümüş

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük - Gümüş Renk

**SEO açıklama (126):** Gümüş renkli zirkon taşlı tektaş yüzük. Sade ve zarif tasarımıyla günlük kullanım, özel günler ve hediye için şık bir seçenek.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 12.6 sn | 1078 giriş / 771 çıkış tok. | $0.020</summary>

**Açıklama**

Zirkon Taşlı Tektaş Yüzük, gümüş rengi ve tek taşlı sade tasarımıyla zarif bir görünüm sunar. Günlük kullanımda da özel günlerde de tarzınıza ışıltılı bir dokunuş katar.



- Tek taşlı sade tasarım, şık ve zamansız bir görünüm sağlar

- Zirkon taş, yüzüğe ışıltılı bir hava katar

- Gümüş rengi birçok kıyafet ve aksesuarla kolayca uyum sağlar

- Günlük kullanıma da özel davetlere de uygun bir tarz sunar

- Sevdiklerinize anlamlı bir hediye seçeneği olabilir

**Özellikler:** Taş: Zirkon; Model: Tektaş; Renk: Gümüş

**SEO başlık (38):** Zirkon Taşlı Tektaş Yüzük - Gümüş Renk

**SEO açıklama (122):** Gümüş rengi, zirkon taşlı tektaş yüzük. Sade ve zarif tasarımıyla günlük kullanıma ve özel günlere uygun şık bir aksesuar.

</details>

## Yoga stüdyosu

> Beşiktaş'ta butik bir yoga ve pilates stüdyosu açtım. Sakin, doğal bir site istiyorum; ders programı, eğitmenler ve randevu alma bölümü olsun.

### Yoga stüdyosu: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): HATA | 45.7 sn | 4862 giriş / 7548 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): HATA | 44.0 sn | 4862 giriş / 7316 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): HATA | 45.3 sn | 10509 giriş / 7090 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): HATA | 44.1 sn | 10509 giriş / 6789 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 63.6 sn | 10509 giriş / 7107 çıkış tok. | $0.184 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Nefes Beşiktaş | **Slogan:** Beşiktaş'ın kalbinde sakin bir nefes alanı | **SEO:** Beşiktaş Yoga ve Pilates Stüdyosu
**Sayfalar:** Ana Sayfa, Paketler ve Mağaza, Ders Programı, Eğitmenler, Randevu Al, İletişim

1. **hero**
   - `badge`: Beşiktaş'ın butik stüdyosu
   - `title`: Nefesine dön, bedenini dinle
   - `description`: Küçük gruplar, deneyimli eğitmenler ve gün ışığıyla dolu bir salon. Yoga ve pilates derslerine bugün katıl.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ders Programı
   - `trustText`: Her derste en fazla 8 kişi • 1.200+ mutlu üye
   - `image.alt`: Gün ışığı alan sakin yoga stüdyosu
   - `image.position`: background
   - `slides[0].badge`: Yeni Sezon
2. **categories**
   - `title`: Ders Türlerimiz
   - `subtitle`: Sana en uygun pratiği seç, haftalık programdan yerini ayırt.
   - `items[0].name`: Hatha & Vinyasa Yoga
   - `items[0].description`: Nefes ve hareketin uyumu
   - `items[0].count`: Haftada 14 ders
   - `items[0].alt`: Vinyasa yoga
   - `items[1].name`: Reformer Pilates
   - `items[1].description`: Maksimum 4 kişilik gruplar
   - `items[1].count`: Haftada 18 ders
3. **products**
   - `title`: Ders Paketleri
   - `subtitle`: Paketini online al, randevunu dilediğin saate oluştur.
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm paketleri gör
   - `items[0].name`: Deneme Dersi
   - `items[0].price`: ₺0
   - `items[0].badge`: Ücretsiz
   - `items[0].category`: Yoga / Pilates
4. **features**
   - `title`: Neden Nefes Beşiktaş?
   - `items[0].title`: Küçük Gruplar
   - `items[0].description`: Yogada en fazla 8, reformerda en fazla 4 kişi.
   - `items[1].title`: Kolay Randevu
   - `items[1].description`: Paketini al, ders saatini online seç; 12 saat öncesine kadar ücretsiz iptal.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL ile kartla veya 3 taksitle ödeme.
   - `items[3].title`: Hızlı Kargo
   - `items[3].description`: Mağaza ürünleri 1-2 iş gününde kapında, 750₺ üzeri ücretsiz.
5. **stats**
   - `title`: Rakamlarla Nefes
   - `items[0].value`: 1.200+
   - `items[0].label`: Mutlu üye
   - `items[1].value`: 46
   - `items[1].label`: Haftalık ders
   - `items[2].value`: 6
   - `items[2].label`: Sertifikalı eğitmen
   - `items[3].value`: 4,9
   - `items[3].label`: Google puanı
6. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Pratiğini evde de sürdürmen için özenle seçilmiş ürünler.
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Mağazaya git
   - `items[0].name`: Doğal Kauçuk Yoga Matı 4 mm
   - `items[0].price`: ₺1.490
   - `items[0].oldPrice`: ₺1.890
   - `items[0].badge`: %21
7. **team**
   - `title`: Eğitmenlerimiz
   - `subtitle`: Uluslararası sertifikalı, deneyimli ve güler yüzlü bir ekip.
   - `members[0].name`: Elif Aydın
   - `members[0].role`: Kurucu & Yoga Eğitmeni
   - `members[0].bio`: RYT-500 sertifikalı, 12 yıllık Hatha ve Vinyasa deneyimi.
   - `members[1].name`: Can Erdem
   - `members[1].role`: Reformer Pilates Eğitmeni
   - `members[1].bio`: STOTT Pilates sertifikalı, fizyoterapi altyapılı.
   - `members[2].name`: Deniz Kaya
8. **testimonials**
   - `title`: Üyelerimiz Anlatıyor
   - `items[0].quote`: Beşiktaş'ın gürültüsünden çıkıp kapıdan girdiğim an nefesim yavaşlıyor. Küçük gruplar sayesinde her derste düzeltme alıyorum.
   - `items[0].author`: Ayşe T.
   - `items[0].role`: 8 aylık üye
   - `items[1].quote`: Bel ağrım için reformer'a başladım, üç ayda büyük fark gördüm. Can Hoca çok ilgili.
   - `items[1].author`: Murat K.
   - `items[1].role`: Reformer üyesi
   - `items[2].quote`: Online randevu sistemi çok pratik, aldığım mat da ertesi gün geldi.
   - `items[2].author`: Zeynep A.
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Ders programını nereden görebilirim?
   - `items[0].answer`: Haftalık ders programı 'Ders Programı' sayfasında yer alıyor; dersler hafta içi 07:30-21:00, hafta sonu 09:00-14:00 arasında.
   - `items[1].question`: Randevumu nasıl oluşturur, nasıl iptal ederim?
   - `items[1].answer`: Paketini aldıktan sonra üye panelinden saat seçebilirsin. Dersten 12 saat öncesine kadar ücretsiz iptal edebilirsin.
   - `items[2].question`: Daha önce hiç yoga/pilates yapmadım, katılabilir miyim?
   - `items[2].answer`: Elbette. Ücretsiz deneme dersi ve başlangıç seviyesi derslerimizle güvenle başlayabilirsin.
   - `items[3].question`: Ürünlerin kargo süresi ne kadar?
   - `items[3].answer`: Siparişler 1-2 iş gününde kargoya verilir; 750₺ ve üzeri alışverişlerde kargo ücretsizdir. Dilersen stüdyodan teslim alabilirsin.
10. **cta**
   - `title`: İlk dersin bizden
   - `description`: Matını getirmene gerek yok; sadece gel, nefes al ve kendini dinle.
   - `primaryButton.label`: Ücretsiz Deneme Dersi Al
   - `secondaryButton.label`: Paketleri İncele
11. **contact**
   - `title`: Randevu Al
   - `description`: Formu doldur, deneme dersin veya özel dersin için seni arayalım. Stüdyomuz Beşiktaş Çarşı'ya 3 dakika yürüme mesafesinde.
   - `email`: merhaba@nefesbesiktas.com
   - `phone`: +90 212 555 24 24
   - `address`: Sinanpaşa Mah. Ihlamurdere Cad. No: 24, Beşiktaş / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: Telefon
   - `fields[2]`: E-posta
   - `fields[3]`: Ders Türü
12. **footer**
   - `tagline`: Beşiktaş'ın kalbinde butik yoga ve pilates stüdyosu.
   - `columns[0].title`: Stüdyo
   - `columns[0].links[0].label`: Ders Programı
   - `columns[0].links[1].label`: Eğitmenler
   - `columns[0].links[2].label`: Randevu Al
   - `columns[1].title`: Mağaza
   - `columns[1].links[0].label`: Ders Paketleri
   - `columns[1].links[1].label`: Yoga Ekipmanları
   - `columns[1].links[2].label`: Fırsatlar

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 71.8 sn | 10509 giriş / 7781 çıkış tok. | $0.198 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Nefes Yoga & Pilates | **Slogan:** Beşiktaş'ın kalbinde sakin bir mola, güçlü bir beden | **SEO:** Beşiktaş Yoga ve Pilates Stüdyosu
**Sayfalar:** Ana Sayfa, Ders Paketleri & Ürünler, Ders Programı, Eğitmenler, Randevu, Hakkımızda

1. **hero**
   - `badge`: Beşiktaş'ta Butik Stüdyo
   - `title`: Nefes al, yavaşla, kendine dön
   - `description`: En fazla 10 kişilik sınıflarda yoga ve reformer pilates. İlk deneme dersin bizden.
   - `primaryButton.label`: Randevu Al
   - `secondaryButton.label`: Ders Programı
   - `trustText`: 1.200+ öğrenci, Google'da 4,9 puan
   - `image.alt`: Gün ışığı alan sakin yoga stüdyosu
   - `image.position`: background
   - `slides[0].badge`: İlk Ders Ücretsiz
2. **categories**
   - `title`: Ders Programımızı Keşfet
   - `subtitle`: Her seviyeye uygun, haftada 40+ ders
   - `items[0].name`: Hatha Yoga
   - `items[0].description`: Pzt–Cum 08:00 & 19:00 · Başlangıç dostu
   - `items[0].count`: Haftada 10 ders
   - `items[0].alt`: Hatha yoga dersi
   - `items[1].name`: Vinyasa Akış
   - `items[1].description`: Salı, Perşembe 18:30 · Cumartesi 09:00
   - `items[1].count`: Haftada 8 ders
3. **products**
   - `title`: Ders Paketleri & Stüdyo Ürünleri
   - `subtitle`: En çok tercih edilen paketler ve özenle seçilmiş ekipmanlar
   - `layout`: grid
   - `source`: manual
   - `viewAllLabel`: Tüm paketleri gör
   - `items[0].name`: Deneme Dersi
   - `items[0].price`: Ücretsiz
   - `items[0].badge`: Yeni Üye
   - `items[0].category`: Ders
4. **features**
   - `title`: Neden Nefes?
   - `subtitle`: Sakin bir stüdyo, güvenli bir deneyim
   - `items[0].title`: Küçük Gruplar
   - `items[0].description`: Yoga en fazla 10, reformer en fazla 6 kişi; herkese birebir ilgi.
   - `items[1].title`: Kolay Randevu
   - `items[1].description`: Dersini online ayırt, 6 saat öncesine kadar ücretsiz iptal et.
   - `items[2].title`: Güvenli Ödeme
   - `items[2].description`: 256-bit SSL ile kredi kartı ve taksitli ödeme seçenekleri.
   - `items[3].title`: Hızlı Teslimat
5. **stats**
   - `title`: Stüdyomuz Rakamlarla
   - `items[0].value`: 1.200+
   - `items[0].label`: Mutlu öğrenci
   - `items[1].value`: 40+
   - `items[1].label`: Haftalık ders
   - `items[2].value`: 6
   - `items[2].label`: Sertifikalı eğitmen
   - `items[3].value`: 4,9
   - `items[3].label`: Google puanı
6. **team**
   - `title`: Eğitmenlerimiz
   - `subtitle`: Uluslararası sertifikalı, şefkatli rehberler
   - `members[0].name`: Elif Aydın
   - `members[0].role`: Kurucu · Hatha & Yin Yoga
   - `members[0].bio`: RYT-500 sertifikalı, 12 yıllık deneyim. Nefes ve farkındalık odaklı dersler.
   - `members[1].name`: Can Demir
   - `members[1].role`: Vinyasa & Ashtanga
   - `members[1].bio`: Mysore'da eğitim aldı. Akışkan, enerjik ve nefesle uyumlu seanslar.
   - `members[2].name`: Zeynep Kaya
7. **products**
   - `title`: Haftanın Fırsatları
   - `subtitle`: Bu haftaya özel indirimli paket ve ürünler
   - `layout`: carousel
   - `source`: sale
   - `viewAllLabel`: Tüm fırsatları gör
   - `items[0].name`: Reformer 4'lü Başlangıç
   - `items[0].price`: ₺2.700
   - `items[0].oldPrice`: ₺3.400
   - `items[0].badge`: %20
8. **testimonials**
   - `title`: Öğrencilerimiz Ne Diyor?
   - `items[0].quote`: Beşiktaş'ın kalabalığından sonra burası gerçek bir sığınak. Elif Hoca'nın Yin dersleri uykumu bile düzeltti.
   - `items[0].author`: Selin T.
   - `items[0].role`: 8 aydır üye
   - `items[1].quote`: Bel ağrım için reformer'a başladım; Zeynep Hanım'ın ilgisiyle üç ayda ağrısız hale geldim.
   - `items[1].author`: Murat K.
   - `items[1].role`: Reformer öğrencisi
   - `items[2].quote`: Gruplar küçük, ortam çok huzurlu. Online randevu sistemi de çok pratik.
   - `items[2].author`: Ayşe B.
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: Daha önce hiç yoga yapmadım, katılabilir miyim?
   - `items[0].answer`: Elbette. Hatha ve Mat Pilates derslerimiz başlangıç dostudur; ilk deneme dersin ücretsiz.
   - `items[1].question`: Randevumu nasıl iptal ederim?
   - `items[1].answer`: Ders saatinden 6 saat öncesine kadar online panelden ücretsiz iptal edebilirsin; ders hakkın iade edilir.
   - `items[2].question`: Hangi ödeme yöntemlerini kabul ediyorsunuz?
   - `items[2].answer`: Kredi kartı, banka kartı ve havale. Paketlerde 3 taksit imkânı sunuyoruz; tüm ödemeler SSL ile korunur.
   - `items[3].question`: Ekipman siparişleri ne zaman ulaşır?
   - `items[3].answer`: Beşiktaş içi siparişler aynı gün, Türkiye geneli 2 iş günü içinde kargoya verilir. ₺750 üzeri kargo ücretsiz.
10. **cta**
   - `title`: İlk dersin bizden, gel tanışalım
   - `description`: Sana uygun dersi seç, yerini ayırt ve Beşiktaş'ta kendine bir nefes alanı aç.
   - `primaryButton.label`: Ücretsiz Deneme Dersi
   - `secondaryButton.label`: Paketleri İncele
11. **contact**
   - `title`: Randevu Al
   - `description`: Ders, saat ve eğitmen tercihini yaz; en geç 2 saat içinde randevunu onaylayalım.
   - `email`: merhaba@nefesyoga.com.tr
   - `phone`: +90 212 555 24 24
   - `address`: Sinanpaşa Mah. Ihlamurdere Cad. No: 24, Kat 2, Beşiktaş / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: Telefon
   - `fields[2]`: E-posta
   - `fields[3]`: İlgilendiğin Ders
12. **footer**
   - `tagline`: Beşiktaş'ta butik yoga ve pilates stüdyosu
   - `columns[0].title`: Dersler
   - `columns[0].links[0].label`: Hatha Yoga
   - `columns[0].links[1].label`: Vinyasa
   - `columns[0].links[2].label`: Reformer Pilates
   - `columns[0].links[3].label`: Yin & Meditasyon
   - `columns[1].title`: Stüdyo
   - `columns[1].links[0].label`: Eğitmenler
   - `columns[1].links[1].label`: Ders Programı

</details>

### Yoga stüdyosu: Bölüm düzenleme

Talimat: _Ana başlığı daha huzurlu ve samimi yap, birincil buton metnini "Deneme Dersi Al" olarak değiştir._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 6.0 sn | 4092 giriş / 800 çıkış tok. | $0.0026</summary>

- `badge`: Yeni Sezon
- `title`: Sakin ve samimi yoga — Kendinize zaman ayırın
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

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 6.6 sn | 4092 giriş / 845 çıkış tok. | $0.0027</summary>

- `badge`: Yeni Sezon
- `title`: Sakin ve Samimi Yoga — Kendinizi Evde Hissedin
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

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.3 sn | 8822 giriş / 736 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — nefes alın, kendinize hoş geldiniz
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — nefes alın, kendinize hoş geldiniz
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

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.5 sn | 8822 giriş / 746 çıkış tok. | $0.025</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — nefes al, kendine dön, huzuru birlikte bulalım
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — nefes al, kendine dön, huzuru birlikte bulalım
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

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 9.3 sn | 8822 giriş / 1025 çıkış tok. | $0.056</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga'da nefes alın, yavaşlayın ve kendinize dönün
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga'da nefes alın, yavaşlayın ve kendinize dönün
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

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 9.0 sn | 8822 giriş / 1001 çıkış tok. | $0.055</summary>

- `badge`: Yeni Sezon
- `title`: Butik Yoga — derin bir nefes alın, kendinize zaman ayırın
- `description`: Özenle seçilmiş koleksiyonumuzu keşfedin. Hızlı kargo, kolay iade ve güvenli ödeme.
- `primaryButton.label`: Deneme Dersi Al
- `secondaryButton.label`: Kampanyalar
- `trustText`: Ücretsiz kargo • 14 gün iade
- `image.alt`: Ürün vitrini
- `slides[0].badge`: Yeni Sezon
- `slides[0].title`: Butik Yoga — derin bir nefes alın, kendinize zaman ayırın
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

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 17.1 sn | 454 giriş / 1829 çıkış tok. | $0.0038</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, ismindeki kaymaz yüzey özelliği ve 6 mm kalınlığıyla tasarlanmış bir yoga matıdır. Yoga ve yere yakın egzersizler için uygun şekilde kullanılabilir.



- Kaymaz yüzey

- 6 mm kalınlık

- Yoga için uygun

**Özellikler:** Ürün adı: Kaymaz Yoga Matı 6 mm; Tür: Yoga matı; Yüzey: Kaymaz; Kalınlık: 6 mm; Kullanım: Yoga; Malzeme: - (doğrula); Renk: - (doğrula); Boyutlar: - (doğrula)

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (90):** Kaymaz yüzeye sahip 6 mm kalınlığında yoga matı. Yoga için tasarlanmış temel mat seçeneği.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 13.7 sn | 454 giriş / 2037 çıkış tok. | $0.0042</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, kaymayı önleyen yüzeyi ve 6 mm kalınlığıyla temel yoga ihtiyaçlarına uygun bir mat sunar. Basit ve doğrudan kullanım için tasarlanmış bir seçenektir.



- Kaymaz yüzey ile güvenli tutuş sağlar

- 6 mm kalınlık sayesinde zemine karşı yastıklama sunar

- Yoga pratiği için uygun, sade bir mat

**Özellikler:** Ürün adı: Kaymaz Yoga Matı 6 mm; Ürün tipi: Yoga matı; Kalınlık: 6 mm; Yüzey: Kaymaz

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (95):** Kaymaz yüzeye ve 6 mm kalınlığa sahip yoga matı. Yoga uygulamaları için temel bir mat seçeneği.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 4.5 sn | 1056 giriş / 505 çıkış tok. | $0.0072</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve egzersiz rutinleriniz için pratik bir destek sunar. Kaymaz yapısı sayesinde duruşlarınızda daha güvenli bir zemin hissi verir. 6 mm kalınlığı ile hareketleriniz sırasında konfor sağlamayı hedefler.



- Kaymaz yapı ile duruşlarda daha stabil zemin

- 6 mm kalınlık ile konforlu kullanım

- Yoga ve egzersiz çalışmaları için uygun

- Evde ya da stüdyoda rahatça kullanılabilir

**Özellikler:** Ürün Adı: Kaymaz Yoga Matı; Kalınlık: 6 mm; Yüzey: Kaymaz; Malzeme: - (doğrula); Boyut: - (doğrula)

**SEO başlık (46):** Kaymaz Yoga Matı 6 mm | Konforlu Egzersiz Matı

**SEO açıklama (113):** Kaymaz yapıya sahip 6 mm yoga matı ile yoga ve egzersiz çalışmalarınızda konforlu ve güvenli bir zemin elde edin.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.2 sn | 1056 giriş / 481 çıkış tok. | $0.0069</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve egzersiz rutinleriniz için pratik bir tabandır. Kaymaz yapısı sayesinde hareketlerinizi daha dengeli yapmanıza yardımcı olur. 6 mm kalınlığı ile zemin üzerinde daha rahat bir kullanım sunar.



- Kaymaz yüzey ile daha dengeli duruş

- 6 mm kalınlıkla konforlu zemin desteği

- Yoga ve egzersiz çalışmaları için uygun

- Evde veya stüdyoda kullanıma elverişli

**Özellikler:** Kalınlık: 6 mm; Yüzey: Kaymaz; Kullanım Alanı: Yoga ve egzersiz (doğrula); Malzeme: - (doğrula)

**SEO başlık (46):** Kaymaz Yoga Matı 6 mm | Konforlu Egzersiz Matı

**SEO açıklama (109):** Kaymaz Yoga Matı 6 mm ile yoga ve egzersizlerinizde dengeli ve konforlu bir zemin elde edin. Hemen inceleyin.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 11.7 sn | 1056 giriş / 798 çıkış tok. | $0.020</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve esneme çalışmalarınız için kaymaz yüzeyiyle güvenli bir zemin sunar. 6 mm kalınlığı sayesinde zemin üzerinde daha konforlu bir kullanım sağlar. Evde ya da stüdyoda düzenli antrenmanlarınıza eşlik edecek pratik bir yardımcıdır.



- Kaymaz yüzeyi sayesinde pozlarda daha sağlam bir duruş sağlar

- 6 mm kalınlık ile sert zemine karşı konforlu bir kullanım sunar

- Yoga, pilates ve esneme hareketleri için uygundur

- Evde veya stüdyoda rahatça kullanılabilir

**Özellikler:** Kalınlık: 6 mm; Yüzey Özelliği: Kaymaz; Kullanım Alanı: Yoga, pilates, esneme (doğrula)

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (106):** Kaymaz yüzeyli 6 mm yoga matı ile yoga ve esneme çalışmalarınızda konforlu ve güvenli bir zemin elde edin.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 11.7 sn | 1056 giriş / 821 çıkış tok. | $0.021</summary>

**Açıklama**

Kaymaz Yoga Matı 6 mm, yoga ve esneme çalışmalarınızda size sağlam bir zemin sunmak için tasarlandı. Kaymaz yüzeyi sayesinde pozlarınızı daha güvenle sürdürebilir, 6 mm kalınlığıyla zeminle aranıza konforlu bir katman koyabilirsiniz.



- Kaymaz yüzeyi ile pozlar sırasında daha sağlam tutuş

- 6 mm kalınlık ile zeminde daha konforlu bir çalışma alanı

- Evde yoga ve esneme çalışmaları için pratik bir seçenek

- Kullanım sonrası kolayca toplanıp kaldırılabilir

**Özellikler:** Kalınlık: 6 mm; Yüzey özelliği: Kaymaz; Kullanım alanı: Yoga, pilates ve esneme çalışmaları (doğrula); Malzeme: - (doğrula); Ölçüler: - (doğrula); Renk: - (doğrula)

**SEO başlık (21):** Kaymaz Yoga Matı 6 mm

**SEO açıklama (116):** Kaymaz yüzeyli 6 mm yoga matı ile yoga ve esneme çalışmalarınızda daha sağlam tutuş ve konforlu bir zemin elde edin.

</details>

## Dijital ajans

> İstanbul'da faaliyet gösteren, SEO, sosyal medya yönetimi ve web tasarım hizmeti veren bir dijital ajans için kurumsal ve modern bir web sitesi.

### Dijital ajans: Site üretimi

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 37.6 sn | 4636 giriş / 6293 çıkış tok. | $0.014</summary>

**Ad:** Nexa Dijital | **Slogan:** İstanbul merkezli performans odaklı dijital ajans | **SEO:** İstanbul Dijital Pazarlama Ajansı
**Sayfalar:** Ana Sayfa, Hizmetler, Portföy, Fiyatlar, Hakkımızda

1. **hero**
   - `badge`: Tam Hizmet Dijital Ajans
   - `title`: SEO, Sosyal Medya ve Web Tasarımında Ölçülebilir Büyüme
   - `description`: İstanbul merkezli Nexa Dijital, veri odaklı SEO stratejileri, yaratıcı sosyal medya yönetimi ve dönüşüm odaklı web tasarımlarıyla markalarınızı büyütü
   - `primaryButton.label`: Teklif Al
   - `secondaryButton.label`: Hizmetlerimiz
   - `trustText`: 100+ proje • 50+ uzun dönem müşteriler • Ortalama %3.8 dönüşüm artışı
   - `image.alt`: Ofiste dijital ekip ve İstanbul siluetiyle modern teknoloji görseli
   - `image.position`: right
2. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Markanız için uçtan uca dijital çözümler
   - `items[0].title`: SEO & Arama Motoru Optimizasyonu
   - `items[0].description`: Teknik SEO denetimleri, içerik stratejisi, anahtar kelime hedefleme ve organik görünürlüğü sürdürülebilir şekilde artıran optimizasyonlar.
   - `items[1].title`: Sosyal Medya Yönetimi ve Büyüme
   - `items[1].description`: Platforma özel içerik, kampanya yönetimi, topluluk yönetimi ve reklam optimizasyonu ile takipçi ve etkileşimi artırıyoruz.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Kullanıcı odaklı, hız ve SEO optimizasyonlu kurumsal web siteleri ve e-ticaret çözümleri; performans ve dönüşüm öncelikli.
   - `items[3].title`: İçerik Stratejisi ve Üretim
3. **portfolio**
   - `title`: Seçili Projeler
   - `subtitle`: Başarı hikayelerimizden örnekler
   - `items[0].title`: E-Ticaret SEO Yeniden Yapılandırması
   - `items[0].category`: SEO
   - `items[0].description`: Organik trafikte %120 artış ve hedefli ürün kelimelerinde ilk sayfa sonuçları.
   - `items[0].alt`: E-ticaret SEO başarı grafiği
   - `items[1].title`: Marka Yenileme ve Web Sitesi
   - `items[1].category`: Web Tasarım
   - `items[1].description`: Yeni UX ile dönüşüm oranında %45 artış sağlanan kurumsal web sitesi.
4. **gallery**
   - `title`: İş Örnekleri Galerisi
   - `subtitle`: Ekran görüntüleri ve kampanya kreatiflerinden seçmeler
   - `items[0].caption`: SEO rapor görseli
   - `items[0].alt`: SEO raporu ekran görüntüsü
   - `items[1].caption`: Kreatif reklam serisi
   - `items[1].alt`: Sosyal medya reklam kreatifleri
   - `items[2].caption`: Mobil site deneyimi
   - `items[2].alt`: Mobil web tasarım görünümü
5. **team**
   - `title`: Ekip
   - `subtitle`: Strateji, yaratıcılık ve teknoloji bir arada
   - `members[0].name`: Elif Arslan
   - `members[0].role`: Strateji & SEO Direktörü
   - `members[0].bio`: 10+ yıl SEO tecrübesiyle teknik ve içerik stratejilerini bütünleştirir; veri odaklı büyüme planları hazırlar.
   - `members[1].name`: Mert Kaya
   - `members[1].role`: Sosyal Medya Yaratıcısı
   - `members[1].bio`: Kampanya konseptleri ve içerik üretiminde uzman; marka hikâyelerini sosyal platformlara taşıyor.
   - `members[2].name`: Zeynep Güneş
6. **pricing**
   - `title`: Fiyatlandırma
   - `subtitle`: İhtiyaca göre paketler — özel teklifler için teklif alın
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺2.499
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayan KOBİ'ler için temel dijital paket
   - `plans[0].features[0]`: Aylık SEO temeli
   - `plans[0].features[1]`: Haftalık sosyal medya yönetimi (3 gönderi)
   - `plans[0].features[2]`: Standart web bakım
7. **testimonials**
   - `title`: Müşteri Yorumları
   - `items[0].quote`: Nexa ile çalışmak satışlarımızı canlı arama trafiğiyle %80 artırdı. Strateji ve uygulama kusursuzdu.
   - `items[0].author`: Kemal Yılmaz
   - `items[0].role`: E-Ticaret Sahibi
   - `items[1].quote`: Markamızın sosyal medya sesi kısa sürede oturdu; kampanyalarımızın ROAS değeri belirgin şekilde yükseldi.
   - `items[1].author`: Ayşe Deniz
   - `items[1].role`: Pazarlama Müdürü
   - `items[2].quote`: Web sitemiz yeniden tasarımı sonrası dönüşümler ve sayfa hızı beklentimizin çok üstünde gerçekleşti.
   - `items[2].author`: Sinan Öztürk
8. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: Başlangıçta hangi analizleri yapıyorsunuz?
   - `items[0].answer`: Teknik SEO denetimi, mevcut trafik analizi, rakip analizi ve içerik değerlendirmesi yapıyoruz; sonuçlara göre yol haritası çıkarıyoruz.
   - `items[1].question`: Sosyal medya için içerik üretimi nasıl çalışıyor?
   - `items[1].answer`: Hedef kitlenize uygun içerik takvimi oluşturuyor, onay süreçleri sonrası gönderileri yayınlıyor ve performansı aylık olarak raporluyoruz.
   - `items[2].question`: Web sitesi projeleri ne kadar sürer?
   - `items[2].answer`: Projenin kapsamına göre 4 haftadan başlayıp 12 haftaya kadar değişir. Net süre teklif ve kapsam onayından sonra verilir.
   - `items[3].question`: Raporlama sıklığı nedir?
   - `items[3].answer`: Tüm paketlerde aylık kapsamlı raporlama sunuyoruz; Pro paket müşterileri için haftalık performans özetleri eklenir.
9. **contact**
   - `title`: İletişim
   - `description`: Projeniz hakkında konuşalım. İhtiyaçlarınızı paylaşın, size özel strateji ve maliyet teklifimizi hazırlayalım.
   - `email`: iletisim@nexadijital.com
   - `phone`: +90 212 555 01 23
   - `address`: Şişli, İstanbul, Türkiye
   - `fields[0]`: Adınız
   - `fields[1]`: E-posta
   - `fields[2]`: Şirket
   - `fields[3]`: Mesaj
10. **footer**
   - `tagline`: Veriyle yöneten, yaratıcılıkla büyüten dijital ortak
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Şirket
   - `columns[1].links[0].label`: Hakkımızda
   - `columns[1].links[1].label`: Kariyer
   - `columns[1].links[2].label`: Basın

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): HATA | 31.6 sn | 4636 giriş / 5288 çıkış tok. | $0</summary>

Hata: No object generated: response did not match schema.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 34.0 sn | 10165 giriş / 5234 çıkış tok. | $0.073 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Pikselhane | **Slogan:** Markanızı dijitalde görünür, ölçülebilir ve büyüyen hale getiriyoruz. | **SEO:** İstanbul Dijital Ajans SEO Web Tasarım
**Sayfalar:** Ana Sayfa, Hizmetler, Projeler, Hakkımızda, İletişim

1. **hero**
   - `badge`: İstanbul merkezli dijital büyüme ajansı
   - `title`: Markanızı Google'da ve sosyal medyada bir adım öne taşıyoruz
   - `description`: SEO, sosyal medya yönetimi ve web tasarımı tek çatı altında topluyoruz. Veriye dayalı stratejilerle ziyaretçiyi müşteriye, müşteriyi marka elçisine dö
   - `primaryButton.label`: Ücretsiz Dijital Analiz
   - `secondaryButton.label`: Projelerimiz
   - `trustText`: İstanbul'da 150+ markanın dijital büyüme ortağı
   - `image.alt`: Pikselhane dijital analiz paneli ve web sitesi tasarımları
   - `image.position`: right
2. **stats**
   - `title`: Rakamlarla Pikselhane
   - `items[0].value`: 150+
   - `items[0].label`: Tamamlanan proje
   - `items[1].value`: %240
   - `items[1].label`: Ortalama organik trafik artışı
   - `items[2].value`: 8 Yıl
   - `items[2].label`: Sektör deneyimi
   - `items[3].value`: %96
   - `items[3].label`: Müşteri memnuniyeti
3. **services**
   - `title`: Dijitalde İhtiyacınız Olan Her Şey
   - `subtitle`: Üç temel hizmetle markanızın görünürlüğünü, etkileşimini ve satışlarını birlikte artırıyoruz.
   - `items[0].title`: SEO ve İçerik Stratejisi
   - `items[0].description`: Teknik SEO, anahtar kelime analizi, içerik planı ve yerel SEO ile arama sonuçlarında üst sıralara çıkın.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram, LinkedIn, TikTok ve X için içerik üretimi, topluluk yönetimi ve performans reklamları.
   - `items[2].title`: Web Tasarım ve Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve dönüşüm odaklı kurumsal siteler ile e-ticaret altyapıları.
   - `items[3].title`: Google ve Meta Reklamları
4. **features**
   - `title`: Neden Pikselhane?
   - `subtitle`: Estetik ile performansı, yaratıcılık ile veriyi bir araya getiriyoruz.
   - `items[0].title`: Veriye Dayalı Kararlar
   - `items[0].description`: Her kampanya GA4 ve Search Console verileriyle izlenir, aylık şeffaf raporlarla paylaşılır.
   - `items[1].title`: Tek Çatı, Tek Strateji
   - `items[1].description`: SEO, sosyal medya ve web tasarım ekipleri aynı hedef doğrultusunda çalışır.
   - `items[2].title`: Hızlı ve Güvenli Altyapı
   - `items[2].description`: Core Web Vitals uyumlu, SSL korumalı ve yüksek performanslı web siteleri teslim ederiz.
   - `items[3].title`: Yerel Pazar Uzmanlığı
5. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Net adımlarla ilerleyen, şeffaf ve ölçülebilir bir süreç.
   - `steps[0].title`: Keşif ve Analiz
   - `steps[0].description`: Markanızı, rakiplerinizi ve mevcut dijital performansınızı detaylı şekilde inceleriz.
   - `steps[1].title`: Strateji ve Planlama
   - `steps[1].description`: Hedeflerinize uygun yol haritası, içerik takvimi ve bütçe planını hazırlarız.
   - `steps[2].title`: Tasarım ve Uygulama
   - `steps[2].description`: Web sitenizi tasarlar, içerikleri üretir ve kampanyaları yayına alırız.
   - `steps[3].title`: Ölçüm ve Optimizasyon
6. **portfolio**
   - `title`: Seçilmiş Projeler
   - `subtitle`: Farklı sektörlerde ölçülebilir sonuçlar ürettiğimiz çalışmalardan örnekler.
   - `items[0].title`: Boğaz Mobilya E-Ticaret
   - `items[0].category`: Web Tasarım ve SEO
   - `items[0].description`: Yeni e-ticaret sitesi ve SEO çalışmasıyla 6 ayda organik satışlarda %180 artış.
   - `items[0].alt`: Boğaz Mobilya e-ticaret sitesi
   - `items[1].title`: Nova Klinik Sosyal Medya
   - `items[1].category`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram takipçi sayısını 4 ayda 3 katına çıkaran içerik ve reklam stratejisi.
7. **pricing**
   - `title`: Size Uygun Paketi Seçin
   - `subtitle`: Tüm paketlerde aylık raporlama ve özel müşteri temsilcisi dahildir.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺12.500
   - `plans[0].period`: /ay
   - `plans[0].description`: Yeni başlayan işletmeler için temel dijital varlık.
   - `plans[0].features[0]`: Temel teknik SEO çalışması
   - `plans[0].features[1]`: Ayda 8 sosyal medya içeriği
   - `plans[0].features[2]`: 1 platform yönetimi
8. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselhane ile çalışmaya başladıktan sonra organik trafiğimiz 5 ayda ikiye katlandı. Raporlama şeffaflığı çok değerli.
   - `items[0].author`: Elif Yılmaz
   - `items[0].role`: Pazarlama Müdürü, Boğaz Mobilya
   - `items[1].quote`: Sosyal medya hesaplarımız artık gerçekten bir randevu kanalı. Ekip hızlı, yaratıcı ve çok profesyonel.
   - `items[1].author`: Dr. Murat Kaya
   - `items[1].role`: Kurucu, Nova Klinik
   - `items[2].quote`: Yeni web sitemiz hem çok hızlı hem de teklif taleplerimizi belirgin şekilde artırdı.
   - `items[2].author`: Selin Aydın
9. **faq**
   - `title`: Sık Sorulan Sorular
   - `items[0].question`: SEO çalışmalarında sonuçları ne zaman görürüz?
   - `items[0].answer`: Genellikle ilk iyileşmeler 2-3. ayda görülür, kalıcı ve güçlü sonuçlar ise 6. ay civarında ortaya çıkar. Rekabet düzeyi süreyi etkiler.
   - `items[1].question`: Web sitesi tasarımı ne kadar sürer?
   - `items[1].answer`: Kurumsal bir web sitesi proje kapsamına göre ortalama 3-6 hafta içinde teslim edilir.
   - `items[2].question`: Sadece tek bir hizmet alabilir miyiz?
   - `items[2].answer`: Evet. SEO, sosyal medya veya web tasarım hizmetlerinden yalnızca birini alabilir, ihtiyaç doğrultusunda genişletebilirsiniz.
   - `items[3].question`: Reklam bütçesi paketlere dahil mi?
   - `items[3].answer`: Hayır, reklam bütçesi doğrudan reklam platformlarına ödenir. Biz yalnızca yönetim ve optimizasyon hizmeti sunarız.
10. **cta**
   - `title`: Dijital büyümenin ilk adımını birlikte atalım
   - `description`: Web sitenizi ve dijital varlığınızı uzmanlarımızla ücretsiz analiz edin, size özel yol haritasını çıkaralım.
   - `primaryButton.label`: Ücretsiz Analiz Talep Et
   - `secondaryButton.label`: Hemen Ara
11. **contact**
   - `title`: Bizimle İletişime Geçin
   - `description`: Projenizi anlatın, 24 saat içinde size dönüş yapalım.
   - `email`: merhaba@pikselhane.com
   - `phone`: +90 212 555 01 23
   - `address`: Maslak Mah. Büyükdere Cad. No:123, Sarıyer / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
12. **footer**
   - `tagline`: İstanbul merkezli dijital ajans: SEO, sosyal medya ve web tasarım.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya Yönetimi
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Süreç
   - `columns[1].links[1].label`: Projeler
   - `columns[1].links[2].label`: Paketler

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 34.5 sn | 10165 giriş / 5143 çıkış tok. | $0.072 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Pikselhane | **Slogan:** Markanızı dijitalde büyüten İstanbul ajansı | **SEO:** İstanbul Dijital Ajans SEO Web Tasarım
**Sayfalar:** Ana Sayfa, Hizmetler, Projeler, Paketler, İletişim

1. **hero**
   - `badge`: İstanbul'un Veri Odaklı Dijital Ajansı
   - `title`: Markanızı Google'da ve Sosyal Medyada Zirveye Taşıyoruz
   - `description`: SEO, sosyal medya yönetimi ve web tasarımı tek çatı altında topluyoruz. Ölçülebilir stratejilerle trafiğinizi, etkileşiminizi ve satışlarınızı büyütüy
   - `primaryButton.label`: Ücretsiz Analiz Al
   - `secondaryButton.label`: Projelerimizi Gör
   - `trustText`: İstanbul'da 150+ marka bizimle büyüdü
   - `image.alt`: Dijital ajans analitik paneli ve web tasarım örnekleri
   - `image.position`: right
2. **stats**
   - `title`: Rakamlarla Pikselhane
   - `items[0].value`: 150+
   - `items[0].label`: Tamamlanan proje
   - `items[1].value`: %240
   - `items[1].label`: Ortalama organik trafik artışı
   - `items[2].value`: 8 yıl
   - `items[2].label`: Sektör deneyimi
   - `items[3].value`: %96
   - `items[3].label`: Müşteri memnuniyeti
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Dijital varlığınızın her adımı için uçtan uca çözümler
   - `items[0].title`: SEO Danışmanlığı
   - `items[0].description`: Teknik SEO, içerik stratejisi ve link çalışmalarıyla hedef anahtar kelimelerde üst sıralara çıkın.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: İçerik takvimi, tasarım, topluluk yönetimi ve reklam kampanyalarıyla markanızın sesini güçlendiriyoruz.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve dönüşüm odaklı kurumsal siteler ile e-ticaret altyapıları geliştiriyoruz.
   - `items[3].title`: Google & Meta Reklamları
4. **features**
   - `title`: Neden Pikselhane?
   - `subtitle`: Sadece hizmet değil, büyümeye odaklı bir ortaklık sunuyoruz
   - `items[0].title`: Veri Odaklı Kararlar
   - `items[0].description`: Her strateji analiz ve gerçek verilere dayanır; tahminle değil sonuçla ilerleriz.
   - `items[1].title`: Yerel Pazar Uzmanlığı
   - `items[1].description`: İstanbul pazarını ve Türk tüketici davranışlarını yakından tanıyoruz.
   - `items[2].title`: Şeffaf İletişim
   - `items[2].description`: Özel proje yöneticiniz ve düzenli toplantılarla her zaman süreçten haberdar olursunuz.
   - `items[3].title`: Hızlı Teslimat
5. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Net adımlarla hedefinize ulaşın
   - `steps[0].title`: Keşif & Analiz
   - `steps[0].description`: Markanızı, rakiplerinizi ve mevcut dijital performansınızı detaylı inceliyoruz.
   - `steps[1].title`: Strateji
   - `steps[1].description`: Hedeflerinize uygun yol haritası ve KPI'ları birlikte belirliyoruz.
   - `steps[2].title`: Uygulama
   - `steps[2].description`: Tasarım, içerik ve optimizasyon çalışmalarını uzman ekibimizle hayata geçiriyoruz.
   - `steps[3].title`: Ölçüm & Optimizasyon
6. **portfolio**
   - `title`: Seçilmiş Projeler
   - `subtitle`: Markalarımız için yarattığımız etki
   - `items[0].title`: Moda Butik E-Ticaret
   - `items[0].category`: Web Tasarım & SEO
   - `items[0].description`: Yeni e-ticaret sitesi ile 6 ayda organik satışlarda %180 artış.
   - `items[0].alt`: Moda butik e-ticaret sitesi
   - `items[1].title`: Kadıköy Kafe Zinciri
   - `items[1].category`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram takipçisi 4 ayda 12 binden 48 bine yükseldi.
7. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselhane ile çalışmaya başladığımızdan beri organik trafiğimiz üç katına çıktı. Ekip hem profesyonel hem çok ilgili.
   - `items[0].author`: Elif Karaca
   - `items[0].role`: Kurucu, Moda Butik
   - `items[1].quote`: Sosyal medya hesaplarımızı yepyeni bir seviyeye taşıdılar. Aylık raporlar sayesinde her şey şeffaf.
   - `items[1].author`: Mert Aydın
   - `items[1].role`: Pazarlama Müdürü, Kadıköy Kafe
   - `items[2].quote`: Yeni web sitemiz hem çok şık hem hızlı. Gelen teklif sayısındaki artış beklentimizi aştı.
   - `items[2].author`: Selin Yıldız
8. **pricing**
   - `title`: Paketler
   - `subtitle`: İhtiyacınıza göre ölçeklenen şeffaf fiyatlandırma
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺12.000
   - `plans[0].period`: /ay
   - `plans[0].description`: Küçük işletmeler için temel dijital büyüme
   - `plans[0].features[0]`: Temel SEO optimizasyonu
   - `plans[0].features[1]`: 2 sosyal medya hesabı yönetimi
   - `plans[0].features[2]`: Ayda 12 içerik
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: SEO sonuçlarını ne kadar sürede görürüm?
   - `items[0].answer`: Rekabete ve mevcut site durumuna göre değişmekle birlikte ilk iyileşmeler genellikle 3-4 ay içinde görülür, kalıcı sonuçlar 6-12 ayda oluşur.
   - `items[1].question`: Web sitesi tasarımı ne kadar sürer?
   - `items[1].answer`: Kurumsal bir site ortalama 3-5 hafta, e-ticaret projeleri ise kapsama göre 6-10 hafta içinde teslim edilir.
   - `items[2].question`: Sosyal medya reklam bütçesi paketlere dahil mi?
   - `items[2].answer`: Hayır, reklam bütçesi ayrıdır ve doğrudan reklam hesabınızdan harcanır. Biz yalnızca yönetim hizmeti sunarız.
   - `items[3].question`: Sadece tek bir hizmet alabilir miyim?
   - `items[3].answer`: Elbette. SEO, sosyal medya ya da web tasarım hizmetlerini ayrı ayrı alabilir veya birlikte çalışarak avantajlı paketlerden yararlanabilirsiniz.
10. **cta**
   - `title`: Dijitalde Büyümeye Hazır mısınız?
   - `description`: Web sitenizin ücretsiz SEO analizini alın, size özel büyüme planını birlikte oluşturalım.
   - `primaryButton.label`: Ücretsiz Analiz Al
   - `secondaryButton.label`: Hemen Arayın
11. **contact**
   - `title`: Bizimle İletişime Geçin
   - `description`: Projenizi anlatın, 24 saat içinde size dönüş yapalım.
   - `email`: merhaba@pikselhane.com
   - `phone`: +90 212 555 01 02
   - `address`: Levent Mah. Büyükdere Cad. No: 100, Şişli / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Mesajınız
12. **footer**
   - `tagline`: İstanbul'dan markanızın dijital büyüme ortağı.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Süreç
   - `columns[1].links[1].label`: Projeler
   - `columns[1].links[2].label`: Paketler

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 50.2 sn | 10165 giriş / 5617 çıkış tok. | $0.153 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Pikselist Dijital | **Slogan:** İstanbul'dan markanızı dijitalde zirveye taşıyoruz | **SEO:** İstanbul Dijital Ajans SEO
**Sayfalar:** Ana Sayfa, Hizmetler, Projeler, Hakkımızda, Blog, İletişim

1. **hero**
   - `badge`: İstanbul'un Performans Odaklı Dijital Ajansı
   - `title`: Markanızı Google'da Öne Çıkarın, Sosyal Medyada Büyütün
   - `description`: SEO, sosyal medya yönetimi ve dönüşüm odaklı web tasarımını tek çatı altında birleştiriyoruz. Ölçülebilir sonuçlar, şeffaf raporlama ve İstanbul'da ye
   - `primaryButton.label`: Ücretsiz SEO Analizi
   - `secondaryButton.label`: Projelerimizi İnceleyin
   - `trustText`: 120+ markanın dijital büyüme ortağı
   - `image.alt`: Analiz panelleri ve İstanbul manzarasıyla dijital ajans ofisi
   - `image.position`: right
2. **stats**
   - `items[0].value`: 120+
   - `items[0].label`: Mutlu Marka
   - `items[1].value`: %240
   - `items[1].label`: Ortalama Organik Trafik Artışı
   - `items[2].value`: 350+
   - `items[2].label`: Teslim Edilen Web Sitesi
   - `items[3].value`: 8 Yıl
   - `items[3].label`: Sektör Deneyimi
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Dijitalde görünür olmanız, etkileşim kurmanız ve satış yapmanız için uçtan uca çözümler.
   - `items[0].title`: SEO & Arama Motoru Optimizasyonu
   - `items[0].description`: Teknik SEO denetimi, anahtar kelime stratejisi, içerik planlama ve yerel SEO ile Google'da ilk sayfaya yükselin.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram, LinkedIn, TikTok ve X için içerik takvimi, tasarım, topluluk yönetimi ve aylık performans raporları.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve SEO dostu kurumsal siteler ile e-ticaret altyapıları tasarlıyor ve geliştiriyoruz.
   - `items[3].title`: Dijital Reklam Yönetimi
4. **features**
   - `title`: Neden Pikselist?
   - `subtitle`: Ajans değil, büyüme ortağı arayan markalar için.
   - `items[0].title`: Veriye Dayalı Strateji
   - `items[0].description`: Her karar rakip analizi, arama verisi ve kullanıcı davranışına dayanır.
   - `items[1].title`: Hızlı Teslimat
   - `items[1].description`: Çevik ekip yapımızla web projelerini ortalama 4-6 haftada yayına alıyoruz.
   - `items[2].title`: Atanmış Proje Yöneticisi
   - `items[2].description`: Tek muhatap, haftalık toplantılar ve anlık iletişim kanalı.
   - `items[3].title`: Şeffaf Raporlama
5. **portfolio**
   - `title`: Seçili Projeler
   - `subtitle`: Farklı sektörlerden markalarla elde ettiğimiz sonuçlar.
   - `items[0].title`: Moda Butik E-Ticaret
   - `items[0].category`: Web Tasarım
   - `items[0].description`: Yeni e-ticaret sitesiyle 6 ayda online satışlarda %180 artış.
   - `items[0].alt`: Moda e-ticaret sitesi tasarımı
   - `items[1].title`: Kadıköy Diş Kliniği
   - `items[1].category`: Yerel SEO
   - `items[1].description`: 'Kadıköy diş kliniği' aramalarında ilk 3 sıraya yükselen yerel SEO çalışması.
6. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Şeffaf ve ölçülebilir 4 adımlı süreç.
   - `steps[0].title`: Analiz
   - `steps[0].description`: Mevcut dijital varlıklarınızı, rakiplerinizi ve hedef kitlenizi detaylıca inceliyoruz.
   - `steps[1].title`: Strateji
   - `steps[1].description`: Hedeflerinize uygun SEO, sosyal medya ve web yol haritasını oluşturuyoruz.
   - `steps[2].title`: Uygulama
   - `steps[2].description`: Tasarım, geliştirme, içerik ve kampanyaları planlı şekilde hayata geçiriyoruz.
   - `steps[3].title`: Ölçüm & Optimizasyon
7. **pricing**
   - `title`: Paketlerimiz
   - `subtitle`: İhtiyacınıza göre esnek, aylık hizmet paketleri.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺14.900
   - `plans[0].period`: /ay
   - `plans[0].description`: Dijitale yeni adım atan KOBİ'ler için.
   - `plans[0].features[0]`: Teknik SEO denetimi
   - `plans[0].features[1]`: 10 hedef anahtar kelime
   - `plans[0].features[2]`: 2 sosyal medya hesabı
8. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselist ile çalışmaya başladıktan sonra 5 ayda Google'dan gelen randevu talepleri iki katına çıktı. Raporlama son derece şeffaf.
   - `items[0].author`: Dr. Elif Arslan
   - `items[0].role`: Kurucu, Moda Dent Kliniği
   - `items[1].quote`: Yeni web sitemiz hem çok şık hem de inanılmaz hızlı. Teklif formlarımız neredeyse ikiye katlandı.
   - `items[1].author`: Murat Kaya
   - `items[1].role`: Pazarlama Müdürü, Kaya Lojistik
   - `items[2].quote`: Sosyal medyamızı tamamen onlara emanet ettik; içerik kalitesi ve etkileşim beklentimizin çok üzerinde.
   - `items[2].author`: Selin Demir
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: SEO çalışmalarının sonuçları ne zaman görülür?
   - `items[0].answer`: Sektöre ve rekabete bağlı olarak ilk iyileşmeler genellikle 2-3 ayda, belirgin sonuçlar 4-6 ayda görülür.
   - `items[1].question`: Web sitesi projesi ne kadar sürer?
   - `items[1].answer`: Kurumsal siteler ortalama 4-6 hafta, e-ticaret projeleri ise 6-10 hafta içinde teslim edilir.
   - `items[2].question`: Sadece İstanbul'daki firmalarla mı çalışıyorsunuz?
   - `items[2].answer`: Merkezimiz İstanbul'da olsa da Türkiye'nin her yerinden ve yurt dışından markalarla uzaktan çalışıyoruz.
   - `items[3].question`: Sözleşme süresi ne kadar?
   - `items[3].answer`: Aylık paketlerimizde minimum 3 aylık çalışma öneriyoruz; uzun vadeli anlaşmalarda indirim sağlıyoruz.
10. **cta**
   - `title`: Dijitalde Bir Sonraki Seviyeye Hazır mısınız?
   - `description`: Markanız için ücretsiz SEO ve sosyal medya analizini 48 saat içinde hazırlayalım.
   - `primaryButton.label`: Ücretsiz Analiz Talep Et
   - `secondaryButton.label`: Paketleri Gör
11. **contact**
   - `title`: Bizimle İletişime Geçin
   - `description`: Projenizi anlatın, uzman ekibimiz bir iş günü içinde size dönüş yapsın.
   - `email`: merhaba@pikselist.com.tr
   - `phone`: +90 212 555 34 78
   - `address`: Büyükdere Cad. No: 185, Levent, Şişli / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: E-posta
   - `fields[2]`: Telefon
   - `fields[3]`: Firma / Web Sitesi
12. **footer**
   - `tagline`: İstanbul'dan markaları dijitalde büyüten performans ajansı.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya Yönetimi
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[0].links[3].label`: Dijital Reklam
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Hakkımızda
   - `columns[1].links[1].label`: Projeler

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 54.3 sn | 10165 giriş / 5931 çıkış tok. | $0.159 | ihlal: 1</summary>

**Kural ihlalleri:** bölüm sayısı 12 (7-10 istendi)

**Ad:** Pikselix Dijital | **Slogan:** Markanızı dijitalde görünür, akılda kalıcı ve kârlı kılıyoruz. | **SEO:** İstanbul Dijital Ajans SEO Hizmeti
**Sayfalar:** Ana Sayfa, Hizmetler, Projeler, Hakkımızda, Blog, İletişim

1. **hero**
   - `badge`: İstanbul'un Performans Odaklı Dijital Ajansı
   - `title`: Google'da üst sıralara, sosyal medyada zirveye
   - `description`: SEO, sosyal medya yönetimi ve web tasarımı tek çatı altında birleştiriyoruz. Ölçülebilir hedefler, şeffaf raporlama ve gerçek büyüme.
   - `primaryButton.label`: Ücretsiz SEO Analizi
   - `secondaryButton.label`: Projelerimizi İnceleyin
   - `trustText`: Maslak'tan dünyaya: 180+ markanın dijital büyüme ortağı
   - `image.alt`: Dijital pazarlama analiz ekranlarıyla modern ajans ofisi
   - `image.position`: right
2. **stats**
   - `items[0].value`: 180+
   - `items[0].label`: Mutlu Marka
   - `items[1].value`: %312
   - `items[1].label`: Ortalama Organik Trafik Artışı
   - `items[2].value`: 2.400+
   - `items[2].label`: İlk Sayfa Anahtar Kelime
   - `items[3].value`: 9 Yıl
   - `items[3].label`: Sektör Deneyimi
3. **services**
   - `title`: Hizmetlerimiz
   - `subtitle`: Markanızın dijital ekosistemini uçtan uca kuruyor ve büyütüyoruz.
   - `items[0].title`: SEO & Teknik Optimizasyon
   - `items[0].description`: Anahtar kelime araştırması, teknik SEO denetimi, içerik stratejisi ve backlink çalışmalarıyla Google'da kalıcı görünürlük.
   - `items[1].title`: Sosyal Medya Yönetimi
   - `items[1].description`: Instagram, TikTok, LinkedIn ve X için içerik takvimi, kreatif tasarım, topluluk yönetimi ve reklam kampanyaları.
   - `items[2].title`: Web Tasarım & Geliştirme
   - `items[2].description`: Hızlı, mobil uyumlu ve dönüşüm odaklı kurumsal siteler, e-ticaret altyapıları ve landing page'ler.
   - `items[3].title`: Yerel SEO
4. **features**
   - `title`: Neden Pikselix?
   - `subtitle`: Ajans değil, büyüme ortağı arıyorsanız doğru yerdesiniz.
   - `items[0].title`: Ölçülebilir Sonuçlar
   - `items[0].description`: Her çalışmayı KPI'lara bağlıyor, aylık raporlarla ilerlemeyi net şekilde gösteriyoruz.
   - `items[1].title`: Size Özel Ekip
   - `items[1].description`: Her markaya bir proje yöneticisi, SEO uzmanı ve kreatif tasarımcıdan oluşan sabit ekip atıyoruz.
   - `items[2].title`: Hızlı Uygulama
   - `items[2].description`: Çevik çalışma modelimizle stratejiyi haftalar değil günler içinde hayata geçiriyoruz.
   - `items[3].title`: Şeffaf Fiyatlandırma
5. **portfolio**
   - `title`: Öne Çıkan Projeler
   - `subtitle`: İstanbul'dan ve Türkiye'nin dört bir yanından markalarla ürettiğimiz sonuçlar.
   - `items[0].title`: Moda E-Ticaret Markası
   - `items[0].category`: SEO
   - `items[0].description`: 8 ayda organik trafik %420 arttı, organik satışlar 3 katına çıktı.
   - `items[0].alt`: Moda e-ticaret sitesi SEO projesi
   - `items[1].title`: Kadıköy Kafe Zinciri
   - `items[1].category`: Sosyal Medya
   - `items[1].description`: Instagram takipçisi 6 ayda 4K'dan 58K'ya ulaştı, şube ziyaretleri %70 arttı.
6. **process**
   - `title`: Nasıl Çalışıyoruz?
   - `subtitle`: Dört adımda stratejiden sonuca.
   - `steps[0].title`: Analiz
   - `steps[0].description`: Sitenizi, rakiplerinizi ve sektörünüzü derinlemesine inceleyerek fırsatları ortaya çıkarıyoruz.
   - `steps[1].title`: Strateji
   - `steps[1].description`: Hedeflerinize uygun, KPI'ları belirlenmiş yol haritasını birlikte oluşturuyoruz.
   - `steps[2].title`: Uygulama
   - `steps[2].description`: SEO, içerik, tasarım ve kampanyaları uzman ekibimizle hayata geçiriyoruz.
   - `steps[3].title`: Ölçüm & Optimizasyon
7. **pricing**
   - `title`: Paketlerimiz
   - `subtitle`: İşletmenizin büyüklüğüne göre esnek çözümler. Tüm paketlerde taahhütsüz başlangıç.
   - `plans[0].name`: Başlangıç
   - `plans[0].price`: ₺14.900
   - `plans[0].period`: /ay
   - `plans[0].description`: Dijitalde ilk adımlarını atan KOBİ'ler için.
   - `plans[0].features[0]`: Teknik SEO denetimi
   - `plans[0].features[1]`: 10 anahtar kelime takibi
   - `plans[0].features[2]`: 2 sosyal medya hesabı yönetimi
8. **testimonials**
   - `title`: Müşterilerimiz Ne Diyor?
   - `items[0].quote`: Pikselix ile çalışmaya başladıktan sonra web sitemiz Google'da ilk sayfaya çıktı. Telefonlarımız artık hiç susmuyor.
   - `items[0].author`: Elif Karataş
   - `items[0].role`: Kurucu, Karataş Diş Kliniği
   - `items[1].quote`: Sosyal medya hesaplarımızı tamamen dönüştürdüler. İçerik kalitesi ve etkileşim oranları beklentimizin çok üzerinde.
   - `items[1].author`: Mert Aydın
   - `items[1].role`: Pazarlama Müdürü, Nefes Kahve
   - `items[2].quote`: Yeni e-ticaret sitemiz hem çok hızlı hem de inanılmaz şık. Dönüşüm oranımız ilk ayda iki katına çıktı.
   - `items[2].author`: Zeynep Öztürk
9. **faq**
   - `title`: Sıkça Sorulan Sorular
   - `items[0].question`: SEO çalışmasının sonuçlarını ne zaman görürüm?
   - `items[0].answer`: Sektöre ve rekabete bağlı olarak ilk iyileşmeler genellikle 2-3 ay içinde görülür; kalıcı ve güçlü sonuçlar 6. aydan itibaren belirginleşir.
   - `items[1].question`: Sadece İstanbul'daki işletmelerle mi çalışıyorsunuz?
   - `items[1].answer`: Ofisimiz İstanbul Maslak'ta olsa da Türkiye'nin her yerinden ve yurt dışından markalarla uzaktan çalışıyoruz.
   - `items[2].question`: Uzun süreli sözleşme zorunlu mu?
   - `items[2].answer`: Hayır. Aylık paketlerimiz taahhütsüzdür; ancak SEO'nun doğası gereği en az 6 aylık çalışma öneriyoruz.
   - `items[3].question`: Web sitesi tasarımı ne kadar sürer?
   - `items[3].answer`: Kurumsal siteler ortalama 3-5 hafta, e-ticaret projeleri ise kapsamına göre 6-10 hafta içinde teslim edilir.
10. **cta**
   - `title`: Rakipleriniz zaten dijitalde. Siz neredesiniz?
   - `description`: Web sitenizin ücretsiz SEO ve sosyal medya analizini 48 saat içinde gönderelim.
   - `primaryButton.label`: Ücretsiz Analiz İste
   - `secondaryButton.label`: Paketleri İncele
11. **contact**
   - `title`: Projenizi Konuşalım
   - `description`: Hedeflerinizi anlatın, size özel dijital büyüme planını birlikte hazırlayalım. Maslak ofisimizde kahveye de bekleriz.
   - `email`: merhaba@pikselix.com.tr
   - `phone`: +90 212 555 48 32
   - `address`: Büyükdere Cad. No:255, Maslak, Sarıyer / İstanbul
   - `fields[0]`: Ad Soyad
   - `fields[1]`: Şirket Adı
   - `fields[2]`: E-posta
   - `fields[3]`: Telefon
12. **footer**
   - `tagline`: İstanbul'dan markalara dijital büyüme.
   - `columns[0].title`: Hizmetler
   - `columns[0].links[0].label`: SEO
   - `columns[0].links[1].label`: Sosyal Medya Yönetimi
   - `columns[0].links[2].label`: Web Tasarım
   - `columns[0].links[3].label`: Performans Reklam
   - `columns[1].title`: Kurumsal
   - `columns[1].links[0].label`: Hakkımızda
   - `columns[1].links[1].label`: Projeler

</details>

### Dijital ajans: Bölüm düzenleme

Talimat: _Ana başlığı daha net ve sonuç odaklı yap, birincil buton metnini "Ücretsiz Analiz İste" olarak değiştir._ (hero bölümü, her model için aynı girdi)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 4.5 sn | 3866 giriş / 558 çıkış tok. | $0.0021</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi Hızla Ürüne Dönüştürelim
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 14.4 sn | 3866 giriş / 755 çıkış tok. | $0.0025</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi Hızla Ürüne Dönüştürün ve Pazara Çıkarın
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 10.6 sn | 8413 giriş / 330 çıkış tok. | $0.020</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi 90 günde çalışan, ölçeklenebilir bir dijital ürüne dönüştürün
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 2.6 sn | 8413 giriş / 330 çıkış tok. | $0.020</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi 90 günde çalışan, ölçeklenebilir bir dijital ürüne dönüştürün
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 3.3 sn | 8413 giriş / 330 çıkış tok. | $0.040</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi haftalar içinde çalışan, büyüyen bir dijital ürüne dönüştürüyoruz
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 4.0 sn | 8413 giriş / 334 çıkış tok. | $0.040</summary>

- `badge`: Yazılım & Dijital Çözümler
- `title`: Fikrinizi haftalar içinde çalışan, ölçeklenebilir bir dijital ürüne dönüştürüyoruz
- `description`: Web ve mobil uygulamalardan yapay zeka entegrasyonlarına kadar, ölçeklenebilir dijital ürünler geliştiriyoruz.
- `primaryButton.label`: Ücretsiz Analiz İste
- `secondaryButton.label`: Demo İste
- `trustText`: 200+ projede güvenilen ekip
- `image.alt`: Yazılım arayüzü

</details>

### Dijital ajans: Ürün metni

Ürün: **Aylık SEO Raporu Şablonu (PDF)** (Format: PDF)

<details><summary><b>openai/gpt-5-mini</b> (tekrar 1): OK | 15.0 sn | 469 giriş / 1929 çıkış tok. | $0.0040</summary>

**Açıklama**

Aylık SEO Raporu Şablonu (PDF), aylık SEO raporları hazırlamak için tasarlanmış bir PDF şablonudur. PDF formatında sunulur.



- Aylık SEO raporlaması için hazırlanmış yapı

- PDF formatında teslim edilir

- Raporları tek bir düzende toplar

**Özellikler:** Ürün adı: Aylık SEO Raporu Şablonu (PDF); Format: PDF; Ürün türü: Dijital şablon (doğrula); Dil: Türkçe (doğrula)

**SEO başlık (30):** Aylık SEO Raporu Şablonu (PDF)

**SEO açıklama (87):** Aylık SEO raporları için PDF formatında şablon. Aylık rapor düzenini tek dosyada sunar.

</details>

<details><summary><b>openai/gpt-5-mini</b> (tekrar 2): OK | 15.6 sn | 469 giriş / 2003 çıkış tok. | $0.0041</summary>

**Açıklama**

Aylık SEO Raporu Şablonu (PDF), aylık SEO raporları için hazırlanmış bir şablondur. Ürün PDF formatında sunulur.



- Aylık SEO raporları için şablon sağlar

- PDF formatında teslim edilir

- Raporlamayı tutarlı bir şablonda toplamak için kullanılabilir

**Özellikler:** Ürün adı: Aylık SEO Raporu Şablonu (PDF); Format: PDF; Kategori: Ürünler

**SEO başlık (28):** Aylık SEO Raporu Şablonu PDF

**SEO açıklama (88):** Aylık SEO Raporu Şablonu, PDF formatında sunulan aylık SEO raporları için bir şablondur.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 1): OK | 8.0 sn | 1076 giriş / 961 çıkış tok. | $0.012</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, her ay SEO çalışmalarınızı düzenli bir yapıda raporlamanız için hazırlanmış bir PDF dosyasıdır. Dijital formatı sayesinde satın aldıktan sonra kolayca saklayabilir ve kullanabilirsiniz.



- Aylık SEO raporlama sürecinize düzen getirir

- PDF formatı sayesinde birçok cihazda kolayca açılır

- Rapor hazırlarken zaman kazanmanıza yardımcı olur

- Çalışmalarınızı müşterilerinize ya da ekibinize düzenli sunmanıza destek olur

**Özellikler:** Format: PDF; Rapor Dönemi: Aylık; Ürün Türü: Dijital şablon (doğrula); Dil: Türkçe (doğrula)

**SEO başlık (52):** Aylık SEO Raporu Şablonu (PDF) | Hazır Rapor Şablonu

**SEO açıklama (119):** Aylık SEO raporlarınızı düzenli hazırlamak için PDF formatında Aylık SEO Raporu Şablonu. Dijital ürünü hemen inceleyin.

</details>

<details><summary><b>anthropic/claude-sonnet-5.5</b> (tekrar 2): OK | 4.5 sn | 1076 giriş / 475 çıkış tok. | $0.0069</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, aylık SEO çalışmalarınızı düzenli ve anlaşılır bir şekilde raporlamanız için hazırlanmış PDF formatında bir şablondur. Dijital dosya olarak sunulduğu için cihazınıza indirip kolayca görüntüleyebilirsiniz.



- PDF formatında kolay erişilebilir dosya

- Aylık SEO raporlamasına yönelik şablon yapısı

- Cihazlar arasında rahat görüntüleme ve paylaşma

- Rapor hazırlama sürecinde düzenli bir başlangıç noktası

**Özellikler:** Format: PDF; Ürün Türü: Dijital şablon (doğrula); Kullanım Amacı: Aylık SEO raporlama

**SEO başlık (54):** Aylık SEO Raporu Şablonu (PDF) | Dijital Rapor Şablonu

**SEO açıklama (133):** Aylık SEO çalışmalarınızı düzenli raporlamak için PDF formatında Aylık SEO Raporu Şablonu. Dijital dosya olarak kolayca görüntüleyin.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 1): OK | 7.7 sn | 1076 giriş / 431 çıkış tok. | $0.013</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, web sitenizin arama motoru performansını düzenli olarak raporlamanız için hazırlanmış PDF formatında bir şablondur. Aylık çalışmalarınızı derli toplu bir şekilde sunmanıza ve takip etmenize yardımcı olur.



- Aylık SEO raporlarınızı düzenli bir yapıda hazırlamanıza yardımcı olur

- PDF formatı sayesinde kolayca paylaşılabilir ve görüntülenebilir

- Rapor hazırlama sürecinde zaman kazandırır

- Müşterilere veya ekibe sunum için derli toplu bir görünüm sağlar

**Özellikler:** Format: PDF; Ürün türü: Dijital şablon (doğrula)

**SEO başlık (28):** Aylık SEO Raporu Şablonu PDF

**SEO açıklama (114):** Aylık SEO raporlarınızı düzenli hazırlamanız için PDF formatında rapor şablonu. Kolay paylaşım, derli toplu sunum.

</details>

<details><summary><b>anthropic/claude-opus-5.5</b> (tekrar 2): OK | 9.1 sn | 1076 giriş / 561 çıkış tok. | $0.016</summary>

**Açıklama**

Aylık SEO Raporu Şablonu, SEO çalışmalarınızın sonuçlarını her ay düzenli ve anlaşılır bir biçimde raporlamanıza yardımcı olmak için hazırlanmış bir PDF şablonudur. Müşterilerinize veya ekibinize sunacağınız raporları sıfırdan hazırlamakla zaman kaybetmeden, tutarlı bir düzenle paylaşabilirsiniz.



- Aylık SEO raporlarını hazırlamaya harcanan zamanı azaltır

- Raporlarınıza düzenli ve tutarlı bir görünüm kazandırır

- PDF formatı sayesinde kolayca paylaşılır ve görüntülenir

- Müşterilere ve ekiplere sonuç sunumunu kolaylaştırır

- Her ay aynı yapıyla takip yapmayı pratik hale getirir

**Özellikler:** Format: PDF; Ürün türü: Dijital şablon (doğrula); Kullanım amacı: Aylık SEO raporlama

**SEO başlık (52):** Aylık SEO Raporu Şablonu (PDF) | Hazır Rapor Şablonu

**SEO açıklama (128):** Aylık SEO raporlarınızı düzenli ve profesyonel bir şekilde hazırlamak için kullanabileceğiniz PDF formatında SEO raporu şablonu.

</details>
