# German reader data format

`german/index.html` fetches everything here at runtime. The deck JSON is
generated — edit the sources in `src/`, never the `*.json`.

```
data/german/
  src/<deck>.txt     passages: German line, English line, alternating
  src/lexicon.txt    every spelling used: gloss, dictionary form, gender, level
  <deck>.json        generated deck (do not edit)
  manifest.json      generated index the reader loads first
```

## Workflow

```
python3 tools/german/compile.py           # src/*.txt + lexicon -> deck JSON
python3 tools/german/compile.py --stats   # also list words above each deck's level
python3 tools/german/build.py             # validate + rebuild manifest.json
```

`compile.py` lists every word missing from the lexicon and writes nothing
until they are added.

## Passage source

```
# deck: id=a1-travel | title=A1 · Travel | level=A1 | kind=travel | vocab_min=0.85
# desc: One line shown in the picker.

@ a1t-02 | Welches Gleis? | Which Platform? | train
Wann fährt{fährt~ab} der Zug ab{ab~}?
When does the train leave?
```

- `id` must match the filename; passage ids must be unique across all decks
  (they are the URL fragment, `/german/#a1-travel/a1t-02`).
- `kind` is one of `basics`, `travel`, `shopping`, `business` (the topic chips).
- Punctuation can stay attached; numbers in digits (`12,50`, `8:30`) pass
  through unglossed.

Markup inside a German line:

| write            | meaning |
|------------------|---------|
| `Hin_und_zurück` | underscores join a fixed phrase into one token (lexicon key `Hin und zurück`) |
| `die{die:pron}`  | use a specific lexicon entry — for a second reading of the same spelling |
| `Sie{sie}`       | sentence-initial *Sie* meaning "she/they" rather than formal "you" |
| `steige{steige~um} … um{um~}` | separable verb: the stem carries the meaning, the prefix points back to it |

A capitalised first word falls back to its lowercase entry automatically, so
*Heute* needs only `heute`. Words whose capital is meaningful (`Morgen`
"morning" vs `morgen` "tomorrow", `Essen` vs `essen`) need `{…}` when the
lowercase reading starts a sentence.

## Lexicon

```
key | pos | gloss | dictionary form | level | note
Bahnhof | m | train station | der Bahnhof, die Bahnhöfe | A1
möchte | v | would like | möchten (mögen) | A1 | ich/er möchte
```

- `pos`: `m f n pl` for nouns (these drive the gender colours), otherwise
  `v adj adv prep pron art conj num part intj phr name`.
- The first `;`-separated sense of the gloss is shown under the word; the
  bubble shows all of it. Keep that first sense short.
- `level` (`A1`–`C1`, or `-`) is a judgement modelled on the Goethe-Institut
  word lists, not a copy of them. Each deck reports what share of its words
  sit at or below its level, and warns under `vocab_min` (default 90%).
- One entry per spelling: German inflects, so `fahre`, `fährt` and `fahren`
  are separate keys pointing at the same dictionary form.

Write original passages; the tools check structure and level, never meaning,
so read generated German by eye before committing it.
