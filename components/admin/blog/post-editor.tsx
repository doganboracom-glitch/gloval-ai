'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, ExternalLink, ImagePlus, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { BlogMarkupView } from '@/components/content/blog-markup-view'
import { Panel } from '@/components/admin/admin-ui'
import { blogAdminT } from '@/lib/blog-admin-copy'
import { savePostAction } from '@/app/admin/blog/actions'
import {
  LIMITS,
  normalizeTags,
  slugifyBlog,
  type FieldErrors,
  type PostInput,
  type PostStatus,
} from '@/lib/blog-admin-shared'
import { emptyEnglish } from '@/lib/blog-admin-shared'

type CategoryOption = { id: string; name: string }

export const EMPTY_POST: PostInput = {
  title: '',
  slug: '',
  excerpt: '',
  body: '',
  categoryId: null,
  tags: [],
  coverUrl: '',
  coverAlt: '',
  seoTitle: '',
  metaDescription: '',
  status: 'draft',
  publishedAt: null,
  authorName: 'GLOVAL AI',
  noindex: false,
  featured: false,
  en: emptyEnglish(),
}

const field =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-brand/50 aria-[invalid=true]:border-destructive'

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function Field({
  label,
  hint,
  error,
  counter,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  counter?: { value: number; max: number; unit: string }
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {counter ? (
          <span
            className={`text-xs tabular-nums ${counter.value > counter.max ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            {counter.value}/{counter.max} {counter.unit}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

type ToolbarKey = 'h2' | 'h3' | 'bold' | 'italic' | 'list' | 'quote' | 'link' | 'image'

async function uploadImage(file: File): Promise<string> {
  const data = new FormData()
  data.append('file', file)
  const res = await fetch('/api/admin/blog/cover', { method: 'POST', body: data })
  const json = (await res.json().catch(() => ({}))) as { url?: string }
  if (!res.ok || !json.url) throw new Error('upload')
  return json.url
}

export function PostEditor({
  initial,
  categories,
  oldSlugs = [],
  visibility = 'draft',
}: {
  initial: PostInput
  categories: CategoryOption[]
  oldSlugs?: string[]
  visibility?: 'draft' | 'live' | 'scheduled'
}) {
  const { lang } = useLanguage()
  const t = blogAdminT(lang)
  const e = t.editor
  const router = useRouter()
  const isNew = !initial.id

  const [form, setForm] = useState<PostInput>(initial)
  const [saved, setSaved] = useState<string>(() => JSON.stringify(initial))
  const [postId, setPostId] = useState(initial.id)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const [slugUnlocked, setSlugUnlocked] = useState(isNew)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [tagDraft, setTagDraft] = useState('')
  const [busy, setBusy] = useState<null | 'cover' | 'generate' | 'image'>(null)
  const [coverError, setCoverError] = useState('')
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const dirty = useMemo(() => JSON.stringify(form) !== saved, [form, saved])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set = <K extends keyof PostInput>(key: K, value: PostInput[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => (prev[key as string] ? { ...prev, [key]: undefined } : prev))
  }
  const setEn = (key: keyof PostInput['en'], value: string) =>
    setForm((prev) => ({ ...prev, en: { ...prev.en, [key]: value } }))

  const err = (key: string) => (errors[key] ? (t.errors[errors[key] as string] ?? t.errors.invalid) : undefined)

  const onTitle = (value: string) => {
    setForm((prev) => ({ ...prev, title: value, slug: slugTouched ? prev.slug : slugifyBlog(value) }))
    setErrors((prev) => ({ ...prev, title: undefined, slug: slugTouched ? prev.slug : undefined }))
  }

  const wrapSelection = (key: ToolbarKey, extra?: string) => {
    const area = bodyRef.current
    if (!area) return
    const { selectionStart: start, selectionEnd: end, value } = area
    const selected = value.slice(start, end)
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    let next = value
    let caret = end

    const prefixLine = (prefix: string) => {
      const block = value.slice(lineStart, end || lineStart)
      const lines = (block || '').split('\n').map((line) => (line.startsWith(prefix) ? line : prefix + line))
      next = value.slice(0, lineStart) + lines.join('\n') + value.slice(end)
      caret = lineStart + lines.join('\n').length
    }

    if (key === 'h2') prefixLine('## ')
    else if (key === 'h3') prefixLine('### ')
    else if (key === 'list') prefixLine('- ')
    else if (key === 'quote') prefixLine('> ')
    else if (key === 'bold' || key === 'italic') {
      const mark = key === 'bold' ? '**' : '*'
      const inner = selected || (key === 'bold' ? 'bold' : 'italic')
      next = value.slice(0, start) + mark + inner + mark + value.slice(end)
      caret = start + mark.length + inner.length + mark.length
    } else if (key === 'link') {
      const href = extra ?? ''
      if (!href) return
      const label = selected || href
      next = `${value.slice(0, start)}[${label}](${href})${value.slice(end)}`
      caret = start + label.length + href.length + 4
    } else if (key === 'image') {
      const insert = `\n\n${extra}\n\n`
      next = value.slice(0, end) + insert + value.slice(end)
      caret = end + insert.length
    }
    set('body', next)
    requestAnimationFrame(() => {
      area.focus()
      area.setSelectionRange(caret, caret)
    })
  }

  const onLink = () => {
    const href = window.prompt(e.linkPrompt, 'https://')
    if (href && /^(https?:\/\/|\/|mailto:)/i.test(href.trim())) wrapSelection('link', href.trim())
  }

  const onBodyImage = async (file: File | undefined) => {
    if (!file) return
    setBusy('image')
    try {
      const url = await uploadImage(file)
      const alt = window.prompt(e.imageAlt, '') ?? ''
      wrapSelection('image', `![${alt.replace(/[\]\n]/g, ' ').trim()}](${url})`)
    } catch {
      setMessage({ tone: 'error', text: e.uploadFailed })
    } finally {
      setBusy(null)
      if (imageInput.current) imageInput.current.value = ''
    }
  }

  const onCoverFile = async (file: File | undefined) => {
    if (!file) return
    setBusy('cover')
    setCoverError('')
    try {
      set('coverUrl', await uploadImage(file))
    } catch {
      setCoverError(e.uploadFailed)
    } finally {
      setBusy(null)
      if (coverInput.current) coverInput.current.value = ''
    }
  }

  const onGenerate = async () => {
    if (form.title.trim().length < 3) {
      setCoverError(e.coverNeedsTitle)
      return
    }
    setBusy('generate')
    setCoverError('')
    try {
      const res = await fetch('/api/admin/blog/cover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: form.title, excerpt: form.excerpt }),
      })
      const json = (await res.json().catch(() => ({}))) as { url?: string }
      if (!res.ok || !json.url) throw new Error('generate')
      setForm((prev) => ({ ...prev, coverUrl: json.url as string, coverAlt: prev.coverAlt || prev.title }))
    } catch {
      setCoverError(t.errors.failed)
    } finally {
      setBusy(null)
    }
  }

  const addTag = (raw: string) => {
    const next = normalizeTags([...form.tags, ...raw.split(',')])
    if (next.length !== form.tags.length) set('tags', next.slice(0, LIMITS.tags))
    setTagDraft('')
  }

  const save = () => {
    setMessage(null)
    startTransition(async () => {
      const result = await savePostAction({ ...form, id: postId })
      if (!result.ok) {
        setErrors(result.errors ?? {})
        setMessage({ tone: 'error', text: t.errors[result.error] ?? t.errors.failed })
        if (result.errors) {
          const first = document.querySelector<HTMLElement>('[aria-invalid="true"]')
          first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        }
        return
      }
      const next: PostInput = { ...form, id: result.id, slug: result.slug, publishedAt: result.publishedAt }
      setForm(next)
      setSaved(JSON.stringify(next))
      setErrors({})
      setPostId(result.id)
      setSlugUnlocked(false)
      setMessage({ tone: 'ok', text: e.saved })
      if (!postId) router.replace(`/admin/blog/${result.id}`)
      else router.refresh()
    })
  }

  const primaryLabel =
    form.status === 'draft' ? e.saveDraft : form.status === 'scheduled' ? e.schedule : visibility === 'live' ? e.update : e.publish
  const liveHref = form.slug ? `/blog/${form.slug}` : null
  const canViewLive = liveHref && postId && visibility === 'live' && !dirty

  const seoTitleShown = form.seoTitle.trim() || form.title.trim() || e.titlePlaceholder
  const metaShown = form.metaDescription.trim() || form.excerpt.trim()
  const toolbar: { key: ToolbarKey; label: string; glyph: string; onClick?: () => void }[] = [
    { key: 'h2', label: e.toolbar.h2, glyph: 'H2' },
    { key: 'h3', label: e.toolbar.h3, glyph: 'H3' },
    { key: 'bold', label: e.toolbar.bold, glyph: 'B' },
    { key: 'italic', label: e.toolbar.italic, glyph: 'I' },
    { key: 'list', label: e.toolbar.list, glyph: '•' },
    { key: 'quote', label: e.toolbar.quote, glyph: '"' },
    { key: 'link', label: e.toolbar.link, glyph: 'Link', onClick: onLink },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/admin/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {e.back}
          </Link>
          <h2 className="truncate font-display text-lg font-semibold">{isNew && !postId ? e.newTitle : form.title || e.newTitle}</h2>
        </div>
        <div className="flex items-center gap-3">
          <p role="status" aria-live="polite" className="text-xs">
            {message ? (
              <span className={message.tone === 'ok' ? 'text-primary' : 'text-destructive'}>{message.text}</span>
            ) : dirty ? (
              <span className="text-muted-foreground">{e.unsaved}</span>
            ) : null}
          </p>
          {canViewLive ? (
            <Link
              href={liveHref}
              target="_blank"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {e.viewLive}
            </Link>
          ) : null}
          <Button type="button" onClick={save} disabled={pending || (!dirty && Boolean(postId))}>
            {pending ? e.saving : primaryLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Field label={e.title} htmlFor="post-title" error={err('title')} counter={{ value: form.title.length, max: LIMITS.title, unit: e.charsLeft }}>
            <input
              id="post-title"
              value={form.title}
              onChange={(ev) => onTitle(ev.target.value)}
              placeholder={e.titlePlaceholder}
              aria-invalid={Boolean(errors.title)}
              className={`${field} h-11 text-base font-medium`}
            />
          </Field>

          <Field label={e.slug} htmlFor="post-slug" error={err('slug')} hint={!isNew ? e.slugHint : undefined}>
            <div className="flex gap-2">
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-brand/50 aria-[invalid=true]:border-destructive" aria-invalid={Boolean(errors.slug)}>
                <span className="pl-3 text-sm text-muted-foreground">/blog/</span>
                <input
                  id="post-slug"
                  value={form.slug}
                  readOnly={!slugUnlocked}
                  onChange={(ev) => {
                    setSlugTouched(true)
                    set('slug', slugifyBlog(ev.target.value, LIMITS.slug))
                  }}
                  aria-invalid={Boolean(errors.slug)}
                  className="min-w-0 flex-1 bg-transparent px-1.5 py-2 text-sm text-foreground outline-none read-only:text-muted-foreground"
                />
              </div>
              {!slugUnlocked ? (
                <Button type="button" variant="outline" onClick={() => setSlugUnlocked(true)}>
                  {e.slugChange}
                </Button>
              ) : null}
            </div>
          </Field>

          <Field label={e.excerpt} htmlFor="post-excerpt" hint={e.excerptHint} error={err('excerpt')} counter={{ value: form.excerpt.length, max: LIMITS.excerpt, unit: e.charsLeft }}>
            <textarea
              id="post-excerpt"
              rows={3}
              value={form.excerpt}
              onChange={(ev) => set('excerpt', ev.target.value)}
              aria-invalid={Boolean(errors.excerpt)}
              className={field}
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{e.body}</span>
              <div role="tablist" aria-label={e.body} className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                {(['write', 'preview'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={`rounded-md px-3 py-1 font-medium transition-colors ${tab === id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {id === 'write' ? e.write : e.preview}
                  </button>
                ))}
              </div>
            </div>
            {tab === 'write' ? (
              <div className={`overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-brand/50 ${errors.body ? 'border-destructive' : 'border-border'}`}>
                <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 p-1.5">
                  {toolbar.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      title={item.label}
                      aria-label={item.label}
                      onClick={item.onClick ?? (() => wrapSelection(item.key))}
                      className="inline-flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {item.glyph}
                    </button>
                  ))}
                  <button
                    type="button"
                    title={e.toolbar.image}
                    aria-label={e.toolbar.image}
                    disabled={busy === 'image'}
                    onClick={() => imageInput.current?.click()}
                    className="inline-flex h-7 min-w-8 items-center justify-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    {busy === 'image' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ImagePlus className="size-3.5" aria-hidden />}
                  </button>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(ev) => onBodyImage(ev.target.files?.[0])}
                  />
                  <span className={`ml-auto pr-1.5 text-xs tabular-nums ${form.body.length > LIMITS.body ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {form.body.length}/{LIMITS.body}
                  </span>
                </div>
                <textarea
                  id="post-body"
                  ref={bodyRef}
                  value={form.body}
                  onChange={(ev) => set('body', ev.target.value)}
                  placeholder={e.bodyPlaceholder}
                  aria-label={e.body}
                  aria-invalid={Boolean(errors.body)}
                  rows={22}
                  className="block min-h-96 w-full resize-y bg-transparent px-3 py-3 font-mono text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            ) : (
              <div className="min-h-96 rounded-lg border border-border bg-card/50 p-5">
                {form.body.trim() ? <BlogMarkupView markup={form.body} /> : <p className="text-sm text-muted-foreground">{e.previewEmpty}</p>}
              </div>
            )}
            {errors.body ? (
              <p role="alert" className="text-xs text-destructive">
                {err('body')}
              </p>
            ) : null}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title={e.publishing}>
            <div className="flex flex-col gap-4 p-4">
              <Field label={e.statusLabel} htmlFor="post-status" error={err('status')}>
                <select
                  id="post-status"
                  value={form.status}
                  onChange={(ev) => {
                    const status = ev.target.value as PostStatus
                    setForm((prev) => ({
                      ...prev,
                      status,
                      publishedAt:
                        status === 'scheduled' && (!prev.publishedAt || Date.parse(prev.publishedAt) <= Date.now())
                          ? new Date(Date.now() + 3_600_000).toISOString()
                          : prev.publishedAt,
                    }))
                  }}
                  className={field}
                >
                  <option value="draft">{e.statusOptions.draft}</option>
                  <option value="published">{e.statusOptions.published}</option>
                  <option value="scheduled">{e.statusOptions.scheduled}</option>
                </select>
              </Field>
              {form.status === 'scheduled' ? (
                <Field label={e.scheduleAt} htmlFor="post-schedule" hint={e.scheduleHint} error={err('publishedAt')}>
                  <input
                    id="post-schedule"
                    type="datetime-local"
                    value={toLocalInput(form.publishedAt)}
                    onChange={(ev) => set('publishedAt', fromLocalInput(ev.target.value))}
                    aria-invalid={Boolean(errors.publishedAt)}
                    className={field}
                  />
                </Field>
              ) : null}
              <Field label={e.author} htmlFor="post-author" error={err('authorName')}>
                <input id="post-author" value={form.authorName} onChange={(ev) => set('authorName', ev.target.value)} className={field} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm text-foreground">
                <input type="checkbox" checked={form.featured} onChange={(ev) => set('featured', ev.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                {e.featured}
              </label>
            </div>
          </Panel>

          <Panel title={e.category}>
            <div className="flex flex-col gap-4 p-4">
              <select
                aria-label={e.category}
                value={form.categoryId ?? ''}
                onChange={(ev) => set('categoryId', ev.target.value || null)}
                className={field}
              >
                <option value="">{e.noCategory}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Field label={e.tags} htmlFor="post-tags" error={err('tags')}>
                <input
                  id="post-tags"
                  value={tagDraft}
                  onChange={(ev) => setTagDraft(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.nativeEvent.isComposing || ev.keyCode === 229) return
                    if (ev.key === 'Enter' || ev.key === ',') {
                      ev.preventDefault()
                      if (tagDraft.trim()) addTag(tagDraft)
                    }
                  }}
                  onBlur={() => tagDraft.trim() && addTag(tagDraft)}
                  placeholder={e.tagsPlaceholder}
                  className={field}
                />
                {form.tags.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {form.tags.map((tag) => (
                      <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground">
                        {tag}
                        <button
                          type="button"
                          aria-label={`${e.removeTag}: ${tag}`}
                          onClick={() => set('tags', form.tags.filter((x) => x !== tag))}
                          className="rounded-full text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Field>
            </div>
          </Panel>

          <Panel title={e.cover}>
            <div className="flex flex-col gap-3 p-4">
              <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-muted/40">
                {form.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.coverUrl} alt={form.coverAlt || ''} className="size-full object-cover" />
                ) : (
                  <div className="flex size-full items-center justify-center text-xs text-muted-foreground">{e.coverNone}</div>
                )}
                {busy === 'cover' || busy === 'generate' ? (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 bg-background/70 text-xs text-foreground backdrop-blur-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {busy === 'generate' ? e.coverGenerating : e.uploading}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => coverInput.current?.click()}>
                  <ImagePlus aria-hidden />
                  {e.coverUpload}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={onGenerate}>
                  <Sparkles aria-hidden />
                  {e.coverGenerate}
                </Button>
                {form.coverUrl ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set('coverUrl', '')}>
                    {e.coverRemove}
                  </Button>
                ) : null}
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(ev) => onCoverFile(ev.target.files?.[0])}
                />
              </div>
              {coverError ? (
                <p role="alert" className="text-xs text-destructive">
                  {coverError}
                </p>
              ) : null}
              <Field label={e.coverUrl} htmlFor="post-cover-url" error={err('coverUrl')}>
                <input id="post-cover-url" value={form.coverUrl} onChange={(ev) => set('coverUrl', ev.target.value)} placeholder="https://" aria-invalid={Boolean(errors.coverUrl)} className={field} />
              </Field>
              <Field label={e.coverAlt} htmlFor="post-cover-alt" error={err('coverAlt')}>
                <input id="post-cover-alt" value={form.coverAlt} onChange={(ev) => set('coverAlt', ev.target.value)} className={field} />
              </Field>
            </div>
          </Panel>

          <Panel title={e.seo}>
            <div className="flex flex-col gap-4 p-4">
              <div className="rounded-lg border border-border bg-background p-3" aria-label={e.serpTitle}>
                <p className="truncate text-xs text-muted-foreground">gloval.ai › blog › {form.slug || '...'}</p>
                <p className="mt-0.5 line-clamp-1 text-base text-primary">{seoTitleShown}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{metaShown}</p>
              </div>
              <Field label={e.seoTitle} htmlFor="post-seo-title" hint={e.seoTitleHint} error={err('seoTitle')} counter={{ value: form.seoTitle.length, max: LIMITS.seoTitle, unit: e.charsLeft }}>
                <input id="post-seo-title" value={form.seoTitle} onChange={(ev) => set('seoTitle', ev.target.value)} aria-invalid={Boolean(errors.seoTitle)} className={field} />
              </Field>
              <Field label={e.metaDescription} htmlFor="post-meta" hint={e.metaHint} error={err('metaDescription')} counter={{ value: form.metaDescription.length, max: LIMITS.metaDescription, unit: e.charsLeft }}>
                <textarea id="post-meta" rows={3} value={form.metaDescription} onChange={(ev) => set('metaDescription', ev.target.value)} aria-invalid={Boolean(errors.metaDescription)} className={field} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm text-foreground">
                <input type="checkbox" checked={form.noindex} onChange={(ev) => set('noindex', ev.target.checked)} className="size-4 accent-[var(--color-brand)]" />
                {e.noindex}
              </label>
            </div>
          </Panel>

          <Panel>
            <details className="group" open={Object.values(form.en).some(Boolean)}>
              <summary className="cursor-pointer list-none px-4 py-3 font-display text-sm font-semibold marker:hidden">{e.english}</summary>
              <div className="flex flex-col gap-4 border-t border-border p-4">
                <p className="text-xs text-muted-foreground">{e.englishHint}</p>
                <Field label={e.title} htmlFor="en-title" error={err('enTitle')}>
                  <input id="en-title" value={form.en.title} onChange={(ev) => setEn('title', ev.target.value)} aria-invalid={Boolean(errors.enTitle)} className={field} />
                </Field>
                <Field label={e.excerpt} htmlFor="en-excerpt" error={err('enExcerpt')}>
                  <textarea id="en-excerpt" rows={2} value={form.en.excerpt} onChange={(ev) => setEn('excerpt', ev.target.value)} className={field} />
                </Field>
                <Field label={e.body} htmlFor="en-body" error={err('enBody')}>
                  <textarea id="en-body" rows={8} value={form.en.body} onChange={(ev) => setEn('body', ev.target.value)} className={`${field} font-mono`} />
                </Field>
                <Field label={e.seoTitle} htmlFor="en-seo" error={err('enSeoTitle')}>
                  <input id="en-seo" value={form.en.seoTitle} onChange={(ev) => setEn('seoTitle', ev.target.value)} className={field} />
                </Field>
                <Field label={e.metaDescription} htmlFor="en-meta" error={err('enMetaDescription')}>
                  <textarea id="en-meta" rows={2} value={form.en.metaDescription} onChange={(ev) => setEn('metaDescription', ev.target.value)} className={field} />
                </Field>
              </div>
            </details>
          </Panel>

          {oldSlugs.length > 0 ? (
            <Panel title={e.oldSlugs}>
              <div className="flex flex-col gap-2 p-4">
                <p className="text-xs text-muted-foreground">{e.oldSlugsHint}</p>
                <ul className="flex flex-col gap-1 font-mono text-xs text-foreground">
                  {oldSlugs.map((slug) => (
                    <li key={slug}>/blog/{slug}</li>
                  ))}
                </ul>
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
