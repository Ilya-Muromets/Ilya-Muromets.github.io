#!/usr/bin/env python3
"""Bundle one language's reader into a single self-contained HTML file.

    python3 tools/reader/preview.py japanese [-o out.html] [--fragment]

The hosted page fetches its decks at runtime and loads the shared engine from
/reader/, so it needs a web server. This inlines the site stylesheet, the shared
CSS and JS, and every deck into one file that opens from disk, travels over
email, or embeds anywhere a lone .html can go.

Markup, CSS and JS are copied verbatim — only the data source is swapped, via a
fetch shim over the same URLs — so a bundle can never drift from the real page.
"""

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def section(html, tag, where):
    match = re.search(rf"<{tag}[^>]*>(.*)</{tag}>", html, re.S)
    if not match:
        sys.exit(f"Could not find a <{tag}> block in {where}")
    return match.group(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lang", help="language id, e.g. chinese or japanese")
    parser.add_argument("-o", "--out")
    parser.add_argument(
        "--fragment",
        action="store_true",
        help="emit only title/style/body, for hosts that supply their own document shell",
    )
    args = parser.parse_args()

    languages = json.loads((REPO / "reader" / "languages.json").read_text(encoding="utf-8"))
    if args.lang not in languages:
        sys.exit(f"Unknown language {args.lang!r}")
    meta = languages[args.lang]
    data = REPO / "data" / args.lang
    page_path = REPO / args.lang / "index.html"
    out = Path(args.out or (REPO / f"{args.lang}-standalone.html"))

    page = page_path.read_text(encoding="utf-8")
    body = section(page, "body", page_path)
    page_css = section(page, "style", page_path)          # the per-language font block
    css = "\n".join([
        (REPO / "stylesheet.css").read_text(encoding="utf-8"),
        (REPO / "reader" / "reader.css").read_text(encoding="utf-8"),
        page_css,
    ])
    engine = (REPO / "reader" / "reader.js").read_text(encoding="utf-8")

    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    embedded = {f"/data/{args.lang}/manifest.json": manifest}
    for entry in manifest["decks"]:
        embedded["/" + entry["file"]] = json.loads(
            (REPO / entry["file"]).read_text(encoding="utf-8"))

    # Serve the decks from memory instead of over the network. Everything the
    # reader itself does — including its error handling — stays untouched.
    shim = (
        "  <script>\n"
        "    // Injected by tools/reader/preview.py: the decks below replace the\n"
        "    // fetches the hosted page makes. Nothing here leaves the document.\n"
        "    (function () {\n"
        "      var EMBEDDED = " + json.dumps(embedded, ensure_ascii=False) + ";\n"
        "      var realFetch = window.fetch ? window.fetch.bind(window) : null;\n"
        "      window.fetch = function (url) {\n"
        "        if (Object.prototype.hasOwnProperty.call(EMBEDDED, url)) {\n"
        "          return Promise.resolve({\n"
        "            ok: true,\n"
        "            status: 200,\n"
        "            json: function () { return Promise.resolve(EMBEDDED[url]); }\n"
        "          });\n"
        "        }\n"
        "        if (!realFetch) return Promise.reject(new Error('Not bundled: ' + url));\n"
        "        return realFetch.apply(null, arguments);\n"
        "      };\n"
        "    })();\n"
        "  </script>\n"
    )

    # The engine arrives inline rather than from /reader/, and the link back to
    # the site is absolute because the bundle travels on its own.
    body = body.replace('href="/"', 'href="https://ilyac.info/"')
    body = body.replace('<script src="/reader/reader.js"></script>',
                        shim + "  <script>\n" + engine + "\n  </script>")

    if args.fragment:
        out.write_text(
            f"<title>{meta['title']}</title>\n<style>\n{css}</style>\n{body}",
            encoding="utf-8")
    else:
        out.write_text(
            '<!DOCTYPE HTML>\n<html lang="en">\n<head>\n'
            '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f"<title>{meta['title']}</title>\n"
            f"<style>\n{css}</style>\n</head>\n<body>{body}</body>\n</html>\n",
            encoding="utf-8")

    kind = "fragment" if args.fragment else "standalone"
    print(f"Wrote {out} ({out.stat().st_size / 1024:.0f} KB, {kind})")


if __name__ == "__main__":
    main()
