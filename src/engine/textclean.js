/* ThaiPyBlocks engine: tools of the cleaning assistant for text that should mean the same thing
   (version 3.8): PyThaiNLP's normalize() (Thai typing mistakes such as "เเ" for "แ"), difflib's
   SequenceMatcher.ratio() (similarity of two spellings), the similar_values table that pairs a rare spelling
   with the more common one it resembles, and parse_dates for dates typed in many formats (Thai months,
   Buddhist years). Each one follows the Python helper the blocks write into the program, step for step, so the
   browser and Python give the same table and the same dates. */
(function () {
  const { DataFrame, Series } = PB;
  const isMiss = PB.isMissing;

  /* ---------------- pythainlp.util.normalize ---------------- */
  const TONES = '่้๊๋', ABOVE = 'ัิีึืํ็', BELOW = 'ุู', FOLLOW = 'ะาำๅ', LEAD = 'เแโใไ'; /* th-data */
  const CONS = 'กขฃคฅฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ', VOWELS = 'ฤฦะัาำิีึืุูเแโใไๅํ็'; /* th-data */
  const DANGLING = ABOVE + BELOW + TONES + 'ฺ์ํ๎'; /* th-data */
  const RE_DANGLING = new RegExp(`^[${DANGLING}]+`, 'u'), RE_DANGLING_SPACE = new RegExp(` +[${DANGLING}]+`, 'gu');
  const REORDER = [[/เเ/gu, 'แ'], [new RegExp(`([${TONES}์]+)([${ABOVE}${BELOW}]+)`, 'gu'), '$2$1'], [new RegExp(`ํ([${TONES}]*)า`, 'gu'), '$1ำ'], [new RegExp(`([${FOLLOW}]+)([${TONES}]+)`, 'gu'), '$2$1'], [/([^ฤฦ])ๅ/gu, '$1า']]; /* th-data */
  const NOREPEAT = Array.from(FOLLOW + LEAD + ABOVE + BELOW + 'ฺ์ํ๎').map((ch) => [new RegExp(`(${ch}[ ]*)+${ch}`, 'gu'), ch]); /* th-data */
  const RE_TONES = new RegExp(`[${TONES}]+`, 'gu');
  const RE_SPACE_MARK = new RegExp(`([${CONS}])(?<![${VOWELS}][${CONS}]) ([${DANGLING}])`, 'gu');
  function thaiNormalize(text) {
    let t = String(text).replace(/[​‌]/g, '');
    while (t.includes('  ')) t = t.split('  ').join(' ');
    t = PB.pyStrip(t.replace(/[ \n]*\n[ \n]*/g, '\n'));
    t = t.replace(RE_SPACE_MARK, '$1$2');
    for (const [re, to] of REORDER) t = t.replace(re, to);
    for (const [re, to] of NOREPEAT) t = t.replace(re, to);
    t = t.replace(RE_TONES, (m) => m.slice(-1));
    return t.replace(RE_DANGLING, '').replace(RE_DANGLING_SPACE, ' ');
  }

  /* ---------------- difflib.SequenceMatcher(None, a, b).ratio() ---------------- */
  /* no junk; autojunk only removes popular characters from strings of 200+ characters, as difflib does */
  function seqRatio(a, b) {
    a = Array.from(a); b = Array.from(b);
    const la = a.length, lb = b.length;
    if (!la && !lb) return 1;
    const b2j = new Map();
    b.forEach((ch, j) => { if (!b2j.has(ch)) b2j.set(ch, []); b2j.get(ch).push(j); });
    if (lb >= 200) { const ntest = Math.floor(lb / 100) + 1; for (const [ch, idx] of Array.from(b2j)) if (idx.length > ntest) b2j.delete(ch); }
    function longest(alo, ahi, blo, bhi) {
      let besti = alo, bestj = blo, bestsize = 0, j2len = new Map();
      for (let i = alo; i < ahi; i++) {
        const next = new Map();
        for (const j of b2j.get(a[i]) || []) {
          if (j < blo) continue;
          if (j >= bhi) break;
          const k = (j2len.get(j - 1) || 0) + 1;
          next.set(j, k);
          if (k > bestsize) { besti = i - k + 1; bestj = j - k + 1; bestsize = k; }
        }
        j2len = next;
      }
      while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; bestsize++; }
      while (besti + bestsize < ahi && bestj + bestsize < bhi && a[besti + bestsize] === b[bestj + bestsize]) bestsize++;
      return [besti, bestj, bestsize];
    }
    let matches = 0;
    const queue = [[0, la, 0, lb]];
    while (queue.length) {
      const [alo, ahi, blo, bhi] = queue.pop();
      const [i, j, k] = longest(alo, ahi, blo, bhi);
      if (k) {
        matches += k;
        if (alo < i && blo < j) queue.push([alo, i, blo, j]);
        if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
      }
    }
    return (2 * matches) / (la + lb);
  }

  /* Python's round(x, n): the exact decimal value of the double, ties to even */
  function pyRoundN(x, n) {
    if (!Number.isFinite(x)) return x;
    const f = Math.pow(10, n), y = x * f;
    if (Math.abs(y % 1) === 0.5 && y / f === x) return PB.roundHalfEven(y) / f;
    return Number(x.toFixed(n));
  }

  /* similar_values(s, cutoff): for every value but the most common, the more common value whose
     normalized spelling is most alike; rows where that ratio reaches the cutoff */
  const SIMILAR_COLS = ['value', 'count', 'similar_to', 'count_similar', 'ratio'];
  function similarPairs(series, cutoff = 0.8) {
    const vc = series.value_counts(), vals = vc.index, counts = vc.values;
    const names = vals.map((v) => thaiNormalize(PB.str(v)));
    const out = [];
    for (let i = 1; i < vals.length; i++) {
      let best = 0, br = -1;
      for (let j = 0; j < i; j++) { const r = seqRatio(names[i], names[j]); if (r > br) { br = r; best = j; } }
      if (br >= cutoff) out.push({ value: vals[i], count: counts[i], similar_to: vals[best], count_similar: counts[best], ratio: br });
    }
    return out;
  }
  function similarValues(series, cutoff = 0.8) {
    const rows = similarPairs(series, cutoff), m = new Map();
    const dt = series.dtype === 'object' ? 'object' : series.dtype;
    m.set('value', { values: rows.map((r) => r.value), dtype: rows.length ? dt : 'object' });
    m.set('count', { values: rows.map((r) => r.count), dtype: rows.length ? 'int64' : 'object' });
    m.set('similar_to', { values: rows.map((r) => r.similar_to), dtype: rows.length ? dt : 'object' });
    m.set('count_similar', { values: rows.map((r) => r.count_similar), dtype: rows.length ? 'int64' : 'object' });
    m.set('ratio', { values: rows.map((r) => pyRoundN(r.ratio, 3)), dtype: rows.length ? 'float64' : 'object' });
    return new DataFrame(m);
  }

  /* ---------------- parse_date / parse_dates ---------------- */
  const MONTHS = {
    มค: 1, มกราคม: 1, กพ: 2, กุมภาพันธ์: 2, มีค: 3, มีนาคม: 3, เมย: 4, เมษายน: 4, พค: 5, พฤษภาคม: 5, มิย: 6, มิถุนายน: 6,
    กค: 7, กรกฎาคม: 7, สค: 8, สิงหาคม: 8, กย: 9, กันยายน: 9, ตค: 10, ตุลาคม: 10, พย: 11, พฤศจิกายน: 11, ธค: 12, ธันวาคม: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }; /* th-data */
  const RE_YMD = /^([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})$/, RE_DMY = /^([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})$/;
  const RE_D_NAME_Y = /^([0-9]{1,2})[ ]*([^0-9 ,]+)[ ]*,?[ ]*([0-9]{4})$/u, RE_NAME_D_Y = /^([A-Za-z]+)\.?[ ]+([0-9]{1,2}),?[ ]+([0-9]{4})$/;
  const isAscii = (s) => /^[\x00-\x7f]*$/.test(s);
  /* one value → milliseconds since 1970 (UTC midnight) or NaN for NaT */
  function parseDateValue(v) {
    if (isMiss(v)) return NaN;
    const t = PB.pyStrip(PB.str(v)).replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
    let year, month, day, m;
    if ((m = RE_YMD.exec(t))) [, year, month, day] = m;
    else if ((m = RE_DMY.exec(t))) [, day, month, year] = m;
    else {
      let name;
      if ((m = RE_D_NAME_Y.exec(t))) [, day, name, year] = m;
      else if ((m = RE_NAME_D_Y.exec(t))) [, name, day, year] = m;
      else return NaN;
      month = MONTHS[isAscii(name) ? name.toLowerCase().slice(0, 3) : name.replace(/\./g, '')];
      if (month === undefined) return NaN;
    }
    let y = parseInt(year, 10);
    const mo = parseInt(month, 10), d = parseInt(day, 10);
    if (y > 2400) y -= 543;
    if (y < 1 || mo < 1 || mo > 12 || d < 1) return NaN;
    const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    if (d > dim) return NaN;
    /* setUTCFullYear: Date.UTC would read the years 0–99 as 1900–1999 */
    const exact = new Date(0); exact.setUTCFullYear(y, mo - 1, d);
    return exact.getTime();
  }
  /* the engine tags dates 'datetime64[ns]' inside; they print as pandas 3 shows them, datetime64[us] (PB.dtypeLabel) */
  const parseDates = (series) => series._new(series.values.map(parseDateValue), { dtype: 'datetime64[ns]' });
  /* how many of the non-missing values read as a date, and examples of the formats seen (for the assistant) */
  function dateShare(series) {
    const vals = series.values.filter((v) => !isMiss(v) && typeof v === 'string');
    if (!vals.length) return { ok: 0, n: 0, bad: [] };
    const bad = [];
    let ok = 0;
    for (const v of vals) { if (Number.isNaN(parseDateValue(v))) { if (bad.length < 3 && !bad.includes(v)) bad.push(v); } else ok++; }
    return { ok, n: vals.length, bad };
  }

  Object.assign(PB, { thaiNormalize, seqRatio, pyRoundN, similarPairs, similarValues, SIMILAR_COLS, parseDateValue, parseDates, dateShare });
})();
/* examples of the date formats seen in a column, one per shape (digits → 9, Latin words → A, Thai → ก),
   for the cleaning assistant's description */
(function () {
  PB.dateExamples = (series, max = 4) => {
    const seen = new Set(), out = [];
    for (const v of series.values) {
      if (typeof v !== 'string' || PB.isMissing(v) || Number.isNaN(PB.parseDateValue(v))) continue;
      const shape = v.replace(/[0-9๐-๙]+/g, '9').replace(/[A-Za-z]+/g, 'A').replace(/[ก-๛]+/g, 'ก'); /* th-data */
      if (seen.has(shape)) continue;
      seen.add(shape); out.push(v);
      if (out.length >= max) break;
    }
    return out;
  };
})();
