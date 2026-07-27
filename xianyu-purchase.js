(() => {
  const API = 'https://api.shopbgremover.com';
  const entries = Array.from(document.querySelectorAll('[data-xianyu-purchase]'));
  if (!entries.length) return;

  for (const entry of entries) {
    entry.hidden = true;
    entry.removeAttribute('href');
  }

  const requested = new URLSearchParams(location.search).get('lang');
  const pageLanguage = String(document.documentElement.lang || '').toLowerCase();
  const isSimplifiedChinese = requested === 'zh-cn' || pageLanguage === 'zh-cn';
  if (!isSimplifiedChinese) return;

  fetch(`${API}/api/public/xianyu-purchase`, {
    credentials: 'omit',
    cache: 'no-store',
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      return data;
    })
    .then((data) => {
      if (!data.enabled || !data.links) return;
      let visibleCount = 0;
      for (const entry of entries) {
        const credits = entry.dataset.xianyuCredits || 'default';
        const href = data.links[credits] || data.links.default;
        if (!href) continue;
        entry.href = href;
        entry.target = '_blank';
        entry.rel = 'noopener noreferrer';
        entry.hidden = false;
        visibleCount += 1;
      }
      if (visibleCount) document.body.classList.add('xianyu-purchase-visible');
    })
    .catch(() => {
      // A missing or invalid public configuration must fail closed.
    });
})();
