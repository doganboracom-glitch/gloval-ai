'use client'

import type { Section } from '@/lib/website-schema'
import { GlovalBadge } from '@/components/website-renderer/gloval-badge'

type FooterData = Extract<Section, { type: 'footer' }>

export function WebsiteFooter({
  data,
  logoText,
  lang = 'tr',
  showBranding = true,
}: {
  data: FooterData
  logoText: string
  lang?: 'tr' | 'en'
  showBranding?: boolean
}) {
  return (
    <footer
      className="px-6 py-12"
      style={{
        backgroundColor: 'var(--site-card)',
        borderTop: '1px solid var(--site-border)',
      }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <div className="grid gap-8 sm:grid-cols-[1.5fr_repeat(auto-fit,minmax(0,1fr))]">
          <div>
            <span
              className="text-lg font-bold tracking-tight"
              style={{
                fontFamily: 'var(--site-heading-font)',
                color: 'var(--site-fg)',
              }}
            >
              {logoText}
            </span>
            {data.tagline ? (
              <p
                className="mt-2 max-w-xs text-sm leading-relaxed"
                style={{ color: 'var(--site-muted-fg)' }}
              >
                {data.tagline}
              </p>
            ) : null}
          </div>

          {data.columns?.map((col) => (
            <div key={col.title}>
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: 'var(--site-fg)' }}
              >
                {col.title}
              </p>
              <ul className="mt-3 grid gap-2">
                {col.links.map((link) => (
                  <li key={link.label + link.href}>
                    <a
                      href={link.href || '#'}
                      onClick={(e) => e.preventDefault()}
                      className="text-sm transition-opacity hover:opacity-70"
                      style={{ color: 'var(--site-muted-fg)' }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          // The trailing padding keeps the credit clear of the floating
          // BackToTop control, which overlaps this row at the page bottom.
          className="mt-10 flex flex-col gap-4 border-t pt-6 pe-16 text-xs sm:flex-row sm:items-center sm:justify-between sm:pe-20"
          style={{
            borderColor: 'var(--site-border)',
            color: 'var(--site-muted-fg)',
          }}
        >
          <span>{data.copyright ?? `© ${new Date().getFullYear()} ${logoText}`}</span>
          {/* Platform credit, opposite the copyright line. Rendered here from
              fixed markup rather than from the editable schema, so it cannot be
              removed from the editor. */}
          {showBranding ? <GlovalBadge lang={lang} /> : null}
        </div>
      </div>
    </footer>
  )
}
