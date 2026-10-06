import type { FaqItem } from './types'

/**
 * FAQ source of truth.
 *
 * Answers describe only what the product actually does today. Absolute claims
 * ("unlimited", "guaranteed", "instant", "everything free") are avoided on
 * purpose: they are the kind of copy that turns into a support ticket.
 *
 * The first seven entries are `featured` and appear on the homepage.
 */
const items: FaqItem[] = [
  {
    id: 'what-is-gloval',
    featured: true,
    question: {
      tr: 'GLOVAL AI nedir?',
      en: 'What is GLOVAL AI?',
    },
    answer: {
      tr: 'GLOVAL AI, ne tür bir web sitesi istediğinizi normal cümlelerle anlattığınızda sizin için çalışan bir web sitesi oluşturan bir yapay zeka platformudur. Oluşan siteyi düzenleyebilir, yayınlayabilir ve dilediğiniz zaman güncelleyebilirsiniz.',
      en: 'GLOVAL AI is an AI platform that builds a working website for you from a plain-language description of what you need. You can then edit the result, publish it, and update it whenever you want.',
    },
  },
  {
    id: 'no-code-needed',
    featured: true,
    question: {
      tr: 'Kodlama veya tasarım bilmem gerekiyor mu?',
      en: 'Do I need to know how to code or design?',
    },
    answer: {
      tr: 'Hayır. Ne istediğinizi kendi cümlelerinizle yazmanız yeterli. Metinleri, renkleri ve bölümleri panelden düzenleyebilirsiniz; HTML veya CSS yazmanız gerekmez.',
      en: 'No. Describing what you want in your own words is enough. You can edit copy, colors, and sections from the panel without writing any HTML or CSS.',
    },
  },
  {
    id: 'how-long',
    featured: true,
    question: {
      tr: 'Web sitemi ne kadar sürede oluşturabilirim?',
      en: 'How quickly can I build my website?',
    },
    answer: {
      tr: 'İlk taslak genellikle birkaç dakika içinde hazır olur. Sonrasında içeriği ve tasarımı ne kadar detaylandırmak istediğinize bağlı olarak düzenlemeye devam edebilirsiniz.',
      en: 'A first draft is usually ready within a few minutes. After that, how long you spend depends on how much you want to refine the content and design.',
    },
  },
  {
    id: 'free-start',
    featured: true,
    question: {
      tr: 'Ücretsiz başlayabilir miyim?',
      en: 'Can I start for free?',
    },
    answer: {
      tr: 'Evet. Başlangıç planıyla kredi kartı girmeden deneyebilirsiniz. Alan adı bağlama ve kurumsal e-posta gibi özellikler ücretli planlarda sunulur; planları Fiyatlar bölümünden karşılaştırabilirsiniz.',
      en: 'Yes. You can try it on the Starter plan without entering a card. Features such as custom domains and business email are part of the paid plans — you can compare them in the Pricing section.',
    },
  },
  {
    id: 'domain-and-email',
    featured: true,
    question: {
      tr: 'Kendi alan adımı ve kurumsal e-postamı kullanabilir miyim?',
      en: 'Can I use my own domain and business email?',
    },
    answer: {
      tr: 'Ücretli planlarda kendi alan adınızı panelden bağlayabilirsiniz. Bağladıktan sonra size verilen DNS kayıtlarını alan adı sağlayıcınızda tanımlayıp doğrulama adımını tamamlarsınız. Alan adı doğrulandıktan sonra o alan adı üzerinde kurumsal e-posta adresleri oluşturabilirsiniz.',
      en: 'On paid plans you can connect your own domain from the dashboard. After connecting it, you add the DNS records we show you at your domain provider and complete the verification step. Once the domain is verified, you can create business email addresses on it.',
    },
  },
  {
    id: 'edit-and-unpublish',
    featured: true,
    question: {
      tr: 'Web sitemi daha sonra düzenleyebilir ve yayından kaldırabilir miyim?',
      en: 'Can I edit my site later and take it offline?',
    },
    answer: {
      tr: 'Evet. Siteniz yayına alındıktan sonra da düzenleyebilir, değişiklikleri yeniden yayınlayabilir veya siteyi tamamen yayından kaldırabilirsiniz. Yayından kaldırdığınızda taslağınız panelde kalmaya devam eder.',
      en: 'Yes. You can keep editing after publishing, republish your changes, or take the site offline entirely. Unpublishing leaves your draft in place in the dashboard.',
    },
  },
  {
    id: 'site-types',
    featured: true,
    question: {
      tr: 'Hangi tür web sitelerini oluşturabilirim?',
      en: 'What kinds of websites can I build?',
    },
    answer: {
      tr: 'Kurumsal tanıtım siteleri, hizmet ve portföy siteleri, tek sayfalık tanıtım sayfaları ve ürün satışı yapan e-ticaret siteleri oluşturabilirsiniz. İhtiyacınızı yazarken sektörünüzü belirtmeniz sonucun size daha yakın olmasını sağlar.',
      en: 'You can build corporate sites, service and portfolio sites, single-page landing pages, and e-commerce sites that sell products. Mentioning your sector in the prompt gets you a closer starting point.',
    },
  },
  {
    id: 'change-later',
    featured: false,
    question: {
      tr: 'Web sitemi daha sonra değiştirebilir miyim?',
      en: 'Can I change my website later?',
    },
    answer: {
      tr: 'Evet. Bölümleri yeniden düzenleyebilir, metinleri ve görselleri güncelleyebilir, yeni bölümler ekleyebilirsiniz. Ayrıca yapay zekaya yeni bir istek yazarak mevcut sitenizi güncelletebilirsiniz.',
      en: 'Yes. You can rearrange sections, update copy and images, and add new sections. You can also describe a new request to the AI to update your existing site.',
    },
  },
  {
    id: 'unpublish-republish',
    featured: false,
    question: {
      tr: 'Web sitemi yayından kaldırıp tekrar yayınlayabilir miyim?',
      en: 'Can I unpublish and then republish my website?',
    },
    answer: {
      tr: 'Evet. Yayından kaldırdığınızda site ziyaretçiler tarafından erişilemez hale gelir, ancak taslağınız korunur. Hazır olduğunuzda tekrar yayınlayabilirsiniz; siteniz aynı adres üzerinden yayına döner.',
      en: 'Yes. Unpublishing makes the site unreachable for visitors while your draft is preserved. When you are ready you can publish again, and the site returns on the same address.',
    },
  },
  {
    id: 'mobile-friendly',
    featured: false,
    question: {
      tr: 'GLOVAL AI mobil uyumlu web siteleri oluşturur mu?',
      en: 'Does GLOVAL AI build mobile-friendly websites?',
    },
    answer: {
      tr: 'Evet. Oluşturulan siteler masaüstü, tablet ve mobil ekranlara uyum sağlayacak şekilde tasarlanır. Düzenleme panelindeki görünüm seçenekleriyle sitenizi farklı ekran boyutlarında önizleyebilirsiniz.',
      en: 'Yes. Generated sites are designed to adapt to desktop, tablet, and mobile screens. You can preview your site at different screen sizes using the viewport options in the editor.',
    },
  },
  {
    id: 'seo',
    featured: false,
    question: {
      tr: 'SEO açısından web sitemi geliştirebilir miyim?',
      en: 'Can I improve my website for SEO?',
    },
    answer: {
      tr: 'Sayfa başlıklarını, açıklamalarını ve içerik metinlerini düzenleyerek arama motorları için iyileştirme yapabilirsiniz. Sıralama sonuçları sektörünüze ve rekabete bağlı olduğundan belirli bir sıra garanti edilmez.',
      en: 'You can improve your pages for search engines by editing titles, descriptions, and body copy. Ranking outcomes depend on your sector and competition, so no specific position is guaranteed.',
    },
  },
  {
    id: 'multiple-sites',
    featured: false,
    question: {
      tr: 'Birden fazla web sitesi oluşturabilir miyim?',
      en: 'Can I create more than one website?',
    },
    answer: {
      tr: 'Evet, panelde birden fazla proje oluşturabilirsiniz. Aynı anda kaç proje ve yayında site tutabileceğiniz planınıza göre değişir; güncel sınırları Fiyatlar bölümünde görebilirsiniz.',
      en: 'Yes, you can create multiple projects in the dashboard. How many projects and live sites you can keep at once depends on your plan — current limits are listed in the Pricing section.',
    },
  },
  {
    id: 'upgrade-plan',
    featured: false,
    question: {
      tr: 'Ücretli paketimi daha sonra yükseltebilir miyim?',
      en: 'Can I upgrade my plan later?',
    },
    answer: {
      tr: 'Evet. Planınızı faturalandırma sayfasından yükseltebilirsiniz. Yükseltme sonrasında yeni planın özellikleri hesabınızda kullanılabilir hale gelir.',
      en: 'Yes. You can upgrade from the billing page, and the new plan’s features become available on your account after the upgrade.',
    },
  },
  {
    id: 'ecommerce',
    featured: false,
    question: {
      tr: 'E-ticaret sitesi oluşturabilir miyim?',
      en: 'Can I build an e-commerce site?',
    },
    answer: {
      tr: 'Evet. Ürün ekleyebileceğiniz, ürün detay sayfaları ve sepet akışı bulunan bir mağaza oluşturabilirsiniz. Ödeme altyapısı ve yasal gereklilikler için kendi ülkenizdeki koşulları kontrol etmenizi öneririz.',
      en: 'Yes. You can build a store with products, product detail pages, and a cart flow. We recommend checking the payment and legal requirements that apply in your own country.',
    },
  },
  {
    id: 'domain-email-details',
    featured: false,
    question: {
      tr: 'Alan adı ve kurumsal e-posta özellikleri nasıl çalışır?',
      en: 'How do the domain and business email features work?',
    },
    answer: {
      tr: 'Alan adınızı panelden bağladığınızda size eklemeniz gereken DNS kayıtları gösterilir. Bu kayıtları alan adı sağlayıcınızda tanımlayıp doğrulamayı tamamladıktan sonra alan adı kullanıma hazır olur. Doğrulanmış bir alan adı üzerinde, planınızın izin verdiği sayıda kurumsal e-posta adresi oluşturabilirsiniz.',
      en: 'When you connect a domain from the dashboard, we show you the DNS records to add. Once you have created those records at your domain provider and completed verification, the domain is ready to use. On a verified domain you can create as many business email addresses as your plan allows.',
    },
  },
]

/** All FAQ entries, in display order. */
export function getFaqItems(): FaqItem[] {
  return items
}

/** The curated subset shown on the homepage. */
export function getFeaturedFaqItems(): FaqItem[] {
  return items.filter((item) => item.featured)
}
