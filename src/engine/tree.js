/* ThaiPyBlocks engine: decision trees (faithful port of scikit-learn's depth-first builder and
   best splitter, including its random feature order), random forests, gradient boosting,
   and isolation forest. */
(function () {
  const { Estimator, NDArray } = PB;
  const FEATURE_THRESHOLD = 1e-7;
  const EPSILON = Number.EPSILON;
  const RAND_R_MAX = 2147483647;
  const MAX_INT = 2147483647;
  const LN2 = Math.log(2);

  /* ---------- sklearn's introsort on (feature_values, samples) ---------- */
  function swap(fv, s, i, j) { let t = fv[i]; fv[i] = fv[j]; fv[j] = t; t = s[i]; s[i] = s[j]; s[j] = t; }
  function median3(fv, o, n) {
    const a = fv[o], b = fv[o + Math.floor(n / 2)], c = fv[o + n - 1];
    if (a < b) { if (b < c) return b; else if (a < c) return c; else return a; }
    else if (b < c) { if (a < c) return a; else return c; }
    else return b;
  }
  function siftDown(fv, s, o, start, end) {
    let root = start;
    for (;;) {
      const child = root * 2 + 1; let maxind = root;
      if (child < end && fv[o + maxind] < fv[o + child]) maxind = child;
      if (child + 1 < end && fv[o + maxind] < fv[o + child + 1]) maxind = child + 1;
      if (maxind === root) break;
      swap(fv, s, o + root, o + maxind); root = maxind;
    }
  }
  function heapsort(fv, s, o, n) {
    let start = Math.floor((n - 2) / 2), end = n;
    for (;;) { siftDown(fv, s, o, start, end); if (start === 0) break; start--; }
    end = n - 1;
    while (end > 0) { swap(fv, s, o, o + end); siftDown(fv, s, o, 0, end); end--; }
  }
  function introsort(fv, s, o, n, maxd) {
    while (n > 1) {
      if (maxd <= 0) { heapsort(fv, s, o, n); return; }
      maxd--;
      const pivot = median3(fv, o, n);
      let i = 0, l = 0, r = n;
      while (i < r) {
        if (fv[o + i] < pivot) { swap(fv, s, o + i, o + l); i++; l++; }
        else if (fv[o + i] > pivot) { r--; swap(fv, s, o + i, o + r); }
        else i++;
      }
      introsort(fv, s, o, l, maxd);
      o += r; n -= r;
    }
  }
  /* sklearn >= 1.4 (_partitioner.pyx): maxd = 2 * <intp_t>log2(n) */
  function sortFV(fv, s, o, n) { if (n === 0) return; introsort(fv, s, o, n, 2 * Math.trunc(Math.log2(n))); }

  /* ---------- criteria ---------- */
  class ClassCriterion {
    constructor(y, sw, nClasses, entropy) {
      this.y = y; this.sw = sw; this.K = nClasses; this.entropy = entropy;
      this.sumTotal = new Float64Array(nClasses); this.sumLeft = new Float64Array(nClasses); this.sumRight = new Float64Array(nClasses);
    }
    init(samples, start, end, wSamples) {
      this.samples = samples; this.start = start; this.end = end; this.wSamples = wSamples;
      this.sumTotal.fill(0); let wn = 0;
      const y = this.y, sw = this.sw;
      for (let p = start; p < end; p++) { const i = samples[p]; const w = sw ? sw[i] : 1; this.sumTotal[y[i]] += w; wn += w; }
      this.wNode = wn; this.reset();
    }
    reset() { this.pos = this.start; this.sumLeft.fill(0); this.sumRight.set(this.sumTotal); this.wLeft = 0; this.wRight = this.wNode; }
    reverseReset() { this.pos = this.end; this.sumRight.fill(0); this.sumLeft.set(this.sumTotal); this.wRight = 0; this.wLeft = this.wNode; }
    update(newPos) {
      const pos = this.pos, end = this.end, s = this.samples, y = this.y, sw = this.sw;
      if (newPos - pos <= end - newPos) {
        for (let p = pos; p < newPos; p++) { const i = s[p]; const w = sw ? sw[i] : 1; this.sumLeft[y[i]] += w; this.wLeft += w; }
      } else {
        this.reverseReset();
        for (let p = end - 1; p > newPos - 1; p--) { const i = s[p]; const w = sw ? sw[i] : 1; this.sumLeft[y[i]] -= w; this.wLeft -= w; }
      }
      this.wRight = this.wNode - this.wLeft;
      for (let c = 0; c < this.K; c++) this.sumRight[c] = this.sumTotal[c] - this.sumLeft[c];
      this.pos = newPos;
    }
    _imp(sum, w) {
      if (this.entropy) { let e = 0; for (let c = 0; c < this.K; c++) { let ck = sum[c]; if (ck > 0) { ck /= w; e -= ck * (Math.log(ck) / LN2); } } return e; }
      let sq = 0; for (let c = 0; c < this.K; c++) { const ck = sum[c]; sq += ck * ck; } return 1.0 - sq / (w * w);
    }
    nodeImpurity() { return this._imp(this.sumTotal, this.wNode); }
    childrenImpurity() { return [this._imp(this.sumLeft, this.wLeft), this._imp(this.sumRight, this.wRight)]; }
    proxy() { const [l, r] = this.childrenImpurity(); return -this.wRight * r - this.wLeft * l; }
    improvement(parent, l, r) { return (this.wNode / this.wSamples) * (parent - (this.wRight / this.wNode) * r - (this.wLeft / this.wNode) * l); }
    nodeValue() { return Float64Array.from(this.sumTotal); }
  }
  class RegCriterion {
    constructor(y, sw, friedman) { this.y = y; this.sw = sw; this.friedman = friedman; }
    init(samples, start, end, wSamples) {
      this.samples = samples; this.start = start; this.end = end; this.wSamples = wSamples;
      let sum = 0, sq = 0, wn = 0; const y = this.y, sw = this.sw;
      for (let p = start; p < end; p++) { const i = samples[p]; const w = sw ? sw[i] : 1; const wy = w * y[i]; sum += wy; sq += wy * y[i]; wn += w; }
      this.sumTotal = sum; this.sqSumTotal = sq; this.wNode = wn; this.reset();
    }
    reset() { this.pos = this.start; this.sumLeft = 0; this.sumRight = this.sumTotal; this.wLeft = 0; this.wRight = this.wNode; }
    reverseReset() { this.pos = this.end; this.sumRight = 0; this.sumLeft = this.sumTotal; this.wRight = 0; this.wLeft = this.wNode; }
    update(newPos) {
      const pos = this.pos, end = this.end, s = this.samples, y = this.y, sw = this.sw;
      if (newPos - pos <= end - newPos) {
        for (let p = pos; p < newPos; p++) { const i = s[p]; const w = sw ? sw[i] : 1; this.sumLeft += w * y[i]; this.wLeft += w; }
      } else {
        this.reverseReset();
        for (let p = end - 1; p > newPos - 1; p--) { const i = s[p]; const w = sw ? sw[i] : 1; this.sumLeft -= w * y[i]; this.wLeft -= w; }
      }
      this.wRight = this.wNode - this.wLeft;
      this.sumRight = this.sumTotal - this.sumLeft;
      this.pos = newPos;
    }
    nodeImpurity() { const m = this.sumTotal / this.wNode; return this.sqSumTotal / this.wNode - m * m; }
    childrenImpurity() {
      const s = this.samples, y = this.y, sw = this.sw; let sqL = 0;
      for (let p = this.start; p < this.pos; p++) { const i = s[p]; const w = sw ? sw[i] : 1; sqL += w * y[i] * y[i]; }
      const sqR = this.sqSumTotal - sqL;
      const ml = this.sumLeft / this.wLeft, mr = this.sumRight / this.wRight;
      return [sqL / this.wLeft - ml * ml, sqR / this.wRight - mr * mr];
    }
    proxy() {
      if (this.friedman) { const d = this.wRight * this.sumLeft - this.wLeft * this.sumRight; return (d * d) / (this.wLeft * this.wRight); }
      return (this.sumLeft * this.sumLeft) / this.wLeft + (this.sumRight * this.sumRight) / this.wRight;
    }
    improvement(parent, l, r) {
      if (this.friedman) { const d = this.wRight * this.sumLeft - this.wLeft * this.sumRight; return (d * d) / (this.wLeft * this.wRight * this.wNode); }
      return (this.wNode / this.wSamples) * (parent - (this.wRight / this.wNode) * r - (this.wLeft / this.wNode) * l);
    }
    nodeValue() { return Float64Array.of(this.sumTotal / this.wNode); }
  }

  /* ---------- tree builder (DepthFirstTreeBuilder + BestSplitter) ---------- */
  function buildTree(o) {
    const { Xf, n, p, crit, maxFeatures, maxDepth, minSamplesSplit, minSamplesLeaf, sw } = o;
    let randState = o.rs.randint(0, RAND_R_MAX);
    const randInt = (low, high) => {
      if (randState === 0) randState = 1;
      randState = (randState ^ (randState << 13)) >>> 0;
      randState = (randState ^ (randState >>> 17)) >>> 0;
      randState = (randState ^ (randState << 5)) >>> 0;
      return low + (randState % (RAND_R_MAX + 1)) % (high - low);
    };
    const samplesArr = []; let wSamples = 0;
    for (let i = 0; i < n; i++) { if (!sw || sw[i] !== 0) samplesArr.push(i); wSamples += sw ? sw[i] : 1; }
    const samples = Int32Array.from(samplesArr), nS = samples.length;
    const features = Int32Array.from(PB.range(p)), constF = new Int32Array(p);
    const fv = new Float32Array(nS);
    const T = { left: [], right: [], feature: [], threshold: [], value: [], impurity: [], nNode: [], wNode: [] };
    const addNode = (parent, isLeft, isLeaf, feat, thr, imp, nn, wn, val) => {
      const id = T.left.length;
      T.left.push(-1); T.right.push(-1); T.feature.push(isLeaf ? -2 : feat); T.threshold.push(isLeaf ? -2 : thr);
      T.impurity.push(imp); T.nNode.push(nn); T.wNode.push(wn); T.value.push(val);
      if (parent >= 0) { if (isLeft) T.left[parent] = id; else T.right[parent] = id; }
      return id;
    };
    const nodeSplit = (start, end, impurity, nKnownConstants) => {
      let fI = p, nVisited = 0, nFound = 0, nDrawn = 0, nTotal = nKnownConstants;
      let best = { pos: end, feature: 0, threshold: 0 }, bestProxy = -Infinity;
      while (fI > nTotal && (nVisited < maxFeatures || nVisited <= nFound + nDrawn)) {
        nVisited++;
        let fJ = randInt(nDrawn, fI - nFound);
        if (fJ < nKnownConstants) { const t = features[nDrawn]; features[nDrawn] = features[fJ]; features[fJ] = t; nDrawn++; continue; }
        fJ += nFound;
        const cf = features[fJ], col = Xf[cf];
        for (let q = start; q < end; q++) fv[q] = col[samples[q]];
        sortFV(fv, samples, start, end - start);
        if (fv[end - 1] <= fv[start] + FEATURE_THRESHOLD) {
          const t = features[fJ]; features[fJ] = features[nTotal]; features[nTotal] = t; nFound++; nTotal++; continue;
        }
        fI--; { const t = features[fI]; features[fI] = features[fJ]; features[fJ] = t; }
        crit.reset();
        let q = start;
        while (q < end) {
          while (q + 1 < end && fv[q + 1] <= fv[q] + FEATURE_THRESHOLD) q++;
          const qPrev = q; q++;
          if (q >= end) continue;
          if (q - start < minSamplesLeaf || end - q < minSamplesLeaf) continue;
          crit.update(q);
          const pr = crit.proxy();
          if (pr > bestProxy) {
            bestProxy = pr;
            let thr = fv[qPrev] / 2.0 + fv[q] / 2.0;
            if (thr === fv[q] || thr === Infinity || thr === -Infinity) thr = fv[qPrev];
            best = { pos: q, feature: cf, threshold: thr };
          }
        }
      }
      if (best.pos < end) {
        let q = start, pe = end - 1; const col = Xf[best.feature];
        while (q < pe) {
          if (col[samples[q]] <= best.threshold) q++;
          else { const t = samples[q]; samples[q] = samples[pe]; samples[pe] = t; pe--; }
        }
        crit.reset(); crit.update(best.pos);
        const [il, ir] = crit.childrenImpurity();
        best.impurityLeft = il; best.impurityRight = ir;
        best.improvement = crit.improvement(impurity, il, ir);
      }
      for (let k = 0; k < nKnownConstants; k++) features[k] = constF[k];
      for (let k = 0; k < nFound; k++) constF[nKnownConstants + k] = features[nKnownConstants + k];
      return { split: best, nConst: nTotal };
    };
    const stack = [{ start: 0, end: nS, depth: 0, parent: -1, isLeft: false, impurity: Infinity, nConst: 0 }];
    let first = true, maxDepthSeen = 0;
    while (stack.length) {
      const rec = stack.pop();
      const { start, end, depth, parent, isLeft } = rec;
      let impurity = rec.impurity;
      const nNode = end - start;
      crit.init(samples, start, end, wSamples);
      const wn = crit.wNode;
      let isLeaf = depth >= maxDepth || nNode < minSamplesSplit || nNode < 2 * minSamplesLeaf;
      if (first) { impurity = crit.nodeImpurity(); first = false; }
      isLeaf = isLeaf || impurity <= EPSILON;
      const value = crit.nodeValue();
      let res = null;
      if (!isLeaf) {
        res = nodeSplit(start, end, impurity, rec.nConst);
        isLeaf = res.split.pos >= end || res.split.improvement + EPSILON < 0;
      }
      const id = addNode(parent, isLeft, isLeaf, res ? res.split.feature : -2, res ? res.split.threshold : -2, impurity, nNode, wn, value);
      if (!isLeaf) {
        const sp = res.split;
        stack.push({ start: sp.pos, end, depth: depth + 1, parent: id, isLeft: false, impurity: sp.impurityRight, nConst: res.nConst });
        stack.push({ start, end: sp.pos, depth: depth + 1, parent: id, isLeft: true, impurity: sp.impurityLeft, nConst: res.nConst });
      }
      if (depth > maxDepthSeen) maxDepthSeen = depth;
    }
    T.maxDepth = maxDepthSeen; T.nFeatures = p; T.samples = samples;
    return T;
  }
  function applyTree(T, row) {
    let node = 0;
    while (T.left[node] !== -1) node = Math.fround(row[T.feature[node]]) <= T.threshold[node] ? T.left[node] : T.right[node];
    return node;
  }
  function treeImportances(T) {
    const imp = new Float64Array(T.nFeatures);
    for (let i = 0; i < T.left.length; i++) {
      const l = T.left[i], r = T.right[i];
      if (l !== -1) imp[T.feature[i]] += T.wNode[i] * T.impurity[i] - T.wNode[l] * T.impurity[l] - T.wNode[r] * T.impurity[r];
    }
    for (let j = 0; j < imp.length; j++) imp[j] /= T.wNode[0];
    const s = imp.reduce((a, b) => a + b, 0);
    if (s > 0) for (let j = 0; j < imp.length; j++) imp[j] /= s;
    return imp;
  }
  function toColumnsF32(rows, p) { return PB.range(p).map((j) => Float32Array.from(rows, (r) => r[j])); }
  const parseMaxFeatures = (mf, p, defaultAll) => {
    if (mf === null || mf === undefined || mf === 'None') return p;
    if (mf === 'sqrt') return Math.max(1, Math.trunc(Math.sqrt(p)));
    if (mf === 'log2') return Math.max(1, Math.trunc(Math.log2(p)));
    if (typeof mf === 'number' && !Number.isInteger(mf)) return Math.max(1, Math.trunc(mf * p));
    if (typeof mf === 'number' && mf === 1 && defaultAll) return p;
    return Math.min(p, mf);
  };
  const depthParam = (d) => (d === null || d === undefined || d === 'None' ? MAX_INT : d);

  /* ---------- DecisionTree ---------- */
  class TreeBase extends Estimator {
    _fitTree(rows, target, sw, rs, crit) {
      const p = rows[0].length;
      return buildTree({ Xf: this._Xf || toColumnsF32(rows, p), n: rows.length, p, crit, sw, rs,
        maxFeatures: parseMaxFeatures(this.params.max_features, p, this.kind === 'regressor'),
        maxDepth: depthParam(this.params.max_depth), minSamplesSplit: Math.max(this.params.min_samples_split || 2, 2 * (this.params.min_samples_leaf || 1)), minSamplesLeaf: this.params.min_samples_leaf || 1 });
    }
    get feature_importances_() { this._needFit('feature_importances_'); return PB.floatArray(this._importances()); }
    get_depth() { return this.tree_.maxDepth; }
    get_n_leaves() { return this.tree_.left.filter((l) => l === -1).length; }
  }
  class DecisionTreeClassifier extends TreeBase {
    static pyName = 'DecisionTreeClassifier'; static kind = 'classifier'; static module = 'sklearn.tree';
    static defaults = { criterion: 'gini', max_depth: null, min_samples_split: 2, min_samples_leaf: 1, max_features: null, random_state: null };
    fit(X, y, sampleWeight = null) {
      const m = this._xFit(X); this._checkClassifTarget(y);
      const yi = Int32Array.from(this._encodeY(y));
      if (yi.length !== m.n) throw PB.lenErr(m.n, yi.length);
      const rs = PB.checkRandomState(this.params.random_state);
      const crit = new ClassCriterion(yi, sampleWeight, this.classes_.length, this.params.criterion === 'entropy');
      this.tree_ = this._fitTree(m.rows, yi, sampleWeight, rs, crit);
      this.fitted = true; return this;
    }
    _proba(rows) { const T = this.tree_; return rows.map((r) => { const v = T.value[applyTree(T, r)]; const s = v.reduce((a, b) => a + b, 0) || 1; return Array.from(v, (x) => x / s); }); }
    predict_proba(X) { this._needFit('predict_proba'); const m = this._xPred(X); const P = this._proba(m.rows); return new NDArray(P, [P.length, this.classes_.length], 'float64'); }
    predict(X) { const P = this.predict_proba(X).data; return this._decode(P.map(argmax)); }
    apply(X) { const m = this._xPred(X); return new NDArray(m.rows.map((r) => applyTree(this.tree_, r)), [m.n], 'int64'); }
    _importances() { return treeImportances(this.tree_); }
  }
  class DecisionTreeRegressor extends TreeBase {
    static pyName = 'DecisionTreeRegressor'; static kind = 'regressor'; static module = 'sklearn.tree';
    static defaults = { criterion: 'squared_error', max_depth: null, min_samples_split: 2, min_samples_leaf: 1, max_features: null, random_state: null };
    fit(X, y, sampleWeight = null, rsOverride = null) {
      const m = this._xFit(X); const yv = this._yFloat(y);
      if (yv.length !== m.n) throw PB.lenErr(m.n, yv.length);
      const rs = rsOverride || PB.checkRandomState(this.params.random_state);
      const crit = new RegCriterion(yv, sampleWeight, this.params.criterion === 'friedman_mse');
      this.tree_ = this._fitTree(m.rows, yv, sampleWeight, rs, crit);
      this.fitted = true; return this;
    }
    _predRows(rows) { const T = this.tree_; return rows.map((r) => T.value[applyTree(T, r)][0]); }
    predict(X) { this._needFit(); const m = this._xPred(X); return PB.floatArray(this._predRows(m.rows)); }
    _importances() { return treeImportances(this.tree_); }
  }
  function argmax(a) { let b = 0; for (let k = 1; k < a.length; k++) if (a[k] > a[b]) b = k; return b; }

  /* ---------- Random forests ---------- */
  class ForestBase extends Estimator {
    *fit(X, y) {
      const m = this._xFit(X);
      const isCls = this.kind === 'classifier';
      let target;
      if (isCls) { this._checkClassifTarget(y); target = Int32Array.from(this._encodeY(y)); } else target = this._yFloat(y);
      if (target.length !== m.n) throw PB.lenErr(m.n, target.length);
      const rs = PB.checkRandomState(this.params.random_state);
      const nT = this.params.n_estimators;
      if (!(nT >= 1)) throw PB.err('ValueError', 'n_estimators must be >= 1', TR('n_estimators ต้องมีค่าอย่างน้อย 1'));
      const seeds = PB.range(nT).map(() => rs.randint(MAX_INT));
      const Xf = toColumnsF32(m.rows, m.p);
      this.estimators_ = [];
      const TreeCls = isCls ? DecisionTreeClassifier : DecisionTreeRegressor;
      for (let t = 0; t < nT; t++) {
        const tree = new TreeCls({ criterion: this.params.criterion, max_depth: this.params.max_depth, min_samples_split: this.params.min_samples_split, min_samples_leaf: this.params.min_samples_leaf, max_features: this.params.max_features, random_state: seeds[t] });
        let sw = null;
        if (this.params.bootstrap !== false) {
          const brs = new PB.RandomState(seeds[t]);
          sw = new Float64Array(m.n);
          for (let i = 0; i < m.n; i++) sw[brs.interval(m.n - 1)] += 1;
        }
        tree._Xf = Xf; tree.n_features_in_ = m.p; tree.feature_names_in_ = m.names;
        if (isCls) { tree.classes_ = this.classes_; tree._yDtype = this._yDtype; }
        const crit = isCls ? new ClassCriterion(target, sw, this.classes_.length, this.params.criterion === 'entropy') : new RegCriterion(target, sw, this.params.criterion === 'friedman_mse');
        tree.tree_ = tree._fitTree(m.rows, target, sw, new PB.RandomState(seeds[t]), crit);
        tree.fitted = true; tree._Xf = null;
        this.estimators_.push(tree);
        if (t % 4 === 3) yield { progress: TR`ต้นไม้ ${t + 1}/${nT}`, frac: (t + 1) / nT };
      }
      this.fitted = true; return this;
    }
    get feature_importances_() {
      this._needFit('feature_importances_');
      const all = this.estimators_.filter((t) => t.tree_.left.length > 1).map((t) => treeImportances(t.tree_));
      const p = this.n_features_in_;
      if (!all.length) return PB.floatArray(new Float64Array(p));
      const mean = new Float64Array(p); for (const a of all) for (let j = 0; j < p; j++) mean[j] += a[j] / all.length;
      const s = mean.reduce((a, b) => a + b, 0);
      return PB.floatArray(Array.from(mean, (v) => v / s));
    }
  }
  class RandomForestClassifier extends ForestBase {
    static pyName = 'RandomForestClassifier'; static kind = 'classifier'; static module = 'sklearn.ensemble';
    static defaults = { n_estimators: 100, criterion: 'gini', max_depth: null, min_samples_split: 2, min_samples_leaf: 1, max_features: 'sqrt', bootstrap: true, random_state: null };
    predict_proba(X) {
      this._needFit('predict_proba'); const m = this._xPred(X);
      const K = this.classes_.length, P = m.rows.map(() => new Float64Array(K));
      for (const t of this.estimators_) { const pr = t._proba(m.rows); for (let i = 0; i < P.length; i++) for (let k = 0; k < K; k++) P[i][k] += pr[i][k]; }
      const nT = this.estimators_.length;
      return new NDArray(P.map((r) => Array.from(r, (v) => v / nT)), [P.length, K], 'float64');
    }
    predict(X) { return this._decode(this.predict_proba(X).data.map(argmax)); }
  }
  class RandomForestRegressor extends ForestBase {
    static pyName = 'RandomForestRegressor'; static kind = 'regressor'; static module = 'sklearn.ensemble';
    static defaults = { n_estimators: 100, criterion: 'squared_error', max_depth: null, min_samples_split: 2, min_samples_leaf: 1, max_features: 1.0, bootstrap: true, random_state: null };
    predict(X) {
      this._needFit(); const m = this._xPred(X);
      const out = new Float64Array(m.n);
      for (const t of this.estimators_) { const pr = t._predRows(m.rows); for (let i = 0; i < m.n; i++) out[i] += pr[i]; }
      return PB.floatArray(Array.from(out, (v) => v / this.estimators_.length));
    }
  }

  /* ---------- Gradient boosting ---------- */
  const expit = (z) => 1 / (1 + Math.exp(-z));
  /* scipy.special.logit: plain formula away from 0.5, log1p form near it */
  const logit = (x) => { if (x < 0.3 || x > 0.65) return Math.log(x / (1 - x)); const s = 2 * (x - 0.5); return Math.log1p(s) - Math.log1p(-s); };
  /* sklearn _loss: cgradient_half_binomial */
  const gradHalfBinomial = (y, r) => { if (r > -37) { const e = Math.exp(-r); return ((1 - y) - y * e) / (1 + e); } return Math.exp(r) - y; };
  class GBBase extends Estimator {
    _newTree() { return new DecisionTreeRegressor({ criterion: 'friedman_mse', max_depth: this.params.max_depth, min_samples_split: this.params.min_samples_split, min_samples_leaf: this.params.min_samples_leaf, max_features: this.params.max_features }); }
    _treeFit(tree, rows, Xf, target, rs) {
      tree._Xf = Xf; tree.n_features_in_ = rows[0].length;
      tree.tree_ = tree._fitTree(rows, target, null, rs, new RegCriterion(target, null, true));
      tree._Xf = null; tree.fitted = true; return tree;
    }
    get feature_importances_() {
      this._needFit('feature_importances_');
      const p = this.n_features_in_, rel = [];
      for (const stage of this.estimators_) for (const t of stage) {
        const T = t.tree_; if (T.left.length <= 1) continue;
        const imp = new Float64Array(p);
        for (let i = 0; i < T.left.length; i++) { const l = T.left[i], r = T.right[i]; if (l !== -1) imp[T.feature[i]] += T.wNode[i] * T.impurity[i] - T.wNode[l] * T.impurity[l] - T.wNode[r] * T.impurity[r]; }
        for (let j = 0; j < p; j++) imp[j] /= T.wNode[0];
        rel.push(imp);
      }
      if (!rel.length) return PB.floatArray(new Float64Array(p));
      const avg = new Float64Array(p); for (const a of rel) for (let j = 0; j < p; j++) avg[j] += a[j] / rel.length;
      const s = avg.reduce((a, b) => a + b, 0);
      return PB.floatArray(Array.from(avg, (v) => v / s));
    }
  }
  class GradientBoostingRegressor extends GBBase {
    static pyName = 'GradientBoostingRegressor'; static kind = 'regressor'; static module = 'sklearn.ensemble';
    static defaults = { n_estimators: 100, learning_rate: 0.1, max_depth: 3, min_samples_split: 2, min_samples_leaf: 1, max_features: null, random_state: null };
    *fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y), n = m.n;
      if (yv.length !== n) throw PB.lenErr(n, yv.length);
      const rs = PB.checkRandomState(this.params.random_state), Xf = toColumnsF32(m.rows, m.p);
      /* DummyRegressor(strategy="mean"): np.average(y, weights=ones) uses numpy's pairwise sum */
      this._init = PB.npSum(Array.from(yv)) / n;
      const raw = new Float64Array(n).fill(this._init), lr = this.params.learning_rate;
      this.estimators_ = [];
      for (let s = 0; s < this.params.n_estimators; s++) {
        const res = Float64Array.from(yv, (v, i) => v - raw[i]);
        const tree = this._treeFit(this._newTree(), m.rows, Xf, res, rs);
        const T = tree.tree_;
        for (let i = 0; i < n; i++) raw[i] += lr * T.value[applyTree(T, m.rows[i])][0];
        this.estimators_.push([tree]);
        if (s % 10 === 9) yield { progress: TR`รอบที่ ${s + 1}/${this.params.n_estimators}`, frac: (s + 1) / this.params.n_estimators };
      }
      this.fitted = true; return this;
    }
    predict(X) {
      this._needFit(); const m = this._xPred(X), lr = this.params.learning_rate;
      return PB.floatArray(m.rows.map((r) => { let v = this._init; for (const [t] of this.estimators_) v += lr * t.tree_.value[applyTree(t.tree_, r)][0]; return v; }));
    }
  }
  class GradientBoostingClassifier extends GBBase {
    static pyName = 'GradientBoostingClassifier'; static kind = 'classifier'; static module = 'sklearn.ensemble';
    static defaults = { n_estimators: 100, learning_rate: 0.1, max_depth: 3, min_samples_split: 2, min_samples_leaf: 1, max_features: null, random_state: null };
    *fit(X, y) {
      const m = this._xFit(X); this._checkClassifTarget(y);
      const yi = this._encodeY(y), n = m.n, K = this.classes_.length;
      if (yi.length !== n) throw PB.lenErr(n, yi.length);
      const rs = PB.checkRandomState(this.params.random_state), Xf = toColumnsF32(m.rows, m.p), lr = this.params.learning_rate;
      /* Mirrors scikit-learn 1.8 step by step (same float64 operations in the same order):
         DummyClassifier(strategy="prior") → np.clip(p, eps, 1 - eps) → link (scipy logit / log(p / gmean(p))),
         the Cython loss gradients, and the Newton leaf update with np.average (pairwise sums). */
      const eps = Number.EPSILON;
      const clip = (v) => Math.min(Math.max(v, eps), 1 - eps);
      const nT = K === 2 ? 1 : K;
      const raw = PB.range(n).map(() => new Float64Array(nT));
      const counts = new Array(K).fill(0); for (const v of yi) counts[v]++;
      if (K === 2) this._init = [logit(clip(counts[1] / n))];
      else {
        const pr = counts.map((c) => clip(c / n));
        const gm = Math.exp(PB.npSum(pr.map(Math.log)) / K);   /* scipy.stats.gmean */
        this._init = pr.map((p) => Math.log(p / gm));
      }
      for (const r of raw) r.set(this._init);
      this.estimators_ = [];
      for (let s = 0; s < this.params.n_estimators; s++) {
        /* negative gradient, computed once per stage from the raw predictions at its start */
        const neg = PB.range(nT).map(() => new Float64Array(n));
        if (K === 2) for (let i = 0; i < n; i++) neg[0][i] = -gradHalfBinomial(yi[i] === 1 ? 1 : 0, raw[i][0]);
        else {
          const p = new Float64Array(K);
          for (let i = 0; i < n; i++) {
            const r = raw[i]; let mx = r[0];
            for (let k = 1; k < K; k++) if (mx < r[k]) mx = r[k];
            let se = 0; for (let k = 0; k < K; k++) { p[k] = Math.exp(r[k] - mx); se += p[k]; }
            for (let k = 0; k < K; k++) neg[k][i] = -(p[k] / se - (yi[i] === k ? 1 : 0));
          }
        }
        const stage = [];
        for (let k = 0; k < nT; k++) {
          const tree = this._treeFit(this._newTree(), m.rows, Xf, neg[k], rs);
          const T = tree.tree_;
          const leafOf = m.rows.map((r) => applyTree(T, r));
          const members = new Map();
          for (let i = 0; i < n; i++) { const lf = leafOf[i]; if (!members.has(lf)) members.set(lf, []); members.get(lf).push(i); }
          for (const [lf, idx] of members) {
            const g = idx.map((i) => neg[k][i]);
            const prob = idx.map((i, j) => (K === 2 ? (yi[i] === 1 ? 1 : 0) : (yi[i] === k ? 1 : 0)) - g[j]);
            let nu = PB.npSum(g) / idx.length;
            if (K > 2) nu *= (K - 1) / K;
            const de = PB.npSum(prob.map((q) => q * (1 - q))) / idx.length;
            T.value[lf] = Float64Array.of(Math.abs(de) < 1e-150 ? 0 : nu / de);   /* _safe_divide */
          }
          for (let i = 0; i < n; i++) raw[i][k] += lr * T.value[leafOf[i]][0];
          stage.push(tree);
        }
        this.estimators_.push(stage);
        if (s % 10 === 9) yield { progress: TR`รอบที่ ${s + 1}/${this.params.n_estimators}`, frac: (s + 1) / this.params.n_estimators };
      }
      this.fitted = true; return this;
    }
    decision_function(X) {
      this._needFit('decision_function'); const m = this._xPred(X), lr = this.params.learning_rate;
      return m.rows.map((r) => { const v = Float64Array.from(this._init); for (const stage of this.estimators_) stage.forEach((t, k) => { v[k] += lr * t.tree_.value[applyTree(t.tree_, r)][0]; }); return v; });
    }
    predict_proba(X) {
      const R = this.decision_function(X);
      /* binary: expit; multiclass: sklearn.utils.extmath.softmax (subtract row max, exp, divide by the row sum) */
      const P = R.map((v) => { if (v.length === 1) { const p = expit(v[0]); return [1 - p, p]; } const mx = Math.max(...v); const e = Array.from(v, (x) => Math.exp(x - mx)); const s = PB.npSum(e); return e.map((x) => x / s); });
      return new NDArray(P, [P.length, this.classes_.length], 'float64');
    }
    predict(X) { return this._decode(this.predict_proba(X).data.map(argmax)); }
  }

  /* ---------- Isolation forest ---------- */
  const cFactor = (n) => (n <= 1 ? 0 : n === 2 ? 1 : 2 * (Math.log(n - 1) + 0.5772156649015329) - (2 * (n - 1)) / n);
  class IsolationForest extends Estimator {
    static pyName = 'IsolationForest'; static kind = 'outlier'; static module = 'sklearn.ensemble';
    static defaults = { n_estimators: 100, contamination: 'auto', random_state: null };
    *fit(X) {
      const m = this._xFit(X), n = m.n, rs = PB.checkRandomState(this.params.random_state);
      const psi = Math.min(256, n), maxDepth = Math.ceil(Math.log2(Math.max(psi, 2)));
      this._psi = psi; this.trees_ = [];
      for (let t = 0; t < this.params.n_estimators; t++) {
        const idx = rs.choiceNoReplace(n, psi);
        const build = (ids, depth) => {
          if (depth >= maxDepth || ids.length <= 1) return { size: ids.length };
          const cand = [];
          for (let j = 0; j < m.p; j++) { let lo = Infinity, hi = -Infinity; for (const i of ids) { const v = m.rows[i][j]; if (v < lo) lo = v; if (v > hi) hi = v; } if (hi > lo) cand.push([j, lo, hi]); }
          if (!cand.length) return { size: ids.length };
          const [j, lo, hi] = cand[rs.randint(cand.length)];
          const thr = lo + (hi - lo) * rs.random();
          const L = ids.filter((i) => m.rows[i][j] < thr), R = ids.filter((i) => m.rows[i][j] >= thr);
          return { j, thr, l: build(L, depth + 1), r: build(R, depth + 1) };
        };
        this.trees_.push(build(idx, 0));
        if (t % 10 === 9) yield { progress: TR`ต้นไม้ ${t + 1}/${this.params.n_estimators}`, frac: (t + 1) / this.params.n_estimators };
      }
      this.fitted = true;
      const c = this.params.contamination;
      if (c === 'auto') this.offset_ = -0.5;
      else { const sc = this._scores(m.rows).slice().sort((a, b) => a - b); this.offset_ = PB.stats.quantile(sc, c); }
      return this;
    }
    _scores(rows) {
      const cn = cFactor(this._psi);
      return rows.map((r) => {
        let tot = 0;
        for (const tr of this.trees_) { let node = tr, d = 0; while (node.l) { node = r[node.j] < node.thr ? node.l : node.r; d++; } tot += d + cFactor(node.size); }
        return -Math.pow(2, -(tot / this.trees_.length) / cn);
      });
    }
    score_samples(X) { this._needFit('score_samples'); return PB.floatArray(this._scores(this._xPred(X).rows)); }
    decision_function(X) { return PB.floatArray(Array.from(this.score_samples(X).data, (v) => v - this.offset_)); }
    predict(X) { return new NDArray(Array.from(this.decision_function(X).data, (v) => (v < 0 ? -1 : 1)), [PB.nRows(X)], 'int64'); }
    *fit_predict(X) { yield* this.fit(X); return this.predict(X); }
  }

  PB.treeInternals = { buildTree, applyTree, sortFV, ClassCriterion, RegCriterion };
  Object.assign(PB, { DecisionTreeClassifier, DecisionTreeRegressor, RandomForestClassifier, RandomForestRegressor, GradientBoostingClassifier, GradientBoostingRegressor, IsolationForest });
})();
