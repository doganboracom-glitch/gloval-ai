import type { AuthState } from '@/lib/supabase/auth-state'
import { getFaqAnswerText, type FaqItem, type Localized } from './types'

/**
 * FAQ source of truth.
 *
 * Answers describe only what the product actually does today. Absolute claims
 * ("unlimited", "guaranteed", "instant", "everything free") are avoided on
 * purpose: they are the kind of copy that turns into a support ticket.
 *
 * Homepage entries are explicitly marked `featured`.
 */
export const FAQ_SUPPORT_COPY: Localized<{
  before: string
  link: string
  after: string
}> = {
  tr: {
    before: 'Yukarıda aradığınızı bulamadıysanız lütfen',
    link: 'DESTEK',
    after: 'talebi açınız.',
  },
  en: {
    before: 'If you couldn’t find what you were looking for above, please submit a',
    link: 'support',
    after: 'request.',
  },
  de: {
    before: 'Wenn Sie oben keine Antwort gefunden haben, erstellen Sie bitte eine',
    link: 'Supportanfrage',
    after: '.',
  },
  fr: {
    before: 'Si vous n’avez pas trouvé ce que vous cherchiez ci-dessus, veuillez créer une',
    link: 'demande de support',
    after: '.',
  },
  es: {
    before: 'Si no encontraste lo que buscabas arriba, abre una',
    link: 'solicitud de soporte',
    after: '.',
  },
  it: {
    before: 'Se non hai trovato ciò che cercavi qui sopra, apri una',
    link: 'richiesta di supporto',
    after: '.',
  },
}

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
      tr: 'İlk taslak, ihtiyacınızı normal cümlelerle anlattığınızda oluşturulur. Sonrasında metin ve tasarımı dilediğiniz gibi gözden geçirip düzenleyebilirsiniz.',
      en: 'A first draft is created from your plain-language description. You can then review and refine the content and design as needed.',
    },
  },
  {
    id: 'site-ready',
    featured: true,
    question: {
      tr: 'Site ne kadar sürede hazır olur?',
      en: 'How long does it take to get a site ready?',
      de: 'Wie lange dauert es, bis die Website fertig ist?',
      fr: 'Combien de temps faut-il pour que le site soit prêt ?',
      es: '¿Cuánto tarda en estar listo el sitio?',
      it: 'Quanto tempo serve perché il sito sia pronto?',
    },
    answer: {
      tr: 'Dakikalar içinde. Ne istediğini anlatırsın, yapay zekâ taslağı hazırlar; düzenleyip tek tıkla yayınlarsın.',
      en: 'In minutes. Describe what you want; the AI prepares a draft that you can edit and publish with one click.',
      de: 'In wenigen Minuten. Beschreibe, was du brauchst; die KI erstellt einen Entwurf, den du bearbeiten und mit einem Klick veröffentlichen kannst.',
      fr: 'En quelques minutes. Décrivez ce que vous souhaitez ; l’IA prépare un brouillon que vous pouvez modifier et publier en un clic.',
      es: 'En cuestión de minutos. Describe lo que necesitas; la IA prepara un borrador que puedes editar y publicar con un solo clic.',
      it: 'In pochi minuti. Descrivi ciò che ti serve; l’IA prepara una bozza che puoi modificare e pubblicare con un clic.',
    },
  },
  {
    id: 'site-ownership',
    featured: true,
    question: {
      tr: 'Siten ve içeriğin kime ait?',
      en: 'Who owns my website and its content?',
      de: 'Wem gehören meine Website und ihre Inhalte?',
      fr: 'À qui appartiennent mon site et son contenu ?',
      es: '¿A quién pertenecen mi sitio y su contenido?',
      it: 'A chi appartengono il mio sito e i suoi contenuti?',
    },
    answer: {
      tr: 'Siten ve içeriğin sana aittir. Yayınladığın içeriklerin hukuka uygunluğundan ve doğruluğundan site sahibi sorumludur.',
      en: 'Your website and its content belong to you. As the site owner, you are responsible for the legality and accuracy of what you publish.',
      de: 'Deine Website und ihre Inhalte gehören dir. Als Website-Inhaber bist du für die Rechtmäßigkeit und Richtigkeit der veröffentlichten Inhalte verantwortlich.',
      fr: 'Votre site et son contenu vous appartiennent. En tant que propriétaire du site, vous êtes responsable de la légalité et de l’exactitude des contenus publiés.',
      es: 'El sitio y su contenido te pertenecen. Como titular del sitio, eres responsable de la legalidad y exactitud del contenido que publiques.',
      it: 'Il tuo sito e i suoi contenuti ti appartengono. In qualità di proprietario del sito, sei responsabile della legalità e dell’accuratezza dei contenuti pubblicati.',
    },
    answerLink: {
      target: { kind: 'url', href: '/yasal/kullanim-kosullari' },
      prefix: {
        tr: 'Ayrıntılar için',
        en: 'For details, see',
        de: 'Weitere Informationen findest du in den',
        fr: 'Pour en savoir plus, consultez les',
        es: 'Para más información, consulta los',
        it: 'Per i dettagli, consulta i',
      },
      label: {
        tr: 'Kullanım Koşulları',
        en: 'Terms of Use',
        de: 'Nutzungsbedingungen',
        fr: 'Conditions d’utilisation',
        es: 'Términos de uso',
        it: 'Termini di utilizzo',
      },
      suffix: {
        tr: '.',
        en: '.',
        de: '.',
        fr: '.',
        es: '.',
        it: '.',
      },
    },
  },
  {
    id: 'ai-review',
    featured: true,
    question: {
      tr: 'Yapay zekâ hata yaparsa ne olur?',
      en: 'What if the AI makes a mistake?',
      de: 'Was passiert, wenn die KI einen Fehler macht?',
      fr: 'Que se passe-t-il si l’IA fait une erreur ?',
      es: '¿Qué pasa si la IA se equivoca?',
      it: 'Cosa succede se l’IA commette un errore?',
    },
    answer: {
      tr: 'Yapay zekâ taslak hazırlar; yayınlamadan önce metin ve görselleri incelemek ve düzenlemek sana aittir.',
      en: 'AI creates a draft; reviewing and editing the text and images before publishing is your responsibility.',
      de: 'Die KI erstellt einen Entwurf; du bist dafür verantwortlich, Texte und Bilder vor der Veröffentlichung zu prüfen und zu bearbeiten.',
      fr: 'L’IA prépare un brouillon ; il vous appartient de vérifier et de modifier les textes et les images avant publication.',
      es: 'La IA prepara un borrador; antes de publicar, te corresponde revisar y editar los textos y las imágenes.',
      it: 'L’IA prepara una bozza; spetta a te controllare e modificare testi e immagini prima della pubblicazione.',
    },
    answerLink: {
      target: { kind: 'support' },
      prefix: {
        tr: 'Takıldığın yerde',
        en: 'If you get stuck, you can submit a',
        de: 'Wenn du Hilfe brauchst, kannst du eine',
        fr: 'Si vous avez besoin d’aide, vous pouvez ouvrir une',
        es: 'Si necesitas ayuda, puedes abrir una',
        it: 'Se hai bisogno di aiuto, puoi aprire una',
      },
      label: {
        tr: 'DESTEK',
        en: 'support',
        de: 'Supportanfrage',
        fr: 'demande de support',
        es: 'solicitud de soporte',
        it: 'richiesta di supporto',
      },
      suffix: {
        tr: 'talebi açabilirsin.',
        en: 'request.',
        de: 'stellen.',
        fr: '.',
        es: '.',
        it: '.',
      },
    },
  },
  {
    id: 'legal-templates',
    featured: true,
    question: {
      tr: 'KVKK ve yasal metinler dahil mi?',
      en: 'Are KVKK and legal texts included?',
      de: 'Sind KVKK- und Rechtstexte enthalten?',
      fr: 'Les textes juridiques et le KVKK sont-ils inclus ?',
      es: '¿Se incluyen textos legales y KVKK?',
      it: 'Sono inclusi i testi legali e il KVKK?',
    },
    answer: {
      tr: 'Gizlilik, KVKK, çerez ve mesafeli satış gibi hazır yasal metin şablonları sunulur; kendi işine göre gözden geçirmen gerekir.',
      en: 'Ready-made legal text templates are available for privacy, KVKK, cookies, distance sales, and similar topics; you should review them for your own business.',
      de: 'Vorlagen für Rechtstexte zu Themen wie Datenschutz, KVKK, Cookies und Fernabsatz sind verfügbar; du solltest sie für dein eigenes Unternehmen prüfen.',
      fr: 'Des modèles de textes juridiques sur la confidentialité, le KVKK, les cookies et la vente à distance sont proposés ; vous devez les examiner pour votre activité.',
      es: 'Hay plantillas de textos legales sobre privacidad, KVKK, cookies y venta a distancia; debes revisarlas para tu propio negocio.',
      it: 'Sono disponibili modelli di testi legali su privacy, KVKK, cookie e vendite a distanza; dovresti esaminarli per la tua attività.',
    },
  },
  {
    id: 'cancel-anytime',
    featured: true,
    question: {
      tr: 'İstediğim zaman iptal edebilir miyim?',
      en: 'Can I cancel at any time?',
      de: 'Kann ich jederzeit kündigen?',
      fr: 'Puis-je résilier à tout moment ?',
      es: '¿Puedo cancelar en cualquier momento?',
      it: 'Posso annullare in qualsiasi momento?',
    },
    answer: {
      tr: 'Evet, istediğin zaman iptal edebilirsin.',
      en: 'Yes, you can cancel at any time.',
      de: 'Ja, du kannst jederzeit kündigen.',
      fr: 'Oui, vous pouvez résilier à tout moment.',
      es: 'Sí, puedes cancelar en cualquier momento.',
      it: 'Sì, puoi annullare in qualsiasi momento.',
    },
    answerLink: {
      target: { kind: 'url', href: '/yasal/iptal-ve-iade' },
      prefix: {
        tr: 'Koşulların ayrıntısı için',
        en: 'For details on the terms, see',
        de: 'Einzelheiten zu den Bedingungen findest du auf der Seite',
        fr: 'Pour connaître les conditions, consultez la page',
        es: 'Para conocer las condiciones, consulta la página',
        it: 'Per conoscere le condizioni, consulta la pagina',
      },
      label: {
        tr: 'İptal ve İade',
        en: 'Cancellation and Refunds',
        de: 'Kündigung und Rückerstattung',
        fr: 'Résiliation et remboursements',
        es: 'Cancelaciones y reembolsos',
        it: 'Annullamenti e rimborsi',
      },
      suffix: {
        tr: 'sayfasına bak.',
        en: '.',
        de: '.',
        fr: '.',
        es: '.',
        it: '.',
      },
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
      tr: 'Evet. Başlangıç planıyla kredi kartı girmeden deneyebilirsiniz. Ücretsiz yayında adres: ad.gloval.site. Alan adı bağlama ve kurumsal e-posta gibi özellikler ücretli planlarda sunulur; planları Fiyatlar bölümünden karşılaştırabilirsiniz.',
      en: 'Yes. You can try it on the Starter plan without entering a card. The free published address is ad.gloval.site. Features such as custom domains and business email are part of paid plans — compare them in the Pricing section.',
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

/** Resolve support navigation without another client-side auth lookup. */
export function getFaqSupportHref(authKind: AuthState['kind']): string {
  return authKind === 'authenticated' ? '/support/new' : '/iletisim'
}

/** FAQPage JSON-LD is generated from the same localized content as the UI. */
export function getFaqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question.tr,
      acceptedAnswer: { '@type': 'Answer', text: getFaqAnswerText(item, 'tr') },
    })),
  }
}
