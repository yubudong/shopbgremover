// Cloudflare Worker - shopbgremover API backend
// Handles: Google OAuth, session, credits, history

// Secrets are injected via Cloudflare Worker environment variables
// GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, FAL_API_KEY
const REDIRECT_URI = 'https://api.shopbgremover.com/auth/callback';
const FRONTEND_URL = 'https://www.shopbgremover.com';
const GUEST_FREE_LIMIT = 3;
const REGISTERED_FREE_LIMIT = 10;
const FREE_CREDIT_TTL_SECONDS = 30 * 24 * 60 * 60;
const CREDIT_PACKS = Object.freeze({
  credits_100: { amount: '3.49', credits: 100, currency: 'USD' },
  credits_300: { amount: '8.99', credits: 300, currency: 'USD' },
  credits_1000: { amount: '23.99', credits: 1000, currency: 'USD' },
});

// ── CORS headers ──────────────────────────────────────────────
function cors(origin) {
  // 明确允许的 origin
  const allowedOrigins = [
    'https://www.shopbgremover.com',
    'https://shopbgremover.com',
  ];
  const allowOrigin = allowedOrigins.includes(origin) ? origin : FRONTEND_URL;
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
    'Access-Control-Expose-Headers': 'X-Task-ID',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

// ── JWT (simple HMAC-SHA256) ──────────────────────────────────
async function signJWT(payload, secret) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${header}.${body}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, sig] = token.split('.');
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key,
      Uint8Array.from(atob(sig), c => c.charCodeAt(0)),
      new TextEncoder().encode(`${header}.${body}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(atob(body));
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}

// ── Auth helper ───────────────────────────────────────────────
async function getUser(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/session=([^;]+)/);
  if (!match) return null;
  return verifyJWT(match[1], env.JWT_SECRET);
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function getGuestIdentity(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const suppliedDevice = request.headers.get('X-Device-ID') || getCookie(request, 'sbgr_device');
  const fallbackDevice = `fallback:${ip}:${request.headers.get('User-Agent') || 'unknown'}`;
  const rawDevice = suppliedDevice || fallbackDevice;
  const [deviceHash, ipHash] = await Promise.all([
    sha256Hex(`device:${rawDevice}`),
    sha256Hex(`ip:${ip}`),
  ]);

  return {
    rawIp: ip,
    deviceHash,
    ipHash,
    ownerKey: `guest:${deviceHash}`,
  };
}

async function getGuestUsage(env, guest) {
  const [device, ip, legacy] = await Promise.all([
    env.DB.prepare('SELECT count FROM guest_usage WHERE device_hash = ?')
      .bind(guest.deviceHash).first(),
    env.DB.prepare('SELECT count FROM guest_ip_usage WHERE ip_hash = ?')
      .bind(guest.ipHash).first(),
    env.DB.prepare('SELECT count FROM free_usage WHERE ip = ?')
      .bind(guest.rawIp).first(),
  ]);

  return Math.max(
    Number(device?.count || 0),
    Number(ip?.count || 0),
    Math.min(Number(legacy?.count || 0), GUEST_FREE_LIMIT),
  );
}

async function getCreditSummary(env, userId) {
  const [aggregate, buckets] = await Promise.all([
    env.DB.prepare('SELECT credits, total_used FROM user_credits WHERE user_id = ?')
      .bind(userId).first(),
    env.DB.prepare(
      `SELECT credit_type, COALESCE(SUM(remaining_credits), 0) AS remaining
       FROM credit_grants
       WHERE user_id = ?
         AND remaining_credits > 0
         AND (expires_at IS NULL OR expires_at > unixepoch())
       GROUP BY credit_type`
    ).bind(userId).all(),
  ]);

  const byType = {
    paid: 0,
    free: 0,
    referral: 0,
    promotion: 0,
    legacy: 0,
  };
  for (const row of buckets.results || []) {
    byType[row.credit_type] = Number(row.remaining || 0);
  }

  const bucketTotal = Object.values(byType).reduce((sum, value) => sum + value, 0);
  const aggregateTotal = Number(aggregate?.credits || 0);
  return {
    credits: Math.max(0, Math.min(aggregateTotal, bucketTotal)),
    total_used: Number(aggregate?.total_used || 0),
    buckets: byType,
  };
}

async function ensureUserCreditAccount(env, userId, guest) {
  await env.DB.prepare(
    'INSERT OR IGNORE INTO user_credits (user_id, credits) VALUES (?, 0)'
  ).bind(userId).run();

  const entitlement = await env.DB.prepare(
    'SELECT user_id FROM user_free_entitlements WHERE user_id = ?'
  ).bind(userId).first();
  if (entitlement) return;

  const guestUsed = guest ? Math.min(await getGuestUsage(env, guest), GUEST_FREE_LIMIT) : 0;
  const issuedCredits = REGISTERED_FREE_LIMIT - guestUsed;
  const grantId = `registration-free:${userId}`;
  const expiresAt = Math.floor(Date.now() / 1000) + FREE_CREDIT_TTL_SECONDS;
  const statements = [
    env.DB.prepare(
      `INSERT INTO user_free_entitlements
       (user_id, lifetime_limit, guest_uses_applied, issued_credits)
       VALUES (?, ?, ?, ?)`
    ).bind(userId, REGISTERED_FREE_LIMIT, guestUsed, issuedCredits),
  ];

  if (issuedCredits > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_grants
         (id, user_id, credit_type, granted_credits, remaining_credits, expires_at, idempotency_key)
         VALUES (?, ?, 'free', ?, ?, ?, ?)`
      ).bind(grantId, userId, issuedCredits, issuedCredits, expiresAt, grantId),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, idempotency_key)
         VALUES (?, ?, ?, 'free', 'registration_free', ?, ?)`
      ).bind(grantId, userId, issuedCredits, grantId, grantId),
      env.DB.prepare(
        'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?'
      ).bind(issuedCredits, userId),
    );
  }

  if (guest) {
    statements.push(
      env.DB.prepare(
        'UPDATE guest_usage SET linked_user_id = ?, updated_at = unixepoch() WHERE device_hash = ?'
      ).bind(userId, guest.deviceHash),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrent = await env.DB.prepare(
      'SELECT user_id FROM user_free_entitlements WHERE user_id = ?'
    ).bind(userId).first();
    if (!concurrent) throw error;
  }
}

async function reserveAiTask(env, {
  taskId,
  ownerKey,
  userId,
  guestDeviceHash,
  inputHash,
}) {
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO ai_tasks
     (task_id, owner_key, user_id, guest_device_hash, input_hash, status)
     VALUES (?, ?, ?, ?, ?, 'processing')`
  ).bind(taskId, ownerKey, userId, guestDeviceHash, inputHash).run();

  if (Number(inserted.meta?.changes || 0) === 1) {
    return { state: 'new' };
  }

  const task = await env.DB.prepare(
    `SELECT task_id, owner_key, input_hash, status, result_url
     FROM ai_tasks WHERE task_id = ?`
  ).bind(taskId).first();

  if (!task || task.owner_key !== ownerKey || task.input_hash !== inputHash) {
    return { state: 'conflict' };
  }
  if (task.status === 'succeeded') {
    return { state: 'succeeded', resultUrl: task.result_url };
  }
  if (task.status === 'processing') {
    return { state: 'processing' };
  }

  const retried = await env.DB.prepare(
    `UPDATE ai_tasks
     SET status = 'processing', error_code = NULL, updated_at = unixepoch()
     WHERE task_id = ? AND status = 'failed'`
  ).bind(taskId).run();
  return Number(retried.meta?.changes || 0) === 1
    ? { state: 'retry' }
    : { state: 'processing' };
}

async function failAiTask(env, taskId, errorCode) {
  await env.DB.prepare(
    `UPDATE ai_tasks
     SET status = 'failed', error_code = ?, updated_at = unixepoch()
     WHERE task_id = ? AND status = 'processing'`
  ).bind(errorCode, taskId).run();
}

async function chargeUserForTask(env, userId, taskId, resultUrl) {
  const grant = await env.DB.prepare(
    `SELECT id
     FROM credit_grants
     WHERE user_id = ?
       AND remaining_credits > 0
       AND (expires_at IS NULL OR expires_at > unixepoch())
     ORDER BY
       CASE WHEN credit_type IN ('free', 'referral', 'promotion') THEN 0 ELSE 1 END,
       CASE WHEN expires_at IS NULL THEN 9223372036854775807 ELSE expires_at END,
       created_at,
       id
     LIMIT 1`
  ).bind(userId).first();
  if (!grant) return null;

  const ledgerId = `task-charge:${taskId}`;
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, task_id, idempotency_key)
         VALUES (
           ?,
           (SELECT user_id FROM credit_grants
            WHERE id = ? AND user_id = ? AND remaining_credits > 0
              AND (expires_at IS NULL OR expires_at > unixepoch())),
           -1,
           (SELECT credit_type FROM credit_grants
            WHERE id = ? AND user_id = ? AND remaining_credits > 0
              AND (expires_at IS NULL OR expires_at > unixepoch())),
           'ai_background_removal',
           ?,
           ?,
           ?
         )`
      ).bind(
        ledgerId,
        grant.id,
        userId,
        grant.id,
        userId,
        grant.id,
        taskId,
        ledgerId,
      ),
      env.DB.prepare(
        `UPDATE credit_grants
         SET remaining_credits = remaining_credits - 1, updated_at = unixepoch()
         WHERE id = ? AND user_id = ? AND remaining_credits > 0`
      ).bind(grant.id, userId),
      env.DB.prepare(
        `UPDATE user_credits
         SET credits = credits - 1, total_used = total_used + 1
         WHERE user_id = ?`
      ).bind(userId),
      env.DB.prepare(
        `UPDATE ai_tasks
         SET status = 'succeeded', result_url = ?, charge_ledger_id = ?,
             completed_at = unixepoch(), updated_at = unixepoch()
         WHERE task_id = ? AND status = 'processing'`
      ).bind(resultUrl, ledgerId, taskId),
    ]);
  } catch (error) {
    const existing = await env.DB.prepare(
      'SELECT id FROM credit_ledger WHERE idempotency_key = ?'
    ).bind(ledgerId).first();
    if (!existing) return null;
  }

  return getCreditSummary(env, userId);
}

async function chargeGuestForTask(env, guest, taskId, resultUrl) {
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO guest_usage (device_hash, last_ip_hash, count)
         VALUES (?, ?, 1)
         ON CONFLICT(device_hash) DO UPDATE SET
           last_ip_hash = excluded.last_ip_hash,
           count = guest_usage.count + 1,
           updated_at = unixepoch()`
      ).bind(guest.deviceHash, guest.ipHash),
      env.DB.prepare(
        `INSERT INTO guest_ip_usage (ip_hash, count)
         VALUES (?, 1)
         ON CONFLICT(ip_hash) DO UPDATE SET
           count = guest_ip_usage.count + 1,
           updated_at = unixepoch()`
      ).bind(guest.ipHash),
      env.DB.prepare(
        `UPDATE ai_tasks
         SET status = 'succeeded', result_url = ?,
             completed_at = unixepoch(), updated_at = unixepoch()
         WHERE task_id = ? AND status = 'processing'`
      ).bind(resultUrl, taskId),
    ]);
    return true;
  } catch {
    return false;
  }
}

function paypalBase(env) {
  return env.PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';
}

async function getPayPalAccessToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
    throw new Error('PayPal credentials not configured');
  }
  const response = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`PayPal authentication failed (${response.status})`);
  }
  return data.access_token;
}

function findPayPalCapture(order) {
  for (const unit of order?.purchase_units || []) {
    for (const capture of unit?.payments?.captures || []) {
      if (capture?.status === 'COMPLETED') return capture;
    }
  }
  return null;
}

function moneyToMinorUnits(value) {
  const match = String(value ?? '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) return null;
  const minorUnits = whole * 100 + fraction;
  return Number.isSafeInteger(minorUnits) ? minorUnits : null;
}

// ── Router ────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, // 有些浏览器不喜欢 204
        headers: { 
          ...cors(origin),
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // GET /auth/login → redirect to Google
    if (url.pathname === '/auth/login') {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
      });
      return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
    }

    // GET /auth/callback → exchange code for token
    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      if (!code) return Response.redirect(`${FRONTEND_URL}?error=no_code`, 302);
      const guest = await getGuestIdentity(request);

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) return Response.redirect(`${FRONTEND_URL}?error=token_failed`, 302);

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = await profileRes.json();

      // Upsert user
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar`
      ).bind(profile.id, profile.email, profile.name, profile.picture).run();

      await ensureUserCreditAccount(env, profile.id, guest);

      const token = await signJWT(
        { sub: profile.id, email: profile.email, name: profile.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: FRONTEND_URL,
          'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Domain=.shopbgremover.com; Max-Age=2592000`,
        },
      });
    }

    // GET /auth/logout
    if (url.pathname === '/auth/logout') {
      return new Response(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <script>
          document.cookie = 'session=; Path=/; Domain=.shopbgremover.com; Max-Age=0; Secure; SameSite=None';
          document.cookie = 'session=; Path=/; Max-Age=0';
          window.location.href = '${FRONTEND_URL}';
        </script></head><body></body></html>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Set-Cookie': 'session=; Path=/; Domain=.shopbgremover.com; Max-Age=0; Secure; SameSite=None',
        },
      });
    }

    // POST /api/auth/email/send-otp → generate & email a 6-digit code
    if (url.pathname === '/api/auth/email/send-otp' && request.method === 'POST') {
      const { email } = await request.json().catch(() => ({}));
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: 'Invalid email address' }, 400, origin);
      }

      // Rate-limit: don't re-send if a fresh OTP (>1 min old) still exists
      const existing = await env.DB.prepare(
        `SELECT expires_at FROM email_otps WHERE email = ?`
      ).bind(email).first();
      if (existing && existing.expires_at > Math.floor(Date.now() / 1000) + 540) {
        return json({ error: 'Please wait 60 seconds before requesting another code.' }, 429, origin);
      }

      // 6-digit OTP via crypto
      const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
      const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 min

      await env.DB.prepare(
        `INSERT INTO email_otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)
         ON CONFLICT(email) DO UPDATE SET code=excluded.code, expires_at=excluded.expires_at, attempts=0`
      ).bind(email, code, expiresAt).run();

      // Send via Resend
      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `ShopBG Remover <${env.RESEND_FROM || 'onboarding@resend.dev'}>`,
          to: [email],
          subject: 'Your ShopBG Remover login code',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="margin:0 0 8px;font-size:22px;color:#111827">Your login code</h2>
            <p style="color:#6B7280;margin:0 0 28px;font-size:15px">Use this code to sign in to ShopBG Remover. It expires in 10 minutes.</p>
            <div style="background:#F3F4F6;border-radius:12px;padding:28px;text-align:center;margin-bottom:28px">
              <span style="font-size:42px;font-weight:800;letter-spacing:0.15em;color:#111827;font-family:monospace">${code}</span>
            </div>
            <p style="color:#9CA3AF;font-size:13px;margin:0">Didn't request this? You can safely ignore this email.</p>
          </div>`,
        }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}));
        return json({ error: 'Failed to send email. Please try again.', detail: err }, 500, origin);
      }
      return json({ ok: true }, 200, origin);
    }

    // POST /api/auth/email/verify → verify OTP, issue session
    if (url.pathname === '/api/auth/email/verify' && request.method === 'POST') {
      const { email, code } = await request.json().catch(() => ({}));
      if (!email || !code) return json({ error: 'Email and code are required.' }, 400, origin);
      const guest = await getGuestIdentity(request);

      const otp = await env.DB.prepare(
        `SELECT code, expires_at, attempts FROM email_otps WHERE email = ?`
      ).bind(email).first();

      if (!otp) return json({ error: 'No code found for this email. Request a new one.' }, 400, origin);
      if (otp.expires_at < Math.floor(Date.now() / 1000)) {
        await env.DB.prepare(`DELETE FROM email_otps WHERE email = ?`).bind(email).run();
        return json({ error: 'Code expired. Please request a new one.' }, 400, origin);
      }
      if (otp.attempts >= 5) {
        return json({ error: 'Too many incorrect attempts. Please request a new code.' }, 429, origin);
      }

      await env.DB.prepare(`UPDATE email_otps SET attempts = attempts + 1 WHERE email = ?`).bind(email).run();

      if (otp.code !== String(code).trim()) {
        const left = 4 - otp.attempts;
        return json({ error: `Incorrect code. ${left} attempt${left !== 1 ? 's' : ''} remaining.` }, 400, origin);
      }

      // Valid — consume OTP
      await env.DB.prepare(`DELETE FROM email_otps WHERE email = ?`).bind(email).run();

      // Find or create user by email (shared table with Google users)
      let user = await env.DB.prepare(`SELECT id, name FROM users WHERE email = ?`).bind(email).first();
      if (!user) {
        const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
        const userId  = 'em_' + Array.from(new Uint8Array(hashBuf)).slice(0, 8)
                          .map(b => b.toString(16).padStart(2, '0')).join('');
        const name    = email.split('@')[0];
        await env.DB.prepare(`INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)`)
          .bind(userId, email, name).run();
        user = { id: userId, name };
      }
      await ensureUserCreditAccount(env, user.id, guest);

      const token = await signJWT(
        { sub: user.id, email, name: user.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );

      return new Response(JSON.stringify({ ok: true, name: user.name }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...cors(origin),
          'Set-Cookie': `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Domain=.shopbgremover.com; Max-Age=2592000`,
        },
      });
    }

    // GET /api/me → current user info + credits
    if (url.pathname === '/api/me') {
      const user = await getUser(request, env);
      if (!user) return json({ user: null }, 200, origin);
      const credits = await getCreditSummary(env, user.sub);
      return json({ user: { id: user.sub, email: user.email, name: user.name }, credits }, 200, origin);
    }

    // Direct credit deductions are disabled: only a successful AI task can
    // consume a credit.
    if (url.pathname === '/api/use-credit' && request.method === 'POST') {
      return json({
        error: 'Direct credit deductions are disabled. Use /api/remove-bg with a task_id.',
      }, 410, origin);
    }

    // GET /api/check-credit → 只检查额度，不扣除
    if (url.pathname === '/api/check-credit') {
      const user = await getUser(request, env);
      if (!user) {
        const guest = await getGuestIdentity(request);
        const used = await getGuestUsage(env, guest);
        return json({
          ok: used < GUEST_FREE_LIMIT,
          ...(used >= GUEST_FREE_LIMIT ? { reason: 'free_limit' } : {}),
          remaining: Math.max(0, GUEST_FREE_LIMIT - used),
          limit: GUEST_FREE_LIMIT,
        }, 200, origin);
      }
      const credits = await getCreditSummary(env, user.sub);
      if (credits.credits <= 0) {
        return json({ ok: false, reason: 'no_credits' }, 200, origin);
      }
      return json({ ok: true, remaining: credits.credits, buckets: credits.buckets }, 200, origin);
    }

    // POST /api/remove-bg → fal.ai BiRefNet 抠图（成功后才扣积分）
    if (url.pathname === '/api/remove-bg' && request.method === 'POST') {
      const user = await getUser(request, env);
      const guest = user ? null : await getGuestIdentity(request);
      let activeTaskId = null;

      try {
        const body = await request.json();
        const image_url = body?.image_url;
        if (!image_url) return json({ error: '缺少 image_url' }, 400, origin);
        const taskId = typeof body?.task_id === 'string' && body.task_id.length >= 8 && body.task_id.length <= 128
          ? body.task_id
          : crypto.randomUUID();
        activeTaskId = taskId;
        const ownerKey = user ? `user:${user.sub}` : guest.ownerKey;
        const inputHash = await sha256Hex(image_url);
        const reservation = await reserveAiTask(env, {
          taskId,
          ownerKey,
          userId: user?.sub || null,
          guestDeviceHash: guest?.deviceHash || null,
          inputHash,
        });

        if (reservation.state === 'conflict') {
          return json({ error: 'task_id belongs to another task', reason: 'task_conflict' }, 409, origin);
        }
        if (reservation.state === 'processing') {
          return json({ error: 'Task is already processing', reason: 'task_processing', task_id: taskId }, 409, origin);
        }
        if (reservation.state === 'succeeded') {
          const existingImage = await fetch(reservation.resultUrl);
          if (!existingImage.ok) {
            return json({ error: 'Previous task result is no longer available', reason: 'result_expired' }, 410, origin);
          }
          return new Response(existingImage.body, {
            headers: {
              'Content-Type': existingImage.headers.get('Content-Type') || 'image/png',
              'X-Task-ID': taskId,
              ...cors(origin),
            },
          });
        }

        if (!user) {
          const used = await getGuestUsage(env, guest);
          if (used >= GUEST_FREE_LIMIT) {
            await failAiTask(env, taskId, 'free_limit');
            return json({
              ok: false,
              reason: 'free_limit',
              message: 'Free limit reached. Create an account for up to 10 lifetime free removals.',
            }, 403, origin);
          }
        } else {
          const credits = await getCreditSummary(env, user.sub);
          if (credits.credits <= 0) {
            await failAiTask(env, taskId, 'no_credits');
            return json({ ok: false, reason: 'no_credits', message: 'No credits remaining.' }, 403, origin);
          }
        }

        // 直接调用 fal.ai，前端已压缩好
        const falRes = await fetch('https://fal.run/fal-ai/birefnet', {
          method: 'POST',
          headers: {
            'Authorization': `Key ${env.FAL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: image_url,
            model: 'General Use (Heavy)',
            operating_resolution: '1024x1024',
            output_format: 'png',
          }),
        });

        if (!falRes.ok) {
          const txt = await falRes.text();
          await failAiTask(env, taskId, 'fal_failed');
          return json({ error: 'fal.ai 调用失败', detail: txt }, 502, origin);
        }

        const falData = await falRes.json();
        const resultUrl = falData?.image?.url;
        if (!resultUrl) {
          await failAiTask(env, taskId, 'missing_result');
          return json({ error: '未获取到结果图片', detail: falData }, 500, origin);
        }

        // 4. 下载结果图片
        const imgRes = await fetch(resultUrl);
        if (!imgRes.ok) {
          await failAiTask(env, taskId, 'result_download_failed');
          return json({ error: '下载结果图片失败', status: imgRes.status }, 500, origin);
        }

        // 成功获取结果后，通过 D1 事务批次只扣一次。
        if (user) {
          const charged = await chargeUserForTask(env, user.sub, taskId, resultUrl);
          if (!charged) {
            await failAiTask(env, taskId, 'credit_race');
            return json({ error: 'Credit balance changed. Please retry.', reason: 'no_credits' }, 409, origin);
          }
        } else if (!await chargeGuestForTask(env, guest, taskId, resultUrl)) {
          await failAiTask(env, taskId, 'free_limit_race');
          return json({ error: 'Free limit reached.', reason: 'free_limit' }, 409, origin);
        }

        // 6. 返回图片
        return new Response(imgRes.body, {
          headers: { 'Content-Type': 'image/png', 'X-Task-ID': taskId, ...cors(origin) },
        });

      } catch (e) {
        if (activeTaskId) await failAiTask(env, activeTaskId, 'internal_error');
        return json({ error: '处理失败', message: e.message }, 500, origin);
      }
    }

    // GET /api/history → processing history
    if (url.pathname === '/api/history') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);
      const rows = await env.DB.prepare(
        `SELECT id, file_count, created_at, settings_json FROM processing_history
         WHERE user_id = ? AND created_at > unixepoch() - 7776000
         ORDER BY created_at DESC LIMIT 50`
      ).bind(user.sub).all();
      return json({ history: rows.results }, 200, origin);
    }

    // POST /api/history → save processing record
    if (url.pathname === '/api/history' && request.method === 'POST') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);
      const body = await request.json();
      const id = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO processing_history (id, user_id, file_count, settings_json) VALUES (?, ?, ?, ?)`
      ).bind(id, user.sub, body.file_count, JSON.stringify(body.settings || {})).run();
      return json({ ok: true, id }, 200, origin);
    }

    // POST /api/paypal/create-order → create PayPal order
    if (url.pathname === '/api/paypal/create-order' && request.method === 'POST') {
      try {
        const user = await getUser(request, env);
        if (!user) return json({ error: 'Unauthorized' }, 401, origin);
        
        const { plan } = await request.json().catch(() => ({}));
        const pack = CREDIT_PACKS[plan];
        if (!pack) return json({ error: 'Invalid credit pack' }, 400, origin);

        const accessToken = await getPayPalAccessToken(env);
        const requestId = crypto.randomUUID();
        const orderRes = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': requestId,
          },
          body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
              reference_id: requestId,
              amount: { currency_code: pack.currency, value: pack.amount },
              description: `ShopBG Remover - ${pack.credits} credits`,
            }],
          }),
        });
        
        const orderText = await orderRes.text();
        let order;
        try {
          order = JSON.parse(orderText);
        } catch(e) {
          return json({ error: 'PayPal API returned invalid JSON', raw: orderText }, 500, origin);
        }
        
        if (!order.id) {
          return json({ error: 'PayPal order creation failed', detail: order }, 502, origin);
        }
        
        // Save order to DB
        await env.DB.prepare(
          `INSERT INTO orders
           (id, user_id, plan, amount, credits, base_credits, bonus_credits, currency, status)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'pending')`
        ).bind(
          order.id,
          user.sub,
          plan,
          pack.amount,
          pack.credits,
          pack.credits,
          pack.currency,
        ).run();
        
        return json({ orderId: order.id, approveUrl: order.links.find(l => l.rel === 'approve')?.href }, 200, origin);
      } catch(e) {
        console.error(JSON.stringify({ message: 'PayPal order creation failed', error: e.message }));
        return json({ error: 'Unable to create PayPal order' }, 502, origin);
      }
    }

    // POST /api/paypal/capture-order → capture payment and add credits
    if (url.pathname === '/api/paypal/capture-order' && request.method === 'POST') {
      const user = await getUser(request, env);
      if (!user) return json({ error: 'Unauthorized' }, 401, origin);

      const { orderId } = await request.json().catch(() => ({}));
      if (!orderId) return json({ error: 'orderId is required' }, 400, origin);

      // Order ownership is part of the lookup; another user cannot claim it.
      const order = await env.DB.prepare(
        `SELECT id, user_id, plan, amount, credits, base_credits, currency,
                status, paypal_capture_id
         FROM orders
         WHERE id = ? AND user_id = ?`
      ).bind(orderId, user.sub).first();
      if (!order) return json({ error: 'Order not found' }, 404, origin);
      if (order.status === 'completed') {
        return json({ ok: true, credits: order.base_credits, alreadyProcessed: true }, 200, origin);
      }
      if (order.status !== 'pending') {
        return json({ error: 'Order cannot be captured in its current state' }, 409, origin);
      }

      try {
        const accessToken = await getPayPalAccessToken(env);
        const captureRes = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}/capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'PayPal-Request-Id': `capture-${orderId}`,
          },
        });
        let paypalOrder = await captureRes.json().catch(() => ({}));
        let capture = findPayPalCapture(paypalOrder);

        if (!capture) {
          const detailsRes = await fetch(`${paypalBase(env)}/v2/checkout/orders/${orderId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          });
          paypalOrder = await detailsRes.json().catch(() => ({}));
          capture = findPayPalCapture(paypalOrder);
        }

        if (!capture || capture.status !== 'COMPLETED') {
          return json({ error: 'Payment not completed', detail: paypalOrder }, 400, origin);
        }

        const capturedAmount = moneyToMinorUnits(capture.amount?.value);
        const expectedAmount = moneyToMinorUnits(order.amount);
        if (
          capturedAmount === null
          || expectedAmount === null
          || capture.amount?.currency_code !== order.currency
          || capturedAmount !== expectedAmount
        ) {
          await env.DB.prepare(
            `UPDATE orders SET status = 'payment_review', failure_detail = ?
             WHERE id = ? AND user_id = ? AND status = 'pending'`
          ).bind(
            JSON.stringify({
              expected: { currency: order.currency, amount: String(order.amount) },
              captured: capture.amount || null,
            }),
            orderId,
            user.sub,
          ).run();
          return json({ error: 'Captured amount does not match the order' }, 409, origin);
        }

        const grantId = `purchase:${orderId}:paid`;
        const payerId = paypalOrder?.payer?.payer_id || null;
        try {
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE orders
               SET status = 'completed', paypal_capture_id = ?, paypal_payer_id = ?,
                   completed_at = unixepoch(), failure_detail = NULL
               WHERE id = ? AND user_id = ? AND status = 'pending'`
            ).bind(capture.id, payerId, orderId, user.sub),
            env.DB.prepare(
              `INSERT INTO credit_grants
               (id, user_id, credit_type, granted_credits, remaining_credits,
                order_id, idempotency_key)
               VALUES (?, ?, 'paid', ?, ?, ?, ?)`
            ).bind(grantId, user.sub, order.base_credits, order.base_credits, orderId, grantId),
            env.DB.prepare(
              `INSERT INTO credit_ledger
               (id, user_id, delta, balance_type, reason, grant_id, order_id, idempotency_key)
               VALUES (?, ?, ?, 'paid', 'paypal_purchase', ?, ?, ?)`
            ).bind(grantId, user.sub, order.base_credits, grantId, orderId, grantId),
            env.DB.prepare(
              'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?'
            ).bind(order.base_credits, user.sub),
          ]);
        } catch (error) {
          const completed = await env.DB.prepare(
            `SELECT status, paypal_capture_id FROM orders
             WHERE id = ? AND user_id = ?`
          ).bind(orderId, user.sub).first();
          if (completed?.status !== 'completed' || completed.paypal_capture_id !== capture.id) {
            throw error;
          }
        }

        return json({ ok: true, credits: order.base_credits }, 200, origin);
      } catch (error) {
        console.error(JSON.stringify({
          message: 'PayPal capture failed',
          orderId,
          userId: user.sub,
          error: error.message,
        }));
        return json({ error: 'Unable to capture PayPal payment' }, 502, origin);
      }
    }

    // POST /api/paypal/webhook → verified PayPal refund/reversal processing.
    if (url.pathname === '/api/paypal/webhook' && request.method === 'POST') {
      if (!env.PAYPAL_WEBHOOK_ID) {
        return json({ error: 'PayPal webhook is not configured' }, 503, origin);
      }

      const rawBody = await request.text();
      let event;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return json({ error: 'Invalid webhook JSON' }, 400, origin);
      }
      if (!event?.id || !event?.event_type) {
        return json({ error: 'Invalid webhook event' }, 400, origin);
      }

      try {
        const accessToken = await getPayPalAccessToken(env);
        const verificationRes = await fetch(
          `${paypalBase(env)}/v1/notifications/verify-webhook-signature`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              auth_algo: request.headers.get('PAYPAL-AUTH-ALGO'),
              cert_url: request.headers.get('PAYPAL-CERT-URL'),
              transmission_id: request.headers.get('PAYPAL-TRANSMISSION-ID'),
              transmission_sig: request.headers.get('PAYPAL-TRANSMISSION-SIG'),
              transmission_time: request.headers.get('PAYPAL-TRANSMISSION-TIME'),
              webhook_id: env.PAYPAL_WEBHOOK_ID,
              webhook_event: event,
            }),
          },
        );
        const verification = await verificationRes.json().catch(() => ({}));
        if (!verificationRes.ok || verification.verification_status !== 'SUCCESS') {
          return json({ error: 'Invalid PayPal webhook signature' }, 401, origin);
        }

        const payloadHash = await sha256Hex(rawBody);
        await env.DB.prepare(
          `INSERT OR IGNORE INTO webhook_events
           (event_id, type, status, resource_id, payload_hash)
           VALUES (?, ?, 'received', ?, ?)`
        ).bind(event.id, event.event_type, event.resource?.id || null, payloadHash).run();

        const eventRow = await env.DB.prepare(
          'SELECT status, payload_hash FROM webhook_events WHERE event_id = ?'
        ).bind(event.id).first();
        if (eventRow?.payload_hash !== payloadHash) {
          return json({ error: 'Webhook event ID payload mismatch' }, 409, origin);
        }
        if (eventRow?.status === 'processed' || eventRow?.status === 'ignored') {
          return json({ ok: true, duplicate: true }, 200, origin);
        }

        const refundEvents = new Set([
          'PAYMENT.CAPTURE.REFUNDED',
          'PAYMENT.CAPTURE.REVERSED',
        ]);
        if (!refundEvents.has(event.event_type)) {
          await env.DB.prepare(
            `UPDATE webhook_events
             SET status = 'ignored', processed_at = unixepoch()
             WHERE event_id = ?`
          ).bind(event.id).run();
          return json({ ok: true, ignored: true }, 200, origin);
        }

        const captureId = event.resource?.id;
        const order = await env.DB.prepare(
          `SELECT id, user_id, amount, currency, status
           FROM orders WHERE paypal_capture_id = ?`
        ).bind(captureId).first();
        if (!order) {
          await env.DB.prepare(
            `UPDATE webhook_events SET status = 'orphaned', error = ?
             WHERE event_id = ?`
          ).bind('No order found for PayPal capture', event.id).run();
          return json({ ok: true, orphaned: true }, 200, origin);
        }
        if (order.status === 'refunded') {
          await env.DB.prepare(
            `UPDATE webhook_events
             SET status = 'processed', processed_at = unixepoch()
             WHERE event_id = ?`
          ).bind(event.id).run();
          return json({ ok: true, duplicate: true }, 200, origin);
        }

        const refundedAmount = moneyToMinorUnits(event.resource?.amount?.value);
        const orderedAmount = moneyToMinorUnits(order.amount);
        if (
          refundedAmount === null
          || orderedAmount === null
          || event.resource?.amount?.currency_code !== order.currency
          || refundedAmount < orderedAmount
        ) {
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE orders
               SET status = 'refund_review', refund_amount = ?, failure_detail = ?
               WHERE id = ?`
            ).bind(
              event.resource?.amount?.value || null,
              'Partial or currency-mismatched refund requires manual review',
              order.id,
            ),
            env.DB.prepare(
              `UPDATE webhook_events
               SET status = 'review', error = ?, processed_at = unixepoch()
               WHERE event_id = ?`
            ).bind('Partial or currency-mismatched refund', event.id),
          ]);
          return json({ ok: true, review: true }, 200, origin);
        }

        const grant = await env.DB.prepare(
          `SELECT id, granted_credits
           FROM credit_grants
           WHERE order_id = ? AND credit_type = 'paid'`
        ).bind(order.id).first();
        if (!grant) {
          throw new Error('Paid credit grant not found for refunded order');
        }

        const purchaseLedger = await env.DB.prepare(
          `SELECT id FROM credit_ledger
           WHERE order_id = ? AND reason = 'paypal_purchase'`
        ).bind(order.id).first();
        const reversalId = `paypal-refund:${captureId}`;
        try {
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE credit_grants
               SET remaining_credits = 0, updated_at = unixepoch()
               WHERE id = ?`
            ).bind(grant.id),
            env.DB.prepare(
              `INSERT INTO credit_ledger
               (id, user_id, delta, balance_type, reason, grant_id, order_id,
                idempotency_key, reversal_of)
               VALUES (?, ?, ?, 'paid', 'paypal_refund', ?, ?, ?, ?)`
            ).bind(
              reversalId,
              order.user_id,
              -Number(grant.granted_credits),
              grant.id,
              order.id,
              reversalId,
              purchaseLedger?.id || null,
            ),
            env.DB.prepare(
              'UPDATE user_credits SET credits = credits - ? WHERE user_id = ?'
            ).bind(grant.granted_credits, order.user_id),
            env.DB.prepare(
              `UPDATE orders
               SET status = 'refunded', refunded_at = unixepoch(), refund_amount = ?,
                   failure_detail = NULL
               WHERE id = ?`
            ).bind(event.resource.amount.value, order.id),
            env.DB.prepare(
              `UPDATE webhook_events
               SET status = 'processed', processed_at = unixepoch(), error = NULL
               WHERE event_id = ?`
            ).bind(event.id),
          ]);
        } catch (error) {
          const reversed = await env.DB.prepare(
            'SELECT id FROM credit_ledger WHERE idempotency_key = ?'
          ).bind(reversalId).first();
          if (!reversed) throw error;
        }

        return json({ ok: true, refunded: true }, 200, origin);
      } catch (error) {
        await env.DB.prepare(
          `UPDATE webhook_events
           SET status = 'error', error = ?
           WHERE event_id = ?`
        ).bind(error.message, event.id).run().catch(() => undefined);
        console.error(JSON.stringify({
          message: 'PayPal webhook processing failed',
          eventId: event.id,
          error: error.message,
        }));
        return json({ error: 'Webhook processing failed' }, 500, origin);
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
