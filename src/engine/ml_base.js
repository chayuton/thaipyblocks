/* ThaiPyBlocks engine: sklearn-style estimator base, data conversion, splitting, preprocessing. */
(function () {
  const { DataFrame, Series, NDArray, SparseMatrix } = PB;

  /* ---------- input conversion ---------- */
  /* allowNaN: scalers follow scikit-learn and accept NaN (ignored in fit, kept in transform) */
  function asX(X, what = 'X', allowNaN = false) {
    if (X instanceof DataFrame) { const rows = X.toMatrix(undefined, allowNaN); if (allowNaN) checkFinite(rows, true); return { rows, names: X.columns, n: X.nrows, p: X.ncols, df: X }; }
    if (X instanceof SparseMatrix) return { rows: X.toDense(), names: null, n: X.rows.length, p: X.nCols, sparse: true };
    if (X instanceof NDArray) {
      if (X.shape.length !== 2) throw PB.err('ValueError', 'Expected 2D array, got 1D array instead', TR`${what} ต้องเป็นตาราง 2 มิติ (หลายคอลัมน์) แต่ได้ข้อมูล 1 มิติ`, TR('ถ้ามีคอลัมน์เดียว ให้เลือกแบบ df[["คอลัมน์"]] (วงเล็บเหลี่ยม 2 ชั้น)'));
      const rows = X.data.map((r) => Float64Array.from(r));
      checkFinite(rows, allowNaN);
      return { rows, names: null, n: rows.length, p: X.shape[1] };
    }
    if (X instanceof Series) throw PB.err('ValueError', 'Expected 2D array, got 1D array instead', TR`${what} ต้องเป็นตาราง 2 มิติ แต่ได้คอลัมน์เดียว (Series)`, TR('ใช้ df[["คอลัมน์"]] แทน df["คอลัมน์"] หรือใช้ df.drop(columns=[...])'));
    if (Array.isArray(X) && X.length && Array.isArray(X[0])) {
      const rows = X.map((r) => Float64Array.from(r.map(Number)));
      checkFinite(rows);
      return { rows, names: null, n: rows.length, p: rows[0].length };
    }
    throw PB.err('TypeError', `Expected a DataFrame or 2D array for ${what}, got ${PB.typeName(X)}`, TR`${what} ต้องเป็นตารางข้อมูล (DataFrame) แต่ได้ ${PB.typeName(X)}`);
  }
  function checkFinite(rows, allowNaN = false) {
    for (const r of rows) for (const v of r) {
      if (Number.isFinite(v) || (allowNaN && Number.isNaN(v))) continue;
      if (allowNaN) throw PB.err('ValueError', "Input X contains infinity or a value too large for dtype('float64').", TR('ข้อมูลมีค่าอนันต์ (inf) ซึ่งปรับสเกลไม่ได้'), TR('แทนค่า inf ด้วย NaN หรือตัดแถวนั้นออกก่อน'));
      throw PB.err('ValueError', 'Input X contains NaN or infinity.', TR('ข้อมูลมีค่าว่าง (NaN) หรือค่าอนันต์'), TR('ใช้ dropna() หรือ fillna() ก่อน'));
    }
  }
  function asY(y, what = 'y') {
    let vals, name = null, dtype;
    if (y instanceof Series) { vals = y.values; name = y.name; dtype = y.dtype; }
    else if (y instanceof NDArray) { if (y.shape.length !== 1) throw PB.err('ValueError', 'y should be a 1d array', TR`${what} ต้องเป็นข้อมูล 1 มิติ`); vals = Array.from(y.data); dtype = y.dtype; }
    else if (Array.isArray(y)) { vals = y; dtype = PB.inferDtype(y); }
    else if (y instanceof DataFrame) {
      if (y.ncols !== 1) throw PB.err('ValueError', 'y should be a 1d array, got an array of shape ' + PB.repr(y.shape), TR`${what} ต้องเป็นคอลัมน์เดียว`, TR('ใช้ df["คอลัมน์"] (วงเล็บชั้นเดียว)'));
      const s = y.col(y.columns[0]); vals = s.values; name = s.name; dtype = s.dtype;
    } else throw PB.err('TypeError', `Expected a 1D array for ${what}, got ${PB.typeName(y)}`, TR`${what} ต้องเป็นคอลัมน์ข้อมูล แต่ได้ ${PB.typeName(y)}`);
    if (vals.some(PB.isMissing)) throw PB.err('ValueError', 'Input y contains NaN.', TR`${what} มีค่าว่าง (NaN)`, TR('ลบแถวที่ค่าเป้าหมายว่างด้วย dropna() ก่อนแยก X, y'));
    return { values: vals, name, dtype };
  }
  function nRows(a) {
    if (a instanceof DataFrame) return a.nrows;
    if (a instanceof Series) return a.length;
    if (a instanceof NDArray) return a.shape[0];
    if (a instanceof SparseMatrix) return a.rows.length;
    if (Array.isArray(a)) return a.length;
    throw PB.err('TypeError', 'Expected sequence or array-like, got ' + PB.typeName(a), TR('ข้อมูลต้องเป็นตารางหรือคอลัมน์'));
  }
  function take(a, pos) {
    if (a instanceof DataFrame || a instanceof Series) return a.iloc(pos);
    if (a instanceof NDArray) return a.shape.length === 1 ? new NDArray(pos.map((i) => a.data[i]), [pos.length], a.dtype) : new NDArray(pos.map((i) => a.data[i]), [pos.length, a.shape[1]], a.dtype);
    if (a instanceof SparseMatrix) return new SparseMatrix(pos.map((i) => a.rows[i]), a.nCols);
    return pos.map((i) => a[i]);
  }
  PB.asX = asX; PB.asY = asY; PB.nRows = nRows; PB.take = take;
  PB.labelArray = (vals, dtypeHint) => {
    const dt = dtypeHint && dtypeHint !== 'float64' ? dtypeHint : PB.inferDtype(vals);
    const a = new NDArray(vals, [vals.length], dt === 'bool' ? 'bool' : dt);
    return a;
  };
  PB.floatArray = (vals) => new NDArray(Array.from(vals), [vals.length], 'float64');

  /* ---------- estimator base ---------- */
  class Estimator {
    constructor(params = {}) {
      this.params = Object.assign({}, this.constructor.defaults || {}, params);
      this.fitted = false;
    }
    pyType() { return this.constructor.pyName; }
    get kind() { return this.constructor.kind; }
    clone() { return new this.constructor(JSON.parse(JSON.stringify(this.params, (k, v) => (v instanceof PB.Tuple ? { __tuple: v.items } : v)), (k, v) => (v && v.__tuple ? new PB.Tuple(v.__tuple) : v))); }
    _needFit(method = 'predict') {
      if (!this.fitted) throw PB.err('NotFittedError', `This ${this.constructor.pyName} instance is not fitted yet. Call 'fit' with appropriate arguments before using this estimator.`,
        TR`โมเดล ${this.constructor.pyName} ยังไม่ได้ฝึก (fit) จึงเรียก ${method}() ไม่ได้`, TR('วางบล็อก model.fit(X_train, y_train) ก่อนบล็อกนี้'));
    }
    _xFit(X, allowNaN = false) {
      const m = asX(X, 'X', allowNaN);
      if (m.n === 0) throw PB.err('ValueError', 'Found array with 0 sample(s)', TR('ไม่มีข้อมูลสำหรับฝึก (0 แถว)'), TR('ตรวจสอบการกรองข้อมูลหรือ dropna() ที่อาจลบทุกแถว'));
      this.n_features_in_ = m.p; this.feature_names_in_ = m.names;
      return m;
    }
    _xPred(X, allowNaN = false) {
      const m = asX(X, 'X', allowNaN);
      if (m.p !== this.n_features_in_) throw PB.err('ValueError', `X has ${m.p} features, but ${this.constructor.pyName} is expecting ${this.n_features_in_} features as input.`,
        TR`ข้อมูลมี ${m.p} คอลัมน์ แต่โมเดลถูกฝึกด้วย ${this.n_features_in_} คอลัมน์`, TR('ใช้คอลัมน์ชุดเดียวกับตอน fit'));
      if (this.feature_names_in_ && m.names && m.names.join('\u0001') !== this.feature_names_in_.join('\u0001')) {
        throw PB.err('ValueError', 'The feature names should match those that were passed during fit.', TR('ชื่อคอลัมน์ไม่ตรงกับตอนฝึกโมเดล'), TR('ตอนฝึก: ') + this.feature_names_in_.join(', '));
      }
      return m;
    }
    _encodeY(y) {
      const yy = asY(y);
      this.classes_ = PB.uniqueSorted(yy.values);
      this._yDtype = yy.dtype;
      const idx = new Map(this.classes_.map((c, i) => [PB.keyOf(c), i]));
      if (this.classes_.length < 2) throw PB.err('ValueError', `The number of classes has to be greater than one; got ${this.classes_.length} class`, TR('ข้อมูลเป้าหมายมีเพียงคลาสเดียว จำแนกประเภทไม่ได้'), TR('ตรวจสอบคอลัมน์เป้าหมาย'));
      return yy.values.map((v) => idx.get(PB.keyOf(v)));
    }
    _checkClassifTarget(y) {
      const yy = asY(y);
      const u = PB.uniqueSorted(yy.values);
      if (yy.dtype === 'float64' && u.some((v) => !Number.isInteger(v)) || (u.length > 50 && yy.dtype !== 'object' && u.length > yy.values.length / 2)) {
        throw PB.err('ValueError', "Unknown label type: continuous. Maybe you are trying to fit a classifier, which expects discrete classes on a regression target with continuous values.",
          TR('เป้าหมายเป็นตัวเลขต่อเนื่อง ใช้โมเดลจำแนกประเภท (Classifier) ไม่ได้'), TR('เปลี่ยนเป็นโมเดลพยากรณ์ค่า (Regressor) เช่น LinearRegression หรือ RandomForestRegressor'));
      }
    }
    _decode(idx) { return PB.labelArray(idx.map((i) => this.classes_[i]), this._yDtype); }
    _yFloat(y) {
      const yy = asY(y);
      if (yy.dtype === 'object') throw PB.err('ValueError', `could not convert string to float: ${PB.repr(yy.values[0])}`, TR('เป้าหมายเป็นข้อความ ใช้โมเดลพยากรณ์ค่า (Regressor) ไม่ได้'), TR('ถ้าต้องการทายกลุ่ม ให้ใช้โมเดลจำแนกประเภท (Classifier)'));
      return Float64Array.from(yy.values.map(Number));
    }
    score(X, y) {
      const pred = PB.runMaybe(this.predict(X));
      if (this.kind === 'classifier') return PB.metrics.accuracy_score(y, pred);
      return PB.metrics.r2_score(y, pred);
    }
    set_output(transform) { this._pandasOut = transform === 'pandas'; return this; }
    get_params() { return Object.assign({}, this.params); }
    set_params(p) { Object.assign(this.params, p); return this; }
    __repr__() {
      const d = this.constructor.defaults || {};
      const parts = [];
      for (const k of Object.keys(this.params)) {
        const v = this.params[k];
        if (k.startsWith('_')) continue;
        if (JSON.stringify(v) === JSON.stringify(d[k]) && !(v instanceof PB.Tuple)) continue;
        if (v instanceof PB.Tuple && d[k] instanceof PB.Tuple && v.items.join() === d[k].items.join()) continue;
        parts.push(k + '=' + (v instanceof Estimator ? v.__repr__() : PB.repr(v)));
      }
      return this.constructor.pyName + '(' + parts.join(', ') + ')';
    }
    __str__() { return this.__repr__(); }
  }
  PB.Estimator = Estimator;
  /* some methods are generators (long-running); runMaybe drives them synchronously */
  PB.runMaybe = (v) => (PB.isGen(v) ? PB.runSync(v) : v);

  /* ---------- train_test_split ---------- */
  function validateSplit(n, testSize, trainSize) {
    let nTest, nTrain;
    if (testSize === null || testSize === undefined) testSize = trainSize == null ? 0.25 : null;
    if (testSize !== null) {
      if (testSize > 0 && testSize < 1) nTest = Math.ceil(testSize * n);
      else if (Number.isInteger(testSize) && testSize >= 1 && testSize < n) nTest = testSize;
      else throw PB.err('ValueError', `test_size=${testSize} should be either positive and smaller than the number of samples ${n} or a float in the (0, 1) range`, TR('test_size ต้องอยู่ระหว่าง 0 ถึง 1 เช่น 0.2'));
    }
    if (trainSize !== null && trainSize !== undefined) nTrain = trainSize < 1 ? Math.floor(trainSize * n) : trainSize;
    else nTrain = n - nTest;
    if (nTest === undefined) nTest = n - nTrain;
    if (nTrain <= 0) throw PB.err('ValueError', 'the resulting train set will be empty', TR('ชุดฝึกจะว่างเปล่า ลดค่า test_size ลง'));
    return [nTrain, nTest];
  }
  function approximateMode(classCounts, nDraws, rng) {
    const total = classCounts.reduce((s, c) => s + c, 0);
    const cont = classCounts.map((c) => (c / total) * nDraws);
    const floored = cont.map(Math.floor);
    let need = Math.trunc(nDraws - floored.reduce((s, c) => s + c, 0));
    if (need > 0) {
      const rem = cont.map((c, i) => c - floored[i]);
      const values = PB.uniqueSorted(rem).reverse();
      for (const value of values) {
        let inds = []; rem.forEach((r, i) => { if (r === value) inds.push(i); });
        const addNow = Math.min(inds.length, need);
        const perm = rng.permutation(inds.length).slice(0, addNow);
        inds = perm.map((p) => inds[p]);
        for (const i of inds) floored[i] += 1;
        need -= addNow;
        if (need === 0) break;
      }
    }
    return floored;
  }
  function stratifiedIndices(yVals, nTrain, nTest, randomState) {
    const classes = PB.uniqueSorted(yVals);
    const ci = new Map(classes.map((c, i) => [PB.keyOf(c), i]));
    const yIdx = yVals.map((v) => ci.get(PB.keyOf(v)));
    const counts = classes.map(() => 0); yIdx.forEach((k) => counts[k]++);
    if (Math.min(...counts) < 2) throw PB.err('ValueError', 'The least populated class in y has only 1 member, which is too few. The minimum number of groups for any class cannot be less than 2.', TR('มีบางคลาสที่มีข้อมูลเพียง 1 แถว จึงแบ่งแบบ stratify ไม่ได้'), TR('ลองเลือก stratify = ไม่ใช้'));
    if (nTrain < classes.length) throw PB.err('ValueError', `The train_size = ${nTrain} should be greater or equal to the number of classes = ${classes.length}`, TR('ชุดฝึกเล็กกว่าจำนวนคลาส'));
    if (nTest < classes.length) throw PB.err('ValueError', `The test_size = ${nTest} should be greater or equal to the number of classes = ${classes.length}`, TR('ชุดทดสอบเล็กกว่าจำนวนคลาส เพิ่ม test_size'));
    const classIndices = classes.map(() => []);
    yIdx.forEach((k, i) => classIndices[k].push(i));
    const rng = PB.checkRandomState(randomState);
    const nI = approximateMode(counts, nTrain, rng);
    const remaining = counts.map((c, i) => c - nI[i]);
    const tI = approximateMode(remaining, nTest, rng);
    let train = [], test = [];
    for (let i = 0; i < classes.length; i++) {
      const perm = rng.permutation(counts[i]);
      const pic = perm.map((p) => classIndices[i][p]);
      train = train.concat(pic.slice(0, nI[i]));
      test = test.concat(pic.slice(nI[i], nI[i] + tI[i]));
    }
    train = rng.shuffle(train.slice());
    test = rng.shuffle(test.slice());
    return [train, test];
  }
  PB.trainTestSplit = (arrays, opts = {}) => {
    const n = nRows(arrays[0]);
    for (const a of arrays) if (nRows(a) !== n) throw PB.err('ValueError', `Found input variables with inconsistent numbers of samples: [${arrays.map(nRows).join(', ')}]`, TR('X และ y มีจำนวนแถวไม่เท่ากัน'), TR('ตรวจสอบว่า X และ y มาจาก DataFrame เดียวกันหลังทำความสะอาดข้อมูล'));
    const [nTrain, nTest] = validateSplit(n, opts.test_size, opts.train_size);
    const shuffle = opts.shuffle !== false;
    let train, test;
    if (!shuffle) {
      if (opts.stratify) throw PB.err('ValueError', 'Stratified train/test split is not implemented for shuffle=False', TR('ใช้ stratify พร้อม shuffle=False ไม่ได้'));
      train = PB.range(nTrain); test = PB.range(nTest).map((i) => nTrain + i);
    } else if (opts.stratify) {
      [train, test] = stratifiedIndices(asY(opts.stratify, 'stratify').values, nTrain, nTest, opts.random_state);
    } else {
      const perm = PB.checkRandomState(opts.random_state).permutation(n);
      test = perm.slice(0, nTest); train = perm.slice(nTest, nTest + nTrain);
    }
    const out = [];
    for (const a of arrays) { out.push(take(a, train)); out.push(take(a, test)); }
    return out;
  };

  /* ---------- cross-validation splitters ---------- */
  PB.kfoldIndices = (n, k) => {
    if (k < 2) throw PB.err('ValueError', 'k-fold cross-validation requires at least one train/test split by setting n_splits=2 or more', TR('cv ต้องมีค่าอย่างน้อย 2'));
    if (k > n) throw PB.err('ValueError', `Cannot have number of splits n_splits=${k} greater than the number of samples: n_samples=${n}.`, TR('จำนวนรอบ cv มากกว่าจำนวนแถว'));
    const sizes = PB.range(k).map((i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
    const folds = []; let cur = 0;
    for (const s of sizes) { const test = PB.range(s).map((i) => cur + i); const set = new Set(test); folds.push([PB.range(n).filter((i) => !set.has(i)), test]); cur += s; }
    return folds;
  };
  PB.stratifiedKfoldIndices = (yVals, k) => {
    const n = yVals.length;
    // classes encoded by order of first appearance
    const firstSeen = new Map(); yVals.forEach((v) => { const kk = PB.keyOf(v); if (!firstSeen.has(kk)) firstSeen.set(kk, firstSeen.size); });
    const sortedKeys = PB.uniqueSorted(yVals).map(PB.keyOf);
    const yEnc = yVals.map((v) => firstSeen.get(PB.keyOf(v)));
    const nClasses = firstSeen.size;
    const counts = PB.range(nClasses).map(() => 0); yEnc.forEach((c) => counts[c]++);
    if (k > Math.max(...counts)) throw PB.err('ValueError', `n_splits=${k} cannot be greater than the number of members in each class.`, TR('จำนวนรอบ cv มากกว่าจำนวนข้อมูลในทุกคลาส'));
    void sortedKeys;
    const yOrder = yEnc.slice().sort((a, b) => a - b);
    const allocation = PB.range(k).map((i) => { const cnt = PB.range(nClasses).map(() => 0); for (let j = i; j < n; j += k) cnt[yOrder[j]]++; return cnt; });
    const testFolds = new Array(n);
    for (let c = 0; c < nClasses; c++) {
      const foldsForClass = []; for (let f = 0; f < k; f++) for (let r = 0; r < allocation[f][c]; r++) foldsForClass.push(f);
      let t = 0; for (let i = 0; i < n; i++) if (yEnc[i] === c) testFolds[i] = foldsForClass[t++];
    }
    return PB.range(k).map((f) => { const test = [], train = []; for (let i = 0; i < n; i++) (testFolds[i] === f ? test : train).push(i); return [train, test]; });
  };

  /* ---------- transformers ---------- */
  function outFrame(m, rows, X, names) {
    if (X && X instanceof DataFrame) {
      const cols = names || X.columns;
      const map = new Map();
      cols.forEach((c, j) => map.set(c, { values: rows.map((r) => r[j]), dtype: 'float64' }));
      return new DataFrame(map, { index: X.index.slice(), indexName: X.indexName, indexDtype: X.indexDtype });
    }
    return new NDArray(rows.map((r) => Array.from(r)), [rows.length, rows[0] ? rows[0].length : 0], 'float64');
  }
  PB.outFrame = outFrame;
  class Transformer extends Estimator {
    fit_transform(X, y) { this.fit(X, y); return this.transform(X); }
  }
  /* Scalers follow scikit-learn's arithmetic: NaN is ignored when learning the statistics and stays NaN
     after transform; a (near) constant column gets scale 1 (_handle_zeros_in_scale). */
  const EPS = Number.EPSILON;
  const columnsOf = (m) => PB.range(m.p).map((j) => m.rows.map((r) => r[j]));
  const zeroScale = (v) => (v < 10 * EPS ? 1 : v);
  const nanMinMax = (col) => { let lo = NaN, hi = NaN; for (const v of col) { if (Number.isNaN(v)) continue; if (!(v >= lo)) lo = v; if (!(v <= hi)) hi = v; } return [lo, hi]; };
  const scaled = (m, X, f, self) => outFrame(m, m.rows.map((r) => r.map((x, j) => f(x, j))), self._pandasOut ? X : null);
  class StandardScaler extends Transformer {
    static pyName = 'StandardScaler'; static kind = 'transformer'; static module = 'sklearn.preprocessing';
    static defaults = { with_mean: true, with_std: true };
    /* _incremental_mean_and_var: nansum (pairwise) / count, corrected two-pass variance */
    fit(X) {
      const m = this._xFit(X, true), p = m.p, cols = columnsOf(m);
      const mean = new Float64Array(p), v = new Float64Array(p), cnt = new Float64Array(p);
      cols.forEach((col, j) => {
        const z = (a) => a.map((x) => (Number.isNaN(x) ? 0 : x));
        const n = col.filter((x) => !Number.isNaN(x)).length; cnt[j] = n;
        const sum = PB.npSum(z(col)); mean[j] = sum / n;
        const temp = col.map((x) => x - sum / n);
        const corr = PB.npSum(z(temp)), sq = PB.npSum(z(temp.map((t) => t * t)));
        v[j] = (sq - (corr * corr) / n) / n;
      });
      this.mean_ = PB.floatArray(mean); this.var_ = PB.floatArray(v);
      this.scale_ = PB.floatArray(Array.from(v).map((x, j) => { const n = cnt[j], b = n * mean[j] * EPS; return x <= n * EPS * x + b * b ? 1 : Math.sqrt(x); }));
      this.n_samples_seen_ = cnt.every((c) => c === m.n) ? m.n : PB.floatArray(cnt);
      this._mean = mean; this._scale = Float64Array.from(this.scale_.data);
      this.fitted = true; return this;
    }
    transform(X) {
      this._needFit('transform'); const m = this._xPred(X, true);
      const wm = this.params.with_mean, ws = this.params.with_std;
      return scaled(m, X, (x, j) => { let y = wm ? x - this._mean[j] : x; if (ws) y /= this._scale[j]; return y; }, this);
    }
    inverse_transform(X) {
      this._needFit('inverse_transform'); const m = asX(X, 'X', true);
      return scaled(m, X, (x, j) => x * this._scale[j] + this._mean[j], this);
    }
  }
  class MinMaxScaler extends Transformer {
    static pyName = 'MinMaxScaler'; static kind = 'transformer'; static module = 'sklearn.preprocessing';
    static defaults = {};
    /* scale_ = 1 / (max - min), min_ = -min * scale_; transform = X * scale_ + min_ */
    fit(X) {
      const m = this._xFit(X, true), cols = columnsOf(m);
      const lo = new Float64Array(m.p), hi = new Float64Array(m.p);
      cols.forEach((col, j) => { [lo[j], hi[j]] = nanMinMax(col); });
      this.data_min_ = PB.floatArray(lo); this.data_max_ = PB.floatArray(hi); this.data_range_ = PB.floatArray(Array.from(hi, (h, j) => h - lo[j]));
      this._scale = Float64Array.from(hi, (h, j) => 1 / zeroScale(h - lo[j]));
      this._min = Float64Array.from(lo, (l, j) => 0 - l * this._scale[j]);
      this.scale_ = PB.floatArray(this._scale); this.min_ = PB.floatArray(this._min);
      this.fitted = true; return this;
    }
    transform(X) { this._needFit('transform'); const m = this._xPred(X, true); return scaled(m, X, (x, j) => x * this._scale[j] + this._min[j], this); }
    inverse_transform(X) { this._needFit('inverse_transform'); const m = asX(X, 'X', true); return scaled(m, X, (x, j) => (x - this._min[j]) / this._scale[j], this); }
  }
  class RobustScaler extends Transformer {
    static pyName = 'RobustScaler'; static kind = 'transformer'; static module = 'sklearn.preprocessing';
    static defaults = {};
    /* center_ = np.nanmedian, scale_ = np.nanpercentile 75 - 25 */
    fit(X) {
      const m = this._xFit(X, true), cols = columnsOf(m);
      this._c = new Float64Array(m.p); this._s = new Float64Array(m.p);
      cols.forEach((col, j) => {
        const a = col.filter((x) => !Number.isNaN(x)).sort((x, y) => x - y);
        this._c[j] = PB.stats.median(a);
        this._s[j] = zeroScale(PB.quantileSorted(a, 0.75) - PB.quantileSorted(a, 0.25));
      });
      this.center_ = PB.floatArray(this._c); this.scale_ = PB.floatArray(this._s);
      this.fitted = true; return this;
    }
    transform(X) { this._needFit('transform'); const m = this._xPred(X, true); return scaled(m, X, (x, j) => (x - this._c[j]) / this._s[j], this); }
    inverse_transform(X) { this._needFit('inverse_transform'); const m = asX(X, 'X', true); return scaled(m, X, (x, j) => x * this._s[j] + this._c[j], this); }
  }
  class MaxAbsScaler extends Transformer {
    static pyName = 'MaxAbsScaler'; static kind = 'transformer'; static module = 'sklearn.preprocessing';
    static defaults = {};
    /* scale_ = max(|x|); transform = X / scale_ (keeps zeros and signs, range -1..1) */
    fit(X) {
      const m = this._xFit(X, true), cols = columnsOf(m);
      this.max_abs_ = PB.floatArray(cols.map((col) => nanMinMax(col.map(Math.abs))[1]));
      this._s = Float64Array.from(this.max_abs_.data, zeroScale);
      this.scale_ = PB.floatArray(this._s);
      this.fitted = true; return this;
    }
    transform(X) { this._needFit('transform'); const m = this._xPred(X, true); return scaled(m, X, (x, j) => x / this._s[j], this); }
    inverse_transform(X) { this._needFit('inverse_transform'); const m = asX(X, 'X', true); return scaled(m, X, (x, j) => x * this._s[j], this); }
  }
  class SimpleImputer extends Transformer {
    static pyName = 'SimpleImputer'; static kind = 'transformer'; static module = 'sklearn.impute';
    static defaults = { strategy: 'mean' };
    fit(X) {
      if (!(X instanceof DataFrame)) throw PB.err('TypeError', 'SimpleImputer expects a DataFrame here', TR('SimpleImputer ต้องใช้กับ DataFrame'));
      this._cols = X.columns; this.n_features_in_ = X.ncols; this.feature_names_in_ = X.columns;
      const st = this.params.strategy;
      this._fill = X.columns.map((c) => {
        const s = X.col(c);
        if (st === 'most_frequent') return s.mode().values[0];
        if (!PB.isNumericDtype(s.dtype)) throw PB.err('ValueError', `Cannot use ${st} strategy with non-numeric data: could not convert string to float`, TR`ใช้ strategy='${st}' กับคอลัมน์ข้อความ '${c}' ไม่ได้`, TR("ใช้ strategy='most_frequent' หรือเลือกเฉพาะคอลัมน์ตัวเลข"));
        return st === 'median' ? s.median() : s.mean();
      });
      this.statistics_ = new NDArray(this._fill.slice(), [this._fill.length]);
      this.fitted = true; return this;
    }
    transform(X) {
      this._needFit('transform');
      const out = X.copy();
      X.columns.forEach((c, j) => { const s = X.col(c); if (s.nullCount()) out.set(c, s.fillna(this._fill[j])); });
      return out;
    }
  }
  class LabelEncoder extends Estimator {
    static pyName = 'LabelEncoder'; static kind = 'transformer'; static module = 'sklearn.preprocessing';
    static defaults = {};
    fit(y) { const yy = asY(y); this.classes_ = PB.uniqueSorted(yy.values); this._dt = yy.dtype; this.fitted = true; return this; }
    transform(y) {
      this._needFit('transform');
      const idx = new Map(this.classes_.map((c, i) => [PB.keyOf(c), i]));
      const vals = asY(y).values.map((v) => { const k = idx.get(PB.keyOf(v)); if (k === undefined) throw PB.err('ValueError', `y contains previously unseen labels: ${PB.repr(v)}`, TR`พบค่าใหม่ ${PB.repr(v)} ที่ไม่เคยเห็นตอน fit`); return k; });
      return new NDArray(vals, [vals.length], 'int64');
    }
    fit_transform(y) { this.fit(y); return this.transform(y); }
    inverse_transform(y) { this._needFit('inverse_transform'); const v = asY(y).values.map((i) => this.classes_[i]); return PB.labelArray(v, this._dt); }
  }

  /* ---------- Pipeline ---------- */
  class Pipeline extends Estimator {
    static pyName = 'Pipeline'; static kind = 'meta'; static module = 'sklearn.pipeline';
    static defaults = {};
    constructor(steps) { super({}); this.steps = steps; }
    get kind() { return this.steps[this.steps.length - 1].kind; }
    clone() { return new Pipeline(this.steps.map((s) => s.clone())); }
    get classes_() { return this.steps[this.steps.length - 1].classes_; }
    get final() { return this.steps[this.steps.length - 1]; }
    *fit(X, y) {
      let Z = X;
      for (let i = 0; i < this.steps.length - 1; i++) Z = yield* PB.gen(this.steps[i].fit_transform(Z, y));
      yield* PB.gen(this.final.fit(Z, y));
      this.fitted = true; return this;
    }
    _through(X) { let Z = X; for (let i = 0; i < this.steps.length - 1; i++) Z = PB.runMaybe(this.steps[i].transform(Z)); return Z; }
    predict(X) { this._needFit('predict'); return this.final.predict(this._through(X)); }
    predict_proba(X) { this._needFit('predict_proba'); return this.final.predict_proba(this._through(X)); }
    transform(X) { this._needFit('transform'); return this.final.transform(this._through(X)); }
    *fit_predict(X, y) { yield* this.fit(X, y); return this.final.labels_ || this.predict(X); }
    __repr__() {
      const names = {}; const parts = this.steps.map((s) => { let nm = s.constructor.pyName.toLowerCase(); names[nm] = (names[nm] || 0) + 1; return `('${nm}', ${s.__repr__()})`; });
      return 'Pipeline(steps=[' + parts.join(', ') + '])';
    }
  }
  /* make any value iterable for yield* : generators pass through, plain values return immediately */
  PB.gen = function* (v) { if (PB.isGen(v)) return yield* v; return v; };

  Object.assign(PB, { Transformer, StandardScaler, MinMaxScaler, RobustScaler, MaxAbsScaler, SimpleImputer, LabelEncoder, Pipeline });
})();
