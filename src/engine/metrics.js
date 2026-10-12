/* ThaiPyBlocks engine: sklearn.metrics and model_selection helpers. */
(function () {
  const { NDArray, Series, DataFrame } = PB;
  const vals = (a, what) => PB.asY(a, what).values;
  function pair(yt, yp) {
    const a = vals(yt, 'y_true'), b = vals(yp, 'y_pred');
    if (a.length !== b.length) throw PB.err('ValueError', `Found input variables with inconsistent numbers of samples: [${a.length}, ${b.length}]`, TR`ค่าจริง (${a.length}) และค่าทำนาย (${b.length}) มีจำนวนไม่เท่ากัน`, TR('ใช้ y_test คู่กับค่าที่ทำนายจาก X_test'));
    return [a, b];
  }
  function checkDiscrete(a, b) {
    const cont = (v) => v.some((x) => typeof x === 'number' && !Number.isInteger(x));
    if (cont(a) || cont(b)) throw PB.err('ValueError', "Classification metrics can't handle a mix of binary and continuous targets", TR('ตัววัดนี้ใช้กับงานจำแนกประเภท แต่ค่าเป็นตัวเลขต่อเนื่อง'), TR('งานพยากรณ์ค่าให้ใช้ r2_score, mean_absolute_error หรือ mean_squared_error'));
  }
  const key = PB.keyOf;
  const M = {};
  M.accuracy_score = (yt, yp) => { const [a, b] = pair(yt, yp); checkDiscrete(a, b); let c = 0; for (let i = 0; i < a.length; i++) if (key(a[i]) === key(b[i])) c++; return c / a.length; };
  function labelsOf(a, b) { return PB.uniqueSorted(a.concat(b)); }
  M.confusion_matrix = (yt, yp) => {
    const [a, b] = pair(yt, yp); checkDiscrete(a, b);
    const L = labelsOf(a, b), idx = new Map(L.map((l, i) => [key(l), i]));
    const C = L.map(() => new Array(L.length).fill(0));
    for (let i = 0; i < a.length; i++) C[idx.get(key(a[i]))][idx.get(key(b[i]))]++;
    const out = new NDArray(C, [L.length, L.length], 'int64'); out.labels = L; return out;
  };
  function prf(yt, yp, average) {
    const [a, b] = pair(yt, yp); checkDiscrete(a, b);
    const L = labelsOf(a, b);
    if (average === 'binary') {
      if (L.length > 2) throw PB.err('ValueError', "Target is multiclass but average='binary'. Please choose another average setting, one of [None, 'micro', 'macro', 'weighted'].", TR('ข้อมูลมีมากกว่า 2 คลาส ต้องใช้ average="macro" หรือ "weighted"'));
      if (!L.some((l) => key(l) === key(1))) throw PB.err('ValueError', `pos_label=1 is not a valid label. It should be one of ${PB.repr(L)}`, TR('average="binary" ต้องมีคลาส 1 เป็นคลาสบวก'), TR('ใช้ average="macro" แทน'));
    }
    const per = L.map((l) => {
      let tp = 0, fp = 0, fn = 0; const k = key(l);
      for (let i = 0; i < a.length; i++) { const t = key(a[i]) === k, p = key(b[i]) === k; if (t && p) tp++; else if (p) fp++; else if (t) fn++; }
      const prec = tp + fp ? tp / (tp + fp) : 0, rec = tp + fn ? tp / (tp + fn) : 0, f1 = 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0; /* sklearn: F = 2·tp / (true + predicted) */
      return { label: l, prec, rec, f1, support: tp + fn, tp, fp, fn };
    });
    return { per, n: a.length };
  }
  function avgOf(res, field, average) {
    const { per } = res;
    if (average === 'binary') return per.find((r) => key(r.label) === key(1))[field];
    if (average === 'micro') { const tp = per.reduce((s, r) => s + r.tp, 0), fp = per.reduce((s, r) => s + r.fp, 0), fn = per.reduce((s, r) => s + r.fn, 0); const p = tp / (tp + fp || 1), rr = tp / (tp + fn || 1); return field === 'prec' ? p : field === 'rec' ? rr : 2 * tp + fp + fn ? (2 * tp) / (2 * tp + fp + fn) : 0; }
    if (average === 'weighted') { const tot = per.reduce((s, r) => s + r.support, 0); return per.reduce((s, r) => s + r[field] * r.support, 0) / (tot || 1); }
    return per.reduce((s, r) => s + r[field], 0) / per.length;
  }
  M.precision_score = (yt, yp, average = 'binary') => avgOf(prf(yt, yp, average), 'prec', average);
  M.recall_score = (yt, yp, average = 'binary') => avgOf(prf(yt, yp, average), 'rec', average);
  M.f1_score = (yt, yp, average = 'binary') => avgOf(prf(yt, yp, average), 'f1', average);
  M.classification_report = (yt, yp) => {
    const res = prf(yt, yp, 'macro');
    const acc = M.accuracy_score(yt, yp);
    return new ClassReport(res, acc);
  };
  class ClassReport {
    constructor(res, acc) { this.res = res; this.acc = acc; }
    pyType() { return 'str'; }
    rows() {
      const r = this.res, tot = r.n;
      const out = r.per.map((p) => [PB.str(p.label), p.prec, p.rec, p.f1, p.support]);
      out.push(['accuracy', null, null, this.acc, tot]);
      out.push(['macro avg', avgOf(r, 'prec', 'macro'), avgOf(r, 'rec', 'macro'), avgOf(r, 'f1', 'macro'), tot]);
      out.push(['weighted avg', avgOf(r, 'prec', 'weighted'), avgOf(r, 'rec', 'weighted'), avgOf(r, 'f1', 'weighted'), tot]);
      return out;
    }
    __str__() {
      const rows = this.rows(), w = Math.max(12, ...rows.map((r) => r[0].length));
      const f = (v) => (v === null ? '' : PB.pyFixed(v, 2));
      const L = [' '.repeat(w) + '  precision    recall  f1-score   support', ''];
      rows.forEach((r, i) => {
        if (i === rows.length - 3) L.push('');
        L.push(r[0].padStart(w) + '  ' + f(r[1]).padStart(9) + ' ' + f(r[2]).padStart(9) + ' ' + f(r[3]).padStart(9) + ' ' + String(r[4]).padStart(9));
      });
      return L.join('\n') + '\n';
    }
    __repr__() { return PB.strRepr(this.__str__()); }
  }
  PB.ClassReport = ClassReport;
  const regPair = (yt, yp) => { const [a, b] = pair(yt, yp); if (a.some((v) => typeof v === 'string') || b.some((v) => typeof v === 'string')) throw PB.err('ValueError', 'could not convert string to float', TR('ตัววัดนี้ใช้กับงานพยากรณ์ค่าตัวเลข แต่ค่าเป็นข้อความ'), TR('งานจำแนกประเภทให้ใช้ accuracy_score หรือ f1_score')); return [a.map(Number), b.map(Number)]; };
  M.r2_score = (yt, yp) => {
    const [a, b] = regPair(yt, yp); const m = a.reduce((s, v) => s + v, 0) / a.length;
    let num = 0, den = 0; for (let i = 0; i < a.length; i++) { num += (a[i] - b[i]) ** 2; den += (a[i] - m) ** 2; }
    if (den === 0) return num === 0 ? 1.0 : 0.0;
    return 1 - num / den;
  };
  M.mean_absolute_error = (yt, yp) => { const [a, b] = regPair(yt, yp); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  M.mean_squared_error = (yt, yp) => { const [a, b] = regPair(yt, yp); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s / a.length; };
  M.root_mean_squared_error = (yt, yp) => Math.sqrt(M.mean_squared_error(yt, yp));
  M.mean_absolute_percentage_error = (yt, yp) => { const [a, b] = regPair(yt, yp); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]) / Math.max(Math.abs(a[i]), Number.EPSILON); return s / a.length; };
  M.silhouette_score = (X, labels) => {
    const m = PB.asX(X, 'X'), lab = vals(labels, 'labels');
    if (lab.length !== m.n) throw PB.err('ValueError', 'Found input variables with inconsistent numbers of samples', TR('จำนวน labels ไม่เท่ากับจำนวนแถวของ X'));
    const L = PB.uniqueSorted(lab);
    if (L.length < 2 || L.length > m.n - 1) throw PB.err('ValueError', `Number of labels is ${L.length}. Valid values are 2 to n_samples - 1 (inclusive)`, TR('ต้องมีอย่างน้อย 2 กลุ่ม (และน้อยกว่าจำนวนข้อมูล) จึงคำนวณ silhouette ได้'));
    if (m.n > 4000) throw PB.err('MemoryError', 'too many samples', TR('ข้อมูลมากเกินไปสำหรับ silhouette_score ในเบราว์เซอร์ (สูงสุด 4,000 แถว)'));
    const li = lab.map((v) => L.findIndex((x) => key(x) === key(v)));
    const cnt = L.map(() => 0); li.forEach((k) => cnt[k]++);
    let tot = 0;
    for (let i = 0; i < m.n; i++) {
      const sums = L.map(() => 0); const r = m.rows[i];
      for (let j = 0; j < m.n; j++) { if (i === j) continue; let s = 0; const q = m.rows[j]; for (let t = 0; t < r.length; t++) s += (r[t] - q[t]) ** 2; sums[li[j]] += Math.sqrt(s); }
      const own = li[i];
      if (cnt[own] === 1) continue;
      const a = sums[own] / (cnt[own] - 1);
      let b = Infinity; for (let k = 0; k < L.length; k++) if (k !== own) b = Math.min(b, sums[k] / cnt[k]);
      tot += (b - a) / Math.max(a, b);
    }
    return tot / m.n;
  };
  M.adjusted_rand_score = (yt, yp) => {
    const [a, b] = pair(yt, yp), n = a.length;
    const A = PB.uniqueSorted(a), B = PB.uniqueSorted(b);
    const ia = new Map(A.map((v, i) => [key(v), i])), ib = new Map(B.map((v, i) => [key(v), i]));
    const C = A.map(() => new Array(B.length).fill(0));
    for (let i = 0; i < n; i++) C[ia.get(key(a[i]))][ib.get(key(b[i]))]++;
    const c2 = (x) => (x * (x - 1)) / 2;
    let sumComb = 0; for (const r of C) for (const v of r) sumComb += c2(v);
    const sa = C.reduce((s, r) => s + c2(r.reduce((x, y) => x + y, 0)), 0);
    const sb = B.reduce((s, _, j) => s + c2(C.reduce((x, r) => x + r[j], 0)), 0);
    const exp = (sa * sb) / c2(n), mx = (sa + sb) / 2;
    if (mx === exp) return 1.0;
    return (sumComb - exp) / (mx - exp);
  };
  M.roc_auc_score = (yt, score) => {
    const [a, s] = pair(yt, score); const L = PB.uniqueSorted(a);
    if (L.length !== 2) throw PB.err('ValueError', 'Only one class present in y_true. ROC AUC score is not defined in that case.', TR('roc_auc_score ใช้ได้กับงาน 2 คลาสเท่านั้น'));
    const pos = key(L[1]); const idx = PB.range(a.length).sort((i, j) => s[i] - s[j]);
    let rank = 0, sumPos = 0, nPos = 0; let i = 0;
    while (i < idx.length) { let j = i; while (j + 1 < idx.length && s[idx[j + 1]] === s[idx[i]]) j++; const avg = (i + j) / 2 + 1; for (let t = i; t <= j; t++) if (key(a[idx[t]]) === pos) { sumPos += avg; nPos++; } i = j + 1; rank++; }
    const nNeg = a.length - nPos;
    return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
  };
  PB.metrics = M;

})();
