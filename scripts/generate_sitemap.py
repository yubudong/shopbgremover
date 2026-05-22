#!/usr/bin/env python3
"""生成 sitemap.xml — 35 URL（7 页面 × 5 语种）+ hreflang alternates。
URL 用无 .html 格式（跟线上 CF Pages 308 后的 canonical 一致）。"""

from pathlib import Path
from datetime import date

ROOT = Path(__file__).resolve().parent.parent
BASE_URL = "https://www.shopbgremover.com"

# slug 列表（空字符串 = 首页 /）
PAGES = ["", "shopify-background-remover", "amazon-ebay-product-images", "pricing", "contact", "privacy", "terms"]

# (code, url prefix)
LANGS = [
    ("en", ""),
    ("es", "/es"),
    ("pt-BR", "/pt-br"),
    ("de", "/de"),
    ("fr", "/fr"),
]

today = date.today().isoformat()  # YYYY-MM-DD


def url_for(prefix, slug):
    if not slug:
        return f"{BASE_URL}{prefix}/" if prefix else f"{BASE_URL}/"
    return f"{BASE_URL}{prefix}/{slug}"


def page_priority(slug):
    if slug == "":
        return "1.0"
    if slug in ("shopify-background-remover", "amazon-ebay-product-images"):
        return "0.9"
    if slug == "pricing":
        return "0.8"
    return "0.3"


def changefreq(slug):
    return "weekly" if slug == "" else ("monthly" if slug in ("shopify-background-remover", "amazon-ebay-product-images", "pricing") else "yearly")


urls_xml = []
for slug in PAGES:
    for code, prefix in LANGS:
        loc = url_for(prefix, slug)
        # 每个 URL 都加完整的 xhtml:link alternates（含自己 + 4 个其他 + x-default）
        alternates = []
        for alt_code, alt_prefix in LANGS:
            alt_loc = url_for(alt_prefix, slug)
            alternates.append(f'    <xhtml:link rel="alternate" hreflang="{alt_code}" href="{alt_loc}" />')
        # x-default 指向英文
        x_default = url_for("", slug)
        alternates.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{x_default}" />')

        urls_xml.append(f'''  <url>
    <loc>{loc}</loc>
    <lastmod>{today}</lastmod>
    <changefreq>{changefreq(slug)}</changefreq>
    <priority>{page_priority(slug)}</priority>
{chr(10).join(alternates)}
  </url>''')

sitemap = f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
{chr(10).join(urls_xml)}
</urlset>
'''

(ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
print(f"✓ sitemap.xml: {len(PAGES) * len(LANGS)} URL，每个含 {len(LANGS) + 1} 个 hreflang alternates")
