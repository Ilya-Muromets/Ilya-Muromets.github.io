/* Shared guided-reader engine.
 *
 * One implementation behind every language reader on the site: /chinese/ and
 * /japanese/ load this same file and differ only in the config they pass to
 * Reader.init and the data they point it at. A fix here reaches all of them.
 *
 * The page supplies the markup (see either index.html); this attaches to it by
 * id, so the script tag belongs at the end of <body>.
 *
 * Token shape, as produced by tools/reader/compile.py:
 *   hz   surface text (hanzi, or kanji+kana)
 *   py   reading shown above the surface (pinyin, or kana) — absent = punctuation
 *   ro   optional separate reading for the tooltip (romaji); falls back to py
 *   rb   optional [[text, ruby], ...] segments, for ruby over part of a word
 *   nosplit  reading can't be matched syllable-to-character
 */
window.Reader = (function () {
  "use strict";

  var cfg = {
    dataRoot: "/data/chinese/",   // where manifest.json and the decks live
    storeKey: "reader-v1",        // localStorage key; per language, so progress never collides
    tones: false,                 // colour the text by tone (pinyin only)
    path: "/"                     // used only in the "serve this folder" error
  };

  var SIZE_MIN = 20, SIZE_MAX = 64;

  var state = {
    pinyin: "on",      // on | hover | off
    english: "tap",    // on | hover | tap | off
    tones: "on",       // on | off
    size: 34,          // hanzi font size in px
    last: null,        // "deckId/passageId"
    read: {},          // "deckId/passageId" -> true, for passages marked read
    filters: { level: "", kind: "", status: "" }   // scopes browsing and Random
  };

  var manifest = null;
  var deckCache = {};   // deckId -> deck JSON
  var flat = [];        // [{deckId, passageId, label}] in reading order
  var current = null;   // {deck, passage, key}
  var pinned = null;    // token element with a pinned tooltip

  var reader = document.getElementById("reader");
  var browse = document.getElementById("browse");
  var browseList = document.getElementById("browse-list");
  var browseSearch = document.getElementById("browse-search");
  var browseCount = document.getElementById("browse-count");
  var pickerLabel = document.getElementById("picker-label");
  var scopePill = document.getElementById("scope");
  var visible = [];     // entries currently listed in the sheet
  var cursor = -1;      // keyboard-highlighted row
  var statusEl = document.getElementById("status");
  var tip = document.getElementById("tip");

  /* ---------- persistence ---------- */

  function loadState() {
    try {
      var saved = JSON.parse(localStorage.getItem(cfg.storeKey) || "{}");
      Object.keys(state).forEach(function (k) {
        if (saved[k] !== undefined && saved[k] !== null) state[k] = saved[k];
      });
    } catch (e) { /* first visit, or storage disabled */ }
  }

  function saveState() {
    try {
      localStorage.setItem(cfg.storeKey, JSON.stringify(state));
    } catch (e) { /* private mode; settings just won't persist */ }
  }

  /* ---------- pinyin helpers ---------- */

  var TONE_MARKS = { "̄": 1, "́": 2, "̌": 3, "̀": 4 };

  // Tone number for one pinyin syllable; 5 = neutral.
  function toneOf(syllable) {
    var d = syllable.normalize("NFD");
    for (var i = 0; i < d.length; i++) {
      if (TONE_MARKS[d[i]]) return TONE_MARKS[d[i]];
    }
    return 5;
  }

  function syllables(py) {
    return py.trim().split(/\s+/).filter(Boolean);
  }

  function canHover() {
    return !window.matchMedia || window.matchMedia("(hover: hover)").matches;
  }

  /* ---------- rendering ---------- */

  function renderToken(token) {
    // No pinyin means punctuation or spacing: rendered flat, not hoverable.
    if (!token.py) {
      var punct = document.createElement("span");
      punct.className = "punct";
      punct.textContent = token.hz;
      return punct;
    }

    var syls = syllables(token.py);
    var chars = Array.from(token.hz);
    // Align pinyin syllable-to-character when the counts match; erhua and
    // other merged readings set "nosplit" and are colored as a unit.
    var aligned = !token.nosplit && syls.length === chars.length;

    var el = document.createElement("span");
    el.className = "tok";
    el.tabIndex = 0;
    el.dataset.hz = token.hz;
    el.dataset.py = token.py;
    el.dataset.en = token.en || "";
    if (token.ro) el.dataset.tip = token.ro;

    // Ruby segments: the reading sits over only the part of the word it spells,
    // so furigana lands on the kanji and leaves the okurigana bare.
    if (token.rb) {
      el.classList.add("segmented");
      token.rb.forEach(function (pair) {
        var seg = document.createElement("span");
        seg.className = "rb-seg";
        var over = document.createElement("span");
        over.className = "py";
        over.textContent = pair[1] || "";
        var under = document.createElement("span");
        under.className = "hz";
        under.textContent = pair[0];
        seg.appendChild(over);
        seg.appendChild(under);
        el.appendChild(seg);
      });
      return el;
    }

    var py = document.createElement("span");
    py.className = "py";
    if (aligned) {
      // Joined for display ("zhōngguó") but one span per syllable, so each
      // syllable sits above its own character.
      syls.forEach(function (s) {
        var span = document.createElement("span");
        span.className = "t" + toneOf(s);
        span.textContent = s;
        py.appendChild(span);
      });
    } else {
      var whole = document.createElement("span");
      whole.className = "t" + toneOf(syls[0]);
      whole.textContent = syls.join(" ");
      py.appendChild(whole);
    }

    var hz = document.createElement("span");
    hz.className = "hz";
    if (aligned) {
      chars.forEach(function (c, i) {
        var span = document.createElement("span");
        span.className = "t" + toneOf(syls[i]);
        span.textContent = c;
        hz.appendChild(span);
      });
    } else {
      var whz = document.createElement("span");
      whz.className = "t" + toneOf(syls[0]);
      whz.textContent = token.hz;
      hz.appendChild(whz);
    }

    el.appendChild(py);
    el.appendChild(hz);
    return el;
  }

  function renderPassage(deck, passage) {
    document.getElementById("passage-head").hidden = false;
    document.getElementById("p-title").textContent = passage.title || "";
    document.getElementById("p-title-en").textContent = passage.title_en || "";

    var idx = flat.findIndex(function (f) { return f.passageId === passage.id; });
    var meta = [deck.title, deck.level].filter(Boolean).join(" · ");
    document.getElementById("p-meta").textContent =
      meta + "  (" + (idx + 1) + "/" + flat.length + ")";

    reader.innerHTML = "";
    (passage.sentences || []).forEach(function (sentence) {
      var block = document.createElement("div");
      block.className = "sentence";

      var line = document.createElement("div");
      line.className = "line";
      // Words carry their adjacent punctuation, so a comma or 。 can't wrap
      // onto a line of its own — which happened constantly at phone widths.
      var tokens = sentence.tokens || [];
      var i = 0;
      while (i < tokens.length) {
        var group = document.createElement("span");
        group.className = "group";
        while (i < tokens.length && !tokens[i].py) {
          group.appendChild(renderToken(tokens[i]));   // opening punctuation
          i++;
        }
        if (i < tokens.length) {
          group.appendChild(renderToken(tokens[i]));   // the word itself
          i++;
        }
        while (i < tokens.length && !tokens[i].py) {
          group.appendChild(renderToken(tokens[i]));   // closing punctuation
          i++;
        }
        line.appendChild(group);
      }
      block.appendChild(line);

      var en = document.createElement("div");
      en.className = "en";
      en.textContent = sentence.en || "";
      block.appendChild(en);

      // In "tap" and "hover" modes a click anywhere on the sentence reveals
      // its translation — the only way in on a touch screen.
      block.addEventListener("click", function (ev) {
        if (state.english !== "tap" && state.english !== "hover") return;
        if (ev.target.closest(".tok")) return;   // word taps open the tooltip instead
        block.classList.toggle("revealed");
      });

      reader.appendChild(block);
    });

    renderVocab(passage);
    hideTip();
  }

  function renderVocab(passage) {
    var seen = {};
    var rows = [];
    (passage.sentences || []).forEach(function (sentence) {
      (sentence.tokens || []).forEach(function (token) {
        if (!token.py) return;
        var key = token.hz + "|" + token.py;
        if (seen[key]) return;
        seen[key] = true;
        rows.push(token);
      });
    });

    var grid = document.getElementById("vocab-grid");
    grid.innerHTML = "";
    rows.forEach(function (token) {
      var row = document.createElement("div");
      row.className = "vocab-row";
      row.innerHTML =
        '<span class="v-hz"></span><span class="v-py"></span><span class="v-en"></span>';
      row.children[0].textContent = token.hz;
      row.children[1].textContent = syllables(token.py).join(" ");
      row.children[2].textContent = token.en || "";
      grid.appendChild(row);
    });
    var vocab = document.getElementById("vocab");
    vocab.hidden = rows.length === 0;
    document.getElementById("vocab-heading").textContent =
      "Words in this passage (" + rows.length + ")";
    // Open on a desktop, folded on a phone where it costs several screens.
    vocab.open = canHover();
  }

  /* ---------- tooltip ---------- */

  function showTip(el) {
    // The bubble mirrors the reading settings: whatever is turned off in the
    // text stays hidden here too, so hovering can't spoil what you're testing.
    tip.innerHTML = "";
    if (state.pinyin !== "off") {
      var pyLine = document.createElement("div");
      pyLine.className = "tip-py";
      pyLine.textContent = el.dataset.tip || syllables(el.dataset.py).join(" ");
      tip.appendChild(pyLine);
    }
    if (state.english !== "off" && el.dataset.en) {
      var enLine = document.createElement("div");
      enLine.className = "tip-en";
      enLine.textContent = el.dataset.en;
      tip.appendChild(enLine);
    }
    if (!tip.children.length) return false;   // nothing left to reveal — stay quiet

    tip.classList.add("show");
    tip.setAttribute("aria-hidden", "false");
    el.classList.add("active");

    if (!canHover()) {
      // Bottom sheet: the stylesheet owns its position, so drop any inline
      // coordinates left over from a desktop-width layout.
      tip.style.left = "";
      tip.style.top = "";
      return true;
    }

    var r = el.getBoundingClientRect();
    var t = tip.getBoundingClientRect();
    var pad = 8;
    var left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - t.width - pad));
    var top = r.top - t.height - pad;
    if (top < pad) top = r.bottom + pad;   // flip below when there's no room above
    tip.style.left = left + "px";
    tip.style.top = top + "px";
    return true;
  }

  function hideTip() {
    tip.classList.remove("show");
    tip.setAttribute("aria-hidden", "true");
    Array.prototype.forEach.call(
      reader.querySelectorAll(".tok.active"),
      function (el) { el.classList.remove("active"); }
    );
    pinned = null;
  }

  reader.addEventListener("pointerover", function (ev) {
    if (ev.pointerType !== "mouse" || pinned) return;
    var el = ev.target.closest(".tok");
    if (el) showTip(el);
  });

  reader.addEventListener("pointerout", function (ev) {
    if (ev.pointerType !== "mouse" || pinned) return;
    var el = ev.target.closest(".tok");
    if (el && !el.contains(ev.relatedTarget)) hideTip();
  });

  // Tap (or click) pins the tooltip so it survives on touch screens.
  reader.addEventListener("click", function (ev) {
    var el = ev.target.closest(".tok");
    if (!el) return;
    ev.stopPropagation();
    if (pinned === el) { hideTip(); return; }
    hideTip();
    // Leave nothing pinned if the bubble had nothing to say, so the next
    // hover isn't swallowed.
    if (showTip(el)) pinned = el;
  });

  reader.addEventListener("focusin", function (ev) {
    var el = ev.target.closest(".tok");
    if (el) { hideTip(); showTip(el); }
  });

  document.addEventListener("click", function () { if (pinned) hideTip(); });
  window.addEventListener("scroll", function () { if (pinned) hideTip(); }, { passive: true });
  window.addEventListener("resize", hideTip);

  /* ---------- read / not read ---------- */

  var doneBtn = document.getElementById("done");

  function isRead(key) {
    return !!state.read[key];
  }

  function setRead(key, value) {
    if (value) state.read[key] = true;
    else delete state.read[key];
    saveState();
    updateReadUI();
  }

  // The browse sheet doubles as the progress view, so finished passages
  // carry a check mark there.
  function updateReadUI() {
    var key = current && current.key;
    var done = key ? isRead(key) : false;
    doneBtn.setAttribute("aria-pressed", String(done));

    var count = flat.filter(function (f) {
      return isRead(keyOf(f.deckId, f.passageId));
    }).length;
    document.getElementById("read-count").textContent =
      count ? count + " of " + flat.length + " read" : "";

    // Marking a passage read changes the unread pool, so the scope count
    // (and the sheet, if it's open) has to follow.
    if (flat.length) updateScope();
    if (!browse.hidden) renderBrowse();
  }

  doneBtn.addEventListener("click", function () {
    if (current) setRead(current.key, !isRead(current.key));
  });

  /* ---------- settings UI ---------- */

  function bindSegment(id, key, onChange) {
    var group = document.getElementById(id);
    if (!group) return;          // control absent for this language
    group.addEventListener("click", function (ev) {
      var btn = ev.target.closest("button");
      if (!btn) return;
      state[key] = btn.dataset.value;
      saveState();
      applySettings();
      if (onChange) onChange();
    });
  }

  function cycle(key, values) {
    var i = values.indexOf(state[key]);
    state[key] = values[(i + 1) % values.length];
    saveState();
    applySettings();
  }

  function applySettings() {
    hideTip();   // an open bubble would keep showing the old settings
    reader.dataset.pinyin = state.pinyin;
    // Touch screens can't hover, so "hover" falls back to tap-to-reveal
    // there. The button still shows the choice that was made.
    reader.dataset.english =
      (state.english === "hover" && !canHover()) ? "tap" : state.english;
    reader.dataset.tones = cfg.tones ? state.tones : "off";
    document.documentElement.style.setProperty("--hz-size", state.size + "px");

    [["seg-pinyin", "pinyin"], ["seg-english", "english"], ["seg-tones", "tones"]]
      .forEach(function (pair) {
        var group = document.getElementById(pair[0]);
        if (!group) return;
        var buttons = group.querySelectorAll("button");
        Array.prototype.forEach.call(buttons, function (b) {
          b.setAttribute("aria-pressed", String(b.dataset.value === state[pair[1]]));
        });
      });
  }

  bindSegment("seg-pinyin", "pinyin");
  bindSegment("seg-english", "english");
  bindSegment("seg-tones", "tones");

  document.getElementById("bigger").addEventListener("click", function () {
    state.size = Math.min(SIZE_MAX, state.size + 3); saveState(); applySettings();
  });
  document.getElementById("smaller").addEventListener("click", function () {
    state.size = Math.max(SIZE_MIN, state.size - 3); saveState(); applySettings();
  });

  /* ---------- navigation ---------- */

  function keyOf(deckId, passageId) { return deckId + "/" + passageId; }

  function go(key, push) {
    var entry = flat.find(function (f) { return keyOf(f.deckId, f.passageId) === key; }) || flat[0];
    if (!entry) return;
    var k = keyOf(entry.deckId, entry.passageId);

    loadDeck(entry.deckId).then(function (deck) {
      var passage = deck.passages.find(function (p) { return p.id === entry.passageId; });
      if (!passage) return;
      current = { deck: deck, passage: passage, key: k };
      state.last = k;
      saveState();
      pickerLabel.textContent =
        passage.title + (passage.title_en ? "  ·  " + passage.title_en : "");
      if (push !== false && location.hash.slice(1) !== k) {
        // Sandboxed frames (and file://) can refuse history writes; the
        // reader works fine without the deep link, so don't let it throw.
        try { history.replaceState(null, "", "#" + k); } catch (e) { }
      }
      renderPassage(deck, passage);
      updateReadUI();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }).catch(showLoadError);
  }

  function step(delta) {
    if (!current) return;
    var i = flat.findIndex(function (f) { return keyOf(f.deckId, f.passageId) === current.key; });
    var j = (i + delta + flat.length) % flat.length;
    go(keyOf(flat[j].deckId, flat[j].passageId));
  }

  document.getElementById("prev").addEventListener("click", function () { step(-1); });
  document.getElementById("next").addEventListener("click", function () { step(1); });
  document.getElementById("random").addEventListener("click", function () {
    // Draw from the current filter, not the whole library — picking a
    // category should mean something outside the browse sheet too.
    var pool = scopedEntries();
    if (!pool.length) return;
    var here = current && current.key;
    var choices = pool.filter(function (e) {
      return keyOf(e.deckId, e.passageId) !== here;
    });
    // A filter narrowed to the passage you're already on: stay put rather
    // than silently leaving the category.
    if (!choices.length) return;
    var pick = choices[Math.floor(Math.random() * choices.length)];
    go(keyOf(pick.deckId, pick.passageId));
  });

  /* ---------- browse sheet ---------- */

  function entryMatches(entry, query) {
    var filters = state.filters;
    if (filters.level && entry.level !== filters.level) return false;
    if (filters.kind && entry.kind !== filters.kind) return false;
    if (filters.status) {
      var done = isRead(keyOf(entry.deckId, entry.passageId));
      if (filters.status === "read" && !done) return false;
      if (filters.status === "unread" && done) return false;
    }
    return !query || entry.haystack.indexOf(query) !== -1;
  }

  // The chip filters, without the search box — this is the pool Random
  // draws from, and what the scope pill describes.
  function scopedEntries() {
    return flat.filter(function (e) { return entryMatches(e, ""); });
  }

  function scopeLabel() {
    var f = state.filters;
    var parts = [];
    if (f.level) parts.push(f.level);
    if (f.kind) parts.push(f.kind === "stories" ? "Stories" : "Everyday");
    if (f.status) parts.push(f.status);
    return parts.join(" · ");
  }

  function syncChips() {
    Array.prototype.forEach.call(
      document.querySelectorAll(".chip-row"),
      function (row) {
        var value = state.filters[row.dataset.facet] || "";
        Array.prototype.forEach.call(row.children, function (chip) {
          chip.setAttribute("aria-pressed", String(chip.dataset.value === value));
        });
      }
    );
  }

  function updateScope() {
    var label = scopeLabel();
    scopePill.hidden = !label;
    scopePill.firstChild.textContent = label;
    var pool = label ? scopedEntries().length : flat.length;
    document.getElementById("random").title =
      label ? "Random passage in " + label + " (" + pool + ")" : "Random passage";
  }

  function setFilter(facet, value) {
    state.filters[facet] = value;
    saveState();
    syncChips();
    updateScope();
    if (!browse.hidden) renderBrowse();
  }

  function renderBrowse() {
    var query = browseSearch.value.trim().toLowerCase();
    visible = flat.filter(function (e) { return entryMatches(e, query); });
    cursor = -1;
    browseList.innerHTML = "";
    browseCount.textContent =
      visible.length + (visible.length === 1 ? " passage" : " passages");

    if (!visible.length) {
      var empty = document.createElement("div");
      empty.className = "sheet-empty";
      empty.textContent = "Nothing matches that.";
      browseList.appendChild(empty);
      return;
    }

    var lastDeck = null;
    visible.forEach(function (entry, i) {
      // Group headings only make sense in deck order — a search reorders
      // nothing, so they still line up.
      if (entry.deckTitle !== lastDeck) {
        lastDeck = entry.deckTitle;
        var heading = document.createElement("div");
        heading.className = "sheet-group";
        heading.textContent = entry.deckTitle;
        browseList.appendChild(heading);
      }

      var key = keyOf(entry.deckId, entry.passageId);
      var row = document.createElement("button");
      row.className = "sheet-row";
      row.dataset.index = i;
      if (current && current.key === key) row.setAttribute("aria-current", "true");
      row.innerHTML = '<span class="row-hz"></span><span class="row-en"></span>' +
        '<span class="row-done"></span>';
      row.children[0].textContent = entry.title;
      row.children[1].textContent = entry.titleEn;
      row.children[2].textContent = isRead(key) ? "✓" : "";
      row.addEventListener("click", function () {
        closeBrowse();
        go(key);
      });
      browseList.appendChild(row);
    });
  }

  function moveCursor(delta) {
    if (!visible.length) return;
    cursor = (cursor + delta + visible.length) % visible.length;
    var rows = browseList.querySelectorAll(".sheet-row");
    Array.prototype.forEach.call(rows, function (r) { r.classList.remove("cursor"); });
    var row = rows[cursor];
    if (row) {
      row.classList.add("cursor");
      row.scrollIntoView({ block: "nearest" });
    }
  }

  function openBrowse() {
    browse.hidden = false;
    renderBrowse();
    // Focusing the field pops the on-screen keyboard, which eats the list
    // on a phone — so only take focus where there's a real keyboard.
    if (canHover()) browseSearch.focus();
    var here = browseList.querySelector('[aria-current="true"]');
    if (here) here.scrollIntoView({ block: "center" });
  }

  function closeBrowse() {
    browse.hidden = true;
    document.getElementById("browse-open").focus({ preventScroll: true });
  }

  document.getElementById("browse-open").addEventListener("click", openBrowse);
  document.getElementById("browse-close").addEventListener("click", closeBrowse);
  browse.addEventListener("click", function (ev) {
    if (ev.target === browse) closeBrowse();   // backdrop
  });
  browseSearch.addEventListener("input", renderBrowse);

  document.getElementById("browse-filters").addEventListener("click", function (ev) {
    var chip = ev.target.closest(".chip");
    if (chip) setFilter(chip.parentNode.dataset.facet, chip.dataset.value);
  });

  scopePill.addEventListener("click", function () {
    state.filters = { level: "", kind: "", status: "" };
    saveState();
    syncChips();
    updateScope();
    if (!browse.hidden) renderBrowse();
  });

  browse.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { closeBrowse(); ev.preventDefault(); return; }
    if (ev.key === "ArrowDown") { moveCursor(1); ev.preventDefault(); return; }
    if (ev.key === "ArrowUp") { moveCursor(-1); ev.preventDefault(); return; }
    if (ev.key === "Enter") {
      var pick = visible[cursor >= 0 ? cursor : 0];
      if (pick) { closeBrowse(); go(keyOf(pick.deckId, pick.passageId)); }
      ev.preventDefault();
    }
  });

  // Swipe across the text to change passage — the natural gesture when
  // you're reading one-handed and the toolbar is a stretch away.
  (function () {
    var startX = 0, startY = 0, tracking = false;
    reader.addEventListener("touchstart", function (ev) {
      tracking = ev.touches.length === 1;
      if (!tracking) return;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
    }, { passive: true });

    reader.addEventListener("touchend", function (ev) {
      if (!tracking) return;
      tracking = false;
      var touch = ev.changedTouches[0];
      var dx = touch.clientX - startX;
      var dy = touch.clientY - startY;
      // Clearly horizontal, and long enough not to be a tap or a scroll.
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
      hideTip();
      step(dx < 0 ? 1 : -1);
    }, { passive: true });
  })();

  window.addEventListener("hashchange", function () {
    var k = location.hash.slice(1);
    if (k && (!current || k !== current.key)) go(k, false);
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    // The sheet runs its own keys while it's open.
    if (!browse.hidden) return;
    // Don't hijack keys aimed at a control the reader is focused on.
    var focused = document.activeElement || document.body;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(focused.tagName)) return;
    switch (ev.key) {
      case "ArrowLeft": step(-1); break;
      case "ArrowRight": step(1); break;
      case "r": document.getElementById("random").click(); break;
      case "b":
      case "/":
        openBrowse();
        break;
      case "d":
        if (current) setRead(current.key, !isRead(current.key));
        break;
      case "p": cycle("pinyin", ["on", "hover", "off"]); break;
      case "e": cycle("english", ["on", "hover", "tap", "off"]); break;
      case "t":
        if (cfg.tones) cycle("tones", ["on", "off"]);
        break;
      case "Escape": hideTip(); break;
      default: return;
    }
    ev.preventDefault();
  });

  /* ---------- data loading ---------- */

  function loadDeck(deckId) {
    if (deckCache[deckId]) return Promise.resolve(deckCache[deckId]);
    var entry = manifest.decks.find(function (d) { return d.id === deckId; });
    if (!entry) return Promise.reject(new Error("Unknown deck: " + deckId));
    var url = "/" + entry.file;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      return res.json();
    }).then(function (deck) {
      deckCache[deckId] = deck;
      return deck;
    });
  }

  function buildIndex() {
    var levels = [];
    manifest.decks.forEach(function (deck) {
      if (deck.level && levels.indexOf(deck.level) === -1) levels.push(deck.level);
      deck.passages.forEach(function (p) {
        var tags = (p.tags || []).join(" ");
        flat.push({
          deckId: deck.id,
          passageId: p.id,
          title: p.title || "",
          titleEn: p.title_en || "",
          level: deck.level || "",
          kind: deck.kind || "",
          deckTitle: deck.title || "",
          // Searched as one lowercased string: Chinese title, English
          // title, tags, and the deck name.
          haystack: [p.title, p.title_en, tags, deck.title].join(" ").toLowerCase()
        });
      });
    });

    var row = document.querySelector('.chip-row[data-facet="level"]');
    levels.forEach(function (level) {
      var chip = document.createElement("button");
      chip.className = "chip";
      chip.dataset.value = level;
      chip.textContent = level;
      row.appendChild(chip);
    });

    // A level saved from a previous visit may no longer exist.
    if (state.filters.level && levels.indexOf(state.filters.level) === -1) {
      state.filters.level = "";
    }
    syncChips();
    updateScope();
  }

  function showLoadError(err) {
    statusEl.innerHTML =
      '<div class="error"><b>Could not load the passages.</b><br>' +
      '<span class="msg"></span><br><br>' +
      'If you opened this file directly from disk, the browser blocks the JSON fetches. ' +
      'Serve the folder instead: <kbd>python3 -m http.server</kbd>, then visit ' +
      '<kbd>localhost:8000' + cfg.path + '</kbd>.</div>';
    statusEl.querySelector(".msg").textContent = String(err);
  }

  function init(options) {
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) cfg[key] = options[key];
    }
    loadState();
    applySettings();
    load();
  }

  function load() {
    fetch(cfg.dataRoot + "manifest.json").then(function (res) {
    if (!res.ok) throw new Error("HTTP " + res.status + " for the passage index");
    return res.json();
  }).then(function (data) {
    manifest = data;
    buildIndex();
    if (!flat.length) throw new Error("The manifest lists no passages.");
    updateReadUI();
      var wanted = location.hash.slice(1) || state.last;
      go(wanted || keyOf(flat[0].deckId, flat[0].passageId));
    }).catch(showLoadError);
  }

  return { init: init };
})();
