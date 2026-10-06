import { Phone } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import { resolveContactActions } from '@/lib/site-contact-actions'

/**
 * SiteFloatingActions
 * -------------------
 * The phone + WhatsApp call buttons pinned to every page of a GENERATED site,
 * matching the pair the demo sites ship with.
 *
 * Rendered once per page by `WebsiteRenderer`, so they never duplicate. Pinned
 * bottom-LEFT because the bottom-right corner already belongs to the BackToTop
 * control and the platform credit.
 *
 * Numbers come from `resolveContactActions`, which falls back to the site's own
 * contact section — so a site saved before this feature existed still gets
 * working buttons. Returns null when the owner removed them or no number exists.
 *
 * Server component: plain links, CSS-only hover, no client JS. Reads
 * `--site-primary`, so it must render inside the themed site wrapper.
 */

/** Official WhatsApp glyph (single path), tinted via `currentColor`. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a12.062 12.062 0 005.71 1.447h.006c6.585 0 11.946-5.335 11.949-11.896 0-3.176-1.24-6.165-3.495-8.411" />
    </svg>
  )
}

/** Desktop-only tooltip sitting to the RIGHT of the fixed button. */
function Tooltip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-black/85 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 md:block"
    >
      {text}
    </span>
  )
}

export function SiteFloatingActions({
  site,
  planCode,
}: {
  site: WebsiteSchema
  /** Site OWNER's plan. Buttons are hidden on FREE (a paid feature). */
  planCode?: string | null
}) {
  const actions = resolveContactActions(site, planCode)
  if (!actions) return null

  const lang = site.meta.language
  const waLabel = lang === 'tr' ? "WhatsApp'tan yaz" : 'Message on WhatsApp'
  const callLabel = lang === 'tr' ? 'Telefonla ara' : 'Call us'

  return (
    <div
      className="fixed left-4 z-[9998] flex flex-col gap-3 sm:left-6"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
    >
      {actions.whatsapp && (
        <a
          href={actions.whatsapp.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`${waLabel}: ${actions.whatsapp.display}`}
          className="group relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-white shadow-lg outline-none ring-offset-2 transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-white active:scale-95 sm:h-14 sm:w-14"
          style={{ backgroundColor: '#25D366' }}
        >
          <Tooltip text={waLabel} />
          <WhatsAppIcon className="h-6 w-6 sm:h-7 sm:w-7" />
        </a>
      )}

      {actions.phone && (
        <a
          href={actions.phone.href}
          aria-label={`${callLabel}: ${actions.phone.display}`}
          className="group relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-full shadow-lg outline-none ring-offset-2 transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-white active:scale-95 sm:h-14 sm:w-14"
          style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          <Tooltip text={callLabel} />
          <Phone className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
        </a>
      )}
    </div>
  )
}
