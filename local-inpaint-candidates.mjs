/**
 * Offline browser-only inpaint candidates.
 *
 * These functions are deliberately not imported by the production cleanup
 * Worker. They exist so candidate behavior can be measured before any runtime
 * selection is made.
 */

function assertInputs(rgba, width, height, mask) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new TypeError('width and height must be positive integers');
  }
  const pixels = width * height;
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== pixels * 4) {
    throw new TypeError('rgba must be a width × height Uint8ClampedArray');
  }
  if (!(mask instanceof Uint8Array) || mask.length !== pixels) {
    throw new TypeError('mask must be a width × height Uint8Array');
  }
}

function inspectMask(mask) {
  let maskedPixels = 0;
  let firstKnownIndex = -1;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) maskedPixels += 1;
    else if (firstKnownIndex === -1) firstKnownIndex = index;
  }
  if (maskedPixels === mask.length) {
    throw new RangeError('the mask must leave some source pixels available');
  }
  return { maskedPixels, firstKnownIndex };
}

function copyPixel(source, sourceIndex, output, targetIndex) {
  const sourceOffset = sourceIndex * 4;
  const targetOffset = targetIndex * 4;
  output[targetOffset] = source[sourceOffset];
  output[targetOffset + 1] = source[sourceOffset + 1];
  output[targetOffset + 2] = source[sourceOffset + 2];
  output[targetOffset + 3] = source[sourceOffset + 3];
}

function interpolatePixel(source, firstIndex, secondIndex, firstDistance, secondDistance) {
  if (firstIndex < 0 && secondIndex < 0) return null;
  if (firstIndex < 0) {
    const offset = secondIndex * 4;
    return {
      rgba: source.slice(offset, offset + 4),
      boundaryDifference: Number.POSITIVE_INFINITY,
    };
  }
  if (secondIndex < 0) {
    const offset = firstIndex * 4;
    return {
      rgba: source.slice(offset, offset + 4),
      boundaryDifference: Number.POSITIVE_INFINITY,
    };
  }

  const firstOffset = firstIndex * 4;
  const secondOffset = secondIndex * 4;
  const totalDistance = firstDistance + secondDistance;
  const firstWeight = secondDistance / totalDistance;
  const secondWeight = firstDistance / totalDistance;
  const rgba = new Uint8ClampedArray(4);
  let boundaryDifference = 0;

  for (let channel = 0; channel < 4; channel += 1) {
    rgba[channel] = Math.round(
      source[firstOffset + channel] * firstWeight
      + source[secondOffset + channel] * secondWeight,
    );
    boundaryDifference += Math.abs(
      source[firstOffset + channel] - source[secondOffset + channel],
    );
  }
  return { rgba, boundaryDifference };
}

function buildCardinalSources(mask, width, height) {
  const left = new Int32Array(mask.length).fill(-1);
  const right = new Int32Array(mask.length).fill(-1);
  const top = new Int32Array(mask.length).fill(-1);
  const bottom = new Int32Array(mask.length).fill(-1);

  for (let y = 0; y < height; y += 1) {
    let knownIndex = -1;
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (mask[index]) left[index] = knownIndex;
      else knownIndex = index;
    }
    knownIndex = -1;
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      if (mask[index]) right[index] = knownIndex;
      else knownIndex = index;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let knownIndex = -1;
    for (let y = 0; y < height; y += 1) {
      const index = y * width + x;
      if (mask[index]) top[index] = knownIndex;
      else knownIndex = index;
    }
    knownIndex = -1;
    for (let y = height - 1; y >= 0; y -= 1) {
      const index = y * width + x;
      if (mask[index]) bottom[index] = knownIndex;
      else knownIndex = index;
    }
  }

  return { left, right, top, bottom };
}

export function inpaintAxisInterpolationRgba(rgba, width, height, mask) {
  assertInputs(rgba, width, height, mask);
  const { maskedPixels, firstKnownIndex } = inspectMask(mask);
  const output = new Uint8ClampedArray(rgba);
  if (maskedPixels === 0) return output;

  const sources = buildCardinalSources(mask, width, height);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    const leftIndex = sources.left[index];
    const rightIndex = sources.right[index];
    const topIndex = sources.top[index];
    const bottomIndex = sources.bottom[index];
    const horizontal = interpolatePixel(
      rgba,
      leftIndex,
      rightIndex,
      leftIndex < 0 ? 0 : x - (leftIndex % width),
      rightIndex < 0 ? 0 : (rightIndex % width) - x,
    );
    const vertical = interpolatePixel(
      rgba,
      topIndex,
      bottomIndex,
      topIndex < 0 ? 0 : y - Math.floor(topIndex / width),
      bottomIndex < 0 ? 0 : Math.floor(bottomIndex / width) - y,
    );
    const selected = (
      horizontal
      && (!vertical || horizontal.boundaryDifference < vertical.boundaryDifference)
    ) ? horizontal : vertical;

    if (!selected) {
      copyPixel(rgba, firstKnownIndex, output, index);
      continue;
    }
    output.set(selected.rgba, index * 4);
  }
  return output;
}

function scorePeriod(rgba, mask, width, height, axis, period) {
  const totalPixels = width * height;
  const stride = Math.max(1, Math.floor(totalPixels / 12000));
  let totalDifference = 0;
  let comparedChannels = 0;

  for (let index = 0; index < totalPixels; index += stride) {
    const x = index % width;
    const y = Math.floor(index / width);
    const pairedX = axis === 'x' ? x + period : x;
    const pairedY = axis === 'y' ? y + period : y;
    if (pairedX >= width || pairedY >= height) continue;
    const pairedIndex = pairedY * width + pairedX;
    if (mask[index] || mask[pairedIndex]) continue;
    const offset = index * 4;
    const pairedOffset = pairedIndex * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      totalDifference += Math.abs(rgba[offset + channel] - rgba[pairedOffset + channel]);
      comparedChannels += 1;
    }
  }

  return comparedChannels < 96
    ? Number.POSITIVE_INFINITY
    : totalDifference / comparedChannels;
}

function detectAxisPeriod(rgba, mask, width, height, axis, maxPeriod) {
  const axisLength = axis === 'x' ? width : height;
  const limit = Math.min(maxPeriod, axisLength - 1);
  let bestPeriod = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for (let period = 1; period <= limit; period += 1) {
    const error = scorePeriod(rgba, mask, width, height, axis, period);
    if (error < bestError - 0.0001) {
      bestPeriod = period;
      bestError = error;
    }
  }
  return { axis, period: bestPeriod, error: bestError };
}

function findPeriodicSource(index, mask, width, height, { axis, period }) {
  const x = index % width;
  const y = Math.floor(index / width);
  const limit = axis === 'x' ? width : height;
  for (let distance = period; distance < limit; distance += period) {
    const beforeX = axis === 'x' ? x - distance : x;
    const beforeY = axis === 'y' ? y - distance : y;
    if (beforeX >= 0 && beforeY >= 0) {
      const beforeIndex = beforeY * width + beforeX;
      if (!mask[beforeIndex]) return beforeIndex;
    }

    const afterX = axis === 'x' ? x + distance : x;
    const afterY = axis === 'y' ? y + distance : y;
    if (afterX < width && afterY < height) {
      const afterIndex = afterY * width + afterX;
      if (!mask[afterIndex]) return afterIndex;
    }
  }
  return -1;
}

export function detectTexturePeriods(rgba, width, height, mask, { maxPeriod = 64 } = {}) {
  assertInputs(rgba, width, height, mask);
  return [
    detectAxisPeriod(rgba, mask, width, height, 'x', maxPeriod),
    detectAxisPeriod(rgba, mask, width, height, 'y', maxPeriod),
  ].sort((left, right) => (
    left.error - right.error
    || left.period - right.period
    || left.axis.localeCompare(right.axis)
  ));
}

export function inpaintPeriodicExtrapolationRgba(rgba, width, height, mask, options = {}) {
  assertInputs(rgba, width, height, mask);
  const { maskedPixels, firstKnownIndex } = inspectMask(mask);
  const output = new Uint8ClampedArray(rgba);
  if (maskedPixels === 0) return output;

  const periods = detectTexturePeriods(rgba, width, height, mask, options);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    let sourceIndex = -1;
    for (const period of periods) {
      sourceIndex = findPeriodicSource(index, mask, width, height, period);
      if (sourceIndex >= 0) break;
    }
    copyPixel(rgba, sourceIndex >= 0 ? sourceIndex : firstKnownIndex, output, index);
  }
  return output;
}
