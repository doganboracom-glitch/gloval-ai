import { Mail, Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  initialsOf,
  memberSocials,
  resolveTeamPortrait,
  telHref,
  type TeamMemberLike,
  type TeamSocialKey,
} from '@/lib/team'

const ICON_CLASS = 'size-4'

function BrandIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={ICON_CLASS} fill="currentColor" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const ICONS: Record<TeamSocialKey, ReactNode> = {
  facebook: (
    <BrandIcon>
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.3 0-3.9 1.4-3.9 4v2.2H8v3h2.5V21h3z" />
    </BrandIcon>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" className={ICON_CLASS} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  x: (
    <BrandIcon>
      <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
    </BrandIcon>
  ),
  linkedin: (
    <BrandIcon>
      <path d="M5.4 8.6H2.2V21h3.2V8.6zM3.8 3.5a1.9 1.9 0 100 3.8 1.9 1.9 0 000-3.8zM21.8 21v-6.8c0-3.3-1.8-4.8-4.1-4.8-1.9 0-2.7 1-3.2 1.8V8.6h-3.2c0 .9 0 12.4 0 12.4h3.2v-6.9c0-.4 0-.7.1-1 .3-.7.9-1.4 2-1.4 1.4 0 2 1.1 2 2.6V21h3.2z" />
    </BrandIcon>
  ),
  email: <Mail className={ICON_CLASS} aria-hidden="true" />,
}

function labels(lang: 'tr' | 'en', name: string): Record<TeamSocialKey, string> {
  const who = name.trim()
  return lang === 'en'
    ? {
        facebook: `${who} on Facebook`,
        instagram: `${who} on Instagram`,
        x: `${who} on X`,
        linkedin: `${who} on LinkedIn`,
        email: `Email ${who}`,
      }
    : {
        facebook: `${who} Facebook profili`,
        instagram: `${who} Instagram profili`,
        x: `${who} X profili`,
        linkedin: `${who} LinkedIn profili`,
        email: `${who} adresine e-posta gönder`,
      }
}

function Portrait({ member, index }: { member: TeamMemberLike; index: number }) {
  const portrait = resolveTeamPortrait(member, index)
  if (portrait.kind === 'photo') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- owner-uploaded or generated portrait of unknown origin
      <img
        src={portrait.src}
        alt={member.name}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    )
  }
  const { avatar } = portrait
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--site-card)' }}>
      {avatar.kind === 'preset' ? (
        // eslint-disable-next-line @next/next/no-img-element -- static SVG illustration from /public
        <img src={avatar.src} alt="" aria-hidden="true" loading="lazy" decoding="async" className="size-3/5 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-3/5 items-center justify-center rounded-full text-4xl font-semibold"
          style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          {initialsOf(member.name)}
        </span>
      )}
    </div>
  )
}

/**
 * One person. The info panel uses the theme accent with its own readable foreground (`--site-primary-fg`).
 * Social icons slide in on the image's right edge on hover / keyboard focus; where hover does not exist
 * (touch) they are a permanent row under the card instead.
 */
export function TeamCard({ member, index, lang }: { member: TeamMemberLike; index: number; lang: 'tr' | 'en' }) {
  const socials = memberSocials(member)
  const tel = telHref(member.phone)
  const names = labels(lang, member.name)

  const iconLinks = socials.map(({ key, href }) => (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={names[key]}
      className="flex size-9 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
      style={{
        backgroundColor: 'var(--site-primary)',
        color: 'var(--site-primary-fg)',
        outlineColor: 'var(--site-primary)',
      }}
    >
      {ICONS[key]}
    </a>
  ))

  return (
    <li
      className="group relative flex flex-col overflow-hidden"
      style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
      data-team-card
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <Portrait member={member} index={index} />
        {socials.length > 0 ? (
          <div
            data-team-socials="hover"
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-2 opacity-0 transition-all duration-200 focus-within:translate-x-0 focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none [@media(hover:hover)]:flex [@media(hover:hover)]:translate-x-2"
          >
            {iconLinks}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4" style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}>
        <h3 className="text-balance text-xl font-semibold leading-tight" style={{ fontFamily: 'var(--site-heading-font)' }}>
          {member.name}
        </h3>
        {member.role?.trim() ? <p className="text-sm font-bold">{member.role}</p> : null}
        {tel ? (
          <a
            href={tel}
            className="mt-1 inline-flex w-fit items-center gap-2 text-sm underline-offset-4 hover:underline focus-visible:underline"
          >
            <Phone className="size-4 shrink-0" aria-hidden="true" />
            <span>{member.phone?.trim()}</span>
          </a>
        ) : null}
      </div>

      {socials.length > 0 ? (
        <div
          data-team-socials="touch"
          className="flex items-center gap-2 px-4 py-3 [@media(hover:hover)]:hidden"
          style={{ borderTop: '1px solid var(--site-border)' }}
        >
          {iconLinks.map((link) => link)}
        </div>
      ) : null}
    </li>
  )
}
