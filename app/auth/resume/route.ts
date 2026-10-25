import { NextRequest, NextResponse } from 'next/server'
import { isValidClaimToken, resumeTargetPath } from '@/lib/signup-draft-core'
import { resumeSignupDraft } from '@/lib/signup-draft-actions'
import { SIGNUP_IDEA_RESTORE_COOKIE } from '@/lib/signup-draft-shared'

/**
 * Landing point of the verification link (any tab or device): the session was
 * just issued by /auth/callback, so claim the user's own draft and continue
 * where they left off (editor, with the pending publish).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const token = searchParams.get('draft') ?? ''
  if (!isValidClaimToken(token)) return NextResponse.redirect(`${origin}/dashboard`)

  const result = await resumeSignupDraft(token)
  if (result.status === 'ok') {
    const target = resumeTargetPath(result.projectId, result)
    return NextResponse.redirect(`${origin}${target}`)
  }
  if (result.status === 'idea') {
    const response = NextResponse.redirect(`${origin}/auth/restore-idea`)
    response.cookies.set(SIGNUP_IDEA_RESTORE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 300,
    })
    return response
  }
  if (result.status === 'unauthenticated') {
    const next = `/auth/resume?draft=${token}`
    return NextResponse.redirect(`${origin}/auth/login?next=${encodeURIComponent(next)}`)
  }
  return NextResponse.redirect(`${origin}/dashboard`)
}
