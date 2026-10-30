#!/usr/bin/env python3
"""Validate the French reader decks and (re)build data/french/manifest.json.

    python3 tools/french/build.py           # validate + rewrite the manifest
    python3 tools/french/build.py --check   # validate only

The reader loads manifest.json first, then one deck file at a time, so the
manifest must match the deck files on disk. Run after compile.py.
"""

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data" / "french"
MANIFEST = DATA / "manifest.json"
GENDERS = {"m", "f"}
# Decks appear in this order: by level, then topic.
KIND_ORDER = ["conversation", "sightseeing", "dining", "transport", "shopping", "problems"]


def check_deck(path, seen, problems):
    try:
        deck = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        problems.append(f"{path.name}: invalid JSON: {exc}")
        return None
    for field in ("id", "title", "level"):
        if not deck.get(field):
            problems.append(f"{path.name}: deck is missing '{field}'")
    if deck.get("id") != path.stem:
        problems.append(f"{path.name}: deck id should match the filename")
    for passage in deck.get("passages") or []:
        pid = passage.get("id", "?")
        where = f"{path.name} → {pid}"
        if pid in seen:
            problems.append(f"{where}: duplicate passage id (also in {seen[pid]})")
        seen[pid] = path.name
        if not passage.get("title"):
            problems.append(f"{where}: passage is missing 'title'")
        if not passage.get("sentences"):
            problems.append(f"{where}: passage has no sentences")
        for phrase in passage.get("phrases") or []:
            if not phrase.get("fr") or not phrase.get("en"):
                problems.append(f"{where}: phrase needs both 'fr' and 'en'")
        for i, sentence in enumerate(passage.get("sentences") or [], 1):
            if not sentence.get("en"):
                problems.append(f"{where} → sentence {i}: no English translation")
            if not sentence.get("tokens"):
                problems.append(f"{where} → sentence {i}: no tokens")
            for token in sentence.get("tokens") or []:
                if not token.get("w"):
                    problems.append(f"{where} → sentence {i}: token without 'w'")
                if token.get("g") and token["g"] not in GENDERS:
                    problems.append(f"{where} → sentence {i}: bad gender {token['g']!r}")
                if token.get("w", "")[:1].isalpha() and not token.get("en"):
                    problems.append(f"{where} → sentence {i}: '{token['w']}' has no gloss")
    if not deck.get("passages"):
        problems.append(f"{path.name}: deck has no passages")
    return deck


def sort_key(deck):
    kind = deck.get("kind", "")
    return (deck.get("level", ""),
            KIND_ORDER.index(kind) if kind in KIND_ORDER else 99,
            deck.get("id", ""))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate without writing")
    args = parser.parse_args()

    paths = sorted(p for p in DATA.glob("*.json") if p.name != MANIFEST.name)
    problems, seen, decks = [], {}, []
    for path in paths:
        deck = check_deck(path, seen, problems)
        if deck:
            decks.append((path, deck))

    for p in problems:
        print("  error  " + p, file=sys.stderr)
    n_pass = sum(len(d.get("passages", [])) for _, d in decks)
    n_sent = sum(len(p.get("sentences", [])) for _, d in decks for p in d.get("passages", []))
    print(f"{len(decks)} deck(s), {n_pass} passage(s), {n_sent} sentence(s), "
          f"{len(problems)} error(s)")
    if problems:
        return 1

    if not args.check:
        decks.sort(key=lambda pd: sort_key(pd[1]))
        manifest = {
            "generated_by": "tools/french/build.py",
            "decks": [
                {
                    "id": d["id"],
                    "file": f"data/french/{path.name}",
                    "title": d["title"],
                    "level": d["level"],
                    "kind": d.get("kind", ""),
                    "description": d.get("description", ""),
                    "passages": [
                        {"id": p["id"], "title": p["title"],
                         "title_en": p.get("title_en", ""), "tags": p.get("tags", []),
                         # Lets the browse search find a passage by its phrases.
                         "search": " ".join(f"{ph['fr']} {ph['en']}"
                                            for ph in p.get("phrases", []))}
                        for p in d["passages"]
                    ],
                }
                for path, d in decks
            ],
        }
        MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n",
                            encoding="utf-8")
        print(f"Wrote {MANIFEST.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
