import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '20260725-ai-stage5a-v2';

const locales = [
  {
    file: 'index.html',
    title: 'AI remove background',
    description: 'Successful AI processing costs 1 credit per image. Local cleanup, background settings and export stay free.',
    master: 'Enable AI for all non-transparent images',
    empty: 'Upload images to calculate AI credit use.',
    summary: '{ai} of {total} need AI · estimated {ai} credits · {noCharge} no-charge',
    cardLabel: 'AI',
    checking: 'Checking transparency…',
    transparent: 'Transparent PNG · AI skipped',
    off: 'AI off · no credit',
    cached: 'AI result cached · no new credit',
    reprocess: 'Edited after AI · 1 new credit',
    ready: 'AI on · 1 credit after success',
    failed: 'Failed · retry keeps the same task',
    confirm: 'This batch has {total} images. {ai} need AI background removal and can use up to {ai} credits after successful processing. {noCharge} will not use AI credits. Continue?',
    confirmReprocess: '{count} previously processed image(s) changed. Reprocessing them can use {count} additional credit(s). Continue?',
    insufficient: 'This batch needs {needed} credits, but only {remaining} are available.',
    creditCheckFailed: 'Could not verify your available credits. No AI request was sent.',
    processing: 'Processing {current} / {total}: {name}',
    done: '✅ Done! {ok} ready{errorsText} · {aiCalls} AI call(s)',
    processReady: 'Process images',
    processingButton: 'Processing…',
    download: '📥 Download ZIP ({size} MB)',
    zipping: 'Zipping…',
    restored: 'Original restored. Only this image needs to be prepared again.',
    edited: 'Local cleanup saved. Only this image needs to be prepared again.',
    failedText: ' · {errors} failed',
  },
  {
    file: 'de/index.html',
    title: 'KI-Hintergrund entfernen',
    description: 'Erfolgreiche KI-Verarbeitung kostet 1 Credit pro Bild. Lokale Bereinigung, Hintergrundeinstellungen und Export bleiben kostenlos.',
    master: 'KI für alle nicht transparenten Bilder aktivieren',
    empty: 'Bilder hochladen, um den Credit-Verbrauch zu berechnen.',
    summary: '{ai} von {total} benötigen KI · geschätzt {ai} Credits · {noCharge} kostenlos',
    cardLabel: 'KI',
    checking: 'Transparenz wird geprüft…',
    transparent: 'Transparentes PNG · KI übersprungen',
    off: 'KI aus · kein Credit',
    cached: 'KI-Ergebnis gespeichert · kein neuer Credit',
    reprocess: 'Nach KI bearbeitet · 1 neuer Credit',
    ready: 'KI an · 1 Credit nach Erfolg',
    failed: 'Fehlgeschlagen · Wiederholung nutzt dieselbe Aufgabe',
    confirm: 'Dieser Stapel enthält {total} Bilder. {ai} benötigen die KI-Hintergrundentfernung und können nach erfolgreicher Verarbeitung bis zu {ai} Credits verbrauchen. {noCharge} verbrauchen keine KI-Credits. Fortfahren?',
    confirmReprocess: '{count} bereits verarbeitete Bild(er) wurden geändert. Die erneute Verarbeitung kann {count} zusätzliche Credit(s) verbrauchen. Fortfahren?',
    insufficient: 'Dieser Stapel benötigt {needed} Credits, aber nur {remaining} sind verfügbar.',
    creditCheckFailed: 'Verfügbare Credits konnten nicht geprüft werden. Es wurde keine KI-Anfrage gesendet.',
    processing: 'Verarbeite {current} / {total}: {name}',
    done: '✅ Fertig! {ok} bereit{errorsText} · {aiCalls} KI-Aufruf(e)',
    processReady: 'Bilder verarbeiten',
    processingButton: 'Verarbeite…',
    download: '📥 ZIP herunterladen ({size} MB)',
    zipping: 'Komprimiere…',
    restored: 'Original wiederhergestellt. Nur dieses Bild muss erneut vorbereitet werden.',
    edited: 'Lokale Bereinigung gespeichert. Nur dieses Bild muss erneut vorbereitet werden.',
    failedText: ' · {errors} fehlgeschlagen',
  },
  {
    file: 'es/index.html',
    title: 'Eliminar fondo con IA',
    description: 'El procesamiento correcto con IA cuesta 1 crédito por imagen. La limpieza local, los ajustes de fondo y la exportación siguen siendo gratis.',
    master: 'Activar IA para todas las imágenes no transparentes',
    empty: 'Sube imágenes para calcular el uso de créditos de IA.',
    summary: '{ai} de {total} necesitan IA · estimado {ai} créditos · {noCharge} sin coste',
    cardLabel: 'IA',
    checking: 'Comprobando transparencia…',
    transparent: 'PNG transparente · IA omitida',
    off: 'IA desactivada · sin crédito',
    cached: 'Resultado de IA guardado · sin crédito nuevo',
    reprocess: 'Editada tras IA · 1 crédito nuevo',
    ready: 'IA activada · 1 crédito tras el éxito',
    failed: 'Error · el reintento conserva la misma tarea',
    confirm: 'Este lote contiene {total} imágenes. {ai} necesitan eliminación de fondo con IA y pueden usar hasta {ai} créditos tras procesarse correctamente. {noCharge} no usarán créditos de IA. ¿Continuar?',
    confirmReprocess: 'Se modificaron {count} imagen(es) ya procesadas. Volver a procesarlas puede usar {count} crédito(s) adicionales. ¿Continuar?',
    insufficient: 'Este lote necesita {needed} créditos, pero solo hay {remaining} disponibles.',
    creditCheckFailed: 'No se pudieron verificar los créditos disponibles. No se envió ninguna solicitud de IA.',
    processing: 'Procesando {current} / {total}: {name}',
    done: '✅ ¡Listo! {ok} preparadas{errorsText} · {aiCalls} llamada(s) de IA',
    processReady: 'Procesar imágenes',
    processingButton: 'Procesando…',
    download: '📥 Descargar ZIP ({size} MB)',
    zipping: 'Comprimiendo…',
    restored: 'Original restaurado. Solo esta imagen debe prepararse de nuevo.',
    edited: 'Limpieza local guardada. Solo esta imagen debe prepararse de nuevo.',
    failedText: ' · {errors} con error',
  },
  {
    file: 'fr/index.html',
    title: 'Supprimer le fond avec l’IA',
    description: 'Un traitement IA réussi coûte 1 crédit par image. Le nettoyage local, les réglages du fond et l’export restent gratuits.',
    master: 'Activer l’IA pour toutes les images non transparentes',
    empty: 'Importez des images pour calculer l’utilisation des crédits IA.',
    summary: '{ai} sur {total} nécessitent l’IA · estimation {ai} crédits · {noCharge} sans frais',
    cardLabel: 'IA',
    checking: 'Vérification de la transparence…',
    transparent: 'PNG transparent · IA ignorée',
    off: 'IA désactivée · aucun crédit',
    cached: 'Résultat IA conservé · aucun nouveau crédit',
    reprocess: 'Modifiée après l’IA · 1 nouveau crédit',
    ready: 'IA activée · 1 crédit après réussite',
    failed: 'Échec · la nouvelle tentative garde la même tâche',
    confirm: 'Ce lot contient {total} images. {ai} nécessitent la suppression du fond par IA et peuvent utiliser jusqu’à {ai} crédits après réussite. {noCharge} n’utiliseront aucun crédit IA. Continuer ?',
    confirmReprocess: '{count} image(s) déjà traitée(s) ont été modifiées. Les retraiter peut utiliser {count} crédit(s) supplémentaire(s). Continuer ?',
    insufficient: 'Ce lot nécessite {needed} crédits, mais seulement {remaining} sont disponibles.',
    creditCheckFailed: 'Impossible de vérifier les crédits disponibles. Aucune requête IA n’a été envoyée.',
    processing: 'Traitement {current} / {total} : {name}',
    done: '✅ Terminé ! {ok} prêtes{errorsText} · {aiCalls} appel(s) IA',
    processReady: 'Traiter les images',
    processingButton: 'Traitement…',
    download: '📥 Télécharger le ZIP ({size} Mo)',
    zipping: 'Compression…',
    restored: 'Original restauré. Seule cette image doit être préparée à nouveau.',
    edited: 'Nettoyage local enregistré. Seule cette image doit être préparée à nouveau.',
    failedText: ' · {errors} en échec',
  },
  {
    file: 'pt-br/index.html',
    title: 'Remover fundo com IA',
    description: 'O processamento concluído com IA custa 1 crédito por imagem. Limpeza local, ajustes de fundo e exportação continuam grátis.',
    master: 'Ativar IA para todas as imagens não transparentes',
    empty: 'Envie imagens para calcular o uso de créditos de IA.',
    summary: '{ai} de {total} precisam de IA · estimativa {ai} créditos · {noCharge} sem custo',
    cardLabel: 'IA',
    checking: 'Verificando transparência…',
    transparent: 'PNG transparente · IA ignorada',
    off: 'IA desativada · sem crédito',
    cached: 'Resultado de IA salvo · sem novo crédito',
    reprocess: 'Editada após IA · 1 novo crédito',
    ready: 'IA ativada · 1 crédito após sucesso',
    failed: 'Falha · nova tentativa mantém a mesma tarefa',
    confirm: 'Este lote contém {total} imagens. {ai} precisam de remoção de fundo com IA e podem usar até {ai} créditos após o processamento bem-sucedido. {noCharge} não usarão créditos de IA. Continuar?',
    confirmReprocess: '{count} imagem(ns) já processada(s) foram alteradas. Processá-las novamente pode usar {count} crédito(s) adicional(is). Continuar?',
    insufficient: 'Este lote precisa de {needed} créditos, mas apenas {remaining} estão disponíveis.',
    creditCheckFailed: 'Não foi possível verificar os créditos disponíveis. Nenhuma solicitação de IA foi enviada.',
    processing: 'Processando {current} / {total}: {name}',
    done: '✅ Concluído! {ok} prontas{errorsText} · {aiCalls} chamada(s) de IA',
    processReady: 'Processar imagens',
    processingButton: 'Processando…',
    download: '📥 Baixar ZIP ({size} MB)',
    zipping: 'Compactando…',
    restored: 'Original restaurado. Apenas esta imagem precisa ser preparada novamente.',
    edited: 'Limpeza local salva. Apenas esta imagem precisa ser preparada novamente.',
    failedText: ' · {errors} com falha',
  },
];

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Duplicate ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceFunction(source, signature, replacement) {
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`Missing ${signature}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(0, start) + replacement + source.slice(index + 1);
      }
    }
  }
  throw new Error(`Unterminated ${signature}`);
}

function appendToFunction(source, signature, statement) {
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`Missing ${signature}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = opening; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(0, index) + `  ${statement}\n` + source.slice(index);
      }
    }
  }
  throw new Error(`Unterminated ${signature}`);
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function panelHtml(locale) {
  const attributes = [
    ['empty', locale.empty],
    ['summary', locale.summary],
    ['card-label', locale.cardLabel],
    ['checking', locale.checking],
    ['transparent', locale.transparent],
    ['off', locale.off],
    ['cached', locale.cached],
    ['reprocess', locale.reprocess],
    ['ready', locale.ready],
    ['failed', locale.failed],
    ['confirm', locale.confirm],
    ['confirm-reprocess', locale.confirmReprocess],
    ['insufficient', locale.insufficient],
    ['credit-check-failed', locale.creditCheckFailed],
    ['processing', locale.processing],
    ['done', locale.done],
    ['failed-text', locale.failedText],
  ].map(([name, value]) => `        data-${name}="${escapeAttribute(value)}"`).join('\n');

  return `      <div class="ai-workflow-panel" id="aiWorkflowPanel"
${attributes}>
        <div class="ai-workflow-head">
          <div class="ai-workflow-copy">
            <strong>${locale.title}</strong>
            <span>${locale.description}</span>
          </div>
          <label class="ai-master-toggle" title="${escapeAttribute(locale.master)}">
            <input id="aiRemoveToggle" type="checkbox" checked aria-label="${escapeAttribute(locale.master)}">
            <i aria-hidden="true"></i>
          </label>
        </div>
        <div class="ai-estimate" id="aiEstimate">${locale.empty}</div>
      </div>

`;
}

function workflowInit(locale) {
  return `  aiWorkflow = window.ShopBGAiWorkflow.create({
    api: API,
    deviceId: DEVICE_ID,
    getFiles: () => selectedFiles,
    getCurrentUser: () => currentUser,
    getSourceFile: (file) => window.ShopBGLocalCleaner?.getSourceFile(file) || file,
    compressToDataUrl,
    applyBackground,
    getFileName,
    setStatus,
    showRegisterModal,
    showUpgradeModal,
    onPlanChanged: () => {
      if (selectedFiles.length) setProcessButtonReady();
    },
    onStart: () => {
      const btn = document.getElementById('processBtn');
      btn.disabled = true;
      btn.textContent = ${JSON.stringify(locale.processingButton)};
      document.getElementById('progressTrack').style.display = 'block';
    },
    onProgress: (index, total) => {
      document.getElementById('progressBar').style.width = \`\${(index / total) * 100}%\`;
    },
    onResult: (index, processedBlob) => {
      const card = document.getElementById(\`card-\${index}\`);
      const image = card?.querySelector('img');
      if (!card || !image) return;
      if (image.dataset.aiResultUrl) URL.revokeObjectURL(image.dataset.aiResultUrl);
      const objectUrl = URL.createObjectURL(processedBlob);
      image.dataset.aiResultUrl = objectUrl;
      card.classList.add('flipping');
      setTimeout(() => {
        image.src = objectUrl;
        updateWorkspacePreview(index, objectUrl);
        card.classList.remove('flipping');
      }, 300);
    },
    onOutputsChanged: (outputs) => {
      processedResults = outputs;
    },
    onComplete: ({ outputs, errors, actualAiCalls }) => {
      document.getElementById('progressBar').style.width = '100%';
      const totalMB = (outputs.reduce((sum, result) => sum + result.blob.size, 0) / 1048576).toFixed(1);
      const data = document.getElementById('aiWorkflowPanel').dataset;
      const errorsText = errors
        ? window.ShopBGAiWorkflow.format(data.failedText, { errors })
        : '';
      setStatus(window.ShopBGAiWorkflow.format(data.done, {
        ok: outputs.length,
        errorsText,
        aiCalls: actualAiCalls,
      }));

      const btn = document.getElementById('processBtn');
      if (outputs.length) {
        btn.className = 'action-btn action-btn-download';
        btn.textContent = window.ShopBGAiWorkflow.format(${JSON.stringify(locale.download)}, { size: totalMB });
        btn.disabled = false;
        btn.onclick = downloadZip;
      } else {
        setProcessButtonReady();
      }

      if (currentUser && outputs.length > 0) {
        fetch(\`\${API}/api/history\`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-Device-ID': DEVICE_ID },
          body: JSON.stringify({
            file_count: outputs.length,
            settings: { bgMode, ai_calls: actualAiCalls },
          }),
        });
        loadUser();
      }
    },
  });

`;
}

for (const locale of locales) {
  const target = path.join(root, locale.file);
  let html = await readFile(target, 'utf8');

  if (html.includes('id="aiWorkflowPanel"')) {
    console.log(`Skipped already updated ${locale.file}`);
    continue;
  }

  if (!html.includes(`/ai-workflow.js?v=${version}`)) {
    html = replaceOnce(
      html,
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>',
      `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>\n  <script src="/ai-workflow.js?v=${version}"></script>`,
      `${locale.file} AI script`,
    );
  }
  if (!html.includes(`/ai-workflow.css?v=${version}`)) {
    html = replaceOnce(
      html,
      '<link rel="stylesheet" href="/local-cleaner.css?v=20260725-credit-center-v4">',
      `<link rel="stylesheet" href="/local-cleaner.css?v=20260725-credit-center-v4">\n<link rel="stylesheet" href="/ai-workflow.css?v=${version}">`,
      `${locale.file} AI stylesheet`,
    );
  }
  const shortcutIndex = html.indexOf('id="localCleanupShortcut"');
  if (shortcutIndex === -1) throw new Error(`Missing ${locale.file} local cleanup shortcut`);
  const localEntryEnd = html.indexOf('\n      </div>', shortcutIndex);
  if (localEntryEnd === -1) throw new Error(`Missing ${locale.file} local cleanup end`);
  const insertAt = localEntryEnd + '\n      </div>'.length;
  html = html.slice(0, insertAt) + `\n\n${panelHtml(locale).trimEnd()}` + html.slice(insertAt);
  html = replaceOnce(
    html,
    'let selectedFiles   = [];\n  let processedResults = [];',
    'let selectedFiles   = [];\n  let processedResults = [];\n  let aiWorkflow = null;',
    `${locale.file} workflow state`,
  );

  html = appendToFunction(html, 'function setBg(mode)', 'aiWorkflow?.markCompositionChanged();');
  html = appendToFunction(html, 'function syncColor(from)', 'aiWorkflow?.markCompositionChanged();');
  html = appendToFunction(html, 'function setSize(el, val)', 'aiWorkflow?.markCompositionChanged();');
  html = appendToFunction(html, 'function setRename(el, mode)', 'aiWorkflow?.markCompositionChanged();');

  html = replaceOnce(
    html,
    "        onApply: ({ previewUrl, restored }) => {\n          if (img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);\n          img.src = previewUrl;",
    "        onApply: ({ previewUrl, restored }) => {\n          if (img.dataset.aiResultUrl) {\n            URL.revokeObjectURL(img.dataset.aiResultUrl);\n            delete img.dataset.aiResultUrl;\n          }\n          img.src = previewUrl;",
    `${locale.file} local preview cleanup`,
  );
  html = replaceOnce(
    html,
    '          resetProcessActionAfterLocalEdit(restored);',
    '          aiWorkflow?.markSourceChanged(i);\n          resetProcessActionAfterLocalEdit(i, restored);',
    `${locale.file} local edit task reset`,
  );
  html = replaceOnce(
    html,
    '      grid.appendChild(card);',
    '      grid.appendChild(card);\n      aiWorkflow?.register(file, i, card);',
    `${locale.file} job registration`,
  );

  const readyFunction = `function setProcessButtonReady() {
    const btn = document.getElementById('processBtn');
    btn.textContent = ${JSON.stringify(locale.processReady)} + \` (\${selectedFiles.length})\`;
    btn.disabled = selectedFiles.length === 0;
    btn.className = 'action-btn action-btn-primary';
    btn.onclick = startProcessing;
  }

  function resetProcessActionAfterLocalEdit(index, restored = false) {
    document.getElementById('progressTrack').style.display = 'none';
    document.getElementById('progressBar').style.width = '0%';
    setProcessButtonReady();
    setStatus(restored
      ? ${JSON.stringify(locale.restored)}
      : ${JSON.stringify(locale.edited)});
  }`;
  html = replaceFunction(
    html,
    'function resetProcessActionAfterLocalEdit(restored = false)',
    readyFunction,
  );

  const processFunction = `async function startProcessing() {
    if (!selectedFiles.length || !aiWorkflow) return;
    await aiWorkflow.process();
  }`;
  html = replaceFunction(html, 'async function startProcessing()', processFunction);

  html = html.replace(
    /    const btn = document\.getElementById\('processBtn'\);\n    btn\.textContent = `[^`]+`;\n    btn\.disabled = false;\n    btn\.className = 'action-btn action-btn-primary';\n    btn\.onclick = startProcessing;/,
    '    setProcessButtonReady();',
  );

  html = replaceOnce(
    html,
    '    processedResults = [];\n  }\n\n  function setStatus',
    '    processedResults = aiWorkflow?.getOutputs() || processedResults;\n  }\n\n  function setStatus',
    `${locale.file} preserve outputs`,
  );

  const downloadFunction = `async function downloadZip() {
    if (!processedResults.length) return;
    const btn = document.getElementById('processBtn');
    btn.textContent = ${JSON.stringify(locale.zipping)};

    const zip = new JSZip();
    processedResults.forEach(result => zip.file(result.name, result.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shopbg-processed.zip';
    link.click();
    URL.revokeObjectURL(url);

    const totalMB = (processedResults.reduce((sum, result) => sum + result.blob.size, 0) / 1048576).toFixed(1);
    btn.textContent = window.ShopBGAiWorkflow.format(${JSON.stringify(locale.download)}, { size: totalMB });
  }`;
  html = replaceFunction(html, 'async function downloadZip()', downloadFunction);

  const initNeedle = '\n  loadUser();';
  const initIndex = html.lastIndexOf(initNeedle);
  if (initIndex === -1) throw new Error(`Missing ${locale.file} final loadUser`);
  html = html.slice(0, initIndex) + `\n${workflowInit(locale)}` + html.slice(initIndex);

  await writeFile(target, html);
  console.log(`Updated ${locale.file}`);
}
