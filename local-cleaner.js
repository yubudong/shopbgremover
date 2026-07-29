(() => {
  'use strict';

  const rawLanguage = (document.documentElement.lang || 'en').toLowerCase();
  const language = rawLanguage === 'zh-cn' ? 'zh-CN' : rawLanguage === 'pt-br' ? 'pt-BR' : rawLanguage;
  const copies = {
    en: {
      edit: 'AI cleanup', edited: 'AI cleaned', title: 'AI precise cleanup',
      subtitle: 'Brush or frame an area. LaMa reconstructs it on our private server.',
      tool: 'Selection tool', brush: 'Brush', rectangle: 'Rectangle', size: 'Brush size',
      undo: 'Undo', redo: 'Redo', clear: 'Clear marks', apply: 'Clean current image',
      download: 'Download cleaned image', downloadBatch: 'Download this batch as ZIP', restore: 'Restore original',
      ready: 'Mark an object, watermark-like mark, dust spot or text to remove.',
      noSelection: 'Mark an area first.', processing: 'Uploading privately and waiting for AI cleanup…',
      applied: 'AI cleanup completed. The server result copy has been deleted.',
      restored: 'The original image has been restored.', failed: 'AI cleanup did not finish. You can retry without losing your images.',
      help: 'Use a close-fitting mark. Large covered product details may be reconstructed differently from the original.',
      rights: 'Only edit images you own or are authorized to modify. A derived image and mask are temporarily uploaded to private storage, deleted after browser recovery, and retained for no more than 24 hours. AI cleanup is free and uses no credits.',
      close: 'Close AI editor', zoom: 'Zoom', zoomOut: 'Zoom out', zoomIn: 'Zoom in', fit: 'Fit',
      navigation: 'Scroll to move · Ctrl/⌘ + wheel to zoom',
      imageNavigation: 'Batch image navigation', previousImage: 'Previous', nextImage: 'Next',
      imagePosition: '{current} of {count}', imageNavigationHint: 'Use ← and → to switch images',
      shortcutEmpty: 'Upload an image to start', shortcutReady: 'Open AI cleanup',
      shortcutBatch: 'Open AI cleanup · batch position available',
      batchApply: 'Apply same marks to all {count} images',
      batchNote: 'Uses the same relative position on every image. Best when image sizes and watermark placement match.',
      batchProcessing: 'Uploading image {current} of {count} in order…',
      batchApplied: 'AI cleanup completed for all {count} images.',
      batchPartial: 'AI cleanup completed for {success} of {count} images. Retry the remaining images.',
      awaiting: 'Waiting in the private processing queue…', recovering: 'Restoring your unfinished AI cleanup batch…',
      unavailable: 'AI cleanup is temporarily unavailable. Please try again later.',
      tooLarge: 'This image cannot be prepared within the 10 MB and 2048 px limits.',
      cleanupPending: 'The result is saved in this browser, but server deletion needs another retry.',
    },
    de: {
      edit: 'KI-Bereinigung', edited: 'KI-bereinigt', title: 'Präzise KI-Bereinigung',
      subtitle: 'Markiere einen Bereich. LaMa rekonstruiert ihn auf unserem privaten Server.',
      tool: 'Auswahlwerkzeug', brush: 'Pinsel', rectangle: 'Rechteck', size: 'Pinselgröße',
      undo: 'Rückgängig', redo: 'Wiederholen', clear: 'Markierungen löschen', apply: 'Aktuelles Bild bereinigen',
      download: 'Bereinigtes Bild laden', downloadBatch: 'Diesen Stapel als ZIP laden', restore: 'Original wiederherstellen',
      ready: 'Markiere ein Objekt, eine wasserzeichenähnliche Stelle, Staub oder Text.',
      noSelection: 'Markiere zuerst einen Bereich.', processing: 'Privater Upload und KI-Bereinigung laufen…',
      applied: 'KI-Bereinigung abgeschlossen. Die Serverkopie wurde gelöscht.',
      restored: 'Das Originalbild wurde wiederhergestellt.', failed: 'Die KI-Bereinigung wurde nicht abgeschlossen. Du kannst es erneut versuchen.',
      help: 'Markiere möglichst knapp. Große verdeckte Produktdetails können anders rekonstruiert werden.',
      rights: 'Bearbeite nur eigene oder autorisierte Bilder. Bild und Maske werden vorübergehend privat hochgeladen, nach der Wiederherstellung gelöscht und höchstens 24 Stunden gespeichert. Die KI-Bereinigung ist kostenlos und verbraucht keine Credits.',
      close: 'KI-Editor schließen', zoom: 'Zoom', zoomOut: 'Verkleinern', zoomIn: 'Vergrößern', fit: 'Einpassen',
      navigation: 'Scrollen zum Bewegen · Strg/⌘ + Mausrad zum Zoomen',
      imageNavigation: 'Bildnavigation im Stapel', previousImage: 'Zurück', nextImage: 'Weiter',
      imagePosition: '{current} von {count}', imageNavigationHint: 'Mit ← und → zwischen Bildern wechseln',
      shortcutEmpty: 'Bild hochladen, um zu starten', shortcutReady: 'KI-Bereinigung öffnen',
      shortcutBatch: 'KI-Bereinigung · Stapelposition verfügbar',
      batchApply: 'Gleiche Markierungen auf alle {count} Bilder anwenden',
      batchNote: 'Verwendet dieselbe relative Position für alle Bilder. Ideal bei gleicher Größe und Wasserzeichenposition.',
      batchProcessing: 'Bild {current} von {count} wird nacheinander hochgeladen…',
      batchApplied: 'KI-Bereinigung für alle {count} Bilder abgeschlossen.',
      batchPartial: '{success} von {count} Bildern wurden bereinigt. Versuche die übrigen erneut.',
      awaiting: 'Warten in der privaten Verarbeitungsschlange…', recovering: 'Unvollständigen KI-Stapel wiederherstellen…',
      unavailable: 'Die KI-Bereinigung ist vorübergehend nicht verfügbar.', tooLarge: 'Das Bild passt nicht in die Grenzen von 10 MB und 2048 px.',
      cleanupPending: 'Das Ergebnis ist im Browser gespeichert, die Serverlöschung muss erneut versucht werden.',
    },
    es: {
      edit: 'Limpieza con IA', edited: 'Limpia con IA', title: 'Limpieza precisa con IA',
      subtitle: 'Pinta o encuadra un área. LaMa la reconstruye en nuestro servidor privado.',
      tool: 'Herramienta de selección', brush: 'Pincel', rectangle: 'Rectángulo', size: 'Tamaño del pincel',
      undo: 'Deshacer', redo: 'Rehacer', clear: 'Borrar marcas', apply: 'Limpiar imagen actual',
      download: 'Descargar imagen limpia', downloadBatch: 'Descargar este lote en ZIP', restore: 'Restaurar original',
      ready: 'Marca un objeto, una señal tipo marca de agua, polvo o texto.',
      noSelection: 'Marca primero un área.', processing: 'Subiendo de forma privada y esperando la limpieza con IA…',
      applied: 'Limpieza con IA terminada. La copia del servidor se eliminó.',
      restored: 'Se ha restaurado la imagen original.', failed: 'La limpieza con IA no terminó. Puedes volver a intentarlo.',
      help: 'Ajusta bien la marca. Los detalles grandes cubiertos pueden reconstruirse de forma distinta.',
      rights: 'Edita solo imágenes propias o autorizadas. La imagen derivada y la máscara se suben temporalmente a almacenamiento privado, se borran tras la recuperación y se conservan como máximo 24 horas. La limpieza es gratis y no consume créditos.',
      close: 'Cerrar editor de IA', zoom: 'Zoom', zoomOut: 'Alejar', zoomIn: 'Acercar', fit: 'Ajustar',
      navigation: 'Desplaza para mover · Ctrl/⌘ + rueda para ampliar',
      imageNavigation: 'Navegación de imágenes del lote', previousImage: 'Anterior', nextImage: 'Siguiente',
      imagePosition: '{current} de {count}', imageNavigationHint: 'Usa ← y → para cambiar de imagen',
      shortcutEmpty: 'Sube una imagen para empezar', shortcutReady: 'Abrir limpieza con IA',
      shortcutBatch: 'Limpieza con IA · posición por lote',
      batchApply: 'Aplicar las mismas marcas a las {count} imágenes',
      batchNote: 'Usa la misma posición relativa en todas las imágenes. Ideal si el tamaño y la marca coinciden.',
      batchProcessing: 'Subiendo en orden la imagen {current} de {count}…',
      batchApplied: 'Limpieza con IA terminada para las {count} imágenes.',
      batchPartial: 'Se limpiaron {success} de {count} imágenes. Reintenta las restantes.',
      awaiting: 'Esperando en la cola privada…', recovering: 'Recuperando el lote de IA sin terminar…',
      unavailable: 'La limpieza con IA no está disponible temporalmente.', tooLarge: 'La imagen no cabe en los límites de 10 MB y 2048 px.',
      cleanupPending: 'El resultado está guardado en el navegador, pero debe reintentarse el borrado del servidor.',
    },
    fr: {
      edit: 'Nettoyage IA', edited: 'Nettoyée par IA', title: 'Nettoyage précis par IA',
      subtitle: 'Peignez ou encadrez une zone. LaMa la reconstruit sur notre serveur privé.',
      tool: 'Outil de sélection', brush: 'Pinceau', rectangle: 'Rectangle', size: 'Taille du pinceau',
      undo: 'Annuler', redo: 'Rétablir', clear: 'Effacer les marques', apply: 'Nettoyer l’image actuelle',
      download: 'Télécharger l’image nettoyée', downloadBatch: 'Télécharger ce lot en ZIP', restore: 'Restaurer l’original',
      ready: 'Marquez un objet, une trace de filigrane, de la poussière ou du texte.',
      noSelection: 'Marquez d’abord une zone.', processing: 'Téléversement privé et nettoyage IA en cours…',
      applied: 'Nettoyage IA terminé. La copie serveur a été supprimée.',
      restored: 'L’image originale a été restaurée.', failed: 'Le nettoyage IA n’est pas terminé. Vous pouvez réessayer.',
      help: 'Serrez la sélection. Les grands détails masqués peuvent être reconstruits différemment.',
      rights: 'Modifiez uniquement vos images ou celles autorisées. L’image dérivée et le masque sont téléversés temporairement dans un stockage privé, supprimés après récupération et conservés au maximum 24 heures. Le nettoyage IA est gratuit et sans crédit.',
      close: 'Fermer l’éditeur IA', zoom: 'Zoom', zoomOut: 'Réduire', zoomIn: 'Agrandir', fit: 'Ajuster',
      navigation: 'Faites défiler pour déplacer · Ctrl/⌘ + molette pour zoomer',
      imageNavigation: 'Navigation des images du lot', previousImage: 'Précédente', nextImage: 'Suivante',
      imagePosition: '{current} sur {count}', imageNavigationHint: 'Utilisez ← et → pour changer d’image',
      shortcutEmpty: 'Importez une image pour commencer', shortcutReady: 'Ouvrir le nettoyage IA',
      shortcutBatch: 'Nettoyage IA · position groupée',
      batchApply: 'Appliquer les mêmes marques aux {count} images',
      batchNote: 'Utilise la même position relative sur toutes les images. Idéal si dimensions et filigrane concordent.',
      batchProcessing: 'Téléversement séquentiel de l’image {current} sur {count}…',
      batchApplied: 'Nettoyage IA terminé pour les {count} images.',
      batchPartial: '{success} images sur {count} ont été nettoyées. Réessayez les autres.',
      awaiting: 'En attente dans la file privée…', recovering: 'Récupération du lot IA inachevé…',
      unavailable: 'Le nettoyage IA est temporairement indisponible.', tooLarge: 'Cette image dépasse les limites de 10 Mo et 2048 px.',
      cleanupPending: 'Le résultat est enregistré dans le navigateur, mais la suppression serveur doit être retentée.',
    },
    'pt-BR': {
      edit: 'Limpeza com IA', edited: 'Limpa por IA', title: 'Limpeza precisa com IA',
      subtitle: 'Pinte ou enquadre uma área. O LaMa a reconstrói em nosso servidor privado.',
      tool: 'Ferramenta de seleção', brush: 'Pincel', rectangle: 'Retângulo', size: 'Tamanho do pincel',
      undo: 'Desfazer', redo: 'Refazer', clear: 'Limpar marcações', apply: 'Limpar imagem atual',
      download: 'Baixar imagem limpa', downloadBatch: 'Baixar este lote em ZIP', restore: 'Restaurar original',
      ready: 'Marque um objeto, sinal parecido com marca-d’água, poeira ou texto.',
      noSelection: 'Marque uma área primeiro.', processing: 'Enviando de forma privada e aguardando a limpeza com IA…',
      applied: 'Limpeza com IA concluída. A cópia do servidor foi apagada.',
      restored: 'A imagem original foi restaurada.', failed: 'A limpeza com IA não terminou. Você pode tentar novamente.',
      help: 'Marque de forma justa. Grandes detalhes cobertos podem ser reconstruídos de modo diferente.',
      rights: 'Edite apenas imagens próprias ou autorizadas. A imagem derivada e a máscara são enviadas temporariamente ao armazenamento privado, apagadas após a recuperação e mantidas por no máximo 24 horas. A limpeza é grátis e não usa créditos.',
      close: 'Fechar editor de IA', zoom: 'Zoom', zoomOut: 'Reduzir', zoomIn: 'Ampliar', fit: 'Ajustar',
      navigation: 'Role para mover · Ctrl/⌘ + roda para ampliar',
      imageNavigation: 'Navegação de imagens do lote', previousImage: 'Anterior', nextImage: 'Próxima',
      imagePosition: '{current} de {count}', imageNavigationHint: 'Use ← e → para trocar de imagem',
      shortcutEmpty: 'Envie uma imagem para começar', shortcutReady: 'Abrir limpeza com IA',
      shortcutBatch: 'Limpeza com IA · posição em lote',
      batchApply: 'Aplicar as mesmas marcações às {count} imagens',
      batchNote: 'Usa a mesma posição relativa em todas as imagens. Ideal quando tamanho e marca-d’água coincidem.',
      batchProcessing: 'Enviando em ordem a imagem {current} de {count}…',
      batchApplied: 'Limpeza com IA concluída nas {count} imagens.',
      batchPartial: '{success} de {count} imagens foram limpas. Tente novamente nas restantes.',
      awaiting: 'Aguardando na fila privada…', recovering: 'Recuperando o lote de IA inacabado…',
      unavailable: 'A limpeza com IA está temporariamente indisponível.', tooLarge: 'A imagem excede os limites de 10 MB e 2048 px.',
      cleanupPending: 'O resultado está salvo no navegador, mas a exclusão no servidor precisa ser tentada novamente.',
    },
    'zh-CN': {
      edit: 'AI 精细清除', edited: 'AI 已清除', title: 'AI 精细去物体 / 水印',
      subtitle: '涂抹或框选区域，由私有服务器上的 LaMa 模型完成修复。',
      tool: '选择工具', brush: '画笔', rectangle: '矩形框', size: '画笔大小',
      undo: '撤销', redo: '重做', clear: '清除标记', apply: 'AI 清除当前图片',
      download: '下载已清除图片', downloadBatch: '下载本批 ZIP', restore: '恢复原图',
      ready: '请完整标记要移除的物体、水印痕迹、灰尘或文字。',
      noSelection: '请先标记一个区域。', processing: '正在私密上传并等待 AI 清除…',
      applied: 'AI 清除已完成，服务器结果副本已删除。',
      restored: '已恢复原始图片。', failed: 'AI 清除未完成，你可以重试，原图不会丢失。',
      help: '标记请尽量贴合目标。被大面积遮挡的商品细节可能无法还原成原样。',
      rights: '请只编辑你拥有或已获授权的图片。原图派生文件和蒙版会临时上传到私有存储；结果写回本浏览器后立即删除，异常时最长保留 24 小时。AI 清除完全免费，不扣积分。',
      close: '关闭 AI 编辑器', zoom: '缩放', zoomOut: '缩小', zoomIn: '放大', fit: '适应窗口',
      navigation: '滚动查看图片 · Ctrl/⌘ + 滚轮缩放',
      imageNavigation: '本批图片切换', previousImage: '上一张', nextImage: '下一张',
      imagePosition: '第 {current} / {count} 张', imageNavigationHint: '也可以按键盘 ← → 切换',
      shortcutEmpty: '上传图片后开始', shortcutReady: '打开 AI 精细清除',
      shortcutBatch: '打开 AI 精细清除 · 可批量套用位置',
      batchApply: '将相同标记应用到本批 {count} 张图片',
      batchNote: '会按相同相对位置处理本批全部图片。仅适合图片比例和水印位置一致的情况。',
      batchProcessing: '正在按顺序上传第 {current} / {count} 张图片…',
      batchApplied: '本批 {count} 张图片已完成 AI 清除。',
      batchPartial: '已完成 {success} / {count} 张，其余图片可以重试。',
      awaiting: '正在私有处理队列中等待…', recovering: '正在恢复上次未完成的 AI 清除批次…',
      unavailable: 'AI 精细清除暂时不可用，请稍后重试。', tooLarge: '图片无法压缩到 10MB、长边 2048px 的处理限制内。',
      cleanupPending: '结果已保存在浏览器，但服务器副本删除需要再次重试。',
    },
  };
  const copy = copies[language] || copies.en;
  const cancelCopy = {
    en: { button: 'Cancel this batch', done: 'This AI cleanup batch was cancelled.' },
    de: { button: 'Diesen Stapel abbrechen', done: 'Dieser KI-Stapel wurde abgebrochen.' },
    es: { button: 'Cancelar este lote', done: 'Este lote de IA fue cancelado.' },
    fr: { button: 'Annuler ce lot', done: 'Ce lot IA a été annulé.' },
    'pt-BR': { button: 'Cancelar este lote', done: 'Este lote de IA foi cancelado.' },
    'zh-CN': { button: '取消本批处理', done: '本批 AI 清除已取消。' },
  }[language] || { button: 'Cancel this batch', done: 'This AI cleanup batch was cancelled.' };
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_SIDE = 2048;
  const MAX_POLLS = 1800;
  const POLL_DELAY_MS = 1200;
  const ACTIVE_BATCH_KEY = 'shopbg-inpaint-active-v1';
  const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
  const shortcutButton = document.getElementById('localCleanupShortcut');

  let edits = new WeakMap();
  let active = null;
  let cardEntries = [];
  let lastBatchEntries = [];
  let recoveryTimer = null;
  let batchRunning = false;
  let editorSwitching = false;
  let editorLoadToken = 0;
  let serviceEnabled = true;
  let editorDrafts = new WeakMap();
  const previewUrls = new Set();

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
        <div class="local-clean-image-nav" role="group" aria-label="${copy.imageNavigation}">
          <button type="button" id="localCleanPrevious" aria-keyshortcuts="ArrowLeft">← ${copy.previousImage}</button>
          <div class="local-clean-image-meta">
            <strong id="localCleanImagePosition"></strong>
            <span id="localCleanImageName"></span>
            <small>${copy.imageNavigationHint}</small>
          </div>
          <button type="button" id="localCleanNext" aria-keyshortcuts="ArrowRight">${copy.nextImage} →</button>
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
          <button class="local-clean-action batch" id="localCleanApplyBatch" type="button" hidden></button>
          <p class="local-clean-batch-note" id="localCleanBatchNote" hidden>${copy.batchNote}</p>
          <button class="local-clean-action cancel" id="localCleanCancelBatch" type="button" hidden>${cancelCopy.button}</button>
          <button class="local-clean-action download" id="localCleanDownload" type="button">${copy.download}</button>
          <button class="local-clean-action zip" id="localCleanDownloadBatch" type="button" hidden>${copy.downloadBatch}</button>
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
  const batchButton = document.getElementById('localCleanApplyBatch');
  const batchNote = document.getElementById('localCleanBatchNote');
  const cancelBatchButton = document.getElementById('localCleanCancelBatch');
  const undoButton = document.getElementById('localCleanUndo');
  const redoButton = document.getElementById('localCleanRedo');
  const clearButton = document.getElementById('localCleanClear');
  const downloadButton = document.getElementById('localCleanDownload');
  const downloadBatchButton = document.getElementById('localCleanDownloadBatch');
  const restoreButton = document.getElementById('localCleanRestore');
  const zoomOutButton = document.getElementById('localCleanZoomOut');
  const zoomFitButton = document.getElementById('localCleanZoomFit');
  const zoomInButton = document.getElementById('localCleanZoomIn');
  const zoomValue = document.getElementById('localCleanZoomValue');
  const previousImageButton = document.getElementById('localCleanPrevious');
  const nextImageButton = document.getElementById('localCleanNext');
  const imagePosition = document.getElementById('localCleanImagePosition');
  const imageName = document.getElementById('localCleanImageName');
  const inpaintApiBase = typeof API === 'string'
    ? API.replace(/\/+$/, '')
    : (location.hostname === 'www.shopbgremover.com'
      ? 'https://api.shopbgremover.com'
      : '');

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  const apiUrl = (path) => `${inpaintApiBase}${path}`;
  const formatCopy = (template, values) => Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
  const connectedEntries = () => {
    cardEntries = cardEntries.filter((entry) => entry.button.isConnected);
    return cardEntries;
  };
  const fileKey = (file) => `${file.name}:${file.size}:${file.lastModified || 0}`;
  const cloneMarks = (marks) => marks.map((mark) => mark.type === 'brush'
    ? { ...mark, points: mark.points.map((point) => ({ ...point })) }
    : { ...mark });
  const currentSource = (file) => edits.get(file)?.blob || file;

  function activeEntryPosition(entries = connectedEntries()) {
    if (!active) return -1;
    return entries.findIndex((entry) => entry === active.entry || entry.file === active.file);
  }

  function saveActiveDraft() {
    if (!active) return;
    editorDrafts.set(active.file, {
      marks: cloneMarks(active.marks),
      redo: cloneMarks(active.redo),
      tool: active.tool,
      zoom: active.zoom,
    });
  }

  function deviceId() {
    let value = localStorage.getItem('sbgrDeviceId');
    if (!value) {
      value = crypto.randomUUID();
      localStorage.setItem('sbgrDeviceId', value);
    }
    return value;
  }

  async function apiJson(path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set('X-Device-ID', deviceId());
    const response = await fetch(apiUrl(path), {
      ...init,
      headers,
      credentials: 'include',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || copy.failed);
      error.status = response.status;
      error.code = payload.code || null;
      throw error;
    }
    return payload;
  }

  function readActiveBatch() {
    try {
      return JSON.parse(localStorage.getItem(ACTIVE_BATCH_KEY) || 'null');
    } catch {
      localStorage.removeItem(ACTIVE_BATCH_KEY);
      return null;
    }
  }

  function writeActiveBatch(record) {
    localStorage.setItem(ACTIVE_BATCH_KEY, JSON.stringify(record));
  }

  function syncShortcut() {
    if (!shortcutButton) return;
    const count = connectedEntries().length;
    shortcutButton.disabled = count === 0 || !serviceEnabled || batchRunning;
    shortcutButton.textContent = !serviceEnabled
      ? copy.unavailable
      : batchRunning
        ? copy.recovering
        : count > 1
          ? copy.shortcutBatch
          : count === 1 ? copy.shortcutReady : copy.shortcutEmpty;
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

  function paintMark(context, mark, width, height, mode = 'overlay') {
    const x = (value) => value * width;
    const y = (value) => value * height;
    context.lineJoin = context.lineCap = 'round';
    context.fillStyle = mode === 'mask' ? '#fff' : 'rgba(239,68,68,.34)';
    context.strokeStyle = mode === 'mask' ? '#fff' : 'rgba(220,38,38,.72)';
    if (mark.type === 'brush') {
      context.lineWidth = Math.max(2, mark.radius * width * 2);
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
    const widthValue = Math.abs(mark.x1 - mark.x0) * width;
    const heightValue = Math.abs(mark.y1 - mark.y0) * height;
    context.fillRect(left, top, widthValue, heightValue);
    if (mode !== 'mask') {
      context.lineWidth = Math.max(2, width / 500);
      context.strokeRect(left, top, widthValue, heightValue);
    }
  }

  function redrawMarks() {
    maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    if (!active) return;
    for (const mark of active.drawing ? [...active.marks, active.drawing] : active.marks) {
      paintMark(maskContext, mark, maskCanvas.width, maskCanvas.height);
    }
    updateControls();
  }

  function updateControls() {
    const markCount = active?.marks.length || 0;
    const count = connectedEntries().length;
    const processing = Boolean(active?.processing || batchRunning || editorSwitching);
    const activePosition = activeEntryPosition();
    undoButton.disabled = markCount === 0 || processing;
    redoButton.disabled = !active?.redo.length || processing;
    clearButton.disabled = markCount === 0 || processing;
    applyButton.disabled = markCount === 0 || processing || !serviceEnabled;
    batchButton.hidden = count < 2;
    batchNote.hidden = count < 2;
    batchButton.textContent = formatCopy(copy.batchApply, { count });
    batchButton.disabled = count < 2 || markCount === 0 || processing || !serviceEnabled;
    cancelBatchButton.hidden = !batchRunning;
    cancelBatchButton.disabled = !batchRunning;
    downloadButton.disabled = !active || !edits.has(active.file) || processing;
    restoreButton.disabled = !active || !edits.has(active.file) || processing;
    downloadBatchButton.hidden = lastBatchEntries.length < 2;
    downloadBatchButton.disabled = processing || !lastBatchEntries.some((entry) => edits.has(entry.file));
    previousImageButton.disabled = processing || activePosition <= 0;
    nextImageButton.disabled = processing || activePosition < 0 || activePosition >= count - 1;
  }

  function applyZoom() {
    if (!active || !stage.clientWidth || !stage.clientHeight) return;
    const style = getComputedStyle(stage);
    const availableWidth = Math.max(1, stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(1, stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    const fitScale = Math.min(availableWidth / baseCanvas.width, availableHeight / baseCanvas.height);
    const displayScale = fitScale * active.zoom;
    const displayWidth = Math.max(1, Math.round(baseCanvas.width * displayScale));
    const displayHeight = Math.max(1, Math.round(baseCanvas.height * displayScale));
    canvasWrap.style.width = `${displayWidth}px`;
    canvasWrap.style.height = `${displayHeight}px`;
    canvasWrap.style.marginLeft = canvasWrap.style.marginRight = `${Math.max(0, (availableWidth - displayWidth) / 2)}px`;
    canvasWrap.style.marginTop = canvasWrap.style.marginBottom = `${Math.max(0, (availableHeight - displayHeight) / 2)}px`;
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
    const nextRect = canvasWrap.getBoundingClientRect();
    stage.scrollLeft += (nextRect.left + imageX * nextRect.width) - anchorX;
    stage.scrollTop += (nextRect.top + imageY * nextRect.height) - anchorY;
  }

  function pointerPosition(event) {
    const rect = maskCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
  }

  function beginDrawing(event) {
    if (!active || active.processing || batchRunning || editorSwitching) return;
    event.preventDefault();
    maskCanvas.setPointerCapture?.(event.pointerId);
    const point = pointerPosition(event);
    active.pointerId = event.pointerId;
    active.redo = [];
    if (active.tool === 'brush') {
      active.drawing = {
        type: 'brush',
        radius: Number(brushInput.value) / Math.max(1, maskCanvas.getBoundingClientRect().width),
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
    else Object.assign(active.drawing, { x1: point.x, y1: point.y });
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

  function canvasBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(copy.failed)), type, quality);
    });
  }

  function compactMaskSpec(marks) {
    const rounded = (value) => Math.round(Number(value) * 100000) / 100000;
    let remainingPoints = 180;
    return {
      version: 1,
      coordinate_space: 'normalized',
      source_shape_count: marks.length,
      shapes: marks.slice(0, 48).map((mark) => {
        if (mark.type !== 'brush') {
          return {
            type: 'rectangle',
            x0: rounded(mark.x0),
            y0: rounded(mark.y0),
            x1: rounded(mark.x1),
            y1: rounded(mark.y1),
          };
        }
        if (remainingPoints <= 0) return { type: 'brush', radius: rounded(mark.radius), points: [] };
        const allowance = Math.max(2, Math.min(48, remainingPoints));
        const step = Math.max(1, Math.ceil(mark.points.length / allowance));
        const points = mark.points
          .filter((_, index) => index % step === 0)
          .slice(0, allowance)
          .map((point) => ({ x: rounded(point.x), y: rounded(point.y) }));
        const last = mark.points.at(-1);
        if (last && points.length < allowance) {
          const finalPoint = { x: rounded(last.x), y: rounded(last.y) };
          if (points.at(-1)?.x !== finalPoint.x || points.at(-1)?.y !== finalPoint.y) {
            points.push(finalPoint);
          }
        }
        remainingPoints -= points.length;
        return { type: 'brush', radius: rounded(mark.radius), points };
      }),
    };
  }

  async function deriveFiles(source, marks) {
    let bitmap;
    try {
      bitmap = await bitmapFrom(source);
      const sourceWidth = bitmap.width || bitmap.naturalWidth;
      const sourceHeight = bitmap.height || bitmap.naturalHeight;
      const scale = Math.min(1, MAX_SIDE / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      let imageBlob = source;
      if (
        scale < 1
        || source.size > MAX_FILE_BYTES
        || !supportedTypes.has(source.type)
      ) {
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = width;
        imageCanvas.height = height;
        const context = imageCanvas.getContext('2d', { alpha: true });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        imageBlob = await canvasBlob(imageCanvas, 'image/webp', 0.94);
        if (imageBlob.size > MAX_FILE_BYTES) imageBlob = await canvasBlob(imageCanvas, 'image/webp', 0.8);
      }
      if (!imageBlob.size || imageBlob.size > MAX_FILE_BYTES) throw new Error(copy.tooLarge);

      const mask = document.createElement('canvas');
      mask.width = width;
      mask.height = height;
      const context = mask.getContext('2d');
      context.fillStyle = '#000';
      context.fillRect(0, 0, width, height);
      for (const mark of marks) paintMark(context, mark, width, height, 'mask');
      const maskBlob = await canvasBlob(mask, 'image/png');
      if (!maskBlob.size || maskBlob.size > MAX_FILE_BYTES) throw new Error(copy.tooLarge);
      return { imageBlob, maskBlob };
    } finally {
      closeBitmap(bitmap);
    }
  }

  async function saveEdit(entry, blob) {
    const previous = edits.get(entry.file);
    if (previous?.previewUrl) {
      URL.revokeObjectURL(previous.previewUrl);
      previewUrls.delete(previous.previewUrl);
    }
    const previewUrl = URL.createObjectURL(blob);
    previewUrls.add(previewUrl);
    edits.set(entry.file, { blob, previewUrl });
    editorDrafts.delete(entry.file);
    entry.button.classList.add('edited');
    entry.button.textContent = copy.edited;
    await Promise.resolve(entry.onApply?.({ blob, previewUrl, restored: false, index: entry.index }));
    return previewUrl;
  }

  async function uploadAwaitingTasks(record, batch, entries) {
    for (const task of batch.tasks) {
      if (task.status !== 'awaiting_upload') continue;
      const entry = entries[task.position];
      if (!entry) throw new Error(copy.failed);
      const progress = formatCopy(copy.batchProcessing, {
        current: task.position + 1,
        count: entries.length,
      });
      busy.textContent = progress;
      status.textContent = progress;
      const { imageBlob, maskBlob } = await deriveFiles(currentSource(entry.file), record.marks);
      const form = new FormData();
      form.set('image', new File([imageBlob], entry.file.name || 'input', {
        type: imageBlob.type || 'image/webp',
      }));
      form.set('mask', new File([maskBlob], 'mask.png', { type: 'image/png' }));
      form.set('mask_spec_hash', batch.mask_spec_hash);
      await apiJson(`/api/inpaint/batches/${encodeURIComponent(record.batchId)}/tasks/${task.position}`, {
        method: 'POST',
        body: form,
      });
    }
  }

  async function acknowledgeResult(taskId) {
    await apiJson(`/api/inpaint/tasks/${encodeURIComponent(taskId)}/result`, { method: 'DELETE' });
  }

  async function recoverSucceededTasks(record, batch, entries) {
    const recovered = new Set(record.recovered || []);
    const pendingAcknowledgements = new Map(record.pendingAcknowledgements || []);
    for (const task of batch.tasks) {
      if (task.status !== 'succeeded' || recovered.has(task.position)) continue;
      const response = await fetch(apiUrl(`/api/inpaint/tasks/${encodeURIComponent(task.id)}/result`), {
        credentials: 'include',
        headers: { 'X-Device-ID': deviceId() },
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      await saveEdit(entries[task.position], blob);
      recovered.add(task.position);
      pendingAcknowledgements.set(task.position, task.id);
      record.recovered = [...recovered];
      record.pendingAcknowledgements = [...pendingAcknowledgements];
      writeActiveBatch(record);
    }
    for (const [position, taskId] of [...pendingAcknowledgements]) {
      try {
        await acknowledgeResult(taskId);
        pendingAcknowledgements.delete(position);
        record.pendingAcknowledgements = [...pendingAcknowledgements];
        writeActiveBatch(record);
      } catch (error) {
        console.error('inpaint result acknowledgement', error);
      }
    }
    return { recovered, pendingAcknowledgements };
  }

  async function finishBatch(record, entries) {
    let latest = await apiJson(`/api/inpaint/batches/${encodeURIComponent(record.batchId)}`);
    await uploadAwaitingTasks(record, latest.batch, entries);
    for (let poll = 0; poll < MAX_POLLS; poll += 1) {
      latest = await apiJson(`/api/inpaint/batches/${encodeURIComponent(record.batchId)}`);
      const { recovered, pendingAcknowledgements } = await recoverSucceededTasks(record, latest.batch, entries);
      const terminal = ['succeeded', 'partial', 'failed', 'cancelled'].includes(latest.batch.status);
      if (terminal) {
        lastBatchEntries = entries;
        if (pendingAcknowledgements.size === 0) localStorage.removeItem(ACTIVE_BATCH_KEY);
        else status.textContent = copy.cleanupPending;
        return {
          success: recovered.size,
          total: entries.length,
          cleanupPending: pendingAcknowledgements.size > 0,
        };
      }
      status.textContent = copy.awaiting;
      busy.textContent = copy.awaiting;
      await wait(POLL_DELAY_MS);
    }
    throw new Error(copy.failed);
  }

  async function runServerBatch(entries, marks) {
    if (batchRunning) return;
    batchRunning = true;
    if (active) active.processing = true;
    busy.classList.add('visible');
    document.querySelectorAll('.image-remove-btn').forEach((button) => { button.disabled = true; });
    syncShortcut();
    updateControls();
    try {
      const maskSpec = compactMaskSpec(marks);
      const clientBatchId = `browser_${crypto.randomUUID()}`;
      const created = await apiJson('/api/inpaint/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_count: entries.length,
          client_batch_id: clientBatchId,
          mask_spec: maskSpec,
        }),
      });
      const record = {
        version: 1,
        batchId: created.batch.id,
        clientBatchId,
        fileKeys: entries.map((entry) => fileKey(entry.file)),
        marks: cloneMarks(marks),
        recovered: [],
        pendingAcknowledgements: [],
        createdAt: Date.now(),
      };
      writeActiveBatch(record);
      const result = await finishBatch(record, entries);
      if (active && result.success > 0) await refreshActiveBitmap();
      status.textContent = result.cleanupPending
        ? copy.cleanupPending
        : result.success === result.total
          ? formatCopy(copy.batchApplied, { count: result.total })
          : formatCopy(copy.batchPartial, { success: result.success, count: result.total });
    } catch (error) {
      console.error('AI inpaint batch', error);
      status.textContent = error.message === copy.tooLarge ? copy.tooLarge : copy.failed;
    } finally {
      batchRunning = false;
      if (active) active.processing = false;
      busy.textContent = copy.processing;
      busy.classList.remove('visible');
      document.querySelectorAll('.image-remove-btn').forEach((button) => { button.disabled = false; });
      syncShortcut();
      updateControls();
    }
  }

  async function cancelActiveBatch() {
    const record = readActiveBatch();
    if (!batchRunning || !record?.batchId) return;
    cancelBatchButton.disabled = true;
    try {
      await apiJson(`/api/inpaint/batches/${encodeURIComponent(record.batchId)}`, {
        method: 'DELETE',
      });
      localStorage.removeItem(ACTIVE_BATCH_KEY);
      status.textContent = cancelCopy.done;
      busy.textContent = cancelCopy.done;
    } catch (error) {
      console.error('AI inpaint cancel', error);
      status.textContent = error.code === 'cancel_cleanup_failed' ? copy.cleanupPending : copy.failed;
    }
  }

  async function resumeStoredBatch() {
    if (batchRunning) return;
    const record = readActiveBatch();
    if (!record?.batchId || !Array.isArray(record.fileKeys) || !Array.isArray(record.marks)) return;
    const entriesByKey = new Map(connectedEntries().map((entry) => [fileKey(entry.file), entry]));
    const entries = record.fileKeys.map((key) => entriesByKey.get(key));
    if (entries.some((entry) => !entry)) return;
    batchRunning = true;
    syncShortcut();
    status.textContent = copy.recovering;
    try {
      const result = await finishBatch(record, entries);
      lastBatchEntries = entries;
      status.textContent = result.cleanupPending
        ? copy.cleanupPending
        : result.success === result.total
          ? formatCopy(copy.batchApplied, { count: result.total })
          : formatCopy(copy.batchPartial, { success: result.success, count: result.total });
    } catch (error) {
      if (error.status === 404 || error.status === 410) localStorage.removeItem(ACTIVE_BATCH_KEY);
      console.error('AI inpaint recovery', error);
    } finally {
      batchRunning = false;
      syncShortcut();
      updateControls();
    }
  }

  function scheduleRecovery() {
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(resumeStoredBatch, 500);
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

  async function refreshActiveBitmap() {
    if (!active) return;
    closeBitmap(active.bitmap);
    active.bitmap = await bitmapFrom(currentSource(active.file));
    active.marks = [];
    active.redo = [];
    editorDrafts.delete(active.file);
    drawActiveBitmap();
    redrawMarks();
  }

  async function loadEditorEntry(entry, { resetScroll = true } = {}) {
    if (!entry || batchRunning || editorSwitching) return;
    saveActiveDraft();
    const loadToken = ++editorLoadToken;
    editorSwitching = true;
    updateControls();
    let bitmap;
    try {
      bitmap = await bitmapFrom(currentSource(entry.file));
      if (loadToken !== editorLoadToken) {
        closeBitmap(bitmap);
        return;
      }
      const draft = editorDrafts.get(entry.file);
      closeBitmap(active?.bitmap);
      active = {
        ...entry,
        entry,
        bitmap,
        marks: cloneMarks(draft?.marks || []),
        redo: cloneMarks(draft?.redo || []),
        drawing: null,
        pointerId: null,
        tool: draft?.tool || 'brush',
        processing: false,
        zoom: draft?.zoom || 1,
      };
      const entries = connectedEntries();
      const position = activeEntryPosition(entries);
      imagePosition.textContent = formatCopy(copy.imagePosition, {
        current: position + 1,
        count: entries.length,
      });
      imageName.textContent = entry.file.name || '';
      document.querySelectorAll('[data-clean-tool]').forEach((element) => {
        element.classList.toggle('active', element.dataset.cleanTool === active.tool);
      });
      if (resetScroll) {
        stage.scrollLeft = 0;
        stage.scrollTop = 0;
      }
      drawActiveBitmap();
      redrawMarks();
      status.textContent = serviceEnabled ? copy.ready : copy.unavailable;
    } catch (error) {
      closeBitmap(bitmap);
      console.error('AI editor image switch', error);
      status.textContent = copy.failed;
    } finally {
      if (loadToken === editorLoadToken) editorSwitching = false;
      updateControls();
    }
  }

  async function switchEditorImage(offset) {
    if (!active || batchRunning || active.processing || editorSwitching) return;
    const entries = connectedEntries();
    const position = activeEntryPosition(entries);
    const nextEntry = entries[position + offset];
    if (!nextEntry) return;
    await loadEditorEntry(nextEntry);
  }

  async function openEditor(entry) {
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
    await loadEditorEntry(entry);
  }

  function closeEditor() {
    if (active?.processing || batchRunning || editorSwitching) return;
    saveActiveDraft();
    editorLoadToken += 1;
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
    closeBitmap(active?.bitmap);
    active = null;
  }

  async function restoreOriginal() {
    if (!active || !edits.has(active.file) || batchRunning) return;
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
    await Promise.resolve(active.onApply?.({
      blob: active.file,
      previewUrl,
      restored: true,
      index: active.index,
    }));
    await refreshActiveBitmap();
    status.textContent = copy.restored;
  }

  function downloadCleaned() {
    const edit = active && edits.get(active.file);
    if (!edit) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(edit.blob);
    link.download = `${active.file.name.replace(/\.[^.]+$/, '') || 'product'}-cleaned.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
  }

  async function downloadBatch() {
    const completed = lastBatchEntries.filter((entry) => edits.has(entry.file));
    if (!completed.length || typeof JSZip === 'undefined') return;
    const zip = new JSZip();
    completed.forEach((entry) => {
      const name = `${entry.file.name.replace(/\.[^.]+$/, '') || 'product'}-cleaned.png`;
      zip.file(name, edits.get(entry.file).blob);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'shopbg-ai-cleaned.zip';
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
  window.addEventListener('keydown', (event) => {
    if (!overlay.classList.contains('visible')) return;
    if (event.key === 'Escape') {
      closeEditor();
      return;
    }
    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && !event.target.closest?.('input, textarea, select, [contenteditable="true"]')
    ) {
      event.preventDefault();
      switchEditorImage(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  brushInput.addEventListener('input', () => {
    document.getElementById('localCleanBrushValue').textContent = brushInput.value;
  });
  zoomOutButton.addEventListener('click', () => setZoom((active?.zoom || 1) / 1.25));
  zoomFitButton.addEventListener('click', () => setZoom(1));
  zoomInButton.addEventListener('click', () => setZoom((active?.zoom || 1) * 1.25));
  previousImageButton.addEventListener('click', () => switchEditorImage(-1));
  nextImageButton.addEventListener('click', () => switchEditorImage(1));
  stage.addEventListener('wheel', (event) => {
    if (!active || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    setZoom(active.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15), {
      x: event.clientX,
      y: event.clientY,
    });
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
  applyButton.addEventListener('click', () => {
    if (!active?.marks.length) return void (status.textContent = copy.noSelection);
    runServerBatch([active.entry], cloneMarks(active.marks));
  });
  batchButton.addEventListener('click', () => {
    if (!active?.marks.length) return void (status.textContent = copy.noSelection);
    runServerBatch([...connectedEntries()].slice(0, 50), cloneMarks(active.marks));
  });
  cancelBatchButton.addEventListener('click', cancelActiveBatch);
  downloadButton.addEventListener('click', downloadCleaned);
  downloadBatchButton.addEventListener('click', downloadBatch);
  restoreButton.addEventListener('click', restoreOriginal);
  shortcutButton?.addEventListener('click', () => connectedEntries()[0]?.button.click());

  window.ShopBGLocalCleaner = {
    clearAll() {
      for (const url of previewUrls) URL.revokeObjectURL(url);
      previewUrls.clear();
      edits = new WeakMap();
      editorDrafts = new WeakMap();
      cardEntries = [];
      lastBatchEntries = [];
      syncShortcut();
    },
    decorateCard(card, file, index, options = {}) {
      if (options.initialSource && options.initialSource !== file) {
        edits.set(file, { blob: options.initialSource, previewUrl: null });
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'local-clean-card-btn';
      button.textContent = edits.has(file) ? copy.edited : copy.edit;
      if (edits.has(file)) button.classList.add('edited');
      const entry = { file, index, button, onApply: options.onApply };
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(entry);
      });
      card.append(button);
      cardEntries.push(entry);
      queueMicrotask(() => {
        syncShortcut();
        scheduleRecovery();
      });
      return button;
    },
    getSourceFile(file) {
      return currentSource(file);
    },
    hasEdit(file) {
      return edits.has(file);
    },
  };

  apiJson('/api/inpaint/capabilities')
    .then((capabilities) => {
      serviceEnabled = Boolean(capabilities.enabled);
      syncShortcut();
      if (!serviceEnabled) status.textContent = copy.unavailable;
    })
    .catch(() => {
      serviceEnabled = false;
      syncShortcut();
      status.textContent = copy.unavailable;
    });
  syncShortcut();
})();
