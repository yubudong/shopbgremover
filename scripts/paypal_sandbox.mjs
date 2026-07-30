import { chmod, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PAYPAL_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';

const CONFIG_FILE = resolve('.dev.vars.paypal-sandbox');
const STATE_FILE = resolve('.paypal-sandbox-state.json');
const DEFAULT_PLAN = 'credits_100';
const WAIT_INTERVAL_MS = 3_000;
const APPROVAL_TIMEOUT_MS = 15 * 60 * 1_000;
const REFUND_TIMEOUT_MS = 2 * 60 * 1_000;
const PACKS = Object.freeze({
  credits_100: { amount: '3.49', credits: 100, currency: 'USD' },
  credits_300: { amount: '8.99', credits: 300, currency: 'USD' },
  credits_1000: { amount: '23.99', credits: 1000, currency: 'USD' },
});

export function parseEnvText(text) {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error('沙盒配置文件格式不正确。');
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value.replace(/\\"/g, '"');
  }
  return result;
}

function findLink(resource, rel) {
  return resource?.links?.find((link) => link?.rel === rel)?.href || null;
}

export function findCompletedCapture(order) {
  for (const unit of order?.purchase_units || []) {
    for (const capture of unit?.payments?.captures || []) {
      if (capture?.status === 'COMPLETED') return capture;
    }
  }
  return null;
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
    const detail = body?.details?.[0]?.description || body?.message || body?.name;
    throw new Error(`${label} 失败（HTTP ${response.status}${detail ? `：${detail}` : ''}）。`);
  }
  return body;
}

export function createPayPalSandboxClient({
  clientId,
  secret,
  fetchImpl = fetch,
}) {
  if (!clientId || !secret) throw new Error('缺少 PayPal Sandbox Client ID 或 Secret。');
  let cachedToken = null;

  async function getAccessToken() {
    if (cachedToken) return cachedToken;
    const response = await fetchImpl(`${PAYPAL_SANDBOX_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const body = await parseResponse(response, 'Sandbox 身份验证');
    if (!body.access_token) throw new Error('Sandbox 身份验证没有返回访问令牌。');
    cachedToken = body.access_token;
    return cachedToken;
  }

  async function request(path, {
    method = 'GET',
    body,
    requestId,
  } = {}) {
    if (!path.startsWith('/')) throw new Error('PayPal Sandbox 路径必须以 / 开头。');
    const token = await getAccessToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    if (requestId) headers['PayPal-Request-Id'] = requestId;
    const response = await fetchImpl(`${PAYPAL_SANDBOX_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return parseResponse(response, `Sandbox ${method} ${path}`);
  }

  return {
    getAccessToken,
    createOrder(plan = DEFAULT_PLAN) {
      const pack = PACKS[plan];
      if (!pack) throw new Error(`不支持的测试积分包：${plan}`);
      const requestId = `shopbg-sandbox-order-${crypto.randomUUID()}`;
      return request('/v2/checkout/orders', {
        method: 'POST',
        requestId,
        body: {
          intent: 'CAPTURE',
          purchase_units: [{
            reference_id: requestId,
            amount: {
              currency_code: pack.currency,
              value: pack.amount,
            },
            description: `ShopBG Remover Sandbox - ${pack.credits} credits`,
          }],
          payment_source: {
            paypal: {
              experience_context: {
                user_action: 'PAY_NOW',
                return_url: 'https://example.com/shopbg-paypal-sandbox-approved',
                cancel_url: 'https://example.com/shopbg-paypal-sandbox-cancelled',
              },
            },
          },
        },
      });
    },
    getOrder(orderId) {
      return request(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    },
    captureOrder(orderId) {
      return request(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: 'POST',
        requestId: `shopbg-sandbox-capture-${orderId}`,
        body: {},
      });
    },
    refundCapture(captureId) {
      return request(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: 'POST',
        requestId: `shopbg-sandbox-refund-${captureId}`,
        body: {},
      });
    },
    getRefund(refundId) {
      return request(`/v2/payments/refunds/${encodeURIComponent(refundId)}`);
    },
    createWebhook(url, eventTypes) {
      if (!url?.startsWith('https://')) {
        throw new Error('Sandbox Webhook URL 必须使用 HTTPS。');
      }
      const names = Array.from(new Set(eventTypes || [])).filter(Boolean);
      if (!names.length) throw new Error('Sandbox Webhook 至少需要一个事件类型。');
      return request('/v1/notifications/webhooks', {
        method: 'POST',
        body: {
          url,
          event_types: names.map((name) => ({ name })),
        },
      });
    },
    getWebhook(webhookId) {
      return request(
        `/v1/notifications/webhooks/${encodeURIComponent(webhookId)}`,
      );
    },
    listWebhookEvents({
      startTime,
      endTime,
      eventType,
      pageSize = 20,
    } = {}) {
      const params = new URLSearchParams();
      if (startTime) params.set('start_time', startTime);
      if (endTime) params.set('end_time', endTime);
      if (eventType) params.set('event_type', eventType);
      params.set('page_size', String(pageSize));
      return request(`/v1/notifications/webhooks-events?${params}`);
    },
    getWebhookEvent(eventId) {
      return request(
        `/v1/notifications/webhooks-events/${encodeURIComponent(eventId)}`,
      );
    },
    resendWebhookEvent(eventId, webhookIds = []) {
      return request(
        `/v1/notifications/webhooks-events/${encodeURIComponent(eventId)}/resend`,
        {
          method: 'POST',
          body: { webhook_ids: webhookIds },
        },
      );
    },
  };
}

async function loadConfig() {
  let text;
  try {
    text = await readFile(CONFIG_FILE, 'utf8');
  } catch {
    throw new Error('未找到本机沙盒配置。请先运行 npm run paypal:sandbox:setup。');
  }
  const config = parseEnvText(text);
  if (config.PAYPAL_MODE !== 'sandbox') {
    throw new Error('安全检查失败：PAYPAL_MODE 必须明确为 sandbox。');
  }
  if (!config.PAYPAL_CLIENT_ID || !config.PAYPAL_SECRET) {
    throw new Error('本机沙盒配置缺少 Client ID 或 Secret。');
  }
  return config;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

export async function saveSandboxState(state, file = STATE_FILE) {
  const safeState = {
    plan: state.plan || DEFAULT_PLAN,
    order_id: state.order_id || null,
    approval_url: state.approval_url || null,
    capture_id: state.capture_id || null,
    refund_id: state.refund_id || null,
    order_status: state.order_status || null,
    refund_status: state.refund_status || null,
    updated_at: new Date().toISOString(),
  };
  await writeFile(file, `${JSON.stringify(safeState, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return safeState;
}

function wait(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForStatus({
  label,
  timeoutMs,
  load,
  done,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await load();
    if (done(value)) return value;
    await wait(WAIT_INTERVAL_MS);
  }
  throw new Error(`${label}等待超时。当前沙盒状态已保留，可再次运行同一命令继续。`);
}

async function runSandboxFlow(client) {
  let state = await loadState();
  const plan = state.plan || DEFAULT_PLAN;
  const pack = PACKS[plan];
  if (!pack) throw new Error(`状态文件包含不支持的积分包：${plan}`);

  if (!state.order_id) {
    const order = await client.createOrder(plan);
    const approvalUrl = findLink(order, 'payer-action') || findLink(order, 'approve');
    if (!order.id || !approvalUrl) {
      throw new Error('Sandbox 订单没有返回订单 ID 或买家批准链接。');
    }
    state = await saveSandboxState({
      plan,
      order_id: order.id,
      approval_url: approvalUrl,
      order_status: order.status,
    });
  }

  if (!state.capture_id) {
    const current = await client.getOrder(state.order_id);
    if (!['APPROVED', 'COMPLETED'].includes(current.status)) {
      process.stdout.write([
        '',
        '请使用 PayPal Sandbox Personal（买家）账号打开并批准：',
        state.approval_url,
        '',
        '正在等待批准；不要使用真实 PayPal 账号或真实银行卡……',
        '',
      ].join('\n'));
    }
    const approved = ['APPROVED', 'COMPLETED'].includes(current.status)
      ? current
      : await waitForStatus({
        label: '买家批准',
        timeoutMs: APPROVAL_TIMEOUT_MS,
        load: () => client.getOrder(state.order_id),
        done: (order) => ['APPROVED', 'COMPLETED'].includes(order.status),
      });
    const capturedOrder = approved.status === 'COMPLETED'
      ? approved
      : await client.captureOrder(state.order_id);
    const capture = findCompletedCapture(capturedOrder);
    if (!capture?.id) throw new Error('Sandbox 捕获完成后没有返回 Capture ID。');
    if (
      capture.amount?.currency_code !== pack.currency
      || capture.amount?.value !== pack.amount
    ) {
      throw new Error('Sandbox 捕获金额与预期积分包不一致，已停止退款步骤。');
    }
    state = await saveSandboxState({
      ...state,
      capture_id: capture.id,
      order_status: capturedOrder.status,
    });
    process.stdout.write(`Sandbox 付款捕获成功：${pack.currency} ${pack.amount}\n`);
  }

  if (!state.refund_id) {
    const refund = await client.refundCapture(state.capture_id);
    if (!refund?.id) throw new Error('Sandbox 退款没有返回 Refund ID。');
    state = await saveSandboxState({
      ...state,
      refund_id: refund.id,
      refund_status: refund.status,
    });
  }

  let refund = await client.getRefund(state.refund_id);
  if (!['COMPLETED', 'FAILED'].includes(refund.status)) {
    refund = await waitForStatus({
      label: '退款完成',
      timeoutMs: REFUND_TIMEOUT_MS,
      load: () => client.getRefund(state.refund_id),
      done: (value) => ['COMPLETED', 'FAILED'].includes(value.status),
    });
  }
  state = await saveSandboxState({
    ...state,
    refund_status: refund.status,
  });
  if (refund.status !== 'COMPLETED') {
    throw new Error(`Sandbox 退款最终状态为 ${refund.status}。`);
  }

  process.stdout.write([
    '',
    'PayPal Sandbox 付款与全额退款均已完成。',
    `订单：${state.order_id}`,
    `Capture：${state.capture_id}`,
    `Refund：${state.refund_id}`,
    '真实资金影响：0',
    '',
    '如需重新测试，请先运行 npm run paypal:sandbox:reset。',
    '',
  ].join('\n'));
}

async function showStatus(client) {
  const state = await loadState();
  if (!state.order_id) {
    process.stdout.write('尚无本机 PayPal Sandbox 测试订单。\n');
    return;
  }
  const order = await client.getOrder(state.order_id);
  let refund = null;
  if (state.refund_id) refund = await client.getRefund(state.refund_id);
  process.stdout.write(`${JSON.stringify({
    order_id: state.order_id,
    order_status: order.status,
    capture_id: state.capture_id || findCompletedCapture(order)?.id || null,
    refund_id: state.refund_id || null,
    refund_status: refund?.status || null,
  }, null, 2)}\n`);
}

async function main() {
  const command = process.argv[2] || 'check';
  if (command === 'reset') {
    await rm(STATE_FILE, { force: true });
    process.stdout.write('本机 PayPal Sandbox 状态已清除；没有删除或修改任何生产数据。\n');
    return;
  }

  const config = await loadConfig();
  const client = createPayPalSandboxClient({
    clientId: config.PAYPAL_CLIENT_ID,
    secret: config.PAYPAL_SECRET,
  });

  if (command === 'check') {
    await client.getAccessToken();
    process.stdout.write('PayPal Sandbox 凭证验证成功；未创建订单、未付款、未退款。\n');
    return;
  }
  if (command === 'run') {
    await runSandboxFlow(client);
    return;
  }
  if (command === 'status') {
    await showStatus(client);
    return;
  }
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
