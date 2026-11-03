'use client'

export async function prepareReferralSignupIntent(source: 'email' | 'oauth' | 'login'): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1500)

  try {
    await fetch('/api/referrals/signup-intent', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source }),
      signal: controller.signal,
    })
  } catch {
    // Referral tracking is best effort and never blocks authentication.
  } finally {
    clearTimeout(timeout)
  }
}
