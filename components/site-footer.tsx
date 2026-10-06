'use client'

import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { BrandLogo } from '@/components/brand-logo'
import { openCookiePreferences } from '@/components/cookie-consent'

export function SiteFooter() {
  const { t } = useLanguage()
  const l = t.footer.links

  const columns = [
    {
      title: t.footer.product,
      items: [
        { label: l.features, href: '/#features' },
        { label: l.pricing, href: '/#pricing' },
        { label: l.showcase, href: '/#showcase' },
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
              {col.items.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
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
          <div className="flex flex-col items-center gap-1.5 sm:items-end">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t.footer.securePayment}
            </span>
            <img
              src="/payment/iyzico-logo-band.svg"
              alt="iyzico ile güvenli ödeme — Visa, Mastercard"
              width={429}
              height={32}
              loading="lazy"
              decoding="async"
              className="h-5 w-auto max-w-full"
            />
          </div>
        </div>
      </div>
    </footer>
  )
}
