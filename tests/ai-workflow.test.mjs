import assert from 'node:assert/strict';
import test from 'node:test';

await import('../ai-workflow.js');

const {
  format,
  hasTransparentPixel,
  isPng,
  planJobs,
  resetJobForSource,
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
