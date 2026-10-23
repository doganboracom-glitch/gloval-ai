import type { Section } from '@/lib/website-schema'
import { SectionShell, SectionHeading } from '@/components/website-renderer/primitives'
import { TeamCard } from '@/components/website-renderer/sections/team-card'

type TeamData = Extract<Section, { type: 'team' }>

export function TeamSection({ data, lang }: { data: TeamData; lang?: string }) {
  const language = lang === 'en' ? 'en' : 'tr'
  return (
    <SectionShell id="team">
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <ul className="mt-10 grid grid-cols-1 gap-6 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {data.members.map((member, i) => (
          <TeamCard key={i} member={member} index={i} lang={language} />
        ))}
      </ul>
    </SectionShell>
  )
}
