import {
  PREVIEW_COSTS,
  PREVIEW_TTL_MS,
  useCost,
  type PreviewKind,
  type PreviewStatus,
} from '@/lib/ai-preview/policy'

/**
 * Preview-session service. All side effects (database, credit ledger, image
 * provider, storage) come in through `PreviewDeps`, so the credit rules are
 * unit-tested without a database. Every state change goes through one atomic
 * `claim*` call on the store, and every charge is tagged with a ledger reason
 * derived from the preview id, so repeats can never charge twice.
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
  lastRegenKey: string | null
  useKey: string | null
  expiresAt: number
  createdAt: number
}

export type ImagePatch = {
  imageUrl: string
  storagePath: string | null
  alt: string
  imagePrompt: string
}

export type PreviewStore = {
  /** True while the account's one free preview is still unused. */
  hasFreeEntitlement(userId: string): Promise<boolean>
  /** Atomic: true only for the single call that consumed it. */
  consumeFreeEntitlement(userId: string): Promise<boolean>
  /** The live (non-expired) preview of this section, expiring stale rows first. */
  findLive(userId: string, projectId: string, sectionKey: string, now: number): Promise<PreviewRow | null>
  get(userId: string, id: string): Promise<PreviewRow | null>
  /** Atomic insert of a `generating` row; fails when a live one exists. */
  claimSlot(
    input: { id: string; userId: string; projectId: string; sectionKey: string; target: string },
    now: number,
  ): Promise<{ claimed: true } | { claimed: false }>
  completeCreate(id: string, userId: string, patch: ImagePatch & { kind: PreviewKind; chargedCredits: number }, now: number): Promise<void>
  release(id: string, userId: string, status: 'discarded' | 'expired'): Promise<void>
  /** open -> regenerating; `duplicate` when this key already regenerated it; `inflight` while another request runs. */
  claimRegen(id: string, userId: string, key: string, now: number): Promise<'claimed' | 'duplicate' | 'inflight' | 'invalid'>
  completeRegen(id: string, userId: string, patch: ImagePatch, now: number): Promise<void>
  revertRegen(id: string, userId: string): Promise<void>
  /**
   * open -> using. `inflight` while another request holds it, `resume` only
   * when that attempt was abandoned (stale), `done` when already used.
   */
  claimUse(id: string, userId: string, key: string, now: number): Promise<'claimed' | 'resume' | 'inflight' | 'done' | 'invalid'>
  completeUse(id: string, userId: string, now: number): Promise<void>
  revertUse(id: string, userId: string): Promise<void>
}

export type GeneratedPreviewImage = { image: string; alt: string; imagePrompt: string }

export type PreviewDeps = {
  store: PreviewStore
  credits: {
    balance(userId: string): Promise<number>
    consume(userId: string, amount: number, reason: string): Promise<{ ok: boolean; balance: number }>
    /** Whether a ledger row with exactly this reason exists (fails closed). */
    charged(userId: string, reason: string): Promise<boolean>
  }
  /** Runs the existing image pipeline (no-text / no-people guards). Null = failed or rejected. */
  generate(input: { target: string; sectionKey: string; request: string }): Promise<GeneratedPreviewImage | null>
  storage: {
    save(userId: string, name: string, image: string): Promise<{ url: string; path: string | null } | null>
    remove(paths: string[]): Promise<void>
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

export async function getPreviewState(
  deps: PreviewDeps,
  input: { userId: string; projectId: string; sectionKey: string },
) {
  const [freeAvailable, balance, live] = await Promise.all([
    deps.store.hasFreeEntitlement(input.userId),
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

  const freeAvailable = await deps.store.hasFreeEntitlement(userId)
  if (!freeAvailable) {
    const balance = await deps.credits.balance(userId)
    if (balance < PREVIEW_COSTS.newPreview) return { ok: false, error: 'no_credits', balance }
  }

  const id = deps.newId()
  const slot = await deps.store.claimSlot({ id, userId, projectId, sectionKey, target }, deps.now())
  if (!slot.claimed) return { ok: false, error: 'busy' }

  const generated = await deps.generate({ target, sectionKey, request: input.request }).catch(() => null)
  const saved = generated ? await deps.storage.save(userId, `${id}-0`, generated.image).catch(() => null) : null
  if (!generated || !saved) {
    await deps.store.release(id, userId, 'discarded')
    return { ok: false, error: 'generation_failed' }
  }

  // The free preview is consumed only now, after an image really exists. Losing
  // the race to another request simply turns this into a paid preview.
  let kind: PreviewKind = 'paid'
  let charged = 0
  if (freeAvailable && (await deps.store.consumeFreeEntitlement(userId))) {
    kind = 'free'
  } else {
    const reason = `ai-preview-new:${id}`
    const alreadyCharged = await deps.credits.charged(userId, reason)
    if (!alreadyCharged) {
      const charge = await deps.credits.consume(userId, PREVIEW_COSTS.newPreview, reason)
      if (!charge.ok) {
        await deps.store.release(id, userId, 'discarded')
        await removeQuietly(deps, saved.path)
        return { ok: false, error: 'no_credits', balance: charge.balance }
      }
    }
    charged = PREVIEW_COSTS.newPreview
  }

  await deps.store.completeCreate(
    id,
    userId,
    { imageUrl: saved.url, storagePath: saved.path, alt: generated.alt, imagePrompt: generated.imagePrompt, kind, chargedCredits: charged },
    deps.now(),
  )
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
  const claim = await deps.store.claimRegen(id, userId, key, deps.now())
  if (claim === 'invalid') return { ok: false, error: 'not_found' }
  if (claim === 'inflight') return { ok: false, error: 'busy' }
  if (claim === 'duplicate') {
    const row = await deps.store.get(userId, id)
    const view = row ? toView(row) : null
    return view ? { ok: true, preview: view } : { ok: false, error: 'not_found' }
  }

  const row = await deps.store.get(userId, id)
  if (!row) return { ok: false, error: 'not_found' }
  const reason = `ai-preview-regen:${id}:${key}`

  // A key that was already charged is a replay of a finished press: return the
  // current image instead of generating (and giving away) another one.
  if (await deps.credits.charged(userId, reason)) {
    await deps.store.revertRegen(id, userId)
    const view = toView(row)
    return view ? { ok: true, preview: view } : { ok: false, error: 'not_found' }
  }

  const balance = await deps.credits.balance(userId)
  if (balance < PREVIEW_COSTS.regenerate) {
    await deps.store.revertRegen(id, userId)
    return { ok: false, error: 'no_credits', balance }
  }

  const generated = await deps
    .generate({ target: row.target, sectionKey: row.sectionKey, request: input.request })
    .catch(() => null)
  const saved = generated
    ? await deps.storage.save(userId, `${id}-${row.regenCount + 1}`, generated.image).catch(() => null)
    : null
  if (!generated || !saved) {
    await deps.store.revertRegen(id, userId)
    return { ok: false, error: 'generation_failed' }
  }

  const charge = await deps.credits.consume(userId, PREVIEW_COSTS.regenerate, reason)
  if (!charge.ok) {
    await deps.store.revertRegen(id, userId)
    await removeQuietly(deps, saved.path)
    return { ok: false, error: 'no_credits', balance: charge.balance }
  }

  await deps.store.completeRegen(
    id,
    userId,
    { imageUrl: saved.url, storagePath: saved.path, alt: generated.alt, imagePrompt: generated.imagePrompt },
    deps.now(),
  )
  await removeQuietly(deps, row.storagePath)
  const updated = await deps.store.get(userId, id)
  const view = updated ? toView(updated) : null
  return view ? { ok: true, preview: view } : { ok: false, error: 'not_found' }
}

/** "Kullan": charges 2 only in the free session, once, however many times it is sent. */
export async function usePreview(
  deps: PreviewDeps,
  input: { userId: string; id: string; key: string },
): Promise<{ ok: true; image: { src: string; alt: string; imagePrompt: string }; charged: number } | Failure> {
  const { userId, id, key } = input
  const claim = await deps.store.claimUse(id, userId, key, deps.now())
  if (claim === 'inflight') return { ok: false, error: 'busy' }
  if (claim === 'invalid') {
    const row = await deps.store.get(userId, id)
    return { ok: false, error: row && row.expiresAt <= deps.now() ? 'expired' : 'not_found' }
  }

  const row = await deps.store.get(userId, id)
  if (!row || !row.imageUrl || !row.kind) return { ok: false, error: 'not_found' }
  const image = { src: row.imageUrl, alt: row.alt ?? '', imagePrompt: row.imagePrompt ?? '' }
  if (claim === 'done') return { ok: true, image, charged: 0 }

  const cost = useCost(row.kind)
  let charged = 0
  if (cost > 0) {
    const reason = `ai-preview-use:${id}`
    if (!(await deps.credits.charged(userId, reason))) {
      const charge = await deps.credits.consume(userId, cost, reason)
      if (!charge.ok) {
        await deps.store.revertUse(id, userId)
        return { ok: false, error: 'no_credits', balance: charge.balance }
      }
      charged = cost
    }
  }
  await deps.store.completeUse(id, userId, deps.now())
  return { ok: true, image, charged }
}

/** "Vazgeç / Kapat": always free. Never returns the free preview. */
export async function discardPreview(deps: PreviewDeps, input: { userId: string; id: string }) {
  const row = await deps.store.get(input.userId, input.id)
  if (!row || row.status !== 'open') return { ok: true as const }
  await deps.store.release(input.id, input.userId, 'discarded')
  await removeQuietly(deps, row.storagePath)
  return { ok: true as const }
}

export const PREVIEW_EXPIRY_MS = PREVIEW_TTL_MS
