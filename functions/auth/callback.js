import { signJWT } from '../_shared.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return Response.redirect('https://www.shopbgremover.com?error=no_code', 302);

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: 'https://www.shopbgremover.com/auth/callback',
      grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return Response.redirect('https://www.shopbgremover.com?error=token_failed', 302);

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();

  await env.DB.prepare(
    `INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar`
  ).bind(profile.id, profile.email, profile.name, profile.picture).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO user_credits (user_id, credits) VALUES (?, 20)`
  ).bind(profile.id).run();

  const token = await signJWT(
    { sub: profile.id, email: profile.email, name: profile.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
    env.JWT_SECRET
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://www.shopbgremover.com',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    },
  });
}
