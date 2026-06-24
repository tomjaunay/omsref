import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const PASSWORD = process.env.SITE_PASSWORD ?? 'changeme'

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  if (req.nextUrl.pathname === '/login') {
    return NextResponse.next()
  }

  const cookie = req.cookies.get('auth')
  if (cookie?.value === PASSWORD) {
    return NextResponse.next()
  }

  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
