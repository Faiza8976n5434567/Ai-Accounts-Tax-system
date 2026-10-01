// Vercel Routing Middleware — password-protects the whole site with HTTP Basic Auth.
// The password is read from the SITE_PASSWORD environment variable (set in the Vercel
// project settings), never committed to the repo. Any username is accepted.
// If SITE_PASSWORD is not set the site fails closed (503) rather than going public.

export const config = { matcher: '/(.*)' };

const REALM = 'TFS+ Smart Ledger';

function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function suppliedPassword(header: string | null): string | null {
  if (!header?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const sep = decoded.indexOf(':');
    return sep === -1 ? null : decoded.slice(sep + 1);
  } catch {
    return null;
  }
}

export default function middleware(request: Request): Response | undefined {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) {
    return new Response('Site password is not configured.', { status: 503 });
  }

  const given = suppliedPassword(request.headers.get('authorization'));
  if (given !== null && safeEqual(given, expected)) return undefined; // continue to the site

  return new Response('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
    },
  });
}
