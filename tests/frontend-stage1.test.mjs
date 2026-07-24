import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const locales = ['', 'de/', 'es/', 'fr/', 'pt-br/'];
const indexFiles = locales.map((locale) => `${locale}index.html`);
const pricingFiles = locales.map((locale) => `${locale}pricing.html`);
const termsFiles = locales.map((locale) => `${locale}terms.html`);
const paypalClientId =
  'BAA4Ojux0LcQewVNqMfn8B0s2TQzAn7gr9MEsZ-oRCY7hDN1vulONcWILFXQK3lEHftqQBISBEXfDDUuWg';
const root = path.resolve(import.meta.dirname, '..');
const execFileAsync = promisify(execFile);

async function read(file) {
  return readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}

function extractFunction(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `missing ${signature}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${signature}`);
}

test('all localized workspaces send device and task idempotency identifiers', async () => {
  for (const file of indexFiles) {
    const html = await read(file);
    assert.match(html, /const DEVICE_ID = getOrCreateDeviceId\(\)/, file);
    assert.match(html, /'X-Device-ID': DEVICE_ID/, file);
    assert.match(html, /task_id: crypto\.randomUUID\(\)/, file);
    assert.match(html, /slice\(0, currentUser \? 50 : 1\)/, file);
    assert.equal((html.match(/\/api\/remove-bg/g) || []).length, 1, file);
  }
});

test('ZIP download is local-only and never invokes the AI endpoint', async () => {
  for (const file of indexFiles) {
    const html = await read(file);
    const downloadZip = extractFunction(html, 'async function downloadZip()');
    assert.match(downloadZip, /new JSZip\(\)/, file);
    assert.doesNotMatch(downloadZip, /fetch\s*\(/, file);
    assert.doesNotMatch(downloadZip, /remove-bg/, file);
  }
});

test('localized pricing exposes only the three confirmed USD packs', async () => {
  for (const file of pricingFiles) {
    const html = await read(file);
    assert.ok(html.includes(`client-id=${paypalClientId}`), file);
    assert.match(html, /currency=USD/, file);
    assert.match(html, /credits_100/, file);
    assert.match(html, /credits_300/, file);
    assert.match(html, /credits_1000/, file);
    assert.match(html, />3\.49</, file);
    assert.match(html, />8\.99</, file);
    assert.match(html, />23\.99</, file);
    assert.doesNotMatch(
      html,
      /starter_(?:monthly|annual)|pro_(?:monthly|annual)|business_(?:monthly|annual)|payg_(?:10|50|200|500)/,
      file,
    );
  }
});

test('localized terms state lifetime quotas and USD one-time packs', async () => {
  for (const file of termsFiles) {
    const html = await read(file);
    assert.match(html, /USD/, file);
    assert.match(html, /1000/, file);
    assert.match(html, /23[,.]99/, file);
    assert.doesNotMatch(html, /¥22|¥60|¥160/, file);
    assert.doesNotMatch(html, /3 images per day|3 Bilder pro Tag|3 imágenes por día|3 images par jour|3 imagens por dia/, file);
  }
});

test('changed HTML files contain syntactically valid inline JavaScript', async () => {
  const files = [
    ...indexFiles,
    ...pricingFiles,
    ...termsFiles,
    'redeem.html',
    'admin-vouchers.html',
    'test-paypal.html',
    'shopify-background-remover.html',
    'amazon-ebay-product-images.html',
    ...locales.slice(1).flatMap((locale) => [
      `${locale}shopify-background-remover.html`,
      `${locale}amazon-ebay-product-images.html`,
    ]),
  ];

  for (const file of files) {
    const html = await read(file);
    const scripts = html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi);
    for (const [, attributes, script] of scripts) {
      if (/application\/ld\+json/i.test(attributes)) continue;
      assert.doesNotThrow(() => new Function(script), file);
    }
  }
});

test('Pages build contains only the canonical static site', async () => {
  await execFileAsync(process.execPath, [
    path.join(root, 'scripts', 'build_static_pages.mjs'),
  ]);

  const output = path.join(root, '.pages-dist');
  const required = [
    'index.html',
    'pricing.html',
    'redeem.html',
    'admin-vouchers.html',
    'de/index.html',
    'es/index.html',
    'fr/index.html',
    'pt-br/index.html',
    'Logo256.png',
    'photo/cosmetic.jpg',
  ];

  for (const file of required) {
    await readFile(path.join(output, file));
  }

  await assert.rejects(readFile(path.join(output, 'worker', 'index.js')));
  await assert.rejects(readFile(path.join(output, 'test-paypal.html')));
  await assert.rejects(readFile(path.join(output, 'public', 'index.html')));
});

test('pricing links to the server-backed Xianyu voucher redemption page', async () => {
  for (const file of pricingFiles) {
    const html = await read(file);
    assert.match(html, /href="\/redeem\.html"/, file);
  }
  const redeem = await read('redeem.html');
  assert.match(redeem, /\/api\/vouchers\/redeem/);
  assert.match(redeem, /'X-Device-ID': deviceId/);
  assert.doesNotMatch(redeem, /localStorage.*voucher|voucher.*localStorage/i);
});
