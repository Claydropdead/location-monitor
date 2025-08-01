import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Define protected routes
  const protectedRoutes = ['/admin', '/dashboard']
  const adminRoutes = ['/admin']
  const userRoutes = ['/dashboard']
  const authRoutes = ['/login', '/signup']

  const isProtectedRoute = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )
  const isAdminRoute = adminRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )
  const isUserRoute = userRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )
  const isAuthRoute = authRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )

  // If user is not authenticated and trying to access protected route
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // If user is authenticated and trying to access auth routes, redirect based on role
  if (user && isAuthRoute) {
    try {
      // Use the RLS-safe function to get user role
      const { data: userRole, error: roleError } = await supabase
        .rpc('get_user_role')

      if (roleError) {
        console.error('Error getting user role in middleware:', roleError)
        // If there's an error, redirect to dashboard by default
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      const url = request.nextUrl.clone()
      if (userRole === 'admin') {
        url.pathname = '/admin'
      } else {
        url.pathname = '/dashboard'
      }
      return NextResponse.redirect(url)
    } catch (error) {
      console.error('Middleware auth route error:', error)
      // If there's an error getting the profile, redirect to dashboard by default
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // If user is authenticated, check role-based access for protected routes
  if (user && isProtectedRoute) {
    try {
      // Use the RLS-safe function to get user role
      const { data: userRole, error: roleError } = await supabase
        .rpc('get_user_role')

      if (roleError) {
        console.error('Error getting user role in middleware:', roleError)
        // If there's an error and trying to access admin, redirect to login
        if (isAdminRoute) {
          const url = request.nextUrl.clone()
          url.pathname = '/login'
          return NextResponse.redirect(url)
        }
        // For user routes, allow access if there's an error
        return supabaseResponse
      }

      // User trying to access admin routes - deny
      if (userRole === 'user' && isAdminRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/dashboard'
        return NextResponse.redirect(url)
      }

      // If role is not recognized and trying to access admin routes, redirect to login
      if (!userRole && isAdminRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
    } catch (error) {
      console.error('Error checking user role:', error)
      // If there's an error and trying to access admin, redirect to login
      if (isAdminRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
      }
    }
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
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

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
