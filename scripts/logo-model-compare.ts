/**
 * Developer-only logo emblem comparison.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/logo-model-compare.ts [--runs=1] [--set=3] [--out=reports/logo-model-compare.html] [--notes=reports/logo-model-compare.notes.txt]
 *
 * It is a CLI script, not a route: nothing imports it and nothing is reachable
 * over HTTP, so it has no effect on production. It refuses to run when the
 * environment says it is production. For three fictional briefs it draws one
 * SET of emblems per candidate method and writes a side-by-side HTML report:
 *   (a) the current Logo Studio pipeline (local library + production AI prompt),
 *   (b) SVG drawn by LLMs from one shared prompt,
 *   (c) an image model's flat logo mark.
 * It never changes the production pipeline, credits or any model setting.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gateway, generateImage, generateText } from 'ai'
import { buildEmblemPrompt, compositionFor, objectRankFor } from '@/lib/logo-studio/emblem-prompt'
import { drawLocalEmblem, pickLocalEmblems, sectorOf } from '@/lib/logo-studio/emblem-local'
import { splitSvg } from '@/lib/logo-studio/compose'
import { AI_EMBLEMS_PER_ROUND, LOGO_EMBLEM_CREDITS, type LogoColors } from '@/lib/logo-studio/rules'
import {
  LLM_SYSTEM_PROMPT,
  LOGO_BRIEFS,
  buildImagePrompt,
  buildLlmUserPrompt,
  costUsd,
  esc,
  pngDataUri,
  svgDataUri,
  usd,
  validateRaster,
  validateSvg,
  type LogoBrief,
  type Price,
} from './logo-compare/lib'

if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: this tool is for development only.')
  process.exit(1)
}
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('No AI Gateway credentials in the environment.')
  process.exit(1)
}

const args = process.argv.slice(2)
const opt = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback
const RUNS = Math.max(1, Number(opt('runs', '1')) || 1)
const SET_SIZE = Math.min(3, Math.max(1, Number(opt('set', '3')) || 3))
const OUT = opt('out', 'reports/logo-model-compare.html')
const NOTES_PATH = opt('notes', 'reports/logo-model-compare.notes.txt')
const RAW_OUT = OUT.replace(/(\.html)?$/, '') + '.raw.json'
const CONCURRENCY = 6
const TIMEOUT_MS = 150_000

/* ------------------------------------------------------------------ */
/* Methods                                                             */
/* ------------------------------------------------------------------ */

type MethodKind = 'local' | 'prod-ai' | 'llm' | 'image'
type Method = { id: string; group: 'a' | 'b' | 'c'; label: string; kind: MethodKind; model?: string }

/** The production default (`LOGO_MODEL` unset) is Claude Haiku 4.5 over the Anthropic API; the gateway id is the same model, used here so tokens are measurable. */
const PROD_AI_MODEL = 'anthropic/claude-haiku-4.5'
const IMAGE_MODEL = 'recraft/recraft-v4.1'

const METHODS: Method[] = [
  { id: 'a-local', group: 'a', label: 'Mevcut hat: yerel kütüphane (6 öneri, ücretsiz)', kind: 'local' },
  { id: 'a-ai', group: 'a', label: `Mevcut hat: AI amblem (${PROD_AI_MODEL}, üretim istemi)`, kind: 'prod-ai', model: PROD_AI_MODEL },
  { id: 'b-opus', group: 'b', label: 'LLM SVG: claude-opus-5.5', kind: 'llm', model: 'anthropic/claude-opus-5.5' },
  { id: 'b-sonnet', group: 'b', label: 'LLM SVG: claude-sonnet-5.5', kind: 'llm', model: 'anthropic/claude-sonnet-5.5' },
  { id: 'b-gpt', group: 'b', label: 'LLM SVG: gpt-5-mini', kind: 'llm', model: 'openai/gpt-5-mini' },
  { id: 'c-image', group: 'c', label: `Görsel modeli: ${IMAGE_MODEL} (düz logo işareti, raster)`, kind: 'image', model: IMAGE_MODEL },
]

type Candidate = {
  method: string
  brief: string
  run: number
  idx: number
  subject: string
  ok: boolean
  reason?: string
  ms: number
  inputTokens: number
  outputTokens: number
  cost: number
  svg?: string
  png?: string
  shapes?: number
  colors?: number
  notes: string[]
  caption?: string
  raw?: string
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

async function loadPrices(): Promise<{ prices: Record<string, Price>; missing: string[] }> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models')
  const json = (await res.json()) as {
    data: Array<{ id: string; pricing?: { input?: string; output?: string; image?: string } }>
  }
  const prices: Record<string, Price> = {}
  const missing: string[] = []
  for (const id of new Set(METHODS.flatMap((m) => (m.model ? [m.model] : [])))) {
    const p = json.data.find((m) => m.id === id)?.pricing
    if (!p || (!p.image && !(p.input && p.output))) {
      missing.push(id)
      continue
    }
    prices[id] = { input: Number(p.input ?? 0), output: Number(p.output ?? 0), image: p.image ? Number(p.image) : undefined }
  }
  return { prices, missing }
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

type Ctx = { prices: Record<string, Price> }

const colorsOf = (b: LogoBrief): LogoColors => ({ a: b.palette.primary, b: b.palette.accent, ink: b.palette.primary, fg: b.palette.primaryFg })

function blank(method: Method, brief: LogoBrief, run: number, idx: number, subject: string): Candidate {
  return { method: method.id, brief: brief.id, run, idx, subject, ok: false, ms: 0, inputTokens: 0, outputTokens: 0, cost: 0, notes: [] }
}

async function localCandidates(method: Method, brief: LogoBrief): Promise<Candidate[]> {
  const picks = pickLocalEmblems({ count: 6, brand: brief.brand, context: `${brief.industry} ${brief.description}`, seed: 0 })
  return Promise.all(
    picks.map(async (p, idx) => {
      const emblem = drawLocalEmblem(p, brief.style, colorsOf(brief))
      const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${emblem.viewBox.w} ${emblem.viewBox.h}" width="${emblem.viewBox.w}" height="${emblem.viewBox.h}">${emblem.inner}</svg>`
      const verdict = await validateSvg(raw)
      const base = { ...blank(method, brief, 0, idx, p.entry), caption: p.entry }
      if (!verdict.ok) return { ...base, reason: verdict.reason }
      return { ...base, ok: true, svg: verdict.svg, shapes: verdict.stats.shapes, colors: verdict.stats.colors, notes: verdict.notes }
    }),
  )
}

async function runModelText(model: string, system: string, prompt: string, maxOutputTokens: number) {
  const started = Date.now()
  const result = await generateText({
    model: gateway(model),
    system,
    prompt,
    maxOutputTokens,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return {
    text: result.text,
    finish: result.finishReason,
    ms: Date.now() - started,
    usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 },
  }
}

async function svgJob(method: Method, brief: LogoBrief, run: number, idx: number, ctx: Ctx): Promise<Candidate> {
  const model = method.model as string
  const isProd = method.kind === 'prod-ai'
  const subject = isProd
    ? `nesne sırası ${objectRankFor(idx, 0, AI_EMBLEMS_PER_ROUND)} · ${compositionFor(idx, 0).id}`
    : brief.subjects[idx % brief.subjects.length]
  const out = blank(method, brief, run, idx, subject)
  const t0 = Date.now()
  try {
    let system = LLM_SYSTEM_PROMPT
    let prompt = buildLlmUserPrompt(brief, subject)
    if (isProd) {
      const p = buildEmblemPrompt(
        {
          brand: brief.brand,
          sector: brief.industry,
          description: brief.description,
          style: brief.style,
          colors: [brief.palette.primary, brief.palette.accent],
          index: idx,
          seed: 0,
        },
        AI_EMBLEMS_PER_ROUND,
      )
      system = p.system
      prompt = p.user
    }
    const r = await runModelText(model, system, prompt, isProd ? 2500 : 8000)
    out.ms = r.ms
    out.inputTokens = r.usage.inputTokens
    out.outputTokens = r.usage.outputTokens
    out.cost = costUsd(r.usage, ctx.prices[model])
    out.raw = r.text.slice(0, 600)
    if (r.finish === 'length') return { ...out, reason: 'çıktı token sınırında kesildi' }
    const verdict = await validateSvg(r.text)
    if (!verdict.ok) return { ...out, reason: verdict.reason }
    if (isProd) {
      const parts = splitSvg(verdict.svg)
      if (!parts || parts.inner.length > 25_000) return { ...out, reason: 'üretim kontrolü: boyut/viewBox' }
    }
    return { ...out, ok: true, svg: verdict.svg, shapes: verdict.stats.shapes, colors: verdict.stats.colors, notes: verdict.notes }
  } catch (err) {
    out.ms = Date.now() - t0
    return { ...out, reason: err instanceof Error ? err.name === 'TimeoutError' ? 'zaman aşımı' : err.message.slice(0, 120) : 'bilinmeyen hata' }
  }
}

async function imageJob(method: Method, brief: LogoBrief, run: number, idx: number, ctx: Ctx): Promise<Candidate> {
  const model = method.model as string
  const subject = brief.subjects[idx % brief.subjects.length]
  const out = blank(method, brief, run, idx, subject)
  const t0 = Date.now()
  try {
    const result = await generateImage({
      model: gateway.imageModel(model),
      prompt: buildImagePrompt(brief, subject),
      size: '1024x1024',
      n: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    out.ms = Date.now() - t0
    out.cost = ctx.prices[model]?.image ?? 0
    const verdict = await validateRaster(result.image.uint8Array)
    if (!verdict.ok) return { ...out, reason: verdict.reason }
    return { ...out, ok: true, png: pngDataUri(verdict.png), colors: verdict.stats.colors, notes: ['raster: düzenlenemez/yeniden renklendirilemez'] }
  } catch (err) {
    out.ms = Date.now() - t0
    return { ...out, reason: err instanceof Error ? err.name === 'TimeoutError' ? 'zaman aşımı' : err.message.slice(0, 120) : 'bilinmeyen hata' }
  }
}

async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++
        results[i] = await tasks[i]()
      }
    }),
  )
  return results
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

type Summary = {
  method: Method
  attempts: number
  valid: number
  avgMs: number
  avgCost: number
  costPerValid: number
  avgShapes: number
  softMisses: number
}

function summarise(method: Method, list: Candidate[]): Summary {
  const valid = list.filter((c) => c.ok)
  const sum = (f: (c: Candidate) => number, xs: Candidate[]) => xs.reduce((n, c) => n + f(c), 0)
  const shaped = valid.filter((c) => typeof c.shapes === 'number')
  const totalCost = sum((c) => c.cost, list)
  return {
    method,
    attempts: list.length,
    valid: valid.length,
    avgMs: list.length ? sum((c) => c.ms, list) / list.length : 0,
    avgCost: list.length ? totalCost / list.length : 0,
    costPerValid: valid.length ? totalCost / valid.length : 0,
    avgShapes: shaped.length ? sum((c) => c.shapes ?? 0, shaped) / shaped.length : 0,
    softMisses: valid.filter((c) => c.notes.some((n) => !n.startsWith('raster'))).length,
  }
}

function card(c: Candidate): string {
  const meta = [
    c.ms ? `${(c.ms / 1000).toFixed(1)} sn` : '',
    c.cost ? usd(c.cost) : '',
    c.shapes !== undefined ? `${c.shapes} şekil` : '',
    c.colors !== undefined ? `${c.colors} renk` : '',
  ].filter(Boolean)
  const src = c.svg ? svgDataUri(c.svg) : c.png
  const body = c.ok && src
    ? `<div class="art"><img src="${src}" alt="${esc(c.subject)}" width="132" height="132"><img class="small" src="${src}" alt="" width="24" height="24"></div>`
    : `<div class="art fail"><span>GEÇERSİZ</span><small>${esc(c.reason ?? '')}</small></div>`
  const caption = esc(c.caption ?? c.subject)
  const notes = c.notes.length ? `<div class="notes">${esc(c.notes.join(' · '))}</div>` : ''
  return `<figure class="card">${body}<figcaption><div>${caption}</div><div class="meta">${esc(meta.join(' · '))}</div>${notes}</figcaption></figure>`
}

function renderHtml(args: {
  candidates: Candidate[]
  prices: Record<string, Price>
  missing: string[]
  notes: string
  startedAt: string
}): string {
  const { candidates, prices, missing, notes, startedAt } = args
  const summaries = METHODS.map((m) => summarise(m, candidates.filter((c) => c.method === m.id)))
  const priceRows = METHODS.filter((m) => m.model)
    .map((m) => {
      const p = prices[m.model as string]
      const cells = p
        ? m.kind === 'image'
          ? `<td>evet</td><td colspan="2">görsel başına ${usd(p.image ?? 0, 3)}</td>`
          : `<td>evet</td><td>${(p.input * 1e6).toFixed(2)}</td><td>${(p.output * 1e6).toFixed(2)}</td>`
        : '<td>HAYIR</td><td>-</td><td>-</td>'
      return `<tr><td><code>${esc(m.model as string)}</code></td>${cells}</tr>`
    })
    .join('')
  const summaryRows = summaries
    .map((s) => {
      const rate = s.attempts ? Math.round((s.valid / s.attempts) * 100) : 0
      return `<tr><td>${esc(s.method.label)}</td><td>${s.valid}/${s.attempts} (%${rate})</td><td>${s.avgMs ? (s.avgMs / 1000).toFixed(1) : '-'}</td><td>${s.avgCost ? usd(s.avgCost) : 'ücretsiz'}</td><td>${s.costPerValid ? usd(s.costPerValid) : '-'}</td><td>${s.avgShapes ? s.avgShapes.toFixed(0) : '-'}</td><td>${s.softMisses}</td></tr>`
    })
    .join('')
  const credit = AI_EMBLEMS_PER_ROUND * LOGO_EMBLEM_CREDITS

  const sections = LOGO_BRIEFS.map((b) => {
    const sector = sectorOf(`${b.brand} ${b.industry} ${b.description}`)
    const rows = METHODS.map((m) => {
      const list = candidates.filter((c) => c.brief === b.id && c.method === m.id)
      return `<div class="row"><h4>${esc(m.label)}</h4><div class="cards">${list.map(card).join('')}</div></div>`
    }).join('')
    return `<section><h2>${esc(b.title)}</h2><p class="brief">Stil: ${b.style} · palet: <span class="sw" style="background:${b.palette.primary}"></span>${b.palette.primary} <span class="sw" style="background:${b.palette.accent}"></span>${b.palette.accent} · yerel kütüphane sektör eşleşmesi: <b>${esc(sector.id)}</b></p>${rows}</section>`
  }).join('')

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Logo amblem karşılaştırması</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#f6f6f4;color:#1b1b1b}
h1{margin:0 0 4px}h2{margin:32px 0 4px}h4{margin:16px 0 6px;font-size:13px}
table{border-collapse:collapse;background:#fff;margin:8px 0}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px}th{background:#eee}
.cards{display:flex;flex-wrap:wrap;gap:10px}.card{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px;width:156px}
.art{height:140px;display:flex;align-items:center;justify-content:center;gap:6px;background:#fff;position:relative}.art .small{position:absolute;right:2px;bottom:2px;border:1px dashed #ccc}
.art.fail{flex-direction:column;background:#fbeaea;color:#8a1c1c;text-align:center;font-size:12px}
figcaption{font-size:11px;color:#444;margin-top:6px;word-break:break-word}.meta{color:#777}.notes{color:#a15c00}
.brief{color:#555}.sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:baseline}
pre.note{background:#fff;border:1px solid #ddd;padding:12px;white-space:pre-wrap}
</style></head><body>
<h1>Logo amblem karşılaştırması</h1>
<p>Geliştirici aracı çıktısı (üretimi etkilemez). Tarih: ${esc(startedAt)} · Tekrar: ${RUNS} · Küme boyutu: ${SET_SIZE} · Kişisel veri yok (kurgusal markalar). Her kartın sağ altındaki küçük kutu 24 px önizlemedir. Mevcut hatta AI turu ${AI_EMBLEMS_PER_ROUND} amblem x ${LOGO_EMBLEM_CREDITS} kredi = ${credit} kredidir.</p>
${missing.length ? `<p><b>Gateway'de fiyatı çözülemeyen modeller:</b> ${esc(missing.join(', '))}</p>` : ''}
<h3>Gateway kimlik ve fiyat doğrulaması ($/1M token)</h3>
<table><tr><th>Model</th><th>Çözüldü</th><th>Giriş</th><th>Çıkış</th></tr>${priceRows}</table>
<h3>Özet</h3>
<table><tr><th>Yöntem</th><th>Geçerli / deneme</th><th>Ort. süre (sn)</th><th>Ort. maliyet / deneme</th><th>Geçerli amblem başına</th><th>Ort. şekil</th><th>Yumuşak kural ihlali</th></tr>${summaryRows}</table>
<p class="brief">Geçerli: temizleyiciden geçti, boş/arka plan dolduran/okunmaz/aşırı karmaşık (&gt;60 şekil) değil. Yumuşak ihlal: &gt;24 şekil veya &gt;3 renk. Maliyet gateway liste fiyatıyla, token başına.</p>
${sections}
<h2>Değerlendirme notu</h2>
<pre class="note">${esc(notes || 'Not dosyası yok.')}</pre>
</body></html>`
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const startedAt = new Date().toISOString()
  const { prices, missing } = await loadPrices()
  const ctx: Ctx = { prices }
  console.log('Gateway prices resolved:', Object.keys(prices).join(', '), missing.length ? `| MISSING: ${missing.join(', ')}` : '')

  const candidates: Candidate[] = []
  const tasks: Array<() => Promise<Candidate>> = []
  for (const brief of LOGO_BRIEFS) {
    for (const method of METHODS) {
      if (method.kind === 'local') {
        candidates.push(...(await localCandidates(method, brief)))
        continue
      }
      if (!prices[method.model as string]) continue
      const count = method.kind === 'prod-ai' ? AI_EMBLEMS_PER_ROUND : SET_SIZE
      for (let run = 1; run <= RUNS; run++) {
        for (let idx = 0; idx < count; idx++) {
          tasks.push(() => (method.kind === 'image' ? imageJob(method, brief, run, idx, ctx) : svgJob(method, brief, run, idx, ctx)))
        }
      }
    }
  }
  console.log(`Running ${tasks.length} model calls (concurrency ${CONCURRENCY})...`)
  let done = 0
  const results = await pool(
    tasks.map((t) => async () => {
      const r = await t()
      done++
      console.log(`[${done}/${tasks.length}] ${r.method} ${r.brief}#${r.idx} ${r.ok ? 'ok' : `FAIL (${r.reason})`} ${(r.ms / 1000).toFixed(1)}s`)
      return r
    }),
    CONCURRENCY,
  )
  candidates.push(...results)

  let notes = ''
  try {
    notes = readFileSync(NOTES_PATH, 'utf8')
  } catch {
    notes = ''
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, renderHtml({ candidates, prices, missing, notes, startedAt }))
  writeFileSync(RAW_OUT, JSON.stringify(candidates.map(({ svg, png, ...rest }) => rest), null, 2))
  console.log(`Report: ${OUT}`)

  for (const s of METHODS.map((m) => summarise(m, candidates.filter((c) => c.method === m.id)))) {
    console.log(
      `${s.method.id.padEnd(10)} valid ${s.valid}/${s.attempts} | ${(s.avgMs / 1000).toFixed(1)}s | avg ${usd(s.avgCost)} | per valid ${usd(s.costPerValid)} | shapes ${s.avgShapes.toFixed(0)} | soft ${s.softMisses}`,
    )
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
