import { describe, expect, it } from 'vitest'
import { applyOperation } from '@/lib/website-edit-operations'
import type { EditOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'
import { LIST_LIMITS, canAddEntry, canRemoveEntry } from '@/lib/list-limits'
import { findTeamPage, resolveTeam, stripAiTeam, syncTeamPage, teamShownOnHome } from '@/lib/team'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}`

const run = (site: WebsiteSchema, ...ops: EditOperation[]) => ops.reduce((s, op) => applyOperation(s, op), site)

const withTeam = () => {
  const base = fallbackWebsite('Hukuk bürosu için site', 'tr')
  const site = run(base, { op: 'addSection', sectionType: 'team' })
  const index = site.sections.findIndex((s) => s.type === 'team')
  return { site, index }
}

const members = (site: WebsiteSchema, index: number) => {
  const s = site.sections[index]
  if (s.type !== 'team') throw new Error('not a team section')
  return s.members
}

describe('team panel operations', () => {
  it('adds the team section as an empty block that nothing renders yet', () => {
    const { site, index } = withTeam()
    expect(index).toBeGreaterThanOrEqual(0)
    expect(members(site, index)).toHaveLength(0)
  })

  it('adds a person, edits name/role/phone and clears the sample flag', () => {
    const { site, index } = withTeam()
    const out = run(
      site,
      { op: 'addItem', index },
      { op: 'updateTeamMember', index, item: 0, patch: { name: 'Ayşe Demir', role: 'Avukat', phone: '0555 555 55 51' } },
    )
    const [m] = members(out, index)
    expect(m.name).toBe('Ayşe Demir')
    expect(m.role).toBe('Avukat')
    expect(m.phone).toBe('0555 555 55 51')
    expect(m.sample).toBeFalsy()
    expect(m.avatar).toBeTruthy()
  })

  it('cycles the avatar and drops an uploaded photo when doing so', () => {
    const { site, index } = withTeam()
    const out = run(
      site,
      { op: 'addItem', index },
      { op: 'updateTeamMember', index, item: 0, patch: { photo: PNG } },
    )
    expect(members(out, index)[0].src).toBe(PNG)
    const first = members(out, index)[0].avatar
    const cycled = run(out, { op: 'cycleTeamAvatar', index, item: 0 })
    expect(members(cycled, index)[0].src).toBeUndefined()
    const second = members(cycled, index)[0].avatar
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })

  it('accepts a real PNG upload, refuses a fake one and removes a photo on request', () => {
    const { site, index } = withTeam()
    const added = run(site, { op: 'addItem', index })
    const uploaded = run(added, { op: 'updateTeamMember', index, item: 0, patch: { photo: PNG } })
    expect(members(uploaded, index)[0].src).toBe(PNG)
    const rejected = run(added, { op: 'updateTeamMember', index, item: 0, patch: { photo: SVG_AS_PNG } })
    expect(members(rejected, index)[0].src).toBeUndefined()
    const removed = run(uploaded, { op: 'updateTeamMember', index, item: 0, patch: { photo: '' } })
    expect(members(removed, index)[0].src).toBeUndefined()
  })

  it('keeps only safe social links', () => {
    const { site, index } = withTeam()
    const out = run(
      site,
      { op: 'addItem', index },
      {
        op: 'updateTeamMember',
        index,
        item: 0,
        patch: {
          social: {
            instagram: 'https://instagram.com/ornek',
            linkedin: 'javascript:alert(1)',
            facebook: 'https://evil.example.com/ornek',
            email: 'ad@firma.com',
            x: 'https://x.com/ornek',
          },
        },
      },
    )
    const social = members(out, index)[0].social ?? {}
    expect(social.instagram).toBe('https://instagram.com/ornek')
    expect(social.x).toBe('https://x.com/ornek')
    expect(social.email).toBe('ad@firma.com')
    expect(social.linkedin).toBeUndefined()
    expect(social.facebook).toBeUndefined()
  })

  it('clamps overlong text and rejects unsafe phone characters', () => {
    const { site, index } = withTeam()
    const out = run(
      site,
      { op: 'addItem', index },
      { op: 'updateTeamMember', index, item: 0, patch: { name: 'A'.repeat(200), role: 'B'.repeat(200), phone: '<script>0555' } },
    )
    const [m] = members(out, index)
    expect(m.name.length).toBeLessThanOrEqual(50)
    expect(m.role.length).toBeLessThanOrEqual(40)
    expect(m.phone ?? '').not.toMatch(/[<>a-z]/i)
  })

  it('reorders and deletes people', () => {
    const { site, index } = withTeam()
    let out = run(site, { op: 'addItem', index }, { op: 'addItem', index })
    out = run(
      out,
      { op: 'updateTeamMember', index, item: 0, patch: { name: 'Birinci' } },
      { op: 'updateTeamMember', index, item: 1, patch: { name: 'İkinci' } },
      { op: 'moveItem', index, itemIndex: 1, direction: 'up' },
    )
    expect(members(out, index).map((m) => m.name)).toEqual(['İkinci', 'Birinci'])
    out = run(out, { op: 'removeItem', index, itemIndex: 0 })
    expect(members(out, index).map((m) => m.name)).toEqual(['Birinci'])
  })

  it('stops at 24 people and allows going down to zero', () => {
    const { site, index } = withTeam()
    expect(LIST_LIMITS.team?.max).toBe(24)
    expect(LIST_LIMITS.team?.min).toBe(0)
    const filled = run(site, ...Array.from({ length: 30 }, () => ({ op: 'addItem', index }) as EditOperation))
    expect(members(filled, index)).toHaveLength(24)
    expect(canAddEntry('team', 24)).toBe(false)
    expect(canAddEntry('team', 23)).toBe(true)
    expect(canRemoveEntry('team', 1)).toBe(true)
    const emptied = run(filled, ...Array.from({ length: 24 }, () => ({ op: 'removeItem', index, itemIndex: 0 }) as EditOperation))
    expect(members(emptied, index)).toHaveLength(0)
  })

  it('stores the home/page switches and the section texts', () => {
    const { site, index } = withTeam()
    const out = run(site, {
      op: 'updateTeamSettings',
      index,
      patch: { title: 'Ekibimiz', subtitle: 'Bizimle tanışın', showOnHome: false, pageEnabled: true },
    })
    const section = out.sections[index]
    expect(section.type === 'team' && section.title).toBe('Ekibimiz')
    expect(section.type === 'team' && section.subtitle).toBe('Bizimle tanışın')
    expect(section.type === 'team' && section.showOnHome).toBe(false)
  })

  it('hides an empty section publicly and creates /kadromuz only with a person and the switch on', () => {
    const { site, index } = withTeam()
    const empty = syncTeamPage(site)
    const section = empty.sections[index]
    expect(section.type === 'team' && teamShownOnHome(section)).toBe(false)
    expect(resolveTeam(empty).active).toBe(false)
    expect(findTeamPage(empty)).toBeNull()

    const named = run(site, { op: 'addItem', index }, { op: 'updateTeamMember', index, item: 0, patch: { name: 'Ayşe Demir' } })
    const switchedOff = syncTeamPage(named)
    expect(findTeamPage(switchedOff)).toBeNull()
    expect(resolveTeam(switchedOff).active).toBe(false)

    const on = syncTeamPage(run(named, { op: 'updateTeamSettings', index, patch: { pageEnabled: true } }))
    expect(findTeamPage(on)?.slug).toBe('kadromuz')
    expect(resolveTeam(on).active).toBe(true)
    const shown = on.sections[index]
    expect(shown.type === 'team' && teamShownOnHome(shown)).toBe(true)

    const removed = syncTeamPage(run(on, { op: 'removeItem', index, itemIndex: 0 }))
    expect(findTeamPage(removed)).toBeNull()
    expect(resolveTeam(removed).active).toBe(false)
  })

  it('is never added to generated sites and the AI cannot invent or alter people', () => {
    for (const prompt of ['Hukuk bürosu için site', 'Diş kliniği web sitesi', 'Güzellik salonu', 'Kafe']) {
      expect(fallbackWebsite(prompt, 'tr').sections.some((s) => s.type === 'team')).toBe(false)
    }

    const { site, index } = withTeam()
    const owner = run(site, { op: 'addItem', index }, { op: 'updateTeamMember', index, item: 0, patch: { name: 'Gerçek Kişi', phone: '0555 555 55 51' } })
    const invented = {
      ...owner,
      sections: owner.sections.map((s) =>
        s.type === 'team' ? { ...s, title: 'Ekibimiz', members: [{ name: 'Uydurma Kişi', role: 'Avukat', phone: '0555 000 00 00' }] } : s,
      ),
    } as WebsiteSchema
    const guarded = stripAiTeam(invented, owner)
    const kept = guarded.sections[index]
    expect(kept.type === 'team' && kept.title).toBe('Ekibimiz')
    expect(kept.type === 'team' && kept.members.map((m) => m.name)).toEqual(['Gerçek Kişi'])

    const noPrior = stripAiTeam(invented, null).sections[index]
    expect(noPrior.type === 'team' && noPrior.members).toHaveLength(0)
  })
})
