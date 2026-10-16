# AI ile site düzenleme kalitesi (salt okunur ölçüm)

Tarih: 2026-10-16. Araç: `pnpm eval:ai-edit` (üretim hattı değiştirilmez; sahte kullanıcı, sentetik site, kişisel veri yok).
Modeller: standart `openai/gpt-5-mini`, gelişmiş `anthropic/claude-sonnet-5.5`. 30 komut. Görsel komutları yalnız niyet tespiti ile ölçülür (görsel üretilmez, maliyet yok).

## Başarı oranı (katman bazında)

| Katman | Başarı | Kısmi | Etkisiz | Yanlış | Başarı oranı | Yanlış başarı bildirimi | Ort. süre | Maliyet |
|---|---|---|---|---|---|---|---|---|
| standart | 29 | 0 | 1 | 0 | 97% (29/30) | 0 | 6.5 sn | $0.0666 |
| gelişmiş | 29 | 0 | 1 | 0 | 97% (29/30) | 0 | 6.5 sn | $0.4045 |

Yanlış başarı bildirimi: sohbet "uyguladım" dedi ama sonuç başarı değil.

## Komut bazında sonuç

| # | Kategori | Komut | Beklenen | Gerçekte (standart) | Std | Gel | Kaynak | Süre s/g | Maliyet s/g |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Menü | Menüye Blog ekle | Görünen menüde "Blog" öğesi (çok sayfalı sitede pages başlığı) | ayrıştırıcı: değişiklik yok · "Blog bağlantısını menüye elle eklemek şu an desteklenmiyor. " | etkisiz | etkisiz | parser-empty/parser-empty | 0.0/0.0 | $0.0000/$0.0000 |
| 2 | Menü | Hizmetler'i üst menüden kaldır | Menüde Hizmetler yok; Hizmetler bölümü silinmemiş | ayrıştırıcı: 12 yol: navigation.links.1.href, navigation.links.1.label, navigation.links.2.href, … · ""Hizmetler" üst menüden kaldırıldı." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 3 | Buton | Hero birincil buton metnini "Hemen Ara" yap | hero.primaryButton.label = "Hemen Ara" | ayrıştırıcı: sections.0.primaryButton.label · "Ana buton güncellendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 4 | Buton | Randevu Al butonunu kırmızı yap | Butonlarda renk alanı yok: tek yol ana (primary) renk kırmızıya yakın olmalı | ai: theme.palette.0.hex | başarı | başarı | ai/ai | 14.6/15.5 | $0.0051/$0.0313 |
| 5 | Hero | Hero başlığını "Gülüşünüzü Yeniden Keşfedin" yap | hero.title = "Gülüşünüzü Yeniden Keşfedin" | ayrıştırıcı: sections.0.title · "Hero başlığı güncellendi: "Gülüşünüzü Yeniden Keşfedin"." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 6 | Bölüm | Referanslar bölümü ekle | Yeni bir testimonials bölümü | ayrıştırıcı: 11 yol: sections.6.copyright, sections.6.items.0.author, sections.6.items.0.quote, … · "Referanslar bölümü eklendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 7 | Bölüm | Süreç bölümünü sil | process bölümü kalmaz, diğerleri durur | ayrıştırıcı: 67 yol: sections.2.items.0.answer, sections.2.items.0.question, sections.2.items.1.answer, … · "Süreç bölümü kaldırıldı." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 8 | Bölüm | SSS bölümünü gizle | faq.hidden = true (silinmeden) | ayrıştırıcı: sections.3.hidden · "SSS bölümü gizlendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 9 | Bölüm | SSS bölümünü Hizmetler bölümünün üstüne taşı | faq, services'ten önce; bölüm sayısı aynı | ayrıştırıcı: 86 yol: sections.1.items.0.answer, sections.1.items.0.description, sections.1.items.0.icon, … · "SSS bölümü Hizmetler bölümünün üstüne taşındı." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 10 | Görsel | Hero görselini yeniden oluştur | Görsel hattı hero hedefini çözer (üretim bu araçta çalıştırılmaz) | görsel hattı: hero/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 11 | Görsel | Ürünlerdeki ilk fotoğrafı değiştir | Görsel hattı products bölümünün ilk ögesini çözer | görsel hattı: section/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 12 | Görsel | Logomu yeniden oluştur | Görsel hattı logo hedefini çözer | görsel hattı: logo/generate | başarı | başarı | image-intent/image-intent | 0.0/0.0 | $0.0000/$0.0000 |
| 13 | İletişim | Telefon numarasını 0532 111 22 33 yap | contact.phone 532 111 22 33 | ai: sections.5.phone | başarı | başarı | ai/ai | 12.7/19.3 | $0.0046/$0.0361 |
| 14 | İletişim | WhatsApp numarasını 0555 444 33 22 yap | contactActions.whatsapp 555 444 33 22 | ai: contactActions.whatsapp | başarı | başarı | ai/ai | 16.9/15.6 | $0.0052/$0.0296 |
| 15 | İletişim | E-posta adresini info@dentaklinik.com yap | contact.email = info@dentaklinik.com | ai: sections.5.email | başarı | başarı | ai/ai | 12.7/15.7 | $0.0042/$0.0302 |
| 16 | İletişim | Adresi Moda Cad. No:12 Kadıköy İstanbul olarak değiştir | contact.address "Moda Cad. No:12 …" | ai: sections.5.address | başarı | başarı | ai/ai | 11.8/10.0 | $0.0044/$0.0257 |
| 17 | Sosyal medya | Instagram hesabı ekle: instagram.com/dentaklinik | social.instagram dentaklinik bağlantısını içerir | ai: social.instagram | başarı | başarı | ai/ai | 12.2/15.6 | $0.0048/$0.0359 |
| 18 | Renk | Renk temasını yeşil yap | primary yeşil tonda (hue 90–170) | ayrıştırıcı: theme.palette.0.hex · "Ana renk yeşil olarak güncellendi." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 19 | Yazı tipi | Yazı tipini Playfair Display yap | typography başlık veya gövde yazı tipi Playfair Display | ai: typography.headingFont | başarı | başarı | ai/ai | 9.8/10.5 | $0.0044/$0.0283 |
| 20 | Sayfa | Hakkımızda sayfası ekle | pages içinde Hakkımızda | ai: 133 yol: pages.3.slug, pages.3.title, pages.length, … | başarı | başarı | ai/ai | 20.1/14.3 | $0.0062/$0.0301 |
| 21 | Sayfa | Hizmetler sayfasının adını Tedaviler yap | services sayfasının başlığı "Tedaviler" | ai: navigation.links.1.label, pages.1.title | başarı | başarı | ai/ai | 12.2/14.4 | $0.0045/$0.0298 |
| 22 | Alt bilgi | Alt bilgideki telif yazısını "© 2026 Diş Kliniği. Tüm hakları saklıdır." yap | footer.copyright güncel | ai: sections.6.copyright | başarı | başarı | ai/ai | 13.9/11.7 | $0.0047/$0.0258 |
| 23 | SSS | SSS'ye "Sigorta kabul ediyor musunuz?" sorusunu ekle | faq.items içinde sigorta sorusu | ai: sections.3.items.3.answer, sections.3.items.3.question, sections.3.items.length | başarı | başarı | ai/ai | 15.2/14.1 | $0.0050/$0.0280 |
| 24 | Fiyat/ürün | İlk ürünün fiyatını ₺1.299 yap | Katalog panelden yönetilir: şema değişmemeli, kullanıcı panele yönlendirilmeli | fallback: değişiklik yok (panel uyarısı) | başarı | başarı | fallback/fallback | 17.8/13.6 | $0.0057/$0.0285 |
| 25 | Çeviri | Tüm site metinlerini İngilizceye çevir | Hero ve menü İngilizce; meta.language = en | ai: 65 yol: meta.audience, meta.description, meta.language, … | başarı | başarı | ai/ai | 24.8/25.7 | $0.0078/$0.0454 |
| 26 | SEO | SEO başlığını "Kadıköy İmplant ve Diş Estetiği" yap | meta.seoTitle = "Kadıköy İmplant ve Diş Estetiği" | ayrıştırıcı: meta.seoTitle · "SEO başlığı güncellendi: "Kadıköy İmplant ve Diş Estetiği"." | başarı | başarı | parser-applied/parser-applied | 0.0/0.0 | $0.0000/$0.0000 |
| 27 | Belirsiz | Daha güzel yap | Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli | declined: değişiklik yok | başarı | başarı | declined/declined | 0.0/0.0 | $0.0000/$0.0000 |
| 28 | Belirsiz | Bunu değiştir | Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli | declined: değişiklik yok | başarı | başarı | declined/declined | 0.0/0.0 | $0.0000/$0.0000 |
| 29 | Desteklenmeyen | Sitenin sunucusunu İstanbul'a taşı | Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli | declined: değişiklik yok | başarı | başarı | declined/declined | 0.0/0.0 | $0.0000/$0.0000 |
| 30 | Desteklenmeyen | Kullanıcı girişi ve üyelik sistemi ekle | Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli | declined: değişiklik yok | başarı | başarı | declined/declined | 0.0/0.0 | $0.0000/$0.0000 |

(!) = yanlış başarı bildirimi.

## Başarısızlık kovaları (otomatik)

| Kova | Adet | Örnekler |
|---|---|---|
| komut ayrıştırıcı (yanlış eşleme) | 2 | menu-add-blog/s, menu-add-blog/g |

<!-- analysis:start -->

## Önce / sonra (komut bazında)

Önce = `main` üzerindeki ilk ölçüm (%70, 21/30), sonra = bu dal (`v0/ai-edit-fixes`, %97, 29/30). Yalnızca durumu değişen komutlar; kalan komutlar iki ölçümde de başarı.

| # | Komut | Önce (std / gel) | Sonra (std / gel) | Düzelten değişiklik |
|---|---|---|---|---|
| 1 | Menüye Blog ekle | başarı / başarı (sahte: sayfa yolları yazdı) | etkisiz / etkisiz (dürüst mesaj) | Elle blog menü anahtarı `main`'de yok; mesaj otomatik davranışı anlatıyor |
| 3 | Hero birincil buton metnini "Hemen Ara" yap | yanlış / yanlış | başarı / başarı | Buton kuralı tırnaktaki metni önceliklendiriyor |
| 4 | Randevu Al butonunu kırmızı yap | başarı / kısmi | başarı / başarı | Kapsam dışı `contactActions.*` değişiklikleri engellendi |
| 9 | SSS bölümünü Hizmetler'in üstüne taşı | kısmi / kısmi | başarı / başarı | Taşıma hedefi okunuyor |
| 20 | Hakkımızda sayfası ekle | yanlış / yanlış | başarı / başarı | "sayfa ekle" bölüm eklemiyor, yapay zekaya gidiyor |
| 23 | SSS'ye soru ekle | yanlış / yanlış | başarı / başarı | Öğe ekleme kalıbı ayrıştırıcıdan çıkarıldı |
| 25 | Tüm metinleri İngilizceye çevir | kısmi / kısmi | başarı / başarı | `meta.language` ve kapsam koruması |
| 26 | SEO başlığını … yap | yanlış / yanlış | başarı / başarı | "SEO/meta" bağlamında hero başlığı kuralı devre dışı |
| 27 | Daha güzel yap (belirsiz) | yanlış / yanlış | başarı / başarı | Belirsiz istekte değişiklik yapmadan netleştirme isteniyor |
| 29 | Sitenin sunucusunu İstanbul'a taşı | yanlış / başarı | başarı / başarı | Şema dışı istek dürüstçe reddediliyor |
| 30 | Kullanıcı girişi ve üyelik ekle | yanlış / yanlış | başarı / başarı | Şema dışı istek dürüstçe reddediliyor |

| | Önce | Sonra |
|---|---|---|
| standart başarı oranı | 70% (21/30) | **97% (29/30)** |
| gelişmiş başarı oranı | 70% (21/30) | **97% (29/30)** |
| yanlış başarı bildirimi (std / gel) | 9 / 9 | 0 / 0 |
| maliyet (std / gel) | $0.0877 / $0.7976 | $0.0666 / $0.4045 |

Hedef (>= %90) aşıldı.

## Kalan başarısız komut

`Menüye Blog ekle` tek kalan sonuç ve iki katmanda da "etkisiz". Bu çalışmada düzeltilemez: şemada elle blog menü anahtarı yok, blog bağlantısı yayında otomatik ekleniyor. Mesaj artık bunu dürüstçe söylüyor (sahte "uyguladım" yok). Anahtar `v0/blog-polish` dalında geliyor; birleşince o dal mesajı güncelleyecek, burada dokunulmadı.

## Katman kararı

Gelişmiş model düzenlemede standarttan iyi değil (iki katman eşit %97, gelişmiş ~6 kat pahalı). Bu yüzden `siteEdit` ve `sectionEdit` standart katmanda kaldı; PRO'ya "daha iyi düzenleme" vaat edilmiyor ve editör sohbetinde "Gelişmiş AI" rozeti yok. Rozet yalnızca gerçekten gelişmiş modelle çalışan akışlarda görünür: site oluşturma, ürün metni, logo stüdyosu, blog AI yazımı (FREE/Starter için kilitli yükseltme bilgisiyle).

Ham sonuçlar: `/tmp/ai-edit-quality.json`. Yeniden çalıştırma: `pnpm eval:ai-edit`, tek komut için `AI_EDIT_EVAL_ONLY=seo-title pnpm eval:ai-edit`.
