import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetVersion = '20260725-ai-stage5b-v1';

const locales = [
  {
    file: 'index.html',
    note: 'Saved only in this browser for 24 hours.',
    clear: 'Clear saved workspace',
    clearConfirm: "Clear this browser's saved workspace? This cannot be undone.",
    restored: 'Restored {count} image(s) from this browser.',
    tooLarge: 'This workspace is too large for refresh recovery. Current work is still available.',
    saveFailed: 'Could not save refresh recovery in this browser. Current work is still available.',
    restoreFailed: 'Could not restore the saved workspace. Uploads were not sent anywhere.',
    download: '📥 Download ZIP ({size} MB)',
  },
  {
    file: 'de/index.html',
    note: 'Nur in diesem Browser für 24 Stunden gespeichert.',
    clear: 'Gespeicherten Arbeitsbereich löschen',
    clearConfirm: 'Gespeicherten Arbeitsbereich in diesem Browser löschen? Dies kann nicht rückgängig gemacht werden.',
    restored: '{count} Bild(er) aus diesem Browser wiederhergestellt.',
    tooLarge: 'Dieser Arbeitsbereich ist zu groß für die Wiederherstellung nach dem Aktualisieren. Die aktuelle Arbeit bleibt verfügbar.',
    saveFailed: 'Die Wiederherstellung nach dem Aktualisieren konnte in diesem Browser nicht gespeichert werden. Die aktuelle Arbeit bleibt verfügbar.',
    restoreFailed: 'Der gespeicherte Arbeitsbereich konnte nicht wiederhergestellt werden. Es wurden keine Bilder gesendet.',
    download: '📥 ZIP herunterladen ({size} MB)',
  },
  {
    file: 'es/index.html',
    note: 'Guardado solo en este navegador durante 24 horas.',
    clear: 'Borrar espacio guardado',
    clearConfirm: '¿Borrar el espacio de trabajo guardado en este navegador? Esta acción no se puede deshacer.',
    restored: 'Se restauraron {count} imagen(es) desde este navegador.',
    tooLarge: 'Este espacio de trabajo es demasiado grande para recuperarlo tras actualizar. El trabajo actual sigue disponible.',
    saveFailed: 'No se pudo guardar la recuperación tras actualizar en este navegador. El trabajo actual sigue disponible.',
    restoreFailed: 'No se pudo restaurar el espacio guardado. No se envió ninguna imagen.',
    download: '📥 Descargar ZIP ({size} MB)',
  },
  {
    file: 'fr/index.html',
    note: 'Enregistré uniquement dans ce navigateur pendant 24 heures.',
    clear: 'Effacer l’espace enregistré',
    clearConfirm: 'Effacer l’espace de travail enregistré dans ce navigateur ? Cette action est irréversible.',
    restored: '{count} image(s) restaurée(s) depuis ce navigateur.',
    tooLarge: 'Cet espace de travail est trop volumineux pour être récupéré après actualisation. Le travail actuel reste disponible.',
    saveFailed: 'Impossible d’enregistrer la récupération après actualisation dans ce navigateur. Le travail actuel reste disponible.',
    restoreFailed: 'Impossible de restaurer l’espace enregistré. Aucune image n’a été envoyée.',
    download: '📥 Télécharger le ZIP ({size} Mo)',
  },
  {
    file: 'pt-br/index.html',
    note: 'Salvo somente neste navegador por 24 horas.',
    clear: 'Limpar espaço salvo',
    clearConfirm: 'Limpar o espaço de trabalho salvo neste navegador? Esta ação não pode ser desfeita.',
    restored: '{count} imagem(ns) restaurada(s) deste navegador.',
    tooLarge: 'Este espaço de trabalho é grande demais para recuperação após atualizar. O trabalho atual continua disponível.',
    saveFailed: 'Não foi possível salvar a recuperação após atualizar neste navegador. O trabalho atual continua disponível.',
    restoreFailed: 'Não foi possível restaurar o espaço salvo. Nenhuma imagem foi enviada.',
    download: '📥 Baixar ZIP ({size} MB)',
  },
];

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index === -1) throw new Error(`Missing ${label}`);
  if (source.indexOf(before, index + before.length) !== -1) {
    throw new Error(`Duplicate ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function escapeAttribute(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

for (const locale of locales) {
  const target = path.join(root, locale.file);
  let html = await readFile(target, 'utf8');
  if (html.includes('aiWorkflow.restoreSession()')) {
    console.log(`Skipped already updated ${locale.file}`);
    continue;
  }

  html = html
    .replaceAll('20260725-ai-stage5a-v2', assetVersion)
    .replaceAll('local-cleaner.js?v=20260725-preview-v3', `local-cleaner.js?v=${assetVersion}`);

  const panelStart = html.indexOf('<div class="ai-workflow-panel" id="aiWorkflowPanel"');
  const panelEnd = html.indexOf('>', panelStart);
  if (panelStart === -1 || panelEnd === -1) throw new Error(`Missing AI panel in ${locale.file}`);
  if (!html.includes('data-session-restored=')) {
    const sessionAttributes = [
      ['session-restored', locale.restored],
      ['session-too-large', locale.tooLarge],
      ['session-save-failed', locale.saveFailed],
      ['session-restore-failed', locale.restoreFailed],
      ['clear-session-confirm', locale.clearConfirm],
    ].map(([name, value]) => `\n        data-${name}="${escapeAttribute(value)}"`).join('');
    html = html.slice(0, panelEnd) + sessionAttributes + html.slice(panelEnd);
  }

  if (!html.includes('id="aiSessionClear"')) {
    const estimatePattern = /(<div class="ai-estimate" id="aiEstimate">[^<]*<\/div>)/;
    const estimateMatch = html.match(estimatePattern);
    if (!estimateMatch) throw new Error(`Missing AI estimate in ${locale.file}`);
    html = html.replace(estimatePattern, `$1
        <div class="ai-session-row">
          <span class="ai-session-note">${locale.note}</span>
          <button class="ai-session-clear" id="aiSessionClear" type="button" hidden>${locale.clear}</button>
        </div>`);
  }

  const renameLine = html.match(/  let renameMode\s+= 'original';[^\n]*/)?.[0];
  if (!renameLine) throw new Error(`Missing ${locale.file} rename state`);
  html = replaceOnce(
    html,
    renameLine,
    `${renameLine}

  function restoreCompositionState(settings = {}) {
    const validBackgrounds = new Set(['white', 'transparent', 'custom']);
    const validSizes = new Set(['2048', '1000', '500', 'original']);
    const validRenameModes = new Set(['original', 'sequence', 'date']);
    if (validBackgrounds.has(settings.bgMode)) bgMode = settings.bgMode;
    if (/^#[0-9A-Fa-f]{6}$/.test(settings.customHex || '')) customHex = settings.customHex;
    if (validSizes.has(settings.outputSize)) outputSize = settings.outputSize;
    if (validRenameModes.has(settings.renameMode)) renameMode = settings.renameMode;

    ['bgWhite','bgTransparent','bgCustom'].forEach(id => document.getElementById(id).classList.remove('active'));
    document.getElementById({ white: 'bgWhite', transparent: 'bgTransparent', custom: 'bgCustom' }[bgMode]).classList.add('active');
    document.getElementById('colorRow').style.display = bgMode === 'custom' ? 'flex' : 'none';
    document.getElementById('customColorPicker').value = customHex;
    document.getElementById('customColorHex').value = customHex.toUpperCase();
    document.querySelectorAll('.size-btn').forEach(button => button.classList.toggle('active', button.dataset.sz === outputSize));
    document.querySelectorAll('.rename-opt').forEach((option, index) => {
      option.classList.toggle('active', ['original', 'sequence', 'date'][index] === renameMode);
    });
  }`,
    `${locale.file} composition restore`,
  );

  html = replaceOnce(
    html,
    '  function handleFiles(files) {\n    const limit = currentUser ? 50 : 1;',
    `  function handleFiles(files, { restoredItems = [] } = {}) {
    const restoredByFile = new Map(restoredItems.map(item => [item.file, item]));
    const limit = currentUser ? 50 : 1;`,
    `${locale.file} restored files signature`,
  );
  html = replaceOnce(
    html,
    '      const i = startIndex + offset;\n      const card  = document.createElement(\'div\');',
    `      const i = startIndex + offset;
      const restoredItem = restoredByFile.get(file);
      const card  = document.createElement('div');`,
    `${locale.file} restored item lookup`,
  );
  html = replaceOnce(
    html,
    '      img.src = URL.createObjectURL(file);',
    '      img.src = URL.createObjectURL(restoredItem?.job?.outputBlob || restoredItem?.sourceBlob || file);',
    `${locale.file} restored preview`,
  );
  html = replaceOnce(
    html,
    "      badge.textContent = '⏳';",
    `      badge.textContent = restoredItem?.job?.outputBlob
        ? '✅'
        : restoredItem?.job?.status === 'failed'
          ? '❌'
          : restoredItem?.sourceBlob
            ? '✏️'
            : '⏳';`,
    `${locale.file} restored badge`,
  );
  html = replaceOnce(
    html,
    '      window.ShopBGLocalCleaner?.decorateCard(card, file, i, {\n        onApply:',
    '      window.ShopBGLocalCleaner?.decorateCard(card, file, i, {\n        initialSource: restoredItem?.sourceBlob || null,\n        onApply:',
    `${locale.file} restored local source`,
  );
  html = replaceOnce(
    html,
    '      aiWorkflow?.register(file, i, card);',
    '      aiWorkflow?.register(file, i, card, restoredItem?.job || null);',
    `${locale.file} restored AI job`,
  );

  html = replaceOnce(
    html,
    '    getCurrentUser: () => currentUser,\n    getSourceFile:',
    `    getCurrentUser: () => currentUser,
    getSessionOwner: () => currentUser?.id ? \`user:\${currentUser.id}\` : \`device:\${DEVICE_ID}\`,
    getCompositionState: () => ({ bgMode, customHex, outputSize, renameMode }),
    restoreFiles: (items, composition) => {
      restoreCompositionState(composition);
      handleFiles(items.map(item => item.file), { restoredItems: items });
    },
    getSourceFile:`,
    `${locale.file} session options`,
  );

  html = replaceOnce(
    html,
    '    showUpgradeModal,\n    onPlanChanged:',
    `    showUpgradeModal,
    onSessionNotice: setStatus,
    onSessionRestored: ({ count, outputs }) => {
      processedResults = outputs;
      const data = document.getElementById('aiWorkflowPanel').dataset;
      setStatus(window.ShopBGAiWorkflow.format(data.sessionRestored, { count }));
      if (!outputs.length) return;
      const totalMB = (outputs.reduce((sum, result) => sum + result.blob.size, 0) / 1048576).toFixed(1);
      const btn = document.getElementById('processBtn');
      btn.className = 'action-btn action-btn-download';
      btn.textContent = window.ShopBGAiWorkflow.format(${JSON.stringify(locale.download)}, { size: totalMB });
      btn.disabled = false;
      btn.onclick = downloadZip;
    },
    onPlanChanged:`,
    `${locale.file} session callbacks`,
  );

  const finalLoad = html.lastIndexOf('\n  loadUser();');
  if (finalLoad === -1) throw new Error(`Missing final loadUser in ${locale.file}`);
  html = html.slice(0, finalLoad)
    + `\n  const userReady = loadUser();
  window.addEventListener('load', () => {
    userReady.finally(() => aiWorkflow.restoreSession());
  }, { once: true });`
    + html.slice(finalLoad + '\n  loadUser();'.length);

  await writeFile(target, html);
  console.log(`Updated ${locale.file}`);
}
