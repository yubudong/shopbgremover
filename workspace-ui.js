(() => {
  'use strict';

  const uploadCopy = {
    en: 'Choose images',
    de: 'Bilder auswählen',
    es: 'Elegir imágenes',
    fr: 'Choisir des images',
    'pt-br': 'Escolher imagens',
    'zh-cn': '选择图片',
  };

  function locale() {
    const language = String(document.documentElement.lang || 'en').toLowerCase();
    if (language.startsWith('zh')) return 'zh-cn';
    if (language.startsWith('pt')) return 'pt-br';
    if (language.startsWith('de')) return 'de';
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('fr')) return 'fr';
    return 'en';
  }

  function enhanceUpload() {
    const upload = document.getElementById('uploadArea');
    if (!upload || upload.querySelector('.workspace-upload-cta')) return;
    const callToAction = document.createElement('span');
    callToAction.className = 'workspace-upload-cta';
    callToAction.setAttribute('aria-hidden', 'true');
    callToAction.textContent = uploadCopy[locale()];
    const description = upload.querySelector(':scope > p');
    if (description) description.after(callToAction);
  }

  function isInitiallyOpen(group) {
    return Boolean(
      group.querySelector('.background-mode-grid')
      || group.querySelector('.size-grid'),
    );
  }

  function enhanceSettingGroup(group, index) {
    if (group.id === 'historySection' || group.classList.contains('workspace-section')) return;
    const label = group.querySelector(':scope > .setting-label');
    if (!label) return;

    const sectionId = `workspaceSection${index}`;
    const toggle = document.createElement('button');
    toggle.className = 'workspace-section-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-controls', sectionId);

    const title = document.createElement('span');
    title.textContent = label.textContent.trim();
    const caret = document.createElement('span');
    caret.className = 'workspace-section-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '⌄';
    toggle.append(title, caret);

    const body = document.createElement('div');
    body.className = 'workspace-section-body';
    body.id = sectionId;
    for (const child of [...group.children]) {
      if (child !== label) body.append(child);
    }
    label.remove();
    group.append(toggle, body);
    group.classList.add('workspace-section');

    const setOpen = (open) => {
      group.classList.toggle('collapsed', !open);
      toggle.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    };
    setOpen(isInitiallyOpen(group));
    toggle.addEventListener('click', () => {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
  }

  function enhanceSettings() {
    const panel = document.querySelector('.settings-panel');
    if (!panel) return;
    [...panel.querySelectorAll(':scope > .setting-group')]
      .forEach(enhanceSettingGroup);
  }

  function watchWorkspaceState() {
    const grid = document.getElementById('imageGrid');
    if (!grid) return;
    const update = () => {
      const hasImages = grid.childElementCount > 0;
      document.body.classList.toggle('workspace-has-images', hasImages);
      document.body.classList.toggle('workspace-empty', !hasImages);
    };
    update();
    new MutationObserver(update).observe(grid, { childList: true });
  }

  function init() {
    document.body.classList.add('workspace-ui-ready');
    enhanceUpload();
    enhanceSettings();
    watchWorkspaceState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
