/* ThaiPyBlocks engine: Thai word segmentation, a line-by-line port of PyThaiNLP's word_tokenize with
   engine="newmm" (dictionary maximal matching constrained by Thai Character Clusters), "longest"
   (longest matching) and "mm" (multi_cut: the stretches that can be cut in more than one way stay whole),
   syllable_tokenize(engine="dict") (newmm words, then each word cut with the syllable list) and
   subword_tokenize(engine="tcc") (Thai Character Clusters), using the same dictionaries, so the browser and
   Python give the same words. Positions follow Python code points: characters outside the BMP (emoji)
   are handled as one character, like Python. */
(function () {
  let WORDS = null, STOP = null, TCC = null, SYLS = null, TCC_SUB = null, WORDSET = null;
  const NONTHAI = /[-a-zA-Z]+|\p{Nd}+(?:[,.]\p{Nd}+)*|[ \t]+|\r?\n|[^฀-๿ \t\r\n]+/uy;
  const TWOCHARS = /^[ก-ฮ]{0,2}$/;
  const DIGITS_SEP = /(\p{Nd}+[.,:])+\p{Nd}+/gu;
  const MAX_GRAPH = 50;

  function load() {
    if (WORDS) return;
    const D = PB.THAI_DICT;
    const tbl = []; for (let i = 0; i < D.map.length; i++) tbl[D.map.charCodeAt(i)] = D.alpha[i];
    const dec = (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += tbl[s.charCodeAt(i)]; return o; };
    const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/';
    const unpack = (lens, packed, decode) => {
      const sufs = packed.split(','), out = new Array(sufs.length);
      let prev = '';
      for (let i = 0; i < sufs.length; i++) { const w = prev.slice(0, B64.indexOf(lens[i])) + decode(sufs[i]); out[i] = w; prev = w; }
      return out;
    };
    WORDS = unpack(D.lens, D.sufs, dec);
    STOP = new Set(D.stop.split(',').map(dec));
    TCC = new RegExp(D.tcc, 'y');
    /* the syllable list has its own character map */
    const stbl = []; for (let i = 0; i < D.smap.length; i++) stbl[D.smap.charCodeAt(i)] = D.salpha[i];
    SYLS = unpack(D.slens, D.ssufs, (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += stbl[s.charCodeAt(i)]; return o; });
    TCC_SUB = new RegExp(D.tcc_sub, 'y');
  }

  /* Trie.prefixes(text, start): dictionary words that start at `start`, shortest first.
     The word list is sorted, so walking it by binary search behaves exactly like walking the trie. */
  function prefixes(text, start, WORDS) {
    const res = [];
    let lo = 0, hi = WORDS.length;
    for (let i = start; i < text.length; i++) {
      const d = i - start, c = text.charCodeAt(i);
      let a = lo, b = hi;
      while (a < b) { const m = (a + b) >> 1, w = WORDS[m], wc = w.length > d ? w.charCodeAt(d) : -1; if (wc < c) a = m + 1; else b = m; }
      const nlo = a; b = hi;
      while (a < b) { const m = (a + b) >> 1, w = WORDS[m], wc = w.length > d ? w.charCodeAt(d) : -1; if (wc <= c) a = m + 1; else b = m; }
      if (nlo >= a) break;
      lo = nlo; hi = a;
      if (WORDS[lo].length === d + 1) res.push(text.slice(start, i + 1));
    }
    return res;
  }
  /* tcc_pos_array: 1 at every Thai Character Cluster boundary */
  function tccPos(text) {
    const arr = new Uint8Array(text.length + 1);
    let p = 0;
    while (p < text.length) {
      TCC.lastIndex = p;
      const m = TCC.exec(text);
      p += m && m[0].length ? m[0].length : 1;
      arr[p] = 1;
    }
    return arr;
  }
  const matchAt = (re, text, pos) => { re.lastIndex = pos; const m = re.exec(text); return m ? m : null; };
  /* heapq with unique integers */
  const heapPush = (h, v) => { h.push(v); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (h[p] <= h[i]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } };
  const heapPop = (h) => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && h[l] < h[m]) m = l; if (r < h.length && h[r] < h[m]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; } }
    return top;
  };
  function bfsPath(graph, start, goal) {
    const visited = new Set([start]), queue = [[start, [start]]];
    for (let q = 0; q < queue.length; q++) {
      const [v, path] = queue[q];
      for (const pos of graph.get(v) || []) {
        if (pos === goal) return path.concat([pos]);
        if (!visited.has(pos)) { visited.add(pos); queue.push([pos, path.concat([pos])]); }
      }
    }
    return null;
  }
  /* newmm._onecut */
  function onecut(text, dict = WORDS) {
    const out = [], n = text.length, valid = tccPos(text), graph = new Map();
    const edges = (k) => { let a = graph.get(k); if (!a) { a = []; graph.set(k, a); } return a; };
    let graphSize = 0, endPos = 0;
    const pos = [0];
    while (pos[0] < n) {
      const begin = heapPop(pos);
      for (const word of prefixes(text, begin, dict)) {
        const cand = begin + word.length;
        if (valid[cand]) {
          edges(begin).push(cand); graphSize++;
          if (!pos.includes(cand)) heapPush(pos, cand);
          if (graphSize > MAX_GRAPH) break;
        }
      }
      if (pos.length === 1) {
        const path = bfsPath(graph, endPos, pos[0]);
        if (!path) throw PB.err('RuntimeError', 'generator raised StopIteration', TR('ตัดคำข้อความนี้ไม่ได้'));
        graphSize = 0; graph.clear();
        for (const p of path.slice(1)) { out.push(text.slice(endPos, p)); endPos = p; }
      } else if (pos.length === 0) {
        const m = matchAt(NONTHAI, text, begin);
        if (m) endPos = begin + m[0].length;
        else {
          endPos = n;
          for (let p = begin + 1; p < n; p++) {
            if (!valid[p]) continue;
            if (prefixes(text, p, dict).some((w) => valid[p + w.length] && !TWOCHARS.test(w))) { endPos = p; break; }
            if (matchAt(NONTHAI, text, p)) { endPos = p; break; }
          }
        }
        graphSize = 0; graph.clear();
        out.push(text.slice(begin, endPos));
        heapPush(pos, endPos);
      }
    }
    return out;
  }
  /* ---------- engine="longest": LongestMatchTokenizer ---------- */
  /* str.isspace() */
  const PY_SPACE = /^[\t\n\v\f\r\x1c-\x20\x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/;
  const isSpace = (s) => PY_SPACE.test(s);
  const FRONT_DEP = new Set(['ะ', 'ั', 'ำ', 'ิ', 'ี', 'ึ', 'ื', 'ุ', 'ู', 'ๅ', '็', '์', 'ํ']);   /* PyThaiNLP lists "า " (with a space), so า never counts */ /* th-data */
  const REAR_DEP = new Set(['ั', 'ื', 'เ', 'แ', 'โ', 'ใ', 'ไ', 'ํ']), TRAILING = new Set(['ๆ', 'ฯ']), TONES = '่้๊๋'; /* th-data */
  const LONGEST_NONTHAI = /[A-Za-z\p{Nd}]*/uy;
  const searchNonthai = (text, pos) => { LONGEST_NONTHAI.lastIndex = pos; const m = LONGEST_NONTHAI.exec(text); return m && m[0] ? m[0].toLowerCase() : null; };
  function nextWordValid(text, pos) {
    const rest = PB.pyStrip(text.slice(pos));
    if (!rest) return true;
    if (searchNonthai(rest, 0)) return true;
    return prefixes(rest, 0, WORDS).length > 0;
  }
  function longestMatching(text, begin) {
    const nt = searchNonthai(text, begin);
    if (nt) return nt;
    const words = prefixes(text, begin, WORDS);
    if (!words.length) return '';
    let valid = null;
    for (const w of words) if (nextWordValid(text, begin + w.length)) valid = w;
    if (!valid) valid = words[words.length - 1];
    const after = text[begin + valid.length];
    return after !== undefined && TRAILING.has(after) ? valid + after : valid;
  }
  function longest(text) {
    const tokens = [], status = [];
    let p = 0;
    while (p < text.length) {
      const m = longestMatching(text, p);
      if (!m) {
        const ch = text[p];
        if (p !== 0 && !isSpace(ch) && (FRONT_DEP.has(ch) || REAR_DEP.has(text[p - 1]) || TONES.includes(ch) || (status.length && status[status.length - 1] === false))) { tokens[tokens.length - 1] += ch; status[status.length - 1] = false; }
        else { tokens.push(ch); status.push(false); }
        p += 1;
      } else {
        if (p !== 0 && REAR_DEP.has(text[p - 1])) tokens[tokens.length - 1] += m;
        else { tokens.push(m); status.push(true); }
        p += m.length;
      }
    }
    const out = [];
    for (const t of tokens) { if (isSpace(t) && out.length && isSpace(out[out.length - 1])) out[out.length - 1] += t; else out.push(t); }
    return out;
  }
  /* ---------- engine="mm": multi_cut._multicut, one item per stretch between unambiguous cut points ---------- */
  const MM_NONTHAI = /[-a-zA-Z]+|\p{Nd}+(?:[,.]\p{Nd}+)*|[ \t]+|\r?\n/uy;
  function multiCut(text) {
    const n = text.length, out = [], q = new Set([0]);
    const minOf = () => { let m = Infinity; for (const v of q) if (v < m) m = v; return m; };
    let last = 0;
    while (minOf() < n) {
      const p = minOf(); q.delete(p);
      for (const w of prefixes(text, p, WORDS)) q.add(p + w.length);
      if (q.size === 1) { const q0 = minOf(); out.push(text.slice(last, q0)); last = q0; }
      else if (q.size === 0) {
        let i;
        const m = matchAt(MM_NONTHAI, text, p);
        if (m) i = p + m[0].length;
        else {
          i = n;
          for (let j = p; j < n; j++) if (prefixes(text, j, WORDS).length || matchAt(MM_NONTHAI, text, j)) { i = j; break; }
        }
        out.push(text.slice(p, i));
        last = i; q.add(i);
      }
    }
    return out;
  }
  /* ---------- subword_tokenize(engine="tcc") ---------- */
  function tccSub(text) {
    const out = [];
    let p = 0;
    while (p < text.length) { const m = matchAt(TCC_SUB, text, p), k = m && m[0].length ? m[0].length : 1; out.push(text.slice(p, p + k)); p += k; }
    return out;
  }

  /* _utils.rejoin_formatted_num: glue back times, decimals, 1,234 and IP addresses */
  function rejoinNum(segs) {
    const matches = Array.from(segs.join('').matchAll(DIGITS_SEP));
    const out = [];
    let pos = 0, si = 0, mi = 0;
    while (si < segs.length && mi < matches.length) {
      const m = matches[mi], start = m.index, end = start + m[0].length;
      if (pos >= start) {
        let joined = '';
        while (pos < end && si < segs.length) { joined += segs[si]; pos += segs[si].length; si++; }
        if (joined) out.push(joined);
        mi++;
      } else { out.push(segs[si]); pos += segs[si].length; si++; }
    }
    return out.concat(segs.slice(si));
  }
  /* run a segmenter on code points: outside-BMP characters become one placeholder unit so positions match
     Python's, and the pieces are mapped back to the original characters */
  function byCodePoints(text, cut) {
    const cps = Array.from(text);
    if (cps.length === text.length) return cut(text);
    const segs = cut(cps.map((c) => (c.length > 1 ? '￿' : c)).join(''));
    /* only the placeholders go back to the original characters (longest lower-cases Latin letters) */
    let p = 0;
    return segs.map((t) => { let o = ''; for (const ch of t) { o += ch === '￿' && cps[p].length > 1 ? cps[p] : ch; p++; } return o; });
  }
  const stripWs = (segs) => segs.map((t) => t.replace(/^ +| +$/g, '')).filter(Boolean);
  const ENGINES = { newmm: (t) => onecut(t), longest, mm: multiCut };
  /* pythainlp.tokenize.word_tokenize(text, engine=..., keep_whitespace=..., join_broken_num=True) */
  function wordTokenize(text, opts = {}) {
    if (typeof text !== 'string' || !text) return [];
    load();
    const cut = ENGINES[opts.engine || 'newmm'];
    if (!cut) throw PB.err('ValueError', `Tokenizer "${opts.engine}" not found.`, TR`ไม่รู้จักวิธีตัดคำ ${opts.engine}`);
    let segs = byCodePoints(text, (t) => rejoinNum(cut(t)));
    if (opts.keepWhitespace === false) segs = stripWs(segs);
    return segs;
  }
  /* syllable_tokenize(text, engine="dict"): newmm words, then every word cut by newmm with the syllable list */
  function syllables(text, opts = {}) {
    if (typeof text !== 'string' || !text) return [];
    load();
    const words = byCodePoints(text, (t) => rejoinNum(onecut(t)));
    let segs = [];
    for (const w of words) segs = segs.concat(byCodePoints(w, (t) => rejoinNum(onecut(t, SYLS))));
    return opts.keepWhitespace === false ? stripWs(segs) : segs;
  }
  /* subword_tokenize(text, engine="tcc") */
  function tccTokenize(text, opts = {}) {
    if (typeof text !== 'string' || !text) return [];
    load();
    const segs = byCodePoints(text, tccSub);
    return opts.keepWhitespace === false ? stripWs(segs) : segs;
  }
  PB.thai = {
    wordTokenize, syllables, tccTokenize, ENGINES: ['newmm', 'longest', 'mm'],
    isStopword: (w) => { load(); return STOP.has(w); },
    stopwords: () => { load(); return STOP; },
    removeStopwords: (tokens) => { load(); return tokens.filter((w) => !STOP.has(w)); },
    tcc: (text) => { load(); const a = tccPos(text), out = []; let p = 0; for (let i = 1; i <= text.length; i++) if (a[i]) { out.push(text.slice(p, i)); p = i; } return out; },
    version: () => PB.THAI_DICT.version,
  };
})();
