import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const cacheModuleUrl = pathToFileURL(
  resolve(process.cwd(), 'lib/supabase/request-user-cache.ts'),
).href

const rscProbe = `
import React from 'react'
import { createRequire } from 'node:module'
import { cacheRequestUser } from ${JSON.stringify(cacheModuleUrl)}

const require = createRequire(import.meta.url)
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node')
let currentUser = { id: 'first-user' }
const getUser = cacheRequestUser(async () => currentUser)

async function Probe() {
  const [first, second] = await Promise.all([getUser(), getUser()])
  return React.createElement('pre', null, JSON.stringify({ id: first.id, same: first === second }))
}

async function renderRequest() {
  const stream = await renderToReadableStream(React.createElement(Probe), {})
  await stream.allReady
  return new Response(stream).text()
}

const first = await renderRequest()
currentUser = { id: 'second-user' }
const second = await renderRequest()
console.log(JSON.stringify({ first, second }))
`

describe('React cache kapsamı', () => {
  it('aynı RSC render içindeki çağrıları birleştirir ve ayrı kullanıcı render’ları arasında sızıntı yapmaz', () => {
    const output = execFileSync(
      process.execPath,
      ['--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', rscProbe],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    const result = JSON.parse(output.trim().split('\n').pop() ?? '{}') as {
      first: string
      second: string
    }

    expect(result.first).toContain('first-user')
    expect(result.first).toContain('same\\":true')
    expect(result.second).toContain('second-user')
    expect(result.second).toContain('same\\":true')
    expect(result.second).not.toContain('first-user')
  })
})
