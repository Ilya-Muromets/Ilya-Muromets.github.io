"""Chinese: tone sandhi and pinyin checks."""

import re
import unicodedata

PUNCT = "，。！？；：、“”‘’（）《》…—"
NAME = "Chinese"

CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
TONE_MARKS = {"̄": 1, "́": 2, "̌": 3, "̀": 4}
PINYIN_BODY = re.compile(r"^[a-zü]+$")


def strip_tones(syllable):
    """Return (bare_syllable, tone_number). Tone 5 = neutral / unmarked."""
    tone = 5
    bare = []
    for ch in unicodedata.normalize("NFD", syllable):
        if ch in TONE_MARKS:
            tone = TONE_MARKS[ch]
        else:
            bare.append(ch)
    return unicodedata.normalize("NFC", "".join(bare)), tone


def tone_of(syllable):
    return strip_tones(syllable)[1]


def postprocess(tokens):
    """Fix the tone of 不 and 一 from whatever follows them.

    Both shift to a rising tone before a fourth tone; 一 is otherwise yì before
    tones 1-3. Deriving it here keeps every deck consistent — it is the single
    most common thing to get wrong by hand.
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


def check_token(token, where, problems, Problem):
    """Pinyin is space-separated per syllable, with tone marks, one per character."""
    py = token.get("py")
    if not py:
        return

    if re.search(r"[0-9]", py):
        problems.append(Problem(
            where, f"'{token['hz']}' pinyin {py!r} uses tone numbers — use marks (ā á ǎ à)"))
        return

    syllables = py.split()
    for syllable in syllables:
        bare, _ = strip_tones(syllable)
        if not PINYIN_BODY.match(bare):
            problems.append(Problem(
                where, f"'{token['hz']}' pinyin syllable {syllable!r} has unexpected characters"))

    if token.get("nosplit"):
        return
    n_chars = len(CJK.findall(token["hz"]))
    if n_chars and len(syllables) != n_chars:
        problems.append(Problem(
            where,
            f"'{token['hz']}' has {n_chars} character(s) but {len(syllables)} pinyin "
            f"syllable(s) ({py!r}) — separate syllables with spaces, or set "
            f'"nosplit": true for erhua and other merged readings'))
