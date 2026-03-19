import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/setup'];

export function middleware(request: NextRequest) {
  // Em desenvolvimento: sem bloqueio de rotas (backend já tem bypass)
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Permite paths públicos e assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('lumi-token')?.value;

  if (!token) {
    // Redireciona para /login mantendo destino original
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
