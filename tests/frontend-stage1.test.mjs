import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const locales = ['', 'de/', 'es/', 'fr/', 'pt-br/', 'zh-cn/'];
const indexFiles = locales.map((locale) => `${locale}index.html`);
const pricingFiles = locales.map((locale) => `${locale}pricing.html`);
const termsFiles = locales.map((locale) => `${locale}terms.html`);
const publicSeoFiles = locales.flatMap((locale) => [
  'index.html',
  'pricing.html',
  'shopify-background-remover.html',
  'amazon-ebay-product-images.html',
  'contact.html',
  'privacy.html',
  'terms.html',
].map((file) => `${locale}${file}`));
const localizedReferralFiles = ['de/', 'es/', 'fr/', 'pt-br/', 'zh-cn/'].map(
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
    assert.match(html, /src="\/ai-workflow\.js\?v=20260726-bg-controls-v1"/, file);
    assert.match(html, /src="\/background-composer\.js\?v=20260726-bg-controls-v1"/, file);
    assert.match(html, /src="\/product-organizer\.js\?v=20260726-bg-controls-v1"/, file);
    assert.match(html, /href="\/ai-workflow\.css\?v=20260726-bg-controls-v1"/, file);
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
    assert.match(html, /getCompositionState: \(\) => \(\{[\s\S]*outputSize,[\s\S]*outputPlatform,[\s\S]*outputFormat,[\s\S]*outputQuality,[\s\S]*\}\)/, file);
    assert.match(html, /productFolders: productOrganizer\.getState\(\)/, file);
    assert.match(html, /productOrganizer\.restore\(settings\.productFolders\)/, file);
    assert.match(html, /productOrganizer\?\.register\(file, i\)/, file);
    assert.match(html, /productOrganizer\.buildEntries\(processedResults\)/, file);
    assert.equal((html.match(/id="productOrganizerPanel"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOrganizerOpen"/g) || []).length, 1, file);
    assert.equal((html.match(/id="productOrganizerSummary"/g) || []).length, 1, file);
    assert.match(html, /data-dialog-subtitle="[^"]+(?:browser|Browser|navegador|navigateur|浏览器)[^"]*"/i, file);
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
    assert.equal((html.match(/id="backgroundScale"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundOffsetX"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundOffsetY"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundBlur"/g) || []).length, 1, file);
    assert.equal((html.match(/id="backgroundCenter"/g) || []).length, 1, file);
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
    assert.match(html, /id="backgroundScale" type="range" min="50" max="200"/, file);
    assert.match(html, /id="backgroundOffsetX" type="range" min="-50" max="50"/, file);
    assert.match(html, /id="backgroundOffsetY" type="range" min="-50" max="50"/, file);
    assert.match(html, /id="backgroundBlur" type="range" min="0" max="30"/, file);
    assert.match(html, /data-background-size-label=/, file);
    assert.match(html, /data-background-blur-label=/, file);
    assert.match(html, /id="productOffsetX" type="range" min="-40" max="40"/, file);
    assert.match(html, /id="productOffsetY" type="range" min="-40" max="40"/, file);
    assert.match(html, /id="outputQuality" type="range" min="50" max="100"/, file);
    assert.match(html, /data-format="png"/, file);
    assert.match(html, /data-format="jpeg"/, file);
    assert.match(html, /data-format="webp"/, file);
    assert.match(html, /data-sz="2048" data-platform="shopify"[\s\S]*Shopify[\s\S]*2048 × 2048/, file);
    assert.match(html, /data-sz="1600" data-platform="amazon"[\s\S]*Amazon[\s\S]*1600 × 1600/, file);
    assert.match(html, /data-sz="1600" data-platform="ebay"[\s\S]*eBay[\s\S]*1600 × 1600/, file);
    assert.match(html, /data-sz="600"[\s\S]*TikTok Shop[\s\S]*600 × 600/, file);
    assert.match(html, /data-sz="1024"[\s\S]*Shopee[\s\S]*1024 × 1024/, file);
    assert.match(html, /const validSizes = new Set\(Object\.values\(platformSizes\)\)/, file);
    assert.match(html, /settings\.outputSize === '1000'[\s\S]*outputPlatform = 'amazon'/, file);
    assert.match(html, /settings\.outputSize === '500'[\s\S]*outputPlatform = 'ebay'/, file);
    assert.equal(
      (html.match(/if \(\['amazon', 'tiktok', 'shopee'\]\.includes\(outputPlatform\) && outputFormat === 'webp'\) outputFormat = 'jpeg'/g) || []).length,
      2,
      file,
    );
    assert.match(html, /const isAmazon = outputPlatform === 'amazon'/, file);
    assert.match(html, /const isTikTokShop = outputPlatform === 'tiktok'/, file);
    assert.match(html, /const isShopee = outputPlatform === 'shopee'/, file);
    assert.match(html, /button\.disabled = isUnsupportedWebP/, file);
    assert.match(html, /if \(\['amazon', 'tiktok', 'shopee'\]\.includes\(outputPlatform\) && format === 'webp'\) return/, file);
    assert.match(html, /data-shopify-note="[^"]+2048 × 2048[^"]+(?:20 MB|20 Mo)[^"]*"/i, file);
    assert.match(html, /data-shopify-too-large="[^"]+(?:20 MB|20 Mo)[^"]+(?:JPEG)[^"]*"/i, file);
    assert.match(html, /data-amazon-note="[^"]+1600 × 1600[^"]+85 ?%[^"]*"/i, file);
    assert.match(html, /data-amazon-disabled="[^"]*WebP[^"]+(?:JPEG)[^"]+(?:PNG)[^"]*"/i, file);
    assert.match(html, /data-ebay-note="[^"]+1600 × 1600[^"]+500 px[^"]+(?:12 MB|12 Mo)[^"]*"/i, file);
    assert.match(html, /data-ebay-too-large="[^"]+(?:12 MB|12 Mo)[^"]+(?:JPEG)[^"]*"/i, file);
    assert.match(html, /data-tiktok-note="[^"]+TikTok Shop[^"]+10 (?:MB|Mo)[^"]*"/i, file);
    assert.match(html, /data-tiktok-disabled="[^"]*WebP[^"]*"/i, file);
    assert.match(html, /data-tiktok-disabled="[^"]*TikTok Shop[^"]*"/i, file);
    assert.match(html, /data-shopee-note="[^"]+Shopee[^"]+1024 × 1024[^"]+2 (?:MB|Mo)[^"]*"/i, file);
    assert.match(html, /data-shopee-note="[^"]+(?:market|Markt|mercado|marché|市场)[^"]*"/i, file);
    assert.match(html, /data-shopee-disabled="[^"]*WebP[^"]*"/i, file);
    assert.match(html, /data-shopee-too-large="[^"]+2 (?:MB|Mo)[^"]+(?:JPEG)[^"]*"/i, file);
    assert.match(html, /data-jpeg-note="[^"]+(?:white|weiß|blanco|blanc|branco|白色)[^"]*"/i, file);
    assert.match(html, /accept="\.jpg,\.jpeg,\.png,\.webp,image\/jpeg,image\/png,image\/webp"/, file);
    assert.match(html, /validateComposition: \(\{ jobs \}\) => backgroundComposer\.validateJobs\(jobs\)/, file);
    assert.match(html, /backgroundComposer\?\.decorateCard\(card, i, file\.name\)/, file);
    assert.match(html, /backgroundComposer\.compose\(inputBlob, outputSize, index, \{[\s\S]*format: outputFormat,[\s\S]*quality: outputQuality/, file);
    assert.match(html, /shopify: \{[\s\S]*maxBytes: 20 \* 1024 \* 1024 - 1,[\s\S]*reason: 'shopify_output_too_large'/, file);
    assert.match(html, /ebay: \{[\s\S]*maxBytes: 12 \* 1024 \* 1024,[\s\S]*reason: 'ebay_output_too_large'/, file);
    assert.match(html, /shopee: \{[\s\S]*maxBytes: 2 \* 1024 \* 1024,[\s\S]*reason: 'shopee_output_too_large'/, file);
    assert.match(html, /userMessage: note\.dataset\[platformLimit\.message\]/, file);
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

test('marketplace guides use verified current image limits without compliance guarantees', async () => {
  const shopifyFiles = locales.map((locale) => `${locale}shopify-background-remover.html`);
  const marketplaceFiles = locales.map((locale) => `${locale}amazon-ebay-product-images.html`);

  for (const file of shopifyFiles) {
    const html = await read(file);
    assert.match(html, /2048×2048/, file);
    assert.match(html, /5000×5000/, file);
    assert.match(html, /25(?: (?:megapixels|Megapixel|megapíxeles|mégapixels)|00 万像素)/i, file);
    assert.match(html, /(?:20 MB|20 Mo)/, file);
    assert.doesNotMatch(html, /800×800|4472×4472|80–90/, file);
  }

  for (const file of marketplaceFiles) {
    const html = await read(file);
    assert.match(html, /1600×1600/, file);
    assert.match(html, /(?:12 MB|12 Mo)/, file);
    assert.match(html, /WebP/, file);
    assert.doesNotMatch(html, /1000×1000|500×500/, file);
    assert.doesNotMatch(
      html,
      /(?:policies automatically|Richtlinien[^<]*automatisch|políticas[^<]*automáticamente|politiques[^<]*automatiquement|políticas[^<]*automaticamente)/i,
      file,
    );
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
    assert.match(html, /24 (?:hours|Stunden|horas|heures|小时)/i, file);
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

test('Simplified Chinese locale covers the public site and six-language SEO graph', async () => {
  const chineseFiles = [
    'zh-cn/index.html',
    'zh-cn/pricing.html',
    'zh-cn/shopify-background-remover.html',
    'zh-cn/amazon-ebay-product-images.html',
    'zh-cn/contact.html',
    'zh-cn/privacy.html',
    'zh-cn/terms.html',
    'zh-cn/referrals.html',
  ];
  for (const file of chineseFiles) {
    const html = await read(file);
    assert.match(html, /<html lang="zh-CN">/, file);
    assert.match(html, /[\u3400-\u9fff]/, file);
    assert.match(html, /hreflang="zh-CN"/, file);
    assert.match(html, /href="\/zh-cn(?:\/|\/[^"]*)"|data-account-page="referrals"/, file);
  }

  const chineseHome = await read('zh-cn/index.html');
  assert.match(chineseHome, /AI 去背景/);
  assert.match(chineseHome, /href="\/credits\.html\?lang=zh-cn"/);
  assert.match(chineseHome, /Shopify 2048、Amazon 1600、eBay 1600/);
  assert.doesNotMatch(chineseHome, /Amazon 1000|eBay 500/);

  for (const file of [
    ...publicSeoFiles,
    ...localizedReferralFiles,
  ]) {
    assert.match(await read(file), /hreflang="zh-CN"/, file);
  }

  const sitemap = await read('sitemap.xml');
  assert.equal((sitemap.match(/<loc>/g) || []).length, 42);
  assert.equal((sitemap.match(/hreflang="zh-CN"/g) || []).length, 42);
  assert.match(sitemap, /<loc>https:\/\/www\.shopbgremover\.com\/zh-cn\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/www\.shopbgremover\.com\/zh-cn\/terms<\/loc>/);
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
    'account-nav.css',
    'account-nav.js',
    'background-composer.js',
    'product-organizer.js',
    'redeem.html',
    'redeem-localized.js',
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
    'zh-cn/index.html',
    'zh-cn/referrals.html',
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
  const languageParams = ['en', 'de', 'es', 'fr', 'pt-br', 'zh-cn'];
  for (let index = 0; index < pricingFiles.length; index += 1) {
    const html = await read(pricingFiles[index]);
    assert.ok(html.includes(`href="/redeem.html?lang=${languageParams[index]}"`), pricingFiles[index]);
  }
  const redeem = await read('redeem.html');
  const redeemScript = await read('redeem-localized.js');
  assert.match(redeem, /data-account-page="redeem"/);
  assert.match(redeemScript, /\/api\/vouchers\/redeem/);
  assert.match(redeemScript, /'X-Device-ID': deviceId/);
  assert.doesNotMatch(redeemScript, /localStorage.*voucher|voucher.*localStorage/i);
});

test('credit center is visible from every localized workspace and pricing page', async () => {
  const languageParams = ['en', 'de', 'es', 'fr', 'pt-br', 'zh-cn'];
  for (let index = 0; index < indexFiles.length; index += 1) {
    const home = await read(indexFiles[index]);
    const pricing = await read(pricingFiles[index]);
    const target = `/credits.html?lang=${languageParams[index]}`;
    assert.ok(home.includes(`href="${target}"`), indexFiles[index]);
    assert.ok(pricing.includes(`href="${target}"`), pricingFiles[index]);
    assert.match(pricing, /credit-shortcuts/, pricingFiles[index]);
    assert.ok(pricing.includes(`href="/redeem.html?lang=${languageParams[index]}"`), pricingFiles[index]);
  }

  const center = await read('credits.html');
  const script = await read('credits-center.js');
  assert.match(center, /id="creditApp"/);
  assert.match(center, /id="paypalAction"/);
  assert.match(center, /credits-center\.js\?v=20260727-account-nav-v3/);
  assert.match(center, /id="voucherAction" href="\/redeem\.html\?lang=en"/);
  assert.match(await read('redeem.html'), /href="\/credits\.html\?lang=en"/);
  assert.match(script, /\/api\/credits\/center/);
  assert.match(script, /credentials:\s*'include'/);
  assert.match(script, /registration_free/);
  assert.match(script, /first_purchase_bonus/);
  assert.match(script, /document\.title = `\$\{t\.title\} · ShopBG Remover`/);
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
  const redeemHtml = await read('redeem.html');
  const redeem = await read('redeem-localized.js');
  const referrals = await read('referrals.html');
  const referralScript = await read('referrals-localized.js');
  assert.match(redeemHtml, /id="referralCode"/);
  assert.match(redeem, /referral_code:\s*referralCode/);
  assert.match(redeem, /不能再补填推荐人/);
  assert.match(referrals, /data-account-page="referrals"/);
  assert.match(referralScript, /\/api\/referrals\/me/);
  assert.match(referralScript, /credentials:\s*'include'/);
  assert.match(referralScript, /available_reward_credits/);
  assert.match(referralScript, /pending_reward_credits/);
  assert.match(referralScript, /next_pending_release_at/);
  assert.match(referralScript, /'X-Device-ID': deviceId/);
  assert.match(referralScript, /reward_history/);
  assert.match(referralScript, /renderInvitees\(data\.invitees/);
  assert.match(referralScript, /7 天观察期/);
  assert.doesNotMatch(referralScript, /\.innerHTML\s*=/);
  assert.doesNotMatch(referralScript, /localStorage.*referral/i);
});

test('localized referral centers fully translate static and dynamic states', async () => {
  const expectations = [
    ['referrals.html', 'en', 'Referral center', '7-day observation period', 'en-US'],
    ['de/referrals.html', 'de', 'Empfehlungszentrum', '7-tägige Beobachtungsfrist', 'de-DE'],
    ['es/referrals.html', 'es', 'Centro de referidos', 'período de observación de 7 días', 'es-ES'],
    ['fr/referrals.html', 'fr', 'Centre de parrainage', 'période d’observation de 7 jours', 'fr-FR'],
    ['pt-br/referrals.html', 'pt-BR', 'Central de indicações', 'período de observação de 7 dias', 'pt-BR'],
    ['zh-cn/referrals.html', 'zh-CN', '推荐中心', '7 天观察期', 'zh-CN'],
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

  for (const [file, language, heading, observationCopy, locale] of expectations) {
    const html = await read(file);
    assert.match(html, new RegExp(`<html lang="${language}">`), file);
    assert.match(html, new RegExp(`<h1>${heading}</h1>`), file);
    assert.match(html, /href="\/referrals-localized\.css\?v=20260727-account-nav-v1"/, file);
    assert.match(html, /src="\/referrals-localized\.js\?v=20260727-account-nav-v1"/, file);
    assert.match(html, /hreflang="en"/, file);
    assert.match(html, /hreflang="de"/, file);
    assert.match(html, /hreflang="es"/, file);
    assert.match(html, /hreflang="fr"/, file);
    assert.match(html, /hreflang="pt-BR"/, file);
    assert.match(html, /hreflang="zh-CN"/, file);
    assert.match(html, /id="expiryStatus"/, file);
    assert.ok(sharedScript.includes(observationCopy), file);
    assert.ok(sharedScript.includes(`locale: '${locale}'`), file);
  }
});

test('account pages share one authenticated header and preserve all six locales', async () => {
  const navScript = await read('account-nav.js');
  const navStyles = await read('account-nav.css');
  const accountPages = [
    'credits.html',
    'redeem.html',
    'referrals.html',
    ...localizedReferralFiles,
  ];
  for (const file of accountPages) {
    const html = await read(file);
    assert.match(html, /href="\/account-nav\.css\?v=20260727-account-nav-v1"/, file);
    assert.match(html, /src="\/account-nav\.js\?v=20260727-account-nav-v1"/, file);
    assert.match(html, /class="account-navbar" data-account-nav data-account-page="(?:credits|redeem|referrals)"/, file);
  }

  assert.match(navScript, /\/api\/me/);
  assert.match(navScript, /credentials:\s*'include'/);
  assert.match(navScript, /\/auth\/login/);
  assert.match(navScript, /\/auth\/logout/);
  assert.match(navScript, /page === 'credits'/);
  assert.match(navScript, /page === 'redeem'/);
  assert.match(navScript, /page === 'referrals'/);
  assert.match(navStyles, /@media\(max-width:680px\)/);
  assert.match(navStyles, /\.account-nav-links\{display:none\}/);
  assert.match(navStyles, /\.account-nav-user\{display:none\}/);
  assert.match(navStyles, /\.account-nav-credits-add\{display:none\}/);
  for (const locale of ['en', 'de', 'es', 'fr', 'pt-br', 'zh-cn']) {
    assert.ok(navScript.includes(`${locale}: {`) || navScript.includes(`'${locale}': {`), locale);
  }

  const redeemScript = await read('redeem-localized.js');
  assert.match(redeemScript, /new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(redeemScript, /`\/credits\.html\?lang=\$\{locale\}`/);
  assert.match(redeemScript, /text\.referrals/);
  assert.match(await read('referrals.html'), /<html lang="en">/);
  assert.doesNotMatch(await read('referrals.html'), /<h1>推荐中心<\/h1>/);
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
