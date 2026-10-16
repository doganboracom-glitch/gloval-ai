# AI ile site düzenleme kalitesi (salt okunur ölçüm)

Tarih: 2026-10-16. Araç: `pnpm eval:ai-edit` (üretim hattı değiştirilmez; sahte kullanıcı, sentetik site, kişisel veri yok).
Modeller: standart `openai/gpt-5-mini`, gelişmiş `anthropic/claude-sonnet-5.5`. 30 komut. Görsel komutları yalnız niyet tespiti ile ölçülür (görsel üretilmez, maliyet yok).

## Başarı oranı (katman bazında)

| Katman | Başarı | Kısmi | Etkisiz | Yanlış | Başarı oranı | Yanlış başarı bildirimi | Ort. süre | Maliyet |
|---|---|---|---|---|---|---|---|---|
| standart | 21 | 2 | 0 | 7 | 70% (21/30) | 9 | 8.0 sn | $0.0877 |
| gelişmiş | 21 | 3 | 0 | 6 | 70% (21/30) | 9 | 6.8 sn | $0.7976 |

Yanlış başarı bildirimi: sohbet "uyguladım" dedi ama sonuç başarı değil.

## Komut bazında sonuç

| # | Kategori | Komut | Beklenen | Gerçekte (standart) | Std | Gel | Kaynak | Süre s/g | Maliyet s/g |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Menü | Menüye Blog ekle | Görünen menüde "Blog" öğesi (çok sayfalı sitede pages başlığı) | ai: 5 yol: pages.2.slug, pages.2.title, pages.3.slug, … | başarı | başarı | ai/ai | 11.6/14.5 | $0.0045/$0.0507 |
| 2 | Menü | Hizmetler'i üst menüden kaldır | Menüde Hizmetler yok; Hizmetler bölümü silinmemiş | ayrıştırıcı: 12 yol: navigation.links.1.href, navigation.links.1.label, navigation.links.2.href, … · ""Hizmetler" üst menüden kaldırıldı." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 3 | Buton | Hero birincil buton metnini "Hemen Ara" yap | hero.primaryButton.label = "Hemen Ara" | ayrıştırıcı: sections.0.primaryButton.label · "Ana buton güncellendi." | yanlış (!) | yanlış (!) | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 4 | Buton | Randevu Al butonunu kırmızı yap | Butonlarda renk alanı yok: tek yol ana (primary) renk kırmızıya yakın olmalı | ai: theme.palette.0.hex | başarı | kısmi (!) | ai/ai | 12.7/11.8 | $0.0051/$0.0494 |
| 5 | Hero | Hero başlığını "Gülüşünüzü Yeniden Keşfedin" yap | hero.title = "Gülüşünüzü Yeniden Keşfedin" | ayrıştırıcı: sections.0.title · "Hero başlığı güncellendi: "Gülüşünüzü Yeniden Keşfedin"." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 6 | Bölüm | Referanslar bölümü ekle | Yeni bir testimonials bölümü | ayrıştırıcı: 11 yol: sections.6.copyright, sections.6.items.0.author, sections.6.items.0.quote, … · "Referanslar bölümü eklendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 7 | Bölüm | Süreç bölümünü sil | process bölümü kalmaz, diğerleri durur | ayrıştırıcı: 67 yol: sections.2.items.0.answer, sections.2.items.0.question, sections.2.items.1.answer, … · "Süreç bölümü kaldırıldı." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 8 | Bölüm | SSS bölümünü gizle | faq.hidden = true (silinmeden) | ayrıştırıcı: sections.3.hidden · "SSS bölümü gizlendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 9 | Bölüm | SSS bölümünü Hizmetler bölümünün üstüne taşı | faq, services'ten önce; bölüm sayısı aynı | ayrıştırıcı: 46 yol: sections.2.items.0.answer, sections.2.items.0.question, sections.2.items.1.answer, … · "SSS bölümü yukarı taşındı." | kısmi (!) | kısmi (!) | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 10 | Görsel | Hero görselini yeniden oluştur | Görsel hattı hero hedefini çözer (üretim bu araçta çalıştırılmaz) | görsel hattı: hero/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 11 | Görsel | Ürünlerdeki ilk fotoğrafı değiştir | Görsel hattı products bölümünün ilk ögesini çözer | görsel hattı: section/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 12 | Görsel | Logomu yeniden oluştur | Görsel hattı logo hedefini çözer | görsel hattı: logo/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 13 | İletişim | Telefon numarasını 0532 111 22 33 yap | contact.phone 532 111 22 33 | ai: sections.5.phone | başarı | başarı | ai/ai | 9.8/10.2 | $0.0044/$0.0476 |
| 14 | İletişim | WhatsApp numarasını 0555 444 33 22 yap | contactActions.whatsapp 555 444 33 22 | ai: 5 yol: contactActions.enabled, contactActions.phone, contactActions.placeholderFallback, … | başarı | başarı | ai/ai | 15.0/10.1 | $0.0062/$0.0475 |
| 15 | İletişim | E-posta adresini info@dentaklinik.com yap | contact.email = info@dentaklinik.com | ai: sections.5.email | başarı | başarı | ai/ai | 8.7/9.8 | $0.0042/$0.0470 |
| 16 | İletişim | Adresi Moda Cad. No:12 Kadıköy İstanbul olarak değiştir | contact.address "Moda Cad. No:12 …" | ai: sections.5.address | başarı | başarı | ai/ai | 14.4/9.9 | $0.0056/$0.0471 |
| 17 | Sosyal medya | Instagram hesabı ekle: instagram.com/dentaklinik | social.instagram dentaklinik bağlantısını içerir | ai: social.instagram | başarı | başarı | ai/ai | 11.4/10.5 | $0.0045/$0.0475 |
| 18 | Renk | Renk temasını yeşil yap | primary yeşil tonda (hue 90–170) | ayrıştırıcı: theme.palette.0.hex · "Ana renk yeşil olarak güncellendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 19 | Yazı tipi | Yazı tipini Playfair Display yap | typography başlık veya gövde yazı tipi Playfair Display | ai: typography.bodyFont, typography.headingFont | başarı | başarı | ai/ai | 10.9/16.1 | $0.0044/$0.0510 |
| 20 | Sayfa | Hakkımızda sayfası ekle | pages içinde Hakkımızda | ayrıştırıcı: 11 yol: sections.6.body, sections.6.copyright, sections.6.highlights.0, … · "Hakkımızda bölümü eklendi." | yanlış (!) | yanlış (!) | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 21 | Sayfa | Hizmetler sayfasının adını Tedaviler yap | services sayfasının başlığı "Tedaviler" | ai: pages.1.title | başarı | başarı | ai/ai | 15.8/10.6 | $0.0052/$0.0470 |
| 22 | Alt bilgi | Alt bilgideki telif yazısını "© 2026 Diş Kliniği. Tüm hakları saklıdır." yap | footer.copyright güncel | ai: sections.0.trustText, sections.6.copyright | başarı | başarı | ai/ai | 11.2/9.9 | $0.0041/$0.0472 |
| 23 | SSS | SSS'ye "Sigorta kabul ediyor musunuz?" sorusunu ekle | faq.items içinde sigorta sorusu | ayrıştırıcı: 13 yol: sections.6.copyright, sections.6.items.0.answer, sections.6.items.0.question, … · "SSS bölümü eklendi." | yanlış (!) | yanlış (!) | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 24 | Fiyat/ürün | İlk ürünün fiyatını ₺1.299 yap | Katalog panelden yönetilir: şema değişmemeli, kullanıcı panele yönlendirilmeli | fallback: değişiklik yok (panel uyarısı) | başarı | başarı | fallback/fallback | 18.0/11.7 | $0.0063/$0.0500 |
| 25 | Çeviri | Tüm site metinlerini İngilizceye çevir | Hero ve menü İngilizce; meta.language = en | ai: 70 yol: meta.audience, meta.description, meta.name, … | kısmi (!) | kısmi (!) | ai/ai | 32.6/14.7 | $0.0097/$0.0511 |
| 26 | SEO | SEO başlığını "Kadıköy İmplant ve Diş Estetiği" yap | meta.seoTitle = "Kadıköy İmplant ve Diş Estetiği" | ayrıştırıcı: sections.0.title · "Hero başlığı güncellendi: "Kadıköy İmplant ve Diş Estetiği"." | yanlış (!) | yanlış (!) | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 27 | Belirsiz | Daha güzel yap | Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli | ai: 10 yol: sections.0.image.aspectRatio, sections.0.image.imagePrompt, sections.0.image.overlay, … | yanlış (!) | yanlış (!) | ai/ai | 20.5/20.1 | $0.0066/$0.0585 |
| 28 | Belirsiz | Bunu değiştir | Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli | fallback: değişiklik yok | başarı | başarı | fallback/fallback | 14.5/14.3 | $0.0051/$0.0502 |
| 29 | Desteklenmeyen | Sitenin sunucusunu İstanbul'a taşı | Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli | ai: sections.5.description | yanlış (!) | başarı | ai/fallback | 12.6/12.2 | $0.0049/$0.0501 |
| 30 | Desteklenmeyen | Kullanıcı girişi ve üyelik sistemi ekle | Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli | ai: 33 yol: pages.3.slug, pages.3.title, pages.length, … | yanlış (!) | yanlış (!) | ai/ai | 21.2/17.1 | $0.0070/$0.0556 |

(!) = yanlış başarı bildirimi.

## Başarısızlık kovaları (otomatik)

| Kova | Adet | Örnekler |
|---|---|---|
| komut ayrıştırıcı (yanlış eşleme) | 10 | button-text/s, button-text/g, section-reorder/s, section-reorder/g, page-add/s, page-add/g |
| istem yetersiz: istenmeyen alanlar değişti | 7 | button-color/g, translate-en/g, ambiguous-better/s, ambiguous-better/g, unsupported-hosting/s, unsupported-membership/s |
| istem yetersiz: yanlış/eksik alan | 1 | translate-en/s |

<!-- analysis:start -->

## Analiz (elle yazıldı; yeniden çalıştırmada korunur)

Bu ölçüm salt okunurdur: üretim koduna dokunulmadı. Aşağıdaki kök nedenler `lib/website-command-parser.ts` ve `/api/edit` davranışından izlenmiştir.

### Ana bulgu: kayıplar modelden değil, ücretsiz komut ayrıştırıcısından geliyor

30 komutun 11'i yapay zekaya hiç gitmeden `parser-applied` ile bitiyor (3'ü görsel niyet tespiti). Bu 11 komutun 5'i yanlış/kısmi sonuçlanıyor (10 başarısız sonuç = 20 başarısızın yarısı) ve **iki katmanda da aynı** (standart ve gelişmiş eşit %70), yani model değiştirmek bunları düzeltmez. Ayrıştırıcı yanlış uygulayınca sohbet "uyguladım" diyor (yanlış başarı bildirimi) ve AI'a hiç sormuyor.

| Komut | Ayrıştırıcının yaptığı | Kök neden |
|---|---|---|
| `Hero birincil buton metnini "Hemen Ara" yap` | Buton etiketi `metnini "Hemen Ara" yap` oldu (tamamı) | `birincil butonu…\s+(.+)` ifadesi komutun kalanını yakalıyor; "metnini", tırnak ve "yap" ayıklanmıyor |
| `SEO başlığını "…" yap` | Hero başlığı değişti, `meta.seoTitle` değişmedi | `ba[şs]l[ıi][kğ]\S*\s+(.+)` kuralı "başlığını" kelimesini her bağlamda hero başlığı sayıyor; "SEO" kontrolü yok |
| `Hakkımızda sayfası ekle` | Sayfa yerine "Hakkımızda **bölümü**" eklendi | `detectSectionType` "hakkimizda" ile eşleşiyor, "sayfa" kelimesi hiç dikkate alınmıyor |
| `SSS'ye "Sigorta kabul ediyor musunuz?" sorusunu ekle` | Yeni boş bir SSS bölümü eklendi, soru eklenmedi | `sectionType && wantsAdd` kuralı ("SSS" + "ekle") soru metnini yok sayıp bölüm ekliyor |
| `SSS bölümünü Hizmetler bölümünün üstüne taşı` | SSS yalnız **1 adım** yukarı gitti | Taşıma hedefi hiç okunmuyor; ilk bölüm tipi yönü belirliyor, `moveSection` tek adım |

Ayrıştırıcının doğru çalıştığı komutlar: menüden kaldırma, bölüm ekleme/silme/gizleme, renk, hero başlığı. Sorun, "hedef cümlenin geri kalanını" yakalayan kuralların hedefi yanlış okuması ve "sayfa/soru/SEO" gibi ayırt edici kelimeleri hiç kontrol etmemesi.

### İkincil bulgu: yapay zeka katmanı "yapamıyorum" demek yerine bir şey uyduruyor

| Komut | Standart | Gelişmiş |
|---|---|---|
| `Daha güzel yap` (belirsiz) | 10 alan değişti (hero görsel/varyant) | **165 alan** değişti, siteyi neredeyse baştan yazdı |
| `Sitenin sunucusunu İstanbul'a taşı` | İletişim açıklamasına metin yazdı | Dürüstçe uygulanamıyor dedi (başarı) |
| `Kullanıcı girişi ve üyelik sistemi ekle` | 33 alan: sahte sayfa + menü öğesi | 53 alan: menüye sahte öğeler |
| `Bunu değiştir` | Netleştirme istedi (başarı) | Netleştirme istedi (başarı) |

Yani "şemada karşılığı olmayan" ve "belirsiz" isteklerde model, `fallback` dönmek yerine şemayı değiştiriyor ve sohbet bunu "uyguladım" diye duyuruyor. Gelişmiş katman en kötü durumda (belirsiz istek) çok daha geniş hasar veriyor, ama dürüst reddetme konusunda bir kez daha iyi.

Ayrıca iki gelişmiş sonuç "kısmi": `Randevu Al butonunu kırmızı yap` ve `Tüm site metinlerini İngilizceye çevir` kapsam dışı olarak `contactActions.*` alanlarını da değiştirdi. Bunun nedeni büyük olasılıkla rotanın kaydetme öncesi `seedContactActions` benzeri normalleştirmesi; asıl isteği bozmuyor ama "yalnız istenen değişsin" ilkesini ihlal ediyor. Standart katman `translate-en` komutunda `meta.language`'ı `en` yapmayı unuttu.

### Maliyet ve hız

| | Toplam maliyet | Ort. süre | Başarı |
|---|---|---|---|
| standart (`openai/gpt-5-mini`) | $0.0877 | 8.0 sn | 70% |
| gelişmiş (`anthropic/claude-sonnet-5.5`) | $0.7976 | 6.8 sn | 70% |

Gelişmiş katman ~9 kat pahalı ve bu komut setinde başarı oranı eşit. Tek farklar: `unsupported-hosting`'de gelişmiş dürüstçe reddetti (standart uydurdu), `button-color`'da standart daha temiz uyguladı (gelişmiş `contactActions.*` da değiştirdi). Fark yaratan şey model değil, ayrıştırıcı ve istem kuralları.

### Öneri (bu araçta uygulanmadı)

1. Ayrıştırıcı kurallarını daralt: hero başlığı kuralı "SEO/meta/sayfa/sekme" bağlamında devre dışı kalsın; buton kuralı tırnak içindeki metni önceliklendirsin ve "metnini/yazısını … yap" kuyruğunu ayıklasın.
2. "sayfa ekle", "…'ye … ekle" (öğe ekleme) ve "… üstüne/altına taşı" kalıpları ayrıştırıcıda **null** dönsün ki AI'a gitsin; ya da bu kalıplar için gerçek operasyonlar eklensin.
3. AI istemine açık bir "şemada karşılığı yoksa ya da hedef belirsizse hiçbir şeyi değiştirme, `unsupported` dön" kuralı ve sunucu tarafında değişen yol sayısı eşiği (ör. 30'dan fazlası için onay/uyarı) eklensin.
4. Yanlış başarı bildirimi için: ayrıştırıcı sonucunu "uyguladım" demeden önce basit bir son kontrole sok (örn. istenen metin şemada geçiyor mu).

Ham sonuçlar: `/tmp/ai-edit-quality.json` (her çalıştırmada üretilir). Yeniden çalıştırma: `pnpm eval:ai-edit`, tek komut için `AI_EDIT_EVAL_ONLY=seo-title pnpm eval:ai-edit`.
