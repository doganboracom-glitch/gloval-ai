import type { OriginalPost } from './types'

export const guidesPosts: OriginalPost[] = [
  {
    slug: 'ssl-https-nedir',
    title: 'SSL ve HTTPS Nedir?',
    excerpt:
      'SSL sertifikası ve HTTPS bağlantısının web sitesi ziyaretçileri açısından ne anlama geldiğini açıklayan temel rehber.',
    category: 'guides',
    seoTitle: 'SSL ve HTTPS Nedir? Web Sitesi İçin Temel Rehber',
    seoDescription:
      'SSL sertifikası ve HTTPS nedir, adres çubuğundaki kilit ne anlama gelir, tarayıcı uyarılarında ne yapılmalı? Sade bir anlatım.',
    tags: ['SSL', 'HTTPS', 'web güvenliği'],
    body: `Bir sitenin adresine baktığınızda başında "https://" ve yanında küçük bir kilit simgesi görmüşsünüzdür. Bazen de "Güvenli değil" uyarısı çıkar ve insan o sayfadan kaçar. Bu iki durum arasındaki fark SSL ve HTTPS denen şeylerdir. Bir işletme sahibi olarak bunların ayrıntılarını bilmek zorunda değilsiniz; ama ne işe yaradıklarını bilmek, ziyaretçilerinizi korumanız ve kaybetmemeniz için yeterince önemlidir.

## HTTP'den HTTPS'e

Tarayıcınızla bir web sitesi arasındaki iletişim bir mektup trafiği gibidir. Eski yöntem olan HTTP'de bu mektup açık zarfla gider; yol üzerindeki biri okuyabilir ya da değiştirebilir. HTTPS'te ise mektup kilitli bir zarfla gönderilir; yalnızca doğru alıcı açabilir. Bu "kilit", şifreleme denen bir yöntemle sağlanır.

Bu yüzden bir sitede form doldururken, giriş yaparken ya da ödeme bilgisi girerken adresin HTTPS ile başlaması önemlidir. Yazdığınız bilgilerin yolda başkalarınca okunmasını zorlaştırır.

## SSL mi, TLS mi?

Günlük dilde herkes "SSL sertifikası" der. Teknik olarak SSL eski bir protokolün adıdır ve yerini TLS almıştır. Ama sektörde "SSL" adı alışkanlıkla kalmıştır. Sertifika aldığınızda, aslında modern TLS protokolüyle çalışan bir bağlantı kurulur. Siz "SSL" ya da "HTTPS" demeye devam edebilirsiniz; hizmet sağlayıcıların çoğu da aynı terimleri kullanır.

## Sertifika neyi kanıtlar?

Bir SSL sertifikası iki şey sağlar. Birincisi, tarayıcı ile site arasındaki bağlantıyı şifreler. İkincisi, o alan adının sertifikayı alan kişiye ya da kuruma ait olduğunu bir sertifika otoritesi aracılığıyla doğrular. Bazı sertifika türleri işletme bilgilerinin de doğrulanmasını içerir; ama çoğu yaygın sertifika yalnızca alan adının kontrolünü doğrular.

Burada önemli bir not: HTTPS, sitenin güvenilir olduğu anlamına gelmez. Dolandırıcılık amaçlı bir sitenin de geçerli bir sertifikası olabilir. Kilit simgesi yalnızca "bağlantı şifreli" der; "bu siteye güvenebilirsiniz" demez.

## İşletme siteniz neden HTTPS kullanmalı?

HTTPS kullanmak için üç ana neden var:

- **Ziyaretçi güveni:** Tarayıcılar HTTPS olmayan siteleri "Güvenli değil" diye işaretler; bu uyarı ziyaretçiyi kaçırabilir.
- **Veri koruması:** İletişim formu, randevu talebi ya da sipariş bilgisi gibi girdiler şifreli iletilir.
- **Temel beklenti:** Arama motorları ve tarayıcılar HTTPS'i standart olarak kabul eder; HTTPS olmayan bir site eski ve bakımsız izlenimi verir.

Bir sitenizde hiç form olmasa bile HTTPS kullanmak iyi bir uygulamadır, çünkü sayfanın içeriğinin yolda değiştirilmesini engeller.

## Sertifika nasıl alınır?

Çoğu modern site barındırma hizmeti, sertifikayı sizin için otomatik olarak kurar ve yeniler. Siteyi yayımladığınız ortam bunu sağlıyorsa ekstra bir işlem yapmanız gerekmeyebilir. Kendi alan adınızı kullanıyorsanız, alan adının doğru ayarlanmasından sonra sertifikanın hazırlanması için kısa bir süre geçmesi normaldir. Ücretli ve ücretsiz sertifika seçenekleri vardır; küçük bir işletme sitesi için çoğu zaman ücretsiz ve otomatik yenilenen bir sertifika yeterlidir. Hangi seçeneğin sizin için uygun olduğunu barındırma hizmetinizin kendi belgelerinden kontrol edin.

## Adres çubuğunda ne görmeli?

Siteniz yayındayken şunları kontrol edin:

- Adres "https://" ile başlıyor mu?
- Adres çubuğunda kilit simgesi ya da "güvenli" göstergesi var mı?
- Sayfa farklı tarayıcıda ve telefonda da uyarısız açılıyor mu?
- "www" olan ve olmayan adres aynı yere, güvenli biçimde gidiyor mu?
- Sayfanın içindeki görseller ve dosyalar da HTTPS ile yükleniyor mu?

Son madde "karışık içerik" denen soruna işaret eder: Sayfa HTTPS ile açılır ama içindeki bir görsel HTTP ile yüklenirse tarayıcı sayfayı kısmen güvensiz gösterebilir. Bu durum görsel adreslerini düzeltmekle çözülür.

## Tarayıcı uyarısı çıkarsa

Siteniz için "Bağlantınız gizli değil" ya da "Güvenli değil" uyarısı çıkıyorsa şu olasılıkları değerlendirin:

- Sertifika süresi dolmuş olabilir
- Sertifika farklı bir alan adı için düzenlenmiş olabilir
- Alan adı yeni bağlandıysa sertifika henüz hazır olmayabilir
- Cihazınızın saati ya da tarihi yanlış olabilir
- Sitedeki bir bileşen güvensiz yüklenmiş olabilir

İlk adımda başka bir cihazdan ve başka bir bağlantıdan deneyin. Sorun sürüyorsa barındırma hizmetinizin destek ekibiyle iletişime geçin. Ziyaretçilerden gelen şikâyetleri ciddiye alın; "bende açılmıyor" diyen biri çoğu zaman gerçek bir sorunun habercisidir.

## Sertifika yenileme

Sertifikaların bir geçerlilik süresi vardır. Süresi dolan sertifika, sitenin bir anda uyarı vermesine neden olur. Otomatik yenileme sunan bir hizmet kullanıyorsanız bu çoğu zaman sessizce halledilir; ancak yine de ayda bir siteyi tarayıcıda açıp kontrol etmek yararlıdır. Elle yönettiğiniz bir sertifikanız varsa bitiş tarihini takvime yazın.

## HTTPS tek başına yeterli değil

HTTPS, güvenliğin yalnızca bir parçasıdır. Sitenizin yazılımını güncel tutmak, güçlü parolalar kullanmak, yönetim paneline giriş için ek doğrulama yöntemlerini değerlendirmek, yetkisiz kişilere erişim vermemek ve yedek almak da gereklidir. HTTPS'in "siteniz tamamen güvenlidir" anlamına geldiğini düşünmek, yanıltıcıdır. Güvenlik iddialarını abartmayın; "verileriniz şifreli iletilir" demek doğru, "yüzde yüz güvenli" demek ise vaat edilemeyecek bir ifadedir.

## Kısa kontrol listesi

- Sitem HTTPS ile açılıyor mu?
- Kilit simgesi ve uyarısız görünüm farklı cihazlarda aynı mı?
- "www" ve "www'suz" adres güvenli biçimde çalışıyor mu?
- Sayfa içindeki görseller güvenli yükleniyor mu?
- Sertifikanın yenilenme tarihi ya da otomatik yenileme durumunu biliyor muyum?
- Parolalarım güçlü ve yönetim erişimi sınırlı mı?

Özetle HTTPS, ziyaretçiye "bu bağlantı şifreli" diyen temel bir hijyen adımıdır. Kurması çoğu zaman kolaydır, kaybettirdiği ise bir uyarı kadar küçük ama etkili bir güven kaybıdır. Diğer rehberler için [blogu](/blog) ziyaret edin.`,
  },
  {
    slug: 'gizlilik-ve-kvkk-sayfasi-neden-gerekir',
    title: 'Gizlilik ve KVKK Sayfası Neden Gerekir?',
    excerpt:
      'Gizlilik ve kişisel verilerle ilgili bilgilendirmeleri açık, güncel ve işletmenin gerçek uygulamalarıyla uyumlu hazırlama rehberi.',
    category: 'guides',
    seoTitle: 'Gizlilik ve KVKK Sayfası Neden Gerekir?',
    seoDescription:
      'Web sitenizde gizlilik ve KVKK aydınlatma metni neden gerekir, neleri içermeli ve nasıl güncel tutulur? Genel bir rehber.',
    tags: ['gizlilik', 'KVKK', 'web sitesi'],
    body: `Bir iletişim formu koydunuz. Ziyaretçi adını, telefonunu ve mesajını yazıp gönderiyor. O an, farkında olmadan kişisel veri topluyorsunuz. Bir randevu sistemi, bülten kaydı, sipariş formu ya da hatta site istatistiklerini toplayan bir araç eklediğinizde de aynı durum geçerli. Kişisel veriyle çalışan her işletmenin, bu verileri nasıl kullandığını ziyaretçiye anlatması gerekir. Gizlilik ve KVKK sayfası bu anlatımın yapıldığı yerdir.

Bu yazı genel bilgi amaçlıdır ve hukuki tavsiye değildir. Kişisel verilerin korunması mevzuatı ayrıntılıdır ve işletmenizin durumuna göre değişir. Kendi metninizi hazırlarken yetkin bir uzmana danışmanız en sağlıklısıdır.

## Kişisel veri nedir?

Kişisel veri, bir kişiyi doğrudan ya da dolaylı olarak tanımlayan her türlü bilgidir. Ad, soyad, telefon, e-posta, adres, IP adresi, sipariş geçmişi, hatta bir fotoğraf bile kişisel veri sayılabilir. Küçük bir işletme için bile birçok işlem kişisel veri içerir: randevu defteri, müşteri kayıtları, kargo bilgisi, güvenlik kamerası görüntüsü.

## Aydınlatma metni neden gerekir?

Kişisel verisini paylaşan kişinin, bu verinin kim tarafından, hangi amaçla, hangi yolla toplandığı ve nasıl kullanıldığı hakkında bilgilendirilmesi gerekir. Bu bilgilendirmeye genellikle aydınlatma metni denir. Aydınlatma metninin yanı sıra, bir sitede gizlilik politikası ve çerez bilgilendirmesi gibi ilgili metinler de bulunabilir. Hangi metinlerin hangi durumlarda zorunlu olduğu ve nasıl hazırlanması gerektiği mevzuata ve işletmenin faaliyetine bağlıdır.

Bu metinler yalnızca yasal bir zorunluluk değil, aynı zamanda ziyaretçiye "verilerinize saygı duyuyoruz" mesajı verir. Açık yazılmış bir gizlilik sayfası, güveni artırır.

## Gizlilik sayfasında neler olmalı?

İyi bir gizlilik metni genellikle şu soruları cevaplar:

- **Kim topluyor?** İşletmenin adı ve iletişim bilgileri
- **Hangi veriler toplanıyor?** Ad, telefon, e-posta, adres, ödeme ve sipariş bilgisi, site kullanım verileri gibi
- **Neden toplanıyor?** Randevuyu yönetmek, siparişi teslim etmek, soruya cevap vermek gibi gerçek amaçlar
- **Nasıl toplanıyor?** İletişim formu, telefon, sipariş formu, çerezler gibi yollar
- **Kimlerle paylaşılıyor?** Kargo firması, ödeme hizmeti sağlayıcısı, barındırma hizmeti gibi gerçekten paylaşılan taraflar
- **Ne kadar süre saklanıyor?** Saklama süresi ya da süreyi belirleme ölçütü
- **Kişinin hakları neler?** Bilgi isteme, düzeltme, silme gibi haklar ve bunlar için başvuru yolu
- **Nasıl iletişime geçilir?** Bir e-posta adresi ya da başvuru kanalı

Metindeki her cümle işletmenizin gerçek uygulamasını yansıtmalı. Yapmadığınız bir korumayı yazmayın; kullanmadığınız bir aracı listelemeyin.

## Gerçek uygulamayla uyumlu olsun

En sık yapılan hata, başka bir sitenin metnini kopyalayıp yapıştırmaktır. Böyle bir metin sizin topladığınız verileri anlatmaz, yapmadığınız şeyleri vaat eder ve yaptığınız şeyleri atlayabilir. Önce kendi veri akışınızı çıkarın: Hangi formlar var? Hangi bilgiler isteniyor? Bu bilgiler nerede saklanıyor? Kim erişebiliyor? Hangi araçlar kullanılıyor? Sonra metni bu gerçeğe göre yazdırın ya da yazın.

Bir veri akışı tablosu bu işte çok işe yarar. Satırlara "iletişim formu: ad, telefon, mesaj, e-posta yoluyla bana ulaşıyor, yanıt verince siliyorum" gibi girişler yazın. Bu tablo hem metni yazmanızı kolaylaştırır hem de kendi uygulamanızı görmenizi sağlar.

## Gereksiz veri toplamayın

Veri toplamanın en güvenli yolu, gerçekten ihtiyaç duyduğunuzdan fazlasını istememektir. Bir iletişim formunda doğum tarihi sormak ya da bir bülten kaydında telefon istemek, çoğu zaman gerekli değildir. Her ek veri, korumanız gereken ek bir sorumluluktur. Formlarınıza bakın ve "bu alanı kaldırsam işim aksar mı?" diye sorun.

## Çerezler ve izleme araçları

Sitenizde bir istatistik aracı, reklam piksel kodu ya da harici bir bileşen kullanıyorsanız, bunlar ziyaretçi hakkında veri toplayabilir. Hangi araçların kullanıldığını bilin ve gizlilik metninde bunlara yer verin. Çerez kullanımı için, mevzuat gereği ziyaretçiden onay almak gerekebilir. Bu gereklilik kullandığınız araçlara göre değişir; bu nedenle sitenizde hangi çerezlerin kullanıldığını listeleyin ve bu konuda bir uzmandan destek alın.

## Sayfa nerede durmalı?

Gizlilik sayfasına her sayfadan kolayca ulaşılabilmeli. Genellikle sitenin alt bilgi bölümünde bir "Gizlilik ve KVKK" bağlantısı bulunur. Formların yanında da ilgili metne bir bağlantı verin: "Gönder'e basarak aydınlatma metnini okuduğunuzu kabul edersiniz" gibi. Bu bağlantıyı tıklayınca doğru sayfanın açıldığından emin olun.

## Güncel tutun

Gizlilik metni bir kere yazılıp unutulacak bir belge değildir. Yeni bir form, yeni bir araç ya da yeni bir hizmet eklediğinizde metni güncelleyin. İşletme adresi, e-posta ya da yetkili kişi değiştiyse metinde de değişmelidir. Metnin en altına son güncelleme tarihini yazmak, ziyaretçiye metnin canlı olduğunu gösterir.

## Veri güvenliği

Gizlilik metninde söz verdiğiniz korumayı gerçekte sağlamanız gerekir. Güçlü parolalar, güvenli bağlantı, erişim sınırlaması ve gereksiz kayıtların düzenli silinmesi temel adımlardır. Kişisel veri içeren bir tabloyu herkese açık bir paylaşım bağlantısıyla göndermeyin. Bir veri ihlali şüphesi yaşarsanız, ilgili mevzuattaki bildirim yükümlülüklerini incelemek ve bir uzmandan destek almak için gecikmeyin.

## Kontrol listesi

- Sitede hangi formlar ve araçlar kişisel veri topluyor, listeledim mi?
- Gizlilik ve aydınlatma metni gerçek uygulamamı yansıtıyor mu?
- Başka bir siteden kopyalanmış, bana uymayan bölümler kaldı mı?
- Gereksiz veri alanlarını kaldırdım mı?
- Çerez ve izleme araçları için gerekli bilgilendirme ve onay yapılandırıldı mı?
- Metne alt bilgiden ve formlardan ulaşılabiliyor mu?
- İletişim ve başvuru yolu çalışıyor mu?
- Metni bir uzmana kontrol ettirdim mi?

Gizlilik sayfası, ziyaretçiyle aranızdaki dürüstlük sözleşmesinin yazılı hâlidir. Dürüst ve güncel tuttuğunuzda hem müşteri güveninizi hem de kendinizi korursunuz. Diğer rehberler için [blogu](/blog) ziyaret edebilirsiniz.`,
  },
  {
    slug: 'google-da-gorunmenin-ilk-adimlari',
    title: 'Google’da Görünmenin İlk Adımları',
    excerpt:
      'Bir web sitesinin arama motorlarında anlaşılmasını destekleyen temel içerik, teknik kontrol ve güncelleme adımları.',
    category: 'guides',
    seoTitle: 'Google’da Görünmenin İlk Adımları',
    seoDescription:
      'Yeni bir web sitesinin Google’da bulunabilmesi için ilk adımlar: temel bilgiler, sayfa başlıkları, tutarlılık, hız ve düzenli güncelleme.',
    tags: ['Google', 'SEO başlangıcı', 'web sitesi'],
    body: `Siteyi yayımladınız, adresi arkadaşlarınıza gönderdiniz ve sonra merak ettiniz: Google'da işletmemin adını yazınca çıkacak mı, "yakınımdaki" aramalarında görünecek mi? Birçok kişi bu soruya "bir süre bekleyin" cevabı alır ve ardından hiçbir şey olmaz. Oysa arama motorlarında görünme, tamamen bekleme işi değildir; sitenizi anlaşılır kılmak için yapabileceğiniz somut adımlar vardır. Hiçbiri sonuç garantisi vermez; ama hepsi sitenizi daha iyi anlaşılır hâle getirir.

## Google nasıl çalışır, kısaca

Arama motorları, internetteki sayfaları robotlarla tarar, içeriğini okur ve bir dizine kaydeder. Biri bir şey aradığında, dizindeki sayfalardan aramaya en uygun görünenleri sıralar. Yeni bir site önce bulunmalı, sonra dizine alınmalı, sonra da sıralamaya girmelidir. Bu zaman alabilir; günler, haftalar hatta daha uzun sürebilir ve süre sitenize göre değişir. Hiç kimse belli bir sıralamayı vaat edemez.

## Adım 1: Sitenin herkese açık ve erişilebilir olduğundan emin olun

Önce siteniz yayında mı, farklı cihazlarda açılıyor mu, kontrol edin. Gizli ya da şifreli bir sayfa arama motorları tarafından görülemez. Sitenin arama motorlarını engelleyen bir ayara sahip olmadığından emin olun; yapım aşamasında bazı siteler "arama motorlarına gösterme" ayarıyla açılır ve bu ayar yayında unutulabilir. Yayımladığınız adresi bir gizli pencerede açıp kontrol edin.

## Adım 2: Google'a siteyi tanıtın

Google'ın sitenizi bulmasını kolaylaştırmak için Google Search Console gibi ücretsiz araçlardan yararlanabilirsiniz. Bu araçta sitenizi ekleyip sahipliğini doğrularsınız ve sitenizin site haritasını bildirebilirsiniz. Site haritası, sitenizdeki sayfaların listesidir. Araç ayrıca hangi sayfaların dizine alındığını ve varsa hangi hataların bulunduğunu da gösterir. Kurulum adımları zamanla değişebilir; güncel yönergeler için aracın kendi yardım sayfalarına bakın.

## Adım 3: Her sayfa tek bir konuyu anlatsın

Arama motorları ve ziyaretçiler, sayfanın ne hakkında olduğunu hızlıca anlamak ister. Her sayfa tek bir ana konuyu anlatmalı. Ana sayfa işletmenizi genel olarak tanıtır, hizmet sayfası tek bir hizmeti ayrıntılı anlatır, iletişim sayfası ulaşım bilgisini verir. Bir sayfaya birçok konuyu doldurmak her ikisini de bulanıklaştırır.

Başlıkları açık yazın. Sayfanın ana başlığı konuyu söylesin ve alt başlıklar içeriği mantıklı bölümlere ayırsın. Başlıkta işletmenizin ne yaptığı ve gerekiyorsa nerede çalıştığı yazsın. Sayfa başlığı ve açıklaması için [blogdaki meta başlık rehberine](/blog) göz atın.

## Adım 4: Bilgilerinizi her yerde tutarlı yazın

İşletmenizin adı, adresi ve telefonu sitede, Google İşletme Profilinde, sosyal medya hesaplarınızda ve varsa rehber sitelerinde aynı yazılmalı. Tutarsızlık, hem ziyaretçiyi hem arama motorunu şaşırtır. "Cad." ve "Caddesi" gibi küçük farkları bile birleştirin. Hizmet açıklamalarının farklı yerlerde birbiriyle çelişmediğinden emin olun.

## Adım 5: Google İşletme Profilini kurun

Yerel bir işletmeyseniz, Google İşletme Profili genellikle en değerli ücretsiz araçlardan biridir. Profili sahiplenip doğrulayın, bilgilerinizi doldurun, gerçek fotoğraflar ekleyin ve çalışma saatlerini güncel tutun. Detaylar için [yerel SEO rehberimize](/blog) bakabilirsiniz.

## Adım 6: Kullanıcı sorularına cevap veren içerik yazın

Arama motorları, ziyaretçinin sorusuna iyi cevap veren sayfaları öne çıkarmaya çalışır. Sayfalarınızı yazarken müşterilerinizin gerçek sorularını düşünün: Ne kadar sürer? Nasıl çalışır? Hangi bölgelere hizmet veriyorsunuz? Cevapları açık, kısa ve doğru yazın. Başka sitelerden kopyalanmış metin kullanmayın; kendi deneyiminizi ve işletmenize özgü bilgileri yazın.

## Adım 7: Siteyi hızlı ve mobil uyumlu tutun

Siteniz telefonda yavaş açılıyor ya da kullanımı zorsa, hem ziyaretçi kaybedersiniz hem de arama motorlarının değerlendirmesinde dezavantaj yaşayabilirsiniz. Görselleri küçültün, gereksiz araçları kaldırın ve siteyi kendi telefonunuzda gezin. Güvenli bağlantının (HTTPS) açık olduğundan da emin olun.

## Adım 8: Diğer sitelerden gelen doğal bağlantılar

Başka sitelerin sizin sitenize verdiği bağlantılar, sitenin tanındığını gösterebilir. Ancak bunları zorla ya da satın alarak edinmeye çalışmak risklidir ve platform kurallarına aykırı olabilir. Doğal yollar şunlardır: Yerel esnaf rehberlerine ve dernek sitelerine gerçek bilgilerle kaydolmak, iş ortaklarınızın sitesinde yer almak, yararlı içerikler hazırlayıp paylaşmak. Bu yol yavaştır ama sağlamdır.

## Adım 9: Sabırlı olun ve izleyin

Değişikliklerin arama sonuçlarına yansıması zaman alır. Search Console ya da benzeri bir araçtan hangi aramalarla bulunduğunuzu zamanla izleyin. Müşterilere "bizi nasıl buldunuz?" diye sormak da basit ve etkili bir ölçüttür. Haftalık küçük değişiklikler yapıp sonucu beklemeden her gün yeni bir şey denemek, neyin işe yaradığını anlamanızı zorlaştırır.

## Kaçınılması gerekenler

- Sıralama garantisi veren kişi ya da firmalara inanmak
- Anahtar kelimeyi her cümleye doldurmak
- Başkasının içeriğini kopyalamak
- Satın alınan bağlantılar ve sahte yorumlar
- Sitenin bir yerde gizli bırakılan metinler eklemek
- Güncel olmayan bilgileri sitede bırakmak

## Kontrol listesi

- Siteyi yayında ve arama motorlarına açık olarak doğruladım mı?
- Search Console gibi bir araçla siteyi tanıttım mı?
- Her sayfa tek bir konuyu anlatıyor mu?
- Adım, adres ve telefon her yerde tutarlı mı?
- Google İşletme Profilimi kurdum mu?
- Müşteri sorularına cevap veren içerikler yazdım mı?
- Site telefonda hızlı ve güvenli bağlantıyla açılıyor mu?
- Düzenli olarak içeriği güncelliyor ve sonuçları izliyor muyum?

Google'da görünmek bir yarış değil, bir birikimdir. Doğru, tutarlı ve güncel bir site zamanla anlaşılır hâle gelir; bunun garantisini kimse veremez ama doğru adımlar sizi doğru yöne götürür.`,
  },
]
