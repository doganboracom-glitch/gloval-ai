'use client'

import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { SectionShell, SectionHeading, onSiteNavClick } from '@/components/website-renderer/primitives'
import {
  useDemoHref,
  useDemoRoutes,
  useHrefNormalizer,
  useSiteNav,
} from '@/components/website-renderer/site-nav-context'
import { TeamCard } from '@/components/website-renderer/sections/team-card'
import { TeamExampleTag } from '@/components/website-renderer/sections/team-example-tag'
import { TEAM_HOME_PREVIEW, realMembers, teamLink, teamShownOnHome } from '@/lib/team'

type TeamData = Extract<Section, { type: 'team' }>

/**
 * Home "Kadromuz" block. Renders nothing until at least one person has a name (so an AI-generated or
 * freshly added empty section never shows), and nothing when the owner switched the home block off.
 */
export function TeamSection({ data, lang, site = null }: { data: TeamData; lang?: string; site?: WebsiteSchema | null }) {
  const nav = useSiteNav()
  const normalize = useHrefNormalizer()
  const demoHref = useDemoHref()
  const demo = useDemoRoutes() !== null
  if (!teamShownOnHome(data)) return null

  const language = lang === 'en' ? 'en' : 'tr'
  const all = realMembers(data)
  const link = site ? teamLink(site, data) : null
  const members = link ? all.slice(0, TEAM_HOME_PREVIEW) : all
  const showMore = link && all.length > members.length
  const href = link ? demoHref(normalize(link.href)) : ''
  const showTag = demo && all.some((m) => m.sample)

  return (
    <SectionShell id="team">
      <SectionHeading title={data.title} subtitle={data.subtitle?.trim() || undefined} />
      {showTag ? <TeamExampleTag lang={language} /> : null}
      <ul className="mt-10 grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {members.map((member, i) => (
          <TeamCard key={i} member={member} index={i} lang={language} />
        ))}
      </ul>
      {link && showMore ? (
        <div className="mt-8 text-center">
          <a
            href={href}
            onClick={(e) => onSiteNavClick(e, href, nav)}
            className="inline-flex cursor-pointer items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ border: '1px solid var(--site-border)', borderRadius: 'var(--site-radius)', color: 'var(--site-fg)' }}
          >
            {link.label}
          </a>
        </div>
      ) : null}
    </SectionShell>
  )
}
