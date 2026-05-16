import json
from pathlib import Path

import anthropic
from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder="static")

DATA_FILE = Path(__file__).parent / "data" / "content.json"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 1024


MAX_PAGES_IN_PROMPT = 10
MAX_CHARS_PER_PAGE = 2000


def build_system_prompt(pages: list[dict]) -> str:
    sections = []
    for p in pages[:MAX_PAGES_IN_PROMPT]:
        content = p['content'][:MAX_CHARS_PER_PAGE]
        section = f"## [{p['title']}]({p['url']})\n\n{content}"
        sections.append(section)
    body = "\n\n---\n\n".join(sections)
    return (
        "あなたは boy.co.jp（日本のファッション・セレクトショップ）についての質問に答えるアシスタントです。"
        "以下に示すサイトのコンテンツのみを根拠として回答してください。"
        "答えがコンテンツ内に見つからない場合は、その旨を明確に伝えてください。"
        "回答の際は、該当ページのタイトルと URL を引用してください。\n\n"
        "# サイトコンテンツ\n\n" + body
    )


pages: list[dict] = []
system_prompt: str = ""


def load_content():
    global pages, system_prompt
    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Content file not found: {DATA_FILE}\n"
            "Run:  python scraper.py  first."
        )
    pages = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    system_prompt = build_system_prompt(pages)
    print(f"Loaded {len(pages)} pages ({len(system_prompt):,} chars in system prompt)")


load_content()

claude = anthropic.Anthropic()


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
        response = claude.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            # Prompt caching: the system block is byte-identical on every request
            # (built once at startup). The cache_control marker covers the entire
            # system + site content prefix. The user question arrives after the
            # breakpoint in messages[0] and never invalidates the cache.
            system=[
                {
                    "type": "text",
                    "text": system_prompt,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": question}],
        )

        answer_block = next(
            (b for b in response.content if b.type == "text"), None
        )
        answer = answer_block.text if answer_block else "(no answer)"

        u = response.usage
        print(
            f"[cache] creation={u.cache_creation_input_tokens} "
            f"read={u.cache_read_input_tokens} "
            f"uncached={u.input_tokens} out={u.output_tokens}"
        )

        return jsonify({"answer": answer})

    except anthropic.APIError as exc:
        return jsonify({"error": str(exc)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
