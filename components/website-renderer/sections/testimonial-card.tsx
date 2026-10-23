import { Quote, Star } from 'lucide-react'
import { authorInitials, clampRating, type TestimonialItem } from '@/lib/testimonials'

function Stars({ rating, lang }: { rating: number; lang: 'tr' | 'en' }) {
  return (
    <div
      className="mt-3 flex items-center gap-0.5"
      role="img"
      aria-label={lang === 'en' ? `${rating} out of 5 stars` : `5 üzerinden ${rating} yıldız`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className="h-4 w-4"
          style={{ color: 'var(--site-primary)' }}
          fill={n <= rating ? 'currentColor' : 'none'}
          strokeWidth={n <= rating ? 0 : 1.5}
        />
      ))}
    </div>
  )
}

function Avatar({ item, show }: { item: TestimonialItem; show: boolean }) {
  if (item.photo?.src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- owner upload on an arbitrary tenant origin
      <img
        src={item.photo.src}
        alt={item.photo.alt?.trim() || item.author}
        loading="lazy"
        decoding="async"
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    )
  }
  if (!show) return null
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
      style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
    >
      {authorInitials(item.author)}
    </span>
  )
}

/** One review. Without avatars, photo or rating this is the original card, unchanged. */
export function TestimonialCard({
  item,
  showAvatars,
  lang,
}: {
  item: TestimonialItem
  showAvatars: boolean
  lang: 'tr' | 'en'
}) {
  const rating = clampRating(item.rating)
  const hasAvatar = showAvatars || !!item.photo?.src
  return (
    <figure
      className="flex flex-col p-5"
      style={{
        backgroundColor: 'var(--site-card)',
        border: '1px solid var(--site-border)',
        borderRadius: 'var(--site-radius)',
      }}
    >
      <Quote className="h-5 w-5" style={{ color: 'var(--site-primary)' }} />
      {rating ? <Stars rating={rating} lang={lang} /> : null}
      <blockquote
        className="mt-3 flex-1 text-sm leading-relaxed"
        style={{ color: 'var(--site-fg)', overflowWrap: 'anywhere' }}
      >
        {item.quote}
      </blockquote>
      <figcaption className={`mt-4 text-sm ${hasAvatar ? 'flex items-center gap-3' : ''}`}>
        <Avatar item={item} show={showAvatars} />
        <span className="min-w-0">
          <span className="font-semibold" style={{ color: 'var(--site-fg)' }}>
            {item.author}
          </span>
          {item.role ? (
            <span style={{ color: 'var(--site-muted-fg)' }}>
              {hasAvatar ? <br /> : ' · '}
              {item.role}
            </span>
          ) : null}
        </span>
      </figcaption>
    </figure>
  )
}
