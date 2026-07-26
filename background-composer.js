(function () {
  const MAX_BACKGROUND_BYTES = 20 * 1024 * 1024;
  const ACCEPTED_BACKGROUND_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const ACCEPTED_BACKGROUND_EXTENSIONS = /\.(?:jpe?g|png|webp)$/i;
  const BACKGROUND_MODES = new Set(['white', 'transparent', 'custom', 'image']);
  const BACKGROUND_FITS = new Set(['cover', 'contain', 'stretch']);

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
    };
    const text = elements.imagePanel?.dataset || {};
    let state = {
      bgMode: 'white',
      customHex: '#F0F0F0',
      backgroundFit: 'cover',
      backgroundImageBlob: null,
      backgroundImageName: '',
    };
    let decodedBackgroundImage = null;

    function notifyChanged(message) {
      options.onChanged?.();
      if (message) options.onStatus?.(message);
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
      if (/^#[0-9A-Fa-f]{6}$/.test(settings.customHex || '')) {
        state.customHex = settings.customHex;
      }
      if (BACKGROUND_FITS.has(settings.backgroundFit)) {
        state.backgroundFit = settings.backgroundFit;
      }
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
      render();
    }

    function getState() {
      return { ...state };
    }

    function validateJobs(jobs = []) {
      if (state.bgMode !== 'image') return null;
      if (!state.backgroundImageBlob) return text.missingError || text.decodeError;
      const blocked = jobs.filter((job) => (
        job
        && job.transparent !== true
        && !(job.foregroundBlob && !job.needsReprocess)
        && !job.aiRequested
      )).length;
      return blocked > 0 ? format(text.needsForeground, { count: blocked }) : null;
    }

    async function compose(inputBlob, outputSize) {
      const foreground = await loadBlobImage(inputBlob);
      let canvasWidth;
      let canvasHeight;
      let foregroundWidth;
      let foregroundHeight;
      let foregroundX;
      let foregroundY;

      if (outputSize === 'original') {
        canvasWidth = foreground.naturalWidth;
        canvasHeight = foreground.naturalHeight;
        foregroundWidth = canvasWidth;
        foregroundHeight = canvasHeight;
        foregroundX = 0;
        foregroundY = 0;
      } else {
        const size = Number.parseInt(outputSize, 10);
        canvasWidth = size;
        canvasHeight = size;
        const foregroundScale = Math.min(
          size / foreground.naturalWidth,
          size / foreground.naturalHeight,
        ) * 0.9;
        foregroundWidth = Math.round(foreground.naturalWidth * foregroundScale);
        foregroundHeight = Math.round(foreground.naturalHeight * foregroundScale);
        foregroundX = Math.round((size - foregroundWidth) / 2);
        foregroundY = Math.round((size - foregroundHeight) / 2);
      }

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext('2d');

      if (state.bgMode === 'image') {
        if (!state.backgroundImageBlob) throw new Error(text.missingError || 'Missing background image.');
        const background = decodedBackgroundImage || await loadBlobImage(state.backgroundImageBlob);
        decodedBackgroundImage = background;
        const placement = getImagePlacement(
          background.naturalWidth,
          background.naturalHeight,
          canvasWidth,
          canvasHeight,
          state.backgroundFit,
        );
        context.drawImage(
          background,
          placement.x,
          placement.y,
          placement.width,
          placement.height,
        );
      } else if (state.bgMode !== 'transparent') {
        context.fillStyle = state.bgMode === 'white' ? '#FFFFFF' : state.customHex;
        context.fillRect(0, 0, canvasWidth, canvasHeight);
      }

      context.drawImage(
        foreground,
        foregroundX,
        foregroundY,
        foregroundWidth,
        foregroundHeight,
      );
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
    elements.imageRemove?.addEventListener('click', () => {
      state.backgroundImageBlob = null;
      state.backgroundImageName = '';
      decodedBackgroundImage = null;
      if (state.bgMode === 'image') state.bgMode = 'white';
      render();
      notifyChanged(text.removed);
    });

    render();
    return {
      acceptBackgroundFile,
      compose,
      getState,
      restore,
      setMode,
      syncColor,
      validateJobs,
    };
  }

  globalThis.ShopBGBackgroundComposer = {
    create,
    format,
    getImagePlacement,
    validateBackgroundFile,
    MAX_BACKGROUND_BYTES,
  };
})();
