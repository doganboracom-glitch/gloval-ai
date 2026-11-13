/**
 * Site handover notices. Pure copy builders (no server imports) so they can be unit-tested.
 * The former owner's notice never mentions the new owner and vice versa.
 */

export type NoticeLang = 'tr' | 'en'

export type ProjectNoticeCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  bullets: string[]
  closing: string[]
  footer: string
}

export type ProjectNoticeInput = {
  lang: NoticeLang
  siteName: string
  date: Date
  ref: string
}

export function projectHandoverRef(handoverId: string): string {
  return handoverId.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function formatDate(date: Date, lang: NoticeLang): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function buildFormerOwnerSiteNotice({ lang, siteName, date, ref }: ProjectNoticeInput): ProjectNoticeCopy {
  const when = formatDate(date, lang)
  if (lang === 'tr') {
    return {
      subject: `${siteName} sitesi hesabınızdan devredildi`,
      previewText: `${siteName} sitesi başka bir Gloval hesabına devredildi.`,
      title: `${siteName} sitesi hesabınızdan devredildi`,
      paragraphs: [
        'Merhaba,',
        `${siteName} sitesi, ${when} tarihinde Gloval yönetimi tarafından hesabınızdan başka bir Gloval hesabına devredildi.`,
        'Bu işlemin sonuçları:',
      ],
      bullets: [
        'Site artık hesabınızda görünmez ve sizin tarafınızdan düzenlenemez.',
        'Siteye bağlı mağaza verileri (ürünler, siparişler, ödeme ayarları) siteyle birlikte yeni sahibine geçti.',
        'Hesabınızın faturaları, destek kayıtları ve diğer siteleriniz bu işlemden etkilenmez.',
      ],
      closing: [
        'Bu işlemin size ait olmadığını veya bir hata olduğunu düşünüyorsanız, lütfen destek ekibimize yazın ve aşağıdaki referans numarasını belirtin.',
        `İşlem referansı: ${ref}`,
      ],
      footer: 'Gloval Ekibi',
    }
  }
  return {
    subject: `${siteName} has been transferred out of your account`,
    previewText: `${siteName} was transferred to another Gloval account.`,
    title: `${siteName} has been transferred out of your account`,
    paragraphs: [
      'Hello,',
      `On ${when}, the Gloval team transferred the site ${siteName} from your account to another Gloval account.`,
      'What this means:',
    ],
    bullets: [
      'The site no longer appears in your account and you can no longer edit it.',
      'Its store data (products, orders, payment settings) moved with it to the new owner.',
      'Your invoices, support history and other sites are not affected.',
    ],
    closing: [
      'If you believe this was a mistake, please contact our support team and quote the reference below.',
      `Reference: ${ref}`,
    ],
    footer: 'The Gloval Team',
  }
}

export function buildNewOwnerSiteNotice({ lang, siteName, date, ref }: ProjectNoticeInput): ProjectNoticeCopy {
  const when = formatDate(date, lang)
  if (lang === 'tr') {
    return {
      subject: `${siteName} sitesi hesabınıza devredildi`,
      previewText: `${siteName} sitesi artık Gloval hesabınızda.`,
      title: `${siteName} sitesi hesabınıza devredildi`,
      paragraphs: [
        'Merhaba,',
        `${siteName} sitesi, ${when} tarihinde Gloval yönetimi tarafından hesabınıza devredildi.`,
        'Neler sizinle birlikte geldi:',
      ],
      bullets: [
        'Sitenin tamamı: sayfalar, tasarım ve içerikler.',
        'Mağaza siteleri için ürünler, siparişler ve ödeme ayarları.',
        'Siteye tanımlı ek özellikler (varsa).',
      ],
      closing: [
        'Siteyi panelinizdeki Siteler bölümünden düzenleyebilir ve yayınlayabilirsiniz. Yayın hakkı, hesabınızın paketine göre sayılır.',
        `İşlem referansı: ${ref}`,
      ],
      footer: 'Gloval Ekibi',
    }
  }
  return {
    subject: `${siteName} has been transferred to your account`,
    previewText: `${siteName} is now in your Gloval account.`,
    title: `${siteName} has been transferred to your account`,
    paragraphs: [
      'Hello,',
      `On ${when}, the Gloval team transferred the site ${siteName} to your account.`,
      'What came with it:',
    ],
    bullets: [
      'The whole site: pages, design and content.',
      'For stores: products, orders and payment settings.',
      'Add-on features attached to the site, if any.',
    ],
    closing: [
      'You can edit and publish it from the Sites section of your dashboard. Publishing counts against your plan allowance.',
      `Reference: ${ref}`,
    ],
    footer: 'The Gloval Team',
  }
}
