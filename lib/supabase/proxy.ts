import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Secure cookies in production; not in dev, so localhost still works.
      cookieOptions: { secure: process.env.NODE_ENV === 'production' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isProtected =
    path.startsWith('/dashboard') ||
    path.startsWith('/editor') ||
    path.startsWith('/billing') ||
    path.startsWith('/ecommerce')

  if (isProtected) {
    if (!user) {
      // No user on a protected app route: send to login, remembering where
      // they were headed so we can bounce them back after sign-in.
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('next', path)
      return NextResponse.redirect(url)
    }

    // Authenticated but email not confirmed: block at the route level so the
    // protected content is never even briefly rendered. This uses the real
    // Supabase confirmation state (`email_confirmed_at`), never a client flag.
    if (!user.email_confirmed_at) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/verify-email'
      url.search = ''
      if (user.email) url.searchParams.set('email', user.email)
      return NextResponse.redirect(url)
    }

    // Suspended accounts are locked out of every protected surface. We read the
    // caller's OWN profile row (RLS `profiles_select_own` permits this), so no
    // service-role key is needed in the edge/proxy layer. On any read error we
    // fail OPEN (let them through) rather than locking out legitimate users on
    // a transient blip — the account stays suspended in the DB regardless.
    const { data: profile } = await supabase
      .from('profiles')
      .select('status')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.status === 'suspended') {
      const url = request.nextUrl.clone()
      url.pathname = '/account-suspended'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  return supabaseResponse
}
