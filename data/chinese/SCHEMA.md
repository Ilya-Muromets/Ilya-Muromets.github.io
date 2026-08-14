# Chinese reader data format

`chinese.html` reads everything from this folder. There is no build step for the
site itself — the page fetches JSON at runtime — but `tools/chinese/build.py`
validates the decks and regenerates `manifest.json`.

```
data/chinese/
  manifest.json      generated — the index the reader loads first
  hsk1-everyday.json a deck (one file = one topic/level bundle of passages)
  hsk2-city.json
  hsk3-stories.json
```

**Run `python3 tools/chinese/build.py` after adding or editing any deck.**
It rewrites `manifest.json` and fails loudly on malformed pinyin, missing
glosses, or duplicate ids.

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

## Generating more passages

The format is deliberately verbose so an LLM can fill it in directly. A prompt
that works:

> Write a JSON deck for a Mandarin guided reader, following this schema exactly:
> a deck object with `id`, `title`, `level`, `description`, and `passages`; each
> passage has `id`, `title`, `title_en`, `tags`, and `sentences`; each sentence
> has `en` and `tokens`; each token has `hz`, `py` (tone marks, one space between
> syllables), and `en`, except punctuation tokens which have only `hz`.
>
> Constraints:
> - Simplified characters only.
> - Segment tokens as a learner would look them up — `中国` is one token.
> - Pinyin syllable count must equal the character count in `hz`, or set
>   `"nosplit": true`.
> - Apply tone sandhi for 不 and 一, and write pinyin with marks, not numbers.
> - Glosses are short — a few words, senses separated by semicolons.
>
> Topic: <ordering coffee / renting an apartment / a childhood memory>.
> Level: <HSK 3>. 5 passages, 4–6 sentences each, vocabulary at or below that level.

Then drop the file in `data/chinese/`, run `python3 tools/chinese/build.py`, and
fix whatever it complains about. Machine-generated glosses and segmentation are
worth skimming by eye — the validator checks structure, not meaning.
