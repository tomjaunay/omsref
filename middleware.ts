import { NextRequest, NextResponse } from 'next/server'

const PASSWORD = process.env.SITE_PASSWORD ?? 'changeme'

export function middleware(req: NextRequest) {
  // Allow API routes through without auth check
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const cookie = req.cookies.get('auth')
  if (cookie?.value === PASSWORD) {
    return NextResponse.next()
  }

  // Check if this is a login form submission
  if (req.method === 'POST' && req.nextUrl.pathname === '/login') {
    return NextResponse.next()
  }

  // Redirect to login
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
}