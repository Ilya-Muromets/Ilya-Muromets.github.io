"""Japanese: furigana placement and romaji, both derived rather than typed.

A source file gives only the surface (kanji + kana) and the lexicon gives its
kana reading. Everything the reader shows on top of that is computed here, so
it cannot drift out of step with the text the way hand-typed readings do.
"""

import re

# ー is a long-vowel mark inside katakana words (コーヒー, メニュー) — never punctuation.
PUNCT = "、。！？「」『』・…～（）：；"
NAME = "Japanese"

KANA = re.compile(r"[぀-ゟ゠-ヿ]")
KANJI = re.compile(r"[一-鿿々]")

# Hepburn, longest key first so digraphs win over their first character.
ROMAJI = {
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo", "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho", "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo", "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo", "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo", "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "o", "ん": "n",
    "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
}

MACRON = {"a": "ā", "i": "ī", "u": "ū", "e": "ē", "o": "ō"}
VOWELS = "aiueo"


def to_hiragana(text):
    """Katakana to hiragana, so one table serves both scripts."""
    out = []
    for ch in text:
        code = ord(ch)
        out.append(chr(code - 0x60) if 0x30A1 <= code <= 0x30F6 else ch)
    return "".join(out)


def moras(kana):
    """Split kana into romaji pieces, one per mora."""
    text = to_hiragana(kana)
    out, i = [], 0
    while i < len(text):
        two = text[i:i + 2]
        if two in ROMAJI:
            out.append(ROMAJI[two])
            i += 2
            continue
        ch = text[i]
        if ch == "っ":
            out.append("*")          # gemination, resolved once the next mora is known
            i += 1
            continue
        if ch == "ー":
            out.append("-")          # long mark, resolved against the previous vowel
            i += 1
            continue
        out.append(ROMAJI.get(ch, ch))
        i += 1
    return out


def join_moras(pieces, long_vowels):
    """Assemble mora romaji into a word.

    `long_vowels` merges a vowel following the same vowel into a macron. That is
    only correct inside a kanji's reading (東京 -> Tōkyō); a trailing う that is
    okurigana is part of the verb (思う -> omou), so the caller turns it off
    for the bare-kana segments.
    """
    out = ""
    pending_geminate = False
    for piece in pieces:
        if piece == "*":
            pending_geminate = True
            continue
        if piece == "-":
            if out and out[-1] in VOWELS:
                out = out[:-1] + MACRON[out[-1]]
            continue
        if pending_geminate:
            # Hepburn doubles the consonant, but っち becomes "tch".
            piece = ("t" + piece) if piece.startswith("ch") else (piece[0] + piece)
            pending_geminate = False
        if out.endswith("n") and piece[0] in VOWELS + "y":
            out += "'"               # ん before a vowel needs separating: kin'youbi
        if long_vowels and out and piece in ("u", "o", "a") and out[-1] in VOWELS:
            last = out[-1]
            if (piece == "u" and last in "ou") or (piece == "o" and last == "o") \
               or (piece == "a" and last == "a"):
                out = out[:-1] + MACRON["o" if last == "o" else last]
                continue
        out += piece
    return out


def romaji(kana, long_vowels=True):
    return join_moras(moras(kana), long_vowels)


def furigana(surface, reading):
    """Place the reading over only the part of the surface it spells.

    食べます / たべます -> [["食", "た"], ["べます", ""]], so the kana line sits
    over the kanji and the okurigana is left bare. Returns None when the word is
    all kana and needs no reading at all.
    """
    if not KANJI.search(surface):
        return [[surface, ""]]

    # Trailing kana shared by both is okurigana, not part of the reading.
    tail = 0
    while (tail < len(surface) and tail < len(reading)
           and surface[-1 - tail] == reading[-1 - tail]
           and KANA.match(surface[-1 - tail])):
        tail += 1
    s_core = surface[:len(surface) - tail] if tail else surface
    r_core = reading[:len(reading) - tail] if tail else reading
    suffix = surface[len(surface) - tail:] if tail else ""

    # Same at the front, for prefixes like the お in お茶.
    head = 0
    while (head < len(s_core) and head < len(r_core)
           and s_core[head] == r_core[head] and KANA.match(s_core[head])):
        head += 1
    prefix = s_core[:head]
    s_core, r_core = s_core[head:], r_core[head:]

    segments = []
    if prefix:
        segments.append([prefix, ""])
    if s_core:
        segments.append([s_core, r_core if KANJI.search(s_core) else ""])
    if suffix:
        segments.append([suffix, ""])
    return segments


def postprocess(tokens):
    """Attach ruby segments and romaji to every word in a sentence."""
    for token in tokens:
        reading = token.get("py")
        if not reading:
            continue
        segments = furigana(token["hz"], reading)
        token["rb"] = segments
        # Long vowels are merged only inside a kanji's reading; see join_moras.
        parts = []
        for text, ruby in segments:
            if ruby:
                parts.append(romaji(ruby, long_vowels=True))
            else:
                parts.append(romaji(text, long_vowels=False))
        token["ro"] = "".join(parts)
    return tokens


def check_token(token, where, problems, Problem):
    """Readings must be kana only — a kanji here means a missing lexicon entry."""
    reading = token.get("py")
    if not reading:
        return
    stray = [c for c in reading if not KANA.match(c) and c not in "ー"]
    if stray:
        problems.append(Problem(
            where, f"'{token['hz']}' reading {reading!r} is not all kana ({''.join(stray)})"))
