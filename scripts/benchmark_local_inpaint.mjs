import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dilateMask, inpaintRgba } from '../local-inpaint-core.mjs';

export const PRODUCTION_PROFILE = Object.freeze({
  expansion: 2,
  sampleRadius: 6,
  smoothingPasses: 8,
});

function createImage(width, height, pixelAt) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rgba.set(pixelAt(x, y), (y * width + x) * 4);
    }
  }
  return rgba;
}

function rectangleMask(width, height, { x, y, width: maskWidth, height: maskHeight }) {
  const mask = new Uint8Array(width * height);
  for (let row = y; row < y + maskHeight; row += 1) {
    for (let column = x; column < x + maskWidth; column += 1) {
      mask[row * width + column] = 1;
    }
  }
  return mask;
}

function corruptMaskedPixels(clean, mask) {
  const corrupted = new Uint8ClampedArray(clean);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    corrupted.set([244, 20, 150, 255], index * 4);
  }
  return corrupted;
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function measureQuality(clean, output, evaluatedMask) {
  const maskedChannelErrors = [];
  let outsideMaxDelta = 0;
  let maskedPixels = 0;

  for (let index = 0; index < evaluatedMask.length; index += 1) {
    const offset = index * 4;
    if (evaluatedMask[index]) {
      maskedPixels += 1;
      for (let channel = 0; channel < 3; channel += 1) {
        maskedChannelErrors.push(Math.abs(output[offset + channel] - clean[offset + channel]));
      }
      continue;
    }
    for (let channel = 0; channel < 4; channel += 1) {
      outsideMaxDelta = Math.max(
        outsideMaxDelta,
        Math.abs(output[offset + channel] - clean[offset + channel]),
      );
    }
  }

  const totalError = maskedChannelErrors.reduce((sum, value) => sum + value, 0);
  return {
    maskedPixels,
    meanAbsoluteRgbError: Number((totalError / maskedChannelErrors.length).toFixed(2)),
    p95RgbError: percentile(maskedChannelErrors, 0.95),
    outsideMaxDelta,
  };
}

function buildCases() {
  return [
    {
      name: 'flat-small-mark',
      expectation: 'supported',
      width: 256,
      height: 256,
      maskRect: { x: 112, y: 118, width: 32, height: 20 },
      pixelAt: () => [210, 215, 220, 255],
      maxMeanAbsoluteRgbError: 1,
      maxP95RgbError: 1,
      maxMedianMs: 2500,
    },
    {
      name: 'gradient-small-mark',
      expectation: 'supported',
      width: 256,
      height: 256,
      maskRect: { x: 104, y: 116, width: 48, height: 24 },
      pixelAt: (x, y) => [
        40 + Math.round((x / 255) * 160),
        60 + Math.round((y / 255) * 140),
        180 - Math.round((x / 255) * 80) + Math.round((y / 255) * 20),
        255,
      ],
      maxMeanAbsoluteRgbError: 12,
      maxP95RgbError: 28,
      maxMedianMs: 2500,
    },
    {
      name: 'checkerboard-complex-texture',
      expectation: 'known-limitation',
      width: 256,
      height: 256,
      maskRect: { x: 96, y: 96, width: 64, height: 64 },
      pixelAt: (x, y) => (
        (Math.floor(x / 8) + Math.floor(y / 8)) % 2
          ? [225, 215, 195, 255]
          : [30, 45, 65, 255]
      ),
      maxRegressionMeanAbsoluteRgbError: 90,
      maxRegressionP95RgbError: 125,
      maxMedianMs: 2500,
    },
    {
      name: 'striped-large-selection',
      expectation: 'known-limitation',
      width: 768,
      height: 768,
      maskRect: { x: 192, y: 192, width: 384, height: 384 },
      pixelAt: (x, y) => {
        const base = Math.floor(x / 6) % 2 ? 205 : 45;
        const verticalShade = Math.round((y / 767) * 30);
        return [base, Math.min(255, base + verticalShade), 230 - verticalShade, 255];
      },
      maxRegressionMeanAbsoluteRgbError: 60,
      maxRegressionP95RgbError: 160,
      maxMedianMs: 2500,
    },
  ];
}

function median(values) {
  return percentile(values, 0.5);
}

export function runProductionInpaint(rgba, width, height, mask) {
  return inpaintRgba(rgba, width, height, mask, {
    expansion: 0,
    sampleRadius: PRODUCTION_PROFILE.sampleRadius,
    smoothingPasses: PRODUCTION_PROFILE.smoothingPasses,
  });
}

function runCase(definition, repetitions, processor) {
  const clean = createImage(definition.width, definition.height, definition.pixelAt);
  const sourceMask = rectangleMask(definition.width, definition.height, definition.maskRect);
  const evaluatedMask = dilateMask(
    sourceMask,
    definition.width,
    definition.height,
    PRODUCTION_PROFILE.expansion,
  );
  const timings = [];
  let output;

  for (let run = 0; run < repetitions; run += 1) {
    const corrupted = corruptMaskedPixels(clean, sourceMask);
    const started = performance.now();
    output = processor(
      corrupted,
      definition.width,
      definition.height,
      evaluatedMask,
    );
    timings.push(performance.now() - started);
  }

  if (!(output instanceof Uint8ClampedArray) || output.length !== clean.length) {
    throw new TypeError('benchmark processor must return a matching Uint8ClampedArray');
  }
  const metrics = measureQuality(clean, output, evaluatedMask);
  const medianMs = Number(median(timings).toFixed(1));
  const qualityPassed = definition.expectation === 'supported'
    ? (
      metrics.meanAbsoluteRgbError <= definition.maxMeanAbsoluteRgbError
      && metrics.p95RgbError <= definition.maxP95RgbError
    )
    : null;
  const regressionPassed = definition.expectation === 'known-limitation'
    ? (
      metrics.meanAbsoluteRgbError <= definition.maxRegressionMeanAbsoluteRgbError
      && metrics.p95RgbError <= definition.maxRegressionP95RgbError
    )
    : qualityPassed;

  return {
    name: definition.name,
    expectation: definition.expectation,
    dimensions: `${definition.width}x${definition.height}`,
    maskRatio: Number((metrics.maskedPixels / (definition.width * definition.height)).toFixed(4)),
    meanAbsoluteRgbError: metrics.meanAbsoluteRgbError,
    p95RgbError: metrics.p95RgbError,
    outsideMaxDelta: metrics.outsideMaxDelta,
    medianMs,
    qualityPassed,
    regressionPassed,
    performancePassed: medianMs <= definition.maxMedianMs,
  };
}

export function runLocalInpaintBenchmark({
  repetitions = 3,
  processor = runProductionInpaint,
  algorithm = 'production-boundary-fill',
} = {}) {
  if (typeof processor !== 'function') throw new TypeError('processor must be a function');
  const safeRepetitions = Math.max(1, Math.min(5, Math.round(repetitions)));
  const cases = buildCases().map(
    (definition) => runCase(definition, safeRepetitions, processor),
  );
  return {
    algorithm,
    profile: PRODUCTION_PROFILE,
    repetitions: safeRepetitions,
    supportedQualityPassed: cases
      .filter((item) => item.expectation === 'supported')
      .every((item) => item.qualityPassed),
    knownLimitationsNotWorse: cases
      .filter((item) => item.expectation === 'known-limitation')
      .every((item) => item.regressionPassed),
    outsidePixelsPreserved: cases.every((item) => item.outsideMaxDelta === 0),
    performancePassed: cases.every((item) => item.performancePassed),
    cases,
  };
}

function printReport(report) {
  console.log('Local inpaint quality/performance baseline');
  console.log(`Profile: expansion=${report.profile.expansion}, radius=${report.profile.sampleRadius}, smoothing=${report.profile.smoothingPasses}`);
  console.table(report.cases);
  console.log(`Supported quality: ${report.supportedQualityPassed ? 'PASS' : 'FAIL'}`);
  console.log(`Known limitations not worse: ${report.knownLimitationsNotWorse ? 'PASS' : 'FAIL'}`);
  console.log(`Outside pixels preserved: ${report.outsidePixelsPreserved ? 'PASS' : 'FAIL'}`);
  console.log(`Performance budget: ${report.performancePassed ? 'PASS' : 'FAIL'}`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === entryPath) {
  const report = runLocalInpaintBenchmark();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  if (
    !report.supportedQualityPassed
    || !report.knownLimitationsNotWorse
    || !report.outsidePixelsPreserved
    || !report.performancePassed
  ) {
    process.exitCode = 1;
  }
}
