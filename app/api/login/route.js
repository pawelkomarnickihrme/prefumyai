import { checkPassword, sessionToken, SESSION_COOKIE } from '../../../src/auth.mjs';

// ponytail: no login rate limit in a closed test; add one before any public start.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!checkPassword(body.password)) return Response.json({ error: 'wrongPassword' }, { status: 401 });
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return new Response(null, {
    status: 204,
    headers: { 'Set-Cookie': `${SESSION_COOKIE}=${sessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}` },
  });
}
