#!/usr/bin/env python3
"""把 index.html 的 UI 改动批量应用到 4 个翻译版（es/pt-br/de/fr）。
英文已手动改过，跳过。

4 处改动：
  1. 删除 <div class="tool-pricing">...</div> 整块
  2. media query 800px 拆成 1100px (workspace) + 800px (其他)
  3. 在 lang-switcher CSS 之前插入 trust section CSS
  4. 在 action-bar 之前插入 trust section HTML
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

LANG_DIRS = {"es": "es", "pt-BR": "pt-br", "de": "de", "fr": "fr"}

OLD_MEDIA = """    /* Responsive */
    @media (max-width: 800px) {
      .workspace { flex-direction: column; }
      .settings-panel { width: 100%; position: static; }
      .nav-links { display: none; }
      .tool-features { grid-template-columns: 1fr; }
      .tool-pricing-cards { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .tp-price { font-size: 1.1rem; }
      .action-bar { padding: 14px 16px; }
      .action-bar-inner { flex-wrap: wrap; }
      .action-btn { width: 100%; min-width: unset; }
      .status-text { min-width: unset; }
    }"""

NEW_MEDIA = """    /* Responsive: workspace folds to column on tablets too (1100 instead of 800) */
    @media (max-width: 1100px) {
      .workspace { flex-direction: column; }
      .settings-panel { width: 100%; position: static; }
    }
    @media (max-width: 800px) {
      .nav-links { display: none; }
      .tool-features { grid-template-columns: 1fr; }
      .action-bar { padding: 14px 16px; }
      .action-bar-inner { flex-wrap: wrap; }
      .action-btn { width: 100%; min-width: unset; }
      .status-text { min-width: unset; }
    }"""

# 单行 CSS 版本的 media query（pt-br/de/fr 用）
OLD_MEDIA_INLINE = """@media (max-width: 800px) {
      .workspace { flex-direction: column; }
      .settings-panel { width: 100%; position: static; }
      .nav-links { display: none; }
      .tool-features { grid-template-columns: 1fr; }
      .tool-pricing-cards { grid-template-columns: repeat(3, 1fr); gap: 6px; }
      .tp-price { font-size: 1.1rem; }
      .action-bar { padding: 14px 16px; }
      .action-bar-inner { flex-wrap: wrap; }
      .action-btn { width: 100%; min-width: unset; }
      .status-text { min-width: unset; }
    }"""

NEW_MEDIA_INLINE = """@media (max-width: 1100px) {
      .workspace { flex-direction: column; }
      .settings-panel { width: 100%; position: static; }
    }
    @media (max-width: 800px) {
      .nav-links { display: none; }
      .tool-features { grid-template-columns: 1fr; }
      .action-bar { padding: 14px 16px; }
      .action-bar-inner { flex-wrap: wrap; }
      .action-btn { width: 100%; min-width: unset; }
      .status-text { min-width: unset; }
    }"""

TRUST_CSS = """    /* ── Trust / Why us ─────────────────────────────────── */
    .trust-section { padding: 72px 24px; background: var(--bg); border-top: 1px solid var(--border); }
    .trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 960px; margin: 40px auto 0; }
    @media (max-width: 700px) { .trust-grid { grid-template-columns: 1fr; max-width: 380px; } }
    .trust-card { background: white; border: 1px solid var(--border); border-radius: 16px; padding: 32px 28px; text-align: center; transition: transform 0.2s, box-shadow 0.2s; }
    .trust-card:hover { transform: translateY(-3px); box-shadow: var(--sh-lg); }
    .trust-icon { font-size: 32px; margin-bottom: 14px; display: block; }
    .trust-card h3 { font-size: 16px; font-weight: 700; margin-bottom: 8px; color: var(--text); }
    .trust-card p { font-size: 14px; color: var(--text-2); line-height: 1.6; }

"""

TRUST_HTML = {
    "es": """<!-- Trust / Why us -->
<section class="trust-section">
  <div class="section-head">
    <span class="section-eyebrow">Por qué ShopBG Remover</span>
    <h2 class="section-title">Hecho para vendedores de e-commerce serios</h2>
  </div>
  <div class="trust-grid">
    <div class="trust-card">
      <span class="trust-icon">🔒</span>
      <h3>Sin almacenamiento de datos</h3>
      <p>Imágenes procesadas en tiempo real y eliminadas al instante. Cumple con GDPR. Nunca vemos, guardamos ni compartimos tus fotos.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">💰</span>
      <h3>5× más por menos</h3>
      <p>Hasta 5× más imágenes que remove.bg a la mitad del precio. Sin marcas de agua, sin límites de resolución en planes pagados.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">⚡</span>
      <h3>Listo para marketplace</h3>
      <p>Salidas dimensionadas exactamente para Shopify (2048), Amazon (1000) e eBay (500). Sube, procesa, descarga.</p>
    </div>
  </div>
</section>

""",
    "pt-BR": """<!-- Trust / Why us -->
<section class="trust-section">
  <div class="section-head">
    <span class="section-eyebrow">Por que ShopBG Remover</span>
    <h2 class="section-title">Feito para vendedores de e-commerce sérios</h2>
  </div>
  <div class="trust-grid">
    <div class="trust-card">
      <span class="trust-icon">🔒</span>
      <h3>Sem armazenamento</h3>
      <p>Imagens processadas em tempo real e excluídas na hora. Compatível com LGPD/GDPR. Nunca vemos, guardamos ou compartilhamos suas fotos.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">💰</span>
      <h3>5× mais por menos</h3>
      <p>Até 5× mais imagens que remove.bg pela metade do preço. Sem marca d'água, sem limite de resolução nos planos pagos.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">⚡</span>
      <h3>Pronto para marketplace</h3>
      <p>Saídas no tamanho exato para Shopify (2048), Amazon (1000) e eBay (500). Suba, processe, baixe.</p>
    </div>
  </div>
</section>

""",
    "de": """<!-- Trust / Why us -->
<section class="trust-section">
  <div class="section-head">
    <span class="section-eyebrow">Warum ShopBG Remover</span>
    <h2 class="section-title">Entwickelt für ernsthafte E-Commerce-Verkäufer</h2>
  </div>
  <div class="trust-grid">
    <div class="trust-card">
      <span class="trust-icon">🔒</span>
      <h3>Keine Datenspeicherung</h3>
      <p>Bilder in Echtzeit verarbeitet und sofort gelöscht. DSGVO-konform. Wir sehen, speichern oder teilen deine Fotos nie.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">💰</span>
      <h3>5× mehr für weniger</h3>
      <p>Bis zu 5× mehr Bilder als remove.bg zum halben Preis. Keine Wasserzeichen, keine Auflösungslimits bei bezahlten Plänen.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">⚡</span>
      <h3>Marketplace-ready</h3>
      <p>Ausgaben in genau der Größe für Shopify (2048), Amazon (1000) und eBay (500). Hochladen, verarbeiten, herunterladen.</p>
    </div>
  </div>
</section>

""",
    "fr": """<!-- Trust / Why us -->
<section class="trust-section">
  <div class="section-head">
    <span class="section-eyebrow">Pourquoi ShopBG Remover</span>
    <h2 class="section-title">Conçu pour les vendeurs e-commerce sérieux</h2>
  </div>
  <div class="trust-grid">
    <div class="trust-card">
      <span class="trust-icon">🔒</span>
      <h3>Aucun stockage</h3>
      <p>Images traitées en temps réel et supprimées instantanément. Conforme RGPD. Nous ne voyons, ne stockons ni ne partageons vos photos.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">💰</span>
      <h3>5× plus pour moins</h3>
      <p>Jusqu'à 5× plus d'images que remove.bg à la moitié du prix. Pas de filigrane, pas de limite de résolution sur les plans payants.</p>
    </div>
    <div class="trust-card">
      <span class="trust-icon">⚡</span>
      <h3>Prêt pour marketplace</h3>
      <p>Sorties dimensionnées exactement pour Shopify (2048), Amazon (1000) et eBay (500). Glissez, traitez, téléchargez.</p>
    </div>
  </div>
</section>

""",
}


def remove_tool_pricing_block(html):
    """删除 tool-pricing div 块（用 div 嵌套深度计数找匹配 </div>）"""
    marker = '<div class="tool-pricing">'
    start = html.find(marker)
    if start == -1:
        return html, False  # 已删除

    # 找匹配的 </div>，考虑嵌套
    depth = 1
    pos = start + len(marker)
    end = -1
    while pos < len(html):
        next_open = html.find('<div', pos)
        next_close = html.find('</div>', pos)
        if next_close == -1:
            return html, False
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + 4
        else:
            depth -= 1
            if depth == 0:
                end = next_close + len('</div>')
                break
            pos = next_close + len('</div>')

    if end == -1:
        return html, False

    # 找开始之前的行首（含缩进）
    line_start = html.rfind('\n', 0, start) + 1

    # 看上面一行是不是 <!-- Pricing highlight --> 注释
    above_end = line_start - 1
    if above_end > 0 and html[above_end] == '\n':
        # 看 above line
        above_start = html.rfind('\n', 0, above_end) + 1
        above_line = html[above_start:above_end]
        if 'Pricing highlight' in above_line:
            line_start = above_start
            # 再看上一行是不是空行
            if above_start > 0 and html[above_start - 1] == '\n':
                prev_start = html.rfind('\n', 0, above_start - 1) + 1
                prev_line = html[prev_start:above_start - 1].strip()
                if prev_line == '':
                    line_start = prev_start

    # 找结尾后的换行（如果有）
    while end < len(html) and html[end] == '\n':
        end += 1

    new_html = html[:line_start] + html[end:]
    return new_html, True


def update_media_query(html):
    """800px → 1100px (workspace) + 800px (其他) 拆分"""
    if NEW_MEDIA in html or NEW_MEDIA_INLINE in html:
        return html, False
    if OLD_MEDIA in html:
        return html.replace(OLD_MEDIA, NEW_MEDIA, 1), True
    if OLD_MEDIA_INLINE in html:
        return html.replace(OLD_MEDIA_INLINE, NEW_MEDIA_INLINE, 1), True
    return html, False


def add_trust_css(html):
    """在 lang-switcher CSS 之前插入 trust CSS"""
    if '.trust-section' in html:
        return html, False
    # 找 "/* Language switcher" 注释
    marker = '/* Language switcher'
    idx = html.find(marker)
    if idx == -1:
        # 找 .lang-switcher { position: relative; } 第一次出现
        marker = '.lang-switcher { position: relative; }'
        idx = html.find(marker)
        if idx == -1:
            return html, False
    # 找该行行首
    line_start = html.rfind('\n', 0, idx) + 1
    return html[:line_start] + TRUST_CSS + html[line_start:], True


def add_trust_section(html, lang):
    """在 action-bar 之前插入 trust section HTML"""
    if 'class="trust-section"' in html:
        return html, False
    marker = '<!-- Action Bar -->'
    idx = html.find(marker)
    if idx == -1:
        marker = '<div class="action-bar"'
        idx = html.find(marker)
        if idx == -1:
            return html, False
    line_start = html.rfind('\n', 0, idx) + 1
    return html[:line_start] + TRUST_HTML[lang] + html[line_start:], True


if __name__ == "__main__":
    for lang, dir_name in LANG_DIRS.items():
        path = ROOT / dir_name / "index.html"
        if not path.exists():
            print(f"⊘ {dir_name}/index.html: 不存在，跳过")
            continue
        html = path.read_text(encoding='utf-8')
        orig = html
        actions = []

        html, ok = remove_tool_pricing_block(html)
        if ok:
            actions.append("remove pricing")

        html, ok = update_media_query(html)
        if ok:
            actions.append("media 1100")

        html, ok = add_trust_css(html)
        if ok:
            actions.append("trust CSS")

        html, ok = add_trust_section(html, lang)
        if ok:
            actions.append("trust section")

        if html == orig:
            print(f"○ {dir_name}/index.html: 无改动")
        else:
            path.write_text(html, encoding='utf-8')
            print(f"✓ {dir_name}/index.html: {', '.join(actions)}")
