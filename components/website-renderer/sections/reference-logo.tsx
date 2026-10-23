import type { ReferenceItem } from '@/lib/references'
import { safeReferenceUrl } from '@/lib/references'

/**
 * One client logo tile. Always a light 2:1 plate so every logo (white-background JPGs, transparent PNGs,
 * dark or light themes) sits on the same footing and the carousel / grid stay evenly sized. Logos are
 * contained, never cropped or stretched. A reference without an image falls back to its name as text.
 * A logo is a link only when the owner entered a valid website address; otherwise the markup is the
 * plain plate, exactly as before.
 */
export function ReferenceLogo({
  item,
  index = 0,
  lang = 'tr',
  focusable = true,
}: {
  item: ReferenceItem
  index?: number
  lang?: 'tr' | 'en'
  /** `false` for the aria-hidden duplicate copies in the carousel: still clickable, but skipped by Tab. */
  focusable?: boolean
}) {
  const label = item.name.trim()
  const alt = item.logo?.alt?.trim() || label || `Referans ${index + 1}`
  const plate = (
    <div
      className="flex aspect-[2/1] w-full items-center justify-center overflow-hidden p-4"
      style={{
        backgroundColor: '#ffffff',
        border: '1px solid rgba(15, 23, 42, 0.1)',
        borderRadius: 'var(--site-radius)',
      }}
    >
      {item.logo?.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- owner upload on an arbitrary tenant origin
        <img
          src={item.logo.src}
          alt={alt}
          width={600}
          height={300}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="text-center text-sm font-semibold" style={{ color: '#0f172a' }}>
          {label}
        </span>
      )}
    </div>
  )

  const href = safeReferenceUrl(item.url)
  if (!href) return plate

  const name = label || (lang === 'en' ? `Reference ${index + 1}` : `Referans ${index + 1}`)
  const ariaLabel = lang === 'en' ? `${name} website (opens in a new tab)` : `${name} web sitesi (yeni sekmede açılır)`
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={ariaLabel}
      tabIndex={focusable ? undefined : -1}
      data-reference-link
      className="block cursor-pointer transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ borderRadius: 'var(--site-radius)', outlineColor: 'var(--site-primary)' }}
    >
      {plate}
    </a>
  )
}
