import 'server-only'

import { escape, renderEmailLayout, renderEmailPlainText, type EmailLang } from '@/lib/email/layout'
import type { DraftReminderKind } from './core'

const SITE_URL = 'https://gloval.ai'

type Copy = { subject: string; body: string }

const COPY: Record<EmailLang, Record<DraftReminderKind, Copy>> = {
  tr: {
    d7: {
      subject: 'Taslak siteniz için yardım ister misiniz?',
      body: 'Bir hafta önce site taslağı oluşturdunuz, çalışmanız kayıtlı. Takıldığınız bir nokta varsa destek ekibimiz yardımcı olur. Aşağıdaki düğmeyle kaldığınız yerden devam edebilirsiniz.',
    },
    d30: {
      subject: 'Taslağınız hâlâ burada, bizi unutmayın',
      body: 'Bir aydır görüşemedik. Taslağınız olduğu gibi duruyor. Birkaç dakika ayırıp kaldığınız yerden devam edebilirsiniz. Takıldığınız bir yer olursa destek ekibimize yazın.',
    },
    m6: {
      subject: 'Sizi unutmadık',
      body: 'Altı ay oldu, taslağınız hesabınızda hâlâ duruyor. Fikriniz değişmiş olabilir, sorun değil: taslağınıza devam edebilir ya da yeni bir site başlatabilirsiniz.',
    },
    m12: {
      subject: 'Yarım bıraktığınız çalışma bizim için değerli',
      body: 'Taslak halinde bıraktığınız çalışma bizim için değerli, tamamlamanızı umuyoruz. Bu, size göndereceğimiz son hatırlatma. Taslağınız hesabınızda durmaya devam ediyor.',
    },
  },
  en: {
    d7: {
      subject: 'Would you like help with your draft site?',
      body: 'You created a site draft a week ago and your work is saved. If you got stuck anywhere, our support team can help. Use the button below to pick up where you left off.',
    },
    d30: {
      subject: 'Your draft is still here',
      body: 'It has been a month since we last heard from you. Your draft is exactly as you left it. Take a few minutes to pick up where you stopped, and write to our support team if you get stuck.',
    },
    m6: {
      subject: 'We have not forgotten you',
      body: 'It has been six months and your draft is still in your account. You may have changed your mind, and that is fine: you can continue your draft or start a new site.',
    },
    m12: {
      subject: 'The work you left unfinished matters to us',
      body: 'The draft you left behind matters to us and we hope you will finish it. This is the last reminder we will send. Your draft stays in your account.',
    },
  },
}

const LABELS: Record<
  EmailLang,
  { resume: string; support: string; ecommerce: string; footer: string; stop: string; stopText: string; preview: string }
> = {
  tr: {
    resume: 'Taslağıma devam et',
    support: 'Destek Ekibine Yaz',
    ecommerce:
      'E-ticaret mağazalarını yayınlamak için E-Ticaret paketi gerekir. Düzenlemelerinizi paket almadan tamamlayabilirsiniz.',
    footer: 'Bu e-posta, hesabınızdaki taslak siteyle ilgili bir hizmet bildirimidir.',
    stop: 'Bu hatırlatmaları durdur',
    stopText: 'Bu hatırlatmaları durdur:',
    preview: 'Taslak siteniz hesabınızda kayıtlı.',
  },
  en: {
    resume: 'Continue my draft',
    support: 'Contact Support',
    ecommerce:
      'Publishing an online store requires the E-Commerce package. You can finish your edits without buying a package.',
    footer: 'This email is a service notice about the draft site in your account.',
    stop: 'Stop these reminders',
    stopText: 'Stop these reminders:',
    preview: 'Your draft site is saved in your account.',
  },
}

function withUtm(path: string, kind: DraftReminderKind): string {
  const url = new URL(path, SITE_URL)
  url.searchParams.set('utm_source', 'email')
  url.searchParams.set('utm_medium', 'lifecycle')
  url.searchParams.set('utm_campaign', 'draft_reminder')
  url.searchParams.set('utm_content', kind)
  return url.toString()
}

export type DraftReminderEmailInput = {
  kind: DraftReminderKind
  lang: EmailLang
  projectId: string
  isEcommerce: boolean
  /** Absolute opt-out URL (signed token); never carries UTM parameters. */
  unsubscribeUrl: string
}

export function buildDraftReminderEmail(input: DraftReminderEmailInput): { subject: string; html: string; text: string } {
  const { kind, lang, projectId, isEcommerce, unsubscribeUrl } = input
  const copy = COPY[lang][kind]
  const labels = LABELS[lang]
  const editorUrl = withUtm(`/editor/${encodeURIComponent(projectId)}`, kind)
  const supportUrl = withUtm('/support/new', kind)

  const ecommerceHtml = isEcommerce
    ? `<p style="margin:14px 0 0;color:#6b6473;font-size:14px;">${escape(labels.ecommerce)}</p>`
    : ''
  const body = `<p style="margin:0;">${escape(copy.body)}</p>${ecommerceHtml}`
  const stopHtml = `<a class="link" href="${escape(unsubscribeUrl)}" style="color:#6d43bd;text-decoration:underline;">${escape(labels.stop)}</a>`

  const html = renderEmailLayout({
    lang,
    previewText: labels.preview,
    title: copy.subject,
    body,
    cta: { label: labels.resume, href: editorUrl },
    secondaryCta: { label: labels.support, href: supportUrl },
    footer: labels.footer,
    footerExtraHtml: stopHtml,
  })

  const textParts = [
    copy.body,
    ...(isEcommerce ? [labels.ecommerce] : []),
    `${labels.resume}: ${editorUrl}`,
    `${labels.support}: ${supportUrl}`,
  ]
  const text = `${renderEmailPlainText(copy.subject, textParts.join('\n\n'), labels.footer)}\n\n${labels.stopText} ${unsubscribeUrl}`

  return { subject: copy.subject, html, text }
}
