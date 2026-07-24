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
    DELETE FROM ai_tasks;
    DELETE FROM credit_ledger;
    DELETE FROM credit_grants;
    DELETE FROM user_free_entitlements;
    DELETE FROM guest_ip_usage;
    DELETE FROM guest_usage;
    DELETE FROM webhook_events;
    DELETE FROM voucher_attempts;
    DELETE FROM voucher_admin_audit;
    DELETE FROM voucher_cards;
    DELETE FROM voucher_batches;
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
  const outboundFetch = vi.fn(async (input) => {
    const url = String(input);
    if (url === 'https://fal.run/fal-ai/birefnet') {
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
      'guest_ip_usage',
      'guest_usage',
      'orders',
      'processing_history',
      'referral_codes',
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
      'webhook_events',
    ]);
  });

  it('contains the credit-bucket and payment idempotency columns', async () => {
    const [credits, orders] = await Promise.all([
      env.DB.prepare('PRAGMA table_info(credit_grants)').all(),
      env.DB.prepare('PRAGMA table_info(orders)').all(),
    ]);

    expect(credits.results.map((row) => row.name)).toEqual(expect.arrayContaining([
      'credit_type',
      'remaining_credits',
      'expires_at',
      'idempotency_key',
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
    expect(outboundFetch).toHaveBeenCalledTimes(6);
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
    expect(outboundFetch).toHaveBeenCalledTimes(6);

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

  it('deducts once and reuses the result for the same AI task', async () => {
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
    expect(outboundFetch).toHaveBeenCalledTimes(3);

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

  it('allows only one concurrent execution of the same AI task', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 2 });
    let releaseFal;
    const falGate = new Promise((resolve) => {
      releaseFal = resolve;
    });
    const outboundFetch = vi.fn(async (input) => {
      const url = String(input);
      if (url === 'https://fal.run/fal-ai/birefnet') {
        await falGate;
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

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 1, total_used: 1 }));
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
