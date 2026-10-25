'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Rocket } from 'lucide-react'
import type { SiteAddress } from '@/lib/site-address'

export const SITE_ADDRESS_COPY = {
  tr: {
    willPublishBefore: 'Siteniz ',
    willPublishAfter: ' adresinde yayınlanacaktır.',
    live: 'Siteniz yayında:',
    hint: 'Siteyi yayınladığında bu adreste açılır.',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyLabel: 'Site adresini kopyala',
    open: 'Siteyi yeni sekmede aç',
    notYet: 'henüz yayınlanmadı',
    region: 'Site adresi',
  },
  en: {
    willPublishBefore: 'Your site will be published at ',
    willPublishAfter: '.',
    live: 'Your site is live:',
    hint: 'It will open at this address once you publish.',
    copy: 'Copy',
    copied: 'Copied',
    copyLabel: 'Copy site address',
    open: 'Open site in a new tab',
    notYet: 'not published yet',
    region: 'Site address',
  },
} as const

const ADDRESS_CLASS =
  'inline-flex min-w-0 items-center gap-1.5 break-all text-left font-bold text-brand underline decoration-2 underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export function SiteAddressBanner({
  address,
  lang = 'tr',
}: {
  address: SiteAddress
  lang?: 'tr' | 'en'
}) {
  const c = SITE_ADDRESS_COPY[lang]
  const hintId = useId()
  const [copied, setCopied] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
      if (hintTimer.current) clearTimeout(hintTimer.current)
    },
    [],
  )

  // A site that goes back offline must not keep showing the previous hint state.
  useEffect(() => {
    if (address.published) setHintVisible(false)
  }, [address.published])

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(address.url)
    } catch {
      const area = document.createElement('textarea')
      area.value = address.url
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
    if (copyTimer.current) clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  function showHint() {
    setHintVisible(true)
    if (hintTimer.current) clearTimeout(hintTimer.current)
    hintTimer.current = setTimeout(() => setHintVisible(false), 4000)
  }

  return (
    <section
      aria-label={c.region}
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-brand/40 bg-brand/15 px-4 py-2.5 text-sm"
    >
      <Rocket className="h-4 w-4 shrink-0 text-brand" aria-hidden />
      {address.published ? (
        <>
          <span className="font-medium text-foreground">{c.live}</span>
          <a
            href={address.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${c.open}: ${address.host}`}
            className={ADDRESS_CLASS}
          >
            {address.host}
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
          </a>
          <button
            type="button"
            onClick={copyUrl}
            aria-label={c.copyLabel}
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/50 bg-brand/20 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-brand/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            <span aria-live="polite">{copied ? c.copied : c.copy}</span>
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 font-medium text-foreground">
            {c.willPublishBefore}
            <button
              type="button"
              onClick={showHint}
              aria-label={`${address.host} (${c.notYet})`}
              aria-describedby={hintVisible ? hintId : undefined}
              className={ADDRESS_CLASS}
            >
              <Globe className="h-4 w-4 shrink-0" aria-hidden />
              {address.host}
            </button>
            {c.willPublishAfter}
          </span>
          {hintVisible && (
            <span
              id={hintId}
              role="status"
              className="rounded-md border border-brand/40 bg-background px-2.5 py-1 text-xs font-medium text-foreground"
            >
              {c.hint}
            </span>
          )}
        </>
      )}
    </section>
  )
}
