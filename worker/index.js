import {
  cleanupExpiredInpaint,
  maybeHandleInpaintRequest,
  processInpaintQueue,
} from './inpaint.js';

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
const XIANYU_PURCHASE_SETTING_KEY = 'xianyu_purchase';
const XIANYU_ALLOWED_HOST_SUFFIXES = Object.freeze([
  'goofish.com',
  'taobao.com',
  'tb.cn',
  'xianyu.com',
]);
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const REFERRAL_REWARD_TTL_SECONDS = 90 * 24 * 60 * 60;
const REFERRAL_OBSERVATION_SECONDS = 7 * 24 * 60 * 60;
const FAL_QUEUE_ENDPOINT = 'https://queue.fal.run/fal-ai/birefnet';
const ANALYTICS_RETENTION_DAYS = 180;
const ANALYTICS_BATCH_LIMIT = 20;
const ANALYTICS_RATE_WINDOW_SECONDS = 10 * 60;
const ANALYTICS_RATE_EVENT_LIMIT = 250;
const ANALYTICS_EVENTS = new Set([
  'page_view',
  'workspace_view',
  'file_selected',
  'tool_open',
  'tool_started',
  'result_ready',
  'result_downloaded',
  'pricing_view',
  'xianyu_clicked',
]);
const ANALYTICS_TOOLS = new Set([
  '',
  'workspace',
  'inpaint',
  'remove_bg',
  'compose',
  'zip',
  'pricing',
]);

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
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Device-ID',
    'Access-Control-Expose-Headers': 'X-Task-ID, X-AI-Reused',
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

async function resolveInpaintIdentity(request, env) {
  const [user, guest] = await Promise.all([
    getUser(request, env),
    getGuestIdentity(request),
  ]);
  return {
    ownerKey: user?.sub ? `user:${user.sub}` : guest.ownerKey,
    userId: user?.sub || null,
    guestDeviceHash: user?.sub ? null : guest.deviceHash,
    guestIpHash: user?.sub ? null : guest.ipHash,
    isAdmin: Boolean(
      user?.email && getAdminEmails(env).has(user.email.toLowerCase()),
    ),
  };
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

function emptyXianyuPurchaseConfig() {
  return {
    enabled: false,
    default_url: '',
    package_urls: {
      100: '',
      300: '',
      1000: '',
    },
  };
}

function parseXianyuPurchaseConfig(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') return emptyXianyuPurchaseConfig();
    return {
      enabled: parsed.enabled === true,
      default_url: typeof parsed.default_url === 'string' ? parsed.default_url : '',
      package_urls: {
        100: typeof parsed.package_urls?.[100] === 'string' ? parsed.package_urls[100] : '',
        300: typeof parsed.package_urls?.[300] === 'string' ? parsed.package_urls[300] : '',
        1000: typeof parsed.package_urls?.[1000] === 'string' ? parsed.package_urls[1000] : '',
      },
    };
  } catch {
    return emptyXianyuPurchaseConfig();
  }
}

function normalizeXianyuPurchaseUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 2048) throw new Error('Xianyu links must be 2048 characters or fewer');

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error('Enter a valid Xianyu or Taobao URL');
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = XIANYU_ALLOWED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
  if (url.protocol !== 'https:' || url.username || url.password || !allowed) {
    throw new Error('Only HTTPS links on approved Xianyu or Taobao domains are allowed');
  }
  return url.toString();
}

function normalizeXianyuPurchaseConfig(value) {
  if (!value || typeof value !== 'object' || typeof value.enabled !== 'boolean') {
    throw new Error('Enabled must be true or false');
  }
  const config = {
    enabled: value.enabled,
    default_url: normalizeXianyuPurchaseUrl(value.default_url),
    package_urls: {
      100: normalizeXianyuPurchaseUrl(value.package_urls?.[100]),
      300: normalizeXianyuPurchaseUrl(value.package_urls?.[300]),
      1000: normalizeXianyuPurchaseUrl(value.package_urls?.[1000]),
    },
  };
  if (
    config.enabled
    && !config.default_url
    && !Object.values(config.package_urls).some(Boolean)
  ) {
    throw new Error('Add at least one Xianyu product link before enabling the purchase entry');
  }
  return config;
}

async function readXianyuPurchaseConfig(env) {
  const row = await env.DB.prepare(
    'SELECT value_json FROM site_settings WHERE key = ? LIMIT 1'
  ).bind(XIANYU_PURCHASE_SETTING_KEY).first();
  return parseXianyuPurchaseConfig(row?.value_json);
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
    `SELECT task_id, owner_key, input_hash, status, result_url, provider_request_id
     FROM ai_tasks WHERE task_id = ?`
  ).bind(taskId).first();

  if (!task || task.owner_key !== ownerKey || task.input_hash !== inputHash) {
    return { state: 'conflict' };
  }
  if (task.status === 'succeeded') {
    return { state: 'succeeded', resultUrl: task.result_url };
  }
  if (task.status === 'processing') {
    return { state: 'processing', providerRequestId: task.provider_request_id };
  }

  const retried = await env.DB.prepare(
    `UPDATE ai_tasks
     SET status = 'processing', error_code = NULL, updated_at = unixepoch()
     WHERE task_id = ? AND status = 'failed'`
  ).bind(taskId).run();
  return Number(retried.meta?.changes || 0) === 1
    ? { state: 'retry', providerRequestId: task.provider_request_id }
    : { state: 'processing' };
}

async function failAiTask(env, taskId, errorCode, { clearProvider = false } = {}) {
  await env.DB.prepare(
    `UPDATE ai_tasks
     SET status = 'failed',
         error_code = ?,
         provider_request_id = CASE WHEN ? THEN NULL ELSE provider_request_id END,
         provider_submitted_at = CASE WHEN ? THEN NULL ELSE provider_submitted_at END,
         updated_at = unixepoch()
     WHERE task_id = ? AND status = 'processing'`
  ).bind(errorCode, clearProvider ? 1 : 0, clearProvider ? 1 : 0, taskId).run();
}

function aiProviderError(message, {
  reason = 'fal_failed',
  status = 502,
  detail,
  keepProcessing = false,
} = {}) {
  const error = new Error(message);
  error.reason = reason;
  error.status = status;
  error.detail = detail;
  error.keepProcessing = keepProcessing;
  return error;
}

async function submitFalTask(env, taskId, imageUrl) {
  try {
    const response = await fetch(FAL_QUEUE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageUrl,
        model: 'General Use (Heavy)',
        operating_resolution: '1024x1024',
        output_format: 'png',
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw aiProviderError('fal.ai queue submission failed', { detail });
    }

    const data = await response.json();
    const providerRequestId = data?.request_id;
    if (typeof providerRequestId !== 'string' || !providerRequestId) {
      throw aiProviderError('fal.ai queue did not return a request id', {
        reason: 'missing_provider_request_id',
        detail: data,
      });
    }

    const stored = await env.DB.prepare(
      `UPDATE ai_tasks
       SET provider_request_id = ?, provider_submitted_at = unixepoch(),
           updated_at = unixepoch()
       WHERE task_id = ? AND status = 'processing'
         AND provider_request_id IS NULL`
    ).bind(providerRequestId, taskId).run();
    if (Number(stored.meta?.changes || 0) !== 1) {
      const current = await env.DB.prepare(
        'SELECT provider_request_id FROM ai_tasks WHERE task_id = ?'
      ).bind(taskId).first('provider_request_id');
      if (current) return current;
      throw aiProviderError('Unable to persist fal.ai request id', {
        reason: 'provider_request_not_persisted',
      });
    }
    return providerRequestId;
  } catch (error) {
    await failAiTask(env, taskId, error.reason || 'fal_submit_failed', {
      clearProvider: true,
    });
    throw error.reason
      ? error
      : aiProviderError('fal.ai queue submission failed', { detail: error.message });
  }
}

async function fetchFalTaskResult(env, taskId, providerRequestId) {
  const headers = { 'Authorization': `Key ${env.FAL_API_KEY}` };
  let statusResponse;
  try {
    statusResponse = await fetch(
      `${FAL_QUEUE_ENDPOINT}/requests/${encodeURIComponent(providerRequestId)}/status`,
      { headers },
    );
  } catch (error) {
    throw aiProviderError('Unable to check fal.ai task status', {
      reason: 'provider_status_unavailable',
      detail: error.message,
      keepProcessing: true,
    });
  }
  if (!statusResponse.ok) {
    throw aiProviderError('Unable to check fal.ai task status', {
      reason: 'provider_status_unavailable',
      detail: await statusResponse.text(),
      keepProcessing: true,
    });
  }

  const statusData = await statusResponse.json();
  if (statusData?.status === 'IN_QUEUE' || statusData?.status === 'IN_PROGRESS') {
    return { state: 'processing' };
  }
  if (statusData?.status !== 'COMPLETED') {
    throw aiProviderError('fal.ai returned an unknown task status', {
      reason: 'provider_status_invalid',
      detail: statusData,
      keepProcessing: true,
    });
  }
  if (statusData.error) {
    await failAiTask(env, taskId, statusData.error_type || 'fal_failed', {
      clearProvider: true,
    });
    throw aiProviderError('fal.ai task failed', {
      reason: 'fal_failed',
      detail: statusData.error,
    });
  }

  let resultResponse;
  try {
    resultResponse = await fetch(
      `${FAL_QUEUE_ENDPOINT}/requests/${encodeURIComponent(providerRequestId)}`,
      { headers },
    );
  } catch (error) {
    throw aiProviderError('Unable to retrieve fal.ai task result', {
      reason: 'provider_result_unavailable',
      detail: error.message,
      keepProcessing: true,
    });
  }
  if (!resultResponse.ok) {
    throw aiProviderError('Unable to retrieve fal.ai task result', {
      reason: 'provider_result_unavailable',
      detail: await resultResponse.text(),
      keepProcessing: true,
    });
  }

  const resultData = await resultResponse.json();
  const resultUrl = resultData?.image?.url;
  if (!resultUrl) {
    await failAiTask(env, taskId, 'missing_result', { clearProvider: true });
    throw aiProviderError('fal.ai result did not include an image', {
      reason: 'missing_result',
      detail: resultData,
    });
  }

  let imageResponse;
  try {
    imageResponse = await fetch(resultUrl);
  } catch (error) {
    throw aiProviderError('Unable to download fal.ai result image', {
      reason: 'result_download_failed',
      detail: error.message,
      keepProcessing: true,
    });
  }
  if (!imageResponse.ok) {
    const retryable = imageResponse.status >= 500;
    if (!retryable) {
      await failAiTask(env, taskId, 'result_expired', { clearProvider: true });
    }
    throw aiProviderError('Unable to download fal.ai result image', {
      reason: retryable ? 'result_download_failed' : 'result_expired',
      detail: `HTTP ${imageResponse.status}`,
      status: retryable ? 502 : 410,
      keepProcessing: retryable,
    });
  }

  return { state: 'ready', resultUrl, imageResponse };
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
        `INSERT INTO guest_ai_charges (task_id, device_hash, ip_hash)
         VALUES (?, ?, ?)`
      ).bind(taskId, guest.deviceHash, guest.ipHash),
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
    const existing = await env.DB.prepare(
      'SELECT task_id FROM guest_ai_charges WHERE task_id = ?'
    ).bind(taskId).first();
    return Boolean(existing);
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

async function calculateOrderBenefits(env, {
  orderId,
  userId,
  baseCredits,
  payerId = null,
  relationshipOverride,
}) {
  const [priorPurchase, relationship] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM orders
       WHERE user_id = ? AND status = 'completed' AND id <> ?
       ORDER BY completed_at, created_at, id
       LIMIT 1`
    ).bind(userId, orderId).first(),
    relationshipOverride === undefined
      ? env.DB.prepare(
        `SELECT id, referrer_user_id, referred_user_id, referral_code,
                status, risk_status, first_paid_order_id
         FROM referrals
         WHERE referred_user_id = ?`
      ).bind(userId).first()
      : Promise.resolve(relationshipOverride),
  ]);
  const isFirstPurchase = !priorPurchase;
  if (!relationship || relationship.status === 'rejected' || relationship.risk_status === 'rejected') {
    return {
      isFirstPurchase,
      relationship: null,
      promotionCredits: 0,
      referralCredits: 0,
      referrerUserId: null,
      rejectRelationship: false,
    };
  }

  const [referrerPurchase, payerConflict] = await Promise.all([
    env.DB.prepare(
      `SELECT id FROM orders
       WHERE user_id = ? AND status = 'completed' AND base_credits > 0
       LIMIT 1`
    ).bind(relationship.referrer_user_id).first(),
    payerId
      ? env.DB.prepare(
        `SELECT id FROM orders
         WHERE user_id = ? AND status = 'completed' AND paypal_payer_id = ?
         LIMIT 1`
      ).bind(relationship.referrer_user_id, payerId).first()
      : Promise.resolve(null),
  ]);
  const rewardEligible = Boolean(referrerPurchase) && !payerConflict;
  const referralRate = isFirstPurchase ? 15 : 10;

  return {
    isFirstPurchase,
    relationship,
    promotionCredits: rewardEligible && isFirstPurchase && baseCredits >= 300 ? 30 : 0,
    referralCredits: rewardEligible
      ? Math.floor((Number(baseCredits) * referralRate) / 100)
      : 0,
    referrerUserId: relationship.referrer_user_id,
    rejectRelationship: Boolean(payerConflict),
  };
}

async function calculateVoucherReferralRisk(env, {
  relationship,
  guest,
  hasReward,
}) {
  if (!relationship || !hasReward) {
    return { holdForReview: false, score: 0, reasons: [] };
  }

  const [owner, recentRedemptions] = await Promise.all([
    env.DB.prepare(
      `SELECT owner_ip_hash, owner_device_hash
       FROM referral_codes
       WHERE code = ? AND user_id = ?`
    ).bind(relationship.referral_code, relationship.referrer_user_id).first(),
    env.DB.prepare(
      `SELECT COUNT(*) AS count
       FROM orders
       WHERE payment_method = 'voucher' AND status = 'completed'
         AND referrer_user_id_snapshot = ?
         AND completed_at > unixepoch() - 3600`
    ).bind(relationship.referrer_user_id).first('count'),
  ]);

  let score = 0;
  const reasons = [];
  if (owner?.owner_device_hash && owner.owner_device_hash === guest.deviceHash) {
    score += 80;
    reasons.push('same_device');
  }
  const boundRecently = !relationship.bound_at
    || Number(relationship.bound_at) > Math.floor(Date.now() / 1000) - 86400;
  if (owner?.owner_ip_hash && owner.owner_ip_hash === guest.ipHash && boundRecently) {
    score += 65;
    reasons.push('same_ip_recent_binding');
  }
  if (Number(recentRedemptions || 0) >= 3) {
    score += 60;
    reasons.push('referrer_voucher_burst');
  }

  return {
    holdForReview: score >= 60,
    score: Math.min(score, 100),
    reasons,
  };
}

async function resolveVoucherReferral(env, {
  userId,
  referralCode,
  guest,
}) {
  const existing = await env.DB.prepare(
    `SELECT id, referrer_user_id, referred_user_id, referral_code,
            status, risk_status, first_paid_order_id, bound_at
     FROM referrals WHERE referred_user_id = ?`
  ).bind(userId).first();
  if (!referralCode) return { relationship: existing || null, insert: null };

  if (existing) {
    if (existing.referral_code !== referralCode) {
      return { error: 'A different referrer is already bound to this account.' };
    }
    return { relationship: existing, insert: null };
  }

  const priorPurchase = await env.DB.prepare(
    `SELECT id FROM orders
     WHERE user_id = ? AND status = 'completed' AND base_credits > 0
     LIMIT 1`
  ).bind(userId).first();
  if (priorPurchase) {
    return { error: 'A referrer cannot be added after the first top-up.' };
  }

  const referrer = await env.DB.prepare(
    `SELECT rc.code, rc.user_id
     FROM referral_codes rc
     WHERE rc.code = ? AND rc.status = 'active'`
  ).bind(referralCode).first();
  if (!referrer || referrer.user_id === userId) {
    return { error: 'Referral code is invalid or not eligible.' };
  }
  const referrerPurchase = await env.DB.prepare(
    `SELECT id FROM orders
     WHERE user_id = ? AND status = 'completed' AND base_credits > 0
     LIMIT 1`
  ).bind(referrer.user_id).first();
  if (!referrerPurchase) {
    return { error: 'Referral code is invalid or not eligible.' };
  }

  const relationship = {
    id: crypto.randomUUID(),
    referrer_user_id: referrer.user_id,
    referred_user_id: userId,
    referral_code: referrer.code,
    status: 'bound',
    risk_status: 'normal',
    first_paid_order_id: null,
    bound_at: null,
  };
  return {
    relationship,
    insert: {
      ...relationship,
      ipHash: guest.ipHash,
      deviceHash: guest.deviceHash,
    },
  };
}

function orderBenefitStatements(env, {
  orderId,
  userId,
  benefits,
  review = null,
}) {
  const statements = [];
  const referrerSnapshot = benefits.relationship?.referrer_user_id || null;
  statements.push(
    env.DB.prepare(
      `UPDATE orders
       SET bonus_credits = ?, referral_processed_at = unixepoch(),
           is_first_qualified_purchase = ?, referrer_user_id_snapshot = ?
       WHERE id = ? AND user_id = ? AND status = 'completed'`
    ).bind(
      0,
      benefits.isFirstPurchase ? 1 : 0,
      referrerSnapshot,
      orderId,
      userId,
    ),
  );

  if (benefits.relationship) {
    if (review?.holdForReview) {
      statements.push(
        env.DB.prepare(
          `UPDATE referrals
           SET risk_status = 'review',
               first_paid_order_id = COALESCE(first_paid_order_id, ?),
               first_paid_at = COALESCE(first_paid_at, unixepoch())
           WHERE id = ?`
        ).bind(orderId, benefits.relationship.id),
        env.DB.prepare(
          `INSERT INTO referral_reward_reviews
           (id, order_id, relationship_id, referrer_user_id, referred_user_id,
            pending_promotion_credits, pending_referral_credits,
            risk_score, risk_reasons_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          `review:${orderId}`,
          orderId,
          benefits.relationship.id,
          benefits.referrerUserId,
          userId,
          benefits.promotionCredits,
          benefits.referralCredits,
          review.score,
          JSON.stringify(review.reasons),
        ),
      );
      return statements;
    }
    if (benefits.rejectRelationship) {
      statements.push(
        env.DB.prepare(
          `UPDATE referrals
           SET status = 'rejected', risk_status = 'rejected',
               first_paid_order_id = COALESCE(first_paid_order_id, ?),
               first_paid_at = COALESCE(first_paid_at, unixepoch())
           WHERE id = ?`
        ).bind(orderId, benefits.relationship.id),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `UPDATE referrals
           SET first_paid_order_id = COALESCE(first_paid_order_id, ?),
               first_paid_at = COALESCE(first_paid_at, unixepoch())
           WHERE id = ?`
        ).bind(orderId, benefits.relationship.id),
      );
      if (benefits.promotionCredits > 0 || benefits.referralCredits > 0) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO referral_reward_holds
             (id, order_id, relationship_id, referrer_user_id, referred_user_id,
              pending_promotion_credits, pending_referral_credits,
              source, release_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'automatic',
                     unixepoch() + ?)`
          ).bind(
            `hold:${orderId}`,
            orderId,
            benefits.relationship.id,
            benefits.referrerUserId,
            userId,
            benefits.promotionCredits,
            benefits.referralCredits,
            REFERRAL_OBSERVATION_SECONDS,
          ),
        );
        return statements;
      }
    }
  }

  if (benefits.promotionCredits > 0) {
    const grantId = `first-purchase:${orderId}:invitee`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_grants
         (id, user_id, credit_type, granted_credits, remaining_credits,
          order_id, related_user_id, idempotency_key)
         VALUES (?, ?, 'promotion', ?, ?, ?, ?, ?)`
      ).bind(
        grantId,
        userId,
        benefits.promotionCredits,
        benefits.promotionCredits,
        orderId,
        benefits.referrerUserId,
        grantId,
      ),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id,
          related_user_id, idempotency_key)
         VALUES (?, ?, ?, 'promotion', 'first_purchase_bonus', ?, ?, ?, ?)`
      ).bind(
        grantId,
        userId,
        benefits.promotionCredits,
        grantId,
        orderId,
        benefits.referrerUserId,
        grantId,
      ),
      env.DB.prepare(
        'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?'
      ).bind(benefits.promotionCredits, userId),
    );
  }

  if (benefits.referralCredits > 0) {
    const prefix = benefits.isFirstPurchase ? 'first-referral' : 'repeat-referral';
    const reason = benefits.isFirstPurchase
      ? 'referral_first_purchase'
      : 'referral_repeat_purchase';
    const grantId = `${prefix}:${orderId}:referrer`;
    statements.push(
      env.DB.prepare(
        `INSERT INTO credit_grants
         (id, user_id, credit_type, granted_credits, remaining_credits,
          order_id, related_user_id, expires_at, idempotency_key)
         VALUES (?, ?, 'referral', ?, ?, ?, ?, unixepoch() + ?, ?)`
      ).bind(
        grantId,
        benefits.referrerUserId,
        benefits.referralCredits,
        benefits.referralCredits,
        orderId,
        userId,
        REFERRAL_REWARD_TTL_SECONDS,
        grantId,
      ),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id,
          related_user_id, idempotency_key)
         VALUES (?, ?, ?, 'referral', ?, ?, ?, ?, ?)`
      ).bind(
        grantId,
        benefits.referrerUserId,
        benefits.referralCredits,
        reason,
        grantId,
        orderId,
        userId,
        grantId,
      ),
      env.DB.prepare(
        'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?'
      ).bind(benefits.referralCredits, benefits.referrerUserId),
    );
  }

  return statements;
}

function paidCreditStatements(env, {
  orderId,
  userId,
  baseCredits,
  grantId,
  reason,
}) {
  return [
    env.DB.prepare(
      `INSERT INTO credit_grants
       (id, user_id, credit_type, granted_credits, remaining_credits,
        order_id, idempotency_key)
       VALUES (?, ?, 'paid', ?, ?, ?, ?)`
    ).bind(grantId, userId, baseCredits, baseCredits, orderId, grantId),
    env.DB.prepare(
      `INSERT INTO credit_ledger
       (id, user_id, delta, balance_type, reason, grant_id, order_id,
        idempotency_key)
       VALUES (?, ?, ?, 'paid', ?, ?, ?, ?)`
    ).bind(grantId, userId, baseCredits, reason, grantId, orderId, grantId),
    env.DB.prepare(
      'UPDATE user_credits SET credits = credits + ? WHERE user_id = ?'
    ).bind(baseCredits, userId),
  ];
}

async function releaseDueRewardHolds(env, limit = 50) {
  const due = await env.DB.prepare(
    `SELECT h.*, o.is_first_qualified_purchase
     FROM referral_reward_holds h
     JOIN orders o ON o.id = h.order_id
     JOIN referrals r ON r.id = h.relationship_id
     WHERE h.status = 'pending' AND h.release_at <= unixepoch()
       AND o.status = 'completed' AND r.risk_status = 'normal'
     ORDER BY h.release_at, h.id
     LIMIT ?`
  ).bind(limit).all();
  let released = 0;

  for (const hold of due.results || []) {
    const statements = [
      env.DB.prepare(
        `UPDATE referral_reward_holds
         SET status = 'released', released_at = unixepoch()
         WHERE id = ? AND status = 'pending' AND release_at <= unixepoch()`
      ).bind(hold.id),
      env.DB.prepare(
        `UPDATE orders SET bonus_credits = ?
         WHERE id = ? AND status = 'completed'
           AND EXISTS (
             SELECT 1 FROM referral_reward_holds
             WHERE id = ? AND status = 'released'
           )`
      ).bind(hold.pending_promotion_credits, hold.order_id, hold.id),
      env.DB.prepare(
        `UPDATE referrals
         SET status = CASE WHEN ? > 0 THEN 'qualified' ELSE status END
         WHERE id = ? AND risk_status = 'normal'
           AND EXISTS (
             SELECT 1 FROM referral_reward_holds
             WHERE id = ? AND status = 'released'
           )`
      ).bind(hold.pending_referral_credits, hold.relationship_id, hold.id),
    ];

    if (Number(hold.pending_promotion_credits) > 0) {
      const promotionId = `first-purchase:${hold.order_id}:invitee`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO credit_grants
           (id, user_id, credit_type, granted_credits, remaining_credits,
            order_id, related_user_id, idempotency_key)
           SELECT ?, ?, 'promotion', ?, ?, ?, ?, ?
           FROM referral_reward_holds
           WHERE id = ? AND status = 'released'`
        ).bind(
          promotionId, hold.referred_user_id,
          hold.pending_promotion_credits, hold.pending_promotion_credits,
          hold.order_id, hold.referrer_user_id, promotionId, hold.id,
        ),
        env.DB.prepare(
          `INSERT INTO credit_ledger
           (id, user_id, delta, balance_type, reason, grant_id, order_id,
            related_user_id, idempotency_key)
           SELECT ?, ?, ?, 'promotion', 'first_purchase_bonus', ?, ?, ?, ?
           FROM referral_reward_holds
           WHERE id = ? AND status = 'released'`
        ).bind(
          promotionId, hold.referred_user_id,
          hold.pending_promotion_credits, promotionId, hold.order_id,
          hold.referrer_user_id, promotionId, hold.id,
        ),
        env.DB.prepare(
          `UPDATE user_credits SET credits = credits + ?
           WHERE user_id = ? AND EXISTS (
             SELECT 1 FROM referral_reward_holds
             WHERE id = ? AND status = 'released'
           )`
        ).bind(hold.pending_promotion_credits, hold.referred_user_id, hold.id),
      );
    }

    if (Number(hold.pending_referral_credits) > 0) {
      const prefix = Number(hold.is_first_qualified_purchase) === 1
        ? 'first-referral'
        : 'repeat-referral';
      const reason = Number(hold.is_first_qualified_purchase) === 1
        ? 'referral_first_purchase'
        : 'referral_repeat_purchase';
      const referralId = `${prefix}:${hold.order_id}:referrer`;
      statements.push(
        env.DB.prepare(
          `INSERT INTO credit_grants
           (id, user_id, credit_type, granted_credits, remaining_credits,
            order_id, related_user_id, expires_at, idempotency_key)
           SELECT ?, ?, 'referral', ?, ?, ?, ?, unixepoch() + ?, ?
           FROM referral_reward_holds
           WHERE id = ? AND status = 'released'`
        ).bind(
          referralId, hold.referrer_user_id,
          hold.pending_referral_credits, hold.pending_referral_credits,
          hold.order_id, hold.referred_user_id,
          REFERRAL_REWARD_TTL_SECONDS, referralId, hold.id,
        ),
        env.DB.prepare(
          `INSERT INTO credit_ledger
           (id, user_id, delta, balance_type, reason, grant_id, order_id,
            related_user_id, idempotency_key)
           SELECT ?, ?, ?, 'referral', ?, ?, ?, ?, ?
           FROM referral_reward_holds
           WHERE id = ? AND status = 'released'`
        ).bind(
          referralId, hold.referrer_user_id,
          hold.pending_referral_credits, reason, referralId,
          hold.order_id, hold.referred_user_id, referralId, hold.id,
        ),
        env.DB.prepare(
          `UPDATE user_credits SET credits = credits + ?
           WHERE user_id = ? AND EXISTS (
             SELECT 1 FROM referral_reward_holds
             WHERE id = ? AND status = 'released'
           )`
        ).bind(hold.pending_referral_credits, hold.referrer_user_id, hold.id),
      );
    }

    try {
      await env.DB.batch(statements);
      released += 1;
    } catch (error) {
      const current = await env.DB.prepare(
        'SELECT status FROM referral_reward_holds WHERE id = ?'
      ).bind(hold.id).first('status');
      if (current !== 'released') throw error;
    }
  }
  return released;
}

function analyticsMode(env) {
  const mode = String(env.ANALYTICS_MODE || 'off').toLowerCase();
  return ['off', 'admin_only', 'public'].includes(mode) ? mode : 'off';
}

function analyticsOriginAllowed(request) {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return false;
  const origin = request.headers.get('Origin');
  return origin === 'https://www.shopbgremover.com'
    || origin === 'https://shopbgremover.com'
    || origin === 'http://localhost'
    || /^http:\/\/localhost:\d+$/.test(origin || '')
    || /^http:\/\/127\.0\.0\.1:\d+$/.test(origin || '');
}

function analyticsToken(value, maxLength, pattern = /[^a-zA-Z0-9._:/-]/g) {
  return String(value || '').trim().replace(pattern, '').slice(0, maxLength);
}

function analyticsOptionalInteger(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) return null;
  return number;
}

async function analyticsHash(env, kind, value) {
  return sha256Hex(`${env.JWT_SECRET}:analytics:${kind}:${value}`);
}

async function resolveAnalyticsAudience(env, user) {
  if (!user?.sub) {
    return {
      actorType: 'guest',
      accountHash: '',
      audienceType: 'anonymous',
    };
  }

  const accountHash = await analyticsHash(env, 'account', user.sub);
  const isInternal = Boolean(
    user.email && getAdminEmails(env).has(user.email.toLowerCase()),
  );
  const [completedRecharge] = await Promise.all([
    isInternal
      ? Promise.resolve(null)
      : env.DB.prepare(
        `SELECT 1 AS found
         FROM orders
         WHERE user_id = ?
           AND status = 'completed'
           AND completed_at IS NOT NULL
           AND payment_method IN ('paypal', 'voucher')
         LIMIT 1`
      ).bind(user.sub).first(),
    env.DB.prepare(
      `UPDATE users
       SET analytics_hash = ?
       WHERE id = ? AND (analytics_hash IS NULL OR analytics_hash = '')`
    ).bind(accountHash, user.sub).run(),
  ]);

  return {
    actorType: isInternal ? 'admin' : 'user',
    accountHash,
    audienceType: isInternal
      ? 'internal'
      : completedRecharge
        ? 'recharged'
        : 'registered',
  };
}

async function acceptAnalyticsRate(env, request, eventCount, now) {
  const rawIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const ipHash = await analyticsHash(env, 'rate', rawIp);
  const windowStart = Math.floor(now / ANALYTICS_RATE_WINDOW_SECONDS)
    * ANALYTICS_RATE_WINDOW_SECONDS;
  await env.DB.prepare(
    `INSERT INTO analytics_rate_limits
     (ip_hash, window_start, event_count, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(ip_hash, window_start) DO UPDATE SET
       event_count = analytics_rate_limits.event_count + excluded.event_count,
       updated_at = excluded.updated_at`
  ).bind(ipHash, windowStart, eventCount, now).run();
  const count = await env.DB.prepare(
    `SELECT event_count FROM analytics_rate_limits
     WHERE ip_hash = ? AND window_start = ?`
  ).bind(ipHash, windowStart).first('event_count');
  return Number(count || 0) <= ANALYTICS_RATE_EVENT_LIMIT;
}

async function storeAnalyticsBatch(env, request, payload) {
  const events = Array.isArray(payload?.events) ? payload.events : null;
  if (
    !events
    || events.length < 1
    || events.length > ANALYTICS_BATCH_LIMIT
  ) {
    return { error: 'Analytics batches must contain 1–20 events.', status: 400 };
  }

  const visitorId = analyticsToken(payload.visitor_id, 64);
  const sessionId = analyticsToken(payload.session_id, 64);
  if (!visitorId || !sessionId) {
    return { error: 'Anonymous visitor and session identifiers are required.', status: 400 };
  }
  if (events.some((event) => !ANALYTICS_EVENTS.has(String(event?.event_name || '')))) {
    return { error: 'Unsupported analytics event.', status: 400 };
  }

  const now = Math.floor(Date.now() / 1000);
  if (!await acceptAnalyticsRate(env, request, events.length, now)) {
    return { error: 'Analytics request was not accepted.', status: 429 };
  }

  const [visitorHash, sessionHash, user] = await Promise.all([
    analyticsHash(env, 'visitor', visitorId),
    analyticsHash(env, 'session', sessionId),
    getUser(request, env),
  ]);
  const {
    actorType,
    accountHash,
    audienceType,
  } = await resolveAnalyticsAudience(env, user);
  const country = analyticsToken(
    request.headers.get('CF-IPCountry') || '',
    2,
    /[^a-zA-Z]/g,
  ).toUpperCase();
  const statements = [];

  for (const event of events) {
    const eventId = analyticsToken(event.event_id, 64);
    const toolId = analyticsToken(event.tool_id, 24);
    if (!eventId || !ANALYTICS_TOOLS.has(toolId)) {
      return { error: 'Invalid analytics event identifier or tool.', status: 400 };
    }
    const id = await analyticsHash(env, 'event', eventId);
    const deviceType = ['desktop', 'tablet', 'mobile'].includes(event.device_type)
      ? event.device_type
      : '';
    const sizeBucket = ['<500KB', '500KB-2MB', '2-5MB', '5-10MB', '10MB+']
      .includes(event.size_bucket)
      ? event.size_bucket
      : '';
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO analytics_events
         (id, visitor_hash, session_hash, event_name, tool_id, page_group,
          actor_type, account_hash, audience_type, device_type, language,
          country, source, campaign,
          file_count, size_bucket, duration_ms, status_code, error_code,
          created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        visitorHash,
        sessionHash,
        event.event_name,
        toolId,
        analyticsToken(event.page_group, 80),
        actorType,
        accountHash,
        audienceType,
        deviceType,
        analyticsToken(event.language, 16, /[^a-zA-Z-]/g),
        country,
        analyticsToken(
          String(event.source || '').toLowerCase(),
          120,
          /[^a-z0-9.-]/g,
        ),
        analyticsToken(
          String(event.campaign || '').toLowerCase(),
          80,
          /[^a-z0-9._-]/g,
        ),
        analyticsOptionalInteger(event.file_count, 0, 50),
        sizeBucket,
        analyticsOptionalInteger(event.duration_ms, 0, 3600000),
        analyticsOptionalInteger(event.status_code, 100, 599),
        analyticsToken(
          String(event.error_code || '').toLowerCase(),
          80,
          /[^a-z0-9._-]/g,
        ),
        now,
      ),
    );
  }

  const results = await env.DB.batch(statements);
  return {
    accepted: results.reduce(
      (total, result) => total + Number(result.meta?.changes || 0),
      0,
    ),
  };
}

function analyticsDayLabels(days) {
  const labels = [];
  const shanghaiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(shanghaiNow);
    day.setUTCDate(day.getUTCDate() - offset);
    labels.push(day.toISOString().slice(0, 10));
  }
  return labels;
}

function analyticsRate(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

function analyticsDuration(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

async function getAnalyticsOverview(env, days) {
  const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const [
    summary,
    trendRows,
    toolRows,
    sourceRows,
    deviceRows,
    countryRows,
    languageRows,
    activeAccountRows,
    inpaintService,
    removeBgService,
    inpaintP95,
    removeBgP95,
    errorRows,
    commerce,
    dataStartedAt,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(DISTINCT CASE
           WHEN audience_type = 'anonymous' THEN visitor_hash
         END) AS anonymous,
         COUNT(DISTINCT session_hash) AS sessions,
         COUNT(DISTINCT CASE WHEN event_name = 'file_selected' THEN session_hash END) AS selected,
         COUNT(DISTINCT CASE WHEN event_name = 'tool_started' THEN session_hash END) AS starts,
         COUNT(DISTINCT CASE WHEN event_name = 'result_ready' THEN session_hash END) AS completed,
         COUNT(DISTINCT CASE WHEN event_name = 'result_downloaded' THEN session_hash END) AS downloads
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')`
    ).bind(cutoff).first(),
    env.DB.prepare(
      `SELECT
         strftime('%Y-%m-%d', created_at, 'unixepoch', '+8 hours') AS day,
         COUNT(DISTINCT CASE
           WHEN audience_type = 'anonymous' THEN visitor_hash
         END) AS anonymous,
         COUNT(DISTINCT CASE
           WHEN audience_type = 'registered' AND account_hash != '' THEN account_hash
         END) AS registered,
         COUNT(DISTINCT CASE
           WHEN audience_type = 'recharged' AND account_hash != '' THEN account_hash
         END) AS recharged,
         COUNT(DISTINCT session_hash) AS sessions
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
       GROUP BY day
       ORDER BY day`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT
         tool_id,
         COUNT(DISTINCT CASE WHEN event_name = 'tool_open' THEN session_hash END) AS opens,
         COUNT(DISTINCT CASE WHEN event_name = 'tool_started' THEN session_hash END) AS starts,
         COUNT(DISTINCT CASE WHEN event_name = 'result_ready' THEN session_hash END) AS completed,
         COUNT(DISTINCT CASE WHEN event_name = 'result_downloaded' THEN session_hash END) AS downloads,
         AVG(CASE WHEN event_name = 'result_ready' THEN duration_ms END) AS avg_duration_ms
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
         AND tool_id NOT IN ('', 'workspace', 'pricing')
       GROUP BY tool_id
       ORDER BY starts DESC, opens DESC`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT source AS label, COUNT(DISTINCT session_hash) AS sessions
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
         AND event_name = 'page_view' AND source != ''
       GROUP BY source ORDER BY sessions DESC LIMIT 12`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT device_type AS label, COUNT(DISTINCT session_hash) AS sessions
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
         AND event_name = 'page_view' AND device_type != ''
       GROUP BY device_type ORDER BY sessions DESC`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT country AS label, COUNT(DISTINCT session_hash) AS sessions
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
         AND event_name = 'page_view' AND country != ''
       GROUP BY country ORDER BY sessions DESC LIMIT 12`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT language AS label, COUNT(DISTINCT session_hash) AS sessions
       FROM analytics_events
       WHERE created_at >= ? AND audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')
         AND event_name = 'page_view' AND language != ''
       GROUP BY language ORDER BY sessions DESC`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `WITH activity AS (
         SELECT
           account_hash,
           MAX(created_at) AS last_active_at,
           COUNT(DISTINCT session_hash) AS sessions,
           COUNT(DISTINCT CASE
             WHEN event_name = 'tool_started' THEN session_hash
           END) AS starts,
           COUNT(DISTINCT CASE
             WHEN event_name = 'result_downloaded' THEN session_hash
           END) AS downloads
         FROM analytics_events
         WHERE created_at >= ?
           AND audience_type IN ('registered', 'recharged')
           AND account_hash != ''
         GROUP BY account_hash
       ),
       recharges AS (
         SELECT
           user_id,
           COUNT(*) AS recharge_count,
           MAX(completed_at) AS last_recharge_at
         FROM orders
         WHERE status = 'completed'
           AND completed_at IS NOT NULL
           AND payment_method IN ('paypal', 'voucher')
         GROUP BY user_id
       )
       SELECT
         u.email,
         u.created_at AS account_created_at,
         activity.last_active_at,
         activity.sessions,
         activity.starts,
         activity.downloads,
         COALESCE(recharges.recharge_count, 0) AS recharge_count,
         recharges.last_recharge_at,
         COALESCE(user_credits.credits, 0) AS credits,
         SUM(CASE
           WHEN COALESCE(recharges.recharge_count, 0) = 0 THEN 1 ELSE 0
         END) OVER () AS registered_total,
         SUM(CASE
           WHEN COALESCE(recharges.recharge_count, 0) > 0 THEN 1 ELSE 0
         END) OVER () AS recharged_total
       FROM activity
       JOIN users u ON u.analytics_hash = activity.account_hash
       LEFT JOIN user_credits ON user_credits.user_id = u.id
       LEFT JOIN recharges ON recharges.user_id = u.id
       ORDER BY activity.last_active_at DESC
       LIMIT 200`
    ).bind(cutoff).all(),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS started,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
         AVG(CASE
           WHEN status = 'succeeded' AND completed_at IS NOT NULL AND started_at IS NOT NULL
           THEN (completed_at - started_at) * 1000
         END) AS avg_duration_ms
       FROM inpaint_tasks
       WHERE created_at >= ?`
    ).bind(cutoff).first(),
    env.DB.prepare(
      `SELECT
         COUNT(*) AS started,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
         AVG(CASE
           WHEN status = 'succeeded' AND completed_at IS NOT NULL
           THEN (completed_at - created_at) * 1000
         END) AS avg_duration_ms
       FROM ai_tasks
       WHERE created_at >= ?`
    ).bind(cutoff).first(),
    env.DB.prepare(
      `WITH ranked AS (
         SELECT
           (completed_at - started_at) * 1000 AS duration_ms,
           ROW_NUMBER() OVER (ORDER BY completed_at - started_at) AS row_number,
           COUNT(*) OVER () AS total
         FROM inpaint_tasks
         WHERE created_at >= ? AND status = 'succeeded'
           AND completed_at IS NOT NULL AND started_at IS NOT NULL
       )
       SELECT duration_ms
       FROM ranked
       WHERE row_number >= CAST((total * 95 + 99) / 100 AS INTEGER)
       ORDER BY row_number LIMIT 1`
    ).bind(cutoff).first('duration_ms'),
    env.DB.prepare(
      `WITH ranked AS (
         SELECT
           (completed_at - created_at) * 1000 AS duration_ms,
           ROW_NUMBER() OVER (ORDER BY completed_at - created_at) AS row_number,
           COUNT(*) OVER () AS total
         FROM ai_tasks
         WHERE created_at >= ? AND status = 'succeeded'
           AND completed_at IS NOT NULL
       )
       SELECT duration_ms
       FROM ranked
       WHERE row_number >= CAST((total * 95 + 99) / 100 AS INTEGER)
       ORDER BY row_number LIMIT 1`
    ).bind(cutoff).first('duration_ms'),
    env.DB.prepare(
      `SELECT tool_id, error, COUNT(*) AS count
       FROM (
         SELECT 'inpaint' AS tool_id, COALESCE(NULLIF(error_code, ''), 'unknown') AS error
         FROM inpaint_tasks WHERE created_at >= ? AND status = 'failed'
         UNION ALL
         SELECT 'remove_bg' AS tool_id, COALESCE(NULLIF(error_code, ''), 'unknown') AS error
         FROM ai_tasks WHERE created_at >= ? AND status = 'failed'
       )
       GROUP BY tool_id, error
       ORDER BY count DESC LIMIT 15`
    ).bind(cutoff, cutoff).all(),
    env.DB.prepare(
      `SELECT
         (SELECT COUNT(DISTINCT session_hash) FROM analytics_events
          WHERE created_at >= ? AND audience_type != 'internal'
            AND (audience_type = 'anonymous' OR account_hash != '')
            AND event_name = 'pricing_view') AS pricing_views,
         (SELECT COUNT(DISTINCT session_hash) FROM analytics_events
          WHERE created_at >= ? AND audience_type != 'internal'
            AND (audience_type = 'anonymous' OR account_hash != '')
            AND event_name = 'xianyu_clicked') AS xianyu_clicks,
         (SELECT COUNT(*) FROM orders
          WHERE created_at >= ? AND payment_method = 'paypal') AS paypal_orders,
         (SELECT COUNT(*) FROM orders
          WHERE completed_at >= ? AND status = 'completed'
            AND payment_method = 'paypal') AS paypal_completed,
         (SELECT COUNT(*) FROM voucher_cards
          WHERE redeemed_at >= ? AND status = 'redeemed') AS vouchers_redeemed`
    ).bind(cutoff, cutoff, cutoff, cutoff, cutoff).first(),
    env.DB.prepare(
      `SELECT MIN(created_at) AS created_at
       FROM analytics_events
       WHERE audience_type != 'internal'
         AND (audience_type = 'anonymous' OR account_hash != '')`
    ).first('created_at'),
  ]);

  const summaryValues = {
    anonymous: Number(summary?.anonymous || 0),
    registered: Number(
      activeAccountRows.results?.[0]?.registered_total || 0,
    ),
    recharged: Number(
      activeAccountRows.results?.[0]?.recharged_total || 0,
    ),
    sessions: Number(summary?.sessions || 0),
    selected: Number(summary?.selected || 0),
    starts: Number(summary?.starts || 0),
    completed: Number(summary?.completed || 0),
    downloads: Number(summary?.downloads || 0),
  };
  summaryValues.visitors = summaryValues.anonymous
    + summaryValues.registered
    + summaryValues.recharged;
  summaryValues.download_rate = analyticsRate(
    summaryValues.downloads,
    summaryValues.starts,
  );

  const byDay = new Map((trendRows.results || []).map((row) => [row.day, row]));
  const trend = analyticsDayLabels(days).map((day) => {
    const row = byDay.get(day) || {};
    return {
      day,
      anonymous: Number(row.anonymous || 0),
      registered: Number(row.registered || 0),
      recharged: Number(row.recharged || 0),
      sessions: Number(row.sessions || 0),
    };
  });

  const inpaint = {
    started: Number(inpaintService?.started || 0),
    succeeded: Number(inpaintService?.succeeded || 0),
    failed: Number(inpaintService?.failed || 0),
    queued: Number(inpaintService?.queued || 0),
    processing: Number(inpaintService?.processing || 0),
    avg_duration_ms: analyticsDuration(inpaintService?.avg_duration_ms),
    p95_duration_ms: analyticsDuration(inpaintP95),
  };
  inpaint.success_rate = analyticsRate(
    inpaint.succeeded,
    inpaint.succeeded + inpaint.failed,
  );
  const removeBg = {
    started: Number(removeBgService?.started || 0),
    succeeded: Number(removeBgService?.succeeded || 0),
    failed: Number(removeBgService?.failed || 0),
    processing: Number(removeBgService?.processing || 0),
    avg_duration_ms: analyticsDuration(removeBgService?.avg_duration_ms),
    p95_duration_ms: analyticsDuration(removeBgP95),
  };
  removeBg.success_rate = analyticsRate(
    removeBg.succeeded,
    removeBg.succeeded + removeBg.failed,
  );

  const tools = (toolRows.results || []).map((tool) => {
    const starts = Number(tool.starts || 0);
    const downloads = Number(tool.downloads || 0);
    const service = tool.tool_id === 'inpaint'
      ? inpaint
      : tool.tool_id === 'remove_bg'
        ? removeBg
        : null;
    return {
      tool_id: tool.tool_id,
      opens: Number(tool.opens || 0),
      starts,
      completed: Number(tool.completed || 0),
      downloads,
      download_rate: analyticsRate(downloads, starts),
      failures: service?.failed || 0,
      avg_duration_ms: service?.avg_duration_ms
        || analyticsDuration(tool.avg_duration_ms),
    };
  });

  return {
    generated_at: Math.floor(Date.now() / 1000),
    days,
    mode: analyticsMode(env),
    retention_days: ANALYTICS_RETENTION_DAYS,
    data_started_at: Number(dataStartedAt || 0),
    summary: summaryValues,
    trend,
    funnel: {
      opened: summaryValues.sessions,
      selected: summaryValues.selected,
      started: summaryValues.starts,
      completed: summaryValues.completed,
      downloaded: summaryValues.downloads,
    },
    tools,
    service: {
      inpaint,
      remove_bg: removeBg,
    },
    sources: sourceRows.results || [],
    devices: deviceRows.results || [],
    countries: countryRows.results || [],
    languages: languageRows.results || [],
    active_accounts: (activeAccountRows.results || []).map((account) => ({
      account: maskEmail(account.email),
      audience_type: Number(account.recharge_count || 0) > 0
        ? 'recharged'
        : 'registered',
      account_created_at: Number(account.account_created_at || 0),
      last_active_at: Number(account.last_active_at || 0),
      sessions: Number(account.sessions || 0),
      starts: Number(account.starts || 0),
      downloads: Number(account.downloads || 0),
      recharge_count: Number(account.recharge_count || 0),
      last_recharge_at: Number(account.last_recharge_at || 0),
      credits: Number(account.credits || 0),
    })),
    errors: errorRows.results || [],
    commerce: {
      pricing_views: Number(commerce?.pricing_views || 0),
      xianyu_clicks: Number(commerce?.xianyu_clicks || 0),
      paypal_orders: Number(commerce?.paypal_orders || 0),
      paypal_completed: Number(commerce?.paypal_completed || 0),
      vouchers_redeemed: Number(commerce?.vouchers_redeemed || 0),
    },
  };
}

async function cleanupAnalytics(env) {
  const retentionSeconds = ANALYTICS_RETENTION_DAYS * 24 * 60 * 60;
  const [events, limits] = await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM analytics_events WHERE created_at < unixepoch() - ?'
    ).bind(retentionSeconds),
    env.DB.prepare(
      'DELETE FROM analytics_rate_limits WHERE updated_at < unixepoch() - 3600'
    ),
  ]);
  return {
    events: Number(events.meta?.changes || 0),
    rate_limits: Number(limits.meta?.changes || 0),
  };
}

// ── Router ────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
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

    if (url.pathname === '/api/analytics/events' && request.method === 'POST') {
      const mode = analyticsMode(env);
      if (
        mode === 'off'
        || request.headers.get('Sec-GPC') === '1'
        || request.headers.get('DNT') === '1'
      ) {
        return privateJson({ accepted: 0, mode }, 202, origin);
      }
      if (!analyticsOriginAllowed(request)) {
        return privateJson({ error: 'Analytics request was not accepted.' }, 403, origin);
      }
      if (mode === 'admin_only' && !await getAdmin(request, env)) {
        return privateJson({ accepted: 0, mode }, 202, origin);
      }

      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > 32768) {
        return privateJson({ error: 'Analytics payload is too large.' }, 413, origin);
      }
      const rawBody = await request.text();
      if (rawBody.length > 32768) {
        return privateJson({ error: 'Analytics payload is too large.' }, 413, origin);
      }
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return privateJson({ error: 'Invalid analytics JSON.' }, 400, origin);
      }
      const result = await storeAnalyticsBatch(env, request, payload);
      if (result.error) {
        return privateJson({ error: result.error }, result.status, origin);
      }
      return privateJson({ ...result, mode }, 202, origin);
    }

    if (url.pathname === '/api/admin/analytics' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const requestedDays = Number.parseInt(url.searchParams.get('days') || '30', 10);
      if (![1, 7, 30, 90].includes(requestedDays)) {
        return privateJson({ error: 'Invalid analytics date range.' }, 400, origin);
      }
      const overview = await getAnalyticsOverview(env, requestedDays);
      return privateJson({
        admin: { email: admin.email },
        ...overview,
      }, 200, origin);
    }

    const inpaintResponse = await maybeHandleInpaintRequest(request, env, {
      resolveIdentity: resolveInpaintIdentity,
      respond: privateJson,
      origin,
      responseHeaders: cors(origin),
    });
    if (inpaintResponse) return inpaintResponse;

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

    // GET /api/credits/center → private balance, grant, ledger, and order history.
    if (url.pathname === '/api/credits/center' && request.method === 'GET') {
      const user = await getUser(request, env);
      if (!user) return privateJson({ error: 'Unauthorized' }, 401, origin);

      const [credits, grants, ledger, orders] = await Promise.all([
        getCreditSummary(env, user.sub),
        env.DB.prepare(
          `SELECT id, credit_type, granted_credits, remaining_credits, order_id,
                  expires_at, created_at
           FROM credit_grants
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 100`
        ).bind(user.sub).all(),
        env.DB.prepare(
          `SELECT id, delta, balance_type, reason, order_id, task_id,
                  reversal_of, created_at
           FROM credit_ledger
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 100`
        ).bind(user.sub).all(),
        env.DB.prepare(
          `SELECT id, plan, amount, base_credits, bonus_credits, currency,
                  status, payment_method, completed_at, refunded_at, created_at
           FROM orders
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT 50`
        ).bind(user.sub).all(),
      ]);

      return privateJson({
        user: { id: user.sub, email: user.email, name: user.name },
        credits,
        grants: grants.results || [],
        ledger: ledger.results || [],
        orders: orders.results || [],
      }, 200, origin);
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
      const guest = await getGuestIdentity(request);

      const [
        code,
        paidOrder,
        counts,
        rewardTotals,
        pendingRewards,
        rewardHistory,
        invitees,
      ] = await Promise.all([
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
        env.DB.prepare(
          `SELECT
             COALESCE(SUM(granted_credits), 0) AS total_granted,
             COALESCE(SUM(
               CASE
                 WHEN remaining_credits > 0
                   AND (expires_at IS NULL OR expires_at > unixepoch())
                 THEN remaining_credits ELSE 0
               END
             ), 0) AS available_credits,
             COALESCE(SUM(
               CASE
                 WHEN remaining_credits > 0 AND expires_at <= unixepoch()
                 THEN remaining_credits ELSE 0
               END
             ), 0) AS expired_credits,
             MIN(
               CASE
                 WHEN remaining_credits > 0 AND expires_at > unixepoch()
                 THEN expires_at ELSE NULL
               END
             ) AS next_expiry_at,
             (
               SELECT COALESCE(SUM(-delta), 0)
               FROM credit_ledger
               WHERE user_id = ? AND balance_type = 'referral' AND delta < 0
                 AND reason IN ('paypal_refund_referral', 'voucher_dispute_referral')
             ) AS reversed_credits
           FROM credit_grants
           WHERE user_id = ? AND credit_type = 'referral'`
        ).bind(user.sub, user.sub).first(),
        env.DB.prepare(
          `SELECT COALESCE(SUM(pending_referral_credits), 0) AS credits,
                  MIN(release_at) AS next_release_at
           FROM (
             SELECT pending_referral_credits, NULL AS release_at
             FROM referral_reward_reviews
             WHERE referrer_user_id = ? AND status = 'pending'
             UNION ALL
             SELECT pending_referral_credits, release_at
             FROM referral_reward_holds
             WHERE referrer_user_id = ? AND status = 'pending'
           )`
        ).bind(user.sub, user.sub).first(),
        env.DB.prepare(
          `SELECT l.id, l.delta, l.reason, l.order_id, l.created_at,
                  l.reversal_of, g.remaining_credits, g.expires_at,
                  CASE WHEN EXISTS (
                    SELECT 1 FROM credit_ledger reversal
                    WHERE reversal.reversal_of = l.id
                  ) THEN 1 ELSE 0 END AS has_reversal,
                  related.email AS related_email
           FROM credit_ledger l
           LEFT JOIN credit_grants g ON g.id = l.grant_id
           LEFT JOIN users related ON related.id = l.related_user_id
           WHERE l.user_id = ? AND l.balance_type = 'referral'
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT 50`
        ).bind(user.sub).all(),
        env.DB.prepare(
          `SELECT r.status, r.risk_status, r.bound_at, r.first_paid_at,
                  invited.email AS invited_email
           FROM referrals r
           JOIN users invited ON invited.id = r.referred_user_id
           WHERE r.referrer_user_id = ?
           ORDER BY r.bound_at DESC, r.id DESC
           LIMIT 50`
        ).bind(user.sub).all(),
      ]);
      await env.DB.prepare(
        `UPDATE referral_codes
         SET owner_ip_hash = COALESCE(owner_ip_hash, ?),
             owner_device_hash = COALESCE(owner_device_hash, ?),
             fingerprint_updated_at = CASE
               WHEN owner_ip_hash IS NULL OR owner_device_hash IS NULL
               THEN unixepoch() ELSE fingerprint_updated_at
             END
         WHERE user_id = ?`
      ).bind(guest.ipHash, guest.deviceHash, user.sub).run();

      const now = Math.floor(Date.now() / 1000);
      return privateJson({
        code: code.code,
        status: code.status,
        link: `${FRONTEND_URL}/?ref=${code.code}`,
        reward_eligible: Boolean(paidOrder),
        registered_count: Number(counts?.registered_count || 0),
        paid_count: Number(counts?.paid_count || 0),
        review_count: Number(counts?.review_count || 0),
        pending_reward_credits: Number(pendingRewards?.credits || 0),
        next_pending_release_at: pendingRewards?.next_release_at == null
          ? null
          : Number(pendingRewards.next_release_at),
        available_reward_credits: Number(rewardTotals?.available_credits || 0),
        total_reward_credits: Number(rewardTotals?.total_granted || 0),
        reversed_reward_credits: Number(rewardTotals?.reversed_credits || 0),
        expired_reward_credits: Number(rewardTotals?.expired_credits || 0),
        next_reward_expiry_at: rewardTotals?.next_expiry_at == null
          ? null
          : Number(rewardTotals.next_expiry_at),
        reward_release_policy: 'seven_day_observation',
        reward_history: (rewardHistory.results || []).map((entry) => {
          let entryStatus = 'used';
          if (Number(entry.delta) < 0) entryStatus = 'reversal';
          else if (Number(entry.has_reversal) === 1) entryStatus = 'reversed';
          else if (entry.expires_at != null && Number(entry.expires_at) <= now) {
            entryStatus = 'expired';
          } else if (Number(entry.remaining_credits || 0) > 0) {
            entryStatus = 'available';
          }
          return {
            id: entry.id,
            delta: Number(entry.delta),
            reason: entry.reason,
            order_id: entry.order_id,
            created_at: Number(entry.created_at),
            expires_at: entry.expires_at == null ? null : Number(entry.expires_at),
            remaining_credits: Number(entry.remaining_credits || 0),
            related_email: maskEmail(entry.related_email),
            status: entryStatus,
            reversal_of: entry.reversal_of,
          };
        }),
        invitees: (invitees.results || []).map((invitee) => ({
          email: maskEmail(invitee.invited_email),
          status: invitee.status,
          risk_status: invitee.risk_status,
          bound_at: Number(invitee.bound_at),
          first_paid_at: invitee.first_paid_at == null
            ? null
            : Number(invitee.first_paid_at),
        })),
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
        if (reservation.state === 'processing' && !reservation.providerRequestId) {
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
              'X-AI-Reused': 'true',
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

        let providerRequestId = reservation.providerRequestId;
        const started = !providerRequestId;
        if (!providerRequestId) {
          const submission = submitFalTask(env, taskId, image_url);
          ctx.waitUntil(submission.then(() => undefined, () => undefined));
          providerRequestId = await submission;
        }

        const providerResult = await fetchFalTaskResult(env, taskId, providerRequestId);
        if (providerResult.state === 'processing') {
          return json({
            error: 'Task is still processing',
            reason: 'task_processing',
            task_id: taskId,
            started,
          }, 409, origin);
        }

        const { resultUrl, imageResponse } = providerResult;
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

        return new Response(imageResponse.body, {
          headers: {
            'Content-Type': imageResponse.headers.get('Content-Type') || 'image/png',
            'X-Task-ID': taskId,
            'X-AI-Reused': started ? 'false' : 'true',
            ...cors(origin),
          },
        });

      } catch (e) {
        if (activeTaskId && !e.keepProcessing) {
          await failAiTask(env, activeTaskId, e.reason || 'internal_error');
        }
        return json({
          error: '处理失败',
          message: e.message,
          ...(e.reason ? { reason: e.reason } : {}),
          ...(e.detail ? { detail: e.detail } : {}),
        }, e.status || 500, origin);
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

    // GET /api/public/xianyu-purchase → public, non-secret purchase links.
    // Disabled settings never expose retained draft URLs.
    if (url.pathname === '/api/public/xianyu-purchase' && request.method === 'GET') {
      const config = await readXianyuPurchaseConfig(env);
      return privateJson({
        enabled: config.enabled,
        links: config.enabled
          ? {
              default: config.default_url,
              100: config.package_urls[100],
              300: config.package_urls[300],
              1000: config.package_urls[1000],
            }
          : { default: '', 100: '', 300: '', 1000: '' },
      }, 200, origin);
    }

    // GET /api/admin/settings/xianyu → full administrator-owned configuration.
    if (url.pathname === '/api/admin/settings/xianyu' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const row = await env.DB.prepare(
        `SELECT s.value_json, s.updated_at, u.email AS updated_by_email
         FROM site_settings s
         LEFT JOIN users u ON u.id = s.updated_by
         WHERE s.key = ?
         LIMIT 1`
      ).bind(XIANYU_PURCHASE_SETTING_KEY).first();
      return privateJson({
        setting: parseXianyuPurchaseConfig(row?.value_json),
        updated_at: row?.updated_at || null,
        updated_by_email: row?.updated_by_email || null,
      }, 200, origin);
    }

    // POST /api/admin/settings/xianyu → validate, audit, and atomically replace.
    if (url.pathname === '/api/admin/settings/xianyu' && request.method === 'POST') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const body = await request.json().catch(() => null);
      let setting;
      try {
        setting = normalizeXianyuPurchaseConfig(body);
      } catch (error) {
        return privateJson({ error: error.message }, 400, origin);
      }

      const valueJson = JSON.stringify(setting);
      const current = await env.DB.prepare(
        'SELECT value_json FROM site_settings WHERE key = ? LIMIT 1'
      ).bind(XIANYU_PURCHASE_SETTING_KEY).first();
      if (current?.value_json === valueJson) {
        return privateJson({
          ok: true,
          unchanged: true,
          setting,
          updated_at: null,
        }, 200, origin);
      }

      const auditId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO site_setting_audit
           (id, setting_key, previous_value_json, new_value_json, admin_user_id)
           VALUES (?, ?, (
             SELECT value_json FROM site_settings WHERE key = ? LIMIT 1
           ), ?, ?)`
        ).bind(
          auditId,
          XIANYU_PURCHASE_SETTING_KEY,
          XIANYU_PURCHASE_SETTING_KEY,
          valueJson,
          admin.sub,
        ),
        env.DB.prepare(
          `INSERT INTO site_settings (key, value_json, updated_by, updated_at)
           VALUES (?, ?, ?, unixepoch())
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             updated_by = excluded.updated_by,
             updated_at = excluded.updated_at`
        ).bind(XIANYU_PURCHASE_SETTING_KEY, valueJson, admin.sub),
      ]);
      const updatedAt = await env.DB.prepare(
        'SELECT updated_at FROM site_settings WHERE key = ? LIMIT 1'
      ).bind(XIANYU_PURCHASE_SETTING_KEY).first('updated_at');
      return privateJson({
        ok: true,
        unchanged: false,
        setting,
        updated_at: updatedAt,
        updated_by_email: admin.email,
      }, 200, origin);
    }

    // GET /api/admin/overview → read-only billing and credit operations summary.
    if (url.pathname === '/api/admin/overview' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);

      const [
        userTotals,
        orderTotals,
        voucherTotals,
        referralTotals,
        recentOrders,
        recentLedger,
      ] = await Promise.all([
        env.DB.prepare(
          `SELECT COUNT(*) AS users,
                  COALESCE(SUM(credits), 0) AS active_credits,
                  COALESCE(SUM(total_used), 0) AS total_used
           FROM user_credits`
        ).first(),
        env.DB.prepare(
          `SELECT COUNT(*) AS orders,
                  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                  SUM(CASE WHEN refunded_at IS NOT NULL THEN 1 ELSE 0 END) AS refunded
           FROM orders`
        ).first(),
        env.DB.prepare(
          `SELECT COUNT(*) AS cards,
                  SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered,
                  SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
                  SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS voided
           FROM voucher_cards`
        ).first(),
        env.DB.prepare(
          `SELECT
             (SELECT COUNT(*) FROM referrals) AS relationships,
             (SELECT COUNT(*) FROM referral_reward_reviews
              WHERE status = 'pending') AS pending_reviews,
             (SELECT COUNT(*) FROM referral_reward_holds
              WHERE status = 'pending') AS pending_holds`
        ).first(),
        env.DB.prepare(
          `SELECT o.id, o.plan, o.amount, o.base_credits, o.bonus_credits,
                  o.currency, o.status, o.payment_method, o.completed_at,
                  o.refunded_at, o.created_at, u.email
           FROM orders o
           JOIN users u ON u.id = o.user_id
           ORDER BY o.created_at DESC, o.id DESC
           LIMIT 30`
        ).all(),
        env.DB.prepare(
          `SELECT l.id, l.delta, l.balance_type, l.reason, l.order_id,
                  l.created_at, u.email
           FROM credit_ledger l
           JOIN users u ON u.id = l.user_id
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT 30`
        ).all(),
      ]);

      return privateJson({
        admin: { email: admin.email },
        totals: {
          users: Number(userTotals?.users || 0),
          active_credits: Number(userTotals?.active_credits || 0),
          total_used: Number(userTotals?.total_used || 0),
          orders: Number(orderTotals?.orders || 0),
          completed_orders: Number(orderTotals?.completed || 0),
          pending_orders: Number(orderTotals?.pending || 0),
          refunded_orders: Number(orderTotals?.refunded || 0),
          voucher_cards: Number(voucherTotals?.cards || 0),
          delivered_vouchers: Number(voucherTotals?.delivered || 0),
          redeemed_vouchers: Number(voucherTotals?.redeemed || 0),
          voided_vouchers: Number(voucherTotals?.voided || 0),
          referral_relationships: Number(referralTotals?.relationships || 0),
          pending_referral_reviews: Number(referralTotals?.pending_reviews || 0),
          pending_reward_holds: Number(referralTotals?.pending_holds || 0),
        },
        recent_orders: recentOrders.results || [],
        recent_ledger: recentLedger.results || [],
      }, 200, origin);
    }

    // GET /api/admin/referral-reviews → pending voucher reward risk queue.
    if (url.pathname === '/api/admin/referral-reviews' && request.method === 'GET') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status'))
        ? url.searchParams.get('status')
        : 'pending';
      const rows = await env.DB.prepare(
        `SELECT rr.id, rr.order_id, rr.pending_promotion_credits,
                rr.pending_referral_credits, rr.risk_score,
                rr.risk_reasons_json, rr.status, rr.review_note,
                rr.reviewed_at, rr.created_at, o.base_credits,
                referrer.email AS referrer_email,
                referred.email AS referred_email
         FROM referral_reward_reviews rr
         JOIN orders o ON o.id = rr.order_id
         JOIN users referrer ON referrer.id = rr.referrer_user_id
         JOIN users referred ON referred.id = rr.referred_user_id
         WHERE rr.status = ?
         ORDER BY rr.created_at ASC, rr.id ASC
         LIMIT 100`
      ).bind(status).all();
      return privateJson({
        reviews: (rows.results || []).map((row) => ({
          ...row,
          referrer_email: maskEmail(row.referrer_email),
          referred_email: maskEmail(row.referred_email),
          risk_reasons: (() => {
            try { return JSON.parse(row.risk_reasons_json); } catch { return []; }
          })(),
          risk_reasons_json: undefined,
        })),
      }, 200, origin);
    }

    // POST /api/admin/referral-reviews/:id/approve|reject → one final,
    // idempotent decision. Approval releases the held credits atomically.
    const referralReviewMatch = url.pathname.match(
      /^\/api\/admin\/referral-reviews\/([^/]+)\/(approve|reject)$/,
    );
    if (referralReviewMatch && request.method === 'POST') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const reviewId = decodeURIComponent(referralReviewMatch[1]);
      const decision = referralReviewMatch[2];
      const body = await request.json().catch(() => ({}));
      const note = String(body.note || '').trim();
      if (note.length < 3 || note.length > 500) {
        return privateJson({ error: 'Review note must be 3–500 characters.' }, 400, origin);
      }

      const review = await env.DB.prepare(
        `SELECT rr.*, o.is_first_qualified_purchase
         FROM referral_reward_reviews rr
         JOIN orders o ON o.id = rr.order_id
         WHERE rr.id = ?`
      ).bind(reviewId).first();
      if (!review) return privateJson({ error: 'Review not found' }, 404, origin);
      if (review.status !== 'pending') {
        return privateJson({
          ok: true,
          already_reviewed: true,
          status: review.status,
        }, 200, origin);
      }

      const finalStatus = decision === 'approve' ? 'approved' : 'rejected';
      const statements = [
        env.DB.prepare(
          `UPDATE referral_reward_reviews
           SET status = ?, reviewed_by = ?, review_note = ?,
               reviewed_at = unixepoch()
           WHERE id = ? AND status = 'pending'`
        ).bind(finalStatus, admin.sub, note, reviewId),
      ];
      if (decision === 'reject') {
        statements.push(
          env.DB.prepare(
            `UPDATE referrals
             SET status = 'rejected', risk_status = 'rejected'
             WHERE id = ? AND EXISTS (
               SELECT 1 FROM referral_reward_reviews
               WHERE id = ? AND status = 'rejected' AND reviewed_by = ?
             )`
          ).bind(review.relationship_id, reviewId, admin.sub),
        );
      } else {
        statements.push(
          env.DB.prepare(
            `UPDATE referrals
             SET risk_status = 'normal'
             WHERE id = ? AND EXISTS (
               SELECT 1 FROM referral_reward_reviews
               WHERE id = ? AND status = 'approved' AND reviewed_by = ?
             )`
          ).bind(review.relationship_id, reviewId, admin.sub),
          env.DB.prepare(
            `INSERT INTO referral_reward_holds
             (id, order_id, relationship_id, referrer_user_id, referred_user_id,
              pending_promotion_credits, pending_referral_credits,
              source, release_at)
             SELECT ?, order_id, relationship_id, referrer_user_id,
                    referred_user_id, pending_promotion_credits,
                    pending_referral_credits, 'risk_approved',
                    MAX(unixepoch(), (
                      SELECT completed_at + ?
                      FROM orders WHERE id = referral_reward_reviews.order_id
                    ))
             FROM referral_reward_reviews
             WHERE id = ? AND status = 'approved' AND reviewed_by = ?`
          ).bind(
            `hold:${review.order_id}`,
            REFERRAL_OBSERVATION_SECONDS,
            reviewId,
            admin.sub,
          ),
        );
      }

      try {
        await env.DB.batch(statements);
      } catch (error) {
        const concurrent = await env.DB.prepare(
          'SELECT status FROM referral_reward_reviews WHERE id = ?'
        ).bind(reviewId).first();
        if (concurrent?.status !== 'pending') {
          return privateJson({
            ok: true,
            already_reviewed: true,
            status: concurrent.status,
          }, 200, origin);
        }
        throw error;
      }
      const completed = await env.DB.prepare(
        'SELECT status FROM referral_reward_reviews WHERE id = ?'
      ).bind(reviewId).first();
      return privateJson({
        ok: true,
        already_reviewed: completed?.status !== finalStatus,
        status: completed?.status,
      }, 200, origin);
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
        'generated', 'reserved', 'delivered', 'redeemed', 'disputed', 'void', 'expired',
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
        if (status === 'disputed') {
          conditions.push(`vc.dispute_status = 'reversed'`);
        } else {
          conditions.push('vc.status = ?');
          bindings.push(status);
        }
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const statement = env.DB.prepare(
        `SELECT vc.id, vc.batch_id, vc.code_prefix, vc.code_last4,
                vc.base_credits, vc.face_value_minor, vc.currency, vc.status,
                vc.sales_channel, vc.sales_order_ref, vc.sales_note,
                vc.reserved_at, vc.delivered_at, vc.redeemed_at,
                vc.redeem_order_id, vc.dispute_status, vc.disputed_at,
                vc.created_at, u.email AS redeemed_email,
                vd.reason AS dispute_reason
         FROM voucher_cards vc
         LEFT JOIN users u ON u.id = vc.redeemed_by
         LEFT JOIN voucher_disputes vd ON vd.card_id = vc.id
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

    // POST /api/admin/vouchers/:id/dispute-reverse → atomically reverse every
    // paid, promotion, and referral grant created by a redeemed voucher. The
    // original card stays "redeemed" for lifecycle audit; dispute_status
    // records the later Xianyu dispute outcome.
    const voucherDisputeAction = url.pathname.match(
      /^\/api\/admin\/vouchers\/([^/]+)\/dispute-reverse$/,
    );
    if (voucherDisputeAction && request.method === 'POST') {
      const admin = await getAdmin(request, env);
      if (!admin) return privateJson({ error: 'Forbidden' }, 403, origin);
      const cardId = voucherDisputeAction[1];
      const body = await request.json().catch(() => ({}));
      const reason = String(body.reason || '').trim();
      if (reason.length < 10 || reason.length > 500) {
        return privateJson({
          error: 'A dispute reason between 10 and 500 characters is required',
        }, 400, origin);
      }

      const card = await env.DB.prepare(
        `SELECT vc.id, vc.status, vc.dispute_status, vc.redeem_order_id,
                vc.face_value_minor, vc.currency,
                o.id AS order_id, o.user_id, o.status AS order_status,
                o.payment_method, o.is_first_qualified_purchase
         FROM voucher_cards vc
         LEFT JOIN orders o ON o.id = vc.redeem_order_id
         WHERE vc.id = ?`
      ).bind(cardId).first();
      if (!card) return privateJson({ error: 'Voucher not found' }, 404, origin);

      const existingDispute = await env.DB.prepare(
        `SELECT id, order_id, reason, reversed_paid_credits,
                reversed_promotion_credits, reversed_referral_credits, created_at
         FROM voucher_disputes WHERE card_id = ?`
      ).bind(cardId).first();
      if (existingDispute) {
        return privateJson({
          ok: true,
          already_reversed: true,
          dispute: existingDispute,
        }, 200, origin);
      }
      if (
        card.status !== 'redeemed'
        || card.dispute_status !== 'none'
        || !card.order_id
        || card.payment_method !== 'voucher'
        || card.order_status !== 'completed'
      ) {
        return privateJson({
          error: 'Only a completed, redeemed voucher can be dispute-reversed',
        }, 409, origin);
      }

      const grants = await env.DB.prepare(
        `SELECT g.id, g.user_id, g.credit_type, g.granted_credits,
                (
                  SELECT l.id FROM credit_ledger l
                  WHERE l.grant_id = g.id AND l.delta > 0
                  ORDER BY l.created_at, l.id
                  LIMIT 1
                ) AS original_ledger_id
         FROM credit_grants g
         WHERE g.order_id = ?
           AND g.credit_type IN ('paid', 'promotion', 'referral')
         ORDER BY g.credit_type, g.id`
      ).bind(card.order_id).all();
      const grantRows = grants.results || [];
      if (!grantRows.some((grant) => grant.credit_type === 'paid')) {
        return privateJson({
          error: 'The voucher purchase grant is missing; manual review is required',
        }, 409, origin);
      }

      const reversedCredits = {
        paid: 0,
        promotion: 0,
        referral: 0,
      };
      for (const grant of grantRows) {
        reversedCredits[grant.credit_type] += Number(grant.granted_credits);
      }

      const disputeId = `voucher-dispute:${cardId}`;
      const statements = [
        env.DB.prepare(
          `INSERT INTO voucher_disputes
           (id, card_id, order_id, admin_user_id, reason,
            reversed_paid_credits, reversed_promotion_credits,
            reversed_referral_credits)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          disputeId,
          cardId,
          card.order_id,
          admin.sub,
          reason,
          reversedCredits.paid,
          reversedCredits.promotion,
          reversedCredits.referral,
        ),
        env.DB.prepare(
          `UPDATE referral_reward_holds
           SET status = 'cancelled', cancelled_at = unixepoch(),
               cancellation_reason = 'voucher_dispute'
           WHERE order_id = ? AND status = 'pending'`
        ).bind(card.order_id),
        env.DB.prepare(
          `UPDATE referral_reward_reviews
           SET status = 'rejected', reviewed_at = unixepoch(),
               review_note = 'Cancelled by voucher dispute'
           WHERE order_id = ? AND status = 'pending'`
        ).bind(card.order_id),
      ];
      for (const grant of grantRows) {
        const reversalId = `${disputeId}:${grant.id}`;
        const reversalReason = grant.credit_type === 'paid'
          ? 'voucher_dispute'
          : grant.credit_type === 'promotion'
            ? 'voucher_dispute_promotion'
            : 'voucher_dispute_referral';
        statements.push(
          env.DB.prepare(
            `UPDATE credit_grants
             SET remaining_credits = 0, updated_at = unixepoch()
             WHERE id = ?`
          ).bind(grant.id),
          env.DB.prepare(
            `INSERT INTO credit_ledger
             (id, user_id, delta, balance_type, reason, grant_id, order_id,
              idempotency_key, reversal_of)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            reversalId,
            grant.user_id,
            -Number(grant.granted_credits),
            grant.credit_type,
            reversalReason,
            grant.id,
            card.order_id,
            reversalId,
            grant.original_ledger_id || null,
          ),
          env.DB.prepare(
            'UPDATE user_credits SET credits = credits - ? WHERE user_id = ?'
          ).bind(grant.granted_credits, grant.user_id),
        );
      }
      statements.push(
        env.DB.prepare(
          `UPDATE orders
           SET status = 'refunded', refunded_at = unixepoch(),
               refund_amount = ?, failure_detail = 'Voucher dispute reversal',
               is_first_qualified_purchase = 0
           WHERE id = ? AND payment_method = 'voucher' AND status = 'completed'`
        ).bind((Number(card.face_value_minor) / 100).toFixed(2), card.order_id),
        env.DB.prepare(
          `UPDATE voucher_cards
           SET dispute_status = 'reversed', disputed_at = unixepoch()
           WHERE id = ? AND status = 'redeemed' AND dispute_status = 'none'`
        ).bind(cardId),
      );
      if (Number(card.is_first_qualified_purchase) === 1) {
        statements.push(
          env.DB.prepare(
            `UPDATE referrals
             SET status = 'bound', first_paid_order_id = NULL, first_paid_at = NULL
             WHERE referred_user_id = ? AND first_paid_order_id = ?
               AND risk_status <> 'rejected'
               AND NOT EXISTS (
                 SELECT 1 FROM orders
                 WHERE user_id = ? AND status = 'completed' AND id <> ?
               )`
          ).bind(card.user_id, card.order_id, card.user_id, card.order_id),
        );
      }
      statements.push(
        env.DB.prepare(
          `INSERT INTO voucher_admin_audit
           (id, admin_user_id, action, card_id, detail_json)
           VALUES (?, ?, 'dispute_reverse', ?, ?)`
        ).bind(
          crypto.randomUUID(),
          admin.sub,
          cardId,
          JSON.stringify({
            order_id: card.order_id,
            reason,
            reversed_credits: reversedCredits,
          }),
        ),
      );

      try {
        await env.DB.batch(statements);
      } catch (error) {
        const concurrent = await env.DB.prepare(
          `SELECT id, order_id, reason, reversed_paid_credits,
                  reversed_promotion_credits, reversed_referral_credits, created_at
           FROM voucher_disputes WHERE card_id = ?`
        ).bind(cardId).first();
        if (concurrent) {
          return privateJson({
            ok: true,
            already_reversed: true,
            dispute: concurrent,
          }, 200, origin);
        }
        console.error(JSON.stringify({
          message: 'Voucher dispute reversal failed',
          cardId,
          orderId: card.order_id,
          adminUserId: admin.sub,
          error: error.message,
        }));
        return privateJson({ error: 'Unable to reverse the voucher dispute' }, 500, origin);
      }

      return privateJson({
        ok: true,
        already_reversed: false,
        dispute: {
          id: disputeId,
          order_id: card.order_id,
          reason,
          reversed_paid_credits: reversedCredits.paid,
          reversed_promotion_credits: reversedCredits.promotion,
          reversed_referral_credits: reversedCredits.referral,
        },
      }, 200, origin);
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
      const requestedReferralCode = body.referral_code
        ? normalizeReferralCode(body.referral_code)
        : null;
      if (body.referral_code && !requestedReferralCode) {
        return privateJson({ error: 'Referral code is invalid or not eligible.' }, 400, origin);
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
      let redemptionCommitted = false;
      for (let attempt = 0; attempt < 2 && !redemptionCommitted; attempt += 1) {
        const voucherReferral = await resolveVoucherReferral(env, {
          userId: user.sub,
          referralCode: requestedReferralCode,
          guest,
        });
        if (voucherReferral.error) {
          return privateJson({ error: voucherReferral.error }, 409, origin);
        }
        const benefits = await calculateOrderBenefits(env, {
          orderId,
          userId: user.sub,
          baseCredits: Number(card.base_credits),
          relationshipOverride: voucherReferral.relationship,
        });
        const review = await calculateVoucherReferralRisk(env, {
          relationship: benefits.relationship,
          guest,
          hasReward: benefits.promotionCredits > 0 || benefits.referralCredits > 0,
        });
        const referralStatements = voucherReferral.insert
          ? [
            env.DB.prepare(
              `INSERT INTO referrals
               (id, referrer_user_id, referred_user_id, referral_code, source,
                created_ip_hash, created_device_hash)
               VALUES (?, ?, ?, ?, 'voucher', ?, ?)`
            ).bind(
              voucherReferral.insert.id,
              voucherReferral.insert.referrer_user_id,
              voucherReferral.insert.referred_user_id,
              voucherReferral.insert.referral_code,
              voucherReferral.insert.ipHash,
              voucherReferral.insert.deviceHash,
            ),
          ]
          : [];
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
            ...referralStatements,
            env.DB.prepare(
              `UPDATE voucher_cards
               SET status = 'redeemed', redeemed_by = ?, redeemed_at = unixepoch(),
                   redeem_order_id = ?
               WHERE id = ?
                 AND status IN ('generated', 'reserved', 'delivered')`
            ).bind(user.sub, orderId, card.id),
            ...paidCreditStatements(env, {
              orderId,
              userId: user.sub,
              baseCredits: Number(card.base_credits),
              grantId,
              reason: 'voucher_redeem',
            }),
            ...orderBenefitStatements(env, {
              orderId,
              userId: user.sub,
              benefits,
              review,
            }),
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
          redemptionCommitted = true;
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
          if (attempt === 0 && !redeemed) continue;
          await recordVoucherAttempt(env, {
            userId: user.sub,
            guest,
            codeFingerprint,
            success: false,
          });
          return privateJson(genericError, 400, origin);
        }
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
        let captureCommitted = false;
        for (let attempt = 0; attempt < 2 && !captureCommitted; attempt += 1) {
          const benefits = await calculateOrderBenefits(env, {
            orderId,
            userId: user.sub,
            baseCredits: Number(order.base_credits),
            payerId,
          });
          try {
            await env.DB.batch([
              env.DB.prepare(
                `UPDATE orders
                 SET status = 'completed', paypal_capture_id = ?, paypal_payer_id = ?,
                     completed_at = unixepoch(), failure_detail = NULL
                 WHERE id = ? AND user_id = ? AND status = 'pending'`
              ).bind(capture.id, payerId, orderId, user.sub),
              ...paidCreditStatements(env, {
                orderId,
                userId: user.sub,
                baseCredits: Number(order.base_credits),
                grantId,
                reason: 'paypal_purchase',
              }),
              ...orderBenefitStatements(env, {
                orderId,
                userId: user.sub,
                benefits,
              }),
            ]);
            captureCommitted = true;
          } catch (error) {
            const completed = await env.DB.prepare(
              `SELECT status, paypal_capture_id FROM orders
               WHERE id = ? AND user_id = ?`
            ).bind(orderId, user.sub).first();
            if (completed?.status === 'completed' && completed.paypal_capture_id === capture.id) {
              captureCommitted = true;
              break;
            }
            if (attempt === 1) throw error;
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
          `SELECT id, user_id, amount, currency, status,
                  is_first_qualified_purchase
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

        const grants = await env.DB.prepare(
          `SELECT g.id, g.user_id, g.credit_type, g.granted_credits,
                  (
                    SELECT l.id FROM credit_ledger l
                    WHERE l.grant_id = g.id AND l.delta > 0
                    ORDER BY l.created_at, l.id
                    LIMIT 1
                  ) AS original_ledger_id
           FROM credit_grants g
           WHERE g.order_id = ?
             AND g.credit_type IN ('paid', 'promotion', 'referral')
           ORDER BY g.credit_type, g.id`
        ).bind(order.id).all();
        const grantRows = grants.results || [];
        const paidGrant = grantRows.find((grant) => grant.credit_type === 'paid');
        if (!paidGrant) {
          throw new Error('Paid credit grant not found for refunded order');
        }

        const statements = [
          env.DB.prepare(
            `UPDATE referral_reward_holds
             SET status = 'cancelled', cancelled_at = unixepoch(),
                 cancellation_reason = 'paypal_refund'
             WHERE order_id = ? AND status = 'pending'`
          ).bind(order.id),
          env.DB.prepare(
            `UPDATE referral_reward_reviews
             SET status = 'rejected', reviewed_at = unixepoch(),
                 review_note = 'Cancelled by PayPal refund'
             WHERE order_id = ? AND status = 'pending'`
          ).bind(order.id),
        ];
        for (const grant of grantRows) {
          const reversalId = `paypal-refund:${captureId}:${grant.id}`;
          const reversalReason = grant.credit_type === 'paid'
            ? 'paypal_refund'
            : grant.credit_type === 'promotion'
              ? 'paypal_refund_promotion'
              : 'paypal_refund_referral';
          statements.push(
            env.DB.prepare(
              `UPDATE credit_grants
               SET remaining_credits = 0, updated_at = unixepoch()
               WHERE id = ?`
            ).bind(grant.id),
            env.DB.prepare(
              `INSERT INTO credit_ledger
               (id, user_id, delta, balance_type, reason, grant_id, order_id,
                idempotency_key, reversal_of)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).bind(
              reversalId,
              grant.user_id,
              -Number(grant.granted_credits),
              grant.credit_type,
              reversalReason,
              grant.id,
              order.id,
              reversalId,
              grant.original_ledger_id || null,
            ),
            env.DB.prepare(
              'UPDATE user_credits SET credits = credits - ? WHERE user_id = ?'
            ).bind(grant.granted_credits, grant.user_id),
          );
        }
        statements.push(
          env.DB.prepare(
            `UPDATE orders
             SET status = 'refunded', refunded_at = unixepoch(), refund_amount = ?,
                 failure_detail = NULL, is_first_qualified_purchase = 0
             WHERE id = ?`
          ).bind(event.resource.amount.value, order.id),
        );
        if (Number(order.is_first_qualified_purchase) === 1) {
          statements.push(
            env.DB.prepare(
              `UPDATE referrals
               SET status = 'bound', first_paid_order_id = NULL, first_paid_at = NULL
               WHERE referred_user_id = ? AND first_paid_order_id = ?
                 AND risk_status <> 'rejected'
                 AND NOT EXISTS (
                   SELECT 1 FROM orders
                   WHERE user_id = ? AND status = 'completed' AND id <> ?
                 )`
            ).bind(order.user_id, order.id, order.user_id, order.id),
          );
        }
        statements.push(
          env.DB.prepare(
            `UPDATE webhook_events
             SET status = 'processed', processed_at = unixepoch(), error = NULL
             WHERE event_id = ?`
          ).bind(event.id),
        );

        const paidReversalId = `paypal-refund:${captureId}:${paidGrant.id}`;
        try {
          await env.DB.batch(statements);
        } catch (error) {
          const reversed = await env.DB.prepare(
            'SELECT id FROM credit_ledger WHERE idempotency_key = ?'
          ).bind(paidReversalId).first();
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

  async scheduled(_controller, env) {
    const released = await releaseDueRewardHolds(env);
    const expiredInpaintResults = env.INPAINT_OBJECTS
      ? await cleanupExpiredInpaint(env)
      : 0;
    const analyticsCleanup = await cleanupAnalytics(env);
    console.log(JSON.stringify({
      message: 'Referral reward observation release completed',
      released,
      expiredInpaintResults,
      analyticsCleanup,
    }));
  },

  async queue(batch, env) {
    await processInpaintQueue(batch, env);
  },
};
