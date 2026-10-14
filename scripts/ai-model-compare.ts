/**
 * Developer-only model comparison for the plan-based AI tiers.
 *
 *   set -a && source /vercel/share/.env.project && set +a
 *   npx tsx scripts/ai-model-compare.ts [--opus] [--runs=2] [--out=reports/ai-model-compare.md]
 *
 * It is a CLI script, not a route: nothing here is reachable over HTTP and
 * nothing imports it, so it has no effect on production. It additionally
 * refuses to run when the environment says it is production. It runs the REAL
 * production prompts and schemas (site generation, one-section edit, product
 * text) against several gateway models and writes a side-by-side markdown
 * report. It never touches AI_TIER_MODELS.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { generateStructured } from '@/lib/ai-structured'
import { generateSiteObject } from '@/lib/site-generate'
import { pageLimitForPlan } from '@/lib/page-limits'
import { sectionSystemPrompt, sectionUserPrompt } from '@/lib/site-edit-prompts'
import {
  buildSystemPrompt,
  buildUserPrompt,
  generatedSchema,
  normalizeGenerated,
  type StoreAiTextInput,
} from '@/lib/store-ai-text'
import { fallbackWebsite, sectionSchema, type Section, type WebsiteSchema } from '@/lib/website-schema'
import { AI_TIER_MODELS, resolveAiModel } from '@/lib/ai-models'

if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') {
  console.error('Refusing to run: this tool is for development only.')
  process.exit(1)
}
if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
  console.error('No AI Gateway credentials in the environment.')
  process.exit(1)
}

const args = process.argv.slice(2)
const flag = (name: string) => args.some((a) => a === `--${name}`)
const opt = (name: string, fallback: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback

const MODELS = [
  'openai/gpt-5-mini',
  'anthropic/claude-sonnet-5.5',
  ...(flag('opus') ? ['anthropic/claude-opus-5.5'] : []),
]
const RUNS = Math.max(1, Number(opt('runs', '1')) || 1)
const OUT = opt('out', 'reports/ai-model-compare.md')
const RAW_OUT = OUT.replace(/(\.md)?$/, '') + '.raw.json'
const CONCURRENCY = 6
const TIMEOUT_MS = 280_000

/* ------------------------------------------------------------------ */
/* Briefs                                                              */
/* ------------------------------------------------------------------ */

type Brief = {
  id: string
  title: string
  prompt: string
  editInstruction: string
  editExpect: string
  product: { name: string; specs: Array<{ name: string; value: string }> }
}

const BRIEFS: Brief[] = [
  {
    id: 'jewelry',
    title: 'Mücevher e-ticaret',
    prompt:
      'Kadıköy merkezli, el yapımı gümüş ve altın takı satan şık bir online mağaza kurmak istiyorum. Yüzük, kolye ve bileklik koleksiyonları olacak, sepet ve ödeme olsun.',
    editInstruction:
      'Ana başlığı daha sıcak ve davetkar bir tonda yeniden yaz, birincil buton metnini "Koleksiyonu Keşfet" yap.',
    editExpect: 'Koleksiyonu Keşfet',
    product: { name: 'Zirkon Taşlı Tektaş Yüzük', specs: [{ name: 'Renk', value: 'Gümüş' }] },
  },
  {
    id: 'yoga',
    title: 'Yoga stüdyosu',
    prompt:
      'Beşiktaş\'ta butik bir yoga ve pilates stüdyosu açtım. Sakin, doğal bir site istiyorum; ders programı, eğitmenler ve randevu alma bölümü olsun.',
    editInstruction:
      'Ana başlığı daha huzurlu ve samimi yap, birincil buton metnini "Deneme Dersi Al" olarak değiştir.',
    editExpect: 'Deneme Dersi Al',
    product: { name: 'Kaymaz Yoga Matı 6 mm', specs: [] },
  },
  {
    id: 'agency',
    title: 'Dijital ajans',
    prompt:
      'İstanbul\'da faaliyet gösteren, SEO, sosyal medya yönetimi ve web tasarım hizmeti veren bir dijital ajans için kurumsal ve modern bir web sitesi.',
    editInstruction:
      'Ana başlığı daha net ve sonuç odaklı yap, birincil buton metnini "Ücretsiz Analiz İste" olarak değiştir.',
    editExpect: 'Ücretsiz Analiz İste',
    product: { name: 'Aylık SEO Raporu Şablonu (PDF)', specs: [{ name: 'Format', value: 'PDF' }] },
  },
]

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

type Price = { input: number; output: number }

async function loadPrices(): Promise<{ prices: Record<string, Price>; missing: string[] }> {
  const res = await fetch('https://ai-gateway.vercel.sh/v1/models')
  const json = (await res.json()) as {
    data: Array<{ id: string; pricing?: { input?: string; output?: string } }>
  }
  const prices: Record<string, Price> = {}
  const missing: string[] = []
  for (const id of MODELS) {
    const entry = json.data.find((m) => m.id === id)
    if (!entry?.pricing?.input || !entry.pricing.output) {
      missing.push(id)
      continue
    }
    prices[id] = { input: Number(entry.pricing.input), output: Number(entry.pricing.output) }
  }
  return { prices, missing }
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

type OpName = 'siteGenerate' | 'sectionEdit' | 'productText'
const OP_LABEL: Record<OpName, string> = {
  siteGenerate: 'Site üretimi',
  sectionEdit: 'Bölüm düzenleme',
  productText: 'Ürün metni',
}

type Result = {
  brief: string
  op: OpName
  model: string
  run: number
  ok: boolean
  error?: string
  /** Output exists but breaks a rule the production code relies on. */
  violations: string[]
  ms: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  output?: unknown
  /** How the shared production pipeline got (or failed to get) the answer. */
  pipeline?: { outcome: 'first_try' | 'repaired' | 'retried' | 'failed'; attempts: number; repairs: string[] }
  /** Heuristic Turkish-quality signals. */
  englishLeaks: number
  turkishChars: number
}

function stringLeaves(value: unknown, path = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((v, i) => stringLeaves(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) stringLeaves(v, path ? `${path}.${k}` : k, out)
  return out
}

const SKIP_KEY = /(imagePrompt|\.src$|href|icon|color|hex|font|variant|type$|id$|aspectRatio|language|slug|mapEmbed|url)/i

function proseOf(output: unknown): string {
  return stringLeaves(output)
    .filter(([k]) => !SKIP_KEY.test(k))
    .map(([, v]) => v)
    .join(' \n ')
}

function languageSignals(output: unknown) {
  const text = proseOf(output)
  const englishLeaks = (text.match(/\b(the|and|your|with|for|our|we|you|are|is)\b/gi) ?? []).length
  const turkishChars = (text.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length
  return { englishLeaks, turkishChars }
}

type Usage = { inputTokens?: number; outputTokens?: number } | undefined

async function runCell(
  brief: Brief,
  op: OpName,
  model: string,
  run: number,
  prices: Record<string, Price>,
): Promise<Result> {
  const started = Date.now()
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  const base = { brief: brief.id, op, model, run }
  let usage: Usage
  let pipeline: Result['pipeline']
  try {
    let output: unknown
    const violations: string[] = []

    if (op === 'siteGenerate') {
      const r = await generateSiteObject({
        ai: { ...resolveAiModel('siteGenerate', 'free'), model },
        prompt: brief.prompt,
        lang: 'tr',
        pageLimit: pageLimitForPlan('free'),
        abortSignal: signal,
      })
      usage = r.usage
      output = r.site
      pipeline = { outcome: r.outcome, attempts: r.attempts, repairs: r.repairs.map((s) => s.code) }
      violations.push(...checkSite(r.site, brief))
    } else if (op === 'sectionEdit') {
      const site = fallbackWebsite(brief.prompt, 'tr')
      const target = site.sections[0] as Section
      const r = await generateStructured({
        ai: { ...resolveAiModel('sectionEdit', 'free'), model },
        schema: z.object({ section: sectionSchema }),
        system: sectionSystemPrompt('tr', 'Turkish'),
        prompt: sectionUserPrompt(target, brief.editInstruction),
        abortSignal: signal,
      })
      usage = r.usage
      output = r.object.section
      pipeline = { outcome: r.outcome, attempts: r.attempts, repairs: r.repairs.map((s) => s.code) }
      violations.push(...checkSectionEdit(target, r.object.section as Section, brief))
    } else {
      const input: StoreAiTextInput = {
        name: brief.product.name,
        categoryId: null,
        categories: [
          { id: 'cat-1', name: 'Ürünler' },
          { id: 'cat-2', name: 'Aksesuarlar' },
        ],
        specs: brief.product.specs,
        imageUrls: [],
        lang: 'tr',
      }
      const r = await generateStructured({
        ai: { ...resolveAiModel('productText', 'free'), model },
        schema: generatedSchema,
        system: buildSystemPrompt('tr'),
        prompt: buildUserPrompt(input),
        abortSignal: signal,
      })
      usage = r.usage
      pipeline = { outcome: r.outcome, attempts: r.attempts, repairs: r.repairs.map((s) => s.code) }
      const normalized = normalizeGenerated(r.object, input)
      output = { raw: r.object, normalized }
      violations.push(...checkProduct(r.object, normalized, brief))
    }

    const price = prices[model]
    const inputTokens = usage?.inputTokens ?? 0
    const outputTokens = usage?.outputTokens ?? 0
    return {
      ...base,
      ok: true,
      violations,
      ms: Date.now() - started,
      inputTokens,
      outputTokens,
      costUsd: price ? inputTokens * price.input + outputTokens * price.output : 0,
      output,
      pipeline,
      ...languageSignals(op === 'productText' ? (output as { normalized: unknown }).normalized : output),
    }
  } catch (err) {
    const e = err as { message?: string; usage?: Usage; attempts?: number }
    const inputTokens = e?.usage?.inputTokens ?? 0
    const outputTokens = e?.usage?.outputTokens ?? 0
    const price = prices[model]
    return {
      ...base,
      ok: false,
      error: (e?.message ?? String(err)).split('\n')[0].slice(0, 300),
      violations: [],
      ms: Date.now() - started,
      inputTokens,
      outputTokens,
      costUsd: price ? inputTokens * price.input + outputTokens * price.output : 0,
      pipeline: { outcome: 'failed', attempts: e?.attempts ?? 1, repairs: [] },
      englishLeaks: 0,
      turkishChars: 0,
    }
  }
}

/* ------------------------------------------------------------------ */
/* Instruction-adherence checks                                        */
/* ------------------------------------------------------------------ */

function checkSite(site: WebsiteSchema, brief: Brief): string[] {
  const v: string[] = []
  const types = site.sections.map((s) => s.type)
  if (site.meta.language !== 'tr') v.push(`meta.language = ${site.meta.language}`)
  if (types[0] !== 'hero') v.push('ilk bölüm hero değil')
  if (types[types.length - 1] !== 'footer') v.push('son bölüm footer değil')
  const contacts = types.filter((t) => t === 'contact').length
  if (contacts !== 1) v.push(`contact bölüm sayısı ${contacts}`)
  else if (types[types.length - 2] !== 'contact') v.push('contact footer\'dan hemen önce değil')
  if (site.sections.length < 7 || site.sections.length > 10) v.push(`bölüm sayısı ${site.sections.length} (7-10 istendi)`)
  if (site.pages.length > 6) v.push(`sayfa sayısı ${site.pages.length} (limit 6)`)
  if (brief.id === 'jewelry') {
    if (!types.includes('products')) v.push('e-ticaret: products bölümü yok')
    if (!types.includes('categories')) v.push('e-ticaret: categories bölümü yok')
  }
  const seo = site.meta.seoTitle?.trim() ?? ''
  const words = seo.split(/\s+/).filter(Boolean).length
  if (!seo) v.push('seoTitle boş')
  else if (words < 3 || words > 6) v.push(`seoTitle ${words} kelime (3-6 istendi)`)
  if (seo && site.meta.name && seo.toLocaleLowerCase('tr').includes(site.meta.name.toLocaleLowerCase('tr')))
    v.push('seoTitle marka adını tekrar ediyor')
  const hero = site.sections[0] as { badge?: string; trustText?: string }
  if (!hero?.badge) v.push('hero badge yok')
  if (!hero?.trustText) v.push('hero trustText yok')
  return v
}

function checkSectionEdit(before: Section, after: Section, brief: Brief): string[] {
  const v: string[] = []
  if (after.type !== before.type) v.push(`bölüm tipi değişti: ${before.type} -> ${after.type}`)
  const b = before as unknown as { title?: string; primaryButton?: { label?: string }; badge?: string; trustText?: string }
  const a = after as unknown as typeof b
  if (a.primaryButton?.label?.trim() !== brief.editExpect) v.push(`buton metni "${a.primaryButton?.label}" (istenen "${brief.editExpect}")`)
  if (a.title?.trim() === b.title?.trim()) v.push('başlık değişmedi')
  if (a.badge !== b.badge) v.push('istenmeden badge değişti')
  if (a.trustText !== b.trustText) v.push('istenmeden trustText değişti')
  return v
}

const FACT_PATTERN = /\b\d{1,3}\s?(ayar|karat|k)\b|\b\d+([.,]\d+)?\s?(gr|gram|mm|cm|ct|kg|ml|cm2|gb|mb)\b|\b(sertifika|garanti)/i

function checkProduct(
  raw: z.infer<typeof generatedSchema>,
  normalized: { description: string; seoTitle: string; seoDescription: string },
  brief: Brief,
): string[] {
  const v: string[] = []
  if (raw.seoTitle.length > 70) v.push(`seoTitle ham ${raw.seoTitle.length} karakter`)
  if (raw.seoDescription.length > 170) v.push(`seoDescription ham ${raw.seoDescription.length} karakter`)
  if (/[<>]/.test(raw.intro + raw.benefits.join(' '))) v.push('metinde HTML/işaretleme')
  if (/(₺|\bTL\b|\blira\b|\bKDV\b|\bstok\b)/i.test(normalized.description + ' ' + raw.specs.map((s) => s.value).join(' ')))
    v.push('fiyat/KDV/stok bahsi (yasak)')
  const given = new Set([brief.product.name, ...brief.product.specs.map((s) => s.value)].join(' ').toLowerCase().split(/\s+/))
  const invented = raw.specs.filter((s) => !s.verify && s.value && FACT_PATTERN.test(`${s.name} ${s.value}`) && !FACT_PATTERN.test([...given].join(' ')))
  if (invented.length) v.push(`doğrulama bayrağı olmayan uydurma olgu: ${invented.map((s) => `${s.name}=${s.value}`).join('; ')}`)
  if (FACT_PATTERN.test(normalized.description) && !FACT_PATTERN.test(brief.product.name + ' ' + brief.product.specs.map((s) => s.value).join(' ')))
    v.push('açıklamada verilmeyen ölçü/ayar/sertifika olgusu')
  return v
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

const USD_TRY_NOTE = 'USD, gateway liste fiyatı (token başına), önbellek/rejyonal ek ücret yok'

function digest(value: unknown, max = 200): string {
  return stringLeaves(value)
    .filter(([k, s]) => !SKIP_KEY.test(k) && s.trim() && !/^#[0-9a-f]{3,8}$/i.test(s))
    .map(([k, s]) => `- \`${k}\`: ${s.replace(/\s+/g, ' ').slice(0, max)}`)
    .join('\n')
}

function siteDigest(site: WebsiteSchema): string {
  const lines = [
    `**Ad:** ${site.meta.name} | **Slogan:** ${site.meta.tagline} | **SEO:** ${site.meta.seoTitle ?? '-'}`,
    `**Sayfalar:** ${site.pages.map((p) => p.title).join(', ')}`,
    '',
  ]
  site.sections.forEach((s, i) => {
    lines.push(`${i + 1}. **${s.type}**`)
    const leaves = stringLeaves(s)
      .filter(([k, t]) => !SKIP_KEY.test(k) && t.trim() && !/^#[0-9a-f]{3,8}$/i.test(t))
      .slice(0, 9)
    for (const [k, t] of leaves) lines.push(`   - \`${k}\`: ${t.replace(/\s+/g, ' ').slice(0, 150)}`)
  })
  return lines.join('\n')
}

function productDigest(o: { normalized: ReturnType<typeof normalizeGenerated>; raw: z.infer<typeof generatedSchema> }): string {
  const n = o.normalized
  return [
    `**Açıklama**\n\n${n.description.replace(/\n/g, '\n\n')}`,
    '',
    `**Özellikler:** ${n.specs.length ? n.specs.map((s) => `${s.name}: ${s.value || '-'}${s.verify ? ' (doğrula)' : ''}`).join('; ') : '-'}`,
    '',
    `**SEO başlık (${n.seoTitle.length}):** ${n.seoTitle}`,
    '',
    `**SEO açıklama (${n.seoDescription.length}):** ${n.seoDescription}`,
  ].join('\n')
}

function fmtUsd(n: number) {
  return n === 0 ? '0' : n < 0.01 ? n.toFixed(4) : n.toFixed(3)
}

function buildReport(results: Result[], prices: Record<string, Price>, missing: string[]): string {
  const out: string[] = []
  out.push('# Model karşılaştırması (gpt-5-mini / claude-sonnet-5.5' + (MODELS.length > 2 ? ' / claude-opus-5.5' : '') + ')')
  out.push('')
  out.push(`Tarih: ${new Date().toISOString()} | Tekrar sayısı: ${RUNS} | Üretimdeki \`AI_TIER_MODELS\`: standard=\`${AI_TIER_MODELS.standard}\`, advanced=\`${AI_TIER_MODELS.advanced}\` (bu araç değiştirmez)`)
  out.push('')
  out.push('## Gateway kimlik ve fiyat doğrulaması')
  out.push('')
  out.push('| Model | Gateway\'de çözüldü | Giriş $/1M token | Çıkış $/1M token |')
  out.push('|---|---|---|---|')
  for (const id of MODELS) {
    const p = prices[id]
    out.push(`| \`${id}\` | ${p ? 'evet' : 'HAYIR'} | ${p ? (p.input * 1e6).toFixed(2) : '-'} | ${p ? (p.output * 1e6).toFixed(2) : '-'} |`)
  }
  if (missing.length) out.push(`\nFiyatı bulunamayan: ${missing.join(', ')}`)
  out.push('')

  out.push('## Özet (işlem bazında, tüm brief ve tekrarlar)')
  out.push('')
  out.push(`Maliyet: ${USD_TRY_NOTE}.`)
  out.push('')
  out.push('| İşlem | Model | Başarılı / Toplam | Şema hatası | Kural ihlali (başarılı çıktılarda) | Ort. süre (sn) | Ort. giriş tok. | Ort. çıkış tok. | Ort. maliyet ($) | Ort. İngilizce sızıntı | Ort. Türkçe karakter |')
  out.push('|---|---|---|---|---|---|---|---|---|---|---|')
  for (const op of Object.keys(OP_LABEL) as OpName[]) {
    for (const model of MODELS) {
      const rs = results.filter((r) => r.op === op && r.model === model)
      const ok = rs.filter((r) => r.ok)
      const avg = (f: (r: Result) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0)
      const withViolations = ok.filter((r) => r.violations.length).length
      out.push(
        `| ${OP_LABEL[op]} | \`${model.split('/')[1]}\` | ${ok.length}/${rs.length} | ${rs.length - ok.length} | ${withViolations}/${ok.length} | ${(avg((r) => r.ms) / 1000).toFixed(1)} | ${Math.round(avg((r) => r.inputTokens))} | ${Math.round(avg((r) => r.outputTokens))} | ${fmtUsd(avg((r) => r.costUsd))} | ${avg((r) => r.englishLeaks).toFixed(1)} | ${Math.round(avg((r) => r.turkishChars))} |`,
      )
    }
  }
  out.push('')
  out.push('"Şema hatası": model çıktısı Zod şemasını geçemedi, süre aşımı veya API hatası; üretimde bu durumda determinist yedek (fallback) devreye girer. "Kural ihlali": şemayı geçti ama istem kuralını bozdu (ör. yanlış buton metni, contact konumu, uydurma ölçü).')
  out.push('')

  const failures = results.filter((r) => !r.ok)
  if (failures.length) {
    out.push('### Hatalar')
    out.push('')
    for (const f of failures) out.push(`- ${f.brief} / ${OP_LABEL[f.op]} / \`${f.model}\` (tekrar ${f.run + 1}): ${f.error}`)
    out.push('')
  }

  for (const brief of BRIEFS) {
    out.push(`## ${brief.title}`)
    out.push('')
    out.push(`> ${brief.prompt}`)
    for (const op of Object.keys(OP_LABEL) as OpName[]) {
      out.push('')
      out.push(`### ${brief.title}: ${OP_LABEL[op]}`)
      if (op === 'sectionEdit') out.push(`\nTalimat: _${brief.editInstruction}_ (hero bölümü, her model için aynı girdi)`)
      if (op === 'productText') out.push(`\nÜrün: **${brief.product.name}**${brief.product.specs.length ? ' (' + brief.product.specs.map((s) => `${s.name}: ${s.value}`).join(', ') + ')' : ''}`)
      for (const model of MODELS) {
        const rs = results.filter((r) => r.brief === brief.id && r.op === op && r.model === model)
        rs.forEach((r) => {
          out.push('')
          out.push(`<details><summary><b>${model}</b> (tekrar ${r.run + 1}): ${r.ok ? 'OK' : 'HATA'} | ${(r.ms / 1000).toFixed(1)} sn | ${r.inputTokens} giriş / ${r.outputTokens} çıkış tok. | $${fmtUsd(r.costUsd)}${r.violations.length ? ` | ihlal: ${r.violations.length}` : ''}</summary>`)
          out.push('')
          if (!r.ok) out.push(`Hata: ${r.error}`)
          else {
            if (r.violations.length) out.push(`**Kural ihlalleri:** ${r.violations.join(' / ')}\n`)
            if (op === 'siteGenerate') out.push(siteDigest(r.output as WebsiteSchema))
            else if (op === 'sectionEdit') out.push(digest(r.output, 160))
            else out.push(productDigest(r.output as Parameters<typeof productDigest>[0]))
          }
          out.push('')
          out.push('</details>')
        })
      }
    }
    out.push('')
  }
  return out.join('\n')
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const { prices, missing } = await loadPrices()
  if (missing.length) console.warn('Models missing from gateway catalog:', missing.join(', '))

  const jobs: Array<() => Promise<Result>> = []
  for (const brief of BRIEFS)
    for (const op of Object.keys(OP_LABEL) as OpName[])
      for (const model of MODELS)
        for (let run = 0; run < RUNS; run++) jobs.push(() => runCell(brief, op, model, run, prices))

  const results: Result[] = []
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]
        const r = await job()
        results.push(r)
        done++
        console.log(`[${done}/${jobs.length}] ${r.brief} ${r.op} ${r.model} ${r.ok ? 'ok' : 'FAIL ' + r.error} ${(r.ms / 1000).toFixed(1)}s`)
      }
    }),
  )

  const order = (r: Result) => BRIEFS.findIndex((b) => b.id === r.brief) * 1000 + MODELS.indexOf(r.model) * 10 + r.run
  results.sort((a, b) => order(a) - order(b))

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, buildReport(results, prices, missing))
  writeFileSync(RAW_OUT, JSON.stringify(results, null, 2))
  console.log(`Report: ${OUT}\nRaw:    ${RAW_OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
