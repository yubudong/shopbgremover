const INPAINT_PATH_PREFIX = '/api/inpaint/';
const VALID_MODES = new Set(['off', 'admin_free', 'public_free']);
const MAX_BATCH_TASKS = 50;
const GUEST_DAILY_TASKS = 50;
const BURST_TASKS = 60;
const BURST_WINDOW_SECONDS = 10 * 60;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = (MAX_FILE_BYTES * 2) + (256 * 1024);
const RESULT_TTL_SECONDS = 24 * 60 * 60;
const TASK_LEASE_SECONDS = 5 * 60;
const MAX_QUEUE_ATTEMPTS = 4;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SUPPORTED_MASK_TYPES = new Set(['image/png']);
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

function currentMode(env) {
  const mode = String(env.INPAINT_MODE || 'off').trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : 'off';
}

function safeErrorDetail(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 500) || null;
}

function productDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function sha256HexBytes(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256HexText(value) {
  return sha256HexBytes(new TextEncoder().encode(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function parseBatchRequest(request) {
  const body = await request.json().catch(() => null);
  const taskCount = Number(body?.task_count);
  const clientBatchId = String(body?.client_batch_id || '').trim();
  const maskSpec = body?.mask_spec;
  if (!Number.isInteger(taskCount) || taskCount < 1 || taskCount > MAX_BATCH_TASKS) {
    return { error: 'task_count must be an integer from 1 to 50.' };
  }
  if (!CLIENT_ID_PATTERN.test(clientBatchId)) {
    return { error: 'client_batch_id must be 8 to 128 letters, numbers, underscores, or hyphens.' };
  }
  if (!maskSpec || typeof maskSpec !== 'object' || Array.isArray(maskSpec)) {
    return { error: 'mask_spec is required.' };
  }
  const maskSpecJson = canonicalize(maskSpec);
  if (new TextEncoder().encode(maskSpecJson).byteLength > 16 * 1024) {
    return { error: 'mask_spec is too large.' };
  }
  return {
    taskCount,
    clientBatchId,
    maskSpecJson,
    maskSpecHash: await sha256HexText(maskSpecJson),
  };
}

function publicBatch(row, tasks = []) {
  return {
    id: row.id,
    client_batch_id: row.client_batch_id,
    status: row.status,
    task_count: Number(row.task_count),
    uploaded_count: Number(row.uploaded_count || 0),
    succeeded_count: Number(row.succeeded_count || 0),
    failed_count: Number(row.failed_count || 0),
    mask_spec_hash: row.mask_spec_hash,
    product_day: row.product_day,
    created_at: Number(row.created_at),
    completed_at: row.completed_at == null ? null : Number(row.completed_at),
    tasks: tasks.map((task) => ({
      id: task.id,
      position: Number(task.position),
      status: task.status,
      error_code: task.error_code || null,
      result_expires_at: task.result_expires_at == null
        ? null
        : Number(task.result_expires_at),
    })),
  };
}

async function readOwnedBatch(env, batchId, ownerKey) {
  return env.DB.prepare(
    `SELECT id, client_batch_id, owner_key, status, task_count, uploaded_count,
            succeeded_count, failed_count, mask_spec_hash, product_day,
            created_at, completed_at
     FROM inpaint_batches
     WHERE id = ? AND owner_key = ?`
  ).bind(batchId, ownerKey).first();
}

async function listBatchTasks(env, batchId) {
  const rows = await env.DB.prepare(
    `SELECT id, position, status, error_code, result_expires_at
     FROM inpaint_tasks
     WHERE batch_id = ?
     ORDER BY position`
  ).bind(batchId).all();
  return rows.results || [];
}

async function refreshBatch(env, batchId) {
  await env.DB.prepare(
    `UPDATE inpaint_batches
     SET uploaded_count = (
           SELECT COUNT(*) FROM inpaint_tasks
           WHERE batch_id = ? AND status <> 'awaiting_upload'
         ),
         succeeded_count = (
           SELECT COUNT(*) FROM inpaint_tasks
           WHERE batch_id = ? AND status = 'succeeded'
         ),
         failed_count = (
           SELECT COUNT(*) FROM inpaint_tasks
           WHERE batch_id = ? AND status IN ('failed', 'cancelled')
         ),
         status = CASE
           WHEN status = 'cancelled' THEN 'cancelled'
           WHEN (
             SELECT COUNT(*) FROM inpaint_tasks
             WHERE batch_id = ? AND status IN ('succeeded', 'failed', 'cancelled')
           ) = task_count
           THEN CASE
             WHEN (
               SELECT COUNT(*) FROM inpaint_tasks
               WHERE batch_id = ? AND status = 'succeeded'
             ) = task_count THEN 'succeeded'
             WHEN (
               SELECT COUNT(*) FROM inpaint_tasks
               WHERE batch_id = ? AND status = 'failed'
             ) = task_count THEN 'failed'
             ELSE 'partial'
           END
           WHEN EXISTS (
             SELECT 1 FROM inpaint_tasks
             WHERE batch_id = ? AND status = 'processing'
           ) THEN 'processing'
           WHEN EXISTS (
             SELECT 1 FROM inpaint_tasks
             WHERE batch_id = ? AND status = 'queued'
           ) THEN 'queued'
           ELSE 'creating'
         END,
         completed_at = CASE
           WHEN (
             SELECT COUNT(*) FROM inpaint_tasks
             WHERE batch_id = ? AND status IN ('succeeded', 'failed', 'cancelled')
           ) = task_count THEN COALESCE(completed_at, unixepoch())
           ELSE NULL
         END,
         updated_at = unixepoch()
     WHERE id = ?`
  ).bind(
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
    batchId,
  ).run();
}

async function createBatch(request, env, identity, respond, origin) {
  const parsed = await parseBatchRequest(request);
  if (parsed.error) return respond({ error: parsed.error }, 400, origin);

  const existing = await env.DB.prepare(
    `SELECT id, client_batch_id, owner_key, status, task_count, uploaded_count,
            succeeded_count, failed_count, mask_spec_hash, product_day,
            created_at, completed_at
     FROM inpaint_batches
     WHERE owner_key = ? AND client_batch_id = ?`
  ).bind(identity.ownerKey, parsed.clientBatchId).first();
  if (existing) {
    return respond({
      batch: publicBatch(existing, await listBatchTasks(env, existing.id)),
      reused: true,
    }, 200, origin);
  }

  const active = await env.DB.prepare(
    `SELECT id FROM inpaint_batches
     WHERE owner_key = ? AND status IN ('creating', 'queued', 'processing')
     LIMIT 1`
  ).bind(identity.ownerKey).first();
  if (active) {
    return respond({ error: 'Finish or cancel the active batch before starting another one.' }, 409, origin);
  }

  const burstCount = Number(await env.DB.prepare(
    `SELECT COUNT(*) FROM inpaint_tasks
     WHERE owner_key = ? AND created_at > unixepoch() - ?`
  ).bind(identity.ownerKey, BURST_WINDOW_SECONDS).first('COUNT(*)') || 0);
  if (burstCount + parsed.taskCount > BURST_TASKS) {
    return respond({ error: 'Too many tasks were created recently. Please wait and retry.' }, 429, origin);
  }

  const day = productDay();
  if (!identity.userId) {
    const guestCount = Number(await env.DB.prepare(
      `SELECT COUNT(*) FROM inpaint_tasks
       WHERE owner_key = ? AND product_day = ?`
    ).bind(identity.ownerKey, day).first('COUNT(*)') || 0);
    if (guestCount + parsed.taskCount > GUEST_DAILY_TASKS) {
      return respond({
        error: 'The guest watermark-removal limit is 50 images per day.',
        code: 'guest_daily_limit',
      }, 429, origin);
    }
  }

  const batchId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `INSERT INTO inpaint_batches
       (id, client_batch_id, owner_key, user_id, guest_device_hash,
        guest_ip_hash, product_day, task_count, mask_spec_json,
        mask_spec_hash, mode_at_creation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      batchId,
      parsed.clientBatchId,
      identity.ownerKey,
      identity.userId,
      identity.guestDeviceHash,
      identity.guestIpHash,
      day,
      parsed.taskCount,
      parsed.maskSpecJson,
      parsed.maskSpecHash,
      currentMode(env),
    ),
  ];
  for (let position = 0; position < parsed.taskCount; position += 1) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO inpaint_tasks
         (id, batch_id, owner_key, product_day, position)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), batchId, identity.ownerKey, day, position),
    );
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    const concurrent = await env.DB.prepare(
      `SELECT id, client_batch_id, owner_key, status, task_count, uploaded_count,
              succeeded_count, failed_count, mask_spec_hash, product_day,
              created_at, completed_at
       FROM inpaint_batches
       WHERE owner_key = ? AND client_batch_id = ?`
    ).bind(identity.ownerKey, parsed.clientBatchId).first();
    if (!concurrent) throw error;
    return respond({
      batch: publicBatch(concurrent, await listBatchTasks(env, concurrent.id)),
      reused: true,
    }, 200, origin);
  }

  const created = await readOwnedBatch(env, batchId, identity.ownerKey);
  return respond({
    batch: publicBatch(created, await listBatchTasks(env, batchId)),
    reused: false,
  }, 201, origin);
}

async function uploadTask(request, env, identity, batchId, position, respond, origin) {
  const batch = await readOwnedBatch(env, batchId, identity.ownerKey);
  if (!batch) return respond({ error: 'Batch not found.' }, 404, origin);
  if (!['creating', 'queued'].includes(batch.status)) {
    return respond({ error: 'This batch no longer accepts uploads.' }, 409, origin);
  }
  if (!Number.isInteger(position) || position < 0 || position >= Number(batch.task_count)) {
    return respond({ error: 'Task position is outside this batch.' }, 400, origin);
  }
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_MULTIPART_BYTES) {
    return respond({ error: 'The upload is too large.' }, 413, origin);
  }
  const form = await request.formData().catch(() => null);
  const image = form?.get('image');
  const mask = form?.get('mask');
  const maskSpecHash = String(form?.get('mask_spec_hash') || '');
  if (!(image instanceof File) || !(mask instanceof File)) {
    return respond({ error: 'Both image and mask files are required.' }, 400, origin);
  }
  if (!SUPPORTED_IMAGE_TYPES.has(image.type) || !SUPPORTED_MASK_TYPES.has(mask.type)) {
    return respond({ error: 'Use PNG, JPEG, or WebP images and a PNG mask.' }, 415, origin);
  }
  if (
    image.size < 1 || mask.size < 1
    || image.size > MAX_FILE_BYTES || mask.size > MAX_FILE_BYTES
  ) {
    return respond({ error: 'Each derived image and mask must be between 1 byte and 10 MB.' }, 413, origin);
  }
  if (maskSpecHash !== batch.mask_spec_hash) {
    return respond({ error: 'The mask does not belong to this batch.' }, 409, origin);
  }

  const task = await env.DB.prepare(
    `SELECT id, status, image_sha256, mask_sha256
     FROM inpaint_tasks
     WHERE batch_id = ? AND position = ? AND owner_key = ?`
  ).bind(batchId, position, identity.ownerKey).first();
  if (!task) return respond({ error: 'Task not found.' }, 404, origin);

  const [imageBytes, maskBytes] = await Promise.all([
    image.arrayBuffer(),
    mask.arrayBuffer(),
  ]);
  const [imageHash, maskHash] = await Promise.all([
    sha256HexBytes(imageBytes),
    sha256HexBytes(maskBytes),
  ]);
  if (task.status !== 'awaiting_upload') {
    if (task.image_sha256 === imageHash && task.mask_sha256 === maskHash) {
      return respond({ task_id: task.id, status: task.status, reused: true }, 200, origin);
    }
    return respond({ error: 'This task was already uploaded with different content.' }, 409, origin);
  }

  const prefix = `inpaint/${batchId}/${task.id}`;
  const imageKey = `${prefix}/input`;
  const maskKey = `${prefix}/mask.png`;
  const resultKey = `${prefix}/result.png`;
  try {
    await Promise.all([
      env.INPAINT_OBJECTS.put(imageKey, imageBytes, {
        httpMetadata: { contentType: image.type },
        customMetadata: { taskId: task.id, kind: 'input' },
      }),
      env.INPAINT_OBJECTS.put(maskKey, maskBytes, {
        httpMetadata: { contentType: mask.type },
        customMetadata: { taskId: task.id, kind: 'mask' },
      }),
    ]);
    const updated = await env.DB.prepare(
      `UPDATE inpaint_tasks
       SET status = 'queued', image_key = ?, mask_key = ?, result_key = ?,
           image_sha256 = ?, mask_sha256 = ?, image_mime = ?,
           updated_at = unixepoch()
       WHERE id = ? AND owner_key = ? AND status = 'awaiting_upload'`
    ).bind(
      imageKey,
      maskKey,
      resultKey,
      imageHash,
      maskHash,
      image.type,
      task.id,
      identity.ownerKey,
    ).run();
    if (Number(updated.meta?.changes || 0) !== 1) {
      throw new Error('task_state_changed');
    }
    await env.INPAINT_QUEUE.send({ taskId: task.id, batchId });
  } catch (error) {
    await Promise.all([
      env.INPAINT_OBJECTS.delete(imageKey).catch(() => undefined),
      env.INPAINT_OBJECTS.delete(maskKey).catch(() => undefined),
    ]);
    await env.DB.prepare(
      `UPDATE inpaint_tasks
       SET status = 'awaiting_upload', image_key = NULL, mask_key = NULL,
           result_key = NULL, image_sha256 = NULL, mask_sha256 = NULL,
           image_mime = NULL, error_code = 'upload_failed',
           updated_at = unixepoch()
       WHERE id = ? AND status = 'queued'`
    ).bind(task.id).run().catch(() => undefined);
    await refreshBatch(env, batchId).catch(() => undefined);
    console.error(JSON.stringify({
      message: 'Inpaint task upload or enqueue failed',
      taskId: task.id,
      error: safeErrorDetail(error?.message),
    }));
    return respond({ error: 'The task could not be queued. Please retry the upload.' }, 503, origin);
  }

  await refreshBatch(env, batchId);
  return respond({ task_id: task.id, status: 'queued', reused: false }, 202, origin);
}

async function getBatch(env, identity, batchId, respond, origin) {
  const batch = await readOwnedBatch(env, batchId, identity.ownerKey);
  if (!batch) return respond({ error: 'Batch not found.' }, 404, origin);
  return respond({
    batch: publicBatch(batch, await listBatchTasks(env, batchId)),
  }, 200, origin);
}

async function getResult(env, identity, taskId, respond, origin, responseHeaders) {
  const task = await env.DB.prepare(
    `SELECT id, status, result_key, result_expires_at
     FROM inpaint_tasks
     WHERE id = ? AND owner_key = ?`
  ).bind(taskId, identity.ownerKey).first();
  if (!task) return respond({ error: 'Task not found.' }, 404, origin);
  if (task.status !== 'succeeded' || !task.result_key) {
    return respond({ error: 'The result is not available.' }, 409, origin);
  }
  if (Number(task.result_expires_at || 0) <= Math.floor(Date.now() / 1000)) {
    return respond({ error: 'The result has expired.' }, 410, origin);
  }
  const object = await env.INPAINT_OBJECTS.get(task.result_key);
  if (!object) return respond({ error: 'The result has expired.' }, 410, origin);
  const headers = new Headers({
    ...responseHeaders,
    'Content-Type': 'image/png',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return new Response(object.body, { headers });
}

async function acknowledgeResult(env, identity, taskId, respond, origin) {
  const task = await env.DB.prepare(
    `SELECT id, result_key FROM inpaint_tasks
     WHERE id = ? AND owner_key = ?`
  ).bind(taskId, identity.ownerKey).first();
  if (!task) return respond({ error: 'Task not found.' }, 404, origin);
  if (task.result_key) await env.INPAINT_OBJECTS.delete(task.result_key);
  await env.DB.prepare(
    `UPDATE inpaint_tasks
     SET result_key = NULL, result_acknowledged_at = unixepoch(),
         updated_at = unixepoch()
     WHERE id = ? AND owner_key = ?`
  ).bind(taskId, identity.ownerKey).run();
  return respond({ ok: true }, 200, origin);
}

async function cancelBatch(env, identity, batchId, respond, origin) {
  const batch = await readOwnedBatch(env, batchId, identity.ownerKey);
  if (!batch) return respond({ error: 'Batch not found.' }, 404, origin);
  if (['succeeded', 'partial', 'failed', 'cancelled'].includes(batch.status)) {
    return respond({ ok: true, status: batch.status }, 200, origin);
  }
  const objects = await env.DB.prepare(
    `SELECT image_key, mask_key, result_key FROM inpaint_tasks
     WHERE batch_id = ? AND owner_key = ?`
  ).bind(batchId, identity.ownerKey).all();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE inpaint_batches
       SET status = 'cancelled', completed_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND owner_key = ?`
    ).bind(batchId, identity.ownerKey),
    env.DB.prepare(
      `UPDATE inpaint_tasks
       SET status = 'cancelled', completed_at = unixepoch(), updated_at = unixepoch()
       WHERE batch_id = ? AND owner_key = ?
         AND status IN ('awaiting_upload', 'queued')`
    ).bind(batchId, identity.ownerKey),
  ]);
  await Promise.all((objects.results || []).flatMap((row) =>
    [row.image_key, row.mask_key, row.result_key]
      .filter(Boolean)
      .map((key) => env.INPAINT_OBJECTS.delete(key).catch(() => undefined))
  ));
  return respond({ ok: true, status: 'cancelled' }, 200, origin);
}

export async function maybeHandleInpaintRequest(
  request,
  env,
  { resolveIdentity, respond, origin, responseHeaders },
) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(INPAINT_PATH_PREFIX)) return null;

  const mode = currentMode(env);
  if (url.pathname === '/api/inpaint/capabilities' && request.method === 'GET') {
    return respond({
      mode,
      enabled: mode !== 'off',
      limits: {
        max_batch_tasks: MAX_BATCH_TASKS,
        guest_daily_tasks: GUEST_DAILY_TASKS,
        burst_tasks: BURST_TASKS,
        burst_window_seconds: BURST_WINDOW_SECONDS,
        max_file_bytes: MAX_FILE_BYTES,
        result_ttl_seconds: RESULT_TTL_SECONDS,
      },
    }, 200, origin);
  }
  if (mode === 'off') {
    return respond({
      error: 'AI precise cleanup is not accepting new tasks.',
      code: 'inpaint_off',
    }, 503, origin);
  }

  const identity = await resolveIdentity(request, env);
  if (mode === 'admin_free' && !identity.isAdmin) {
    return respond({
      error: identity.userId ? 'Forbidden' : 'Sign in with an administrator account.',
    }, identity.userId ? 403 : 401, origin);
  }

  if (url.pathname === '/api/inpaint/batches' && request.method === 'POST') {
    return createBatch(request, env, identity, respond, origin);
  }
  const taskUpload = url.pathname.match(/^\/api\/inpaint\/batches\/([^/]+)\/tasks\/(\d+)$/);
  if (taskUpload && request.method === 'POST') {
    return uploadTask(
      request,
      env,
      identity,
      taskUpload[1],
      Number(taskUpload[2]),
      respond,
      origin,
    );
  }
  const batchRoute = url.pathname.match(/^\/api\/inpaint\/batches\/([^/]+)$/);
  if (batchRoute && request.method === 'GET') {
    return getBatch(env, identity, batchRoute[1], respond, origin);
  }
  if (batchRoute && request.method === 'DELETE') {
    return cancelBatch(env, identity, batchRoute[1], respond, origin);
  }
  const resultRoute = url.pathname.match(/^\/api\/inpaint\/tasks\/([^/]+)\/result$/);
  if (resultRoute && request.method === 'GET') {
    return getResult(env, identity, resultRoute[1], respond, origin, responseHeaders);
  }
  if (resultRoute && request.method === 'DELETE') {
    return acknowledgeResult(env, identity, resultRoute[1], respond, origin);
  }
  return respond({ error: 'Not found' }, 404, origin);
}

async function hmacSignature(secret, taskId, timestamp, imageBytes, maskBytes) {
  const [imageHash, maskHash] = await Promise.all([
    sha256HexBytes(imageBytes),
    sha256HexBytes(maskBytes),
  ]);
  const canonical = [
    'shopbg-inpaint-v1',
    taskId,
    timestamp,
    imageHash,
    maskHash,
  ].join('\n');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(canonical),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function markTaskFailed(env, task, code, detail) {
  await Promise.all([
    task.image_key
      ? env.INPAINT_OBJECTS.delete(task.image_key).catch(() => undefined)
      : Promise.resolve(),
    task.mask_key
      ? env.INPAINT_OBJECTS.delete(task.mask_key).catch(() => undefined)
      : Promise.resolve(),
  ]);
  await env.DB.prepare(
    `UPDATE inpaint_tasks
     SET status = 'failed', error_code = ?, error_detail = ?,
         image_key = NULL, mask_key = NULL, lease_expires_at = NULL,
         completed_at = unixepoch(), updated_at = unixepoch()
     WHERE id = ? AND status IN ('queued', 'processing')`
  ).bind(code, safeErrorDetail(detail), task.id).run();
  await refreshBatch(env, task.batch_id);
}

async function processQueueMessage(message, env) {
  const taskId = String(message.body?.taskId || '');
  if (!CLIENT_ID_PATTERN.test(taskId)) {
    message.ack();
    return;
  }

  await env.DB.prepare(
    `UPDATE inpaint_tasks
     SET status = 'queued', lease_expires_at = NULL, updated_at = unixepoch()
     WHERE id = ? AND status = 'processing' AND lease_expires_at <= unixepoch()`
  ).bind(taskId).run();
  const claimed = await env.DB.prepare(
    `UPDATE inpaint_tasks
     SET status = 'processing', attempts = attempts + 1,
         started_at = COALESCE(started_at, unixepoch()),
         lease_expires_at = unixepoch() + ?, updated_at = unixepoch()
     WHERE id = ? AND status = 'queued'
       AND NOT EXISTS (
         SELECT 1 FROM inpaint_tasks active
         WHERE active.owner_key = inpaint_tasks.owner_key
           AND active.id <> inpaint_tasks.id
           AND active.status = 'processing'
           AND active.lease_expires_at > unixepoch()
       )`
  ).bind(TASK_LEASE_SECONDS, taskId).run();
  if (Number(claimed.meta?.changes || 0) !== 1) {
    const state = await env.DB.prepare(
      'SELECT status FROM inpaint_tasks WHERE id = ?'
    ).bind(taskId).first('status');
    if (!state || ['succeeded', 'failed', 'cancelled'].includes(state)) {
      message.ack();
    } else {
      message.retry({ delaySeconds: 2 });
    }
    return;
  }

  const task = await env.DB.prepare(
    `SELECT id, batch_id, image_key, mask_key, result_key, image_mime
     FROM inpaint_tasks WHERE id = ?`
  ).bind(taskId).first();
  try {
    const existingResult = task.result_key
      ? await env.INPAINT_OBJECTS.head(task.result_key)
      : null;
    if (!existingResult) {
      const [imageObject, maskObject] = await Promise.all([
        env.INPAINT_OBJECTS.get(task.image_key),
        env.INPAINT_OBJECTS.get(task.mask_key),
      ]);
      if (!imageObject || !maskObject) {
        await markTaskFailed(env, task, 'missing_input', 'A private input object is missing.');
        message.ack();
        return;
      }
      const [imageBytes, maskBytes] = await Promise.all([
        imageObject.arrayBuffer(),
        maskObject.arrayBuffer(),
      ]);
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = await hmacSignature(
        env.INPAINT_HMAC_SECRET,
        task.id,
        timestamp,
        imageBytes,
        maskBytes,
      );
      const form = new FormData();
      form.set('image', new File([imageBytes], 'input', { type: task.image_mime }));
      form.set('mask', new File([maskBytes], 'mask.png', { type: 'image/png' }));
      const response = await fetch(`${String(env.INPAINT_SERVICE_URL).replace(/\/$/, '')}/v1/inpaint`, {
        method: 'POST',
        headers: {
          'CF-Access-Client-Id': env.INPAINT_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': env.INPAINT_ACCESS_CLIENT_SECRET,
          'X-ShopBG-Task-ID': task.id,
          'X-ShopBG-Timestamp': timestamp,
          'X-ShopBG-Signature': signature,
        },
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        const detail = safeErrorDetail(await response.text());
        if ([400, 413, 415].includes(response.status)) {
          await markTaskFailed(env, task, `input_${response.status}`, detail);
          message.ack();
          return;
        }
        throw new Error(`service_${response.status}:${detail}`);
      }
      const result = await response.arrayBuffer();
      if (!result.byteLength || result.byteLength > 25 * 1024 * 1024) {
        throw new Error('invalid_result_size');
      }
      await env.INPAINT_OBJECTS.put(task.result_key, result, {
        httpMetadata: { contentType: 'image/png' },
        customMetadata: { taskId: task.id, kind: 'result' },
      });
    }

    await Promise.all([
      env.INPAINT_OBJECTS.delete(task.image_key).catch(() => undefined),
      env.INPAINT_OBJECTS.delete(task.mask_key).catch(() => undefined),
    ]);
    await env.DB.prepare(
      `UPDATE inpaint_tasks
       SET status = 'succeeded', image_key = NULL, mask_key = NULL,
           lease_expires_at = NULL, error_code = NULL, error_detail = NULL,
           result_expires_at = unixepoch() + ?,
           completed_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND status = 'processing'`
    ).bind(RESULT_TTL_SECONDS, task.id).run();
    await refreshBatch(env, task.batch_id);
    message.ack();
  } catch (error) {
    if (Number(message.attempts || 1) >= MAX_QUEUE_ATTEMPTS) {
      await markTaskFailed(env, task, 'processing_failed', error?.message);
      message.ack();
      return;
    }
    await env.DB.prepare(
      `UPDATE inpaint_tasks
       SET status = 'queued', lease_expires_at = NULL,
           error_code = 'retrying', error_detail = ?, updated_at = unixepoch()
       WHERE id = ? AND status = 'processing'`
    ).bind(safeErrorDetail(error?.message), task.id).run();
    await refreshBatch(env, task.batch_id);
    message.retry({ delaySeconds: Math.min(30, 2 ** Number(message.attempts || 1)) });
  }
}

export async function processInpaintQueue(batch, env) {
  for (const message of batch.messages) {
    await processQueueMessage(message, env);
  }
}

export async function cleanupExpiredInpaint(env) {
  const expired = await env.DB.prepare(
    `SELECT id, result_key FROM inpaint_tasks
     WHERE result_key IS NOT NULL AND result_expires_at <= unixepoch()
     ORDER BY result_expires_at
     LIMIT 100`
  ).all();
  for (const task of expired.results || []) {
    await env.INPAINT_OBJECTS.delete(task.result_key).catch(() => undefined);
    await env.DB.prepare(
      `UPDATE inpaint_tasks
       SET result_key = NULL, result_expired_at = unixepoch(), updated_at = unixepoch()
       WHERE id = ? AND result_key = ?`
    ).bind(task.id, task.result_key).run();
  }
  return (expired.results || []).length;
}

export const INPAINT_LIMITS = Object.freeze({
  maxBatchTasks: MAX_BATCH_TASKS,
  guestDailyTasks: GUEST_DAILY_TASKS,
  burstTasks: BURST_TASKS,
  burstWindowSeconds: BURST_WINDOW_SECONDS,
  maxFileBytes: MAX_FILE_BYTES,
  resultTtlSeconds: RESULT_TTL_SECONDS,
});
