import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('local inpaint validation harness stays browser-local and outside the Pages build', async () => {
  const [html, client, worker, build] = await Promise.all([
    read('validation/local-inpaint.html'),
    read('validation/local-inpaint-validation.js'),
    read('validation/local-inpaint-validation-worker.mjs'),
    read('scripts/build_static_pages.mjs'),
  ]);

  assert.match(html, /LOCAL VALIDATION ONLY/);
  assert.match(html, /id="loadWoven"/);
  assert.match(html, /id="loadAlpha"/);
  assert.match(html, /id="loadPhoto"/);
  assert.match(html, /id="toolSelect"/);
  assert.match(html, /id="candidateStatus"/);
  assert.match(client, /new Worker\('\.\/local-inpaint-validation-worker\.mjs', \{ type: 'module' \}\)/);
  assert.match(client, /resizeCanvases\(768, 768\)/);
  assert.match(client, /fetch\('\/photo\/bread\.jpg'/);
  assert.doesNotMatch(client, /https?:\/\//);
  assert.match(worker, /minPeriod: 4/);
  assert.match(worker, /maxPeriodError: 6/);
  assert.match(worker, /algorithmUsed = 'production-fallback'/);
  assert.match(worker, /outsideMaxDelta/);
  assert.doesNotMatch(build, /validation\/local-inpaint/);
});
