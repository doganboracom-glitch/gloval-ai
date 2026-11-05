-- UNAPPLIED: platform blog category and article data for the iyzico collaboration.
-- Do not apply to the live database as part of this change.

begin;

insert into public.platform_blog_categories (slug, name, description, sort_order)
values (
  'isbirligi',
  'İşbirliği',
  'GLOVAL AI iş ortaklıkları ve duyuruları.',
  7
)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order;

with category as (
  select id
  from public.platform_blog_categories
  where slug = 'isbirligi'
)
insert into public.platform_blog_posts (
  slug,
  title,
  excerpt,
  body,
  category_id,
  tags,
  cover_url,
  cover_alt,
  seo_title,
  meta_description,
  status,
  published_at,
  author_name,
  reading_time,
  language,
  noindex,
  featured,
  translations,
  created_at,
  updated_at
)
select
  'iyzico-gloval-ai-isbirligi-e-ticaret-websiteni-bugun-kur',
  'iyzico × GLOVAL AI İşbirliği: E-Ticaret Websiteni Bugün Kur',
  'GLOVAL AI ve iyzico işbirliğiyle e-ticaret mağazanı yapay zekâ destekli bir taslakla oluştur, ürünlerini ekle ve ödeme alma adımlarını incele.',
  $body$
GLOVAL AI ile iyzico, e-ticaret mağazasını çevrimiçi kurmak ve müşterilerinden ödeme almak isteyen işletmeler için yeni bir işbirliği başlattı. Amaç, mağaza hazırlığını ve ödeme adımını tek bir yolculukta buluşturmak: GLOVAL AI yapay zekâ ile ilk mağaza taslağını oluşturmana yardımcı olur; sen taslağı düzenleyip ürünlerini eklersin; iyzico ile ödeme seçeneğini bağlarsın. Hesap başvurusu, işletme uygunluğu ve ödeme koşulları iyzico’nun kendi süreçlerine ve anlaşma şartlarına tabidir.

İşbirliğinin duyurusu, mağaza kurmak isteyen işletmeler için iki ayrı işi sadeleştirmeye odaklanıyor. Bir yanda site taslağını sıfırdan kurmadan hazırlamak, diğer yanda ürünleri ve alışveriş akışını tamamladıktan sonra online ödeme alabilmek var. Hizmetin gerçek kullanımı için GLOVAL AI hesabı, mağaza içeriği ve iyzico hesabı gerekir; bu adımların tamamlanma süresi işletmenin hazırlığına ve ilgili sağlayıcının süreçlerine göre değişir.

## Mağazanı yapay zekâ ile dakikalar içinde hazırla

GLOVAL AI’da ana sayfadaki kurulum alanına işletmeni, hedef kitleni ve satacağın ürünleri yazarak ilk taslağı oluşturabilirsin. Yapay zekâ, mağazanın temel sayfa yapısını ve içerik başlangıcını dakikalar içinde hazırlar; taslağın son hâli için ürün bilgilerini, marka dilini, görselleri, teslimat ve iade bilgilerini senin kontrol edip düzenlemen gerekir. AI taslağı bir başlangıç noktasıdır; mağazanın hazır olduğunu veya satış yapacağını tek başına garanti etmez.

E-Ticaret paketinin ürün, sepet ve mağaza yönetimi kapsamını [fiyatlandırma sayfasında](/#pricing) inceleyebilir; doğrudan [e-ticaret kurulum alanına](/#hero-input) giderek ilk mağaza taslağını oluşturmaya başlayabilirsin.

## iyzico ile ödeme ve %2.29 duyurusu

İşbirliği kapsamında paylaşılan duyuruda “iyzico ile ödeme: %2.29 işlem oranı*” ifadesi yer alıyor. Dipnot, bu oranı “7 gün vadede %2.29” olarak açıklıyor. Ayrıntılar iyzico ile yapılan anlaşma koşullarına tabidir. Başvuru, hesap onayı, vade ve işlem koşullarını ödeme almaya başlamadan önce iyzico’dan doğrula. Bu metin tüm mağazalar için aynı koşulların geçerli olduğu, başvurunun kabul edileceği veya satışların belirli bir seviyeye ulaşacağı yönünde bir taahhüt değildir.

## Mağazanı açmak için dört adım

- **Kayıt ol.** GLOVAL AI hesabını aç ve giriş adımlarını tamamla. Mağaza bilgilerini hazırlarken işletme adını, iletişim kanalını ve satış yaptığın alanı doğru gir.
- **Mağazanı oluştur.** Ana sayfadaki kurulum alanına işletmeni ve hedefini yaz; yapay zekânın oluşturduğu ilk taslağı incele. Menüleri, sayfa metinlerini, marka görünümünü ve iletişim bilgilerini kendi bilgilerinle güncelle.
- **Ürünlerini ekle.** Her ürün için anlaşılır bir ad, açıklama, doğru fiyat, görsel ve gerekiyorsa varyant veya stok bilgisini ekle. Kategorileri düzenle; ürün detayında teslimat, iade ve satış şartlarını netleştir. Eksik bilgileri yayın öncesinde kontrol et.
- **iyzico ile ödeme almayı hazırla.** Mağaza yönetimindeki ödeme ayarlarından iyzico’yu seç ve bağlantı adımlarını izle. Gerekli hesap, işletme doğrulaması veya başvuru adımları için iyzico yönergelerini takip et. Ödeme yönteminin etkin olduğunu ve sepetten ödeme akışını test ettikten sonra mağazayı yayınla.

## Sık sorulan sorular

### iyzico ile ödeme almak için ne yapmalıyım?

GLOVAL AI mağazandaki ödeme ayarlarından iyzico bağlantısını seçip ekrandaki adımları izle. Gerekli hesap başvurusu, işletme bilgileri ve doğrulama süreci iyzico tarafından yürütülür; mağazanı yayınlamadan önce bağlantının etkin olduğunu ve ödeme akışının doğru çalıştığını kontrol et.

### %2.29 oranı tüm mağazalar için geçerli mi?

Duyuruda oran “7 gün vadede %2.29” dipnotuyla paylaşılıyor. Uygunluk, hesap onayı ve geçerli koşullar için iyzico ile yapılan anlaşmayı incele; bu yazı her mağaza için aynı oranın geçerli olacağını taahhüt etmez.

### Mağaza ve ürün bilgileri otomatik tamamlanıyor mu?

Yapay zekâ ilk taslağı hazırlamaya yardımcı olur; ürün adları, fiyatlar, stok, görseller ve teslimat bilgilerini senin ekleyip doğrulaman gerekir. Yayına almadan önce mağazayı ve ödeme adımını kendin test et.

* 7 gün vadede %2.29. Ayrıntılar iyzico ile yapılan anlaşma koşullarına tabidir.
$body$,
  category.id,
  array['iyzico', 'GLOVAL AI', 'e-ticaret sitesi kurma', 'online ödeme', 'e-ticaret ödeme'],
  '/blog/isbirligi/blog-cover-isbirligi-1600x900.png',
  'İndirim etiketi taşıyan çevrimiçi mağaza ve ödeme kartı illüstrasyonu',
  'iyzico × GLOVAL AI İşbirliği: E-Ticaret Mağazanı Kur',
  'GLOVAL AI ile e-ticaret mağazanı yapay zekâ desteğiyle dakikalar içinde oluştur. iyzico ile ödeme adımları ve 7 gün vadede %2.29 duyurusu.',
  'published',
  '2026-11-05T00:00:00+03:00',
  'GLOVAL AI',
  3,
  'tr',
  false,
  false,
  '{}'::jsonb,
  '2026-11-05T00:00:00+03:00',
  '2026-11-05T00:00:00+03:00'
from category
on conflict (slug) do update
set title = excluded.title,
    excerpt = excluded.excerpt,
    body = excluded.body,
    category_id = excluded.category_id,
    tags = excluded.tags,
    cover_url = excluded.cover_url,
    cover_alt = excluded.cover_alt,
    seo_title = excluded.seo_title,
    meta_description = excluded.meta_description,
    status = excluded.status,
    published_at = excluded.published_at,
    author_name = excluded.author_name,
    reading_time = excluded.reading_time,
    language = excluded.language,
    noindex = excluded.noindex,
    featured = excluded.featured,
    translations = excluded.translations;

commit;
