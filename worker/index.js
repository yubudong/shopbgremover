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
const VOUCHER_PACKS = Object.freeze({
  100: { faceValueMinor: 2200, currency: 'CNY' },
  300: { faceValueMinor: 6000, currency: 'CNY' },
  1000: { faceValueMinor: 16000, currency: 'CNY' },
});
const VOUCHER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VOUCHER_ACCOUNT_FAILURE_LIMIT = 5;
const VOUCHER_IP_FAILURE_LIMIT = 20;
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

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

function privateJson(data, status = 200, origin) {
  const response = json(data, status, origin);
  response.headers.set('Cache-Control', 'no-store');
  return response;
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

function getAdminEmails(env) {
  return new Set(
    String(env.ADMIN_EMAILS || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function getAdmin(request, env) {
  const user = await getUser(request, env);
  if (!user?.email) return null;
  return getAdminEmails(env).has(user.email.toLowerCase()) ? user : null;
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function normalizeVoucherCode(value) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^SBG[A-HJ-NP-Z2-9]{16}$/.test(compact)) return null;
  const body = compact.slice(3);
  return {
    canonical: compact,
    display: `SBG-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`,
  };
}

function generateVoucherCode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (byte) => VOUCHER_ALPHABET[byte & 31]).join('');
  return `SBG-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}`;
}

async function hashVoucherCode(code, env) {
  if (!env.VOUCHER_HASH_SECRET) {
    throw new Error('Voucher hash secret is not configured');
  }
  const normalized = normalizeVoucherCode(code);
  if (!normalized) return null;
  return sha256Hex(`${env.VOUCHER_HASH_SECRET}:${normalized.canonical}`);
}

function normalizeReferralCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return new RegExp(`^[${VOUCHER_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`).test(code)
    ? code
    : null;
}

function generateReferralCode() {
  const bytes = new Uint8Array(REFERRAL_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => VOUCHER_ALPHABET[byte & 31]).join('');
}

async function ensureReferralCode(env, userId) {
  const existing = await env.DB.prepare(
    'SELECT code, status FROM referral_codes WHERE user_id = ?'
  ).bind(userId).first();
  if (existing) return existing;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO referral_codes (code, user_id, status)
       VALUES (?, ?, 'active')`
    ).bind(code, userId).run();

    const created = await env.DB.prepare(
      'SELECT code, status FROM referral_codes WHERE user_id = ?'
    ).bind(userId).first();
    if (created) return created;
  }
  throw new Error('Unable to allocate a referral code');
}

function referralCookie(value, maxAge = REFERRAL_COOKIE_MAX_AGE) {
  return `referral_pending=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=.shopbgremover.com; Max-Age=${maxAge}`;
}

async function bindPendingReferral(env, request, userId, guest, isNewUser) {
  if (!isNewUser) return false;
  const token = getCookie(request, 'referral_pending');
  if (!token) return false;

  const pending = await verifyJWT(token, env.JWT_SECRET);
  if (pending?.purpose !== 'referral' || !normalizeReferralCode(pending.code)) {
    return false;
  }

  const referrer = await env.DB.prepare(
    `SELECT user_id, code
     FROM referral_codes
     WHERE code = ? AND status = 'active'`
  ).bind(pending.code).first();
  if (!referrer || referrer.user_id === userId) return false;

  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO referrals
     (id, referrer_user_id, referred_user_id, referral_code, source,
      created_ip_hash, created_device_hash)
     VALUES (?, ?, ?, ?, 'link', ?, ?)`
  ).bind(
    crypto.randomUUID(),
    referrer.user_id,
    userId,
    referrer.code,
    guest.ipHash,
    guest.deviceHash,
  ).run();
  return Number(inserted.meta?.changes || 0) === 1;
}

async function recordVoucherAttempt(env, {
  userId,
  guest,
  codeFingerprint,
  success,
}) {
  await env.DB.prepare(
    `INSERT INTO voucher_attempts
     (id, user_id, ip_hash, device_hash, code_fingerprint, success)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    userId,
    guest.ipHash,
    guest.deviceHash,
    codeFingerprint,
    success ? 1 : 0,
  ).run();
}

async function voucherAttemptIsLimited(env, userId, ipHash) {
  const [accountFailures, ipFailures] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM voucher_attempts
       WHERE user_id = ? AND success = 0
         AND created_at > unixepoch() - 3600`
    ).bind(userId).first('count'),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM voucher_attempts
       WHERE ip_hash = ? AND success = 0
         AND created_at > unixepoch() - 3600`
    ).bind(ipHash).first('count'),
  ]);
  return Number(accountFailures || 0) >= VOUCHER_ACCOUNT_FAILURE_LIMIT
    || Number(ipFailures || 0) >= VOUCHER_IP_FAILURE_LIMIT;
}

async function expireVoucherCards(env) {
  await env.DB.prepare(
    `UPDATE voucher_cards
     SET status = 'expired'
     WHERE status IN ('generated', 'reserved', 'delivered')
       AND batch_id IN (
         SELECT id FROM voucher_batches
         WHERE expires_at IS NOT NULL AND expires_at <= unixepoch()
       )`
  ).run();
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
      const existingUser = await env.DB.prepare(
        'SELECT id FROM users WHERE id = ?'
      ).bind(profile.id).first();

      // Upsert user
      await env.DB.prepare(
        `INSERT INTO users (id, email, name, avatar) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, avatar=excluded.avatar`
      ).bind(profile.id, profile.email, profile.name, profile.picture).run();

      await ensureUserCreditAccount(env, profile.id, guest);
      await bindPendingReferral(env, request, profile.id, guest, !existingUser);

      const token = await signJWT(
        { sub: profile.id, email: profile.email, name: profile.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );

      const headers = new Headers({ Location: FRONTEND_URL });
      headers.append(
        'Set-Cookie',
        `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Domain=.shopbgremover.com; Max-Age=2592000`,
      );
      headers.append('Set-Cookie', referralCookie('', 0));
      return new Response(null, {
        status: 302,
        headers,
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
      const isNewUser = !user;
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
      await bindPendingReferral(env, request, user.id, guest, isNewUser);

      const token = await signJWT(
        { sub: user.id, email, name: user.name, exp: Math.floor(Date.now() / 1000) + 86400 * 30 },
        env.JWT_SECRET
      );

      const headers = new Headers({
        'Content-Type': 'application/json',
        ...cors(origin),
      });
      headers.append(
        'Set-Cookie',
        `session=${token}; Path=/; HttpOnly; Secure; SameSite=None; Domain=.shopbgremover.com; Max-Age=2592000`,
      );
      headers.append('Set-Cookie', referralCookie('', 0));
      return new Response(JSON.stringify({ ok: true, name: user.name }), {
        status: 200,
        headers,
      });
    }

    // GET /api/me → current user info + credits
    if (url.pathname === '/api/me') {
      const user = await getUser(request, env);
      if (!user) return json({ user: null }, 200, origin);
      const credits = await getCreditSummary(env, user.sub);
      return json({ user: { id: user.sub, email: user.email, name: user.name }, credits }, 200, origin);
    }

    // POST /api/referrals/capture → validate and store a signed 30-day
    // first-party referral cookie. The relationship is bound only if login
    // creates a brand-new account.
    if (url.pathname === '/api/referrals/capture' && request.method === 'POST') {
      const existingToken = getCookie(request, 'referral_pending');
      if (existingToken) {
        const existingPending = await verifyJWT(existingToken, env.JWT_SECRET);
        const existingCode = existingPending?.purpose === 'referral'
          ? normalizeReferralCode(existingPending.code)
          : null;
        if (existingCode) {
          const existingActive = await env.DB.prepare(
            `SELECT code FROM referral_codes
             WHERE code = ? AND status = 'active'`
          ).bind(existingCode).first();
          if (existingActive) {
            return privateJson({
              ok: true,
              already_captured: true,
              code: existingCode,
            }, 200, origin);
          }
        }
      }

      const body = await request.json().catch(() => ({}));
      const code = normalizeReferralCode(body.code);
      if (!code) return privateJson({ error: 'Invalid referral code' }, 400, origin);

      const active = await env.DB.prepare(
        `SELECT code FROM referral_codes
         WHERE code = ? AND status = 'active'`
      ).bind(code).first();
      if (!active) return privateJson({ error: 'Invalid referral code' }, 400, origin);

      const token = await signJWT({
        purpose: 'referral',
        code,
        exp: Math.floor(Date.now() / 1000) + REFERRAL_COOKIE_MAX_AGE,
      }, env.JWT_SECRET);
      const response = privateJson({ ok: true }, 200, origin);
      response.headers.append('Set-Cookie', referralCookie(token));
      return response;
    }

    // GET /api/referrals/me → return the current user's stable referral code
    // and aggregate relationship counts. Codes can exist before a payment,
    // but rewards become eligible only after a completed top-up.
    if (url.pathname === '/api/referrals/me' && request.method === 'GET') {
      const user = await getUser(request, env);
      if (!user) return privateJson({ error: 'Unauthorized' }, 401, origin);

      const [code, paidOrder, counts] = await Promise.all([
        ensureReferralCode(env, user.sub),
        env.DB.prepare(
          `SELECT id FROM orders
           WHERE user_id = ? AND status = 'completed' AND base_credits > 0
           LIMIT 1`
        ).bind(user.sub).first(),
        env.DB.prepare(
          `SELECT
             COUNT(*) AS registered_count,
             SUM(CASE WHEN first_paid_order_id IS NOT NULL THEN 1 ELSE 0 END) AS paid_count,
             SUM(CASE WHEN risk_status = 'review' THEN 1 ELSE 0 END) AS review_count
           FROM referrals
           WHERE referrer_user_id = ?`
        ).bind(user.sub).first(),
      ]);

      return privateJson({
        code: code.code,
        status: code.status,
        link: `${FRONTEND_URL}/?ref=${code.code}`,
        reward_eligible: Boolean(paidOrder),
        registered_count: Number(counts?.registered_count || 0),
        paid_count: Number(counts?.paid_count || 0),
        review_count: Number(counts?.review_count || 0),
      }, 200, origin);
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

    // POST /api/admin/vouchers/generate → generate plaintext once, persist hashes only.
    if (url.pathname === '/api/admin/vouchers/generate' && request.method === 'POST') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      if (!env.VOUCHER_HASH_SECRET) {
        return privateJson({ error: 'Voucher service is not configured' }, 503, origin);
      }
      await expireVoucherCards(env);

      const body = await request.json().catch(() => ({}));
      const credits = Number(body.credits);
      const pack = VOUCHER_PACKS[credits];
      const quantity = Number(body.quantity || 1);
      const salesOrderRef = String(body.sales_order_ref || '').trim();
      const salesNote = String(body.sales_note || '').trim();
      const requestedName = String(body.name || '').trim();
      const expiresAt = body.expires_at == null ? null : Number(body.expires_at);

      if (!pack || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        return privateJson({ error: 'Invalid voucher package or quantity' }, 400, origin);
      }
      if (salesOrderRef.length > 100 || salesNote.length > 500 || requestedName.length > 100) {
        return privateJson({ error: 'Voucher metadata is too long' }, 400, origin);
      }
      if (quantity > 1 && salesOrderRef) {
        return privateJson({
          error: 'A Xianyu order reference can only be attached to one voucher',
        }, 400, origin);
      }
      if (
        expiresAt !== null
        && (!Number.isInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000))
      ) {
        return privateJson({ error: 'Expiration must be a future Unix timestamp' }, 400, origin);
      }
      if (salesOrderRef) {
        const existing = await env.DB.prepare(
          `SELECT id FROM voucher_cards
           WHERE sales_channel = 'xianyu' AND sales_order_ref = ?
             AND status IN ('generated', 'reserved', 'delivered', 'redeemed')
           LIMIT 1`
        ).bind(salesOrderRef).first();
        if (existing) {
          return privateJson({ error: 'This Xianyu order already has a voucher' }, 409, origin);
        }
      }

      const batchId = crypto.randomUUID();
      const batchName = requestedName
        || (salesOrderRef ? `Xianyu ${salesOrderRef}` : `Voucher batch ${batchId.slice(0, 8)}`);
      const cardStatus = salesOrderRef ? 'reserved' : 'generated';
      const generated = await Promise.all(
        Array.from({ length: quantity }, async () => {
          const code = generateVoucherCode();
          const normalized = normalizeVoucherCode(code);
          return {
            id: crypto.randomUUID(),
            code,
            codeHash: await hashVoucherCode(code, env),
            prefix: normalized.display.slice(0, 8),
            last4: normalized.display.slice(-4),
          };
        }),
      );
      const statements = [
        env.DB.prepare(
          `INSERT INTO voucher_batches
           (id, name, base_credits, face_value_minor, currency, quantity,
            sales_channel, status, expires_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, 'xianyu', 'active', ?, ?)`
        ).bind(
          batchId,
          batchName,
          credits,
          pack.faceValueMinor,
          pack.currency,
          quantity,
          expiresAt,
          admin.sub,
        ),
      ];
      for (const card of generated) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO voucher_cards
             (id, batch_id, code_hash, code_prefix, code_last4, base_credits,
              face_value_minor, currency, status, sales_channel, sales_order_ref,
              sales_note, reserved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'xianyu', ?, ?, ?)`
          ).bind(
            card.id,
            batchId,
            card.codeHash,
            card.prefix,
            card.last4,
            credits,
            pack.faceValueMinor,
            pack.currency,
            cardStatus,
            salesOrderRef || null,
            salesNote || null,
            salesOrderRef ? Math.floor(Date.now() / 1000) : null,
          ),
        );
      }
      statements.push(
        env.DB.prepare(
          `INSERT INTO voucher_admin_audit
           (id, admin_user_id, action, batch_id, detail_json)
           VALUES (?, ?, 'generate', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          admin.sub,
          batchId,
          JSON.stringify({
            quantity,
            credits,
            sales_order_ref: salesOrderRef || null,
          }),
        ),
      );

      try {
        await env.DB.batch(statements);
      } catch (error) {
        console.error(JSON.stringify({
          message: 'Voucher generation failed',
          batchId,
          adminUserId: admin.sub,
          error: error.message,
        }));
        return privateJson({ error: 'Unable to generate vouchers' }, 500, origin);
      }

      return privateJson({
        ok: true,
        batch_id: batchId,
        status: cardStatus,
        vouchers: generated.map((card) => ({
          id: card.id,
          code: card.code,
          credits,
          face_value: (pack.faceValueMinor / 100).toFixed(2),
          currency: pack.currency,
          sales_order_ref: salesOrderRef || null,
        })),
        warning: 'Plaintext voucher codes are shown only in this response.',
      }, 201, origin);
    }

    // GET /api/admin/vouchers/audit → exportable administrator action history.
    if (url.pathname === '/api/admin/vouchers/audit' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const rows = await env.DB.prepare(
        `SELECT a.id, a.action, a.batch_id, a.card_id, a.detail_json, a.created_at,
                u.email AS admin_email
         FROM voucher_admin_audit a
         JOIN users u ON u.id = a.admin_user_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 500`
      ).all();
      return privateJson({ audit: rows.results || [] }, 200, origin);
    }

    // GET /api/admin/vouchers → search by Xianyu order, prefix, last four, or status.
    if (url.pathname === '/api/admin/vouchers' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      await expireVoucherCards(env);
      const query = String(url.searchParams.get('q') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      const allowedStatuses = new Set([
        'generated', 'reserved', 'delivered', 'redeemed', 'void', 'expired',
      ]);
      if (status && !allowedStatuses.has(status)) {
        return privateJson({ error: 'Invalid status' }, 400, origin);
      }

      const conditions = [];
      const bindings = [];
      if (query) {
        conditions.push(
          `(vc.sales_order_ref LIKE ? OR vc.code_prefix LIKE ? OR vc.code_last4 LIKE ?)`,
        );
        const pattern = `%${query}%`;
        bindings.push(pattern, pattern, pattern);
      }
      if (status) {
        conditions.push('vc.status = ?');
        bindings.push(status);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const statement = env.DB.prepare(
        `SELECT vc.id, vc.batch_id, vc.code_prefix, vc.code_last4,
                vc.base_credits, vc.face_value_minor, vc.currency, vc.status,
                vc.sales_channel, vc.sales_order_ref, vc.sales_note,
                vc.reserved_at, vc.delivered_at, vc.redeemed_at,
                vc.redeem_order_id, vc.created_at, u.email AS redeemed_email
         FROM voucher_cards vc
         LEFT JOIN users u ON u.id = vc.redeemed_by
         ${where}
         ORDER BY vc.created_at DESC, vc.id DESC
         LIMIT 200`
      );
      const rows = bindings.length
        ? await statement.bind(...bindings).all()
        : await statement.all();
      return privateJson({
        vouchers: (rows.results || []).map((card) => ({
          ...card,
          redeemed_email: maskEmail(card.redeemed_email),
        })),
      }, 200, origin);
    }

    // POST /api/admin/vouchers/:id/deliver|void → controlled state transitions.
    const voucherAdminAction = url.pathname.match(
      /^\/api\/admin\/vouchers\/([^/]+)\/(deliver|void)$/,
    );
    if (voucherAdminAction && request.method === 'POST') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      await expireVoucherCards(env);
      const [, cardId, action] = voucherAdminAction;
      const targetStatus = action === 'deliver' ? 'delivered' : 'void';
      const allowedCurrent = action === 'deliver'
        ? ['generated', 'reserved']
        : ['generated', 'reserved', 'delivered'];
      const placeholders = allowedCurrent.map(() => '?').join(', ');
      const [result] = await env.DB.batch([
        env.DB.prepare(
          `UPDATE voucher_cards
           SET status = ?, delivered_at = CASE WHEN ? = 'delivered' THEN unixepoch() ELSE delivered_at END
           WHERE id = ? AND status IN (${placeholders})`
        ).bind(targetStatus, targetStatus, cardId, ...allowedCurrent),
        env.DB.prepare(
          `INSERT INTO voucher_admin_audit
           (id, admin_user_id, action, card_id)
           SELECT ?, ?, ?, ? WHERE changes() = 1`
        ).bind(crypto.randomUUID(), admin.sub, action, cardId),
      ]);
      if (Number(result.meta?.changes || 0) !== 1) {
        return privateJson({ error: 'Voucher cannot change to that status' }, 409, origin);
      }
      return privateJson({ ok: true, id: cardId, status: targetStatus }, 200, origin);
    }

    // POST /api/vouchers/redeem → server-side, rate-limited, atomic redemption.
    if (url.pathname === '/api/vouchers/redeem' && request.method === 'POST') {
      const user = await getUser(request, env);
      if (!user) return privateJson({ error: 'Unauthorized' }, 401, origin);
      if (!env.VOUCHER_HASH_SECRET) {
        return privateJson({ error: 'Voucher service is not configured' }, 503, origin);
      }
      await expireVoucherCards(env);
      const guest = await getGuestIdentity(request);
      if (await voucherAttemptIsLimited(env, user.sub, guest.ipHash)) {
        return privateJson({
          error: 'Too many voucher attempts. Please try again later.',
        }, 429, origin);
      }

      const body = await request.json().catch(() => ({}));
      if (body.referral_code) {
        return privateJson({
          error: 'Referral codes are not available in voucher redemption yet.',
        }, 409, origin);
      }
      const normalized = normalizeVoucherCode(body.code);
      const genericError = {
        error: 'Voucher is invalid, already used, or no longer available.',
      };
      if (!normalized) {
        await recordVoucherAttempt(env, {
          userId: user.sub,
          guest,
          codeFingerprint: null,
          success: false,
        });
        return privateJson(genericError, 400, origin);
      }

      const codeHash = await hashVoucherCode(normalized.display, env);
      const codeFingerprint = codeHash.slice(0, 16);
      const card = await env.DB.prepare(
        `SELECT vc.id, vc.base_credits, vc.face_value_minor, vc.currency,
                vc.status, vc.redeemed_by, vc.redeemed_at, vc.redeem_order_id,
                vb.expires_at AS batch_expires_at
         FROM voucher_cards vc
         JOIN voucher_batches vb ON vb.id = vc.batch_id
         WHERE vc.code_hash = ?`
      ).bind(codeHash).first();

      if (card?.status === 'redeemed' && card.redeemed_by === user.sub) {
        const credits = await getCreditSummary(env, user.sub);
        return privateJson({
          ok: true,
          already_redeemed: true,
          credits_added: Number(card.base_credits),
          redeemed_at: card.redeemed_at,
          order_id: card.redeem_order_id,
          balance: credits,
        }, 200, origin);
      }

      const now = Math.floor(Date.now() / 1000);
      const eligible = card
        && ['generated', 'reserved', 'delivered'].includes(card.status)
        && (!card.batch_expires_at || Number(card.batch_expires_at) > now);
      if (!eligible) {
        await recordVoucherAttempt(env, {
          userId: user.sub,
          guest,
          codeFingerprint,
          success: false,
        });
        return privateJson(genericError, 400, origin);
      }

      const orderId = `voucher:${card.id}`;
      const grantId = `voucher:${card.id}:paid`;
      try {
        await env.DB.batch([
          env.DB.prepare(
            `INSERT INTO orders
             (id, user_id, plan, amount, credits, base_credits, bonus_credits,
              currency, status, completed_at, payment_method, voucher_card_id)
             SELECT ?, ?, ?, vc.face_value_minor / 100.0, vc.base_credits,
                    vc.base_credits, 0, vc.currency, 'completed', unixepoch(),
                    'voucher', vc.id
             FROM voucher_cards vc
             JOIN voucher_batches vb ON vb.id = vc.batch_id
             WHERE vc.id = ?
               AND vc.status IN ('generated', 'reserved', 'delivered')
               AND (vb.expires_at IS NULL OR vb.expires_at > unixepoch())`
          ).bind(orderId, user.sub, `voucher_${card.base_credits}`, card.id),
          env.DB.prepare(
            `UPDATE voucher_cards
             SET status = 'redeemed', redeemed_by = ?, redeemed_at = unixepoch(),
                 redeem_order_id = ?
             WHERE id = ?
               AND status IN ('generated', 'reserved', 'delivered')`
          ).bind(user.sub, orderId, card.id),
          env.DB.prepare(
            `INSERT INTO credit_grants
             (id, user_id, credit_type, granted_credits, remaining_credits,
              order_id, idempotency_key)
             SELECT ?, user_id, 'paid', base_credits, base_credits, id, ?
             FROM orders WHERE id = ? AND payment_method = 'voucher'`
          ).bind(grantId, grantId, orderId),
          env.DB.prepare(
            `INSERT INTO credit_ledger
             (id, user_id, delta, balance_type, reason, grant_id, order_id,
              idempotency_key)
             SELECT ?, user_id, base_credits, 'paid', 'voucher_redeem', ?, id, ?
             FROM orders WHERE id = ? AND payment_method = 'voucher'`
          ).bind(grantId, grantId, grantId, orderId),
          env.DB.prepare(
            `UPDATE user_credits
             SET credits = credits + ?
             WHERE user_id = ?
               AND EXISTS (
                 SELECT 1 FROM orders
                 WHERE id = ? AND user_id = ? AND payment_method = 'voucher'
               )`
          ).bind(card.base_credits, user.sub, orderId, user.sub),
          env.DB.prepare(
            `INSERT INTO voucher_attempts
             (id, user_id, ip_hash, device_hash, code_fingerprint, success)
             SELECT ?, ?, ?, ?, ?, 1
             WHERE EXISTS (
               SELECT 1 FROM orders
               WHERE id = ? AND user_id = ? AND payment_method = 'voucher'
             )`
          ).bind(
            crypto.randomUUID(),
            user.sub,
            guest.ipHash,
            guest.deviceHash,
            codeFingerprint,
            orderId,
            user.sub,
          ),
        ]);
      } catch (error) {
        const redeemed = await env.DB.prepare(
          `SELECT redeemed_by, redeemed_at, redeem_order_id, base_credits
           FROM voucher_cards WHERE id = ? AND status = 'redeemed'`
        ).bind(card.id).first();
        if (redeemed?.redeemed_by === user.sub) {
          const credits = await getCreditSummary(env, user.sub);
          return privateJson({
            ok: true,
            already_redeemed: true,
            credits_added: Number(redeemed.base_credits),
            redeemed_at: redeemed.redeemed_at,
            order_id: redeemed.redeem_order_id,
            balance: credits,
          }, 200, origin);
        }
        await recordVoucherAttempt(env, {
          userId: user.sub,
          guest,
          codeFingerprint,
          success: false,
        });
        return privateJson(genericError, 400, origin);
      }

      const redeemed = await env.DB.prepare(
        `SELECT redeemed_by, redeemed_at, redeem_order_id
         FROM voucher_cards WHERE id = ?`
      ).bind(card.id).first();
      if (redeemed?.redeemed_by !== user.sub) {
        await recordVoucherAttempt(env, {
          userId: user.sub,
          guest,
          codeFingerprint,
          success: false,
        });
        return privateJson(genericError, 400, origin);
      }
      const credits = await getCreditSummary(env, user.sub);
      return privateJson({
        ok: true,
        credits_added: Number(card.base_credits),
        redeemed_at: redeemed.redeemed_at,
        order_id: redeemed.redeem_order_id,
        balance: credits,
      }, 200, origin);
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
