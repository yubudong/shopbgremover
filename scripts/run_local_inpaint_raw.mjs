import fs from 'node:fs';

import { dilateMask, inpaintRgba } from '../local-inpaint-core.mjs';

const [inputPath, maskPath, outputPath, rawWidth, rawHeight] = process.argv.slice(2);
const width = Number(rawWidth);
const height = Number(rawHeight);

if (!inputPath || !maskPath || !outputPath || !Number.isInteger(width) || !Number.isInteger(height)) {
  throw new Error('usage: node run_local_inpaint_raw.mjs input.rgba mask.raw output.rgba width height');
}

const input = new Uint8ClampedArray(fs.readFileSync(inputPath));
const mask = new Uint8Array(fs.readFileSync(maskPath));
if (input.length !== width * height * 4 || mask.length !== width * height) {
  throw new Error('raw input dimensions do not match the provided width and height');
}

const expanded = dilateMask(mask, width, height, 2);
const output = inpaintRgba(input, width, height, expanded, {
  expansion: 0,
  sampleRadius: 6,
  smoothingPasses: 8,
});
fs.writeFileSync(outputPath, output);
