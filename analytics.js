(() => {
  'use strict';

  if (window.ShopBGAnalytics) return;

  const disabled = navigator.globalPrivacyControl === true
    || navigator.doNotTrack === '1';
  const API = 'https://api.shopbgremover.com';
  const queue = [];
  let flushTimer = null;
  let lastGenericDownloadAt = 0;

  function randomId() {
    return crypto.randomUUID();
  }

  function storageId(storage, key) {
    try {
      let value = storage.getItem(key);
      if (!value) {
        value = randomId();
        storage.setItem(key, value);
      }
      return value;
    } catch {
      return randomId();
    }
  }

  const visitorId = disabled
    ? ''
    : storageId(localStorage, 'sbgrDeviceId');
  const sessionId = disabled
    ? ''
    : storageId(sessionStorage, 'sbgrAnalyticsSessionId');
  const params = new URLSearchParams(location.search);

  function clean(value, maxLength) {
    return String(value == null ? '' : value).slice(0, maxLength);
  }

  function pageGroup() {
    const parts = location.pathname
      .replace(/\.html$/i, '')
      .split('/')
      .filter(Boolean);
    if (['de', 'es', 'fr', 'pt-br', 'zh-cn'].includes(parts[0])) parts.shift();
    return clean(parts.join('/') || 'home', 80);
  }

  function sourceName() {
    const utm = params.get('utm_source');
    if (utm) return clean(utm.toLowerCase(), 120);
    if (!document.referrer) return 'direct';
    try {
      const referrer = new URL(document.referrer);
      if (referrer.hostname === location.hostname) return 'internal';
      return clean(referrer.hostname.replace(/^www\./, '').toLowerCase(), 120);
    } catch {
      return 'unknown';
    }
  }

  function sessionAttribute(key, fallback) {
    try {
      let value = sessionStorage.getItem(key);
      if (!value) {
        value = fallback;
        sessionStorage.setItem(key, value);
      }
      return value;
    } catch {
      return fallback;
    }
  }

  function deviceType() {
    const width = Math.max(screen.width || 0, window.innerWidth || 0);
    if (width <= 767) return 'mobile';
    if (width <= 1100) return 'tablet';
    return 'desktop';
  }

  function sizeBucket(totalBytes) {
    if (totalBytes < 500000) return '<500KB';
    if (totalBytes < 2000000) return '500KB-2MB';
    if (totalBytes < 5000000) return '2-5MB';
    if (totalBytes < 10000000) return '5-10MB';
    return '10MB+';
  }

  const source = disabled
    ? ''
    : sessionAttribute('sbgrAnalyticsSource', sourceName());
  const campaign = disabled
    ? ''
    : sessionAttribute(
      'sbgrAnalyticsCampaign',
      clean((params.get('utm_campaign') || '').toLowerCase(), 80),
    );

  function eventRecord(eventName, properties = {}) {
    const record = {
      event_id: randomId(),
      event_name: clean(eventName, 40),
      tool_id: clean(properties.tool_id || '', 24),
      page_group: pageGroup(),
      device_type: deviceType(),
      language: clean(document.documentElement.lang || navigator.language || '', 16),
      source,
      campaign,
    };
    for (const key of [
      'file_count',
      'size_bucket',
      'duration_ms',
      'status_code',
      'error_code',
    ]) {
      if (properties[key] !== undefined && properties[key] !== null) {
        record[key] = properties[key];
      }
    }
    return record;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(flush, 1200);
  }

  function track(eventName, properties = {}) {
    if (disabled) return;
    queue.push(eventRecord(eventName, properties));
    if (queue.length >= 10) flush();
    else scheduleFlush();
  }

  function flush() {
    if (disabled || !queue.length) return;
    window.clearTimeout(flushTimer);
    flushTimer = null;
    const events = queue.splice(0, 20);
    fetch(`${API}/api/analytics/events`, {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': visitorId,
      },
      body: JSON.stringify({
        visitor_id: visitorId,
        session_id: sessionId,
        events,
      }),
    }).catch(() => {
      // Product analytics must never interrupt image processing or downloads.
    });
  }

  window.ShopBGAnalytics = {
    disabled,
    track,
    flush,
  };

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (
      input?.id !== 'fileInput'
      || input.type !== 'file'
      || !input.files?.length
    ) return;
    const totalBytes = Array.from(input.files)
      .reduce((total, file) => total + Number(file.size || 0), 0);
    track('file_selected', {
      tool_id: 'workspace',
      file_count: Math.min(input.files.length, 50),
      size_bucket: sizeBucket(totalBytes),
    });
  }, true);

  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.(
      '#downloadBtn, #processBtn.action-btn-download',
    );
    if (!target) return;
    const now = Date.now();
    if (now - lastGenericDownloadAt < 1000) return;
    lastGenericDownloadAt = now;
    track('result_downloaded', { tool_id: 'zip' });
    flush();
  }, true);

  track('page_view');
  if (pageGroup() === 'home') {
    track('workspace_view', { tool_id: 'workspace' });
  }
  if (pageGroup() === 'pricing') {
    track('pricing_view', { tool_id: 'pricing' });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
})();
