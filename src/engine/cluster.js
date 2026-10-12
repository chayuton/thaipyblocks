/* ThaiPyBlocks engine: clustering (KMeans, DBSCAN, Agglomerative) and PCA. */
(function () {
  const { Estimator, NDArray } = PB;
  const dotv = (a, b) => { let s = 0; for (let j = 0; j < a.length; j++) s += a[j] * b[j]; return s; };

  /* ---------- KMeans (k-means++ init as in scikit-learn, Lloyd iterations) ---------- */
  class KMeans extends Estimator {
    static pyName = 'KMeans'; static kind = 'cluster'; static module = 'sklearn.cluster';
    static defaults = { n_clusters: 8, max_iter: 300, tol: 1e-4, random_state: null, n_init: 'auto' };
    *fit(X) {
      const m = this._xFit(X), n = m.n, p = m.p, k = this.params.n_clusters;
      if (!(k >= 1)) throw PB.err('ValueError', 'n_clusters should be >= 1', TR('n_clusters ต้องมีค่าอย่างน้อย 1'));
      if (n < k) throw PB.err('ValueError', `n_samples=${n} should be >= n_clusters=${k}.`, TR`จำนวนข้อมูล (${n}) น้อยกว่าจำนวนกลุ่ม (${k})`);
      const rs = PB.checkRandomState(this.params.random_state);
      const mean = PB.linalg.colMeans(m.rows, p);
      const Xc = m.rows.map((r) => Float64Array.from(r, (v, j) => v - mean[j]));
      const xsq = Xc.map((r) => dotv(r, r));
      let variance = 0;
      for (let j = 0; j < p; j++) { let s = 0; for (const r of Xc) s += r[j] * r[j]; variance += s / n; }
      const tol = (variance / p) * this.params.tol;
      const nInit = this.params.n_init === 'auto' ? 1 : this.params.n_init;
      let best = null;
      for (let run = 0; run < nInit; run++) {
        const C0 = this._plusplus(Xc, xsq, k, rs);
        const res = this._lloyd(Xc, C0, tol);
        if (!best || res.inertia < best.inertia) best = res;
        yield { progress: TR`KMeans รอบเริ่มต้น ${run + 1}/${nInit}` };
      }
      this.labels_ = new NDArray(Array.from(best.labels), [n], 'int64');
      this.inertia_ = best.inertia; this.n_iter_ = best.iters;
      this._centers = best.centers.map((c) => Float64Array.from(c, (v, j) => v + mean[j]));
      this.cluster_centers_ = new NDArray(this._centers.map((c) => Array.from(c)), [k, p], 'float64');
      this.fitted = true; return this;
    }
    _plusplus(X, xsq, k, rs) {
      const n = X.length, nLocal = 2 + Math.trunc(Math.log(k));
      const d2 = (c, csq, i) => Math.max(csq - 2 * dotv(c, X[i]) + xsq[i], 0);
      const cdf = new Float64Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc += 1 / n; cdf[i] = acc; }
      for (let i = 0; i < n; i++) cdf[i] /= cdf[n - 1];
      const u = rs.random(); let first = 0; while (first < n && cdf[first] <= u) first++;
      const centers = [Float64Array.from(X[Math.min(first, n - 1)])];
      let closest = Float64Array.from({ length: n }, (_, i) => d2(centers[0], dotv(centers[0], centers[0]), i));
      let pot = closest.reduce((a, b) => a + b, 0);
      for (let c = 1; c < k; c++) {
        const rv = PB.range(nLocal).map(() => rs.random() * pot);
        const cum = new Float64Array(n); let s = 0; for (let i = 0; i < n; i++) { s += closest[i]; cum[i] = s; }
        const cands = rv.map((v) => { let lo = 0, hi = n; while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < v) lo = mid + 1; else hi = mid; } return Math.min(lo, n - 1); });
        let bestPot = Infinity, bestD = null, bestId = -1;
        for (const ci of cands) {
          const c0 = X[ci], csq = xsq[ci];
          const dd = Float64Array.from({ length: n }, (_, i) => Math.min(closest[i], d2(c0, csq, i)));
          const pt = dd.reduce((a, b) => a + b, 0);
          if (pt < bestPot) { bestPot = pt; bestD = dd; bestId = ci; }
        }
        pot = bestPot; closest = bestD; centers.push(Float64Array.from(X[bestId]));
      }
      return centers;
    }
    _assign(X, C) {
      const csq = C.map((c) => dotv(c, c));
      return X.map((x) => { let b = 0, bd = Infinity; for (let c = 0; c < C.length; c++) { const d = csq[c] - 2 * dotv(x, C[c]); if (d < bd) { bd = d; b = c; } } return b; });
    }
    _lloyd(X, C, tol) {
      const n = X.length, p = X[0].length, k = C.length;
      let labelsOld = new Int32Array(n).fill(-1), labels = null, strict = false, it = 0;
      for (it = 0; it < this.params.max_iter; it++) {
        labels = Int32Array.from(this._assign(X, C));
        const Cn = PB.range(k).map(() => new Float64Array(p)), cnt = new Float64Array(k);
        labels.forEach((l, i) => { cnt[l]++; const x = X[i]; for (let j = 0; j < p; j++) Cn[l][j] += x[j]; });
        for (let c = 0; c < k; c++) {
          if (cnt[c] === 0) {
            let far = 0, fd = -1; X.forEach((x, i) => { let d = 0; for (let j = 0; j < p; j++) d += (x[j] - C[labels[i]][j]) ** 2; if (d > fd) { fd = d; far = i; } });
            Cn[c] = Float64Array.from(X[far]);
          } else for (let j = 0; j < p; j++) Cn[c][j] /= cnt[c];
        }
        let shift = 0; for (let c = 0; c < k; c++) for (let j = 0; j < p; j++) shift += (Cn[c][j] - C[c][j]) ** 2;
        C = Cn;
        if (labels.every((l, i) => l === labelsOld[i])) { strict = true; break; }
        if (shift <= tol) break;
        labelsOld = labels;
      }
      if (!strict) labels = Int32Array.from(this._assign(X, C));
      let inertia = 0; labels.forEach((l, i) => { for (let j = 0; j < p; j++) inertia += (X[i][j] - C[l][j]) ** 2; });
      return { labels, centers: C, inertia, iters: Math.min(it + 1, this.params.max_iter) };
    }
    predict(X) { this._needFit(); const m = this._xPred(X); return new NDArray(this._assign(m.rows, this._centers), [m.n], 'int64'); }
    *fit_predict(X) { yield* this.fit(X); return this.labels_; }
    transform(X) { this._needFit('transform'); const m = this._xPred(X); return new NDArray(m.rows.map((r) => this._centers.map((c) => Math.sqrt(r.reduce((s, v, j) => s + (v - c[j]) ** 2, 0)))), [m.n, this._centers.length], 'float64'); }
  }

  /* ---------- DBSCAN ---------- */
  class DBSCAN extends Estimator {
    static pyName = 'DBSCAN'; static kind = 'cluster'; static module = 'sklearn.cluster';
    static defaults = { eps: 0.5, min_samples: 5 };
    fit(X) {
      const m = this._xFit(X), n = m.n, eps2 = this.params.eps * this.params.eps;
      const nb = m.rows.map((r) => { const out = []; for (let j = 0; j < n; j++) { let s = 0; const q = m.rows[j]; for (let t = 0; t < r.length; t++) s += (r[t] - q[t]) ** 2; if (Math.sqrt(s) <= this.params.eps || s <= eps2) out.push(j); } return out; });
      const core = nb.map((a) => a.length >= this.params.min_samples);
      const labels = new Int32Array(n).fill(-1); let lab = 0;
      for (let i0 = 0; i0 < n; i0++) {
        if (labels[i0] !== -1 || !core[i0]) continue;
        const stack = []; let i = i0;
        for (;;) {
          if (labels[i] === -1) { labels[i] = lab; if (core[i]) for (const v of nb[i]) if (labels[v] === -1) stack.push(v); }
          if (!stack.length) break;
          i = stack.pop();
        }
        lab++;
      }
      this.labels_ = new NDArray(Array.from(labels), [n], 'int64');
      this.core_sample_indices_ = new NDArray(PB.range(n).filter((i) => core[i]), undefined, 'int64');
      this.fitted = true; return this;
    }
    fit_predict(X) { this.fit(X); return this.labels_; }
  }

  /* ---------- Agglomerative clustering (scipy nn_chain + sklearn _hc_cut) ---------- */
  function heapPush(h, item) { h.push(item); siftDown(h, 0, h.length - 1); }
  function heapPushPop(h, item) { if (h.length && h[0] < item) { const t = h[0]; h[0] = item; item = t; siftUp(h, 0); } return item; }
  function siftDown(h, start, pos) { const it = h[pos]; while (pos > start) { const pp = (pos - 1) >> 1; const par = h[pp]; if (it < par) { h[pos] = par; pos = pp; continue; } break; } h[pos] = it; }
  function siftUp(h, pos) {
    const end = h.length, start = pos, it = h[pos]; let child = 2 * pos + 1;
    while (child < end) { const right = child + 1; if (right < end && !(h[child] < h[right])) child = right; h[pos] = h[child]; pos = child; child = 2 * pos + 1; }
    h[pos] = it; siftDown(h, start, pos);
  }
  class AgglomerativeClustering extends Estimator {
    static pyName = 'AgglomerativeClustering'; static kind = 'cluster'; static module = 'sklearn.cluster';
    static defaults = { n_clusters: 2, linkage: 'ward' };
    *fit(X) {
      const m = this._xFit(X), n = m.n, k = this.params.n_clusters, method = this.params.linkage;
      if (n > 3000) throw PB.err('MemoryError', 'too many samples', TR('ข้อมูลมากเกินไปสำหรับ AgglomerativeClustering ในเบราว์เซอร์ (สูงสุด 3,000 แถว)'), TR('สุ่มตัวอย่างข้อมูลด้วย df.sample() ก่อน'));
      if (k > n) throw PB.err('ValueError', 'Cannot extract more clusters than samples', TR('จำนวนกลุ่มมากกว่าจำนวนข้อมูล'));
      const ci = (i, j) => (i < j ? n * i - (i * (i + 1)) / 2 + (j - i - 1) : n * j - (j * (j + 1)) / 2 + (i - j - 1));
      const D = new Float64Array((n * (n - 1)) / 2);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { let s = 0; const a = m.rows[i], b = m.rows[j]; for (let t = 0; t < a.length; t++) s += (a[t] - b[t]) ** 2; D[ci(i, j)] = Math.sqrt(s); }
      yield { progress: TR('คำนวณระยะห่างเสร็จแล้ว') };
      const size = new Int32Array(n).fill(1), chain = new Int32Array(n); let cl = 0;
      const Z = [];
      const upd = {
        single: (dxi, dyi) => Math.min(dxi, dyi), complete: (dxi, dyi) => Math.max(dxi, dyi),
        average: (dxi, dyi, dxy, sx, sy) => (sx * dxi + sy * dyi) / (sx + sy),
        ward: (dxi, dyi, dxy, sx, sy, si) => { const t = 1.0 / (sx + sy + si); return Math.sqrt((si + sx) * t * dxi * dxi + (si + sy) * t * dyi * dyi - si * t * dxy * dxy); },
      }[method];
      if (!upd) throw PB.err('ValueError', 'Unknown linkage ' + method, TR`ไม่รู้จัก linkage '${method}'`);
      for (let kk = 0; kk < n - 1; kk++) {
        if (cl === 0) { cl = 1; for (let i = 0; i < n; i++) if (size[i] > 0) { chain[0] = i; break; } }
        let x, y = 0, cur;
        for (;;) {
          x = chain[cl - 1];
          if (cl > 1) { y = chain[cl - 2]; cur = D[ci(x, y)]; } else cur = Infinity;
          for (let i = 0; i < n; i++) { if (size[i] === 0 || x === i) continue; const d = D[ci(x, i)]; if (d < cur) { cur = d; y = i; } }
          if (cl > 1 && y === chain[cl - 2]) break;
          chain[cl] = y; cl++;
        }
        cl -= 2;
        if (x > y) { const t = x; x = y; y = t; }
        const nx = size[x], ny = size[y];
        Z.push([x, y, cur, nx + ny]);
        size[x] = 0; size[y] = nx + ny;
        for (let i = 0; i < n; i++) { const ni = size[i]; if (ni === 0 || i === y) continue; D[ci(i, y)] = upd(D[ci(i, x)], D[ci(i, y)], cur, nx, ny, ni); }
        if (kk % 200 === 199) yield { progress: TR`รวมกลุ่ม ${kk + 1}/${n - 1}` };
      }
      const order = PB.argsortStable(Z.map((z) => z[2]), (a, b) => a - b);
      const Zs = order.map((o) => Z[o].slice());
      const parent = new Int32Array(2 * n - 1).map((_, i) => i), nextLabel = { v: n };
      const find = (x) => { let p = x; while (parent[p] !== p) p = parent[p]; while (parent[x] !== p) { const t = parent[x]; parent[x] = p; x = t; } return p; };
      for (const z of Zs) {
        const xr = find(z[0]), yr = find(z[1]);
        if (xr < yr) { z[0] = xr; z[1] = yr; } else { z[0] = yr; z[1] = xr; }
        parent[xr] = nextLabel.v; parent[yr] = nextLabel.v; nextLabel.v++;
      }
      this.children_ = new NDArray(Zs.map((z) => [z[0], z[1]]), [n - 1, 2], 'int64');
      this.distances_ = PB.floatArray(Zs.map((z) => z[2]));
      const children = Zs.map((z) => [z[0], z[1]]);
      const nodes = [-(Math.max(...children[n - 2]) + 1)];
      for (let t = 0; t < k - 1; t++) { const these = children[-nodes[0] - n]; heapPush(nodes, -these[0]); heapPushPop(nodes, -these[1]); }
      const labels = new Int32Array(n);
      nodes.forEach((node, i) => {
        const stack = [-node];
        while (stack.length) { const q = stack.pop(); if (q < n) labels[q] = i; else stack.push(...children[q - n]); }
      });
      this.labels_ = new NDArray(Array.from(labels), [n], 'int64'); this.n_leaves_ = n;
      this.fitted = true; return this;
    }
    *fit_predict(X) { yield* this.fit(X); return this.labels_; }
  }

  /* ---------- PCA ---------- */
  class PCA extends Estimator {
    static pyName = 'PCA'; static kind = 'transformer'; static module = 'sklearn.decomposition';
    static defaults = { n_components: null, random_state: null };
    fit(X) {
      const m = this._xFit(X), n = m.n, p = m.p;
      let k = this.params.n_components; if (k === null || k === undefined || k === 'None') k = Math.min(n, p);
      if (k > Math.min(n, p)) throw PB.err('ValueError', `n_components=${k} must be between 0 and min(n_samples, n_features)=${Math.min(n, p)}`, TR`n_components ต้องไม่เกิน ${Math.min(n, p)}`);
      const mean = PB.linalg.colMeans(m.rows, p);
      const Xc = m.rows.map((r) => Float64Array.from(r, (v, j) => v - mean[j]));
      let vals, vecs;
      if (p <= n || p <= 200) {
        const { A } = PB.linalg.gram(m.rows, mean, null, 0);
        ({ values: vals, vectors: vecs } = PB.linalg.jacobiEigen(A));
      } else {
        const G = Xc.map((a) => Xc.map((b) => dotv(a, b)));
        const e = PB.linalg.jacobiEigen(G);
        vals = e.values; vecs = e.vectors.map((u, t) => { const s = Math.sqrt(Math.max(vals[t], 0)); const v = new Float64Array(p); if (s > 0) Xc.forEach((r, i) => { for (let j = 0; j < p; j++) v[j] += r[j] * u[i] / s; }); return v; });
      }
      vals = vals.map((v) => Math.max(v, 0));
      const total = vals.reduce((a, b) => a + b, 0);
      const comps = vecs.slice(0, k).map((v) => {
        let bi = 0; for (let j = 1; j < v.length; j++) if (Math.abs(v[j]) > Math.abs(v[bi])) bi = j;
        const sgn = Math.sign(v[bi]) || 1; return Float64Array.from(v, (x) => x * sgn);
      });
      this._mean = mean; this._comps = comps;
      this.components_ = new NDArray(comps.map((c) => Array.from(c)), [k, p], 'float64');
      this.explained_variance_ = PB.floatArray(vals.slice(0, k).map((v) => v / (n - 1)));
      this.explained_variance_ratio_ = PB.floatArray(vals.slice(0, k).map((v) => (total > 0 ? v / total : 0)));
      this.singular_values_ = PB.floatArray(vals.slice(0, k).map(Math.sqrt));
      this.mean_ = PB.floatArray(mean); this.n_components_ = k;
      this.fitted = true; return this;
    }
    transform(X) {
      this._needFit('transform'); const m = this._xPred(X);
      const rows = m.rows.map((r) => this._comps.map((c) => { let s = 0; for (let j = 0; j < c.length; j++) s += (r[j] - this._mean[j]) * c[j]; return s; }));
      if (this._pandasOut && X instanceof PB.DataFrame) return PB.outFrame(m, rows, X, this._comps.map((_, i) => 'pca' + i));
      return new NDArray(rows, [rows.length, this._comps.length], 'float64');
    }
    fit_transform(X) { this.fit(X); return this.transform(X); }
  }

  Object.assign(PB, { KMeans, DBSCAN, AgglomerativeClustering, PCA });
})();
