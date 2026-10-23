import type { ReferenceItem } from '@/lib/references'

/**
 * One client logo tile. Always a light 2:1 plate so every logo (white-background JPGs, transparent PNGs,
 * dark or light themes) sits on the same footing and the carousel / grid stay evenly sized. Logos are
 * contained, never cropped or stretched. A reference without an image falls back to its name as text.
 * Logos are not links.
 */
export function ReferenceLogo({ item, index = 0 }: { item: ReferenceItem; index?: number }) {
  const label = item.name.trim()
  const alt = item.logo?.alt?.trim() || label || `Referans ${index + 1}`
  return (
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
}
