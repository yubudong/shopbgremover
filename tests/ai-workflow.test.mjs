import assert from 'node:assert/strict';
import test from 'node:test';

await import('../ai-workflow.js');

const {
  buildSessionRecord,
  format,
  hasTransparentPixel,
  isPng,
  planJobs,
  resetJobForSource,
  sessionByteSize,
  storedJobState,
  usableSessionRecord,
  SESSION_MAX_BYTES,
  SESSION_SCHEMA_VERSION,
  SESSION_TTL_MS,
} = globalThis.ShopBGAiWorkflow;

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

test('transparent pixel detection and PNG recognition are conservative', () => {
  assert.equal(hasTransparentPixel(new Uint8ClampedArray([1, 2, 3, 255])), false);
  assert.equal(hasTransparentPixel(new Uint8ClampedArray([1, 2, 3, 249])), true);
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
  assert.equal(record.items[0].job.foregroundBlob, foreground);
  assert.equal(record.items[0].job.outputBlob, output);
  assert.deepEqual(record.composition, {
    bgMode: 'custom',
    customHex: '#112233',
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
  assert.equal(sessionByteSize([{
    file: { size: 10 },
    sourceBlob: { size: 20 },
    job: {
      foregroundBlob: { size: 30 },
      outputBlob: { size: 40 },
    },
  }]), 100);
});
