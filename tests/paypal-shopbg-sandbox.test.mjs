import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYPAL_SANDBOX_BASE,
  createPayPalSandboxClient,
} from '../scripts/paypal_sandbox.mjs';
import {
  createSandboxSessionToken,
  createShopBGSandboxClient,
  paypalApiTimestamp,
  validateCapturedCenter,
  validateRefundedCenter,
} from '../scripts/paypal_shopbg_sandbox.mjs';

const projectRoot = new URL('../', import.meta.url);
const sandboxApiUrl =
  'https://shopbgremover-paypal-sandbox.test-account.workers.dev';

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('PayPal Sandbox Worker config cannot bind production resources', async () => {
  const [config, seed, ignore, packageJson] = await Promise.all([
    readFile(new URL('wrangler.paypal-sandbox.toml', projectRoot), 'utf8'),
    readFile(new URL('worker/paypal-sandbox-seed.sql', projectRoot), 'utf8'),
    readFile(new URL('.gitignore', projectRoot), 'utf8'),
    readFile(new URL('package.json', projectRoot), 'utf8').then(JSON.parse),
  ]);

  assert.match(config, /name = "shopbgremover-paypal-sandbox"/);
  assert.match(config, /database_name = "shopbgremover-paypal-sandbox-db"/);
  assert.match(config, /dff2a084-c889-46a8-9f44-0bd76e754a30/);
  assert.match(config, /PAYPAL_MODE = "sandbox"/);
  assert.match(config, /INPAINT_MODE = "off"/);
  assert.match(config, /ANALYTICS_MODE = "off"/);
  assert.doesNotMatch(config, /f9c622b0-9360-48c1-a2a6-36e51b93d3de/);
  assert.doesNotMatch(config, /\[\[routes\]\]|\[\[r2_buckets\]\]|\[\[queues\.|crons/);
  assert.match(seed, /paypal-sandbox-test@shopbgremover\.invalid/);
  assert.doesNotMatch(seed, /\bDELETE\b|\bDROP\b/);
  assert.match(ignore, /^\.paypal-shopbg-sandbox-state\.json$/m);
  assert.equal(
    packageJson.scripts['paypal:shopbg-sandbox:deploy'],
    'wrangler deploy --config wrangler.paypal-sandbox.toml',
  );
});

test('ShopBG Sandbox client accepts only its isolated workers.dev hostname', async () => {
  assert.throws(
    () => createShopBGSandboxClient({
      apiUrl: 'https://api.shopbgremover.com',
      jwtSecret: 'test-secret',
    }),
    /只允许 ShopBG PayPal Sandbox workers\.dev/,
  );

  const calls = [];
  const client = createShopBGSandboxClient({
    apiUrl: sandboxApiUrl,
    jwtSecret: 'test-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response({
        user: {
          id: 'paypal-sandbox-test-user',
          email: 'paypal-sandbox-test@shopbgremover.invalid',
        },
        credits: { credits: 0, buckets: { paid: 0 } },
      });
    },
  });
  await client.me();
  assert.equal(calls[0].url, `${sandboxApiUrl}/api/me`);
  assert.match(calls[0].options.headers.Cookie, /^session=[^.]+\.[^.]+\.[^;]+$/);
  assert.equal(
    calls[0].options.headers.Origin,
    'https://www.shopbgremover.com',
  );
});

test('ShopBG Sandbox session token has a one-hour test-user scope', () => {
  const now = 1_800_000_000;
  const token = createSandboxSessionToken({
    secret: 'test-secret',
    now,
  });
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64'));
  assert.equal(payload.sub, 'paypal-sandbox-test-user');
  assert.equal(payload.email, 'paypal-sandbox-test@shopbgremover.invalid');
  assert.equal(payload.iat, now);
  assert.equal(payload.exp, now + 3600);
});

test('PayPal webhook event timestamps omit unsupported milliseconds', () => {
  assert.equal(
    paypalApiTimestamp('2026-07-30T03:45:02.628Z'),
    '2026-07-30T03:45:02Z',
  );
});

test('credit validators require one purchase and one refund reversal', () => {
  const captured = {
    credits: { credits: 100 },
    orders: [{ id: 'ORDER-1', status: 'completed' }],
    grants: [{
      id: 'purchase:ORDER-1:paid',
      order_id: 'ORDER-1',
      credit_type: 'paid',
      granted_credits: 100,
      remaining_credits: 100,
    }],
    ledger: [{
      id: 'purchase:ORDER-1:paid',
      order_id: 'ORDER-1',
      reason: 'paypal_purchase',
      delta: 100,
    }],
  };
  validateCapturedCenter(captured, {
    orderId: 'ORDER-1',
    baselineCredits: 0,
  });

  const refunded = structuredClone(captured);
  refunded.credits.credits = 0;
  refunded.orders[0].status = 'refunded';
  refunded.grants[0].remaining_credits = 0;
  refunded.ledger.push({
    id: 'refund-1',
    order_id: 'ORDER-1',
    reason: 'paypal_refund',
    delta: -100,
  });
  validateRefundedCenter(refunded, {
    orderId: 'ORDER-1',
    baselineCredits: 0,
  });

  refunded.ledger.push({
    id: 'refund-duplicate',
    order_id: 'ORDER-1',
    reason: 'paypal_refund',
    delta: -100,
  });
  assert.throws(
    () => validateRefundedCenter(refunded, {
      orderId: 'ORDER-1',
      baselineCredits: 0,
    }),
    /积分回滚不符合预期/,
  );
});

test('webhook management uses Sandbox endpoints and explicit resend target', async () => {
  const calls = [];
  const responses = [
    response({ access_token: 'sandbox-token' }),
    response({ id: 'WEBHOOK-1' }, 201),
    response({
      id: 'WEBHOOK-1',
      url: `${sandboxApiUrl}/api/paypal/webhook`,
    }),
    response({ events: [{ id: 'EVENT-1' }] }),
    response({ id: 'EVENT-1' }),
    response({ id: 'EVENT-1' }, 202),
  ];
  const paypal = createPayPalSandboxClient({
    clientId: 'sandbox-client',
    secret: 'sandbox-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return responses.shift();
    },
  });

  await paypal.createWebhook(
    `${sandboxApiUrl}/api/paypal/webhook`,
    ['PAYMENT.CAPTURE.REFUNDED', 'PAYMENT.CAPTURE.REVERSED'],
  );
  await paypal.getWebhook('WEBHOOK-1');
  await paypal.listWebhookEvents({
    startTime: '2026-07-30T00:00:00Z',
    endTime: '2026-07-30T23:59:59Z',
    eventType: 'PAYMENT.CAPTURE.REFUNDED',
  });
  await paypal.getWebhookEvent('EVENT-1');
  await paypal.resendWebhookEvent('EVENT-1', ['WEBHOOK-1']);

  assert.equal(calls.length, 6);
  assert.ok(calls.every((call) => call.url.startsWith(PAYPAL_SANDBOX_BASE)));
  assert.match(calls[1].url, /\/v1\/notifications\/webhooks$/);
  assert.match(calls[2].url, /\/v1\/notifications\/webhooks\/WEBHOOK-1$/);
  assert.match(calls[3].url, /webhooks-events\?/);
  assert.match(calls[4].url, /webhooks-events\/EVENT-1$/);
  assert.match(calls[5].url, /webhooks-events\/EVENT-1\/resend$/);
  assert.deepEqual(JSON.parse(calls[5].options.body), {
    webhook_ids: ['WEBHOOK-1'],
  });
});
