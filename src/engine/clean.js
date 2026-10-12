/* ThaiPyBlocks engine: data cleansing and normalization with pandas semantics — replace, to_numeric,
   ffill / bfill / interpolate, clip, mask, groupby-transform, outlier rules and a data-quality table. */
(function () {
  const { DataFrame, Series } = PB;
  const isMissing = PB.isMissing, S = PB.stats;
  const isNum = (dt) => dt === 'int64' || dt === 'float64';

  /* ---------- df.replace([...], np.nan) ----------
     a token matches values of its own type only: "999" (text) does not match 999 (number), and
     booleans are never touched; an int column that gets a NaN becomes float64 */
  PB.replaceWithNaN = (df, tokens) => {
    const m = new Map();
    for (const c of df.columns) {
      const dt = df.dtypeOf(c), v = df._data.get(c);
      let changed = false;
      const nv = v.map((x) => {
        if (dt === 'bool' || dt === 'datetime64[ns]' || isMissing(x)) return x;
        if (tokens.some((t) => (typeof t === 'number' ? typeof x === 'number' && x === t : typeof x === 'string' && x === t))) { changed = true; return dt === 'object' ? null : NaN; }
        return x;
      });
      m.set(c, { values: nv, dtype: changed && dt === 'int64' ? 'float64' : dt });
    }
    return new DataFrame(m, { index: df.index.slice(), indexName: df.indexName, indexDtype: df.indexDtype });
  };
  /* the list typed in a block, written like the inside of a Python list: "-", "?", 999 ->
     ['-', '?', 999]; quoted items are kept exactly (a space " " too), bare numbers become numbers,
     other bare words are trimmed */
  PB.parseTokens = (text) => {
    const s = String(text || ''), out = [];
    let i = 0;
    while (i < s.length) {
      while (i < s.length && /\s/.test(s[i])) i++;
      if (i >= s.length) break;
      const q = s[i];
      if (q === '"' || q === "'") {
        let t = ''; i++;
        while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) i++; t += s[i++]; }
        i++; out.push(t);
        while (i < s.length && s[i] !== ',') i++;
      } else {
        let t = '';
        while (i < s.length && s[i] !== ',') t += s[i++];
        t = t.trim();
        if (t !== '') out.push(/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : t);
      }
      i++;
    }
    return out;
  };

  /* ---------- Series.replace(old, new) ---------- */
  Series.prototype.replaceValue = function (old, nw) {
    old = PB.unbox(old); nw = PB.unbox(nw);
    const hit = (x) => !isMissing(x) && (typeof old === 'number' ? typeof x === 'number' && x === old : typeof old === 'boolean' ? x === old : typeof x === 'string' && x === String(old));
    if (!this.values.some(hit)) return this._new(this.values.slice(), { dtype: this.dtype });
    const vals = this.values.map((x) => (hit(x) ? nw : x));
    const dt = this.dtype === 'object' ? 'object' : this.dtype === 'float64' && typeof nw === 'number' ? 'float64' : PB.inferDtype(vals);
    return this._new(vals, { dtype: dt });
  };

  /* several old → new replacements at once (a Map), the same as replace(old, new) one after another when
     no new value is also an old one (the cleaning assistant follows chains first) */
  Series.prototype.replaceMap = function (map) {
    let s = this;
    for (const [o, n] of map) s = s.replaceValue(o, n);
    return s;
  };

  /* ---------- pd.to_numeric(s, errors="coerce") ----------
     the same grammar as pandas' parser: spaces around, a sign, digits with an optional point and
     exponent, inf / infinity / nan in any case; anything else becomes NaN. All-integer text with no
     missing value gives int64, otherwise float64. strip=True first applies
     .astype(str).str.replace(r"[^\d.\-]", "", regex=True) to drop commas, currency signs and units. */
  const WS = '[ \\t\\n\\v\\f\\r]*';
  const NUM_RE = new RegExp(`^${WS}[+-]?(?:(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?|inf(?:inity)?|nan)${WS}$`, 'i');
  const INT_RE = new RegExp(`^${WS}[+-]?\\d+${WS}$`);
  const parseText = (s) => {
    const t = s.trim().toLowerCase(), sign = t[0] === '-' ? -1 : 1, w = t.replace(/^[+-]/, '');
    if (w === 'inf' || w === 'infinity') return sign * Infinity;
    if (w === 'nan') return NaN;
    return Number(t);
  };
  const astypeStr = (x, dt) => (typeof x === 'string' ? x : typeof x === 'boolean' ? (x ? 'True' : 'False') : typeof x === 'number' ? (dt === 'float64' || !Number.isInteger(x) ? PB.floatRepr(x) : String(x)) : PB.str(x));
  PB.toNumeric = (s, strip = false) => {
    let vals = s.values, dt = s.dtype;
    if (!strip && (isNum(dt) || dt === 'bool')) return s._new(vals.slice(), { dtype: dt });
    if (dt === 'datetime64[ns]') throw PB.err('TypeError', 'Invalid object type at position 0', TR`คอลัมน์ ${s.name} เป็นวันที่ แปลงเป็นตัวเลขด้วย to_numeric ไม่ได้`);
    if (strip) { vals = vals.map((x) => (isMissing(x) ? null : astypeStr(x, dt).replace(/[^\p{Nd}.\-]/gu, ''))); dt = 'object'; }
    let allInt = true, missing = false;
    const out = vals.map((x) => {
      if (isMissing(x)) { missing = true; return NaN; }
      if (typeof x === 'number') { if (!Number.isInteger(x)) allInt = false; return x; }
      if (typeof x === 'boolean') return +x;
      const t = String(x);
      if (!NUM_RE.test(t)) { missing = true; return NaN; }
      if (!INT_RE.test(t)) allInt = false;
      const v = parseText(t);
      if (Number.isNaN(v)) missing = true;
      return v;
    });
    return s._new(out, { dtype: allInt && !missing ? 'int64' : 'float64' });
  };
  /* how many non-missing values would turn into NaN (used by the cleansing assistant) */
  PB.toNumericLoss = (s, strip) => { const r = PB.toNumeric(s, strip); return s.values.filter((x, i) => !isMissing(x) && Number.isNaN(r.values[i])).length; };

  /* ---------- ffill / bfill / interpolate ---------- */
  const keepDtype = (s, vals) => (s.dtype === 'int64' && vals.some(isMissing) ? 'float64' : s.dtype === 'object' ? 'object' : s.dtype === 'float64' ? 'float64' : PB.inferDtype(vals));
  Series.prototype.ffill = function () { let last = null, has = false; const vals = this.values.map((x) => { if (isMissing(x)) return has ? last : x; has = true; last = x; return x; }); return this._new(vals, { dtype: keepDtype(this, vals) }); };
  Series.prototype.bfill = function () { const vals = this.values.slice(); let next = null, has = false; for (let i = vals.length - 1; i >= 0; i--) { if (isMissing(vals[i])) { if (has) vals[i] = next; } else { has = true; next = vals[i]; } } return this._new(vals, { dtype: keepDtype(this, vals) }); };
  /* method="linear" on positions 0..n-1 (np.interp): gaps between values are joined by straight lines,
     NaN after the last value repeat it, NaN before the first value stay NaN */
  Series.prototype.interpolate = function () {
    if (this.dtype === 'object') throw PB.err('TypeError', 'Cannot interpolate with all object-dtype columns in the DataFrame. Try setting at least one column to a numeric dtype.', TR`คอลัมน์ ${this.name} เป็นข้อความ จึงประมาณค่า (interpolate) ไม่ได้`, TR('ใช้กับคอลัมน์ตัวเลข หรือแปลงเป็นตัวเลขด้วย pd.to_numeric ก่อน'));
    const v = this.values.map((x) => (typeof x === 'boolean' ? +x : x));
    const xp = [], fp = [];
    v.forEach((x, i) => { if (!isMissing(x)) { xp.push(i); fp.push(x); } });
    if (!xp.length || xp.length === v.length) return this._new(this.values.slice(), { dtype: this.dtype });
    let j = 0;
    const vals = v.map((x, i) => {
      if (!isMissing(x)) return x;
      if (i < xp[0]) return NaN;
      if (i >= xp[xp.length - 1]) return fp[fp.length - 1];
      while (xp[j + 1] < i) j++;
      const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
      let r = slope * (i - xp[j]) + fp[j];
      if (Number.isNaN(r)) { r = slope * (i - xp[j + 1]) + fp[j + 1]; if (Number.isNaN(r) && fp[j] === fp[j + 1]) r = fp[j]; }
      return r;
    });
    return this._new(vals, { dtype: 'float64' });
  };
  /* s.fillna(other_series): fill each missing value from the same row of another Series */
  Series.prototype.fillnaFrom = function (other) {
    const ov = other.values;
    const vals = this.values.map((x, i) => (isMissing(x) ? PB.unbox(ov[i]) : x));
    return this._new(vals, { dtype: this.dtype === 'float64' && ov.every((x) => isMissing(x) || typeof x === 'number') ? 'float64' : this.dtype === 'object' ? 'object' : PB.inferDtype(vals) });
  };

  /* ---------- df.groupby(by)[col].transform("median" | "mean") ----------
     pandas' cython kernels: the median of each group's non-missing values, the mean with Kahan
     summation; rows whose group key is missing get NaN */
  PB.kahanSum = (vals) => { let sum = 0, comp = 0; for (const v of vals) { const y = v - comp, t = sum + y; comp = t - sum - y; if (Number.isNaN(comp)) comp = 0; sum = t; } return sum; };
  PB.groupTransform = (df, by, col, fn) => {
    df._need(by); df._need(col);
    const keys = df._data.get(by), v = df._data.get(col), dt = df.dtypeOf(col);
    if (!isNum(dt) && dt !== 'bool') throw PB.err('TypeError', `agg function failed [how->${fn},dtype->${dt}]`, TR`คอลัมน์ ${col} เป็นข้อความ จึงหา${fn === 'median' ? TR('มัธยฐาน') : TR('ค่าเฉลี่ย')}ของกลุ่มไม่ได้`, TR('ใช้กับคอลัมน์ตัวเลขเท่านั้น'));
    const groups = new Map();
    keys.forEach((k, i) => { if (isMissing(k)) return; const kk = PB.keyOf(k); if (!groups.has(kk)) groups.set(kk, []); if (!isMissing(v[i])) groups.get(kk).push(+v[i]); });
    const stat = new Map();
    for (const [kk, a] of groups) stat.set(kk, !a.length ? NaN : fn === 'median' ? S.median(a) : PB.kahanSum(a) / a.length);
    return new Series(keys.map((k) => (isMissing(k) ? NaN : stat.get(PB.keyOf(k)))), { index: df.index.slice(), name: col, dtype: 'float64', indexName: df.indexName, indexDtype: df.indexDtype });
  };

  /* ---------- clip / mask ----------
     pandas only changes the dtype when a replaced value needs it: an int column clipped at 2.0 stays
     int64, clipped at 2.5 becomes float64; mask() with any True gives float64 */
  Series.prototype.clip = function (lo, hi) {
    this._num('clip'); lo = PB.unbox(lo); hi = PB.unbox(hi);
    let needFloat = false;
    const vals = this.values.map((x) => {
      if (isMissing(x)) return x;
      if (lo !== null && lo !== undefined && !Number.isNaN(lo) && x < lo) { if (!Number.isInteger(lo)) needFloat = true; return lo; }
      if (hi !== null && hi !== undefined && !Number.isNaN(hi) && x > hi) { if (!Number.isInteger(hi)) needFloat = true; return hi; }
      return x;
    });
    return this._new(vals, { dtype: this.dtype === 'int64' && !needFloat ? 'int64' : this.dtype === 'bool' ? PB.inferDtype(vals) : 'float64' });
  };
  Series.prototype.maskWhere = function (cond) {
    const c = cond instanceof Series ? cond.values : cond;
    if (!c.some(Boolean)) return this._new(this.values.slice(), { dtype: this.dtype });
    const vals = this.values.map((x, i) => (c[i] ? (this.dtype === 'object' ? null : NaN) : x));
    return this._new(vals, { dtype: this.dtype === 'object' ? 'object' : 'float64' });
  };

  /* ---------- outliers ----------
     iqr: Q1 - k*IQR .. Q3 + k*IQR (IQR = Q3 - Q1) · zscore: mean - k*std .. mean + k*std (std with ddof=1) */
  PB.outlierBounds = (s, method = 'iqr', k = 1.5) => {
    s._num(method === 'zscore' ? 'mean' : 'quantile');
    if (method === 'zscore') { const m = s.mean(), sd = s.std(); return [m - k * sd, m + k * sd]; }
    const q1 = s.quantile(0.25), q3 = s.quantile(0.75);
    return [q1 - k * (q3 - q1), q3 + k * (q3 - q1)];
  };
  /* (s < low) | (s > high): missing values are never outliers */
  PB.outlierMask = (s, low, high) => s.values.map((x) => !isMissing(x) && (+x < low || +x > high));
  PB.outliers = (s, method, k) => { const [lo, hi] = PB.outlierBounds(s, method, k); return { low: lo, high: hi, mask: PB.outlierMask(s, lo, hi) }; };

  /* ---------- data quality table ----------
     pd.DataFrame({"dtype": df.dtypes.astype(str), "missing": df.isnull().sum(),
                   "missing_%": (df.isnull().mean() * 100).round(1), "unique": df.nunique()}) */
  PB.dataQuality = (df) => {
    const cols = df.columns, n = df.nrows;
    const miss = cols.map((c) => df._data.get(c).filter(isMissing).length);
    return DataFrame.fromColumns({
      dtype: { values: cols.map((c) => PB.dtypeLabel(df.dtypeOf(c))), dtype: 'object' },
      missing: { values: miss, dtype: 'int64' },
      'missing_%': { values: miss.map((k) => (n ? PB.roundHalfEven((k / n) * 100 * 10) / 10 : NaN)), dtype: 'float64' },
      unique: { values: cols.map((c) => df.col(c).nunique()), dtype: 'int64' },
    }, ['dtype', 'missing', 'missing_%', 'unique'], { index: cols.slice(), indexDtype: 'object' });
  };
  /* df.loc[:, df.isnull().mean() <= p]: keep the columns whose share of missing values is at most p */
  PB.keepFilledColumns = (df, p) => { const n = df.nrows; return df.select(df.columns.filter((c) => (n ? df._data.get(c).filter(isMissing).length / n : NaN) <= p)); };
})();
