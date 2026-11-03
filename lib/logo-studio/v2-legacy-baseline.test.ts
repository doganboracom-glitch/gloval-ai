import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { AiModelSelection } from '@/lib/ai-models'
import { buildLockup, type TextAssets } from '@/lib/logo-studio/compose'
import { generateEmblemRound, type Drawer } from '@/lib/logo-studio/emblem-ai'
import { localEmblems, pickLocalEmblems } from '@/lib/logo-studio/emblem-local'
import { buildEmblemPrompt } from '@/lib/logo-studio/emblem-prompt'
import { bundledFont, initialsOf } from '@/lib/logo-studio/font-source'
import { resolveColorway } from '@/lib/logo-studio/rules'
import { textToPath } from '@/lib/logo-studio/ttf'

/**
 * Flag-off guarantee. With LOGO_STUDIO_V2 off nothing passes the V2-only inputs
 * (`v2`, sector label, sector id, concept families), so these outputs must stay
 * byte-for-byte what origin/main produced. The expected digests below were
 * produced by running this same file against origin/main (19da12a).
 */

const sha = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16)

const siteColors = { primary: '#6d28d9', primaryFg: '#ffffff', accent: '#06b6d4', foreground: '#111111', background: '#ffffff' }
const palette = { primary: '#6d28d9', accent: '#06b6d4', primaryFg: '#ffffff' }
const selection: AiModelSelection = { flow: 'logoEmblem', tier: 'standard', model: 'anthropic/claude-sonnet-5.5', plan: 'free' }
const GOOD = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><circle cx="100" cy="100" r="70" fill="#1d4ed8"/><rect x="80" y="60" width="40" height="80" rx="8" fill="#f59e0b"/></svg>`

function assetsFor(name: string): TextAssets {
  const font = bundledFont()
  return {
    plain: textToPath(font, name, { size: 100 }),
    caps: textToPath(font, name.toLocaleUpperCase('tr'), { size: 100, letterSpacing: 0.14 }),
    mono: textToPath(font, initialsOf(name), { size: 100 }),
    initial: textToPath(font, name.slice(0, 1).toLocaleUpperCase('tr'), { size: 100 }),
    fauxBold: false,
  }
}

async function legacyDigest() {
  const prompts: string[] = []
  for (const seed of [0, 1]) {
    for (let index = 0; index < 4; index++) {
      const p = buildEmblemPrompt(
        { brand: 'Kasap Ahmet', sector: 'Kasap', description: 'fresh meat', style: 'modern', colors: ['#1d4ed8', '#f59e0b'], index, seed },
        4,
      )
      prompts.push(p.system, p.user)
    }
  }

  const text = assetsFor('Gloval Studio')
  const emblems = localEmblems({ count: 4, palette, brand: 'Gloval Studio', context: '', seed: 0 })
  const lockups: string[] = []
  for (const layout of ['horizontal', 'vertical', 'wordmark'] as const) {
    for (const style of ['modern', 'classic', 'minimal', 'luxury'] as const) {
      lockups.push(buildLockup({ layout, emblem: layout === 'wordmark' ? null : emblems[1], text, colors: resolveColorway('brand', siteColors), style }).svg)
    }
  }

  const picks = [0, 1, 2].map((seed) => JSON.stringify(pickLocalEmblems({ count: 4, brand: 'Acme', context: 'bakery', seed })))

  const captured: string[] = []
  const draw: Drawer = async ({ system, prompt }) => {
    captured.push(system, prompt)
    return { text: GOOD, finishReason: 'stop' }
  }
  const round = await generateEmblemRound({
    selection,
    brand: 'Kasap Ahmet',
    sector: 'Kasap',
    style: 'modern',
    colors: ['#1d4ed8', '#f59e0b'],
    count: 4,
    seed: 0,
    idPrefix: 'ai-0',
    draw,
  })

  return {
    prompts: sha(prompts.join('\n')),
    lockups: sha(lockups.join('\n')),
    emblems: sha(emblems.map((e) => e.inner).join('\n')),
    picks: sha(picks.join('\n')),
    roundPrompts: sha(captured.sort().join('\n')),
    roundOutput: sha(JSON.stringify(round)),
  }
}

const EXPECTED_FROM_MAIN = {
  prompts: '43dbc0edcbd400cb',
  lockups: '423557150f3a20d2',
  emblems: 'e271b043b9c5fef1',
  picks: '7fc336fa6ada4f9e',
  roundPrompts: '3387043e1d4adf7e',
  roundOutput: 'fed60480a83611a5',
}

describe('flag off: legacy output is byte-identical to origin/main', () => {
  it('keeps prompts, lockups, local emblems, picks and a non-V2 round unchanged', async () => {
    const digest = await legacyDigest()
    if (process.env.PRINT_LEGACY_DIGEST) console.log(`LEGACY_DIGEST ${JSON.stringify(digest)}`)
    expect(digest).toEqual(EXPECTED_FROM_MAIN)
  })

  it('a non-V2 prompt carries none of the V2 additions', () => {
    const { system, user } = buildEmblemPrompt(
      { brand: 'Kasap Ahmet', sector: 'Kasap', description: 'x', style: 'modern', colors: ['#1d4ed8'], index: 2, seed: 0, creativeDirection: 'ignored', avoid: ['a house'] },
      4,
    )
    expect(user).not.toContain('user_context')
    expect(user).not.toContain('avoid_cliches')
    expect(user).not.toContain('creative_direction')
    expect(system).not.toContain('untrusted')
  })
})
