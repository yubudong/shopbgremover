import assert from 'node:assert/strict';
import test from 'node:test';

await import('../product-organizer.js');

const {
  buildArchiveEntries,
  sanitizeArchiveFileName,
  sanitizeProductFolder,
} = globalThis.ShopBGProductOrganizer;

test('product folders are sanitized without creating nested or unsafe paths', () => {
  assert.equal(sanitizeProductFolder(' SKU/Blue\\Large '), 'SKU-Blue-Large');
  assert.equal(sanitizeProductFolder('CON'), '_CON');
  assert.equal(sanitizeProductFolder('../..'), '');
  assert.equal(sanitizeProductFolder('a'.repeat(80)).length, 64);
});

test('ungrouped outputs remain at ZIP root and grouped outputs share a folder', () => {
  const outputs = [
    { index: 0, name: 'front.png', blob: { size: 1 } },
    { index: 1, name: 'side.png', blob: { size: 1 } },
    { index: 2, name: 'detail.png', blob: { size: 1 } },
  ];
  const entries = buildArchiveEntries(outputs, ['', 'SKU-001', 'SKU-001']);
  assert.deepEqual(entries.map(entry => entry.name), [
    'front.png',
    'SKU-001/side.png',
    'SKU-001/detail.png',
  ]);
});

test('same-folder collisions get stable suffixes while different folders keep names', () => {
  const outputs = [
    { index: 0, name: 'image.png', blob: {} },
    { index: 1, name: 'IMAGE.PNG', blob: {} },
    { index: 2, name: 'image.png', blob: {} },
  ];
  const entries = buildArchiveEntries(outputs, ['SKU-A', 'SKU-A', 'SKU-B']);
  assert.deepEqual(entries.map(entry => entry.name), [
    'SKU-A/image.png',
    'SKU-A/IMAGE-2.PNG',
    'SKU-B/image.png',
  ]);
});

test('archive filenames cannot escape their assigned product folder', () => {
  assert.equal(sanitizeArchiveFileName('../../hero?.png'), 'hero-.png');
  const [entry] = buildArchiveEntries(
    [{ index: 0, name: '../hero?.png', blob: {} }],
    [' SKU/01 '],
  );
  assert.equal(entry.name, 'SKU-01/hero-.png');
});
