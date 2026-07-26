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
const localizedReferralFiles = ['de/', 'es/', 'fr/', 'pt-br/'].map(
  (locale) => `${locale}referrals.html`,
);
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

test('all localized workspaces use stable per-image AI task identities', async () => {
  const workflow = await read('ai-workflow.js');
  assert.match(workflow, /task_id: taskId/);
  assert.match(workflow, /taskId: restored\?\.taskId \|\| DEFAULT_TASK_ID\(\)/);
  assert.match(workflow, /resetJobForSource\(job/);
  assert.match(workflow, /detail\.reason === 'task_processing'/);
  assert.match(workflow, /response\.headers\.get\('X-AI-Reused'\) === 'true'/);
  assert.match(workflow, /if \(!aiResult\.reused\) actualAiCalls \+= 1/);
  assert.match(workflow, /remaining < plan\.aiCount/);
  assert.match(workflow, /hasMeaningfulTransparency\(context\.getImageData/);
  assert.match(workflow, /job\.foregroundBlob && !job\.needsReprocess/);
  assert.match(workflow, /markCompositionChanged/);
  assert.match(workflow, /job\.userError \? `\$\{text\.failed\} · \$\{job\.userError\}` : text\.failed/);
  assert.match(workflow, /job\.userError = error\.userMessage \|\| null/);
  const jobStateText = extractFunction(workflow, 'function jobStateText(job)');
  assert.ok(
    jobStateText.indexOf("job.status === 'failed'") < jobStateText.indexOf('!job.aiRequested'),
    'failed local composition must stay visible when AI is off',
  );
  assert.doesNotMatch(workflow, /localStorage/);
  assert.match(workflow, /globalThis\.indexedDB/);
  assert.match(workflow, /SESSION_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(workflow, /SESSION_MAX_BYTES = 150 \* 1024 \* 1024/);
  assert.match(workflow, /deleteExpired/);
  assert.match(workflow, /restoreSession/);
  assert.equal((workflow.match(/\/api\/remove-bg/g) || []).length, 1);

  for (const file of indexFiles) {
    const html = await read(file);
    assert.match(html, /src="\/ai-workflow\.js\?v=20260726-ai-stage8b-v1"/, file);
    assert.match(html, /src="\/background-composer\.js\?v=20260726-ai-stage8b-v1"/, file);
    assert.match(html, /src="\/product-organizer\.js\?v=20260726-ai-stage8b-v1"/, file);
    assert.match(html, /href="\/ai-workflow\.css\?v=20260726-ai-stage8b-v1"/, file);
    assert.match(html, /const DEVICE_ID = getOrCreateDeviceId\(\)/, file);
    assert.match(html, /'X-Device-ID': DEVICE_ID/, file);
    assert.match(html, /aiWorkflow\?\.register\(file, i, card, restoredItem\?\.job \|\| null\)/, file);
    assert.match(html, /aiWorkflow\?\.markSourceChanged\(i\)/, file);
    assert.match(html, /aiWorkflow\.process\(\)/, file);
    assert.match(html, /id="aiRemoveToggle"/, file);
    assert.match(html, /id="aiEstimate"/, file);
    assert.match(html, /id="aiSessionClear"/, file);
    assert.match(html, /data-session-restored=/, file);
    assert.match(html, /getSessionOwner: \(\) => currentUser\?\.id/, file);
    assert.match(html, /getCompositionState: \(\) => \(\{[\s\S]*outputFormat,[\s\S]*outputQuality,[\s\S]*\}\)/, file);
    assert.match(html, /productFolders: productOrganizer\.getState\(\)/, file);
    assert.match(html, /productOrganizer\.restore\(settings\.productFolders\)/, file);
    assert.match(html, /productOrganizer\?\.register\(file, i\)/, file);
    assert.match(html, /productOrganizer\.buildEntries\(processedResults\)/, file);
    assert.equal((html.match(/id="productOrganizerPanel"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOrganizerOpen"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOrganizerSummary"/g) || []).length, 1, file);
    assert.match(html, /data-dialog-subtitle="[^"]+(?:browser|Browser|navegador|navigateur)[^"]*"/i, file);
    assert.match(html, /data-root-preview=/, file);
    assert.match(html, /restoreFiles: async \(items, composition\)/, file);
    assert.match(html, /handleFiles\(files, \{ restoredItems = \[\] \} = \{\}\)/, file);
    assert.match(html, /initialSource: restoredItem\?\.sourceBlob \|\| null/, file);
    assert.match(html, /window\.addEventListener\('load'[\s\S]*aiWorkflow\.restoreSession\(\)/, file);
    assert.match(html, /data-summary="\{ai\}[^"]+\{total\}[^"]+\{noCharge\}/, file);
    assert.match(html, /const limit = currentUser \? 50 : 1/, file);
    assert.match(html, /slice\(0, Math\.max\(0, limit - selectedFiles\.length\)\)/, file);
    assert.equal((html.match(/id="downloadBtn"/g) || []).length, 1, file);
    assert.match(html, /function setDownloadActions\(outputs, keepProcessReady = false\)/, file);
    assert.match(html, /setDownloadActions\(outputs, aiWorkflow\.getPlan\(\)\.aiCount > 0\)/, file);
    assert.equal((html.match(/id="bgImage"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundImageInput"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundFit"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productScale"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOffsetX"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOffsetY"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productCenter"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productBottom"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productShadow"/g) || []).length, 1, file);
    assert.equal((html.match(/id="itemOverrideCopy"/g) || []).length, 1, file);
    assert.equal((html.match(/id="outputQuality"/g) || []).length, 1, file);
    assert.equal((html.match(/id="outputFormatNote"/g) || []).length, 1, file);
    assert.equal((html.match(/class="output-format-btn/g) || []).length, 3, file);
    assert.equal((html.match(/class="size-btn/g) || []).length, 6, file);
    assert.match(html, /id="productScale" type="range" min="50" max="140"/, file);
    assert.match(html, /id="productOffsetX" type="range" min="-40" max="40"/, file);
    assert.match(html, /id="productOffsetY" type="range" min="-40" max="40"/, file);
    assert.match(html, /id="outputQuality" type="range" min="50" max="100"/, file);
    assert.match(html, /data-format="png"/, file);
    assert.match(html, /data-format="jpeg"/, file);
    assert.match(html, /data-format="webp"/, file);
    assert.match(html, /data-sz="600"[\s\S]*TikTok Shop[\s\S]*600 × 600/, file);
    assert.match(html, /data-sz="1024"[\s\S]*Shopee[\s\S]*1024 × 1024/, file);
    assert.match(html, /new Set\(\['2048', '1000', '500', '600', '1024', 'original'\]\)/, file);
    assert.equal(
      (html.match(/if \(\['600', '1024'\]\.includes\(outputSize\) && outputFormat === 'webp'\) outputFormat = 'jpeg'/g) || []).length,
      2,
      file,
    );
    assert.match(html, /const isTikTokShop = outputSize === '600'/, file);
    assert.match(html, /const isShopee = outputSize === '1024'/, file);
    assert.match(html, /button\.disabled = isUnsupportedWebP/, file);
    assert.match(html, /if \(\['600', '1024'\]\.includes\(outputSize\) && format === 'webp'\) return/, file);
    assert.match(html, /data-tiktok-note="[^"]+TikTok Shop[^"]+10 (?:MB|Mo)[^"]*"/i, file);
    assert.match(html, /data-tiktok-disabled="[^"]*WebP[^"]*"/i, file);
    assert.match(html, /data-tiktok-disabled="[^"]*TikTok Shop[^"]*"/i, file);
    assert.match(html, /data-shopee-note="[^"]+Shopee[^"]+1024 × 1024[^"]+2 (?:MB|Mo)[^"]*"/i, file);
    assert.match(html, /data-shopee-note="[^"]+(?:market|Markt|mercado|marché)[^"]*"/i, file);
    assert.match(html, /data-shopee-disabled="[^"]*WebP[^"]*"/i, file);
    assert.match(html, /data-shopee-too-large="[^"]+2 (?:MB|Mo)[^"]+(?:JPEG)[^"]*"/i, file);
    assert.match(html, /data-jpeg-note="[^"]+(?:white|weiß|blanco|blanc|branco)[^"]*"/i, file);
    assert.match(html, /accept="\.jpg,\.jpeg,\.png,\.webp,image\/jpeg,image\/png,image\/webp"/, file);
    assert.match(html, /validateComposition: \(\{ jobs \}\) => backgroundComposer\.validateJobs\(jobs\)/, file);
    assert.match(html, /backgroundComposer\?\.decorateCard\(card, i, file\.name\)/, file);
    assert.match(html, /backgroundComposer\.compose\(inputBlob, outputSize, index, \{[\s\S]*format: outputFormat,[\s\S]*quality: outputQuality/, file);
    assert.match(html, /if \(outputSize !== '1024'\) return output/, file);
    assert.match(html, /enforceOutputMaxBytes\(output, \{[\s\S]*maxBytes: 2 \* 1024 \* 1024,[\s\S]*reason: 'shopee_output_too_large',[\s\S]*dataset\.shopeeTooLarge/, file);
    assert.match(html, /case 'sequence': return `\$\{num\}\.\$\{extension\}`/, file);
    assert.match(html, /getOutputEncoding\([\s\S]*outputFormat,[\s\S]*outputQuality/, file);
    assert.match(html, /onChanged: index => aiWorkflow\?\.markCompositionChanged\(index\)/, file);
    assert.match(html, /\.local-clean-card-btn, \.composition-card-btn/, file);
    assert.equal((html.match(/\/api\/remove-bg/g) || []).length, 0, file);
  }
});

test('all localized workspaces integrate the browser-only local cleanup editor', async () => {
  const cleaner = await read('local-cleaner.js');
  const worker = await read('local-cleaner-worker.js');
  const core = await read('local-inpaint-core.mjs');

  assert.match(cleaner, /new Worker\('\/local-cleaner-worker\.js\?v=20260725-preview-v3', \{ type: 'module' \}\)/);
  assert.match(cleaner, /decorateCard\(card, file, index/);
  assert.match(cleaner, /getSourceFile\(file\)/);
  assert.match(cleaner, /Only edit images you own or are authorized to modify/);
  assert.match(cleaner, /document\.body\.append\(link\)/);
  assert.match(cleaner, /link\.download = `\$\{baseName\}-cleaned\.png`/);
  assert.match(cleaner, /document\.getElementById\('localCleanupShortcut'\)/);
  assert.match(cleaner, /cardButtons\[0\]\?\.click\(\)/);
  assert.match(cleaner, /shortcutButton\.disabled = cardButtons\.length === 0/);
  assert.match(cleaner, /options\.initialSource && options\.initialSource !== file/);
  assert.match(cleaner, /edits\.set\(file, options\.initialSource\)/);
  assert.match(cleaner, /stage\.addEventListener\('wheel'/);
  assert.match(cleaner, /event\.ctrlKey && !event\.metaKey/);
  assert.match(cleaner, /const compositeMaskValues = dilateCompositeMask\(mask, workWidth, workHeight, 2\)/);
  assert.match(cleaner, /compositeMaskValues\[index\] \? 255 : 0/);
  assert.match(cleaner, /repairedAreaContext\.globalCompositeOperation = 'destination-in'/);
  assert.match(worker, /import \{ dilateMask, inpaintRgba \}/);
  assert.doesNotMatch(worker, /maskBuffer: expandedMask\.buffer/);
  assert.match(worker, /sampleRadius: 6/);
  assert.match(worker, /smoothingPasses: 8/);
  assert.doesNotMatch(cleaner, /\bfetch\s*\(/);
  assert.doesNotMatch(worker, /\bfetch\s*\(/);
  assert.doesNotMatch(core, /\bfetch\s*\(/);
  assert.doesNotMatch(`${cleaner}\n${worker}\n${core}`, /\/api\/inpaint|https?:\/\//);

  for (const file of indexFiles) {
    const html = await read(file);
    assert.match(html, /href="\/local-cleaner\.css\?v=20260725-credit-center-v4"/, file);
    assert.match(html, /src="\/local-cleaner\.js\?v=20260725-ai-stage5b-v1"/, file);
    assert.equal((html.match(/id="localCleanEntry"/g) || []).length, 1, file);
    assert.equal((html.match(/id="localCleanupShortcut"/g) || []).length, 1, file);
    assert.match(html, /class="local-clean-shortcut" id="localCleanupShortcut" type="button" disabled/, file);
    assert.match(html, /local-clean-entry-pill/, file);
    assert.match(html, /🧽/, file);
    assert.doesNotMatch(html, /ShopBGLocalCleaner\?\.clearAll\(\)/, file);
    assert.match(html, /selectedFiles\.push\(\.\.\.additions\)/, file);
    assert.match(html, /additions\.forEach\(\(file, offset\)/, file);
    assert.match(html, /fileInput\.value = ''/, file);
    assert.match(html, /ShopBGLocalCleaner\?\.decorateCard\(card, file, i/, file);
    assert.match(html, /getSourceFile: \(file\) => window\.ShopBGLocalCleaner\?\.getSourceFile\(file\) \|\| file/, file);
    assert.match(html, /onApply: \(\{ previewUrl, restored \}\)/, file);
    assert.match(html, /resetProcessActionAfterLocalEdit\(index, restored = false\)/, file);
    assert.match(html, /badge\.textContent = restored \? '⏳' : '✏️'/, file);
    assert.equal((html.match(/id="workspacePreview"/g) || []).length, 1, file);
    assert.equal((html.match(/id="workspacePreviewImage"/g) || []).length, 1, file);
    assert.match(html, /function showWorkspacePreview\(index\)/, file);
    assert.match(html, /function updateWorkspacePreview\(index, imageUrl\)/, file);
    assert.match(html, /updateWorkspacePreview\(i, previewUrl\)/, file);
    assert.match(html, /updateWorkspacePreview\(index, objectUrl\)/, file);
    assert.match(html, /card\.addEventListener\('click'/, file);
    assert.equal((html.match(/\/api\/remove-bg/g) || []).length, 0, file);
  }
});

test('workspace preview and columns share a responsive aligned layout', async () => {
  const css = await read('local-cleaner.css');
  assert.match(css, /\.workspace\{align-items:stretch\}/);
  assert.match(css, /\.canvas-area\{display:flex;flex-direction:column\}/);
  assert.match(css, /\.settings-panel\{align-self:stretch\}/);
  assert.match(css, /\.workspace-preview\.visible\{display:block\}/);
  assert.match(css, /\.workspace-preview-stage\{/);
  assert.match(css, /object-fit:contain/);
});

test('signed-in mobile navigation stays within the viewport', async () => {
  const css = await read('ai-workflow.css');
  assert.match(css, /@media\(max-width:640px\)\{/);
  assert.match(css, /\.navbar\{padding-left:12px;padding-right:12px;gap:10px\}/);
  assert.match(css, /\.nav-logo-text\{display:none\}/);
  assert.match(css, /\.credits-add,\.user-name\{display:none\}/);
  assert.match(css, /\.nav-right\{min-width:0;gap:6px\}/);
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

test('uploaded background validation and composition stay browser-local', async () => {
  const composer = await read('background-composer.js');
  assert.match(composer, /MAX_BACKGROUND_BYTES = 20 \* 1024 \* 1024/);
  assert.match(composer, /new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/);
  assert.match(composer, /getImagePlacement/);
  assert.match(composer, /getForegroundPlacement/);
  assert.match(composer, /context\.drawImage\(\s*background/);
  assert.match(composer, /context\.shadowColor = 'rgba\(15, 23, 42, 0\.28\)'/);
  assert.match(composer, /const itemOverrides = new Map\(\)/);
  assert.match(composer, /function decorateCard\(card, index, fileName = ''\)/);
  assert.match(composer, /itemOverrides: Object\.fromEntries/);
  assert.match(composer, /options\.onChanged\?\.\(index\)/);
  assert.match(composer, /editorElements\.name\.textContent = fileName/);
  assert.match(composer, /if \(!encoding\.supportsAlpha\)/);
  assert.match(composer, /context\.fillStyle = '#FFFFFF'/);
  assert.match(composer, /canvas\.toBlob\(encoded, encoding\.mime, encoding\.quality\)/);
  assert.match(composer, /blob\.type !== encoding\.mime/);
  assert.doesNotMatch(composer, /\bfetch\s*\(/);
  assert.doesNotMatch(composer, /\/api\/|https?:\/\//);
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

test('localized privacy pages disclose browser-only 24-hour workspace recovery', async () => {
  const privacyFiles = locales.map((locale) => `${locale}privacy.html`);
  for (const file of privacyFiles) {
    const html = await read(file);
    assert.match(html, /IndexedDB/i, file);
    assert.match(html, /24 (?:hours|Stunden|horas|heures)/i, file);
    assert.match(html, /localStorage/, file);
    assert.doesNotMatch(
      html,
      /never stored after processing|nie gespeichert|nunca se almacenan después|jamais stockées après|nunca são armazenadas após/i,
      file,
    );
  }

  for (const file of indexFiles) {
    const html = await read(file);
    assert.doesNotMatch(
      html,
      /No data stored|Keine Datenspeicherung|Sin almacenamiento de datos|Aucun stockage|Sem armazenamento|no server upload|kein Server-Upload|sin subir nada al servidor|sans upload serveur|sem upload no servidor/i,
      file,
    );
  }
});

test('changed HTML files contain syntactically valid inline JavaScript', async () => {
  const files = [
    ...indexFiles,
    ...pricingFiles,
    ...termsFiles,
    'redeem.html',
    'credits.html',
    'referrals.html',
    ...localizedReferralFiles,
    'admin.html',
    'admin-vouchers.html',
    'admin-referrals.html',
    'ai-workflow.css',
    'ai-workflow.js',
    'background-composer.js',
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
    'credits.html',
    'credits-center.css',
    'credits-center.js',
    'background-composer.js',
    'product-organizer.js',
    'redeem.html',
    'referrals.html',
    'referrals-localized.css',
    'referrals-localized.js',
    'local-cleaner.css',
    'local-cleaner.js',
    'local-cleaner-worker.js',
    'local-inpaint-core.mjs',
    'admin.html',
    'admin-vouchers.html',
    'admin-referrals.html',
    'de/index.html',
    'de/referrals.html',
    'es/index.html',
    'es/referrals.html',
    'fr/index.html',
    'fr/referrals.html',
    'pt-br/index.html',
    'pt-br/referrals.html',
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

test('credit center is visible from every localized workspace and pricing page', async () => {
  const languageParams = ['en', 'de', 'es', 'fr', 'pt-br'];
  for (let index = 0; index < indexFiles.length; index += 1) {
    const home = await read(indexFiles[index]);
    const pricing = await read(pricingFiles[index]);
    const target = `/credits.html?lang=${languageParams[index]}`;
    assert.ok(home.includes(`href="${target}"`), indexFiles[index]);
    assert.ok(pricing.includes(`href="${target}"`), pricingFiles[index]);
    assert.match(pricing, /credit-shortcuts/, pricingFiles[index]);
    assert.match(pricing, /href="\/redeem\.html"/, pricingFiles[index]);
  }

  const center = await read('credits.html');
  const script = await read('credits-center.js');
  assert.match(center, /id="creditApp"/);
  assert.match(center, /id="paypalAction"/);
  assert.match(center, /href="\/redeem\.html"/);
  assert.match(await read('redeem.html'), /href="\/credits\.html\?lang=en"/);
  assert.match(script, /\/api\/credits\/center/);
  assert.match(script, /credentials:\s*'include'/);
  assert.match(script, /registration_free/);
  assert.match(script, /first_purchase_bonus/);
  assert.match(script, /replaceChildren\(\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);

  for (const file of pricingFiles) {
    assert.match(
      await read(file),
      /id="authBtn" onclick="window\.location\.href='https:\/\/api\.shopbgremover\.com\/auth\/login'"/,
      file,
    );
  }
});

test('administrator overview links all billing operations without exposing balance mutation', async () => {
  const admin = await read('admin.html');
  assert.match(admin, /\/api\/admin\/overview/);
  assert.match(admin, /href="\/admin-vouchers"/);
  assert.match(admin, /href="\/admin-referrals"/);
  assert.match(admin, /credentials:\s*'include'/);
  assert.doesNotMatch(admin, /UPDATE user_credits|manual-credit|adjust-balance/i);
  assert.match(await read('admin-vouchers.html'), /href="\/admin"/);
  assert.match(await read('admin-referrals.html'), /href="\/admin"/);
});

test('localized low-credit prompts no longer advertise subscriptions or fake discounts', async () => {
  for (const file of indexFiles) {
    const html = await read(file);
    assert.doesNotMatch(html, /10\s*%|next month|próximo mes|prochain|nächsten Monat|próximo mês/i, file);
  }
});

test('voucher redemption and referral center use server-backed referral APIs', async () => {
  const redeem = await read('redeem.html');
  const referrals = await read('referrals.html');
  assert.match(redeem, /id="referralCode"/);
  assert.match(redeem, /referral_code:\s*referralCode/);
  assert.match(redeem, /不能再补填推荐人/);
  assert.match(referrals, /\/api\/referrals\/me/);
  assert.match(referrals, /credentials:\s*'include'/);
  assert.match(referrals, /available_reward_credits/);
  assert.match(referrals, /pending_reward_credits/);
  assert.match(referrals, /next_pending_release_at/);
  assert.match(referrals, /'X-Device-ID': deviceId/);
  assert.match(referrals, /reward_history/);
  assert.match(referrals, /renderInvitees\(data\.invitees/);
  assert.match(referrals, /7 天观察期/);
  assert.doesNotMatch(referrals, /\.innerHTML\s*=/);
  assert.doesNotMatch(referrals, /localStorage.*referral/i);
});

test('localized referral centers fully translate static and dynamic states', async () => {
  const expectations = [
    ['de/referrals.html', 'de', 'Empfehlungszentrum', '7-tägige Beobachtungsfrist', 'de-DE'],
    ['es/referrals.html', 'es', 'Centro de referidos', 'período de observación de 7 días', 'es-ES'],
    ['fr/referrals.html', 'fr', 'Centre de parrainage', 'période d’observation de 7 jours', 'fr-FR'],
    ['pt-br/referrals.html', 'pt-BR', 'Central de indicações', 'período de observação de 7 dias', 'pt-BR'],
  ];
  const sharedScript = await read('referrals-localized.js');

  assert.match(sharedScript, /\/api\/referrals\/me/);
  assert.match(sharedScript, /credentials:\s*'include'/);
  assert.match(sharedScript, /'X-Device-ID': deviceId/);
  assert.match(sharedScript, /referral_first_purchase/);
  assert.match(sharedScript, /referral_repeat_purchase/);
  assert.match(sharedScript, /relationshipStatuses/);
  assert.match(sharedScript, /riskStatuses/);
  assert.doesNotMatch(sharedScript, /\.innerHTML\s*=/);
  assert.doesNotMatch(sharedScript, /[\u3400-\u9fff]/);

  for (const [file, language, heading, observationCopy, locale] of expectations) {
    const html = await read(file);
    assert.match(html, new RegExp(`<html lang="${language}">`), file);
    assert.match(html, new RegExp(`<h1>${heading}</h1>`), file);
    assert.match(html, /href="\/referrals-localized\.css"/, file);
    assert.match(html, /src="\/referrals-localized\.js"/, file);
    assert.match(html, /hreflang="en"/, file);
    assert.match(html, /hreflang="de"/, file);
    assert.match(html, /hreflang="es"/, file);
    assert.match(html, /hreflang="fr"/, file);
    assert.match(html, /hreflang="pt-BR"/, file);
    assert.doesNotMatch(html, /[\u3400-\u9fff]/, file);
    assert.ok(sharedScript.includes(observationCopy), file);
    assert.ok(sharedScript.includes(`locale: '${locale}'`), file);
  }
});

test('referral review admin uses masked risk queue and explicit decisions', async () => {
  const admin = await read('admin-referrals.html');
  assert.match(admin, /\/api\/admin\/referral-reviews/);
  assert.match(admin, /\/\$\{decision\}/);
  assert.match(admin, /same_device/);
  assert.match(admin, /审核说明必须为 3–500 个字符/);
  assert.match(admin, /<dialog id="reviewDialog"/);
  assert.match(admin, /<textarea id="reviewNote" minlength="3" maxlength="500" required>/);
  assert.match(admin, /<input id="reviewConfirm" type="checkbox" required>/);
  assert.match(admin, /function openReviewDialog\(id, decision, button\)/);
  assert.doesNotMatch(admin, /\bprompt\s*\(/);
  assert.doesNotMatch(admin, /\bconfirm\s*\(/);
  assert.match(admin, /rows\.append\(row\)/);
  assert.doesNotMatch(admin, /\.innerHTML\s*=/);
});

test('referral reward observation release has an hourly cron trigger', async () => {
  const config = await read('wrangler.toml');
  assert.match(config, /\[triggers\][\s\S]*crons\s*=\s*\["17 \* \* \* \*"\]/);
});

test('voucher admin exposes server-backed dispute reversal with an explicit reason', async () => {
  const admin = await read('admin-vouchers.html');
  assert.match(admin, /\/dispute-reverse/);
  assert.match(admin, /JSON\.stringify\(\{\s*reason:\s*normalized\s*\}\)/);
  assert.match(admin, /争议冲正/);
  assert.match(admin, /不可撤销/);
  assert.match(admin, /<dialog id="disputeDialog"/);
  assert.match(admin, /<textarea id="disputeReason" minlength="10" maxlength="500" required>/);
  assert.match(admin, /<input id="disputeConfirm" type="checkbox" required>/);
  assert.match(admin, /function openDisputeDialog\(id, button\)/);
  assert.doesNotMatch(admin, /\bprompt\s*\(/);
});

test('localized homepages capture referral links through the signed server endpoint', async () => {
  for (const file of indexFiles) {
    const html = await read(file);
    assert.match(html, /new URLSearchParams\(window\.location\.search\)/, file);
    assert.match(html, /\/api\/referrals\/capture/, file);
    assert.match(html, /credentials:\s*'include'/, file);
    assert.doesNotMatch(html, /localStorage\.(?:setItem|getItem)\(['"]referral/i, file);
  }
});
