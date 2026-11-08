'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ADS_PATH, isAdsFeatureUiEnabled } from '@/lib/ads/feature-flag'
import { isWhoisLookupEnabled, WHOIS_LOOKUP_PATH } from '@/lib/domains/feature-flags'
import { useLanguage } from '@/components/language-provider'
import { BrandLogo } from '@/components/brand-logo'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { openCookiePreferences } from '@/components/cookie-consent'
import { PaymentBadges } from '@/components/payment-badges'
import { PLATFORM_PAYMENT_BADGES } from '@/lib/payment-badges'
import { isDomainLinkNewBadgeActive } from '@/lib/footer-new-badge'

const subscribeNoop = () => () => {}
const serverBadgeSnapshot = () => false

export function SiteFooter({ now }: { now?: Date } = {}) {
  const { t } = useLanguage()
  const l = t.footer.links
  const showReferralTerms = process.env.NEXT_PUBLIC_REFERRAL_ENABLED === '1'
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
        { label: t.domainSearch.footerLink, href: '/alan-adi-sorgula', newBadge: true },
        ...(isWhoisLookupEnabled() ? [{ label: t.whois.footerLink, href: WHOIS_LOOKUP_PATH }] : []),
        ...(isAdsFeatureUiEnabled()
          ? [{ label: t.ads.footerLink, href: ADS_PATH, soonBadge: true }]
          : []),
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
        { label: l.dataDeletion, href: '/yasal/veri-silme' },
        ...(showReferralTerms
          ? [{ label: l.referralTerms, href: '/yasal/satis-ortakligi-sartlari' }]
          : []),
      ],
    },
  ]

  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div
          data-testid="footer-brand-column"
          className="min-w-0 w-full max-w-none sm:max-w-xs"
        >
          <BrandLogo />
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t.footer.tagline}
          </p>
          <Card
            role="group"
            aria-labelledby="footer-partner-title"
            data-testid="partner-footer-block"
            className="relative mt-8 w-full overflow-visible rounded-3xl border border-brand/40 bg-card pt-6 shadow-[0_0_24px_color-mix(in_oklab,var(--color-brand)_18%,transparent)] ring-0"
          >
            <Badge
              data-testid="partner-soon-badge"
              variant="default"
              className="absolute left-4 top-0 z-10 -translate-y-1/2 border-brand/70 bg-brand px-2.5 text-[10px] font-bold tracking-[0.12em] text-brand-foreground transition-none"
            >
              {t.footer.partner.badge}
            </Badge>
            <CardHeader>
              <CardTitle
                id="footer-partner-title"
                role="heading"
                aria-level={4}
                className="font-bold"
              >
                {t.footer.partner.title}
              </CardTitle>
              <CardDescription className="break-words leading-relaxed">
                {t.footer.partner.description}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {columns.map((col) => (
          <div key={col.title}>
            <h4 className="text-sm font-semibold">{col.title}</h4>
            <ul className="mt-3 space-y-2">
              {col.items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className={
                      'soonBadge' in item && item.soonBadge
                        ? 'inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground transition-colors hover:text-foreground'
                        : 'text-sm text-muted-foreground transition-colors hover:text-foreground'
                    }
                  >
                    {item.label}
                    {'newBadge' in item && item.newBadge && showDomainBadge && (
                      <>
                        {' '}
                        <span
                          data-testid="domain-new-badge"
                          className="rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-violet-300"
                        >
                          {t.domainSearch.footerBadgeNew}
                        </span>
                      </>
                    )}
                    {'soonBadge' in item && item.soonBadge && (
                      <span
                        data-testid="ads-soon-badge"
                        className="rounded-full border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase leading-none tracking-wide text-brand"
                      >
                        {t.ads.newBadge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
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
