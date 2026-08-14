#!/usr/bin/env python3
"""Validate the Chinese reader decks and (re)build data/chinese/manifest.json.

Usage:
    python3 tools/chinese/build.py           # validate + rewrite the manifest
    python3 tools/chinese/build.py --check   # validate only, don't write (CI-friendly)
    python3 tools/chinese/build.py --stats   # also print a vocabulary summary

The reader loads manifest.json first, then fetches one deck file at a time, so
the manifest must stay in sync with whatever deck files are on disk. Run this
after adding or editing a deck.

Schema is documented in data/chinese/SCHEMA.md.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data" / "chinese"
MANIFEST = DATA / "manifest.json"

# Tone marks, as combining codepoints after NFD normalization.
TONE_MARKS = {"̄": 1, "́": 2, "̌": 3, "̀": 4}
CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
# A pinyin syllable after stripping tone marks: plain ASCII letters plus ü.
PINYIN_BODY = re.compile(r"^[a-zü]+$")


class Problem:
    def __init__(self, where, message, fatal=True):
        self.where = where
        self.message = message
        self.fatal = fatal

    def __str__(self):
        kind = "error" if self.fatal else "warn "
        return f"  {kind}  {self.where}: {self.message}"


def strip_tones(syllable):
    """Return (bare_syllable, tone_number). Tone 5 = neutral / unmarked."""
    decomposed = unicodedata.normalize("NFD", syllable)
    tone = 5
    bare = []
    for ch in decomposed:
        if ch in TONE_MARKS:
            tone = TONE_MARKS[ch]
        elif unicodedata.combining(ch):
            # A diaeresis on u (ü) is part of the letter, not a tone.
            bare.append(ch)
        else:
            bare.append(ch)
    return unicodedata.normalize("NFC", "".join(bare)), tone


def syllables(py):
    return [s for s in py.split() if s]


def check_token(token, where, problems):
    hz = token.get("hz")
    if not isinstance(hz, str) or not hz:
        problems.append(Problem(where, "token is missing a non-empty 'hz'"))
        return
    if hz != hz.strip():
        problems.append(Problem(where, f"'hz' has surrounding whitespace: {hz!r}"))

    py = token.get("py")
    if py is None:
        # Punctuation / spacing token: no gloss, no hover.
        if CJK.search(hz):
            problems.append(
                Problem(where, f"'{hz}' has Chinese characters but no 'py' — add pinyin and a gloss")
            )
        return

    if not isinstance(py, str) or not py.strip():
        problems.append(Problem(where, f"'{hz}' has an empty 'py'"))
        return
    if not token.get("en"):
        problems.append(Problem(where, f"'{hz}' has pinyin but no English gloss 'en'"))

    if re.search(r"[0-9]", py):
        problems.append(
            Problem(where, f"'{hz}' pinyin {py!r} uses tone numbers — use tone marks (ā á ǎ à)")
        )
        return

    syls = syllables(py)
    for syl in syls:
        bare, _tone = strip_tones(syl)
        if not PINYIN_BODY.match(bare):
            problems.append(
                Problem(where, f"'{hz}' pinyin syllable {syl!r} has unexpected characters")
            )

    if token.get("nosplit"):
        return

    n_chars = len(CJK.findall(hz))
    if n_chars and len(syls) != n_chars:
        problems.append(
            Problem(
                where,
                f"'{hz}' has {n_chars} character(s) but {len(syls)} pinyin syllable(s) "
                f"({py!r}) — separate syllables with spaces, or set \"nosplit\": true "
                f"for erhua and other merged readings",
            )
        )


def check_deck(path, seen_passage_ids, problems):
    try:
        deck = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        problems.append(Problem(path.name, f"invalid JSON: {exc}"))
        return None

    for field in ("id", "title", "level"):
        if not deck.get(field):
            problems.append(Problem(path.name, f"deck is missing '{field}'"))
    if deck.get("id") and deck["id"] != path.stem:
        problems.append(
            Problem(path.name, f"deck id {deck['id']!r} should match the filename {path.stem!r}")
        )

    passages = deck.get("passages")
    if not isinstance(passages, list) or not passages:
        problems.append(Problem(path.name, "deck has no 'passages'"))
        return deck

    for p_i, passage in enumerate(passages):
        pid = passage.get("id") or f"#{p_i}"
        where = f"{path.name} → {pid}"
        if not passage.get("id"):
            problems.append(Problem(where, "passage is missing 'id'"))
        elif passage["id"] in seen_passage_ids:
            problems.append(
                Problem(where, f"duplicate passage id (also in {seen_passage_ids[passage['id']]})")
            )
        else:
            seen_passage_ids[passage["id"]] = path.name
        if not passage.get("title"):
            problems.append(Problem(where, "passage is missing 'title'"))

        sentences = passage.get("sentences")
        if not isinstance(sentences, list) or not sentences:
            problems.append(Problem(where, "passage has no 'sentences'"))
            continue

        for s_i, sentence in enumerate(sentences):
            s_where = f"{where} → sentence {s_i + 1}"
            if not sentence.get("en"):
                problems.append(Problem(s_where, "sentence is missing an English translation 'en'"))
            tokens = sentence.get("tokens")
            if not isinstance(tokens, list) or not tokens:
                problems.append(Problem(s_where, "sentence has no 'tokens'"))
                continue
            for t_i, token in enumerate(tokens):
                if not isinstance(token, dict):
                    problems.append(Problem(f"{s_where} → token {t_i + 1}", "token is not an object"))
                    continue
                check_token(token, f"{s_where} → token {t_i + 1}", problems)

    return deck


def deck_stats(deck):
    chars = 0
    vocab = Counter()
    for passage in deck.get("passages", []):
        for sentence in passage.get("sentences", []):
            for token in sentence.get("tokens", []):
                hz = token.get("hz", "")
                chars += len(CJK.findall(hz))
                if token.get("py"):
                    vocab[(hz, token["py"])] += 1
    return chars, vocab


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate without rewriting the manifest")
    parser.add_argument("--stats", action="store_true", help="print a vocabulary summary")
    args = parser.parse_args()

    deck_paths = sorted(p for p in DATA.glob("*.json") if p.name != "manifest.json")
    if not deck_paths:
        print(f"No deck files found in {DATA}", file=sys.stderr)
        return 1

    problems = []
    seen_passage_ids = {}
    entries = []
    all_vocab = Counter()
    total_chars = 0

    for path in deck_paths:
        deck = check_deck(path, seen_passage_ids, problems)
        if deck is None:
            continue
        chars, vocab = deck_stats(deck)
        total_chars += chars
        all_vocab.update(vocab)
        entries.append(
            {
                "id": deck.get("id", path.stem),
                "file": f"data/chinese/{path.name}",
                "title": deck.get("title", path.stem),
                "level": deck.get("level", ""),
                "description": deck.get("description", ""),
                "passages": [
                    {
                        "id": p.get("id", ""),
                        "title": p.get("title", ""),
                        "title_en": p.get("title_en", ""),
                        "tags": p.get("tags", []),
                    }
                    for p in deck.get("passages", [])
                ],
            }
        )

    errors = [p for p in problems if p.fatal]
    warnings = [p for p in problems if not p.fatal]
    for problem in problems:
        print(problem, file=sys.stderr)

    n_passages = sum(len(e["passages"]) for e in entries)
    print(
        f"{len(entries)} deck(s), {n_passages} passage(s), {total_chars} hanzi, "
        f"{len(all_vocab)} unique words, {len(errors)} error(s), {len(warnings)} warning(s)"
    )

    if args.stats:
        print("\nMost frequent words:")
        for (hz, py), count in all_vocab.most_common(25):
            print(f"  {count:4d}  {hz}  {py}")

    if errors:
        return 1

    if not args.check:
        manifest = {
            "generated_by": "tools/chinese/build.py",
            "decks": entries,
        }
        MANIFEST.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Wrote {MANIFEST.relative_to(REPO)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
