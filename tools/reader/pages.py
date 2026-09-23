#!/usr/bin/env python3
"""Generate each language's reader page from the shared template.

    python3 tools/reader/pages.py            # write every language's page
    python3 tools/reader/pages.py --check    # fail if any page is out of date

Every reader on the site is the same page: the same chrome, the same controls,
the same behaviour. Keeping one template and filling it per language is what
makes that true — a control added here appears in every reader at once, rather
than in whichever copies got remembered.

What varies lives in reader/languages.json: the title, the script shown in the
heading, the name of the reading ("Pinyin" / "Kana"), the CJK font stack, and
whether the language has tones to colour.
"""

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
READER = REPO / "reader"

TONES_CONTROL = """        <div class="ctrl">
          <label>Tones</label>
          <div class="seg" id="seg-tones">
            <button data-value="on">Color</button>
            <button data-value="off">Plain</button>
          </div>
        </div>

"""

HINT_TONES = " &nbsp;·&nbsp;\n        <kbd>t</kbd> tones"


def render(lang_id, lang):
    template = (READER / "page.template.html").read_text(encoding="utf-8")
    config = {
        "dataRoot": f"/data/{lang_id}/",
        "storeKey": lang["storeKey"],
        "tones": lang["tones"],
        "path": f"/{lang_id}/",
    }
    fields = {
        "TITLE": lang["title"],
        "DESCRIPTION": lang["description"],
        "BRAND": lang["brand"],
        "READING_LABEL": lang["readingLabel"],
        "READING_WORD": lang["readingWord"],
        "CJK_FONT": lang["cjkFont"],
        "TONES_CONTROL": TONES_CONTROL if lang["tones"] else "",
        "HINT_TONES": HINT_TONES if lang["tones"] else "",
        "CONFIG": json.dumps(config, indent=6)[:-1] + "    }",
    }
    for key, value in fields.items():
        template = template.replace("{{" + key + "}}", value)

    left = [line for line in template.splitlines() if "{{" in line]
    if left:
        sys.exit(f"{lang_id}: unfilled placeholder in {left[0].strip()}")
    return template


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify pages match the template without writing")
    args = parser.parse_args()

    languages = json.loads((READER / "languages.json").read_text(encoding="utf-8"))
    stale = []
    for lang_id, lang in languages.items():
        page = render(lang_id, lang)
        target = REPO / lang_id / "index.html"
        current = target.read_text(encoding="utf-8") if target.exists() else None
        if args.check:
            if current != page:
                stale.append(lang_id)
            continue
        target.parent.mkdir(exist_ok=True)
        target.write_text(page, encoding="utf-8")
        print(f"{lang_id}/index.html  ({len(page.splitlines())} lines)")

    if stale:
        print("Out of date, re-run without --check: " + ", ".join(stale), file=sys.stderr)
        return 1
    if args.check:
        print(f"{len(languages)} page(s) match the template")
    return 0


if __name__ == "__main__":
    sys.exit(main())
