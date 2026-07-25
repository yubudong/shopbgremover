import { dilateMask, inpaintRgba } from './local-inpaint-core.mjs';

self.addEventListener('message', (event) => {
  const { id, rgbaBuffer, maskBuffer, width, height } = event.data || {};
  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const mask = new Uint8Array(maskBuffer);
    const expandedMask = dilateMask(mask, width, height, 2);
    const result = inpaintRgba(rgba, width, height, expandedMask, {
      expansion: 0,
      sampleRadius: 6,
      smoothingPasses: 8,
    });
    self.postMessage({
      id,
      rgbaBuffer: result.buffer,
    }, [result.buffer]);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Local cleanup failed.',
    });
  }
});
