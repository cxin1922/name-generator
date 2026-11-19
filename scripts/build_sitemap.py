#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
重新產生 sitemap.xml。

用法：在 repo 根目錄執行
    python scripts/build_sitemap.py

做的事：掃描整個網站目錄，依照 Cloudflare Workers 靜態資源服務既有的
「乾淨網址」轉換規則（見 NOTES.md 第三十一節），把每個 .html 檔對應到
它實際對外的網址，重新寫出 sitemap.xml。

之後新增任何工具頁面、文章頁，只要檔案放在對的位置（例如新工具用
`<新工具>/index.html`，新文章放進 `articles/`），不需要修改這支腳本，
直接重新跑一次即可把新頁面補進 sitemap.xml。

這支腳本只讀取檔案結構來判斷「有哪些頁面」，不會去讀頁面內容，也不會
主動執行 git 或任何部署動作——重新產生後要不要 commit / push，由使用者
自己決定。
"""

import os
import sys
from pathlib import Path

BASE_URL = "https://getnamechop.com"

# 不是網站內容的目錄，掃描時整個跳過（包含所有以 . 開頭的目錄，例如
# .git、.claude、.wrangler）。
EXCLUDE_DIR_NAMES = {
    "assets",
    "css",
    "js",
    "data",
    "docs",
    "scripts",
    "node_modules",
}


def is_excluded_dir(name: str) -> bool:
    return name.startswith(".") or name in EXCLUDE_DIR_NAMES


def find_html_files(root: Path):
    """回傳 root 底下所有 .html 檔案的相對路徑（用 / 分隔，不含開頭的 ./）。"""
    results = []
    for dirpath, dirnames, filenames in os.walk(root):
        # 就地修改 dirnames，讓 os.walk 不要往排除的目錄底下走
        dirnames[:] = [d for d in dirnames if not is_excluded_dir(d)]
        for filename in filenames:
            if filename.endswith(".html"):
                rel = Path(dirpath, filename).relative_to(root)
                results.append(rel.as_posix())
    return results


def to_clean_url(rel_path: str) -> str:
    """把檔案的相對路徑轉成網站上的乾淨網址（對應 Cloudflare 的自動轉換規則）。"""
    if rel_path == "index.html":
        return "/"
    if rel_path.endswith("/index.html"):
        return "/" + rel_path[: -len("index.html")]
    return "/" + rel_path[: -len(".html")]


def build_sitemap_urls(root: Path):
    rel_paths = find_html_files(root)
    urls = sorted({to_clean_url(p) for p in rel_paths})

    home = []
    leaf_dirs = []       # 只有 index.html 的頂層目錄頁，例如 /baby-name/
    flat_pages = []      # 根目錄下的單檔頁面，例如 /faq、/about
    hub_dirs = {}        # 目錄底下除了 index.html 還有其他頁面，例如 /articles/

    # 先找出每個「目錄首頁」底下實際還有哪些其他頁面（用來判斷是 leaf 還是 hub）
    dir_children = {}
    for url in urls:
        if url == "/" or not url.endswith("/"):
            continue
        children = [
            u for u in urls
            if u != url and u.startswith(url) and not u.endswith("/")
        ]
        dir_children[url] = sorted(children)

    for url in urls:
        if url == "/":
            home.append(url)
        elif url.endswith("/"):
            if dir_children.get(url):
                hub_dirs[url] = dir_children[url]
            else:
                leaf_dirs.append(url)
        else:
            # 排除「其實是某個 hub 目錄底下的子頁面」，那些會跟著 hub 目錄一起輸出
            if any(url in children for children in dir_children.values()):
                continue
            flat_pages.append(url)

    ordered = []
    ordered.extend(home)
    ordered.extend(sorted(leaf_dirs))
    ordered.extend(sorted(flat_pages))
    for hub_url in sorted(hub_dirs):
        ordered.append(hub_url)
        ordered.extend(hub_dirs[hub_url])

    return ordered


def render_sitemap(urls):
    lines = ['<?xml version="1.0" encoding="UTF-8"?>']
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    for url in urls:
        lines.append(f"  <url><loc>{BASE_URL}{url}</loc></url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def main():
    # Windows 終端機（PowerShell／cmd）預設編碼不是 UTF-8，中文訊息直接印會變亂碼，
    # 跟寫入檔案本身無關，只是顯示用，這裡強制輸出用 UTF-8。
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    root = Path(__file__).resolve().parent.parent
    urls = build_sitemap_urls(root)
    content = render_sitemap(urls)

    sitemap_path = root / "sitemap.xml"
    old_content = sitemap_path.read_text(encoding="utf-8") if sitemap_path.exists() else None

    sitemap_path.write_text(content, encoding="utf-8", newline="\n")

    print(f"共 {len(urls)} 個網址，已寫入 {sitemap_path}")
    if old_content is not None and old_content.replace("\r\n", "\n") == content:
        print("內容跟原本一樣，沒有變化。")
    else:
        print("內容有更新，請自行檢查 git diff 再決定要不要 commit。")


if __name__ == "__main__":
    sys.exit(main())
