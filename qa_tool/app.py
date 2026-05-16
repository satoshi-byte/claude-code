import json
from pathlib import Path

import anthropic
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder="static")

DATA_FILE = Path(__file__).parent / "data" / "content.json"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024
MAX_CHARS_PER_PAGE = 3000
TOP_K_PAGES = 8  # 質問に関連するページを最大8件選ぶ

SYSTEM_INSTRUCTION = (
    "あなたは boy.co.jp（横浜銀行）についての質問に答える、丁寧で親切なAIアシスタントです。\n\n"
    "【回答方針】\n"
    "- サイトのコンテンツに基づいて正確にお答えください。\n"
    "- 答えがコンテンツ内に見つからない場合は、その旨を伝えつつ、公式サイトや電話窓口への案内をしてください。\n"
    "- 回答の際は、該当ページのタイトルとURLを引用してください。\n\n"
    "【クレーム・ご不満への対応】\n"
    "お客さまからクレームや不満の声があった場合は、以下のように対応してください：\n"
    "- まず「ご不便をおかけして大変申し訳ございません」などと誠実にお詫びする。\n"
    "- お客さまの気持ちに寄り添い、共感を示す。\n"
    "- 解決策や相談窓口（ハローサービス：0120-188-824）を案内する。\n"
    "- 前向きで温かみのある言葉で締めくくる。\n\n"
    "【禁止事項】\n"
    "- 提供されたコンテンツにない情報を推測で答えないこと。\n\n"
)

pages: list[dict] = []


def load_content():
    global pages
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Content file not found: {DATA_FILE}\n"
            "Run:  python3 scraper.py  first."
        )
    pages = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    print(f"Loaded {len(pages)} pages")


load_content()

claude = anthropic.Anthropic()


def find_relevant_pages(question: str, top_k: int = TOP_K_PAGES) -> list[dict]:
    """質問のn-gramでページをスコアリングして上位を返す（日本語対応）。"""
    # 2〜4文字のn-gramを生成（日本語はスペースで分かれないため）
    ngrams = set()
    for n in (2, 3, 4):
        for i in range(len(question) - n + 1):
            gram = question[i:i+n]
            ngrams.add(gram)

    scored = []
    for p in pages:
        text = p['title'] + p['url'] + p['content']
        score = sum(1 for g in ngrams if g in text)
        scored.append((score, p))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [p for _, p in scored[:top_k]]


def build_prompt_body(selected_pages: list[dict]) -> str:
    sections = []
    for p in selected_pages:
        content = p['content'][:MAX_CHARS_PER_PAGE]
        sections.append(f"## [{p['title']}]({p['url']})\n\n{content}")
    return "# サイトコンテンツ\n\n" + "\n\n---\n\n".join(sections)


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json(force=True)
    question = (data.get("question") or "").strip()
    if not question:
        return jsonify({"error": "question is required"}), 400

    try:
        selected = find_relevant_pages(question)
        prompt_body = build_prompt_body(selected)
        system_text = SYSTEM_INSTRUCTION + prompt_body

        print(f"Using {len(selected)} pages ({len(system_text):,} chars) for: {question[:40]}")

        response = claude.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system_text,
            messages=[{"role": "user", "content": question}],
        )

        answer_block = next(
            (b for b in response.content if b.type == "text"), None
        )
        answer = answer_block.text if answer_block else "(no answer)"

        u = response.usage
        print(f"[tokens] in={u.input_tokens} out={u.output_tokens}")

        return jsonify({"answer": answer})

    except anthropic.APIError as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
