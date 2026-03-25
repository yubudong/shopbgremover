import { verifyJWT, json, cors } from '../_shared.js';

async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return verifyJWT(match[1], env.JWT_SECRET);
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  // GET /api/me
  if (url.pathname === '/api/me') {
    const user = await getUser(request, env);
    if (!user) return json({ user: null }, 200, origin);
    const credits = await env.DB.prepare(
      `SELECT credits, total_used FROM user_credits WHERE user_id = ?`
    ).bind(user.sub).first();
    return json({ user: { id: user.sub, email: user.email, name: user.name }, credits }, 200, origin);
  }

  // POST /api/use-credit
  if (url.pathname === '/api/use-credit' && request.method === 'POST') {
    const user = await getUser(request, env);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const today = new Date().toISOString().slice(0, 10);

    if (!user) {
      const row = await env.DB.prepare(
        `SELECT count FROM free_usage WHERE ip = ? AND date = ?`
      ).bind(ip, today).first();
      const count = row?.count || 0;
      if (count >= 3) {
        return json({ ok: false, reason: 'free_limit', message: 'Daily free limit reached.' }, 403, origin);
      }
      await env.DB.prepare(
        `INSERT INTO free_usage (ip, date, count) VALUES (?, ?, 1)
         ON CONFLICT(ip) DO UPDATE SET count = count + 1, date = ?`
      ).bind(ip, today, today).run();
      return json({ ok: true, remaining: 3 - count - 1 }, 200, origin);
    }

    const credits = await env.DB.prepare(
      `SELECT credits FROM user_credits WHERE user_id = ?`
    ).bind(user.sub).first();
    if (!credits || credits.credits <= 0) {
      return json({ ok: false, reason: 'no_credits', message: 'No credits remaining.' }, 403, origin);
    }
    await env.DB.prepare(
      `UPDATE user_credits SET credits = credits - 1, total_used = total_used + 1 WHERE user_id = ?`
    ).bind(user.sub).run();
    return json({ ok: true, remaining: credits.credits - 1 }, 200, origin);
  }

  return json({ error: 'Not found' }, 404, origin);
}
