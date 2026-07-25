(function () {
  const DEFAULT_TASK_ID = () => crypto.randomUUID();

  function format(template, values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    ));
  }

  function hasTransparentPixel(data, threshold = 250) {
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < threshold) return true;
    }
    return false;
  }

  function isPng(file) {
    return file?.type === 'image/png' || /\.png$/i.test(file?.name || '');
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
    job.sourceVersion += 1;
    job.taskId = taskId;
    job.foregroundBlob = null;
    job.outputBlob = null;
    job.outputName = null;
    job.needsReprocess = hadAiResult;
    job.status = 'checking';
    job.error = null;
    return job;
  }

  function create(options) {
    const panel = document.getElementById('aiWorkflowPanel');
    const globalToggle = document.getElementById('aiRemoveToggle');
    const estimate = document.getElementById('aiEstimate');
    if (!panel || !globalToggle || !estimate) {
      throw new Error('AI workflow controls are missing');
    }

    const text = panel.dataset;
    const jobs = [];
    let processing = false;

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
        return hasTransparentPixel(context.getImageData(0, 0, width, height).data);
      } finally {
        bitmap.close?.();
      }
    }

    async function refreshTransparency(job, source) {
      const detectionToken = Symbol('transparency');
      job.detectionToken = detectionToken;
      job.status = 'checking';
      syncCard(job);
      try {
        const transparent = await detectTransparency(source);
        if (job.detectionToken !== detectionToken) return;
        job.transparent = transparent;
        if (transparent) job.aiRequested = false;
        job.status = 'ready';
      } catch {
        if (job.detectionToken !== detectionToken) return;
        job.transparent = false;
        job.status = 'ready';
      }
      sync({ notify: true });
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
      });

      job.control = { wrapper, input, state };
    }

    function register(file, index, card) {
      if (jobs[index]) return jobs[index];
      const job = {
        file,
        index,
        taskId: DEFAULT_TASK_ID(),
        sourceVersion: 0,
        aiRequested: globalToggle.checked,
        transparent: null,
        foregroundBlob: null,
        outputBlob: null,
        outputName: null,
        hadAiResult: false,
        needsReprocess: false,
        status: 'checking',
        error: null,
      };
      jobs[index] = job;
      createCardControl(job, card);
      sync({ notify: true });
      refreshTransparency(job, file);
      return job;
    }

    function markSourceChanged(index) {
      const job = jobs[index];
      if (!job) return;
      resetJobForSource(job);
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
      refreshTransparency(job, options.getSourceFile(job.file));
    }

    function markCompositionChanged() {
      for (const job of jobs) {
        if (!job) continue;
        job.outputBlob = null;
        job.outputName = null;
      }
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
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
      const response = await fetch(`${options.api}/api/remove-bg`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-ID': options.deviceId,
        },
        body: JSON.stringify({
          image_url: dataUrl,
          task_id: job.taskId,
        }),
      });
      if (response.ok) return response.blob();
      const detail = await response.json().catch(() => ({}));
      const error = new Error(detail.message || detail.error || text.failed);
      error.reason = detail.reason;
      throw error;
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
              foreground = await requestAi(job, source);
              actualAiCalls += 1;
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

    globalToggle.addEventListener('change', () => {
      for (const job of jobs) {
        if (!job || job.transparent === true) continue;
        job.aiRequested = globalToggle.checked;
        job.outputBlob = null;
        job.outputName = null;
      }
      options.onOutputsChanged?.(getOutputs());
      sync({ notify: true });
    });

    sync();
    return {
      register,
      markSourceChanged,
      markCompositionChanged,
      getOutputs,
      getPlan: () => planJobs(options.getFiles().map((_, index) => jobs[index])),
      process,
    };
  }

  globalThis.ShopBGAiWorkflow = {
    create,
    format,
    hasTransparentPixel,
    isPng,
    planJobs,
    resetJobForSource,
  };
})();
