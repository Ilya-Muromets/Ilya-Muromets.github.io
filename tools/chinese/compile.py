#!/usr/bin/env python3
"""Expand story sources in data/chinese/src/ into reader deck JSON.

    python3 tools/chinese/compile.py            # compile every source file
    python3 tools/chinese/compile.py hsk1-stories

Writing decks by hand means writing pinyin and a gloss for every word, which
does not scale past a few dozen passages. Instead a source file carries just
the Chinese (segmented with spaces) and its English, and every word's pinyin
and gloss comes from data/chinese/lexicon.json — so a word is glossed once and
stays consistent everywhere it appears.

Source format:

    # deck: id=hsk1-stories | title=HSK 1 · Stories | level=HSK 1 | vocab=hsk1
    # desc: Short narrative stories built around HSK 1 vocabulary.

    @ hsk1s-cat | 我的猫 | My Cat | animals, home
    我 很 喜欢 猫，我 家 里 有 猫。
    I like cats a lot, and there's a cat at my house.
    她 的 名字 叫 米饭。
    Her name is Rice.

Chinese and English lines alternate. Punctuation is split off automatically,
so it can be left attached to the word before it. Any word missing from the
lexicon is reported and nothing is written.
"""

import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data" / "chinese"
SRC = DATA / "src"

PUNCT = "，。！？；：、“”‘’（）《》…—"
TONE_MARKS = {"̄": 1, "́": 2, "̌": 3, "̀": 4}


def tone_of(syllable):
    for ch in unicodedata.normalize("NFD", syllable):
        if ch in TONE_MARKS:
            return TONE_MARKS[ch]
    return 5


def split_punct(chunk):
    """Split a whitespace-delimited chunk into words and punctuation marks."""
    parts, buf = [], ""
    for ch in chunk:
        if ch in PUNCT:
            if buf:
                parts.append(buf)
                buf = ""
            parts.append(ch)
        else:
            buf += ch
    if buf:
        parts.append(buf)
    return parts


def apply_sandhi(tokens):
    """Fix the tone of 不 and 一 from whatever follows them.

    Both shift to a rising tone before a fourth tone; 一 is otherwise yì
    before tones 1-3. Doing it here keeps every deck consistent — it is the
    single most common thing to get wrong by hand.
    """
    for i, token in enumerate(tokens):
        if token["hz"] not in ("不", "一"):
            continue
        following = next((t for t in tokens[i + 1:] if t.get("py")), None)
        if not following:
            continue
        nxt = tone_of(following["py"].split()[0])
        if token["hz"] == "不":
            token["py"] = "bú" if nxt == 4 else "bù"
        else:
            token["py"] = "yí" if nxt == 4 else "yì"
    return tokens


def parse_source(path):
    deck = {"passages": []}
    passage = None
    pending_cn = None
    problems = []

    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line:
            continue

        if line.startswith("# deck:"):
            for field in line[len("# deck:"):].split("|"):
                if "=" in field:
                    key, value = field.split("=", 1)
                    key, value = key.strip(), value.strip()
                    deck[key] = float(value) if key == "vocab_min" else value
            continue
        if line.startswith("# desc:"):
            deck["description"] = line[len("# desc:"):].strip()
            continue
        if line.startswith("# extra:"):
            # Words allowed above the deck's level without counting against it.
            # Accumulates, so extras can be listed in groups with a note each.
            deck.setdefault("vocab_extra", []).extend(line[len("# extra:"):].split())
            continue
        if line.startswith("#"):
            continue

        if line.startswith("@"):
            if pending_cn:
                problems.append(f"{path.name}:{lineno}: Chinese line with no translation")
                pending_cn = None
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

        if pending_cn is None:
            pending_cn = (line, lineno)
        else:
            passage["sentences"].append({"cn": pending_cn[0], "en": line, "line": pending_cn[1]})
            pending_cn = None

    if pending_cn:
        problems.append(f"{path.name}:{pending_cn[1]}: Chinese line with no translation")
    return deck, problems


def build_tokens(cn_line, lexicon, where, problems):
    tokens = []
    for chunk in cn_line.split():
        for part in split_punct(chunk):
            if part in PUNCT:
                tokens.append({"hz": part})
                continue
            entry = lexicon.get(part)
            if entry is None:
                problems.append(f"{where}: '{part}' is not in lexicon.json")
                continue
            token = {"hz": part, "py": entry["py"], "en": entry["en"]}
            if entry.get("nosplit"):
                token["nosplit"] = True
            tokens.append(token)
    return apply_sandhi(tokens)


def compile_source(path, lexicon):
    deck, problems = parse_source(path)
    for key in ("id", "title", "level"):
        if not deck.get(key):
            problems.append(f"{path.name}: deck header is missing {key}")

    for passage in deck["passages"]:
        sentences = []
        for sentence in passage["sentences"]:
            where = f"{path.name}:{sentence['line']} ({passage['id']})"
            tokens = build_tokens(sentence["cn"], lexicon, where, problems)
            sentences.append({"en": sentence["en"], "tokens": tokens})
        passage["sentences"] = sentences

    return deck, problems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("names", nargs="*", help="source files to compile (default: all)")
    args = parser.parse_args()

    lexicon = json.loads((DATA / "lexicon.json").read_text(encoding="utf-8"))["words"]
    paths = sorted(SRC.glob("*.txt"))
    if args.names:
        wanted = {n.replace(".txt", "") for n in args.names}
        paths = [p for p in paths if p.stem in wanted]
    if not paths:
        print(f"No sources found in {SRC}", file=sys.stderr)
        return 1

    all_problems, written = [], 0
    for path in paths:
        deck, problems = compile_source(path, lexicon)
        all_problems.extend(problems)
        if problems:
            continue
        order = ["id", "title", "level", "description",
                 "vocab", "vocab_min", "vocab_extra", "passages"]
        out = {k: deck[k] for k in order if k in deck}
        target = DATA / (deck["id"] + ".json")
        target.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        written += 1
        n_sent = sum(len(p["sentences"]) for p in deck["passages"])
        print(f"{target.name}: {len(deck['passages'])} passages, {n_sent} sentences")

    if all_problems:
        missing = sorted({re.search(r"'(.+?)'", p).group(1)
                          for p in all_problems if "not in lexicon" in p})
        for problem in all_problems[:40]:
            print("  " + problem, file=sys.stderr)
        if len(all_problems) > 40:
            print(f"  ... and {len(all_problems) - 40} more", file=sys.stderr)
        if missing:
            print("\nWords to add to lexicon.json:\n  " + " ".join(missing), file=sys.stderr)
        return 1

    print(f"Compiled {written} deck(s). Now run tools/chinese/build.py.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
