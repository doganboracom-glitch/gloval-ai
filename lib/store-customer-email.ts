import 'server-only'
import { escape, renderEmailLayout } from '@/lib/email/layout'
import type { EmailLang } from '@/lib/email/lang'
import { tenantUrl } from '@/lib/domains'

export const RESET_TOKEN_TTL_MINUTES = 30

/**
 * Reset link for a store customer. The base comes ONLY from configuration
 * (the store's tenant host via NEXT_PUBLIC_TENANT_ROOT_DOMAIN) and never from
 * request headers, so a forged Host / X-Forwarded-Host cannot redirect the
 * link to an attacker's domain. The token travels in the URL fragment: it is
 * not sent to the server in the request line, access logs or Referer headers.
 */
export function buildPasswordResetUrl(storeSlug: string, token: string): string {
  return `${tenantUrl(storeSlug)}/hesap/sifre-yenile#token=${encodeURIComponent(token)}`
}

const COPY = {
  tr: {
    subject: 'Şifre sıfırlama talebi',
    preview: 'Şifrenizi sıfırlamak için bağlantıya tıklayın.',
    title: 'Şifrenizi sıfırlayın',
    hello: (name: string) => (name ? `Merhaba ${name},` : 'Merhaba,'),
    intro: (store: string) =>
      `${store} hesabınız için bir şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki düğmeyi kullanın.`,
    validity: `Bağlantı ${RESET_TOKEN_TTL_MINUTES} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
    cta: 'Şifremi sıfırla',
    footer:
      'Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz; şifreniz değişmez.',
    textLead: 'Şifrenizi sıfırlamak için bağlantıya gidin',
  },
  en: {
    subject: 'Password reset request',
    preview: 'Use the link to reset your password.',
    title: 'Reset your password',
    hello: (name: string) => (name ? `Hello ${name},` : 'Hello,'),
    intro: (store: string) =>
      `We received a request to reset the password for your ${store} account. Use the button below to choose a new password.`,
    validity: `The link is valid for ${RESET_TOKEN_TTL_MINUTES} minutes and can be used only once.`,
    cta: 'Reset my password',
    footer:
      'If you did not make this request you can ignore this email; your password will not change.',
    textLead: 'To reset your password, open this link',
  },
} as const

export function renderStoreResetEmail(input: {
  lang: EmailLang
  storeName: string
  storeSlug: string
  customerName: string
  url: string
}): { subject: string; html: string; text: string } {
  const c = COPY[input.lang]
  const body =
    `<p style="margin:0 0 14px;">${escape(c.hello(input.customerName))}</p>` +
    `<p style="margin:0 0 14px;">${escape(c.intro(input.storeName))}</p>` +
    `<p style="margin:0;">${escape(c.validity)}</p>`

  const html = renderEmailLayout({
    lang: input.lang,
    previewText: c.preview,
    title: c.title,
    body,
    cta: { label: c.cta, href: input.url },
    footer: c.footer,
    homeUrl: tenantUrl(input.storeSlug),
  })
  const text = `${c.hello(input.customerName)}\n\n${c.intro(input.storeName)}\n\n${c.textLead} (${c.validity}):\n${input.url}\n\n${c.footer}`
  return { subject: c.subject, html, text }
}
