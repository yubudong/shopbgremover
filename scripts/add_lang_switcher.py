#!/usr/bin/env python3
"""
给英文 .html 加 i18n 元素（幂等，可重复跑）：
  1) head 加 hreflang × 6 + x-default（如缺 canonical，一并补）
  2) <style> 末尾插 lang-switcher CSS
  3) nav 里 Sign-in 按钮前插 lang switcher dropdown
  4) </body> 前插 script，footer-copy 前插 footer-langs

用法：
  python3 scripts/add_lang_switcher.py        # 跑全部 7 个英文页
  python3 scripts/add_lang_switcher.py FILE   # 只跑指定文件
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://www.shopbgremover.com"

# (code, full_name, short_label, url_prefix)
LANGS = [
    ("en",    "English",     "EN",     ""),
    ("es",    "Español",     "ES",     "/es"),
    ("pt-BR", "Português",   "PT-BR",  "/pt-br"),
    ("zh-CN", "简体中文",     "简中",    "/zh-cn"),
    ("de",    "Deutsch",     "DE",     "/de"),
    ("fr",    "Français",    "FR",     "/fr"),
]

# filename -> slug (URL 部分，去 .html；首页 slug 为空)
PAGES = {
    "index.html":                         "",
    "shopify-background-remover.html":    "shopify-background-remover",
    "amazon-ebay-product-images.html":    "amazon-ebay-product-images",
    "pricing.html":                       "pricing",
    "contact.html":                       "contact",
    "privacy.html":                       "privacy",
    "terms.html":                         "terms",
}

LANG_CSS = """    /* Language switcher (i18n) */
    .lang-switcher { position: relative; }
    .lang-btn { background: rgba(255,255,255,0.08); color: #E5E7EB; border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 7px 12px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background 0.2s; }
    .lang-btn:hover { background: rgba(255,255,255,0.14); }
    .lang-caret { font-size: 10px; opacity: 0.7; }
    .lang-menu { display: none; position: absolute; top: calc(100% + 8px); right: 0; background: #1F2937; border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; min-width: 200px; padding: 6px 0; list-style: none; box-shadow: 0 10px 32px rgba(0,0,0,0.4); z-index: 100; }
    .lang-menu.open { display: block; }
    .lang-menu li { margin: 0; }
    .lang-menu a { display: flex; justify-content: space-between; align-items: center; padding: 9px 16px; color: #D1D5DB; text-decoration: none; font-size: 13px; }
    .lang-menu a:hover { background: rgba(255,255,255,0.08); color: #fff; }
    .lang-menu a.active { color: #60A5FA; font-weight: 700; }
    .lang-menu .lang-code { font-size: 11px; color: #6B7280; font-weight: 600; letter-spacing: 0.05em; }
    .lang-menu a.active .lang-code { color: #60A5FA; }
    .footer-langs { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; font-size: 12px; }
    .footer-langs a { color: #6B7280; text-decoration: none; padding: 4px 10px; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; transition: all 0.2s; }
    .footer-langs a:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
    .footer-langs a.active { color: #60A5FA; border-color: rgba(96,165,250,0.3); }
"""

LANG_SCRIPT = """
<script>
  function toggleLangMenu(e) {
    e.stopPropagation();
    document.getElementById('langMenu').classList.toggle('open');
  }
  document.addEventListener('click', function(e) {
    var menu = document.getElementById('langMenu');
    var switcher = document.querySelector('.lang-switcher');
    if (menu && switcher && !switcher.contains(e.target)) {
      menu.classList.remove('open');
    }
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      var menu = document.getElementById('langMenu');
      if (menu) menu.classList.remove('open');
    }
  });
</script>
"""


def url_for(prefix, slug):
    """生成 path：首页用 trailing slash，子页不用"""
    if slug:
        return f"{prefix}/{slug}"
    return f"{prefix}/" if prefix else "/"


def absolute_url(prefix, slug):
    return f"{BASE_URL}{url_for(prefix, slug)}"


def nav_switcher_html(current_lang, slug):
    items = []
    for code, full, short, prefix in LANGS:
        active = ' class="active"' if code == current_lang else ""
        href = url_for(prefix, slug)
        items.append(
            f'        <li role="none"><a role="menuitem" href="{href}" hreflang="{code}"{active}>{full} <span class="lang-code">{short}</span></a></li>'
        )
    items_html = "\n".join(items)
    btn_label = next(l[2] for l in LANGS if l[0] == current_lang)
    return (
        '    <div class="lang-switcher">\n'
        f'      <button class="lang-btn" onclick="toggleLangMenu(event)" aria-label="Change language" aria-haspopup="true">\n'
        f'        <span>🌐 {btn_label}</span>\n'
        f'        <span class="lang-caret">▾</span>\n'
        f'      </button>\n'
        f'      <ul class="lang-menu" id="langMenu" role="menu">\n'
        f'{items_html}\n'
        f'      </ul>\n'
        f'    </div>\n'
    )


def footer_langs_html(current_lang, slug):
    items = []
    for code, full, _, prefix in LANGS:
        active = ' class="active"' if code == current_lang else ""
        href = url_for(prefix, slug)
        items.append(f'    <a href="{href}" hreflang="{code}"{active}>{full}</a>')
    return (
        '  <div class="footer-langs" aria-label="Change language">\n'
        + "\n".join(items)
        + "\n  </div>\n"
    )


def hreflang_block(slug):
    lines = []
    for code, _, _, prefix in LANGS:
        href = absolute_url(prefix, slug)
        lines.append(f'  <link rel="alternate" hreflang="{code}" href="{href}" />')
    # x-default 指向英文
    x_default = absolute_url("", slug)
    lines.append(f'  <link rel="alternate" hreflang="x-default" href="{x_default}" />')
    return "\n".join(lines)


def canonical_tag(slug):
    return f'  <link rel="canonical" href="{absolute_url("", slug)}">'


def process_file(filename, slug):
    path = ROOT / filename
    if not path.exists():
        print(f"⊘ {filename}: 文件不存在，跳过")
        return
    html = path.read_text(encoding="utf-8")
    original = html
    changes = []

    # ===== 1. 加 canonical（如缺）+ hreflang block =====
    # 注：切换器里也有 hreflang= 属性，所以这里用更精确的 link rel=alternate 锚点
    if '<link rel="alternate" hreflang=' not in html:
        canonical = canonical_tag(slug)
        href_block = hreflang_block(slug)
        if 'rel="canonical"' in html:
            # 在已有 canonical 后插 hreflang
            new_html, n = re.subn(
                r'(<link rel="canonical"[^>]+>)',
                lambda m: m.group(1) + "\n" + href_block,
                html,
                count=1,
            )
            if n:
                html = new_html
                changes.append("hreflang")
        else:
            # 没 canonical：尝试 description meta → title fallback
            new_html, n = re.subn(
                r'(<meta name="description"[^>]+>)',
                lambda m: m.group(1) + "\n" + canonical + "\n" + href_block,
                html,
                count=1,
            )
            if n:
                html = new_html
                changes.append("canonical+hreflang")
            else:
                # fallback: 在 <title>...</title> 后插
                new_html, n = re.subn(
                    r'(<title>[^<]*</title>)',
                    lambda m: m.group(1) + "\n" + canonical + "\n" + href_block,
                    html,
                    count=1,
                )
                if n:
                    html = new_html
                    changes.append("canonical+hreflang(title-fallback)")
                else:
                    print(f"⚠ {filename}: description meta 和 title 都没找到，跳过 canonical/hreflang")

    # ===== 2. 在 </style> 末尾插 CSS =====
    if ".lang-switcher" not in html:
        idx = html.rfind("</style>")
        if idx == -1:
            print(f"⚠ {filename}: 没找到 </style>，跳过 CSS")
        else:
            # 找该行开头的缩进（用于格式好看，但不强制）
            html = html[:idx] + LANG_CSS + html[idx:]
            changes.append("CSS")

    # ===== 3. nav 里 sign-in 按钮前插 lang switcher =====
    if 'class="lang-switcher"' not in html:
        nav_block = nav_switcher_html("en", slug)
        # 优先匹配 id="authBtn"
        new_html, n = re.subn(
            r'(    <button[^>]*id="authBtn"[^>]*>.*?</button>)',
            lambda m: nav_block + m.group(1),
            html,
            count=1,
            flags=re.DOTALL,
        )
        if n:
            html = new_html
            changes.append("nav-switcher")
        else:
            # fallback: nav 里有 "Sign in" 文字的 button
            new_html, n = re.subn(
                r'(    <button[^>]*>\s*Sign in\s*</button>)',
                lambda m: nav_block + m.group(1),
                html,
                count=1,
            )
            if n:
                html = new_html
                changes.append("nav-switcher(fallback)")
            else:
                print(f"⚠ {filename}: 没找到 sign-in 按钮，nav switcher 未插入")

    # ===== 4. footer-copy 前插 footer-langs =====
    if 'class="footer-langs"' not in html:
        flangs = footer_langs_html("en", slug)
        new_html, n = re.subn(
            r'(  <div class="footer-copy")',
            lambda m: flangs + m.group(1),
            html,
            count=1,
        )
        if n:
            html = new_html
            changes.append("footer-langs")

    # ===== 5. </body> 前插 script =====
    # 注：nav 里 onclick="toggleLangMenu(..)" 也含这个字符串，所以用 "function toggleLangMenu" 作精确锚点
    if "function toggleLangMenu" not in html:
        new_html = html.replace("</body>", LANG_SCRIPT + "\n</body>", 1)
        if new_html != html:
            html = new_html
            changes.append("script")

    if html == original:
        print(f"○ {filename}: 已是最新，无改动")
    else:
        path.write_text(html, encoding="utf-8")
        print(f"✓ {filename}: {', '.join(changes)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 只处理指定文件
        for fname in sys.argv[1:]:
            slug = PAGES.get(fname)
            if slug is None:
                print(f"⚠ {fname}: 未在 PAGES 配置里，跳过")
                continue
            process_file(fname, slug)
    else:
        for fname, slug in PAGES.items():
            process_file(fname, slug)
