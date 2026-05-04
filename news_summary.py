#!/usr/bin/env python3
"""IT/AIニュース要約ツール - Claude APIを使ってRSSフィードを要約します"""

import feedparser
import anthropic
import os
from datetime import datetime

FEEDS = [
    ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/"),
    ("The Verge AI",  "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml"),
    ("ITmedia AI+",   "https://rss.itmedia.co.jp/rss/2.0/aiplus.xml"),
]

ARTICLES_PER_FEED = 3


def fetch_articles():
    articles = []
    for source, url in FEEDS:
        feed = feedparser.parse(url)
        for entry in feed.entries[:ARTICLES_PER_FEED]:
            title = entry.get("title", "")
            summary = entry.get("summary", entry.get("description", ""))[:500]
            articles.append(f"[{source}] {title}\n{summary}")
    return articles


def summarize(articles: list[str]) -> str:
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 環境変数を自動で読み込む

    articles_text = "\n\n---\n\n".join(articles)
    prompt = f"""以下はIT・AIニュースの記事一覧です。日本語で要約してください。

各記事を1〜2文で簡潔にまとめ、最後に「今日のポイント」として全体の傾向を3行でまとめてください。

{articles_text}"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def main():
    print(f"=== IT/AIニュース要約 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===\n")
    print("ニュースを取得中...")
    articles = fetch_articles()

    if not articles:
        print("記事を取得できませんでした。ネットワーク接続を確認してください。")
        return

    print(f"{len(articles)}件の記事を取得しました。要約中...\n")
    summary = summarize(articles)
    print(summary)


if __name__ == "__main__":
    main()
