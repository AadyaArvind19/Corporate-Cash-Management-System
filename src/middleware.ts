import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// First line of defence: reject requests without a valid signed session cookie.
// Role checks and user-state checks (deactivation) are enforced server-side in route handlers and pages.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/auth/login') return NextResponse.next();

  const token = req.cookies.get('ccms_session')?.value;
  let valid = false;
  if (token && process.env.SESSION_SECRET) {
    try { await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET), { algorithms: ['HS256'] }); valid = true; } catch { /* invalid */ }
  }
  if (valid) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = '';
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
