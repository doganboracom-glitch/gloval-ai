import type { Check, EditCase } from './evaluate'
import { digits, hueOf, primaryHex, sectionOf, visibleMenu } from './fixtures'

const has = (re: RegExp, list: string[]) => list.some((s) => re.test(s))
const idx = (site: { sections: { type: string }[] }, type: string) => site.sections.findIndex((s) => s.type === type)
const ok = (label: string, pass: boolean): Check => ({ label, pass })

const MENU_PATHS = ['pages', 'navigation.links']
const SECTION_PATHS = ['sections']

/**
 * 30 common Turkish editing commands. Each case states the user-visible
 * effect that must exist afterwards (not a particular JSON shape), so a
 * different-but-valid implementation still passes.
 */
export const CASES: EditCase[] = [
  // --- Menü ---------------------------------------------------------------
  {
    id: 'menu-add-blog', category: 'Menü', fixture: 'clinic', kind: 'change',
    instruction: 'Menüye Blog ekle',
    expected: 'Görünen menüde "Blog" öğesi (çok sayfalı sitede pages başlığı)',
    allowed: [...MENU_PATHS, 'sections'],
    checks: (_b, a) => [ok('menüde Blog var', has(/blog/i, visibleMenu(a)))],
  },
  {
    id: 'menu-remove-services', category: 'Menü', fixture: 'clinic', kind: 'change',
    instruction: 'Hizmetler\'i üst menüden kaldır',
    expected: 'Menüde Hizmetler yok; Hizmetler bölümü silinmemiş',
    allowed: MENU_PATHS,
    checks: (_b, a) => [
      ok('menüde Hizmetler yok', !has(/hizmet/i, visibleMenu(a))),
      ok('services bölümü duruyor', !!sectionOf(a, 'services') && !sectionOf(a, 'services')?.hidden),
    ],
  },
  // --- Buton ------------------------------------------------------------
  {
    id: 'button-text', category: 'Buton', fixture: 'clinic', kind: 'change',
    instruction: 'Hero birincil buton metnini "Hemen Ara" yap',
    expected: 'hero.primaryButton.label = "Hemen Ara"',
    allowed: ['sections.0.primaryButton'],
    checks: (_b, a) => [ok('hero butonu Hemen Ara', sectionOf(a, 'hero')?.primaryButton?.label === 'Hemen Ara')],
  },
  {
    id: 'button-color', category: 'Buton', fixture: 'clinic', kind: 'change',
    instruction: 'Randevu Al butonunu kırmızı yap',
    expected: 'Butonlarda renk alanı yok: tek yol ana (primary) renk kırmızıya yakın olmalı',
    allowed: ['theme.palette'],
    checks: (_b, a) => {
      const hs = hueOf(primaryHex(a))
      return [ok('primary kırmızı tonda', !!hs && hs.s > 0.35 && (hs.h < 20 || hs.h > 340))]
    },
  },
  // --- Hero -------------------------------------------------------------
  {
    id: 'hero-title', category: 'Hero', fixture: 'clinic', kind: 'change',
    instruction: 'Hero başlığını "Gülüşünüzü Yeniden Keşfedin" yap',
    expected: 'hero.title = "Gülüşünüzü Yeniden Keşfedin"',
    allowed: ['sections.0.title'],
    checks: (_b, a) => [ok('hero başlığı değişti', sectionOf(a, 'hero')?.title?.trim() === 'Gülüşünüzü Yeniden Keşfedin')],
  },
  // --- Bölüm ekle / sil / gizle / sırala ----------------------------------
  {
    id: 'section-add-testimonials', category: 'Bölüm', fixture: 'clinic', kind: 'change',
    instruction: 'Referanslar bölümü ekle',
    expected: 'Yeni bir testimonials bölümü',
    allowed: SECTION_PATHS,
    checks: (_b, a) => [ok('testimonials bölümü var', !!sectionOf(a, 'testimonials'))],
  },
  {
    id: 'section-remove-process', category: 'Bölüm', fixture: 'clinic', kind: 'change',
    instruction: 'Süreç bölümünü sil',
    expected: 'process bölümü kalmaz, diğerleri durur',
    allowed: SECTION_PATHS,
    checks: (b, a) => [
      ok('process yok', !sectionOf(a, 'process')),
      ok('yalnız bir bölüm eksildi', a.sections.length === b.sections.length - 1),
    ],
  },
  {
    id: 'section-hide-faq', category: 'Bölüm', fixture: 'clinic', kind: 'change',
    instruction: 'SSS bölümünü gizle',
    expected: 'faq.hidden = true (silinmeden)',
    allowed: SECTION_PATHS,
    checks: (_b, a) => [ok('faq gizli ve duruyor', sectionOf(a, 'faq')?.hidden === true)],
  },
  {
    id: 'section-reorder', category: 'Bölüm', fixture: 'clinic', kind: 'change',
    instruction: 'SSS bölümünü Hizmetler bölümünün üstüne taşı',
    expected: 'faq, services\'ten önce; bölüm sayısı aynı',
    allowed: SECTION_PATHS,
    checks: (b, a) => [
      ok('faq services\'ten önce', idx(a, 'faq') !== -1 && idx(a, 'faq') < idx(a, 'services')),
      ok('bölüm sayısı korundu', a.sections.length === b.sections.length),
    ],
  },
  // --- Görsel (yalnız niyet tespiti; görsel üretilmez) ---------------------
  {
    id: 'image-hero', category: 'Görsel', fixture: 'clinic', kind: 'change', imageTarget: 'hero',
    instruction: 'Hero görselini yeniden oluştur',
    expected: 'Görsel hattı hero hedefini çözer (üretim bu araçta çalıştırılmaz)',
  },
  {
    id: 'image-product', category: 'Görsel', fixture: 'store', kind: 'change', imageTarget: 'section',
    instruction: 'Ürünlerdeki ilk fotoğrafı değiştir',
    expected: 'Görsel hattı products bölümünün ilk ögesini çözer',
  },
  {
    id: 'image-logo', category: 'Görsel', fixture: 'clinic', kind: 'change', imageTarget: 'logo',
    instruction: 'Logomu yeniden oluştur',
    expected: 'Görsel hattı logo hedefini çözer',
  },
  // --- İletişim ---------------------------------------------------------
  {
    id: 'contact-phone', category: 'İletişim', fixture: 'clinic', kind: 'change',
    instruction: 'Telefon numarasını 0532 111 22 33 yap',
    expected: 'contact.phone 532 111 22 33',
    allowed: ['sections', 'contactActions'],
    checks: (_b, a) => [ok('telefon güncel', digits(sectionOf(a, 'contact')?.phone).endsWith('5321112233'))],
  },
  {
    id: 'contact-whatsapp', category: 'İletişim', fixture: 'clinic', kind: 'change',
    instruction: 'WhatsApp numarasını 0555 444 33 22 yap',
    expected: 'contactActions.whatsapp 555 444 33 22',
    allowed: ['contactActions', 'sections'],
    checks: (_b, a) => [ok('whatsapp güncel', digits(a.contactActions?.whatsapp).endsWith('5554443322'))],
  },
  {
    id: 'contact-email', category: 'İletişim', fixture: 'clinic', kind: 'change',
    instruction: 'E-posta adresini info@dentaklinik.com yap',
    expected: 'contact.email = info@dentaklinik.com',
    allowed: ['sections'],
    checks: (_b, a) => [ok('e-posta güncel', sectionOf(a, 'contact')?.email === 'info@dentaklinik.com')],
  },
  {
    id: 'contact-address', category: 'İletişim', fixture: 'clinic', kind: 'change',
    instruction: 'Adresi Moda Cad. No:12 Kadıköy İstanbul olarak değiştir',
    expected: 'contact.address "Moda Cad. No:12 …"',
    allowed: ['sections'],
    checks: (_b, a) => [ok('adres güncel', /moda cad/i.test(sectionOf(a, 'contact')?.address ?? ''))],
  },
  // --- Sosyal medya ------------------------------------------------------
  {
    id: 'social-instagram', category: 'Sosyal medya', fixture: 'clinic', kind: 'change',
    instruction: 'Instagram hesabı ekle: instagram.com/dentaklinik',
    expected: 'social.instagram dentaklinik bağlantısını içerir',
    allowed: ['social'],
    checks: (_b, a) => [ok('instagram kayıtlı', /dentaklinik/i.test(a.social?.instagram ?? ''))],
  },
  // --- Tema / yazı tipi ----------------------------------------------------
  {
    id: 'theme-green', category: 'Renk', fixture: 'clinic', kind: 'change',
    instruction: 'Renk temasını yeşil yap',
    expected: 'primary yeşil tonda (hue 90–170)',
    allowed: ['theme'],
    checks: (_b, a) => {
      const hs = hueOf(primaryHex(a))
      return [ok('primary yeşil', !!hs && hs.s > 0.25 && hs.h >= 90 && hs.h <= 170)]
    },
  },
  {
    id: 'typography', category: 'Yazı tipi', fixture: 'clinic', kind: 'change',
    instruction: 'Yazı tipini Playfair Display yap',
    expected: 'typography başlık veya gövde yazı tipi Playfair Display',
    allowed: ['typography'],
    checks: (_b, a) => [ok('Playfair seçili', /playfair/i.test(`${a.typography.headingFont} ${a.typography.bodyFont}`))],
  },
  // --- Sayfa -------------------------------------------------------------
  {
    id: 'page-add', category: 'Sayfa', fixture: 'clinic', kind: 'change',
    instruction: 'Hakkımızda sayfası ekle',
    expected: 'pages içinde Hakkımızda',
    allowed: [...MENU_PATHS, 'sections'],
    checks: (_b, a) => [ok('Hakkımızda sayfası var', has(/hakk/i, a.pages.map((p) => p.title)))],
  },
  {
    id: 'page-rename', category: 'Sayfa', fixture: 'clinic', kind: 'change',
    instruction: 'Hizmetler sayfasının adını Tedaviler yap',
    expected: 'services sayfasının başlığı "Tedaviler"',
    allowed: [...MENU_PATHS],
    checks: (_b, a) => [ok('sayfa adı Tedaviler', a.pages.find((p) => p.slug === 'services')?.title === 'Tedaviler')],
  },
  // --- Alt bilgi / SSS ----------------------------------------------------
  {
    id: 'footer-copyright', category: 'Alt bilgi', fixture: 'clinic', kind: 'change',
    instruction: 'Alt bilgideki telif yazısını "© 2026 Diş Kliniği. Tüm hakları saklıdır." yap',
    expected: 'footer.copyright güncel',
    allowed: ['sections'],
    checks: (_b, a) => [ok('telif güncel', sectionOf(a, 'footer')?.copyright === '© 2026 Diş Kliniği. Tüm hakları saklıdır.')],
  },
  {
    id: 'faq-add', category: 'SSS', fixture: 'clinic', kind: 'change',
    instruction: 'SSS\'ye "Sigorta kabul ediyor musunuz?" sorusunu ekle',
    expected: 'faq.items içinde sigorta sorusu',
    allowed: ['sections'],
    checks: (b, a) => {
      const items = sectionOf(a, 'faq')?.items ?? []
      return [
        ok('sigorta sorusu var', items.some((i) => /sigorta/i.test(i.question))),
        ok('eski sorular korundu', items.length >= (sectionOf(b, 'faq')?.items.length ?? 0) + 1),
      ]
    },
  },
  // --- Fiyat / ürün (mağaza kataloğu panelden yönetilir) -----------------
  {
    id: 'store-price', category: 'Fiyat/ürün', fixture: 'store', kind: 'no-change',
    instruction: 'İlk ürünün fiyatını ₺1.299 yap',
    expected: 'Katalog panelden yönetilir: şema değişmemeli, kullanıcı panele yönlendirilmeli',
  },
  // --- Çeviri / SEO -------------------------------------------------------
  {
    id: 'translate-en', category: 'Çeviri', fixture: 'clinic', kind: 'change',
    instruction: 'Tüm site metinlerini İngilizceye çevir',
    expected: 'Hero ve menü İngilizce; meta.language = en',
    allowed: ['meta', 'sections', 'navigation', 'pages', 'theme', 'typography'],
    checks: (_b, a) => {
      const hero = sectionOf(a, 'hero')
      return [
        ok('hero başlığı İngilizce', !!hero && !/[çğıöşüÇĞİÖŞÜ]/.test(hero.title) && hero.title.length > 3),
        ok('meta.language en', a.meta.language === 'en'),
      ]
    },
  },
  {
    id: 'seo-title', category: 'SEO', fixture: 'clinic', kind: 'change',
    instruction: 'SEO başlığını "Kadıköy İmplant ve Diş Estetiği" yap',
    expected: 'meta.seoTitle = "Kadıköy İmplant ve Diş Estetiği"',
    allowed: ['meta.seoTitle'],
    checks: (_b, a) => [ok('seoTitle güncel', a.meta.seoTitle === 'Kadıköy İmplant ve Diş Estetiği')],
  },
  // --- Belirsiz -----------------------------------------------------------
  {
    id: 'ambiguous-better', category: 'Belirsiz', fixture: 'clinic', kind: 'no-change',
    instruction: 'Daha güzel yap',
    expected: 'Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli',
  },
  {
    id: 'ambiguous-this', category: 'Belirsiz', fixture: 'clinic', kind: 'no-change',
    instruction: 'Bunu değiştir',
    expected: 'Hedef belirsiz: değişiklik yapmadan netleştirme istenmeli',
  },
  // --- Desteklenmeyen -----------------------------------------------------
  {
    id: 'unsupported-hosting', category: 'Desteklenmeyen', fixture: 'clinic', kind: 'no-change',
    instruction: 'Sitenin sunucusunu İstanbul\'a taşı',
    expected: 'Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli',
  },
  {
    id: 'unsupported-membership', category: 'Desteklenmeyen', fixture: 'clinic', kind: 'no-change',
    instruction: 'Kullanıcı girişi ve üyelik sistemi ekle',
    expected: 'Şema dışı istek: dürüstçe uygulanamadığı söylenmeli, şema değişmemeli',
  },
]
