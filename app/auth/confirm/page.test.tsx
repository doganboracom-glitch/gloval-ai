// @vitest-environment node
import { describe, expect, it } from 'vitest'
import AuthConfirmPage from './page'

async function pageProps(searchParams: Record<string, string | string[] | undefined>) {
  const element = await AuthConfirmPage({ searchParams: Promise.resolve(searchParams) })
  return element.props
}

describe('GET /auth/confirm page', () => {
  it('renders a non-consuming confirmation prompt with normalized empty draft and next values', async () => {
    await expect(
      pageProps({ token_hash: 'opaque-token-hash', type: 'signup', draft: '', next: '' }),
    ).resolves.toMatchObject({
      tokenHash: 'opaque-token-hash',
      type: 'signup',
      draft: null,
      next: '/dashboard',
    })
  })

  it('renders safely for a parameterless visit without any token hash or OTP type', async () => {
    await expect(pageProps({})).resolves.toMatchObject({
      tokenHash: null,
      type: null,
      draft: null,
      next: '/dashboard',
    })
  })
})
