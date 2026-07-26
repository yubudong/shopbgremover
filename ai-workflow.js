(function () {
  const DEFAULT_TASK_ID = () => crypto.randomUUID();
  const SESSION_DB_NAME = 'shopbg-ai-workspace-v1';
  const SESSION_STORE_NAME = 'sessions';
  const SESSION_SCHEMA_VERSION = 1;
  const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
  const SESSION_MAX_BYTES = 150 * 1024 * 1024;
  const TASK_PROCESSING_MAX_POLLS = 8;
  const TASK_PROCESSING_POLL_DELAY_MS = 1000;
  const TRANSPARENCY_ALPHA_THRESHOLD = 250;
  const MIN_TRANSPARENCY_EQUIVALENT_PIXELS = 16;
  const MIN_TRANSPARENCY_EQUIVALENT_RATIO = 0.02;
  const TRANSPARENCY_DETECTOR_VERSION = 2;

  function format(template, values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    ));
  }

  function hasMeaningfulTransparency(data, {
    alphaThreshold = TRANSPARENCY_ALPHA_THRESHOLD,
    minEquivalentPixels = MIN_TRANSPARENCY_EQUIVALENT_PIXELS,
    minEquivalentRatio = MIN_TRANSPARENCY_EQUIVALENT_RATIO,
  } = {}) {
    const pixelCount = Math.floor(data.length / 4);
    if (pixelCount === 0) return false;

    const requiredEquivalentPixels = Math.min(
      pixelCount,
      Math.max(minEquivalentPixels, pixelCount * minEquivalentRatio),
    );
    let transparentEquivalentPixels = 0;
    for (let index = 3; index < data.length; index += 4) {
      const alpha = data[index];
      if (alpha >= alphaThreshold) continue;
      transparentEquivalentPixels += (255 - alpha) / 255;
      if (transparentEquivalentPixels >= requiredEquivalentPixels) return true;
    }
    return false;
  }

  function isPng(file) {
    return file?.type === 'image/png' || /\.png$/i.test(file?.name || '');
  }

  function applyTransparencyResult(job, transparent) {
    const upgradedOpaqueResult = (
      job.transparencyDetectorVersion !== TRANSPARENCY_DETECTOR_VERSION
      && job.transparent === true
      && transparent === false
    );
    job.transparent = transparent;
    job.transparencyDetectorVersion = TRANSPARENCY_DETECTOR_VERSION;
    if (transparent) {
      job.aiRequested = false;
    } else if (upgradedOpaqueResult) {
      job.aiRequested = true;
    }
    return job;
  }

  function planJobs(jobs) {
    const items = jobs.filter(Boolean);
    let aiCount = 0;
    let cachedCount = 0;
    let transparentCount = 0;
    let manualSkipCount = 0;
    let reprocessCount = 0;

    for (const job of items) {
      if (job.transparent === true) {
        transparentCount += 1;
        continue;
      }
      if (!job.aiRequested) {
        manualSkipCount += 1;
        continue;
      }
      if (job.foregroundBlob && !job.needsReprocess) {
        cachedCount += 1;
        continue;
      }
      aiCount += 1;
      if (job.needsReprocess) reprocessCount += 1;
    }

    return {
      total: items.length,
      aiCount,
      cachedCount,
      transparentCount,
      manualSkipCount,
      noChargeCount: items.length - aiCount,
      reprocessCount,
    };
  }

  function resetJobForSource(job, taskId = DEFAULT_TASK_ID()) {
    const hadAiResult = Boolean(job.hadAiResult || job.foregroundBlob);
    const wasAutoTransparent = job.transparent === true;
    job.sourceVersion += 1;
    job.taskId = taskId;
    job.transparent = null;
    job.transparencyDetectorVersion = 0;
    if (wasAutoTransparent) job.aiRequested = true;
    job.foregroundBlob = null;
    job.outputBlob = null;
    job.outputName = null;
    job.needsReprocess = hadAiResult;
    job.status = 'checking';
    job.error = null;
    return job;
  }

  function storedJobState(job) {
    return {
      taskId: job.taskId,
      sourceVersion: Number(job.sourceVersion || 0),
      aiRequested: Boolean(job.aiRequested),
      transparent: typeof job.transparent === 'boolean' ? job.transparent : null,
      transparencyDetectorVersion: Number(job.transparencyDetectorVersion || 0),
      foregroundBlob: job.foregroundBlob || null,
      outputBlob: job.outputBlob || null,
      outputName: job.outputName || null,
      hadAiResult: Boolean(job.hadAiResult || job.foregroundBlob),
      needsReprocess: Boolean(job.needsReprocess),
      status: job.status === 'processing' ? 'failed' : job.status,
      error: job.status === 'processing' ? 'interrupted' : (job.error || null),
    };
  }

  function sessionByteSize(items) {
    return items.reduce((total, item) => (
      total
      + Number(item.file?.size || 0)
      + Number(item.sourceBlob?.size || 0)
      + Number(item.job?.foregroundBlob?.size || 0)
      + Number(item.job?.outputBlob?.size || 0)
    ), 0);
  }

  function buildSessionRecord({
    ownerKey,
    files,
    jobs,
    getSourceFile,
    composition,
    now = Date.now(),
  }) {
    const items = files.map((file, index) => {
      const job = jobs[index];
      if (!file || !job) return null;
      const currentSource = getSourceFile(file);
      return {
        file,
        sourceBlob: currentSource && currentSource !== file ? currentSource : null,
        job: storedJobState(job),
      };
    }).filter(Boolean);

    return {
      ownerKey,
      schemaVersion: SESSION_SCHEMA_VERSION,
      updatedAt: now,
      expiresAt: now + SESSION_TTL_MS,
      byteSize: sessionByteSize(items),
      composition: composition || {},
      items,
    };
  }

  function usableSessionRecord(record, ownerKey, now = Date.now()) {
    return Boolean(
      record
      && record.schemaVersion === SESSION_SCHEMA_VERSION
      && record.ownerKey === ownerKey
      && Array.isArray(record.items)
      && record.items.length > 0
      && Number(record.expiresAt || 0) > now
      && Number(record.byteSize || 0) <= SESSION_MAX_BYTES
    );
  }

  async function fetchAiResult({
    api,
    deviceId,
    taskId,
    dataUrl,
    failedText,
    fetchImpl = globalThis.fetch,
    wait = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
    maxProcessingPolls = TASK_PROCESSING_MAX_POLLS,
    pollDelayMs = TASK_PROCESSING_POLL_DELAY_MS,
  }) {
    const requestUrl = `${api}/api/remove-bg`;
    const requestInit = {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': deviceId,
      },
      body: JSON.stringify({
        image_url: dataUrl,
        task_id: taskId,
      }),
    };
    let processingPolls = 0;
    let started = false;

    while (true) {
      const response = await fetchImpl(requestUrl, requestInit);
      if (response.ok) {
        return {
          blob: await response.blob(),
          reused: !started && response.headers.get('X-AI-Reused') === 'true',
        };
      }

      const detail = await response.json().catch(() => ({}));
      if (detail.started === true) started = true;
      if (
        response.status === 409
        && detail.reason === 'task_processing'
        && processingPolls < maxProcessingPolls
      ) {
        processingPolls += 1;
        await wait(pollDelayMs);
        continue;
      }

      const error = new Error(detail.message || detail.error || failedText);
      error.reason = detail.reason;
      throw error;
    }
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('indexeddb_transaction_failed'));
      transaction.onabort = () => reject(transaction.error || new Error('indexeddb_transaction_aborted'));
    });
  }

  function createSessionStore(indexedDb = globalThis.indexedDB) {
    let databasePromise = null;

    function database() {
      if (!indexedDb) return Promise.reject(new Error('indexeddb_unavailable'));
      if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
          const request = indexedDb.open(SESSION_DB_NAME, 1);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
              db.createObjectStore(SESSION_STORE_NAME, { keyPath: 'ownerKey' });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('indexeddb_open_failed'));
        });
      }
      return databasePromise;
    }

    return {
      async deleteExpired(now = Date.now()) {
        const db = await database();
        const transaction = db.transaction(SESSION_STORE_NAME, 'readwrite');
        const done = transactionDone(transaction);
        const request = transaction.objectStore(SESSION_STORE_NAME).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (Number(cursor.value?.expiresAt || 0) <= now) cursor.delete();
          cursor.continue();
        };
        await done;
      },
      async get(ownerKey) {
        const db = await database();
        const transaction = db.transaction(SESSION_STORE_NAME, 'readonly');
        return requestResult(transaction.objectStore(SESSION_STORE_NAME).get(ownerKey));
      },
      async put(record) {
        const db = await database();
        const transaction = db.transaction(SESSION_STORE_NAME, 'readwrite');
        transaction.objectStore(SESSION_STORE_NAME).put(record);
        await transactionDone(transaction);
      },
      async delete(ownerKey) {
        const db = await database();
        const transaction = db.transaction(SESSION_STORE_NAME, 'readwrite');
        transaction.objectStore(SESSION_STORE_NAME).delete(ownerKey);
        await transactionDone(transaction);
      },
    };
  }

  function create(options) {
    const panel = document.getElementById('aiWorkflowPanel');
    const globalToggle = document.getElementById('aiRemoveToggle');
    const estimate = document.getElementById('aiEstimate');
    const clearSessionButton = document.getElementById('aiSessionClear');
    if (!panel || !globalToggle || !estimate) {
      throw new Error('AI workflow controls are missing');
    }

    const text = panel.dataset;
    const jobs = [];
    const sessionStore = createSessionStore();
    let processing = false;
    let restoring = false;
    let clearing = false;
    let persistenceDisabled = false;
    let persistTimer = null;
    let lastStorageNotice = null;

    function sessionOwnerKey() {
      return String(options.getSessionOwner?.() || `device:${options.deviceId}`);
    }

    function notifyStorage(message) {
      if (!message || message === lastStorageNotice) return;
      lastStorageNotice = message;
      options.onSessionNotice?.(message);
    }

    async function persistSession() {
      if (restoring || clearing || persistenceDisabled) return false;
      const files = options.getFiles();
      const ownerKey = sessionOwnerKey();
      try {
        await sessionStore.deleteExpired();
        if (!files.length) {
          await sessionStore.delete(ownerKey);
          return true;
        }
        const record = buildSessionRecord({
          ownerKey,
          files,
          jobs,
          getSourceFile: options.getSourceFile,
          composition: options.getCompositionState?.(),
        });
        if (record.byteSize > SESSION_MAX_BYTES) {
          persistenceDisabled = true;
          await sessionStore.delete(ownerKey);
          notifyStorage(text.sessionTooLarge);
          return false;
        }
        await sessionStore.put(record);
        return true;
      } catch {
        persistenceDisabled = true;
        notifyStorage(text.sessionSaveFailed);
        return false;
      }
    }

    function schedulePersist() {
      if (restoring || clearing || persistenceDisabled) return;
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        persistSession();
      }, 250);
    }

    function jobStateText(job) {
      if (job.status === 'checking') return text.checking;
      if (job.transparent === true) return text.transparent;
      if (!job.aiRequested) return text.off;
      if (job.foregroundBlob && !job.needsReprocess) return text.cached;
      if (job.needsReprocess) return text.reprocess;
      if (job.status === 'failed') return text.failed;
      return text.ready;
    }

    function syncCard(job) {
      if (!job?.control) return;
      job.control.input.checked = Boolean(job.aiRequested);
      job.control.input.disabled = processing || job.status === 'checking' || job.transparent === true;
      job.control.state.textContent = jobStateText(job);
      job.control.wrapper.classList.toggle('is-transparent', job.transparent === true);
      job.control.wrapper.classList.toggle('is-off', !job.aiRequested);
      job.control.wrapper.classList.toggle('is-cached', Boolean(job.foregroundBlob && !job.needsReprocess));
      job.control.wrapper.classList.toggle('needs-reprocess', Boolean(job.needsReprocess));
    }

    function sync({ notify = false } = {}) {
      const activeJobs = options.getFiles().map((_, index) => jobs[index]).filter(Boolean);
      const plan = planJobs(activeJobs);
      if (!activeJobs.length) {
        estimate.textContent = text.empty;
      } else {
        estimate.textContent = format(text.summary, {
          total: plan.total,
          ai: plan.aiCount,
          noCharge: plan.noChargeCount,
          cached: plan.cachedCount,
        });
      }

      const selectable = activeJobs.filter((job) => job.transparent !== true);
      const enabled = selectable.filter((job) => job.aiRequested);
      if (selectable.length > 0) {
        globalToggle.checked = enabled.length === selectable.length;
        globalToggle.indeterminate = enabled.length > 0 && enabled.length < selectable.length;
      } else {
        globalToggle.indeterminate = false;
      }
      globalToggle.disabled = processing || selectable.length === 0;
      if (clearSessionButton) {
        clearSessionButton.hidden = activeJobs.length === 0;
        clearSessionButton.disabled = processing;
      }
      activeJobs.forEach(syncCard);
      if (notify) options.onPlanChanged?.(plan);
      return plan;
    }

    async function detectTransparency(file) {
      if (!isPng(file)) return false;
      const bitmap = await createImageBitmap(file);
      try {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', {
          alpha: true,
          willReadFrequently: true,
        });
        context.clearRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        return hasMeaningfulTransparency(context.getImageData(0, 0, width, height).data);
      } finally {
        bitmap.close?.();
      }
    }

    async function refreshTransparency(job, source) {
      const detectionToken = Symbol('transparency');
      const hadStoredTransparency = typeof job.transparent === 'boolean';
      job.detectionToken = detectionToken;
      job.status = 'checking';
      syncCard(job);
      try {
        const transparent = await detectTransparency(source);
        if (job.detectionToken !== detectionToken) return;
        applyTransparencyResult(job, transparent);
        job.status = 'ready';
      } catch {
        if (job.detectionToken !== detectionToken) return;
        if (!hadStoredTransparency) applyTransparencyResult(job, false);
        job.status = 'ready';
      }
      sync({ notify: true });
      schedulePersist();
    }

    function createCardControl(job, card) {
      const wrapper = document.createElement('div');
      wrapper.className = 'ai-card-control';
      wrapper.addEventListener('click', (event) => event.stopPropagation());

      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      const name = document.createElement('span');
      name.textContent = text.cardLabel;
      label.append(input, name);

      const state = document.createElement('small');
      wrapper.append(label, state);
      card.append(wrapper);

      input.addEventListener('change', () => {
        job.aiRequested = input.checked;
        job.outputBlob = null;
        job.outputName = null;
        options.onOutputsChanged?.(getOutputs());
        sync({ notify: true });
        schedulePersist();
      });

      job.control = { wrapper, input, state };
    }

    function register(file, index, card, initialState = null) {
      if (jobs[index]) return jobs[index];
      const restored = initialState && typeof initialState.taskId === 'string'
        ? initialState
        : null;
      const job = {
        file,
        index,
        taskId: restored?.taskId || DEFAULT_TASK_ID(),
        sourceVersion: Number(restored?.sourceVersion || 0),
        aiRequested: restored ? Boolean(restored.aiRequested) : globalToggle.checked,
        transparent: typeof restored?.transparent === 'boolean' ? restored.transparent : null,
        transparencyDetectorVersion: restored
          ? Number(restored.transparencyDetectorVersion || 0)
          : TRANSPARENCY_DETECTOR_VERSION,
        foregroundBlob: restored?.foregroundBlob || null,
        outputBlob: restored?.outputBlob || null,
        outputName: restored?.outputName || null,
        hadAiResult: Boolean(restored?.hadAiResult || restored?.foregroundBlob),
        needsReprocess: Boolean(restored?.needsReprocess),
        status: restored?.status || 'checking',
        error: restored?.error || null,
      };
      if (job.transparent === true) job.aiRequested = false;
      if (job.status === 'processing') {
        job.status = 'failed';
        job.error = 'interrupted';
      }
      jobs[index] = job;
      createCardControl(job, card);
      sync({ notify: true });
      if (
        typeof job.transparent === 'boolean'
        && job.transparencyDetectorVersion === TRANSPARENCY_DETECTOR_VERSION
      ) {
        syncCard(job);
        schedulePersist();
      } else {
        refreshTransparency(job, options.getSourceFile(file));
      }
      return job;
    }

    function markSourceChanged(index) {
      const job = jobs[index];
      if (!job) return;
      resetJobForSource(job);
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
      refreshTransparency(job, options.getSourceFile(job.file));
      schedulePersist();
    }

    function markCompositionChanged() {
      for (const job of jobs) {
        if (!job) continue;
        job.outputBlob = null;
        job.outputName = null;
      }
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
      schedulePersist();
    }

    function getOutputs() {
      return jobs
        .filter((job) => job?.outputBlob)
        .sort((left, right) => left.index - right.index)
        .map((job) => ({ name: job.outputName, blob: job.outputBlob }));
    }

    async function waitForDetection() {
      while (jobs.some((job) => job?.status === 'checking')) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }

    async function preflight(plan) {
      if (plan.aiCount > 0) {
        let creditData;
        try {
          const response = await fetch(`${options.api}/api/check-credit`, {
            method: 'GET',
            credentials: 'include',
            headers: { 'X-Device-ID': options.deviceId },
          });
          if (!response.ok) throw new Error('credit_check_failed');
          creditData = await response.json();
        } catch {
          options.setStatus(text.creditCheckFailed);
          return false;
        }

        const remaining = Number(creditData.remaining || 0);
        if (!creditData.ok || remaining < plan.aiCount) {
          options.setStatus(format(text.insufficient, {
            needed: plan.aiCount,
            remaining,
          }));
          if (options.getCurrentUser()) options.showUpgradeModal();
          else options.showRegisterModal();
          return false;
        }
      }

      if (plan.reprocessCount > 0 && !window.confirm(format(text.confirmReprocess, {
        count: plan.reprocessCount,
      }))) {
        return false;
      }

      return window.confirm(format(text.confirm, {
        total: plan.total,
        ai: plan.aiCount,
        noCharge: plan.noChargeCount,
      }));
    }

    async function requestAi(job, source) {
      const dataUrl = await options.compressToDataUrl(source);
      return fetchAiResult({
        api: options.api,
        deviceId: options.deviceId,
        taskId: job.taskId,
        dataUrl,
        failedText: text.failed,
      });
    }

    async function process() {
      const files = options.getFiles();
      if (!files.length || processing) return { started: false };
      await waitForDetection();
      const plan = sync();
      if (!await preflight(plan)) return { started: false };

      processing = true;
      sync();
      options.onStart?.(plan);
      let errors = 0;
      let stoppedForCredits = false;
      let actualAiCalls = 0;

      for (let index = 0; index < files.length; index += 1) {
        const job = jobs[index];
        if (!job) continue;
        const card = document.getElementById(`card-${index}`);
        const badge = card?.querySelector('.status-badge');
        if (badge) badge.textContent = '⏳';
        options.setStatus(format(text.processing, {
          current: index + 1,
          total: files.length,
          name: files[index].name,
        }));
        options.onProgress?.(index, files.length);

        try {
          const source = options.getSourceFile(files[index]);
          let foreground = source;
          if (job.aiRequested && job.transparent !== true) {
            if (job.foregroundBlob && !job.needsReprocess) {
              foreground = job.foregroundBlob;
            } else {
              job.status = 'processing';
              await persistSession();
              const aiResult = await requestAi(job, source);
              foreground = aiResult.blob;
              if (!aiResult.reused) actualAiCalls += 1;
              job.foregroundBlob = foreground;
              job.hadAiResult = true;
              job.needsReprocess = false;
            }
          }

          const output = await options.applyBackground(foreground);
          if (!output) throw new Error(text.failed);
          job.outputBlob = output;
          job.outputName = options.getFileName(files[index].name, index);
          job.status = 'succeeded';
          job.error = null;
          options.onResult?.(index, output);
          if (badge) badge.textContent = '✅';
        } catch (error) {
          errors += 1;
          job.status = 'failed';
          job.error = error.message;
          job.outputBlob = null;
          job.outputName = null;
          if (badge) badge.textContent = '❌';
          if (error.reason === 'free_limit' || error.reason === 'no_credits') {
            stoppedForCredits = true;
            if (options.getCurrentUser()) options.showUpgradeModal();
            else options.showRegisterModal();
            break;
          }
        }
      }

      processing = false;
      const outputs = getOutputs();
      options.onOutputsChanged?.(outputs);
      sync();
      await persistSession();
      options.onComplete?.({
        outputs,
        errors,
        actualAiCalls,
        stoppedForCredits,
        plan,
      });
      return {
        started: true,
        outputs,
        errors,
        actualAiCalls,
        stoppedForCredits,
      };
    }

    async function restoreSession() {
      if (restoring || options.getFiles().length) return { restored: false, count: 0 };
      const ownerKey = sessionOwnerKey();
      let record;
      try {
        await sessionStore.deleteExpired();
        record = await sessionStore.get(ownerKey);
        if (!usableSessionRecord(record, ownerKey)) {
          if (record) await sessionStore.delete(ownerKey);
          return { restored: false, count: 0 };
        }
        restoring = true;
        await options.restoreFiles?.(record.items, record.composition || {});
        const outputs = getOutputs();
        options.onOutputsChanged?.(outputs);
        sync({ notify: true });
        options.onSessionRestored?.({
          count: record.items.length,
          outputs,
          expiresAt: record.expiresAt,
        });
        return { restored: true, count: record.items.length, outputs };
      } catch {
        if (record) await sessionStore.delete(ownerKey).catch(() => {});
        notifyStorage(text.sessionRestoreFailed);
        return { restored: false, count: 0 };
      } finally {
        restoring = false;
        if (record) schedulePersist();
      }
    }

    async function clearSession() {
      clearing = true;
      clearTimeout(persistTimer);
      persistTimer = null;
      try {
        await sessionStore.delete(sessionOwnerKey());
        options.onSessionCleared?.();
        return true;
      } catch {
        clearing = false;
        notifyStorage(text.sessionSaveFailed);
        return false;
      }
    }

    globalToggle.addEventListener('change', () => {
      for (const job of jobs) {
        if (!job || job.transparent === true) continue;
        job.aiRequested = globalToggle.checked;
        job.outputBlob = null;
        job.outputName = null;
      }
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
      schedulePersist();
    });

    clearSessionButton?.addEventListener('click', async () => {
      if (!window.confirm(text.clearSessionConfirm)) return;
      const cleared = await clearSession();
      if (cleared) window.location.reload();
    });

    sync();
    return {
      register,
      markSourceChanged,
      markCompositionChanged,
      getOutputs,
      getPlan: () => planJobs(options.getFiles().map((_, index) => jobs[index])),
      process,
      restoreSession,
      clearSession,
      persistSession,
    };
  }

  globalThis.ShopBGAiWorkflow = {
    create,
    applyTransparencyResult,
    format,
    hasMeaningfulTransparency,
    isPng,
    planJobs,
    resetJobForSource,
    fetchAiResult,
    buildSessionRecord,
    sessionByteSize,
    storedJobState,
    usableSessionRecord,
    SESSION_MAX_BYTES,
    SESSION_SCHEMA_VERSION,
    SESSION_TTL_MS,
    TASK_PROCESSING_MAX_POLLS,
    TASK_PROCESSING_POLL_DELAY_MS,
    TRANSPARENCY_DETECTOR_VERSION,
  };
})();
