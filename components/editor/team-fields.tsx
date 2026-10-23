'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import { canAddEntry, canRemoveEntry, LIST_LIMITS } from '@/lib/list-limits'
import {
  TEAM_NAME_MAX,
  TEAM_PHONE_MAX,
  TEAM_ROLE_MAX,
  TEAM_SOCIAL_KEYS,
  TEAM_SUBTITLE_MAX,
  TEAM_TITLE_MAX,
  initialsOf,
  isAllowedTeamPhotoDataUri,
  realMembers,
  resolveTeamPortrait,
  type TeamSocialKey,
} from '@/lib/team'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

type TeamSection = Extract<WebsiteSchema['sections'][number], { type: 'team' }>

const MAX = LIST_LIMITS.team.max

const COPY = {
  tr: {
    sampleBanner: 'Bunlar örnek kişilerdir. Kendi ekibinizi yazdığınızda yerini alır.',
    sampleBadge: 'Örnek',
    title: 'Bölüm başlığı',
    subtitle: 'Alt başlık',
    showOnHome: 'Ana sayfada göster',
    page: 'Kadromuz sayfası oluştur',
    pageHint: 'En az 1 kişi (adı yazılı) olduğunda /kadromuz sayfası yayında olur.',
    items: 'Kişiler',
    real: (n: number) => `${n} kişi sitede görünür.`,
    none: 'Henüz isimli kişi yok; bu bölüm sitenizde görünmez.',
    count: (n: number) => `${n} / ${MAX}`,
    name: 'Ad Soyad',
    role: 'Unvan',
    phone: 'Telefon (isteğe bağlı)',
    social: 'Sosyal bağlantılar (isteğe bağlı)',
    socialNames: { facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', email: 'E-posta' },
    changeAvatar: 'Avatarı değiştir',
    useInitials: 'Baş harfler',
    photo: 'Fotoğraf',
    upload: 'Fotoğraf yükle',
    removePhoto: 'Fotoğrafı kaldır',
    photoHint: 'Önerilen: dikey 800×1000 px, PNG, JPG veya WebP, en çok 5 MB.',
    add: 'Kişi ekle',
    kvkk: 'Çalışanlarınızın adını, telefonunu ve fotoğrafını yalnızca onların izniyle yayınlayın.',
    limitReached: `En fazla ${MAX} kişi eklenebilir; yeni kişi eklemek için birini silin.`,
    photoRejected: 'Yalnızca PNG, JPG veya WebP, en çok 5 MB yüklenebilir (SVG kabul edilmez).',
    namePlaceholder: 'Örn. Ayşe Yılmaz',
    rolePlaceholder: 'Örn. Uzman Doktor',
    phonePlaceholder: 'Örn. 0555 555 55 55',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sil',
  },
  en: {
    sampleBanner: 'These are example people. They are replaced once you enter your own team.',
    sampleBadge: 'Example',
    title: 'Section title',
    subtitle: 'Subtitle',
    showOnHome: 'Show on the home page',
    page: 'Create an Our Team page',
    pageHint: 'The /our-team page goes live once at least 1 person has a name.',
    items: 'People',
    real: (n: number) => `${n} people will show on the site.`,
    none: 'No named people yet; this section is hidden on your site.',
    count: (n: number) => `${n} / ${MAX}`,
    name: 'Full name',
    role: 'Job title',
    phone: 'Phone (optional)',
    social: 'Social links (optional)',
    socialNames: { facebook: 'Facebook', instagram: 'Instagram', x: 'X', linkedin: 'LinkedIn', email: 'Email' },
    changeAvatar: 'Change avatar',
    useInitials: 'Use initials',
    photo: 'Photo',
    upload: 'Upload photo',
    removePhoto: 'Remove photo',
    photoHint: 'Recommended: portrait 800×1000 px, PNG, JPG or WebP, 5 MB at most.',
    add: 'Add person',
    kvkk: 'Publish your employees\u2019 name, phone and photo only with their consent.',
    limitReached: `You can add up to ${MAX} people; delete one to add another.`,
    photoRejected: 'Only PNG, JPG or WebP up to 5 MB can be uploaded (SVG is not accepted).',
    namePlaceholder: 'e.g. Jane Smith',
    rolePlaceholder: 'e.g. Senior Consultant',
    phonePlaceholder: 'e.g. 0555 555 55 55',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete',
  },
} as const

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
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

function PortraitPreview({ member, position }: { member: TeamSection['members'][number]; position: number }) {
  const portrait = resolveTeamPortrait(member, position)
  if (portrait.kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={portrait.src} alt="" className="h-12 w-10 rounded-md border border-border object-cover" />
  }
  if (portrait.avatar.kind === 'preset') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={portrait.avatar.src} alt="" className="h-10 w-10 rounded-full border border-border object-cover" />
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground"
    >
      {initialsOf(member.name)}
    </span>
  )
}

export function TeamFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: TeamSection
  onDispatch: (op: EditOperation) => void
}) {
  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const c = COPY[lang]
  const total = section.members.length
  const realCount = realMembers(section).length
  const hasSample = section.members.some((m) => m.sample)
  const [photoError, setPhotoError] = useState<number | null>(null)
  const atLimit = !canAddEntry('team', total)

  // Content-based check (magic bytes + 5 MB), not the file name or declared type; SVG never passes.
  const uploadPhoto = (item: number, dataUri: string) => {
    if (!isAllowedTeamPhotoDataUri(dataUri)) {
      setPhotoError(item)
      return
    }
    setPhotoError(null)
    patchMember(item, { photo: dataUri })
  }

  const patchSettings = (patch: Extract<EditOperation, { op: 'updateTeamSettings' }>['patch']) =>
    onDispatch({ op: 'updateTeamSettings', index, patch })
  const patchMember = (item: number, patch: Extract<EditOperation, { op: 'updateTeamMember' }>['patch']) =>
    onDispatch({ op: 'updateTeamMember', index, item, patch })

  return (
    <div className="flex flex-col gap-3" data-testid="team-fields">
      <p className="rounded-md border border-border bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground" data-testid="team-kvkk">
        {c.kvkk}
      </p>
      {hasSample && (
        <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-relaxed text-foreground">
          {c.sampleBanner}
        </p>
      )}

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2">
        <TextField label={c.title} value={section.title} maxLength={TEAM_TITLE_MAX} onCommit={(v) => patchSettings({ title: v })} />
        <TextField
          label={c.subtitle}
          value={section.subtitle ?? ''}
          maxLength={TEAM_SUBTITLE_MAX}
          onCommit={(v) => patchSettings({ subtitle: v })}
        />
        <Check label={c.showOnHome} checked={section.showOnHome !== false} onChange={(v) => patchSettings({ showOnHome: v })} />
        <Check
          label={c.page}
          hint={c.pageHint}
          checked={section.pageEnabled === true}
          onChange={(v) => patchSettings({ pageEnabled: v })}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.items}</span>
        <span className="text-xs text-muted-foreground">{c.count(total)}</span>
      </div>
      <p className="text-xs text-muted-foreground">{realCount > 0 ? c.real(realCount) : c.none}</p>

      {section.members.map((member, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2" data-testid="team-member">
          <div className="flex items-center gap-1">
            <span className="flex flex-1 items-center gap-2 truncate text-xs font-semibold text-muted-foreground">
              {i + 1}. {member.name || '—'}
              {member.sample && (
                <span className="rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                  {c.sampleBadge}
                </span>
              )}
            </span>
            <IconBtn label={c.up} small disabled={i === 0} onClick={() => onDispatch({ op: 'moveItem', index, itemIndex: i, direction: 'up' })}>
              <ChevronUp className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={c.down}
              small
              disabled={i === total - 1}
              onClick={() => onDispatch({ op: 'moveItem', index, itemIndex: i, direction: 'down' })}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </IconBtn>
            <IconBtn
              label={c.remove}
              small
              disabled={!canRemoveEntry('team', total)}
              onClick={() => onDispatch({ op: 'removeItem', index, itemIndex: i })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={c.name}
              value={member.name}
              placeholder={c.namePlaceholder}
              maxLength={TEAM_NAME_MAX}
              onCommit={(v) => patchMember(i, { name: v })}
            />
            <TextField
              label={c.role}
              value={member.role}
              placeholder={c.rolePlaceholder}
              maxLength={TEAM_ROLE_MAX}
              onCommit={(v) => patchMember(i, { role: v })}
            />
          </div>
          <TextField
            label={c.phone}
            value={member.phone ?? ''}
            placeholder={c.phonePlaceholder}
            maxLength={TEAM_PHONE_MAX}
            onCommit={(v) => patchMember(i, { phone: v })}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{c.photo}</span>
            <div className="flex flex-wrap items-center gap-2">
              <PortraitPreview member={member} position={i} />
              <UploadButton
                label={c.upload}
                accept="image/png,image/jpeg,image/webp"
                icon={<Upload className="h-3.5 w-3.5" />}
                onFile={(dataUri) => uploadPhoto(i, dataUri)}
              />
              {member.src && <GhostButton onClick={() => patchMember(i, { photo: '' })}>{c.removePhoto}</GhostButton>}
              <GhostButton onClick={() => onDispatch({ op: 'cycleTeamAvatar', index, item: i })}>
                <RefreshCw className="h-3.5 w-3.5" />
                {c.changeAvatar}
              </GhostButton>
              <GhostButton onClick={() => patchMember(i, { avatar: 'initials' })}>{c.useInitials}</GhostButton>
            </div>
            <p className="text-xs text-muted-foreground">{c.photoHint}</p>
            {photoError === i && (
              <p role="alert" className="text-xs text-destructive">
                {c.photoRejected}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{c.social}</span>
            <div className="grid grid-cols-2 gap-2">
              {TEAM_SOCIAL_KEYS.map((key: TeamSocialKey) => (
                <TextField
                  key={key}
                  label={c.socialNames[key]}
                  value={member.social?.[key] ?? ''}
                  placeholder={key === 'email' ? 'ad@firma.com' : 'https://'}
                  onCommit={(v) => patchMember(i, { social: { [key]: v } })}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      <GhostButton disabled={atLimit} onClick={() => onDispatch({ op: 'addItem', index })}>
        <Plus className="h-3.5 w-3.5" />
        {c.add}
      </GhostButton>
      {atLimit && <p className="text-xs text-muted-foreground">{c.limitReached}</p>}
    </div>
  )
}
