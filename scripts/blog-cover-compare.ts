/**
 * Developer-only blog cover model comparison.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/blog-cover-compare.ts [--runs=2] [--out=reports/blog-cover-compare.html] [--notes=reports/blog-cover-compare.notes.txt]
 *
 * A CLI script, not a route: nothing imports it and it is unreachable over
 * HTTP, so it has no effect on production. It refuses to run in production.
 * For three sample topics x the "Düz illüstrasyon" style it draws one cover per
 * candidate model with the production prompt builder, runs the production
 * quality checks (text and people detection) and writes a side-by-side HTML
 * report with live Gateway prices. It never changes any model setting.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gateway, generateImage } from 'ai'
import { buildCoverPrompt, deriveCoverConcepts } from '@/lib/blog-cover'
import { detectPeopleInImage } from '@/lib/blog-cover-inspect'
import { detectTextInImage } from '@/lib/image-text-guard'

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
const RUNS = Math.max(1, Number(opt('runs', '2')) || 1)
const OUT = opt('out', 'reports/blog-cover-compare.html')
const NOTES_PATH = opt('notes', 'reports/blog-cover-compare.notes.txt')
const TIMEOUT_MS = 90_000
const CONCURRENCY = 4
type Request = { size?: `${number}x${number}`; aspectRatio?: `${number}:${number}` }

/** Each model accepts different size knobs: recraft rejects 1536x1024, seedream wants >= 3.69 MP. */
const MODELS: Array<{ id: string; label: string; request: Request }> = [
  { id: 'bfl/flux-2-klein-4b', label: 'FLUX.2 klein 4B (mevcut varsayılan)', request: { size: '1536x1024' } },
  { id: 'recraft/recraft-v4.1', label: 'Recraft V4.1', request: { aspectRatio: '3:2' } },
  { id: 'bytedance/seedream-5.0-lite', label: 'Seedream 5.0 lite', request: { size: '2560x1440' } },
  { id: 'bfl/flux-3-image', label: 'FLUX.3 image', request: { size: '1536x1024' } },
]

const TOPICS = [
  { id: 'ai', title: 'Yapay zeka ile içerik üretiminde şeffaflık', excerpt: 'Yapay zeka araçlarını güvenle kullanmanın yolları' },
  { id: 'ecommerce', title: 'E-ticaret sitenizde sepet terk oranını düşürmenin yolları', excerpt: 'Online satışta dönüşümü artıran adımlar' },
  { id: 'law', title: 'Hukuk bürolarında sözleşme yönetimi', excerpt: 'Avukatlar için sözleşme süreçleri' },
]

const COLORS = ['blue', 'light gray', 'orange']

type Price = { image?: number; known: boolean }
type Row = {
  model: string
  topic: string
  run: number
  ok: boolean
  reason?: string
  ms: number
  text: string
  people: string
  src?: string
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

async function loadPrices(): Promise<Record<string, Price>> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models')
  const json = (await res.json()) as { data: Array<{ id: string; pricing?: { image?: string } }> }
  const out: Record<string, Price> = {}
  for (const m of MODELS) {
    const entry = json.data.find((x) => x.id === m.id)
    out[m.id] = { known: Boolean(entry), image: entry?.pricing?.image ? Number(entry.pricing.image) : undefined }
  }
  return out
}

async function job(model: string, topic: (typeof TOPICS)[number], run: number): Promise<Row> {
  const started = Date.now()
  const base: Row = { model, topic: topic.id, run, ok: false, ms: 0, text: '-', people: '-' }
  try {
    const { concepts } = await deriveCoverConcepts({ title: topic.title, excerpt: topic.excerpt })
    const prompt = buildCoverPrompt({ concepts, style: 'flat', colors: COLORS })
    const { image } = await generateImage({
      model: gateway.imageModel(model),
      prompt,
      ...(MODELS.find((m) => m.id === model)?.request ?? {}),
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ms = Date.now() - started
    const src = `data:${image.mediaType || 'image/png'};base64,${image.base64}`
    const [text, people] = await Promise.all([detectTextInImage(src), detectPeopleInImage(src)])
    return { ...base, ok: true, ms, text, people, src }
  } catch (err) {
    return { ...base, ms: Date.now() - started, reason: err instanceof Error ? err.message.slice(0, 140) : 'unknown' }
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

function summarise(rows: Row[], price: Price) {
  const ok = rows.filter((r) => r.ok)
  const clean = ok.filter((r) => r.text === 'clean' && r.people !== 'people')
  const leaks = ok.filter((r) => r.text === 'text').length
  const avgMs = ok.length ? ok.reduce((n, r) => n + r.ms, 0) / ok.length : 0
  const unitCost = price.image ?? 0
  const attempts = rows.length
  return {
    attempts,
    ok: ok.length,
    clean: clean.length,
    leaks,
    people: ok.filter((r) => r.people === 'people').length,
    avgMs,
    unitCost,
    costPerAccepted: clean.length ? (unitCost * attempts) / clean.length : 0,
  }
}

function render(rows: Row[], prices: Record<string, Price>, notes: string, startedAt: string): string {
  const usd = (n: number) => (n ? `$${n.toFixed(4)}` : '$0 / listelenmemiş')
  const summary = MODELS.map((m) => {
    const s = summarise(rows.filter((r) => r.model === m.id), prices[m.id])
    const price = prices[m.id]
    return `<tr><td><code>${esc(m.id)}</code><br>${esc(m.label)}</td><td>${price.known ? 'evet' : 'HAYIR'}</td><td>${price.image ? usd(price.image) : 'Gateway fiyatı yayınlamıyor (0)'}</td><td>${s.ok}/${s.attempts}</td><td>${s.leaks}</td><td>${s.people}</td><td>${(s.avgMs / 1000).toFixed(1)} sn</td><td>${s.clean ? usd(s.costPerAccepted) : '-'}</td></tr>`
  }).join('')
  const sections = TOPICS.map((t) => {
    const lines = MODELS.map((m) => {
      const cards = rows
        .filter((r) => r.topic === t.id && r.model === m.id)
        .map((r) =>
          r.ok && r.src
            ? `<figure><img src="${r.src}" alt="${esc(t.title)}" width="320" height="213"><figcaption>${(r.ms / 1000).toFixed(1)} sn · metin: ${r.text} · kişi: ${r.people}</figcaption></figure>`
            : `<figure class="fail"><div>BAŞARISIZ</div><small>${esc(r.reason ?? '')}</small></figure>`,
        )
        .join('')
      return `<h4>${esc(m.label)}</h4><div class="cards">${cards}</div>`
    }).join('')
    return `<section><h2>${esc(t.title)}</h2>${lines}</section>`
  }).join('')
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Blog kapak modeli karşılaştırması</title><style>
body{font:14px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#f6f6f4;color:#1b1b1b}
table{border-collapse:collapse;background:#fff;margin:8px 0}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px}th{background:#eee}
.cards{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:8px;padding:8px}img{display:block;border-radius:4px}
figcaption{font-size:11px;color:#555;margin-top:4px}.fail{color:#8a1c1c;background:#fbeaea;width:200px}pre{background:#fff;border:1px solid #ddd;padding:12px;white-space:pre-wrap}
</style></head><body>
<h1>Blog kapak modeli karşılaştırması</h1>
<p>Geliştirici aracı çıktısı (üretimi etkilemez). Tarih: ${esc(startedAt)} · Stil: Düz illüstrasyon · Konu başına tekrar: ${RUNS} · Boyut: modele göre (3:2 / 16:9) · Üretim istemi ve üretimdeki metin/kişi denetimi kullanıldı.</p>
<h3>Gateway kimlik ve fiyat doğrulaması (görsel başına)</h3>
<table><tr><th>Model</th><th>Çözüldü</th><th>Fiyat</th><th>Başarılı / deneme</th><th>Metin sızması</th><th>Kişi</th><th>Ort. süre</th><th>Kabul edilen kapak başına maliyet</th></tr>${summary}</table>
${sections}
<h2>Değerlendirme notu</h2>
<pre>${esc(notes || 'Not dosyası yok.')}</pre>
</body></html>`
}

async function main() {
  const startedAt = new Date().toISOString()
  const prices = await loadPrices()
  console.log('Prices:', JSON.stringify(prices))
  const tasks: Array<() => Promise<Row>> = []
  for (const topic of TOPICS) {
    for (const m of MODELS) {
      if (!prices[m.id].known) continue
      for (let run = 1; run <= RUNS; run++) tasks.push(() => job(m.id, topic, run))
    }
  }
  let done = 0
  const rows = await pool(
    tasks.map((t) => async () => {
      const r = await t()
      done++
      console.log(`[${done}/${tasks.length}] ${r.model} ${r.topic}#${r.run} ${r.ok ? `ok text=${r.text} people=${r.people}` : `FAIL ${r.reason}`} ${(r.ms / 1000).toFixed(1)}s`)
      return r
    }),
    CONCURRENCY,
  )
  let notes = ''
  try {
    notes = readFileSync(NOTES_PATH, 'utf8')
  } catch {
    notes = ''
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, render(rows, prices, notes, startedAt))
  for (const m of MODELS) {
    const s = summarise(rows.filter((r) => r.model === m.id), prices[m.id])
    console.log(`${m.id.padEnd(30)} ok ${s.ok}/${s.attempts} clean ${s.clean} leaks ${s.leaks} people ${s.people} avg ${(s.avgMs / 1000).toFixed(1)}s unit ${s.unitCost}`)
  }
  console.log(`Report: ${OUT}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
