# Reader data format

One engine serves every language reader on the site. `/chinese/` and `/japanese/`
load the same `reader/reader.css` and `reader/reader.js`, are generated from the
same page template, and are driven by the same three tools. They differ only in
their data and a short config block.

```
reader/
  reader.css           shared styles
  reader.js            shared engine — all reader behaviour lives here
  page.template.html   the page every language is generated from
  languages.json       per-language config (title, script, reading name, font)

data/<lang>/
  src/*.txt            what you actually edit — passages as plain segmented text
  lexicon.json         surface -> reading + gloss, the single source for both
  wordlists/*.json     vocabulary lists, for level checking
  <deck>.json          generated deck (do not edit)
  manifest.json        generated index the reader loads first

tools/reader/
  compile.py           src/*.txt -> deck JSON
  build.py             validate decks, measure level coverage, write manifest
  pages.py             languages.json + template -> <lang>/index.html
  preview.py           bundle one language into a single self-contained file
  langs/<lang>.py      the only language-specific code
```

## Adding passages

```
python3 tools/reader/compile.py japanese     # src/*.txt -> deck JSON
python3 tools/reader/build.py japanese       # validate + rebuild manifest.json
```

`compile.py` reports any word missing from `lexicon.json` and writes nothing
until you add it, so a typo can't quietly become a new "word".

A source file looks like this:

```
# deck: id=n5-stories | title=JLPT N5 · Stories | level=JLPT N5 | vocab=n5 | vocab_min=0.85 | kind=stories
# desc: Short first-reader stories.
# extra: は が を です

@ n5s-01 | わたしのねこ | My Cat | animals
わたし は ねこ が 好き です。
I like cats.
うち に ねこ が 一匹 います。
There is one cat at my house.
```

Target text and English alternate. **Spaces mark word boundaries** — that is the
segmentation the reader uses for its hover glosses, and writing it by hand beats
guessing at it. Punctuation can stay attached; the compiler splits it off.

`kind` is `stories` or `everyday`, and drives the browse filter.

## The lexicon

Readings and glosses come from `lexicon.json`, so a word is glossed once and
reads the same everywhere. That also means **a gloss must state the word's
primary sense** — it appears on every occurrence, in every deck. Where a word
genuinely splits between senses, give both: `看` is "to look at; to read; to
watch".

```json
"食べます": { "py": "たべます", "en": "to eat", "base": "食べる" }
```

| field  | meaning |
|--------|---------|
| `py`   | the reading shown above the word (pinyin, or kana) |
| `en`   | short gloss |
| `base` | dictionary form, used *only* for level checking (see below) |
| `nosplit` | reading can't be matched syllable-to-character (erhua: `一会儿`) |

## What each language derives

Anything that can be computed is, so it cannot drift out of step with the text.
This lives in `tools/reader/langs/<lang>.py` and nowhere else.

**Chinese** applies tone sandhi: write `不` and `一` plainly in the source and
the compiler sets `bù`/`bú` and `yì`/`yí` from the following syllable.

**Japanese** derives both the furigana placement and the romaji:

- Ruby sits over only the part of the word the reading spells. 食べます /
  たべます becomes `[["食","た"],["べます",""]]`, so the kana lands on the kanji
  and the okurigana is left bare.
- Romaji is Hepburn, computed from the kana — never typed. Long vowels are
  merged only inside a kanji's reading, which is what separates 東京 (tōkyō)
  from 思う (omou), where the う is okurigana rather than a long vowel.

## Aiming at a level

A deck aims at a level rather than being locked to it. Strict adherence makes
passages read like drills — some words above the level are what make them read
like language. `build.py` measures **coverage** and complains only when a deck
has drifted far enough that its label stops being true.

```
# deck: ... | vocab=n5 | vocab_min=0.85
# extra: は が を です
```

`vocab` names a file in `wordlists/`; `vocab_min` is the floor (default 0.90).
`extra` lists words allowed above the level without counting against coverage.
A word also passes if it splits cleanly into listed words (`星期日` from `星期`
+ `日`), or if its `base` is listed — sources use the form a reader meets
(食べます) while word lists carry the dictionary form (食べる).

Every deck reports on each build:

```
n5-stories: 94% within n5 (10 distinct words outside)
```

`--stats` lists exactly which words fall outside, with counts.

**The lists differ in what they cover.** HSK lists include particles (的, 了,
吗); JLPT vocabulary lists deliberately don't, because particles and the copula
are grammar rather than vocabulary. The Japanese decks therefore declare that
grammar set in `extra` — without it they measure ~50%, which says nothing about
the level and everything about the list.

## Adding a language

1. `tools/reader/langs/<lang>.py` — `PUNCT`, `postprocess(tokens)`,
   `check_token(...)`. Both existing modules are short; copy the closer one.
2. An entry in `reader/languages.json` — title, script shown in the heading,
   what the reading is called, the CJK font stack, whether it has tones.
3. `data/<lang>/lexicon.json`, `wordlists/`, and `src/*.txt`.
4. `python3 tools/reader/pages.py` writes `<lang>/index.html`.

No changes to the engine, the styles, or the tools.

## Generating passages

The source format is small enough to generate directly — no readings, no
glosses, just segmented text and its English:

> Write passages for a graded reader in exactly this format:
>
> ```
> @ <id> | <title in the target language> | <English Title> | <tag, tag>
> <sentence, words separated by spaces>
> <English translation>
> ```
>
> Target text and English alternate; a blank line separates passages.
>
> Constraints:
> - Put a space between words as a learner would look them up. Punctuation
>   stays attached.
> - Write the plain form of anything the compiler derives (tone sandhi,
>   furigana, romaji) — don't pre-apply it.
> - 4–6 short sentences per passage; one idea per passage.
>
> Topic: <ordering coffee / renting a flat / a childhood memory>.
> Level: <JLPT N5>, keeping most words at or below it.

Write original passages rather than copying from a published graded reader —
those are copyrighted. Constraining your own story to a level's word list gets
the same result legitimately, and the coverage check keeps it honest.

Then run `compile.py`, add whatever words it reports to `lexicon.json`, and run
it again. Generated segmentation and translations are worth reading by eye — the
tools check structure and level, never meaning.
