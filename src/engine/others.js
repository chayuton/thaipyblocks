/* ThaiPyBlocks engine: nearest neighbours, naive Bayes, support vector machines (libsvm SMO port),
   and multi-layer perceptrons (sklearn's Adam training loop). */
(function () {
  const { Estimator, NDArray } = PB;
  const argmax = (a) => { let b = 0; for (let k = 1; k < a.length; k++) if (a[k] > a[b]) b = k; return b; };
  const sqdist = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) { const d = a[j] - b[j]; s += d * d; } return s; };

  /* ---------- k nearest neighbours ---------- */
  class KNNBase extends Estimator {
    static module = 'sklearn.neighbors';
    _neighbors(rows) {
      const k = this.params.n_neighbors, tr = this._rows;
      if (k > tr.length) throw PB.err('ValueError', `Expected n_neighbors <= n_samples_fit, but n_neighbors = ${k}, n_samples_fit = ${tr.length}`, TR`n_neighbors (${k}) มากกว่าจำนวนข้อมูลฝึก (${tr.length})`);
      return rows.map((r) => {
        const d = tr.map((t, i) => [sqdist(r, t), i]);
        d.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return d.slice(0, k).map(([dd, i]) => [Math.sqrt(dd), i]);
      });
    }
    _weights(nb) {
      if (this.params.weights !== 'distance') return nb.map(() => 1);
      if (nb.some(([d]) => d === 0)) return nb.map(([d]) => (d === 0 ? 1 : 0));
      return nb.map(([d]) => 1 / d);
    }
    kneighbors(X) {
      this._needFit('kneighbors'); const m = this._xPred(X); const nb = this._neighbors(m.rows);
      return new PB.Tuple([new NDArray(nb.map((r) => r.map((x) => x[0])), [nb.length, this.params.n_neighbors], 'float64'), new NDArray(nb.map((r) => r.map((x) => x[1])), [nb.length, this.params.n_neighbors], 'int64')]);
    }
  }
  class KNeighborsClassifier extends KNNBase {
    static pyName = 'KNeighborsClassifier'; static kind = 'classifier';
    static defaults = { n_neighbors: 5, weights: 'uniform' };
    fit(X, y) { const m = this._xFit(X); this._checkClassifTarget(y); this._y = this._encodeY(y); if (this._y.length !== m.n) throw PB.lenErr(m.n, this._y.length); this._rows = m.rows; this.fitted = true; return this; }
    predict_proba(X) {
      this._needFit('predict_proba'); const m = this._xPred(X), K = this.classes_.length;
      const P = this._neighbors(m.rows).map((nb) => { const w = this._weights(nb); const v = new Array(K).fill(0); nb.forEach(([, i], t) => { v[this._y[i]] += w[t]; }); const s = v.reduce((a, b) => a + b, 0) || 1; return v.map((x) => x / s); });
      return new NDArray(P, [P.length, K], 'float64');
    }
    predict(X) { return this._decode(this.predict_proba(X).data.map(argmax)); }
  }
  class KNeighborsRegressor extends KNNBase {
    static pyName = 'KNeighborsRegressor'; static kind = 'regressor';
    static defaults = { n_neighbors: 5, weights: 'uniform' };
    fit(X, y) { const m = this._xFit(X); this._y = this._yFloat(y); if (this._y.length !== m.n) throw PB.lenErr(m.n, this._y.length); this._rows = m.rows; this.fitted = true; return this; }
    predict(X) {
      this._needFit(); const m = this._xPred(X);
      return PB.floatArray(this._neighbors(m.rows).map((nb) => { const w = this._weights(nb); let s = 0, ws = 0; nb.forEach(([, i], t) => { s += w[t] * this._y[i]; ws += w[t]; }); return s / ws; }));
    }
  }

  /* ---------- naive Bayes ---------- */
  class GaussianNB extends Estimator {
    static pyName = 'GaussianNB'; static kind = 'classifier'; static module = 'sklearn.naive_bayes';
    static defaults = { var_smoothing: 1e-9 };
    fit(X, y) {
      const m = this._xFit(X); this._checkClassifTarget(y); const yi = this._encodeY(y), K = this.classes_.length, p = m.p, n = m.n;
      if (yi.length !== n) throw PB.lenErr(n, yi.length);
      const gm = PB.linalg.colMeans(m.rows, p); let maxVar = 0;
      for (let j = 0; j < p; j++) { let s = 0; for (const r of m.rows) s += (r[j] - gm[j]) ** 2; maxVar = Math.max(maxVar, s / n); }
      const eps = this.params.var_smoothing * maxVar;
      this.theta_ = []; this.var_ = []; const cnt = new Array(K).fill(0);
      for (let k = 0; k < K; k++) {
        const rows = m.rows.filter((_, i) => yi[i] === k); cnt[k] = rows.length;
        const mu = PB.linalg.colMeans(rows, p), v = new Float64Array(p);
        for (const r of rows) for (let j = 0; j < p; j++) v[j] += (r[j] - mu[j]) ** 2;
        for (let j = 0; j < p; j++) v[j] = v[j] / rows.length + eps;
        this.theta_.push(mu); this.var_.push(v);
      }
      this.class_count_ = PB.floatArray(cnt); this.class_prior_ = PB.floatArray(cnt.map((c) => c / n));
      this._logPrior = cnt.map((c) => Math.log(c / n)); this.epsilon_ = eps;
      this.fitted = true; return this;
    }
    _jll(rows) {
      return rows.map((r) => this._logPrior.map((lp, k) => {
        const mu = this.theta_[k], v = this.var_[k]; let a = 0, b = 0;
        for (let j = 0; j < r.length; j++) { a += Math.log(2 * Math.PI * v[j]); b += (r[j] - mu[j]) ** 2 / v[j]; }
        return lp - 0.5 * a - 0.5 * b;
      }));
    }
    predict_proba(X) { this._needFit('predict_proba'); const J = this._jll(this._xPred(X).rows); return new NDArray(J.map(softmax), [J.length, this.classes_.length], 'float64'); }
    predict(X) { this._needFit(); return this._decode(this._jll(this._xPred(X).rows).map(argmax)); }
  }
  function softmax(z) { const mx = Math.max(...z); const e = z.map((v) => Math.exp(v - mx)); const s = e.reduce((a, b) => a + b, 0); return e.map((v) => v / s); }
  class MultinomialNB extends Estimator {
    static pyName = 'MultinomialNB'; static kind = 'classifier'; static module = 'sklearn.naive_bayes';
    static defaults = { alpha: 1.0 };
    fit(X, y) {
      const m = this._xFit(X); this._checkClassifTarget(y); const yi = this._encodeY(y), K = this.classes_.length, p = m.p;
      if (yi.length !== m.n) throw PB.lenErr(m.n, yi.length);
      for (const r of m.rows) for (const v of r) if (v < 0) throw PB.err('ValueError', 'Negative values in data passed to MultinomialNB (input X).', TR('MultinomialNB รับเฉพาะค่าที่ไม่ติดลบ'), TR('อย่าใช้ StandardScaler กับ MultinomialNB หรือใช้ GaussianNB แทน'));
      const fc = PB.range(K).map(() => new Float64Array(p)), cc = new Array(K).fill(0);
      m.rows.forEach((r, i) => { const k = yi[i]; cc[k]++; for (let j = 0; j < p; j++) fc[k][j] += r[j]; });
      const a = this.params.alpha;
      this._flp = fc.map((row) => { const tot = row.reduce((s, v) => s + v + a, 0); return row.map((v) => Math.log(v + a) - Math.log(tot)); });
      const n = cc.reduce((s, v) => s + v, 0);
      this._clp = cc.map((c) => Math.log(c) - Math.log(n));
      this.class_count_ = PB.floatArray(cc); this.feature_count_ = new NDArray(fc.map((r) => Array.from(r)), [K, p], 'float64');
      this.feature_log_prob_ = new NDArray(this._flp.map((r) => Array.from(r)), [K, p], 'float64');
      this.fitted = true; return this;
    }
    _jll(rows) { return rows.map((r) => this._clp.map((c, k) => { let s = c; const f = this._flp[k]; for (let j = 0; j < r.length; j++) if (r[j]) s += r[j] * f[j]; return s; })); }
    predict_proba(X) { this._needFit('predict_proba'); const J = this._jll(this._xPred(X).rows); return new NDArray(J.map(softmax), [J.length, this.classes_.length], 'float64'); }
    predict(X) { this._needFit(); return this._decode(this._jll(this._xPred(X).rows).map(argmax)); }
  }

  /* ---------- SVM: libsvm SMO (WSS2) ---------- */
  function kernelFn(params, nFeat, gammaVal) {
    const k = params.kernel, g = gammaVal, c0 = params.coef0 || 0, deg = params.degree || 3;
    const dotp = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };
    if (k === 'linear') return dotp;
    if (k === 'poly') return (a, b) => Math.pow(g * dotp(a, b) + c0, deg);
    if (k === 'sigmoid') return (a, b) => Math.tanh(g * dotp(a, b) + c0);
    return (a, b) => Math.exp(-g * sqdist(a, b));
  }
  function* smo(l, Qrow, QD, p, y, C, eps, label) {
    const TAU = 1e-12, alpha = new Float64Array(l), G = Float64Array.from(p);
    const isUpper = (i) => alpha[i] >= C, isLower = (i) => alpha[i] <= 0;
    let iter = 0; const maxIter = Math.max(10000000, 100 * l);
    while (iter < maxIter) {
      let Gmax = -Infinity, Gmax2 = -Infinity, gi = -1, gj = -1, objMin = Infinity;
      for (let t = 0; t < l; t++) {
        if (y[t] === 1) { if (!isUpper(t) && -G[t] >= Gmax) { Gmax = -G[t]; gi = t; } }
        else if (!isLower(t) && G[t] >= Gmax) { Gmax = G[t]; gi = t; }
      }
      const i = gi; const Qi = i !== -1 ? Qrow(i) : null;
      for (let j = 0; j < l; j++) {
        if (y[j] === 1) {
          if (!isLower(j)) {
            const gd = Gmax + G[j]; if (G[j] >= Gmax2) Gmax2 = G[j];
            if (gd > 0) { let q = QD[i] + QD[j] - 2 * y[i] * Qi[j]; const obj = q > 0 ? -(gd * gd) / q : -(gd * gd) / TAU; if (obj <= objMin) { gj = j; objMin = obj; } }
          }
        } else if (!isUpper(j)) {
          const gd = Gmax - G[j]; if (-G[j] >= Gmax2) Gmax2 = -G[j];
          if (gd > 0) { let q = QD[i] + QD[j] + 2 * y[i] * Qi[j]; const obj = q > 0 ? -(gd * gd) / q : -(gd * gd) / TAU; if (obj <= objMin) { gj = j; objMin = obj; } }
        }
      }
      if (Gmax + Gmax2 < eps || gj === -1) break;
      iter++;
      const j = gj, Qj = Qrow(j);
      const oi = alpha[i], oj = alpha[j];
      if (y[i] !== y[j]) {
        let q = QD[i] + QD[j] + 2 * Qi[j]; if (q <= 0) q = TAU;
        const delta = (-G[i] - G[j]) / q, diff = alpha[i] - alpha[j];
        alpha[i] += delta; alpha[j] += delta;
        if (diff > 0) { if (alpha[j] < 0) { alpha[j] = 0; alpha[i] = diff; } } else if (alpha[i] < 0) { alpha[i] = 0; alpha[j] = -diff; }
        if (diff > 0) { if (alpha[i] > C) { alpha[i] = C; alpha[j] = C - diff; } } else if (alpha[j] > C) { alpha[j] = C; alpha[i] = C + diff; }
      } else {
        let q = QD[i] + QD[j] - 2 * Qi[j]; if (q <= 0) q = TAU;
        const delta = (G[i] - G[j]) / q, sum = alpha[i] + alpha[j];
        alpha[i] -= delta; alpha[j] += delta;
        if (sum > C) { if (alpha[i] > C) { alpha[i] = C; alpha[j] = sum - C; } } else if (alpha[j] < 0) { alpha[j] = 0; alpha[i] = sum; }
        if (sum > C) { if (alpha[j] > C) { alpha[j] = C; alpha[i] = sum - C; } } else if (alpha[i] < 0) { alpha[i] = 0; alpha[j] = sum; }
      }
      const dai = alpha[i] - oi, daj = alpha[j] - oj;
      for (let k = 0; k < l; k++) G[k] += Qi[k] * dai + Qj[k] * daj;
      if (iter % 2000 === 0) yield { progress: label + TR` (รอบ ${iter})` };
    }
    let nFree = 0, ub = Infinity, lb = -Infinity, sumFree = 0;
    for (let i = 0; i < l; i++) {
      const yG = y[i] * G[i];
      if (isUpper(i)) { if (y[i] === -1) ub = Math.min(ub, yG); else lb = Math.max(lb, yG); }
      else if (isLower(i)) { if (y[i] === 1) ub = Math.min(ub, yG); else lb = Math.max(lb, yG); }
      else { nFree++; sumFree += yG; }
    }
    return { alpha, rho: nFree > 0 ? sumFree / nFree : (ub + lb) / 2, iter };
  }
  function makeQ(rows, sign, kfun, idxMap) {
    const l = sign.length, cache = new Map();
    const QD = new Float64Array(l);
    for (let i = 0; i < l; i++) QD[i] = kfun(rows[idxMap(i)], rows[idxMap(i)]);
    const Qrow = (i) => {
      let r = cache.get(i);
      if (r) return r;
      r = new Float64Array(l); const xi = rows[idxMap(i)], si = sign[i];
      for (let j = 0; j < l; j++) r[j] = si * sign[j] * kfun(xi, rows[idxMap(j)]);
      if (cache.size > 2500) cache.delete(cache.keys().next().value);
      cache.set(i, r); return r;
    };
    return { Qrow, QD };
  }
  function gammaValue(params, rows) {
    const g = params.gamma ?? 'scale', p = rows[0].length;
    if (g === 'scale') { let s = 0, s2 = 0, c = 0; for (const r of rows) for (const v of r) { s += v; s2 += v * v; c++; } const vr = s2 / c - (s / c) ** 2; return vr !== 0 ? 1 / (p * vr) : 1; }
    if (g === 'auto') return 1 / p;
    return g;
  }
  class SVC extends Estimator {
    static pyName = 'SVC'; static kind = 'classifier'; static module = 'sklearn.svm';
    static defaults = { C: 1.0, kernel: 'rbf', degree: 3, gamma: 'scale', coef0: 0.0 };
    *fit(X, y) {
      const m = this._xFit(X); this._checkClassifTarget(y); const yi = this._encodeY(y), K = this.classes_.length;
      if (yi.length !== m.n) throw PB.lenErr(m.n, yi.length);
      this._gamma = gammaValue(this.params, m.rows); const kf = kernelFn(this.params, m.p, this._gamma); this._kf = kf;
      const byClass = PB.range(K).map((k) => PB.range(m.n).filter((i) => yi[i] === k));
      this._models = []; let pairNo = 0; const nPairs = (K * (K - 1)) / 2;
      for (let a = 0; a < K; a++) for (let b = a + 1; b < K; b++) {
        const idx = byClass[a].concat(byClass[b]);
        const sign = Float64Array.from(idx, (_, t) => (t < byClass[a].length ? 1 : -1));
        const { Qrow, QD } = makeQ(m.rows, sign, kf, (t) => idx[t]);
        const res = yield* smo(idx.length, Qrow, QD, new Float64Array(idx.length).fill(-1), sign, this.params.C, 1e-3, TR`SVC คู่คลาส ${++pairNo}/${nPairs}`);
        const sv = [], coef = [];
        res.alpha.forEach((al, t) => { if (al > 0) { sv.push(m.rows[idx[t]]); coef.push(al * sign[t]); } });
        this._models.push({ a, b, sv, coef, rho: res.rho });
        yield { progress: TR`SVC คู่คลาส ${pairNo}/${nPairs}`, frac: pairNo / nPairs };
      }
      this.fitted = true; return this;
    }
    _dec(r) { return this._models.map((md) => { let s = -md.rho; for (let t = 0; t < md.sv.length; t++) s += md.coef[t] * this._kf(md.sv[t], r); return s; }); }
    decision_function(X) {
      this._needFit('decision_function'); const m = this._xPred(X);
      const D = m.rows.map((r) => this._dec(r));
      if (this.classes_.length === 2) return PB.floatArray(D.map((d) => -d[0]));
      return new NDArray(D, [D.length, D[0].length], 'float64');
    }
    predict(X) {
      this._needFit(); const m = this._xPred(X), K = this.classes_.length;
      return this._decode(m.rows.map((r) => { const d = this._dec(r), votes = new Array(K).fill(0); this._models.forEach((md, t) => { if (d[t] > 0) votes[md.a]++; else votes[md.b]++; }); return argmax(votes); }));
    }
    get n_support_() { return this._models ? this._models.reduce((s, md) => s + md.sv.length, 0) : 0; }
  }
  class SVR extends Estimator {
    static pyName = 'SVR'; static kind = 'regressor'; static module = 'sklearn.svm';
    static defaults = { C: 1.0, kernel: 'rbf', degree: 3, gamma: 'scale', coef0: 0.0, epsilon: 0.1 };
    *fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y), l = m.n;
      if (yv.length !== l) throw PB.lenErr(l, yv.length);
      this._gamma = gammaValue(this.params, m.rows); this._kf = kernelFn(this.params, m.p, this._gamma);
      const sign = Float64Array.from({ length: 2 * l }, (_, i) => (i < l ? 1 : -1));
      const p = Float64Array.from({ length: 2 * l }, (_, i) => (i < l ? this.params.epsilon - yv[i] : this.params.epsilon + yv[i - l]));
      const { Qrow, QD } = makeQ(m.rows, sign, this._kf, (t) => (t < l ? t : t - l));
      const res = yield* smo(2 * l, Qrow, QD, p, sign, this.params.C, 1e-3, 'SVR');
      this._sv = []; this._coef = [];
      for (let i = 0; i < l; i++) { const c = res.alpha[i] - res.alpha[i + l]; if (c !== 0) { this._sv.push(m.rows[i]); this._coef.push(c); } }
      this._rho = res.rho; this.fitted = true; return this;
    }
    predict(X) {
      this._needFit(); const m = this._xPred(X);
      return PB.floatArray(m.rows.map((r) => { let s = -this._rho; for (let t = 0; t < this._sv.length; t++) s += this._coef[t] * this._kf(this._sv[t], r); return s; }));
    }
  }

  /* ---------- MLP (sklearn's Adam loop) ---------- */
  class MLPBase extends Estimator {
    static module = 'sklearn.neural_network';
    _sizes() {
      let h = this.params.hidden_layer_sizes;
      if (h instanceof PB.Tuple) h = h.items; if (typeof h === 'number') h = [h];
      if (!Array.isArray(h) || !h.length || h.some((v) => !(v >= 1))) throw PB.err('ValueError', 'hidden_layer_sizes must be > 0', TR('hidden_layer_sizes ต้องเป็นจำนวนเต็มบวก เช่น (100,) หรือ (64, 32)'));
      return h;
    }
    *_train(rows, Y, outAct) {
      const n = rows.length, p = rows[0].length, hs = this._sizes(), out = Y[0].length;
      const sizes = [p, ...hs, out], L = sizes.length - 1;
      const rs = PB.checkRandomState(this.params.random_state);
      const act = this.params.activation || 'relu';
      const factor = act === 'logistic' ? 2.0 : 6.0;
      const W = [], B = [];
      for (let l = 0; l < L; l++) {
        const fi = sizes[l], fo = sizes[l + 1], bound = Math.sqrt(factor / (fi + fo));
        const w = new Float64Array(fi * fo); for (let t = 0; t < w.length; t++) w[t] = rs.uniform(-bound, bound);
        const b = new Float64Array(fo); for (let t = 0; t < fo; t++) b[t] = rs.uniform(-bound, bound);
        W.push(w); B.push(b);
      }
      const params = W.concat(B), M = params.map((a) => new Float64Array(a.length)), V = params.map((a) => new Float64Array(a.length));
      const lr0 = this.params.learning_rate_init, b1 = 0.9, b2 = 0.999, epsA = 1e-8, alpha = this.params.alpha;
      const bs = Math.min(200, n);
      let idx = PB.range(n), bestLoss = Infinity, noImp = 0, t = 0, it = 0;
      const hAct = act === 'tanh' ? Math.tanh : act === 'logistic' ? (z) => 1 / (1 + Math.exp(-z)) : act === 'identity' ? (z) => z : (z) => (z > 0 ? z : 0);
      this.loss_curve_ = [];
      const maxIter = this.params.max_iter, tol = 1e-4;
      for (it = 0; it < maxIter; it++) {
        const perm = rs.permutation(n); idx = perm.map((k) => idx[k]);
        let acc = 0;
        for (let s0 = 0; s0 < n; s0 += bs) {
          const batch = idx.slice(s0, Math.min(n, s0 + bs)), nb = batch.length;
          const A = [batch.map((i) => rows[i])];
          for (let l = 0; l < L; l++) {
            const fi = sizes[l], fo = sizes[l + 1], w = W[l], b = B[l];
            const Z = A[l].map((a) => { const z = Float64Array.from(b); for (let i = 0; i < fi; i++) { const ai = a[i]; if (ai === 0) continue; const off = i * fo; for (let o = 0; o < fo; o++) z[o] += ai * w[off + o]; } return z; });
            if (l < L - 1) { for (const z of Z) for (let o = 0; o < fo; o++) z[o] = hAct(z[o]); }
            else if (outAct === 'softmax') { for (const z of Z) { let mx = -Infinity; for (const v of z) mx = Math.max(mx, v); let se = 0; for (let o = 0; o < fo; o++) { z[o] = Math.exp(z[o] - mx); se += z[o]; } for (let o = 0; o < fo; o++) z[o] /= se; } }
            else if (outAct === 'logistic') { for (const z of Z) for (let o = 0; o < fo; o++) z[o] = 1 / (1 + Math.exp(-z[o])); }
            A.push(Z);
          }
          const Yb = batch.map((i) => Y[i]), P = A[L];
          let loss = 0;
          if (outAct === 'identity') { for (let r = 0; r < nb; r++) for (let o = 0; o < out; o++) loss += (Yb[r][o] - P[r][o]) ** 2; loss = loss / (nb * out) / 2; }
          else {
            const e = Number.EPSILON;
            for (let r = 0; r < nb; r++) for (let o = 0; o < out; o++) {
              const pr = Math.min(Math.max(P[r][o], e), 1 - e), yv = Yb[r][o];
              if (yv) loss -= yv * Math.log(pr);
              if (outAct === 'logistic' && 1 - yv) loss -= (1 - yv) * Math.log(1 - pr);
            }
            loss /= nb;
          }
          let sq = 0; for (const w of W) for (const v of w) sq += v * v;
          loss += (0.5 * alpha) * sq / nb;
          acc += loss * nb;
          let D = P.map((pr, r) => Float64Array.from(pr, (v, o) => v - Yb[r][o]));
          const gW = new Array(L), gB = new Array(L);
          for (let l = L - 1; l >= 0; l--) {
            const fi = sizes[l], fo = sizes[l + 1], Al = A[l], w = W[l];
            const gw = new Float64Array(fi * fo), gb = new Float64Array(fo);
            for (let r = 0; r < nb; r++) { const a = Al[r], d = D[r]; for (let i = 0; i < fi; i++) { const ai = a[i]; if (ai === 0) continue; const off = i * fo; for (let o = 0; o < fo; o++) gw[off + o] += ai * d[o]; } for (let o = 0; o < fo; o++) gb[o] += d[o]; }
            for (let k = 0; k < gw.length; k++) gw[k] = (gw[k] + alpha * w[k]) / nb;
            for (let o = 0; o < fo; o++) gb[o] /= nb;
            gW[l] = gw; gB[l] = gb;
            if (l > 0) {
              D = D.map((d, r) => {
                const nd = new Float64Array(fi);
                for (let i = 0; i < fi; i++) { let s = 0; const off = i * fo; for (let o = 0; o < fo; o++) s += d[o] * w[off + o]; nd[i] = s; }
                const a = Al[r];
                for (let i = 0; i < fi; i++) {
                  if (act === 'relu') { if (a[i] === 0) nd[i] = 0; }
                  else if (act === 'tanh') nd[i] *= 1 - a[i] * a[i];
                  else if (act === 'logistic') nd[i] *= a[i] * (1 - a[i]);
                }
                return nd;
              });
            }
          }
          const grads = gW.concat(gB);
          t++;
          const lr = lr0 * Math.sqrt(1 - Math.pow(b2, t)) / (1 - Math.pow(b1, t));
          for (let q = 0; q < params.length; q++) {
            const pq = params[q], g = grads[q], mq = M[q], vq = V[q];
            for (let k = 0; k < pq.length; k++) { mq[k] = b1 * mq[k] + (1 - b1) * g[k]; vq[k] = b2 * vq[k] + (1 - b2) * g[k] * g[k]; pq[k] += -lr * mq[k] / (Math.sqrt(vq[k]) + epsA); }
          }
        }
        const lossE = acc / n; this.loss_curve_.push(lossE); this.loss_ = lossE;
        if (lossE > bestLoss - tol) noImp++; else noImp = 0;
        if (lossE < bestLoss) bestLoss = lossE;
        if (it % 5 === 4) yield { progress: `epoch ${it + 1}/${maxIter} · loss ${lossE.toFixed(4)}`, frac: (it + 1) / maxIter };
        if (noImp > 10) { it++; break; }
      }
      if (it >= maxIter) PB.warn(`ConvergenceWarning: Stochastic Optimizer: Maximum iterations (${maxIter}) reached and the optimization hasn't converged yet.`, TR`MLP ยังไม่ลู่เข้าใน ${maxIter} รอบ ลองเพิ่ม max_iter`);
      this.n_iter_ = it; this._W = W; this._B = B; this._sizesAll = sizes; this._act = act; this._hAct = hAct; this._outAct = outAct;
      this.coefs_ = W.map((w, l) => new NDArray(PB.range(sizes[l]).map((i) => Array.from(w.slice(i * sizes[l + 1], (i + 1) * sizes[l + 1]))), [sizes[l], sizes[l + 1]], 'float64'));
    }
    _forward(rows) {
      const sizes = this._sizesAll, L = sizes.length - 1;
      return rows.map((a0) => {
        let a = a0;
        for (let l = 0; l < L; l++) {
          const fi = sizes[l], fo = sizes[l + 1], w = this._W[l], z = Float64Array.from(this._B[l]);
          for (let i = 0; i < fi; i++) { const ai = a[i]; if (ai === 0) continue; const off = i * fo; for (let o = 0; o < fo; o++) z[o] += ai * w[off + o]; }
          if (l < L - 1) for (let o = 0; o < fo; o++) z[o] = this._hAct(z[o]);
          else if (this._outAct === 'softmax') { const sm = softmax(Array.from(z)); return sm; }
          else if (this._outAct === 'logistic') return Array.from(z, (v) => 1 / (1 + Math.exp(-v)));
          a = z;
        }
        return Array.from(a);
      });
    }
  }
  class MLPClassifier extends MLPBase {
    static pyName = 'MLPClassifier'; static kind = 'classifier';
    static defaults = { hidden_layer_sizes: new PB.Tuple([100]), activation: 'relu', alpha: 0.0001, learning_rate_init: 0.001, max_iter: 200, random_state: null };
    *fit(X, y) {
      const m = this._xFit(X); this._checkClassifTarget(y); const yi = this._encodeY(y), K = this.classes_.length;
      if (yi.length !== m.n) throw PB.lenErr(m.n, yi.length);
      const Y = yi.map((k) => (K === 2 ? [k] : PB.range(K).map((c) => (c === k ? 1 : 0))));
      yield* this._train(m.rows, Y, K === 2 ? 'logistic' : 'softmax');
      this.fitted = true; return this;
    }
    predict_proba(X) { this._needFit('predict_proba'); const P = this._forward(this._xPred(X).rows).map((p) => (p.length === 1 ? [1 - p[0], p[0]] : p)); return new NDArray(P, [P.length, this.classes_.length], 'float64'); }
    predict(X) {
      this._needFit(); const P = this._forward(this._xPred(X).rows);
      return this._decode(P.map((p) => (p.length === 1 ? (p[0] > 0.5 ? 1 : 0) : argmax(p))));
    }
  }
  class MLPRegressor extends MLPBase {
    static pyName = 'MLPRegressor'; static kind = 'regressor';
    static defaults = { hidden_layer_sizes: new PB.Tuple([100]), activation: 'relu', alpha: 0.0001, learning_rate_init: 0.001, max_iter: 200, random_state: null };
    *fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y);
      if (yv.length !== m.n) throw PB.lenErr(m.n, yv.length);
      yield* this._train(m.rows, Array.from(yv, (v) => [v]), 'identity');
      this.fitted = true; return this;
    }
    predict(X) { this._needFit(); return PB.floatArray(this._forward(this._xPred(X).rows).map((p) => p[0])); }
  }

  Object.assign(PB, { KNeighborsClassifier, KNeighborsRegressor, GaussianNB, MultinomialNB, SVC, SVR, MLPClassifier, MLPRegressor });
})();
