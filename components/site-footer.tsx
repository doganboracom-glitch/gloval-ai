'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { Globe } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { BrandLogo } from '@/components/brand-logo'
import { openCookiePreferences } from '@/components/cookie-consent'
import { PaymentBadges } from '@/components/payment-badges'
import { PLATFORM_PAYMENT_BADGES } from '@/lib/payment-badges'
import { isDomainLinkNewBadgeActive } from '@/lib/footer-new-badge'

const subscribeNoop = () => () => {}
const serverBadgeSnapshot = () => false

export function SiteFooter({ now }: { now?: Date } = {}) {
  const { t } = useLanguage()
  const l = t.footer.links
  // The server (and hydration) snapshot is always "no badge", so cached or
  // prerendered HTML can never disagree with the client; the badge appears
  // right after hydration while the date is still before the cutoff.
  const showDomainBadge = useSyncExternalStore(
    subscribeNoop,
    () => isDomainLinkNewBadgeActive(now),
    serverBadgeSnapshot,
  )

  const columns = [
    {
      title: t.footer.product,
      items: [
        { label: l.features, href: '/#features' },
        { label: l.pricing, href: '/#pricing' },
        { label: l.showcase, href: '/#showcase' },
        { label: t.domainSearch.footerLink, href: '/alan-adi-sorgula', featured: true },
      ],
    },
    {
      title: t.footer.company,
      items: [
        { label: l.about, href: '/yasal/hakkimizda' },
        { label: l.blog, href: '/blog' },
        { label: t.nav.faq, href: '/sss' },
        { label: l.contact, href: '/iletisim' },
      ],
    },
    {
      title: t.footer.legal,
      items: [
        { label: l.privacy, href: '/yasal/gizlilik-politikasi' },
        { label: l.kvkk, href: '/yasal/kvkk' },
        { label: l.cookies, href: '/yasal/cerez-politikasi' },
        { label: l.terms, href: '/yasal/kullanim-kosullari' },
        { label: l.distanceSales, href: '/yasal/mesafeli-satis-sozlesmesi' },
        { label: l.preInfo, href: '/yasal/on-bilgilendirme-formu' },
        { label: l.refund, href: '/yasal/iptal-ve-iade' },
        { label: l.delivery, href: '/yasal/hizmet-sunumu' },
      ],
    },
  ]

  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="max-w-xs">
          <BrandLogo />
          <p className="mt-3 text-sm text-muted-foreground">
            {t.footer.tagline}
          </p>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.items.map((item) =>
                'featured' in item && item.featured ? (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm text-sm font-medium text-violet-300 transition-colors hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Globe className="size-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </span>
                      {showDomainBadge && (
                        <span
                          data-testid="domain-new-badge"
                          className="rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-violet-300"
                        >
                          {t.domainSearch.footerBadgeNew}
                        </span>
                      )}
                    </Link>
                  </li>
                ) : (
                  <li key={item.label}>
                    <Link
                      href={item.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
              {/* Legal sütununun sonunda çerez tercihlerini yeniden açan buton:
                  banner kapatıldıktan sonra kullanıcının tercihini değiştirmesinin
                  tek yolu budur ve her sayfada erişilebilir olmalıdır. */}
              {col.title === t.footer.legal && (
                <li>
                  <button
                    type="button"
                    onClick={openCookiePreferences}
                    className="text-start text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.cookiePrefs}
                  </button>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-5 text-center sm:flex-row sm:justify-between sm:text-start">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} GLOVAL AI — {t.footer.rights}
          </p>
          <div className="flex justify-center sm:justify-end">
            <PaymentBadges badges={PLATFORM_PAYMENT_BADGES} className="justify-center sm:justify-end" />
          </div>
        </div>
      </div>
    </footer>
  )
}
