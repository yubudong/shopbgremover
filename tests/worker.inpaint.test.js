import { env, exports } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/index.js';

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
    DELETE FROM inpaint_tasks;
    DELETE FROM inpaint_batches;
    DELETE FROM credit_ledger;
    DELETE FROM credit_grants;
    DELETE FROM user_free_entitlements;
    DELETE FROM guest_ip_usage;
    DELETE FROM guest_usage;
    DELETE FROM email_otps;
    DELETE FROM user_credits;
    DELETE FROM users;
  `);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function body(response) {
  return JSON.parse(await response.text());
}

function overrideEnv(overrides) {
  return new Proxy(env, {
    get(target, property) {
      return Object.prototype.hasOwnProperty.call(overrides, property)
        ? overrides[property]
        : target[property];
    },
  });
}

async function login(email, deviceId, credits = 0) {
  await env.DB.prepare(
    `INSERT INTO email_otps (email, code, expires_at, attempts)
     VALUES (?, '123456', unixepoch() + 600, 0)`
  ).bind(email).run();
  const response = await exports.default.fetch(new Request(
    `${API_ORIGIN}/api/auth/email/verify`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
        'CF-Connecting-IP': '203.0.113.21',
      },
      body: JSON.stringify({ email, code: '123456' }),
    },
  ), env);
  expect(response.status).toBe(200);
  const cookie = response.headers.get('Set-Cookie').split(';', 1)[0];
  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();
  await env.DB.prepare('DELETE FROM credit_ledger WHERE user_id = ?').bind(user.id).run();
  await env.DB.prepare('DELETE FROM credit_grants WHERE user_id = ?').bind(user.id).run();
  await env.DB.prepare(
    'UPDATE user_credits SET credits = ?, total_used = 0 WHERE user_id = ?'
  ).bind(credits, user.id).run();
  return { cookie, userId: user.id };
}

function batchRequest({
  cookie,
  taskCount,
  clientBatchId,
  deviceId = 'inpaint-device',
} = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'X-Device-ID': deviceId,
    'CF-Connecting-IP': '203.0.113.88',
  });
  if (cookie) headers.set('Cookie', cookie);
  return new Request(`${API_ORIGIN}/api/inpaint/batches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      task_count: taskCount,
      client_batch_id: clientBatchId,
      mask_spec: {
        version: 1,
        shapes: [{ type: 'rect', x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
      },
    }),
  });
}

function authenticatedRequest(path, cookie, init = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cookie', cookie);
  return new Request(`${API_ORIGIN}${path}`, { ...init, headers });
}

function memoryR2() {
  const objects = new Map();
  return {
    objects,
    async put(key, value, options = {}) {
      const bytes = new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, { bytes, options });
    },
    async get(key) {
      const stored = objects.get(key);
      if (!stored) return null;
      const copy = stored.bytes.slice();
      return {
        body: new Response(copy).body,
        async arrayBuffer() {
          return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
        },
      };
    },
    async head(key) {
      return objects.has(key) ? { key } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

function memoryQueue() {
  const messages = [];
  return {
    messages,
    async send(message) {
      messages.push(message);
    },
  };
}

function queueMessage(message, attempts = 1) {
  return {
    body: message,
    attempts,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function taskChainEnv(mode, r2 = memoryR2(), queue = memoryQueue()) {
  return {
    r2,
    queue,
    value: overrideEnv({
      INPAINT_MODE: mode,
      INPAINT_OBJECTS: r2,
      INPAINT_QUEUE: queue,
      INPAINT_SERVICE_URL: 'https://private-lama.example.com',
      INPAINT_ACCESS_CLIENT_ID: 'access-id',
      INPAINT_ACCESS_CLIENT_SECRET: 'access-secret',
      INPAINT_HMAC_SECRET: 'test-inpaint-secret-that-is-at-least-32-bytes',
    }),
  };
}

describe('private LaMa inpaint task chain', () => {
  it('keeps off mode read-only and reports the confirmed limits', async () => {
    const chain = taskChainEnv('off');
    const response = await worker.fetch(new Request(
      `${API_ORIGIN}/api/inpaint/batches`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{invalid',
      },
    ), chain.value);
    expect(response.status).toBe(503);
    expect(await body(response)).toMatchObject({ code: 'inpaint_off' });
    expect(await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM inpaint_batches'
    ).first('count')).toBe(0);

    const capabilities = await worker.fetch(
      new Request(`${API_ORIGIN}/api/inpaint/capabilities`),
      chain.value,
    );
    expect(await body(capabilities)).toMatchObject({
      mode: 'off',
      enabled: false,
      limits: {
        max_batch_tasks: 50,
        guest_daily_tasks: 50,
        burst_tasks: 60,
        burst_window_seconds: 600,
      },
    });
  });

  it('restricts admin_free, accepts 50, rejects 51, and writes no credit charge', async () => {
    const admin = await login('admin@example.com', 'admin-device', 9);
    const member = await login('member@example.com', 'member-device', 7);
    const chain = taskChainEnv('admin_free');
    expect((await worker.fetch(batchRequest({
      taskCount: 1,
      clientBatchId: 'guest_batch_001',
    }), chain.value)).status).toBe(401);
    expect((await worker.fetch(batchRequest({
      cookie: member.cookie,
      taskCount: 1,
      clientBatchId: 'member_batch_001',
    }), chain.value)).status).toBe(403);
    expect((await worker.fetch(batchRequest({
      cookie: admin.cookie,
      taskCount: 51,
      clientBatchId: 'admin_batch_051',
    }), chain.value)).status).toBe(400);

    const accepted = await worker.fetch(batchRequest({
      cookie: admin.cookie,
      taskCount: 50,
      clientBatchId: 'admin_batch_050',
    }), chain.value);
    expect(accepted.status).toBe(201);
    const acceptedBody = await body(accepted);
    expect(acceptedBody.batch.tasks).toHaveLength(50);
    expect(await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM inpaint_tasks'
    ).first('count')).toBe(50);
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE user_id = ? AND task_id IS NOT NULL`
    ).bind(admin.userId).first('count')).toBe(0);
    expect(await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(admin.userId).first('credits')).toBe(9);
  });

  it('enforces active-batch, idempotency, burst, guest-day, and owner isolation', async () => {
    const admin = await login('admin@example.com', 'limits-admin', 0);
    const other = await login('other@example.com', 'limits-other', 0);
    const chain = taskChainEnv('admin_free');
    const makeFirst = () => batchRequest({
      cookie: admin.cookie,
      taskCount: 50,
      clientBatchId: 'burst_batch_050',
      deviceId: 'limits-admin',
    });
    const first = await body(await worker.fetch(makeFirst(), chain.value));
    const reuse = await worker.fetch(makeFirst(), chain.value);
    expect(reuse.status).toBe(200);
    expect((await body(reuse)).reused).toBe(true);
    expect((await worker.fetch(batchRequest({
      cookie: admin.cookie,
      taskCount: 1,
      clientBatchId: 'blocked_active_001',
      deviceId: 'limits-admin',
    }), chain.value)).status).toBe(409);
    const ownershipEnv = taskChainEnv('public_free', chain.r2, chain.queue).value;
    expect((await worker.fetch(authenticatedRequest(
      `/api/inpaint/batches/${first.batch.id}`,
      other.cookie,
    ), ownershipEnv)).status).toBe(404);
    await worker.fetch(authenticatedRequest(
      `/api/inpaint/batches/${first.batch.id}`,
      admin.cookie,
      { method: 'DELETE' },
    ), chain.value);

    const second = await body(await worker.fetch(batchRequest({
      cookie: admin.cookie,
      taskCount: 10,
      clientBatchId: 'burst_batch_010',
      deviceId: 'limits-admin',
    }), chain.value));
    await worker.fetch(authenticatedRequest(
      `/api/inpaint/batches/${second.batch.id}`,
      admin.cookie,
      { method: 'DELETE' },
    ), chain.value);
    expect((await worker.fetch(batchRequest({
      cookie: admin.cookie,
      taskCount: 1,
      clientBatchId: 'burst_batch_001',
      deviceId: 'limits-admin',
    }), chain.value)).status).toBe(429);

    const publicChain = taskChainEnv('public_free', chain.r2, chain.queue);
    const guest = await body(await worker.fetch(batchRequest({
      taskCount: 50,
      clientBatchId: 'guest_daily_050',
      deviceId: 'daily-guest',
    }), publicChain.value));
    await worker.fetch(new Request(
      `${API_ORIGIN}/api/inpaint/batches/${guest.batch.id}`,
      {
        method: 'DELETE',
        headers: {
          'X-Device-ID': 'daily-guest',
          'CF-Connecting-IP': '203.0.113.88',
        },
      },
    ), publicChain.value);
    const dailyBlocked = await worker.fetch(batchRequest({
      taskCount: 1,
      clientBatchId: 'guest_daily_051',
      deviceId: 'daily-guest',
    }), publicChain.value);
    expect(dailyBlocked.status).toBe(429);
    expect(await body(dailyBlocked)).toMatchObject({ code: 'guest_daily_limit' });
  });

  it('uploads privately, calls the signed service, returns only to the owner, and deletes on ack', async () => {
    const owner = await login('admin@example.com', 'result-owner', 4);
    const other = await login('other@example.com', 'result-other', 4);
    const chain = taskChainEnv('admin_free');
    const created = await body(await worker.fetch(batchRequest({
      cookie: owner.cookie,
      taskCount: 1,
      clientBatchId: 'result_batch_001',
      deviceId: 'result-owner',
    }), chain.value));
    const task = created.batch.tasks[0];
    const form = new FormData();
    form.set('image', new File([new Uint8Array([137, 80, 78, 71])], 'input.png', {
      type: 'image/png',
    }));
    form.set('mask', new File([new Uint8Array([137, 80, 78, 71, 1])], 'mask.png', {
      type: 'image/png',
    }));
    form.set('mask_spec_hash', created.batch.mask_spec_hash);
    const upload = await worker.fetch(new Request(
      `${API_ORIGIN}/api/inpaint/batches/${created.batch.id}/tasks/0`,
      { method: 'POST', headers: { Cookie: owner.cookie }, body: form },
    ), chain.value);
    expect(upload.status).toBe(202);
    expect(chain.queue.messages).toEqual([{ taskId: task.id, batchId: created.batch.id }]);

    vi.stubGlobal('fetch', vi.fn(async (input, init) => {
      expect(String(input)).toBe('https://private-lama.example.com/v1/inpaint');
      expect(init.headers['CF-Access-Client-Id']).toBe('access-id');
      expect(init.headers['X-ShopBG-Signature']).toMatch(/^[0-9a-f]{64}$/);
      return new Response(new Uint8Array([137, 80, 78, 71, 13, 10]), {
        headers: { 'Content-Type': 'image/png' },
      });
    }));
    const message = queueMessage(chain.queue.messages[0]);
    await worker.queue({ messages: [message] }, chain.value);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();

    const completed = await env.DB.prepare(
      'SELECT status, image_key, mask_key, result_key FROM inpaint_tasks WHERE id = ?'
    ).bind(task.id).first();
    expect(completed.status).toBe('succeeded');
    expect(completed.image_key).toBeNull();
    expect(completed.mask_key).toBeNull();
    expect(chain.r2.objects.has(completed.result_key)).toBe(true);

    const ownershipEnv = taskChainEnv('public_free', chain.r2, chain.queue).value;
    expect((await worker.fetch(authenticatedRequest(
      `/api/inpaint/tasks/${task.id}/result`,
      other.cookie,
    ), ownershipEnv)).status).toBe(404);
    expect((await worker.fetch(authenticatedRequest(
      `/api/inpaint/tasks/${task.id}/result`,
      owner.cookie,
    ), chain.value)).status).toBe(200);
    expect((await worker.fetch(authenticatedRequest(
      `/api/inpaint/tasks/${task.id}/result`,
      owner.cookie,
      { method: 'DELETE' },
    ), chain.value)).status).toBe(200);
    expect(chain.r2.objects.has(completed.result_key)).toBe(false);
    expect(await env.DB.prepare(
      'SELECT credits FROM user_credits WHERE user_id = ?'
    ).bind(owner.userId).first('credits')).toBe(4);
  });

  it('retries transient failure and terminally cleans inputs without charging', async () => {
    const owner = await login('admin@example.com', 'retry-owner', 2);
    const chain = taskChainEnv('admin_free');
    const created = await body(await worker.fetch(batchRequest({
      cookie: owner.cookie,
      taskCount: 1,
      clientBatchId: 'retry_batch_001',
      deviceId: 'retry-owner',
    }), chain.value));
    const task = created.batch.tasks[0];
    const form = new FormData();
    form.set('image', new File([new Uint8Array([1, 2, 3])], 'input.png', { type: 'image/png' }));
    form.set('mask', new File([new Uint8Array([4, 5, 6])], 'mask.png', { type: 'image/png' }));
    form.set('mask_spec_hash', created.batch.mask_spec_hash);
    await worker.fetch(new Request(
      `${API_ORIGIN}/api/inpaint/batches/${created.batch.id}/tasks/0`,
      { method: 'POST', headers: { Cookie: owner.cookie }, body: form },
    ), chain.value);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('busy', { status: 503 })));

    const first = queueMessage(chain.queue.messages[0], 1);
    await worker.queue({ messages: [first] }, chain.value);
    expect(first.retry).toHaveBeenCalledOnce();
    expect(await env.DB.prepare(
      'SELECT status FROM inpaint_tasks WHERE id = ?'
    ).bind(task.id).first('status')).toBe('queued');

    const final = queueMessage(chain.queue.messages[0], 4);
    await worker.queue({ messages: [final] }, chain.value);
    expect(final.ack).toHaveBeenCalledOnce();
    expect(await env.DB.prepare(
      'SELECT status FROM inpaint_tasks WHERE id = ?'
    ).bind(task.id).first('status')).toBe('failed');
    expect(chain.r2.objects.size).toBe(0);
    expect(await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM credit_ledger
       WHERE user_id = ? AND task_id = ?`
    ).bind(owner.userId, task.id).first('count')).toBe(0);
  });
});
