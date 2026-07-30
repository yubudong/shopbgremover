import { createHmac } from 'node:crypto';
import {
  chmod,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPayPalSandboxClient,
  findCompletedCapture,
  parseEnvText,
} from './paypal_sandbox.mjs';

const CONFIG_FILE = resolve('.dev.vars.paypal-sandbox');
const CONFIG_TEMP_FILE = resolve('.dev.vars.paypal-sandbox.tmp');
const STATE_FILE = resolve('.paypal-shopbg-sandbox-state.json');
const TEST_USER = Object.freeze({
  id: 'paypal-sandbox-test-user',
  email: 'paypal-sandbox-test@shopbgremover.invalid',
  name: 'PayPal Sandbox Test',
});
const TEST_PLAN = 'credits_100';
const TEST_CREDITS = 100;
const WAIT_INTERVAL_MS = 3_000;
const APPROVAL_TIMEOUT_MS = 15 * 60 * 1_000;
const WEBHOOK_TIMEOUT_MS = 3 * 60 * 1_000;
const WEBHOOK_EVENTS = Object.freeze([
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
]);

function assertSandboxApiUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    throw new Error('缺少或无法识别 ShopBG Sandbox Worker URL。');
  }
  if (
    url.protocol !== 'https:'
    || !url.hostname.startsWith('shopbgremover-paypal-sandbox.')
    || !url.hostname.endsWith('.workers.dev')
    || url.pathname !== '/'
  ) {
    throw new Error('安全检查失败：只允许 ShopBG PayPal Sandbox workers.dev 地址。');
  }
  return url.origin;
}

function quoteEnv(value) {
  return JSON.stringify(String(value));
}

async function setLocalConfigValue(key, value) {
  const source = await readFile(CONFIG_FILE, 'utf8');
  const replacement = `${key}=${quoteEnv(value)}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');
  const next = expression.test(source)
    ? source.replace(expression, replacement)
    : `${source.replace(/\s*$/, '\n')}${replacement}\n`;
  await writeFile(CONFIG_TEMP_FILE, next, { mode: 0o600 });
  await chmod(CONFIG_TEMP_FILE, 0o600);
  await rename(CONFIG_TEMP_FILE, CONFIG_FILE);
  await chmod(CONFIG_FILE, 0o600);
}

async function loadConfig({ requireWorker = true, requireWebhook = false } = {}) {
  let source;
  try {
    source = await readFile(CONFIG_FILE, 'utf8');
  } catch {
    throw new Error('未找到本机 PayPal Sandbox 配置。');
  }
  const config = parseEnvText(source);
  if (
    config.PAYPAL_MODE !== 'sandbox'
    || !config.PAYPAL_CLIENT_ID
    || !config.PAYPAL_SECRET
    || !config.JWT_SECRET
  ) {
    throw new Error('本机 PayPal Sandbox 配置不完整或模式不安全。');
  }
  if (requireWorker) {
    config.SHOPBG_SANDBOX_API_URL = assertSandboxApiUrl(
      config.SHOPBG_SANDBOX_API_URL,
    );
  }
  if (requireWebhook && !config.PAYPAL_WEBHOOK_ID) {
    throw new Error('尚未创建或配置专属 PayPal Sandbox Webhook。');
  }
  return config;
}

function base64Json(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64');
}

export function createSandboxSessionToken({
  secret,
  now = Math.floor(Date.now() / 1000),
  user = TEST_USER,
}) {
  const header = base64Json({ alg: 'HS256', typ: 'JWT' });
  const body = base64Json({
    sub: user.id,
    email: user.email,
    name: user.name,
    iat: now,
    exp: now + 60 * 60,
  });
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest('base64');
  return `${header}.${body}.${signature}`;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function saveState(state) {
  const safe = {
    started_at: state.started_at || new Date().toISOString(),
    baseline_credits: Number(state.baseline_credits || 0),
    order_id: state.order_id || null,
    approval_url: state.approval_url || null,
    capture_id: state.capture_id || null,
    refund_id: state.refund_id || null,
    webhook_event_id: state.webhook_event_id || null,
    order_status: state.order_status || null,
    refund_status: state.refund_status || null,
    updated_at: new Date().toISOString(),
  };
  await writeFile(STATE_FILE, `${JSON.stringify(safe, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(STATE_FILE, 0o600);
  return safe;
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function paypalApiTimestamp(value) {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function waitFor({ label, timeoutMs, load, done }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await load();
    if (done(value)) return value;
    await wait(WAIT_INTERVAL_MS);
  }
  throw new Error(`${label}等待超时；状态已保留，可继续运行。`);
}

async function parseResponse(response, label) {
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`${label} 返回了无法解析的响应（HTTP ${response.status}）。`);
    }
  }
  if (!response.ok) {
    throw new Error(
      `${label} 失败（HTTP ${response.status}：${body.error || body.message || 'unknown'}）。`,
    );
  }
  return body;
}

export function createShopBGSandboxClient({
  apiUrl,
  jwtSecret,
  fetchImpl = fetch,
}) {
  const safeApiUrl = assertSandboxApiUrl(apiUrl);
  const token = createSandboxSessionToken({ secret: jwtSecret });
  async function request(path, options = {}) {
    const response = await fetchImpl(`${safeApiUrl}${path}`, {
      ...options,
      headers: {
        Origin: 'https://www.shopbgremover.com',
        Cookie: `session=${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return parseResponse(response, `ShopBG Sandbox ${path}`);
  }
  return {
    me() {
      return request('/api/me');
    },
    creditCenter() {
      return request('/api/credits/center');
    },
    createOrder() {
      return request('/api/paypal/create-order', {
        method: 'POST',
        body: JSON.stringify({ plan: TEST_PLAN }),
      });
    },
    captureOrder(orderId) {
      return request('/api/paypal/capture-order', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
    },
  };
}

function recordsForOrder(center, orderId) {
  return {
    order: center.orders?.find((item) => item.id === orderId),
    grants: (center.grants || []).filter((item) => item.order_id === orderId),
    ledger: (center.ledger || []).filter((item) => item.order_id === orderId),
  };
}

export function validateCapturedCenter(center, {
  orderId,
  baselineCredits,
} = {}) {
  const records = recordsForOrder(center, orderId);
  const paidGrants = records.grants.filter(
    (item) => item.credit_type === 'paid'
      && Number(item.granted_credits) === TEST_CREDITS,
  );
  const purchases = records.ledger.filter(
    (item) => item.reason === 'paypal_purchase'
      && Number(item.delta) === TEST_CREDITS,
  );
  if (
    records.order?.status !== 'completed'
    || paidGrants.length !== 1
    || Number(paidGrants[0].remaining_credits) !== TEST_CREDITS
    || purchases.length !== 1
    || Number(center.credits?.credits) !== baselineCredits + TEST_CREDITS
  ) {
    throw new Error('ShopBG Sandbox Capture 后的订单或积分账本不符合预期。');
  }
  return records;
}

export function validateRefundedCenter(center, {
  orderId,
  baselineCredits,
} = {}) {
  const records = recordsForOrder(center, orderId);
  const paidGrants = records.grants.filter(
    (item) => item.credit_type === 'paid'
      && Number(item.granted_credits) === TEST_CREDITS,
  );
  const purchases = records.ledger.filter(
    (item) => item.reason === 'paypal_purchase'
      && Number(item.delta) === TEST_CREDITS,
  );
  const refunds = records.ledger.filter(
    (item) => item.reason === 'paypal_refund'
      && Number(item.delta) === -TEST_CREDITS,
  );
  if (
    records.order?.status !== 'refunded'
    || paidGrants.length !== 1
    || Number(paidGrants[0].remaining_credits) !== 0
    || purchases.length !== 1
    || refunds.length !== 1
    || Number(center.credits?.credits) !== baselineCredits
  ) {
    throw new Error('ShopBG Sandbox Refund 后的订单或积分回滚不符合预期。');
  }
  return records;
}

function matchesCapture(event, captureId) {
  return (
    event?.resource?.supplementary_data?.related_ids?.capture_id === captureId
    || (
      event?.event_type === 'PAYMENT.CAPTURE.REVERSED'
      && event?.resource?.id === captureId
    )
  );
}

async function findRefundWebhookEvent(paypal, state) {
  const start = paypalApiTimestamp(
    new Date(state.started_at).getTime() - 60 * 1_000,
  );
  const end = paypalApiTimestamp(Date.now());
  const result = await paypal.listWebhookEvents({
    startTime: start,
    endTime: end,
    eventType: 'PAYMENT.CAPTURE.REFUNDED',
    pageSize: 20,
  });
  return (result.events || []).find(
    (event) => (
      matchesCapture(event, state.capture_id)
      || event?.resource?.id === state.refund_id
    ),
  ) || null;
}

async function createWebhook() {
  const config = await loadConfig({ requireWorker: true });
  if (config.PAYPAL_WEBHOOK_ID) {
    process.stdout.write(
      `专属 Sandbox Webhook 已存在：${config.PAYPAL_WEBHOOK_ID}\n`,
    );
    return;
  }
  const paypal = createPayPalSandboxClient({
    clientId: config.PAYPAL_CLIENT_ID,
    secret: config.PAYPAL_SECRET,
  });
  const webhook = await paypal.createWebhook(
    `${config.SHOPBG_SANDBOX_API_URL}/api/paypal/webhook`,
    WEBHOOK_EVENTS,
  );
  if (!webhook.id) throw new Error('PayPal 没有返回 Sandbox Webhook ID。');
  await setLocalConfigValue('PAYPAL_WEBHOOK_ID', webhook.id);
  process.stdout.write(`专属 Sandbox Webhook 已创建：${webhook.id}\n`);
}

async function runFlow() {
  const config = await loadConfig({ requireWorker: true, requireWebhook: true });
  const shopbg = createShopBGSandboxClient({
    apiUrl: config.SHOPBG_SANDBOX_API_URL,
    jwtSecret: config.JWT_SECRET,
  });
  const paypal = createPayPalSandboxClient({
    clientId: config.PAYPAL_CLIENT_ID,
    secret: config.PAYPAL_SECRET,
  });
  const me = await shopbg.me();
  if (me.user?.id !== TEST_USER.id) {
    throw new Error('隔离 Worker 测试用户认证失败。');
  }

  let state = await loadState();
  if (!state.order_id) {
    const baseline = await shopbg.creditCenter();
    const created = await shopbg.createOrder();
    if (!created.orderId || !created.approveUrl) {
      throw new Error('ShopBG Sandbox 没有返回订单或买家批准地址。');
    }
    state = await saveState({
      started_at: new Date().toISOString(),
      baseline_credits: Number(baseline.credits?.credits || 0),
      order_id: created.orderId,
      approval_url: created.approveUrl,
      order_status: 'CREATED',
    });
  }

  if (!state.capture_id) {
    let paypalOrder = await paypal.getOrder(state.order_id);
    if (!['APPROVED', 'COMPLETED'].includes(paypalOrder.status)) {
      process.stdout.write([
        '',
        '请使用 PayPal Sandbox Personal 买家批准 ShopBG 隔离订单：',
        state.approval_url,
        '',
        '正在等待批准……',
        '',
      ].join('\n'));
      paypalOrder = await waitFor({
        label: 'Sandbox 买家批准',
        timeoutMs: APPROVAL_TIMEOUT_MS,
        load: () => paypal.getOrder(state.order_id),
        done: (value) => ['APPROVED', 'COMPLETED'].includes(value.status),
      });
    }
    const captureResult = await shopbg.captureOrder(state.order_id);
    if (!captureResult.ok) throw new Error('ShopBG Sandbox Capture 未成功。');
    paypalOrder = await paypal.getOrder(state.order_id);
    const capture = findCompletedCapture(paypalOrder);
    if (!capture?.id) throw new Error('PayPal Sandbox 未返回完成的 Capture。');
    state = await saveState({
      ...state,
      capture_id: capture.id,
      order_status: paypalOrder.status,
    });
  }

  let center = await shopbg.creditCenter();
  const currentOrder = center.orders?.find(
    (item) => item.id === state.order_id,
  );
  if (currentOrder?.status !== 'refunded') {
    validateCapturedCenter(center, {
      orderId: state.order_id,
      baselineCredits: state.baseline_credits,
    });
    const duplicateCapture = await shopbg.captureOrder(state.order_id);
    if (!duplicateCapture.alreadyProcessed) {
      throw new Error('重复 Capture 没有命中 ShopBG 幂等保护。');
    }
    center = await shopbg.creditCenter();
    validateCapturedCenter(center, {
      orderId: state.order_id,
      baselineCredits: state.baseline_credits,
    });
  }

  if (!state.refund_id) {
    const refund = await paypal.refundCapture(state.capture_id);
    if (!refund?.id) throw new Error('PayPal Sandbox 没有返回 Refund ID。');
    state = await saveState({
      ...state,
      refund_id: refund.id,
      refund_status: refund.status,
    });
  }

  center = await waitFor({
    label: '真实 Sandbox Webhook 积分回滚',
    timeoutMs: WEBHOOK_TIMEOUT_MS,
    load: () => shopbg.creditCenter(),
    done: (value) => (
      value.orders?.find((item) => item.id === state.order_id)?.status
      === 'refunded'
    ),
  });
  validateRefundedCenter(center, {
    orderId: state.order_id,
    baselineCredits: state.baseline_credits,
  });

  const refund = await paypal.getRefund(state.refund_id);
  if (refund.status !== 'COMPLETED') {
    throw new Error(`PayPal Sandbox Refund 最终状态为 ${refund.status}。`);
  }
  const webhookEvent = await waitFor({
    label: 'PayPal Sandbox Refund Webhook 事件',
    timeoutMs: WEBHOOK_TIMEOUT_MS,
    load: () => findRefundWebhookEvent(paypal, state),
    done: Boolean,
  });
  state = await saveState({
    ...state,
    webhook_event_id: webhookEvent.id,
    order_status: 'refunded',
    refund_status: refund.status,
  });

  process.stdout.write([
    '',
    'ShopBG PayPal Sandbox 隔离资金与积分闭环已完成。',
    `订单：${state.order_id}`,
    `Capture：${state.capture_id}`,
    `Refund：${state.refund_id}`,
    `Webhook：${state.webhook_event_id}`,
    `积分：${state.baseline_credits} → ${state.baseline_credits + TEST_CREDITS} → ${state.baseline_credits}`,
    '真实资金影响：0',
    '',
  ].join('\n'));
}

async function resendWebhook() {
  const config = await loadConfig({ requireWorker: true, requireWebhook: true });
  let state = await loadState();
  if (!state.order_id) {
    throw new Error('尚无可重发的真实 Sandbox Webhook 事件。');
  }
  const paypal = createPayPalSandboxClient({
    clientId: config.PAYPAL_CLIENT_ID,
    secret: config.PAYPAL_SECRET,
  });
  const shopbg = createShopBGSandboxClient({
    apiUrl: config.SHOPBG_SANDBOX_API_URL,
    jwtSecret: config.JWT_SECRET,
  });
  if (!state.webhook_event_id) {
    const discovered = await findRefundWebhookEvent(paypal, state);
    if (!discovered?.id) {
      throw new Error('尚未找到可重发的真实 Sandbox Webhook 事件。');
    }
    state = await saveState({
      ...state,
      webhook_event_id: discovered.id,
    });
  }
  const center = await shopbg.creditCenter();
  const order = center.orders?.find((item) => item.id === state.order_id);
  if (order?.status === 'refunded') {
    validateRefundedCenter(center, {
      orderId: state.order_id,
      baselineCredits: state.baseline_credits,
    });
  } else {
    validateCapturedCenter(center, {
      orderId: state.order_id,
      baselineCredits: state.baseline_credits,
    });
  }
  await paypal.resendWebhookEvent(
    state.webhook_event_id,
    [config.PAYPAL_WEBHOOK_ID],
  );
  process.stdout.write(
    `真实 Sandbox Webhook 已请求重发：${state.webhook_event_id}\n`,
  );
}

async function showStatus() {
  const config = await loadConfig({ requireWorker: true, requireWebhook: true });
  const state = await loadState();
  const shopbg = createShopBGSandboxClient({
    apiUrl: config.SHOPBG_SANDBOX_API_URL,
    jwtSecret: config.JWT_SECRET,
  });
  const paypal = createPayPalSandboxClient({
    clientId: config.PAYPAL_CLIENT_ID,
    secret: config.PAYPAL_SECRET,
  });
  const center = await shopbg.creditCenter();
  const order = center.orders?.find((item) => item.id === state.order_id) || null;
  const paypalOrder = state.order_id
    ? await paypal.getOrder(state.order_id)
    : null;
  const refund = state.refund_id
    ? await paypal.getRefund(state.refund_id)
    : null;
  const refundWebhookEvent = state.capture_id
    ? await findRefundWebhookEvent(paypal, state)
    : null;
  const webhookEvent = refundWebhookEvent?.id
    ? await paypal.getWebhookEvent(refundWebhookEvent.id)
    : null;
  const webhook = await paypal.getWebhook(config.PAYPAL_WEBHOOK_ID);
  process.stdout.write(`${JSON.stringify({
    order_id: state.order_id || null,
    order_status: order?.status || null,
    paypal_order_status: paypalOrder?.status || null,
    capture_id: state.capture_id || null,
    refund_id: state.refund_id || null,
    refund_status: refund?.status || null,
    webhook_event_id: state.webhook_event_id || refundWebhookEvent?.id || null,
    webhook_event_status: refundWebhookEvent?.event_type || null,
    webhook_resource: webhookEvent ? {
      id: webhookEvent.resource?.id || null,
      supplementary_data: webhookEvent.resource?.supplementary_data || null,
      links: (webhookEvent.resource?.links || []).map((item) => ({
        rel: item.rel,
        href: item.href,
      })),
    } : null,
    webhook_id: webhook?.id || null,
    webhook_url: webhook?.url || null,
    webhook_event_types: (webhook?.event_types || []).map((item) => item.name),
    credits: center.credits?.credits ?? null,
    paid_credits: center.credits?.buckets?.paid ?? null,
  }, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2];
  if (command === 'configure-api') {
    const apiUrl = assertSandboxApiUrl(process.argv[3]);
    await setLocalConfigValue('SHOPBG_SANDBOX_API_URL', apiUrl);
    process.stdout.write(`ShopBG Sandbox Worker URL 已保存：${apiUrl}\n`);
    return;
  }
  if (command === 'create-webhook') {
    await createWebhook();
    return;
  }
  if (command === 'run') {
    await runFlow();
    return;
  }
  if (command === 'resend') {
    await resendWebhook();
    return;
  }
  if (command === 'status') {
    await showStatus();
    return;
  }
  if (command === 'reset') {
    await rm(STATE_FILE, { force: true });
    process.stdout.write(
      '本机 ShopBG Sandbox 流程状态已清除；没有删除 Sandbox 或生产数据。\n',
    );
    return;
  }
  throw new Error(
    '用法：configure-api <url> | create-webhook | run | resend | status | reset',
  );
}

if (
  process.argv[1]
  && new URL(import.meta.url).pathname === resolve(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
