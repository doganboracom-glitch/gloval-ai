import type { OriginalPost } from './types'

export const aiPosts: OriginalPost[] = [
  {
    slug: 'yapay-zeka-ile-isletme-metni-yazma',
    title: 'Yapay Zekâ ile İşletme Metni Yazma Rehberi',
    excerpt:
      'Yapay zekâ ile işletme metni hazırlarken gerçek bilgileri koruyun, doğru brif verin ve yayımdan önce metni nasıl kontrol edeceğinizi öğrenin.',
    category: 'ai',
    seoTitle: 'Yapay Zekâ ile İşletme Metni Yazma Rehberi',
    seoDescription:
      'Yapay zekâ ile işletme metni yazarken doğru bilgiyi verme, çıktıyı düzenleme ve yayımlamadan önce kontrol etme adımları.',
    tags: ['yapay zekâ metin', 'işletme metni', 'web sitesi içeriği'],
    body: `Bir fırın sahibi akşam kapanıştan sonra bilgisayarın başına oturuyor ve web sitesi için "hakkımızda" metni yazmaya çalışıyor. Yarım saat sonra elinde üç cümle ve hiçbirinden memnun olmama hâli var. Yapay zekâ tam bu noktada işe yarar: boş sayfa korkusunu alır, ilk taslağı birkaç saniyede çıkarır. Ama taslağın işletmenize ait olup olmadığı, ona ne anlattığınıza bağlıdır.

## Yapay zekâ metni nerede iyi, nerede zayıf

Dil modelleri akıcı cümle kurmakta çok iyidir. Bir paragrafı daha sade hâle getirmek, aynı bilgiyi üç farklı tonda yazmak ya da uzun bir notu başlıklara bölmek gibi işlerde zamandan ciddi tasarruf sağlar. Zayıf kaldığı yer ise sizin gerçeğinizdir. Mahallenizdeki rakiplerden neden farklı olduğunuzu, ustanızın kaç yıldır aynı tezgâhta çalıştığını ya da hangi ürünün tükenince müşterilerin aradığını model bilemez. Bilmediği yeri de çoğu zaman makul görünen bir cümleyle doldurur.

Bu yüzden iş bölümünü baştan net kurmak gerekir. Bilgi sizden gelir, biçim yapay zekâdan. Siz "ne" dersiniz, o "nasıl söyleneceğini" önerir.

## Metne başlamadan önce toplanacak notlar

Boş bir komut kutusuna "fırınım için hakkımızda yaz" yazmak ile elinizdeki notları yapıştırmak arasında büyük fark var. Önce beş dakikanızı ayırıp şunları bir not defterine yazın:

- İşletmenin adı, kuruluş yılı ve bulunduğu semt
- Sattığınız ya da sunduğunuz üç ana şey
- Müşterilerin en sık sorduğu iki üç soru
- Sizi anlatırken kullandığınız gerçek bir cümle (örneğin "hamuru gece mayalıyoruz")
- Metnin yayımlanacağı yer: ana sayfa mı, hizmet sayfası mı, sosyal medya mı

Bu liste yapay zekâya verdiğiniz hammaddedir. Ne kadar özgünse çıktı o kadar size benzer.

## Komutu yazarken üç şeyi söyleyin

İyi bir komut üç parçadan oluşur: kim için yazıldığı, ne amaçla yazıldığı ve hangi sınırlar içinde yazılacağı. Örneğin şöyle bir istek düşünün: "Kadıköy'de küçük bir ekmek fırınıyım. Aşağıdaki notlara dayanarak, 120 kelimelik bir hakkımızda metni yaz. Samimi ama abartısız olsun. Notlarda geçmeyen hiçbir rakam, ödül ya da kuruluş bilgisi ekleme."

Son cümle çok önemlidir. Modele açıkça yasak koymazsanız "yıllardır en taze ekmeği sunuyoruz" gibi doğrulanamayan iddialar eklenebilir. Sınır koymak hem sizi korur hem de sonradan temizlenecek cümle sayısını azaltır.

## İlk çıktıyı nasıl okumalı

İlk taslağı okurken bir kalem alıp üç tür cümleyi işaretleyin. Birincisi, gerçekten doğru olan cümleler; bunları tutun. İkincisi, doğru olabilecek ama sizin doğrulamadığınız cümleler; bunları ya kanıtlayın ya silin. Üçüncüsü, hiçbir işletmeye özgü olmayan genel cümleler; "müşteri memnuniyeti bizim için önceliktir" gibi her sitede bulunabilecek kalıpları çıkarın.

Genelde taslağın yarısı bu eleme sonunda geriye kalır. Bu normaldir. Kalan yarıya kendi ağzınızdan iki üç cümle eklediğinizde metin bir anda canlanır.

> Yapay zekâ taslağı yazar, sorumluluğu yine imzayı atan kişi taşır.

## Tonu işletmeye uydurmak

Bir bakkalın sitesi ile bir hukuk bürosunun sitesi aynı tonda konuşmamalı. Komutta tonu örnekle anlatmak, sıfat saymaktan daha iyi sonuç verir. "Profesyonel ve samimi" demek yerine, beğendiğiniz kendi cümlenizi ya da bir müşteri mesajınızı örnek olarak ekleyip "bu tonda yaz" demek modele gerçek bir referans verir.

Kısa cümleler genellikle web için daha uygundur. Ekranda okuyan kişi satır atlar, gözü başlıklara takılır. Taslaktaki uzun, virgüllerle uzayan cümleleri ikiye bölün. Bir paragrafta tek fikir olsun.

## Yapay zekânın uydurabileceği şeyler

Modeller bazen "halüsinasyon" denen bir hata yapar: olmayan bir bilgiyi kendinden emin biçimde yazar. İşletme metninde bunun en sık görüldüğü yerler şunlardır:

- Kuruluş yılı, çalışan sayısı, şube sayısı gibi rakamlar
- Ödül, sertifika ve basında yer alma iddiaları
- Müşteri yorumu gibi görünen ama kimseye ait olmayan alıntılar
- Çalışma saatleri ve teslim süreleri
- "En iyi", "en hızlı", "bir numara" gibi kanıtlanamayan üstünlük ifadeleri

Yayımlamadan önce bu beş başlığı metinde tek tek arayın. Bir tanesi bile notlarınızda yoksa silin.

## Tek seferde değil, parça parça ilerleyin

Uzun bir metni tek komutla istemek yerine bölümlere ayırın. Önce başlık ve alt başlık önerileri isteyin, sonra her bölümü ayrı ayrı yazdırın. Parça parça ilerlemek iki avantaj sağlar. Her parçayı kontrol etmek kolaylaşır ve yanlış bir bölümü atmak için bütün metni baştan yazdırmanız gerekmez.

Bir başka işe yarar yöntem de "karşı okuma"dır: yazdırdığınız metni modele geri verip "bu metinde doğrulanması gereken iddiaları listele" demek. Model kendi çıktısındaki riskli cümleleri çoğu zaman iyi tespit eder. Yine de son karar sizindir.

## Kişisel veri ve gizlilik

Komut kutusuna müşteri adı, telefon numarası ya da fatura bilgisi yapıştırmayın. Metin yazdırmak için bu bilgilere ihtiyaç yoktur. Müşteri hikâyesi anlatacaksanız ismini ve ayırt edici ayrıntılarını çıkarıp genel bir ifade kullanın ya da kişiden yazılı izin alın.

## Yayımdan önce son kontrol

Metni sitenize koymadan önce şu soruları sırayla sorun:

- Bu metindeki her rakam ve iddia gerçek mi?
- Telefon, adres ve saat bilgileri güncel mi?
- Metin, işletmenizi tanımayan birine ne yaptığınızı iki cümlede anlatıyor mu?
- Okuyan biri bir sonraki adımı, yani aramayı, mesaj atmayı ya da sipariş vermeyi biliyor mu?
- Sayfayı telefonda açınca paragraflar rahat okunuyor mu?

Bu soruların hepsine evet diyebiliyorsanız metin yayına hazırdır.

## Küçük bir alışkanlık önerisi

Bir not dosyasında işletmenizin "gerçekler sayfası" tutun: adres, saatler, ürün listesi, sık sorulan sorular ve beğendiğiniz cümleleriniz. Her yeni metin istediğinizde bu dosyayı komutun başına ekleyin. Zamanla hem yapay zekâdan aldığınız taslaklar tutarlı hâle gelir hem de siz neyi yayımladığınızı hep bilirsiniz. Fırıncı örneğine dönersek, bir sonraki "kampanya duyurusu" metni artık sıfırdan değil, o dosyadan başlar.`,
  },
  {
    slug: 'ai-gorselleri-sitede-kullanirken-dikkat-edilecekler',
    title: 'AI Görsellerini Sitede Kullanırken Dikkat Edilecekler',
    excerpt:
      'AI ile üretilen görselleri sitenizde kullanırken kaynağı bilme, marka ve kişi taklidinden kaçınma ve gerektiğinde kendi görselinizi kullanma gibi genel dikkat noktaları.',
    category: 'ai',
    seoTitle: 'AI Görsellerini Sitede Kullanırken Dikkat Edilecekler',
    seoDescription:
      'AI görsellerini web sitenizde kullanmadan önce kontrol etmeniz gereken noktalar: kaynak, özgünlük, marka ve kişi benzerliği, gerçeklik.',
    tags: ['AI görsel', 'web tasarım görseli', 'görsel seçimi'],
    body: `Yapay zekâ ile görsel üretmek artık birkaç cümlelik bir işlem. Bir kuaför salonu için "gün ışığı alan, bitkili bir salon" yazıyorsunuz ve saniyeler içinde sitenize yakışacak bir kare elinize geçiyor. Kolaylık güzel, ama görseli sitenize koymadan önce durup bakmanız gereken birkaç nokta var. Çünkü ziyaretçi o görsele bakıp işletmeniz hakkında bir karar veriyor.

## Önce şunu sorun: bu görsel neyi anlatıyor?

Stok fotoğraf da, AI görseli de dekoratif olabilir. Sorun, görselin işletmenizin gerçek hâlini anlatıyormuş izlenimi vermesidir. Bir pastane sitesinde gösterilen, hiç üretmediğiniz bir pasta ya da bir klinik sitesinde hiç görmediğiniz bir oda, ziyaretçide yanlış beklenti yaratır. Müşteri kapıdan girdiğinde farklı bir şeyle karşılaşırsa, güven bir anda kaybolur.

Bu yüzden görselleri iki gruba ayırın:

- **Atmosfer görselleri:** Hero arka planı, bölüm ayracı, genel his veren kareler. Burada AI görseli rahatça kullanılabilir.
- **Kanıt görselleri:** Ürününüz, mekânınız, ekibiniz ve yaptığınız iş. Bunlar mümkünse gerçek fotoğraf olmalı.

## Ürün ve mekân görsellerinde gerçeğe sadık kalın

Bir ürünü satıyorsanız müşteri size gördüğünü alacağını düşünerek para öder. AI ile üretilmiş bir ürün görseli rengi, dokuyu ya da ölçüyü gerçeğinden farklı gösterebilir. Üstelik model, ürünün üzerine hiç olmayan detaylar ekleyebilir: fazladan bir dikiş, farklı bir logo, anlamsız yazılar.

Ürün sayfalarında kural basit: müşterinin satın alacağı şeyin fotoğrafını kullanın. AI'yi yalnızca arka planı temizlemek ya da kampanya afişi için dekoratif bir zemin hazırlamak gibi yardımcı işlerde değerlendirin.

## Elleri, yazıları ve küçük ayrıntıları inceleyin

Üretilen görsellerde en sık görülen hatalar küçük yerlerde saklanır. Görseli büyütüp şunlara bakın:

- Parmak sayısı ve el duruşu
- Tabela, menü ya da kitap üzerindeki yazılar; çoğu zaman okunmaz ya da anlamsızdır
- Gözlük, küpe, saat gibi simetrik olması gereken eşyalar
- Arka plandaki kişilerin yüzleri
- Işığın ve gölgenin yönü

Bir hata gözünüze çarptıysa görseli yeniden üretin ya da kırpın. Ziyaretçi bilinçli olarak fark etmese bile "bir şey tuhaf" hissi verir ve bu his siteye yansır.

## Gerçek kişileri ve markaları taklit etmeyin

Bir ünlüye, tanınmış bir sporcuya ya da markalı bir ürüne benzeyen görseller üretmek ve sitede kullanmak ciddi sorun çıkarabilir. Kişilerin kendi görüntüleri üzerinde hakları vardır; markaların da logoları ve ayırt edici tasarımları üzerinde. "X markasının tarzında" diye komut vermek ve sonucu kendi ürününüzmüş gibi sunmak da aynı sınırı zorlar.

Pratik bir kural: komutlarda gerçek kişi adı ve marka adı kullanmayın. Görsel bir kişiye benziyor gibi hissediyorsanız kullanmayın. Hukuki bir kesinlik arıyorsanız bu konuda yetkin bir uzmana danışmak en doğrusudur; bu yazı hukuki tavsiye değildir.

## Kullandığınız aracın şartlarını okuyun

Her görsel üretim aracının kendi kullanım koşulları vardır. Ticari kullanıma izin verip vermediği, çıktının sahipliği ve atıf gerekip gerekmediği araçtan araca değişir ve zamanla güncellenebilir. Bu koşulları kendi hesabınızın kapsamında, aracın resmî sayfasından kontrol edin. Hangi aracı, hangi tarihte kullandığınızı basitçe bir not dosyasında saklamak da ileride işinize yarar.

## Kendi fotoğrafınızı kullanmanın değeri

Küçük işletmelerde kendi fotoğrafınız çoğu zaman en güçlü görseldir. Bir kafenin sabah ışığındaki tezgâhı, bir tesisatçının çalışırken çekilmiş karesi, bir atölyenin raflarındaki gerçek ürünler... Biraz pürüzlü olsa bile bunlar "burada gerçek insanlar var" mesajını verir ve hiçbir model bunu taklit edemez.

Telefon kamerasıyla bile iyi sonuç almak mümkün:

- Gün ışığında, pencere kenarında çekin
- Arka planı sadeleştirin, tezgâhı toplayın
- Ürünü ya da işi yakından ve bütünüyle olmak üzere iki açıdan çekin
- Yatay çekin; çoğu site düzeni yatay görseli daha rahat kullanır

## Erişilebilirlik ve açıklama metinleri

Görsel hangi kaynaktan gelirse gelsin her görsele kısa bir açıklama (alt metin) yazın. Ekran okuyucu kullanan ziyaretçiler için bu şarttır; ayrıca görsel yüklenmediğinde de bilgi vermeye devam eder. "Fotoğraf" ya da "görsel" yazmak yeterli değildir; "Kuruyemiş reyonunda tartılan fındık" gibi görseli gerçekten tarif eden bir cümle seçin.

## Boyut ve hız

AI araçları genellikle büyük dosyalar üretir. Doğrudan sitenize yüklerseniz sayfa yavaş açılabilir. Görseli sığacağı boyuta küçültüp sıkıştırdıktan sonra yükleyin. Özellikle telefonda açılan ilk ekranın görseli hızlı gelmelidir; ziyaretçinin ilk izlenimini belirleyen bu karedir.

## Yayımdan önce kontrol listesi

- Bu görsel, işletmemin gerçekte sunduğu bir şeyi mi gösteriyor, yoksa sadece atmosfer mi veriyor?
- Ürün ya da mekân gösteriyorsa gerçeğe uygun mu?
- Elleri, yazıları ve yüzleri büyüterek kontrol ettim mi?
- Gerçek bir kişiye ya da markaya benzemiyor mu?
- Aracın kullanım koşullarını ticari kullanım açısından okudum mu?
- Alt metni yazdım mı ve dosya boyutunu küçülttüm mü?

Bu altı soruya cevabınız olumluysa AI görselini rahatça kullanabilirsiniz. Cevabınız belirsizse en güvenli yol, o alanda kendi fotoğrafınızı kullanmaktır.`,
  },
  {
    slug: 'yapay-zeka-ile-urun-aciklamasi-yazma',
    title: 'Yapay Zekâ ile Ürün Açıklaması Yazma',
    excerpt:
      'Ürün açıklamalarını yapay zekâ ile hazırlarken özellikleri doğru aktarma, faydayı sade anlatma ve metni yayımdan önce kontrol etme adımları.',
    category: 'ai',
    seoTitle: 'Yapay Zekâ ile Ürün Açıklaması Yazma Rehberi',
    seoDescription:
      'Yapay zekâ ile ürün açıklaması yazarken özellik listesini hazırlama, komut verme ve çıktıdaki hataları ayıklama adımları.',
    tags: ['ürün açıklaması', 'AI ile içerik', 'e-ticaret metni'],
    body: `Elinizde kırk ürün var ve hepsi için açıklama yazmanız gerekiyor. İlk üçünü hevesle yazıyorsunuz, dördüncüde cümleler birbirine benzemeye başlıyor, onuncuda "yüksek kaliteli, şık ve kullanışlı" ifadesini üçüncü kez yazdığınızı fark ediyorsunuz. Yapay zekâ bu tekrar yorgunluğunu hafifletebilir; ama yalnızca ürün bilgisini ona siz verirseniz.

## Girdi kalitesi çıktı kalitesini belirler

Bir modele "bu çantayı anlat" demek, ona çanta hakkında hiçbir şey vermemek demektir. Model, binlerce çanta açıklamasından öğrendiği ortalama cümleleri size geri verir. Sonuç, herhangi bir mağazada bulunabilecek bir metin olur.

Önce ürün için bir veri kartı hazırlayın. Aşağıdaki alanlar çoğu ürün için yeterlidir:

- Ürün adı ve model kodu
- Ölçüler, ağırlık, hacim (hangisi geçerliyse)
- Malzeme ve üretim yeri bilgisi
- Renk ve beden seçenekleri
- Kullanım şekli ve bakım talimatı
- Pakette neler çıktığı
- Kimlerin kullanması için tasarlandığı

Bu kart, kendi ürün bilginizdir. Üretici etiketinden, kutusundan ya da tedarikçi belgesinden alın. Tahmin etmeyin.

## Özellik ile faydayı ayırın

İyi bir ürün açıklaması özelliği faydaya çevirir. "Çift katlı cidar" bir özelliktir; "sıcak içeceğiniz saatlerce sıcak kalır" ise faydadır. Ama ikinci cümleyi yazabilmeniz için bu iddianın gerçek olması gerekir. Süre ya da performans gibi ölçülebilir bir iddia kullanacaksanız ürün belgesindeki ya da kendi testinizdeki değeri verin, yoksa genel bir ifadeyle yetinin.

Komutunuzda bunu açıkça isteyebilirsiniz: "Her özelliğin yanına, yalnızca veri kartında yazan bilgiyle desteklenebilecek bir fayda cümlesi yaz. Kartta olmayan bir performans değeri ekleme."

## Örnek bir komut

Bir seramik kupa için şöyle bir istek hazırlanabilir:

> Aşağıdaki ürün kartına dayanarak 90 kelimelik bir ürün açıklaması yaz. Ton: sıcak ve sade. Önce tek cümlelik bir giriş, sonra üç maddelik özellik listesi gelsin. Kartta yazmayan hiçbir bilgiyi ekleme. Emin olmadığın yerde köşeli parantezle soru işareti bırak.

Son talimat işe yarar: model bilmediği bir yerde uydurmak yerine boşluk bırakır ve siz o boşluğu kendiniz doldurursunuz.

## Çıktıdaki tipik hatalar

Üretilen açıklamalarda şu hatalar sık görülür:

- Kartta olmayan bir malzeme ("el yapımı", "organik", "saf pamuk") ekleme
- Ürünü aslında olmayan bir kullanıma uygun gösterme (örneğin her kabı "bulaşık makinesinde yıkanabilir" yapma)
- Aynı kalıbı bütün ürünlerde tekrar etme
- Sağlıkla ilgili ya da güvenlikle ilgili iddialar ekleme

Son madde özellikle önemlidir. Gıda, kozmetik, bebek ürünü ya da elektrikli cihaz gibi alanlarda yanlış bir cümle yalnızca kötü bir metin değil, müşteri için gerçek bir risk olabilir. Bu kategorilerde yapay zekâ çıktısını mutlaka ürün belgeleriyle satır satır karşılaştırın.

## Aynı kalıbı kırmak

Kırk ürünün açıklaması aynı iskeletle başlayıp aynı cümleyle bitiyorsa hem okuyucu hem arama motorları bunu fark eder. Çözüm, her ürün için farklı bir "açı" seçmektir. Biri için kullanım anı (sabah kahvesi), diğeri için malzeme hikâyesi, bir başkası için hediye olarak uygunluk öne çıkarılabilir. Komutta bu açıyı siz belirtin: "Bu ürünü hediye düşünen alıcı gözüyle anlat."

Ürün adlarını, kod numaralarını ve ölçüleri ise her seferinde aynı biçimde yazın; tutarlılık burada bir erdemdir.

## Başlık ve kısa özet

Açıklamadan önce iki yer daha vardır: ürün başlığı ve listede görünen kısa özet. Başlıkta ürünün ne olduğunu açıkça söyleyin ("Seramik Kupa, 300 ml, Mat Gri"). Kısa özet, ürünü tek cümleyle tanıtsın. Model bu iki alan için üç dört alternatif sunabilir; siz müşterinin arayacağı sözcüklere en yakın olanı seçin.

## Yapay zekâ ile ürün açıklaması: adım adım

- Ürün veri kartını gerçek belgelerden doldurun.
- Komutu yazın; yasakları ve boşluk bırakma kuralını ekleyin.
- Çıktıyı veri kartıyla yan yana koyup her cümleyi doğrulayın.
- Doğrulanamayan cümleleri silin ya da yumuşatın.
- Aynı kalıbı tekrar eden cümleleri çeşitlendirin.
- Ürün fotoğrafıyla açıklamanın uyuştuğunu kontrol edin: renk, boyut, set içeriği.
- Telefonda ürün sayfasını açıp açıklamanın rahat okunduğuna bakın.

## Ölçeklendirirken dikkat

Çok sayıda ürün için aynı komutu tekrar tekrar kullanmak cazip gelir. Bunu yapabilirsiniz; ama her üründe yalnızca veri kartı değişsin, komut sabit kalsın. Önce beş ürünle deneme yapın, sonuçları okuyun, komutu iyileştirin, sonra geri kalanına geçin. Toplu üretim sonrasında rastgele seçtiğiniz bir iki ürünü ayrıntılı kontrol etmek, tamamını gözden geçirmek zorunda kalmanızı çoğu zaman önler.

Ürün sayfalarının nasıl yazılacağıyla ilgili daha genel bir bakış için [e-ticarette ürün açıklaması rehberimize](/blog/yapay-zeka-ile-urun-aciklamasi-yazma) ya da [blog arşivimize](/blog) göz atabilirsiniz.

## Son söz

Yapay zekâ ürün açıklamasında yorucu ilk taslağı üstlenir, ama ürünün ne olduğunu bilen kişi sizsiniz. Veri kartı hazırlamak, komutta sınır koymak ve çıktıyı belgelerle doğrulamak sizi hem hızlandırır hem de müşteriye yanlış bir söz vermekten korur.`,
  },
  {
    slug: 'yapay-zeka-ile-web-sitesini-kisisellestirme',
    title: 'Yapay Zekâ ile Web Sitesini Kişiselleştirme',
    excerpt:
      'Hazır bir site taslağını işletmenizin dili, hizmetleri, renkleri ve müşteri ihtiyaçlarıyla uyumlu hâle getirme yöntemleri.',
    category: 'ai',
    seoTitle: 'Yapay Zekâ ile Web Sitesini Kişiselleştirme',
    seoDescription:
      'Yapay zekâyla hazırlanan bir site taslağını kendi işletmenize uyarlamak için metin, görsel, renk ve sayfa düzeni önerileri.',
    tags: ['site kişiselleştirme', 'AI web sitesi', 'site düzenleme'],
    body: `Yapay zekâ ile hazırlanan bir web sitesi taslağı, çoğu zaman düzgün görünür ama biraz tanıdıktır. Bölümler yerli yerinde, metinler akıcı, renkler uyumlu; yine de siteyi açan biri "bu herhangi bir işletmenin sitesi olabilir" diye düşünebilir. Kişiselleştirme, taslağı bu genel görünümden çıkarıp sizin işletmenize ait hâle getirme işidir.

## Taslak bir başlangıçtır, bitmiş iş değil

Taslağı bir mimarın hazırladığı ilk plana benzetebilirsiniz. Odaların yeri mantıklıdır, ama evde kimin yaşadığını mimar henüz bilmiyor. Siz taslağa baktığınızda iki soru sormalısınız: Yapı doğru mu, içerik doğru mu? Yapı çoğunlukla büyük ölçüde doğrudur; asıl emek içerikte harcanır.

İlk açışta sayfayı baştan sona kaydırın ve telefonunuzdaki not defterine şunları yazın: yanlış olan bilgiler, hiç bana ait olmayan cümleler, eksik kalan bölümler ve beni anlatmayan görseller. Bu liste kişiselleştirme planınız olur.

## Önce gerçek bilgiler

Taslakta en önce düzeltilecek yerler, değişmez bilgilerdir:

- İşletme adı ve yazılışı
- Telefon numarası, e-posta ve adres
- Çalışma günleri ve saatleri
- Hizmet verilen bölge
- Sunulan ürün ve hizmetlerin gerçek adları

Bu alanlarda küçük bir hata bile doğrudan müşteri kaybına yol açar. Yanlış telefon numarası yazan bir site, hiç olmamasından kötüdür. Bilgileri girdikten sonra sitenin bütün sayfalarında tek tek arayın; aynı numara hem üst menüde hem alt bilgide hem iletişim bölümünde geçebilir.

## Kendi sesinizi bulmak

Yapay zekâ metinleri çoğu zaman nötr bir kurumsal dille yazar. Oysa bir çocuk kitabevi ile bir endüstriyel yedek parça satıcısı aynı sesle konuşmaz. Metinleri yüksek sesle okuyun ve kendinize sorun: Bunu müşteriye bir tezgâhın ya da masanın başında söyler miydim?

Söylemezdiniz diye düşündüğünüz cümleleri, günlük konuşmanızda kullanacağınız hâlle değiştirin. Örneğin "geniş ürün yelpazesiyle hizmetinizdeyiz" yerine "üç yüzden fazla ürün çeşidimiz var, aradığınız parçayı bulamazsanız bize yazın" gibi somut bir cümle daha güçlüdür. Ama somut cümlenin içindeki sayı gerçek olmalıdır; saymadan yazmayın.

## Müşteri sorularından yola çıkın

Kişiselleştirmenin en verimli yolu, müşterilerinizin gerçekten sorduğu soruları siteye taşımaktır. Telefonda, mesajda ya da tezgâh başında en sık duyduğunuz beş soruyu yazın. Sonra siteye bakın: Bu sorulara ilk ekranlarda cevap veriliyor mu?

Cevap yoksa bir "sık sorulan sorular" bölümü ekleyin ya da mevcut bölümün cümlelerini bu sorulara göre yeniden yazın. Bir berber için "randevusuz gelebilir miyim?", bir pansiyon için "evcil hayvan kabul ediyor musunuz?", bir kurye hizmeti için "hangi saate kadar sipariş alıyorsunuz?" gibi sorular bunun örnekleridir. Bu sorular işletmeniz kadar özgündür.

## Görselleri sahiplenmek

Taslaktaki görseller atmosfer verir ama sizin ürününüzü ya da mekânınızı göstermeyebilir. Mümkün olan yerlerde, özellikle ürün, ekip ve mekân gösteren alanlarda, kendi fotoğraflarınızla değiştirin. Hero alanındaki büyük görsel ilk izlenimi belirlediği için buraya öncelik verin.

Yeni bir fotoğraf yüklerken boyutuna dikkat edin. Telefon fotoğrafları çok büyük olabilir; sayfa yavaşlamasın diye makul bir boyuta indirmek iyi bir alışkanlıktır. Her görsel için kısa bir açıklama metni de ekleyin.

## Renk ve yazı tipi

Renkleri değiştirirken üç kuralı aklınızda tutun. Birincisi, logonuzdaki renkle uyumlu bir ana renk seçin. İkincisi, metin ile zemin arasındaki karşıtlığı koruyun; açık gri zemin üzerinde açık gri yazı okunmaz. Üçüncüsü, çok renk kullanmayın; bir ana renk, birkaç nötr ton ve en fazla bir vurgu rengi çoğu işletme için yeterlidir.

Yazı tipinde de sadelik kazanır. Başlıklar ve gövde metni için iki farklı yazı tipi yeterlidir. Gövde metnini küçük puntoyla yazmayın; telefonda okunabilirlik her zaman öncelikli olmalıdır.

## Bölüm sırasını gözden geçirmek

Taslakta bölümlerin sırası genel bir mantığa göre dizilmiştir: tanıtım, hizmetler, hakkımızda, iletişim. Sizin işletmenizde ise ziyaretçinin ilk bakacağı şey başka olabilir. Bir restoranda menü ve çalışma saatleri, bir avukatlık bürosunda uzmanlık alanları ve başvuru yolu, bir sınav hazırlık kursunda program ve kayıt tarihleri öne çıkabilir.

Bölümleri kaydırın, sırasını değiştirin, gereksiz olanları kaldırın. Az bölümlü ama net bir sayfa, her şeyin olduğu ama hiçbirinin görünmediği bir sayfadan daha etkilidir.

## Kişiselleştirme kontrol listesi

- İşletme adı, telefon, adres ve saatler her sayfada doğru mu?
- Metinlerde bana ait olmayan genel cümleler kaldı mı?
- Müşterilerimin en sık sorduğu beş sorunun cevabı sitede var mı?
- Ürün, ekip ve mekân görselleri gerçek mi?
- Renkler logoyla uyumlu ve metin okunabilir mi?
- İlk ekranda ziyaretçiye ne yapmasını istediğimi söylüyor muyum?
- Telefonda açınca her şey rahat kullanılıyor mu?

## Düzenli aralıklarla geri dönün

Kişiselleştirme tek seferlik bir iş değildir. Yeni bir hizmet eklediğinizde, fiyat ya da saat değiştiğinde ya da müşterilerden yeni bir soru duyduğunuzda siteyi güncelleyin. Ayda bir on dakikanızı ayırıp siteyi bir müşteri gibi gezmek, birçok küçük hatayı büyümeden yakalamanızı sağlar.`,
  },
  {
    slug: 'yapay-zekaya-dogru-brief-verme',
    title: 'Yapay Zekâya Doğru Brif Verme Rehberi',
    excerpt:
      'Yapay zekâdan daha anlaşılır bir başlangıç taslağı almak için işletmenizi, hedefinizi ve beklentinizi nasıl anlatacağınızı öğrenin.',
    category: 'ai',
    seoTitle: 'Yapay Zekâya Doğru Brif Verme Rehberi',
    seoDescription:
      'Yapay zekâya brif verirken işletmeyi, hedef kitleyi ve beklentiyi nasıl anlatmalı? Örnek brif ve sık yapılan hatalar.',
    tags: ['AI brif', 'prompt yazma', 'web sitesi brifi'],
    body: `Bir terziye "bana bir ceket dikin" demekle, "düğün için, koyu lacivert, iki düğmeli, yazın giyilecek hafif bir kumaştan bir ceket" demek aynı sonucu vermez. Yapay zekâ ile çalışırken de durum aynıdır. Verdiğiniz tarif ne kadar netse ilk taslak o kadar işe yarar. Bu tarife brif diyoruz.

## Brif nedir, neden önemlidir?

Brif, yapay zekâya vereceğiniz işin kısa tanımıdır. İşletmeniz kim, kime hitap ediyorsunuz, ne istiyorsunuz ve hangi sınırlar içinde çalışılacak, bunların hepsi brifin içindedir. Model sizi tanımaz, işletmenizi görmez; elinde yalnızca yazdıklarınız vardır. Eksik bıraktığınız her şeyi tahminle doldurur ve tahmin çoğu zaman ortalama bir sonuç üretir.

İyi brif sizi iki şekilde kurtarır. Birincisi, ilk taslak daha isabetli olur ve düzeltme turu azalır. İkincisi, hangi bilginin gerçekten sizden geldiğini bilirsiniz; bu da sonradan doğrulama işini kolaylaştırır.

## Brifin beş bileşeni

Her brifte şu beş bölüm bulunmalı:

- **İşletme:** Adı, ne yaptığı, nerede olduğu, kaç yıldır çalıştığı (biliyorsanız).
- **Hedef kitle:** Kime satış yapıyorsunuz? Yaş aralığı yerine durumu tarif edin: "evini yeni tadilattan çıkaran aileler" gibi.
- **Amaç:** Bu sayfadan sonra ziyaretçinin ne yapmasını istiyorsunuz? Aramak, randevu almak, sipariş vermek, formu doldurmak?
- **Ton ve sınırlar:** Samimi mi resmî mi? Hangi ifadeleri kullanmayın? Hangi iddialar kesinlikle yazılmasın?
- **Format:** Kaç bölüm, kaç kelime, hangi başlıklar?

## Zayıf ve güçlü brif karşılaştırması

Zayıf brif şöyle olabilir: "Berber dükkânım için bir web sitesi yap."

Aynı işletme için daha güçlü bir brif şöyle yazılır: "Bursa Nilüfer'de iki koltuklu bir erkek berber dükkânıyım. Müşterilerim çoğunlukla mahalleden, her yaştan erkekler. Sitenin amacı randevu almalarını sağlamak. Ana sayfada kısa bir tanıtım, hizmet listesi, çalışma saatleri ve iletişim bölümü olsun. Ton samimi ve kısa olsun. Fiyat, ödül ya da müşteri yorumu uydurma."

İkinci metin yalnızca beş cümle ama modele bir işletme, bir kitle, bir amaç ve net sınırlar veriyor. Çıktının kalitesindeki fark ilk bakışta görülür.

## Sınırları yazmayı unutmayın

En çok atlanan bölüm "ne yapma" bölümüdür. Yapay zekâ boşluk gördüğünde doldurur. Fiyat bilgisi vermediyseniz bir fiyat önerebilir, adres vermediyseniz örnek bir adres yazabilir. Bunları engellemenin yolu açık bir cümledir: "Rakam, fiyat, adres ve telefon bilgisi uydurma; bilmediğin yere [BİLGİ GİRİLECEK] yaz."

Bu köşeli parantez yöntemi hem güvenli hem pratiktir. Taslağı aldığınızda boş yerleri tek tek doldurursunuz ve hiçbir yanlış bilgi sitenizde kalmaz.

## Gerçek bilgiyi önceden hazırlayın

Brifi yazmadan önce bir not sayfası hazırlamak işi hızlandırır. Şunları toplayın: ticari ünvanınız, hizmet listesi, çalışma saatleri, sık sorulan sorular, mevcut sosyal medya adresleriniz. Bu bilgileri brifin altına yapıştırırsanız model uydurmak yerine verdiğinizi kullanır.

Not sayfasında ne kadar çok kişisel veri varsa o kadar dikkatli olun. Müşterilerin adını, telefonunu ya da randevu kayıtlarını komuta yapıştırmayın; siteyi oluşturmak için bu bilgilere ihtiyaç yoktur.

## Örnekle anlatın

Bazen ne istediğinizi sözle tarif etmek zordur. Bu durumda örnek vermek işe yarar. Beğendiğiniz bir sitenin tonunu birkaç cümleyle tarif edin ya da kendi yazdığınız bir mesajı örnek olarak ekleyin: "Tonu şuna benzesin: 'Merhaba, kısa sürede dönüş yapıyoruz, bize yazın.'" Başka birinin metnini kopyalamak yerine tonu örnek almak, hem özgünlük hem de telif açısından daha sağlıklıdır.

## Tek seferde değil, tur tur ilerleyin

Brif tek bir mesajla bitmez. Birinci turda yapıyı isteyin; bölümler ve başlıklar. İkinci turda her bölümün metnini isteyin. Üçüncü turda tonu ve uzunluğu ayarlayın. Her tur sonunda çıktıyı okuyup bir sonraki komuta düzeltme notlarınızı ekleyin: "Giriş çok uzun, iki cümleye indir. Hizmet listesinde manikür yok, kaldır."

Bu yöntem yapay zekâyı bir yardımcı gibi yönetmek anlamına gelir. Ona bir kez söyleyip bırakmazsınız; sonucu görüp yönlendirirsiniz.

## Sık yapılan hatalar

- Çok kısa ve belirsiz brif vermek
- Hedef kitleyi tanımlamamak ("herkes" bir hedef kitle değildir)
- Amacı belirtmemek; sayfanın ne yapması gerektiğini söylememek
- Yasakları yazmamak
- Çıktıyı doğrulamadan yayımlamak
- Aynı brifi bütün sayfalar için kullanmak; ana sayfa ile hizmet sayfasının amacı farklıdır

## Brif kontrol listesi

Komutu göndermeden önce şu soruları yanıtlayın:

- İşletmemi tanımayan biri brifi okusa ne yaptığımı anlar mı?
- Hedef kitleyi somut biçimde tarif ettim mi?
- Sayfanın amacını tek cümleyle yazdım mı?
- Uydurulmaması gereken şeyleri açıkça söyledim mi?
- Boş bilgi için bir işaret belirledim mi?
- Format ve uzunluk isteğimi belirttim mi?

## Brifi saklayın

Yazdığınız iyi bir brifi bir dosyada saklayın. Yeni bir sayfa ya da yeni bir kampanya için yalnızca değişen kısımları güncellersiniz. Zamanla bu dosya, işletmenizin yapay zekâya anlatılmış resmî bir tanımı hâline gelir ve her taslakta aynı doğruluk seviyesini korumanıza yardımcı olur.`,
  },
]
