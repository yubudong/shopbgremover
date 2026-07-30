import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { parseEnvText } from './paypal_sandbox.mjs';

const LOCAL_CONFIG = resolve('.dev.vars.paypal-sandbox');
const WRANGLER_CONFIG = resolve('wrangler.paypal-sandbox.toml');
const EXPECTED_DATABASE_ID = 'dff2a084-c889-46a8-9f44-0bd76e754a30';

async function main() {
  const [localText, wranglerText] = await Promise.all([
    readFile(LOCAL_CONFIG, 'utf8'),
    readFile(WRANGLER_CONFIG, 'utf8'),
  ]);
  const config = parseEnvText(localText);
  const required = [
    'PAYPAL_CLIENT_ID',
    'PAYPAL_SECRET',
    'JWT_SECRET',
    'PAYPAL_WEBHOOK_ID',
  ];
  const missing = required.filter((key) => !config[key]);
  if (config.PAYPAL_MODE !== 'sandbox' || missing.length) {
    throw new Error(
      `沙盒 Secret 配置不完整或模式错误：${missing.join(', ') || 'PAYPAL_MODE'}`,
    );
  }
  if (
    !wranglerText.includes('name = "shopbgremover-paypal-sandbox"')
    || !wranglerText.includes(`database_id = "${EXPECTED_DATABASE_ID}"`)
    || wranglerText.includes('f9c622b0-9360-48c1-a2a6-36e51b93d3de')
    || wranglerText.includes('[[routes]]')
  ) {
    throw new Error('安全检查失败：目标不是隔离的 PayPal Sandbox Worker/D1。');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'shopbg-paypal-secrets-'));
  const secretFile = join(tempDir, 'secrets.json');
  try {
    await writeFile(
      secretFile,
      `${JSON.stringify(Object.fromEntries(
        required.map((key) => [key, config[key]]),
      ))}\n`,
      { mode: 0o600 },
    );
    await chmod(secretFile, 0o600);
    const result = spawnSync(
      'npx',
      [
        'wrangler',
        'secret',
        'bulk',
        secretFile,
        '--config',
        WRANGLER_CONFIG,
      ],
      {
        cwd: resolve('.'),
        env: {
          ...process.env,
          WRANGLER_LOG_PATH: join(tmpdir(), 'shopbg-paypal-sandbox-secrets.log'),
        },
        encoding: 'utf8',
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      throw new Error(`Wrangler Sandbox Secret 上传失败（退出码 ${result.status}）。`);
    }
    process.stdout.write(
      'ShopBG PayPal Sandbox Worker Secret 已更新；没有输出任何凭证值。\n',
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
