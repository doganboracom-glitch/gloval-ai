'use client'

import { useEffect, useRef, useState } from 'react'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  onSiteNavClick,
} from '@/components/website-renderer/primitives'
import {
  useDemoHref,
  useDemoRoutes,
  useHrefNormalizer,
  useSiteNav,
} from '@/components/website-renderer/site-nav-context'
import { ReferenceLogo } from '@/components/website-renderer/sections/reference-logo'
import { ReferenceExampleTag } from '@/components/website-renderer/sections/reference-example-tag'
import {
  REFERENCES_CAROUSEL_INTERVAL_MS,
  REFERENCES_CAROUSEL_VISIBLE,
  REFERENCES_HOME_PREVIEW,
  realReferences,
  referencesLink,
  type ReferenceItem,
} from '@/lib/references'

type ReferencesData = Extract<Section, { type: 'references' }>

const CAROUSEL_CSS = `
.gv-ref{--gv-n:2}
@media (min-width:640px){.gv-ref{--gv-n:3}}
@media (min-width:1024px){.gv-ref{--gv-n:${REFERENCES_CAROUSEL_VISIBLE}}}
.gv-ref-item{flex:0 0 calc(100% / var(--gv-n));padding:0 .5rem}
.gv-ref-track{display:flex;transition:transform .6s ease}
.gv-ref-track[data-instant="true"]{transition:none}
@media (prefers-reduced-motion:reduce){.gv-ref-track{transition:none}}
`

/** One logo per step, wrapping seamlessly. Pauses on hover and keyboard focus; still under reduced motion. */
function LogoCarousel({ items, label }: { items: ReferenceItem[]; label: string }) {
  const count = items.length
  const [index, setIndex] = useState(0)
  const [instant, setInstant] = useState(false)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const indexRef = useRef(0)
  indexRef.current = index

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (paused || reduced) return
    const id = window.setInterval(() => setIndex(indexRef.current + 1), REFERENCES_CAROUSEL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [paused, reduced])

  useEffect(() => {
    if (!instant) return
    const frame = window.requestAnimationFrame(() => setInstant(false))
    return () => window.cancelAnimationFrame(frame)
  }, [instant])

  const onTransitionEnd = () => {
    if (indexRef.current >= count) {
      setInstant(true)
      setIndex(indexRef.current - count)
    }
  }

  return (
    <div
      className={`gv-ref mt-10 ${reduced ? 'overflow-x-auto' : 'overflow-hidden'}`}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <style>{CAROUSEL_CSS}</style>
      <ul
        className="gv-ref-track"
        data-instant={instant}
        style={{ transform: reduced ? undefined : `translateX(calc(-1 * ${index} * 100% / var(--gv-n)))` }}
        onTransitionEnd={onTransitionEnd}
      >
        {items.map((item, i) => (
          <li key={`a-${i}`} className="gv-ref-item">
            <ReferenceLogo item={item} index={i} />
          </li>
        ))}
        {reduced
          ? null
          : items.map((item, i) => (
              <li key={`b-${i}`} className="gv-ref-item" aria-hidden="true">
                <ReferenceLogo item={item} index={i} />
              </li>
            ))}
      </ul>
    </div>
  )
}

/**
 * Home carousel of client logos. Renders nothing while the owner has not added a real reference,
 * so a freshly generated site never shows an empty block. Four or fewer logos sit still in a row.
 */
export function ReferencesSection({ data, site = null }: { data: ReferencesData; site?: WebsiteSchema | null }) {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  const demo = useDemoRoutes() !== null
  const all = realReferences(data)
  const link = site ? referencesLink(site, data) : null
  if (all.length === 0 || data.showOnHome === false) return null
  const lang = site?.meta.language === 'en' ? 'en' : 'tr'
  const showTag = demo && all.some((item) => item.sample)

  const items = all.slice(0, REFERENCES_HOME_PREVIEW)
  const moving = data.autoplay !== false && items.length > REFERENCES_CAROUSEL_VISIBLE
  const href = link ? demoHref(normalize(link.href)) : ''

  return (
    <SectionShell id="references">
      <SectionHeading title={data.title} subtitle={data.subtitle?.trim() || undefined} />
      {showTag ? <ReferenceExampleTag lang={lang} /> : null}
      {moving ? (
        <LogoCarousel items={items} label={data.title} />
      ) : (
        <ul className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-4">
          {items.map((item, i) => (
            <li key={i} className="w-[calc(50%-0.5rem)] sm:w-44">
              <ReferenceLogo item={item} index={i} />
            </li>
          ))}
        </ul>
      )}
      {link ? (
        <div className="mt-8 text-center">
          <a
            href={href}
            onClick={(e) => onSiteNavClick(e, href, nav)}
            className="inline-flex cursor-pointer items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              border: '1px solid var(--site-border)',
              borderRadius: 'var(--site-radius)',
              color: 'var(--site-fg)',
            }}
          >
            {link.label}
          </a>
        </div>
      ) : null}
    </SectionShell>
  )
}
