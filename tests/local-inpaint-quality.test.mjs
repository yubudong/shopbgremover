import assert from 'node:assert/strict';
import test from 'node:test';

import { runLocalInpaintBenchmark } from '../scripts/benchmark_local_inpaint.mjs';

test('local inpaint benchmark protects supported cases and records known limitations', () => {
  const report = runLocalInpaintBenchmark({ repetitions: 1 });

  assert.deepEqual(
    report.cases.map((item) => item.name),
    [
      'flat-small-mark',
      'gradient-small-mark',
      'checkerboard-complex-texture',
      'striped-large-selection',
    ],
  );
  assert.equal(report.supportedQualityPassed, true);
  assert.equal(report.knownLimitationsNotWorse, true);
  assert.equal(report.outsidePixelsPreserved, true);
  assert.equal(report.performancePassed, true);

  const supported = report.cases.filter((item) => item.expectation === 'supported');
  const knownLimitations = report.cases.filter((item) => item.expectation === 'known-limitation');
  assert.equal(supported.length, 2);
  assert.ok(supported.every((item) => item.qualityPassed === true));
  assert.equal(knownLimitations.length, 2);
  assert.ok(knownLimitations.every((item) => item.qualityPassed === null));
  assert.ok(knownLimitations.every((item) => item.regressionPassed === true));
  assert.ok(knownLimitations.every((item) => item.maskRatio > 0.06));
});
