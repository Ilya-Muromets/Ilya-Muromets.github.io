# Chinese reader data format

`chinese.html` reads everything from this folder. There is no build step for the
site itself — the page fetches JSON at runtime — but the deck JSON is generated,
not written by hand.

```
data/chinese/
  src/*.txt          what you actually edit — stories as plain segmented text
  lexicon.json       hanzi -> pinyin + gloss, the single source for both
  wordlists/*.json   HSK vocabulary, for level checking
  hsk1-stories.json  generated deck (do not edit)
  manifest.json      generated index the reader loads first
```

## Adding stories

Edit or add a file in `src/`, then:

```
python3 tools/chinese/compile.py     # src/*.txt  -> deck JSON
python3 tools/chinese/build.py       # validate + rebuild manifest.json
```

`compile.py` reports any word missing from `lexicon.json` and writes nothing
until you add it, so a typo can't quietly become a new "word".

A source file looks like this:

```
# deck: id=hsk1-stories | title=HSK 1 · Stories | level=HSK 1 | vocab=hsk1 | vocab_min=0.85
# desc: Fifty short first-reader stories.
# extra: 说 天 们

@ hsk1s-01 | 我是猫 | I Am a Cat | animals
我 是 一 个 猫，我 没 有 名字。
I am a cat, and I don't have a name.
我 住 在 一 个 大 学校 里。
I live in a big school.
```

Chinese and English lines alternate. **Spaces mark word boundaries** — that is
the segmentation the reader uses for its hover glosses, and writing it by hand
beats guessing at it automatically. Punctuation can stay attached to the word
before it; the compiler splits it off.

Pinyin and glosses come from `lexicon.json`, so a word is glossed once and reads
the same everywhere. That also means **a gloss must state the word's primary
sense** — it will appear on every occurrence, in every deck. Where a word
genuinely splits between two senses, give both: `看` is "to look at; to read; to
watch".

Tone sandhi for 不 and 一 is applied automatically from the following syllable,
so write them plainly in the source and let the compiler set `bù`/`bú` and
`yì`/`yí`.

**The generated `*.json` decks are not edited directly.** Anything written there
is lost on the next compile.

## Deck file

The deck's `id` must equal its filename without `.json`.

```json
{
  "id": "hsk1-everyday",
  "title": "Everyday Basics",
  "level": "HSK 1",
  "description": "One line shown in the picker.",
  "passages": [ ... ]
}
```

## Passage

```json
{
  "id": "hsk1-intro",
  "title": "自我介绍",
  "title_en": "Introducing Myself",
  "tags": ["greetings", "self"],
  "sentences": [ ... ]
}
```

`id` must be unique across *all* decks — it is the URL fragment
(`chinese.html#hsk1-everyday/hsk1-intro`) and the key used to restore your place.

## Sentence

One sentence per entry, with its own English translation. The reader reveals
translations per sentence, so keep them aligned to the Chinese rather than
writing one blob for the paragraph.

```json
{
  "en": "Hello! My name is Martin.",
  "tokens": [ ... ]
}
```

## Token

A token is one **character cluster** — the unit that gets a pinyin line above it
and a gloss on hover. Segment the way a learner would want to look things up:
`中国` is one token, not two.

```json
{ "hz": "中国", "py": "zhōng guó", "en": "China" }
```

| field     | required | notes |
|-----------|----------|-------|
| `hz`      | yes      | Simplified characters. |
| `py`      | no       | Pinyin with **tone marks**, one space between syllables. Omit for punctuation. |
| `en`      | with `py`| Short gloss. Semicolons separate senses: `"to be called"`, `"I; me"`. |
| `nosplit` | no       | Set `true` when syllables can't be matched 1:1 to characters (erhua: `一会儿` / `yí huìr`). |

Rules the validator enforces:

- **Pinyin is space-separated per syllable** (`"zhōng guó"`, not `"zhōngguó"`).
  The reader joins them for display but needs the split to stack each syllable
  over its own character and to color it by tone. Syllable count must equal the
  character count unless `nosplit` is set.
- **Tone marks, not tone numbers.** `hǎo`, never `hao3`.
- **Punctuation is its own token with no `py`**: `{ "hz": "，" }`. Use full-width
  punctuation (`。，？！：“”`). These render inline and aren't hoverable.
- Every token with pinyin needs a gloss.

### Tone sandhi

Pinyin is written **as spoken**, since the point is reading aloud:

- `不` → `bú` before a fourth tone (`bú yòng`), `bù` otherwise (`bù néng`).
- `一` → `yì` before tones 1–3 (`yì bēi`), `yí` before a fourth tone (`yí gè`),
  `yī` when counting.
- Third-tone pairs are left in their written form (`nǐ hǎo`, not `ní hǎo`) —
  that one is predictable enough that learners are better off seeing the base.

## Aiming at a level

A deck aims at a level rather than being locked to it. Strict adherence makes
passages read like drills — some words above the level are what make them read
like language. So `build.py` measures **coverage** and only complains when a
deck has drifted far enough that its label stops being true.

In a source header:

```
# deck: ... | vocab=hsk1 | vocab_min=0.85
# extra: 说 天 们 马丁
```

`vocab` names a file in `wordlists/`; `vocab_min` is the floor (default 0.90).
`extra` lists words allowed above the level without counting against coverage —
names, and glue the level implies but doesn't list. Every deck reports its
coverage on each build:

```
hsk1-stories: 92% within hsk1 (60 distinct words outside)
```

Use `--stats` to see exactly which words fall outside, with counts. The
remaining 8–14% is deliberate: `也`, `新`, `时间`, `房间` and friends are simply
hard to avoid in natural sentences.

A word passes if it's in the list *or* if it splits cleanly into words that
are: `星期日` from `星期` + `日`, `一些` from `一` + `些`, `家里` from `家` +
`里`. That keeps ordinary compounds out of the warning list without having to
enumerate them.

`wordlists/hsk1.json` holds the official 150-word HSK 1 vocabulary. It is
validation data only — the reader never fetches it, so it costs nothing at
page load. To check against a level you don't have yet, drop a
`wordlists/<name>.json` alongside it with the same shape:
`{"id": ..., "title": ..., "words": ["爱", "八", ...]}`.

## Generating more passages

The source format is small enough to generate directly — no pinyin, no glosses,
just segmented Chinese and its English. A prompt that works:

> Write passages for a Mandarin graded reader in exactly this format:
>
> ```
> @ <id> | <中文标题> | <English Title> | <tag, tag>
> <Chinese sentence, words separated by spaces>
> <English translation>
> ```
>
> Chinese and English lines alternate; a blank line separates passages.
>
> Constraints:
> - Simplified characters only.
> - Put a space between words as a learner would look them up: `中国 很 大`,
>   not `中 国 很 大` and not `中国很大`. Punctuation stays attached.
> - Write 不 and 一 plainly — tone sandhi is applied by the compiler.
> - 4–6 short sentences per passage; one idea per passage.
>
> Topic: <ordering coffee / renting a flat / a childhood memory>.
> Level: <HSK 2>, keeping most words at or below it.

Write original passages rather than copying from a published graded reader —
those are copyrighted. Constraining your own story to a level's word list gets
you the same result legitimately, and the coverage check keeps it honest.

Then run `compile.py`, add whatever words it reports to `lexicon.json`, and run
it again. Generated segmentation and translations are worth reading by eye —
the tools check structure and level, never meaning.
