'use client'

import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { resolveAvatar } from '@/lib/testimonial-avatars'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { canAddEntry, canRemoveEntry } from '@/lib/list-limits'
import {
  authorInitials,
  TESTIMONIAL_AUTHOR_MAX,
  TESTIMONIAL_QUOTE_MAX,
  TESTIMONIAL_ROLE_MAX,
  realTestimonials,
  testimonialsLinkDefaultLabel,
} from '@/lib/testimonials'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

type TestimonialsSection = Extract<WebsiteSchema['sections'][number], { type: 'testimonials' }>

const COPY = {
  tr: {
    sampleBanner:
      'Bunlar örnek yorumlardır. Yalnızca gerçek müşteri yorumlarınızı yayınlayın, uydurma yorum yasal risk ve platform politikası ihlalidir.',
    sampleBadge: 'Örnek',
    title: 'Bölüm başlığı',
    subtitle: 'Alt başlık',
    items: 'Yorumlar',
    count: (n: number, max: number) => `${n} / ${max}`,
    real: (n: number) => `${n} gerçek yorum yayında görünür.`,
    none: 'Henüz gerçek yorum yok; bu bölüm sitenizde görünmez.',
    name: 'Ad',
    role: 'Rol / firma (isteğe bağlı)',
    quote: 'Yorum metni',
    quoteLeft: (n: number) => `${n} karakter kaldı`,
    rating: 'Puan',
    noRating: 'Puan yok',
    star: (n: number) => `${n} yıldız`,
    avatar: 'Avatar',
    changeAvatar: 'Avatarı değiştir',
    useInitials: 'Baş harfler',
    usePhoto: 'Fotoğrafı kullan',
    avatarHint: 'Hazır çizimler arasında gezinir; ücretsizdir, kredi harcamaz. Kartlarda avatar açıksa görünür.',
    photo: 'Fotoğraf',
    photoHint: 'İsteğe bağlı. Yüklediğiniz fotoğraf, avatar yerine kullanılabilir.',
    upload: 'Fotoğraf yükle',
    removePhoto: 'Fotoğrafı kaldır',
    photoAlt: 'Fotoğraf açıklaması',
    add: 'Yorum ekle',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sil',
    page: '/musteri-yorumlari sayfasını oluştur',
    pageHint: 'En az 1 gerçek yorum olduğunda sayfa otomatik yayında olur.',
    avatars: 'Kartlarda avatar göster',
    link: '“Tüm yorumlar” bağlantısını göster',
    linkLabel: '“Tüm yorumlar” bağlantı metni',
  },
  en: {
    sampleBanner:
      'These are sample reviews. Only publish real customer reviews: made-up reviews are a legal risk and violate platform policy.',
    sampleBadge: 'Sample',
    title: 'Section title',
    subtitle: 'Subtitle',
    items: 'Reviews',
    count: (n: number, max: number) => `${n} / ${max}`,
    real: (n: number) => `${n} real review(s) will show on the site.`,
    none: 'No real reviews yet; this section is hidden on your site.',
    name: 'Name',
    role: 'Role / company (optional)',
    quote: 'Review text',
    quoteLeft: (n: number) => `${n} characters left`,
    rating: 'Rating',
    noRating: 'No rating',
    star: (n: number) => `${n} star${n === 1 ? '' : 's'}`,
    avatar: 'Avatar',
    changeAvatar: 'Change avatar',
    useInitials: 'Initials',
    usePhoto: 'Use photo',
    avatarHint: 'Steps through the ready-made illustrations; free, no credits used. Shown when card avatars are on.',
    photo: 'Photo',
    photoHint: 'Optional. An uploaded photo can be used instead of an avatar.',
    upload: 'Upload photo',
    removePhoto: 'Remove photo',
    photoAlt: 'Photo description',
    add: 'Add review',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete',
    page: 'Create the /reviews page',
    pageHint: 'The page goes live automatically once there is at least 1 real review.',
    avatars: 'Show avatars on cards',
    link: 'Show the "all reviews" link',
    linkLabel: '"All reviews" link text',
  },
} as const

function AvatarPreview({ item, position }: { item: TestimonialsSection['items'][number]; position: number }) {
  const avatar = resolveAvatar(item, position, true)
  if (avatar.kind === 'preset') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar.src} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-border object-cover" />
    )
  }
  if (avatar.kind === 'photo' && item.photo?.src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.photo.src} alt="" width={40} height={40} className="h-10 w-10 rounded-full border border-border object-cover" />
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
    >
      {authorInitials(item.author)}
    </span>
  )
}

function Check({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-start gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-brand)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </span>
    </label>
  )
}

export function TestimonialsFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: TestimonialsSection
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const total = section.items.length
  const realCount = realTestimonials(section).length
  const hasSample = section.items.some((item) => item.sample)

  const patchSettings = (patch: Extract<EditOperation, { op: 'updateTestimonialsSettings' }>['patch']) =>
    onDispatch({ op: 'updateTestimonialsSettings', index, patch })
  const patchItem = (item: number, patch: Extract<EditOperation, { op: 'updateTestimonial' }>['patch']) =>
    onDispatch({ op: 'updateTestimonial', index, item, patch })

  return (
    <div className="flex flex-col gap-3" data-testid="testimonials-fields">
      {hasSample && (
        <p
          role="alert"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-relaxed text-foreground"
          data-testid="testimonials-sample-banner"
        >
          {c.sampleBanner}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
        <Check
          label={c.page}
          hint={c.pageHint}
          checked={section.pageEnabled === true}
          onChange={(value) => patchSettings({ pageEnabled: value })}
        />
        <Check
          label={c.avatars}
          checked={section.showAvatars === true}
          onChange={(value) => patchSettings({ showAvatars: value })}
        />
        <Check
          label={c.link}
          checked={section.linkEnabled !== false}
          onChange={(value) => patchSettings({ linkEnabled: value })}
        />
        <TextField
          label={c.linkLabel}
          placeholder={testimonialsLinkDefaultLabel(lang)}
          value={section.linkLabel ?? ''}
          onCommit={(v) => patchSettings({ linkLabel: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.items}</span>
        <span className="text-xs text-muted-foreground">{c.count(total, 24)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{realCount > 0 ? c.real(realCount) : c.none}</p>

      {section.items.map((item, itemIndex) => {
        const left = TESTIMONIAL_QUOTE_MAX - item.quote.length
        return (
          <div
            key={itemIndex}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2"
            data-testid="testimonial-item"
          >
            <div className="flex items-center gap-1">
              <span className="flex flex-1 items-center gap-2 truncate text-xs font-semibold text-muted-foreground">
                {itemIndex + 1}. {item.author || '—'}
                {item.sample && (
                  <span className="rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                    {c.sampleBadge}
                  </span>
                )}
              </span>
              <IconBtn
                label={c.up}
                small
                disabled={itemIndex === 0}
                onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'up' })}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={c.down}
                small
                disabled={itemIndex === total - 1}
                onClick={() => onDispatch({ op: 'moveItem', index, itemIndex, direction: 'down' })}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={c.remove}
                small
                disabled={!canRemoveEntry('testimonials', total)}
                onClick={() => onDispatch({ op: 'removeItem', index, itemIndex })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <TextField
                label={c.name}
                value={item.author}
                onCommit={(v) => patchItem(itemIndex, { author: v.slice(0, TESTIMONIAL_AUTHOR_MAX) })}
              />
              <TextField
                label={c.role}
                value={item.role ?? ''}
                onCommit={(v) => patchItem(itemIndex, { role: v.slice(0, TESTIMONIAL_ROLE_MAX) })}
              />
            </div>

            <TextField
              label={c.quote}
              hint={c.quoteLeft(Math.max(left, 0))}
              multiline
              rows={3}
              value={item.quote}
              onCommit={(v) => patchItem(itemIndex, { quote: v.slice(0, TESTIMONIAL_QUOTE_MAX) })}
            />

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">{c.rating}</span>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={c.rating}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={item.rating === undefined}
                  onClick={() => patchItem(itemIndex, { rating: null })}
                  className={`h-7 rounded-md border px-2 text-xs ${
                    item.rating === undefined
                      ? 'border-brand bg-brand/10 text-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {c.noRating}
                </button>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={item.rating === n}
                    aria-label={c.star(n)}
                    onClick={() => patchItem(itemIndex, { rating: n })}
                    className={`h-7 min-w-7 rounded-md border px-2 text-xs ${
                      item.rating === n
                        ? 'border-brand bg-brand/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{c.avatar}</span>
              <div className="flex flex-wrap items-center gap-2">
                <AvatarPreview item={item} position={itemIndex} />
                <GhostButton onClick={() => onDispatch({ op: 'cycleTestimonialAvatar', index, item: itemIndex })}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {c.changeAvatar}
                </GhostButton>
                <GhostButton onClick={() => patchItem(itemIndex, { avatar: 'initials' })}>{c.useInitials}</GhostButton>
                {item.photo?.src && (
                  <GhostButton onClick={() => patchItem(itemIndex, { avatar: 'photo' })}>{c.usePhoto}</GhostButton>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{c.avatarHint}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{c.photo}</span>
              <div className="flex items-center gap-2">
                {item.photo?.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.photo.src}
                    alt={item.photo.alt || item.author}
                    className="h-10 w-10 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
                  >
                    {authorInitials(item.author)}
                  </span>
                )}
                <UploadButton
                  label={c.upload}
                  icon={<Upload className="h-3.5 w-3.5" />}
                  onFile={(dataUri) => patchItem(itemIndex, { photo: dataUri })}
                />
                {item.photo?.src && (
                  <GhostButton onClick={() => patchItem(itemIndex, { photo: '' })}>{c.removePhoto}</GhostButton>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{c.photoHint}</p>
              {item.photo?.src && (
                <TextField
                  label={c.photoAlt}
                  value={item.photo.alt ?? ''}
                  onCommit={(v) => patchItem(itemIndex, { photoAlt: v })}
                />
              )}
            </div>
          </div>
        )
      })}

      <GhostButton
        disabled={!canAddEntry('testimonials', total)}
        onClick={() => onDispatch({ op: 'addItem', index })}
      >
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </GhostButton>
    </div>
  )
}
