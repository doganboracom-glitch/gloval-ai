import 'server-only'

import { renderEmailLayout, escape } from '@/lib/email/layout'
import { recordNotification, sendTransactionalEmail } from '@/lib/notify'
import {
  PRUNE_NOTICE_MIN_DAYS,
  buildPruneNoticeCopy,
  earliestDeleteDate,
  type NoticeLang,
} from '@/lib/email/version-prune-notice-copy'

export type SendPruneNoticeInput = {
  userId: string | null
  to: string
  lang: NoticeLang
  planName: 'FREE' | 'STARTER'
  /** Defaults to the earliest allowed date (now + PRUNE_NOTICE_MIN_DAYS). Earlier dates are rejected. */
  deleteAfter?: Date
  now?: Date
}

/**
 * Sends the Free/Starter notice. Intentionally NOT wired to any cron, route or
 * action: deletion stays disabled until an operator calls this for every
 * affected user and at least PRUNE_NOTICE_MIN_DAYS have passed.
 */
export async function sendVersionPruneNotice(input: SendPruneNoticeInput): Promise<boolean> {
  const now = input.now ?? new Date()
  const earliest = earliestDeleteDate(now)
  const deleteAfter = input.deleteAfter ?? earliest
  if (deleteAfter.getTime() < earliest.getTime()) {
    throw new Error(`deleteAfter must be at least ${PRUNE_NOTICE_MIN_DAYS} days after the notice`)
  }

  const copy = buildPruneNoticeCopy({
    lang: input.lang,
    planName: input.planName,
    deleteAfter,
    upgradeUrl: 'https://gloval.ai/#pricing',
  })
  const body = copy.paragraphs.map((p) => `<p style="margin:0 0 14px;">${escape(p)}</p>`).join('')
  const html = renderEmailLayout({
    lang: input.lang,
    previewText: copy.previewText,
    title: copy.title,
    body,
    cta: { label: copy.ctaLabel, href: 'https://gloval.ai/#pricing' },
    footer: copy.footer,
  })
  const text = `${copy.title}\n\n${copy.paragraphs.join('\n\n')}\n\n${copy.footer}`

  const sent = await sendTransactionalEmail({ to: input.to, subject: copy.subject, html, text })
  await recordNotification({
    userId: input.userId,
    channel: 'email',
    type: 'version_prune_notice',
    subject: copy.subject,
    body: copy.paragraphs.join('\n'),
    status: sent ? 'sent' : 'failed',
  })
  return sent
}
