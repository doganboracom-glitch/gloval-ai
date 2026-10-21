import {
  PREVIEW_COSTS,
  PREVIEW_TTL_MS,
  useCost,
  type PreviewKind,
  type PreviewStatus,
} from '@/lib/ai-preview/policy'

/**
 * Preview-session service. Every side effect comes in through `PreviewDeps`,
 * so the rules are unit-tested without a database.
 *
 * Money and the one-time free preview never move in this file: they change
 * only inside the `commit*` store calls, which are single database functions
 * (scripts/070-ai-image-previews.sql) that consume the free right / debit
 * credits, write the idempotency record and flip the preview row in ONE
 * transaction. The service only decides what to generate and when to give up.
 */

export type PreviewRow = {
  id: string
  userId: string
  projectId: string
  sectionKey: string
  target: string
  status: PreviewStatus
  kind: PreviewKind | null
  imageUrl: string | null
  storagePath: string | null
  alt: string | null
  imagePrompt: string | null
  chargedCredits: number
  regenCount: number
  expiresAt: number
  createdAt: number
}

export type ImagePatch = {
  imageUrl: string
  storagePath: string | null
  alt: string
  imagePrompt: string
}

export type CreateCommit = {
  outcome: 'ok' | 'replay' | 'invalid' | 'no_credits'
  kind: PreviewKind | null
  charged: number
  balance: number | null
}

export type RegenCommit = {
  outcome: 'ok' | 'replay' | 'invalid' | 'no_credits'
  /** Storage path of the image this regeneration replaced (delete it). */
  oldPath: string | null
  balance: number | null
}

export type UseCommit = {
  outcome: 'ok' | 'done' | 'invalid' | 'expired' | 'no_credits'
  charged: number
  balance: number | null
  image: { src: string; alt: string; imagePrompt: string } | null
}

export type PreviewStore = {
  /** True while the account's one free preview is still unused. */
  freeAvailable(userId: string): Promise<boolean>
  /** The live (non-expired) preview of this section. Read-only. */
  findLive(userId: string, projectId: string, sectionKey: string, now: number): Promise<PreviewRow | null>
  get(userId: string, id: string): Promise<PreviewRow | null>
  /** Atomic insert of a `generating` row (expiring dead ones first); false when a live one exists. */
  claimSlot(input: { id: string; userId: string; projectId: string; sectionKey: string; target: string }): Promise<boolean>
  /** Free-right consumption or 2-credit debit + row -> `open` + idempotency record, one transaction. */
  commitCreate(userId: string, id: string, patch: ImagePatch): Promise<CreateCommit>
  /** Moves a live row to `discarded`/`expired`; returns its storage path. */
  release(userId: string, id: string, status: 'discarded' | 'expired'): Promise<string | null>
  /** open -> regenerating; `duplicate` when this key already regenerated it. */
  claimRegen(userId: string, id: string, key: string): Promise<'claimed' | 'duplicate' | 'inflight' | 'invalid'>
  /** 1-credit debit + new image + idempotency record, one transaction. */
  commitRegen(userId: string, id: string, key: string, patch: ImagePatch): Promise<RegenCommit>
  /** regenerating -> open without charging (generation failed or was refused). */
  releaseRegen(userId: string, id: string): Promise<void>
  /** 2-credit debit in a free session (0 in a paid one) + row -> `used`, one transaction. */
  commitUse(userId: string, id: string, key: string): Promise<UseCommit>
}

export type GeneratedPreviewImage = { image: string; alt: string; imagePrompt: string }

export type PreviewDeps = {
  store: PreviewStore
  credits: { balance(userId: string): Promise<number> }
  /** Runs the existing image pipeline (no-text / no-people guards). Null = failed or rejected. */
  generate(input: { target: string; sectionKey: string; request: string }): Promise<GeneratedPreviewImage | null>
  storage: {
    save(userId: string, name: string, image: string): Promise<{ url: string; path: string | null } | null>
    remove(paths: string[]): Promise<unknown>
  }
  now(): number
  newId(): string
}

export type PreviewView = {
  id: string
  imageUrl: string
  alt: string
  kind: PreviewKind
  status: PreviewStatus
  expiresAt: number
  regenCount: number
  /** What "Kullan" will still charge. */
  useCost: number
}

export type ServiceError = 'no_credits' | 'generation_failed' | 'busy' | 'not_found' | 'expired'
export type Failure = { ok: false; error: ServiceError; balance?: number }

export function toView(row: PreviewRow): PreviewView | null {
  if (!row.imageUrl || !row.kind) return null
  return {
    id: row.id,
    imageUrl: row.imageUrl,
    alt: row.alt ?? '',
    kind: row.kind,
    status: row.status,
    expiresAt: row.expiresAt,
    regenCount: row.regenCount,
    useCost: useCost(row.kind),
  }
}

async function removeQuietly(deps: PreviewDeps, path: string | null | undefined) {
  if (path) await deps.storage.remove([path]).catch(() => undefined)
}

/** Commits are idempotent in the database, so one retry after a transport error is safe. */
async function commitWithRetry<T>(run: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await run()
    } catch {
      // retry once
    }
  }
  return null
}

export async function getPreviewState(
  deps: PreviewDeps,
  input: { userId: string; projectId: string; sectionKey: string },
) {
  const [freeAvailable, balance, live] = await Promise.all([
    deps.store.freeAvailable(input.userId),
    deps.credits.balance(input.userId),
    deps.store.findLive(input.userId, input.projectId, input.sectionKey, deps.now()),
  ])
  const preview = live && live.status === 'open' ? toView(live) : null
  return { freeAvailable, balance, preview }
}

/** "AI ile üret": returns the live preview when there is one (page refresh, double click). */
export async function startPreview(
  deps: PreviewDeps,
  input: { userId: string; projectId: string; sectionKey: string; target: string; request: string },
): Promise<{ ok: true; preview: PreviewView; resumed: boolean } | Failure> {
  const { userId, projectId, sectionKey, target } = input
  const live = await deps.store.findLive(userId, projectId, sectionKey, deps.now())
  if (live) {
    const view = live.status === 'open' ? toView(live) : null
    return view ? { ok: true, preview: view, resumed: true } : { ok: false, error: 'busy' }
  }

  // No provider call, no row, nothing starts for an account that cannot pay.
  const freeAvailable = await deps.store.freeAvailable(userId)
  if (!freeAvailable) {
    const balance = await deps.credits.balance(userId)
    if (balance < PREVIEW_COSTS.newPreview) return { ok: false, error: 'no_credits', balance }
  }

  const id = deps.newId()
  if (!(await deps.store.claimSlot({ id, userId, projectId, sectionKey, target }))) {
    return { ok: false, error: 'busy' }
  }

  const generated = await deps.generate({ target, sectionKey, request: input.request }).catch(() => null)
  const saved = generated ? await deps.storage.save(userId, `${id}-0`, generated.image).catch(() => null) : null
  if (!generated || !saved) {
    await deps.store.release(userId, id, 'discarded').catch(() => null)
    return { ok: false, error: 'generation_failed' }
  }

  // The free right is consumed (or 2 credits debited) only now, inside the
  // commit transaction, after an image really exists. Losing the race for the
  // free right to another request turns this into a paid preview.
  const commit = await commitWithRetry(() =>
    deps.store.commitCreate(userId, id, {
      imageUrl: saved.url,
      storagePath: saved.path,
      alt: generated.alt,
      imagePrompt: generated.imagePrompt,
    }),
  )
  if (!commit) return { ok: false, error: 'generation_failed' }

  if (commit.outcome === 'no_credits') {
    await deps.store.release(userId, id, 'discarded').catch(() => null)
    await removeQuietly(deps, saved.path)
    return { ok: false, error: 'no_credits', balance: commit.balance ?? undefined }
  }
  if (commit.outcome === 'invalid') {
    await removeQuietly(deps, saved.path)
    return { ok: false, error: 'busy' }
  }

  const row = await deps.store.get(userId, id)
  const view = row ? toView(row) : null
  return view ? { ok: true, preview: view, resumed: false } : { ok: false, error: 'generation_failed' }
}

/** "Yeniden üret": 1 credit per successful press; the same `key` never charges twice. */
export async function regeneratePreview(
  deps: PreviewDeps,
  input: { userId: string; id: string; key: string; request: string },
): Promise<{ ok: true; preview: PreviewView } | Failure> {
  const { userId, id, key } = input
  const claim = await deps.store.claimRegen(userId, id, key)
  if (claim === 'invalid') return { ok: false, error: 'not_found' }
  if (claim === 'inflight') return { ok: false, error: 'busy' }
  if (claim === 'duplicate') {
    const current = await deps.store.get(userId, id)
    const view = current ? toView(current) : null
    return view ? { ok: true, preview: view } : { ok: false, error: 'not_found' }
  }

  const release = () => deps.store.releaseRegen(userId, id).catch(() => undefined)
  const row = await deps.store.get(userId, id)
  if (!row) {
    await release()
    return { ok: false, error: 'not_found' }
  }

  const balance = await deps.credits.balance(userId)
  if (balance < PREVIEW_COSTS.regenerate) {
    await release()
    return { ok: false, error: 'no_credits', balance }
  }

  const generated = await deps
    .generate({ target: row.target, sectionKey: row.sectionKey, request: input.request })
    .catch(() => null)
  const saved = generated
    ? await deps.storage.save(userId, `${id}-${row.regenCount + 1}`, generated.image).catch(() => null)
    : null
  if (!generated || !saved) {
    await release()
    return { ok: false, error: 'generation_failed' }
  }

  const commit = await commitWithRetry(() =>
    deps.store.commitRegen(userId, id, key, {
      imageUrl: saved.url,
      storagePath: saved.path,
      alt: generated.alt,
      imagePrompt: generated.imagePrompt,
    }),
  )
  if (!commit) return { ok: false, error: 'generation_failed' }

  if (commit.outcome === 'no_credits') {
    await removeQuietly(deps, saved.path)
    return { ok: false, error: 'no_credits', balance: commit.balance ?? undefined }
  }
  if (commit.outcome === 'invalid') {
    await removeQuietly(deps, saved.path)
    return { ok: false, error: 'busy' }
  }
  if (commit.outcome === 'ok') await removeQuietly(deps, commit.oldPath)

  const updated = await deps.store.get(userId, id)
  const view = updated ? toView(updated) : null
  return view ? { ok: true, preview: view } : { ok: false, error: 'not_found' }
}

/** "Kullan": charges 2 only in the free session, once, however many times it is sent. */
export async function usePreview(
  deps: PreviewDeps,
  input: { userId: string; id: string; key: string },
): Promise<{ ok: true; image: { src: string; alt: string; imagePrompt: string }; charged: number } | Failure> {
  const commit = await commitWithRetry(() => deps.store.commitUse(input.userId, input.id, input.key))
  if (!commit) return { ok: false, error: 'busy' }
  if (commit.outcome === 'no_credits') {
    return { ok: false, error: 'no_credits', balance: commit.balance ?? undefined }
  }
  if (commit.outcome === 'expired') return { ok: false, error: 'expired' }
  if (commit.outcome === 'invalid' || !commit.image) return { ok: false, error: 'not_found' }
  return { ok: true, image: commit.image, charged: commit.charged }
}

/** "Vazgeç / Kapat": always free. Never returns the free preview. */
export async function discardPreview(deps: PreviewDeps, input: { userId: string; id: string }) {
  const row = await deps.store.get(input.userId, input.id)
  if (!row || row.status !== 'open') return { ok: true as const }
  const path = await deps.store.release(input.userId, input.id, 'discarded').catch(() => null)
  await removeQuietly(deps, path ?? row.storagePath)
  return { ok: true as const }
}

export const PREVIEW_EXPIRY_MS = PREVIEW_TTL_MS
