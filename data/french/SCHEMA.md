# French reader data format

`french/index.html` fetches everything here at runtime. The deck JSON is
generated — edit the sources in `src/`, never the `*.json`.

```
data/french/
  src/<deck>.txt     passages: French line, English line, alternating, plus phrases
  src/lexicon.txt    every spelling used: gloss, dictionary form, gender, level
  <deck>.json        generated deck (do not edit)
  manifest.json      generated index the reader loads first
```

## Workflow

```
python3 tools/french/compile.py           # src/*.txt + lexicon -> deck JSON
python3 tools/french/compile.py --stats   # also list words above each deck's level
python3 tools/french/build.py             # validate + rebuild manifest.json
```

`compile.py` lists every word missing from the lexicon and writes nothing
until they are added.

## Passage source

```
# deck: id=b1-sightseeing | title=B1 · Museums & Sightseeing | level=B1 | kind=sightseeing
# desc: One line shown in the picker.

@ b1v-01 | Les dons | Donations | museum, money
— Bonjour, est-ce que le musée accepte les dons ?
— Hello, does the museum accept donations?
= Est-ce que le musée accepte les dons ? | Does the museum accept donations?
```

- `id` must match the filename; passage ids must be unique across all decks.
- `kind` is one of `conversation`, `sightseeing`, `dining`, `transport`,
  `shopping`, `problems` (the topic chips).
- Lines starting `=` are the passage's useful phrases (`French | English`),
  shown in a box under the text and searchable from the browse sheet.
- Write French spacing as usual (`Bonjour !`, `« livres »`); the reader sets
  the thin spaces itself.
- Elisions split automatically: `l'hôtel` is `l'` + `hôtel`, `jusqu'au` is
  `jusqu'` + `au`. `aujourd'hui`, `quelqu'un` and hyphenated words such as
  `est-ce` or `peut-être` stay whole.

Markup inside a French line:

| write | meaning |
|---|---|
| `s'il_vous_plaît` | underscores join a fixed phrase into one token (key `s'il vous plaît`) |
| `personne{personne:f}` | use a specific lexicon entry — a second reading of the same spelling |

Lookup tries the exact spelling, then lowercase, so capitalised sentence
starts need nothing.

## Lexicon

```
key | pos | gloss | dictionary form | level | note
musée | m | museum | le musée, les musées | A1
voudrais | v | would like | vouloir | A1 | je voudrais (conditional)
```

- `pos`: `m` / `f` for nouns (these drive the gender colours), otherwise
  `v adj adv prep pron art conj num part intj phr name`.
- The first `;`-separated sense of the gloss is shown under the word; the
  bubble shows all of it.
- `level` (`A1`–`C1`, or `-`) is a CEFR judgement, not a copy of an official
  list. Each deck reports what share of its words sit at or below its level.
- One entry per spelling, so `voudrais`, `voulez` and `veux` are separate
  keys pointing at `vouloir`.

Write original passages, and read new French by eye: the tools check
structure and level, never meaning.
