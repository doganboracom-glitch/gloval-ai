import { evaluateCopyPolicy } from '@/lib/ads/policy'

export type MetaPolicyVerdict = {
  blocked: string[]
  warnings: string[]
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Rule = { pattern: RegExp; message: string }

/** Short Meta-specific rule list; Meta's own review stays the final authority and its reason is shown as-is. */
const BLOCK_RULES: Rule[] = [
  { pattern: /\b(garantili|kesin|%100)\s+(kazanc|gelir|zengin|sonuc|tedavi|iyilesme)\b|\bguaranteed\s+(income|profit|returns|results|cure)\b/, message: 'Garantili kazanç veya sonuç vaadi Meta reklam politikalarına aykırıdır.' },
  { pattern: /\b(kisa surede|hizlica|hemen)\s+zengin\b|\bget rich quick\b|\bevden calisarak (\d+|binlerce)\b/, message: 'Hızlı zengin olma vaatleri Meta politikalarınca yasaktır.' },
  { pattern: /\b(oncesi|before)\b.*\b(sonrasi|after)\b|\bbefore and after\b/, message: 'Önce/sonra karşılaştırmaları Meta politikalarınca kısıtlanmıştır.' },
  { pattern: /\b(escort|porno|pornografi|erotik|seks hizmet)\w*/, message: 'Yetişkin içerik Meta reklamlarında kabul edilmez.' },
  { pattern: /\b(silah|tabanca|mermi|firearm|ammunition)\b.*\b(satis|satilik|al|buy|sale)\b/, message: 'Silah ve mühimmat satışı Meta reklamlarında kabul edilmez.' },
  { pattern: /\b(sigara|tutun|nargile|vape|elektronik sigara|tobacco|cigarette)\w*\b.*\b(satis|satilik|indirim|al|buy|sale|shop)\b/, message: 'Tütün ve elektronik sigara satışı Meta reklamlarında kabul edilmez.' },
  { pattern: /\b(mucize|mucizevi)\b.*\b(tedavi|ilac|iyilestir|cure)\b|\bkesin tedavi\b|\bmiracle cure\b/, message: 'Mucizevi tedavi iddiaları Meta politikalarına aykırıdır.' },
  { pattern: /\b(uyusturucu|esrar|kokain|narcotic)\w*\b.*\b(satis|satilik|al|buy|sale)\b/, message: 'Yasa dışı madde satışı Meta reklamlarında kabul edilmez.' },
]

/** "Personal attributes" wording: ads must not imply they know something sensitive about the viewer. */
const PERSONAL_ATTRIBUTE_RULES: Rule[] = [
  { pattern: /\b(senin|sizin|your)\s+(kilon\w*|kilonuz\w*|borcun\w*|borcunuz\w*|hastaligin\w*|hastaliginiz\w*|depresyon\w*|irkin\w*|dinin\w*|weight|debt|disease|depression|religion|sexuality)\b/, message: 'Metin, kişinin kilosu, borcu, sağlığı veya inancı gibi kişisel özelliklerini bildiğinizi ima ediyor; Meta bunu reddeder.' },
  { pattern: /\b(kilolu musun\w*|borcun mu var\w*|depresyonda misin\w*|are you (overweight|in debt|depressed))\b/, message: 'Kişisel özellikleri ima eden soru kalıbı Meta politikalarına aykırıdır.' },
]

const WARNING_RULES: Rule[] = [
  { pattern: /\b(kredi|faiz|borc|yatirim|kripto|bitcoin|forex|loan|credit|crypto)\w*\b/, message: 'Finans ve kripto konuları Meta\'da ek inceleme veya yetkilendirme gerektirebilir.' },
  { pattern: /\b(alkol|bira|sarap|rakı|raki|wine|beer|alcohol)\b/, message: 'Alkol reklamları yaş ve ülke kısıtlarına tabidir; Meta reddedebilir.' },
  { pattern: /\b(zayiflama|kilo ver|diyet|supplement|takviye)\w*\b/, message: 'Sağlık ve zayıflama iddiaları sıkı incelenir; abartılı sonuç vaatlerinden kaçının.' },
]

export function evaluateMetaCopyPolicy(texts: readonly string[]): MetaPolicyVerdict {
  const joined = fold(texts.filter(Boolean).join(' | '))
  const blocked: string[] = []
  const warnings: string[] = []
  for (const rule of [...BLOCK_RULES, ...PERSONAL_ATTRIBUTE_RULES]) {
    if (rule.pattern.test(joined)) blocked.push(rule.message)
  }
  for (const rule of WARNING_RULES) {
    if (rule.pattern.test(joined)) warnings.push(rule.message)
  }
  const shared = evaluateCopyPolicy([...texts])
  if (shared.verdict === 'blocked') blocked.push('Metin, GLOVAL reklam politikasında yasaklı bir konuya (ör. yasa dışı veya yetişkin içerik) denk geliyor.')
  else if (shared.verdict === 'restricted') warnings.push('Metin kısıtlı bir konuya değiniyor; Meta ek inceleme yapabilir.')
  return { blocked: [...new Set(blocked)], warnings: [...new Set(warnings)] }
}
