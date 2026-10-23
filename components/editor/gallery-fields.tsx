'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Plus, Trash2, Upload, Video } from 'lucide-react'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { EditOperation } from '@/lib/website-edit-operations'
import {
  addAlbum,
  albumKey,
  GENERAL_ALBUM,
  renameAlbum,
  type GalleryError,
  type GallerySection,
} from '@/lib/gallery-albums'
import { parseGalleryVideoUrl } from '@/lib/gallery-video'
import {
  GALLERY_ALBUMS_MAX,
  GALLERY_ALBUM_NAME_MAX,
  GALLERY_IMAGES_MAX,
  GALLERY_VIDEOS_MAX,
  GALLERY_VIDEO_NAME_MAX,
} from '@/lib/list-limits'
import {
  GALLERY_RECOMMENDED_SIZE,
  GALLERY_UPLOAD_ACCEPT,
  isGalleryAltMissing,
  sortGalleryUploads,
  suggestGalleryAlt,
} from '@/lib/gallery-editor'
import { GhostButton, IconBtn, TextField, UploadButton } from '@/components/editor/editor-fields'

const COPY = {
  tr: {
    hint: 'Bu bölüm /galeri ve /videolar sayfalarını oluşturur; menüye Sayfalar panelinden ekleyin.',
    sizeHint: `Önerilen görsel boyutu: ${GALLERY_RECOMMENDED_SIZE.width}×${GALLERY_RECOMMENDED_SIZE.height} px, en çok 5 MB (PNG, JPG veya WebP).`,
    albums: 'Albümler',
    albumsCount: (n: number) => `${n} / ${GALLERY_ALBUMS_MAX}`,
    albumName: 'Albüm adı',
    albumPlaceholder: 'Örn. Firmamızdan Kareler',
    add: 'Ekle',
    rename: 'Albüm adı',
    up: 'Yukarı taşı',
    down: 'Aşağı taşı',
    remove: 'Sil',
    general: `${GENERAL_ALBUM} albümü her zaman vardır; yeniden adlandırılamaz ve silinemez.`,
    images: (n: number) => `${n} görsel`,
    confirmTitle: (name: string) => `“${name}” albümü silinsin mi?`,
    confirmBody: (n: number) =>
      n > 0 ? `Bu albümdeki ${n} görsel “${GENERAL_ALBUM}” albümüne taşınacak. Görseller silinmez.` : 'Bu albümde görsel yok.',
    confirmYes: 'Albümü sil',
    confirmNo: 'Vazgeç',
    albumLabel: 'Albüm',
    altLabel: 'Alt metin (zorunlu)',
    altSuggest: 'Önerilen metni kullan',
    altMissing: 'Alt metin boş; erişilebilirlik ve arama için gereklidir.',
    uploadMany: 'Görselleri yükle (çoklu)',
    uploadCount: (n: number) => `${n} görsel eklendi.`,
    uploadFull: (n: number) => `${n} görsel sınır nedeniyle eklenmedi (en çok ${GALLERY_IMAGES_MAX}).`,
    uploadType: (name: string) => `${name}: yalnızca PNG, JPG veya WebP yüklenebilir.`,
    uploadSize: (name: string) => `${name}: görsel en fazla 5 MB olabilir.`,
    videos: 'Videolar',
    videosCount: (n: number) => `${n} / ${GALLERY_VIDEOS_MAX}`,
    videoName: 'Video adı',
    videoNamePlaceholder: 'Örn. Demo 1',
    videoUrl: 'YouTube bağlantısı',
    videoUrlPlaceholder: 'YouTube bağlantısını yapıştırın',
    addVideo: 'Video ekle',
    videoAdding: 'Ekleniyor…',
    videoNotUploaded: 'Videolar siteye yüklenmez; yalnızca YouTube bağlantısı saklanır.',
    coverLabel: 'Kapak görseli',
    coverMissing: 'Kapak indirilemedi. İsterseniz kendi kapak görselinizi yükleyebilirsiniz; yoksa tema renkli kart gösterilir.',
    coverUpload: 'Kapak yükle',
    coverRemove: 'Kapağı kaldır',
    errors: {
      empty: 'Ad boş olamaz.',
      duplicate: 'Bu adla başka bir kayıt var (büyük/küçük harf fark etmez).',
      reserved: `“${GENERAL_ALBUM}” adı ayrılmıştır.`,
      full: 'Sınıra ulaşıldı.',
      missing: 'Kayıt bulunamadı.',
      invalid_url: 'Geçerli bir YouTube bağlantısı girin (örn. https://www.youtube.com/watch?v=...).',
      invalid_cover: 'Kapak görseli geçersiz.',
    } satisfies Record<GalleryError, string>,
  },
  en: {
    hint: 'This section creates the /galeri and /videolar pages; add them to the menu from the Pages panel.',
    sizeHint: `Recommended image size: ${GALLERY_RECOMMENDED_SIZE.width}×${GALLERY_RECOMMENDED_SIZE.height} px, at most 5 MB (PNG, JPG or WebP).`,
    albums: 'Albums',
    albumsCount: (n: number) => `${n} / ${GALLERY_ALBUMS_MAX}`,
    albumName: 'Album name',
    albumPlaceholder: 'e.g. Snapshots from our team',
    add: 'Add',
    rename: 'Album name',
    up: 'Move up',
    down: 'Move down',
    remove: 'Delete',
    general: `The ${GENERAL_ALBUM} album always exists; it cannot be renamed or deleted.`,
    images: (n: number) => `${n} image${n === 1 ? '' : 's'}`,
    confirmTitle: (name: string) => `Delete the "${name}" album?`,
    confirmBody: (n: number) =>
      n > 0 ? `The ${n} image${n === 1 ? '' : 's'} in this album will move to "${GENERAL_ALBUM}". Images are not deleted.` : 'This album has no images.',
    confirmYes: 'Delete album',
    confirmNo: 'Cancel',
    albumLabel: 'Album',
    altLabel: 'Alt text (required)',
    altSuggest: 'Use suggested text',
    altMissing: 'Alt text is empty; it is required for accessibility and search.',
    uploadMany: 'Upload images (multiple)',
    uploadCount: (n: number) => `${n} image${n === 1 ? '' : 's'} added.`,
    uploadFull: (n: number) => `${n} image${n === 1 ? '' : 's'} skipped because of the limit (max ${GALLERY_IMAGES_MAX}).`,
    uploadType: (name: string) => `${name}: only PNG, JPG or WebP can be uploaded.`,
    uploadSize: (name: string) => `${name}: an image can be at most 5 MB.`,
    videos: 'Videos',
    videosCount: (n: number) => `${n} / ${GALLERY_VIDEOS_MAX}`,
    videoName: 'Video name',
    videoNamePlaceholder: 'e.g. Demo 1',
    videoUrl: 'YouTube link',
    videoUrlPlaceholder: 'Paste the YouTube link',
    addVideo: 'Add video',
    videoAdding: 'Adding…',
    videoNotUploaded: 'Videos are not uploaded to your site; only the YouTube link is stored.',
    coverLabel: 'Cover image',
    coverMissing: 'The cover could not be downloaded. You can upload your own cover; otherwise a themed card is shown.',
    coverUpload: 'Upload cover',
    coverRemove: 'Remove cover',
    errors: {
      empty: 'The name cannot be empty.',
      duplicate: 'Another entry already uses this name (case does not matter).',
      reserved: `"${GENERAL_ALBUM}" is a reserved name.`,
      full: 'The limit has been reached.',
      missing: 'Entry not found.',
      invalid_url: 'Enter a valid YouTube link (e.g. https://www.youtube.com/watch?v=...).',
      invalid_cover: 'The cover image is not valid.',
    } satisfies Record<GalleryError, string>,
  },
} as const

type Dispatch = (op: EditOperation) => void
type Lang = 'tr' | 'en'

const langOf = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

const fieldClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground'

/** A plain controlled input whose placeholder disappears as soon as it is focused. */
function DraftInput({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  onEnter,
  testId,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  maxLength?: number
  onEnter?: () => void
  testId?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        data-testid={testId}
        placeholder={focused ? '' : placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229 && onEnter) {
            e.preventDefault()
            onEnter()
          }
        }}
        className={fieldClass}
      />
    </label>
  )
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' && reader.result ? resolve(reader.result) : reject(new Error('empty')))
    reader.onerror = () => reject(reader.error ?? new Error('read'))
    reader.readAsDataURL(file)
  })
}

/* -------------------------------------------------------------------------- */
/*  Section-level block: hint + multi upload + albums + videos                */
/* -------------------------------------------------------------------------- */

export function GalleryFields({
  site,
  index,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  section: GallerySection
  onDispatch: Dispatch
}) {
  const lang = langOf(site)
  const c = COPY[lang]
  return (
    <div className="flex flex-col gap-4" data-testid="gallery-fields">
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-secondary/40 p-2.5 text-xs leading-relaxed text-muted-foreground">
        <p data-testid="gallery-pages-hint">{c.hint}</p>
        <p data-testid="gallery-size-hint">{c.sizeHint}</p>
      </div>
      <GalleryMultiUpload lang={lang} index={index} section={section} onDispatch={onDispatch} />
      <GalleryAlbumsBlock lang={lang} index={index} section={section} onDispatch={onDispatch} />
      <GalleryVideosBlock lang={lang} index={index} section={section} onDispatch={onDispatch} />
    </div>
  )
}

function GalleryMultiUpload({
  lang,
  index,
  section,
  onDispatch,
}: {
  lang: Lang
  index: number
  section: GallerySection
  onDispatch: Dispatch
}) {
  const c = COPY[lang]
  const ref = useRef<HTMLInputElement>(null)
  const [messages, setMessages] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const room = GALLERY_IMAGES_MAX - section.items.length

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length === 0) return
    const { accepted, rejected } = sortGalleryUploads(files, room)
    const notes: string[] = []
    let full = 0
    for (const { file, problem } of rejected) {
      if (problem === 'full') full += 1
      else notes.push(problem === 'type' ? c.uploadType(file.name) : c.uploadSize(file.name))
    }
    if (full) notes.push(c.uploadFull(full))
    setBusy(true)
    try {
      const results = await Promise.allSettled(accepted.map(readAsDataUri))
      const images = results.flatMap((r) => (r.status === 'fulfilled' ? [{ src: r.value }] : []))
      if (images.length > 0) {
        onDispatch({ op: 'addGalleryImages', index, images })
        notes.unshift(c.uploadCount(images.length))
      }
    } finally {
      setBusy(false)
      setMessages(notes)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <GhostButton disabled={busy || room <= 0} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
        {c.uploadMany}
      </GhostButton>
      <input
        ref={ref}
        type="file"
        multiple
        accept={GALLERY_UPLOAD_ACCEPT}
        className="sr-only"
        data-testid="gallery-multi-upload"
        aria-label={c.uploadMany}
        onChange={(e) => {
          const files = e.target.files
          void onFiles(files).finally(() => {
            e.target.value = ''
          })
        }}
      />
      {messages.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" role="status" data-testid="gallery-upload-messages">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Albums                                                                    */
/* -------------------------------------------------------------------------- */

function GalleryAlbumsBlock({
  lang,
  index,
  section,
  onDispatch,
}: {
  lang: Lang
  index: number
  section: GallerySection
  onDispatch: Dispatch
}) {
  const c = COPY[lang]
  const albums = section.albums ?? []
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const countOf = (albumName: string) =>
    section.items.filter((item) => item.album !== undefined && albumKey(item.album) === albumKey(albumName)).length

  function submit() {
    const result = addAlbum(section, name)
    if (!result.ok) {
      setError(c.errors[result.error])
      return
    }
    setError(null)
    onDispatch({ op: 'addAlbum', index, name })
    setName('')
  }

  const confirming = albums.find((a) => a.id === confirmId)

  return (
    <div className="flex flex-col gap-2" data-testid="gallery-albums">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.albums}</span>
        <span className="text-[11px] text-muted-foreground">{c.albumsCount(albums.length)}</span>
      </div>

      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <DraftInput
            label={c.albumName}
            value={name}
            maxLength={GALLERY_ALBUM_NAME_MAX}
            placeholder={c.albumPlaceholder}
            onChange={(v) => {
              setName(v)
              setError(null)
            }}
            onEnter={submit}
            testId="gallery-album-input"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={albums.length >= GALLERY_ALBUMS_MAX}
          className="flex h-[38px] items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          data-testid="gallery-album-add"
        >
          <Plus className="h-3.5 w-3.5" />
          {c.add}
        </button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert" data-testid="gallery-album-error">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {albums.map((album, i) => (
          <li key={album.id} className="flex flex-col gap-1 rounded-lg border border-border bg-background/60 p-2" data-testid="gallery-album-row">
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <TextField
                  label={c.rename}
                  value={album.name}
                  maxLength={GALLERY_ALBUM_NAME_MAX}
                  onCommit={(v) => {
                    const result = renameAlbum(section, album.id, v)
                    if (!result.ok) {
                      setError(c.errors[result.error])
                      return
                    }
                    setError(null)
                    onDispatch({ op: 'renameAlbum', index, albumId: album.id, name: v })
                  }}
                />
              </div>
              <IconBtn
                label={c.up}
                small
                disabled={i === 0}
                onClick={() => onDispatch({ op: 'moveAlbum', index, albumId: album.id, direction: 'up' })}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={c.down}
                small
                disabled={i === albums.length - 1}
                onClick={() => onDispatch({ op: 'moveAlbum', index, albumId: album.id, direction: 'down' })}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn label={`${c.remove}: ${album.name}`} small onClick={() => setConfirmId(album.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
            <span className="text-[11px] text-muted-foreground">
              /{album.slug} · {c.images(countOf(album.name))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-snug text-muted-foreground/80">{c.general}</p>

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="gallery-album-confirm-title"
          aria-describedby="gallery-album-confirm-body"
          className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3"
          data-testid="gallery-album-confirm"
        >
          <p id="gallery-album-confirm-title" className="text-sm font-semibold">
            {c.confirmTitle(confirming.name)}
          </p>
          <p id="gallery-album-confirm-body" className="text-xs leading-relaxed text-muted-foreground">
            {c.confirmBody(countOf(confirming.name))}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <GhostButton onClick={() => setConfirmId(null)}>{c.confirmNo}</GhostButton>
            <button
              type="button"
              className="rounded-lg bg-destructive py-2 text-xs font-medium text-white transition-opacity hover:opacity-90"
              data-testid="gallery-album-confirm-yes"
              onClick={() => {
                onDispatch({ op: 'removeAlbum', index, albumId: confirming.id })
                setConfirmId(null)
              }}
            >
              {c.confirmYes}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Videos                                                                    */
/* -------------------------------------------------------------------------- */

type CoverResponse = { cover?: { src?: string } | null }

async function requestCover(url: string): Promise<{ src: string } | null> {
  try {
    const res = await fetch('/api/gallery-video-cover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as CoverResponse
    return data.cover?.src ? { src: data.cover.src } : null
  } catch {
    return null
  }
}

function GalleryVideosBlock({
  lang,
  index,
  section,
  onDispatch,
}: {
  lang: Lang
  index: number
  section: GallerySection
  onDispatch: Dispatch
}) {
  const c = COPY[lang]
  const videos = section.videos ?? []
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [coverNote, setCoverNote] = useState(false)

  async function submit() {
    if (busy) return
    if (!parseGalleryVideoUrl(url)) {
      setError(c.errors.invalid_url)
      return
    }
    if (videos.length >= GALLERY_VIDEOS_MAX) {
      setError(c.errors.full)
      return
    }
    setError(null)
    setBusy(true)
    const cover = await requestCover(url)
    setBusy(false)
    setCoverNote(!cover)
    onDispatch({ op: 'addVideo', index, url, name: name.trim() || undefined, ...(cover ? { cover } : {}) })
    setName('')
    setUrl('')
  }

  return (
    <div className="flex flex-col gap-2" data-testid="gallery-videos">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{c.videos}</span>
        <span className="text-[11px] text-muted-foreground">{c.videosCount(videos.length)}</span>
      </div>

      <DraftInput
        label={c.videoName}
        value={name}
        maxLength={GALLERY_VIDEO_NAME_MAX}
        placeholder={c.videoNamePlaceholder}
        onChange={setName}
        testId="gallery-video-name"
      />
      <DraftInput
        label={c.videoUrl}
        value={url}
        placeholder={c.videoUrlPlaceholder}
        onChange={(v) => {
          setUrl(v)
          setError(null)
        }}
        onEnter={() => void submit()}
        testId="gallery-video-url"
      />
      {error && (
        <p className="text-xs text-destructive" role="alert" data-testid="gallery-video-error">
          {error}
        </p>
      )}
      <GhostButton disabled={busy || videos.length >= GALLERY_VIDEOS_MAX} onClick={() => void submit()}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
        {busy ? c.videoAdding : c.addVideo}
      </GhostButton>
      <p className="text-[11px] leading-snug text-muted-foreground/80">{c.videoNotUploaded}</p>
      {coverNote && (
        <p className="text-xs text-muted-foreground" role="status" data-testid="gallery-video-cover-note">
          {c.coverMissing}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {videos.map((video, i) => (
          <li key={video.id} className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-2" data-testid="gallery-video-row">
            <div className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <TextField
                  label={c.videoName}
                  value={video.name}
                  maxLength={GALLERY_VIDEO_NAME_MAX}
                  onCommit={(v) => onDispatch({ op: 'updateVideo', index, id: video.id, name: v })}
                />
              </div>
              <IconBtn
                label={c.up}
                small
                disabled={i === 0}
                onClick={() => onDispatch({ op: 'moveVideo', index, id: video.id, direction: 'up' })}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={c.down}
                small
                disabled={i === videos.length - 1}
                onClick={() => onDispatch({ op: 'moveVideo', index, id: video.id, direction: 'down' })}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={`${c.remove}: ${video.name}`}
                small
                onClick={() => onDispatch({ op: 'removeVideo', index, id: video.id })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{video.url}</p>
            <div className="flex items-center gap-2">
              {video.cover?.src ? (
                // eslint-disable-next-line @next/next/no-img-element -- stored cover (data URI or storage URL)
                <img src={video.cover.src} alt="" className="h-12 w-20 rounded-md border border-border object-cover" />
              ) : (
                <div className="flex h-12 w-20 items-center justify-center rounded-md border border-border bg-primary/15 text-primary">
                  <Video className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className="grid flex-1 gap-1.5">
                <UploadButton
                  label={c.coverUpload}
                  icon={<Upload className="h-3.5 w-3.5" />}
                  onFile={(src) => onDispatch({ op: 'updateVideo', index, id: video.id, cover: { src, alt: video.name } })}
                />
                {video.cover && (
                  <GhostButton onClick={() => onDispatch({ op: 'updateVideo', index, id: video.id, cover: null })}>
                    {c.coverRemove}
                  </GhostButton>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Per-image extras: album picker + required alt text                        */
/* -------------------------------------------------------------------------- */

export function GalleryItemExtras({
  site,
  index,
  itemIndex,
  section,
  onDispatch,
}: {
  site: WebsiteSchema
  index: number
  itemIndex: number
  section: GallerySection
  onDispatch: Dispatch
}) {
  const lang = langOf(site)
  const c = COPY[lang]
  const item = section.items[itemIndex]
  if (!item) return null
  const albums = section.albums ?? []
  const current = item.album ? albums.find((a) => albumKey(a.name) === albumKey(item.album)) : undefined
  const missing = isGalleryAltMissing(item)
  const suggestion = suggestGalleryAlt({ businessName: site.meta.name, album: current?.name }, itemIndex, lang)

  return (
    <div className="flex flex-col gap-2" data-testid="gallery-item-extras">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{c.albumLabel}</span>
        <select
          value={current?.id ?? ''}
          onChange={(e) => onDispatch({ op: 'setImageAlbum', index, itemIndex, albumId: e.target.value || undefined })}
          className={fieldClass}
          data-testid="gallery-item-album"
        >
          <option value="">{GENERAL_ALBUM}</option>
          {albums.map((album) => (
            <option key={album.id} value={album.id}>
              {album.name}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label={c.altLabel}
        value={item.alt ?? ''}
        onCommit={(v) => onDispatch({ op: 'updateItemField', index, itemIndex, field: 'alt', value: v })}
      />
      {missing && (
        <div className="flex flex-col gap-1.5" data-testid="gallery-alt-missing">
          <p className="text-xs text-destructive">{c.altMissing}</p>
          <GhostButton onClick={() => onDispatch({ op: 'updateItemField', index, itemIndex, field: 'alt', value: suggestion })}>
            {c.altSuggest}: {suggestion}
          </GhostButton>
        </div>
      )}
    </div>
  )
}
