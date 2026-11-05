'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { ROBOTS_PRODUCT_TOKEN, SCAN_LIMITS, SCAN_USER_AGENT } from '@/lib/ads/scan/config'

export const BOT_NAME = 'GlovalAdsBot'

export const ROBOTS_BLOCK_EXAMPLE = `User-agent: ${BOT_NAME}\nDisallow: /`
export const ROBOTS_ALLOW_EXAMPLE = `User-agent: ${BOT_NAME}\nAllow: /`

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="text-balance font-display text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-pretty leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

function CodeBlock({ children, label }: { children: string; label: string }) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 font-mono text-sm leading-relaxed text-foreground"
    >
      <code>{children}</code>
    </pre>
  )
}

/**
 * Public information page for the GlovalAdsBot crawler. Its user agent string
 * links here (`SCAN_BOT_INFO_URL`), so site owners can find out who is calling,
 * what is read and how to block or allow it.
 */
export function BotPageClient({ supportEmail }: { supportEmail: string }) {
  const { lang } = useLanguage()
  const tr = lang === 'tr'
  const extraPages = SCAN_LIMITS.maxExtraPages

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {tr ? 'Ana sayfa' : 'Home'}
        </Link>

        <header className="mt-8">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">{BOT_NAME}</h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            {tr
              ? 'GLOVAL AI’ın reklam planı için bir siteyi tek seferlik okuyan tarayıcısı.'
              : 'The GLOVAL AI crawler that reads a site once to prepare an ad plan.'}
          </p>
        </header>

        <Section id="bot-what" title={tr ? `${BOT_NAME} nedir?` : `What is ${BOT_NAME}?`}>
          <p>
            {tr
              ? `${BOT_NAME}, GLOVAL Ads ile reklam planı hazırlayan bir kullanıcı bir site adresi girdiğinde çalışır. Siteyi yalnızca o an, tek seferlik okur; arama motoru gibi düzenli dolaşmaz, sayfaları dizine eklemez ve içeriği yeniden yayınlamaz.`
              : `${BOT_NAME} runs when someone preparing an ad plan with GLOVAL Ads enters a site address. It reads the site once, at that moment. It does not crawl regularly like a search engine, index pages or republish content.`}
          </p>
        </Section>

        <Section id="bot-ua" title={tr ? 'Kullanıcı aracısı dizesi' : 'User agent string'}>
          <p>
            {tr
              ? 'Sunucu kayıtlarında bu dizeyle görünür:'
              : 'It appears in your server logs with this string:'}
          </p>
          <CodeBlock label={tr ? 'Kullanıcı aracısı' : 'User agent'}>{SCAN_USER_AGENT}</CodeBlock>
        </Section>

        <Section id="bot-reads" title={tr ? 'Ne okur?' : 'What does it read?'}>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              {tr
                ? `Herkese açık ana sayfa ve en çok ${extraPages} ek sayfa (örneğin hakkında veya ürünler sayfası).`
                : `The public home page and at most ${extraPages} additional pages (for example an about or products page).`}
            </li>
            <li>
              {tr
                ? 'Önce robots.txt dosyasını okur ve kurallarına uyar; izin verilmeyen sayfaları açmaz.'
                : 'It reads robots.txt first and follows its rules; pages that are not allowed are not opened.'}
            </li>
            <li>
              {tr
                ? 'Giriş gerektiren sayfalara girmez, form göndermez, güvenlik duvarı veya “insan doğrulaması” sayfalarını aşmaya çalışmaz.'
                : 'It does not enter pages that require a login, submit forms or try to get past firewalls or “human verification” pages.'}
            </li>
          </ul>
        </Section>

        <Section id="bot-control" title={tr ? 'Nasıl engellenir veya izin verilir?' : 'How to block or allow it'}>
          <p>
            {tr
              ? `robots.txt dosyanda ${BOT_NAME} için ayrı bir grup tanımlarsan, “User-agent: *” grubundaki kurallar yerine bu grup geçerli olur (grup adı büyük/küçük harfe duyarsızdır: “${ROBOTS_PRODUCT_TOKEN}”).`
              : `If your robots.txt has a separate group for ${BOT_NAME}, that group applies instead of the “User-agent: *” group (the group name is case-insensitive: “${ROBOTS_PRODUCT_TOKEN}”).`}
          </p>
          <p className="font-medium text-foreground">{tr ? 'Engellemek için:' : 'To block it:'}</p>
          <CodeBlock label={tr ? 'robots.txt ile engelleme' : 'Blocking with robots.txt'}>
            {ROBOTS_BLOCK_EXAMPLE}
          </CodeBlock>
          <p className="font-medium text-foreground">{tr ? 'İzin vermek için:' : 'To allow it:'}</p>
          <CodeBlock label={tr ? 'robots.txt ile izin verme' : 'Allowing with robots.txt'}>
            {ROBOTS_ALLOW_EXAMPLE}
          </CodeBlock>
          <p>
            {tr
              ? 'robots.txt veya bir erişim kuralı GlovalAdsBot’u engellerse dururuz; korumaları aşmaya çalışmayız. İzin vermek isteğe bağlıdır. Sabit IP aralığı yayınlamıyoruz; güvenlik duvarı kuralını yalnızca kendi güvenlik politikan doğrultusunda tanımla.'
              : 'If robots.txt or an access control blocks GlovalAdsBot, we stop and do not try to bypass it. Allowing the crawler is optional. We do not publish a fixed IP range; configure any firewall rule only if it fits your security policy.'}
          </p>
        </Section>

        <Section id="bot-contact" title={tr ? 'İletişim' : 'Contact'}>
          <p>
            {tr
              ? 'Soruların, itirazların veya tarayıcının davranışıyla ilgili bir sorun bildirmek için bize yaz:'
              : 'For questions, objections or to report a problem with how the crawler behaves, write to us:'}
          </p>
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-brand/50 hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Mail className="h-4 w-4 text-brand" aria-hidden="true" />
            {supportEmail}
          </a>
        </Section>
      </main>
      <SiteFooter />
    </div>
  )
}
