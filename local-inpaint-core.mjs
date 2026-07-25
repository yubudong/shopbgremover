/**
 * Small, dependency-free browser inpainting core.
 *
 * It fills a masked region from its boundary inwards using distance-weighted
 * neighbouring pixels. The algorithm is intentionally aimed at small marks,
 * dust and objects on simple backgrounds. It never performs network I/O.
 */

function assertDimensions(rgba, width, height, mask) {
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

export function dilateMask(mask, width, height, radius = 1) {
  if (!(mask instanceof Uint8Array) || mask.length !== width * height) {
    throw new TypeError('mask must be a width × height Uint8Array');
  }
  const safeRadius = Math.max(0, Math.min(8, Math.round(radius)));
  if (safeRadius === 0) return new Uint8Array(mask);

  const horizontal = new Uint8Array(mask.length);
  const expanded = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX >= 0 && sampleX < width && mask[y * width + sampleX]) {
          value = 1;
          break;
        }
      }
      horizontal[y * width + x] = value;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY >= 0 && sampleY < height && horizontal[sampleY * width + x]) {
          value = 1;
          break;
        }
      }
      expanded[y * width + x] = value;
    }
  }

  return expanded;
}

function hasKnownNeighbour(index, known, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  for (let dy = -1; dy <= 1; dy += 1) {
    const sampleY = y + dy;
    if (sampleY < 0 || sampleY >= height) continue;
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const sampleX = x + dx;
      if (sampleX >= 0 && sampleX < width && known[sampleY * width + sampleX]) return true;
    }
  }
  return false;
}

function fillPixel(index, output, known, width, height, sampleRadius) {
  const x = index % width;
  const y = Math.floor(index / width);
  const premultipliedTotals = [0, 0, 0];
  let alphaTotal = 0;
  let alphaWeight = 0;
  let totalWeight = 0;

  for (let dy = -sampleRadius; dy <= sampleRadius; dy += 1) {
    const sampleY = y + dy;
    if (sampleY < 0 || sampleY >= height) continue;
    for (let dx = -sampleRadius; dx <= sampleRadius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const sampleX = x + dx;
      if (sampleX < 0 || sampleX >= width) continue;
      const sampleIndex = sampleY * width + sampleX;
      if (!known[sampleIndex]) continue;
      const distanceSquared = dx * dx + dy * dy;
      const weight = 1 / Math.max(1, distanceSquared);
      const sourceOffset = sampleIndex * 4;
      const alpha = output[sourceOffset + 3] / 255;
      const visibleWeight = weight * alpha;
      premultipliedTotals[0] += output[sourceOffset] * visibleWeight;
      premultipliedTotals[1] += output[sourceOffset + 1] * visibleWeight;
      premultipliedTotals[2] += output[sourceOffset + 2] * visibleWeight;
      alphaTotal += output[sourceOffset + 3] * weight;
      alphaWeight += visibleWeight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return false;
  const targetOffset = index * 4;
  if (alphaWeight > 0) {
    output[targetOffset] = Math.round(premultipliedTotals[0] / alphaWeight);
    output[targetOffset + 1] = Math.round(premultipliedTotals[1] / alphaWeight);
    output[targetOffset + 2] = Math.round(premultipliedTotals[2] / alphaWeight);
  } else {
    output[targetOffset] = 0;
    output[targetOffset + 1] = 0;
    output[targetOffset + 2] = 0;
  }
  output[targetOffset + 3] = Math.round(alphaTotal / totalWeight);
  return true;
}

function smoothMaskedPixels(rgba, mask, width, height, passes) {
  let current = rgba;
  let next = new Uint8ClampedArray(rgba);
  const neighbours = [
    [-1, -1, 1], [0, -1, 2], [1, -1, 1],
    [-1, 0, 2],                [1, 0, 2],
    [-1, 1, 1],  [0, 1, 2],  [1, 1, 1],
  ];

  for (let pass = 0; pass < passes; pass += 1) {
    next.set(current);
    for (let index = 0; index < mask.length; index += 1) {
      if (!mask[index]) continue;
      const x = index % width;
      const y = Math.floor(index / width);
      const premultipliedTotals = [0, 0, 0];
      let alphaTotal = 0;
      let visibleWeight = 0;
      let totalWeight = 0;

      for (const [dx, dy, weight] of neighbours) {
        const sampleX = x + dx;
        const sampleY = y + dy;
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
        const sourceOffset = (sampleY * width + sampleX) * 4;
        const alpha = current[sourceOffset + 3] / 255;
        const alphaWeight = alpha * weight;
        premultipliedTotals[0] += current[sourceOffset] * alphaWeight;
        premultipliedTotals[1] += current[sourceOffset + 1] * alphaWeight;
        premultipliedTotals[2] += current[sourceOffset + 2] * alphaWeight;
        alphaTotal += current[sourceOffset + 3] * weight;
        visibleWeight += alphaWeight;
        totalWeight += weight;
      }

      if (!totalWeight) continue;
      const targetOffset = index * 4;
      if (visibleWeight > 0) {
        next[targetOffset] = Math.round(premultipliedTotals[0] / visibleWeight);
        next[targetOffset + 1] = Math.round(premultipliedTotals[1] / visibleWeight);
        next[targetOffset + 2] = Math.round(premultipliedTotals[2] / visibleWeight);
      } else {
        next[targetOffset] = 0;
        next[targetOffset + 1] = 0;
        next[targetOffset + 2] = 0;
      }
      next[targetOffset + 3] = Math.round(alphaTotal / totalWeight);
    }
    [current, next] = [next, current];
  }

  return current;
}

export function inpaintRgba(rgba, width, height, mask, options = {}) {
  assertDimensions(rgba, width, height, mask);
  const expansion = options.expansion ?? 1;
  const sampleRadius = Math.max(1, Math.min(8, Math.round(options.sampleRadius ?? 3)));
  const smoothingPasses = Math.max(0, Math.min(16, Math.round(options.smoothingPasses ?? 0)));
  const activeMask = dilateMask(mask, width, height, expansion);
  const output = new Uint8ClampedArray(rgba);
  const known = new Uint8Array(activeMask.length);
  const queued = new Uint8Array(activeMask.length);
  const queue = new Int32Array(activeMask.length);
  let head = 0;
  let tail = 0;
  let maskedPixels = 0;

  for (let index = 0; index < activeMask.length; index += 1) {
    if (activeMask[index]) maskedPixels += 1;
    else known[index] = 1;
  }
  if (maskedPixels === 0) return output;
  if (maskedPixels === activeMask.length) {
    throw new RangeError('the mask must leave some source pixels available');
  }

  for (let index = 0; index < activeMask.length; index += 1) {
    if (activeMask[index] && hasKnownNeighbour(index, known, width, height)) {
      queued[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    if (!fillPixel(index, output, known, width, height, sampleRadius)) continue;
    known[index] = 1;

    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy += 1) {
      const nextY = y + dy;
      if (nextY < 0 || nextY >= height) continue;
      for (let dx = -1; dx <= 1; dx += 1) {
        const nextX = x + dx;
        if (nextX < 0 || nextX >= width || (dx === 0 && dy === 0)) continue;
        const next = nextY * width + nextX;
        if (activeMask[next] && !known[next] && !queued[next]) {
          queued[next] = 1;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
  }

  return smoothingPasses
    ? smoothMaskedPixels(output, activeMask, width, height, smoothingPasses)
    : output;
}
