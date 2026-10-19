import type { ResolvedSocialLink } from '@/lib/social-links'
import { SocialIcon } from '@/components/website-renderer/social-icons'

export type SocialLinksVariant = 'contact' | 'footer' | 'header' | 'menu'

const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--site-primary)]'

const VARIANTS: Record<
  SocialLinksVariant,
  { list: string; link: string; icon: string; color: string; bordered: boolean }
> = {
  contact: {
    list: 'mt-6 flex flex-wrap items-center gap-3',
    link: 'h-10 w-10',
    icon: 'h-5 w-5',
    color: 'var(--site-primary)',
    bordered: true,
  },
  footer: {
    list: 'mt-4 flex flex-wrap items-center gap-2',
    link: 'h-9 w-9',
    icon: 'h-4 w-4',
    color: 'var(--site-muted-fg)',
    bordered: false,
  },
  header: {
    list: 'hidden items-center gap-0.5 md:flex',
    link: 'h-8 w-8',
    icon: 'h-4 w-4',
    color: 'var(--site-muted-fg)',
    bordered: false,
  },
  menu: {
    list: 'flex flex-wrap items-center gap-2',
    link: 'h-11 w-11',
    icon: 'h-5 w-5',
    color: 'var(--site-fg)',
    bordered: true,
  },
}

/**
 * Social media icons. Only networks the owner filled in are passed (see
 * `resolveSocialLinks`), so a site without links renders nothing at all and
 * never reserves empty space. Colors come from the site theme.
 */
export function SocialLinks({
  links,
  variant = 'contact',
  label = 'Social media',
}: {
  links?: ResolvedSocialLink[]
  variant?: SocialLinksVariant
  /** Accessible name of the list. */
  label?: string
}) {
  if (!links || links.length === 0) return null
  const v = VARIANTS[variant]

  return (
    <ul className={v.list} aria-label={label} data-social-links={variant}>
      {links.map((link) => (
        <li key={link.network}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.label}
            title={link.label}
            data-social-network={link.network}
            className={`inline-flex items-center justify-center transition-opacity hover:opacity-70 ${FOCUS_RING} ${v.link}`}
            style={{
              color: v.color,
              border: v.bordered ? '1px solid var(--site-border)' : undefined,
              borderRadius: 'var(--site-radius)',
            }}
          >
            <SocialIcon network={link.network} className={v.icon} />
          </a>
        </li>
      ))}
    </ul>
  )
}
