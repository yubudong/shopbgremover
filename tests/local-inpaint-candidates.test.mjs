import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePeriodicTextureStrategy,
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

test('periodic texture strategy accepts repeatable texture and rejects aperiodic noise', () => {
  const width = 96;
  const height = 80;
  const mask = new Uint8Array(width * height);
  for (let y = 24; y < 56; y += 1) {
    for (let x = 30; x < 66; x += 1) mask[y * width + x] = 1;
  }
  const periodic = new Uint8ClampedArray(width * height * 4);
  const aperiodic = new Uint8ClampedArray(width * height * 4);
  let seed = 0x12345678;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const stripe = Math.floor(x / 6) % 2 ? 210 : 35;
      periodic.set([stripe, 180, 230 - stripe / 2, 255], offset);
      seed = (seed * 1664525 + 1013904223) >>> 0;
      aperiodic.set([
        seed & 255,
        (seed >>> 8) & 255,
        (seed >>> 16) & 255,
        255,
      ], offset);
    }
  }

  const periodicDecision = evaluatePeriodicTextureStrategy(periodic, width, height, mask);
  const aperiodicDecision = evaluatePeriodicTextureStrategy(aperiodic, width, height, mask);
  assert.equal(periodicDecision.usePeriodic, true);
  assert.ok(periodicDecision.best.error <= periodicDecision.maxPeriodError);
  assert.equal(aperiodicDecision.usePeriodic, false);
  assert.ok(aperiodicDecision.best.error > aperiodicDecision.maxPeriodError);
});

test('periodic texture strategy rejects a one-pixel smooth-gradient false positive', () => {
  const width = 96;
  const height = 80;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      pixels.set([80 + x, 70 + y, 160, Math.min(255, 40 + x * 2)], offset);
      if (x >= 30 && x < 66 && y >= 24 && y < 56) mask[y * width + x] = 1;
    }
  }

  const decision = evaluatePeriodicTextureStrategy(pixels, width, height, mask);
  assert.equal(decision.best.period, 1);
  assert.ok(decision.best.error <= decision.maxPeriodError);
  assert.equal(decision.usePeriodic, false);
  assert.equal(decision.reason, 'period-too-short');
});
