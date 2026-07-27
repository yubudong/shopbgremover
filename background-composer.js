(function () {
  const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
  const MAX_BACKGROUND_TEMPLATES = 8;
  const MAX_BACKGROUND_TEMPLATE_BYTES = 80 * 1024 * 1024;
  const BACKGROUND_TEMPLATE_DB_NAME = 'shopbgremover-background-templates';
  const BACKGROUND_TEMPLATE_STORE_NAME = 'templates';
  const ACCEPTED_BACKGROUND_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const ACCEPTED_BACKGROUND_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;
  const BACKGROUND_MODES = new Set(['white', 'transparent', 'custom', 'image']);
  const BACKGROUND_FITS = new Set(['cover', 'contain', 'stretch']);
  const PRODUCT_ALIGNMENTS = new Set(['center', 'bottom', 'custom']);
  const OUTPUT_ENCODINGS = Object.freeze({
    png: Object.freeze({ extension: 'png', mime: 'image/png', supportsAlpha: true }),
    jpeg: Object.freeze({ extension: 'jpg', mime: 'image/jpeg', supportsAlpha: false }),
    webp: Object.freeze({ extension: 'webp', mime: 'image/webp', supportsAlpha: true }),
  });
  const BACKGROUND_TEMPLATE_COPY = Object.freeze({
    en: Object.freeze({
      title: 'My background templates',
      note: 'Saved only in this browser until you delete them · Up to 8 templates / 80 MB total',
      upload: 'Upload template',
      save: 'Save current background',
      update: 'Update current template',
      empty: 'No saved templates yet.',
      apply: 'Apply',
      delete: 'Delete',
      confirmDelete: 'Delete now',
      saved: 'Background template “{name}” saved in this browser.',
      updated: 'Background template “{name}” updated.',
      applied: 'Background template “{name}” applied locally.',
      deleted: 'Background template deleted from this browser.',
      unavailable: 'Background templates are unavailable in this browser. Current work is still available.',
      limit: 'You can save up to 8 background templates. Delete one before saving another.',
      totalSize: 'Saved background templates can use up to 80 MB in this browser.',
      storage: 'This browser could not save the background template. Free some storage and try again.',
    }),
    de: Object.freeze({
      title: 'Meine Hintergrundvorlagen',
      note: 'Nur in diesem Browser gespeichert, bis du sie löschst · Bis zu 8 Vorlagen / insgesamt 80 MB',
      upload: 'Vorlage hochladen',
      save: 'Aktuellen Hintergrund speichern',
      update: 'Aktuelle Vorlage aktualisieren',
      empty: 'Noch keine Vorlagen gespeichert.',
      apply: 'Anwenden',
      delete: 'Löschen',
      confirmDelete: 'Jetzt löschen',
      saved: 'Hintergrundvorlage „{name}“ wurde in diesem Browser gespeichert.',
      updated: 'Hintergrundvorlage „{name}“ wurde aktualisiert.',
      applied: 'Hintergrundvorlage „{name}“ wurde lokal angewendet.',
      deleted: 'Hintergrundvorlage wurde aus diesem Browser gelöscht.',
      unavailable: 'Hintergrundvorlagen sind in diesem Browser nicht verfügbar. Die aktuelle Arbeit bleibt erhalten.',
      limit: 'Du kannst bis zu 8 Hintergrundvorlagen speichern. Lösche zuerst eine Vorlage.',
      totalSize: 'Gespeicherte Hintergrundvorlagen können in diesem Browser bis zu 80 MB belegen.',
      storage: 'Der Browser konnte die Hintergrundvorlage nicht speichern. Gib Speicherplatz frei und versuche es erneut.',
    }),
    es: Object.freeze({
      title: 'Mis plantillas de fondo',
      note: 'Guardadas solo en este navegador hasta que las elimines · Hasta 8 plantillas / 80 MB en total',
      upload: 'Subir plantilla',
      save: 'Guardar fondo actual',
      update: 'Actualizar plantilla actual',
      empty: 'Aún no hay plantillas guardadas.',
      apply: 'Aplicar',
      delete: 'Eliminar',
      confirmDelete: 'Eliminar ahora',
      saved: 'La plantilla de fondo «{name}» se guardó en este navegador.',
      updated: 'La plantilla de fondo «{name}» se actualizó.',
      applied: 'La plantilla de fondo «{name}» se aplicó localmente.',
      deleted: 'La plantilla de fondo se eliminó de este navegador.',
      unavailable: 'Las plantillas de fondo no están disponibles en este navegador. El trabajo actual sigue disponible.',
      limit: 'Puedes guardar hasta 8 plantillas de fondo. Elimina una antes de guardar otra.',
      totalSize: 'Las plantillas de fondo guardadas pueden usar hasta 80 MB en este navegador.',
      storage: 'El navegador no pudo guardar la plantilla de fondo. Libera espacio e inténtalo de nuevo.',
    }),
    fr: Object.freeze({
      title: 'Mes modèles d’arrière-plan',
      note: 'Enregistrés uniquement dans ce navigateur jusqu’à leur suppression · Jusqu’à 8 modèles / 80 Mo au total',
      upload: 'Importer un modèle',
      save: 'Enregistrer l’arrière-plan actuel',
      update: 'Mettre à jour le modèle actuel',
      empty: 'Aucun modèle enregistré.',
      apply: 'Appliquer',
      delete: 'Supprimer',
      confirmDelete: 'Supprimer maintenant',
      saved: 'Le modèle d’arrière-plan « {name} » a été enregistré dans ce navigateur.',
      updated: 'Le modèle d’arrière-plan « {name} » a été mis à jour.',
      applied: 'Le modèle d’arrière-plan « {name} » a été appliqué localement.',
      deleted: 'Le modèle d’arrière-plan a été supprimé de ce navigateur.',
      unavailable: 'Les modèles d’arrière-plan ne sont pas disponibles dans ce navigateur. Le travail actuel reste disponible.',
      limit: 'Vous pouvez enregistrer jusqu’à 8 modèles d’arrière-plan. Supprimez-en un avant d’en ajouter un autre.',
      totalSize: 'Les modèles enregistrés peuvent utiliser jusqu’à 80 Mo dans ce navigateur.',
      storage: 'Le navigateur n’a pas pu enregistrer le modèle. Libérez de l’espace puis réessayez.',
    }),
    'pt-br': Object.freeze({
      title: 'Meus modelos de fundo',
      note: 'Salvos apenas neste navegador até você excluí-los · Até 8 modelos / 80 MB no total',
      upload: 'Enviar modelo',
      save: 'Salvar fundo atual',
      update: 'Atualizar modelo atual',
      empty: 'Nenhum modelo salvo ainda.',
      apply: 'Aplicar',
      delete: 'Excluir',
      confirmDelete: 'Excluir agora',
      saved: 'O modelo de fundo “{name}” foi salvo neste navegador.',
      updated: 'O modelo de fundo “{name}” foi atualizado.',
      applied: 'O modelo de fundo “{name}” foi aplicado localmente.',
      deleted: 'O modelo de fundo foi excluído deste navegador.',
      unavailable: 'Os modelos de fundo não estão disponíveis neste navegador. O trabalho atual continua disponível.',
      limit: 'Você pode salvar até 8 modelos de fundo. Exclua um antes de salvar outro.',
      totalSize: 'Os modelos de fundo salvos podem usar até 80 MB neste navegador.',
      storage: 'O navegador não conseguiu salvar o modelo de fundo. Libere espaço e tente novamente.',
    }),
    'zh-cn': Object.freeze({
      title: '我的背景模板',
      note: '仅保存在当前浏览器，主动删除前持续保留 · 最多 8 个模板 / 合计 80 MB',
      upload: '上传模板',
      save: '保存当前背景',
      update: '更新当前模板',
      empty: '还没有保存的模板。',
      apply: '应用',
      delete: '删除',
      confirmDelete: '确认删除',
      saved: '背景模板“{name}”已保存在当前浏览器。',
      updated: '背景模板“{name}”已更新。',
      applied: '背景模板“{name}”已在本地应用。',
      deleted: '背景模板已从当前浏览器删除。',
      unavailable: '当前浏览器无法使用背景模板库，当前工作不受影响。',
      limit: '最多可保存 8 个背景模板，请先删除一个再保存。',
      totalSize: '当前浏览器中的背景模板合计最多可占用 80 MB。',
      storage: '浏览器无法保存背景模板，请释放存储空间后重试。',
    }),
  });

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, number));
  }

  function format(template, values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => (
      Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : `{${key}}`
    ));
  }

  function validateBackgroundFile(file) {
    if (!(file instanceof Blob)) return 'type';
    const supportedType = ACCEPTED_BACKGROUND_TYPES.has(file.type);
    const supportedExtension = ACCEPTED_BACKGROUND_EXTENSIONS.test(file.name || '');
    const canUseExtensionFallback = !file.type || file.type === 'application/octet-stream';
    if (!supportedType && !(canUseExtensionFallback && supportedExtension)) return 'type';
    if (file.size > MAX_BACKGROUND_BYTES) return 'size';
    if (file.size <= 0) return 'decode';
    return null;
  }

  function getBackgroundTemplateLocale() {
    const language = String(globalThis.document?.documentElement?.lang || 'en').toLowerCase();
    if (language.startsWith('zh')) return 'zh-cn';
    if (language.startsWith('pt')) return 'pt-br';
    if (language.startsWith('de')) return 'de';
    if (language.startsWith('es')) return 'es';
    if (language.startsWith('fr')) return 'fr';
    return 'en';
  }

  function normalizeBackgroundTemplate(input = {}, timestamp = Date.now()) {
    const imageBlob = input.imageBlob || input.backgroundImageBlob;
    if (validateBackgroundFile(imageBlob)) {
      throw new TypeError('invalid_background_template');
    }
    const fallbackName = input.backgroundImageName || imageBlob.name || 'Background template';
    return {
      id: String(input.id || globalThis.crypto?.randomUUID?.()
        || `${timestamp}-${Math.random().toString(36).slice(2)}`),
      name: String(input.name || fallbackName).trim().slice(0, 120) || 'Background template',
      imageBlob,
      backgroundImageName: String(input.backgroundImageName || fallbackName).slice(0, 255),
      backgroundFit: BACKGROUND_FITS.has(input.backgroundFit) ? input.backgroundFit : 'cover',
      backgroundScale: clampNumber(input.backgroundScale, 50, 200, 100),
      backgroundOffsetX: clampNumber(input.backgroundOffsetX, -50, 50, 0),
      backgroundOffsetY: clampNumber(input.backgroundOffsetY, -50, 50, 0),
      backgroundBlur: clampNumber(input.backgroundBlur, 0, 30, 0),
      createdAt: Number.isFinite(Number(input.createdAt)) ? Number(input.createdAt) : timestamp,
      updatedAt: timestamp,
    };
  }

  function backgroundTemplateByteSize(template) {
    return template?.imageBlob instanceof Blob ? template.imageBlob.size : 0;
  }

  function openBackgroundTemplateDb(indexedDb = globalThis.indexedDB) {
    if (!indexedDb) return Promise.reject(new Error('unavailable'));
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(BACKGROUND_TEMPLATE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(BACKGROUND_TEMPLATE_STORE_NAME)) {
          database.createObjectStore(BACKGROUND_TEMPLATE_STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('unavailable'));
      request.onblocked = () => reject(new Error('unavailable'));
    });
  }

  async function listBackgroundTemplates(indexedDb = globalThis.indexedDB) {
    const database = await openBackgroundTemplateDb(indexedDb);
    try {
      return await new Promise((resolve, reject) => {
        const request = database
          .transaction(BACKGROUND_TEMPLATE_STORE_NAME, 'readonly')
          .objectStore(BACKGROUND_TEMPLATE_STORE_NAME)
          .getAll();
        request.onsuccess = () => resolve(
          request.result.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)),
        );
        request.onerror = () => reject(request.error || new Error('storage'));
      });
    } finally {
      database.close();
    }
  }

  async function saveBackgroundTemplate(input, indexedDb = globalThis.indexedDB) {
    const existing = await listBackgroundTemplates(indexedDb);
    const previous = existing.find((template) => template.id === input.id);
    if (!previous && existing.length >= MAX_BACKGROUND_TEMPLATES) {
      throw new Error('limit');
    }
    const template = normalizeBackgroundTemplate({
      ...input,
      createdAt: previous?.createdAt || input.createdAt,
    });
    const otherBytes = existing.reduce(
      (total, saved) => total + (saved.id === template.id ? 0 : backgroundTemplateByteSize(saved)),
      0,
    );
    if (otherBytes + backgroundTemplateByteSize(template) > MAX_BACKGROUND_TEMPLATE_BYTES) {
      throw new Error('totalSize');
    }
    const database = await openBackgroundTemplateDb(indexedDb);
    try {
      await new Promise((resolve, reject) => {
        const request = database
          .transaction(BACKGROUND_TEMPLATE_STORE_NAME, 'readwrite')
          .objectStore(BACKGROUND_TEMPLATE_STORE_NAME)
          .put(template);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('storage'));
      });
    } finally {
      database.close();
    }
    return template;
  }

  async function deleteBackgroundTemplate(id, indexedDb = globalThis.indexedDB) {
    const database = await openBackgroundTemplateDb(indexedDb);
    try {
      await new Promise((resolve, reject) => {
        const request = database
          .transaction(BACKGROUND_TEMPLATE_STORE_NAME, 'readwrite')
          .objectStore(BACKGROUND_TEMPLATE_STORE_NAME)
          .delete(String(id));
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error || new Error('storage'));
      });
    } finally {
      database.close();
    }
  }

  function getImagePlacement(imageWidth, imageHeight, canvasWidth, canvasHeight, fit = 'cover') {
    if (
      ![imageWidth, imageHeight, canvasWidth, canvasHeight].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new TypeError('Image and canvas dimensions must be positive numbers.');
    }

    if (fit === 'stretch') {
      return { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
    }

    const scale = (fit === 'contain' ? Math.min : Math.max)(
      canvasWidth / imageWidth,
      canvasHeight / imageHeight,
    );
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
      x: (canvasWidth - width) / 2,
      y: (canvasHeight - height) / 2,
      width,
      height,
    };
  }

  function getBackgroundPlacement(
    imageWidth,
    imageHeight,
    canvasWidth,
    canvasHeight,
    {
      fit = 'cover',
      backgroundScale = 100,
      backgroundOffsetX = 0,
      backgroundOffsetY = 0,
    } = {},
  ) {
    const base = getImagePlacement(
      imageWidth,
      imageHeight,
      canvasWidth,
      canvasHeight,
      BACKGROUND_FITS.has(fit) ? fit : 'cover',
    );
    const scale = clampNumber(backgroundScale, 50, 200, 100) / 100;
    const width = base.width * scale;
    const height = base.height * scale;
    return {
      x: ((canvasWidth - width) / 2)
        + (canvasWidth * clampNumber(backgroundOffsetX, -50, 50, 0) / 100),
      y: ((canvasHeight - height) / 2)
        + (canvasHeight * clampNumber(backgroundOffsetY, -50, 50, 0) / 100),
      width,
      height,
    };
  }

  function getBackgroundBlurPixels(strength, canvasWidth, canvasHeight) {
    if (
      ![canvasWidth, canvasHeight].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new TypeError('Canvas dimensions must be positive numbers.');
    }
    return Math.min(canvasWidth, canvasHeight)
      * clampNumber(strength, 0, 30, 0)
      / 1000;
  }

  function getForegroundPlacement(
    imageWidth,
    imageHeight,
    canvasWidth,
    canvasHeight,
    {
      baseFitRatio = 0.9,
      productScale = 100,
      productOffsetX = 0,
      productOffsetY = 0,
      productAlign = 'center',
    } = {},
  ) {
    if (
      ![imageWidth, imageHeight, canvasWidth, canvasHeight].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    ) {
      throw new TypeError('Image and canvas dimensions must be positive numbers.');
    }

    const scale = Math.min(
      canvasWidth / imageWidth,
      canvasHeight / imageHeight,
    ) * baseFitRatio * (productScale / 100);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    const x = ((canvasWidth - width) / 2) + (canvasWidth * productOffsetX / 100);
    const y = productAlign === 'bottom'
      ? canvasHeight - height - (canvasHeight * 0.05)
      : ((canvasHeight - height) / 2) + (canvasHeight * productOffsetY / 100);
    return { x, y, width, height };
  }

  function resolveCompositionConfig(globalConfig, itemOverrides, index) {
    if (!Number.isInteger(index)) return globalConfig;
    if (itemOverrides instanceof Map) {
      return itemOverrides.get(index) || globalConfig;
    }
    return itemOverrides?.[String(index)] || globalConfig;
  }

  function getOutputEncoding(format = 'png', quality = 90) {
    const normalizedFormat = Object.prototype.hasOwnProperty.call(OUTPUT_ENCODINGS, format)
      ? format
      : 'png';
    return {
      ...OUTPUT_ENCODINGS[normalizedFormat],
      format: normalizedFormat,
      quality: clampNumber(quality, 50, 100, 90) / 100,
    };
  }

  function loadBlobImage(blob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        if (!image.naturalWidth || !image.naturalHeight) {
          reject(new Error('decode'));
          return;
        }
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('decode'));
      };
      image.src = objectUrl;
    });
  }

  function create(options = {}) {
    const elements = {
      white: document.getElementById('bgWhite'),
      transparent: document.getElementById('bgTransparent'),
      custom: document.getElementById('bgCustom'),
      image: document.getElementById('bgImage'),
      colorRow: document.getElementById('colorRow'),
      colorPicker: document.getElementById('customColorPicker'),
      colorHex: document.getElementById('customColorHex'),
      imagePanel: document.getElementById('backgroundImagePanel'),
      imageInput: document.getElementById('backgroundImageInput'),
      imageName: document.getElementById('backgroundImageName'),
      imageFit: document.getElementById('backgroundFit'),
      imageRemove: document.getElementById('backgroundImageRemove'),
      backgroundScale: document.getElementById('backgroundScale'),
      backgroundScaleValue: document.getElementById('backgroundScaleValue'),
      backgroundOffsetX: document.getElementById('backgroundOffsetX'),
      backgroundOffsetXValue: document.getElementById('backgroundOffsetXValue'),
      backgroundOffsetY: document.getElementById('backgroundOffsetY'),
      backgroundOffsetYValue: document.getElementById('backgroundOffsetYValue'),
      backgroundBlur: document.getElementById('backgroundBlur'),
      backgroundBlurValue: document.getElementById('backgroundBlurValue'),
      backgroundCenter: document.getElementById('backgroundCenter'),
      productScale: document.getElementById('productScale'),
      productScaleValue: document.getElementById('productScaleValue'),
      productOffsetX: document.getElementById('productOffsetX'),
      productOffsetXValue: document.getElementById('productOffsetXValue'),
      productOffsetY: document.getElementById('productOffsetY'),
      productOffsetYValue: document.getElementById('productOffsetYValue'),
      productCenter: document.getElementById('productCenter'),
      productBottom: document.getElementById('productBottom'),
      productShadow: document.getElementById('productShadow'),
      itemOverrideCopy: document.getElementById('itemOverrideCopy'),
    };
    const text = elements.imagePanel?.dataset || {};
    const itemText = elements.itemOverrideCopy?.dataset || {};
    let state = {
      bgMode: 'white',
      customHex: '#F0F0F0',
      backgroundFit: 'cover',
      backgroundImageBlob: null,
      backgroundImageName: '',
      backgroundScale: 100,
      backgroundOffsetX: 0,
      backgroundOffsetY: 0,
      backgroundBlur: 0,
      productScale: 100,
      productOffsetX: 0,
      productOffsetY: 0,
      productAlign: 'center',
      productShadow: false,
    };
    let decodedBackgroundImage = null;
    let currentTemplateId = null;
    let backgroundTemplates = [];
    let templateDeleteId = null;
    let templateDeleteTimer = null;
    const itemOverrides = new Map();
    const decodedOverrideBackgrounds = new Map();
    const overrideCardButtons = new Map();
    const templateCopy = BACKGROUND_TEMPLATE_COPY[getBackgroundTemplateLocale()];
    const templatePreviewUrls = new Set();
    const templateElements = {};

    function snapshotConfig(source = state) {
      return {
        bgMode: BACKGROUND_MODES.has(source.bgMode) ? source.bgMode : 'white',
        customHex: /^#[0-9A-Fa-f]{6}$/.test(source.customHex || '')
          ? source.customHex
          : '#F0F0F0',
        backgroundFit: BACKGROUND_FITS.has(source.backgroundFit)
          ? source.backgroundFit
          : 'cover',
        backgroundImageBlob: source.backgroundImageBlob instanceof Blob
          ? source.backgroundImageBlob
          : null,
        backgroundImageName: String(source.backgroundImageName || ''),
        backgroundScale: clampNumber(source.backgroundScale, 50, 200, 100),
        backgroundOffsetX: clampNumber(source.backgroundOffsetX, -50, 50, 0),
        backgroundOffsetY: clampNumber(source.backgroundOffsetY, -50, 50, 0),
        backgroundBlur: clampNumber(source.backgroundBlur, 0, 30, 0),
        productScale: clampNumber(source.productScale, 50, 140, 100),
        productOffsetX: clampNumber(source.productOffsetX, -40, 40, 0),
        productOffsetY: clampNumber(source.productOffsetY, -40, 40, 0),
        productAlign: PRODUCT_ALIGNMENTS.has(source.productAlign)
          ? source.productAlign
          : 'center',
        productShadow: source.productShadow === true,
      };
    }

    function resolvedConfig(index) {
      return resolveCompositionConfig(state, itemOverrides, index);
    }

    function syncOverrideCardButton(index) {
      const button = overrideCardButtons.get(index);
      if (!button) return;
      const active = itemOverrides.has(index);
      button.classList.toggle('active', active);
      button.textContent = active
        ? (itemText.overriddenLabel || 'Customized')
        : (itemText.customizeLabel || 'Customize');
      button.setAttribute('aria-pressed', String(active));
    }

    function notifyChanged(message, index = null) {
      options.onChanged?.(index);
      if (message) options.onStatus?.(message);
    }

    function createBackgroundTemplateLibrary() {
      if (!elements.imagePanel || document.getElementById('backgroundTemplateLibrary')) return;
      const section = document.createElement('section');
      section.className = 'background-template-library';
      section.id = 'backgroundTemplateLibrary';

      const head = document.createElement('div');
      head.className = 'background-template-head';
      const title = document.createElement('strong');
      title.textContent = templateCopy.title;
      const actions = document.createElement('div');
      actions.className = 'background-template-actions';

      const upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'background-template-action';
      upload.textContent = templateCopy.upload;
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
      input.hidden = true;

      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'background-template-action primary';
      save.textContent = templateCopy.save;
      save.disabled = true;
      actions.append(upload, save);
      head.append(title, actions);

      const list = document.createElement('div');
      list.className = 'background-template-list';
      list.setAttribute('aria-live', 'polite');
      const note = document.createElement('small');
      note.className = 'background-template-note';
      note.textContent = templateCopy.note;
      section.append(head, input, list, note);
      elements.imagePanel.after(section);

      Object.assign(templateElements, {
        section,
        upload,
        input,
        save,
        list,
      });
      upload.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const [file] = input.files || [];
        input.value = '';
        if (!file) return;
        currentTemplateId = null;
        const accepted = await acceptBackgroundFile(file);
        if (accepted) await saveCurrentBackgroundTemplate();
      });
      save.addEventListener('click', saveCurrentBackgroundTemplate);
    }

    function clearTemplatePreviewUrls() {
      for (const url of templatePreviewUrls) URL.revokeObjectURL(url);
      templatePreviewUrls.clear();
    }

    function syncBackgroundTemplateLibrary() {
      if (!templateElements.list) return;
      templateElements.save.disabled = !state.backgroundImageBlob;
      templateElements.save.textContent = currentTemplateId
        ? templateCopy.update
        : templateCopy.save;
      for (const card of templateElements.list.querySelectorAll('.background-template-card')) {
        card.classList.toggle('active', card.dataset.templateId === currentTemplateId);
      }
    }

    function renderBackgroundTemplateLibrary() {
      if (!templateElements.list) return;
      clearTemplatePreviewUrls();
      templateElements.list.replaceChildren();
      syncBackgroundTemplateLibrary();

      if (!backgroundTemplates.length) {
        const empty = document.createElement('span');
        empty.className = 'background-template-empty';
        empty.textContent = templateCopy.empty;
        templateElements.list.append(empty);
        return;
      }

      for (const template of backgroundTemplates) {
        const card = document.createElement('article');
        card.className = 'background-template-card';
        card.dataset.templateId = template.id;
        card.classList.toggle('active', template.id === currentTemplateId);

        const preview = document.createElement('div');
        preview.className = 'background-template-preview';
        const previewUrl = URL.createObjectURL(template.imageBlob);
        templatePreviewUrls.add(previewUrl);
        preview.style.backgroundImage = `url("${previewUrl}")`;

        const details = document.createElement('div');
        details.className = 'background-template-details';
        const name = document.createElement('span');
        name.className = 'background-template-name';
        name.textContent = template.name;
        name.title = template.name;
        const buttons = document.createElement('div');
        buttons.className = 'background-template-buttons';
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'background-template-apply';
        apply.textContent = templateCopy.apply;
        apply.addEventListener('click', () => applyBackgroundTemplate(template));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'background-template-delete';
        remove.textContent = templateDeleteId === template.id
          ? templateCopy.confirmDelete
          : templateCopy.delete;
        remove.addEventListener('click', () => requestDeleteBackgroundTemplate(template.id));
        buttons.append(apply, remove);
        details.append(name, buttons);
        card.append(preview, details);
        templateElements.list.append(card);
      }
    }

    async function refreshBackgroundTemplates() {
      try {
        backgroundTemplates = await listBackgroundTemplates();
        renderBackgroundTemplateLibrary();
      } catch {
        templateElements.upload.disabled = true;
        templateElements.save.disabled = true;
        templateElements.list.textContent = templateCopy.unavailable;
        notifyChanged(templateCopy.unavailable);
      }
    }

    function templateStorageMessage(error) {
      if (error?.message === 'limit') return templateCopy.limit;
      if (error?.message === 'totalSize') return templateCopy.totalSize;
      if (error?.name === 'QuotaExceededError') return templateCopy.storage;
      return templateCopy.storage;
    }

    async function saveCurrentBackgroundTemplate() {
      if (!state.backgroundImageBlob) return false;
      const previous = backgroundTemplates.find((template) => template.id === currentTemplateId);
      try {
        const saved = await saveBackgroundTemplate({
          id: currentTemplateId || undefined,
          name: previous?.name || state.backgroundImageName,
          imageBlob: state.backgroundImageBlob,
          backgroundImageName: state.backgroundImageName,
          backgroundFit: state.backgroundFit,
          backgroundScale: state.backgroundScale,
          backgroundOffsetX: state.backgroundOffsetX,
          backgroundOffsetY: state.backgroundOffsetY,
          backgroundBlur: state.backgroundBlur,
          createdAt: previous?.createdAt,
        });
        const updated = Boolean(previous);
        currentTemplateId = saved.id;
        await refreshBackgroundTemplates();
        notifyChanged(format(updated ? templateCopy.updated : templateCopy.saved, {
          name: saved.name,
        }));
        return true;
      } catch (error) {
        notifyChanged(templateStorageMessage(error));
        return false;
      }
    }

    async function applyBackgroundTemplate(template) {
      let decodedImage;
      try {
        const normalized = normalizeBackgroundTemplate(template, Number(template.updatedAt));
        decodedImage = await loadBlobImage(normalized.imageBlob);
        state.backgroundImageBlob = normalized.imageBlob;
        state.backgroundImageName = normalized.backgroundImageName;
        state.backgroundFit = normalized.backgroundFit;
        state.backgroundScale = normalized.backgroundScale;
        state.backgroundOffsetX = normalized.backgroundOffsetX;
        state.backgroundOffsetY = normalized.backgroundOffsetY;
        state.backgroundBlur = normalized.backgroundBlur;
        state.bgMode = 'image';
        decodedBackgroundImage = decodedImage;
        currentTemplateId = normalized.id;
        render();
        notifyChanged(format(templateCopy.applied, { name: normalized.name }));
        return true;
      } catch {
        notifyChanged(text.decodeError);
        return false;
      }
    }

    async function requestDeleteBackgroundTemplate(id) {
      if (templateDeleteId !== id) {
        templateDeleteId = id;
        clearTimeout(templateDeleteTimer);
        templateDeleteTimer = setTimeout(() => {
          templateDeleteId = null;
          renderBackgroundTemplateLibrary();
        }, 4000);
        renderBackgroundTemplateLibrary();
        return;
      }
      clearTimeout(templateDeleteTimer);
      templateDeleteId = null;
      try {
        await deleteBackgroundTemplate(id);
        if (currentTemplateId === id) currentTemplateId = null;
        await refreshBackgroundTemplates();
        notifyChanged(templateCopy.deleted);
      } catch (error) {
        notifyChanged(templateStorageMessage(error));
      }
    }

    function render() {
      for (const mode of BACKGROUND_MODES) {
        elements[mode]?.classList.toggle('active', state.bgMode === mode);
      }
      if (elements.colorRow) {
        elements.colorRow.style.display = state.bgMode === 'custom' ? 'flex' : 'none';
      }
      if (elements.imagePanel) {
        elements.imagePanel.hidden = !state.backgroundImageBlob;
      }
      if (elements.colorPicker) elements.colorPicker.value = state.customHex;
      if (elements.colorHex) elements.colorHex.value = state.customHex.toUpperCase();
      if (elements.imageFit) elements.imageFit.value = state.backgroundFit;
      if (elements.imageName) {
        elements.imageName.textContent = state.backgroundImageName || text.emptyName || '';
      }
      if (elements.backgroundScale) {
        elements.backgroundScale.value = String(state.backgroundScale);
      }
      if (elements.backgroundScaleValue) {
        elements.backgroundScaleValue.textContent = `${state.backgroundScale}%`;
      }
      if (elements.backgroundOffsetX) {
        elements.backgroundOffsetX.value = String(state.backgroundOffsetX);
      }
      if (elements.backgroundOffsetXValue) {
        elements.backgroundOffsetXValue.textContent = `${state.backgroundOffsetX}%`;
      }
      if (elements.backgroundOffsetY) {
        elements.backgroundOffsetY.value = String(state.backgroundOffsetY);
      }
      if (elements.backgroundOffsetYValue) {
        elements.backgroundOffsetYValue.textContent = `${state.backgroundOffsetY}%`;
      }
      if (elements.backgroundBlur) {
        elements.backgroundBlur.value = String(state.backgroundBlur);
      }
      if (elements.backgroundBlurValue) {
        elements.backgroundBlurValue.textContent = String(state.backgroundBlur);
      }
      if (elements.productScale) elements.productScale.value = String(state.productScale);
      if (elements.productScaleValue) {
        elements.productScaleValue.textContent = `${state.productScale}%`;
      }
      if (elements.productOffsetX) elements.productOffsetX.value = String(state.productOffsetX);
      if (elements.productOffsetXValue) {
        elements.productOffsetXValue.textContent = `${state.productOffsetX}%`;
      }
      if (elements.productOffsetY) elements.productOffsetY.value = String(state.productOffsetY);
      if (elements.productOffsetYValue) {
        elements.productOffsetYValue.textContent = state.productAlign === 'bottom'
          ? (text.bottomValue || 'Bottom')
          : `${state.productOffsetY}%`;
      }
      elements.productCenter?.classList.toggle('active', state.productAlign === 'center');
      elements.productBottom?.classList.toggle('active', state.productAlign === 'bottom');
      if (elements.productShadow) elements.productShadow.checked = state.productShadow;
      syncBackgroundTemplateLibrary();
    }

    async function acceptBackgroundFile(file, { restored = false } = {}) {
      const validation = validateBackgroundFile(file);
      if (validation) {
        if (!restored) options.onStatus?.(text[`${validation}Error`] || text.decodeError);
        return false;
      }
      let decodedImage;
      try {
        decodedImage = await loadBlobImage(file);
      } catch {
        if (!restored) options.onStatus?.(text.decodeError);
        return false;
      }

      state.backgroundImageBlob = file;
      state.backgroundImageName = file.name || text.restoredName || 'Background image';
      decodedBackgroundImage = decodedImage;
      currentTemplateId = null;
      state.bgMode = 'image';
      state.backgroundFit = BACKGROUND_FITS.has(state.backgroundFit) ? state.backgroundFit : 'cover';
      render();
      if (!restored) notifyChanged(format(text.ready, { name: state.backgroundImageName }));
      return true;
    }

    async function setMode(mode) {
      if (!BACKGROUND_MODES.has(mode)) return false;
      if (mode === 'image' && !state.backgroundImageBlob) {
        elements.imageInput?.click();
        return false;
      }
      state.bgMode = mode;
      render();
      notifyChanged();
      return true;
    }

    function syncColor(from) {
      if (!elements.colorPicker || !elements.colorHex) return;
      if (from === 'picker') {
        state.customHex = elements.colorPicker.value;
        elements.colorHex.value = state.customHex.toUpperCase();
      } else {
        const value = elements.colorHex.value.trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return;
        state.customHex = value;
        elements.colorPicker.value = value;
      }
      notifyChanged();
    }

    async function restore(settings = {}) {
      state.backgroundImageBlob = null;
      state.backgroundImageName = '';
      decodedBackgroundImage = null;
      currentTemplateId = null;
      if (/^#[0-9A-Fa-f]{6}$/.test(settings.customHex || '')) {
        state.customHex = settings.customHex;
      }
      if (BACKGROUND_FITS.has(settings.backgroundFit)) {
        state.backgroundFit = settings.backgroundFit;
      }
      state.backgroundScale = clampNumber(settings.backgroundScale, 50, 200, 100);
      state.backgroundOffsetX = clampNumber(settings.backgroundOffsetX, -50, 50, 0);
      state.backgroundOffsetY = clampNumber(settings.backgroundOffsetY, -50, 50, 0);
      state.backgroundBlur = clampNumber(settings.backgroundBlur, 0, 30, 0);
      state.productScale = clampNumber(settings.productScale, 50, 140, 100);
      state.productOffsetX = clampNumber(settings.productOffsetX, -40, 40, 0);
      state.productOffsetY = clampNumber(settings.productOffsetY, -40, 40, 0);
      state.productAlign = PRODUCT_ALIGNMENTS.has(settings.productAlign)
        ? settings.productAlign
        : 'center';
      state.productShadow = settings.productShadow === true;
      const requestedMode = BACKGROUND_MODES.has(settings.bgMode) ? settings.bgMode : 'white';
      if (settings.backgroundImageBlob instanceof Blob) {
        const restored = await acceptBackgroundFile(settings.backgroundImageBlob, { restored: true });
        if (!restored) {
          state.backgroundImageBlob = null;
          state.backgroundImageName = '';
          decodedBackgroundImage = null;
        } else {
          state.backgroundImageName = settings.backgroundImageName || state.backgroundImageName;
        }
      }
      state.bgMode = requestedMode === 'image' && !state.backgroundImageBlob ? 'white' : requestedMode;
      itemOverrides.clear();
      decodedOverrideBackgrounds.clear();
      const restoredOverrides = settings.itemOverrides && typeof settings.itemOverrides === 'object'
        ? Object.entries(settings.itemOverrides)
        : [];
      await Promise.all(restoredOverrides.map(async ([rawIndex, savedOverride]) => {
        const index = Number(rawIndex);
        if (!Number.isInteger(index) || index < 0 || !savedOverride) return;
        const override = snapshotConfig(savedOverride);
        if (override.backgroundImageBlob) {
          const validation = validateBackgroundFile(override.backgroundImageBlob);
          if (validation) {
            override.backgroundImageBlob = null;
            override.backgroundImageName = '';
          } else {
            try {
              decodedOverrideBackgrounds.set(
                index,
                await loadBlobImage(override.backgroundImageBlob),
              );
            } catch {
              override.backgroundImageBlob = null;
              override.backgroundImageName = '';
            }
          }
        }
        if (override.bgMode === 'image' && !override.backgroundImageBlob) {
          override.bgMode = 'white';
        }
        itemOverrides.set(index, override);
      }));
      render();
      for (const index of overrideCardButtons.keys()) syncOverrideCardButton(index);
    }

    function getState() {
      return {
        ...state,
        itemOverrides: Object.fromEntries(
          Array.from(itemOverrides, ([index, override]) => [
            String(index),
            snapshotConfig(override),
          ]),
        ),
      };
    }

    function validateJobs(jobs = []) {
      let blocked = 0;
      for (const job of jobs) {
        if (!job) continue;
        const config = resolvedConfig(job.index);
        const needsTransparentSubject = config.bgMode === 'image' || config.productShadow;
        if (!needsTransparentSubject) continue;
        if (config.bgMode === 'image' && !config.backgroundImageBlob) {
          return text.missingError || text.decodeError;
        }
        if (
          job.transparent !== true
          && !(job.foregroundBlob && !job.needsReprocess)
          && !job.aiRequested
        ) {
          blocked += 1;
        }
      }
      return blocked > 0 ? format(text.needsForeground, { count: blocked }) : null;
    }

    async function compose(inputBlob, outputSize, index = null, outputOptions = {}) {
      const config = resolvedConfig(index);
      const encoding = getOutputEncoding(outputOptions.format, outputOptions.quality);
      const foreground = await loadBlobImage(inputBlob);
      let canvasWidth;
      let canvasHeight;
      let foregroundWidth;
      let foregroundHeight;
      let foregroundX;
      let foregroundY;

      let baseFitRatio;
      if (outputSize === 'original') {
        canvasWidth = foreground.naturalWidth;
        canvasHeight = foreground.naturalHeight;
        baseFitRatio = 1;
      } else {
        const size = Number.parseInt(outputSize, 10);
        canvasWidth = size;
        canvasHeight = size;
        baseFitRatio = 0.9;
      }
      const foregroundPlacement = getForegroundPlacement(
        foreground.naturalWidth,
        foreground.naturalHeight,
        canvasWidth,
        canvasHeight,
        {
          baseFitRatio,
          productScale: config.productScale,
          productOffsetX: config.productOffsetX,
          productOffsetY: config.productOffsetY,
          productAlign: config.productAlign,
        },
      );
      foregroundWidth = foregroundPlacement.width;
      foregroundHeight = foregroundPlacement.height;
      foregroundX = foregroundPlacement.x;
      foregroundY = foregroundPlacement.y;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext('2d');

      if (!encoding.supportsAlpha) {
        context.fillStyle = '#FFFFFF';
        context.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      if (config.bgMode === 'image') {
        if (!config.backgroundImageBlob) throw new Error(text.missingError || 'Missing background image.');
        let background = Number.isInteger(index)
          ? decodedOverrideBackgrounds.get(index)
          : decodedBackgroundImage;
        if (!background) background = await loadBlobImage(config.backgroundImageBlob);
        if (Number.isInteger(index) && itemOverrides.has(index)) {
          decodedOverrideBackgrounds.set(index, background);
        } else {
          decodedBackgroundImage = background;
        }
        const placement = getBackgroundPlacement(
          background.naturalWidth,
          background.naturalHeight,
          canvasWidth,
          canvasHeight,
          {
            fit: config.backgroundFit,
            backgroundScale: config.backgroundScale,
            backgroundOffsetX: config.backgroundOffsetX,
            backgroundOffsetY: config.backgroundOffsetY,
          },
        );
        const blurPixels = getBackgroundBlurPixels(
          config.backgroundBlur,
          canvasWidth,
          canvasHeight,
        );
        context.save();
        if (blurPixels > 0) context.filter = `blur(${blurPixels}px)`;
        context.drawImage(
          background,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
        );
        context.restore();
      } else if (config.bgMode !== 'transparent') {
        context.fillStyle = config.bgMode === 'white' ? '#FFFFFF' : config.customHex;
        context.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      if (config.productShadow) {
        const shortestSide = Math.min(canvasWidth, canvasHeight);
        context.save();
        context.shadowColor = 'rgba(15, 23, 42, 0.28)';
        context.shadowBlur = Math.max(4, shortestSide * 0.025);
        context.shadowOffsetX = 0;
        context.shadowOffsetY = Math.max(2, shortestSide * 0.02);
        context.drawImage(
          foreground,
          foregroundX,
          foregroundY,
          foregroundWidth,
          foregroundHeight,
        );
        context.restore();
      } else {
        context.drawImage(
          foreground,
          foregroundX,
          foregroundY,
          foregroundWidth,
          foregroundHeight,
        );
      }
      return new Promise((resolve, reject) => {
        const encoded = (blob) => {
          if (!blob || blob.type !== encoding.mime) {
            reject(new Error('output_encoding_failed'));
            return;
          }
          resolve(blob);
        };
        if (encoding.format === 'png') {
          canvas.toBlob(encoded, encoding.mime);
        } else {
          canvas.toBlob(encoded, encoding.mime, encoding.quality);
        }
      });
    }

    let editorOverlay = null;
    let editorElements = null;
    let editorIndex = null;
    let editorDraft = null;
    let editorDecodedBackground = null;

    function renderEditor() {
      if (!editorElements || !editorDraft) return;
      editorElements.mode.value = editorDraft.bgMode;
      editorElements.customRow.hidden = editorDraft.bgMode !== 'custom';
      editorElements.imageRow.hidden = editorDraft.bgMode !== 'image';
      editorElements.color.value = editorDraft.customHex;
      editorElements.colorHex.value = editorDraft.customHex.toUpperCase();
      editorElements.imageName.textContent = editorDraft.backgroundImageName
        || itemText.noImageLabel
        || 'No image selected';
      editorElements.fit.value = editorDraft.backgroundFit;
      editorElements.backgroundTransform.hidden = editorDraft.bgMode !== 'image';
      editorElements.backgroundScale.value = String(editorDraft.backgroundScale);
      editorElements.backgroundScaleValue.textContent = `${editorDraft.backgroundScale}%`;
      editorElements.backgroundOffsetX.value = String(editorDraft.backgroundOffsetX);
      editorElements.backgroundOffsetXValue.textContent = `${editorDraft.backgroundOffsetX}%`;
      editorElements.backgroundOffsetY.value = String(editorDraft.backgroundOffsetY);
      editorElements.backgroundOffsetYValue.textContent = `${editorDraft.backgroundOffsetY}%`;
      editorElements.backgroundBlur.value = String(editorDraft.backgroundBlur);
      editorElements.backgroundBlurValue.textContent = String(editorDraft.backgroundBlur);
      editorElements.scale.value = String(editorDraft.productScale);
      editorElements.scaleValue.textContent = `${editorDraft.productScale}%`;
      editorElements.offsetX.value = String(editorDraft.productOffsetX);
      editorElements.offsetXValue.textContent = `${editorDraft.productOffsetX}%`;
      editorElements.offsetY.value = String(editorDraft.productOffsetY);
      editorElements.offsetYValue.textContent = editorDraft.productAlign === 'bottom'
        ? (text.bottomValue || itemText.bottomLabel || 'Bottom')
        : `${editorDraft.productOffsetY}%`;
      editorElements.center.classList.toggle(
        'active',
        editorDraft.productAlign === 'center',
      );
      editorElements.bottom.classList.toggle(
        'active',
        editorDraft.productAlign === 'bottom',
      );
      editorElements.shadow.checked = editorDraft.productShadow;
      editorElements.reset.disabled = !itemOverrides.has(editorIndex);
    }

    function closeEditor() {
      editorOverlay?.classList.remove('visible');
      editorIndex = null;
      editorDraft = null;
      editorDecodedBackground = null;
    }

    function ensureEditor() {
      if (editorOverlay) return;
      editorOverlay = document.createElement('div');
      editorOverlay.className = 'composition-editor-overlay';
      editorOverlay.innerHTML = `
        <section class="composition-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="itemOverrideTitle">
          <header class="composition-editor-head">
            <div>
              <strong id="itemOverrideTitle">${itemText.title || 'Customize one image'}</strong>
              <span id="itemOverrideName"></span>
              <small>${itemText.subtitle || 'These settings override the batch defaults for this image.'}</small>
            </div>
            <button class="composition-editor-close" type="button" aria-label="${itemText.closeLabel || 'Close'}">×</button>
          </header>
          <div class="composition-editor-body">
            <label class="composition-editor-field">
              <span>${itemText.backgroundLabel || 'Background'}</span>
              <select id="itemOverrideBgMode">
                <option value="white">${itemText.whiteLabel || 'White'}</option>
                <option value="transparent">${itemText.transparentLabel || 'Transparent'}</option>
                <option value="custom">${itemText.customLabel || 'Custom color'}</option>
                <option value="image">${itemText.uploadLabel || 'Uploaded image'}</option>
              </select>
            </label>
            <div class="composition-editor-inline" id="itemOverrideCustomRow" hidden>
              <input id="itemOverrideColor" type="color" value="#F0F0F0" aria-label="${itemText.customLabel || 'Custom color'}">
              <input id="itemOverrideColorHex" type="text" maxlength="7" value="#F0F0F0" aria-label="HEX">
            </div>
            <div class="composition-editor-image" id="itemOverrideImageRow" hidden>
              <button id="itemOverrideChooseImage" type="button">${itemText.chooseImageLabel || 'Choose image'}</button>
              <input id="itemOverrideImageInput" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden>
              <span id="itemOverrideImageName"></span>
            </div>
            <label class="composition-editor-field">
              <span>${itemText.fitLabel || 'Background fit'}</span>
              <select id="itemOverrideFit">
                <option value="cover">${itemText.coverLabel || 'Fill & crop'}</option>
                <option value="contain">${itemText.containLabel || 'Show full image'}</option>
                <option value="stretch">${itemText.stretchLabel || 'Stretch'}</option>
              </select>
            </label>
            <div class="background-transform-panel" id="itemOverrideBackgroundTransform">
              <div class="product-range-row">
                <label for="itemOverrideBackgroundScale">${itemText.backgroundSizeLabel || 'Background size'}</label>
                <input id="itemOverrideBackgroundScale" type="range" min="50" max="200" step="1">
                <output class="product-range-value" id="itemOverrideBackgroundScaleValue"></output>
              </div>
              <div class="product-range-row">
                <label for="itemOverrideBackgroundOffsetX">${itemText.backgroundHorizontalLabel || 'Background X'}</label>
                <input id="itemOverrideBackgroundOffsetX" type="range" min="-50" max="50" step="1">
                <output class="product-range-value" id="itemOverrideBackgroundOffsetXValue"></output>
              </div>
              <div class="product-range-row">
                <label for="itemOverrideBackgroundOffsetY">${itemText.backgroundVerticalLabel || 'Background Y'}</label>
                <input id="itemOverrideBackgroundOffsetY" type="range" min="-50" max="50" step="1">
                <output class="product-range-value" id="itemOverrideBackgroundOffsetYValue"></output>
              </div>
              <div class="product-range-row">
                <label for="itemOverrideBackgroundBlur">${itemText.backgroundBlurLabel || 'Background blur'}</label>
                <input id="itemOverrideBackgroundBlur" type="range" min="0" max="30" step="1">
                <output class="product-range-value" id="itemOverrideBackgroundBlurValue"></output>
              </div>
              <button class="product-transform-btn" id="itemOverrideBackgroundCenter" type="button">${itemText.backgroundCenterLabel || 'Center background'}</button>
            </div>
            <div class="product-transform-panel">
              <div class="product-range-row">
                <label for="itemOverrideScale">${itemText.sizeLabel || 'Size'}</label>
                <input id="itemOverrideScale" type="range" min="50" max="140" step="1">
                <output class="product-range-value" id="itemOverrideScaleValue"></output>
              </div>
              <div class="product-range-row">
                <label for="itemOverrideOffsetX">${itemText.horizontalLabel || 'Horizontal'}</label>
                <input id="itemOverrideOffsetX" type="range" min="-40" max="40" step="1">
                <output class="product-range-value" id="itemOverrideOffsetXValue"></output>
              </div>
              <div class="product-range-row">
                <label for="itemOverrideOffsetY">${itemText.verticalLabel || 'Vertical'}</label>
                <input id="itemOverrideOffsetY" type="range" min="-40" max="40" step="1">
                <output class="product-range-value" id="itemOverrideOffsetYValue"></output>
              </div>
              <div class="product-align-row">
                <button class="product-transform-btn" id="itemOverrideCenter" type="button">${itemText.centerLabel || 'Center'}</button>
                <button class="product-transform-btn" id="itemOverrideBottom" type="button">${itemText.bottomLabel || 'Bottom align'}</button>
              </div>
              <label class="product-shadow-row" for="itemOverrideShadow">
                <span>${itemText.shadowLabel || 'Soft product shadow'}</span>
                <input id="itemOverrideShadow" type="checkbox">
              </label>
            </div>
            <div class="composition-editor-status" id="itemOverrideStatus" aria-live="polite"></div>
          </div>
          <footer class="composition-editor-actions">
            <button class="composition-editor-reset" id="itemOverrideReset" type="button">${itemText.useBatchLabel || 'Use batch settings'}</button>
            <button class="composition-editor-apply" id="itemOverrideApply" type="button">${itemText.applyLabel || 'Apply to this image'}</button>
          </footer>
        </section>`;
      document.body.append(editorOverlay);
      editorElements = {
        name: editorOverlay.querySelector('#itemOverrideName'),
        close: editorOverlay.querySelector('.composition-editor-close'),
        mode: editorOverlay.querySelector('#itemOverrideBgMode'),
        customRow: editorOverlay.querySelector('#itemOverrideCustomRow'),
        color: editorOverlay.querySelector('#itemOverrideColor'),
        colorHex: editorOverlay.querySelector('#itemOverrideColorHex'),
        imageRow: editorOverlay.querySelector('#itemOverrideImageRow'),
        chooseImage: editorOverlay.querySelector('#itemOverrideChooseImage'),
        imageInput: editorOverlay.querySelector('#itemOverrideImageInput'),
        imageName: editorOverlay.querySelector('#itemOverrideImageName'),
        fit: editorOverlay.querySelector('#itemOverrideFit'),
        backgroundTransform: editorOverlay.querySelector('#itemOverrideBackgroundTransform'),
        backgroundScale: editorOverlay.querySelector('#itemOverrideBackgroundScale'),
        backgroundScaleValue: editorOverlay.querySelector('#itemOverrideBackgroundScaleValue'),
        backgroundOffsetX: editorOverlay.querySelector('#itemOverrideBackgroundOffsetX'),
        backgroundOffsetXValue: editorOverlay.querySelector('#itemOverrideBackgroundOffsetXValue'),
        backgroundOffsetY: editorOverlay.querySelector('#itemOverrideBackgroundOffsetY'),
        backgroundOffsetYValue: editorOverlay.querySelector('#itemOverrideBackgroundOffsetYValue'),
        backgroundBlur: editorOverlay.querySelector('#itemOverrideBackgroundBlur'),
        backgroundBlurValue: editorOverlay.querySelector('#itemOverrideBackgroundBlurValue'),
        backgroundCenter: editorOverlay.querySelector('#itemOverrideBackgroundCenter'),
        scale: editorOverlay.querySelector('#itemOverrideScale'),
        scaleValue: editorOverlay.querySelector('#itemOverrideScaleValue'),
        offsetX: editorOverlay.querySelector('#itemOverrideOffsetX'),
        offsetXValue: editorOverlay.querySelector('#itemOverrideOffsetXValue'),
        offsetY: editorOverlay.querySelector('#itemOverrideOffsetY'),
        offsetYValue: editorOverlay.querySelector('#itemOverrideOffsetYValue'),
        center: editorOverlay.querySelector('#itemOverrideCenter'),
        bottom: editorOverlay.querySelector('#itemOverrideBottom'),
        shadow: editorOverlay.querySelector('#itemOverrideShadow'),
        status: editorOverlay.querySelector('#itemOverrideStatus'),
        reset: editorOverlay.querySelector('#itemOverrideReset'),
        apply: editorOverlay.querySelector('#itemOverrideApply'),
      };

      editorElements.close.addEventListener('click', closeEditor);
      editorOverlay.addEventListener('click', (event) => {
        if (event.target === editorOverlay) closeEditor();
      });
      editorElements.mode.addEventListener('change', () => {
        editorDraft.bgMode = BACKGROUND_MODES.has(editorElements.mode.value)
          ? editorElements.mode.value
          : 'white';
        renderEditor();
      });
      editorElements.color.addEventListener('input', () => {
        editorDraft.customHex = editorElements.color.value;
        renderEditor();
      });
      editorElements.colorHex.addEventListener('input', () => {
        const value = editorElements.colorHex.value.trim();
        if (!/^#[0-9A-Fa-f]{6}$/.test(value)) return;
        editorDraft.customHex = value;
        renderEditor();
      });
      editorElements.chooseImage.addEventListener('click', () => {
        editorElements.imageInput.click();
      });
      editorElements.imageInput.addEventListener('change', async () => {
        const [file] = editorElements.imageInput.files || [];
        editorElements.imageInput.value = '';
        if (!file) return;
        const validation = validateBackgroundFile(file);
        if (validation) {
          editorElements.status.textContent = text[`${validation}Error`] || text.decodeError;
          return;
        }
        try {
          editorDecodedBackground = await loadBlobImage(file);
        } catch {
          editorElements.status.textContent = text.decodeError;
          return;
        }
        editorDraft.backgroundImageBlob = file;
        editorDraft.backgroundImageName = file.name || itemText.restoredName || 'Background image';
        editorDraft.bgMode = 'image';
        editorElements.status.textContent = '';
        renderEditor();
      });
      editorElements.fit.addEventListener('change', () => {
        if (BACKGROUND_FITS.has(editorElements.fit.value)) {
          editorDraft.backgroundFit = editorElements.fit.value;
        }
      });
      editorElements.backgroundScale.addEventListener('input', () => {
        editorDraft.backgroundScale = clampNumber(
          editorElements.backgroundScale.value,
          50,
          200,
          100,
        );
        renderEditor();
      });
      editorElements.backgroundOffsetX.addEventListener('input', () => {
        editorDraft.backgroundOffsetX = clampNumber(
          editorElements.backgroundOffsetX.value,
          -50,
          50,
          0,
        );
        renderEditor();
      });
      editorElements.backgroundOffsetY.addEventListener('input', () => {
        editorDraft.backgroundOffsetY = clampNumber(
          editorElements.backgroundOffsetY.value,
          -50,
          50,
          0,
        );
        renderEditor();
      });
      editorElements.backgroundBlur.addEventListener('input', () => {
        editorDraft.backgroundBlur = clampNumber(
          editorElements.backgroundBlur.value,
          0,
          30,
          0,
        );
        renderEditor();
      });
      editorElements.backgroundCenter.addEventListener('click', () => {
        editorDraft.backgroundOffsetX = 0;
        editorDraft.backgroundOffsetY = 0;
        renderEditor();
      });
      editorElements.scale.addEventListener('input', () => {
        editorDraft.productScale = clampNumber(editorElements.scale.value, 50, 140, 100);
        renderEditor();
      });
      editorElements.offsetX.addEventListener('input', () => {
        editorDraft.productOffsetX = clampNumber(editorElements.offsetX.value, -40, 40, 0);
        renderEditor();
      });
      editorElements.offsetY.addEventListener('input', () => {
        editorDraft.productOffsetY = clampNumber(editorElements.offsetY.value, -40, 40, 0);
        editorDraft.productAlign = (
          editorDraft.productOffsetX === 0 && editorDraft.productOffsetY === 0
        ) ? 'center' : 'custom';
        renderEditor();
      });
      editorElements.center.addEventListener('click', () => {
        editorDraft.productOffsetX = 0;
        editorDraft.productOffsetY = 0;
        editorDraft.productAlign = 'center';
        renderEditor();
      });
      editorElements.bottom.addEventListener('click', () => {
        editorDraft.productOffsetX = 0;
        editorDraft.productOffsetY = 0;
        editorDraft.productAlign = 'bottom';
        renderEditor();
      });
      editorElements.shadow.addEventListener('change', () => {
        editorDraft.productShadow = editorElements.shadow.checked;
      });
      editorElements.apply.addEventListener('click', () => {
        if (editorDraft.bgMode === 'image' && !editorDraft.backgroundImageBlob) {
          editorElements.status.textContent = itemText.imageRequired || text.missingError;
          return;
        }
        const override = snapshotConfig(editorDraft);
        itemOverrides.set(editorIndex, override);
        if (editorDecodedBackground && override.backgroundImageBlob) {
          decodedOverrideBackgrounds.set(editorIndex, editorDecodedBackground);
        } else {
          decodedOverrideBackgrounds.delete(editorIndex);
        }
        syncOverrideCardButton(editorIndex);
        const changedIndex = editorIndex;
        closeEditor();
        notifyChanged(
          itemText.appliedStatus || 'Single-image settings applied locally.',
          changedIndex,
        );
      });
      editorElements.reset.addEventListener('click', () => {
        const changedIndex = editorIndex;
        itemOverrides.delete(changedIndex);
        decodedOverrideBackgrounds.delete(changedIndex);
        syncOverrideCardButton(changedIndex);
        closeEditor();
        notifyChanged(
          itemText.resetStatus || 'This image now uses batch settings.',
          changedIndex,
        );
      });
    }

    function openEditor(index, fileName = '') {
      ensureEditor();
      editorIndex = index;
      editorDraft = snapshotConfig(resolvedConfig(index));
      editorDecodedBackground = itemOverrides.has(index)
        ? decodedOverrideBackgrounds.get(index) || null
        : (
          editorDraft.backgroundImageBlob === state.backgroundImageBlob
            ? decodedBackgroundImage
            : null
        );
      editorElements.name.textContent = fileName;
      editorElements.status.textContent = itemOverrides.has(index)
        ? (itemText.overriddenNotice || 'This image has custom settings.')
        : (itemText.inheritedNotice || 'Starting from the current batch settings.');
      renderEditor();
      editorOverlay.classList.add('visible');
    }

    function decorateCard(card, index, fileName = '') {
      if (!card || !Number.isInteger(index) || overrideCardButtons.has(index)) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'composition-card-btn';
      button.setAttribute(
        'aria-label',
        format(itemText.customizeAria || 'Customize {name}', { name: fileName }),
      );
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(index, fileName);
      });
      card.appendChild(button);
      overrideCardButtons.set(index, button);
      syncOverrideCardButton(index);
    }

    elements.imageInput?.addEventListener('change', async () => {
      const [file] = elements.imageInput.files || [];
      elements.imageInput.value = '';
      if (file) await acceptBackgroundFile(file);
    });
    elements.imageFit?.addEventListener('change', () => {
      if (!BACKGROUND_FITS.has(elements.imageFit.value)) return;
      state.backgroundFit = elements.imageFit.value;
      notifyChanged();
    });
    elements.backgroundScale?.addEventListener('input', () => {
      state.backgroundScale = clampNumber(elements.backgroundScale.value, 50, 200, 100);
      render();
      notifyChanged();
    });
    elements.backgroundOffsetX?.addEventListener('input', () => {
      state.backgroundOffsetX = clampNumber(elements.backgroundOffsetX.value, -50, 50, 0);
      render();
      notifyChanged();
    });
    elements.backgroundOffsetY?.addEventListener('input', () => {
      state.backgroundOffsetY = clampNumber(elements.backgroundOffsetY.value, -50, 50, 0);
      render();
      notifyChanged();
    });
    elements.backgroundBlur?.addEventListener('input', () => {
      state.backgroundBlur = clampNumber(elements.backgroundBlur.value, 0, 30, 0);
      render();
      notifyChanged();
    });
    elements.backgroundCenter?.addEventListener('click', () => {
      state.backgroundOffsetX = 0;
      state.backgroundOffsetY = 0;
      render();
      notifyChanged();
    });
    elements.imageRemove?.addEventListener('click', () => {
      state.backgroundImageBlob = null;
      state.backgroundImageName = '';
      decodedBackgroundImage = null;
      currentTemplateId = null;
      if (state.bgMode === 'image') state.bgMode = 'white';
      render();
      notifyChanged(text.removed);
    });
    elements.productScale?.addEventListener('input', () => {
      state.productScale = clampNumber(elements.productScale.value, 50, 140, 100);
      render();
      notifyChanged();
    });
    elements.productOffsetX?.addEventListener('input', () => {
      state.productOffsetX = clampNumber(elements.productOffsetX.value, -40, 40, 0);
      render();
      notifyChanged();
    });
    elements.productOffsetY?.addEventListener('input', () => {
      state.productOffsetY = clampNumber(elements.productOffsetY.value, -40, 40, 0);
      state.productAlign = state.productOffsetY === 0 && state.productOffsetX === 0
        ? 'center'
        : 'custom';
      render();
      notifyChanged();
    });
    elements.productCenter?.addEventListener('click', () => {
      state.productOffsetX = 0;
      state.productOffsetY = 0;
      state.productAlign = 'center';
      render();
      notifyChanged();
    });
    elements.productBottom?.addEventListener('click', () => {
      state.productOffsetX = 0;
      state.productOffsetY = 0;
      state.productAlign = 'bottom';
      render();
      notifyChanged();
    });
    elements.productShadow?.addEventListener('change', () => {
      state.productShadow = elements.productShadow.checked;
      notifyChanged();
    });

    createBackgroundTemplateLibrary();
    render();
    refreshBackgroundTemplates();
    globalThis.addEventListener?.('pagehide', clearTemplatePreviewUrls, { once: true });
    return {
      acceptBackgroundFile,
      applyBackgroundTemplate,
      compose,
      decorateCard,
      getState,
      refreshBackgroundTemplates,
      restore,
      saveCurrentBackgroundTemplate,
      setMode,
      syncColor,
      validateJobs,
    };
  }

  globalThis.ShopBGBackgroundComposer = {
    create,
    format,
    getBackgroundBlurPixels,
    getBackgroundPlacement,
    getForegroundPlacement,
    getImagePlacement,
    getOutputEncoding,
    resolveCompositionConfig,
    backgroundTemplateByteSize,
    deleteBackgroundTemplate,
    listBackgroundTemplates,
    normalizeBackgroundTemplate,
    saveBackgroundTemplate,
    validateBackgroundFile,
    MAX_BACKGROUND_BYTES,
    MAX_BACKGROUND_TEMPLATES,
    MAX_BACKGROUND_TEMPLATE_BYTES,
  };
})();
