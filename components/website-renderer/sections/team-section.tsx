'use client'

import { useState } from 'react'
import type { Section } from '@/lib/website-schema'
import { SectionShell, SectionHeading, SiteImage } from '@/components/website-renderer/primitives'
import { ItemDetailDialog, type ItemDetail } from '@/components/website-renderer/item-detail'

type TeamData = Extract<Section, { type: 'team' }>

export function TeamSection({ data, lang }: { data: TeamData; lang?: string }) {
  const [detail, setDetail] = useState<ItemDetail | null>(null)

  return (
    <SectionShell id="team">
      <SectionHeading title={data.title} subtitle={data.subtitle} />
      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {data.members.map((member, i) => {
          const imagePrompt = member.imagePrompt ?? `Portrait of ${member.name}, ${member.role}`
          return (
            <button
              key={i}
              type="button"
              onClick={() =>
                setDetail({
                  title: member.name,
                  eyebrow: member.role,
                  description: member.bio,
                  imagePrompt,
                  src: member.src,
                  alt: member.name,
                  seed: i + 5,
                  aspectRatio: '1/1',
                })
              }
              aria-haspopup="dialog"
              className="cursor-pointer text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
              style={{ outlineColor: 'var(--site-primary)' }}
            >
              <SiteImage
                image={{ imagePrompt, src: member.src, alt: member.name, aspectRatio: '1/1' }}
                seed={i + 5}
                className="mx-auto w-full max-w-[180px]"
              />
              <span
                className="mt-4 block text-base font-semibold"
                style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
              >
                {member.name}
              </span>
              <span className="block text-sm font-medium" style={{ color: 'var(--site-primary)' }}>
                {member.role}
              </span>
              {member.bio ? (
                <span
                  className="mt-2 line-clamp-3 block text-pretty text-sm leading-relaxed"
                  style={{ color: 'var(--site-muted-fg)' }}
                >
                  {member.bio}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <ItemDetailDialog detail={detail} onClose={() => setDetail(null)} lang={lang} />
    </SectionShell>
  )
}
