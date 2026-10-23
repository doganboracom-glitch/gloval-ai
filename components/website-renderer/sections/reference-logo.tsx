import { safeReferenceUrl, type ReferenceItem } from '@/lib/references'

/** One client logo tile. Falls back to the name as text when there is no logo image. */
export function ReferenceLogo({ item, size = 'md' }: { item: ReferenceItem; size?: 'md' | 'lg' }) {
  const href = safeReferenceUrl(item.url)
  const label = item.name.trim()
  const box = size === 'lg' ? 'h-28' : 'h-20'
  const body = item.logo?.src ? (
    // eslint-disable-next-line @next/next/no-img-element -- owner upload on an arbitrary tenant origin
    <img
      src={item.logo.src}
      alt={item.logo.alt?.trim() || label}
      loading="lazy"
      decoding="async"
      className="max-h-full max-w-full object-contain"
    />
  ) : (
    <span className="text-center text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
      {label}
    </span>
  )
  const style = {
    border: '1px solid var(--site-border)',
    borderRadius: 'var(--site-radius)',
    backgroundColor: 'var(--site-card)',
  } as const
  const className = `flex ${box} w-full items-center justify-center p-4`
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={label || undefined}
      title={label || undefined}
      className={`${className} transition-opacity hover:opacity-80`}
      style={style}
    >
      {body}
    </a>
  ) : (
    <div className={className} style={style} title={label || undefined}>
      {body}
    </div>
  )
}
