'use client'

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
import { REFERENCES_HOME_PREVIEW, realReferences, referencesLink } from '@/lib/references'

type ReferencesData = Extract<Section, { type: 'references' }>

/** Fewer logos than this fit one row, so a moving strip would only repeat them. */
const MARQUEE_MIN = 5

/**
 * Home carousel of client logos. Renders nothing while the owner has not added a real reference,
 * so a freshly generated site never shows an empty block. Motion respects `prefers-reduced-motion`
 * and pauses on hover and keyboard focus.
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
  const moving = data.autoplay !== false && items.length >= MARQUEE_MIN
  const href = link ? demoHref(normalize(link.href)) : ''
  const duration = `${Math.max(20, items.length * 4)}s`

  return (
    <SectionShell id="references">
      <SectionHeading title={data.title} subtitle={data.subtitle?.trim() || undefined} />
      {showTag ? <ReferenceExampleTag lang={lang} /> : null}
      {moving ? (
        <div
          className="gv-ref-marquee mt-10 overflow-hidden"
          style={{ ['--gv-ref-duration' as string]: duration }}
          role="group"
          aria-label={data.title}
        >
          <style>{`
            .gv-ref-track{display:flex;width:max-content;gap:1rem;animation:gv-ref-scroll var(--gv-ref-duration) linear infinite}
            .gv-ref-marquee:hover .gv-ref-track,.gv-ref-marquee:focus-within .gv-ref-track{animation-play-state:paused}
            @keyframes gv-ref-scroll{from{transform:translateX(0)}to{transform:translateX(calc(-50% - .5rem))}}
            @media (prefers-reduced-motion:reduce){.gv-ref-marquee{overflow-x:auto}.gv-ref-track{animation:none}.gv-ref-dup{display:none}}
          `}</style>
          <ul className="gv-ref-track">
            {items.map((item, i) => (
              <li key={`a-${i}`} className="w-44 shrink-0">
                <ReferenceLogo item={item} />
              </li>
            ))}
            {items.map((item, i) => (
              <li key={`b-${i}`} className="gv-ref-dup w-44 shrink-0" aria-hidden="true">
                <ReferenceLogo item={item} />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="mt-10 flex flex-wrap justify-center gap-4">
          {items.map((item, i) => (
            <li key={i} className="w-40 sm:w-44">
              <ReferenceLogo item={item} />
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
