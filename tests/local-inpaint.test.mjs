import assert from 'node:assert/strict';
import test from 'node:test';

import { dilateMask, inpaintRgba } from '../local-inpaint-core.mjs';

function solidImage(width, height, rgba) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set(rgba, index * 4);
  }
  return pixels;
}

test('local inpaint returns an unchanged copy for an empty mask', () => {
  const input = solidImage(4, 3, [12, 34, 56, 255]);
  const output = inpaintRgba(input, 4, 3, new Uint8Array(12));
  assert.deepEqual(output, input);
  assert.notEqual(output, input);
});

test('local inpaint replaces a marked pixel from surrounding source pixels', () => {
  const input = solidImage(7, 7, [20, 180, 80, 255]);
  const center = 3 * 7 + 3;
  input.set([240, 20, 30, 255], center * 4);
  const mask = new Uint8Array(49);
  mask[center] = 1;

  const output = inpaintRgba(input, 7, 7, mask, { expansion: 0, sampleRadius: 2 });
  assert.deepEqual(Array.from(output.slice(center * 4, center * 4 + 4)), [20, 180, 80, 255]);
});

test('mask dilation expands the selected area without touching distant pixels', () => {
  const mask = new Uint8Array(25);
  mask[12] = 1;
  const expanded = dilateMask(mask, 5, 5, 1);
  assert.equal(expanded[12], 1);
  assert.equal(expanded[6], 1);
  assert.equal(expanded[18], 1);
  assert.equal(expanded[0], 0);
  assert.equal(expanded[24], 0);
});

test('local inpaint rejects a mask that covers the entire source', () => {
  const input = solidImage(3, 3, [10, 20, 30, 255]);
  assert.throws(
    () => inpaintRgba(input, 3, 3, new Uint8Array(9).fill(1)),
    /leave some source pixels/,
  );
});

test('transparent source pixels do not leak hidden RGB into repaired edges', () => {
  const input = solidImage(3, 3, [0, 0, 255, 0]);
  input.set([240, 30, 20, 255], 3 * 4);
  input.set([240, 30, 20, 255], 5 * 4);
  const center = 4;
  input.set([20, 240, 20, 255], center * 4);
  const mask = new Uint8Array(9);
  mask[center] = 1;

  const output = inpaintRgba(input, 3, 3, mask, { expansion: 0, sampleRadius: 1 });
  const repaired = Array.from(output.slice(center * 4, center * 4 + 4));
  assert.deepEqual(repaired.slice(0, 3), [240, 30, 20]);
  assert.ok(repaired[3] > 0 && repaired[3] < 255);
});

test('fully transparent repairs normalize hidden color channels to zero', () => {
  const input = solidImage(3, 3, [90, 180, 240, 0]);
  const center = 4;
  input.set([255, 0, 0, 255], center * 4);
  const mask = new Uint8Array(9);
  mask[center] = 1;

  const output = inpaintRgba(input, 3, 3, mask, { expansion: 0, sampleRadius: 1 });
  assert.deepEqual(Array.from(output.slice(center * 4, center * 4 + 4)), [0, 0, 0, 0]);
});

test('quality smoothing keeps every unmasked source pixel exact', () => {
  const width = 5;
  const height = 3;
  const input = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      input.set([x * 50, 120, 200 - x * 30, 255], (y * width + x) * 4);
    }
  }
  const center = 1 * width + 2;
  input.set([255, 0, 0, 255], center * 4);
  const mask = new Uint8Array(width * height);
  mask[center] = 1;

  const output = inpaintRgba(input, width, height, mask, {
    expansion: 0,
    sampleRadius: 3,
    smoothingPasses: 8,
  });

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    assert.deepEqual(
      Array.from(output.slice(index * 4, index * 4 + 4)),
      Array.from(input.slice(index * 4, index * 4 + 4)),
    );
  }
  const repaired = Array.from(output.slice(center * 4, center * 4 + 4));
  assert.ok(repaired[0] >= 90 && repaired[0] <= 110);
  assert.equal(repaired[3], 255);
});

test('768px work crop remains bounded for a small local selection', () => {
  const width = 768;
  const height = 768;
  const input = solidImage(width, height, [210, 215, 220, 255]);
  const mask = new Uint8Array(width * height);
  for (let y = 352; y < 416; y += 1) {
    for (let x = 352; x < 416; x += 1) mask[y * width + x] = 1;
  }

  const started = performance.now();
  const output = inpaintRgba(input, width, height, mask, {
    expansion: 2,
    sampleRadius: 6,
    smoothingPasses: 8,
  });
  const elapsed = performance.now() - started;

  assert.equal(output.length, input.length);
  assert.deepEqual(Array.from(output.slice((384 * width + 384) * 4, (384 * width + 384) * 4 + 4)), [210, 215, 220, 255]);
  assert.ok(elapsed < 2500, `expected 768px crop under 2500ms, received ${elapsed.toFixed(1)}ms`);
});
