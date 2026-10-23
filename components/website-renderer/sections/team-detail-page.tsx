'use client'

import type { WebsiteSchema } from '@/lib/website-schema'
import { PageHeader } from '@/components/website-renderer/sections/gallery-detail-page'
import { TeamCard } from '@/components/website-renderer/sections/team-card'
import { TeamExampleTag } from '@/components/website-renderer/sections/team-example-tag'
import { useDemoRoutes } from '@/components/website-renderer/site-nav-context'
import { resolveTeam } from '@/lib/team'

/** `/kadromuz`: every named person as a card grid. */
export function TeamDetailPage({ site }: { site: WebsiteSchema }) {
  const demo = useDemoRoutes() !== null
  const { lang, members, section, title, active } = resolveTeam(site)
  if (!active || !section) return null
  const showTag = demo && members.some((m) => m.sample)
  return (
    <div id="team-detail" data-gv-detail-page>
      <PageHeader lang={lang} trail={[{ label: title }]} title={title} subtitle={section.subtitle?.trim() || undefined} />
      <div className="px-6 py-12 sm:py-16">
        {showTag ? <TeamExampleTag lang={lang} /> : null}
        <ul className="mx-auto mt-6 grid w-full max-w-6xl grid-cols-1 gap-6 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {members.map((member, i) => (
            <TeamCard key={i} member={member} index={i} lang={lang} />
          ))}
        </ul>
      </div>
    </div>
  )
}
