"""
毎朝6時JST に実行し、前日の省庁ニュースを Claude で要約して Gmail に送る。
必要な環境変数:
  ANTHROPIC_API_KEY   - Anthropic API キー
  GMAIL_USER          - 送信元 Gmail アドレス
  GMAIL_APP_PASSWORD  - Gmail アプリパスワード
  RECIPIENT_EMAIL     - 送信先メールアドレス
"""

import os
import sys
import smtplib
import textwrap
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import anthropic
import feedparser
import requests
from bs4 import BeautifulSoup

JST = timezone(timedelta(hours=9))


# ─── ニュースソース定義 ────────────────────────────────────────────
SOURCES = [
    {
        "name": "経済産業省",
        "short": "METI",
        "type": "rss",
        "url": "https://www.meti.go.jp/rss/whatsnew.rdf",
    },
    {
        "name": "デジタル庁",
        "short": "Digital",
        "type": "scrape_digital",
        "url": "https://www.digital.go.jp/news/",
    },
    {
        "name": "内閣府",
        "short": "CAO",
        "type": "rss",
        "url": "https://www.cao.go.jp/rss/cao/news.xml",
    },
    {
        "name": "金融庁",
        "short": "FSA",
        "type": "rss",
        "url": "https://www.fsa.go.jp/rss/fsa.rdf",
    },
    {
        "name": "日本銀行",
        "short": "BOJ",
        "type": "rss",
        "url": "https://www.boj.or.jp/rss/news.xml",
    },
    {
        "name": "FISC（金融情報システムセンター）",
        "short": "FISC",
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
    """feedparser エントリから JST の datetime を返す。"""
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            import calendar
            ts = calendar.timegm(t)
            return datetime.fromtimestamp(ts, tz=JST)
    return None


def fetch_rss(source: dict, yesterday) -> list[dict]:
    """RSS/Atom フィードから前日記事を取得する。"""
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
                    "date": pub.strftime("%Y-%m-%d"),
                })
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} RSS 取得失敗: {e}", file=sys.stderr)
        return []


def fetch_scrape_digital(source: dict, yesterday) -> list[dict]:
    """デジタル庁ニュースページをスクレイピングする。"""
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        # ニュースリスト: <li> に日付テキストと <a> タグ
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
                articles.append({
                    "title": link_el.get_text(strip=True),
                    "url": href,
                    "summary": "",
                    "date": str(pub),
                })
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} スクレイピング失敗: {e}", file=sys.stderr)
        return []


def fetch_scrape_fisc(source: dict, yesterday) -> list[dict]:
    """FISC ニュースページをスクレイピングする。"""
    try:
        resp = requests.get(source["url"], headers=HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        for item in soup.select("div.news-item, li.news-list__item, .entry-list li"):
            date_el = item.select_one("time, .date, .news-date, span.date")
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
                articles.append({
                    "title": link_el.get_text(strip=True),
                    "url": href,
                    "summary": "",
                    "date": str(pub),
                })
        return articles
    except Exception as e:
        print(f"[警告] {source['name']} スクレイピング失敗: {e}", file=sys.stderr)
        return []


def fetch_articles(source: dict, yesterday) -> list[dict]:
    fetch_fn = {
        "rss": fetch_rss,
        "scrape_digital": fetch_scrape_digital,
        "scrape_fisc": fetch_scrape_fisc,
    }
    fn = fetch_fn.get(source["type"])
    if fn:
        return fn(source, yesterday)
    return []


# ─── Claude による要約 ───────────────────────────────────────────

def build_prompt(all_articles: dict[str, list[dict]], yesterday) -> str:
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


def summarize(all_articles: dict[str, list[dict]], yesterday) -> str:
    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    prompt = build_prompt(all_articles, yesterday)

    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
        system=(
            "あなたは省庁・金融規制機関のニュースを読者にわかりやすくまとめる"
            "優秀なアナリストです。専門用語は適宜補足し、重要ポイントを簡潔に伝えてください。"
        ),
    )
    return message.content[0].text


# ─── メール送信 ─────────────────────────────────────────────────

def send_email(summary: str, yesterday) -> None:
    gmail_user = os.environ["GMAIL_USER"]
    app_password = os.environ["GMAIL_APP_PASSWORD"]
    recipient = os.environ["RECIPIENT_EMAIL"]

    subject = f"【省庁ニュース要約】{yesterday} 分"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = gmail_user
    msg["To"] = recipient

    plain_body = textwrap.dedent(f"""\
        {subject}

        {summary}

        ---
        このメールは自動送信されています。
        ソース: 経済産業省 / デジタル庁 / 内閣府 / 金融庁 / 日本銀行 / FISC
    """)

    html_body = f"""
    <html><body style="font-family:sans-serif;max-width:700px;margin:auto;padding:16px">
    <h2 style="color:#333">{subject}</h2>
    <div style="white-space:pre-wrap;line-height:1.7">{summary}</div>
    <hr>
    <p style="color:#888;font-size:12px">
      このメールは自動送信されています。<br>
      ソース: 経済産業省 / デジタル庁 / 内閣府 / 金融庁 / 日本銀行 / FISC
    </p>
    </body></html>
    """

    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(gmail_user, app_password)
        server.sendmail(gmail_user, recipient, msg.as_string())

    print(f"メール送信完了: {recipient}")


# ─── エントリポイント ────────────────────────────────────────────

def main():
    now = datetime.now(JST)
    yesterday = (now - timedelta(days=1)).date()
    print(f"[{now.strftime('%Y-%m-%d %H:%M:%S JST')}] {yesterday} 分のニュースを収集開始")

    all_articles: dict[str, list[dict]] = {}
    total = 0
    for source in SOURCES:
        articles = fetch_articles(source, yesterday)
        all_articles[source["name"]] = articles
        print(f"  {source['name']}: {len(articles)} 件")
        total += len(articles)

    print(f"合計 {total} 件取得。Claude で要約中...")
    summary = summarize(all_articles, yesterday)

    print("メール送信中...")
    send_email(summary, yesterday)
    print("完了")


if __name__ == "__main__":
    main()
