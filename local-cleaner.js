(() => {
  'use strict';

  const language = document.documentElement.lang || 'en';
  const copy = {
    en: {
      edit: 'Clean locally', edited: 'Cleaned', title: 'Local photo cleanup',
      subtitle: 'Brush or frame a small area. Your image stays in this browser.',
      tool: 'Selection tool', brush: 'Brush', rectangle: 'Rectangle', size: 'Brush size',
      undo: 'Undo', redo: 'Redo', clear: 'Clear marks', apply: 'Apply cleanup',
      download: 'Download cleaned image', restore: 'Restore original',
      ready: 'Mark a small object, watermark-like mark, dust spot or text to remove.',
      noSelection: 'Mark an area first.', processing: 'Cleaning the selected area locally…',
      applied: 'Cleanup applied. You can mark another area or close the editor.',
      restored: 'The original image has been restored.', failed: 'Local cleanup failed. Try a smaller selection.',
      help: 'Best for small areas on simple backgrounds. Complex textures may need more than one pass.',
      rights: 'Only edit images you own or are authorized to modify. No image is uploaded and no credit is used.',
      close: 'Close local editor',
      zoom: 'Zoom', zoomOut: 'Zoom out', zoomIn: 'Zoom in', fit: 'Fit',
      navigation: 'Scroll to move · Ctrl/⌘ + wheel to zoom',
      shortcutEmpty: 'Upload an image to start',
      shortcutReady: 'Open local cleanup',
      shortcutBatch: 'Open first image · edit each separately',
    },
    de: {
      edit: 'Lokal bereinigen', edited: 'Bereinigt', title: 'Lokale Fotobereinigung',
      subtitle: 'Markiere einen kleinen Bereich. Dein Bild bleibt in diesem Browser.',
      tool: 'Auswahlwerkzeug', brush: 'Pinsel', rectangle: 'Rechteck', size: 'Pinselgröße',
      undo: 'Rückgängig', redo: 'Wiederholen', clear: 'Markierungen löschen', apply: 'Bereinigung anwenden',
      download: 'Bereinigtes Bild laden', restore: 'Original wiederherstellen',
      ready: 'Markiere ein kleines Objekt, eine wasserzeichenähnliche Stelle, Staub oder Text.',
      noSelection: 'Markiere zuerst einen Bereich.', processing: 'Der markierte Bereich wird lokal bereinigt…',
      applied: 'Bereinigung angewendet. Du kannst einen weiteren Bereich markieren oder den Editor schließen.',
      restored: 'Das Originalbild wurde wiederhergestellt.', failed: 'Lokale Bereinigung fehlgeschlagen. Versuche eine kleinere Auswahl.',
      help: 'Am besten für kleine Bereiche auf einfachen Hintergründen. Komplexe Texturen können mehrere Durchgänge benötigen.',
      rights: 'Bearbeite nur eigene oder autorisierte Bilder. Es wird nichts hochgeladen und kein Credit verbraucht.',
      close: 'Lokalen Editor schließen',
      zoom: 'Zoom', zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', fit: 'Einpassen',
      navigation: 'Scrollen zum Bewegen · Strg/⌘ + Mausrad zum Zoomen',
      shortcutEmpty: 'Bild hochladen, um zu starten',
      shortcutReady: 'Lokale Bereinigung öffnen',
      shortcutBatch: 'Erstes Bild öffnen · einzeln bearbeiten',
    },
    es: {
      edit: 'Limpiar localmente', edited: 'Limpia', title: 'Limpieza local de fotos',
      subtitle: 'Pinta o encuadra un área pequeña. La imagen permanece en este navegador.',
      tool: 'Herramienta de selección', brush: 'Pincel', rectangle: 'Rectángulo', size: 'Tamaño del pincel',
      undo: 'Deshacer', redo: 'Rehacer', clear: 'Borrar marcas', apply: 'Aplicar limpieza',
      download: 'Descargar imagen limpia', restore: 'Restaurar original',
      ready: 'Marca un objeto pequeño, una señal tipo marca de agua, polvo o texto.',
      noSelection: 'Marca primero un área.', processing: 'Limpiando el área seleccionada localmente…',
      applied: 'Limpieza aplicada. Puedes marcar otra área o cerrar el editor.',
      restored: 'Se ha restaurado la imagen original.', failed: 'La limpieza local falló. Prueba con una selección más pequeña.',
      help: 'Funciona mejor en áreas pequeñas con fondos sencillos. Las texturas complejas pueden requerir varias pasadas.',
      rights: 'Edita solo imágenes propias o autorizadas. No se sube la imagen ni se consumen créditos.',
      close: 'Cerrar editor local',
      zoom: 'Zoom', zoomOut: 'Alejar', zoomIn: 'Acercar', fit: 'Ajustar',
      navigation: 'Desplaza para mover · Ctrl/⌘ + rueda para ampliar',
      shortcutEmpty: 'Sube una imagen para empezar',
      shortcutReady: 'Abrir limpieza local',
      shortcutBatch: 'Abrir primera imagen · editar por separado',
    },
    fr: {
      edit: 'Nettoyer localement', edited: 'Nettoyée', title: 'Nettoyage local de photo',
      subtitle: 'Peignez ou encadrez une petite zone. Votre image reste dans ce navigateur.',
      tool: 'Outil de sélection', brush: 'Pinceau', rectangle: 'Rectangle', size: 'Taille du pinceau',
      undo: 'Annuler', redo: 'Rétablir', clear: 'Effacer les marques', apply: 'Appliquer le nettoyage',
      download: 'Télécharger l’image nettoyée', restore: 'Restaurer l’original',
      ready: 'Marquez un petit objet, une marque ressemblant à un filigrane, de la poussière ou du texte.',
      noSelection: 'Marquez d’abord une zone.', processing: 'Nettoyage local de la zone sélectionnée…',
      applied: 'Nettoyage appliqué. Vous pouvez marquer une autre zone ou fermer l’éditeur.',
      restored: 'L’image originale a été restaurée.', failed: 'Le nettoyage local a échoué. Essayez une sélection plus petite.',
      help: 'Idéal pour de petites zones sur un fond simple. Les textures complexes peuvent nécessiter plusieurs passages.',
      rights: 'Modifiez uniquement vos images ou celles que vous êtes autorisé à modifier. Aucun envoi ni crédit utilisé.',
      close: 'Fermer l’éditeur local',
      zoom: 'Zoom', zoomOut: 'Réduire', zoomIn: 'Agrandir', fit: 'Ajuster',
      navigation: 'Faites défiler pour déplacer · Ctrl/⌘ + molette pour zoomer',
      shortcutEmpty: 'Importez une image pour commencer',
      shortcutReady: 'Ouvrir le nettoyage local',
      shortcutBatch: 'Ouvrir la première · modifier séparément',
    },
    'pt-BR': {
      edit: 'Limpar localmente', edited: 'Limpa', title: 'Limpeza local de foto',
      subtitle: 'Pinte ou enquadre uma área pequena. Sua imagem permanece neste navegador.',
      tool: 'Ferramenta de seleção', brush: 'Pincel', rectangle: 'Retângulo', size: 'Tamanho do pincel',
      undo: 'Desfazer', redo: 'Refazer', clear: 'Limpar marcações', apply: 'Aplicar limpeza',
      download: 'Baixar imagem limpa', restore: 'Restaurar original',
      ready: 'Marque um objeto pequeno, sinal parecido com marca-d’água, poeira ou texto.',
      noSelection: 'Marque uma área primeiro.', processing: 'Limpando a área selecionada localmente…',
      applied: 'Limpeza aplicada. Você pode marcar outra área ou fechar o editor.',
      restored: 'A imagem original foi restaurada.', failed: 'A limpeza local falhou. Tente uma seleção menor.',
      help: 'Funciona melhor em áreas pequenas e fundos simples. Texturas complexas podem exigir mais de uma aplicação.',
      rights: 'Edite apenas imagens próprias ou autorizadas. Nada é enviado e nenhum crédito é consumido.',
      close: 'Fechar editor local',
      zoom: 'Zoom', zoomOut: 'Reduzir', zoomIn: 'Ampliar', fit: 'Ajustar',
      navigation: 'Role para mover · Ctrl/⌘ + roda para ampliar',
      shortcutEmpty: 'Envie uma imagem para começar',
      shortcutReady: 'Abrir limpeza local',
      shortcutBatch: 'Abrir primeira imagem · editar separadamente',
    },
  }[language] || null;
  if (!copy) return;

  let edits = new WeakMap();
  let active = null;
  let worker = null;
  let workerSequence = 0;
  let cardButtons = [];
  const pendingWorkerJobs = new Map();
  const previewUrls = new Set();
  const shortcutButton = document.getElementById('localCleanupShortcut');

  const overlay = document.createElement('div');
  overlay.className = 'local-clean-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'localCleanTitle');
  overlay.innerHTML = `
    <div class="local-clean-dialog">
      <div class="local-clean-main">
        <div class="local-clean-head">
          <div>
            <div class="local-clean-title" id="localCleanTitle">${copy.title}</div>
            <div class="local-clean-subtitle">${copy.subtitle}</div>
          </div>
          <div class="local-clean-head-actions">
            <div class="local-clean-zoom" role="group" aria-label="${copy.zoom}">
              <button type="button" id="localCleanZoomOut" aria-label="${copy.zoomOut}">−</button>
              <button type="button" id="localCleanZoomFit">${copy.fit}</button>
              <span id="localCleanZoomValue">100%</span>
              <button type="button" id="localCleanZoomIn" aria-label="${copy.zoomIn}">+</button>
            </div>
            <button class="local-clean-close" id="localCleanClose" type="button" aria-label="${copy.close}">×</button>
          </div>
        </div>
        <div class="local-clean-stage" id="localCleanStage">
          <div class="local-clean-canvas-wrap">
            <canvas id="localCleanBase"></canvas>
            <canvas id="localCleanMask"></canvas>
            <div class="local-clean-busy" id="localCleanBusy">${copy.processing}</div>
          </div>
        </div>
      </div>
      <aside class="local-clean-side">
        <div class="local-clean-section">
          <span class="local-clean-label">${copy.tool}</span>
          <div class="local-clean-tools">
            <button class="local-clean-tool active" type="button" data-clean-tool="brush">${copy.brush}</button>
            <button class="local-clean-tool" type="button" data-clean-tool="rectangle">${copy.rectangle}</button>
          </div>
          <label class="local-clean-label" for="localCleanBrush" style="margin-top:15px">${copy.size} · <span id="localCleanBrushValue">36</span></label>
          <input class="local-clean-range" id="localCleanBrush" type="range" min="8" max="120" value="36">
          <p class="local-clean-help">${copy.navigation}</p>
        </div>
        <div class="local-clean-section">
          <div class="local-clean-row">
            <button class="local-clean-action" id="localCleanUndo" type="button">${copy.undo}</button>
            <button class="local-clean-action" id="localCleanRedo" type="button">${copy.redo}</button>
          </div>
          <button class="local-clean-action" id="localCleanClear" type="button" style="width:100%;margin-top:8px">${copy.clear}</button>
          <p class="local-clean-help">${copy.help}</p>
        </div>
        <div class="local-clean-section">
          <button class="local-clean-action primary" id="localCleanApply" type="button">${copy.apply}</button>
          <button class="local-clean-action download" id="localCleanDownload" type="button">${copy.download}</button>
          <button class="local-clean-action restore" id="localCleanRestore" type="button">${copy.restore}</button>
          <div class="local-clean-status" id="localCleanStatus" aria-live="polite">${copy.ready}</div>
        </div>
        <p class="local-clean-rights">${copy.rights}</p>
      </aside>
    </div>`;
  document.body.append(overlay);

  const baseCanvas = document.getElementById('localCleanBase');
  const maskCanvas = document.getElementById('localCleanMask');
  const stage = document.getElementById('localCleanStage');
  const canvasWrap = overlay.querySelector('.local-clean-canvas-wrap');
  const baseContext = baseCanvas.getContext('2d', { alpha: true });
  const maskContext = maskCanvas.getContext('2d');
  const status = document.getElementById('localCleanStatus');
  const busy = document.getElementById('localCleanBusy');
  const brushInput = document.getElementById('localCleanBrush');
  const applyButton = document.getElementById('localCleanApply');
  const undoButton = document.getElementById('localCleanUndo');
  const redoButton = document.getElementById('localCleanRedo');
  const clearButton = document.getElementById('localCleanClear');
  const downloadButton = document.getElementById('localCleanDownload');
  const restoreButton = document.getElementById('localCleanRestore');
  const zoomOutButton = document.getElementById('localCleanZoomOut');
  const zoomFitButton = document.getElementById('localCleanZoomFit');
  const zoomInButton = document.getElementById('localCleanZoomIn');
  const zoomValue = document.getElementById('localCleanZoomValue');

  function syncShortcut() {
    if (!shortcutButton) return;
    shortcutButton.disabled = cardButtons.length === 0;
    shortcutButton.textContent = cardButtons.length > 1
      ? copy.shortcutBatch
      : cardButtons.length === 1
        ? copy.shortcutReady
        : copy.shortcutEmpty;
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('/local-cleaner-worker.js', { type: 'module' });
    worker.addEventListener('message', (event) => {
      const job = pendingWorkerJobs.get(event.data.id);
      if (!job) return;
      pendingWorkerJobs.delete(event.data.id);
      if (event.data.error) job.reject(new Error(event.data.error));
      else job.resolve({
        rgba: new Uint8ClampedArray(event.data.rgbaBuffer),
        mask: new Uint8Array(event.data.maskBuffer),
      });
    });
    worker.addEventListener('error', () => {
      for (const job of pendingWorkerJobs.values()) job.reject(new Error(copy.failed));
      pendingWorkerJobs.clear();
      worker.terminate();
      worker = null;
    });
    return worker;
  }

  function runInpaint(imageData, mask) {
    return new Promise((resolve, reject) => {
      const id = ++workerSequence;
      pendingWorkerJobs.set(id, { resolve, reject });
      ensureWorker().postMessage({
        id,
        width: imageData.width,
        height: imageData.height,
        rgbaBuffer: imageData.data.buffer,
        maskBuffer: mask.buffer,
      }, [imageData.data.buffer, mask.buffer]);
    });
  }

  async function bitmapFrom(blob) {
    if ('createImageBitmap' in window) return createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
      return image;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function closeBitmap(bitmap) {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }

  function currentSource(file) {
    return edits.get(file)?.blob || file;
  }

  function paintMark(context, mark, width, height, mode = 'overlay', crop = null) {
    const cropX = crop?.x || 0;
    const cropY = crop?.y || 0;
    const scaleX = crop?.scaleX || width;
    const scaleY = crop?.scaleY || height;
    const x = (value) => value * scaleX - cropX;
    const y = (value) => value * scaleY - cropY;
    context.lineJoin = context.lineCap = 'round';
    context.fillStyle = mode === 'mask' ? '#fff' : 'rgba(239,68,68,.34)';
    context.strokeStyle = mode === 'mask' ? '#fff' : 'rgba(220,38,38,.72)';

    if (mark.type === 'brush') {
      context.lineWidth = Math.max(2, mark.radius * scaleX * 2);
      context.beginPath();
      mark.points.forEach((point, index) => {
        if (index) context.lineTo(x(point.x), y(point.y));
        else context.moveTo(x(point.x), y(point.y));
      });
      if (mark.points.length === 1) {
        const point = mark.points[0];
        context.lineTo(x(point.x) + 0.1, y(point.y) + 0.1);
      }
      context.stroke();
      return;
    }

    const left = x(Math.min(mark.x0, mark.x1));
    const top = y(Math.min(mark.y0, mark.y1));
    const markWidth = Math.abs(mark.x1 - mark.x0) * scaleX;
    const markHeight = Math.abs(mark.y1 - mark.y0) * scaleY;
    context.fillRect(left, top, markWidth, markHeight);
    if (mode !== 'mask') {
      context.lineWidth = Math.max(2, width / 500);
      context.strokeRect(left, top, markWidth, markHeight);
    }
  }

  function redrawMarks() {
    maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (!active) return;
    const marks = active.drawing ? [...active.marks, active.drawing] : active.marks;
    for (const mark of marks) paintMark(maskContext, mark, maskCanvas.width, maskCanvas.height);
    updateControls();
  }

  function updateControls() {
    const markCount = active?.marks.length || 0;
    undoButton.disabled = markCount === 0;
    redoButton.disabled = !active || active.redo.length === 0;
    clearButton.disabled = markCount === 0;
    applyButton.disabled = markCount === 0 || Boolean(active?.processing);
    downloadButton.disabled = !active || !edits.has(active.file) || Boolean(active.processing);
    restoreButton.disabled = !active || !edits.has(active.file) || Boolean(active.processing);
  }

  function applyZoom() {
    if (!active || !stage.clientWidth || !stage.clientHeight) return;
    const style = getComputedStyle(stage);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableWidth = Math.max(1, stage.clientWidth - horizontalPadding);
    const availableHeight = Math.max(1, stage.clientHeight - verticalPadding);
    const fitScale = Math.min(
      availableWidth / baseCanvas.width,
      availableHeight / baseCanvas.height,
    );
    const displayScale = fitScale * active.zoom;
    const displayWidth = Math.max(1, Math.round(baseCanvas.width * displayScale));
    const displayHeight = Math.max(1, Math.round(baseCanvas.height * displayScale));
    canvasWrap.style.width = `${displayWidth}px`;
    canvasWrap.style.height = `${displayHeight}px`;
    canvasWrap.style.marginLeft = `${Math.max(0, (availableWidth - displayWidth) / 2)}px`;
    canvasWrap.style.marginRight = `${Math.max(0, (availableWidth - displayWidth) / 2)}px`;
    canvasWrap.style.marginTop = `${Math.max(0, (availableHeight - displayHeight) / 2)}px`;
    canvasWrap.style.marginBottom = `${Math.max(0, (availableHeight - displayHeight) / 2)}px`;
    zoomValue.textContent = `${Math.round(active.zoom * 100)}%`;
    zoomOutButton.disabled = active.zoom <= 0.25;
    zoomInButton.disabled = active.zoom >= 5;
  }

  function setZoom(nextZoom, anchor = null) {
    if (!active) return;
    const oldRect = canvasWrap.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const anchorX = anchor?.x ?? (stageRect.left + stageRect.width / 2);
    const anchorY = anchor?.y ?? (stageRect.top + stageRect.height / 2);
    const imageX = oldRect.width ? (anchorX - oldRect.left) / oldRect.width : 0.5;
    const imageY = oldRect.height ? (anchorY - oldRect.top) / oldRect.height : 0.5;
    active.zoom = Math.max(0.25, Math.min(5, nextZoom));
    applyZoom();
    const newRect = canvasWrap.getBoundingClientRect();
    stage.scrollLeft += (newRect.left + imageX * newRect.width) - anchorX;
    stage.scrollTop += (newRect.top + imageY * newRect.height) - anchorY;
  }

  function pointerPosition(event) {
    const rect = maskCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function beginDrawing(event) {
    if (!active || active.processing) return;
    event.preventDefault();
    maskCanvas.setPointerCapture?.(event.pointerId);
    const point = pointerPosition(event);
    active.pointerId = event.pointerId;
    active.redo = [];
    if (active.tool === 'brush') {
      const rect = maskCanvas.getBoundingClientRect();
      active.drawing = {
        type: 'brush',
        radius: Number(brushInput.value) / Math.max(1, rect.width),
        points: [point],
      };
    } else {
      active.drawing = { type: 'rectangle', x0: point.x, y0: point.y, x1: point.x, y1: point.y };
    }
    redrawMarks();
  }

  function continueDrawing(event) {
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const point = pointerPosition(event);
    if (active.drawing.type === 'brush') active.drawing.points.push(point);
    else {
      active.drawing.x1 = point.x;
      active.drawing.y1 = point.y;
    }
    redrawMarks();
  }

  function endDrawing(event) {
    if (!active?.drawing || event.pointerId !== active.pointerId) return;
    const drawing = active.drawing;
    active.drawing = null;
    active.pointerId = null;
    if (drawing.type === 'brush' || (
      Math.abs(drawing.x1 - drawing.x0) > 0.004
      && Math.abs(drawing.y1 - drawing.y0) > 0.004
    )) active.marks.push(drawing);
    redrawMarks();
  }

  function markBounds(marks, width, height) {
    let left = 1;
    let top = 1;
    let right = 0;
    let bottom = 0;
    for (const mark of marks) {
      if (mark.type === 'brush') {
        for (const point of mark.points) {
          left = Math.min(left, point.x - mark.radius);
          top = Math.min(top, point.y - mark.radius);
          right = Math.max(right, point.x + mark.radius);
          bottom = Math.max(bottom, point.y + mark.radius);
        }
      } else {
        left = Math.min(left, mark.x0, mark.x1);
        top = Math.min(top, mark.y0, mark.y1);
        right = Math.max(right, mark.x0, mark.x1);
        bottom = Math.max(bottom, mark.y0, mark.y1);
      }
    }
    const markWidth = Math.max(1, (right - left) * width);
    const markHeight = Math.max(1, (bottom - top) * height);
    const padding = Math.max(32, Math.min(320, Math.max(markWidth, markHeight) * 0.7));
    const x0 = Math.max(0, Math.floor(left * width - padding));
    const y0 = Math.max(0, Math.floor(top * height - padding));
    const x1 = Math.min(width, Math.ceil(right * width + padding));
    const y1 = Math.min(height, Math.ceil(bottom * height + padding));
    return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(copy.failed));
      }, 'image/png');
    });
  }

  async function applyCleanup() {
    if (!active?.marks.length || active.processing) {
      status.textContent = copy.noSelection;
      return;
    }
    active.processing = true;
    busy.classList.add('visible');
    status.textContent = copy.processing;
    updateControls();

    try {
      const sourceWidth = active.bitmap.width || active.bitmap.naturalWidth;
      const sourceHeight = active.bitmap.height || active.bitmap.naturalHeight;
      const crop = markBounds(active.marks, sourceWidth, sourceHeight);
      const scale = Math.min(1, 768 / Math.max(crop.width, crop.height));
      const workWidth = Math.max(1, Math.round(crop.width * scale));
      const workHeight = Math.max(1, Math.round(crop.height * scale));
      const workCanvas = document.createElement('canvas');
      workCanvas.width = workWidth;
      workCanvas.height = workHeight;
      const workContext = workCanvas.getContext('2d', { alpha: true, willReadFrequently: true });
      workContext.imageSmoothingQuality = 'high';
      workContext.drawImage(
        active.bitmap,
        crop.x, crop.y, crop.width, crop.height,
        0, 0, workWidth, workHeight,
      );
      const imageData = workContext.getImageData(0, 0, workWidth, workHeight);

      const maskWork = document.createElement('canvas');
      maskWork.width = workWidth;
      maskWork.height = workHeight;
      const maskWorkContext = maskWork.getContext('2d', { willReadFrequently: true });
      maskWorkContext.fillStyle = '#000';
      maskWorkContext.fillRect(0, 0, workWidth, workHeight);
      for (const mark of active.marks) {
        paintMark(maskWorkContext, mark, workWidth, workHeight, 'mask', {
          x: crop.x * scale,
          y: crop.y * scale,
          scaleX: sourceWidth * scale,
          scaleY: sourceHeight * scale,
        });
      }
      const maskPixels = maskWorkContext.getImageData(0, 0, workWidth, workHeight).data;
      const mask = new Uint8Array(workWidth * workHeight);
      for (let index = 0; index < mask.length; index += 1) mask[index] = maskPixels[index * 4] > 127 ? 1 : 0;

      const result = await runInpaint(imageData, mask);
      workContext.putImageData(new ImageData(result.rgba, workWidth, workHeight), 0, 0);

      const compositeMask = document.createElement('canvas');
      compositeMask.width = workWidth;
      compositeMask.height = workHeight;
      const compositeMaskContext = compositeMask.getContext('2d');
      const compositeMaskPixels = compositeMaskContext.createImageData(workWidth, workHeight);
      for (let index = 0; index < result.mask.length; index += 1) {
        compositeMaskPixels.data[index * 4] = 255;
        compositeMaskPixels.data[index * 4 + 1] = 255;
        compositeMaskPixels.data[index * 4 + 2] = 255;
        compositeMaskPixels.data[index * 4 + 3] = result.mask[index] ? 255 : 0;
      }
      compositeMaskContext.putImageData(compositeMaskPixels, 0, 0);

      const repairedArea = document.createElement('canvas');
      repairedArea.width = workWidth;
      repairedArea.height = workHeight;
      const repairedAreaContext = repairedArea.getContext('2d', { alpha: true });
      repairedAreaContext.drawImage(workCanvas, 0, 0);
      repairedAreaContext.globalCompositeOperation = 'destination-in';
      repairedAreaContext.drawImage(compositeMask, 0, 0);

      const output = document.createElement('canvas');
      output.width = sourceWidth;
      output.height = sourceHeight;
      const outputContext = output.getContext('2d', { alpha: true });
      outputContext.drawImage(active.bitmap, 0, 0);
      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = 'high';
      outputContext.drawImage(repairedArea, crop.x, crop.y, crop.width, crop.height);
      const blob = await canvasBlob(output);

      const previous = edits.get(active.file);
      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl);
        previewUrls.delete(previous.previewUrl);
      }
      const previewUrl = URL.createObjectURL(blob);
      previewUrls.add(previewUrl);
      edits.set(active.file, { blob, previewUrl });
      active.button.classList.add('edited');
      active.button.textContent = copy.edited;
      active.onApply?.({ blob, previewUrl, restored: false, index: active.index });

      closeBitmap(active.bitmap);
      active.bitmap = await bitmapFrom(blob);
      drawActiveBitmap();
      active.marks = [];
      active.redo = [];
      redrawMarks();
      status.textContent = copy.applied;
    } catch (error) {
      console.error('local cleanup', error);
      status.textContent = copy.failed;
    } finally {
      active.processing = false;
      busy.classList.remove('visible');
      updateControls();
    }
  }

  function drawActiveBitmap() {
    const sourceWidth = active.bitmap.width || active.bitmap.naturalWidth;
    const sourceHeight = active.bitmap.height || active.bitmap.naturalHeight;
    const scale = Math.min(1, 1600 / Math.max(sourceWidth, sourceHeight));
    baseCanvas.width = maskCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
    baseCanvas.height = maskCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
    baseContext.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
    baseContext.imageSmoothingQuality = 'high';
    baseContext.drawImage(active.bitmap, 0, 0, baseCanvas.width, baseCanvas.height);
    applyZoom();
  }

  async function openEditor(file, index, button, onApply) {
    closeBitmap(active?.bitmap);
    active = {
      file, index, button, onApply, bitmap: await bitmapFrom(currentSource(file)),
      marks: [], redo: [], drawing: null, pointerId: null, tool: 'brush', processing: false, zoom: 1,
    };
    document.querySelectorAll('[data-clean-tool]').forEach((element) => {
      element.classList.toggle('active', element.dataset.cleanTool === 'brush');
    });
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    drawActiveBitmap();
    redrawMarks();
    status.textContent = copy.ready;
    updateControls();
  }

  function closeEditor() {
    if (active?.processing) return;
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
    closeBitmap(active?.bitmap);
    active = null;
  }

  function restoreOriginal() {
    if (!active || !edits.has(active.file)) return;
    const previous = edits.get(active.file);
    if (previous.previewUrl) {
      URL.revokeObjectURL(previous.previewUrl);
      previewUrls.delete(previous.previewUrl);
    }
    edits.delete(active.file);
    active.button.classList.remove('edited');
    active.button.textContent = copy.edit;
    const previewUrl = URL.createObjectURL(active.file);
    previewUrls.add(previewUrl);
    active.onApply?.({ blob: active.file, previewUrl, restored: true, index: active.index });
    closeBitmap(active.bitmap);
    bitmapFrom(active.file).then((bitmap) => {
      if (!active) return closeBitmap(bitmap);
      active.bitmap = bitmap;
      active.marks = [];
      active.redo = [];
      drawActiveBitmap();
      redrawMarks();
      status.textContent = copy.restored;
      updateControls();
    });
  }

  function downloadCleaned() {
    if (!active) return;
    const edit = edits.get(active.file);
    if (!edit) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(edit.blob);
    const baseName = active.file.name.replace(/\.[^.]+$/, '') || 'product';
    link.download = `${baseName}-cleaned.png`;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }

  maskCanvas.addEventListener('pointerdown', beginDrawing);
  maskCanvas.addEventListener('pointermove', continueDrawing);
  maskCanvas.addEventListener('pointerup', endDrawing);
  maskCanvas.addEventListener('pointercancel', endDrawing);
  document.getElementById('localCleanClose').addEventListener('click', closeEditor);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeEditor(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay.classList.contains('visible')) closeEditor(); });
  brushInput.addEventListener('input', () => {
    document.getElementById('localCleanBrushValue').textContent = brushInput.value;
  });
  zoomOutButton.addEventListener('click', () => setZoom((active?.zoom || 1) / 1.25));
  zoomFitButton.addEventListener('click', () => setZoom(1));
  zoomInButton.addEventListener('click', () => setZoom((active?.zoom || 1) * 1.25));
  stage.addEventListener('wheel', (event) => {
    if (!active || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(active.zoom * factor, { x: event.clientX, y: event.clientY });
  }, { passive: false });
  window.addEventListener('resize', () => {
    if (active && overlay.classList.contains('visible')) applyZoom();
  });
  document.querySelectorAll('[data-clean-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!active) return;
      active.tool = button.dataset.cleanTool;
      document.querySelectorAll('[data-clean-tool]').forEach((item) => item.classList.toggle('active', item === button));
    });
  });
  undoButton.addEventListener('click', () => {
    if (!active?.marks.length) return;
    active.redo.push(active.marks.pop());
    redrawMarks();
  });
  redoButton.addEventListener('click', () => {
    if (!active?.redo.length) return;
    active.marks.push(active.redo.pop());
    redrawMarks();
  });
  clearButton.addEventListener('click', () => {
    if (!active) return;
    active.redo.push(...active.marks.splice(0));
    redrawMarks();
  });
  applyButton.addEventListener('click', applyCleanup);
  downloadButton.addEventListener('click', downloadCleaned);
  restoreButton.addEventListener('click', restoreOriginal);
  shortcutButton?.addEventListener('click', () => {
    cardButtons = cardButtons.filter((button) => button.isConnected);
    syncShortcut();
    cardButtons[0]?.click();
  });

  window.ShopBGLocalCleaner = {
    clearAll() {
      for (const url of previewUrls) URL.revokeObjectURL(url);
      previewUrls.clear();
      edits = new WeakMap();
      cardButtons = [];
      syncShortcut();
    },
    decorateCard(card, file, index, options = {}) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'local-clean-card-btn';
      button.textContent = copy.edit;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(file, index, button, options.onApply);
      });
      card.append(button);
      cardButtons.push(button);
      syncShortcut();
      return button;
    },
    getSourceFile(file) {
      return currentSource(file);
    },
    hasEdit(file) {
      return edits.has(file);
    },
  };
  syncShortcut();
})();
