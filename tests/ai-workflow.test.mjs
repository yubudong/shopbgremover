import assert from 'node:assert/strict';
import test from 'node:test';

await import('../ai-workflow.js');
await import('../background-composer.js');

const {
  applyTransparencyResult,
  buildSessionRecord,
  enforceOutputMaxBytes,
  fetchAiResult,
  format,
  hasMeaningfulTransparency,
  isPng,
  planJobs,
  resetJobForSource,
  sessionByteSize,
  storedJobState,
  usableSessionRecord,
  SESSION_MAX_BYTES,
  SESSION_SCHEMA_VERSION,
  SESSION_TTL_MS,
  TRANSPARENCY_DETECTOR_VERSION,
} = globalThis.ShopBGAiWorkflow;
const {
  backgroundTemplateByteSize,
  getBackgroundBlurPixels,
  getBackgroundPlacement,
  getForegroundPlacement,
  getImagePlacement,
  getOutputEncoding,
  normalizeBackgroundTemplate,
  resolveCompositionConfig,
  validateBackgroundFile,
  MAX_BACKGROUND_BYTES,
  MAX_BACKGROUND_TEMPLATES,
  MAX_BACKGROUND_TEMPLATE_BYTES,
} = globalThis.ShopBGBackgroundComposer;

test('uploaded background files accept only JPG, PNG, or WebP up to 20 MB', () => {
  const png = new Blob(['png'], { type: 'image/png' });
  Object.defineProperty(png, 'name', { value: 'background.png' });
  assert.equal(validateBackgroundFile(png), null);

  const webpWithoutMime = new Blob(['webp']);
  Object.defineProperty(webpWithoutMime, 'name', { value: 'background.webp' });
  assert.equal(validateBackgroundFile(webpWithoutMime), null);

  const svg = new Blob(['svg'], { type: 'image/svg+xml' });
  Object.defineProperty(svg, 'name', { value: 'background.svg' });
  assert.equal(validateBackgroundFile(svg), 'type');

  const disguisedSvg = new Blob(['svg'], { type: 'image/svg+xml' });
  Object.defineProperty(disguisedSvg, 'name', { value: 'background.png' });
  assert.equal(validateBackgroundFile(disguisedSvg), 'type');

  const oversized = new Blob([new Uint8Array(MAX_BACKGROUND_BYTES + 1)], {
    type: 'image/jpeg',
  });
  Object.defineProperty(oversized, 'name', { value: 'large.jpg' });
  assert.equal(validateBackgroundFile(oversized), 'size');
});

test('browser background templates preserve only reusable background settings', () => {
  const imageBlob = new Blob(['template'], { type: 'image/png' });
  const template = normalizeBackgroundTemplate({
    id: 'template-1',
    name: ' Summer shelf ',
    imageBlob,
    backgroundImageName: 'summer.png',
    backgroundFit: 'contain',
    backgroundScale: 240,
    backgroundOffsetX: -80,
    backgroundOffsetY: 12,
    backgroundBlur: 9,
    productScale: 55,
    productShadow: true,
  }, 1234);

  assert.deepEqual(template, {
    id: 'template-1',
    name: 'Summer shelf',
    imageBlob,
    backgroundImageName: 'summer.png',
    backgroundFit: 'contain',
    backgroundScale: 200,
    backgroundOffsetX: -50,
    backgroundOffsetY: 12,
    backgroundBlur: 9,
    createdAt: 1234,
    updatedAt: 1234,
  });
  assert.equal(backgroundTemplateByteSize(template), imageBlob.size);
  assert.equal(MAX_BACKGROUND_TEMPLATES, 8);
  assert.equal(MAX_BACKGROUND_TEMPLATE_BYTES, 80 * 1024 * 1024);
  assert.throws(
    () => normalizeBackgroundTemplate({ imageBlob: new Blob(['svg'], { type: 'image/svg+xml' }) }),
    /invalid_background_template/,
  );
});

test('platform output size enforcement accepts 2 MB exactly and rejects one byte over', () => {
  const exact = { size: 2 * 1024 * 1024 };
  assert.equal(
    enforceOutputMaxBytes(exact, {
      maxBytes: 2 * 1024 * 1024,
      userMessage: 'Use JPEG.',
    }),
    exact,
  );

  assert.throws(
    () => enforceOutputMaxBytes({ size: 2 * 1024 * 1024 + 1 }, {
      maxBytes: 2 * 1024 * 1024,
      reason: 'shopee_output_too_large',
      userMessage: 'Use JPEG.',
    }),
    (error) => (
      error.message === 'shopee_output_too_large'
      && error.reason === 'shopee_output_too_large'
      && error.userMessage === 'Use JPEG.'
    ),
  );
});

test('background fit defaults to centered cover and supports contain and stretch', () => {
  assert.deepEqual(getImagePlacement(1600, 900, 1000, 1000), {
    x: -388.8888888888889,
    y: 0,
    width: 1777.7777777777778,
    height: 1000,
  });
  assert.deepEqual(getImagePlacement(1600, 900, 1000, 1000, 'contain'), {
    x: 0,
    y: 218.75,
    width: 1000,
    height: 562.5,
  });
  assert.deepEqual(getImagePlacement(1600, 900, 1000, 1000, 'stretch'), {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  });
});

test('background transform scales, moves, and blurs independently from the product', () => {
  assert.deepEqual(getBackgroundPlacement(1600, 900, 1000, 1000, {
    fit: 'contain',
    backgroundScale: 120,
    backgroundOffsetX: 10,
    backgroundOffsetY: -5,
  }), {
    x: 0,
    y: 112.5,
    width: 1200,
    height: 675,
  });
  assert.deepEqual(getBackgroundPlacement(1000, 1000, 500, 500, {
    backgroundScale: 20,
    backgroundOffsetX: 80,
    backgroundOffsetY: -80,
  }), {
    x: 375,
    y: -125,
    width: 250,
    height: 250,
  });
  assert.equal(getBackgroundBlurPixels(20, 1000, 800), 16);
  assert.equal(getBackgroundBlurPixels(50, 1000, 800), 24);
  assert.equal(getBackgroundBlurPixels(-1, 1000, 800), 0);
});

test('single-image composition settings override batch defaults by stable index', () => {
  const batch = { bgMode: 'white', productScale: 100 };
  const one = { bgMode: 'custom', productScale: 72 };
  const overrides = new Map([[1, one]]);

  assert.equal(resolveCompositionConfig(batch, overrides, 0), batch);
  assert.equal(resolveCompositionConfig(batch, overrides, 1), one);
  assert.equal(resolveCompositionConfig(batch, { 2: one }, 2), one);
  assert.equal(resolveCompositionConfig(batch, overrides, null), batch);
});

test('output encodings preserve MIME, extension, alpha support, and bounded quality', () => {
  assert.deepEqual(getOutputEncoding('png', 20), {
    extension: 'png',
    mime: 'image/png',
    supportsAlpha: true,
    format: 'png',
    quality: 0.5,
  });
  assert.deepEqual(getOutputEncoding('jpeg', 86), {
    extension: 'jpg',
    mime: 'image/jpeg',
    supportsAlpha: false,
    format: 'jpeg',
    quality: 0.86,
  });
  assert.deepEqual(getOutputEncoding('webp', 120), {
    extension: 'webp',
    mime: 'image/webp',
    supportsAlpha: true,
    format: 'webp',
    quality: 1,
  });
  assert.equal(getOutputEncoding('unknown').format, 'png');
});

test('product placement preserves legacy defaults and supports scale, offsets, and bottom alignment', () => {
  assert.deepEqual(getForegroundPlacement(400, 200, 400, 200, {
    baseFitRatio: 1,
  }), {
    x: 0,
    y: 0,
    width: 400,
    height: 200,
  });
  assert.deepEqual(getForegroundPlacement(1600, 900, 1000, 1000), {
    x: 50,
    y: 246.875,
    width: 900,
    height: 506.25,
  });
  assert.deepEqual(getForegroundPlacement(1600, 900, 1000, 1000, {
    productScale: 80,
    productOffsetX: 10,
    productOffsetY: -5,
    productAlign: 'custom',
  }), {
    x: 240,
    y: 247.5,
    width: 720,
    height: 405,
  });
  assert.deepEqual(getForegroundPlacement(1600, 900, 1000, 1000, {
    productAlign: 'bottom',
  }), {
    x: 50,
    y: 443.75,
    width: 900,
    height: 506.25,
  });
});

test('AI plan charges only uncached opaque jobs that explicitly request AI', () => {
  const jobs = [
    { aiRequested: true, transparent: false, foregroundBlob: null, needsReprocess: false },
    { aiRequested: true, transparent: true, foregroundBlob: null, needsReprocess: false },
    { aiRequested: false, transparent: false, foregroundBlob: null, needsReprocess: false },
    { aiRequested: true, transparent: false, foregroundBlob: {}, needsReprocess: false },
    { aiRequested: true, transparent: false, foregroundBlob: null, needsReprocess: true },
  ];

  assert.deepEqual(planJobs(jobs), {
    total: 5,
    aiCount: 2,
    cachedCount: 1,
    transparentCount: 1,
    manualSkipCount: 1,
    noChargeCount: 3,
    reprocessCount: 1,
  });
});

test('source edits invalidate only that job and create a new stable task identity', () => {
  const job = {
    sourceVersion: 3,
    taskId: 'task-old',
    foregroundBlob: {},
    outputBlob: {},
    outputName: 'old.png',
    hadAiResult: true,
    needsReprocess: false,
    status: 'succeeded',
    error: null,
  };

  resetJobForSource(job, 'task-new');
  assert.equal(job.sourceVersion, 4);
  assert.equal(job.taskId, 'task-new');
  assert.equal(job.foregroundBlob, null);
  assert.equal(job.outputBlob, null);
  assert.equal(job.needsReprocess, true);
  assert.equal(job.status, 'checking');

  // A network or API failure does not call resetJobForSource, so retries keep
  // the same task id and let the Worker reuse or retry the existing task.
  job.status = 'failed';
  assert.equal(job.taskId, 'task-new');
});

test('source edits reset transparency detection and restore the default AI choice', () => {
  const job = {
    sourceVersion: 1,
    taskId: 'transparent-old',
    aiRequested: false,
    transparent: true,
    transparencyDetectorVersion: TRANSPARENCY_DETECTOR_VERSION,
    foregroundBlob: null,
    outputBlob: null,
    status: 'ready',
  };

  resetJobForSource(job, 'transparent-edited');
  assert.equal(job.transparent, null);
  assert.equal(job.transparencyDetectorVersion, 0);
  assert.equal(job.aiRequested, true);
});

test('a retry polls the same processing task and reports a reused Worker result', async () => {
  const requests = [];
  const waits = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    if (requests.length === 1) {
      return Response.json(
        { reason: 'task_processing', task_id: 'stable-retry-task' },
        { status: 409 },
      );
    }
    return new Response(new Blob(['cached-result']), {
      headers: {
        'Content-Type': 'image/png',
        'X-AI-Reused': 'true',
      },
    });
  };

  const result = await fetchAiResult({
    api: 'https://api.example.test',
    deviceId: 'device-123',
    taskId: 'stable-retry-task',
    dataUrl: 'data:image/jpeg;base64,abc',
    failedText: 'failed',
    fetchImpl,
    wait: async (delay) => waits.push(delay),
    maxProcessingPolls: 2,
    pollDelayMs: 25,
  });

  assert.equal(requests.length, 2);
  assert.deepEqual(waits, [25]);
  assert.equal(requests[0].url, 'https://api.example.test/api/remove-bg');
  assert.equal(requests[0].init.body, requests[1].init.body);
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    image_url: 'data:image/jpeg;base64,abc',
    task_id: 'stable-retry-task',
  });
  assert.equal(result.reused, true);
  assert.equal(await result.blob.text(), 'cached-result');
});

test('a task submitted by this request is counted once after queue polling completes', async () => {
  let requests = 0;
  const result = await fetchAiResult({
    api: 'https://api.example.test',
    deviceId: 'device-123',
    taskId: 'new-queued-task',
    dataUrl: 'data:image/jpeg;base64,queued',
    failedText: 'failed',
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) {
        return Response.json(
          { reason: 'task_processing', task_id: 'new-queued-task', started: true },
          { status: 409 },
        );
      }
      return new Response(new Blob(['new-result']), {
        headers: { 'X-AI-Reused': 'true' },
      });
    },
    wait: async () => {},
    maxProcessingPolls: 2,
    pollDelayMs: 0,
  });

  assert.equal(requests, 2);
  assert.equal(result.reused, false);
  assert.equal(await result.blob.text(), 'new-result');
});

test('an offline request fails fast and a manual retry keeps the same task identity', async () => {
  const bodies = [];
  let attempt = 0;
  const fetchImpl = async (_url, init) => {
    attempt += 1;
    bodies.push(init.body);
    if (attempt === 1) throw new TypeError('network disconnected');
    return new Response(new Blob(['recovered']), {
      headers: { 'X-AI-Reused': 'true' },
    });
  };
  const request = () => fetchAiResult({
    api: 'https://api.example.test',
    deviceId: 'device-123',
    taskId: 'offline-stable-task',
    dataUrl: 'data:image/jpeg;base64,def',
    failedText: 'failed',
    fetchImpl,
    wait: async () => {
      throw new Error('offline failures must not spin automatically');
    },
  });

  await assert.rejects(request(), /network disconnected/);
  const recovered = await request();

  assert.equal(attempt, 2);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(JSON.parse(bodies[1]).task_id, 'offline-stable-task');
  assert.equal(recovered.reused, true);
  assert.equal(await recovered.blob.text(), 'recovered');
});

test('processing-task polling is bounded and surfaces the retryable reason', async () => {
  const waits = [];
  let requests = 0;
  const attempt = fetchAiResult({
    api: 'https://api.example.test',
    deviceId: 'device-123',
    taskId: 'long-running-task',
    dataUrl: 'data:image/jpeg;base64,ghi',
    failedText: 'failed',
    fetchImpl: async () => {
      requests += 1;
      return Response.json({ reason: 'task_processing' }, { status: 409 });
    },
    wait: async (delay) => waits.push(delay),
    maxProcessingPolls: 2,
    pollDelayMs: 10,
  });

  await assert.rejects(attempt, (error) => error.reason === 'task_processing');
  assert.equal(requests, 3);
  assert.deepEqual(waits, [10, 10]);
});

test('processing claims its preflight lock before awaiting credit checks', async () => {
  const source = await (await import('node:fs/promises')).readFile(
    new URL('../ai-workflow.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('async function process()');
  const end = source.indexOf('\n    async function restoreSession()', start);
  const processSource = source.slice(start, end);

  assert.match(processSource, /if \(!files\.length \|\| starting \|\| processing\)/);
  assert.ok(
    processSource.indexOf('starting = true') < processSource.indexOf('await waitForDetection()'),
    'the single-flight lock must be claimed before the first await',
  );
  assert.match(processSource, /finally \{[\s\S]*starting = false;[\s\S]*processing = false;/);
});

test('meaningful transparency ignores isolated alpha noise and thin semi-transparent edges', () => {
  const makeAlphaData = (width, height, alphaForPixel = () => 255) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 40;
        data[offset + 1] = 90;
        data[offset + 2] = 160;
        data[offset + 3] = alphaForPixel(x, y);
      }
    }
    return data;
  };

  const width = 256;
  const height = 256;
  assert.equal(hasMeaningfulTransparency(makeAlphaData(width, height)), false);
  assert.equal(
    hasMeaningfulTransparency(makeAlphaData(width, height, (x, y) => (
      x === 128 && y === 128 ? 0 : 255
    ))),
    false,
  );
  assert.equal(
    hasMeaningfulTransparency(makeAlphaData(width, height, (x, y) => (
      x < 2 || y < 2 || x >= width - 2 || y >= height - 2 ? 180 : 255
    ))),
    false,
  );
  assert.equal(
    hasMeaningfulTransparency(makeAlphaData(width, height, (x, y) => (
      (x + y * width) % 512 === 0 ? 0 : 255
    ))),
    false,
  );
  assert.equal(
    hasMeaningfulTransparency(makeAlphaData(width, height, (x) => (x < 64 ? 0 : 255))),
    true,
  );
  assert.equal(
    hasMeaningfulTransparency(makeAlphaData(width, height, () => 0)),
    true,
  );
});

test('old restored transparency decisions are upgraded without clearing valid state', () => {
  const oldNoise = {
    aiRequested: false,
    transparent: true,
    transparencyDetectorVersion: 0,
    foregroundBlob: null,
    outputBlob: null,
  };
  applyTransparencyResult(oldNoise, false);
  assert.equal(oldNoise.transparent, false);
  assert.equal(oldNoise.aiRequested, true);
  assert.equal(oldNoise.transparencyDetectorVersion, TRANSPARENCY_DETECTOR_VERSION);

  const oldCutout = {
    aiRequested: false,
    transparent: true,
    transparencyDetectorVersion: 0,
    foregroundBlob: null,
    outputBlob: { preserved: true },
  };
  const preservedOutput = oldCutout.outputBlob;
  applyTransparencyResult(oldCutout, true);
  assert.equal(oldCutout.transparent, true);
  assert.equal(oldCutout.aiRequested, false);
  assert.equal(oldCutout.outputBlob, preservedOutput);

  const manualSkip = {
    aiRequested: false,
    transparent: false,
    transparencyDetectorVersion: 0,
  };
  applyTransparencyResult(manualSkip, false);
  assert.equal(manualSkip.aiRequested, false);
});

test('PNG recognition accepts MIME type or case-insensitive extension', () => {
  assert.equal(isPng({ type: 'image/png', name: 'asset.bin' }), true);
  assert.equal(isPng({ type: '', name: 'asset.PNG' }), true);
  assert.equal(isPng({ type: 'image/jpeg', name: 'asset.jpg' }), false);
});

test('localized templates replace named counters without evaluating markup', () => {
  assert.equal(
    format('{ai}/{total} need AI · {noCharge} free', { ai: 2, total: 5, noCharge: 3 }),
    '2/5 need AI · 3 free',
  );
});

test('refresh recovery stores original, edited source, task state, outputs, and composition', () => {
  const original = Object.assign(new Blob(['original']), {
    name: 'product.jpg',
    lastModified: 123,
  });
  const edited = new Blob(['edited-source']);
  const foreground = new Blob(['foreground']);
  const output = new Blob(['output']);
  const job = {
    taskId: 'stable-task',
    sourceVersion: 2,
    aiRequested: true,
    transparent: false,
    transparencyDetectorVersion: TRANSPARENCY_DETECTOR_VERSION,
    foregroundBlob: foreground,
    outputBlob: output,
    outputName: 'product-clean.png',
    hadAiResult: true,
    needsReprocess: false,
    status: 'succeeded',
    error: null,
  };
  const now = 1_000;
  const record = buildSessionRecord({
    ownerKey: 'user:123',
    files: [original],
    jobs: [job],
    getSourceFile: () => edited,
    composition: {
      bgMode: 'custom',
      customHex: '#112233',
      backgroundScale: 125,
      backgroundOffsetX: 8,
      backgroundOffsetY: -6,
      backgroundBlur: 12,
      outputSize: '1000',
      renameMode: 'sequence',
    },
    now,
  });

  assert.equal(record.schemaVersion, SESSION_SCHEMA_VERSION);
  assert.equal(record.updatedAt, now);
  assert.equal(record.expiresAt, now + SESSION_TTL_MS);
  assert.equal(record.items[0].file, original);
  assert.equal(record.items[0].sourceBlob, edited);
  assert.equal(record.items[0].job.taskId, 'stable-task');
  assert.equal(
    record.items[0].job.transparencyDetectorVersion,
    TRANSPARENCY_DETECTOR_VERSION,
  );
  assert.equal(record.items[0].job.foregroundBlob, foreground);
  assert.equal(record.items[0].job.outputBlob, output);
  assert.deepEqual(record.composition, {
    bgMode: 'custom',
    customHex: '#112233',
    backgroundScale: 125,
    backgroundOffsetX: 8,
    backgroundOffsetY: -6,
    backgroundBlur: 12,
    outputSize: '1000',
    renameMode: 'sequence',
  });
  assert.equal(record.byteSize, original.size + edited.size + foreground.size + output.size);
});

test('refresh recovery avoids duplicating an unchanged source and marks interrupted work retryable', () => {
  const original = new Blob(['original']);
  const state = storedJobState({
    taskId: 'retry-same-task',
    sourceVersion: 0,
    aiRequested: true,
    transparent: false,
    foregroundBlob: null,
    outputBlob: null,
    status: 'processing',
    error: null,
  });
  const record = buildSessionRecord({
    ownerKey: 'device:abc',
    files: [original],
    jobs: [state],
    getSourceFile: () => original,
    composition: {},
    now: 500,
  });

  assert.equal(record.items[0].sourceBlob, null);
  assert.equal(state.taskId, 'retry-same-task');
  assert.equal(state.status, 'failed');
  assert.equal(state.error, 'interrupted');
});

test('refresh recovery validates owner, schema, expiry, and the 150 MB cap', () => {
  const now = 10_000;
  const base = {
    ownerKey: 'user:one',
    schemaVersion: SESSION_SCHEMA_VERSION,
    expiresAt: now + 1,
    byteSize: 10,
    items: [{}],
  };

  assert.equal(usableSessionRecord(base, 'user:one', now), true);
  assert.equal(usableSessionRecord({ ...base, ownerKey: 'user:two' }, 'user:one', now), false);
  assert.equal(usableSessionRecord({ ...base, schemaVersion: 99 }, 'user:one', now), false);
  assert.equal(usableSessionRecord({ ...base, expiresAt: now }, 'user:one', now), false);
  assert.equal(
    usableSessionRecord({ ...base, byteSize: SESSION_MAX_BYTES + 1 }, 'user:one', now),
    false,
  );
  assert.equal(usableSessionRecord({ ...base, items: [] }, 'user:one', now), false);
});

test('refresh recovery size includes every persisted image blob', () => {
  const sharedBackground = { size: 50 };
  const itemBackground = { size: 25 };
  assert.equal(sessionByteSize([{
    file: { size: 10 },
    sourceBlob: { size: 20 },
    job: {
      foregroundBlob: { size: 30 },
      outputBlob: { size: 40 },
    },
  }], {
    backgroundImageBlob: sharedBackground,
    itemOverrides: {
      0: { backgroundImageBlob: sharedBackground },
      1: { backgroundImageBlob: itemBackground },
    },
  }), 175);
});
