(() => {
  'use strict';

  const API = 'https://api.shopbgremover.com';
  const $ = (id) => document.getElementById(id);
  const notice = $('notice');
  const range = $('analyticsRange');
  const refresh = $('refreshAnalytics');
  const INPAINT_STATE_KEY = 'shopbg-admin-inpaint-validation-v1';
  const toolNames = {
    inpaint: 'AI 去物体 / 水印',
    remove_bg: 'AI 去背景',
    compose: '背景合成与尺寸调整',
    zip: 'ZIP 批量导出',
  };
  const countryNames = {
    CN: '中国', US: '美国', GB: '英国', DE: '德国', FR: '法国',
    CA: '加拿大', AU: '澳大利亚', JP: '日本', KR: '韩国',
    SG: '新加坡', HK: '中国香港', TW: '中国台湾', IN: '印度',
    BR: '巴西', NL: '荷兰', ES: '西班牙', IT: '意大利',
  };
  const languageNames = {
    en: '英语', de: '德语', es: '西班牙语', fr: '法语',
    'pt-br': '巴西葡萄牙语', 'pt-BR': '巴西葡萄牙语',
    'zh-cn': '简体中文', 'zh-CN': '简体中文',
  };

  function number(value) {
    return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
  }

  function duration(milliseconds) {
    const value = Number(milliseconds || 0);
    if (!value) return '—';
    if (value < 1000) return `${Math.round(value)}ms`;
    if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}秒`;
    return `${(value / 60000).toFixed(1)}分钟`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showNotice(message, error = false) {
    notice.textContent = message;
    notice.classList.remove('hidden');
    notice.classList.toggle('error', error);
  }

  function hideNotice() {
    notice.classList.add('hidden');
    notice.classList.remove('error');
  }

  function cell(row, value, className = '') {
    const td = document.createElement('td');
    td.textContent = value;
    if (className) td.className = className;
    row.append(td);
  }

  function formatTime(value) {
    return value
      ? new Date(Number(value) * 1000).toLocaleString('zh-CN')
      : '—';
  }

  function shortId(value) {
    const text = String(value || '');
    return text.length > 22 ? `${text.slice(0, 11)}…${text.slice(-7)}` : text || '—';
  }

  function renderOrders(orders) {
    const body = $('orderRows');
    body.replaceChildren();
    for (const order of orders) {
      const row = document.createElement('tr');
      cell(row, formatTime(order.completed_at || order.created_at));
      cell(row, order.email);
      cell(row, order.payment_method);
      cell(row, `${order.currency} ${Number(order.amount || 0).toFixed(2)}`);
      cell(row, String(Number(order.base_credits || 0) + Number(order.bonus_credits || 0)));
      cell(row, order.refunded_at ? 'refunded' : order.status);
      cell(row, shortId(order.id), 'mono');
      body.append(row);
    }
  }

  function renderLedger(entries) {
    const body = $('ledgerRows');
    body.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('tr');
      cell(row, formatTime(entry.created_at));
      cell(row, entry.email);
      cell(
        row,
        `${Number(entry.delta) > 0 ? '+' : ''}${entry.delta}`,
        Number(entry.delta) > 0 ? 'positive' : 'negative',
      );
      cell(row, entry.balance_type);
      cell(row, entry.reason);
      cell(row, shortId(entry.order_id), 'mono');
      body.append(row);
    }
  }

  function renderBilling(data) {
    const fields = {
      users: data.totals.users,
      activeCredits: data.totals.active_credits,
      totalUsed: data.totals.total_used,
      completedOrders: data.totals.completed_orders,
      pendingOrders: data.totals.pending_orders,
      redeemedVouchers: data.totals.redeemed_vouchers,
      pendingReviews: data.totals.pending_referral_reviews,
      pendingHolds: data.totals.pending_reward_holds,
    };
    for (const [id, value] of Object.entries(fields)) $(id).textContent = number(value);
    renderOrders(data.recent_orders || []);
    renderLedger(data.recent_ledger || []);
  }

  function chartPoints(values, width, height, maxValue) {
    const usableWidth = width - 58;
    const usableHeight = height - 42;
    return values.map((value, index) => {
      const x = 44 + (
        values.length === 1
          ? usableWidth / 2
          : index / (values.length - 1) * usableWidth
      );
      const y = 9 + usableHeight - (Number(value || 0) / maxValue * usableHeight);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function renderTrend(rows) {
    const target = $('trendChart');
    if (!rows?.some((row) => row.visitors || row.selected || row.starts || row.downloads)) {
      target.innerHTML = '<div class="empty">行为数据会从运营统计启用后开始积累</div>';
      return;
    }
    const width = 760;
    const height = 245;
    const maxValue = Math.max(1, ...rows.flatMap(
      (row) => [row.visitors, row.selected, row.starts, row.downloads],
    ));
    const line = (key, color) => (
      `<polyline points="${chartPoints(rows.map((row) => row[key]), width, height, maxValue)}" `
      + `class="chart-line" stroke="${color}"/>`
    );
    const every = Math.max(1, Math.ceil(rows.length / 6));
    const labels = rows.map((row, index) => {
      if (index % every !== 0 && index !== rows.length - 1) return '';
      const x = 44 + (
        rows.length === 1
          ? (width - 58) / 2
          : index / (rows.length - 1) * (width - 58)
      );
      return `<text x="${x.toFixed(1)}" y="239" text-anchor="middle" class="chart-label">${escapeHtml(row.day.slice(5))}</text>`;
    }).join('');
    const grid = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const y = 9 + (height - 42) * ratio;
      const value = Math.round(maxValue * (1 - ratio));
      return `<line x1="44" x2="746" y1="${y}" y2="${y}" class="chart-grid"/>`
        + `<text x="36" y="${y + 3}" text-anchor="end" class="chart-label">${value}</text>`;
    }).join('');
    target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="访客、上传、开始和下载趋势">`
      + grid
      + line('visitors', '#2563eb')
      + line('selected', '#0891b2')
      + line('starts', '#7c3aed')
      + line('downloads', '#059669')
      + labels
      + '</svg>';
  }

  function renderFunnel(funnel) {
    const steps = [
      ['进入网站', funnel.opened],
      ['选择产品图', funnel.selected],
      ['开始处理', funnel.started],
      ['得到处理结果', funnel.completed],
      ['下载结果', funnel.downloaded],
    ];
    const maximum = Math.max(1, ...steps.map((step) => Number(step[1] || 0)));
    $('funnelChart').innerHTML = steps.map(([label, value]) => (
      `<div class="funnel-row"><div class="funnel-copy"><span>${escapeHtml(label)}</span><strong>${number(value)}</strong></div>`
      + `<div class="funnel-track"><div class="funnel-fill" style="width:${(Number(value || 0) / maximum * 100).toFixed(1)}%"></div></div></div>`
    )).join('');
  }

  function renderTools(tools) {
    const body = $('toolsTable');
    if (!tools?.length) {
      body.innerHTML = '<tr><td colspan="8"><div class="empty">暂无工具使用行为数据</div></td></tr>';
      return;
    }
    body.innerHTML = tools.map((tool) => (
      `<tr><td><span class="tool-name">${escapeHtml(toolNames[tool.tool_id] || tool.tool_id)}</span></td>`
      + `<td>${number(tool.opens)}</td><td>${number(tool.starts)}</td>`
      + `<td>${number(tool.completed)}</td><td>${number(tool.downloads)}</td>`
      + `<td><span class="rate-chip">${Number(tool.download_rate || 0).toFixed(1)}%</span></td>`
      + `<td>${number(tool.failures)}</td><td>${duration(tool.avg_duration_ms)}</td></tr>`
    )).join('');
  }

  function renderService(prefix, service) {
    $(`${prefix}Started`).textContent = number(service.started);
    $(`${prefix}Success`).textContent = `${Number(service.success_rate || 0).toFixed(1)}%`;
    $(`${prefix}Average`).textContent = duration(service.avg_duration_ms);
    $(`${prefix}P95`).textContent = duration(service.p95_duration_ms);
    $(`${prefix}Active`).textContent = prefix === 'inpaint'
      ? `${number(service.queued)} / ${number(service.processing)}`
      : number(service.processing);
    $(`${prefix}Failed`).textContent = number(service.failed);
  }

  function renderRanks(id, rows, formatter) {
    const target = $(id);
    if (!rows?.length) {
      target.innerHTML = '<div class="empty">暂无数据</div>';
      return;
    }
    const maximum = Math.max(1, ...rows.map((row) => Number(row.sessions || 0)));
    target.innerHTML = rows.map((row) => {
      const label = formatter ? formatter(row.label) : row.label;
      return `<div class="rank-item"><div class="rank-copy"><strong title="${escapeHtml(label)}">${escapeHtml(label)}</strong><span>${number(row.sessions)}</span></div>`
        + `<div class="rank-track"><div class="rank-fill" style="width:${(Number(row.sessions || 0) / maximum * 100).toFixed(1)}%"></div></div></div>`;
    }).join('');
  }

  function renderErrors(errors) {
    if (!errors?.length) {
      $('errorsList').innerHTML = '<div class="empty">当前统计周期内没有服务器处理错误</div>';
      return;
    }
    $('errorsList').innerHTML = errors.map((item) => (
      `<div class="error-item"><span>${escapeHtml(toolNames[item.tool_id] || item.tool_id)} · ${escapeHtml(item.error)}</span>`
      + `<strong>${number(item.count)} 次</strong></div>`
    )).join('');
  }

  function renderAnalytics(data) {
    const summary = data.summary || {};
    $('metricVisitors').textContent = number(summary.visitors);
    $('metricSessions').textContent = `${number(summary.sessions)} 次访问会话`;
    $('metricSelected').textContent = number(summary.selected);
    $('metricStarts').textContent = number(summary.starts);
    $('metricDownloads').textContent = number(summary.downloads);
    $('metricDownloadRate').textContent = `${Number(summary.download_rate || 0).toFixed(1)}% 下载转化率`;
    renderTrend(data.trend || []);
    renderFunnel(data.funnel || {});
    renderTools(data.tools || []);
    renderService('inpaint', data.service?.inpaint || {});
    renderService('removeBg', data.service?.remove_bg || {});
    renderRanks('sourcesList', data.sources || [], (value) => (
      { direct: '直接访问', internal: '站内跳转', unknown: '未知' }[value] || value
    ));
    renderRanks('devicesList', data.devices || [], (value) => (
      { desktop: '电脑', tablet: '平板', mobile: '手机' }[value] || value
    ));
    renderRanks('countriesList', data.countries || [], (value) => countryNames[value] || value);
    renderRanks('languagesList', data.languages || [], (value) => languageNames[value] || value);
    renderErrors(data.errors || []);
    const commerce = data.commerce || {};
    $('commercePricing').textContent = number(commerce.pricing_views);
    $('commercePaypalOrders').textContent = number(commerce.paypal_orders);
    $('commercePaypalCompleted').textContent = number(commerce.paypal_completed);
    $('commerceXianyuClicks').textContent = number(commerce.xianyu_clicks);
    $('commerceVouchers').textContent = number(commerce.vouchers_redeemed);

    const modeLabels = {
      off: '采集已关闭',
      admin_only: '仅管理员验证',
      public: '公开采集中',
    };
    const mode = data.mode || 'off';
    $('analyticsMode').textContent = modeLabels[mode] || mode;
    $('analyticsMode').className = `status-pill ${mode === 'public' ? 'public' : mode === 'off' ? 'off' : ''}`;
    const updated = new Date(Number(data.generated_at || 0) * 1000);
    const started = data.data_started_at
      ? ` · 行为数据始于 ${new Date(Number(data.data_started_at) * 1000).toLocaleString('zh-CN')}`
      : ' · 行为数据尚未开始积累';
    $('authStatus').textContent = `管理员：${data.admin.email} · 更新于 ${updated.toLocaleString('zh-CN')} · 保留 ${number(data.retention_days)} 天${started}`;
  }

  async function api(path, init = {}) {
    const response = await fetch(`${API}${path}`, {
      credentials: 'include',
      cache: 'no-store',
      ...init,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? '当前账号没有管理员权限。'
          : data.error || `HTTP ${response.status}`,
      );
    }
    return data;
  }

  async function loadBilling() {
    const data = await api('/api/admin/overview');
    renderBilling(data);
    return data;
  }

  async function loadAnalytics() {
    refresh.disabled = true;
    refresh.textContent = '刷新中…';
    try {
      const data = await api(`/api/admin/analytics?days=${encodeURIComponent(range.value)}`);
      renderAnalytics(data);
    } catch (error) {
      showNotice(`运营数据暂时无法读取：${error.message}`, true);
    } finally {
      refresh.disabled = false;
      refresh.textContent = '刷新';
    }
  }

  const viewMeta = {
    operations: ['SHOPBGREMOVER ANALYTICS', '网站运营概览'],
    billing: ['ACCOUNT & BILLING', '积分与订单总览'],
    validation: ['LAMA VALIDATION', 'AI 精细去水印验收'],
  };

  function requestedView() {
    const hash = location.hash.slice(1);
    if (hash === 'billing') return 'billing';
    if (hash === 'validation') return 'validation';
    return 'operations';
  }

  function showView() {
    const view = requestedView();
    document.querySelectorAll('.admin-view').forEach((section) => {
      section.hidden = section.dataset.view !== view;
    });
    document.querySelectorAll('[data-admin-view]').forEach((link) => {
      const active = link.dataset.adminView === view
        && (
          view !== 'operations'
          || link.getAttribute('href') === location.hash
          || (!location.hash && link.getAttribute('href') === '#operations')
        );
      link.classList.toggle('active', active);
    });
    const [eyebrow, title] = viewMeta[view];
    $('pageEyebrow').textContent = eyebrow;
    $('pageTitle').textContent = title;
    $('analyticsActions').classList.toggle('hidden', view !== 'operations');
    if (view === 'operations' && ['#tools', '#service', '#acquisition'].includes(location.hash)) {
      requestAnimationFrame(() => {
        document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  }

  range.addEventListener('change', loadAnalytics);
  refresh.addEventListener('click', loadAnalytics);
  window.addEventListener('hashchange', showView);

  const inpaintImage = $('inpaintImage');
  const inpaintMask = $('inpaintMask');
  const inpaintStart = $('inpaintStart');
  const inpaintCancel = $('inpaintCancel');
  const inpaintStatus = $('inpaintStatus');
  const inpaintResult = $('inpaintResult');
  const inpaintPreview = $('inpaintPreview');
  const inpaintDownload = $('inpaintDownload');
  const inpaintAcknowledge = $('inpaintAcknowledge');
  let activeInpaint = null;
  let resultObjectUrl = null;

  function inpaintMessage(message, error = false) {
    inpaintStatus.textContent = message;
    inpaintStatus.classList.toggle('error', error);
  }

  function updateInpaintStart() {
    inpaintStart.disabled = !(inpaintImage.files[0] && inpaintMask.files[0])
      || Boolean(activeInpaint);
  }

  function storeInpaintState(state) {
    activeInpaint = state;
    if (state) localStorage.setItem(INPAINT_STATE_KEY, JSON.stringify(state));
    else localStorage.removeItem(INPAINT_STATE_KEY);
    inpaintCancel.disabled = !state;
    updateInpaintStart();
  }

  function clearInpaintResult() {
    if (resultObjectUrl) URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = null;
    inpaintPreview.removeAttribute('src');
    inpaintDownload.removeAttribute('href');
    inpaintResult.classList.remove('visible');
  }

  async function showInpaintResult(taskId) {
    const response = await fetch(
      `${API}/api/inpaint/tasks/${encodeURIComponent(taskId)}/result`,
      { credentials: 'include', cache: 'no-store' },
    );
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    clearInpaintResult();
    resultObjectUrl = URL.createObjectURL(await response.blob());
    inpaintPreview.src = resultObjectUrl;
    inpaintDownload.href = resultObjectUrl;
    inpaintResult.classList.add('visible');
    inpaintCancel.disabled = true;
    inpaintMessage('处理成功。结果已读取，请下载并检查；确认后再清理服务器结果。');
  }

  async function pollInpaint(state) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const data = await api(`/api/inpaint/batches/${encodeURIComponent(state.batchId)}`);
      const task = data.batch.tasks.find((item) => item.id === state.taskId);
      if (!task) throw new Error('任务状态不存在。');
      inpaintMessage(`批次：${data.batch.status}\n任务：${task.status}\n第 ${attempt + 1} 次状态检查`);
      if (task.status === 'succeeded') {
        await showInpaintResult(state.taskId);
        return;
      }
      if (['failed', 'cancelled'].includes(task.status)) {
        throw new Error(`任务${task.status === 'failed' ? '失败' : '已取消'}：${task.error_code || '无详细原因'}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error('处理超时；任务仍保存在服务器，可刷新页面继续查询。');
  }

  async function resumeInpaint() {
    const saved = localStorage.getItem(INPAINT_STATE_KEY);
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      if (!state?.batchId || !state?.taskId) throw new Error('invalid state');
      storeInpaintState(state);
      inpaintMessage('正在恢复上一次管理员验收任务…');
      await pollInpaint(state);
    } catch (error) {
      if (error.message === 'invalid state' || /Batch not found|Task not found/.test(error.message)) {
        storeInpaintState(null);
      }
      inpaintMessage(`恢复失败：${error.message}`, true);
    }
  }

  inpaintImage.addEventListener('change', updateInpaintStart);
  inpaintMask.addEventListener('change', updateInpaintStart);
  inpaintStart.addEventListener('click', async () => {
    const image = inpaintImage.files[0];
    const mask = inpaintMask.files[0];
    if (!image || !mask) return;
    if (image.size > 10 * 1024 * 1024 || mask.size > 10 * 1024 * 1024) {
      inpaintMessage('原图或蒙版超过 10 MB。', true);
      return;
    }
    clearInpaintResult();
    inpaintStart.disabled = true;
    try {
      inpaintMessage('正在创建管理员验收批次…');
      const created = await api('/api/inpaint/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_count: 1,
          client_batch_id: `admin_validation_${Date.now().toString(36)}`,
          mask_spec: { version: 1, source: 'admin_validation', normalized: false },
        }),
      });
      const task = created.batch.tasks[0];
      const state = { batchId: created.batch.id, taskId: task.id };
      storeInpaintState(state);
      inpaintMessage('正在把原图和蒙版上传到私有临时存储…');
      const form = new FormData();
      form.set('image', image, image.name);
      form.set('mask', mask, mask.name);
      form.set('mask_spec_hash', created.batch.mask_spec_hash);
      await api(`/api/inpaint/batches/${encodeURIComponent(state.batchId)}/tasks/0`, {
        method: 'POST',
        body: form,
      });
      inpaintMessage('已进入单图队列，正在等待 LaMa 处理…');
      await pollInpaint(state);
    } catch (error) {
      inpaintMessage(`验收失败：${error.message}`, true);
    } finally {
      updateInpaintStart();
    }
  });

  inpaintCancel.addEventListener('click', async () => {
    if (!activeInpaint) return;
    try {
      const data = await api(`/api/inpaint/batches/${encodeURIComponent(activeInpaint.batchId)}`, {
        method: 'DELETE',
      });
      clearInpaintResult();
      storeInpaintState(null);
      inpaintMessage(`批次已${data.status === 'cancelled' ? '取消' : '结束'}。`);
    } catch (error) {
      inpaintMessage(`取消失败：${error.message}`, true);
    }
  });

  inpaintAcknowledge.addEventListener('click', async () => {
    if (!activeInpaint) return;
    try {
      await api(`/api/inpaint/tasks/${encodeURIComponent(activeInpaint.taskId)}/result`, {
        method: 'DELETE',
      });
      clearInpaintResult();
      storeInpaintState(null);
      inpaintMessage('服务器结果已确认删除，本次验收记录仍保留在 D1 审计表。');
    } catch (error) {
      inpaintMessage(`清理失败：${error.message}`, true);
    }
  });

  async function initialize() {
    showView();
    try {
      const billing = await loadBilling();
      $('authStatus').textContent = `管理员：${billing.admin.email}`;
      hideNotice();
      $('adminApp').classList.add('visible');
      await loadAnalytics();
      resumeInpaint();
    } catch (error) {
      $('authStatus').textContent = '无法打开管理后台';
      showNotice(`${error.message} 请先使用管理员账号登录网站。`, true);
    }
  }

  initialize();
})();
