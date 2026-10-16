import { failureBucket, isFalseClaim, summarize, type CaseResult, type EditCase, type Outcome } from './evaluate'

export const ANALYSIS_MARKER = '<!-- analysis:start -->'

const TIERS: CaseResult['tier'][] = ['standart', 'gelişmiş']
const OUTCOMES: Outcome[] = ['başarı', 'kısmi', 'etkisiz', 'yanlış']

const pct = (n: number) => `${Math.round(n * 100)}%`
const usd = (n: number) => `$${n.toFixed(4)}`
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function renderReport(input: {
  cases: EditCase[]
  results: CaseResult[]
  models: Record<CaseResult['tier'], string>
  date: string
  previousAnalysis?: string
}): string {
  const { cases, results, models, date } = input
  const lines: string[] = []
  lines.push('# AI ile site düzenleme kalitesi (salt okunur ölçüm)', '')
  lines.push(
    `Tarih: ${date}. Araç: \`pnpm eval:ai-edit\` (üretim hattı değiştirilmez; sahte kullanıcı, sentetik site, kişisel veri yok).`,
    `Modeller: standart \`${models.standart}\`, gelişmiş \`${models.gelişmiş}\`. ${cases.length} komut. Görsel komutları yalnız niyet tespiti ile ölçülür (görsel üretilmez, maliyet yok).`,
    '',
  )

  lines.push('## Başarı oranı (katman bazında)', '')
  lines.push('| Katman | Başarı | Kısmi | Etkisiz | Yanlış | Başarı oranı | Yanlış başarı bildirimi | Ort. süre | Maliyet |')
  lines.push('|---|---|---|---|---|---|---|---|---|')
  for (const tier of TIERS) {
    const s = summarize(results, tier)
    lines.push(
      `| ${tier} | ${OUTCOMES.map((o) => s.counts[o]).join(' | ')} | ${pct(s.successRate)} (${s.counts.başarı}/${s.total}) | ${s.falseClaims} | ${(s.avgMs / 1000).toFixed(1)} sn | ${usd(s.costUsd)} |`,
    )
  }
  lines.push('', 'Yanlış başarı bildirimi: sohbet "uyguladım" dedi ama sonuç başarı değil.', '')

  lines.push('## Komut bazında sonuç', '')
  lines.push('| # | Kategori | Komut | Beklenen | Gerçekte (standart) | Std | Gel | Kaynak | Süre s/g | Maliyet s/g |')
  lines.push('|---|---|---|---|---|---|---|---|---|---|')
  cases.forEach((c, i) => {
    const std = results.find((r) => r.id === c.id && r.tier === 'standart')
    const adv = results.find((r) => r.id === c.id && r.tier === 'gelişmiş')
    if (!std || !adv) return
    const mark = (r: CaseResult) => `${r.outcome}${isFalseClaim(r) ? ' (!)' : ''}`
    lines.push(
      `| ${i + 1} | ${esc(c.category)} | ${esc(c.instruction)} | ${esc(c.expected)} | ${esc(std.actual)} | ${mark(std)} | ${mark(adv)} | ${std.source ?? '-'}/${adv.source ?? '-'} | ${(std.ms / 1000).toFixed(1)}/${(adv.ms / 1000).toFixed(1)} | ${usd(std.costUsd)}/${usd(adv.costUsd)} |`,
    )
  })
  lines.push('', '(!) = yanlış başarı bildirimi.', '')

  const buckets = new Map<string, string[]>()
  for (const r of results) {
    const b = failureBucket(r)
    if (!b) continue
    buckets.set(b, [...(buckets.get(b) ?? []), `${r.id}/${r.tier === 'standart' ? 's' : 'g'}`])
  }
  lines.push('## Başarısızlık kovaları (otomatik)', '')
  lines.push('| Kova | Adet | Örnekler |', '|---|---|---|')
  for (const [bucket, ids] of [...buckets.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`| ${bucket} | ${ids.length} | ${ids.slice(0, 6).join(', ')} |`)
  }
  lines.push('')

  lines.push(input.previousAnalysis?.trim() ? input.previousAnalysis.trim() : ANALYSIS_MARKER, '')
  return lines.join('\n')
}
