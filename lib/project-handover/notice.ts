import 'server-only'

import { renderEmailLayout, escape } from '@/lib/email/layout'
import { sendTransactionalEmailDetailed } from '@/lib/notify'
import {
  buildFormerOwnerSiteNotice,
  buildNewOwnerSiteNotice,
  type NoticeLang,
  type ProjectNoticeCopy,
} from './notice-copy'

export type ProjectNoticeKind = 'former_owner' | 'new_owner'

export type SendProjectNoticeInput = {
  kind: ProjectNoticeKind
  handoverId: string
  to: string
  lang: NoticeLang
  siteName: string
  ref: string
  date?: Date
}

export function renderProjectHandoverNotice(input: SendProjectNoticeInput): {
  subject: string
  html: string
  text: string
  copy: ProjectNoticeCopy
} {
  const base = { lang: input.lang, siteName: input.siteName, date: input.date ?? new Date(), ref: input.ref }
  const copy = input.kind === 'former_owner' ? buildFormerOwnerSiteNotice(base) : buildNewOwnerSiteNotice(base)

  const paragraph = (p: string) => `<p style="margin:0 0 14px;">${escape(p)}</p>`
  const list = copy.bullets.length
    ? `<ul style="margin:0 0 14px;padding-left:20px;">${copy.bullets
        .map((b) => `<li style="margin:0 0 8px;">${escape(b)}</li>`)
        .join('')}</ul>`
    : ''
  const html = renderEmailLayout({
    lang: input.lang,
    previewText: copy.previewText,
    title: copy.title,
    body: `${copy.paragraphs.map(paragraph).join('')}${list}${copy.closing.map(paragraph).join('')}`,
    footer: copy.footer,
  })
  const text = [
    copy.title,
    ...copy.paragraphs,
    ...copy.bullets.map((b) => `- ${b}`),
    ...copy.closing,
    copy.footer,
  ].join('\n\n')
  return { subject: copy.subject, html, text, copy }
}

/** The Idempotency-Key is derived from the handover id and kind, so a retried send never delivers twice. */
export async function sendProjectHandoverNotice(input: SendProjectNoticeInput): Promise<boolean> {
  const { subject, html, text } = renderProjectHandoverNotice(input)
  const result = await sendTransactionalEmailDetailed({
    to: input.to,
    subject,
    html,
    text,
    idempotencyKey: `project-handover:${input.handoverId}:${input.kind}`,
  })
  return result.ok
}
