/**
 * Phase M2 orchestration: preflight, validate-only and the ordered paused publish.
 * No I/O of its own: the Graph client, persistence callbacks and the image bytes are injected, so the same code
 * runs under the route handlers and under the mocked tests (no real Meta call).
 */
import { MetaAdsError } from '@/lib/ads/meta-ads-error'
import { formatMetaErrorCode, formatMetaErrorDiagnostic } from '@/lib/ads/meta-error-detail'
import type { MetaApiContext, MetaApiRequest } from '@/lib/ads/meta-api-client'
import {
  buildAdForm,
  buildAdImageForm,
  buildAdSetForm,
  buildCampaignForm,
  buildCreativeForm,
  type MetaPlanContent,
} from '@/lib/ads/meta-publish-plan'
import { describeMetaPublishError, type MetaPublishFailure, type MetaPublishStep } from '@/lib/ads/meta-publish-errors'

export type MetaGraph = { request(input: MetaApiRequest): Promise<unknown> }

export type MetaPublishObjects = {
  campaignId: string | null
  adSetId: string | null
  imageHash: string | null
  creativeId: string | null
  adId: string | null
}

export const EMPTY_OBJECTS: MetaPublishObjects = { campaignId: null, adSetId: null, imageHash: null, creativeId: null, adId: null }

type Common = {
  graph: MetaGraph
  accessToken: string
  context: MetaApiContext
  accountId: string
  apiVersion: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function numericId(value: unknown): string | null {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  return /^\d{5,25}$/.test(text) ? text : null
}

/* ----------------------------- preflight ----------------------------- */

export type MetaPreflight =
  | { ok: true; currency: string | null }
  | { ok: false; failure: MetaPublishFailure }

const PAGE_ACCESS_MESSAGE = 'Meta bağlantısı seçilen Facebook Sayfası için reklam erişimini doğrulayamadı. Meta Business Suite > Sayfa erişimi bölümünde reklam yetkisini (ADVERTISE veya MANAGE) kontrol edin.'
const INSTAGRAM_ACCESS_MESSAGE = 'Seçilen Instagram hesabı bu reklam hesabında kullanılamıyor. Meta Business Suite’te profesyonel Instagram hesabının bağlı Facebook Sayfasına ve reklam hesabına erişimi olduğunu doğrulayın.'

type MetaPreflightAccess = { pageId?: string | null; instagramAccountId?: string | null }

function accessFailure(message: string, metaReason: string | null = null): MetaPreflight {
  return { ok: false, failure: { code: 'page_required', message, metaReason, blamedFields: [] } }
}

async function findPageAccess(input: Common, pageId: string): Promise<Record<string, unknown> | null> {
  const query: Record<string, string> = { fields: 'id,tasks', limit: '100' }
  for (let page = 0; page < 3; page += 1) {
    const body = asRecord(await input.graph.request({
      endpoint: 'me.accounts',
      path: '/me/accounts',
      accessToken: input.accessToken,
      query,
      context: input.context,
    }))
    const rows = Array.isArray(body.data) ? body.data : []
    const found = rows.map(asRecord).find((row) => String(row.id ?? '') === pageId)
    if (found) return found

    const paging = asRecord(body.paging)
    const cursors = asRecord(paging.cursors)
    const after = typeof cursors.after === 'string' ? cursors.after : ''
    if (typeof paging.next !== 'string' || !after) break
    query.after = after
  }
  return null
}

/** Reads account status, funding, and (when supplied) Page/Instagram access before any write. */
export async function preflightMetaAccount(input: Common, access?: MetaPreflightAccess): Promise<MetaPreflight> {
  let body: Record<string, unknown>
  try {
    body = asRecord(await input.graph.request({
      endpoint: 'act.funding',
      path: `/${input.accountId}`,
      accessToken: input.accessToken,
      query: { fields: 'account_status,currency,funding_source,disable_reason' },
      context: input.context,
    }))
  } catch (error) {
    return { ok: false, failure: describeMetaPublishError(error, 'preflight') }
  }
  const status = Number(body.account_status)
  if (Number.isFinite(status) && status !== 1) {
    const disableReasons = Array.isArray(body.disable_reason)
      ? body.disable_reason.filter((value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0).slice(0, 5)
      : []
    return {
      ok: false,
      failure: {
        code: 'account_restricted',
        message: 'Reklam hesabı Meta tarafından etkin değil olarak işaretlenmiş. Meta Business Support Home > Hesap Kalitesi bölümünde kısıtlamayı, ödeme durumunu ve istenen reklamveren doğrulamasını kontrol edin.',
        metaReason: disableReasons.length ? `Meta disable_reason: ${disableReasons.join(', ')}` : null,
        blamedFields: [],
      },
    }
  }
  if ('funding_source' in body && (!body.funding_source || String(body.funding_source) === '0')) {
    return {
      ok: false,
      failure: {
        code: 'payment_method_missing',
        message: 'Meta hesabında ödeme yöntemi tanımlı olmalı. Meta Reklam Yöneticisi\'nden ödeme yöntemi ekleyip tekrar deneyin.',
        metaReason: null,
        blamedFields: [],
      },
    }
  }

  if (access?.pageId) {
    let page: Record<string, unknown> | null
    try {
      page = await findPageAccess(input, access.pageId)
    } catch (error) {
      const failure = describeMetaPublishError(error, 'preflight')
      if (failure.code === 'publish_permission_missing') return accessFailure(PAGE_ACCESS_MESSAGE, failure.metaReason)
      return { ok: false, failure }
    }
    if (!page) return accessFailure(PAGE_ACCESS_MESSAGE)
    const tasks = Array.isArray(page.tasks) ? page.tasks.filter((task): task is string => typeof task === 'string') : []
    if (tasks.length > 0 && !tasks.includes('ADVERTISE') && !tasks.includes('MANAGE')) {
      return accessFailure(PAGE_ACCESS_MESSAGE, `Meta Page tasks: ${tasks.join(', ')}`)
    }
  }

  if (access?.instagramAccountId) {
    let body: Record<string, unknown>
    try {
      body = asRecord(await input.graph.request({
        endpoint: 'act.instagram_accounts',
        path: `/${input.accountId}/instagram_accounts`,
        accessToken: input.accessToken,
        query: { fields: 'id,username', limit: '25' },
        context: input.context,
      }))
    } catch (error) {
      const failure = describeMetaPublishError(error, 'preflight')
      if (failure.code === 'publish_permission_missing') return accessFailure(INSTAGRAM_ACCESS_MESSAGE, failure.metaReason)
      return { ok: false, failure }
    }
    const accounts = Array.isArray(body.data) ? body.data.map(asRecord) : []
    if (!accounts.some((account) => String(account.id ?? '') === access.instagramAccountId)) {
      return accessFailure(INSTAGRAM_ACCESS_MESSAGE)
    }
  }

  return { ok: true, currency: typeof body.currency === 'string' ? body.currency : null }
}

/* ----------------------------- tag lookup ----------------------------- */

type Lookup = { endpoint: 'act.campaigns' | 'act.adsets' | 'act.adcreatives' | 'act.ads' | 'act.adimages'; edge: string; idField: 'id' | 'hash' }

const LOOKUPS: Record<'campaign' | 'adset' | 'image' | 'creative' | 'ad', Lookup> = {
  campaign: { endpoint: 'act.campaigns', edge: 'campaigns', idField: 'id' },
  adset: { endpoint: 'act.adsets', edge: 'adsets', idField: 'id' },
  creative: { endpoint: 'act.adcreatives', edge: 'adcreatives', idField: 'id' },
  ad: { endpoint: 'act.ads', edge: 'ads', idField: 'id' },
  image: { endpoint: 'act.adimages', edge: 'adimages', idField: 'hash' },
}

/** Finds an object this request already created, by the gloval-req tag in its name. GET only, so it may retry. */
const MAX_TAG_LOOKUP_PAGES = 3
const TAG_LOOKUP_PAGE_SIZE = '100'

export async function findObjectByTag(
  input: Common,
  kind: keyof typeof LOOKUPS,
  tag: string,
): Promise<string | null> {
  const lookup = LOOKUPS[kind]
  const query: Record<string, string> = { fields: `${lookup.idField},name`, limit: TAG_LOOKUP_PAGE_SIZE }

  for (let page = 0; page < MAX_TAG_LOOKUP_PAGES; page += 1) {
    const body = asRecord(await input.graph.request({
      endpoint: lookup.endpoint,
      path: `/${input.accountId}/${lookup.edge}`,
      accessToken: input.accessToken,
      query,
      context: input.context,
    }))
    const rows = Array.isArray(body.data) ? body.data : []
    for (const row of rows) {
      const record = asRecord(row)
      if (typeof record.name !== 'string' || !record.name.includes(tag)) continue
      const id = kind === 'image'
        ? (typeof record.hash === 'string' && /^[A-Za-z0-9]{8,64}$/.test(record.hash) ? record.hash : null)
        : numericId(record.id)
      if (id) return id
    }

    const paging = asRecord(body.paging)
    const cursors = asRecord(paging.cursors)
    const after = typeof cursors.after === 'string' ? cursors.after : ''
    if (typeof paging.next !== 'string' || !after) break
    query.after = after
  }

  return null
}

/* ----------------------------- validate only ----------------------------- */

export type MetaValidateResult =
  | { ok: true; checked: MetaPublishStep[]; deferred: MetaPublishStep[] }
  | { ok: false; step: MetaPublishStep; failure: MetaPublishFailure }

/**
 * validate_only pass. Meta can only dry-run an ad set/ad against an existing parent object, so the campaign is
 * always checked and the others only when an earlier partial publish already created their parent; the rest are
 * reported as `deferred` (checked for real during publish, still paused).
 */
export async function validateMetaPlanRemote(
  input: Common & { content: MetaPlanContent; dailyBudgetMinor: number; tag: string; hasInstagram: boolean; objects: MetaPublishObjects },
): Promise<MetaValidateResult> {
  const checked: MetaPublishStep[] = []
  const deferred: MetaPublishStep[] = []
  const write = async (step: MetaPublishStep, endpoint: 'act.campaigns.validate' | 'act.adsets.validate' | 'act.ads.validate', edge: string, form: Record<string, string>) => {
    await input.graph.request({
      endpoint,
      path: `/${input.accountId}/${edge}`,
      method: 'POST',
      accessToken: input.accessToken,
      form,
      context: input.context,
    })
    checked.push(step)
  }

  let step: MetaPublishStep = 'campaign'
  try {
    await write('campaign', 'act.campaigns.validate', 'campaigns', buildCampaignForm({
      name: input.content.name, tag: input.tag, apiVersion: input.apiVersion, validateOnly: true,
    }))
    if (input.objects.campaignId) {
      step = 'adset'
      await write('adset', 'act.adsets.validate', 'adsets', buildAdSetForm({
        content: input.content, dailyBudgetMinor: input.dailyBudgetMinor, campaignId: input.objects.campaignId,
        tag: input.tag, hasInstagram: input.hasInstagram, validateOnly: true,
      }))
    } else {
      deferred.push('adset')
    }
    if (input.objects.adSetId && input.objects.creativeId) {
      step = 'ad'
      await write('ad', 'act.ads.validate', 'ads', buildAdForm({
        content: input.content, adSetId: input.objects.adSetId, creativeId: input.objects.creativeId, tag: input.tag, validateOnly: true,
      }))
    } else {
      deferred.push('ad')
    }
    deferred.push('creative')
  } catch (error) {
    return { ok: false, step, failure: describeMetaPublishError(error, step) }
  }
  return { ok: true, checked, deferred }
}

/* ----------------------------- publish ----------------------------- */

/** A by-tag lookup that errored (and was therefore skipped): without it a retry can silently re-create objects. */
export type MetaLookupFailure = { step: MetaPublishStep; endpoint: string; code: string; message: string | null }

export type MetaPublishOutcome =
  | { ok: true; objects: MetaPublishObjects; lookupFailures: MetaLookupFailure[] }
  | { ok: false; step: MetaPublishStep; failure: MetaPublishFailure; objects: MetaPublishObjects; lookupFailures: MetaLookupFailure[] }

const WRITE_ENDPOINTS: Record<Exclude<MetaPublishStep, 'preflight'>, MetaApiRequest['endpoint']> = {
  campaign: 'act.campaigns.create',
  adset: 'act.adsets.create',
  image: 'act.adimages.create',
  creative: 'act.adcreatives.create',
  ad: 'act.ads.create',
}

function logTagLookupFailure(step: Exclude<MetaPublishStep, 'preflight'>, error: unknown, sink: MetaLookupFailure[]) {
  const metaError = error instanceof MetaAdsError ? error : null
  const diagnostic = formatMetaErrorDiagnostic(metaError?.detail ?? null)
  sink.push({
    step,
    endpoint: metaError?.endpoint ?? LOOKUPS[step].endpoint,
    code: metaError?.code ?? 'provider_error',
    message: metaError?.detail?.message ?? null,
  })
  console.error(
    `[meta-ads] tag lookup failed step=${step} endpoint=${metaError?.endpoint ?? LOOKUPS[step].endpoint} code=${formatMetaErrorCode(metaError?.detail ?? null)}${diagnostic ? ` detail=${diagnostic}` : ''}`,
  )
}

export type MetaPublishDeps = Common & {
  content: MetaPlanContent
  dailyBudgetMinor: number
  tag: string
  pageId: string
  instagramAccountId: string | null
  /** Loaded lazily so the image is only read from storage once the first step that needs it is reached. */
  loadImage: () => Promise<{ bytes: Uint8Array; filename: string }>
  /** Objects already recorded on the plan (a retry after partial success continues from them). */
  objects: MetaPublishObjects
  /** Persist progress and append an audit row right after every created/re-found object. */
  onStep: (step: MetaPublishStep, objectId: string, source: 'created' | 'reused' | 'found_by_tag') => Promise<void>
  /** Persist a safe diagnostic when a Meta write request fails; lookup errors remain non-blocking. */
  onWriteFailure?: (step: Exclude<MetaPublishStep, 'preflight'>, error: MetaAdsError) => Promise<void>
}

/**
 * campaign -> adset -> adimage -> adcreative -> ad, all PAUSED. Writes are never retried; after a timeout the
 * object is looked up by tag and the sequence continues without creating a duplicate. Nothing is ever deleted.
 */
export async function publishPausedMetaCampaign(deps: MetaPublishDeps): Promise<MetaPublishOutcome> {
  const objects: MetaPublishObjects = { ...deps.objects }
  const lookupFailures: MetaLookupFailure[] = []

  const create = async (
    step: Exclude<MetaPublishStep, 'preflight'>,
    existing: string | null,
    write: () => Promise<string | null>,
  ): Promise<string> => {
    if (existing) {
      await deps.onStep(step, existing, 'reused')
      return existing
    }
    let id: string | null = null
    let source: 'created' | 'found_by_tag' = 'created'
    // A previous attempt may have died after Meta accepted the write: look first, then create.
    try {
      id = await findObjectByTag(deps, step, deps.tag)
      if (id) source = 'found_by_tag'
    } catch (error) {
      logTagLookupFailure(step, error, lookupFailures)
      id = null
    }
    if (!id) {
      try {
        id = await write()
      } catch (error) {
        // Both mean "the write may have landed": an unusable 200 body is as ambiguous as a dropped connection.
        if (error instanceof MetaAdsError && (error.code === 'write_outcome_unknown' || error.code === 'meta_response_invalid')) {
          try {
            id = await findObjectByTag(deps, step, deps.tag)
            if (id) source = 'found_by_tag'
          } catch (lookupError) {
            logTagLookupFailure(step, lookupError, lookupFailures)
            id = null
          }
        }
        if (!id) {
          if (error instanceof MetaAdsError && error.endpoint === WRITE_ENDPOINTS[step]) {
            try {
              await deps.onWriteFailure?.(step, error)
            } catch {
              console.error(`[meta-ads] failed-write audit callback failed step=${step} endpoint=${error.endpoint}`)
            }
          }
          throw error
        }
      }
    }
    if (!id) throw new MetaAdsError('provider_error')
    await deps.onStep(step, id, source)
    return id
  }

  const post = async (endpoint: 'act.campaigns.create' | 'act.adsets.create' | 'act.adimages.create' | 'act.adcreatives.create' | 'act.ads.create', edge: string, form: Record<string, string>) =>
    asRecord(await deps.graph.request({
      endpoint,
      path: `/${deps.accountId}/${edge}`,
      method: 'POST',
      accessToken: deps.accessToken,
      form,
      context: deps.context,
    }))

  let step: Exclude<MetaPublishStep, 'preflight'> = 'campaign'
  try {
    objects.campaignId = await create('campaign', objects.campaignId, async () =>
      numericId((await post('act.campaigns.create', 'campaigns', buildCampaignForm({
        name: deps.content.name, tag: deps.tag, apiVersion: deps.apiVersion,
      }))).id))

    step = 'adset'
    const campaignId = objects.campaignId
    objects.adSetId = await create('adset', objects.adSetId, async () =>
      numericId((await post('act.adsets.create', 'adsets', buildAdSetForm({
        content: deps.content, dailyBudgetMinor: deps.dailyBudgetMinor, campaignId, tag: deps.tag, hasInstagram: Boolean(deps.instagramAccountId),
      }))).id))

    step = 'image'
    objects.imageHash = await create('image', objects.imageHash, async () => {
      const image = await deps.loadImage()
      const body = await post('act.adimages.create', 'adimages', buildAdImageForm({ bytes: image.bytes, filename: image.filename }))
      const images = asRecord(body.images)
      const first = asRecord(Object.values(images)[0])
      return typeof first.hash === 'string' && /^[A-Za-z0-9]{8,64}$/.test(first.hash) ? first.hash : null
    })

    step = 'creative'
    const imageHash = objects.imageHash
    objects.creativeId = await create('creative', objects.creativeId, async () =>
      numericId((await post('act.adcreatives.create', 'adcreatives', buildCreativeForm({
        content: deps.content, pageId: deps.pageId, instagramAccountId: deps.instagramAccountId, imageHash, tag: deps.tag,
      }))).id))

    step = 'ad'
    const adSetId = objects.adSetId
    const creativeId = objects.creativeId
    objects.adId = await create('ad', objects.adId, async () =>
      numericId((await post('act.ads.create', 'ads', buildAdForm({
        content: deps.content, adSetId, creativeId, tag: deps.tag,
      }))).id))
  } catch (error) {
    return { ok: false, step, failure: describeMetaPublishError(error, step), objects, lookupFailures }
  }
  return { ok: true, objects, lookupFailures }
}
