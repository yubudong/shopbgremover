(() => {
  'use strict';

  const workspaceCopy = {
    en: {
      choose: 'Choose images',
      add: 'Add images',
      images: 'Images',
      oneImage: '1 image',
      manyImages: '{count} images',
      previewHint: 'Select a thumbnail to preview',
    },
    de: {
      choose: 'Bilder auswählen',
      add: 'Bilder hinzufügen',
      images: 'Bilder',
      oneImage: '1 Bild',
      manyImages: '{count} Bilder',
      previewHint: 'Vorschaubild zum Anzeigen auswählen',
    },
    es: {
      choose: 'Elegir imágenes',
      add: 'Añadir imágenes',
      images: 'Imágenes',
      oneImage: '1 imagen',
      manyImages: '{count} imágenes',
      previewHint: 'Selecciona una miniatura para verla',
    },
    fr: {
      choose: 'Choisir des images',
      add: 'Ajouter des images',
      images: 'Images',
      oneImage: '1 image',
      manyImages: '{count} images',
      previewHint: 'Sélectionnez une vignette à afficher',
    },
    'pt-br': {
      choose: 'Escolher imagens',
      add: 'Adicionar imagens',
      images: 'Imagens',
      oneImage: '1 imagem',
      manyImages: '{count} imagens',
      previewHint: 'Selecione uma miniatura para visualizar',
    },
    'zh-cn': {
      choose: '选择图片',
      add: '添加图片',
      images: '图片',
      oneImage: '1 张图片',
      manyImages: '{count} 张图片',
      previewHint: '选择缩略图以查看大图',
    },
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
    const copy = workspaceCopy[locale()];
    const callToAction = document.createElement('span');
    callToAction.className = 'workspace-upload-cta';
    callToAction.setAttribute('aria-hidden', 'true');
    callToAction.textContent = copy.choose;
    callToAction.dataset.chooseLabel = copy.choose;
    callToAction.dataset.addLabel = copy.add;

    const heading = upload.querySelector(':scope > h3');
    const description = upload.querySelector(':scope > p');
    const formats = upload.querySelector(':scope > .format-chips');
    if (!heading || !description || !formats) return;

    const summary = document.createElement('div');
    summary.className = 'workspace-upload-summary';
    const summaryCopy = document.createElement('div');
    summaryCopy.className = 'workspace-upload-copy';
    summaryCopy.append(heading, description);
    summary.append(summaryCopy, callToAction, formats);
    upload.querySelector('.upload-icon')?.after(summary);
  }

  function enhanceGallery(grid) {
    if (grid.closest('.workspace-gallery-shell')) {
      return grid.closest('.workspace-gallery-shell');
    }

    const copy = workspaceCopy[locale()];
    const shell = document.createElement('section');
    shell.className = 'workspace-gallery-shell';
    shell.setAttribute('aria-label', copy.images);

    const header = document.createElement('div');
    header.className = 'workspace-gallery-head';
    const title = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = copy.images;
    const count = document.createElement('span');
    count.className = 'workspace-gallery-count';
    title.append(strong, count);
    const hint = document.createElement('span');
    hint.className = 'workspace-gallery-hint';
    hint.textContent = copy.previewHint;
    header.append(title, hint);

    const upload = document.getElementById('uploadArea');
    const preview = document.getElementById('workspacePreview');
    const media = document.createElement('div');
    media.className = 'workspace-media-layout';
    preview?.before(media);
    shell.append(header, grid);
    media.append(shell);
    if (preview) media.append(preview);
    shell.addEventListener('click', event => event.stopPropagation());
    return shell;
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
    const gallery = enhanceGallery(grid);
    const countLabel = gallery.querySelector('.workspace-gallery-count');
    const uploadCta = document.querySelector('.workspace-upload-cta');
    const copy = workspaceCopy[locale()];
    let autoPreviewed = false;

    const update = () => {
      const imageCount = grid.querySelectorAll(':scope > .image-card').length;
      const hasImages = imageCount > 0;
      document.body.classList.toggle('workspace-has-images', hasImages);
      document.body.classList.toggle('workspace-empty', !hasImages);
      gallery.hidden = !hasImages;
      if (countLabel) {
        countLabel.textContent = imageCount === 1
          ? copy.oneImage
          : copy.manyImages.replace('{count}', imageCount);
      }
      if (uploadCta) {
        uploadCta.textContent = hasImages
          ? uploadCta.dataset.addLabel
          : uploadCta.dataset.chooseLabel;
      }

      if (hasImages && !autoPreviewed) {
        autoPreviewed = true;
        requestAnimationFrame(() => {
          if (!document.getElementById('workspacePreview')?.classList.contains('visible')) {
            grid.querySelector(':scope > .image-card')?.click();
          }
        });
      }
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
