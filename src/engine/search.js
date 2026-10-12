/* ThaiPyBlocks engine: model selection — Python literal parsing, ParameterGrid, scorers, GridSearchCV,
   and parameter routing for pipelines (step__param), all following scikit-learn's behaviour. */
(function () {
  const { Estimator, Pipeline, DataFrame } = PB;

  /* ---------- Python literal parser: dict / list / tuple / str / number / None / True / False ---------- */
  PB.pyLiteral = (src) => {
    const s = String(src);
    let i = 0;
    const fail = (what) => {
      const near = s.slice(Math.max(0, i - 8), i + 8);
      throw PB.err('SyntaxError', `invalid syntax near ${JSON.stringify(near)}`, TR`อ่านค่าไม่ได้: ${what}`, TR('รูปแบบที่ถูก เช่น {"n_neighbors": [3, 5, 7], "weights": ["uniform", "distance"]}'));
    };
    const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
    function value() {
      ws();
      const c = s[i];
      if (c === '{') return dict();
      if (c === '[') return seq(']', false);
      if (c === '(') return seq(')', true);
      if (c === '"' || c === "'") return str();
      const m = /^[+-]?(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(s.slice(i));
      if (m) {
        i += m[0].length;
        const v = Number(m[0]);
        /* a literal written with a dot or exponent is a float in Python, even when whole (1.0, 1e3) */
        return /[.eE]/.test(m[0]) ? PB.toFloat(v) : v;
      }
      for (const [w, v] of [['None', null], ['True', true], ['False', false]]) if (s.startsWith(w, i) && !/\w/.test(s[i + w.length] || '')) { i += w.length; return v; }
      fail(c === undefined ? TR('ข้อความจบก่อนครบวงเล็บ') : TR`ไม่รู้จัก "${c}"`);
    }
    function str() {
      const q = s[i++]; let out = '';
      while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) { i++; out += { n: '\n', t: '\t' }[s[i]] || s[i]; } else out += s[i]; i++; }
      if (s[i] !== q) fail(TR('ข้อความไม่มีเครื่องหมายคำพูดปิด'));
      i++; return out;
    }
    function seq(close, tuple) {
      i++; const out = []; let comma = false;
      for (;;) {
        ws();
        if (s[i] === close) { i++; break; }
        out.push(value()); ws(); comma = false;
        if (s[i] === ',') { i++; comma = true; continue; }
        if (s[i] === close) { i++; break; }
        fail(TR`ขาดเครื่องหมาย , หรือ ${close}`);
      }
      if (tuple) return out.length === 1 && !comma ? out[0] : new PB.Tuple(out);
      return out;
    }
    function dict() {
      i++; const out = new Map();
      for (;;) {
        ws();
        if (s[i] === '}') { i++; break; }
        const k = value(); ws();
        if (s[i] !== ':') fail(TR('ขาดเครื่องหมาย : ระหว่างชื่อกับค่า'));
        i++; out.set(k, value()); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; break; }
        fail(TR('ขาดเครื่องหมาย , หรือ }'));
      }
      return out;
    }
    const v = value(); ws();
    if (i < s.length) fail(TR('มีข้อความเกินมาหลังค่าที่อ่านได้'));
    return v;
  };
  const deepUnbox = (v) => (v instanceof PB.PyFloat ? v.v : v instanceof PB.Tuple ? new PB.Tuple(v.items.map(deepUnbox)) : Array.isArray(v) ? v.map(deepUnbox) : v);
  PB.deepUnbox = deepUnbox;

  /* ---------- ParameterGrid: keys sorted, itertools.product order (last key changes fastest) ---------- */
  PB.parameterGrid = (grid) => {
    const grids = Array.isArray(grid) ? grid : [grid];
    const out = [];
    for (const g of grids) {
      if (!(g instanceof Map)) throw PB.err('TypeError', `Parameter grid should be a dict or a list, got: ${PB.repr(g)} of type ${PB.typeName(g)}`, TR('param_grid ต้องเป็น dict เช่น {"n_neighbors": [3, 5, 7]}'));
      const keys = Array.from(g.keys()).map(String).sort();
      for (const k of keys) {
        const vals = g.get(k);
        if (!Array.isArray(vals) && !(vals instanceof PB.Tuple)) throw PB.err('TypeError', `Parameter grid for parameter '${k}' needs to be a list or a numpy array, but got ${PB.repr(vals)} (of type ${PB.typeName(vals)}) instead. Single values need to be wrapped in a list with one element.`, TR`ค่าของ "${k}" ต้องอยู่ในลิสต์ เช่น [${PB.repr(vals)}]`);
        if (!(Array.isArray(vals) ? vals : vals.items).length) throw PB.err('ValueError', `Parameter grid for parameter '${k}' need to be a non-empty sequence, got: []`, TR`ลิสต์ค่าของ "${k}" ว่างเปล่า`);
      }
      if (!keys.length) { out.push(new Map()); continue; }
      const lists = keys.map((k) => { const v = g.get(k); return Array.isArray(v) ? v : v.items; });
      const idx = keys.map(() => 0);
      for (;;) {
        out.push(new Map(keys.map((k, j) => [k, lists[j][idx[j]]])));
        let j = keys.length - 1;
        while (j >= 0) { idx[j]++; if (idx[j] < lists[j].length) break; idx[j] = 0; j--; }
        if (j < 0) break;
      }
    }
    return out;
  };

  /* ---------- parameter routing (set_params) ---------- */
  function nameSteps(steps) {
    const names = steps.map((s) => s.constructor.pyName.toLowerCase());
    const count = {}; names.forEach((n) => { count[n] = (count[n] || 0) + 1; });
    for (const k of Object.keys(count)) if (count[k] === 1) delete count[k];
    for (let i = names.length - 1; i >= 0; i--) { const n = names[i]; if (count[n]) { names[i] = n + '-' + count[n]; count[n]--; } }
    return names;
  }
  PB.stepNames = nameSteps;
  const validParams = (est) => (est instanceof Pipeline ? nameSteps(est.steps).concat(['memory', 'steps', 'verbose']) : Object.keys(est.constructor.defaults || {})).sort();
  function invalidParam(est, key) {
    return PB.err('ValueError', `Invalid parameter '${key}' for estimator ${est.__repr__()}. Valid parameters are: ${PB.repr(validParams(est))}.`,
      est instanceof Pipeline ? TR`ไปป์ไลน์ไม่มีพารามิเตอร์ "${key}" ต้องขึ้นต้นด้วยชื่อขั้นตอนแล้วตามด้วย __ เช่น ${nameSteps(est.steps).slice(-1)[0]}__C` : TR`โมเดล ${est.constructor.pyName} ไม่มีพารามิเตอร์ "${key}" (หรือยังไม่รองรับในเบราว์เซอร์)`,
      TR('พารามิเตอร์ที่ใช้ได้: ') + validParams(est).join(', '));
  }
  Estimator.prototype.set_params = function (p) {
    const entries = p instanceof Map ? Array.from(p.entries()) : Object.entries(p);
    for (const [k, v] of entries) {
      if (!Object.prototype.hasOwnProperty.call(this.constructor.defaults || {}, k)) throw invalidParam(this, k);
      this.params[k] = deepUnbox(v);
    }
    return this;
  };
  Pipeline.prototype.set_params = function (p) {
    const entries = p instanceof Map ? Array.from(p.entries()) : Object.entries(p);
    const names = nameSteps(this.steps);
    for (const [k, v] of entries) {
      const cut = k.indexOf('__');
      const step = cut > 0 ? names.indexOf(k.slice(0, cut)) : -1;
      if (step < 0) throw invalidParam(this, k);
      this.steps[step].set_params(new Map([[k.slice(cut + 2), v]]));
    }
    return this;
  };
  Pipeline.prototype.score = function (X, y) {
    this._needFit('score');
    return this.final.score(this._through(X), y);
  };

  /* ---------- scorers ---------- */
  const SCORERS = {
    accuracy: (e, X, y) => PB.metrics.accuracy_score(y, PB.runMaybe(e.predict(X))),
    f1_macro: (e, X, y) => PB.metrics.f1_score(y, PB.runMaybe(e.predict(X)), 'macro'),
    r2: (e, X, y) => PB.metrics.r2_score(y, PB.runMaybe(e.predict(X))),
    neg_mean_absolute_error: (e, X, y) => -PB.metrics.mean_absolute_error(y, PB.runMaybe(e.predict(X))),
    neg_root_mean_squared_error: (e, X, y) => -PB.metrics.root_mean_squared_error(y, PB.runMaybe(e.predict(X))),
  };
  PB.SCORERS = SCORERS;
  PB.scorer = (scoring) => {
    if (scoring === null || scoring === undefined || scoring === 'None') return (e, X, y) => e.score(X, y);
    const f = SCORERS[scoring];
    if (!f) throw PB.err('ValueError', `'${scoring}' is not a valid scoring value.`, TR`ไม่รู้จัก scoring "${scoring}"`, TR('ใช้ ') + Object.keys(SCORERS).join(', '));
    return f;
  };
  /* sklearn's check_cv: an int gives StratifiedKFold for classifiers (binary / multiclass y), else KFold */
  PB.cvFolds = (est, X, y, cv) => {
    const n = PB.nRows(X);
    if (!Number.isInteger(cv) || cv < 2) throw PB.err('ValueError', `k-fold cross-validation requires at least one train/test split by setting n_splits=2 or more, got n_splits=${cv}.`, TR('cv ต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป'));
    if (est.kind === 'classifier') {
      const yv = PB.asY(y, 'y').values;
      const cont = yv.some((v) => typeof v === 'number' && !Number.isInteger(v));
      if (!cont) {
        const counts = new Map(); yv.forEach((v) => counts.set(PB.keyOf(v), (counts.get(PB.keyOf(v)) || 0) + 1));
        const mn = Math.min(...counts.values());
        if (cv <= Math.max(...counts.values()) && cv > mn) PB.warn(`The least populated class in y has only ${mn} members, which is less than n_splits=${cv}.`, TR`บางคลาสมีข้อมูลเพียง ${mn} แถว น้อยกว่าจำนวนรอบ cv=${cv}`);
        return PB.stratifiedKfoldIndices(yv, cv);
      }
    }
    return PB.kfoldIndices(n, cv);
  };

  /* ---------- GridSearchCV ---------- */
  class GridSearchCV extends Estimator {
    static pyName = 'GridSearchCV'; static kind = 'meta'; static module = 'sklearn.model_selection';
    static defaults = { cv: 5, scoring: null, refit: true };
    constructor(estimator, paramGrid, params = {}) {
      super(params);
      if (!(estimator instanceof Estimator)) throw PB.err('TypeError', `estimator should be an estimator implementing 'fit' method, ${PB.repr(estimator)} was passed`, TR('ช่องแรกของ GridSearchCV ต้องเป็นโมเดล'));
      this.estimator = estimator; this.param_grid = paramGrid;
      this._candidates = PB.parameterGrid(paramGrid);
    }
    get kind() { return this.estimator.kind; }
    clone() { return new GridSearchCV(this.estimator.clone(), this.param_grid, Object.assign({}, this.params)); }
    get classes_() { this._needFit('classes_'); return this.best_estimator_.classes_; }
    get n_candidates() { return this._candidates.length; }
    *fit(X, y) {
      const est = this.estimator, cands = this._candidates;
      const score = PB.scorer(this.params.scoring);
      /* unknown parameter names fail straight away (set_params runs before each fit in sklearn) */
      for (const cand of cands) est.clone().set_params(cand);
      const folds = PB.cvFolds(est, X, y, this.params.cv);
      const S = cands.map(() => new Array(folds.length).fill(NaN));
      let firstErr = null, failed = 0;
      const total = cands.length * folds.length;
      for (let c = 0; c < cands.length; c++) {
        for (let f = 0; f < folds.length; f++) {
          const [tr, te] = folds[f];
          yield { progress: TR`GridSearchCV: ชุดค่าที่ ${c + 1}/${cands.length} · รอบ ${f + 1}/${folds.length}`, frac: (c * folds.length + f) / total };
          try {
            const m = est.clone().set_params(cands[c]);
            yield* PB.gen(m.fit(PB.take(X, tr), PB.take(y, tr)));
            S[c][f] = score(m, PB.take(X, te), PB.take(y, te));
          } catch (e) {
            if (!(e instanceof PB.PyError)) throw e;
            failed++; if (!firstErr) firstErr = e;
          }
        }
      }
      if (failed === total) {
        throw PB.err('ValueError', `All the ${total} fits failed. It is very likely that your model is misconfigured.`, TR('ฝึกไม่สำเร็จทุกชุดค่า: ') + (firstErr.thai || firstErr.message), firstErr.hint);
      }
      if (failed) PB.warn(`${failed} fits failed out of a total of ${total}. The score on these train-test partitions for these parameters will be set to nan.`, TR`ฝึกไม่สำเร็จ ${failed} จาก ${total} ครั้ง คะแนนของชุดค่าเหล่านั้นเป็น nan`);
      const means = S.map((r) => PB.npMean(r)), stds = S.map((r) => PB.npStd(r, 0));
      /* rankdata(-means, method="min"); NaN means rank as the worst */
      const fin = means.filter((m) => !Number.isNaN(m)), worst = fin.length ? Math.min(...fin) - 1 : 0;
      const key = means.map((m) => (Number.isNaN(m) ? worst : m));
      const ranks = key.map((m) => 1 + key.filter((o) => o > m).length);
      let best = 0; for (let c = 1; c < cands.length; c++) if (ranks[c] < ranks[best]) best = c;
      this.best_index_ = best;
      this.best_params_ = cands[best];
      this.best_score_ = means[best];
      this.n_splits_ = folds.length;
      this._scores = S; this._means = means; this._stds = stds; this._ranks = ranks;
      this.scorer_ = score;
      if (this.params.refit) {
        yield { progress: TR('GridSearchCV: ฝึกโมเดลที่ดีที่สุดกับข้อมูลทั้งหมด'), frac: 1 };
        const m = est.clone().set_params(cands[best]);
        yield* PB.gen(m.fit(X, y));
        this.best_estimator_ = m;
        this.n_features_in_ = m.n_features_in_; this.feature_names_in_ = m.feature_names_in_ || (m instanceof Pipeline ? m.steps[0].feature_names_in_ : undefined);
      }
      this.fitted = true;
      return this;
    }
    _best(method) {
      this._needFit(method);
      if (!this.best_estimator_) throw PB.err('AttributeError', `This 'GridSearchCV' has no attribute '${method}'`, TR('GridSearchCV ที่ตั้ง refit=False ทำนายไม่ได้'));
      return this.best_estimator_;
    }
    predict(X) { return this._best('predict').predict(X); }
    predict_proba(X) { return this._best('predict_proba').predict_proba(X); }
    transform(X) { return this._best('transform').transform(X); }
    score(X, y) { return this.scorer_(this._best('score'), X, y); }
    /* pd.DataFrame(grid.cv_results_)[["params", "mean_test_score", "std_test_score", "rank_test_score"]] */
    cvResultsFrame() {
      this._needFit('cv_results_');
      const m = new Map();
      m.set('params', { values: this._candidates.slice(), dtype: 'object' });
      m.set('mean_test_score', { values: this._means.slice(), dtype: 'float64' });
      m.set('std_test_score', { values: this._stds.slice(), dtype: 'float64' });
      m.set('rank_test_score', { values: this._ranks.slice(), dtype: 'int64' });
      return new DataFrame(m);
    }
    __repr__() {
      const parts = [];
      if (this.params.cv !== null && this.params.cv !== undefined) parts.push('cv=' + PB.repr(this.params.cv));
      parts.push('estimator=' + this.estimator.__repr__());
      parts.push('param_grid=' + PB.repr(this.param_grid));
      if (this.params.scoring) parts.push('scoring=' + PB.repr(this.params.scoring));
      return 'GridSearchCV(' + parts.join(', ') + ')';
    }
  }
  PB.GridSearchCV = GridSearchCV;

  /* cross_val_score with an optional scoring string */
  PB.crossValScore = function* (est, X, y, cv = 5, scoring = null) {
    const folds = PB.cvFolds(est, X, y, cv);
    const score = PB.scorer(scoring);
    const scores = [];
    for (let f = 0; f < folds.length; f++) {
      const [tr, te] = folds[f];
      const m = est.clone();
      yield* PB.gen(m.fit(PB.take(X, tr), PB.take(y, tr)));
      scores.push(score(m, PB.take(X, te), PB.take(y, te)));
      yield { progress: TR`cross validation รอบ ${f + 1}/${folds.length}`, frac: (f + 1) / folds.length };
    }
    return PB.floatArray(scores);
  };
})();
