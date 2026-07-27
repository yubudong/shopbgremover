(() => {
  'use strict';

  const MAX_FOLDER_LENGTH = 64;
  const MAX_FILE_LENGTH = 120;
  const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

  function cleanPathPart(value, maxLength) {
    const normalized = String(value || '')
      .normalize('NFKC')
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/-+/g, '-')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, maxLength)
      .trim()
      .replace(/[. ]+$/g, '');
    if (!normalized || /^[.\-\s]+$/.test(normalized)) return '';
    return WINDOWS_RESERVED.test(normalized) ? `_${normalized}` : normalized;
  }

  function sanitizeProductFolder(value) {
    return cleanPathPart(value, MAX_FOLDER_LENGTH);
  }

  function sanitizeArchiveFileName(value) {
    const leaf = String(value || '').split(/[\\/]/).pop();
    return cleanPathPart(leaf, MAX_FILE_LENGTH) || 'image.png';
  }

  function addCollisionSuffix(fileName, number) {
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0) return `${fileName}-${number}`;
    return `${fileName.slice(0, dot)}-${number}${fileName.slice(dot)}`;
  }

  function buildArchiveEntries(outputs, productFolders = []) {
    const usedPaths = new Set();
    return outputs.map((output, outputIndex) => {
      const sourceIndex = Number.isInteger(output.index) ? output.index : outputIndex;
      const folder = sanitizeProductFolder(productFolders[sourceIndex]);
      const fileName = sanitizeArchiveFileName(output.name);
      let candidate = folder ? `${folder}/${fileName}` : fileName;
      let collisionNumber = 2;
      while (usedPaths.has(candidate.toLocaleLowerCase('en-US'))) {
        const uniqueName = addCollisionSuffix(fileName, collisionNumber);
        candidate = folder ? `${folder}/${uniqueName}` : uniqueName;
        collisionNumber += 1;
      }
      usedPaths.add(candidate.toLocaleLowerCase('en-US'));
      return { ...output, name: candidate };
    });
  }

  function create(options = {}) {
    const panel = document.getElementById('productOrganizerPanel');
    const openButton = document.getElementById('productOrganizerOpen');
    const summary = document.getElementById('productOrganizerSummary');
    if (!panel || !openButton || !summary) {
      throw new Error('Product organizer controls are missing');
    }

    const text = panel.dataset;
    const files = [];
    let productFolders = [];
    let overlay = null;
    let rows = null;
    let persistTimer = null;

    function groupedCount() {
      return files.reduce(
        (count, _, index) => count + (sanitizeProductFolder(productFolders[index]) ? 1 : 0),
        0,
      );
    }

    function renderSummary() {
      const count = groupedCount();
      summary.textContent = count
        ? window.ShopBGAiWorkflow.format(text.summaryGrouped, { count, total: files.length })
        : text.summaryEmpty;
      openButton.disabled = files.length === 0;
    }

    function schedulePersist() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        persistTimer = null;
        options.onChanged?.();
      }, 250);
    }

    function updatePreview(input, preview) {
      const folder = sanitizeProductFolder(input.value);
      preview.textContent = folder ? `${folder}/` : text.rootPreview;
    }

    function renderRows() {
      if (!rows) return;
      rows.replaceChildren();
      files.forEach((file, index) => {
        if (!file) return;
        const row = document.createElement('label');
        row.className = 'product-organizer-row';

        const name = document.createElement('span');
        name.className = 'product-organizer-file';
        name.textContent = file.name;

        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 80;
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.placeholder = text.inputPlaceholder;
        input.value = productFolders[index] || '';
        input.setAttribute('aria-label', window.ShopBGAiWorkflow.format(text.inputAria, {
          name: file.name,
        }));

        const preview = document.createElement('small');
        preview.className = 'product-organizer-preview';
        updatePreview(input, preview);

        input.addEventListener('input', () => {
          productFolders[index] = input.value;
          updatePreview(input, preview);
          renderSummary();
          schedulePersist();
        });
        input.addEventListener('change', () => {
          productFolders[index] = input.value.trim();
          input.value = productFolders[index];
          updatePreview(input, preview);
          renderSummary();
          options.onStatus?.(text.savedStatus);
          schedulePersist();
        });

        row.append(name, input, preview);
        rows.append(row);
      });
    }

    function close() {
      overlay?.classList.remove('visible');
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
        options.onChanged?.();
      }
      openButton.focus();
    }

    function ensureDialog() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.className = 'product-organizer-overlay';
      overlay.setAttribute('role', 'presentation');

      const dialog = document.createElement('section');
      dialog.className = 'product-organizer-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-labelledby', 'productOrganizerTitle');

      const head = document.createElement('header');
      head.className = 'product-organizer-head';
      const copy = document.createElement('div');
      const title = document.createElement('strong');
      title.id = 'productOrganizerTitle';
      title.textContent = text.dialogTitle;
      const subtitle = document.createElement('small');
      subtitle.textContent = text.dialogSubtitle;
      copy.append(title, subtitle);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'product-organizer-close';
      closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', text.closeLabel);
      closeButton.addEventListener('click', close);
      head.append(copy, closeButton);

      rows = document.createElement('div');
      rows.className = 'product-organizer-rows';

      const actions = document.createElement('footer');
      actions.className = 'product-organizer-actions';
      const clearButton = document.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'product-organizer-clear';
      clearButton.textContent = text.clearLabel;
      clearButton.addEventListener('click', () => {
        productFolders = files.map(() => '');
        renderRows();
        renderSummary();
        options.onStatus?.(text.clearedStatus);
        schedulePersist();
      });
      const doneButton = document.createElement('button');
      doneButton.type = 'button';
      doneButton.className = 'product-organizer-done';
      doneButton.textContent = text.doneLabel;
      doneButton.addEventListener('click', close);
      actions.append(clearButton, doneButton);

      dialog.append(head, rows, actions);
      overlay.append(dialog);
      overlay.addEventListener('click', event => {
        if (event.target === overlay) close();
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('visible')) close();
      });
      document.body.append(overlay);
    }

    function open() {
      if (!files.length) return;
      ensureDialog();
      renderRows();
      overlay.classList.add('visible');
      rows.querySelector('input')?.focus();
    }

    function restore(values) {
      productFolders = Array.isArray(values)
        ? values.map(value => String(value || '').slice(0, 80))
        : [];
      renderSummary();
    }

    function register(file, index) {
      files[index] = file;
      if (typeof productFolders[index] !== 'string') productFolders[index] = '';
      renderSummary();
    }

    function remove(index) {
      if (!Number.isInteger(index) || index < 0 || index >= files.length) return false;
      files.splice(index, 1);
      productFolders.splice(index, 1);
      renderSummary();
      return true;
    }

    function getState() {
      return productFolders.slice(0, files.length);
    }

    function buildEntries(outputs) {
      return buildArchiveEntries(outputs, productFolders);
    }

    openButton.addEventListener('click', open);
    renderSummary();

    return {
      register,
      remove,
      restore,
      getState,
      buildEntries,
      open,
    };
  }

  globalThis.ShopBGProductOrganizer = {
    create,
    buildArchiveEntries,
    sanitizeArchiveFileName,
    sanitizeProductFolder,
  };
})();
