const sourceCanvas = document.getElementById('sourceCanvas');
const maskCanvas = document.getElementById('maskCanvas');
const productionCanvas = document.getElementById('productionCanvas');
const candidateCanvas = document.getElementById('candidateCanvas');
const sourceContext = sourceCanvas.getContext('2d', { alpha: true });
const maskContext = maskCanvas.getContext('2d');
const productionContext = productionCanvas.getContext('2d', { alpha: true });
const candidateContext = candidateCanvas.getContext('2d', { alpha: true });
const sourceStatus = document.getElementById('sourceStatus');
const runStatus = document.getElementById('runStatus');
const productionStatus = document.getElementById('productionStatus');
const candidateStatus = document.getElementById('candidateStatus');
const toolSelect = document.getElementById('toolSelect');
const brushSize = document.getElementById('brushSize');
const runButton = document.getElementById('runComparison');

let sourceImageData = null;
let marks = [];
let activeMark = null;
let pointerDown = false;
let sequence = 0;
const pending = new Map();
const validationWorker = new Worker('./local-inpaint-validation-worker.mjs', { type: 'module' });

window.localInpaintValidation = {
  sourceKind: null,
  lastComparison: null,
};

validationWorker.addEventListener('message', (event) => {
  const job = pending.get(event.data.id);
  if (!job) return;
  pending.delete(event.data.id);
  if (event.data.error) job.reject(new Error(event.data.error));
  else job.resolve(event.data);
});

validationWorker.addEventListener('error', () => {
  for (const job of pending.values()) job.reject(new Error('Validation Worker failed.'));
  pending.clear();
});

function resizeCanvases(width, height) {
  for (const canvas of [sourceCanvas, maskCanvas, productionCanvas, candidateCanvas]) {
    canvas.width = width;
    canvas.height = height;
  }
}

function setSourceFromCanvas(kind, message) {
  sourceImageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  productionContext.clearRect(0, 0, productionCanvas.width, productionCanvas.height);
  candidateContext.clearRect(0, 0, candidateCanvas.width, candidateCanvas.height);
  productionStatus.textContent = 'Not run.';
  candidateStatus.textContent = 'Not run.';
  candidateStatus.dataset.algorithm = 'not-run';
  runStatus.textContent = 'No comparison has run.';
  marks = [];
  activeMark = null;
  redrawMask();
  window.localInpaintValidation.sourceKind = kind;
  window.localInpaintValidation.lastComparison = null;
  sourceStatus.innerHTML = `<strong>${message}</strong> Draw a mask or use “Mark center”.`;
}

function loadWovenSample() {
  resizeCanvases(768, 768);
  const gradient = sourceContext.createLinearGradient(0, 0, 0, sourceCanvas.height);
  gradient.addColorStop(0, '#d3b48c');
  gradient.addColorStop(1, '#aa7d55');
  sourceContext.fillStyle = gradient;
  sourceContext.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  for (let x = 0; x < sourceCanvas.width; x += 16) {
    sourceContext.fillStyle = x % 32 ? 'rgba(65,45,30,.22)' : 'rgba(255,247,225,.24)';
    sourceContext.fillRect(x, 0, 8, sourceCanvas.height);
  }
  for (let y = 0; y < sourceCanvas.height; y += 16) {
    sourceContext.fillStyle = y % 32 ? 'rgba(255,255,255,.18)' : 'rgba(70,45,25,.16)';
    sourceContext.fillRect(0, y, sourceCanvas.width, 7);
  }
  sourceContext.fillStyle = '#d9465f';
  sourceContext.fillRect(192, 192, 384, 384);
  sourceContext.fillStyle = '#fff';
  sourceContext.font = '700 48px system-ui';
  sourceContext.fillText('REMOVE', 276, 398);
  setSourceFromCanvas('woven', 'Synthetic periodic texture loaded.');
  marks = [{
    type: 'rectangle',
    x0: 190 / 768,
    y0: 190 / 768,
    x1: 578 / 768,
    y1: 578 / 768,
  }];
  redrawMask();
}

function loadAlphaSample() {
  resizeCanvases(640, 420);
  sourceContext.clearRect(0, 0, sourceCanvas.width, sourceCanvas.height);
  for (let x = 0; x < sourceCanvas.width; x += 20) {
    const alpha = 0.18 + (x / sourceCanvas.width) * 0.6;
    sourceContext.fillStyle = `rgba(32, 144, 210, ${alpha.toFixed(3)})`;
    sourceContext.fillRect(x, 55, 12, 310);
  }
  const edge = sourceContext.createRadialGradient(320, 210, 20, 320, 210, 180);
  edge.addColorStop(0, 'rgba(246,180,70,.94)');
  edge.addColorStop(.7, 'rgba(246,180,70,.52)');
  edge.addColorStop(1, 'rgba(246,180,70,0)');
  sourceContext.fillStyle = edge;
  sourceContext.fillRect(110, 0, 420, 420);
  sourceContext.fillStyle = 'rgba(220,38,38,.9)';
  sourceContext.beginPath();
  sourceContext.arc(320, 210, 42, 0, Math.PI * 2);
  sourceContext.fill();
  setSourceFromCanvas('alpha', 'Transparent edge sample loaded.');
  marks = [{ type: 'brush', radius: 52 / 640, points: [{ x: .5, y: .5 }] }];
  redrawMask();
}

async function drawBlob(blob, kind, message) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    resizeCanvases(width, height);
    sourceContext.clearRect(0, 0, width, height);
    sourceContext.drawImage(bitmap, 0, 0, width, height);
    setSourceFromCanvas(kind, message);
  } finally {
    bitmap.close();
  }
}

async function loadRepositoryPhoto() {
  sourceStatus.textContent = 'Loading repository photo…';
  const response = await fetch('/photo/bread.jpg', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Photo load failed (${response.status}).`);
  await drawBlob(await response.blob(), 'repository-photo', 'Repository bread photo loaded for visual-only inspection.');
  marks = [{
    type: 'rectangle',
    x0: .47,
    y0: .025,
    x1: .57,
    y1: .115,
  }];
  redrawMask();
}

function redrawMask() {
  maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  for (const mark of [...marks, ...(activeMark ? [activeMark] : [])]) drawMark(mark, maskContext);
}

function drawMark(mark, context, mode = 'overlay') {
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.fillStyle = mode === 'mask' ? '#fff' : 'rgba(239,68,68,.38)';
  context.strokeStyle = mode === 'mask' ? '#fff' : 'rgba(185,28,28,.9)';
  if (mark.type === 'brush') {
    context.lineWidth = Math.max(2, mark.radius * sourceCanvas.width * 2);
    context.beginPath();
    mark.points.forEach((point, index) => {
      const x = point.x * sourceCanvas.width;
      const y = point.y * sourceCanvas.height;
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    });
    if (mark.points.length === 1) {
      const point = mark.points[0];
      context.lineTo(point.x * sourceCanvas.width + .1, point.y * sourceCanvas.height + .1);
    }
    context.stroke();
    return;
  }
  const left = Math.min(mark.x0, mark.x1) * sourceCanvas.width;
  const top = Math.min(mark.y0, mark.y1) * sourceCanvas.height;
  const width = Math.abs(mark.x1 - mark.x0) * sourceCanvas.width;
  const height = Math.abs(mark.y1 - mark.y0) * sourceCanvas.height;
  context.fillRect(left, top, width, height);
  if (mode !== 'mask') {
    context.lineWidth = 2;
    context.strokeRect(left, top, width, height);
  }
}

function pointerPosition(event) {
  const rect = maskCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

maskCanvas.addEventListener('pointerdown', (event) => {
  if (!sourceImageData) return;
  pointerDown = true;
  maskCanvas.setPointerCapture(event.pointerId);
  const point = pointerPosition(event);
  activeMark = toolSelect.value === 'brush'
    ? { type: 'brush', radius: Number(brushSize.value) / sourceCanvas.width, points: [point] }
    : { type: 'rectangle', x0: point.x, y0: point.y, x1: point.x, y1: point.y };
  redrawMask();
});

maskCanvas.addEventListener('pointermove', (event) => {
  if (!pointerDown || !activeMark) return;
  const point = pointerPosition(event);
  if (activeMark.type === 'brush') activeMark.points.push(point);
  else {
    activeMark.x1 = point.x;
    activeMark.y1 = point.y;
  }
  redrawMask();
});

function finishPointer() {
  if (!pointerDown || !activeMark) return;
  pointerDown = false;
  marks.push(activeMark);
  activeMark = null;
  redrawMask();
}

maskCanvas.addEventListener('pointerup', finishPointer);
maskCanvas.addEventListener('pointercancel', finishPointer);

function buildMask() {
  const canvas = document.createElement('canvas');
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const context = canvas.getContext('2d');
  for (const mark of marks) drawMark(mark, context, 'mask');
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const mask = new Uint8Array(canvas.width * canvas.height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = pixels[index * 4 + 3] > 0 ? 1 : 0;
  }
  return mask;
}

function runWorker(mode, imageData, mask) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    const rgba = new Uint8ClampedArray(imageData.data);
    const maskCopy = new Uint8Array(mask);
    validationWorker.postMessage({
      id,
      mode,
      width: imageData.width,
      height: imageData.height,
      rgbaBuffer: rgba.buffer,
      maskBuffer: maskCopy.buffer,
    }, [rgba.buffer, maskCopy.buffer]);
  });
}

function drawOutput(context, result) {
  const data = new Uint8ClampedArray(result.rgbaBuffer);
  context.putImageData(new ImageData(data, sourceCanvas.width, sourceCanvas.height), 0, 0);
}

function periodText(decision) {
  const best = decision?.best;
  if (!best) return 'no period';
  const reason = decision.usePeriodic ? 'accepted' : `fallback: ${decision.reason}`;
  return `${best.axis}=${best.period}px, error ${best.error.toFixed(2)} / ${decision.maxPeriodError}, ${reason}`;
}

async function compare() {
  if (!sourceImageData) {
    runStatus.textContent = 'Load an image first.';
    return;
  }
  const mask = buildMask();
  const selected = mask.reduce((sum, value) => sum + value, 0);
  if (!selected) {
    runStatus.textContent = 'Draw or preset a mask first.';
    return;
  }
  runButton.disabled = true;
  runStatus.textContent = 'Running both algorithms inside a local browser Worker…';
  try {
    const [production, candidate] = await Promise.all([
      runWorker('production', sourceImageData, mask),
      runWorker('periodic-safe', sourceImageData, mask),
    ]);
    drawOutput(productionContext, production);
    drawOutput(candidateContext, candidate);
    productionStatus.textContent = `${production.algorithmUsed} · ${production.elapsedMs.toFixed(1)} ms · outside RGBA Δ ${production.outsideMaxDelta}`;
    candidateStatus.textContent = `${candidate.algorithmUsed} · ${candidate.elapsedMs.toFixed(1)} ms · ${periodText(candidate.decision)} · outside RGBA Δ ${candidate.outsideMaxDelta}`;
    candidateStatus.dataset.algorithm = candidate.algorithmUsed;
    candidateStatus.dataset.outsideDelta = String(candidate.outsideMaxDelta);
    candidateStatus.dataset.periodError = String(candidate.decision?.best?.error ?? '');
    runStatus.innerHTML = `<strong>Comparison complete.</strong> ${candidate.maskedPixels.toLocaleString()} expanded-mask pixels processed.`;
    window.localInpaintValidation.lastComparison = {
      sourceKind: window.localInpaintValidation.sourceKind,
      production: {
        algorithmUsed: production.algorithmUsed,
        elapsedMs: production.elapsedMs,
        outsideMaxDelta: production.outsideMaxDelta,
      },
      candidate: {
        algorithmUsed: candidate.algorithmUsed,
        elapsedMs: candidate.elapsedMs,
        outsideMaxDelta: candidate.outsideMaxDelta,
        decision: candidate.decision,
      },
    };
  } catch (error) {
    runStatus.textContent = error instanceof Error ? error.message : 'Comparison failed.';
  } finally {
    runButton.disabled = false;
  }
}

document.getElementById('loadWoven').addEventListener('click', loadWovenSample);
document.getElementById('loadAlpha').addEventListener('click', loadAlphaSample);
document.getElementById('loadPhoto').addEventListener('click', () => {
  loadRepositoryPhoto().catch((error) => {
    sourceStatus.textContent = error instanceof Error ? error.message : 'Photo load failed.';
  });
});
document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  drawBlob(file, 'uploaded-image', `Authorized upload loaded: ${file.name}`).catch((error) => {
    sourceStatus.textContent = error instanceof Error ? error.message : 'Image load failed.';
  });
});
document.getElementById('markCenter').addEventListener('click', () => {
  marks.push({ type: 'rectangle', x0: .39, y0: .36, x1: .61, y1: .64 });
  redrawMask();
});
document.getElementById('clearMask').addEventListener('click', () => {
  marks = [];
  activeMark = null;
  redrawMask();
});
runButton.addEventListener('click', compare);

loadWovenSample();
