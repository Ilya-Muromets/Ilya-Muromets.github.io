"""Per-language hooks for the shared reader tools.

Everything about a deck that is not language specific — the source format, the
lexicon lookup, level coverage, the manifest — lives in the shared tools. A
module here supplies only the parts that genuinely differ:

    PUNCT                              characters that render inline, unhoverable
    postprocess(tokens) -> tokens      derive readings the source doesn't carry
    check_token(token, where, problems, Problem)   language specific validation

Adding a language means adding a module here and an entry in
reader/languages.json — no changes to the tools or the reader itself.
"""

import importlib
import sys


def load(lang_id):
    try:
        return importlib.import_module(f"langs.{lang_id}")
    except ModuleNotFoundError:
        sys.exit(f"No language module for {lang_id!r} (expected tools/reader/langs/{lang_id}.py)")
