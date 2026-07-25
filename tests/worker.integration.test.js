import { env, exports } from 'cloudflare:workers';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const API_ORIGIN = 'https://api.shopbgremover.com';

beforeAll(async () => {
  const statements = env.TEST_SCHEMA
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
});

beforeEach(async () => {
  await env.DB.exec(`
    DELETE FROM guest_ai_charges;
    DELETE FROM ai_tasks;
    DELETE FROM credit_ledger;
    DELETE FROM credit_grants;
    DELETE FROM user_free_entitlements;
    DELETE FROM guest_ip_usage;
    DELETE FROM guest_usage;
    DELETE FROM webhook_events;
    DELETE FROM voucher_attempts;
    DELETE FROM voucher_admin_audit;
    DELETE FROM voucher_disputes;
    DELETE FROM voucher_cards;
    DELETE FROM voucher_batches;
    DELETE FROM referral_reward_holds;
    DELETE FROM referral_reward_reviews;
    DELETE FROM subscriptions;
    DELETE FROM sso_codes;
    DELETE FROM email_otps;
    DELETE FROM free_usage;
    DELETE FROM processing_history;
    DELETE FROM referrals;
    DELETE FROM referral_codes;
    DELETE FROM orders;
    DELETE FROM user_credits;
    DELETE FROM users;
  `);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function jsonResponse(response) {
  return JSON.parse(await response.text());
}

async function createAuthenticatedUser({
  email = 'buyer@example.com',
  code = '123456',
  credits = 5,
  deviceId = 'test-device-buyer',
  pendingCookie = '',
} = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await env.DB.prepare(
    'INSERT INTO email_otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)'
  ).bind(email, code, expiresAt).run();

  const headers = {
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
    'CF-Connecting-IP': '203.0.113.20',
  };
  if (pendingCookie) headers.Cookie = pendingCookie;

  const response = await exports.default.fetch(new Request(`${API_ORIGIN}/api/auth/email/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, code }),
  }));

  expect(response.status).toBe(200);
  const cookie = response.headers.get('Set-Cookie');
  expect(cookie).toContain('session=');

  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (credits !== null) {
    await env.DB.prepare('DELETE FROM credit_ledger WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare('DELETE FROM credit_grants WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare(
      'UPDATE user_credits SET credits = ?, total_used = 0 WHERE user_id = ?'
    ).bind(credits, user.id).run();

    if (credits > 0) {
      const grantId = `test-opening:${user.id}`;
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO credit_grants
           (id, user_id, credit_type, granted_credits, remaining_credits, idempotency_key)
           VALUES (?, ?, 'legacy', ?, ?, ?)`
        ).bind(grantId, user.id, credits, credits, grantId),
        env.DB.prepare(
          `INSERT INTO credit_ledger
           (id, user_id, delta, balance_type, reason, grant_id, idempotency_key)
           VALUES (?, ?, ?, 'legacy', 'test_opening', ?, ?)`
        ).bind(grantId, user.id, credits, grantId, grantId),
      ]);
    }
  }

  return {
    cookie: cookie.split(';', 1)[0],
    userId: user.id,
  };
}

function authenticatedRequest(path, cookie, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', cookie);
  if (init.body) headers.set('Content-Type', 'application/json');
  return new Request(`${API_ORIGIN}${path}`, { ...init, headers });
}

async function releasePendingRewardHolds() {
  await env.DB.prepare(
    `UPDATE referral_reward_holds
     SET release_at = unixepoch() - 1
     WHERE status = 'pending'`
  ).run();
  await exports.default.scheduled({ cron: '17 * * * *', scheduledTime: Date.now() }, env);
}

function removeBackgroundRequest({
  cookie,
  taskId,
  deviceId = 'guest-device-1',
  ip = '203.0.113.10',
  imageUrl = 'https://example.com/product.png',
} = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
    'CF-Connecting-IP': ip,
  });
  if (cookie) headers.set('Cookie', cookie);

  return new Request(`${API_ORIGIN}/api/remove-bg`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image_url: imageUrl, task_id: taskId }),
  });
}

function installFalSuccessMock() {
  let submitted = 0;
  const outboundFetch = vi.fn(async (input) => {
    const url = String(input);
    if (url === 'https://queue.fal.run/fal-ai/birefnet') {
      submitted += 1;
      return Response.json({ request_id: `provider-request-${submitted}` });
    }
    if (url.endsWith('/status')) {
      return Response.json({ status: 'COMPLETED' });
    }
    if (url.startsWith('https://queue.fal.run/fal-ai/birefnet/requests/')) {
      return Response.json({ image: { url: 'https://cdn.example.com/result.png' } });
    }
    if (url === 'https://cdn.example.com/result.png') {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  });
  vi.stubGlobal('fetch', outboundFetch);
  return outboundFetch;
}

function completedPayPalOrder({
  orderId,
  captureId = `CAPTURE-${orderId}`,
  amount = '3.49',
  currency = 'USD',
  payerId = 'PAYER-1',
} = {}) {
  return {
    id: orderId,
    status: 'COMPLETED',
    payer: { payer_id: payerId },
    purchase_units: [{
      payments: {
        captures: [{
          id: captureId,
          status: 'COMPLETED',
          amount: { value: amount, currency_code: currency },
        }],
      },
    }],
  };
}

async function generateVoucher(cookie, {
  credits = 300,
  quantity = 1,
  salesOrderRef = '',
} = {}) {
  const response = await exports.default.fetch(authenticatedRequest(
    '/api/admin/vouchers/generate',
    cookie,
    {
      method: 'POST',
      body: JSON.stringify({
        credits,
        quantity,
        sales_order_ref: salesOrderRef,
      }),
    },
  ));
  return { response, body: await jsonResponse(response) };
}

async function createReferredPair({
  label,
  referrerPayerId = `REFERRER-PAYER-${label}`,
} = {}) {
  const referrer = await createAuthenticatedUser({
    email: `${label}-referrer@example.com`,
    credits: 0,
    deviceId: `${label}-referrer-device`,
  });
  await env.DB.prepare(
    `INSERT INTO orders
     (id, user_id, plan, amount, credits, base_credits, currency, status,
      paypal_capture_id, paypal_payer_id, completed_at)
     VALUES (?, ?, 'credits_100', 3.49, 100, 100, 'USD', 'completed',
             ?, ?, unixepoch())`
  ).bind(
    `${label}-REFERRER-ORDER`,
    referrer.userId,
    `${label}-REFERRER-CAPTURE`,
    referrerPayerId,
  ).run();
  const referral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
    '/api/referrals/me',
    referrer.cookie,
  )));
  const capture = await exports.default.fetch(new Request(
    `${API_ORIGIN}/api/referrals/capture`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: referral.code }),
    },
  ));
  const pendingCookie = capture.headers.get('Set-Cookie').split(';', 1)[0];
  const invitee = await createAuthenticatedUser({
    email: `${label}-invitee@example.com`,
    credits: 0,
    deviceId: `${label}-invitee-device`,
    pendingCookie,
  });
  return { referrer, invitee, referral };
}

describe('production schema baseline', () => {
  it('creates every Stage 1 business table', async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf_%'
       ORDER BY name`
    ).all();

    expect(result.results.map((row) => row.name)).toEqual([
      'ai_tasks',
      'credit_grants',
      'credit_ledger',
      'email_otps',
      'free_usage',
      'guest_ai_charges',
      'guest_ip_usage',
      'guest_usage',
      'orders',
      'processing_history',
      'referral_codes',
      'referral_reward_holds',
      'referral_reward_reviews',
      'referrals',
      'sso_codes',
      'subscriptions',
      'user_credits',
      'user_free_entitlements',
      'users',
      'voucher_admin_audit',
      'voucher_attempts',
      'voucher_batches',
      'voucher_cards',
      'voucher_disputes',
      'webhook_events',
    ]);
  });

  it('contains the credit-bucket, provider recovery, and payment idempotency columns', async () => {
    const [credits, tasks, orders, voucherCards, referralCodes, reviews, holds] = await Promise.all([
      env.DB.prepare('PRAGMA table_info(credit_grants)').all(),
      env.DB.prepare('PRAGMA table_info(ai_tasks)').all(),
      env.DB.prepare('PRAGMA table_info(orders)').all(),
      env.DB.prepare('PRAGMA table_info(voucher_cards)').all(),
      env.DB.prepare('PRAGMA table_info(referral_codes)').all(),
      env.DB.prepare('PRAGMA table_info(referral_reward_reviews)').all(),
      env.DB.prepare('PRAGMA table_info(referral_reward_holds)').all(),
    ]);

    expect(credits.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'credit_type',
      'remaining_credits',
      'expires_at',
      'idempotency_key',
    ]));
    expect(tasks.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'provider_request_id',
      'provider_submitted_at',
    ]));
    expect(orders.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'base_credits',
      'currency',
      'paypal_capture_id',
      'completed_at',
      'refunded_at',
      'payment_method',
      'voucher_card_id',
      'referral_processed_at',
      'is_first_qualified_purchase',
      'referrer_user_id_snapshot',
    ]));
    expect(voucherCards.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'dispute_status',
      'disputed_at',
    ]));
    expect(referralCodes.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'owner_ip_hash',
      'owner_device_hash',
      'fingerprint_updated_at',
    ]));
    expect(reviews.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'pending_promotion_credits',
      'pending_referral_credits',
      'risk_score',
      'risk_reasons_json',
      'status',
    ]));
    expect(holds.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'pending_promotion_credits',
      'pending_referral_credits',
      'release_at',
      'released_at',
      'cancelled_at',
      'status',
    ]));
  });
});

describe('referral relationship foundation', () => {
  it('creates one stable, non-sequential referral code per user', async () => {
    const { cookie, userId } = await createAuthenticatedUser({
      email: 'referrer@example.com',
      credits: 0,
    });

    const first = await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      cookie,
    ));
    const second = await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      cookie,
    ));
    const firstBody = await jsonResponse(first);
    const secondBody = await jsonResponse(second);

    expect(first.status).toBe(200);
    expect(firstBody.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(secondBody.code).toBe(firstBody.code);
    expect(firstBody.link).toBe(`https://www.shopbgremover.com/?ref=${firstBody.code}`);
    expect(firstBody.reward_eligible).toBe(false);

    const stored = await env.DB.prepare(
      'SELECT code, user_id, status FROM referral_codes WHERE user_id = ?'
    ).bind(userId).first();
    expect(stored).toEqual(expect.objectContaining({
      code: firstBody.code,
      user_id: userId,
      status: 'active',
    }));
  });

  it('binds a valid signed referral cookie only when a new account is created', async () => {
    const referrer = await createAuthenticatedUser({
      email: 'qualified-referrer@example.com',
      credits: 0,
    });
    const referralResponse = await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    ));
    const referral = await jsonResponse(referralResponse);

    const capture = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/referrals/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://www.shopbgremover.com',
        },
        body: JSON.stringify({ code: referral.code.toLowerCase() }),
      },
    ));
    expect(capture.status).toBe(200);
    const pendingCookie = capture.headers.get('Set-Cookie').split(';', 1)[0];
    expect(capture.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(capture.headers.get('Set-Cookie')).toContain('Max-Age=2592000');

    const invitee = await createAuthenticatedUser({
      email: 'new-invitee@example.com',
      credits: 0,
      deviceId: 'new-invitee-device',
      pendingCookie,
    });
    const relationship = await env.DB.prepare(
      `SELECT referrer_user_id, referred_user_id, referral_code, source, status,
              created_ip_hash, created_device_hash
       FROM referrals WHERE referred_user_id = ?`
    ).bind(invitee.userId).first();

    expect(relationship).toEqual(expect.objectContaining({
      referrer_user_id: referrer.userId,
      referred_user_id: invitee.userId,
      referral_code: referral.code,
      source: 'link',
      status: 'bound',
    }));
    expect(relationship.created_ip_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(relationship.created_device_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not attach a referrer when an existing account signs in', async () => {
    const referrer = await createAuthenticatedUser({
      email: 'existing-referrer@example.com',
      credits: 0,
    });
    const existing = await createAuthenticatedUser({
      email: 'existing-invitee@example.com',
      credits: 0,
    });
    const referral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    )));
    const capture = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/referrals/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: referral.code }),
      },
    ));
    const pendingCookie = capture.headers.get('Set-Cookie').split(';', 1)[0];

    await createAuthenticatedUser({
      email: 'existing-invitee@example.com',
      credits: 0,
      pendingCookie,
    });

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM referrals WHERE referred_user_id = ?'
    ).bind(existing.userId).first('count');
    expect(count).toBe(0);
  });

  it('locks the first valid referral cookie against later referral links', async () => {
    const firstReferrer = await createAuthenticatedUser({
      email: 'first-referrer@example.com',
      credits: 0,
    });
    const secondReferrer = await createAuthenticatedUser({
      email: 'second-referrer@example.com',
      credits: 0,
    });
    const firstReferral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      firstReferrer.cookie,
    )));
    const secondReferral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      secondReferrer.cookie,
    )));

    const firstCapture = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/referrals/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: firstReferral.code }),
      },
    ));
    const pendingCookie = firstCapture.headers.get('Set-Cookie').split(';', 1)[0];
    const secondCapture = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/referrals/capture`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: pendingCookie,
        },
        body: JSON.stringify({ code: secondReferral.code }),
      },
    ));
    const secondBody = await jsonResponse(secondCapture);

    expect(secondBody).toEqual(expect.objectContaining({
      ok: true,
      already_captured: true,
      code: firstReferral.code,
    }));
    expect(secondCapture.headers.get('Set-Cookie')).toBeNull();

    const invitee = await createAuthenticatedUser({
      email: 'locked-attribution@example.com',
      credits: 0,
      pendingCookie,
    });
    const boundReferrer = await env.DB.prepare(
      'SELECT referrer_user_id FROM referrals WHERE referred_user_id = ?'
    ).bind(invitee.userId).first('referrer_user_id');
    expect(boundReferrer).toBe(firstReferrer.userId);
  });

  it('rejects unknown codes and ignores a tampered pending cookie', async () => {
    const invalidCapture = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/referrals/capture`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'ABCDEFGH' }),
      },
    ));
    expect(invalidCapture.status).toBe(400);

    const invitee = await createAuthenticatedUser({
      email: 'tampered-cookie@example.com',
      credits: 0,
      pendingCookie: 'referral_pending=not-a-valid-signature',
    });
    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM referrals WHERE referred_user_id = ?'
    ).bind(invitee.userId).first('count');
    expect(count).toBe(0);
  });
});

describe('free quota and credit accounting', () => {
  it('issues 10 lifetime registration credits minus prior guest usage', async () => {
    const outboundFetch = installFalSuccessMock();

    for (let index = 0; index < 3; index += 1) {
      const response = await exports.default.fetch(removeBackgroundRequest({
        taskId: `guest-task-${index}`,
        deviceId: 'convert-me',
        ip: '203.0.113.30',
      }));
      expect(response.status).toBe(200);
    }

    const { userId } = await createAuthenticatedUser({
      email: 'converted@example.com',
      credits: null,
      deviceId: 'convert-me',
    });
    const summary = await env.DB.prepare(
      `SELECT uc.credits, e.guest_uses_applied, e.issued_credits
       FROM user_credits uc
       JOIN user_free_entitlements e ON e.user_id = uc.user_id
       WHERE uc.user_id = ?`
    ).bind(userId).first();
    expect(summary).toEqual(expect.objectContaining({
      credits: 7,
      guest_uses_applied: 3,
      issued_credits: 7,
    }));
    expect(outboundFetch).toHaveBeenCalledTimes(12);
  });

  it('enforces the anonymous lifetime quota at 3 by both device and IP', async () => {
    const outboundFetch = installFalSuccessMock();

    for (let index = 0; index < 3; index += 1) {
      const response = await exports.default.fetch(removeBackgroundRequest({
        taskId: `guest-quota-${index}`,
      }));
      expect(response.status).toBe(200);
    }

    const blocked = await exports.default.fetch(removeBackgroundRequest({
      taskId: 'guest-quota-blocked',
    }));
    expect(blocked.status).toBe(403);
    expect(await jsonResponse(blocked)).toMatchObject({ ok: false, reason: 'free_limit' });
    expect(outboundFetch).toHaveBeenCalledTimes(12);

    const [device, ip] = await Promise.all([
      env.DB.prepare('SELECT count FROM guest_usage').first(),
      env.DB.prepare('SELECT count FROM guest_ip_usage').first(),
    ]);
    expect(device.count).toBe(3);
    expect(ip.count).toBe(3);
  });

  it('does not allow a direct credit-only deduction', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 2 });
    const response = await exports.default.fetch(authenticatedRequest(
      '/api/use-credit',
      cookie,
      { method: 'POST' },
    ));
    expect(response.status).toBe(410);
    const balance = await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first('credits');
    expect(balance).toBe(2);
  });

  it('does not deduct credit when fal.ai fails', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    const outboundFetch = vi.fn(async () => new Response('upstream unavailable', { status: 503 }));
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'fal-failure-task',
    }));

    expect(response.status).toBe(502);
    expect(outboundFetch).toHaveBeenCalledTimes(1);
    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 3, total_used: 0 }));
    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE task_id = 'fal-failure-task'`
    ).first('count');
    expect(ledger).toBe(0);
  });

  it('recovers a lost success response without another provider call or charge', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    const outboundFetch = installFalSuccessMock();
    const request = () => removeBackgroundRequest({
      cookie,
      taskId: 'idempotent-ai-task',
    });

    const first = await exports.default.fetch(request());
    const second = await exports.default.fetch(request());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.headers.get('X-AI-Reused')).toBe('false');
    expect(second.headers.get('X-AI-Reused')).toBe('true');
    expect(outboundFetch).toHaveBeenCalledTimes(5);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 2, total_used: 1 }));
    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE task_id = 'idempotent-ai-task'`
    ).first('count');
    expect(ledger).toBe(1);
  });

  it('resumes a durable provider request after interruption without submitting or charging twice', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    let statusChecks = 0;
    let submissions = 0;
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://queue.fal.run/fal-ai/birefnet') {
        submissions += 1;
        return Response.json({ request_id: 'provider-interrupted-request' });
      }
      if (url.endsWith('/status')) {
        statusChecks += 1;
        return Response.json({
          status: statusChecks === 1 ? 'IN_PROGRESS' : 'COMPLETED',
        });
      }
      if (url === 'https://queue.fal.run/fal-ai/birefnet/requests/provider-interrupted-request') {
        return Response.json({ image: { url: 'https://cdn.example.com/interrupted.png' } });
      }
      if (url === 'https://cdn.example.com/interrupted.png') {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error(`Unexpected outbound request: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);
    const request = () => removeBackgroundRequest({
      cookie,
      taskId: 'durable-interrupted-task',
    });

    const interrupted = await exports.default.fetch(request());
    expect(interrupted.status).toBe(409);
    expect(await jsonResponse(interrupted)).toMatchObject({
      reason: 'task_processing',
      started: true,
    });
    expect(await env.DB.prepare(
      `SELECT status, provider_request_id FROM ai_tasks
       WHERE task_id = 'durable-interrupted-task'`
    ).first()).toEqual(expect.objectContaining({
      status: 'processing',
      provider_request_id: 'provider-interrupted-request',
    }));

    const recovered = await exports.default.fetch(request());
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get('X-AI-Reused')).toBe('true');
    expect(submissions).toBe(1);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 2, total_used: 1 }));
    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE task_id = 'durable-interrupted-task'`
    ).first('count');
    expect(ledger).toBe(1);
  });

  it('settles concurrent guest recovery requests only once', async () => {
    let statusChecks = 0;
    let resultCalls = 0;
    let releaseResults;
    const resultGate = new Promise((resolve) => {
      releaseResults = resolve;
    });
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://queue.fal.run/fal-ai/birefnet') {
        return Response.json({ request_id: 'provider-guest-concurrent' });
      }
      if (url.endsWith('/status')) {
        statusChecks += 1;
        return Response.json({
          status: statusChecks === 1 ? 'IN_PROGRESS' : 'COMPLETED',
        });
      }
      if (url === 'https://queue.fal.run/fal-ai/birefnet/requests/provider-guest-concurrent') {
        resultCalls += 1;
        if (resultCalls === 2) releaseResults();
        await resultGate;
        return Response.json({ image: { url: 'https://cdn.example.com/guest-concurrent.png' } });
      }
      if (url === 'https://cdn.example.com/guest-concurrent.png') {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error(`Unexpected outbound request: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);
    const request = () => removeBackgroundRequest({
      taskId: 'durable-guest-concurrent',
      deviceId: 'durable-guest-device',
      ip: '203.0.113.44',
    });

    const queued = await exports.default.fetch(request());
    expect(queued.status).toBe(409);

    const [first, second] = await Promise.all([
      exports.default.fetch(request()),
      exports.default.fetch(request()),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const [deviceUses, ipUses, taskCharges] = await Promise.all([
      env.DB.prepare(
        'SELECT count FROM guest_usage WHERE device_hash IS NOT NULL'
      ).first('count'),
      env.DB.prepare(
        'SELECT count FROM guest_ip_usage WHERE ip_hash IS NOT NULL'
      ).first('count'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM guest_ai_charges
         WHERE task_id = 'durable-guest-concurrent'`
      ).first('count'),
    ]);
    expect(deviceUses).toBe(1);
    expect(ipUses).toBe(1);
    expect(taskCharges).toBe(1);
  });

  it('rejects reuse of a task id after the source input changes', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    const outboundFetch = installFalSuccessMock();
    const first = await exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'source-bound-task',
      imageUrl: 'https://example.com/original.png',
    }));
    expect(first.status).toBe(200);

    const conflict = await exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'source-bound-task',
      imageUrl: 'https://example.com/edited.png',
    }));
    expect(conflict.status).toBe(409);
    expect(await jsonResponse(conflict)).toMatchObject({ reason: 'task_conflict' });
    expect(outboundFetch).toHaveBeenCalledTimes(4);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 2, total_used: 1 }));
  });

  it('retries the same failed task after an upstream network interruption and charges only on success', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    let falAttempts = 0;
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://queue.fal.run/fal-ai/birefnet') {
        falAttempts += 1;
        if (falAttempts === 1) throw new TypeError('upstream connection reset');
        return Response.json({ request_id: 'provider-retry-request' });
      }
      if (url.endsWith('/status')) {
        return Response.json({ status: 'COMPLETED' });
      }
      if (url === 'https://queue.fal.run/fal-ai/birefnet/requests/provider-retry-request') {
        return Response.json({ image: { url: 'https://cdn.example.com/retry.png' } });
      }
      if (url === 'https://cdn.example.com/retry.png') {
        return new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        });
      }
      throw new Error(`Unexpected outbound request: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);
    const request = () => removeBackgroundRequest({
      cookie,
      taskId: 'upstream-interrupted-task',
    });

    const interrupted = await exports.default.fetch(request());
    expect(interrupted.status).toBe(502);
    expect(interrupted.headers.get('X-AI-Reused')).toBeNull();
    expect(await env.DB.prepare(
      `SELECT status, error_code FROM ai_tasks
       WHERE task_id = 'upstream-interrupted-task'`
    ).first()).toEqual(expect.objectContaining({
      status: 'failed',
      error_code: 'fal_submit_failed',
    }));

    const recovered = await exports.default.fetch(request());
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get('X-AI-Reused')).toBe('false');
    expect(falAttempts).toBe(2);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 2, total_used: 1 }));
    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE task_id = 'upstream-interrupted-task'`
    ).first('count');
    expect(ledger).toBe(1);
  });

  it('allows only one concurrent execution of the same AI task', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 2 });
    let releaseFal;
    const falGate = new Promise((resolve) => {
      releaseFal = resolve;
    });
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://queue.fal.run/fal-ai/birefnet') {
        await falGate;
        return Response.json({ request_id: 'provider-concurrent-request' });
      }
      if (url.endsWith('/status')) {
        return Response.json({ status: 'COMPLETED' });
      }
      if (url === 'https://queue.fal.run/fal-ai/birefnet/requests/provider-concurrent-request') {
        return Response.json({ image: { url: 'https://cdn.example.com/result.png' } });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { 'Content-Type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', outboundFetch);

    const firstPromise = exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'concurrent-ai-task',
    }));
    await vi.waitFor(() => expect(outboundFetch).toHaveBeenCalledTimes(1));
    const second = await exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'concurrent-ai-task',
    }));
    expect(second.status).toBe(409);
    releaseFal();
    const first = await firstPromise;
    expect(first.status).toBe(200);
    expect(first.headers.get('X-AI-Reused')).toBe('false');

    const recovered = await exports.default.fetch(removeBackgroundRequest({
      cookie,
      taskId: 'concurrent-ai-task',
    }));
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get('X-AI-Reused')).toBe('true');
    expect(outboundFetch).toHaveBeenCalledTimes(5);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 1, total_used: 1 }));
    const ledger = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE task_id = 'concurrent-ai-task'`
    ).first('count');
    expect(ledger).toBe(1);
  });
});

describe('credit center and administrator overview', () => {
  it('returns only the signed-in user credit grants, ledger, and orders', async () => {
    const anonymous = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/credits/center`,
    ));
    expect(anonymous.status).toBe(401);

    const buyer = await createAuthenticatedUser({
      email: 'credit-center@example.com',
      credits: 12,
    });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status,
        completed_at, payment_method)
       VALUES ('CENTER-ORDER', ?, 'credits_100', 3.49, 100, 100, 'USD',
               'completed', unixepoch(), 'paypal')`
    ).bind(buyer.userId).run();

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/credits/center',
      buyer.cookie,
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await jsonResponse(response);
    expect(body.user.email).toBe('credit-center@example.com');
    expect(body.credits.credits).toBe(12);
    expect(body.grants).toHaveLength(1);
    expect(body.grants[0]).toEqual(expect.objectContaining({
      credit_type: 'legacy',
      remaining_credits: 12,
    }));
    expect(body.ledger).toHaveLength(1);
    expect(body.ledger[0].reason).toBe('test_opening');
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toEqual(expect.objectContaining({
      id: 'CENTER-ORDER',
      payment_method: 'paypal',
      base_credits: 100,
    }));
  });

  it('restricts the overview to administrators and returns auditable totals', async () => {
    const regular = await createAuthenticatedUser({
      email: 'overview-regular@example.com',
      credits: 5,
    });
    const forbidden = await exports.default.fetch(authenticatedRequest(
      '/api/admin/overview',
      regular.cookie,
    ));
    expect(forbidden.status).toBe(403);

    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 7,
      deviceId: 'overview-admin-device',
    });
    const response = await exports.default.fetch(authenticatedRequest(
      '/api/admin/overview',
      admin.cookie,
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = await jsonResponse(response);
    expect(body.admin.email).toBe('admin@example.com');
    expect(body.totals).toEqual(expect.objectContaining({
      users: 2,
      active_credits: 12,
      total_used: 0,
      orders: 0,
      voucher_cards: 0,
    }));
    expect(body.recent_ledger).toHaveLength(2);
    expect(body.recent_orders).toEqual([]);
  });
});

describe('Xianyu voucher flow', () => {
  it('requires an allowlisted administrator and stores only a voucher hash', async () => {
    const regular = await createAuthenticatedUser({
      email: 'regular@example.com',
      credits: 0,
    });
    const forbidden = await generateVoucher(regular.cookie);
    expect(forbidden.response.status).toBe(403);

    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
      deviceId: 'admin-device',
    });
    const generated = await generateVoucher(admin.cookie, {
      credits: 300,
      salesOrderRef: 'XY-ORDER-1001',
    });
    expect(generated.response.status).toBe(201);
    expect(generated.body.vouchers).toHaveLength(1);
    const code = generated.body.vouchers[0].code;
    expect(code).toMatch(/^SBG-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);

    const card = await env.DB.prepare(
      `SELECT code_hash, code_prefix, code_last4, status, sales_order_ref
       FROM voucher_cards`
    ).first();
    expect(card.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(card.status).toBe('reserved');
    expect(card.sales_order_ref).toBe('XY-ORDER-1001');
    expect(JSON.stringify(card)).not.toContain(code);

    const duplicate = await generateVoucher(admin.cookie, {
      credits: 300,
      salesOrderRef: 'XY-ORDER-1001',
    });
    expect(duplicate.response.status).toBe(409);
  });

  it('marks a reserved card delivered and keeps full codes out of list responses', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, {
      credits: 100,
      salesOrderRef: 'XY-DELIVER-1',
    });
    const voucher = generated.body.vouchers[0];

    const delivered = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/deliver`,
      admin.cookie,
      { method: 'POST' },
    ));
    expect(delivered.status).toBe(200);
    const card = await env.DB.prepare(
      'SELECT status, delivered_at FROM voucher_cards WHERE id = ?'
    ).bind(voucher.id).first();
    expect(card.status).toBe('delivered');
    expect(card.delivered_at).toBeTypeOf('number');
    const auditCount = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM voucher_admin_audit
       WHERE card_id = ? AND action = 'deliver'`
    ).bind(voucher.id).first('count');
    expect(auditCount).toBe(1);

    const list = await exports.default.fetch(authenticatedRequest(
      '/api/admin/vouchers?q=XY-DELIVER-1',
      admin.cookie,
    ));
    const body = await jsonResponse(list);
    expect(body.vouchers).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(voucher.code);
  });

  it('redeems once into the unified order, grant, ledger, and aggregate balance', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, {
      credits: 300,
      salesOrderRef: 'XY-REDEEM-1',
    });
    const voucher = generated.body.vouchers[0];
    const buyer = await createAuthenticatedUser({
      email: 'voucher-buyer@example.com',
      credits: 2,
      deviceId: 'voucher-buyer-device',
    });

    const redeem = () => exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      buyer.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'voucher-buyer-device',
          'CF-Connecting-IP': '203.0.113.80',
        },
        body: JSON.stringify({ code: voucher.code }),
      },
    ));
    const first = await redeem();
    const second = await redeem();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await jsonResponse(second)).toMatchObject({
      ok: true,
      already_redeemed: true,
      credits_added: 300,
    });

    const [card, order, balance, grantCount, ledgerCount] = await Promise.all([
      env.DB.prepare(
        `SELECT status, redeemed_by, redeem_order_id
         FROM voucher_cards WHERE id = ?`
      ).bind(voucher.id).first(),
      env.DB.prepare(
        `SELECT payment_method, base_credits, currency, status, voucher_card_id
         FROM orders WHERE voucher_card_id = ?`
      ).bind(voucher.id).first(),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(buyer.userId).first('credits'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_grants
         WHERE order_id = ?`
      ).bind(`voucher:${voucher.id}`).first('count'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_ledger
         WHERE order_id = ? AND reason = 'voucher_redeem'`
      ).bind(`voucher:${voucher.id}`).first('count'),
    ]);
    expect(card).toMatchObject({
      status: 'redeemed',
      redeemed_by: buyer.userId,
      redeem_order_id: `voucher:${voucher.id}`,
    });
    expect(order).toMatchObject({
      payment_method: 'voucher',
      base_credits: 300,
      currency: 'CNY',
      status: 'completed',
      voucher_card_id: voucher.id,
    });
    expect(balance).toBe(302);
    expect(grantCount).toBe(1);
    expect(ledgerCount).toBe(1);
  });

  it('atomically allows only one of two users to redeem the same card', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 1000 });
    const voucher = generated.body.vouchers[0];
    const firstBuyer = await createAuthenticatedUser({
      email: 'voucher-first@example.com',
      credits: 0,
    });
    const secondBuyer = await createAuthenticatedUser({
      email: 'voucher-second@example.com',
      credits: 0,
      deviceId: 'voucher-second-device',
    });
    const request = (buyer, ip) => exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      buyer.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': `device-${ip}`,
          'CF-Connecting-IP': ip,
        },
        body: JSON.stringify({ code: voucher.code }),
      },
    ));
    const responses = await Promise.all([
      request(firstBuyer, '203.0.113.81'),
      request(secondBuyer, '203.0.113.82'),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);

    const balances = await env.DB.prepare(
      `SELECT credits FROM user_credits
       WHERE user_id IN (?, ?) ORDER BY credits`
    ).bind(firstBuyer.userId, secondBuyer.userId).all();
    expect(balances.results.map((row) => row.credits)).toEqual([0, 1000]);
    const orders = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM orders WHERE voucher_card_id = ?`
    ).bind(voucher.id).first('count');
    expect(orders).toBe(1);
  });

  it('limits invalid attempts and does not redeem a void card', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 100 });
    const voucher = generated.body.vouchers[0];
    const voided = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/void`,
      admin.cookie,
      { method: 'POST' },
    ));
    expect(voided.status).toBe(200);

    const buyer = await createAuthenticatedUser({
      email: 'limited@example.com',
      credits: 0,
    });
    const attempt = (code) => exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      buyer.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'rate-limited-device',
          'CF-Connecting-IP': '203.0.113.90',
        },
        body: JSON.stringify({ code }),
      },
    ));
    const voidResponse = await attempt(voucher.code);
    expect(voidResponse.status).toBe(400);
    expect(await jsonResponse(voidResponse)).toEqual({
      error: 'Voucher is invalid, already used, or no longer available.',
    });
    for (let index = 0; index < 4; index += 1) {
      expect((await attempt(`invalid-${index}`)).status).toBe(400);
    }
    const limited = await attempt('invalid-5');
    expect(limited.status).toBe(429);
    const balance = await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(buyer.userId).first('credits');
    expect(balance).toBe(0);
  });
});

describe('PayPal order flow', () => {
  it('requires authentication before creating an order', async () => {
    const response = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/paypal/create-order`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'credits_100' }),
      },
    ));
    expect(response.status).toBe(401);
  });

  it('rejects an old or unknown plan before contacting PayPal', async () => {
    const { cookie } = await createAuthenticatedUser();
    const outboundFetch = vi.fn();
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/create-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ plan: 'starter_monthly' }),
      },
    ));
    expect(response.status).toBe(400);
    expect(outboundFetch).not.toHaveBeenCalled();
  });

  it('creates a USD one-time pack and records a pending order', async () => {
    const { cookie, userId } = await createAuthenticatedUser();
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/v2/checkout/orders')) {
        return Response.json({
          id: 'PAYPAL-ORDER-1',
          links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/create-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ plan: 'credits_100' }),
      },
    ));
    expect(response.status).toBe(200);

    const order = await env.DB.prepare(
      `SELECT user_id, plan, amount, credits, base_credits, currency, status
       FROM orders WHERE id = ?`
    ).bind('PAYPAL-ORDER-1').first();
    expect(order).toEqual(expect.objectContaining({
      user_id: userId,
      plan: 'credits_100',
      amount: 3.49,
      credits: 100,
      base_credits: 100,
      currency: 'USD',
      status: 'pending',
    }));

    const createCall = outboundFetch.mock.calls.find(([input]) =>
      String(input).endsWith('/v2/checkout/orders'));
    const createBody = JSON.parse(createCall[1].body);
    expect(createBody.purchase_units[0].amount).toEqual({
      currency_code: 'USD',
      value: '3.49',
    });
  });

  it('adds paid credits once for sequential duplicate capture callbacks', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 5 });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES (?, ?, 'credits_100', 3.49, 100, 100, 'USD', 'pending')`
    ).bind('PAYPAL-ORDER-2', userId).run();

    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({ orderId: 'PAYPAL-ORDER-2' }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);

    const capture = () => exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'PAYPAL-ORDER-2' }),
      },
    ));
    const first = await capture();
    const second = await capture();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await jsonResponse(second)).toMatchObject({ alreadyProcessed: true });

    const credits = await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first('credits');
    expect(credits).toBe(105);
    const grants = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_grants
       WHERE order_id = 'PAYPAL-ORDER-2'`
    ).first('count');
    expect(grants).toBe(1);
  });

  it('atomically prevents duplicate credits from concurrent capture callbacks', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 0 });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES (?, ?, 'credits_300', 8.99, 300, 300, 'USD', 'pending')`
    ).bind('PAYPAL-CONCURRENT', userId).run();

    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({
          orderId: 'PAYPAL-CONCURRENT',
          captureId: 'CAPTURE-CONCURRENT',
          amount: '8.99',
        }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);

    const request = () => exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'PAYPAL-CONCURRENT' }),
      },
    ));
    const responses = await Promise.all([request(), request()]);
    expect(responses.every((response) => response.status === 200)).toBe(true);

    const [credits, grants, ledgers] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(userId).first('credits'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_grants
         WHERE order_id = 'PAYPAL-CONCURRENT'`
      ).first('count'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_ledger
         WHERE order_id = 'PAYPAL-CONCURRENT' AND reason = 'paypal_purchase'`
      ).first('count'),
    ]);
    expect(credits).toBe(300);
    expect(grants).toBe(1);
    expect(ledgers).toBe(1);
  });

  it('rejects capture when the PayPal order belongs to another user', async () => {
    const first = await createAuthenticatedUser({
      email: 'owner@example.com',
      credits: 0,
    });
    const second = await createAuthenticatedUser({
      email: 'attacker@example.com',
      credits: 0,
      deviceId: 'attacker-device',
    });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES ('OWNED-ORDER', ?, 'credits_100', 3.49, 100, 100, 'USD', 'pending')`
    ).bind(first.userId).run();
    const outboundFetch = vi.fn();
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      second.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'OWNED-ORDER' }),
      },
    ));
    expect(response.status).toBe(404);
    expect(outboundFetch).not.toHaveBeenCalled();
  });

  it('rejects a captured amount mismatch without granting credits', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 0 });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES ('MISMATCH-ORDER', ?, 'credits_100', 3.49, 100, 100, 'USD', 'pending')`
    ).bind(userId).run();
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      return Response.json(completedPayPalOrder({
        orderId: 'MISMATCH-ORDER',
        amount: '1.00',
      }));
    });
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'MISMATCH-ORDER' }),
      },
    ));
    expect(response.status).toBe(409);
    const credits = await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first('credits');
    expect(credits).toBe(0);
  });
});

describe('referral purchase rewards', () => {
  it('returns available rewards, expiry, masked invitees, and reversal history', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'REWARD-DETAILS' });
    const orderId = 'REWARD-DETAILS-ORDER';
    const grantId = `first-referral:${orderId}:referrer`;
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders
         (id, user_id, plan, amount, credits, base_credits, currency, status,
          completed_at, payment_method, is_first_qualified_purchase,
          referrer_user_id_snapshot)
         VALUES (?, ?, 'voucher_300', 60, 300, 300, 'CNY', 'completed',
                 unixepoch(), 'voucher', 1, ?)`
      ).bind(orderId, invitee.userId, referrer.userId),
      env.DB.prepare(
        `UPDATE referrals
         SET status = 'qualified', first_paid_order_id = ?, first_paid_at = unixepoch()
         WHERE referred_user_id = ?`
      ).bind(orderId, invitee.userId),
      env.DB.prepare(
        `INSERT INTO credit_grants
         (id, user_id, credit_type, granted_credits, remaining_credits,
          order_id, related_user_id, expires_at, idempotency_key)
         VALUES (?, ?, 'referral', 45, 45, ?, ?, unixepoch() + ?, ?)`
      ).bind(
        grantId,
        referrer.userId,
        orderId,
        invitee.userId,
        90 * 24 * 60 * 60,
        grantId,
      ),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id,
          related_user_id, idempotency_key)
         VALUES (?, ?, 45, 'referral', 'referral_first_purchase', ?, ?, ?, ?)`
      ).bind(grantId, referrer.userId, grantId, orderId, invitee.userId, grantId),
      env.DB.prepare(
        'UPDATE user_credits SET credits = credits + 45 WHERE user_id = ?'
      ).bind(referrer.userId),
    ]);

    const available = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    )));
    expect(available).toMatchObject({
      pending_reward_credits: 0,
      available_reward_credits: 45,
      total_reward_credits: 45,
      reversed_reward_credits: 0,
      expired_reward_credits: 0,
      reward_release_policy: 'seven_day_observation',
      registered_count: 1,
      paid_count: 1,
    });
    expect(available.next_reward_expiry_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 89 * 24 * 60 * 60,
    );
    expect(available.reward_history).toHaveLength(1);
    expect(available.reward_history[0]).toMatchObject({
      delta: 45,
      reason: 'referral_first_purchase',
      status: 'available',
      remaining_credits: 45,
    });
    expect(available.reward_history[0].related_email).not.toBe(
      'REWARD-DETAILS-invitee@example.com',
    );
    expect(available.invitees).toHaveLength(1);
    expect(available.invitees[0]).toMatchObject({
      status: 'qualified',
      risk_status: 'normal',
    });
    expect(available.invitees[0].email).not.toBe(
      'REWARD-DETAILS-invitee@example.com',
    );

    const reversalId = 'REWARD-DETAILS-REVERSAL';
    await env.DB.batch([
      env.DB.prepare(
        'UPDATE credit_grants SET remaining_credits = 0 WHERE id = ?'
      ).bind(grantId),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id,
          related_user_id, idempotency_key, reversal_of)
         VALUES (?, ?, -45, 'referral', 'voucher_dispute_referral', ?, ?, ?, ?, ?)`
      ).bind(
        reversalId,
        referrer.userId,
        grantId,
        orderId,
        invitee.userId,
        reversalId,
        grantId,
      ),
      env.DB.prepare(
        'UPDATE user_credits SET credits = credits - 45 WHERE user_id = ?'
      ).bind(referrer.userId),
    ]);

    const reversed = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    )));
    expect(reversed).toMatchObject({
      pending_reward_credits: 0,
      available_reward_credits: 0,
      total_reward_credits: 45,
      reversed_reward_credits: 45,
      reward_release_policy: 'seven_day_observation',
    });
    expect(reversed.next_reward_expiry_at).toBeNull();
    expect(reversed.reward_history.find((entry) => entry.id === grantId)).toMatchObject({
      status: 'reversed',
    });
    expect(reversed.reward_history.find((entry) => entry.id === reversalId)).toMatchObject({
      delta: -45,
      status: 'reversal',
      reversal_of: grantId,
    });
  });

  it('grants a 30-credit invitee bonus and 15% first-purchase referral reward once', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'FIRST-REWARD' });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES ('FIRST-REWARD-ORDER', ?, 'credits_300', 8.99, 300, 300, 'USD', 'pending')`
    ).bind(invitee.userId).run();

    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({
          orderId: 'FIRST-REWARD-ORDER',
          captureId: 'FIRST-REWARD-CAPTURE',
          amount: '8.99',
          payerId: 'FIRST-REWARD-BUYER-PAYER',
        }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const captureRequest = () => exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      invitee.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'FIRST-REWARD-ORDER' }),
      },
    ));
    expect((await captureRequest()).status).toBe(200);
    expect((await captureRequest()).status).toBe(200);
    const pendingHold = await env.DB.prepare(
      `SELECT status, pending_promotion_credits, pending_referral_credits,
              release_at
       FROM referral_reward_holds WHERE order_id = 'FIRST-REWARD-ORDER'`
    ).first();
    expect(pendingHold).toEqual(expect.objectContaining({
      status: 'pending',
      pending_promotion_credits: 30,
      pending_referral_credits: 45,
    }));
    expect(pendingHold.release_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 6 * 24 * 60 * 60,
    );
    await exports.default.scheduled(
      { cron: '17 * * * *', scheduledTime: Date.now() },
      env,
    );
    expect(await env.DB.prepare(
      `SELECT status FROM referral_reward_holds
       WHERE order_id = 'FIRST-REWARD-ORDER'`
    ).first('status')).toBe('pending');
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(invitee.userId).first('credits')).toBe(300);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(referrer.userId).first('credits')).toBe(0);
    const pendingOverview = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    )));
    expect(pendingOverview).toMatchObject({
      pending_reward_credits: 45,
      available_reward_credits: 0,
      reward_release_policy: 'seven_day_observation',
    });
    expect(pendingOverview.next_pending_release_at).toBe(pendingHold.release_at);
    await releasePendingRewardHolds();

    const [inviteeBalance, referrerBalance, order, grants, relationship] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT bonus_credits, is_first_qualified_purchase,
                referrer_user_id_snapshot, referral_processed_at
         FROM orders WHERE id = 'FIRST-REWARD-ORDER'`
      ).first(),
      env.DB.prepare(
        `SELECT credit_type, granted_credits, expires_at
         FROM credit_grants
         WHERE order_id = 'FIRST-REWARD-ORDER'
         ORDER BY credit_type`
      ).all(),
      env.DB.prepare(
        `SELECT status, first_paid_order_id, risk_status
         FROM referrals WHERE referred_user_id = ?`
      ).bind(invitee.userId).first(),
    ]);

    expect(inviteeBalance).toBe(330);
    expect(referrerBalance).toBe(45);
    expect(order).toEqual(expect.objectContaining({
      bonus_credits: 30,
      is_first_qualified_purchase: 1,
      referrer_user_id_snapshot: referrer.userId,
    }));
    expect(order.referral_processed_at).toBeTypeOf('number');
    expect(grants.results.map((grant) => [grant.credit_type, grant.granted_credits])).toEqual([
      ['paid', 300],
      ['promotion', 30],
      ['referral', 45],
    ]);
    const referralGrant = grants.results.find((grant) => grant.credit_type === 'referral');
    expect(referralGrant.expires_at).toBeGreaterThan(
      Math.floor(Date.now() / 1000) + 89 * 24 * 60 * 60,
    );
    expect(relationship).toEqual(expect.objectContaining({
      status: 'qualified',
      first_paid_order_id: 'FIRST-REWARD-ORDER',
      risk_status: 'normal',
    }));
  });

  it('uses 10% for a later purchase without repeating the invitee bonus', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'REPEAT-REWARD' });
    const orders = [
      ['REPEAT-FIRST', 'credits_300', 8.99, 300],
      ['REPEAT-SECOND', 'credits_1000', 23.99, 1000],
    ];
    for (const [id, plan, amount, credits] of orders) {
      await env.DB.prepare(
        `INSERT INTO orders
         (id, user_id, plan, amount, credits, base_credits, currency, status)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', 'pending')`
      ).bind(id, invitee.userId, plan, amount, credits, credits).run();
    }

    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.includes('REPEAT-FIRST') && url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({
          orderId: 'REPEAT-FIRST',
          captureId: 'REPEAT-FIRST-CAPTURE',
          amount: '8.99',
          payerId: 'REPEAT-BUYER-PAYER',
        }));
      }
      if (url.includes('REPEAT-SECOND') && url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({
          orderId: 'REPEAT-SECOND',
          captureId: 'REPEAT-SECOND-CAPTURE',
          amount: '23.99',
          payerId: 'REPEAT-BUYER-PAYER',
        }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    for (const orderId of ['REPEAT-FIRST', 'REPEAT-SECOND']) {
      const response = await exports.default.fetch(authenticatedRequest(
        '/api/paypal/capture-order',
        invitee.cookie,
        {
          method: 'POST',
          body: JSON.stringify({ orderId }),
        },
      ));
      expect(response.status).toBe(200);
    }
    await releasePendingRewardHolds();

    const [inviteeBalance, referrerBalance, secondOrder, secondRewards] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT bonus_credits, is_first_qualified_purchase
         FROM orders WHERE id = 'REPEAT-SECOND'`
      ).first(),
      env.DB.prepare(
        `SELECT credit_type, granted_credits
         FROM credit_grants WHERE order_id = 'REPEAT-SECOND'
         ORDER BY credit_type`
      ).all(),
    ]);
    expect(inviteeBalance).toBe(1330);
    expect(referrerBalance).toBe(145);
    expect(secondOrder).toEqual({
      bonus_credits: 0,
      is_first_qualified_purchase: 0,
    });
    expect(secondRewards.results.map((grant) => [grant.credit_type, grant.granted_credits])).toEqual([
      ['paid', 1000],
      ['referral', 100],
    ]);
  });

  it('classifies exactly one of two concurrent purchases as the first purchase', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'DUAL-FIRST' });
    for (const orderId of ['DUAL-FIRST-A', 'DUAL-FIRST-B']) {
      await env.DB.prepare(
        `INSERT INTO orders
         (id, user_id, plan, amount, credits, base_credits, currency, status)
         VALUES (?, ?, 'credits_300', 8.99, 300, 300, 'USD', 'pending')`
      ).bind(orderId, invitee.userId).run();
    }

    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/capture')) {
        const orderId = url.includes('DUAL-FIRST-A') ? 'DUAL-FIRST-A' : 'DUAL-FIRST-B';
        return Response.json(completedPayPalOrder({
          orderId,
          captureId: `CAPTURE-${orderId}`,
          amount: '8.99',
          payerId: 'DUAL-FIRST-BUYER-PAYER',
        }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    }));

    const capture = (orderId) => exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      invitee.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      },
    ));
    const responses = await Promise.all([
      capture('DUAL-FIRST-A'),
      capture('DUAL-FIRST-B'),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    await releasePendingRewardHolds();

    const [firstCount, inviteeBalance, referrerBalance, promotionCount, referralTotal] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM orders
         WHERE user_id = ? AND is_first_qualified_purchase = 1`
      ).bind(invitee.userId).first('count'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_grants
         WHERE user_id = ? AND credit_type = 'promotion'`
      ).bind(invitee.userId).first('count'),
      env.DB.prepare(
        `SELECT SUM(granted_credits) AS total FROM credit_grants
         WHERE user_id = ? AND credit_type = 'referral'`
      ).bind(referrer.userId).first('total'),
    ]);
    expect(firstCount).toBe(1);
    expect(inviteeBalance).toBe(630);
    expect(referrerBalance).toBe(75);
    expect(promotionCount).toBe(1);
    expect(referralTotal).toBe(75);
  });

  it('blocks both rewards when the referrer and invitee use the same PayPal payer', async () => {
    const { referrer, invitee } = await createReferredPair({
      label: 'PAYER-CONFLICT',
      referrerPayerId: 'SHARED-PAYER',
    });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES ('PAYER-CONFLICT-ORDER', ?, 'credits_300', 8.99, 300, 300, 'USD', 'pending')`
    ).bind(invitee.userId).run();

    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      return Response.json(completedPayPalOrder({
        orderId: 'PAYER-CONFLICT-ORDER',
        captureId: 'PAYER-CONFLICT-CAPTURE',
        amount: '8.99',
        payerId: 'SHARED-PAYER',
      }));
    }));

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      invitee.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'PAYER-CONFLICT-ORDER' }),
      },
    ));
    expect(response.status).toBe(200);
    await releasePendingRewardHolds();

    const [inviteeBalance, referrerBalance, relationship, grants] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        'SELECT status, risk_status FROM referrals WHERE referred_user_id = ?'
      ).bind(invitee.userId).first(),
      env.DB.prepare(
        `SELECT credit_type FROM credit_grants
         WHERE order_id = 'PAYER-CONFLICT-ORDER'`
      ).all(),
    ]);
    expect(inviteeBalance).toBe(300);
    expect(referrerBalance).toBe(0);
    expect(relationship).toEqual({ status: 'rejected', risk_status: 'rejected' });
    expect(grants.results.map((grant) => grant.credit_type)).toEqual(['paid']);
  });

  it('applies the same first-purchase rewards to a voucher redemption', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'VOUCHER-REWARD' });
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 300 });
    const voucher = generated.body.vouchers[0];

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      invitee.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'voucher-reward-invitee',
          'CF-Connecting-IP': '203.0.113.101',
        },
        body: JSON.stringify({ code: voucher.code }),
      },
    ));
    expect(response.status).toBe(200);
    await releasePendingRewardHolds();

    const [inviteeBalance, referrerBalance, order] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT bonus_credits, is_first_qualified_purchase,
                referrer_user_id_snapshot
         FROM orders WHERE voucher_card_id = ?`
      ).bind(voucher.id).first(),
    ]);
    expect(inviteeBalance).toBe(330);
    expect(referrerBalance).toBe(45);
    expect(order).toEqual({
      bonus_credits: 30,
      is_first_qualified_purchase: 1,
      referrer_user_id_snapshot: referrer.userId,
    });
  });

  it('atomically binds a qualified referral code during the first voucher redemption', async () => {
    const referrer = await createAuthenticatedUser({
      email: 'voucher-code-referrer@example.com',
      credits: 0,
    });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status,
        completed_at, payment_method)
       VALUES ('VOUCHER-CODE-REFERRER-ORDER', ?, 'voucher_100', 22, 100, 100,
               'CNY', 'completed', unixepoch(), 'voucher')`
    ).bind(referrer.userId).run();
    const referral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
    )));
    const invitee = await createAuthenticatedUser({
      email: 'voucher-code-invitee@example.com',
      credits: 0,
      deviceId: 'voucher-code-invitee-device',
    });
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 300 });
    const voucher = generated.body.vouchers[0];

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      invitee.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'voucher-code-invitee-device',
          'CF-Connecting-IP': '203.0.113.102',
        },
        body: JSON.stringify({
          code: voucher.code,
          referral_code: referral.code,
        }),
      },
    ));
    expect(response.status).toBe(200);
    await releasePendingRewardHolds();

    const [relationship, inviteeBalance, referrerBalance] = await Promise.all([
      env.DB.prepare(
        `SELECT referrer_user_id, referral_code, source, status, first_paid_order_id
         FROM referrals WHERE referred_user_id = ?`
      ).bind(invitee.userId).first(),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
    ]);
    expect(relationship).toEqual({
      referrer_user_id: referrer.userId,
      referral_code: referral.code,
      source: 'voucher',
      status: 'qualified',
      first_paid_order_id: `voucher:${voucher.id}`,
    });
    expect(inviteeBalance).toBe(330);
    expect(referrerBalance).toBe(45);
  });

  it('leaves a voucher untouched when its referral code is invalid', async () => {
    const invitee = await createAuthenticatedUser({
      email: 'invalid-voucher-referral@example.com',
      credits: 0,
    });
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 300 });
    const voucher = generated.body.vouchers[0];

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      invitee.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'invalid-voucher-referral-device',
          'CF-Connecting-IP': '203.0.113.103',
        },
        body: JSON.stringify({
          code: voucher.code,
          referral_code: 'ABCDEFGH',
        }),
      },
    ));
    expect(response.status).toBe(409);

    const [card, orders, relationships, balance] = await Promise.all([
      env.DB.prepare('SELECT status, redeemed_by FROM voucher_cards WHERE id = ?')
        .bind(voucher.id).first(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM orders WHERE voucher_card_id = ?')
        .bind(voucher.id).first('count'),
      env.DB.prepare('SELECT COUNT(*) AS count FROM referrals WHERE referred_user_id = ?')
        .bind(invitee.userId).first('count'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
    ]);
    expect(card).toEqual({ status: 'generated', redeemed_by: null });
    expect(orders).toBe(0);
    expect(relationships).toBe(0);
    expect(balance).toBe(0);
  });
});

describe('voucher referral risk review', () => {
  async function createRiskReview(label, { sameDevice = true } = {}) {
    const referrer = await createAuthenticatedUser({
      email: `${label}-risk-referrer@example.com`,
      credits: 0,
      deviceId: `${label}-owner-device`,
    });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status,
        completed_at, payment_method)
       VALUES (?, ?, 'voucher_100', 22, 100, 100, 'CNY', 'completed',
               unixepoch(), 'voucher')`
    ).bind(`${label}-RISK-REFERRER-ORDER`, referrer.userId).run();
    const referral = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/referrals/me',
      referrer.cookie,
      {
        headers: {
          'X-Device-ID': `${label}-owner-device`,
          'CF-Connecting-IP': '203.0.113.210',
        },
      },
    )));
    const invitee = await createAuthenticatedUser({
      email: `${label}-risk-invitee@example.com`,
      credits: 0,
      deviceId: `${label}-invitee-device`,
    });
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 300 });
    const voucher = generated.body.vouchers[0];
    const response = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      invitee.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': sameDevice
            ? `${label}-owner-device`
            : `${label}-invitee-device`,
          'CF-Connecting-IP': sameDevice ? '198.51.100.210' : '203.0.113.210',
        },
        body: JSON.stringify({
          code: voucher.code,
          referral_code: referral.code,
        }),
      },
    ));
    expect(response.status).toBe(200);
    const review = await env.DB.prepare(
      'SELECT * FROM referral_reward_reviews WHERE order_id = ?'
    ).bind(`voucher:${voucher.id}`).first();
    return { referrer, invitee, admin, voucher, review };
  }

  it('holds same-device rewards and approval releases them exactly once', async () => {
    const { referrer, invitee, admin, review } = await createRiskReview('approve');
    expect(review).toEqual(expect.objectContaining({
      pending_promotion_credits: 30,
      pending_referral_credits: 45,
      status: 'pending',
    }));
    expect(JSON.parse(review.risk_reasons_json)).toContain('same_device');
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(invitee.userId).first('credits')).toBe(300);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(referrer.userId).first('credits')).toBe(0);

    expect((await exports.default.fetch(authenticatedRequest(
      '/api/admin/referral-reviews?status=pending',
      invitee.cookie,
    ))).status).toBe(403);
    const queue = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/admin/referral-reviews?status=pending',
      admin.cookie,
    )));
    expect(queue.reviews[0]).toEqual(expect.objectContaining({
      risk_reasons: expect.arrayContaining(['same_device']),
      referrer_email: expect.stringContaining('*'),
      referred_email: expect.stringContaining('*'),
    }));
    expect(JSON.stringify(queue)).not.toContain('owner-device');

    const approve = () => exports.default.fetch(authenticatedRequest(
      `/api/admin/referral-reviews/${encodeURIComponent(review.id)}/approve`,
      admin.cookie,
      { method: 'POST', body: JSON.stringify({ note: '身份核验通过' }) },
    ));
    expect((await approve()).status).toBe(200);
    expect((await approve()).status).toBe(200);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(invitee.userId).first('credits')).toBe(300);
    expect(await env.DB.prepare(
      `SELECT status FROM referral_reward_holds WHERE order_id = ?`
    ).bind(review.order_id).first('status')).toBe('pending');
    await releasePendingRewardHolds();
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(invitee.userId).first('credits')).toBe(330);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(referrer.userId).first('credits')).toBe(45);
    expect(await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM credit_ledger WHERE order_id = ?'
    ).bind(review.order_id).first('count')).toBe(3);
  });

  it('rejects held rewards permanently and recent same-IP binding only enters review', async () => {
    const rejected = await createRiskReview('reject');
    const reject = await exports.default.fetch(authenticatedRequest(
      `/api/admin/referral-reviews/${encodeURIComponent(rejected.review.id)}/reject`,
      rejected.admin.cookie,
      { method: 'POST', body: JSON.stringify({ note: '确认属于自我邀请' }) },
    ));
    expect(reject.status).toBe(200);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(rejected.invitee.userId).first('credits')).toBe(300);
    expect(await env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
      .bind(rejected.referrer.userId).first('credits')).toBe(0);

    const sameIp = await createRiskReview('same-ip', { sameDevice: false });
    expect(sameIp.review).not.toBeNull();
    expect(JSON.parse(sameIp.review.risk_reasons_json)).toContain('same_ip_recent_binding');
  });
});

describe('Xianyu voucher dispute reversal', () => {
  it('requires an administrator, a completed redemption, and a detailed reason', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const regular = await createAuthenticatedUser({
      email: 'voucher-dispute-regular@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 100 });
    const voucher = generated.body.vouchers[0];

    const forbidden = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/dispute-reverse`,
      regular.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'The buyer opened a completed Xianyu dispute.' }),
      },
    ));
    expect(forbidden.status).toBe(403);

    const shortReason = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/dispute-reverse`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'too short' }),
      },
    ));
    expect(shortReason.status).toBe(400);

    const unredeemed = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/dispute-reverse`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'The buyer opened a completed Xianyu dispute.' }),
      },
    ));
    expect(unredeemed.status).toBe(409);

    const [disputes, ledgers] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM voucher_disputes').first('count'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_ledger
         WHERE reason LIKE 'voucher_dispute%'`
      ).first('count'),
    ]);
    expect(disputes).toBe(0);
    expect(ledgers).toBe(0);
  });

  it('atomically reverses paid, promotion, and referral credits exactly once', async () => {
    const { referrer, invitee } = await createReferredPair({
      label: 'VOUCHER-DISPUTE',
    });
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, {
      credits: 300,
      salesOrderRef: 'XY-DISPUTE-300',
    });
    const voucher = generated.body.vouchers[0];
    const redeem = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      invitee.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'voucher-dispute-invitee',
          'CF-Connecting-IP': '203.0.113.104',
        },
        body: JSON.stringify({ code: voucher.code }),
      },
    ));
    expect(redeem.status).toBe(200);

    const reverse = () => exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/dispute-reverse`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Xianyu dispute was decided for the buyer and the payment was returned.',
        }),
      },
    ));
    const first = await reverse();
    const second = await reverse();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await jsonResponse(first)).toMatchObject({
      ok: true,
      already_reversed: false,
      dispute: {
        reversed_paid_credits: 300,
        reversed_promotion_credits: 0,
        reversed_referral_credits: 0,
      },
    });
    expect(await jsonResponse(second)).toMatchObject({
      ok: true,
      already_reversed: true,
    });

    const [
      inviteeBalance,
      referrerBalance,
      card,
      order,
      grants,
      reversals,
      disputeCount,
      auditCount,
      relationship,
      holdStatus,
    ] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT status, dispute_status, disputed_at
         FROM voucher_cards WHERE id = ?`
      ).bind(voucher.id).first(),
      env.DB.prepare(
        `SELECT status, is_first_qualified_purchase, refund_amount
         FROM orders WHERE voucher_card_id = ?`
      ).bind(voucher.id).first(),
      env.DB.prepare(
        `SELECT credit_type, remaining_credits
         FROM credit_grants WHERE order_id = ?
         ORDER BY credit_type`
      ).bind(`voucher:${voucher.id}`).all(),
      env.DB.prepare(
        `SELECT reason, delta, reversal_of
         FROM credit_ledger WHERE order_id = ? AND delta < 0
         ORDER BY reason`
      ).bind(`voucher:${voucher.id}`).all(),
      env.DB.prepare(
        'SELECT COUNT(*) AS count FROM voucher_disputes WHERE card_id = ?'
      ).bind(voucher.id).first('count'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM voucher_admin_audit
         WHERE card_id = ? AND action = 'dispute_reverse'`
      ).bind(voucher.id).first('count'),
      env.DB.prepare(
        `SELECT status, first_paid_order_id
         FROM referrals WHERE referred_user_id = ?`
      ).bind(invitee.userId).first(),
      env.DB.prepare(
        `SELECT status FROM referral_reward_holds WHERE order_id = ?`
      ).bind(`voucher:${voucher.id}`).first('status'),
    ]);
    expect(inviteeBalance).toBe(0);
    expect(referrerBalance).toBe(0);
    expect(card).toMatchObject({
      status: 'redeemed',
      dispute_status: 'reversed',
    });
    expect(card.disputed_at).toBeTypeOf('number');
    expect(order).toEqual({
      status: 'refunded',
      is_first_qualified_purchase: 0,
      refund_amount: '60.00',
    });
    expect(grants.results).toEqual([
      { credit_type: 'paid', remaining_credits: 0 },
    ]);
    expect(reversals.results).toEqual([
      expect.objectContaining({ reason: 'voucher_dispute', delta: -300 }),
    ]);
    expect(reversals.results.every((entry) => entry.reversal_of)).toBe(true);
    expect(disputeCount).toBe(1);
    expect(auditCount).toBe(1);
    expect(relationship).toEqual({ status: 'bound', first_paid_order_id: null });
    expect(holdStatus).toBe('cancelled');

    const list = await jsonResponse(await exports.default.fetch(authenticatedRequest(
      '/api/admin/vouchers?status=disputed',
      admin.cookie,
    )));
    expect(list.vouchers).toHaveLength(1);
    expect(list.vouchers[0]).toMatchObject({
      id: voucher.id,
      status: 'redeemed',
      dispute_status: 'reversed',
      dispute_reason: 'Xianyu dispute was decided for the buyer and the payment was returned.',
    });
  });

  it('records a negative aggregate balance when redeemed credits were already spent', async () => {
    const admin = await createAuthenticatedUser({
      email: 'admin@example.com',
      credits: 0,
    });
    const buyer = await createAuthenticatedUser({
      email: 'voucher-dispute-spent@example.com',
      credits: 0,
    });
    const generated = await generateVoucher(admin.cookie, { credits: 100 });
    const voucher = generated.body.vouchers[0];
    const orderId = `voucher:${voucher.id}`;
    const redeem = await exports.default.fetch(authenticatedRequest(
      '/api/vouchers/redeem',
      buyer.cookie,
      {
        method: 'POST',
        headers: {
          'X-Device-ID': 'voucher-dispute-spent',
          'CF-Connecting-IP': '203.0.113.105',
        },
        body: JSON.stringify({ code: voucher.code }),
      },
    ));
    expect(redeem.status).toBe(200);

    const grant = await env.DB.prepare(
      `SELECT id FROM credit_grants
       WHERE order_id = ? AND credit_type = 'paid'`
    ).bind(orderId).first();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE credit_grants SET remaining_credits = 75 WHERE id = ?`
      ).bind(grant.id),
      env.DB.prepare(
        `UPDATE user_credits SET credits = 75 WHERE user_id = ?`
      ).bind(buyer.userId),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id,
          idempotency_key)
         VALUES ('spent-before-dispute', ?, -25, 'paid',
                 'ai_background_removal', ?, ?, 'spent-before-dispute')`
      ).bind(buyer.userId, grant.id, orderId),
    ]);

    const reversed = await exports.default.fetch(authenticatedRequest(
      `/api/admin/vouchers/${voucher.id}/dispute-reverse`,
      admin.cookie,
      {
        method: 'POST',
        body: JSON.stringify({
          reason: 'Xianyu dispute completed after some of the purchased credits were consumed.',
        }),
      },
    ));
    expect(reversed.status).toBe(200);

    const [aggregate, remaining] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(buyer.userId).first('credits'),
      env.DB.prepare('SELECT remaining_credits FROM credit_grants WHERE id = ?')
        .bind(grant.id).first('remaining_credits'),
    ]);
    expect(aggregate).toBe(-25);
    expect(remaining).toBe(0);
  });
});

describe('PayPal refund webhook', () => {
  it('verifies and reverses a full refund exactly once', async () => {
    const { userId } = await createAuthenticatedUser({ credits: 0 });
    const grantId = 'purchase:REFUND-ORDER:paid';
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO orders
         (id, user_id, plan, amount, credits, base_credits, currency, status,
          paypal_capture_id, completed_at)
         VALUES ('REFUND-ORDER', ?, 'credits_100', 3.49, 100, 100, 'USD',
                 'completed', 'CAPTURE-REFUND', unixepoch())`
      ).bind(userId),
      env.DB.prepare(
        `INSERT INTO credit_grants
         (id, user_id, credit_type, granted_credits, remaining_credits,
          order_id, idempotency_key)
         VALUES (?, ?, 'paid', 100, 100, 'REFUND-ORDER', ?)`
      ).bind(grantId, userId, grantId),
      env.DB.prepare(
        `INSERT INTO credit_ledger
         (id, user_id, delta, balance_type, reason, grant_id, order_id, idempotency_key)
         VALUES (?, ?, 100, 'paid', 'paypal_purchase', ?, 'REFUND-ORDER', ?)`
      ).bind(grantId, userId, grantId, grantId),
      env.DB.prepare(
        'UPDATE user_credits SET credits = 100 WHERE user_id = ?'
      ).bind(userId),
    ]);

    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
        return Response.json({ verification_status: 'SUCCESS' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);

    const event = {
      id: 'WH-REFUND-1',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id: 'CAPTURE-REFUND',
        amount: { value: '3.49', currency_code: 'USD' },
      },
    };
    const webhookRequest = () => new Request(`${API_ORIGIN}/api/paypal/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
        'PAYPAL-CERT-URL': 'https://api.paypal.com/cert.pem',
        'PAYPAL-TRANSMISSION-ID': 'transmission-1',
        'PAYPAL-TRANSMISSION-SIG': 'signature',
        'PAYPAL-TRANSMISSION-TIME': '2026-07-23T00:00:00Z',
      },
      body: JSON.stringify(event),
    });

    const first = await exports.default.fetch(webhookRequest());
    const second = await exports.default.fetch(webhookRequest());
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const [credits, grant, order, reversals] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(userId).first('credits'),
      env.DB.prepare('SELECT remaining_credits FROM credit_grants WHERE id = ?')
        .bind(grantId).first('remaining_credits'),
      env.DB.prepare('SELECT status FROM orders WHERE id = ?')
        .bind('REFUND-ORDER').first('status'),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM credit_ledger
         WHERE reason = 'paypal_refund' AND order_id = 'REFUND-ORDER'`
      ).first('count'),
    ]);
    expect(credits).toBe(0);
    expect(grant).toBe(0);
    expect(order).toBe('refunded');
    expect(reversals).toBe(1);
  });

  it('reverses paid, promotion, and referral grants from a referred first purchase', async () => {
    const { referrer, invitee } = await createReferredPair({ label: 'REFUND-REWARDS' });
    await env.DB.prepare(
      `INSERT INTO orders
       (id, user_id, plan, amount, credits, base_credits, currency, status)
       VALUES ('REFUND-REWARD-ORDER', ?, 'credits_300', 8.99, 300, 300, 'USD', 'pending')`
    ).bind(invitee.userId).run();

    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth2/token')) return Response.json({ access_token: 'TOKEN' });
      if (url.endsWith('/capture')) {
        return Response.json(completedPayPalOrder({
          orderId: 'REFUND-REWARD-ORDER',
          captureId: 'REFUND-REWARD-CAPTURE',
          amount: '8.99',
          payerId: 'REFUND-REWARD-BUYER-PAYER',
        }));
      }
      if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
        return Response.json({ verification_status: 'SUCCESS' });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', outboundFetch);

    const capture = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      invitee.cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'REFUND-REWARD-ORDER' }),
      },
    ));
    expect(capture.status).toBe(200);
    await releasePendingRewardHolds();

    const event = {
      id: 'WH-REFUND-REWARDS',
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: {
        id: 'REFUND-REWARD-CAPTURE',
        amount: { value: '8.99', currency_code: 'USD' },
      },
    };
    const webhook = () => exports.default.fetch(new Request(
      `${API_ORIGIN}/api/paypal/webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
          'PAYPAL-CERT-URL': 'https://api.paypal.com/cert.pem',
          'PAYPAL-TRANSMISSION-ID': 'refund-reward-transmission',
          'PAYPAL-TRANSMISSION-SIG': 'signature',
          'PAYPAL-TRANSMISSION-TIME': '2026-07-24T00:00:00Z',
        },
        body: JSON.stringify(event),
      },
    ));
    expect((await webhook()).status).toBe(200);
    expect((await webhook()).status).toBe(200);

    const [
      inviteeBalance,
      referrerBalance,
      order,
      grants,
      reversals,
      relationship,
    ] = await Promise.all([
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(invitee.userId).first('credits'),
      env.DB.prepare('SELECT credits FROM user_credits WHERE user_id = ?')
        .bind(referrer.userId).first('credits'),
      env.DB.prepare(
        `SELECT status, is_first_qualified_purchase
         FROM orders WHERE id = 'REFUND-REWARD-ORDER'`
      ).first(),
      env.DB.prepare(
        `SELECT credit_type, remaining_credits
         FROM credit_grants WHERE order_id = 'REFUND-REWARD-ORDER'
         ORDER BY credit_type`
      ).all(),
      env.DB.prepare(
        `SELECT reason, delta FROM credit_ledger
         WHERE order_id = 'REFUND-REWARD-ORDER' AND delta < 0
         ORDER BY reason`
      ).all(),
      env.DB.prepare(
        `SELECT status, first_paid_order_id
         FROM referrals WHERE referred_user_id = ?`
      ).bind(invitee.userId).first(),
    ]);
    expect(inviteeBalance).toBe(0);
    expect(referrerBalance).toBe(0);
    expect(order).toEqual({ status: 'refunded', is_first_qualified_purchase: 0 });
    expect(grants.results).toEqual([
      { credit_type: 'paid', remaining_credits: 0 },
      { credit_type: 'promotion', remaining_credits: 0 },
      { credit_type: 'referral', remaining_credits: 0 },
    ]);
    expect(reversals.results).toEqual([
      { reason: 'paypal_refund', delta: -300 },
      { reason: 'paypal_refund_promotion', delta: -30 },
      { reason: 'paypal_refund_referral', delta: -45 },
    ]);
    expect(relationship).toEqual({ status: 'bound', first_paid_order_id: null });
  });
});
