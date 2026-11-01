import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const cacheModuleUrl = pathToFileURL(
  resolve(process.cwd(), 'lib/supabase/request-user-cache.ts'),
).href

const rscProbe = `
import React from 'react'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createRequire } from 'node:module'
import { cacheRequestUser } from ${JSON.stringify(cacheModuleUrl)}

const require = createRequire(import.meta.url)
const { renderToReadableStream } = require('next/dist/compiled/react-server-dom-webpack/server.node')
const requestContext = new AsyncLocalStorage()
const getUser = cacheRequestUser(async () => {
  await new Promise((resolve) => setTimeout(resolve, 5))
  return requestContext.getStore()
})

async function Probe() {
  const [first, second] = await Promise.all([getUser(), getUser()])
  return React.createElement('pre', null, JSON.stringify({ id: first.id, same: first === second }))
}

async function renderRequest(user) {
  return requestContext.run(user, async () => {
    const stream = await renderToReadableStream(React.createElement(Probe), {})
    await stream.allReady
    return new Response(stream).text()
  })
}

const sequentialFirst = await renderRequest({ id: 'first-user' })
const sequentialSecond = await renderRequest({ id: 'second-user' })
const [concurrentFirst, concurrentSecond] = await Promise.all([
  renderRequest({ id: 'concurrent-first-user' }),
  renderRequest({ id: 'concurrent-second-user' }),
])
console.log(JSON.stringify({ sequentialFirst, sequentialSecond, concurrentFirst, concurrentSecond }))
`

describe('React cache kapsamı', () => {
  it('aynı RSC render içindeki çağrıları birleştirir ve ayrı kullanıcı render’ları arasında sızıntı yapmaz', () => {
    const output = execFileSync(
      process.execPath,
      ['--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', rscProbe],
      { cwd: process.cwd(), encoding: 'utf8' },
    )
    const result = JSON.parse(output.trim().split('\n').pop() ?? '{}') as {
      sequentialFirst: string
      sequentialSecond: string
      concurrentFirst: string
      concurrentSecond: string
    }

    expect(result.sequentialFirst).toContain('first-user')
    expect(result.sequentialFirst).toContain('same\\":true')
    expect(result.sequentialSecond).toContain('second-user')
    expect(result.sequentialSecond).toContain('same\\":true')
    expect(result.sequentialSecond).not.toContain('first-user')
    expect(result.concurrentFirst).toContain('concurrent-first-user')
    expect(result.concurrentFirst).toContain('same\\":true')
    expect(result.concurrentFirst).not.toContain('concurrent-second-user')
    expect(result.concurrentSecond).toContain('concurrent-second-user')
    expect(result.concurrentSecond).toContain('same\\":true')
    expect(result.concurrentSecond).not.toContain('concurrent-first-user')
  })
})
