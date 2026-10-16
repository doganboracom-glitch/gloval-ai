'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type Lang = 'tr' | 'en'

const T = {
  tr: {
    title: 'Arama motorlarına tanıtın',
    sitemap: 'Site haritası adresiniz',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    needsPublish: 'Site yayınlandığında site haritası adresiniz burada görünür.',
    stepsTitle: 'Google Search Console\u2019a ekleme',
    steps: [
      'search.google.com/search-console adresine girip Google hesabınızla oturum açın.',
      '\u201CMülk ekle\u201D ile sitenizin adresini ekleyin ve sahipliği doğrulayın.',
      'Soldaki menüden \u201CSite haritaları\u201D bölümünü açın.',
      'Yukarıdaki adresi yapıştırıp \u201CGönder\u201D\u2019e basın.',
    ],
    bing:
      'Bing, Yandex ve diğer IndexNow destekli motorlar yeni ve güncellenen sayfalarınızdan otomatik haberdar edilir. Google IndexNow desteklemez; bu yüzden yukarıdaki adım önerilir.',
  },
  en: {
    title: 'Promote to search engines',
    sitemap: 'Your sitemap address',
    copy: 'Copy',
    copied: 'Copied',
    needsPublish: 'Your sitemap address appears here once the site is published.',
    stepsTitle: 'Add it to Google Search Console',
    steps: [
      'Go to search.google.com/search-console and sign in with your Google account.',
      'Add your site address with \u201CAdd property\u201D and verify ownership.',
      'Open \u201CSitemaps\u201D in the left menu.',
      'Paste the address above and press \u201CSubmit\u201D.',
    ],
    bing:
      'Bing, Yandex and other IndexNow engines are notified automatically about new and updated pages. Google does not support IndexNow, so the steps above are recommended.',
  },
} as const

export function SearchPromoCard({ sitemapUrl, lang }: { sitemapUrl: string | null; lang: Lang }) {
  const t = T[lang]
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!sitemapUrl) return
    try {
      await navigator.clipboard.writeText(sitemapUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
      <h5 className="text-sm font-semibold text-foreground">{t.title}</h5>
      {sitemapUrl ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{t.sitemap}</span>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-lg bg-secondary px-3 py-2 font-mono text-xs text-foreground">
              {sitemapUrl}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              {copied ? t.copied : t.copy}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.needsPublish}</p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-foreground">{t.stepsTitle}</span>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground">
          {t.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.bing}</p>
    </section>
  )
}
