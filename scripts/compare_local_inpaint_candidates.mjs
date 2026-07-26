import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inpaintAxisInterpolationRgba,
  inpaintPeriodicExtrapolationRgba,
} from '../local-inpaint-candidates.mjs';
import {
  runLocalInpaintBenchmark,
  runProductionInpaint,
} from './benchmark_local_inpaint.mjs';

const LIMITATION_NAMES = [
  'checkerboard-complex-texture',
  'striped-large-selection',
];

const ALGORITHMS = [
  {
    name: 'production-boundary-fill',
    processor: runProductionInpaint,
  },
  {
    name: 'axis-boundary-interpolation',
    processor: inpaintAxisInterpolationRgba,
  },
  {
    name: 'periodic-texture-extrapolation',
    processor: inpaintPeriodicExtrapolationRgba,
  },
];

function percentageReduction(baseline, candidate) {
  if (baseline === 0) return candidate === 0 ? 0 : Number.NEGATIVE_INFINITY;
  return Number((((baseline - candidate) / baseline) * 100).toFixed(1));
}

export function compareLocalInpaintCandidates({ repetitions = 3 } = {}) {
  const reports = ALGORITHMS.map(({ name, processor }) => runLocalInpaintBenchmark({
    repetitions,
    algorithm: name,
    processor,
  }));
  const production = reports[0];
  const candidates = reports.slice(1).map((report) => {
    const limitations = LIMITATION_NAMES.map((name) => {
      const baselineCase = production.cases.find((item) => item.name === name);
      const candidateCase = report.cases.find((item) => item.name === name);
      const meanReductionPercent = percentageReduction(
        baselineCase.meanAbsoluteRgbError,
        candidateCase.meanAbsoluteRgbError,
      );
      return {
        name,
        baselineMeanAbsoluteRgbError: baselineCase.meanAbsoluteRgbError,
        candidateMeanAbsoluteRgbError: candidateCase.meanAbsoluteRgbError,
        baselineP95RgbError: baselineCase.p95RgbError,
        candidateP95RgbError: candidateCase.p95RgbError,
        meanReductionPercent,
        passed: (
          meanReductionPercent >= 25
          && candidateCase.p95RgbError <= baselineCase.p95RgbError
        ),
      };
    });
    return {
      ...report,
      limitations,
      eligible: (
        report.supportedQualityPassed
        && report.outsidePixelsPreserved
        && report.performancePassed
        && limitations.every((item) => item.passed)
      ),
    };
  });
  const eligible = candidates
    .filter((report) => report.eligible)
    .sort((left, right) => {
      const leftAverage = left.limitations.reduce(
        (sum, item) => sum + item.meanReductionPercent,
        0,
      );
      const rightAverage = right.limitations.reduce(
        (sum, item) => sum + item.meanReductionPercent,
        0,
      );
      return rightAverage - leftAverage;
    });

  return {
    production,
    candidates,
    selectedCandidate: eligible[0]?.algorithm ?? null,
  };
}

function printComparison(comparison) {
  const rows = [comparison.production, ...comparison.candidates].flatMap((report) => (
    report.cases.map((item) => ({
      algorithm: report.algorithm,
      case: item.name,
      meanError: item.meanAbsoluteRgbError,
      p95Error: item.p95RgbError,
      outsideDelta: item.outsideMaxDelta,
      medianMs: item.medianMs,
      eligible: report.eligible ?? 'baseline',
    }))
  ));
  console.log('Local inpaint candidate comparison');
  console.table(rows);
  for (const candidate of comparison.candidates) {
    console.log(`${candidate.algorithm}: ${candidate.eligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
    console.table(candidate.limitations);
  }
  console.log(`Selected for browser validation: ${comparison.selectedCandidate ?? 'none'}`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === entryPath) {
  const comparison = compareLocalInpaintCandidates();
  if (process.argv.includes('--json')) console.log(JSON.stringify(comparison, null, 2));
  else printComparison(comparison);
  if (
    !comparison.production.supportedQualityPassed
    || !comparison.production.knownLimitationsNotWorse
    || !comparison.production.outsidePixelsPreserved
    || !comparison.production.performancePassed
    || !comparison.selectedCandidate
  ) {
    process.exitCode = 1;
  }
}
