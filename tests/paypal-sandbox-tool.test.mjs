import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  PAYPAL_SANDBOX_BASE,
  createPayPalSandboxClient,
  findCompletedCapture,
  parseEnvText,
  saveSandboxState,
} from '../scripts/paypal_sandbox.mjs';

const projectRoot = new URL('../', import.meta.url);

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('sandbox config parser requires explicit local values', () => {
  const parsed = parseEnvText(`
PAYPAL_MODE="sandbox"
PAYPAL_CLIENT_ID="client-id"
PAYPAL_SECRET='secret'
`);
  assert.deepEqual(parsed, {
    PAYPAL_MODE: 'sandbox',
    PAYPAL_CLIENT_ID: 'client-id',
    PAYPAL_SECRET: 'secret',
  });
});

test('sandbox client uses only sandbox endpoints for create, capture, and refund', async () => {
  const calls = [];
  const responses = [
    jsonResponse({ access_token: 'sandbox-token' }),
    jsonResponse({
      id: 'ORDER-1',
      status: 'CREATED',
      links: [{
        rel: 'payer-action',
        href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-1',
      }],
    }, 201),
    jsonResponse({
      id: 'ORDER-1',
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: 'CAPTURE-1',
            status: 'COMPLETED',
            amount: { value: '3.49', currency_code: 'USD' },
          }],
        },
      }],
    }),
    jsonResponse({
      id: 'REFUND-1',
      status: 'COMPLETED',
      amount: { value: '3.49', currency_code: 'USD' },
    }),
  ];
  const client = createPayPalSandboxClient({
    clientId: 'sandbox-client',
    secret: 'sandbox-secret',
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return responses.shift();
    },
  });

  const order = await client.createOrder('credits_100');
  const captured = await client.captureOrder(order.id);
  const capture = findCompletedCapture(captured);
  const refund = await client.refundCapture(capture.id);

  assert.equal(refund.status, 'COMPLETED');
  assert.equal(calls.length, 4);
  assert.ok(calls.every((call) => call.url.startsWith(PAYPAL_SANDBOX_BASE)));
  assert.equal(
    calls.some((call) => call.url.startsWith('https://api-m.paypal.com')),
    false,
  );
  assert.match(calls[1].url, /\/v2\/checkout\/orders$/);
  assert.match(calls[2].url, /\/v2\/checkout\/orders\/ORDER-1\/capture$/);
  assert.match(calls[3].url, /\/v2\/payments\/captures\/CAPTURE-1\/refund$/);
  assert.deepEqual(JSON.parse(calls[3].options.body), {});
});

test('sandbox state never persists credentials or access tokens', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'shopbg-paypal-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'state.json');

  await saveSandboxState({
    plan: 'credits_100',
    order_id: 'ORDER-1',
    capture_id: 'CAPTURE-1',
    refund_id: 'REFUND-1',
    clientId: 'must-not-be-saved',
    secret: 'must-not-be-saved',
    access_token: 'must-not-be-saved',
  }, file);
  const text = await readFile(file, 'utf8');
  assert.doesNotMatch(text, /must-not-be-saved/);
  assert.match(text, /"order_id": "ORDER-1"/);
  assert.match(text, /"refund_id": "REFUND-1"/);
});

test('legacy sandbox entry points cannot mutate or call production', async () => {
  const [setup, diagnose, page, ignore] = await Promise.all([
    readFile(new URL('setup-paypal.sh', projectRoot), 'utf8'),
    readFile(new URL('diagnose-paypal.sh', projectRoot), 'utf8'),
    readFile(new URL('test-paypal.html', projectRoot), 'utf8'),
    readFile(new URL('.gitignore', projectRoot), 'utf8'),
  ]);

  assert.match(setup, /read -r -s/);
  assert.match(setup, /\.dev\.vars\.paypal-sandbox/);
  assert.doesNotMatch(setup, /wrangler secret|wrangler deploy|--remote|schema\.sql/);
  assert.doesNotMatch(diagnose, /wrangler|api\.shopbgremover\.com|pricing\.html/);
  assert.doesNotMatch(page, /api\.shopbgremover\.com|paypal\.com\/sdk\/js/);
  assert.match(ignore, /^\.dev\.vars\*$/m);
  assert.match(ignore, /^\.paypal-sandbox-state\.json$/m);
});
