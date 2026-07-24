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
