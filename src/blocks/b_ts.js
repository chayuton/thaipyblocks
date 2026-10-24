/* ThaiPyBlocks (version 3.10): time series and trend forecasting blocks — a time index t, comparing with N periods
   before, exponential smoothing, classical decomposition (trend + seasonal + residual) and its chart, several
   columns over time in one chart, the next periods for a trend model, lining up the columns of new data with the
   training columns, the seasonal naive baseline and cross-validation with TimeSeriesSplit.
   The helpers written into the Python code (decompose, plot_decompose, make_future, seasonal_naive) are computed
   by src/engine/timeseries.js exactly as pandas runs them. */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py, T = BK.T;
  const PD = 'import pandas as pd', NP = 'import numpy as np', PLT = 'import matplotlib.pyplot as plt';

  /* ---------- a time index t = 0, 1, 2, … ---------- */
  def('pb_time_index', {
    cat: 'data', th: TR('สร้างลำดับเวลา'), py: '{DF}[{NAME}] = np.arange(len(…))', f: { DF: { t: 'var', def: 'df' }, NAME: { t: 'text', def: 't' } },
    tip: TR('คอลัมน์ t = 0, 1, 2, … นับช่วงเวลาตั้งแต่แถวแรก ใช้เป็นฟีเจอร์ของเส้นแนวโน้ม (LinearRegression ทาย y จาก t)'),
    gen: (b, G) => { Py.need(NP); const df = G.v(b, 'DF'); return `${df}[${Py.str(G.f(b, 'NAME'))}] = np.arange(len(${df}))\n`; },
    *run(b, I) { const df = I.df(b); df.set(b.getFieldValue('NAME'), new PB.Series(PB.range(df.nrows), { dtype: 'int64' })); },
    ex: (b, X) => T(X, `สร้างคอลัมน์ ${X.f(b, 'NAME')} ใน ${X.v(b, 'DF')} เป็นลำดับเวลา 0, 1, 2, … ของแต่ละแถว`, `add a column ${X.f(b, 'NAME')} to ${X.v(b, 'DF')} counting the periods 0, 1, 2, …`),
  });

  /* ---------- compared with N periods before ---------- */
  const SHIFT = [['.shift', 'shift'], ['.diff', 'diff'], ['.pct_change', 'pct_change']];
  def('pb_shift', {
    cat: 'data', out: true, py: '{DF}[{COL}]{FN}({N})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: SHIFT }, N: { t: 'num', def: 12, min: 1, max: 400, prec: 1 } },
    tip: TR('เทียบกับ N ช่วงก่อนหน้า: shift(12) = ค่าเมื่อ 12 ช่วงก่อน (เดือนเดียวกันของปีก่อน) · diff(12) = เพิ่มขึ้นกี่หน่วย · pct_change(12) = เพิ่มขึ้นเป็นสัดส่วนเท่าไร (0.1 = 10%)'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}].${G.f(b, 'FN')}(${G.f(b, 'N')})`, python.Order.FUNCTION_CALL],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), n = Number(b.getFieldValue('N')), fn = b.getFieldValue('FN');
      return fn === 'shift' ? s.shift(n) : fn === 'diff' ? s.diff(n) : s.pct_change(n);
    },
    ex: (b, X) => { const fn = X.f(b, 'FN'), c = X.f(b, 'COL'), n = X.f(b, 'N'); return T(X, { shift: `ค่าของ ${c} เมื่อ ${n} ช่วงก่อนหน้า`, diff: `ผลต่างของ ${c} เทียบกับ ${n} ช่วงก่อนหน้า`, pct_change: `อัตราการเปลี่ยนแปลงของ ${c} เทียบกับ ${n} ช่วงก่อนหน้า (เป็นสัดส่วน)` }[fn], { shift: `${c} from ${n} periods before`, diff: `the change of ${c} over ${n} periods`, pct_change: `the relative change of ${c} over ${n} periods` }[fn]); },
  });

  /* ---------- exponential smoothing ---------- */
  def('pb_ewm', {
    cat: 'data', out: true, py: '{DF}[{COL}].ewm(alpha={A}, adjust=False).mean()', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, A: { t: 'num', def: 0.3, min: 0.01, max: 1 } },
    tip: TR('ปรับเรียบแบบเอกซ์โพเนนเชียล (exponential smoothing): ค่าใหม่ = alpha × ค่าจริงล่าสุด + (1 − alpha) × ค่าปรับเรียบก่อนหน้า · alpha ใกล้ 1 ตามข้อมูลไว ใกล้ 0 ยิ่งเรียบ'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}].ewm(alpha=${Py.num(G.f(b, 'A'))}, adjust=False).mean()`, python.Order.FUNCTION_CALL],
    *run(b, I) { return I.df(b).col(I.colName(b)).ewm({ alpha: Number(b.getFieldValue('A')), adjust: false }).mean(); },
    ex: (b, X) => T(X, `ค่าปรับเรียบแบบเอกซ์โพเนนเชียลของ ${X.f(b, 'COL')} (alpha = ${X.f(b, 'A')}: ค่าล่าสุดมีน้ำหนัก ${Math.round(Number(X.f(b, 'A')) * 100)}%)`, `the exponentially smoothed ${X.f(b, 'COL')} (alpha = ${X.f(b, 'A')})`),
  });

  /* ---------- classical decomposition ---------- */
  const DECOMP_PY = TR`def decompose(series, period=12, model="additive"):
    """แยกอนุกรมเวลาเป็นแนวโน้ม (trend) ฤดูกาล (seasonal) และส่วนที่เหลือ (resid) แบบคลาสสิก
    (ได้ผลเท่ากับ seasonal_decompose ของ statsmodels)"""
    if period % 2 == 0:
        # period เป็นเลขคู่: ค่าเฉลี่ยเคลื่อนที่กึ่งกลางแบบ 2×period
        trend = series.rolling(period, center=True).mean().rolling(2).mean().shift(-1)
    else:
        trend = series.rolling(period, center=True).mean()
    detrended = series - trend if model == "additive" else series / trend
    position = np.arange(len(series)) % period
    season = detrended.groupby(position).mean()
    season = season - season.mean() if model == "additive" else season / season.mean()
    seasonal = pd.Series(season.to_numpy()[position], index=series.index)
    resid = detrended - seasonal if model == "additive" else detrended / seasonal
    return pd.DataFrame({"observed": series, "trend": trend, "seasonal": seasonal, "resid": resid})`;
  const DMODEL = [['"additive"', 'additive'], ['"multiplicative"', 'multiplicative']];
  def('pb_decompose', {
    cat: 'data', out: true, th: TR('แยกแนวโน้มและฤดูกาล'), py: 'decompose({DF}[{COL}], period={P}, model={M})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, P: { t: 'num', def: 12, min: 1, max: 400, prec: 1 }, M: { t: 'dd', opts: DMODEL } },
    tip: TR('ได้ตาราง 4 คอลัมน์: observed (ข้อมูลจริง) · trend (แนวโน้ม = ค่าเฉลี่ยเคลื่อนที่กึ่งกลาง) · seasonal (ฤดูกาลที่ซ้ำทุก period ช่วง) · resid (ส่วนที่เหลือ) · additive: ข้อมูล = แนวโน้ม + ฤดูกาล + ส่วนที่เหลือ · multiplicative: ข้อมูล = แนวโน้ม × ฤดูกาล × ส่วนที่เหลือ (เช่น 1.2 = สูงกว่าแนวโน้ม 20%) ใช้เมื่อฤดูกาลแกว่งกว้างขึ้นตามแนวโน้ม'),
    gen: (b, G) => { Py.need(PD); Py.need(NP); Py.helper('decompose', DECOMP_PY); return [`decompose(${G.v(b, 'DF')}[${G.col(b, 'COL')}], period=${G.f(b, 'P')}, model=${Py.str(G.f(b, 'M'))})`, python.Order.FUNCTION_CALL]; },
    *run(b, I) { return PB.decompose(I.df(b).col(I.colName(b)), Number(b.getFieldValue('P')), b.getFieldValue('M')); },
    ex: (b, X) => T(X, `ตารางที่แยก ${X.f(b, 'COL')} เป็นแนวโน้ม ฤดูกาลที่ซ้ำทุก ${X.f(b, 'P')} ช่วง และส่วนที่เหลือ แบบ${X.f(b, 'M') === 'additive' ? 'บวก (additive)' : 'คูณ (multiplicative)'}`, `${X.f(b, 'COL')} split into trend, a seasonal pattern repeating every ${X.f(b, 'P')} periods and the residual (${X.f(b, 'M')})`),
  });

  /* ---------- charts ---------- */
  const PLOT_DEC_PY = TR`def plot_decompose(parts, dates):
    """วาดส่วนประกอบทั้ง 4 (observed, trend, seasonal, resid) เป็นกราฟ 4 แถวบนแกนเวลาเดียวกัน"""
    fig, axes = plt.subplots(4, 1, figsize=(8, 8), sharex=True)
    for ax, col in zip(axes, ["observed", "trend", "seasonal", "resid"]):
        ax.plot(dates, parts[col])
        ax.set_ylabel(col)
    plt.tight_layout()
    plt.show()`;
  const PARTS = [['observed', TR('ข้อมูลจริง')], ['trend', TR('แนวโน้ม')], ['seasonal', TR('ฤดูกาล')], ['resid', TR('ส่วนที่เหลือ')]];
  const yNum = (v) => (typeof v === 'boolean' ? +v : PB.isMissing(v) ? NaN : v);
  def('pb_plot_decompose', {
    cat: 'viz', th: TR('กราฟแยกแนวโน้มและฤดูกาล'), py: 'plot_decompose({P}, {DF}[{DATE}])', f: { P: { t: 'var', def: 'parts' }, DF: { t: 'var', def: 'df' }, DATE: { t: 'col', of: 'DF', placeholder: 'index' } },
    init() { this.getField('DATE').placeholder_ = 'index'; },
    tip: TR('กราฟ 4 แถว: ข้อมูลจริง · แนวโน้ม · ฤดูกาล · ส่วนที่เหลือ ใช้กับตารางจากบล็อก decompose(…) และคอลัมน์วันที่เป็นแกนเวลา (ปล่อยว่าง = ใช้ลำดับแถว)'),
    gen: (b, G) => { Py.need(PLT); Py.helper('plot_decompose', PLOT_DEC_PY); const dc = b.getFieldValue('DATE'), p = G.v(b, 'P'); return `plot_decompose(${p}, ${dc ? `${G.v(b, 'DF')}[${Py.str(dc)}]` : `${p}.index`})\n`; },
    *run(b, I) {
      const name = I.vname(b, 'P'), parts = I.vv(b, 'P');
      if (!(parts instanceof PB.DataFrame)) throw PB.err('TypeError', `'${PB.typeName(parts)}' object is not subscriptable`, TR`${name} ไม่ใช่ตาราง (DataFrame) แต่เป็น ${PB.typeName(parts)}`, TR('ใช้ตารางที่ได้จากบล็อก แยกแนวโน้มและฤดูกาล decompose(…)'));
      for (const [c] of PARTS) if (!parts.has(c)) throw PB.err('KeyError', `'${c}'`, TR`ตาราง ${name} ไม่มีคอลัมน์ ${c}`, TR('ใช้ตารางที่ได้จากบล็อก แยกแนวโน้มและฤดูกาล decompose(…)'));
      const dc = b.getFieldValue('DATE');
      let xs = parts.index, isDate = false;
      if (dc) {
        const d = I.df(b, 'DF'), s = d.col(dc);
        if (s.length !== parts.nrows) throw PB.err('ValueError', `x and y must have same first dimension, but have shapes (${s.length},) and (${parts.nrows},)`, TR`คอลัมน์วันที่มี ${s.length} แถว แต่ตาราง ${name} มี ${parts.nrows} แถว`, TR('ใช้คอลัมน์วันที่ของตารางที่นำไปแยกส่วนประกอบ'));
        xs = s.values; isDate = s.dtype === 'datetime64[ns]';
      }
      PARTS.forEach(([c, th], panel) => I.out.chart({ kind: 'line', compact: true, panel, title: th === c ? c : `${c} · ${th}`, x: { label: dc || '', date: isDate, categorical: !isDate && xs.some((x) => typeof x !== 'number') }, y: { label: '' }, series: [{ name: c, points: xs.map((x, i) => [x, yNum(parts._data.get(c)[i])]) }] }, b));
    },
    ex: (b, X) => T(X, `วาดกราฟ 4 แถวของ ${X.v(b, 'P')}: ข้อมูลจริง แนวโน้ม ฤดูกาล และส่วนที่เหลือ${X.f(b, 'DATE') ? ` ตาม ${X.f(b, 'DATE')}` : ''}`, `plot the observed, trend, seasonal and residual parts of ${X.v(b, 'P')}${X.f(b, 'DATE') ? ` over ${X.f(b, 'DATE')}` : ''}`),
  });
  def('pb_plot_lines', {
    cat: 'viz', th: TR('กราฟเส้นหลายคอลัมน์'), thBreak: true, py: '{DF}.plot(x={X}, y=[{COLS}])\nplt.title({TITLE})', f: { DF: { t: 'var', def: 'df' }, X: { t: 'col', placeholder: 'index' }, COLS: { t: 'cols' }, TITLE: { t: 'text', def: '' } },
    init() { this.getField('X').placeholder_ = 'index'; },
    tip: TR('วาดหลายคอลัมน์บนแกนเดียวกัน เช่น ข้อมูลจริง ค่าเฉลี่ยเคลื่อนที่ และเส้นแนวโน้ม · x = คอลัมน์วันที่ (ปล่อยว่าง = ใช้ลำดับแถว)'),
    gen: (b, G) => {
      Py.need(PLT);
      const x = b.getFieldValue('X'), t = b.getFieldValue('TITLE');
      return `${G.v(b, 'DF')}.plot(${x ? `x=${Py.str(x)}, ` : ''}y=${Py.list(G.cols(b, 'COLS'))}, figsize=(8, 4)${t ? `, title=${Py.str(t)}` : ''})\nplt.show()\n`;
    },
    *run(b, I) {
      const d = I.df(b), cols = I.colList(b), xc = b.getFieldValue('X') || null;
      if (xc) d._need(xc);
      const xs = xc ? d._data.get(xc) : d.index, isDate = !!xc && d.dtypeOf(xc) === 'datetime64[ns]';
      const series = cols.map((c) => {
        d._need(c);
        if (!PB.isNumericDtype(d.dtypeOf(c))) throw PB.err('TypeError', 'no numeric data to plot', TR`คอลัมน์ ${c} ไม่ใช่ตัวเลข จึงวาดเป็นเส้นไม่ได้`, TR('เลือกคอลัมน์ตัวเลข'));
        const y = d._data.get(c);
        return { name: c, points: xs.map((x, i) => [x, yNum(y[i])]).filter((p) => !PB.isMissing(p[0])) };
      });
      I.out.chart({ kind: 'line', title: b.getFieldValue('TITLE'), x: { label: xc || '', date: isDate, categorical: !isDate && xs.some((x) => typeof x !== 'number') }, y: { label: cols.length === 1 ? cols[0] : '' }, series }, b);
    },
    ex: (b, X) => T(X, `วาดกราฟเส้นของ ${X.f(b, 'COLS')} จาก ${X.v(b, 'DF')} บนแกนเดียวกัน${X.f(b, 'X') ? ` ตาม ${X.f(b, 'X')}` : ''}`, `plot ${X.f(b, 'COLS')} of ${X.v(b, 'DF')} as lines on one chart${X.f(b, 'X') ? ` over ${X.f(b, 'X')}` : ''}`),
  });

  /* ---------- the next periods for a trend model ---------- */
  const FUTURE_PY = TR`def make_future(df, date_col, steps=12, freq="MS", season="month"):
    """ตารางของ steps ช่วงเวลาถัดไป: วันที่ ลำดับเวลา t (นับต่อจากข้อมูลเดิม) และเดือน / ไตรมาส / วันในสัปดาห์"""
    last = df[date_col].iloc[-1]
    dates = pd.date_range(last, periods=steps + 1, freq=freq)
    dates = dates[dates > last][:steps]
    future = pd.DataFrame({date_col: dates, "t": np.arange(len(df), len(df) + steps)})
    if season:
        future[season] = getattr(future[date_col].dt, season)
    return future`;
  const FREQ = [[TR('"MS" รายเดือน'), 'MS'], [TR('"D" รายวัน'), 'D'], [TR('"W" รายสัปดาห์'), 'W'], [TR('"QS" รายไตรมาส'), 'QS'], [TR('"YS" รายปี'), 'YS']];
  const SEASON = [['"month"', 'month'], ['"quarter"', 'quarter'], ['"dayofweek"', 'dayofweek'], ['None', 'None']];
  const SEASON_TH = { month: 'เดือน', quarter: 'ไตรมาส', dayofweek: 'วันในสัปดาห์' }; /* th-en */
  def('pb_future', {
    cat: 'data', out: true, th: TR('ตารางช่วงเวลาถัดไป'), thBreak: true, py: 'make_future({DF}, {DATE}, steps={S}, freq={FREQ}, season={SEASON})',
    f: { DF: { t: 'var', def: 'df' }, DATE: { t: 'col' }, S: { t: 'num', def: 12, min: 1, max: 400, prec: 1 }, FREQ: { t: 'dd', opts: FREQ }, SEASON: { t: 'dd', opts: SEASON } },
    tip: TR('สร้างตารางของ steps ช่วงเวลาถัดจากแถวสุดท้าย มีคอลัมน์วันที่ ลำดับเวลา t (นับต่อจาก len(df)) และเดือน/ไตรมาส/วันในสัปดาห์ ใช้เป็น X ของช่วงอนาคตให้โมเดลแนวโน้มทาย (คอลัมน์ต้องชื่อเดียวกับตอนฝึก)'),
    gen: (b, G) => { Py.need(PD); Py.need(NP); Py.helper('make_future', FUTURE_PY); const s = b.getFieldValue('SEASON'); return [`make_future(${G.v(b, 'DF')}, ${G.col(b, 'DATE')}, steps=${G.f(b, 'S')}, freq=${Py.str(G.f(b, 'FREQ'))}, season=${s === 'None' ? 'None' : Py.str(s)})`, python.Order.FUNCTION_CALL]; },
    *run(b, I) { const s = b.getFieldValue('SEASON'); return PB.futureFrame(I.df(b), I.colName(b, 'DATE'), Number(b.getFieldValue('S')), b.getFieldValue('FREQ'), s === 'None' ? null : s); },
    ex: (b, X) => { const s = X.f(b, 'SEASON'); return T(X, `ตารางของ ${X.f(b, 'S')} ช่วงเวลาถัดจากแถวสุดท้ายของ ${X.v(b, 'DF')} (วันที่ ลำดับเวลา t${s !== 'None' ? ' และ' + SEASON_TH[s] : ''})`, `a table of the next ${X.f(b, 'S')} periods after ${X.v(b, 'DF')} (date, time index t${s !== 'None' ? ' and ' + s : ''})`); },
  });
  def('pb_align_cols', {
    cat: 'prep', out: true, th: TR('จัดคอลัมน์ให้ตรงกับตอนฝึก'), py: '{DF}.reindex(columns={REF}.columns, fill_value=0)', f: { DF: { t: 'var', def: 'X_future' }, REF: { t: 'var', def: 'X' } },
    tip: TR('ให้ตารางข้อมูลใหม่มีคอลัมน์ชุดเดียวกับ X ที่ใช้ฝึก เรียงลำดับเดียวกัน: คอลัมน์ที่ขาด (เช่น 0/1 ของเดือนที่ไม่มีในข้อมูลใหม่) เติม 0 และคอลัมน์ที่เกินถูกตัดออก'),
    gen: (b, G) => [`${G.v(b, 'DF')}.reindex(columns=${G.v(b, 'REF')}.columns, fill_value=0)`, python.Order.FUNCTION_CALL],
    *run(b, I) { return PB.reindexColumns(I.df(b, 'DF'), I.df(b, 'REF').columns, 0); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่จัดคอลัมน์ให้ตรงกับ ${X.v(b, 'REF')} (คอลัมน์ที่ขาดเติม 0)`, `${X.v(b, 'DF')} with exactly the columns of ${X.v(b, 'REF')} (missing ones filled with 0)`),
  });

  /* ---------- the seasonal naive baseline ---------- */
  const NAIVE_PY = TR`def seasonal_naive(history, steps, season=12):
    """ค่าพยากรณ์แบบง่าย (baseline): ใช้ค่าของฤดูกาลล่าสุดซ้ำไปเรื่อย ๆ (season=1 คือใช้ค่าล่าสุดค่าเดียว)"""
    last = np.asarray(history)[-season:]
    return np.array([last[i % season] for i in range(steps)])`;
  def('pb_naive', {
    cat: 'train', out: true, th: TR('ค่าพยากรณ์แบบง่าย (baseline)'), py: 'seasonal_naive({Y}, steps={@N}, season={S})', f: { Y: { t: 'var', def: 'y_train' }, N: {}, S: { t: 'num', def: 12, min: 1, max: 400, prec: 1 } },
    tip: TR('เกณฑ์ขั้นต่ำที่โมเดลต้องชนะ: ทายว่าอนาคตจะซ้ำฤดูกาลล่าสุด (season=12: เดือนเดียวกันของปีล่าสุด, season=1: ค่าล่าสุดค่าเดียว) · steps มักใช้ len(y_test)'),
    gen: (b, G) => { Py.need(NP); Py.helper('seasonal_naive', NAIVE_PY); return [`seasonal_naive(${G.v(b, 'Y')}, steps=${G.in(b, 'N', python.Order.NONE, '12')}, season=${G.f(b, 'S')})`, python.Order.FUNCTION_CALL]; },
    *run(b, I) {
      const raw = yield* I.needRaw(b, 'N');
      if (raw instanceof PB.PyFloat || (typeof raw === 'number' && !Number.isInteger(raw))) throw PB.err('TypeError', "'float' object cannot be interpreted as an integer", TR('steps ต้องเป็นจำนวนเต็ม เช่น len(y_test) หรือ 12'));
      return PB.seasonalNaive(I.vv(b, 'Y'), PB.unbox(raw), Number(b.getFieldValue('S')));
    },
    ex: (b, X) => T(X, `ค่าพยากรณ์แบบง่าย ${X.in(b, 'N')} ช่วง ที่ใช้ค่าของ ${X.f(b, 'S')} ช่วงสุดท้ายของ ${X.v(b, 'Y')} ซ้ำ`, `a naive forecast of ${X.in(b, 'N')} periods repeating the last ${X.f(b, 'S')} values of ${X.v(b, 'Y')}`),
  });

  /* ---------- cross-validation in time order ---------- */
  const TS_SCORING = [['None', 'None'], ['"neg_mean_absolute_error"', 'neg_mean_absolute_error'], ['"neg_root_mean_squared_error"', 'neg_root_mean_squared_error'], ['"neg_mean_absolute_percentage_error"', 'neg_mean_absolute_percentage_error'], ['"r2"', 'r2']];
  def('pb_cv_ts', {
    cat: 'train', out: true, th: TR('ตรวจไขว้ตามเวลา'), thBreak: true, py: 'cross_val_score( {@M} , {X}, {Y},\ncv=TimeSeriesSplit(n_splits={K}), scoring={SC} )',
    f: { M: {}, X: { t: 'var', def: 'X' }, Y: { t: 'var', def: 'y' }, K: { t: 'num', def: 5, min: 2, max: 20, prec: 1 }, SC: { t: 'dd', opts: TS_SCORING } },
    tip: TR('TimeSeriesSplit แบ่งข้อมูลตามลำดับเวลา: แต่ละรอบฝึกด้วยข้อมูลช่วงแรก แล้วทดสอบกับช่วงที่ตามมา (ชุดฝึกยาวขึ้นทุกรอบ) จึงไม่ใช้อนาคตไปทายอดีต · คะแนน neg_… คือความคลาดเคลื่อนติดลบ (ยิ่งใกล้ 0 ยิ่งดี)'),
    gen: (b, G) => { Py.need('sklearn.model_selection', 'cross_val_score'); Py.need('sklearn.model_selection', 'TimeSeriesSplit'); const sc = G.f(b, 'SC'); return `cross_val_score(${G.in(b, 'M')}, ${G.v(b, 'X')}, ${G.v(b, 'Y')}, cv=TimeSeriesSplit(n_splits=${G.f(b, 'K')})${sc && sc !== 'None' ? `, scoring=${Py.str(sc)}` : ''})`; },
    *run(b, I) {
      const m = yield* I.need(b, 'M'), sc = b.getFieldValue('SC');
      if (!(m instanceof PB.Estimator)) throw PB.err('AttributeError', `'${PB.typeName(m)}' object has no attribute 'fit'`, TR('ช่องโมเดลต้องเป็นโมเดล'));
      return yield* PB.crossValScore(m, I.vv(b, 'X'), I.vv(b, 'Y'), new PB.TimeSeriesSplit({ n_splits: Number(b.getFieldValue('K')) }), sc && sc !== 'None' ? sc : null);
    },
    ex: (b, X) => T(X, `คะแนน cross-validation ตามลำดับเวลา ${X.f(b, 'K')} รอบของ${X.in(b, 'M')} (ฝึกด้วยอดีต ทดสอบกับช่วงถัดไป)`, `${X.f(b, 'K')}-split time-series cross-validation scores of ${X.in(b, 'M')}`),
  });

  /* the helper functions written into the Python code (test/trend_test.py runs them against the engine) */
  BK.TS_PY = { decompose: DECOMP_PY, plot_decompose: PLOT_DEC_PY, make_future: FUTURE_PY, seasonal_naive: NAIVE_PY };
})();
