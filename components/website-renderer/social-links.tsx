import { KEEP_INTERACTIVE_PROPS } from '@/lib/preview-interactive'

export type SocialLinkItem = {
  /** Visible/accessible name, e.g. "Instagram". */
  label: string
  url: string
}

/**
 * Slot for the social media icons under the contact block's address.
 * Data model, validation and editor are a separate job; until links are passed
 * this renders nothing at all, so it never reserves empty space.
 */
export function SocialLinks({ links }: { links?: SocialLinkItem[] }) {
  if (!links || links.length === 0) return null

  return (
    <ul className="mt-6 flex flex-wrap items-center gap-3" aria-label="Social media">
      {links.map((link) => (
        <li key={link.url}>
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            {...KEEP_INTERACTIVE_PROPS}
            className="inline-flex h-10 items-center justify-center px-3 text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              color: 'var(--site-primary)',
              border: '1px solid var(--site-border)',
              borderRadius: 'var(--site-radius)',
            }}
          >
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  )
}
