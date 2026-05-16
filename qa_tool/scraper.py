import asyncio
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

START_URL = "https://www.boy.co.jp/"
MAX_PAGES = 80
OUTPUT = Path(__file__).parent / "data" / "content.json"

SKIP_EXTENSIONS = {
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
    ".css", ".js", ".ico", ".webp", ".woff", ".woff2", ".zip",
}
BOILERPLATE_TAGS = [
    "nav", "footer", "header", "script", "style",
    "noscript", "aside", "form",
]


def is_internal(url: str, base_domain: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https", ""):
        return False
    if parsed.netloc and parsed.netloc != base_domain:
        return False
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in SKIP_EXTENSIONS):
        return False
    if parsed.query:
        return False
    return True


def extract_text(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.string.strip() if soup.title else "Untitled"
    for tag in BOILERPLATE_TAGS:
        for el in soup.find_all(tag):
            el.decompose()
    main = (
        soup.find("main")
        or soup.find(id="main")
        or soup.find(id="content")
        or soup.body
    )
    if not main:
        return title, ""
    text = main.get_text(separator="\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text[:8000]


async def crawl() -> list[dict]:
    base_domain = urlparse(START_URL).netloc
    visited: set[str] = set()
    # 重要なページを優先的にクロール（金利・商品詳細ページを含む）
    priority_urls = [
        "https://www.boy.co.jp/kojin/card-loan/",
        "https://www.boy.co.jp/kojin/card-loan/bankcardloan/",
        "https://www.boy.co.jp/kojin/card-loan/outline/",
        "https://www.boy.co.jp/kojin/card-loan/kinri/",
        "https://www.boy.co.jp/kojin/jutaku-loan/",
        "https://www.boy.co.jp/kojin/jutaku-loan/kinri/",
        "https://www.boy.co.jp/kojin/mycar-loan/",
        "https://www.boy.co.jp/kojin/education-loan/",
        "https://www.boy.co.jp/kojin/free-loan/",
        "https://www.boy.co.jp/kojin/teiki/",
        "https://www.boy.co.jp/kojin/chochiku-yokin/",
        "https://www.boy.co.jp/tenpo/",
        "https://www.boy.co.jp/kojin/kinri/",
        "https://www.boy.co.jp/rate/",
    ]
    queue: list[str] = [START_URL] + priority_urls
    pages: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
        )
        context = await browser.new_context(
            ignore_https_errors=True,
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="ja-JP",
            extra_http_headers={
                "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )
        page = await context.new_page()

        while queue and len(pages) < MAX_PAGES:
            url = queue.pop(0)
            normalized = url.rstrip("/")
            if normalized in visited:
                continue
            visited.add(normalized)

            try:
                print(f"[{len(pages)+1}/{MAX_PAGES}] {url}")
                resp = await page.goto(url, timeout=30000, wait_until="networkidle")
                if not resp or resp.status >= 400:
                    print(f"  → HTTP {resp.status if resp else 'no response'}, skipped")
                    continue
                # ページを一番下までスクロールして遅延読み込みコンテンツを表示
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await page.wait_for_timeout(1000)

                html = await page.content()
                title, content = extract_text(html)
                if content.strip():
                    pages.append({"url": url, "title": title, "content": content})

                # <a href> だけでなく data-href / data-url 属性も収集
                links = await page.evaluate("""() => {
                    const hrefs = new Set();
                    document.querySelectorAll('a[href]').forEach(e => hrefs.add(e.href));
                    document.querySelectorAll('[data-href]').forEach(e => hrefs.add(e.dataset.href));
                    document.querySelectorAll('[data-url]').forEach(e => hrefs.add(e.dataset.url));
                    return [...hrefs];
                }""")
                for link in links:
                    abs_link = urljoin(url, link).split("#")[0]
                    if is_internal(abs_link, base_domain):
                        norm = abs_link.rstrip("/")
                        if norm not in visited and abs_link not in queue:
                            queue.append(abs_link)

            except Exception as exc:
                print(f"  Skipped {url}: {exc}")

        await browser.close()

    return pages


async def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    print(f"Starting crawl from {START_URL}")
    pages = await crawl()
    print(f"\nCrawled {len(pages)} pages. Saving to {OUTPUT}")
    OUTPUT.write_text(
        json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
