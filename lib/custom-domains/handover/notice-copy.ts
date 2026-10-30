/**
 * Domain handover notices. Pure copy builders (no server imports) so they can
 * be unit-tested. The former owner's notice never mentions the new owner and
 * vice versa.
 */

export type NoticeLang = 'tr' | 'en'
export type ReleaseMode = 'empty_handover' | 'keep_mailboxes_with_consent'

export type HandoverNoticeCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  bullets: string[]
  closing: string[]
  footer: string
}

export type HandoverNoticeInput = {
  lang: NoticeLang
  domain: string
  date: Date
  /** Short reference derived from the handover id. */
  ref: string
}

export function handoverRef(handoverId: string): string {
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

/** Email 1: the party that gives the domain up. */
export function buildFormerOwnerNotice({ lang, domain, date, ref }: HandoverNoticeInput): HandoverNoticeCopy {
  const when = formatDate(date, lang)
  if (lang === 'tr') {
    return {
      subject: `${domain} alan adı hesabınızdan devredildi`,
      previewText: `${domain} alan adı başka bir Gloval hesabına devredildi.`,
      title: `${domain} alan adı hesabınızdan devredildi`,
      paragraphs: [
        'Merhaba,',
        `${domain} alan adı, ${when} tarihinde Gloval yönetimi tarafından hesabınızdan başka bir Gloval hesabına devredildi.`,
        'Bu işlemin sonuçları:',
      ],
      bullets: [
        'Alan adı artık hesabınızda görünmez ve sizin tarafınızdan yönetilemez.',
        'Bu alan adına bağlı web siteniz bu alan adından yayından kalkar. Siteniz silinmez; Gloval adresinden veya başka bir alan adıyla yayınlamaya devam edebilirsiniz.',
        'Bu alan adına bağlı e-posta kutuları durduruldu. Bu adrese gelen e-postalar artık hesabınıza ulaşmaz.',
        'Kutulardaki verilerin yedeklenmesi eski sahibin sorumluluğundadır. Gloval, bu verileri saklama veya size geri verme taahhüdü vermez.',
      ],
      closing: [
        'Bu işlemin size ait olmadığını veya bir hata olduğunu düşünüyorsanız, lütfen destek ekibimize yazın ve aşağıdaki referans numarasını belirtin.',
        `İşlem referansı: ${ref}`,
      ],
      footer: 'Gloval Ekibi',
    }
  }
  return {
    subject: `${domain} has been transferred out of your account`,
    previewText: `${domain} was transferred to another Gloval account.`,
    title: `${domain} has been transferred out of your account`,
    paragraphs: [
      'Hello,',
      `The domain ${domain} was transferred from your account to another Gloval account by Gloval administration on ${when}.`,
      'What this means:',
    ],
    bullets: [
      'The domain no longer appears in your account and can no longer be managed by you.',
      'Your website connected to this domain is taken offline on this domain. Your website itself is not deleted; you can keep publishing it on your Gloval address or on another domain.',
      'Email mailboxes connected to this domain have been suspended. Emails sent to this address will no longer reach your account.',
      'Backing up the data in those mailboxes is the former owner’s responsibility. Gloval makes no commitment to retain this data or to return it to you.',
    ],
    closing: [
      'If you did not expect this or believe it is a mistake, please contact our support team and quote the reference below.',
      `Reference: ${ref}`,
    ],
    footer: 'The Gloval Team',
  }
}

/** Email 2: the party that receives the domain. */
export function buildNewOwnerNotice({ lang, domain, date, ref }: HandoverNoticeInput): HandoverNoticeCopy {
  const when = formatDate(date, lang)
  if (lang === 'tr') {
    return {
      subject: `${domain} alan adı hesabınıza eklendi`,
      previewText: `${domain} alan adı hesabınıza devredildi.`,
      title: `${domain} alan adı hesabınıza eklendi`,
      paragraphs: [
        'Merhaba,',
        `${domain} alan adı, ${when} tarihinde Gloval yönetimi tarafından hesabınıza devredildi. Alan adını hesabınızdaki alan adları sayfasında görebilirsiniz.`,
        'Bilmeniz gerekenler:',
      ],
      bullets: [
        'Web sitesi: Alan adı şu anda hiçbir siteye bağlı değil. Hazır olduğunuzda istediğiniz sitenize bağlayabilirsiniz.',
        'E-posta: Güvenlik nedeniyle bu alan adının e-posta hizmeti inceleme altında ve şu an kapalı. Bu süre boyunca e-posta kutusu oluşturamaz ve bu alan adına e-posta alamazsınız. İnceleme tamamlandığında ayrıca haber vereceğiz.',
      ],
      closing: [
        'Bu devri beklemiyorsanız veya bir hata olduğunu düşünüyorsanız, lütfen destek ekibimize yazın ve aşağıdaki referans numarasını belirtin.',
        `İşlem referansı: ${ref}`,
      ],
      footer: 'Gloval Ekibi',
    }
  }
  return {
    subject: `${domain} has been added to your account`,
    previewText: `${domain} was transferred to your account.`,
    title: `${domain} has been added to your account`,
    paragraphs: [
      'Hello,',
      `The domain ${domain} was transferred to your account by Gloval administration on ${when}. You can see it on the domains page of your account.`,
      'What you should know:',
    ],
    bullets: [
      'Website: The domain is not connected to any website right now. You can connect it to the website of your choice when you are ready.',
      'Email: For security reasons, email service for this domain is under review and currently turned off. During this time you cannot create mailboxes and cannot receive email on this domain. We will let you know once the review is complete.',
    ],
    closing: [
      'If you were not expecting this transfer or believe it is a mistake, please contact our support team and quote the reference below.',
      `Reference: ${ref}`,
    ],
    footer: 'The Gloval Team',
  }
}

/** Email 3: the new owner, once the quarantine is lifted. */
export function buildReleasedNotice(
  input: HandoverNoticeInput & { mode: ReleaseMode },
): HandoverNoticeCopy {
  const { lang, domain, mode } = input
  const keep = mode === 'keep_mailboxes_with_consent'
  if (lang === 'tr') {
    return {
      subject: `${domain} için e-posta hizmeti açıldı`,
      previewText: `${domain} için e-posta hizmeti artık kullanılabilir.`,
      title: `${domain} için e-posta hizmeti açıldı`,
      paragraphs: [
        'Merhaba,',
        keep
          ? `${domain} alan adı için e-posta hizmeti incelemeyi tamamladı ve açıldı. Alan adında önceki kullanımdan kalan e-posta kutuları bulunuyor; bu kutular ve içerikleri, önceki sahibin onayıyla size açıldı. Kutuları e-posta sayfanızdan görebilir ve yönetebilirsiniz. Kutulara erişmeden önce şifrelerini yenilemenizi öneririz.`
          : `${domain} alan adı için e-posta hizmeti incelemeyi tamamladı ve açıldı. Alan adı e-posta kutusu içermeden, boş olarak teslim edildi. Yeni kutular oluşturabilirsiniz.`,
      ],
      bullets: [],
      closing: [`İşlem referansı: ${input.ref}`],
      footer: 'Gloval Ekibi',
    }
  }
  return {
    subject: `Email service is now available for ${domain}`,
    previewText: `Email service is now available for ${domain}.`,
    title: `Email service is now available for ${domain}`,
    paragraphs: [
      'Hello,',
      keep
        ? `The review is complete and email service is now available for ${domain}. The domain contains mailboxes left from previous use; these mailboxes and their contents were made available to you with the previous owner’s consent. You can view and manage them on your email page. We recommend resetting their passwords before use.`
        : `The review is complete and email service is now available for ${domain}. The domain was handed over with no mailboxes. You can create new mailboxes.`,
    ],
    bullets: [],
    closing: [`Reference: ${input.ref}`],
    footer: 'The Gloval Team',
  }
}
