'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Rocket } from 'lucide-react'

const COPY = {
  tr: { copy: 'Kopyala', copied: 'Kopyalandı', copyLabel: 'Site adresini kopyala', open: 'Siteyi yeni sekmede aç' },
  en: { copy: 'Copy', copied: 'Copied', copyLabel: 'Copy site address', open: 'Open site in a new tab' },
} as const

export function PublishedSiteBanner({
  url,
  label,
  lang = 'tr',
}: {
  url: string
  /** Localised "Your site is live:" lead-in. */
  label: string
  lang?: 'tr' | 'en'
}) {
  const c = COPY[lang]
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const area = document.createElement('textarea')
      area.value = url
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      try {
        document.execCommand('copy')
      } finally {
        document.body.removeChild(area)
      }
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-brand/40 bg-brand/15 px-4 py-2.5 text-sm">
      <Rocket className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      <span className="font-medium text-foreground">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${c.open}: ${url.replace(/^https?:\/\//, '')}`}
        className="inline-flex min-w-0 items-center gap-1.5 break-all font-bold text-brand underline decoration-2 underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {url.replace(/^https?:\/\//, '')}
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      </a>
      <button
        type="button"
        onClick={copyUrl}
        aria-label={c.copyLabel}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/20 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
        <span aria-live="polite">{copied ? c.copied : c.copy}</span>
      </button>
    </div>
  )
}
