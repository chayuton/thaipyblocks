/* ThaiPyBlocks engine: automatic feature selection (version 3.8), scikit-learn's SelectKBest with the
   univariate scores f_classif (ANOVA F), f_regression (F from the correlation) and chi2, step for step
   as in sklearn/feature_selection/_univariate_selection.py, plus the p-values from the F and chi-square
   distributions (scipy.special.fdtrc / chdtrc) computed with the regularized incomplete beta and gamma
   functions. */
(function () {
  const { DataFrame, NDArray } = PB;
  const FLOAT_MAX = Number.MAX_VALUE, FLOAT_MIN = -Number.MAX_VALUE;

  /* ---------------- special functions ---------------- */
  /* log Γ(x) for x > 0: Lanczos (g = 7, 9 terms), about 15 significant digits */
  const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function lgamma(x) {
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  /* continued fraction of the incomplete beta function (modified Lentz) */
  function betacf(a, b, x) {
    const TINY = 1e-300, EPS = 1e-16;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= 10000; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  /* regularized incomplete beta I_x(a, b) */
  function betainc(a, b, x) {
    if (Number.isNaN(x) || Number.isNaN(a) || Number.isNaN(b)) return NaN;
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const lbt = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log1p(-x);
    if (x < (a + 1) / (a + b + 2)) return (Math.exp(lbt) * betacf(a, b, x)) / a;
    return 1 - (Math.exp(lbt) * betacf(b, a, 1 - x)) / b;
  }
  /* upper tail of the F distribution: scipy.special.fdtrc(dfn, dfd, f) = I_{dfd/(dfd+dfn f)}(dfd/2, dfn/2) */
  function fdtrc(dfn, dfd, f) {
    if (Number.isNaN(f)) return NaN;
    if (f === Infinity) return 0;
    if (f <= 0) return 1;
    return betainc(dfd / 2, dfn / 2, dfd / (dfd + dfn * f));
  }
  /* regularized upper incomplete gamma Q(a, x) */
  function gammaincc(a, x) {
    if (Number.isNaN(x)) return NaN;
    if (x <= 0) return 1;
    if (x === Infinity) return 0;
    const lg = lgamma(a);
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 100000; n++) { ap += 1; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-17) break; }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - lg);
    }
    const TINY = 1e-300;
    let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
    for (let i = 1; i <= 100000; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-16) break;
    }
    return Math.exp(-x + a * Math.log(x) - lg) * h;
  }
  /* scipy.special.chdtrc(k, x): upper tail of the chi-square distribution */
  const chdtrc = (k, x) => (Number.isNaN(x) ? NaN : gammaincc(k / 2, x / 2));
  PB.special = { lgamma, betainc, fdtrc, gammaincc, chdtrc };

  /* ---------------- score functions ---------------- */
  /* numpy division of float arrays: x/0 is ±inf, 0/0 is nan */
  const fdiv = (a, b) => a / b;
  function labelsOf(y) {
    const yy = PB.asY(y);
    return yy.values;
  }
  /* f_classif(X, y) → [F, p] (f_oneway over the groups of y, in the order of np.unique(y)) */
  function fClassif(rows, y) {
    const n = rows.length, p = n ? rows[0].length : 0;
    const vals = labelsOf(y);
    if (vals.length !== n) throw PB.err('ValueError', `Found input variables with inconsistent numbers of samples: [${n}, ${vals.length}]`, TR`X มี ${n} แถว แต่ y มี ${vals.length} แถว`, TR('ใช้ X และ y ที่มาจากตารางเดียวกัน'));
    const classes = PB.uniqueSorted(vals), idx = new Map(classes.map((c, i) => [PB.keyOf(c), i]));
    if (classes.length < 2) throw PB.err('ValueError', 'f_classif needs at least two classes in y', TR('y มีเพียงคลาสเดียว จึงเทียบความต่างระหว่างกลุ่มไม่ได้'), TR('ตรวจคอลัมน์เป้าหมาย หรือใช้ f_regression กับเป้าหมายที่เป็นตัวเลข'));
    const K = classes.length, cnt = new Float64Array(K);
    const sums = classes.map(() => new Float64Array(p)), sq = classes.map(() => new Float64Array(p));
    rows.forEach((r, i) => { const k = idx.get(PB.keyOf(vals[i])); cnt[k]++; for (let j = 0; j < p; j++) { sums[k][j] += r[j]; sq[k][j] += r[j] * r[j]; } });
    const F = new Float64Array(p), P = new Float64Array(p), dfbn = K - 1, dfwn = n - K, constant = [];
    let msbZero = false;
    for (let j = 0; j < p; j++) {
      let ssAll = 0, sumAll = 0;
      for (let k = 0; k < K; k++) { ssAll += sq[k][j]; sumAll += sums[k][j]; }
      const sqAll = sumAll * sumAll;
      const sstot = ssAll - sqAll / n;
      let ssbn = 0;
      for (let k = 0; k < K; k++) ssbn += (sums[k][j] * sums[k][j]) / cnt[k];
      ssbn -= sqAll / n;
      const sswn = sstot - ssbn, msb = ssbn / dfbn, msw = sswn / dfwn;
      if (msw === 0) constant.push(j);
      if (msb === 0) msbZero = true;
      F[j] = fdiv(msb, msw);
      P[j] = fdtrc(dfbn, dfwn, F[j]);
    }
    /* sklearn warns only when some between-group mean square is 0 as well */
    return { F, P, constant: msbZero ? constant : [] };
  }
  /* f_regression(X, y): r = corr(X_j, y) → F = r²/(1 − r²)·(n − 2); non-finite values forced finite */
  function fRegression(rows, y) {
    const n = rows.length, p = n ? rows[0].length : 0;
    const yy = PB.asY(y);
    if (yy.dtype === 'object') throw PB.err('ValueError', `could not convert string to float: ${PB.repr(yy.values[0])}`, TR('f_regression ใช้กับเป้าหมายที่เป็นตัวเลข'), TR('ถ้าเป้าหมายเป็นกลุ่ม (ข้อความ) ให้ใช้ f_classif'));
    const yv = Float64Array.from(yy.values.map(Number));
    if (yv.length !== n) throw PB.err('ValueError', `Found input variables with inconsistent numbers of samples: [${n}, ${yv.length}]`, TR`X มี ${n} แถว แต่ y มี ${yv.length} แถว`);
    const ym = PB.npMean(Array.from(yv)), yc = yv.map((v) => v - ym);
    const ynorm = Math.sqrt(PB.npSum(Array.from(yc, (v) => v * v)));
    const F = new Float64Array(p), P = new Float64Array(p), dof = n - 2;
    for (let j = 0; j < p; j++) {
      const col = rows.map((r) => r[j]);
      const mean = PB.npMean(col);
      const xnorm = Math.sqrt(PB.npSum(col.map((v) => v * v)) - n * mean * mean);
      let dot = 0;
      for (let i = 0; i < n; i++) dot += yc[i] * col[i];
      let r = dot / xnorm / ynorm;
      if (Number.isNaN(r)) r = 0;
      const r2 = r * r;
      let f = (r2 / (1 - r2)) * dof, pv = fdtrc(1, dof, f);
      if (f === Infinity) f = FLOAT_MAX;
      else if (Number.isNaN(f)) { f = 0; pv = 1; }
      F[j] = f; P[j] = pv;
    }
    return { F, P, constant: [] };
  }
  /* chi2(X, y): observed counts per class against the counts expected from the class shares */
  function chi2(rows, y) {
    const n = rows.length, p = n ? rows[0].length : 0;
    for (const r of rows) for (const v of r) if (v < 0) throw PB.err('ValueError', 'Input X must be non-negative.', TR('chi2 ใช้ได้กับข้อมูลที่ไม่ติดลบเท่านั้น (เช่น จำนวนนับ ค่าที่ปรับเป็น 0–1)'), TR('ใช้ MinMaxScaler ก่อน หรือเลือก f_classif แทน'));
    const vals = labelsOf(y), classes = PB.uniqueSorted(vals), idx = new Map(classes.map((c, i) => [PB.keyOf(c), i]));
    const K = Math.max(2, classes.length), obs = Array.from({ length: K }, () => new Float64Array(p)), cnt = new Float64Array(K);
    /* LabelBinarizer: one column per class (two classes give one column, then [1 − Y, Y]) */
    rows.forEach((r, i) => { const k = idx.get(PB.keyOf(vals[i])); cnt[k]++; for (let j = 0; j < p; j++) obs[k][j] += r[j]; });
    const F = new Float64Array(p), P = new Float64Array(p);
    for (let j = 0; j < p; j++) {
      let total = 0;
      for (let i = 0; i < n; i++) total += rows[i][j];
      let s = 0;
      for (let k = 0; k < K; k++) { const e = (cnt[k] / n) * total, d = obs[k][j] - e; s += (d * d) / e; }
      F[j] = s; P[j] = chdtrc(K - 1, s);
    }
    return { F, P, constant: [] };
  }
  const SCORE_FUNCS = { f_classif: fClassif, f_regression: fRegression, chi2 };
  PB.scoreFuncs = SCORE_FUNCS;

  /* ---------------- SelectKBest ---------------- */
  class SelectKBest extends PB.Transformer {
    static pyName = 'SelectKBest'; static kind = 'transformer'; static module = 'sklearn.feature_selection';
    static defaults = { score_func: 'f_classif', k: 10 };
    fit(X, y) {
      if (y === undefined || y === null) throw PB.err('TypeError', "SelectKBest.fit() missing 1 required positional argument: 'y'", TR('SelectKBest ต้องใช้ทั้ง X และคำตอบ y เพื่อให้คะแนนแต่ละฟีเจอร์'), TR('ใช้ selector.fit_transform(X_train, y_train)'));
      const m = this._xFit(X);
      const fn = SCORE_FUNCS[this.params.score_func];
      if (!fn) throw PB.err('ValueError', `unknown score_func ${this.params.score_func}`, TR`ไม่รู้จักวิธีให้คะแนน ${this.params.score_func}`);
      const k = this.params.k;
      if (k !== 'all' && k > m.p) PB.warn(`k=${k} is greater than n_features=${m.p}. All the features will be returned.`, TR`k=${k} มากกว่าจำนวนฟีเจอร์ที่มี (${m.p}) จึงได้ฟีเจอร์ทั้งหมด`);
      const r = fn(m.rows, y);
      if (r.constant.length) PB.warn(`Features [${r.constant.join(' ')}] are constant.`, TR`ฟีเจอร์ตำแหน่ง ${r.constant.join(', ')} มีค่าเดียวกันทุกแถว (คะแนนเป็น nan) จึงไม่ถูกเลือก`);
      this.scores_ = PB.floatArray(Array.from(r.F)); this.pvalues_ = PB.floatArray(Array.from(r.P));
      this._mask = this._support();
      this.fitted = true; return this;
    }
    /* _get_support_mask: stable argsort of the scores (nan → the smallest float), the last k win */
    _support() {
      const s = Array.from(this.scores_.data), p = s.length, k = this.params.k;
      if (k === 'all' || k >= p) return s.map(() => true);
      if (k === 0) return s.map(() => false);
      const clean = s.map((v) => (Number.isNaN(v) ? FLOAT_MIN : v));
      const order = PB.range(p).sort((a, b) => (clean[a] - clean[b]) || (a - b));
      const mask = s.map(() => false);
      for (const j of order.slice(p - k)) mask[j] = true;
      return mask;
    }
    get_support(indices = false) {
      this._needFit('get_support');
      if (indices) { const ix = this._mask.map((on, j) => (on ? j : -1)).filter((j) => j >= 0); return new NDArray(ix, [ix.length], 'int64'); }
      return new NDArray(this._mask.slice(), [this._mask.length], 'bool');
    }
    get_feature_names_out() {
      this._needFit('get_feature_names_out');
      const names = this.feature_names_in_ || PB.range(this.n_features_in_).map((j) => 'x' + j);
      const out = names.filter((_, j) => this._mask[j]);
      return new NDArray(out, [out.length], 'object');
    }
    transform(X) {
      this._needFit('transform');
      const m = this._xPred(X);
      if (!this._mask.some(Boolean)) PB.warn('No features were selected: either the data is too noisy or the selection test too strict.', TR('ไม่มีฟีเจอร์ใดถูกเลือก (k=0)'));
      if (this._pandasOut && X instanceof DataFrame) return X.select(X.columns.filter((_, j) => this._mask[j]));
      const keep = PB.range(m.p).filter((j) => this._mask[j]);
      const rows = m.rows.map((r) => keep.map((j) => r[j]));
      return new NDArray(rows, [rows.length, keep.length], 'float64');
    }
    fit_transform(X, y) { this.fit(X, y); return this.transform(X); }
    __repr__() {
      const parts = [];
      if (this.params.score_func !== 'f_classif') parts.push(`score_func=<function ${this.params.score_func}>`);
      if (this.params.k !== 10) parts.push('k=' + PB.repr(this.params.k));
      return 'SelectKBest(' + parts.join(', ') + ')';
    }
  }
  /* the table the "คะแนนของแต่ละฟีเจอร์" block prints:
     pd.DataFrame({"feature": …, "score": …, "p_value": …, "selected": …}).sort_values("score", ascending=False) */
  PB.featureScoreTable = (sel) => {
    const est = sel instanceof PB.Pipeline ? sel.steps.find((s) => s instanceof SelectKBest) : sel;
    if (!(est instanceof SelectKBest)) throw PB.err('AttributeError', `'${PB.typeName(sel)}' object has no attribute 'scores_'`, TR('ตัวแปรนี้ไม่ใช่ตัวเลือกฟีเจอร์ (SelectKBest)'), TR('เลือกตัวแปรที่เก็บ SelectKBest(...) ไว้'));
    est._needFit('scores_');
    if (!est.feature_names_in_) throw PB.err('AttributeError', "'SelectKBest' object has no attribute 'feature_names_in_'", TR('ตัวเลือกฟีเจอร์ถูกฝึกด้วยข้อมูลที่ไม่มีชื่อคอลัมน์'), TR('ใช้ X ที่เป็น DataFrame ตอน fit'));
    const df = DataFrame.fromColumns({
      feature: { values: est.feature_names_in_.slice(), dtype: 'object' },
      score: { values: Array.from(est.scores_.data), dtype: 'float64' },
      p_value: { values: Array.from(est.pvalues_.data), dtype: 'float64' },
      selected: { values: est._mask.slice(), dtype: 'bool' },
    }, ['feature', 'score', 'p_value', 'selected']);
    return df.sort_values('score', false);
  };
  Object.assign(PB, { SelectKBest });
})();
