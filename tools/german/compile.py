#!/usr/bin/env python3
"""Expand passage sources in data/german/src/ into reader deck JSON.

    python3 tools/german/compile.py              # compile every deck source
    python3 tools/german/compile.py a1-basics    # just one
    python3 tools/german/compile.py --stats      # also list words above level

A source file carries only German and English, one sentence each. Every
word's gloss, dictionary form and gender come from data/german/src/lexicon.txt,
so a word is glossed once and reads the same everywhere. Any word missing
from the lexicon is reported and nothing is written.

Format is documented in data/german/SCHEMA.md.
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data" / "german"
SRC = DATA / "src"
LEXICON = SRC / "lexicon.txt"

OPENERS = "„\"‚(«»"
CLOSERS = ".,!?;:“\"‘)»«…"
DASHES = {"–", "—", "-"}
NUMBER = re.compile(r"^(\d[\d.,:/–-]*|€|%|\$)$")

POS = {"m", "f", "n", "pl", "v", "adj", "adv", "prep", "pron", "art", "conj",
       "num", "part", "intj", "phr", "name"}
GENDERED = {"m", "f", "n", "pl"}
LEVELS = ["A1", "A2", "B1", "B2", "C1"]


def load_lexicon(problems):
    """Parse lexicon.txt: key | pos | gloss | dictionary form | level | note."""
    lex = {}
    for lineno, raw in enumerate(LEXICON.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        fields = [f.strip() for f in line.split("|")]
        while len(fields) < 6:
            fields.append("")
        key, pos, gloss, dform, level, note = fields[:6]
        where = f"lexicon.txt:{lineno}"
        if not key or not gloss:
            problems.append(f"{where}: needs at least a key, part of speech and gloss")
            continue
        if pos not in POS:
            problems.append(f"{where}: unknown part of speech {pos!r} for {key!r}")
        if level and level != "-" and level not in LEVELS:
            problems.append(f"{where}: unknown level {level!r} for {key!r}")
        if key in lex:
            problems.append(f"{where}: {key!r} is defined twice (first on line {lex[key]['line']})")
            continue
        lex[key] = {"pos": pos, "en": gloss, "d": dform or key,
                    "lvl": level or "-", "note": note, "line": lineno, "used": 0}
    return lex


def parse_source(path):
    deck = {"passages": []}
    passage = None
    pending = None
    problems = []

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue
        if line.startswith("# deck:"):
            for field in line[len("# deck:"):].split("|"):
                if "=" in field:
                    key, value = (s.strip() for s in field.split("=", 1))
                    deck[key] = float(value) if key == "vocab_min" else value
            continue
        if line.startswith("# desc:"):
            deck["description"] = line[len("# desc:"):].strip()
            continue
        if line.startswith("#"):
            continue

        if line.startswith("@"):
            if pending:
                problems.append(f"{path.name}:{pending[1]}: German line with no translation")
                pending = None
            fields = [f.strip() for f in line[1:].split("|")]
            while len(fields) < 4:
                fields.append("")
            passage = {
                "id": fields[0],
                "title": fields[1],
                "title_en": fields[2],
                "tags": [t.strip() for t in fields[3].split(",") if t.strip()],
                "sentences": [],
            }
            deck["passages"].append(passage)
            continue

        if passage is None:
            problems.append(f"{path.name}:{lineno}: text before the first @ passage")
            continue
        if pending is None:
            pending = (line, lineno)
        else:
            passage["sentences"].append({"de": pending[0], "en": line, "line": pending[1]})
            pending = None

    if pending:
        problems.append(f"{path.name}:{pending[1]}: German line with no translation")
    return deck, problems


def split_chunk(chunk):
    """'„Hallo,' -> ['„', 'Hallo', ',']. Apostrophes stay inside words."""
    lead, trail = [], []
    while chunk and chunk[0] in OPENERS:
        lead.append(chunk[0])
        chunk = chunk[1:]
    while chunk and chunk[-1] in CLOSERS and not chunk.endswith("}"):
        # Keep a decimal or time intact: "12,50." loses only the final dot.
        trail.insert(0, chunk[-1])
        chunk = chunk[:-1]
    return lead, chunk, trail


def lookup(core, lex, sentence_start):
    """Find the lexicon entry for a word as written.

    'surface{key}' names the entry outright, for words with two readings
    ('die{die:pron}'). Otherwise the exact spelling wins; a capital that is
    only there because the word starts the sentence falls back to lowercase.
    """
    m = re.fullmatch(r"(.+?)\{(.+)\}", core)
    if m:
        surface, key = m.group(1), m.group(2)
        return surface.replace("_", " "), key, lex.get(key)
    surface = core.replace("_", " ")
    if surface in lex:
        return surface, surface, lex[surface]
    if sentence_start and surface[:1].isupper():
        lower = surface[:1].lower() + surface[1:]
        if lower in lex:
            return surface, lower, lex[lower]
    return surface, surface, None


def build_tokens(line, lex, where, problems):
    tokens = []
    start = True
    for chunk in line.split():
        if chunk in DASHES:
            tokens.append({"w": "–"})
            continue
        lead, core, trail = split_chunk(chunk)
        # Abbreviations keep their dot: "Dr." is a word, not "Dr" + ".".
        if trail and trail[0] == "." and core and (core + ".") in lex:
            core += "."
            trail = trail[1:]
        for ch in lead:
            tokens.append({"w": ch})
            start = True   # quoted speech starts with a capital
        if core:
            if NUMBER.match(core):
                tokens.append({"w": core})
            else:
                surface, key, entry = lookup(core, lex, start)
                if entry is None:
                    problems.append((where, key))
                else:
                    entry["used"] += 1
                    token = {"w": surface, "en": entry["en"]}
                    if entry["d"] != surface:
                        token["d"] = entry["d"]
                    if entry["pos"] in GENDERED:
                        token["g"] = entry["pos"]
                    token["p"] = entry["pos"]
                    if entry["note"]:
                        token["n"] = entry["note"]
                    token["_lvl"] = entry["lvl"]
                    token["_key"] = key
                    tokens.append(token)
            start = False
        for ch in trail:
            tokens.append({"w": ch})
            if ch in ".!?:":
                start = True
    return tokens


def coverage(deck):
    """Share of word tokens at or below the deck's target level."""
    target = deck.get("vocab_level") or deck.get("level", "")
    if target not in LEVELS:
        return None
    ceiling = LEVELS.index(target)
    total, above = 0, Counter()
    for passage in deck["passages"]:
        for sentence in passage["sentences"]:
            for token in sentence["tokens"]:
                lvl = token.get("_lvl")
                if lvl is None:
                    continue
                total += 1
                if lvl != "-" and LEVELS.index(lvl) > ceiling:
                    above[token["_key"]] += 1
    if not total:
        return None
    return {"target": target, "share": 1 - sum(above.values()) / total, "above": above}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="deck sources to compile (default: all)")
    parser.add_argument("--stats", action="store_true", help="list words above each deck's level")
    args = parser.parse_args()

    problems = []
    lex = load_lexicon(problems)
    if problems:
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1

    paths = sorted(p for p in SRC.glob("*.txt") if p.name != LEXICON.name)
    if args.names:
        wanted = {n.replace(".txt", "") for n in args.names}
        paths = [p for p in paths if p.stem in wanted]
    if not paths:
        print(f"No sources found in {SRC}", file=sys.stderr)
        return 1

    missing = []
    built = []
    for path in paths:
        deck, structural = parse_source(path)
        problems.extend(structural)
        for key in ("id", "title", "level"):
            if not deck.get(key):
                problems.append(f"{path.name}: deck header is missing {key}")
        if deck.get("id") and deck["id"] != path.stem:
            problems.append(f"{path.name}: deck id {deck['id']!r} should match the filename")
        deck_missing = []
        for passage in deck["passages"]:
            sentences = []
            for sentence in passage["sentences"]:
                where = f"{path.name}:{sentence['line']} ({passage['id']})"
                tokens = build_tokens(sentence["de"], lex, where, deck_missing)
                sentences.append({"en": sentence["en"], "tokens": tokens})
            passage["sentences"] = sentences
        missing.extend(deck_missing)
        built.append((path, deck, bool(deck_missing)))

    if problems or missing:
        for p in problems:
            print("  " + p, file=sys.stderr)
        for where, key in missing[:40]:
            print(f"  {where}: {key!r} is not in lexicon.txt", file=sys.stderr)
        if len(missing) > 40:
            print(f"  ... and {len(missing) - 40} more", file=sys.stderr)
        if missing:
            words = sorted({k for _, k in missing}, key=str.lower)
            print(f"\n{len(words)} word(s) to add to lexicon.txt:\n  " + "  ".join(words),
                  file=sys.stderr)
        return 1

    order = ["id", "title", "level", "kind", "description", "passages"]
    for path, deck, _ in built:
        cov = coverage(deck)
        floor = deck.get("vocab_min", 0.90)
        for passage in deck["passages"]:
            for sentence in passage["sentences"]:
                for token in sentence["tokens"]:
                    token.pop("_lvl", None)
                    token.pop("_key", None)
        out = {k: deck[k] for k in order if k in deck}
        target = DATA / (deck["id"] + ".json")
        target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n",
                          encoding="utf-8")
        n_sent = sum(len(p["sentences"]) for p in deck["passages"])
        line = f"{target.name}: {len(deck['passages'])} passages, {n_sent} sentences"
        if cov:
            line += f", {cov['share']:.0%} at or below {cov['target']}"
            if cov["share"] < floor:
                line += f"  (warn: aiming for {floor:.0%})"
        print(line)
        if cov and args.stats and cov["above"]:
            print("    above level: " + "  ".join(
                f"{k}×{n}" for k, n in cov["above"].most_common(40)))

    unused = [k for k, e in lex.items() if not e["used"]]
    print(f"Lexicon: {len(lex)} entries, {len(unused)} unused.")
    print("Now run tools/german/build.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
