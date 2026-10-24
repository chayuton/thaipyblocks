/* ThaiPyBlocks engine (version 3.10): time series and trends.
   - series.ewm(alpha= / span= / com=, adjust=): the weights and the rounding of pandas' ewm kernel
   - PB.decompose: the decompose() helper the blocks write into the Python code, step by step as pandas runs it
     (centered moving average → detrended → mean of each position of the season → seasonal → resid); the
     numbers equal those of statsmodels' seasonal_decompose
   - PB.futureFrame (make_future), PB.seasonalNaive (seasonal_naive), PB.reindexColumns (df.reindex(columns=…))
   - PB.TimeSeriesSplit (scikit-learn): train on the past, test on the next block, for cross_val_score */
(function () {
  const { Series, DataFrame, NDArray } = PB;
  const isMissing = PB.isMissing;
  const nums = (s, op) => s._num(op).map((x) => (typeof x === 'boolean' ? +x : isMissing(x) ? NaN : x));
  const DAY = 86400000;

  /* ---------- exponentially weighted mean: pandas/_libs/window/aggregations.pyx ewm() ---------- */
  class EWM {
    constructor(s, opts = {}) {
      const given = ['com', 'span', 'alpha'].filter((k) => opts[k] !== undefined && opts[k] !== null);
      if (given.length > 1) throw PB.err('ValueError', 'comass, span, halflife, and alpha are mutually exclusive', TR('ใส่ได้เพียงค่าเดียวจาก com, span หรือ alpha'));
      let com;
      /* pandas get_center_of_mass: everything becomes a center of mass, the kernel turns it back into alpha */
      if (given[0] === 'com') {
        if (!(opts.com >= 0)) throw PB.err('ValueError', 'comass must satisfy: comass >= 0', TR('com ต้องไม่ติดลบ'));
        com = opts.com;
      } else if (given[0] === 'span') {
        if (!(opts.span >= 1)) throw PB.err('ValueError', 'span must satisfy: span >= 1', TR('span ต้องมีค่าตั้งแต่ 1 ขึ้นไป'));
        com = (opts.span - 1) / 2;
      } else if (given[0] === 'alpha') {
        if (!(opts.alpha > 0 && opts.alpha <= 1)) throw PB.err('ValueError', 'alpha must satisfy: 0 < alpha <= 1', TR('alpha ต้องมากกว่า 0 และไม่เกิน 1'), TR('ลองใช้ค่าระหว่าง 0.1 ถึง 0.5'));
        com = (1 - opts.alpha) / opts.alpha;
      } else throw PB.err('ValueError', 'Must pass one of comass, span, halflife, or alpha', TR('ต้องกำหนด alpha, span หรือ com'));
      this.s = s; this.com = com; this.adjust = opts.adjust !== false; this.ignoreNa = !!opts.ignore_na;
      this.minp = Math.max(opts.min_periods || 0, 1);
    }
    mean() {
      const v = nums(this.s, 'ewm'), n = v.length, out = new Array(n);
      if (!n) return this.s._new([], { dtype: 'float64' });
      const alpha = 1 / (1 + this.com), oldWtFactor = 1 - alpha, newWt = this.adjust ? 1 : alpha;
      let weighted = v[0], nobs = weighted === weighted ? 1 : 0, oldWt = 1;
      out[0] = nobs >= this.minp ? weighted : NaN;
      for (let i = 1; i < n; i++) {
        const cur = v[i], obs = cur === cur;
        if (obs) nobs++;
        if (weighted === weighted) {
          if (obs || !this.ignoreNa) {
            oldWt *= oldWtFactor;
            if (obs) {
              /* "avoid numerical errors on constant series": an equal value leaves the average as it is */
              if (weighted !== cur) { weighted = oldWt * weighted + newWt * cur; weighted /= oldWt + newWt; }
              if (this.adjust) oldWt += newWt; else oldWt = 1;
            }
          }
        } else if (obs) weighted = cur;
        out[i] = nobs >= this.minp ? weighted : NaN;
      }
      return this.s._new(out, { dtype: 'float64' });
    }
  }
  PB.EWM = EWM;
  Series.prototype.ewm = function (opts) { return new EWM(this, opts); };

  /* ---------- classical decomposition (the decompose() helper of the Python code) ---------- */
  /* pandas' group_mean kernel: a Kahan-compensated sum per group, missing values skipped */
  function groupMeans(vals, period) {
    const sum = new Array(period).fill(0), comp = new Array(period).fill(0), cnt = new Array(period).fill(0);
    vals.forEach((x, i) => {
      if (x !== x) return;
      const g = i % period;
      cnt[g]++;
      const y = x - comp[g], t = sum[g] + y;
      comp[g] = t - sum[g] - y;
      if (comp[g] !== comp[g]) comp[g] = 0;
      sum[g] = t;
    });
    /* positions that never occur (a series shorter than one season) are not groups at all */
    return sum.map((s, g) => (cnt[g] ? s / cnt[g] : g < vals.length ? NaN : undefined)).filter((m) => m !== undefined);
  }
  const MODELS = ['additive', 'multiplicative'];
  PB.decompose = (series, period, model = 'additive') => {
    if (!(series instanceof Series)) throw PB.err('TypeError', `expected a pandas Series, got ${PB.typeName(series)}`, TR('decompose ใช้กับคอลัมน์เดียว (Series) เช่น df["passengers"]'));
    period = Number(period);
    if (!Number.isInteger(period) || period < 1) throw PB.err('ValueError', `period must be a positive integer, got ${PB.repr(period)}`, TR('period ต้องเป็นจำนวนเต็มบวก เช่น 12 สำหรับข้อมูลรายเดือน'));
    if (!MODELS.includes(model)) throw PB.err('ValueError', `model must be "additive" or "multiplicative", got ${PB.repr(model)}`, TR('model ต้องเป็น "additive" หรือ "multiplicative"'));
    const x = nums(series, 'decompose'), n = x.length, add = model === 'additive';
    /* trend: the centered moving average (2×period when period is even) */
    const ma = series.rolling(period, { center: true }).mean();
    const trend = period % 2 === 0 ? ma.rolling(2).mean().shift(-1) : ma;
    const tv = trend.values;
    const det = x.map((v, i) => (add ? v - tv[i] : v / tv[i]));
    const means = groupMeans(det, period), mid = PB.stats.mean(means);
    const index = means.map((m) => (add ? m - mid : m / mid));
    const seasonal = PB.range(n).map((i) => index[i % period]);
    const resid = det.map((d, i) => (add ? d - seasonal[i] : d / seasonal[i]));
    const cols = new Map([['observed', { values: series.values.slice(), dtype: series.dtype }], ['trend', { values: tv.slice(), dtype: 'float64' }], ['seasonal', { values: seasonal, dtype: 'float64' }], ['resid', { values: resid, dtype: 'float64' }]]);
    return new DataFrame(cols, { index: series.index.slice(), indexName: series.indexName, indexDtype: series.indexDtype });
  };

  /* ---------- the next periods (make_future) ---------- */
  /* pd.date_range(start, periods, freq): an anchored frequency first rolls the start forward onto its anchor
     (month start, quarter start, year start, Sunday for "W"); daily dates start on the start itself */
  function rollForward(t, freq) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate(), at = Date.UTC(y, m, day);
    switch (freq) {
      case 'D': return t;
      case 'MS': return day === 1 ? t : Date.UTC(y, m + 1, 1);
      case 'QS': return day === 1 && m % 3 === 0 ? t : Date.UTC(y, Math.floor(m / 3) * 3 + 3, 1);
      case 'YS': return day === 1 && m === 0 ? t : Date.UTC(y + 1, 0, 1);
      case 'W': { const dow = d.getUTCDay(); return dow === 0 ? t : at + (7 - dow) * DAY; }
      default: throw PB.err('ValueError', `Invalid frequency: ${freq}`, TR`ไม่รู้จักความถี่ '${freq}'`, TR('ใช้ "MS" (รายเดือน), "D" (รายวัน), "W" (รายสัปดาห์), "QS" (รายไตรมาส) หรือ "YS" (รายปี)'));
    }
  }
  function stepFrom(t, k, freq) {
    const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth(), rest = t - Date.UTC(y, m, d.getUTCDate());
    switch (freq) {
      case 'D': return t + k * DAY;
      case 'W': return t + 7 * k * DAY;
      case 'MS': return Date.UTC(y, m + k, 1) + rest;
      case 'QS': return Date.UTC(y, m + 3 * k, 1) + rest;
      case 'YS': return Date.UTC(y + k, 0, 1) + rest;
    }
    return NaN;
  }
  /* dates = pd.date_range(last, periods=steps + 1, freq=freq); dates[dates > last][:steps] */
  PB.futureDates = (last, steps, freq) => {
    const first = rollForward(last, freq);
    const out = PB.range(steps + 1).map((k) => stepFrom(first, k, freq)).filter((t) => t > last);
    return out.slice(0, steps);
  };
  PB.futureFrame = (df, dateCol, steps, freq = 'MS', season = 'month') => {
    if (!(df instanceof DataFrame)) throw PB.err('TypeError', `expected a DataFrame, got ${PB.typeName(df)}`, TR('make_future ต้องใช้ตารางข้อมูล (DataFrame)'));
    const s = df.col(dateCol);
    if (s.dtype !== 'datetime64[ns]') throw PB.err('TypeError', `Column '${dateCol}' is not a datetime column`, TR`คอลัมน์ ${dateCol} ยังไม่ใช่วันที่`, TR('สร้างคอลัมน์วันที่ด้วยบล็อก pd.date_range หรือ pd.to_datetime ก่อน'));
    steps = Number(steps);
    if (!Number.isInteger(steps) || steps < 1) throw PB.err('ValueError', `steps must be a positive integer, got ${PB.repr(steps)}`, TR('steps (จำนวนช่วงที่จะพยากรณ์) ต้องเป็นจำนวนเต็มตั้งแต่ 1'));
    if (!df.nrows) throw PB.err('IndexError', 'single positional indexer is out-of-bounds', TR('ตารางไม่มีข้อมูลสักแถว'));
    const last = s.values[s.length - 1];
    if (Number.isNaN(last)) throw PB.err('ValueError', 'Neither `start` nor `end` can be NaT', TR`วันที่แถวสุดท้ายของ ${dateCol} เป็นค่าว่าง (NaT)`, TR('ลบแถวที่วันที่ว่างก่อน'));
    const dates = PB.futureDates(last, steps, freq);
    const out = new DataFrame(new Map([[dateCol, { values: dates, dtype: 'datetime64[ns]' }], ['t', { values: dates.map((_, i) => df.nrows + i), dtype: 'int64' }]]));
    if (season) out.set(season, out.col(dateCol).dt(season));
    return out;
  };

  /* ---------- the seasonal naive baseline (seasonal_naive) ---------- */
  function valuesOf(h, what) {
    if (h instanceof Series) return { vals: h.values, dtype: h.dtype };
    if (h instanceof NDArray && h.shape.length === 1) return { vals: Array.from(h.data), dtype: h.dtype };
    if (Array.isArray(h)) { const v = h.map(PB.unbox); return { vals: v, dtype: PB.inferDtype(v) }; }
    if (h instanceof DataFrame) throw PB.err('ValueError', 'history must be one column', TR`${what} ต้องเป็นคอลัมน์เดียว เช่น y_train`);
    throw PB.err('TypeError', `expected a Series or an array, got ${PB.typeName(h)}`, TR`${what} ต้องเป็นคอลัมน์ข้อมูล แต่ได้ ${PB.typeName(h)}`);
  }
  PB.seasonalNaive = (history, steps, season = 12) => {
    const { vals, dtype } = valuesOf(history, TR('ข้อมูลย้อนหลัง'));
    steps = PB.unbox(steps); season = PB.unbox(season);
    if (!Number.isInteger(steps) || steps < 0) throw PB.err('TypeError', `'${PB.typeName(steps)}' object cannot be interpreted as an integer`, TR('steps ต้องเป็นจำนวนเต็ม เช่น len(y_test)'));
    if (!Number.isInteger(season) || season < 1) throw PB.err('ValueError', 'season must be a positive integer', TR('season ต้องเป็นจำนวนเต็มตั้งแต่ 1 (12 = รายเดือนที่ซ้ำทุกปี, 1 = ใช้ค่าล่าสุด)'));
    const last = vals.slice(Math.max(0, vals.length - season)), out = [];
    for (let i = 0; i < steps; i++) {
      const k = i % season;
      if (k >= last.length) throw PB.err('IndexError', `index ${k} is out of bounds for axis 0 with size ${last.length}`, TR`ข้อมูลย้อนหลังมีเพียง ${last.length} ค่า น้อยกว่า season=${season}`, TR('ลด season หรือใช้ข้อมูลฝึกที่ยาวขึ้น'));
      out.push(last[k]);
    }
    const dt = !out.length ? 'float64' : dtype === 'int64' || dtype === 'float64' || dtype === 'bool' ? dtype : PB.inferDtype(out);
    return new NDArray(out, [out.length], dt);
  };

  /* ---------- df.reindex(columns=ref.columns, fill_value=0) ---------- */
  PB.reindexColumns = (df, cols, fill = 0) => {
    const m = new Map();
    for (const c of cols) m.set(c, df.has(c) ? { values: df._data.get(c).slice(), dtype: df.dtypeOf(c) } : { values: new Array(df.nrows).fill(fill), dtype: PB.inferDtype([fill]) });
    return new DataFrame(m, { index: df.index.slice(), indexName: df.indexName, indexDtype: df.indexDtype });
  };

  /* ---------- sklearn.model_selection.TimeSeriesSplit ---------- */
  class TimeSeriesSplit {
    constructor(opts = {}) {
      this.n_splits = opts.n_splits ?? 5; this.test_size = opts.test_size ?? null; this.gap = opts.gap ?? 0; this.max_train_size = opts.max_train_size ?? null;
      if (!Number.isInteger(this.n_splits) || this.n_splits < 2) throw PB.err('ValueError', `k-fold cross-validation requires at least one train/test split by setting n_splits=2 or more, got n_splits=${this.n_splits}.`, TR('n_splits ต้องเป็นจำนวนเต็มตั้งแต่ 2 ขึ้นไป'));
    }
    pyType() { return 'TimeSeriesSplit'; }
    __repr__() { const v = (x) => (x === null ? 'None' : String(x)); return `TimeSeriesSplit(gap=${this.gap}, max_train_size=${v(this.max_train_size)}, n_splits=${this.n_splits}, test_size=${v(this.test_size)})`; }
    __str__() { return this.__repr__(); }
    folds(n) {
      const k = this.n_splits, gap = this.gap, size = this.test_size ?? Math.floor(n / (k + 1));
      if (k + 1 > n) throw PB.err('ValueError', `Cannot have number of folds=${k + 1} greater than the number of samples=${n}.`, TR`แบ่ง ${k} รอบไม่ได้ เพราะมีข้อมูลเพียง ${n} แถว`, TR('ลด n_splits หรือใช้ข้อมูลที่ยาวขึ้น'));
      if (n - gap - size * k <= 0) throw PB.err('ValueError', `Too many splits=${k} for number of samples=${n} with test_size=${size} and gap=${gap}.`, TR`ข้อมูล ${n} แถวน้อยเกินไปสำหรับ ${k} รอบ`, TR('ลด n_splits'));
      const out = [];
      for (let start = n - k * size; start < n; start += size) {
        const end = start - gap, cap = this.max_train_size;
        const train = cap && cap < end ? PB.range(cap).map((i) => end - cap + i) : PB.range(end);
        out.push([train, PB.range(Math.min(size, n - start)).map((i) => start + i)]);
      }
      return out;
    }
  }
  PB.TimeSeriesSplit = TimeSeriesSplit;
  /* cross_val_score(…, cv=TimeSeriesSplit(…)) and GridSearchCV(…, cv=…) take a splitter as well as a number */
  const kfolds = PB.cvFolds;
  PB.cvFolds = (est, X, y, cv) => (cv instanceof TimeSeriesSplit ? cv.folds(PB.nRows(X)) : kfolds(est, X, y, cv));
  PB.SCORERS.neg_mean_absolute_percentage_error = (e, X, y) => -PB.metrics.mean_absolute_percentage_error(y, PB.runMaybe(e.predict(X)));
})();
