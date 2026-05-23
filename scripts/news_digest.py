"""
毎朝6時JST に実行し、前日の省庁ニュースを Claude で要約する。
結果は標準出力と GitHub Actions ジョブサマリー ($GITHUB_STEP_SUMMARY) に書き出す。

必要な環境変数:
  ANTHROPIC_API_KEY - Anthropic API キー
"""

import os
import sys
from datetime import datetime, timedelta, timezone

import anthropic
import feedparser
import requests
from bs4 import BeautifulSoup

JST = timezone(timedelta(hours=9))


# ─── ニュースソース定義 ────────────────────────────────────────────
SOURCES = [
    {
        "name": "経済産業省",
        "type": "rss",
        "url": "https://www.meti.go.jp/rss/whatsnew.rdf",
    },
    {
        "name": "デジタル庁",
        "type": "scrape_digital",
        "url": "https://www.digital.go.jp/news/",
    },
    {
        "name": "内閣府",
        "type": "rss",
        "url": "https://www.cao.go.jp/rss/cao/news.xml",
    },
    {
        "name": "金融庁",
        "type": "rss",
        "url": "https://www.fsa.go.jp/rss/fsa.rdf",
    },
    {
        "name": "日本銀行",
        "type": "rss",
        "url": "https://www.boj.or.jp/rss/news.xml",
    },
    {
        "name": "FISC（金融情報システムセンター）",
        "type": "scrape_fisc",
        "url": "https://www.fisc.or.jp/news/",
    },
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; NewsDigestBot/1.0; "
        "+https://github.com/satoshi-byte/claude-code)"
    )
}


# ─── フェッチ処理 ────────────────────────────────────────────────

def _parse_date(entry) -> datetime | None:
    import calendar
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            return datetime.fromtimestamp(calendar.timegm(t), tz=JST)
    return None


def fetch_rss(source: dict, yesterday) -> list[dict]:
    try:
        feed = feedparser.parse(source["url"])
        articles = []
        for entry in feed.entries:
            pub = _parse_date(entry)
            if pub and pub.date() == yesterday:
                articles.append({
                    "title": entry.get("title", "(タイトルなし)"),
                    "url": entry.get("link", ""),
                    "summary": entry.get("summary", ""),
                })
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} RSS 取得失敗: {e}", file=sys.stderr)
        return []


def fetch_scrape_digital(source: dict, yesterday) -> list[dict]:
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        for li in soup.select("ul.news-list li, ul.c-newsList__list li, article.news-item"):
            date_el = li.select_one("time, .date, .news-date")
            link_el = li.select_one("a")
            if not date_el or not link_el:
                continue
            date_text = date_el.get("datetime") or date_el.get_text(strip=True)
            try:
                pub = datetime.strptime(date_text[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
            if pub == yesterday:
                href = link_el.get("href", "")
                if href.startswith("/"):
                    href = "https://www.digital.go.jp" + href
                articles.append({"title": link_el.get_text(strip=True), "url": href, "summary": ""})
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} スクレイピング失敗: {e}", file=sys.stderr)
        return []


def fetch_scrape_fisc(source: dict, yesterday) -> list[dict]:
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        for item in soup.select("div.news-item, li.news-list__item, .entry-list li"):
            date_el = item.select_one("time, .date, span.date")
            link_el = item.select_one("a")
            if not date_el or not link_el:
                continue
            date_text = date_el.get("datetime") or date_el.get_text(strip=True)
            try:
                pub = datetime.strptime(date_text[:10], "%Y-%m-%d").date()
            except ValueError:
                continue
            if pub == yesterday:
                href = link_el.get("href", "")
                if href.startswith("/"):
                    href = "https://www.fisc.or.jp" + href
                articles.append({"title": link_el.get_text(strip=True), "url": href, "summary": ""})
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} スクレイピング失敗: {e}", file=sys.stderr)
        return []


def fetch_articles(source: dict, yesterday) -> list[dict]:
    fn = {"rss": fetch_rss, "scrape_digital": fetch_scrape_digital, "scrape_fisc": fetch_scrape_fisc}
    return fn[source["type"]](source, yesterday) if source["type"] in fn else []


# ─── Claude による要約 ───────────────────────────────────────────

def build_prompt(all_articles: dict, yesterday) -> str:
    lines = [
        f"以下は {yesterday} に各省庁・機関が発表したニュース・プレスリリースの一覧です。",
        "各機関ごとに日本語で簡潔に要約してください。",
        "記事がない機関は「前日の発表なし」と記載してください。",
        "出力形式: 機関名ごとに見出しを付け、箇条書きで要点をまとめてください。",
        "",
    ]
    for source in SOURCES:
        name = source["name"]
        articles = all_articles.get(name, [])
        lines.append(f"## {name}")
        if not articles:
            lines.append("（記事取得なし）")
        else:
            for a in articles:
                lines.append(f"- [{a['title']}]({a['url']})")
                if a.get("summary"):
                    lines.append(f"  概要: {a['summary'][:200]}")
        lines.append("")
    return "\n".join(lines)


def summarize(all_articles: dict, yesterday) -> str:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": build_prompt(all_articles, yesterday)}],
        system=(
            "あなたは省庁・金融規制機関のニュースを読者にわかりやすくまとめる"
            "優秀なアナリストです。専門用語は適宜補足し、重要ポイントを簡潔に伝えてください。"
        ),
    )
    return message.content[0].text


# ─── GitHub Actions サマリー出力 ─────────────────────────────────

def write_summary(summary: str, yesterday) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    content = f"# 省庁ニュース要約 — {yesterday}\n\n{summary}\n"
    if summary_path:
        with open(summary_path, "w", encoding="utf-8") as f:
            f.write(content)
    print(content)


# ─── エントリポイント ────────────────────────────────────────────

def main():
    now = datetime.now(JST)
    yesterday = (now - timedelta(days=1)).date()
    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S JST')}] {yesterday} 分のニュースを収集開始")

    all_articles: dict = {}
    total = 0
    for source in SOURCES:
        articles = fetch_articles(source, yesterday)
        all_articles[source["name"]] = articles
        print(f"  {source['name']}: {len(articles)} 件")
        total += len(articles)

    print(f"合計 {total} 件取得。Claude で要約中...")
    summary = summarize(all_articles, yesterday)
    write_summary(summary, yesterday)
    print("完了")


if __name__ == "__main__":
    main()
