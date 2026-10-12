/* ThaiPyBlocks engine: linear algebra helpers and linear models. */
(function () {
  const { Estimator, NDArray } = PB;
  const EPS = Number.EPSILON;

  /* ---------- linear algebra ---------- */
  function jacobiEigen(Ain) {
    const n = Ain.length;
    const A = Ain.map((r) => Float64Array.from(r));
    const V = PB.range(n).map((i) => { const r = new Float64Array(n); r[i] = 1; return r; });
    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
      if (off < 1e-30) break;
      let diag = 0; for (let i = 0; i < n; i++) diag += A[i][i] * A[i][i];
      if (off <= EPS * EPS * diag * 1e-4) break;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-300) continue;
        const app = A[p][p], aqq = A[q][q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
        }
      }
    }
    const vals = PB.range(n).map((i) => A[i][i]);
    const order = PB.range(n).sort((a, b) => vals[b] - vals[a]);
    return { values: order.map((i) => vals[i]), vectors: order.map((i) => Float64Array.from(V.map((r) => r[i]))) };
  }
  function choleskySolve(A, b) {
    const n = A.length, L = PB.range(n).map(() => new Float64Array(n));
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
      let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) { if (s <= 0) return null; L[i][i] = Math.sqrt(s); } else L[i][j] = s / L[j][j];
    }
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * z[k]; z[i] = s / L[i][i]; }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
    return x;
  }
  function pinvSolve(A, b, rtol = 1e-11) {
    const { values, vectors } = jacobiEigen(A);
    const vmax = Math.max(Math.abs(values[0] || 0), 1e-300);
    const x = new Float64Array(A.length);
    values.forEach((lam, k) => {
      if (lam <= vmax * rtol) return;
      const v = vectors[k]; let d = 0; for (let i = 0; i < v.length; i++) d += v[i] * b[i];
      const f = d / lam; for (let i = 0; i < v.length; i++) x[i] += f * v[i];
    });
    return x;
  }
  function colMeans(rows, p) { const m = new Float64Array(p); for (const r of rows) for (let j = 0; j < p; j++) m[j] += r[j]; for (let j = 0; j < p; j++) m[j] /= rows.length || 1; return m; }
  function gram(rows, mean, y, ym) {
    const p = mean.length, A = PB.range(p).map(() => new Float64Array(p)), b = new Float64Array(p);
    const d = new Float64Array(p);
    rows.forEach((r, i) => {
      for (let j = 0; j < p; j++) d[j] = r[j] - mean[j];
      const yi = y ? y[i] - ym : 0;
      for (let j = 0; j < p; j++) { const dj = d[j]; if (y) b[j] += dj * yi; const Aj = A[j]; for (let k = j; k < p; k++) Aj[k] += dj * d[k]; }
    });
    for (let j = 0; j < p; j++) for (let k = 0; k < j; k++) A[j][k] = A[k][j];
    return { A, b };
  }
  PB.linalg = { jacobiEigen, choleskySolve, pinvSolve, colMeans, gram };

  /* ---------- shared linear-regressor behaviour ---------- */
  class LinearBase extends Estimator {
    static kind = 'regressor'; static module = 'sklearn.linear_model';
    predict(X) {
      this._needFit(); const m = this._xPred(X);
      const w = this._w, b = this._b;
      return PB.floatArray(m.rows.map((r) => { let s = b; for (let j = 0; j < w.length; j++) s += r[j] * w[j]; return s; }));
    }
    _setCoef(w, b) { this._w = w; this._b = b; this.coef_ = PB.floatArray(w); this.intercept_ = b; this.fitted = true; return this; }
  }
  class LinearRegression extends LinearBase {
    static pyName = 'LinearRegression'; static defaults = { fit_intercept: true };
    fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y);
      if (yv.length !== m.n) throw lenErr(m.n, yv.length);
      const fi = this.params.fit_intercept;
      const mean = fi ? colMeans(m.rows, m.p) : new Float64Array(m.p);
      const ym = fi ? yv.reduce((s, v) => s + v, 0) / yv.length : 0;
      const { A, b } = gram(m.rows, mean, yv, ym);
      const w = pinvSolve(A, b);
      let b0 = ym; for (let j = 0; j < m.p; j++) b0 -= mean[j] * w[j];
      return this._setCoef(w, fi ? b0 : 0);
    }
  }
  class Ridge extends LinearBase {
    static pyName = 'Ridge'; static defaults = { alpha: 1.0 };
    fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y);
      if (yv.length !== m.n) throw lenErr(m.n, yv.length);
      const mean = colMeans(m.rows, m.p), ym = yv.reduce((s, v) => s + v, 0) / yv.length;
      const { A, b } = gram(m.rows, mean, yv, ym);
      for (let j = 0; j < m.p; j++) A[j][j] += this.params.alpha;
      const w = choleskySolve(A, b) || pinvSolve(A, b);
      let b0 = ym; for (let j = 0; j < m.p; j++) b0 -= mean[j] * w[j];
      return this._setCoef(w, b0);
    }
  }
  class ElasticNet extends LinearBase {
    static pyName = 'ElasticNet'; static defaults = { alpha: 1.0, l1_ratio: 0.5, max_iter: 1000, tol: 1e-4 };
    fit(X, y) {
      const m = this._xFit(X), yv = this._yFloat(y);
      if (yv.length !== m.n) throw lenErr(m.n, yv.length);
      const n = m.n, p = m.p, mean = colMeans(m.rows, p), ym = yv.reduce((s, v) => s + v, 0) / n;
      const Xc = PB.range(p).map((j) => Float64Array.from(m.rows, (r) => r[j] - mean[j]));
      const yc = Float64Array.from(yv, (v) => v - ym);
      const l1 = this.l1Ratio, a = this.params.alpha;
      const alpha = a * l1 * n, beta = a * (1 - l1) * n;
      const w = new Float64Array(p), R = Float64Array.from(yc);
      const norm = Xc.map((c) => c.reduce((s, v) => s + v * v, 0));
      const tol0 = this.params.tol, tol = tol0 * yc.reduce((s, v) => s + v * v, 0);
      let it = 0, converged = false;
      for (it = 0; it < this.params.max_iter; it++) {
        let wmax = 0, dwmax = 0;
        for (let j = 0; j < p; j++) {
          if (norm[j] === 0) continue;
          const c = Xc[j], wj = w[j];
          if (wj !== 0) for (let i = 0; i < n; i++) R[i] += wj * c[i];
          let tmp = 0; for (let i = 0; i < n; i++) tmp += c[i] * R[i];
          w[j] = Math.sign(tmp) * Math.max(Math.abs(tmp) - alpha, 0) / (norm[j] + beta);
          if (w[j] !== 0) for (let i = 0; i < n; i++) R[i] -= w[j] * c[i];
          dwmax = Math.max(dwmax, Math.abs(w[j] - wj)); wmax = Math.max(wmax, Math.abs(w[j]));
        }
        if (wmax === 0 || dwmax / wmax < tol0 || it === this.params.max_iter - 1) {
          let dual = 0; for (let j = 0; j < p; j++) { let s = 0; const c = Xc[j]; for (let i = 0; i < n; i++) s += c[i] * R[i]; dual = Math.max(dual, Math.abs(s - beta * w[j])); }
          const Rn = R.reduce((s, v) => s + v * v, 0), wn = w.reduce((s, v) => s + v * v, 0);
          let cst, gap;
          if (dual > alpha) { cst = alpha / dual; gap = 0.5 * (Rn + Rn * cst * cst); } else { cst = 1; gap = Rn; }
          let ry = 0; for (let i = 0; i < n; i++) ry += R[i] * yc[i];
          gap += alpha * w.reduce((s, v) => s + Math.abs(v), 0) - cst * ry + 0.5 * beta * (1 + cst * cst) * wn;
          if (gap < tol) { converged = true; break; }
        }
      }
      if (!converged) PB.warn('ConvergenceWarning: Objective did not converge.', TR`${this.constructor.pyName} ยังไม่ลู่เข้า ลองเพิ่ม max_iter หรือปรับสเกลข้อมูล`);
      this.n_iter_ = it + 1;
      let b0 = ym; for (let j = 0; j < p; j++) b0 -= mean[j] * w[j];
      return this._setCoef(w, b0);
    }
  }
  Object.defineProperty(ElasticNet.prototype, 'l1Ratio', { get() { return this.params.l1_ratio; } });
  class Lasso extends ElasticNet {
    static pyName = 'Lasso'; static defaults = { alpha: 1.0, max_iter: 1000, tol: 1e-4 };
    get l1Ratio() { return 1; }
  }

  /* ---------- L-BFGS ---------- */
  function lbfgs(fg, x0, { maxIter = 100, gtol = 1e-6, m = 10 } = {}) {
    let x = Float64Array.from(x0), [f, g] = fg(x);
    const S = [], Y = [], RHO = [];
    let it = 0, converged = false;
    for (it = 0; it < maxIter; it++) {
      let gmax = 0; for (const v of g) gmax = Math.max(gmax, Math.abs(v));
      if (gmax < gtol) { converged = true; break; }
      const q = Float64Array.from(g), alpha = new Array(S.length);
      for (let i = S.length - 1; i >= 0; i--) { alpha[i] = RHO[i] * dot(S[i], q); axpy(-alpha[i], Y[i], q); }
      if (S.length) { const k = S.length - 1; const gamma = dot(S[k], Y[k]) / dot(Y[k], Y[k]); for (let i = 0; i < q.length; i++) q[i] *= gamma; }
      else { const gn = Math.sqrt(dot(g, g)); for (let i = 0; i < q.length; i++) q[i] /= Math.max(gn, 1); }
      for (let i = 0; i < S.length; i++) { const beta = RHO[i] * dot(Y[i], q); axpy(alpha[i] - beta, S[i], q); }
      const d = q.map((v) => -v);
      let gd = dot(g, d);
      if (gd >= 0) { for (let i = 0; i < d.length; i++) d[i] = -g[i]; gd = dot(g, d); S.length = 0; Y.length = 0; RHO.length = 0; }
      let step = 1, xn, fn, gn, ok = false;
      for (let ls = 0; ls < 40; ls++) {
        xn = x.map((v, i) => v + step * d[i]);
        [fn, gn] = fg(xn);
        if (Number.isFinite(fn) && fn <= f + 1e-4 * step * gd) { ok = true; break; }
        step *= 0.5;
      }
      if (!ok) { converged = true; break; }
      const s = xn.map((v, i) => v - x[i]), yv = gn.map((v, i) => v - g[i]);
      const sy = dot(s, yv);
      if (sy > 1e-12) { S.push(s); Y.push(yv); RHO.push(1 / sy); if (S.length > m) { S.shift(); Y.shift(); RHO.shift(); } }
      const fOld = f;
      x = xn; f = fn; g = gn;
      if (Math.abs(fOld - f) <= 64 * EPS * Math.max(Math.abs(fOld), Math.abs(f), 1)) { converged = true; it++; break; }
    }
    return { x, f, iters: it, converged };
  }
  function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
  function axpy(a, x, y) { for (let i = 0; i < y.length; i++) y[i] += a * x[i]; }
  PB.lbfgs = lbfgs;

  /* ---------- logistic regression ---------- */
  class LogisticRegression extends Estimator {
    static pyName = 'LogisticRegression'; static kind = 'classifier'; static module = 'sklearn.linear_model';
    static defaults = { C: 1.0, max_iter: 100 };
    fit(X, y) {
      const m = this._xFit(X);
      this._checkClassifTarget(y);
      const yi = this._encodeY(y);
      if (yi.length !== m.n) throw lenErr(m.n, yi.length);
      const n = m.n, p = m.p, K = this.classes_.length, C = this.params.C, rows = m.rows;
      const lam = 1 / (C * n);
      let res;
      if (K === 2) {
        const fg = (w) => {
          let f = 0; const g = new Float64Array(p + 1);
          for (let i = 0; i < n; i++) {
            const r = rows[i]; let z = w[p]; for (let j = 0; j < p; j++) z += r[j] * w[j];
            const t = yi[i] === 1 ? 1 : -1, tz = t * z;
            f += tz > 0 ? Math.log1p(Math.exp(-tz)) : -tz + Math.log1p(Math.exp(tz));
            const s = 1 / (1 + Math.exp(-z)) - (yi[i] === 1 ? 1 : 0);
            for (let j = 0; j < p; j++) g[j] += s * r[j]; g[p] += s;
          }
          f /= n; for (let j = 0; j <= p; j++) g[j] /= n;
          for (let j = 0; j < p; j++) { f += 0.5 * lam * w[j] * w[j]; g[j] += lam * w[j]; }
          return [f, g];
        };
        res = lbfgs(fg, new Float64Array(p + 1), { maxIter: this.params.max_iter, gtol: 1e-8 });
        this._W = [Float64Array.from(res.x.slice(0, p))]; this._B = [res.x[p]];
      } else {
        const D = K * (p + 1);
        const fg = (w) => {
          let f = 0; const g = new Float64Array(D); const z = new Float64Array(K);
          for (let i = 0; i < n; i++) {
            const r = rows[i]; let zmax = -Infinity;
            for (let k = 0; k < K; k++) { const o = k * (p + 1); let s = w[o + p]; for (let j = 0; j < p; j++) s += r[j] * w[o + j]; z[k] = s; if (s > zmax) zmax = s; }
            let se = 0; for (let k = 0; k < K; k++) se += Math.exp(z[k] - zmax);
            const lse = zmax + Math.log(se);
            f += lse - z[yi[i]];
            for (let k = 0; k < K; k++) {
              const pk = Math.exp(z[k] - lse) - (k === yi[i] ? 1 : 0); const o = k * (p + 1);
              for (let j = 0; j < p; j++) g[o + j] += pk * r[j]; g[o + p] += pk;
            }
          }
          f /= n; for (let d = 0; d < D; d++) g[d] /= n;
          for (let k = 0; k < K; k++) for (let j = 0; j < p; j++) { const o = k * (p + 1) + j; f += 0.5 * lam * w[o] * w[o]; g[o] += lam * w[o]; }
          return [f, g];
        };
        res = lbfgs(fg, new Float64Array(D), { maxIter: this.params.max_iter, gtol: 1e-8 });
        this._W = PB.range(K).map((k) => Float64Array.from(res.x.slice(k * (p + 1), k * (p + 1) + p)));
        const B = PB.range(K).map((k) => res.x[k * (p + 1) + p]); const bm = B.reduce((s, v) => s + v, 0) / K;
        this._B = B.map((v) => v - bm);
      }
      if (!res.converged && res.iters >= this.params.max_iter) PB.warn('ConvergenceWarning: lbfgs failed to converge (status=1): STOP: TOTAL NO. OF ITERATIONS REACHED LIMIT.', TR('LogisticRegression ยังไม่ลู่เข้า ลองเพิ่ม max_iter หรือปรับสเกลข้อมูลด้วย StandardScaler'));
      this.n_iter_ = res.iters;
      this.coef_ = new NDArray(this._W.map((w) => Array.from(w)), [this._W.length, p], 'float64');
      this.intercept_ = PB.floatArray(this._B);
      this.fitted = true; return this;
    }
    decision_function(X) {
      this._needFit('decision_function'); const m = this._xPred(X);
      const Z = m.rows.map((r) => this._W.map((w, k) => { let s = this._B[k]; for (let j = 0; j < w.length; j++) s += r[j] * w[j]; return s; }));
      return Z;
    }
    predict_proba(X) {
      const Z = this.decision_function(X);
      const P = Z.map((z) => {
        if (z.length === 1) { const s = 1 / (1 + Math.exp(-z[0])); return [1 - s, s]; }
        const mx = Math.max(...z); const e = z.map((v) => Math.exp(v - mx)); const t = e.reduce((a, b) => a + b, 0); return e.map((v) => v / t);
      });
      return new NDArray(P, [P.length, this.classes_.length], 'float64');
    }
    predict(X) {
      const P = this.predict_proba(X).data;
      return this._decode(P.map((pr) => { let b = 0; for (let k = 1; k < pr.length; k++) if (pr[k] > pr[b]) b = k; return b; }));
    }
  }
  function lenErr(a, b) { return PB.err('ValueError', `Found input variables with inconsistent numbers of samples: [${a}, ${b}]`, TR`X มี ${a} แถว แต่ y มี ${b} แถว`, TR('ตรวจสอบว่า X และ y มาจากชุดข้อมูลเดียวกัน')); }
  PB.lenErr = lenErr;

  Object.assign(PB, { LinearRegression, Ridge, Lasso, ElasticNet, LogisticRegression });
})();
