'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

type Lang = 'tr' | 'en'

const SITEMAP_SUFFIX = '/sitemap.xml'

const T = {
  tr: {
    title: 'Google Search Console\u2019a ekleme',
    intro:
      'Sitenizin Google aramalarında görünmesi için Search Console\u2019a ekleyin ve site haritanızı gönderin. Adımlar yaklaşık beş dakika sürer.',
    siteAddress: 'Sitenizin adresi',
    sitemapAddress: 'Site haritası adresiniz',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    afterPublish: 'Yayınlanınca geçerli olur',
    needsAddress: 'Site adresi, site oluşturulduktan sonra burada görünür.',
    steps: [
      {
        title: 'Search Console\u2019da mülk ekleme',
        body: 'search.google.com/search-console adresine girip Google hesabınızla oturum açın. \u201CMülk ekle\u201D > \u201CURL ön eki\u201D seçeneğine sitenizin tam adresini yapıştırın.',
      },
      {
        title: 'Sahipliği doğrulama',
        body: '\u201CDoğrulama yöntemleri\u201D > \u201CHTML etiketi\u201D seçeneğini açın ve <meta> kodunu kopyalayın. Bu kodu editörde Tasarım sekmesinin en altındaki \u201CHead kodları\u201D alanına yapıştırın. Ardından siteyi YAYINLAYIN ve Search Console\u2019da \u201CDoğrula\u201D\u2019ya basın.',
      },
      {
        title: 'Site haritasını gönderme',
        body: 'Soldaki menüden \u201CSite haritaları\u201D bölümünü açın ve yukarıdaki site haritası adresini ekleyin.',
      },
    ],
    bing:
      'Bing, Yandex ve diğer IndexNow destekli motorlar yeni ve güncellenen sayfalarınızdan otomatik haberdar edilir. Google IndexNow desteklemez; bu yüzden yukarıdaki adımlar önerilir.',
  },
  en: {
    title: 'Add it to Google Search Console',
    intro:
      'Add your site to Search Console and submit its sitemap so it can show up in Google results. It takes about five minutes.',
    siteAddress: 'Your site address',
    sitemapAddress: 'Your sitemap address',
    copy: 'Copy',
    copied: 'Copied',
    afterPublish: 'Valid once published',
    needsAddress: 'Your site address appears here once the site is created.',
    steps: [
      {
        title: 'Add a property in Search Console',
        body: 'Go to search.google.com/search-console and sign in with your Google account. Choose \u201CAdd property\u201D > \u201CURL prefix\u201D and paste your full site address.',
      },
      {
        title: 'Verify ownership',
        body: 'Open \u201CVerification methods\u201D > \u201CHTML tag\u201D and copy the <meta> code. Paste it into the \u201CHead code\u201D field at the very bottom of the Design tab in the editor. Then PUBLISH the site and press \u201CVerify\u201D in Search Console.',
      },
      {
        title: 'Submit the sitemap',
        body: 'Open \u201CSitemaps\u201D in the left menu and add the sitemap address above.',
      },
    ],
    bing:
      'Bing, Yandex and other IndexNow engines are notified automatically about new and updated pages. Google does not support IndexNow, so the steps above are recommended.',
  },
} as const

function CopyRow({
  label,
  value,
  note,
  copyLabel,
  copiedLabel,
}: {
  label: string
  value: string
  note: string | null
  copyLabel: string
  copiedLabel: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-lg bg-secondary px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      {note ? <span className="text-[11px] text-muted-foreground">{note}</span> : null}
    </div>
  )
}

export function SearchPromoCard({
  sitemapUrl,
  published,
  lang,
}: {
  sitemapUrl: string | null
  published: boolean
  lang: Lang
}) {
  const t = T[lang]
  const siteUrl = sitemapUrl?.endsWith(SITEMAP_SUFFIX) ? sitemapUrl.slice(0, -SITEMAP_SUFFIX.length) : null
  const note = published ? null : t.afterPublish

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-3">
      <h5 className="text-sm font-semibold text-foreground">{t.title}</h5>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.intro}</p>
      {siteUrl && sitemapUrl ? (
        <div className="flex flex-col gap-3">
          <CopyRow
            label={t.siteAddress}
            value={siteUrl}
            note={note}
            copyLabel={t.copy}
            copiedLabel={t.copied}
          />
          <CopyRow
            label={t.sitemapAddress}
            value={sitemapUrl}
            note={note}
            copyLabel={t.copy}
            copiedLabel={t.copied}
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t.needsAddress}</p>
      )}
      <ol className="flex flex-col gap-2.5">
        {t.steps.map((step, index) => (
          <li key={step.title} className="flex gap-2.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-foreground"
              aria-hidden
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">{step.title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{step.body}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-xs leading-relaxed text-muted-foreground">{t.bing}</p>
    </section>
  )
}
