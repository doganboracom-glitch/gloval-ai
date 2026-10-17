'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, Bold, ImagePlus, Link2, List, Heading2, Loader2, Sparkles, Trash2 } from 'lucide-react'
import { createBlogPostAction, updateBlogPostAction } from '@/lib/blog-actions'
import { parseLegalMarkup } from '@/lib/legal-markup'
import { sanitizeBlogBody, type BlogPost } from '@/lib/blog'
import { detectUnverifiedClaims, type BlogClaimFinding } from '@/lib/blog-trust'
import { LegalBlocks } from '@/components/legal/legal-blocks'
import { COVER_STYLES, COVER_STYLE_LABELS, DEFAULT_COVER_STYLE, type CoverStyle } from '@/lib/blog-cover'

type Lang = 'tr' | 'en'
type Mode = 'draft' | 'published' | 'scheduled'

const COVER_TIMEOUT_MS = 120_000

const T = {
  tr: {
    back: 'Yazılar',
    title: 'Başlık',
    excerpt: 'Kısa özet',
    body: 'İçerik',
    edit: 'Yaz',
    preview: 'Önizleme',
    bodyHint: 'Başlık için ##, kalın için **metin**, liste için - kullanın.',
    seo: 'Arama sonucu görünümü',
    seoTitle: 'SEO başlığı',
    metaDescription: 'Meta açıklama',
    keywords: 'Anahtar kelimeler (virgülle)',
    indexable: 'Arama motorları bu yazıyı dizinleyebilir',
    cover: 'Kapak görseli',
    coverAlt: 'Görselin alternatif metni',
    coverAltHint: 'Görseli görmeyenler için kısa bir tanım yazın.',
    upload: 'Yükle',
    generate: 'Yapay zekayla üret',
    removeCover: 'Kaldır',
    status: 'Yayın durumu',
    draft: 'Taslak',
    published: 'Hemen yayınla',
    scheduled: 'Planla',
    publishAt: 'Yayın zamanı',
    errPublishAt: 'Planlamak için geçerli bir yayın zamanı seçin.',
    save: 'Kaydet',
    saved: 'Kaydedildi.',
    claimsTitle: 'Doğrulanmamış iddialar bulundu',
    claimsBody: 'Yayınlamadan önce bu ifadelerin gerçek olduğunu onaylayın veya metinden çıkarın.',
    claimOk: 'Bu ifade doğru, onaylıyorum',
    sampleTitle: 'Örnek içerik',
    sampleBody: 'Bu yazı örnek olarak eklenmişti. Kendi işletmenize uygun olduğunu onaylayarak yayınlayabilirsiniz.',
    sampleOk: 'Bu yazı işletmem için geçerli, yayınlamak istiyorum',
    errTitle: 'Başlık gerekli.',
    errAlt: 'Kapak görseli için alternatif metin gerekli.',
    errSuspended: 'Aboneliğiniz askıda olduğu için yayınlanamaz. Taslak olarak kaydedebilirsiniz.',
    errLimit: (n: number) => `En fazla ${n} yazı ekleyebilirsiniz.`,
    errGeneric: 'Kaydedilemedi. Lütfen tekrar deneyin.',
    errCover: 'Görsel eklenemedi.',
    coverCredits: 'Görsel üretimi AI kredisi harcar; üretilemeyen veya uygun bulunmayan görsel için kredi düşmez.',
    coverStyle: 'Görsel stili',
    errCoverRejected: 'Uygun bir görsel üretilemedi (görselde yazı veya kişi çıktı). Kredin düşülmedi; farklı bir stil deneyebilir veya görsel yükleyebilirsin.',
    errCoverFailed: 'Görsel üretilemedi. Kredin düşülmedi; tekrar deneyebilirsin.',
    errCoverBusy: 'Zaten bir görsel üretiliyor, lütfen bekleyin.',
    coverPlaceholder: 'Kapak yok',
    coverGenerating: 'Görsel hazırlanıyor, yaklaşık 30 saniye sürebilir.',
    errCoverTimeout: 'Görsel zamanında hazırlanamadı. Kredin düşülmedi; lütfen tekrar dene.',
    chars: 'karakter',
  },
  en: {
    back: 'Posts',
    title: 'Title',
    excerpt: 'Short summary',
    body: 'Content',
    edit: 'Write',
    preview: 'Preview',
    bodyHint: 'Use ## for headings, **text** for bold, and - for lists.',
    seo: 'Search result appearance',
    seoTitle: 'SEO title',
    metaDescription: 'Meta description',
    keywords: 'Keywords (comma separated)',
    indexable: 'Search engines may index this post',
    cover: 'Cover image',
    coverAlt: 'Image alt text',
    coverAltHint: 'Write a short description for people who cannot see the image.',
    upload: 'Upload',
    generate: 'Generate with AI',
    removeCover: 'Remove',
    status: 'Publishing',
    draft: 'Draft',
    published: 'Publish now',
    scheduled: 'Schedule',
    publishAt: 'Publish at',
    errPublishAt: 'Pick a valid publish time to schedule.',
    save: 'Save',
    saved: 'Saved.',
    claimsTitle: 'Unverified claims found',
    claimsBody: 'Confirm these statements are true or remove them before publishing.',
    claimOk: 'This is accurate, I confirm',
    sampleTitle: 'Sample content',
    sampleBody: 'This post was added as a sample. You can publish it after confirming it fits your business.',
    sampleOk: 'This post is accurate for my business, publish it',
    errTitle: 'A title is required.',
    errAlt: 'Alt text is required for the cover image.',
    errSuspended: 'Your subscription is suspended, so publishing is blocked. You can still save drafts.',
    errLimit: (n: number) => `You can add up to ${n} posts.`,
    errGeneric: 'Could not save. Please try again.',
    errCover: 'Could not add the image.',
    coverCredits: 'Image generation uses AI credits; no credits are charged when an image fails or is rejected.',
    coverStyle: 'Image style',
    errCoverRejected: 'Could not produce a suitable image (it contained text or people). No credits were charged; try another style or upload an image.',
    errCoverFailed: 'Could not generate the image. No credits were charged; please try again.',
    errCoverBusy: 'An image is already being generated, please wait.',
    coverPlaceholder: 'No cover',
    coverGenerating: 'Preparing the image, this can take about 30 seconds.',
    errCoverTimeout: 'The image took too long to prepare. No credits were charged; please try again.',
    chars: 'characters',
  },
} as const

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function initialMode(post: BlogPost | null): Mode {
  if (!post || post.status !== 'published') return 'draft'
  return post.publishedAt && Date.parse(post.publishedAt) > Date.now() ? 'scheduled' : 'published'
}

const inputClass =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30'
const labelClass = 'mb-1.5 block text-xs font-medium text-muted-foreground'

export function BlogPostForm({
  projectId,
  post,
  lang,
  onBack,
  onSaved,
  onDelete,
}: {
  projectId: string
  post: BlogPost | null
  lang: Lang
  onBack: () => void
  onSaved: (post: BlogPost) => void
  onDelete?: () => void
}) {
  const t = T[lang]
  const [current, setCurrent] = useState<BlogPost | null>(post)
  const [title, setTitle] = useState(post?.title ?? '')
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '')
  const [body, setBody] = useState(post?.body ?? '')
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? '')
  const [keywords, setKeywords] = useState((post?.keywords ?? []).join(', '))
  const [indexable, setIndexable] = useState(post?.indexable ?? true)
  const [coverUrl, setCoverUrl] = useState(post?.coverUrl ?? '')
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? '')
  const [mode, setMode] = useState<Mode>(initialMode(post))
  const [publishAt, setPublishAt] = useState(initialMode(post) === 'scheduled' ? toLocalInput(post?.publishedAt ?? null) : '')
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [claims, setClaims] = useState<BlogClaimFinding[]>([])
  const [approved, setApproved] = useState<Set<string>>(new Set())
  const [sampleBlocked, setSampleBlocked] = useState(false)
  const [confirmSample, setConfirmSample] = useState(false)
  const [coverBusy, setCoverBusy] = useState<'upload' | 'ai' | null>(null)
  const [coverStyle, setCoverStyle] = useState<CoverStyle>(DEFAULT_COVER_STYLE)
  const coverLock = useRef(false)
  const [pending, startTransition] = useTransition()
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const blocks = useMemo(() => parseLegalMarkup(sanitizeBlogBody(body)), [body])
  const liveClaims = useMemo(() => detectUnverifiedClaims(sanitizeBlogBody(body)), [body])

  function wrap(before: string, after = before, fallback = '') {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e } = el
    const selected = body.slice(s, e) || fallback
    const next = body.slice(0, s) + before + selected + after + body.slice(e)
    setBody(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(s + before.length, s + before.length + selected.length)
    })
  }

  function prefixLine(prefix: string) {
    const el = bodyRef.current
    if (!el) return
    const s = el.selectionStart
    const lineStart = body.lastIndexOf('\n', s - 1) + 1
    setBody(body.slice(0, lineStart) + prefix + body.slice(lineStart))
    requestAnimationFrame(() => el.focus())
  }

  async function sendCover(init: RequestInit, kind: 'upload' | 'ai') {
    if (coverLock.current) return
    coverLock.current = true
    setCoverBusy(kind)
    setError(null)
    try {
      const res = await fetch('/api/blog/cover', {
        ...init,
        signal: kind === 'ai' ? AbortSignal.timeout(COVER_TIMEOUT_MS) : undefined,
      })
      const data = (await res.json().catch(() => null)) as { url?: string; alt?: string; error?: string } | null
      if (!res.ok || !data?.url) {
        if (res.status === 402) setError(lang === 'tr' ? 'AI krediniz yetersiz.' : 'Not enough AI credits.')
        else if (res.status === 409) setError(t.errCoverBusy)
        else if (data?.error === 'timeout') setError(t.errCoverTimeout)
        else if (data?.error === 'rejected') setError(t.errCoverRejected)
        else if (kind === 'ai') setError(t.errCoverFailed)
        else setError(t.errCover)
        return
      }
      setCoverUrl(data.url)
      if (data.alt && !coverAlt) setCoverAlt(data.alt)
    } catch (caught) {
      const timedOut = caught instanceof DOMException && (caught.name === 'TimeoutError' || caught.name === 'AbortError')
      setError(timedOut ? t.errCoverTimeout : kind === 'ai' ? t.errCoverFailed : t.errCover)
    } finally {
      coverLock.current = false
      setCoverBusy(null)
    }
  }

  function uploadCover(file: File) {
    const form = new FormData()
    form.set('projectId', projectId)
    form.set('file', file)
    void sendCover({ method: 'POST', body: form }, 'upload')
  }

  function generateCover() {
    void sendCover(
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, title, excerpt, style: coverStyle, requestId: crypto.randomUUID() }),
      },
      'ai',
    )
  }

  function save() {
    setError(null)
    setNotice(null)
    if (!title.trim()) return setError(t.errTitle)
    if (coverUrl && !coverAlt.trim()) return setError(t.errAlt)
    let scheduledAt: string | null = null
    if (mode === 'scheduled') {
      const at = publishAt ? new Date(publishAt) : null
      if (!at || Number.isNaN(at.getTime())) return setError(t.errPublishAt)
      scheduledAt = at.toISOString()
    }
    const input = {
      title,
      body,
      excerpt: excerpt || null,
      keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
      seoTitle: seoTitle || null,
      metaDescription: metaDescription || null,
      coverUrl: coverUrl || null,
      coverAlt: coverAlt || null,
      status: mode,
      publishAt: scheduledAt,
      indexable,
      approvals: [...approved],
      confirmSample,
    }
    startTransition(async () => {
      try {
        const result = current
          ? await updateBlogPostAction(projectId, current.id, input)
          : await createBlogPostAction(projectId, input)
        if (result.ok) {
          setCurrent(result.post)
          setClaims([])
          setSampleBlocked(false)
          setNotice(t.saved)
          onSaved(result.post)
          return
        }
        switch (result.reason) {
          case 'SAMPLE_CONTENT':
            setClaims(result.findings)
            setSampleBlocked(result.samplePost)
            break
          case 'SUBSCRIPTION_SUSPENDED':
            setError(t.errSuspended)
            break
          case 'POST_LIMIT':
            setError(t.errLimit(result.limit))
            break
          case 'INVALID':
            setError(result.field === 'title' ? t.errTitle : result.field === 'publishAt' ? t.errPublishAt : t.errGeneric)
            break
          default:
            setError(t.errGeneric)
        }
      } catch {
        setError(t.errGeneric)
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t.back}
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label={lang === 'tr' ? 'Yazıyı sil' : 'Delete post'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <div>
        <label htmlFor="blog-title" className={labelClass}>{t.title}</label>
        <input id="blog-title" className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <label htmlFor="blog-excerpt" className={labelClass}>{t.excerpt}</label>
        <textarea id="blog-excerpt" rows={2} className={inputClass} value={excerpt} maxLength={300} onChange={(e) => setExcerpt(e.target.value)} />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t.body}</span>
          <div role="tablist" className="flex rounded-lg border border-border p-0.5 text-xs">
            {(['edit', 'preview'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`rounded-md px-2.5 py-1 transition-colors ${tab === id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {id === 'edit' ? t.edit : t.preview}
              </button>
            ))}
          </div>
        </div>
        {tab === 'edit' ? (
          <>
            <div className="flex gap-1 rounded-t-lg border border-b-0 border-border bg-secondary/40 p-1">
              <ToolButton label="H2" onClick={() => prefixLine('## ')}><Heading2 className="h-4 w-4" aria-hidden /></ToolButton>
              <ToolButton label={lang === 'tr' ? 'Kalın' : 'Bold'} onClick={() => wrap('**', '**', lang === 'tr' ? 'kalın metin' : 'bold text')}><Bold className="h-4 w-4" aria-hidden /></ToolButton>
              <ToolButton label={lang === 'tr' ? 'Liste' : 'List'} onClick={() => prefixLine('- ')}><List className="h-4 w-4" aria-hidden /></ToolButton>
              <ToolButton label={lang === 'tr' ? 'Bağlantı' : 'Link'} onClick={() => wrap('[', '](https://)', lang === 'tr' ? 'bağlantı' : 'link')}><Link2 className="h-4 w-4" aria-hidden /></ToolButton>
            </div>
            <textarea
              ref={bodyRef}
              rows={16}
              className={`${inputClass} rounded-t-none font-mono leading-relaxed`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label={t.body}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t.bodyHint}</p>
          </>
        ) : (
          <div className="max-h-[480px] overflow-y-auto rounded-lg border border-border bg-card p-4">
            {blocks.length ? <LegalBlocks blocks={blocks} /> : <p className="text-sm text-muted-foreground">—</p>}
          </div>
        )}
        {mode !== 'draft' && liveClaims.length > 0 && claims.length === 0 && (
          <p className="mt-2 text-xs text-amber-500">
            {t.claimsTitle}: {liveClaims.length}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{t.cover}</legend>
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt={coverAlt || ''} className="aspect-[16/9] w-full rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
            {t.coverPlaceholder}
          </div>
        )}
        <div role="radiogroup" aria-label={t.coverStyle} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.coverStyle}</span>
          {COVER_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={coverStyle === style}
              disabled={coverBusy !== null}
              onClick={() => setCoverStyle(style)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                coverStyle === style
                  ? 'border-brand/40 bg-brand/10 text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {COVER_STYLE_LABELS[style][lang]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={coverBusy !== null} onClick={() => fileRef.current?.click()} className={ghostBtn}>
            {coverBusy === 'upload' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
            {t.upload}
          </button>
          <button type="button" disabled={coverBusy !== null || !title.trim()} onClick={generateCover} className={ghostBtn}>
            {coverBusy === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            {t.generate}
          </button>
          {coverUrl && (
            <button type="button" onClick={() => { setCoverUrl(''); setCoverAlt('') }} className={ghostBtn}>
              {t.removeCover}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) uploadCover(file)
              e.target.value = ''
            }}
          />
        </div>
        {coverBusy === 'ai' && (
          <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
            <p className="text-sm text-foreground">{t.coverGenerating}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{t.coverCredits}</p>
        {coverUrl && (
          <div>
            <label htmlFor="blog-cover-alt" className={labelClass}>{t.coverAlt}</label>
            <input id="blog-cover-alt" className={inputClass} value={coverAlt} maxLength={200} onChange={(e) => setCoverAlt(e.target.value)} />
            <p className="mt-1.5 text-xs text-muted-foreground">{t.coverAltHint}</p>
          </div>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{t.seo}</legend>
        <div>
          <label htmlFor="blog-seo-title" className={labelClass}>{t.seoTitle} ({seoTitle.length}/70 {t.chars})</label>
          <input id="blog-seo-title" className={inputClass} value={seoTitle} maxLength={70} onChange={(e) => setSeoTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="blog-meta" className={labelClass}>{t.metaDescription} ({metaDescription.length}/160 {t.chars})</label>
          <textarea id="blog-meta" rows={2} className={inputClass} value={metaDescription} maxLength={300} onChange={(e) => setMetaDescription(e.target.value)} />
        </div>
        <div>
          <label htmlFor="blog-keywords" className={labelClass}>{t.keywords}</label>
          <input id="blog-keywords" className={inputClass} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={indexable} onChange={(e) => setIndexable(e.target.checked)} className="h-4 w-4 accent-brand" />
          {t.indexable}
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-xl border border-border p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">{t.status}</legend>
        <div className="flex flex-wrap gap-2">
          {(['draft', 'published', 'scheduled'] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${mode === id ? 'border-brand/60 bg-brand/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
            >
              {t[id]}
            </button>
          ))}
        </div>
        {mode === 'scheduled' && (
          <div>
            <label htmlFor="blog-publish-at" className={labelClass}>{t.publishAt}</label>
            <input id="blog-publish-at" type="datetime-local" className={inputClass} value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          </div>
        )}
      </fieldset>

      {(claims.length > 0 || sampleBlocked) && (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {claims.length > 0 && (
            <>
              <div>
                <p className="font-medium text-foreground">{t.claimsTitle}</p>
                <p className="text-muted-foreground">{t.claimsBody}</p>
              </div>
              <ul className="flex flex-col gap-2">
                {claims.map((claim) => (
                  <li key={claim.id} className="flex flex-col gap-1.5 rounded-lg bg-background/60 p-3">
                    <q className="text-foreground">{claim.excerpt}</q>
                    <label className="flex items-center gap-2 text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand"
                        checked={approved.has(claim.id)}
                        onChange={(e) =>
                          setApproved((prev) => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(claim.id)
                            else next.delete(claim.id)
                            return next
                          })
                        }
                      />
                      {t.claimOk}
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {sampleBlocked && (
            <div className="flex flex-col gap-1.5">
              <p className="font-medium text-foreground">{t.sampleTitle}</p>
              <p className="text-muted-foreground">{t.sampleBody}</p>
              <label className="flex items-center gap-2 text-foreground">
                <input type="checkbox" className="h-4 w-4 accent-brand" checked={confirmSample} onChange={(e) => setConfirmSample(e.target.checked)} />
                {t.sampleOk}
              </label>
            </div>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-500">{notice}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {t.save}
      </button>
    </div>
  )
}

const ghostBtn =
  'flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary disabled:opacity-40'

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  )
}
