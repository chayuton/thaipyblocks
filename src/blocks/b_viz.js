/* ThaiPyBlocks: chart blocks (seaborn / matplotlib in Python, SVG in the browser) and Python basics. */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py, T = BK.T;
  const PLT = 'import matplotlib.pyplot as plt', SNS = 'import seaborn as sns', PD = 'import pandas as pd';
  const titleLine = (b) => { const t = b.getFieldValue('TITLE'); return t ? `plt.title(${Py.str(t)})\n` : ''; };
  const wrapPlot = (body, b) => { Py.need(PLT); return `plt.figure(figsize=(7, 4))\n${body}${titleLine(b)}plt.show()\n`; };
  const isMiss = PB.isMissing;

  /* ---------- data helpers for chart specs ---------- */
  function orderOf(vals) {
    const seen = new Map();
    for (const v of vals) if (!isMiss(v)) { const k = PB.keyOf(v); if (!seen.has(k)) seen.set(k, v); }
    const u = Array.from(seen.values());
    return u.every((v) => typeof v === 'number') ? u.sort((a, b) => a - b) : u;
  }
  function numCol(df, c, what) {
    const dt = df.dtypeOf(c);
    if (!PB.isNumericDtype(dt) && dt !== 'datetime64[ns]') throw PB.err('TypeError', `Column '${c}' is not numeric`, TR`คอลัมน์ ${c} ไม่ใช่ตัวเลข จึงใช้เป็น${what}ไม่ได้`, TR('เลือกคอลัมน์ตัวเลข หรือใช้กราฟแท่ง/นับจำนวนแทน'));
    return df.col(c).values.map((v) => (typeof v === 'boolean' ? +v : v));
  }
  function binEdges(x) {
    const a = x.filter((v) => Number.isFinite(v)).sort((p, q) => p - q);
    if (!a.length) return [0, 1];
    let lo = a[0], hi = a[a.length - 1];
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    const n = a.length, q = (t) => PB.stats.quantile(a, t);
    const iqr = q(0.75) - q(0.25), fd = 2 * iqr * Math.pow(n, -1 / 3), st = (hi - lo) / (Math.log2(n) + 1);
    const w = fd ? Math.min(fd, st) : st;
    const nb = Math.max(1, Math.min(200, Math.ceil((hi - lo) / w)));
    return PB.range(nb + 1).map((i) => lo + ((hi - lo) * i) / nb);
  }
  PB.binEdges = binEdges;
  function boxStats(v) {
    const a = v.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
    const q = (t) => PB.stats.quantile(a, t);
    const q1 = q(0.25), med = q(0.5), q3 = q(0.75), iqr = q3 - q1;
    const loF = q1 - 1.5 * iqr, hiF = q3 + 1.5 * iqr;
    const inside = a.filter((x) => x >= loF && x <= hiF);
    return { q1, med, q3, lo: inside.length ? inside[0] : q1, hi: inside.length ? inside[inside.length - 1] : q3, out: a.filter((x) => x < loF || x > hiF), n: a.length };
  }
  PB.boxStats = boxStats;
  const hueOpt = (b) => { const h = b.getFieldValue('HUE'); return h && h !== 'None' ? h : null; };

  /* ---------- xy charts ---------- */
  const XY = [['scatterplot', 'scatterplot'], ['lineplot', 'lineplot'], ['barplot', 'barplot'], ['boxplot', 'boxplot']];
  const XY_TH = { scatterplot: 'กราฟจุด (scatter)', lineplot: 'กราฟเส้น', barplot: 'กราฟแท่งค่าเฉลี่ย', boxplot: 'กราฟกล่อง (boxplot)' }; /* th-en */
  def('pb_plot_xy', {
    cat: 'viz', th: TR('กราฟ x–y'), thBreak: true, py: 'sns.{KIND}(data={DF}, x={X}, y={Y}, hue={HUE})\nplt.title({TITLE})',
    f: { KIND: { t: 'dd', opts: XY }, DF: { t: 'var', def: 'df' }, X: { t: 'col' }, Y: { t: 'col' }, HUE: { t: 'col', placeholder: 'None' }, TITLE: { t: 'text', def: '' } },
    init() { this.getField('HUE').placeholder_ = 'None'; },
    tip: TR('scatterplot ดูความสัมพันธ์, lineplot ดูแนวโน้มตามเวลา, barplot เทียบค่าเฉลี่ยตามกลุ่ม, boxplot ดูการกระจาย (hue = แยกสีตามคอลัมน์)'),
    gen: (b, G) => {
      Py.need(SNS);
      const k = G.f(b, 'KIND'), hue = hueOpt(b);
      return wrapPlot(`sns.${k}(data=${G.v(b, 'DF')}, x=${G.col(b, 'X')}, y=${G.col(b, 'Y')}${hue ? `, hue=${Py.str(hue)}` : ''}${k === 'barplot' || k === 'lineplot' ? ', errorbar=None' : ''})\n`, b);
    },
    *run(b, I) {
      const df = I.df(b), k = b.getFieldValue('KIND'), xc = I.colName(b, 'X'), yc = I.colName(b, 'Y'), hue = hueOpt(b), title = b.getFieldValue('TITLE');
      df._need(xc); df._need(yc); if (hue) df._need(hue);
      const hv = hue ? df.col(hue).values : null;
      if (k === 'scatterplot') {
        const x = numCol(df, xc, TR('แกน x')), y = numCol(df, yc, TR('แกน y'));
        I.out.chart({ kind: 'scatter', title, x: { label: xc, values: x, date: df.dtypeOf(xc) === 'datetime64[ns]' }, y: { label: yc, values: y }, hue: hue ? { label: hue, values: hv } : null }, b);
      } else if (k === 'lineplot') {
        const xv = df.col(xc).values, y = numCol(df, yc, TR('แกน y')), isDate = df.dtypeOf(xc) === 'datetime64[ns]';
        const groups = hue ? orderOf(hv) : [null];
        const series = groups.map((g) => {
          const acc = new Map();
          xv.forEach((xx, i) => { if (isMiss(xx) || isMiss(y[i]) || (g !== null && PB.keyOf(hv[i]) !== PB.keyOf(g))) return; const kk = PB.keyOf(xx); if (!acc.has(kk)) acc.set(kk, [xx, 0, 0]); const e = acc.get(kk); e[1] += y[i]; e[2]++; });
          let pts = Array.from(acc.values()).map(([xx, s, c]) => [xx, s / c]);
          if (pts.every((p) => typeof p[0] === 'number')) pts.sort((p, q) => p[0] - q[0]);
          return { name: g === null ? yc : PB.str(g), points: pts };
        });
        I.out.chart({ kind: 'line', title, x: { label: xc, date: isDate, categorical: !series.every((s) => s.points.every((p) => typeof p[0] === 'number')) }, y: { label: yc }, series }, b);
      } else if (k === 'barplot') {
        const xv = df.col(xc).values, y = numCol(df, yc, TR('แกน y'));
        const cats = orderOf(xv), groups = hue ? orderOf(hv) : [null];
        const series = groups.map((g) => ({ name: g === null ? yc : PB.str(g), values: cats.map((c) => { let s = 0, n = 0; xv.forEach((xx, i) => { if (PB.keyOf(xx) === PB.keyOf(c) && !isMiss(y[i]) && (g === null || PB.keyOf(hv[i]) === PB.keyOf(g))) { s += y[i]; n++; } }); return n ? s / n : NaN; }) }));
        I.out.chart({ kind: 'bar', title, categories: cats.map(PB.str), series, xlabel: xc, ylabel: yc + TR(' (เฉลี่ย)') }, b);
      } else {
        const xv = df.col(xc).values, y = numCol(df, yc, TR('แกน y'));
        const cats = orderOf(xv);
        I.out.chart({ kind: 'box', title, xlabel: xc, ylabel: yc, groups: cats.map((c) => ({ name: PB.str(c), ...boxStats(y.filter((_, i) => PB.keyOf(xv[i]) === PB.keyOf(c))) })) }, b);
      }
    },
    ex: (b, X) => T(X, `วาด${XY_TH[X.f(b, 'KIND')]}จาก ${X.v(b, 'DF')} แกน x = ${X.f(b, 'X')} แกน y = ${X.f(b, 'Y')}${hueOpt(b) ? ` แยกสีตาม ${hueOpt(b)}` : ''}`, `draw a ${X.f(b, 'KIND')} of ${X.f(b, 'Y')} against ${X.f(b, 'X')}${hueOpt(b) ? ` colored by ${hueOpt(b)}` : ''}`),
  });
  const DIST = [['histplot', 'histplot'], ['countplot', 'countplot']];
  def('pb_plot_dist', {
    cat: 'viz', th: TR('กราฟการกระจาย'), thBreak: true, py: 'sns.{KIND}(data={DF}, x={X}, hue={HUE})\nplt.title({TITLE})',
    f: { KIND: { t: 'dd', opts: DIST }, DF: { t: 'var', def: 'df' }, X: { t: 'col' }, HUE: { t: 'col', placeholder: 'None' }, TITLE: { t: 'text', def: '' } },
    init() { this.getField('HUE').placeholder_ = 'None'; },
    tip: TR('histplot = ฮิสโตแกรมของคอลัมน์ตัวเลข, countplot = นับจำนวนแต่ละหมวดหมู่'),
    gen: (b, G) => {
      Py.need(SNS);
      const k = G.f(b, 'KIND'), hue = hueOpt(b);
      return wrapPlot(`sns.${k}(data=${G.v(b, 'DF')}, x=${G.col(b, 'X')}${hue ? `, hue=${Py.str(hue)}` : ''}${k === 'histplot' && hue ? ', multiple="stack"' : ''})\n`, b);
    },
    *run(b, I) {
      const df = I.df(b), k = b.getFieldValue('KIND'), xc = I.colName(b, 'X'), hue = hueOpt(b), title = b.getFieldValue('TITLE');
      df._need(xc); if (hue) df._need(hue);
      const hv = hue ? df.col(hue).values : null, groups = hue ? orderOf(hv) : [null];
      if (k === 'histplot') {
        const x = numCol(df, xc, TR('ฮิสโตแกรม')); const edges = binEdges(x);
        const series = groups.map((g) => {
          const cnt = new Array(edges.length - 1).fill(0);
          x.forEach((v, i) => { if (!Number.isFinite(v) || (g !== null && PB.keyOf(hv[i]) !== PB.keyOf(g))) return; let j = Math.floor(((v - edges[0]) / (edges[edges.length - 1] - edges[0])) * (edges.length - 1)); j = Math.min(Math.max(j, 0), edges.length - 2); cnt[j]++; });
          return { name: g === null ? 'Count' : PB.str(g), values: cnt };
        });
        I.out.chart({ kind: 'hist', title, edges, series, xlabel: xc, ylabel: 'Count' }, b);
      } else {
        const xv = df.col(xc).values, cats = orderOf(xv);
        const series = groups.map((g) => ({ name: g === null ? 'count' : PB.str(g), values: cats.map((c) => xv.filter((v, i) => PB.keyOf(v) === PB.keyOf(c) && (g === null || PB.keyOf(hv[i]) === PB.keyOf(g))).length) }));
        I.out.chart({ kind: 'bar', title, categories: cats.map(PB.str), series, xlabel: xc, ylabel: 'count' }, b);
      }
    },
    ex: (b, X) => T(X, X.f(b, 'KIND') === 'histplot' ? `วาดฮิสโตแกรมแสดงการกระจายของ ${X.f(b, 'X')}` : `วาดกราฟแท่งนับจำนวนแต่ละค่าของ ${X.f(b, 'X')}`, X.f(b, 'KIND') === 'histplot' ? `draw a histogram of ${X.f(b, 'X')}` : `count each value of ${X.f(b, 'X')}`),
  });
  /* wide-form boxplot: one box per column, to compare scales before/after normalizing and spot outliers */
  def('pb_plot_box_cols', {
    cat: 'viz', th: TR('กราฟกล่องหลายคอลัมน์'), thBreak: true, py: 'sns.boxplot(data={DF}[[{COLS}]])\nplt.title({TITLE})', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' }, TITLE: { t: 'text', def: '' } },
    tip: TR('กล่องหนึ่งกล่องต่อหนึ่งคอลัมน์: เทียบช่วงของค่าแต่ละคอลัมน์ (เห็นชัดว่าทำไมต้องปรับสเกล) และจุดนอกหนวดคือค่าผิดปกติตามกฎ 1.5×IQR'),
    gen: (b, G) => { Py.need(SNS); return wrapPlot(`sns.boxplot(data=${G.v(b, 'DF')}[${Py.list(G.cols(b, 'COLS'))}])\n`, b); },
    *run(b, I) {
      const df = I.df(b), cols = I.colList(b);
      const groups = cols.map((c) => { df._need(c); return { name: c, ...boxStats(numCol(df, c, TR('กราฟกล่อง'))) }; });
      I.out.chart({ kind: 'box', wide: true, title: b.getFieldValue('TITLE'), xlabel: TR('คอลัมน์'), ylabel: TR('ค่า'), groups }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟกล่องเทียบการกระจายของคอลัมน์ ${X.f(b, 'COLS')} ใน ${X.v(b, 'DF')}`, `draw a box plot of the columns ${X.f(b, 'COLS')} of ${X.v(b, 'DF')}`),
  });
  def('pb_plot_heat', {
    cat: 'viz', th: TR('แผนที่ความร้อน'), py: 'sns.heatmap( {@M} , annot=True)\nplt.title({TITLE})', f: { M: {}, TITLE: { t: 'text', def: '' } },
    tip: TR('ระบายสีตารางตัวเลข เช่น df.corr() หรือ confusion_matrix(...)'),
    gen: (b, G) => {
      Py.need(SNS);
      const src = b.getInputTargetBlock('M');
      const corr = src && src.type === 'pb_df_info' && src.getFieldValue('FN') === 'corr';
      return wrapPlot(`sns.heatmap(${G.in(b, 'M')}, annot=True, fmt=${corr ? '".2f"' : '"g"'}, cmap=${corr ? '"coolwarm", vmin=-1, vmax=1' : '"Blues"'})\n`, b);
    },
    *run(b, I) {
      const m = yield* I.need(b, 'M'), title = b.getFieldValue('TITLE');
      let rows, cols, vals;
      if (m instanceof PB.DataFrame) { rows = m.index.map(PB.str); cols = m.columns; vals = rows.map((_, i) => cols.map((c) => Number(m._data.get(c)[i]))); }
      else if (m instanceof PB.NDArray && m.shape.length === 2) { const lab = m.labels ? m.labels.map(PB.str) : PB.range(m.shape[0]).map(String); rows = lab; cols = m.labels ? lab : PB.range(m.shape[1]).map(String); vals = m.data.map((r) => Array.from(r, Number)); }
      else throw PB.err('ValueError', 'heatmap expects a 2D table', TR('แผนที่ความร้อนต้องใช้ตาราง 2 มิติ เช่น df.corr() หรือ confusion_matrix'), '');
      const src = b.getInputTargetBlock('M');
      const diverging = !!(src && src.type === 'pb_df_info' && src.getFieldValue('FN') === 'corr');
      I.out.chart({ kind: 'heatmap', title, rows, cols, values: vals, diverging }, b);
    },
    ex: (b, X) => T(X, `วาดแผนที่ความร้อนของ${X.in(b, 'M')}`, `draw a heatmap of ${X.in(b, 'M')}`),
  });
  def('pb_plot_cm', {
    cat: 'viz', th: TR('ตารางความสับสน'), py: 'ConfusionMatrixDisplay.from_predictions({YT}, {YP})', f: { YT: { t: 'var', def: 'y_test' }, YP: { t: 'var', def: 'y_pred' } },
    tip: TR('แถว = คำตอบจริง, คอลัมน์ = สิ่งที่โมเดลทาย ช่องทแยงคือทายถูก'),
    gen: (b, G) => { Py.need(PLT); Py.need('sklearn.metrics', 'ConfusionMatrixDisplay'); return `ConfusionMatrixDisplay.from_predictions(${G.v(b, 'YT')}, ${G.v(b, 'YP')}, cmap="Blues")\nplt.show()\n`; },
    *run(b, I) { const cm = PB.metrics.confusion_matrix(I.vv(b, 'YT'), I.vv(b, 'YP')); const lab = cm.labels.map(PB.str); I.out.chart({ kind: 'heatmap', title: 'Confusion matrix', rows: lab, cols: lab, values: cm.data, xlabel: 'Predicted label', ylabel: 'True label' }, b); },
    ex: (b, X) => T(X, `วาดตารางความสับสนเทียบคำตอบจริง ${X.v(b, 'YT')} กับค่าทำนาย ${X.v(b, 'YP')}`, `plot the confusion matrix of ${X.v(b, 'YT')} vs ${X.v(b, 'YP')}`),
  });
  def('pb_plot_importance', {
    cat: 'viz', th: TR('ความสำคัญของฟีเจอร์'), thBreak: true, py: 'pd.Series({M}.{ATTR}, index={X}.columns).sort_values().plot.barh()',
    f: { M: { t: 'var', def: 'model' }, ATTR: { t: 'dd', opts: [['feature_importances_', 'feature_importances_'], ['coef_', 'coef_'], ['scores_ (SelectKBest)', 'scores_']] }, X: { t: 'var', def: 'X' } },
    tip: TR('ดูว่าฟีเจอร์ไหนมีผลต่อการทำนายมากที่สุด (โมเดลต้นไม้ใช้ feature_importances_, โมเดลเส้นตรงใช้ coef_)'),
    gen: (b, G) => { Py.need(PD); const a = G.f(b, 'ATTR'); const v = `${G.v(b, 'M')}.${a}${a === 'coef_' ? '.ravel()' : ''}`; return wrapPlot(`pd.Series(${v}, index=${G.v(b, 'X')}.columns).sort_values().plot.barh()\n`, { getFieldValue: () => 'Feature importance' }); },
    *run(b, I) {
      const m0 = I.model(b), a = b.getFieldValue('ATTR'), X = I.vv(b, 'X');
      const m = m0 instanceof PB.Pipeline ? (a === 'scores_' ? m0.steps.find((st) => st instanceof PB.SelectKBest) || m0.final : m0.final) : m0;
      if (!(X instanceof PB.DataFrame)) throw PB.err('AttributeError', `'${PB.typeName(X)}' object has no attribute 'columns'`, TR('X ต้องเป็น DataFrame เพื่ออ่านชื่อคอลัมน์'));
      m._needFit(a);
      const v = m[a];
      if (v === undefined) throw PB.err('AttributeError', `'${m.constructor.pyName}' object has no attribute '${a}'`, TR`${m.constructor.pyName} ไม่มี ${a}`, a === 'scores_' ? TR('scores_ ใช้กับตัวเลือกฟีเจอร์ SelectKBest') : a === 'feature_importances_' ? TR('เลือก coef_ สำหรับโมเดลเส้นตรง') : TR('เลือก feature_importances_ สำหรับโมเดลต้นไม้'));
      const vals = v.shape && v.shape.length === 2 ? v.data[0] : Array.from(v.data);
      if (vals.length !== X.ncols) throw PB.err('ValueError', `Length of values (${vals.length}) does not match length of index (${X.ncols})`, TR('จำนวนค่าไม่เท่ากับจำนวนคอลัมน์ของ X'), TR('ใช้ X ชุดเดียวกับที่ใช้ฝึกโมเดล'));
      const pairs = X.columns.map((c, i) => [c, Number(vals[i])]).sort((p, q) => q[1] - p[1]);
      I.out.chart({ kind: 'bar', horizontal: true, title: 'Feature importance', categories: pairs.map((p) => p[0]), series: [{ name: a, values: pairs.map((p) => p[1]) }], xlabel: a, ylabel: '' }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟแท่งแนวนอนเรียงความสำคัญของแต่ละคอลัมน์ใน ${X.v(b, 'X')} ตามโมเดล ${X.v(b, 'M')}`, `plot ${X.v(b, 'M')}'s ${X.f(b, 'ATTR')} for each column of ${X.v(b, 'X')}`),
  });
  def('pb_plot_pred', {
    cat: 'viz', th: TR('ค่าจริงเทียบค่าทำนาย'), py: 'plt.scatter({YT}, {YP})', f: { YT: { t: 'var', def: 'y_test' }, YP: { t: 'var', def: 'y_pred' } },
    tip: TR('จุดยิ่งใกล้เส้นทแยงยิ่งทำนายแม่น (ใช้กับงานพยากรณ์ค่า)'),
    gen: (b, G) => { const yt = G.v(b, 'YT'), yp = G.v(b, 'YP'); return wrapPlot(TR`plt.scatter(${yt}, ${yp}, alpha=0.7)\nlims = [min(${yt}.min(), ${yp}.min()), max(${yt}.max(), ${yp}.max())]\nplt.plot(lims, lims, "--", color="gray")\nplt.xlabel("ค่าจริง")\nplt.ylabel("ค่าทำนาย")\n`, { getFieldValue: () => 'Actual vs predicted' }); },
    *run(b, I) {
      const yt = PB.asY(I.vv(b, 'YT'), 'y_true').values.map(Number), yp = PB.asY(I.vv(b, 'YP'), 'y_pred').values.map(Number);
      if (yt.length !== yp.length) throw PB.err('ValueError', 'x and y must be the same size', TR('จำนวนค่าจริงและค่าทำนายไม่เท่ากัน'));
      I.out.chart({ kind: 'scatter', title: 'Actual vs predicted', x: { label: TR('ค่าจริง (') + I.vname(b, 'YT') + ')', values: yt }, y: { label: TR('ค่าทำนาย (') + I.vname(b, 'YP') + ')', values: yp }, identity: true }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟจุดเทียบค่าจริง ${X.v(b, 'YT')} กับค่าทำนาย ${X.v(b, 'YP')} พร้อมเส้นทแยงที่ทำนายถูกพอดี`, `scatter actual ${X.v(b, 'YT')} against predicted ${X.v(b, 'YP')}`),
  });
  const PLOT_FC_PY = TR`def plot_forecast(dates, values, forecast, freq="MS"):
    """วาดข้อมูลจริงต่อด้วยค่าพยากรณ์ (เส้นประ)"""
    future = pd.date_range(dates.iloc[-1], periods=len(forecast) + 1, freq=freq)[1:]
    plt.figure(figsize=(8, 4))
    plt.plot(dates, values, label="ข้อมูลจริง")
    plt.plot(future, forecast, "--", label="พยากรณ์")
    plt.legend()
    plt.show()`;
  def('pb_plot_forecast', {
    cat: 'viz', th: TR('กราฟพยากรณ์'), py: 'plot_forecast({DF}[{DATE}], {DF2}[{COL}], {FC})', f: { DF: { t: 'var', def: 'df' }, DATE: { t: 'col', of: 'DF' }, DF2: { t: 'var', def: 'df' }, COL: { t: 'col', of: 'DF2' }, FC: { t: 'var', def: 'forecast' } },
    tip: TR('เส้นทึบ = ข้อมูลจริง, เส้นประ = ค่าพยากรณ์ช่วงถัดไป'),
    gen: (b, G) => { Py.need(PD); Py.need(PLT); Py.helper('plot_forecast', PLOT_FC_PY); return `plot_forecast(${G.v(b, 'DF')}[${G.col(b, 'DATE')}], ${G.v(b, 'DF2')}[${G.col(b, 'COL')}], ${G.v(b, 'FC')})\n`; },
    *run(b, I) {
      const df = I.df(b, 'DF'), dc = I.colName(b, 'DATE'), df2 = I.df(b, 'DF2'), vc = I.colName(b, 'COL');
      const dates = df.col(dc), vals = numCol(df2, vc, TR('ค่าที่วาด')), fc = PB.py.toList(I.vv(b, 'FC'), TR('ค่าพยากรณ์')).map(Number);
      if (dates.dtype !== 'datetime64[ns]') throw PB.err('TypeError', 'dates must be datetime', TR`คอลัมน์ ${dc} ยังไม่ใช่วันที่`, TR('สร้างคอลัมน์วันที่ด้วยบล็อก pd.date_range หรือ pd.to_datetime'));
      const dv = dates.values; const last = dv[dv.length - 1];
      const step = dv.length > 1 ? dv[dv.length - 1] - dv[dv.length - 2] : 86400000;
      const monthly = dv.length > 1 && new Date(dv[dv.length - 1]).getUTCDate() === 1 && step > 27 * 86400000 && step < 32 * 86400000;
      const future = fc.map((_, i) => { if (monthly) { const d = new Date(last); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i + 1, 1); } return last + step * (i + 1); });
      I.out.chart({ kind: 'line', title: 'Forecast', x: { label: dc, date: true }, y: { label: vc }, series: [{ name: TR('ข้อมูลจริง'), points: dv.map((d, i) => [d, vals[i]]) }, { name: TR('พยากรณ์'), dashed: true, points: [[last, vals[vals.length - 1]]].concat(future.map((d, i) => [d, fc[i]])) }] }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟ ${X.f(b, 'COL')} ตามเวลา ต่อด้วยค่าพยากรณ์ ${X.v(b, 'FC')} เป็นเส้นประ`, `plot ${X.f(b, 'COL')} over time followed by the forecast ${X.v(b, 'FC')}`),
  });
  def('pb_plot_list', {
    cat: 'viz', th: TR('กราฟจากลิสต์'), py: 'plt.{KIND}( {@DATA} )\nplt.title({TITLE})', f: { KIND: { t: 'dd', opts: [['plot', 'plot'], ['bar', 'bar']] }, DATA: {}, TITLE: { t: 'text', def: '' } },
    tip: TR('วาดลิสต์ตัวเลขที่สร้างจากลูป เช่น inertia ของ KMeans หลายค่า k (elbow method)'),
    gen: (b, G) => {
      const k = G.f(b, 'KIND'), d = G.in(b, 'DATA', python.Order.NONE, '[]');
      return wrapPlot(k === 'bar' ? `plt.bar(range(len(${d})), ${d})\n` : `plt.plot(${d}, marker="o")\n`, b);
    },
    *run(b, I) {
      const d = yield* I.need(b, 'DATA');
      const vals = PB.py.toList(d, TR('ข้อมูลกราฟ')).map((v) => { v = PB.unbox(v); if (typeof v !== 'number') throw PB.err('TypeError', 'data must be numeric', TR('ลิสต์ต้องมีแต่ตัวเลข')); return v; });
      const title = b.getFieldValue('TITLE');
      if (b.getFieldValue('KIND') === 'bar') I.out.chart({ kind: 'bar', title, categories: vals.map((_, i) => String(i)), series: [{ name: 'value', values: vals }], xlabel: '', ylabel: '' }, b);
      else I.out.chart({ kind: 'line', title, x: { label: '' }, y: { label: '' }, series: [{ name: 'value', points: vals.map((v, i) => [i, v]) }], markers: true }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟ${X.f(b, 'KIND') === 'bar' ? 'แท่ง' : 'เส้น'}ของ${X.in(b, 'DATA')}`, `plot ${X.in(b, 'DATA')} as a ${X.f(b, 'KIND') === 'bar' ? 'bar' : 'line'} chart`),
  });
  const SHOW_IMG_PY = TR`def show_images(df, n=10, label=None, size=8):
    """แสดงภาพขนาด size×size จากคอลัมน์พิกเซล (ตัด label ออก)"""
    pixels = df.drop(columns=[label]) if label else df
    fig, axes = plt.subplots(1, n, figsize=(n * 1.2, 1.6))
    for ax, (i, row) in zip(axes, pixels.head(n).iterrows()):
        ax.imshow(row.to_numpy().reshape(size, size), cmap="gray_r")
        ax.set_title(str(df.loc[i, label]) if label else str(i))
        ax.axis("off")
    plt.show()`;
  def('pb_plot_images', {
    cat: 'viz', th: TR('แสดงภาพพิกเซล'), py: 'show_images({DF}, n={N}, label={COL})', f: { DF: { t: 'var', def: 'df' }, N: { t: 'num', def: 10, min: 1, max: 40, prec: 1 }, COL: { t: 'col', placeholder: 'None' } },
    init() { this.getField('COL').placeholder_ = 'None'; },
    tip: TR('แสดงแถวของตารางพิกเซลเป็นภาพ (เช่น ตัวเลขลายมือ 8×8) พร้อมป้ายกำกับ'),
    gen: (b, G) => { Py.need(PLT); Py.helper('show_images', SHOW_IMG_PY); const c = b.getFieldValue('COL'); return `show_images(${G.v(b, 'DF')}, n=${G.f(b, 'N')}, label=${c ? Py.str(c) : 'None'})\n`; },
    *run(b, I) {
      const df = I.df(b), n = Math.min(Number(b.getFieldValue('N')), df.nrows), lab = b.getFieldValue('COL') || null;
      if (lab) df._need(lab);
      const pixCols = df.columns.filter((c) => c !== lab);
      const side = Math.round(Math.sqrt(pixCols.length));
      if (side * side !== pixCols.length) throw PB.err('ValueError', `cannot reshape array of size ${pixCols.length} into shape (${side},${side})`, TR`มี ${pixCols.length} คอลัมน์พิกเซล จัดเป็นภาพสี่เหลี่ยมจัตุรัสไม่ได้`, TR('เลือกคอลัมน์ป้ายกำกับ (label) ให้ถูกต้อง'));
      const images = PB.range(n).map((i) => ({ pixels: pixCols.map((c) => Number(df._data.get(c)[i])), label: lab ? PB.str(df._data.get(lab)[i]) : PB.str(df.index[i]) }));
      I.out.chart({ kind: 'images', title: '', side, images }, b);
    },
    ex: (b, X) => T(X, `แสดงภาพ ${X.f(b, 'N')} ภาพแรกจาก ${X.v(b, 'DF')}${X.f(b, 'COL') ? ` พร้อมป้าย ${X.f(b, 'COL')}` : ''}`, `show the first ${X.f(b, 'N')} images of ${X.v(b, 'DF')}`),
  });

  /* ======================= Python basics ======================= */
  def('pb_print2', {
    cat: 'pybasic', py: 'print({LABEL}, {@VAL})', f: { LABEL: { t: 'text', def: TR('ผลลัพธ์:') }, VAL: {} },
    tip: TR('พิมพ์ข้อความกำกับตามด้วยค่า เช่น print("Accuracy:", acc)'),
    gen: (b, G) => `print(${Py.str(G.f(b, 'LABEL'))}, ${G.in(b, 'VAL')})\n`,
    *run(b, I) { const v = yield* I.valRaw(b, 'VAL', null); I.out.print([b.getFieldValue('LABEL'), v], b); },
    ex: (b, X) => T(X, `แสดง "${X.f(b, 'LABEL')}" ตามด้วย${X.in(b, 'VAL')}`, `print "${X.f(b, 'LABEL')}" followed by ${X.in(b, 'VAL')}`),
  });
  def('pb_comment', {
    cat: 'pybasic', py: '# {TEXT}', f: { TEXT: { t: 'text', def: TR('อธิบายขั้นตอนนี้') } },
    tip: TR('คอมเมนต์ใน Python (ไม่ถูกรัน)'),
    gen: (b, G) => `# ${G.f(b, 'TEXT')}\n`,
    *run() { },
    ex: (b, X) => T(X, `หมายเหตุ: ${X.f(b, 'TEXT')}`, `note: ${X.f(b, 'TEXT')}`),
  });
  def('pb_len', {
    cat: 'pybasic', out: true, py: 'len( {@X} )', f: { X: {} }, tip: TR('จำนวนสมาชิก/จำนวนแถว'),
    gen: (b, G) => `len(${G.in(b, 'X')})`,
    *run(b, I) { return PB.py.len(yield* I.need(b, 'X')); },
    ex: (b, X) => T(X, `จำนวนสมาชิกของ${X.in(b, 'X')}`, `the length of ${X.in(b, 'X')}`),
  });
  def('pb_round', {
    cat: 'pybasic', out: true, py: 'round( {@X} , {N} )', f: { X: {}, N: { t: 'num', def: 3, min: 0, max: 10, prec: 1 } }, tip: TR('ปัดเศษทศนิยม'),
    gen: (b, G) => `round(${G.in(b, 'X', python.Order.NONE, '0')}, ${G.f(b, 'N')})`,
    *run(b, I) {
      const raw = yield* I.needRaw(b, 'X'), x = PB.unbox(raw); const n = Number(b.getFieldValue('N'));
      if (x instanceof PB.Series) return x.round(n);
      if (typeof x !== 'number') throw PB.err('TypeError', `type ${PB.typeName(x)} doesn't define __round__ method`, TR('ปัดเศษได้เฉพาะตัวเลข'));
      /* round(int, n) stays an int in Python; round(float, n) is a float */
      return PB.isFloat(raw) ? PB.toFloat(PB.py.round(x, n)) : x;
    },
    ex: (b, X) => T(X, `${X.in(b, 'X')} ปัดเป็นทศนิยม ${X.f(b, 'N')} ตำแหน่ง`, `${X.in(b, 'X')} rounded to ${X.f(b, 'N')} decimals`),
  });
  def('pb_type', {
    cat: 'pybasic', out: true, py: 'type( {@X} ).__name__', f: { X: {} }, tip: TR('ชื่อชนิดข้อมูลของค่า'),
    gen: (b, G) => [`type(${G.in(b, 'X')}).__name__`, python.Order.MEMBER],
    *run(b, I) { return PB.typeName(yield* I.val(b, 'X', null)); },
    ex: (b, X) => T(X, `ชื่อชนิดข้อมูลของ${X.in(b, 'X')}`, `the type name of ${X.in(b, 'X')}`),
  });
  def('pb_range', {
    cat: 'pybasic', out: true, py: 'list(range({A}, {B}))', f: { A: { t: 'num', def: 1, prec: 1 }, B: { t: 'num', def: 11, prec: 1 } }, tip: TR('ลิสต์ตัวเลขตั้งแต่ A ถึง B-1'),
    gen: (b, G) => `list(range(${G.f(b, 'A')}, ${G.f(b, 'B')}))`,
    *run(b) { const a = Number(b.getFieldValue('A')), c = Number(b.getFieldValue('B')); const out = []; for (let i = a; i < c; i++) out.push(i); return out; },
    ex: (b, X) => T(X, `ลิสต์ตัวเลข ${X.f(b, 'A')} ถึง ${Number(X.f(b, 'B')) - 1}`, `the numbers ${X.f(b, 'A')} to ${Number(X.f(b, 'B')) - 1}`),
  });
  def('pb_append', {
    cat: 'pybasic', py: '{L}.append( {@X} )', f: { L: { t: 'var', def: 'items' }, X: {} }, tip: TR('เพิ่มค่าต่อท้ายลิสต์'),
    gen: (b, G) => `${G.v(b, 'L')}.append(${G.in(b, 'X')})\n`,
    *run(b, I) { const name = I.vname(b, 'L'), L = I.get(name); if (!Array.isArray(L)) throw PB.err('AttributeError', `'${PB.typeName(L)}' object has no attribute 'append'`, TR`${name} ไม่ใช่ลิสต์`, TR('กำหนดให้เป็นลิสต์ว่างก่อน เช่น items = []')); L.push(yield* I.valRaw(b, 'X', null)); },
    ex: (b, X) => T(X, `เพิ่ม${X.in(b, 'X')} ต่อท้ายลิสต์ ${X.v(b, 'L')}`, `append ${X.in(b, 'X')} to ${X.v(b, 'L')}`),
  });
})();
