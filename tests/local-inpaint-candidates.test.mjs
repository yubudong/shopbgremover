import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inpaintAxisInterpolationRgba,
  inpaintPeriodicExtrapolationRgba,
} from '../local-inpaint-candidates.mjs';
import { compareLocalInpaintCandidates } from '../scripts/compare_local_inpaint_candidates.mjs';

function solidImage(width, height, rgba) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels.set(rgba, index * 4);
  }
  return pixels;
}

test('two local inpaint candidates are compared without changing the production baseline', () => {
  const comparison = compareLocalInpaintCandidates({ repetitions: 1 });

  assert.equal(comparison.production.algorithm, 'production-boundary-fill');
  assert.deepEqual(
    comparison.candidates.map((item) => item.algorithm),
    [
      'axis-boundary-interpolation',
      'periodic-texture-extrapolation',
    ],
  );
  assert.equal(comparison.production.supportedQualityPassed, true);
  assert.equal(comparison.production.knownLimitationsNotWorse, true);

  const axis = comparison.candidates[0];
  const periodic = comparison.candidates[1];
  assert.equal(axis.eligible, false);
  assert.equal(periodic.eligible, true);
  assert.equal(comparison.selectedCandidate, periodic.algorithm);
  assert.equal(periodic.supportedQualityPassed, true);
  assert.equal(periodic.outsidePixelsPreserved, true);
  assert.equal(periodic.performancePassed, true);
  assert.ok(periodic.limitations.every((item) => item.meanReductionPercent >= 25));
  assert.ok(periodic.limitations.every((item) => item.candidateP95RgbError <= item.baselineP95RgbError));
});

test('candidate algorithms preserve an empty mask and reject a full mask', () => {
  const input = solidImage(5, 4, [30, 80, 140, 255]);
  const emptyMask = new Uint8Array(20);
  const fullMask = new Uint8Array(20).fill(1);

  for (const processor of [
    inpaintAxisInterpolationRgba,
    inpaintPeriodicExtrapolationRgba,
  ]) {
    const output = processor(input, 5, 4, emptyMask);
    assert.deepEqual(output, input);
    assert.notEqual(output, input);
    assert.throws(
      () => processor(input, 5, 4, fullMask),
      /leave some source pixels/,
    );
  }
});

test('candidate algorithms keep every unmasked pixel exact for a non-rectangular mask', () => {
  const width = 12;
  const height = 10;
  const input = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      input.set([x * 12, y * 18, 160, 255], (y * width + x) * 4);
    }
  }
  const mask = new Uint8Array(width * height);
  for (let x = 3; x <= 8; x += 1) mask[5 * width + x] = 1;
  for (let y = 2; y <= 7; y += 1) mask[y * width + 6] = 1;

  for (const processor of [
    inpaintAxisInterpolationRgba,
    inpaintPeriodicExtrapolationRgba,
  ]) {
    const output = processor(input, width, height, mask);
    for (let index = 0; index < mask.length; index += 1) {
      if (mask[index]) continue;
      assert.deepEqual(
        Array.from(output.slice(index * 4, index * 4 + 4)),
        Array.from(input.slice(index * 4, index * 4 + 4)),
      );
    }
  }
});
