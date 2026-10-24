/* ThaiPyBlocks engine: pandas-style DataFrame / Series, numpy-style NDArray, file parsing. */
(function () {
  const isMissing = PB.isMissing;
  const NA_STRINGS = new Set(['', '#N/A', '#N/A N/A', '#NA', '-1.#IND', '-1.#QNAN', '-NaN', '-nan', '1.#IND', '1.#QNAN', '<NA>', 'N/A', 'NA', 'NULL', 'NaN', 'None', 'n/a', 'nan', 'null']);
  const RE_INT = /^[+-]?\d+$/;
  const RE_FLOAT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const RE_INF = /^[+-]?(inf|Inf|INF|infinity|Infinity)$/;

  /* ---------- dtype helpers ---------- */
  function inferDtype(vals) {
    let num = false, str = false, bool = false, miss = false, allInt = true, date = false;
    for (const v of vals) {
      if (isMissing(v)) { miss = true; continue; }
      const t = typeof v;
      if (t === 'number') { num = true; if (!Number.isInteger(v)) allInt = false; }
      else if (t === 'boolean') bool = true;
      else if (v instanceof Date) date = true;
      else str = true;
    }
    if (str || (bool && num) || (date && (num || str || bool))) return 'object';
    if (date) return 'datetime64[ns]';
    if (bool) return miss ? 'object' : 'bool';
    if (num) return allInt && !miss ? 'int64' : 'float64';
    return miss ? 'float64' : 'object';
  }
  const isNumericDtype = (dt) => dt === 'int64' || dt === 'float64' || dt === 'bool';
  /* dtype after fillna: a float column filled with a number stays float64 (5.0 prints as 5.0),
     a text (object) column stays object, anything else is inferred from the new values */
  function fillDtype(dtype, value, vals) {
    if (dtype === 'float64' && typeof value === 'number') return 'float64';
    if (dtype === 'object') return 'object';
    return inferDtype(vals);
  }
  PB.fillDtype = fillDtype;
  PB.inferDtype = inferDtype;
  /* dates are tagged datetime64[ns] inside the engine; pandas 3 creates them as datetime64[us] and prints that */
  const dtypeLabel = (dt) => (dt === 'datetime64[ns]' ? 'datetime64[us]' : dt);
  PB.dtypeLabel = dtypeLabel;
  PB.isNumericDtype = isNumericDtype;

  function normalizeValues(vals, dtype) {
    if (dtype === 'float64' || dtype === 'int64') return vals.map((v) => (isMissing(v) ? NaN : typeof v === 'boolean' ? +v : v));
    if (dtype === 'object') return vals.map((v) => (isMissing(v) ? null : v));
    if (dtype === 'datetime64[ns]') return vals.map((v) => (isMissing(v) ? NaN : v instanceof Date ? v.getTime() : v));
    return vals;
  }

  /* ---------- number formatting like pandas ---------- */
  function fmtFloatsPandas(vals) {
    const fin = vals.filter((v) => typeof v === 'number' && isFinite(v));
    const small = fin.some((v) => v !== 0 && Math.abs(v) < 1e-6);
    const large = fin.some((v) => Math.abs(v) >= 1e16);
    if (small || large) return vals.map((v) => (Number.isNaN(v) ? 'NaN' : !isFinite(v) ? (v > 0 ? 'inf' : '-inf') : v.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2')));
    let strs = vals.map((v) => (Number.isNaN(v) ? null : !isFinite(v) ? (v > 0 ? 'inf' : '-inf') : pyFixed(v, 6)));
    const trimmable = () => strs.every((s) => s === null || !s.includes('.') || (s.endsWith('0') && !s.endsWith('.0')));
    let guard = 0;
    while (strs.some((s) => s && s.includes('.')) && trimmable() && guard++ < 6) strs = strs.map((s) => (s && s.includes('.') ? s.slice(0, -1) : s));
    return strs.map((s) => (s === null ? 'NaN' : s === '-0.0' ? '0.0' : s));
  }
  function fmtDate(ms, withTime) {
    if (Number.isNaN(ms)) return 'NaT';
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    const s = d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
    return withTime ? s + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) : s;
  }
  /* a pandas Timestamp in microseconds (describe() of a date column): prints 2026-03-15 12:10:26.086956 */
  class PyTimestamp {
    constructor(us) { this.us = us; }
    pyType() { return 'Timestamp'; }
    __str__() {
      if (Number.isNaN(this.us)) return 'NaT';
      const ms = Math.floor(this.us / 1000), frac = this.us - ms * 1000, d = new Date(ms), p = (n, k = 2) => String(n).padStart(k, '0');
      const micro = d.getUTCMilliseconds() * 1000 + frac;
      return fmtDate(ms, true) + (micro ? '.' + p(micro, 6) : '');
    }
    __repr__() { return Number.isNaN(this.us) ? 'NaT' : `Timestamp('${this.__str__()}')`; }
  }
  PB.PyTimestamp = PyTimestamp;
  /* count, mean, min, 25%, 50%, 75%, max of dates stored in ms: pandas works in microseconds, sums as float64
     (pairwise) and truncates the mean and the interpolated quantiles to whole microseconds */
  function dateDescribe(vals) {
    const us = vals.filter((v) => !isMissing(v)).map((v) => v * 1000), n = us.length;
    if (!n) return [0].concat(Array(6).fill(new PyTimestamp(NaN)));
    const sorted = us.slice().sort((a, b) => a - b), ts = (x) => new PyTimestamp(Math.trunc(x));
    return [n, ts(PB.npSum(us) / n), ts(sorted[0]), ts(quantileSorted(sorted, 0.25)), ts(quantileSorted(sorted, 0.5)), ts(quantileSorted(sorted, 0.75)), ts(sorted[n - 1])];
  }
  function formatValues(vals, dtype) {
    if (dtype === 'float64') return fmtFloatsPandas(vals);
    if (dtype === 'int64') return vals.map((v) => (Number.isNaN(v) ? 'NaN' : String(v)));
    if (dtype === 'bool') return vals.map((v) => (v ? 'True' : 'False'));
    if (dtype === 'datetime64[ns]') {
      const withTime = vals.some((v) => !Number.isNaN(v) && v % 86400000 !== 0);
      return vals.map((v) => fmtDate(v, withTime));
    }
    return vals.map((v) => (v === null || v === undefined ? 'NaN' : typeof v === 'boolean' ? (v ? 'True' : 'False') : typeof v === 'number' ? (Number.isNaN(v) ? 'NaN' : PB.numStr(v)) : pprintThing(v, false, 0)));
  }
  /* pandas.io.formats.printing.pprint_thing for cells of object columns:
     lists print as [a, b] (strings unquoted), dicts always quote their strings {'k': 'v'} */
  function pprintThing(v, quote, lvl) {
    if (v === null || v === undefined) return 'None';
    if (typeof v === 'string') return quote ? "'" + v.replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + "'" : v;
    if (typeof v === 'number') return Number.isNaN(v) ? 'nan' : PB.numStr(v);
    if (typeof v === 'boolean') return v ? 'True' : 'False';
    if (v instanceof PB.PyFloat) return PB.floatRepr(v.v);
    if (lvl < 3 && v instanceof Map) return '{' + Array.from(v.entries()).map(([k, x]) => pprintThing(k, true, lvl + 1) + ': ' + pprintThing(x, true, lvl + 1)).join(', ') + '}';
    if (lvl < 3 && (Array.isArray(v) || v instanceof PB.Tuple)) {
      const items = Array.isArray(v) ? v : v.items, max = 100;
      let body = items.slice(0, max).map((x) => pprintThing(x, quote, lvl + 1)).join(', ');
      if (items.length > max) body += ', ...';
      return Array.isArray(v) ? '[' + body + ']' : items.length === 1 ? '(' + body + ',)' : '(' + body + ')';
    }
    return PB.str(v);
  }
  PB.pprintThing = pprintThing;
  PB.formatValues = formatValues;
  PB.fmtDate = fmtDate;

  /* ---------- statistics helpers (skip NaN like pandas) ---------- */
  const valid = (vals) => vals.filter((v) => !isMissing(v)).map((v) => (typeof v === 'boolean' ? +v : v));
  /* numpy's linear quantile: pandas passes q * 100 to np.percentile, which divides by 100 again;
     the interpolation is numpy's _lerp (from the upper value when the fraction is >= 0.5) */
  function quantileSorted(sorted, q) {
    const n = sorted.length;
    if (!n) return NaN;
    const vi = (n - 1) * ((q * 100) / 100);
    const lo = Math.min(n - 1, Math.max(0, Math.floor(vi))), hi = Math.min(n - 1, lo + 1);
    const t = vi - lo, a = sorted[lo], b = sorted[hi], d = b - a;
    return t >= 0.5 ? b - d * (1 - t) : a + d * t;
  }
  /* pandas reductions (nanops): missing values become 0 and numpy sums the whole array pairwise */
  const zeroFilled = (v) => v.map((x) => (isMissing(x) ? 0 : typeof x === 'boolean' ? +x : x));
  const S = {
    sum: (v) => PB.npSum(zeroFilled(v)),
    count: (v) => valid(v).length,
    mean: (v) => { const c = S.count(v); return c ? PB.npSum(zeroFilled(v)) / c : NaN; },
    /* nanops.nanvar: two-pass, (avg - x) ** 2 summed over the zero-filled array */
    var: (v, ddof = 1) => {
      const c = S.count(v), d = c - ddof;
      if (d <= 0) return NaN;
      const z = zeroFilled(v), avg = PB.npSum(z) / c;
      return PB.npSum(z.map((x, i) => { if (isMissing(v[i])) return 0; const e = avg - x; return e * e; })) / d;
    },
    std: (v, ddof = 1) => Math.sqrt(S.var(v, ddof)),
    min: (v) => { const a = valid(v); if (!a.length) return NaN; let m = a[0]; for (const x of a) if (PB.cmpPy(x, m) < 0) m = x; return m; },
    max: (v) => { const a = valid(v); if (!a.length) return NaN; let m = a[0]; for (const x of a) if (PB.cmpPy(x, m) > 0) m = x; return m; },
    /* np.median: the middle value, or the mean of the two middle values */
    median: (v) => { const a = valid(v).sort((x, y) => x - y), n = a.length; if (!n) return NaN; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; },
    quantile: (v, q) => quantileSorted(valid(v).sort((a, b) => a - b), q),
  };
  PB.quantileSorted = quantileSorted;
  PB.stats = S;

  function checkNumeric(name, dtype, op) {
    if (!isNumericDtype(dtype) && dtype !== 'datetime64[ns]') {
      throw PB.err('TypeError', `could not convert column '${name}' (dtype ${dtype}) to numeric for ${op}()`,
        TR`คอลัมน์ '${name}' เป็นข้อความ จึงคำนวณ ${op}() ไม่ได้`, TR('เลือกคอลัมน์ที่เป็นตัวเลข หรือแปลงชนิดข้อมูลก่อน'));
    }
  }

  /* ---------- Python str methods ---------- */
  /* str.strip(): Python's whitespace set (str.isspace) */
  const PY_STRIP = /^[\t\n\x0b\x0c\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\x0b\x0c\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g;
  const pyStrip = (s) => s.replace(PY_STRIP, '');
  /* str.title(): a cased character after an uncased one is upper-cased, the others lower-cased
     ("gOLD" -> "Gold", "a1b" -> "A1B"); Thai has no case so it is unchanged */
  const isCased = (ch) => ch.toLowerCase() !== ch.toUpperCase();
  function pyTitle(s) {
    let out = '', prev = false;
    for (const ch of s) {
      if (isCased(ch)) { if (prev) out += ch.toLowerCase(); else { const u = ch.toUpperCase(); out += u.length > 1 ? u[0] + u.slice(1).toLowerCase() : u; } prev = true; }
      else { out += ch; prev = false; }
    }
    return out;
  }
  PB.pyStrip = pyStrip; PB.pyTitle = pyTitle;

  /* ---------- did-you-mean ---------- */
  function lev(a, b) {
    const m = a.length, n = b.length; const d = PB.range(n + 1);
    for (let i = 1; i <= m; i++) { let prev = d[0]; d[0] = i; for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
    return d[n];
  }
  PB.suggest = (name, options) => {
    let best = null, bd = Infinity;
    for (const o of options) { const dd = lev(String(name).toLowerCase(), String(o).toLowerCase()); if (dd < bd) { bd = dd; best = o; } }
    return bd <= Math.max(2, Math.floor(String(name).length / 3)) ? best : null;
  };
  function keyError(name, cols) {
    const sug = PB.suggest(name, cols);
    return PB.err('KeyError', PB.repr(name), TR`ไม่พบคอลัมน์ '${name}'` + (sug ? TR` (หมายถึง '${sug}' หรือเปล่า?)` : ''),
      TR('คอลัมน์ที่มี: ') + cols.slice(0, 25).join(', ') + (cols.length > 25 ? ' …' : ''));
  }
  PB.keyError = keyError;

  /* ======================================================================
     Series
     ====================================================================== */
  class Series {
    constructor(values, opts = {}) {
      this.dtype = opts.dtype || inferDtype(values);
      this.values = normalizeValues(values, this.dtype);
      this.index = opts.index || PB.range(values.length);
      this.name = opts.name === undefined ? null : opts.name;
      this.indexName = opts.indexName || null;
      this.indexDtype = opts.indexDtype || null;
    }
    pyType() { return 'Series'; }
    get length() { return this.values.length; }
    get shape() { return new PB.Tuple([this.values.length]); }
    _new(values, opts = {}) {
      return new Series(values, Object.assign({ index: this.index, name: this.name, indexName: this.indexName, indexDtype: this.indexDtype }, opts));
    }
    _num(op) { checkNumeric(this.name ?? 'Series', this.dtype, op); return this.values; }
    head(n = 5) { return this.iloc(PB.range(Math.min(n, this.length))); }
    tail(n = 5) { const L = this.length; return this.iloc(PB.range(Math.min(n, L)).map((i) => L - Math.min(n, L) + i)); }
    iloc(pos) { return this._new(pos.map((i) => this.values[i]), { index: pos.map((i) => this.index[i]), dtype: this.dtype }); }
    mean() { return S.mean(this._num('mean')); }
    median() { return S.median(this._num('median')); }
    sum() { if (this.dtype === 'object') return valid(this.values).join(''); return S.sum(this._num('sum')); }
    min() { return S.min(this.values); }
    max() { return S.max(this.values); }
    std() { return S.std(this._num('std')); }
    var() { return S.var(this._num('var')); }
    count() { return S.count(this.values); }
    nunique() { return new Set(valid(this.values).map(PB.keyOf)).size; }
    unique() {
      const seen = new Set(), out = [];
      for (const v of this.values) { const k = isMissing(v) ? 'nan' : PB.keyOf(v); if (!seen.has(k)) { seen.add(k); out.push(v); } }
      return new NDArray(out, [out.length], this.dtype === 'object' ? 'object' : this.dtype);
    }
    quantile(q = 0.5) { return S.quantile(this._num('quantile'), q); }
    mode() {
      const cnt = new Map();
      for (const v of valid(this.values)) { const k = PB.keyOf(v); const e = cnt.get(k); if (e) e[1]++; else cnt.set(k, [v, 1]); }
      let best = 0; for (const [, c] of cnt.values()) best = Math.max(best, c);
      const modes = Array.from(cnt.values()).filter((e) => e[1] === best).map((e) => e[0]).sort(PB.cmpPy);
      return new Series(modes, { dtype: this.dtype, name: this.name });
    }
    value_counts(normalize = false) {
      const cnt = new Map();
      for (const v of this.values) { if (isMissing(v)) continue; const k = PB.keyOf(v); const e = cnt.get(k); if (e) e[1]++; else cnt.set(k, [v, 1]); }
      const entries = Array.from(cnt.values());
      const order = PB.argsortStable(entries, (a, b) => b[1] - a[1]);
      const total = entries.reduce((s, e) => s + e[1], 0);
      const vals = order.map((i) => (normalize ? entries[i][1] / total : entries[i][1]));
      return new Series(vals, { index: order.map((i) => entries[i][0]), name: normalize ? 'proportion' : 'count', indexName: this.name, dtype: normalize ? 'float64' : 'int64', indexDtype: this.dtype });
    }
    /* one row per list item (index repeated); an empty list becomes NaN, scalars stay */
    explode() {
      const vals = [], idx = [];
      this.values.forEach((v, i) => {
        const items = Array.isArray(v) ? v : v instanceof PB.Tuple ? v.items : null;
        if (!items) { vals.push(v); idx.push(this.index[i]); return; }
        if (!items.length) { vals.push(null); idx.push(this.index[i]); return; }
        for (const x of items) { vals.push(PB.unbox(x)); idx.push(this.index[i]); }
      });
      return this._new(vals, { index: idx, dtype: 'object' });
    }
    isnull() { return this._new(this.values.map(isMissing), { dtype: 'bool' }); }
    notnull() { return this._new(this.values.map((v) => !isMissing(v)), { dtype: 'bool' }); }
    nullCount() { return this.values.filter(isMissing).length; }
    fillna(value) {
      if (value instanceof Series) value = value.values[0];
      value = PB.unbox(value);
      if (!this.values.some(isMissing)) return this._new(this.values.slice(), { dtype: this.dtype });
      const vals = this.values.map((v) => (isMissing(v) ? value : v));
      return this._new(vals, { dtype: fillDtype(this.dtype, value, vals) });
    }
    dropna() { const pos = []; this.values.forEach((v, i) => { if (!isMissing(v)) pos.push(i); }); return this.iloc(pos); }
    astype(t) {
      const name = this.name;
      const conv = (v) => {
        if (isMissing(v)) {
          if (t === 'int' || t === 'int64') throw PB.err('ValueError', 'Cannot convert non-finite values (NA or inf) to integer', TR`คอลัมน์ '${name}' มีค่าว่าง แปลงเป็น int ไม่ได้`, TR('เติมค่าว่างด้วย fillna ก่อน'));
          return t === 'str' ? 'nan' : v;
        }
        if (t === 'float' || t === 'float64') {
          if (typeof v === 'boolean') return +v;
          const x = typeof v === 'number' ? v : Number(String(v).trim());
          if (String(v).trim() === '' || Number.isNaN(x)) throw PB.err('ValueError', `could not convert string to float: ${PB.repr(v)}`, TR`แปลง ${PB.repr(v)} เป็นตัวเลขไม่ได้`);
          return x;
        }
        if (t === 'int' || t === 'int64') {
          if (typeof v === 'boolean') return +v;
          const x = typeof v === 'number' ? v : Number(String(v).trim());
          if (Number.isNaN(x)) throw PB.err('ValueError', `invalid literal for int() with base 10: ${PB.repr(v)}`, TR`แปลง ${PB.repr(v)} เป็นจำนวนเต็มไม่ได้`);
          return Math.trunc(x);
        }
        if (t === 'str') return typeof v === 'number' ? PB.numStr(v) : typeof v === 'boolean' ? (v ? 'True' : 'False') : String(v);
        if (t === 'bool') return !!v;
        return v;
      };
      const dt = { float: 'float64', float64: 'float64', int: 'int64', int64: 'int64', str: 'object', bool: 'bool', category: 'object' }[t] || 'object';
      return this._new(this.values.map(conv), { dtype: dt === 'int64' ? 'int64' : dt });
    }
    round(n = 0) { const f = Math.pow(10, n); return this._new(this._num('round').map((v) => roundHalfEven(v * f) / f), { dtype: n > 0 || this.dtype === 'float64' ? 'float64' : this.dtype }); }
    abs() { return this._new(this._num('abs').map((v) => Math.abs(v))); }
    cumsum() { let s = 0; return this._new(this._num('cumsum').map((v) => (isMissing(v) ? NaN : (s += v)))); }
    shift(n = 1) { const L = this.length; return this._new(PB.range(L).map((i) => (i - n >= 0 && i - n < L ? this.values[i - n] : NaN)), { dtype: 'float64' }); }
    diff(n = 1) { const v = this._num('diff'); return this._new(v.map((x, i) => (i - n >= 0 ? x - v[i - n] : NaN)), { dtype: 'float64' }); }
    pct_change(n = 1) { const v = this._num('pct_change'); return this._new(v.map((x, i) => (i - n >= 0 ? x / v[i - n] - 1 : NaN)), { dtype: 'float64' }); }
    rolling(w, opts) { return new Rolling(this, w, opts); }
    log1p() { return this._new(this._num('log1p').map((v) => Math.log1p(v)), { dtype: 'float64' }); }
    map(dict) { return this._new(this.values.map((v) => (dict.has(PB.keyOf(v)) ? dict.get(PB.keyOf(v)) : NaN))); }
    tolist() { return this.values.slice(); }
    to_numpy() { return new NDArray(this.values.slice(), [this.length], this.dtype); }
    idxmax() { let b = -1; this.values.forEach((v, i) => { if (!isMissing(v) && (b < 0 || v > this.values[b])) b = i; }); return this.index[b]; }
    idxmin() { let b = -1; this.values.forEach((v, i) => { if (!isMissing(v) && (b < 0 || v < this.values[b])) b = i; }); return this.index[b]; }
    sort_values(ascending = true) {
      const order = PB.argsortStable(this.values, (a, b) => { if (isMissing(a)) return isMissing(b) ? 0 : 1; if (isMissing(b)) return -1; return ascending ? PB.cmpPy(a, b) : PB.cmpPy(b, a); });
      return this.iloc(order);
    }
    sort_index() { return this.iloc(PB.argsortStable(this.index, PB.cmpPy)); }
    describe() {
      if (isNumericDtype(this.dtype)) {
        /* mean and std in row order (summation order matters in the last digits), quantiles on the sorted values */
        const a = valid(this.values).sort((x, y) => x - y);
        return new Series([a.length, S.mean(this.values), S.std(this.values), a[0] ?? NaN, quantileSorted(a, 0.25), quantileSorted(a, 0.5), quantileSorted(a, 0.75), a[a.length - 1] ?? NaN],
          { index: ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'], name: this.name, dtype: 'float64' });
      }
      const vc = this.value_counts();
      return new Series([this.count(), vc.length, vc.index[0] ?? null, vc.values[0] ?? NaN], { index: ['count', 'unique', 'top', 'freq'], name: this.name, dtype: 'object' });
    }
    corr(other) { return pearson(this._num('corr'), other._num('corr')); }
    /* elementwise ops */
    _binary(other, fn, outDtype) {
      let ov;
      if (other instanceof Series) {
        if (other.length !== this.length) throw PB.err('ValueError', 'operands could not be broadcast together', TR('จำนวนแถวของสองคอลัมน์ไม่เท่ากัน'));
        ov = other.values;
      } else if (other instanceof NDArray) { ov = other.data; }
      const vals = this.values.map((v, i) => fn(v, ov ? ov[i] : other));
      return this._new(vals, { name: other instanceof Series && other.name !== this.name ? null : this.name, dtype: outDtype || inferDtype(vals) });
    }
    /* result dtype like pandas: "/" is always float64, and a float column or a float operand
       (5.0 included, passed as PyFloat or otherFloat) keeps the result float64 even when whole */
    arith(op, other, otherFloat = false) {
      const f = ARITH[op];
      if (!f) throw PB.err('ValueError', 'unknown operator ' + op);
      if (other instanceof PB.PyFloat) { other = other.v; otherFloat = true; }
      const strCat = op === '+' && this.dtype === 'object';
      const isF = (o) => (o instanceof Series || o instanceof NDArray ? o.dtype === 'float64' : typeof o === 'number' && !Number.isInteger(o));
      const outDt = strCat ? undefined : op === '/' || this.dtype === 'float64' || otherFloat || isF(other) ? 'float64' : undefined;
      return this._binary(other, (a, b) => {
        if (strCat) return isMissing(a) || isMissing(b) ? null : String(a) + String(b);
        if (isMissing(a) || isMissing(b)) return NaN;
        if (typeof a === 'string' || typeof b === 'string') throw PB.err('TypeError', `unsupported operand type(s) for ${op}: 'str' and '${PB.typeName(b)}'`, TR`คำนวณ ${op} กับข้อความไม่ได้`, TR('ตรวจสอบว่าเลือกคอลัมน์ที่เป็นตัวเลข'));
        return f(+a, +b);
      }, outDt);
    }
    compare(op, other) {
      const f = CMP[op];
      return this._binary(other, (a, b) => (isMissing(a) ? op === '!=' : f(a, b)), 'bool');
    }
    _strCheck() { if (this.dtype !== 'object') throw PB.err('AttributeError', 'Can only use .str accessor with string values!', TR`.str ใช้ได้กับคอลัมน์ข้อความเท่านั้น แต่คอลัมน์ ${this.name ?? ''} เป็น ${this.dtype}`, TR('ถ้าเป็นตัวเลขอยู่แล้วไม่ต้องทำความสะอาดข้อความ หรือแปลงด้วย .astype(str) ก่อน')); }
    /* pandas .str methods: values that are not strings (numbers, booleans, missing) become NaN */
    str_op(op) {
      this._strCheck();
      const fns = { lower: (s) => s.toLowerCase(), upper: (s) => s.toUpperCase(), strip: pyStrip, len: (s) => Array.from(s).length, title: pyTitle };
      const vals = this.values.map((v) => (typeof v === 'string' ? fns[op](v) : op === 'len' ? NaN : null));
      return this._new(vals, { dtype: op === 'len' ? inferDtype(vals) : 'object' });
    }
    /* .str.replace(pat, repl, regex=False): every occurrence, like Python's str.replace */
    str_replace(pat, repl) {
      this._strCheck();
      pat = String(pat); repl = String(repl);
      const one = (s) => (pat === '' ? repl + Array.from(s).join(repl) + repl : s.split(pat).join(repl));
      return this._new(this.values.map((v) => (typeof v === 'string' ? one(v) : null)), { dtype: 'object' });
    }
    str_contains(pat) {
      if (this.dtype !== 'object') throw PB.err('AttributeError', 'Can only use .str accessor with string values!', TR('.str ใช้ได้กับคอลัมน์ข้อความเท่านั้น'));
      return this._new(this.values.map((v) => (v === null ? false : String(v).includes(String(pat)))), { dtype: 'bool' });
    }
    dt(part) {
      if (this.dtype !== 'datetime64[ns]') throw PB.err('AttributeError', 'Can only use .dt accessor with datetimelike values', TR('.dt ใช้ได้กับคอลัมน์วันที่เท่านั้น'), TR('แปลงด้วย pd.to_datetime() ก่อน'));
      const f = { year: (d) => d.getUTCFullYear(), month: (d) => d.getUTCMonth() + 1, day: (d) => d.getUTCDate(), dayofweek: (d) => (d.getUTCDay() + 6) % 7, quarter: (d) => Math.floor(d.getUTCMonth() / 3) + 1 }[part];
      const vals = this.values.map((v) => (Number.isNaN(v) ? NaN : f(new Date(v))));
      return this._new(vals, { dtype: vals.some((v) => Number.isNaN(v)) ? 'float64' : 'int64' });
    }
    __str__() { return seriesText(this); }
    __repr__() { return seriesText(this); }
  }
  const ARITH = { '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '**': (a, b) => Math.pow(a, b), '%': (a, b) => ((a % b) + b) % b, '//': (a, b) => Math.floor(a / b) };
  const CMP = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '<=': (a, b) => a <= b };
  PB.ARITH = ARITH; PB.CMP = CMP;
  function roundHalfEven(x) { const r = Math.round(x); return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r; }
  PB.roundHalfEven = roundHalfEven;
  /* Python's f"{x:.{d}f}" (also pandas / numpy): like toFixed, except that a value lying exactly halfway in binary
     (0.125, 0.625, 2.5 …) rounds to the even digit, where toFixed always rounds it up */
  function pyFixed(x, d) {
    const s = x.toFixed(d);
    if (!isFinite(x) || d > 20) return s;
    const t = Math.abs(x) * Math.pow(10, d);
    if (Math.abs(t - Math.floor(t) - 0.5) > 1e-7 * Math.max(1, t)) return s;
    const ex = Math.abs(x).toFixed(d + 80), dot = ex.indexOf('.');
    if (!/^50*$/.test(ex.slice(dot + 1 + d))) return s;
    const kept = d === 0 ? ex.slice(0, dot) : ex.slice(0, dot + 1 + d);
    if ((kept.charCodeAt(kept.length - 1) - 48) % 2 !== 0) return s;
    return (x < 0 ? '-' : '') + kept;
  }
  PB.pyFixed = pyFixed;
  function pearson(a, b) {
    let n = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) if (!isMissing(a[i]) && !isMissing(b[i])) { n++; sa += +a[i]; sb += +b[i]; }
    if (n < 2) return NaN;
    const ma = sa / n, mb = sb / n; let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < a.length; i++) if (!isMissing(a[i]) && !isMissing(b[i])) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    return sab / Math.sqrt(saa * sbb);
  }
  /* series.rolling(w, center=False, min_periods=w): windows like pandas' FixedWindowIndexer (center=True puts the
     window around the row: rows i-(w-1-o) … i+o with o = (w-1)//2), mean and sum as pandas' roll_mean / roll_sum
     compute them (a running Kahan-compensated sum that adds the new value and removes the old one), so the
     last digits match pandas too (version 3.10) */
  class Rolling {
    constructor(s, w, opts = {}) {
      this.s = s; this.w = w; this.center = !!opts.center;
      this.minp = opts.min_periods === undefined || opts.min_periods === null ? w : opts.min_periods;
    }
    _vals() { return this.s._num('rolling').map((x) => (typeof x === 'boolean' ? +x : isMissing(x) ? NaN : x)); }
    _bounds(n) {
      const w = this.w, off = this.center ? Math.floor((w - 1) / 2) : 0, start = new Array(n), end = new Array(n);
      for (let i = 0; i < n; i++) { end[i] = Math.min(Math.max(i + 1 + off, 0), n); start[i] = Math.min(Math.max(i + 1 + off - w, 0), n); }
      return [start, end];
    }
    _agg(fn) {
      const v = this._vals(), [start, end] = this._bounds(v.length), minp = Math.max(this.minp, 1);
      return this.s._new(v.map((_, i) => { const win = v.slice(start[i], end[i]).filter((x) => !Number.isNaN(x)); return win.length >= minp && win.length ? fn(win) : NaN; }), { dtype: 'float64' });
    }
    /* pandas/_libs/window/aggregations.pyx: roll_mean / roll_sum with add_mean / remove_mean (two compensation
       terms, one for adding and one for removing), the count of negative values and of repeated values */
    _online(kind) {
      const v = this._vals(), n = v.length, [start, end] = this._bounds(n), minp = this.minp, out = new Array(n);
      let sum = 0, compAdd = 0, compRem = 0, nobs = 0, neg = 0, same = 0, prev = NaN;
      const add = (x) => {
        if (x !== x) return;
        nobs++; const y = x - compAdd, t = sum + y; compAdd = t - sum - y; sum = t;
        if (x < 0 || Object.is(x, -0)) neg++;
        if (x === prev) same++; else same = 1;
        prev = x;
      };
      const remove = (x) => {
        if (x !== x) return;
        nobs--; const y = -x - compRem, t = sum + y; compRem = t - sum - y; sum = t;
        if (x < 0 || Object.is(x, -0)) neg--;
      };
      for (let i = 0; i < n; i++) {
        const s = start[i], e = end[i];
        if (i === 0 || s >= end[i - 1]) {
          sum = compAdd = compRem = 0; nobs = neg = 0; prev = v[s]; same = 0;
          for (let j = s; j < e; j++) add(v[j]);
        } else {
          for (let j = start[i - 1]; j < s; j++) remove(v[j]);
          for (let j = end[i - 1]; j < e; j++) add(v[j]);
        }
        if (kind === 'sum') out[i] = nobs === 0 && minp === 0 ? 0 : nobs >= minp ? (same >= nobs ? prev * nobs : sum) : NaN;
        else if (nobs >= minp && nobs > 0) {
          let r = sum / nobs;
          if (same >= nobs) r = prev; else if (neg === 0 && r < 0) r = 0; else if (neg === nobs && r > 0) r = 0;
          out[i] = r;
        } else out[i] = NaN;
      }
      return this.s._new(out, { dtype: 'float64' });
    }
    mean() { return this._online('mean'); }
    sum() { return this._online('sum'); }
    min() { return this._agg((a) => Math.min(...a)); }
    max() { return this._agg((a) => Math.max(...a)); }
    std() { return this._agg((a) => S.std(a)); }
  }

  /* ======================================================================
     DataFrame
     ====================================================================== */
  class DataFrame {
    constructor(colMap, opts = {}) {
      this._data = new Map(); this._dtype = new Map();
      let n = null;
      for (const [name, spec] of colMap) {
        const vals = spec.values || spec, dt = spec.dtype || inferDtype(vals);
        this._data.set(name, normalizeValues(vals, dt)); this._dtype.set(name, dt);
        if (n === null) n = vals.length;
      }
      if (n === null) n = opts.index ? opts.index.length : 0;
      this.index = opts.index || PB.range(n);
      this.indexName = opts.indexName || null;
      this.indexDtype = opts.indexDtype || null;
    }
    pyType() { return 'DataFrame'; }
    static fromColumns(obj, order, opts) { const m = new Map(); for (const k of order || Object.keys(obj)) m.set(k, obj[k]); return new DataFrame(m, opts); }
    static fromRows(rows, columns, opts) {
      const m = new Map();
      columns.forEach((c, j) => m.set(c, { values: rows.map((r) => r[j]) }));
      return new DataFrame(m, opts);
    }
    get columns() { return Array.from(this._data.keys()); }
    get nrows() { return this.index.length; }
    get ncols() { return this._data.size; }
    get shape() { return new PB.Tuple([this.nrows, this.ncols]); }
    has(c) { return this._data.has(c); }
    dtypeOf(c) { return this._dtype.get(c); }
    _need(c) { if (!this._data.has(c)) throw keyError(c, this.columns); }
    col(c) { this._need(c); return new Series(this._data.get(c), { index: this.index, name: c, dtype: this._dtype.get(c), indexName: this.indexName, indexDtype: this.indexDtype }); }
    _clone(cols, rowsPos) {
      const m = new Map();
      for (const c of cols || this.columns) {
        this._need(c);
        const v = this._data.get(c);
        m.set(c, { values: rowsPos ? rowsPos.map((i) => v[i]) : v.slice(), dtype: this._dtype.get(c) });
      }
      return new DataFrame(m, { index: rowsPos ? rowsPos.map((i) => this.index[i]) : this.index.slice(), indexName: this.indexName, indexDtype: this.indexDtype });
    }
    copy() { return this._clone(); }
    select(cols) { return this._clone(cols); }
    drop(cols) { for (const c of cols) this._need(c); const keep = this.columns.filter((c) => !cols.includes(c)); return this._clone(keep); }
    iloc(pos) { return this._clone(null, pos); }
    head(n = 5) { return this.iloc(PB.range(Math.min(n, this.nrows))); }
    tail(n = 5) { const L = this.nrows, k = Math.min(n, L); return this.iloc(PB.range(k).map((i) => L - k + i)); }
    sample(n = 5, randomState = null) {
      if (n > this.nrows) throw PB.err('ValueError', 'Cannot take a larger sample than population when replace=False', TR`สุ่ม ${n} แถวไม่ได้ เพราะมีเพียง ${this.nrows} แถว`);
      return this.iloc(PB.checkRandomState(randomState).choiceNoReplace(this.nrows, n));
    }
    mask(boolSeries) {
      const b = boolSeries instanceof Series ? boolSeries.values : boolSeries;
      if (b.length !== this.nrows) throw PB.err('ValueError', 'Item wrong length', TR('ความยาวของเงื่อนไขไม่เท่ากับจำนวนแถว'));
      const pos = []; b.forEach((x, i) => { if (x) pos.push(i); });
      return this.iloc(pos);
    }
    set(c, value) {
      let vals, dt;
      if (value instanceof Series) {
        if (value.length !== this.nrows) throw PB.err('ValueError', `Length of values (${value.length}) does not match length of index (${this.nrows})`, TR`จำนวนค่า (${value.length}) ไม่เท่ากับจำนวนแถว (${this.nrows})`);
        vals = value.values.slice(); dt = value.dtype;
      } else if (value instanceof NDArray) {
        if (value.shape.length !== 1) throw PB.err('ValueError', 'Expected a 1D array', TR('ต้องเป็นอาร์เรย์ 1 มิติ'));
        if (value.data.length !== this.nrows) throw PB.err('ValueError', `Length of values (${value.data.length}) does not match length of index (${this.nrows})`, TR`จำนวนค่า (${value.data.length}) ไม่เท่ากับจำนวนแถว (${this.nrows})`);
        vals = Array.from(value.data); dt = value.dtype === 'float64' && vals.every((v) => Number.isInteger(v)) && value.intLike ? 'int64' : value.dtype;
      } else if (Array.isArray(value)) {
        if (value.length !== this.nrows) throw PB.err('ValueError', `Length of values (${value.length}) does not match length of index (${this.nrows})`, TR`จำนวนค่า (${value.length}) ไม่เท่ากับจำนวนแถว (${this.nrows})`);
        vals = value.slice(); dt = inferDtype(vals);
      } else { vals = new Array(this.nrows).fill(value); dt = inferDtype(vals.length ? vals : [value]); }
      if (!['int64', 'float64', 'bool', 'object', 'datetime64[ns]'].includes(dt)) dt = inferDtype(vals);
      this._data.set(c, normalizeValues(vals, dt)); this._dtype.set(c, dt);
      return this;
    }
    rename(map) {
      const m = new Map();
      for (const c of this.columns) m.set(map[c] ?? c, { values: this._data.get(c).slice(), dtype: this._dtype.get(c) });
      return new DataFrame(m, { index: this.index.slice(), indexName: this.indexName });
    }
    reset_index(drop = true) {
      const out = this._clone();
      if (!drop) {
        const m = new Map();
        m.set(this.indexName || 'index', { values: this.index.slice(), dtype: this.indexDtype || inferDtype(this.index) });
        for (const [k, v] of out._data) m.set(k, { values: v, dtype: out._dtype.get(k) });
        return new DataFrame(m);
      }
      out.index = PB.range(this.nrows); out.indexName = null; out.indexDtype = null;
      return out;
    }
    set_index(c) {
      this._need(c);
      const out = this.drop([c]);
      out.index = this._data.get(c).slice(); out.indexName = c; out.indexDtype = this._dtype.get(c);
      return out;
    }
    dropna(subset = null) {
      const cols = subset || this.columns; for (const c of cols) this._need(c);
      const pos = [];
      for (let i = 0; i < this.nrows; i++) if (cols.every((c) => !isMissing(this._data.get(c)[i]))) pos.push(i);
      return this.iloc(pos);
    }
    fillna(value) {
      const m = new Map();
      for (const c of this.columns) {
        const v = this._data.get(c);
        const fill = value instanceof Series ? (value.index.includes(c) ? value.values[value.index.indexOf(c)] : undefined) : value;
        if (fill === undefined || !v.some(isMissing)) { m.set(c, { values: v.slice(), dtype: this._dtype.get(c) }); continue; }
        const nv = v.map((x) => (isMissing(x) ? fill : x));
        m.set(c, { values: nv, dtype: fillDtype(this._dtype.get(c), fill, nv) });
      }
      return new DataFrame(m, { index: this.index.slice(), indexName: this.indexName });
    }
    /* duplicated(subset, keep): 'first' marks every repeat after the first copy, 'last' every copy
       before the last one, false marks all copies; missing values count as equal (like pandas) */
    duplicated(subset = null, keep = 'first') {
      const cols = subset && subset.length ? subset : this.columns;
      for (const c of cols) this._need(c);
      const arrs = cols.map((c) => this._data.get(c)), n = this.nrows;
      const keys = PB.range(n).map((i) => arrs.map((a) => PB.keyOf(a[i])).join('\u0001'));
      const out = new Array(n).fill(false);
      if (keep === false) { const cnt = new Map(); keys.forEach((k) => cnt.set(k, (cnt.get(k) || 0) + 1)); keys.forEach((k, i) => { out[i] = cnt.get(k) > 1; }); }
      else { const seen = new Set(); for (const i of keep === 'last' ? PB.range(n).reverse() : PB.range(n)) { if (seen.has(keys[i])) out[i] = true; else seen.add(keys[i]); } }
      return new Series(out, { index: this.index.slice(), dtype: 'bool', indexName: this.indexName, indexDtype: this.indexDtype });
    }
    drop_duplicates(subset = null, keep = 'first') { const d = this.duplicated(subset, keep).values; return this.iloc(PB.range(this.nrows).filter((i) => !d[i])); }
    duplicatedCount() { return this.duplicated().values.filter(Boolean).length; }
    /* df.isnull().any(axis=1): rows with at least one missing value */
    rowHasNull() { const arrs = this.columns.map((c) => this._data.get(c)); return new Series(PB.range(this.nrows).map((i) => arrs.some((a) => isMissing(a[i]))), { index: this.index.slice(), dtype: 'bool', indexName: this.indexName, indexDtype: this.indexDtype }); }
    sort_values(by, ascending = true) {
      this._need(by);
      const v = this._data.get(by);
      const order = PB.argsortStable(v, (a, b) => { if (isMissing(a)) return isMissing(b) ? 0 : 1; if (isMissing(b)) return -1; return ascending ? PB.cmpPy(a, b) : PB.cmpPy(b, a); });
      return this.iloc(order);
    }
    nullCounts() {
      return new Series(this.columns.map((c) => this._data.get(c).filter(isMissing).length), { index: this.columns, dtype: 'int64' });
    }
    nunique() { return new Series(this.columns.map((c) => this.col(c).nunique()), { index: this.columns, dtype: 'int64' }); }
    dtypesSeries() { return new Series(this.columns.map((c) => dtypeLabel(this._dtype.get(c))), { index: this.columns, dtype: 'object' }); }
    numericColumns() { return this.columns.filter((c) => isNumericDtype(this._dtype.get(c))); }
    reduce(fn, numericOnly = true) {
      const cols = numericOnly ? this.numericColumns().filter((c) => this._dtype.get(c) !== 'bool' || true) : this.columns;
      if (!numericOnly) for (const c of cols) checkNumeric(c, this._dtype.get(c), fn);
      const vals = cols.map((c) => this.col(c)[fn]());
      return new Series(vals, { index: cols, dtype: 'float64' });
    }
    describe() {
      const num = this.numericColumns().filter((c) => this._dtype.get(c) !== 'bool');
      const dates = this.columns.filter((c) => this._dtype.get(c) === 'datetime64[ns]');
      if (dates.length) {
        /* pandas 3 describes date columns too: count, mean, min, quartiles, max (std only for the numbers, last) */
        const idx = ['count', 'mean', 'min', '25%', '50%', '75%', 'max'].concat(num.length ? ['std'] : []);
        const m = new Map();
        for (const c of this.columns) {
          if (num.includes(c)) { const d = this.col(c).describe().values; m.set(c, { values: [d[0], d[1], d[3], d[4], d[5], d[6], d[7], d[2]], dtype: 'float64' }); }
          else if (dates.includes(c)) m.set(c, { values: dateDescribe(this._data.get(c)).concat(num.length ? [NaN] : []), dtype: 'object' });
        }
        return new DataFrame(m, { index: idx });
      }
      if (num.length) {
        const m = new Map();
        for (const c of num) m.set(c, { values: this.col(c).describe().values, dtype: 'float64' });
        return new DataFrame(m, { index: ['count', 'mean', 'std', 'min', '25%', '50%', '75%', 'max'] });
      }
      const m = new Map();
      for (const c of this.columns) m.set(c, { values: this.col(c).describe().values, dtype: 'object' });
      return new DataFrame(m, { index: ['count', 'unique', 'top', 'freq'] });
    }
    corr() {
      const num = this.numericColumns();
      const m = new Map();
      for (const a of num) m.set(a, { values: num.map((b) => (a === b ? 1 : pearson(this._data.get(a).map(Number), this._data.get(b).map(Number)))), dtype: 'float64' });
      return new DataFrame(m, { index: num.slice() });
    }
    info() {
      const rows = this.columns.map((c, i) => ({ i, name: c, nonNull: this._data.get(c).filter((v) => !isMissing(v)).length, dtype: dtypeLabel(this._dtype.get(c)) }));
      const counts = {}; for (const r of rows) counts[r.dtype] = (counts[r.dtype] || 0) + 1;
      const mem = this.nrows * this.ncols * 8 + this.nrows * 8;
      return new InfoResult(this, rows, counts, mem);
    }
    groupby(by) { this._need(by); return new GroupBy(this, by); }
    toCSV() {
      const esc = (s) => (/[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
      const cols = this.columns;
      const fmt = cols.map((c) => {
        const dt = this._dtype.get(c), v = this._data.get(c);
        return v.map((x) => (isMissing(x) ? '' : dt === 'datetime64[ns]' ? fmtDate(x) : typeof x === 'boolean' ? (x ? 'True' : 'False') : typeof x === 'number' ? (dt === 'float64' ? PB.floatRepr(x) : String(x)) : String(x)));
      });
      const lines = [cols.map(esc).join(',')];
      for (let i = 0; i < this.nrows; i++) lines.push(cols.map((c, j) => esc(fmt[j][i])).join(','));
      return lines.join('\n') + '\n';
    }
    /* numeric matrix for models */
    toMatrix(context, allowNaN = false) {
      const cols = this.columns;
      for (const c of cols) {
        const dt = this._dtype.get(c);
        if (!isNumericDtype(dt)) {
          const vals = this._data.get(c).filter((v) => !isMissing(v)), ex = vals[0];
          /* numbers kept as text ("1,250", "฿980", "12 บาท") need pd.to_numeric, not dummies */
          const numLike = vals.length > 0 && vals.filter((v) => typeof v === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v.replace(/[,\s฿$€£%]|บาท/g, ''))).length >= 0.8 * vals.length;
          if (numLike) {
            const bad = vals.find((v) => !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(String(v).trim())) ?? ex;
            throw PB.err('ValueError', `could not convert string to float: ${PB.repr(ex)}`,
              TR`คอลัมน์ '${c}' เป็นตัวเลขที่เก็บเป็นข้อความ (${dt}) เช่น ${PB.repr(bad)} จึงคำนวณไม่ได้`,
              TR`ใช้บล็อก แปลงเป็นตัวเลข pd.to_numeric(df['${c}'], errors="coerce") (หมวด ทำความสะอาด & ปรับสเกล) เลือกแบบตัด , ฿ บาท ออกก่อน แล้วเติมค่าว่าง`);
          }
          throw PB.err('ValueError', `could not convert string to float: ${PB.repr(ex)}`,
            TR`คอลัมน์ '${c}' เป็นข้อความ (${dt}) โมเดลต้องการตัวเลขทั้งหมด`,
            TR`ใช้บล็อก pd.get_dummies หรือ LabelEncoder แปลงคอลัมน์ '${c}' เป็นตัวเลข หรือ drop คอลัมน์นี้ออก` + (context ? ` (${context})` : ''));
        }
        if (!allowNaN && this._data.get(c).some(isMissing)) {
          throw PB.err('ValueError', 'Input X contains NaN.', TR`คอลัมน์ '${c}' มีค่าว่าง (NaN) โมเดลรับค่าว่างไม่ได้`, TR`ใช้บล็อก dropna() หรือ fillna() จัดการค่าว่างในคอลัมน์ '${c}' ก่อน`);
        }
      }
      const n = this.nrows, p = cols.length, rows = new Array(n);
      const arrs = cols.map((c) => this._data.get(c));
      for (let i = 0; i < n; i++) { const r = new Float64Array(p); for (let j = 0; j < p; j++) { const v = arrs[j][i]; r[j] = typeof v === 'boolean' ? +v : v; } rows[i] = r; }
      return rows;
    }
    __str__() { return frameText(this); }
    __repr__() { return frameText(this); }
  }

  class GroupBy {
    constructor(df, by) { this.df = df; this.by = by; }
    _groups() {
      const keys = this.df._data.get(this.by), groups = new Map();
      keys.forEach((k, i) => { if (isMissing(k)) return; const kk = PB.keyOf(k); if (!groups.has(kk)) groups.set(kk, { key: k, pos: [] }); groups.get(kk).pos.push(i); });
      return Array.from(groups.values()).sort((a, b) => PB.cmpPy(a.key, b.key));
    }
    agg(col, fn) {
      const g = this._groups();
      const keyDtype = this.df._dtype.get(this.by);
      if (col === null) {
        const cols = this.df.numericColumns().filter((c) => c !== this.by);
        if (fn !== 'count' && fn !== 'size' && !cols.length) throw PB.err('TypeError', 'no numeric columns to aggregate', TR('ไม่มีคอลัมน์ตัวเลขให้สรุป'));
        const useCols = fn === 'count' ? this.df.columns.filter((c) => c !== this.by) : cols;
        const m = new Map();
        for (const c of useCols) {
          const v = this.df._data.get(c);
          m.set(c, { values: g.map((gr) => aggOne(gr.pos.map((i) => v[i]), fn, c)), dtype: aggDtype(fn, this.df._dtype.get(c)) });
        }
        return new DataFrame(m, { index: g.map((gr) => gr.key), indexName: this.by, indexDtype: keyDtype });
      }
      this.df._need(col);
      const v = this.df._data.get(col);
      if (fn !== 'count' && fn !== 'nunique') checkNumeric(col, this.df._dtype.get(col), fn);
      const vals = g.map((gr) => aggOne(gr.pos.map((i) => v[i]), fn, col));
      return new Series(vals, { index: g.map((gr) => gr.key), name: col, indexName: this.by, indexDtype: keyDtype, dtype: aggDtype(fn, this.df._dtype.get(col), vals) });
    }
    size() { const g = this._groups(); return new Series(g.map((gr) => gr.pos.length), { index: g.map((gr) => gr.key), indexName: this.by, dtype: 'int64' }); }
  }
  /* pandas' cython groupby kernels: Kahan-compensated sums (group_sum / group_mean) and Welford's
     online variance (group_var, std = its square root) */
  function kahan(a) { let sum = 0, comp = 0; for (const v of a) { const y = v - comp, t = sum + y; comp = t - sum - y; if (Number.isNaN(comp)) comp = 0; sum = t; } return sum; }
  function welfordStd(a, ddof = 1) { let n = 0, mean = 0, m2 = 0; for (const x of a) { n++; const old = mean; mean += (x - old) / n; m2 += (x - mean) * (x - old); } return n <= ddof ? NaN : Math.sqrt(m2 / (n - ddof)); }
  /* result dtype of a groupby aggregation: mean / median / std are float64, sum / min / max keep an
     int64 or float64 column's dtype (a bool sum counts as int64), count / nunique are int64 */
  function aggDtype(fn, src, vals) {
    if (fn === 'count' || fn === 'nunique') return 'int64';
    if (fn === 'mean' || fn === 'median' || fn === 'std') return 'float64';
    if (src === 'int64' || src === 'float64') return src;
    if (src === 'bool') return fn === 'sum' ? 'int64' : 'bool';
    return vals ? inferDtype(vals) : 'float64';
  }
  function aggOne(vals, fn, col) {
    const a = () => valid(vals);
    switch (fn) {
      case 'mean': { const v = a(); return v.length ? kahan(v) / v.length : NaN; } case 'sum': return kahan(a()); case 'count': return S.count(vals);
      case 'min': return S.min(vals); case 'max': return S.max(vals); case 'median': return S.median(vals);
      case 'std': return welfordStd(a()); case 'nunique': return new Set(valid(vals).map(PB.keyOf)).size;
      default: throw PB.err('ValueError', 'unknown aggregation ' + fn);
    }
  }

  class InfoResult {
    constructor(df, rows, counts, mem) { this.df = df; this.rows = rows; this.counts = counts; this.mem = mem; }
    pyType() { return 'NoneType'; }
    __str__() {
      const df = this.df, w = Math.max(6, ...this.rows.map((r) => r.name.length));
      const L = ["<class 'pandas.core.frame.DataFrame'>",
        `RangeIndex: ${df.nrows} entries, 0 to ${Math.max(0, df.nrows - 1)}`,
        `Data columns (total ${df.ncols} columns):`,
        ` #   ${'Column'.padEnd(w)}  Non-Null Count  Dtype  `,
        `---  ${'------'.padEnd(w)}  --------------  -----  `];
      for (const r of this.rows) L.push(` ${String(r.i).padEnd(3)} ${r.name.padEnd(w)}  ${(r.nonNull + ' non-null').padEnd(14)}  ${r.dtype}`);
      L.push('dtypes: ' + Object.keys(this.counts).sort().map((k) => `${k}(${this.counts[k]})`).join(', '));
      L.push('memory usage: ' + pyFixed(this.mem / 1024, 1) + '+ KB');
      return L.join('\n');
    }
  }

  /* ---------- pandas functions ---------- */
  function getDummies(df, columns, dropFirst = false) {
    let enc = columns;
    if (!enc || !enc.length) enc = df.columns.filter((c) => df._dtype.get(c) === 'object');
    for (const c of enc) df._need(c);
    const m = new Map();
    const encodeAll = enc.length === df.ncols;
    if (!encodeAll) for (const c of df.columns) if (!enc.includes(c)) m.set(c, { values: df._data.get(c).slice(), dtype: df._dtype.get(c) });
    for (const c of enc) {
      const v = df._data.get(c);
      let levels = PB.uniqueSorted(v.filter((x) => !isMissing(x)));
      if (dropFirst) levels = levels.slice(1);
      for (const lv of levels) {
        const name = c + '_' + (typeof lv === 'boolean' ? (lv ? 'True' : 'False') : typeof lv === 'number' ? PB.numStr(lv) : String(lv));
        m.set(name, { values: v.map((x) => !isMissing(x) && PB.keyOf(x) === PB.keyOf(lv)), dtype: 'bool' });
      }
    }
    return new DataFrame(m, { index: df.index.slice(), indexName: df.indexName });
  }
  PB.getDummies = getDummies;

  function dateRange(start, periods, freq) {
    const m = String(start).match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
    if (!m) throw PB.err('ValueError', 'could not parse start date ' + PB.repr(start), TR`อ่านวันที่เริ่มต้น '${start}' ไม่ได้`, TR('ใช้รูปแบบ ปี-เดือน-วัน เช่น 2024-01-01'));
    let y = +m[1], mo = m[2] ? +m[2] - 1 : 0, d = m[3] ? +m[3] : 1;
    const out = [];
    for (let i = 0; i < periods; i++) {
      if (freq === 'D') out.push(Date.UTC(y, mo, d + i));
      else if (freq === 'W') out.push(Date.UTC(y, mo, d + 7 * i));
      else if (freq === 'MS') out.push(Date.UTC(y, mo + i, 1));
      else if (freq === 'ME' || freq === 'M') out.push(Date.UTC(y, mo + i + 1, 0));
      else if (freq === 'QS') out.push(Date.UTC(y, mo + 3 * i, 1));
      else if (freq === 'YS') out.push(Date.UTC(y + i, 0, 1));
      else if (freq === 'h') out.push(Date.UTC(y, mo, d) + i * 3600000);
      else throw PB.err('ValueError', 'Invalid frequency: ' + freq, TR`ไม่รู้จักความถี่ '${freq}'`);
    }
    return out;
  }
  PB.dateRange = dateRange;
  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  function parseDate(v) {
    if (isMissing(v)) return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (m) return Date.UTC(+m[3], +m[1] - 1, +m[2]);
    m = s.match(/^(\d{4})[- ]([A-Za-z]+)$/);
    if (m) { const k = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3))); if (k >= 0) return Date.UTC(+m[1], k, 1); }
    m = s.match(/^(\d{4})$/);
    if (m) return Date.UTC(+m[1], 0, 1);
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
    throw PB.err('ValueError', `Unknown datetime string format, unable to parse: ${s}`, TR`อ่าน '${s}' เป็นวันที่ไม่ได้`, TR('ใช้รูปแบบ 2024-01-31'));
  }
  PB.toDatetime = (series) => series._new(series.values.map(parseDate), { dtype: 'datetime64[ns]' });

  /* ---------- file parsing ---------- */
  function parseCSVText(text, delim) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (!delim) {
      const first = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
      const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
      let inQ = false;
      for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
      delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
      if (counts[delim] === 0) delim = ',';
    }
    const rows = []; let row = [], field = '', inQ = false, quoted = false, i = 0;
    const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"' && field === '') { inQ = true; quoted = true; i++; continue; }
      if (ch === delim) { row.push(quoted ? { q: field } : field); field = ''; quoted = false; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(quoted ? { q: field } : field); rows.push(row); row = []; field = ''; quoted = false; i++; continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length || quoted) { row.push(quoted ? { q: field } : field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && (r[0] === '' || (r[0].q !== undefined && r[0].q === ''))));
  }
  function convertColumn(raw) {
    const s = raw.map((x) => (x && typeof x === 'object' ? x.q : x));
    let allInt = true, allNum = true, allBool = true, anyVal = false, anyNA = false;
    for (const x of s) {
      if (x === undefined || NA_STRINGS.has(x)) { anyNA = true; continue; }
      anyVal = true;
      const t = x.trim();
      if (!RE_INT.test(t)) allInt = false;
      if (!RE_FLOAT.test(t) && !RE_INF.test(t)) allNum = false;
      if (!/^(True|False|TRUE|FALSE|true|false)$/.test(t)) allBool = false;
      if (!allNum && !allBool) break;
    }
    if (!anyVal) return { values: s.map(() => NaN), dtype: 'float64' };
    if (allNum) {
      const vals = s.map((x) => (x === undefined || NA_STRINGS.has(x) ? NaN : RE_INF.test(x.trim()) ? (x.trim()[0] === '-' ? -Infinity : Infinity) : Number(x.trim())));
      return { values: vals, dtype: allInt && !anyNA ? 'int64' : 'float64' };
    }
    if (allBool && !anyNA) return { values: s.map((x) => /^(True|TRUE|true)$/.test(x.trim())), dtype: 'bool' };
    if (allBool) return { values: s.map((x) => (x === undefined || NA_STRINGS.has(x) ? null : /^(True|TRUE|true)$/.test(x.trim()))), dtype: 'object' };
    return { values: s.map((x) => (x === undefined || NA_STRINGS.has(x) ? null : x)), dtype: 'object' };
  }
  function uniqueHeader(h) {
    const seen = {};
    return h.map((x, i) => {
      let name = x === undefined || x === '' ? 'Unnamed: ' + i : x;
      if (seen[name] !== undefined) { seen[name]++; name = name + '.' + seen[name]; } else seen[name] = 0;
      return name;
    });
  }
  PB.readCSV = (text, opts = {}) => {
    const rows = parseCSVText(text, opts.sep);
    if (!rows.length) throw PB.err('EmptyDataError', 'No columns to parse from file', TR('ไฟล์ว่าง ไม่มีข้อมูล'));
    const header = uniqueHeader(rows[0].map((x) => (x && typeof x === 'object' ? x.q : x)));
    const body = rows.slice(1);
    const m = new Map();
    header.forEach((h, j) => m.set(h, convertColumn(body.map((r) => r[j]))));
    return new DataFrame(m);
  };
  PB.fromAOA = (aoa) => {
    const rows = aoa.filter((r) => r && r.some((v) => v !== null && v !== undefined && v !== ''));
    if (!rows.length) throw PB.err('EmptyDataError', 'No columns to parse from file', TR('ชีตว่าง ไม่มีข้อมูล'));
    const header = uniqueHeader(rows[0].map((x) => (x === null || x === undefined ? '' : String(x))));
    const m = new Map();
    header.forEach((h, j) => {
      const raw = rows.slice(1).map((r) => r[j]);
      if (raw.every((v) => v === null || v === undefined || v === '' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date)) {
        const vals = raw.map((v) => (v === null || v === undefined || v === '' ? null : v));
        m.set(h, { values: vals, dtype: inferDtype(vals) });
      } else m.set(h, convertColumn(raw.map((v) => (v === null || v === undefined ? undefined : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)))));
    });
    return new DataFrame(m);
  };
  PB.readJSON = (text) => {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw PB.err('ValueError', 'Expected object or value', TR('ไฟล์ JSON ไม่ถูกต้อง: ') + e.message); }
    if (Array.isArray(obj)) {
      const cols = []; const seen = new Set();
      for (const r of obj) if (r && typeof r === 'object') for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
      const m = new Map();
      for (const c of cols) { const vals = obj.map((r) => (r && r[c] !== undefined ? r[c] : null)); m.set(c, { values: vals, dtype: inferDtype(vals) }); }
      return new DataFrame(m);
    }
    if (obj && typeof obj === 'object') {
      const m = new Map();
      for (const [c, v] of Object.entries(obj)) { const vals = Array.isArray(v) ? v : Object.values(v); m.set(c, { values: vals, dtype: inferDtype(vals) }); }
      return new DataFrame(m);
    }
    throw PB.err('ValueError', 'Unsupported JSON layout', TR('รูปแบบ JSON ไม่รองรับ (ต้องเป็นลิสต์ของออบเจกต์)'));
  };

  /* ======================================================================
     NDArray (numpy-like, 1-D or 2-D)
     ====================================================================== */
  class NDArray {
    constructor(data, shape, dtype) {
      this.data = data; this.shape = shape || [data.length];
      this.dtype = dtype || (this.shape.length === 1 ? inferDtype(Array.from(data)) : 'float64');
    }
    pyType() { return 'ndarray'; }
    get length() { return this.shape[0]; }
    get ndim() { return this.shape.length; }
    flat() { return this.shape.length === 1 ? Array.from(this.data) : this.data.flatMap((r) => Array.from(r)); }
    _floats() { const f = this.flat(); return f.some((v) => typeof v !== 'number') ? null : f; }
    mean() { const f = this._floats(); return f && f.length ? PB.npMean(f) : S.mean(this.flat()); }
    std() { const f = this._floats(); return f && f.length ? PB.npStd(f, 0) : S.std(this.flat(), 0); }
    sum() { const f = this._floats(); return f && this.dtype === 'float64' ? PB.npSum(f) : S.sum(this.flat()); }
    min() { return S.min(this.flat()); }
    max() { return S.max(this.flat()); }
    tolist() { return this.shape.length === 1 ? Array.from(this.data) : this.data.map((r) => Array.from(r)); }
    row(i) { return this.data[i]; }
    shapeTuple() { return new PB.Tuple(this.shape.slice()); }
    __str__() { return ndText(this, false); }
    __repr__() { return ndText(this, true); }
  }
  PB.NDArray = NDArray;
  /* ---------- numpy array printing (arrayprint.py: FloatingFormat, IntegerFormat, 75-column wrapping) ---------- */
  /* dragon4 'unique' digits limited to `prec` fraction digits, then trailing zeros trimmed */
  function posDigits(x, prec) { let t = pyFixed(Math.abs(x), prec); if (t.includes('.')) t = t.replace(/0+$/, ''); return t; }
  function sciParts(x, prec) {
    let e = Math.abs(x).toExponential(prec), m = e.slice(0, e.indexOf('e')), ex = e.slice(e.indexOf('e') + 1);
    for (let d = 0; d <= prec; d++) { const t = Math.abs(x).toExponential(d); if (Number(t) === Math.abs(x)) { m = t.slice(0, t.indexOf('e')); ex = t.slice(t.indexOf('e') + 1); break; } }
    if (!m.includes('.')) m += '.';
    m = m.replace(/0+$/, '');
    const n = Number(ex), es = Math.abs(n) < 10 ? '0' + Math.abs(n) : String(Math.abs(n));
    return { int: m.slice(0, m.indexOf('.')), frac: m.slice(m.indexOf('.') + 1), exp: (n < 0 ? '-' : '+') + es };
  }
  function npFormatter(vals, dtype) {
    const isB = (v) => typeof v === 'boolean';
    if (dtype === 'bool' || (vals.length && vals.every(isB))) return (v) => (v ? ' True' : 'False');
    if (dtype === 'object' || vals.some((v) => typeof v === 'string' || (v !== null && typeof v === 'object'))) return (v) => PB.repr(v);
    if (dtype !== 'float64' && vals.every((v) => Number.isInteger(v))) {
      const w = vals.length ? Math.max(...vals.map((v) => String(v).length)) : 0;
      return (v) => String(v).padStart(w);
    }
    const fin = vals.filter((v) => Number.isFinite(v));
    const nz = fin.filter((v) => v !== 0).map(Math.abs);
    let exp = false;
    if (nz.length) { const mx = Math.max(...nz), mn = Math.min(...nz); if (mx >= 1e8 || mn < 0.0001 || mx / mn > 1000) exp = true; }
    let padL = 0, padR = 0, precS = 0, expSize = -1;
    if (!fin.length) { padL = 0; padR = 0; }
    else if (exp) {
      const parts = fin.map((v) => sciParts(v, 8));
      expSize = Math.max(...parts.map((p) => p.exp.length)) - 1;
      precS = Math.max(...parts.map((p) => p.frac.length));
      padL = Math.max(...fin.map((v, k) => (v < 0 || Object.is(v, -0) ? 1 : 0) + parts[k].int.length));
      padR = expSize + 2 + precS;
    } else {
      const strs = fin.map((v) => posDigits(v, 8));
      padL = Math.max(...fin.map((v, k) => (v < 0 || Object.is(v, -0) ? 1 : 0) + strs[k].split('.')[0].length));
      padR = Math.max(...strs.map((t) => (t.includes('.') ? t.split('.')[1].length : 0)));
    }
    if (fin.length !== vals.length) {
      const neginf = vals.some((v) => v === -Infinity) ? 1 : 0, off = padR + 1;
      padL = Math.max(padL, 3 - off, 3 + neginf - off);
    }
    return (v) => {
      if (!Number.isFinite(v)) { const r = Number.isNaN(v) ? 'nan' : v < 0 ? '-inf' : 'inf'; return ' '.repeat(Math.max(0, padL + padR + 1 - r.length)) + r; }
      const sign = v < 0 || Object.is(v, -0) ? '-' : '';
      if (exp) {
        const p = sciParts(v, 8);
        let ex = p.exp; const digits = ex.slice(1); if (digits.length < expSize) ex = ex[0] + digits.padStart(expSize, '0');
        return (sign + p.int).padStart(padL) + '.' + p.frac.padEnd(precS, '0') + 'e' + ex;
      }
      const t = posDigits(v, 8), [ip, fp = ''] = t.split('.');
      return (sign + ip).padStart(padL) + '.' + fp.padEnd(padR);
    };
  }
  function ndText(a, repr) {
    const flat = a.flat();
    let words, cut = false;
    const n0 = a.shape[0];
    const fmt = npFormatter(flat, a.dtype);
    const sep = repr ? ', ' : ' ';
    const width = repr ? 74 : 75;
    const hang0 = repr ? ' '.repeat(7) : ' ';
    const extend = (s, line, word, w, prefix) => {
      let wrap = line.length + word.length > w;
      if (line.length <= prefix.length) wrap = false;
      if (wrap) { s += line.replace(/\s+$/, '') + '\n'; line = prefix; }
      return [s, line + word];
    };
    const row = (vals, hang, curW) => {
      let items = vals, summary = false;
      if (vals.length > 1000) { items = vals.slice(0, 3).concat(vals.slice(-3)); summary = true; }
      words = items.map(fmt);
      const elemW = curW - Math.max(sep.replace(/\s+$/, '').length, 1);
      let s = '', line = hang;
      const lead = summary ? 3 : 0, total = words.length;
      for (let i = 0; i < (summary ? lead : total - 1); i++) { [s, line] = extend(s, line, words[i], elemW, hang); line += sep; }
      if (summary) { [s, line] = extend(s, line, '...', elemW, hang); line += sep; for (let i = lead; i < total - 1; i++) { [s, line] = extend(s, line, words[i], elemW, hang); line += sep; } }
      [s, line] = extend(s, line, words[total - 1] ?? '', elemW, hang);
      s += line;
      return '[' + s.slice(hang.length) + ']';
    };
    let body;
    if (a.shape.length === 1) body = flat.length ? row(flat, hang0, width) : '[]';
    else {
      const hang = hang0, next = hang + ' ', rows = PB.range(n0).map((i) => row(Array.from(a.data[i]), next, width - 1));
      const lineSep = sep.replace(/\s+$/, '') + '\n';
      let s = '';
      rows.forEach((r, i) => { s += hang + r + (i < rows.length - 1 ? lineSep : ''); });
      body = '[' + s.slice(hang.length) + ']';
    }
    void cut;
    return repr ? 'array(' + body + (a.dtype === 'object' ? ', dtype=object' : '') + ')' : body;
  }

  /* ---------- pandas Index (column names) ---------- */
  class Index {
    constructor(items) { this.items = items; }
    pyType() { return 'Index'; }
    get length() { return this.items.length; }
    tolist() { return this.items.slice(); }
    __repr__() { return 'Index([' + this.items.map(PB.repr).join(', ') + "], dtype='object')"; }
    __str__() { return this.__repr__(); }
  }
  PB.Index = Index;

  /* ---------- sparse matrix (CSR) for text features ---------- */
  class SparseMatrix {
    constructor(rows, nCols) { this.rows = rows; this.nCols = nCols; }
    pyType() { return 'csr_matrix'; }
    get shape() { return [this.rows.length, this.nCols]; }
    get nnz() { return this.rows.reduce((s, r) => s + r.idx.length, 0); }
    toDense() {
      if (this.rows.length * this.nCols > 3e7) throw PB.err('MemoryError', 'matrix too large', TR('เมทริกซ์ข้อความใหญ่เกินไปสำหรับการคำนวณในเบราว์เซอร์'), TR('ตั้งค่า max_features ของ Vectorizer ให้น้อยลง เช่น 2000'));
      return this.rows.map((r) => { const d = new Float64Array(this.nCols); r.idx.forEach((j, k) => { d[j] = r.val[k]; }); return d; });
    }
    __str__() { return `<Compressed Sparse Row sparse matrix of dtype 'float64'\n\twith ${this.nnz} stored elements and shape (${this.rows.length}, ${this.nCols})>`; }
    __repr__() { return this.__str__(); }
  }
  PB.SparseMatrix = SparseMatrix;

  /* ---------- text rendering (used by print in tests / exports) ---------- */
  /* pandas' text layout (DataFrameFormatter / SeriesFormatter): numbers keep a sign slot (" 5.1", "-0.3"),
     text cells get one leading space, dates none; numeric column headers get a leading space too;
     cells are right-justified and columns joined with one space (Series: index and values with three). */
  const isNumDt = (dt) => dt === 'int64' || dt === 'float64' || dt === 'bool';
  function cellStrs(vals, dtype) {
    const raw = formatValues(vals, dtype);
    if (dtype === 'datetime64[ns]') return raw;
    if (dtype === 'int64' || dtype === 'float64') return raw.map((x) => (x[0] === '-' || x === 'NaN' ? x : ' ' + x));
    return raw.map((x) => ' ' + x);
  }
  /* numeric index labels: pandas formats them with a sign slot (" 1", "-1", " NaN") and then trims the
     leading spaces that all labels share (Index._format_with_header + trim_front) */
  function indexStrs(vals, dtype) {
    const raw = formatValues(vals, dtype);
    if (dtype !== 'int64' && dtype !== 'float64') return raw;
    const signed = raw.map((x) => (x[0] === '-' ? x : ' ' + x));
    const lead = Math.min(...signed.map((x) => x.length - x.trimStart().length));
    return lead ? signed.map((x) => x.slice(lead)) : signed;
  }
  function frameText(df) {
    const cols = df.columns, n = df.nrows;
    /* pandas prints a frame without rows as its column list */
    if (n === 0) return 'Empty DataFrame\nColumns: [' + cols.map(String).join(', ') + ']\nIndex: []';
    let pos = PB.range(n), cut = false;
    if (n > 60) { pos = PB.range(5).concat(PB.range(5).map((i) => n - 5 + i)); cut = true; }
    const idxStr = indexStrs(pos.map((i) => df.index[i]), df.indexDtype || inferDtype(df.index));
    const heads = cols.map((c) => (isNumDt(df._dtype.get(c)) ? ' ' : '') + String(c));
    const colStrs = cols.map((c) => cellStrs(pos.map((i) => df._data.get(c)[i]), df._dtype.get(c)));
    const iw = Math.max(df.indexName ? df.indexName.length : 0, cut ? 2 : 0, ...idxStr.map((x) => x.length));
    const widths = cols.map((c, j) => Math.max(heads[j].length, cut ? 3 : 0, ...colStrs[j].map((x) => x.length)));
    const lines = [' '.repeat(iw) + cols.map((c, j) => ' ' + heads[j].padStart(widths[j])).join('')];
    if (df.indexName) lines.push(df.indexName.padEnd(iw) + cols.map((c, j) => ' ' + ' '.repeat(widths[j])).join(''));
    pos.forEach((_, r) => {
      if (cut && r === 5) lines.push('..'.padEnd(iw) + cols.map((c, j) => ' ' + '...'.padStart(widths[j])).join(''));
      lines.push(idxStr[r].padEnd(iw) + cols.map((c, j) => ' ' + colStrs[j][r].padStart(widths[j])).join(''));
    });
    if (cut) lines.push('', `[${n} rows x ${cols.length} columns]`);
    return lines.join('\n');
  }
  function seriesText(s) {
    const n = s.length;
    let pos = PB.range(n), cut = false;
    if (n > 60) { pos = PB.range(5).concat(PB.range(5).map((i) => n - 5 + i)); cut = true; }
    const idx = indexStrs(pos.map((i) => s.index[i]), s.indexDtype || inferDtype(s.index));
    const vals = cellStrs(pos.map((i) => s.values[i]), s.dtype);
    const iw = Math.max(...idx.map((x) => x.length), cut ? 2 : 0, 0), vw = Math.max(...vals.map((x) => x.length), 0);
    const lines = [];
    if (s.indexName) lines.push(s.indexName);
    pos.forEach((_, r) => { if (cut && r === 5) lines.push('..'); lines.push(idx[r].padEnd(iw) + '   ' + vals[r].padStart(vw)); });
    const foot = [];
    if (s.name !== null && s.name !== undefined) foot.push('Name: ' + s.name);
    if (cut) foot.push('Length: ' + n);
    foot.push('dtype: ' + dtypeLabel(s.dtype));
    lines.push(foot.join(', '));
    return lines.join('\n');
  }
  PB.Series = Series; PB.DataFrame = DataFrame; PB.GroupBy = GroupBy; PB.InfoResult = InfoResult;
  PB.frameText = frameText; PB.seriesText = seriesText;
})();
