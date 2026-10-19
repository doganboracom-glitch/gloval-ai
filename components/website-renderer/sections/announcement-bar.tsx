'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import { onSiteNavClick } from '@/components/website-renderer/primitives'
import { useHrefNormalizer, useSiteNav } from '@/components/website-renderer/site-nav-context'
import {
  announcementMarqueeTiming,
  estimateAnnouncementUnitWidth,
  safeAnnouncementHref,
} from '@/lib/announcement'

type AnnouncementData = Extract<Section, { type: 'announcement' }>

/** Stable per-content key so a changed announcement reappears after being dismissed. */
function dismissKey(data: AnnouncementData): string {
  return `gv-announcement:${data.items.map((i) => i.text).join('|')}`
}

export function AnnouncementBar({ data, lang = 'tr' }: { data: AnnouncementData; lang?: 'tr' | 'en' }) {
  const nav = useSiteNav()
  const normalizeHref = useHrefNormalizer()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!data.dismissible) return
    try {
      setDismissed(window.sessionStorage.getItem(dismissKey(data)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [data])

  const items = data.items.filter((item) => item.text.trim().length > 0)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [unitEl, setUnitEl] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState({ unit: 0, viewport: 0 })

  useEffect(() => {
    if (!containerEl || !unitEl || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const unit = unitEl.getBoundingClientRect().width
      const viewport = containerEl.getBoundingClientRect().width
      setMeasured((prev) => (prev.unit === unit && prev.viewport === viewport ? prev : { unit, viewport }))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(containerEl)
    observer.observe(unitEl)
    return () => observer.disconnect()
  }, [containerEl, unitEl])

  if (items.length === 0 || dismissed) return null

  const { repeats, durationSeconds } = announcementMarqueeTiming({
    unitWidth: measured.unit || estimateAnnouncementUnitWidth(items.map((item) => item.text)),
    viewportWidth: measured.viewport,
    speed: data.speed,
  })
  const bg = data.useAccentColor ? 'var(--site-accent)' : 'var(--site-primary)'
  const fg = data.useAccentColor ? 'var(--site-accent-fg, var(--site-primary-fg))' : 'var(--site-primary-fg)'

  const renderItems = (hidden: boolean) =>
    items.map((item, i) => {
      const href = safeAnnouncementHref(item.link, normalizeHref)
      const content = (
        <>
          <span>{item.text}</span>
          <span aria-hidden="true" className="mx-6 opacity-60">
            {'•'}
          </span>
        </>
      )
      return href ? (
        <a
          key={`${hidden ? 'b' : 'a'}-${i}`}
          href={href}
          tabIndex={hidden ? -1 : undefined}
          onClick={(e) => onSiteNavClick(e, href, nav)}
          {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap underline-offset-2 hover:underline"
        >
          {content}
        </a>
      ) : (
        <span key={`${hidden ? 'b' : 'a'}-${i}`} className="inline-flex shrink-0 items-center whitespace-nowrap">
          {content}
        </span>
      )
    })

  return (
    <div
      role="region"
      aria-label={lang === 'en' ? 'Announcement' : 'Duyuru'}
      data-gv-announcement
      className="relative flex items-center text-sm font-medium"
      style={{ backgroundColor: bg, color: fg, fontFamily: 'var(--site-body-font)' }}
    >
      <div
        ref={setContainerEl}
        className={`gv-marquee relative min-w-0 flex-1 overflow-hidden py-2 ${data.pauseOnHover === false ? '' : 'gv-marquee-pausable'}`}
        style={{ ['--gv-marquee-duration' as string]: `${durationSeconds.toFixed(2)}s` }}
      >
        <div className="gv-marquee-track flex w-max items-center">
          {Array.from({ length: repeats * 2 }, (_, k) =>
            k === 0 ? (
              <div key={k} ref={setUnitEl} className="flex shrink-0 items-center px-3">
                {renderItems(false)}
              </div>
            ) : (
              <div key={k} className="gv-marquee-copy flex shrink-0 items-center px-3" aria-hidden="true">
                {renderItems(true)}
              </div>
            ),
          )}
        </div>
      </div>
      {data.dismissible ? (
        <button
          type="button"
          aria-label={lang === 'en' ? 'Dismiss announcement' : 'Duyuruyu kapat'}
          onClick={() => {
            setDismissed(true)
            try {
              window.sessionStorage.setItem(dismissKey(data), '1')
            } catch {
              // Storage unavailable: dismissal lasts for this view only.
            }
          }}
          className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center transition-opacity hover:opacity-70"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
