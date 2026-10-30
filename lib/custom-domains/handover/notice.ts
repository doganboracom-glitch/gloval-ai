import 'server-only'

import { renderEmailLayout, escape } from '@/lib/email/layout'
import { sendTransactionalEmailDetailed } from '@/lib/notify'
import {
  buildFormerOwnerNotice,
  buildNewOwnerNotice,
  buildReleasedNotice,
  type HandoverNoticeCopy,
  type NoticeLang,
  type ReleaseMode,
} from './notice-copy'

export type NoticeKind = 'former_owner' | 'new_owner' | 'released'

export type SendHandoverNoticeInput = {
  kind: NoticeKind
  handoverId: string
  to: string
  lang: NoticeLang
  domain: string
  ref: string
  date?: Date
  mode?: ReleaseMode
}

/** Pure render step, exported so tests can inspect the exact payload. */
export function renderHandoverNotice(input: SendHandoverNoticeInput): {
  subject: string
  html: string
  text: string
  copy: HandoverNoticeCopy
} {
  const base = { lang: input.lang, domain: input.domain, date: input.date ?? new Date(), ref: input.ref }
  const copy =
    input.kind === 'former_owner'
      ? buildFormerOwnerNotice(base)
      : input.kind === 'new_owner'
        ? buildNewOwnerNotice(base)
        : buildReleasedNotice({ ...base, mode: input.mode ?? 'empty_handover' })

  const paragraph = (p: string) => `<p style="margin:0 0 14px;">${escape(p)}</p>`
  const list = copy.bullets.length
    ? `<ul style="margin:0 0 14px;padding-left:20px;">${copy.bullets
        .map((b) => `<li style="margin:0 0 8px;">${escape(b)}</li>`)
        .join('')}</ul>`
    : ''
  const lead = copy.paragraphs.map(paragraph).join('')
  const tail = copy.closing.map(paragraph).join('')

  const html = renderEmailLayout({
    lang: input.lang,
    previewText: copy.previewText,
    title: copy.title,
    body: `${lead}${list}${tail}`,
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

/**
 * Sends one handover notice. The Idempotency-Key is derived from the handover
 * id and the notice kind, so a retried send can never deliver twice.
 */
export async function sendHandoverNotice(input: SendHandoverNoticeInput): Promise<boolean> {
  const { subject, html, text } = renderHandoverNotice(input)
  const result = await sendTransactionalEmailDetailed({
    to: input.to,
    subject,
    html,
    text,
    idempotencyKey: `handover:${input.handoverId}:${input.kind}`,
  })
  return result.ok
}
