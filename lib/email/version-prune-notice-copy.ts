/**
 * Free/Starter notice sent BEFORE old, non-published site versions may ever be
 * deleted. Pure copy builder (no server imports) so it can be unit-tested.
 * Nothing in the codebase triggers the send; see `version-prune-notice.ts`.
 */

export type NoticeLang = 'tr' | 'en'

/** Deletion must not happen earlier than this many days after the notice. */
export const PRUNE_NOTICE_MIN_DAYS = 14

export type PruneNoticeInput = {
  lang: NoticeLang
  planName: 'FREE' | 'STARTER'
  /** First day deletion is allowed; must be at least PRUNE_NOTICE_MIN_DAYS after sending. */
  deleteAfter: Date
  upgradeUrl: string
}

export type PruneNoticeCopy = {
  subject: string
  previewText: string
  title: string
  paragraphs: string[]
  ctaLabel: string
  footer: string
}

export function earliestDeleteDate(sentAt: Date): Date {
  return new Date(sentAt.getTime() + PRUNE_NOTICE_MIN_DAYS * 24 * 60 * 60 * 1000)
}

function formatDate(date: Date, lang: NoticeLang): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

export function buildPruneNoticeCopy({ lang, planName, deleteAfter, upgradeUrl }: PruneNoticeInput): PruneNoticeCopy {
  const date = formatDate(deleteAfter, lang)
  if (lang === 'tr') {
    return {
      subject: 'Eski site sürümlerinizin saklanması hakkında bilgilendirme',
      previewText: `${date} tarihinden sonra eski taslak sürümleri silinebilir.`,
      title: 'Eski site sürümleri hakkında bilgilendirme',
      paragraphs: [
        `${planName} paketinizde, yayında olmayan eski site sürümleri artık süresiz saklanmayacak.`,
        `${date} tarihinden itibaren 30 günden eski ve yayında olmayan taslak sürümler silinebilir. Yayındaki siteniz ve yayın sürümü bu işlemden etkilenmez.`,
        'Saklamak istediğiniz bir sürüm varsa o tarihten önce siteyi yayınlayabilir veya PRO ya da E-Ticaret paketine geçebilirsiniz. Bu paketlerde günlük otomatik yedekleme ve sürüm geçmişi ile geri yükleme bulunur.',
      ],
      ctaLabel: 'Paketleri incele',
      footer: 'Bu e-posta, GLOVAL AI hesabınızdaki paket değişikliği nedeniyle gönderildi.',
    }
  }
  return {
    subject: 'Notice about how long old site versions are kept',
    previewText: `Old draft versions may be deleted after ${date}.`,
    title: 'A notice about old site versions',
    paragraphs: [
      `On your ${planName} plan, old site versions that are not published will no longer be kept indefinitely.`,
      `From ${date}, unpublished draft versions older than 30 days may be deleted. Your live site and its published version are not affected.`,
      'If you want to keep a version, you can publish the site before that date or move to the PRO or E-Commerce plan, which include daily automatic backups plus version history and restore.',
    ],
    ctaLabel: 'View plans',
    footer: 'You are receiving this email because of a plan change on your GLOVAL AI account.',
  }
}
