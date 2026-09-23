#!/usr/bin/env python3
"""Validate a language's reader decks and (re)build its manifest.json.

Usage:
    python3 tools/reader/build.py japanese          # validate + rewrite manifest
    python3 tools/reader/build.py chinese --check   # validate only (CI-friendly)
    python3 tools/reader/build.py all --stats       # every language, with a summary

The reader loads manifest.json first, then fetches one deck file at a time, so
the manifest must stay in sync with whatever deck files are on disk. Run this
after adding or editing a deck.

Schema is documented in data/SCHEMA.md.
"""

import argparse
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from langs import load as load_lang            # noqa: E402

CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿぀-ゟ゠-ヿ]")


class Problem:
    def __init__(self, where, message, fatal=True):
        self.where = where
        self.message = message
        self.fatal = fatal

    def __str__(self):
        kind = "error" if self.fatal else "warn "
        return f"  {kind}  {self.where}: {self.message}"



def check_token(token, where, problems, lang):
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
        problems.append(Problem(where, f"'{hz}' has a reading but no English gloss 'en'"))

    lang.check_token(token, where, problems, Problem)


def check_deck(path, seen_passage_ids, problems, lang):
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
                check_token(token, f"{s_where} → token {t_i + 1}", problems, lang)

    return deck


def load_wordlist(data, name):
    path = data / "wordlists" / (name + ".json")
    if not path.exists():
        return None
    return set(json.loads(path.read_text(encoding="utf-8"))["words"])


def segments_into(word, vocab):
    """True if `word` can be split entirely into words from `vocab`.

    Lets compounds built from in-level pieces pass — 星期日 from 星期 + 日,
    一些 from 一 + 些 — without listing every combination.
    """
    n = len(word)
    reachable = [False] * (n + 1)
    reachable[0] = True
    for end in range(1, n + 1):
        for start in range(end):
            if reachable[start] and word[start:end] in vocab:
                reachable[end] = True
                break
    return reachable[n]


def check_vocab(deck, path, problems, data):
    """Measure how close a deck sits to the level it aims at.

    A deck aims at a level rather than being locked to it: some words outside
    the list are what make a passage read like language instead of a drill.
    So this reports coverage, and only complains when a deck has drifted far
    enough that its level label stops being true ('vocab_min', default 90%).
    """
    name = deck.get("vocab")
    if not name:
        return None
    vocab = load_wordlist(data, name)
    if vocab is None:
        problems.append(Problem(path.name, f"unknown word list {name!r} in 'vocab'"))
        return None
    allowed = vocab | set(deck.get("vocab_extra", []))

    # Sources use the form a reader meets (食べます); word lists carry the
    # dictionary form (食べる). The lexicon maps between them.
    lexicon_path = data / "lexicon.json"
    bases = {}
    if lexicon_path.exists():
        for surface, entry in json.loads(
                lexicon_path.read_text(encoding="utf-8"))["words"].items():
            if entry.get("base"):
                bases[surface] = entry["base"]

    total = 0
    outside = Counter()
    for passage in deck.get("passages", []):
        for sentence in passage.get("sentences", []):
            for token in sentence.get("tokens", []):
                hz = token.get("hz", "")
                if not token.get("py"):
                    continue
                total += 1
                forms = {hz, bases.get(hz, hz)}
                if not any(f in allowed or segments_into(f, allowed) for f in forms):
                    outside[hz] += 1

    if not total:
        return None
    coverage = 1 - sum(outside.values()) / total
    floor = deck.get("vocab_min", 0.90)
    if coverage < floor:
        problems.append(Problem(
            path.name,
            f"only {coverage:.0%} of words are within {name} (aiming for {floor:.0%}) — "
            f"most common strays: " + ", ".join(hz for hz, _ in outside.most_common(8)),
            fatal=False,
        ))
    return {"list": name, "coverage": coverage, "total": total, "outside": outside}


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
    parser.add_argument("lang", help="language id, or 'all'")
    parser.add_argument("--check", action="store_true", help="validate without rewriting the manifest")
    parser.add_argument("--stats", action="store_true", help="print a vocabulary summary")
    args = parser.parse_args()

    languages = json.loads((REPO / "reader" / "languages.json").read_text(encoding="utf-8"))
    ids = list(languages) if args.lang == "all" else [args.lang]
    return max(run(lang_id, args) for lang_id in ids)


def run(lang_id, args):
    lang = load_lang(lang_id)
    data = REPO / "data" / lang_id
    # manifest.json is generated here; lexicon.json feeds compile.py. Neither is a deck.
    not_decks = {"manifest.json", "lexicon.json"}
    deck_paths = sorted(p for p in data.glob("*.json") if p.name not in not_decks)
    if not deck_paths:
        print(f"No deck files found in {data}", file=sys.stderr)
        return 1

    problems = []
    seen_passage_ids = {}
    entries = []
    coverages = []
    all_vocab = Counter()
    total_chars = 0

    for path in deck_paths:
        deck = check_deck(path, seen_passage_ids, problems, lang)
        if deck is None:
            continue
        coverage = check_vocab(deck, path, problems, data)
        if coverage:
            coverages.append((path.stem, coverage))
        chars, vocab = deck_stats(deck)
        total_chars += chars
        all_vocab.update(vocab)
        entries.append(
            {
                "id": deck.get("id", path.stem),
                "file": f"data/{lang_id}/{path.name}",
                "title": deck.get("title", path.stem),
                "level": deck.get("level", ""),
                "kind": deck.get("kind", ""),
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
        f"{lang_id}: {len(entries)} deck(s), {n_passages} passage(s), {total_chars} characters, "
        f"{len(all_vocab)} unique words, {len(errors)} error(s), {len(warnings)} warning(s)"
    )

    for stem, cov in coverages:
        print(f"  {stem}: {cov['coverage']:.0%} within {cov['list']}"
              f" ({len(cov['outside'])} distinct words outside)")

    if args.stats:
        for stem, cov in coverages:
            if cov["outside"]:
                print(f"\nOutside {cov['list']} in {stem}:")
                print("  " + "  ".join(
                    f"{hz}×{n}" for hz, n in cov["outside"].most_common(30)))
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
        target = data / "manifest.json"
        target.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Wrote {target.relative_to(REPO)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
