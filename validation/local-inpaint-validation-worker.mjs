import { dilateMask, inpaintRgba } from '../local-inpaint-core.mjs';
import {
  evaluatePeriodicTextureStrategy,
  inpaintPeriodicExtrapolationRgba,
} from '../local-inpaint-candidates.mjs';

const PRODUCTION_OPTIONS = Object.freeze({
  expansion: 0,
  sampleRadius: 6,
  smoothingPasses: 8,
});

function runProduction(rgba, width, height, mask) {
  return inpaintRgba(rgba, width, height, mask, PRODUCTION_OPTIONS);
}

function measureOutsideDelta(source, output, mask) {
  let maximum = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) continue;
    const offset = index * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      maximum = Math.max(
        maximum,
        Math.abs(source[offset + channel] - output[offset + channel]),
      );
    }
  }
  return maximum;
}

self.addEventListener('message', (event) => {
  const {
    id,
    mode,
    rgbaBuffer,
    maskBuffer,
    width,
    height,
  } = event.data || {};

  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const sourceMask = new Uint8Array(maskBuffer);
    const expandedMask = dilateMask(sourceMask, width, height, 2);
    const started = performance.now();
    let output;
    let algorithmUsed = 'production-boundary-fill';
    let decision = null;

    if (mode === 'periodic-safe') {
      decision = evaluatePeriodicTextureStrategy(rgba, width, height, expandedMask, {
        maxPeriod: 64,
        minPeriod: 4,
        maxPeriodError: 6,
      });
      if (decision.usePeriodic) {
        output = inpaintPeriodicExtrapolationRgba(rgba, width, height, expandedMask, {
          maxPeriod: 64,
        });
        algorithmUsed = 'periodic-texture-extrapolation';
      } else {
        output = runProduction(rgba, width, height, expandedMask);
        algorithmUsed = 'production-fallback';
      }
    } else {
      output = runProduction(rgba, width, height, expandedMask);
    }

    const elapsedMs = Number((performance.now() - started).toFixed(1));
    const outsideMaxDelta = measureOutsideDelta(rgba, output, expandedMask);
    const maskedPixels = expandedMask.reduce((sum, value) => sum + value, 0);
    self.postMessage({
      id,
      algorithmUsed,
      elapsedMs,
      outsideMaxDelta,
      maskedPixels,
      decision,
      rgbaBuffer: output.buffer,
    }, [output.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Validation worker failed.',
    });
  }
});
