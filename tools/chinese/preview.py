#!/usr/bin/env python3
"""Bundle the reader into one self-contained HTML file.

    python3 tools/chinese/preview.py [-o out.html]

chinese/index.html fetches its decks at runtime, so it needs a web server.
This inlines stylesheet.css and every deck into a single file that works
from disk, over email, or anywhere a lone .html can be opened. Markup, CSS,
and JS are copied verbatim from that page — only the data source is
swapped — so the bundle can't drift from the real page.
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data" / "chinese"


def section(html, tag):
    match = re.search(rf"<{tag}[^>]*>(.*)</{tag}>", html, re.S)
    if not match:
        sys.exit(f"Could not find a <{tag}> block in chinese/index.html")
    return match.group(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--out", default=str(REPO / "chinese-standalone.html"))
    parser.add_argument(
        "--fragment",
        action="store_true",
        help="emit only title/style/body, for hosts that supply their own document shell",
    )
    args = parser.parse_args()

    page = (REPO / "chinese" / "index.html").read_text(encoding="utf-8")
    base_css = (REPO / "stylesheet.css").read_text(encoding="utf-8")
    page_css = section(page, "style")
    body = section(page, "body")

    manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))
    decks = {
        entry["id"]: json.loads((REPO / entry["file"]).read_text(encoding="utf-8"))
        for entry in manifest["decks"]
    }
    embedded = {"/data/chinese/manifest.json": manifest}
    for entry in manifest["decks"]:
        embedded["/" + entry["file"]] = decks[entry["id"]]

    # Serve the decks from memory instead of over the network. Everything the
    # reader itself does — including its error handling — stays untouched.
    shim = (
        "<script>\n"
        "    // Injected by tools/chinese/preview.py: the decks below replace the\n"
        "    // fetches the hosted page makes. Nothing here leaves the document.\n"
        "    (function () {\n"
        "      var EMBEDDED = " + json.dumps(embedded, ensure_ascii=False) + ";\n"
        "      var realFetch = window.fetch ? window.fetch.bind(window) : null;\n"
        "      window.fetch = function (url) {\n"
        "        if (Object.prototype.hasOwnProperty.call(EMBEDDED, url)) {\n"
        "          var payload = EMBEDDED[url];\n"
        "          return Promise.resolve({\n"
        "            ok: true,\n"
        "            status: 200,\n"
        "            json: function () { return Promise.resolve(payload); }\n"
        "          });\n"
        "        }\n"
        "        if (!realFetch) return Promise.reject(new Error('Not bundled: ' + url));\n"
        "        return realFetch.apply(null, arguments);\n"
        "      };\n"
        "    })();\n"
        "  </script>\n\n  "
    )

    # The bundle travels on its own, so the link back to the site is absolute.
    body = body.replace('href="/"', 'href="https://ilyac.info/"')
    body = body.replace("  <script>", shim + "<script>", 1)

    out = Path(args.out)
    if args.fragment:
        out.write_text(
            f"<title>Mandarin Reader</title>\n<style>\n{base_css}\n{page_css}</style>\n{body}",
            encoding="utf-8",
        )
        print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB, fragment)")
        return

    out.write_text(
        "<!DOCTYPE HTML>\n<html lang=\"en\">\n<head>\n"
        "<meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<title>Mandarin Reader</title>\n"
        f"<style>\n{base_css}\n{page_css}</style>\n</head>\n<body>{body}</body>\n</html>\n",
        encoding="utf-8",
    )
    print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
