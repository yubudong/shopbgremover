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
    DELETE FROM webhook_events;
    DELETE FROM subscriptions;
    DELETE FROM sso_codes;
    DELETE FROM email_otps;
    DELETE FROM free_usage;
    DELETE FROM processing_history;
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
} = {}) {
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await env.DB.prepare(
    `INSERT INTO email_otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)`
  ).bind(email, code, expiresAt).run();

  const response = await exports.default.fetch(new Request(`${API_ORIGIN}/api/auth/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  }));

  expect(response.status).toBe(200);
  const cookie = response.headers.get('Set-Cookie');
  expect(cookie).toContain('session=');

  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  await env.DB.prepare(
    'UPDATE user_credits SET credits = ? WHERE user_id = ?'
  ).bind(credits, user.id).run();

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

describe('production schema baseline', () => {
  it('creates every production business table', async () => {
    const result = await env.DB.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf_%'
       ORDER BY name`
    ).all();

    expect(result.results.map((row) => row.name)).toEqual([
      'email_otps',
      'free_usage',
      'orders',
      'processing_history',
      'sso_codes',
      'subscriptions',
      'user_credits',
      'users',
      'webhook_events',
    ]);
  });

  it('keeps the billing columns observed in production', async () => {
    const result = await env.DB.prepare('PRAGMA table_info(user_credits)').all();
    const columns = result.results.map((row) => row.name);

    expect(columns).toEqual(expect.arrayContaining([
      'credits',
      'total_used',
      'sub_credits',
      'payg_credits',
      'plan',
      'sub_reset_at',
      'plan_renews_at',
      'bg_day',
      'bg_day_count',
    ]));
  });
});

describe('credit accounting', () => {
  it('deducts one credit for an authenticated user', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 2 });

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/use-credit',
      cookie,
      { method: 'POST' }
    ));

    expect(response.status).toBe(200);
    expect(await jsonResponse(response)).toMatchObject({ ok: true, remaining: 1 });

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 1, total_used: 1 }));
  });

  it('enforces the anonymous lifetime quota without exceeding it', async () => {
    const ip = '203.0.113.10';

    for (let index = 0; index < 10; index += 1) {
      const response = await exports.default.fetch(new Request(`${API_ORIGIN}/api/use-credit`, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': ip },
      }));
      expect(response.status).toBe(200);
    }

    const blocked = await exports.default.fetch(new Request(`${API_ORIGIN}/api/use-credit`, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': ip },
    }));
    expect(blocked.status).toBe(403);
    expect(await jsonResponse(blocked)).toMatchObject({ ok: false, reason: 'free_limit' });

    const usage = await env.DB.prepare(
      'SELECT count FROM free_usage WHERE ip = ?'
    ).bind(ip).first();
    expect(usage.count).toBe(10);
  });

  it('does not deduct credit when fal.ai fails', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    const outboundFetch = vi.fn(async () => new Response('upstream unavailable', { status: 503 }));
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/remove-bg',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ image_url: 'https://example.com/product.png' }),
      }
    ));

    expect(response.status).toBe(502);
    expect(outboundFetch).toHaveBeenCalledTimes(1);
    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 3, total_used: 0 }));
  });

  it('deducts exactly one credit after fal.ai and result download succeed', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 3 });
    let outboundCall = 0;
    const outboundFetch = vi.fn(async () => {
      outboundCall += 1;
      if (outboundCall === 1) {
        return Response.json({
          image: { url: 'https://cdn.example.com/result.png' },
        });
      }
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    });
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/remove-bg',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ image_url: 'https://example.com/product.png' }),
      }
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(outboundFetch).toHaveBeenCalledTimes(2);

    const credits = await env.DB.prepare(
      'SELECT credits, total_used FROM user_credits WHERE user_id = ?'
    ).bind(userId).first();
    expect(credits).toEqual(expect.objectContaining({ credits: 2, total_used: 1 }));
  });
});

describe('PayPal order flow', () => {
  it('requires authentication before creating an order', async () => {
    const response = await exports.default.fetch(new Request(
      `${API_ORIGIN}/api/paypal/create-order`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'payg_50' }),
      }
    ));

    expect(response.status).toBe(401);
  });

  it('rejects an unknown plan before contacting PayPal', async () => {
    const { cookie } = await createAuthenticatedUser();
    const outboundFetch = vi.fn();
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/create-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ plan: 'not-a-plan' }),
      }
    ));

    expect(response.status).toBe(400);
    expect(outboundFetch).not.toHaveBeenCalled();
  });

  it('records a pending order returned by PayPal', async () => {
    const { cookie, userId } = await createAuthenticatedUser();
    const outboundFetch = vi.fn(async () => Response.json({
      id: 'PAYPAL-ORDER-1',
      links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
    }));
    vi.stubGlobal('fetch', outboundFetch);

    const response = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/create-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ plan: 'payg_50' }),
      }
    ));

    expect(response.status).toBe(200);
    expect(await jsonResponse(response)).toEqual({
      orderId: 'PAYPAL-ORDER-1',
      approveUrl: 'https://paypal.example/approve',
    });

    const order = await env.DB.prepare(
      'SELECT user_id, plan, amount, credits, status FROM orders WHERE id = ?'
    ).bind('PAYPAL-ORDER-1').first();
    expect(order).toEqual(expect.objectContaining({
      user_id: userId,
      plan: 'payg_50',
      amount: 4.9,
      credits: 50,
      status: 'pending',
    }));
  });

  it('adds credits once for sequential duplicate capture callbacks', async () => {
    const { cookie, userId } = await createAuthenticatedUser({ credits: 5 });
    await env.DB.prepare(
      `INSERT INTO orders (id, user_id, plan, amount, credits, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    ).bind('PAYPAL-ORDER-2', userId, 'payg_50', 4.9, 50).run();

    const outboundFetch = vi.fn(async () => Response.json({ status: 'COMPLETED' }));
    vi.stubGlobal('fetch', outboundFetch);

    const first = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'PAYPAL-ORDER-2' }),
      }
    ));
    expect(first.status).toBe(200);
    expect(await jsonResponse(first)).toEqual({ ok: true, credits: 50 });

    const second = await exports.default.fetch(authenticatedRequest(
      '/api/paypal/capture-order',
      cookie,
      {
        method: 'POST',
        body: JSON.stringify({ orderId: 'PAYPAL-ORDER-2' }),
      }
    ));
    expect(second.status).toBe(400);
    expect(outboundFetch).toHaveBeenCalledTimes(1);

    const credits = await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(userId).first('credits');
    expect(credits).toBe(55);
  });

  it.todo('atomically prevents duplicate credits from concurrent capture callbacks');
  it.todo('rejects capture when the PayPal order belongs to a different user');
});
