/* ThaiPyBlocks: data cleansing and normalization blocks (pandas + scikit-learn).
   Inspect quality → missing values → duplicates and text → types → outliers → scaling. */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py, T = BK.T;
  const PD = 'import pandas as pd', NP = 'import numpy as np';
  const isMiss = PB.isMissing;

  /* some faces show the table name twice (df[df.duplicated()]): DF2 is a label kept equal to DF */
  function syncDF2() {
    const f = this.getField('DF2'), v = this.getField('DF');
    if (!f || !v || !v.getVariable) return;
    const vv = v.getVariable(), name = vv ? (vv.getName ? vv.getName() : vv.name) : 'df';
    if (f.getValue() !== name) f.setValue(name);
  }
  const mirror = { init: syncDF2, onchange: syncDF2 };
  const colOf = (G, b) => `${G.v(b, 'DF')}[${G.col(b, 'COL')}]`;
  const pyList = (items) => '[' + items.map((t) => (typeof t === 'number' ? Py.num(t) : Py.str(t))).join(', ') + ']';
  BK.pyTokens = pyList;

  /* ======================= Python helpers ======================= */
  const QUALITY_PY = TR`def data_quality(df):
    """สรุปคุณภาพข้อมูลรายคอลัมน์: ชนิดข้อมูล จำนวนและร้อยละของค่าว่าง และจำนวนค่าที่ไม่ซ้ำกัน"""
    return pd.DataFrame({
        "dtype": df.dtypes.astype(str),
        "missing": df.isnull().sum(),
        "missing_%": (df.isnull().mean() * 100).round(1),
        "unique": df.nunique(),
    })`;
  const OUT_PY = {
    outlier_bounds: TR`def outlier_bounds(s, method="iqr", k=1.5):
    """ขอบล่างและขอบบนของค่าปกติ
    iqr: Q1 - k*IQR ถึง Q3 + k*IQR (IQR = Q3 - Q1) · zscore: ค่าเฉลี่ย - k*SD ถึง ค่าเฉลี่ย + k*SD"""
    if method == "zscore":
        low, high = s.mean() - k * s.std(), s.mean() + k * s.std()
    else:
        q1, q3 = s.quantile(0.25), s.quantile(0.75)
        low, high = q1 - k * (q3 - q1), q3 + k * (q3 - q1)
    return float(low), float(high)`,
    find_outliers: TR`def find_outliers(df, col, method="iqr", k=1.5):
    """แถวที่ค่าในคอลัมน์ col อยู่นอกขอบเขตค่าปกติ"""
    low, high = outlier_bounds(df[col], method, k)
    return df[(df[col] < low) | (df[col] > high)]`,
    outliers_to_nan: TR`def outliers_to_nan(s, method="iqr", k=1.5):
    """เปลี่ยนค่าผิดปกติให้เป็นค่าว่าง (NaN) เพื่อเติมค่าใหม่ภายหลัง"""
    low, high = outlier_bounds(s, method, k)
    return s.mask((s < low) | (s > high))`,
    clip_outliers: TR`def clip_outliers(s, method="iqr", k=1.5):
    """ตัดค่าที่เกินขอบเขตให้เท่ากับขอบล่างหรือขอบบน (winsorize)"""
    low, high = outlier_bounds(s, method, k)
    return s.clip(low, high)`,
    remove_outliers: TR`def remove_outliers(df, col, method="iqr", k=1.5):
    """ลบแถวที่ค่าในคอลัมน์ col อยู่นอกขอบเขตค่าปกติ (แถวที่ค่าว่างยังอยู่)"""
    low, high = outlier_bounds(df[col], method, k)
    return df[~((df[col] < low) | (df[col] > high))]`,
  };
  const outHelper = (name) => { Py.helper('outlier_bounds', OUT_PY.outlier_bounds); if (name !== 'outlier_bounds') Py.helper(name, OUT_PY[name]); return name; };
  BK.outHelper = outHelper;

  /* ======================= inspect ======================= */
  def('pb_quality', {
    cat: 'clean', out: true, th: TR('ตรวจคุณภาพข้อมูล'), py: 'data_quality({DF})', f: { DF: { t: 'var', def: 'df' } },
    tip: TR('ตารางสรุปทุกคอลัมน์: ชนิดข้อมูล (dtype) จำนวนค่าว่าง ร้อยละค่าว่าง และจำนวนค่าที่ไม่ซ้ำ ใช้ดูก่อนและหลังทำความสะอาด'),
    gen: (b, G) => { Py.need(PD); Py.helper('data_quality', QUALITY_PY); return [`data_quality(${G.v(b, 'DF')})`, python.Order.FUNCTION_CALL]; },
    *run(b, I) { return PB.dataQuality(I.df(b)); },
    ex: (b, X) => T(X, `ตารางคุณภาพข้อมูลของ ${X.v(b, 'DF')} (ชนิดข้อมูล จำนวนและร้อยละของค่าว่าง จำนวนค่าไม่ซ้ำ ของแต่ละคอลัมน์)`, `the data-quality table of ${X.v(b, 'DF')} (dtype, missing count and %, distinct values per column)`),
  });
  const FIND = [['.duplicated(keep=False)', 'dups'], ['.isnull().any(axis=1)', 'nulls']];
  def('pb_find_rows', Object.assign({
    cat: 'clean', out: true, th: TR('ดูแถวที่มีปัญหา'), py: '{DF}[{DF2}{WHAT}]', f: { DF: { t: 'var', def: 'df' }, DF2: { t: 'label', def: 'df' }, WHAT: { t: 'dd', opts: FIND } },
    tip: TR('duplicated(keep=False) = แถวที่ซ้ำกันทุกชุด (รวมแถวแรก) · isnull().any(axis=1) = แถวที่มีค่าว่างอย่างน้อยหนึ่งช่อง'),
    gen: (b, G) => { const d = G.v(b, 'DF'); return [`${d}[${d}${G.f(b, 'WHAT') === 'dups' ? '.duplicated(keep=False)' : '.isnull().any(axis=1)'}]`, python.Order.MEMBER]; },
    *run(b, I) { const df = I.df(b); return df.mask(b.getFieldValue('WHAT') === 'dups' ? df.duplicated(null, false) : df.rowHasNull()); },
    ex: (b, X) => T(X, X.f(b, 'WHAT') === 'dups' ? `แถวของ ${X.v(b, 'DF')} ที่ซ้ำกับแถวอื่น (แสดงทุกชุดที่ซ้ำ)` : `แถวของ ${X.v(b, 'DF')} ที่มีค่าว่างอย่างน้อยหนึ่งคอลัมน์`, X.f(b, 'WHAT') === 'dups' ? `the duplicated rows of ${X.v(b, 'DF')}` : `the rows of ${X.v(b, 'DF')} with a missing value`),
  }, mirror));

  /* ======================= missing values ======================= */
  def('pb_na_values', {
    cat: 'clean', out: true, th: TR('แทนค่าว่าง'), py: '{DF}.replace([{VALS}], np.nan)', f: { DF: { t: 'var', def: 'df' }, VALS: { t: 'text', def: '"-", "?", "ไม่ระบุ"' } }, /* th-data */
    tip: TR('ข้อความที่คนพิมพ์แทนค่าว่าง เช่น "-" "?" "ไม่ระบุ" (หรือรหัสตัวเลขอย่าง 999) จะถูกเปลี่ยนเป็นค่าว่างจริง (NaN) เพื่อให้ isnull() / fillna() มองเห็น · ข้อความใส่ในเครื่องหมายคำพูด ตัวเลขไม่ต้องใส่'),
    gen: (b, G) => { Py.need(NP); return [`${G.v(b, 'DF')}.replace(${pyList(PB.parseTokens(G.f(b, 'VALS')))}, np.nan)`, python.Order.FUNCTION_CALL]; },
    *run(b, I) { const df = I.df(b), toks = PB.parseTokens(b.getFieldValue('VALS')); if (!toks.length) throw PB.err('SyntaxError', 'empty list', TR('ยังไม่ได้ใส่ค่าที่จะเปลี่ยนเป็นค่าว่าง'), TR('พิมพ์ในช่อง เช่น "-", "?", "ไม่ระบุ"')); return PB.replaceWithNaN(df, toks); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่เปลี่ยน ${pyList(PB.parseTokens(X.f(b, 'VALS')))} เป็นค่าว่าง (NaN)`, `${X.v(b, 'DF')} with ${pyList(PB.parseTokens(X.f(b, 'VALS')))} replaced by NaN`),
  });
  def('pb_fill_value', {
    cat: 'clean', th: TR('เติมค่าว่างด้วยค่า'), py: '{DF}[{COL}].fillna( {@VAL} )', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, VAL: {} },
    tip: TR('เติมค่าว่างในคอลัมน์ด้วยค่าที่กำหนดเอง เช่น 0 หรือ "ไม่ทราบ" แล้วเก็บกลับลงคอลัมน์เดิม'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${c}.fillna(${G.in(b, 'VAL', python.Order.NONE, '0')})\n`; },
    *run(b, I) {
      const df = I.df(b), c = I.colName(b), v = yield* I.need(b, 'VAL');
      if (v === null || Array.isArray(v) || (v && typeof v === 'object')) throw PB.err('TypeError', `"value" parameter must be a scalar or dict, but you passed a "${PB.typeName(v)}"`, TR('ค่าที่ใช้เติมต้องเป็นตัวเลขหรือข้อความหนึ่งค่า'));
      df.set(c, df.col(c).fillna(v));
    },
    ex: (b, X) => T(X, `เติมค่าว่างในคอลัมน์ ${X.f(b, 'COL')} ของ ${X.v(b, 'DF')} ด้วย${X.in(b, 'VAL')}`, `fill missing values in ${X.f(b, 'COL')} with ${X.in(b, 'VAL')}`),
  });
  const FILLM = [[TR('ffill() ค่าก่อนหน้า'), 'ffill'], [TR('bfill() ค่าถัดไป'), 'bfill'], [TR('interpolate() ประมาณค่าเส้นตรง'), 'interpolate']];
  const FILLM_TH = { ffill: 'ค่าของแถวก่อนหน้า (forward fill)', bfill: 'ค่าของแถวถัดไป (backward fill)', interpolate: 'ค่าที่ประมาณเป็นเส้นตรงระหว่างแถวก่อนหน้ากับแถวถัดไป' }; /* th-en */
  def('pb_fill_method', {
    cat: 'clean', th: TR('เติมค่าว่างตามลำดับแถว'), py: '{DF}[{COL}].{FN}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: FILLM } },
    tip: TR('เหมาะกับข้อมูลที่เรียงตามเวลา: ffill ใช้ค่าก่อนหน้า, bfill ใช้ค่าถัดไป, interpolate ลากเส้นตรงระหว่างค่าข้างเคียง (ค่าว่างก่อนค่าแรกยังว่างอยู่)'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${c}.${G.f(b, 'FN')}()\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b), s = df.col(c), fn = b.getFieldValue('FN'); df.set(c, s[fn]()); },
    ex: (b, X) => T(X, `เติมค่าว่างในคอลัมน์ ${X.f(b, 'COL')} ด้วย${FILLM_TH[X.f(b, 'FN')]}`, `fill missing values in ${X.f(b, 'COL')} with ${X.f(b, 'FN')}()`),
  });
  def('pb_fill_group', {
    cat: 'clean', th: TR('เติมค่าว่างด้วยค่ากลางของกลุ่ม'), thBreak: true, py: '{DF}[{COL}].fillna( groupby({BY}).transform({AGG}) )',
    f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, BY: { t: 'col' }, AGG: { t: 'dd', opts: [['"median"', 'median'], ['"mean"', 'mean']] } },
    tip: TR('เติมค่าว่างด้วยมัธยฐาน/ค่าเฉลี่ยของกลุ่มเดียวกัน เช่น เติมอายุด้วยอายุกลางของผู้โดยสารชั้นเดียวกัน แม่นกว่าใช้ค่าเดียวทั้งตาราง'),
    gen: (b, G) => { const d = G.v(b, 'DF'), c = colOf(G, b); return `${c} = ${c}.fillna(${d}.groupby(${G.col(b, 'BY')})[${G.col(b, 'COL')}].transform(${Py.str(G.f(b, 'AGG'))}))\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b), by = I.colName(b, 'BY'); df.set(c, df.col(c).fillnaFrom(PB.groupTransform(df, by, c, b.getFieldValue('AGG')))); },
    ex: (b, X) => T(X, `เติมค่าว่างในคอลัมน์ ${X.f(b, 'COL')} ด้วย${X.f(b, 'AGG') === 'median' ? 'มัธยฐาน' : 'ค่าเฉลี่ย'}ของแต่ละกลุ่ม ${X.f(b, 'BY')}`, `fill missing ${X.f(b, 'COL')} with the ${X.f(b, 'AGG')} of each ${X.f(b, 'BY')} group`),
  });
  def('pb_drop_sparse', Object.assign({
    cat: 'clean', out: true, th: TR('ลบคอลัมน์ที่ว่างมาก'), py: '{DF}.loc[:, {DF2}.isnull().mean() <= {P}]', f: { DF: { t: 'var', def: 'df' }, DF2: { t: 'label', def: 'df' }, P: { t: 'num', def: 0.5, min: 0, max: 1 } },
    tip: TR('เก็บเฉพาะคอลัมน์ที่มีสัดส่วนค่าว่างไม่เกินค่าที่กำหนด (0.5 = ว่างไม่เกินครึ่ง) คอลัมน์ที่ว่างเกือบทั้งหมดเติมค่าไปก็ไม่ได้ข้อมูลจริง'),
    gen: (b, G) => { const d = G.v(b, 'DF'); return [`${d}.loc[:, ${d}.isnull().mean() <= ${Py.num(G.f(b, 'P'))}]`, python.Order.MEMBER]; },
    *run(b, I) { return PB.keepFilledColumns(I.df(b), Number(b.getFieldValue('P'))); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่ตัดคอลัมน์ซึ่งมีค่าว่างเกิน ${Math.round(Number(X.f(b, 'P')) * 100)}% ออก`, `${X.v(b, 'DF')} without the columns that are more than ${Math.round(Number(X.f(b, 'P')) * 100)}% missing`),
  }, mirror));

  /* ======================= duplicates and text ======================= */
  def('pb_drop_dups', {
    cat: 'clean', out: true, th: TR('ลบแถวซ้ำ'), py: '{DF}.drop_duplicates(subset=[{COLS}], keep={KEEP})', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols', placeholder: TR('ทุกคอลัมน์') }, KEEP: { t: 'dd', opts: [['"first"', 'first'], ['"last"', 'last']] } },
    init() { const f = this.getField('COLS'); if (f) f.placeholder_ = TR('ทุกคอลัมน์'); },
    tip: TR('ลบแถวที่ซ้ำ: ปล่อยคอลัมน์ว่าง = ซ้ำทุกช่อง, เลือกคอลัมน์ = ถือว่าซ้ำเมื่อคอลัมน์ที่เลือกตรงกัน (เช่น รหัสลูกค้า) · keep="first" เก็บแถวแรก, "last" เก็บแถวสุดท้าย'),
    gen: (b, G) => { const cols = G.cols(b, 'COLS'); return [`${G.v(b, 'DF')}.drop_duplicates(${cols.length ? `subset=${Py.list(cols)}, ` : ''}keep=${Py.str(G.f(b, 'KEEP'))})`, python.Order.FUNCTION_CALL]; },
    *run(b, I) { const cols = BK.splitCols(b.getFieldValue('COLS')); return I.df(b).drop_duplicates(cols.length ? cols : null, b.getFieldValue('KEEP')); },
    ex: (b, X) => { const cols = BK.splitCols(X.f(b, 'COLS')); return T(X, `${X.v(b, 'DF')} ที่ลบแถวซ้ำออก${cols.length ? ` (ดูซ้ำจากคอลัมน์ ${cols.join(', ')})` : ''} โดยเก็บ${X.f(b, 'KEEP') === 'first' ? 'แถวแรก' : 'แถวสุดท้าย'}ไว้`, `${X.v(b, 'DF')} without duplicated rows${cols.length ? ` (by ${cols.join(', ')})` : ''}, keeping the ${X.f(b, 'KEEP')}`); },
  });
  const STR = [[TR('strip() ตัดช่องว่างหัวท้าย'), 'strip'], [TR('lower() ตัวพิมพ์เล็ก'), 'lower'], [TR('upper() ตัวพิมพ์ใหญ่'), 'upper'], [TR('title() ขึ้นต้นตัวใหญ่'), 'title']];
  const STR_TH = { strip: 'ตัดช่องว่างที่หัวและท้ายข้อความ', lower: 'เปลี่ยนเป็นตัวพิมพ์เล็กทั้งหมด', upper: 'เปลี่ยนเป็นตัวพิมพ์ใหญ่ทั้งหมด', title: 'เปลี่ยนให้ขึ้นต้นคำด้วยตัวพิมพ์ใหญ่' }; /* th-en */
  def('pb_clean_text', {
    cat: 'clean', th: TR('ทำความสะอาดข้อความ'), py: '{DF}[{COL}].str.{FN}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: STR } },
    tip: TR('ค่าเดียวกันที่พิมพ์ต่างกัน (" กรุงเทพ", "Gold"/"gold") ทำให้นับเป็นคนละกลุ่ม: strip ตัดช่องว่าง, lower/upper/title ทำตัวพิมพ์ให้ตรงกัน'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${c}.str.${G.f(b, 'FN')}()\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b); df.set(c, df.col(c).str_op(b.getFieldValue('FN'))); },
    ex: (b, X) => T(X, `${STR_TH[X.f(b, 'FN')]}ในคอลัมน์ ${X.f(b, 'COL')}`, `${X.f(b, 'FN')} the text in ${X.f(b, 'COL')}`),
  });
  def('pb_replace_val', {
    cat: 'clean', th: TR('แทนค่า'), py: '{DF}[{COL}].replace( {@OLD} , {@NEW} )', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, OLD: {}, NEW: {} },
    tip: TR('เปลี่ยนค่าที่ตรงกันทั้งค่า เช่น "กทม" เป็น "กรุงเทพ" หรือ 999 เป็น 0 (ใช้ซ้อนหลายบล็อกได้)'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${c}.replace(${G.in(b, 'OLD', python.Order.NONE, '""')}, ${G.in(b, 'NEW', python.Order.NONE, '""')})\n`; },
    *run(b, I) {
      const df = I.df(b), c = I.colName(b), old = yield* I.needRaw(b, 'OLD'), nw = yield* I.needRaw(b, 'NEW');
      for (const v of [old, nw]) if (v === null || Array.isArray(v) || (v && typeof v === 'object' && !(v instanceof PB.PyFloat))) throw PB.err('TypeError', "'regex' must be a string or a compiled regular expression or a list or dict of strings or regular expressions", TR('ค่าเดิมและค่าใหม่ต้องเป็นตัวเลขหรือข้อความหนึ่งค่า'));
      df.set(c, df.col(c).replaceValue(old, nw));
    },
    ex: (b, X) => T(X, `แทนค่า${X.in(b, 'OLD')} ด้วย${X.in(b, 'NEW')} ในคอลัมน์ ${X.f(b, 'COL')}`, `replace ${X.in(b, 'OLD')} with ${X.in(b, 'NEW')} in ${X.f(b, 'COL')}`),
  });
  def('pb_str_replace', {
    cat: 'clean', th: TR('แก้ข้อความบางส่วน'), py: '{DF}[{COL}].str.replace({OLD}, {NEW}, regex=False)', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, OLD: { t: 'text', def: ',' }, NEW: { t: 'text', def: '' } },
    tip: TR('แทนข้อความย่อยทุกจุดในทุกแถว เช่น ลบเครื่องหมายจุลภาค "," หรือคำว่า " บาท" (ช่องที่สองว่าง = ลบทิ้ง)'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${c}.str.replace(${Py.str(G.f(b, 'OLD'))}, ${Py.str(G.f(b, 'NEW'))}, regex=False)\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b); df.set(c, df.col(c).str_replace(b.getFieldValue('OLD') ?? '', b.getFieldValue('NEW') ?? '')); },
    ex: (b, X) => T(X, X.f(b, 'NEW') ? `เปลี่ยน "${X.f(b, 'OLD')}" เป็น "${X.f(b, 'NEW')}" ทุกจุดในคอลัมน์ ${X.f(b, 'COL')}` : `ลบ "${X.f(b, 'OLD')}" ออกจากทุกค่าในคอลัมน์ ${X.f(b, 'COL')}`, `replace "${X.f(b, 'OLD')}" with "${X.f(b, 'NEW')}" in ${X.f(b, 'COL')}`),
  });

  /* ---------- names spelled in several ways (version 3.8) ----------
     similar_values: for every value but the most common, the more common value whose spelling is most alike
     (difflib's SequenceMatcher after PyThaiNLP's normalize, so "ขอนเเก่น" with เ + เ matches "ขอนแก่น") */
  const SIMILAR_PY = [
    'def similar_values(s, cutoff=0.8):',
    TR('    """คู่ค่าที่สะกดคล้ายกันในคอลัมน์: value = ค่าที่พบน้อยกว่า, similar_to = ค่าที่พบบ่อยกว่าซึ่งคล้ายที่สุด'),
    TR('    เทียบด้วย difflib หลังปรับรูปแบบตัวอักษรไทย (เช่น "เเ" เป็น "แ") · ratio 1 = เหมือนกันเมื่อปรับแล้ว"""'),
    '    counts = s.value_counts()',
    '    names = [normalize(str(v)) for v in counts.index]',
    '    rows = []',
    '    for i in range(1, len(counts)):',
    '        ratios = [SequenceMatcher(None, names[i], names[j]).ratio() for j in range(i)]',
    '        best = max(range(i), key=lambda j: ratios[j])',
    '        if ratios[best] >= cutoff:',
    '            rows.append({"value": counts.index[i], "count": counts.iloc[i], "similar_to": counts.index[best],',
    '                         "count_similar": counts.iloc[best], "ratio": round(ratios[best], 3)})',
    '    return pd.DataFrame(rows, columns=["value", "count", "similar_to", "count_similar", "ratio"])',
  ].join('\n');
  BK.similarPy = (col, cutoff) => {
    Py.need(PD); Py.need('difflib', 'SequenceMatcher'); Py.need('pythainlp.util', 'normalize');
    Py.helper('similar_values', SIMILAR_PY);
    return `similar_values(${col}${Number(cutoff) === 0.8 ? '' : `, cutoff=${Py.num(cutoff)}`})`;
  };
  def('pb_similar_values', {
    cat: 'clean', out: true, th: TR('หาชื่อที่สะกดคล้ายกัน'), py: 'similar_values({DF}[{COL}], cutoff={CUT})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, CUT: { t: 'num', def: 0.8, min: 0.5, max: 1 } },
    tip: TR('ตารางคู่ค่าที่น่าจะเป็นชื่อเดียวกันแต่สะกดต่างกัน (fuzzy matching ด้วย difflib) เช่น "เชียงไหม่" กับ "เชียงใหม่": ratio 0–1 ยิ่งใกล้ 1 ยิ่งคล้าย · cutoff สูง = เฉพาะที่เกือบเหมือน · ดูแล้วรวมด้วยบล็อก "แทนค่า" (ชื่อย่ออย่าง "กทม" สะกดไม่คล้าย ต้องแทนค่าเอง)'),
    gen: (b, G) => [BK.similarPy(colOf(G, b), G.f(b, 'CUT')), python.Order.FUNCTION_CALL],
    *run(b, I) { const s = I.df(b).col(I.colName(b)); return PB.similarValues(s, Number(b.getFieldValue('CUT'))); },
    ex: (b, X) => T(X, `ตารางคู่ค่าในคอลัมน์ ${X.f(b, 'COL')} ที่สะกดคล้ายกันตั้งแต่ ${X.f(b, 'CUT')} ขึ้นไป (ค่าที่พบน้อยกว่า คู่กับค่าที่พบบ่อยกว่าซึ่งคล้ายที่สุด)`, `the pairs of values in ${X.f(b, 'COL')} spelled at least ${X.f(b, 'CUT')} alike (each rarer value with the more common one it resembles)`),
  });

  /* ---------- dates typed in many formats (version 3.8) ---------- */
  const PARSE_DATE_PY = [
    'MONTHS = {"มค": 1, "มกราคม": 1, "กพ": 2, "กุมภาพันธ์": 2, "มีค": 3, "มีนาคม": 3, "เมย": 4, "เมษายน": 4,', /* th-data */
    '          "พค": 5, "พฤษภาคม": 5, "มิย": 6, "มิถุนายน": 6, "กค": 7, "กรกฎาคม": 7, "สค": 8, "สิงหาคม": 8,', /* th-data */
    '          "กย": 9, "กันยายน": 9, "ตค": 10, "ตุลาคม": 10, "พย": 11, "พฤศจิกายน": 11, "ธค": 12, "ธันวาคม": 12,', /* th-data */
    '          "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}',
    'THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")', /* th-data */
    TR('# รูปแบบที่อ่านได้ (y = ปี, m = เดือน, d = วัน, n = ชื่อเดือน) ลองตามลำดับ'),
    'DATE_PATTERNS = [',
    '    (r"([0-9]{4})[-/.]([0-9]{1,2})[-/.]([0-9]{1,2})", "ymd"),      # 2026-01-15, 2026/1/15',
    '    (r"([0-9]{1,2})[-/.]([0-9]{1,2})[-/.]([0-9]{4})", "dmy"),      # 15/01/2026, 15-1-2569',
    '    (r"([0-9]{1,2})[ ]*([^0-9 ,]+)[ ]*,?[ ]*([0-9]{4})", "dny"),  # 15 ม.ค. 2569, 15 Jan 2026', /* th-data */
    '    (r"([A-Za-z]+)\\.?[ ]+([0-9]{1,2}),?[ ]+([0-9]{4})", "ndy"),   # Jan 15, 2026',
    ']',
    '',
    '',
    'def parse_date(text):',
    TR('    """อ่านวันที่หนึ่งค่าตามรูปแบบใน DATE_PATTERNS · ปี พ.ศ. (มากกว่า 2400) ลบ 543 · อ่านไม่ได้ = NaT"""'),
    '    if pd.isna(text):',
    '        return pd.NaT',
    '    t = str(text).strip().translate(THAI_DIGITS)',
    '    for pattern, order in DATE_PATTERNS:',
    '        m = re.fullmatch(pattern, t)',
    '        if m:',
    '            break',
    '    else:',
    '        return pd.NaT',
    '    part = dict(zip(order, m.groups()))',
    '    if "n" in part:',
    '        name = part["n"]',
    '        month = MONTHS.get(name.lower()[:3] if name.isascii() else name.replace(".", ""))',
    '        if month is None:',
    '            return pd.NaT',
    '    else:',
    '        month = int(part["m"])',
    '    year = int(part["y"])',
    '    if year > 2400:',
    '        year -= 543',
    '    try:',
    '        return pd.Timestamp(year=year, month=month, day=int(part["d"]))',
    '    except (ValueError, OverflowError):',
    '        return pd.NaT',
  ].join('\n');
  const PARSE_DATES_PY = ['def parse_dates(s):', TR('    """แปลงคอลัมน์วันที่ที่พิมพ์หลายรูปแบบเป็นชนิดวันที่ (datetime64) ทีละค่าด้วย parse_date"""'), '    return pd.to_datetime(s.map(parse_date))'].join('\n');
  BK.parseDatesPy = (df, col) => {
    Py.need(PD); Py.need('import re');
    Py.helper('parse_date', PARSE_DATE_PY); Py.helper('parse_dates', PARSE_DATES_PY);
    const c = `${df}[${Py.str(col)}]`;
    return `${c} = parse_dates(${c})\n`;
  };
  def('pb_parse_dates', {
    cat: 'clean', th: TR('แปลงวันที่หลายรูปแบบ'), py: 'parse_dates({DF}[{COL}])', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('แปลงข้อความวันที่ที่พิมพ์ต่างกัน (2026-01-15, 15/1/2569, 15 ม.ค. 2569, 15 มกราคม 2569, Jan 15, 2026) เป็นชนิดวันที่ datetime64 · ปี พ.ศ. แปลงเป็น ค.ศ. ให้ · วันที่ที่อ่านไม่ได้หรือไม่มีจริง (31/02) เป็น NaT'),
    gen: (b, G) => BK.parseDatesPy(G.v(b, 'DF'), b.getFieldValue('COL') || ''),
    *run(b, I) {
      const df = I.df(b), c = I.colName(b), s = df.col(c), out = PB.parseDates(s);
      const bad = s.values.filter((v, i) => !isMiss(v) && Number.isNaN(out.values[i]));
      df.set(c, out);
      if (bad.length) I.out.note(TR`อ่านวันที่ไม่ได้ ${bad.length} ค่า (กลายเป็น NaT) เช่น ${bad.slice(0, 3).map((v) => PB.repr(v)).join(', ')}`, b);
    },
    ex: (b, X) => T(X, `แปลงคอลัมน์ ${X.f(b, 'COL')} ที่พิมพ์วันที่หลายรูปแบบเป็นชนิดวันที่ (ปี พ.ศ. เป็น ค.ศ. · ค่าที่อ่านไม่ได้เป็น NaT)`, `convert ${X.f(b, 'COL')}, dates typed in many formats, to datetime (Buddhist years to CE, unreadable values become NaT)`),
  });

  /* ======================= types ======================= */
  const NUMODE = [[TR('ข้อความตัวเลขล้วน'), 'plain'], [TR('ตัด , ฿ บาท % ออกก่อน'), 'strip']];
  BK.toNumericPy = (col, mode) => { Py.need(PD); return mode === 'strip' ? `pd.to_numeric(${col}.astype(str).str.replace(r"[^\\d.\\-]", "", regex=True), errors="coerce")` : `pd.to_numeric(${col}, errors="coerce")`; };
  def('pb_to_numeric', {
    cat: 'clean', th: TR('แปลงเป็นตัวเลข'), py: 'pd.to_numeric({DF}[{COL}], errors="coerce") {MODE}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, MODE: { t: 'dd', opts: NUMODE } },
    tip: TR('ตัวเลขที่เก็บเป็นข้อความ ("1,250", "฿980", "4") คำนวณไม่ได้ · errors="coerce" เปลี่ยนค่าที่แปลงไม่ได้เป็น NaN · "ตัด , ฿ บาท % ออกก่อน" เก็บไว้เฉพาะตัวเลข จุดทศนิยม และเครื่องหมายลบ'),
    gen: (b, G) => { const c = colOf(G, b); return `${c} = ${BK.toNumericPy(c, G.f(b, 'MODE'))}\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b); df.set(c, PB.toNumeric(df.col(c), b.getFieldValue('MODE') === 'strip')); },
    ex: (b, X) => T(X, `แปลงคอลัมน์ ${X.f(b, 'COL')} เป็นตัวเลข${X.f(b, 'MODE') === 'strip' ? ' (ตัดจุลภาค สัญลักษณ์เงิน และหน่วยออกก่อน)' : ''} ค่าที่แปลงไม่ได้กลายเป็นค่าว่าง`, `convert ${X.f(b, 'COL')} to numbers${X.f(b, 'MODE') === 'strip' ? ' after removing commas, currency signs and units' : ''} (unparseable values become NaN)`),
  });

  /* ======================= outliers ======================= */
  const METHOD = [['"iqr"', 'iqr'], ['"zscore"', 'zscore']];
  const methodTh = (m, k) => (m === 'zscore' ? `ค่าเฉลี่ย ± ${k} เท่าของส่วนเบี่ยงเบนมาตรฐาน` : `Q1 − ${k}×IQR ถึง Q3 + ${k}×IQR`); /* th-en */
  const outArgs = (G, b) => `method=${Py.str(G.f(b, 'M'))}, k=${Py.num(G.f(b, 'K'))}`;
  const kOf = (b) => Number(b.getFieldValue('K'));
  const outFields = { M: { t: 'dd', opts: METHOD }, K: { t: 'num', def: 1.5, min: 0.1, max: 10 } };
  def('pb_outlier_bounds', {
    cat: 'clean', out: true, th: TR('ขอบเขตค่าปกติ'), py: 'outlier_bounds({DF}[{COL}], method={M}, k={K})', f: Object.assign({ DF: { t: 'var', def: 'df' }, COL: { t: 'col' } }, outFields),
    tip: TR('คืนค่า (ขอบล่าง, ขอบบน) ค่าที่อยู่นอกช่วงนี้ถือเป็นค่าผิดปกติ · iqr ใช้ควอร์ไทล์ (ทนค่าสุดโต่ง k=1.5 เป็นมาตรฐาน) · zscore ใช้ค่าเฉลี่ยและส่วนเบี่ยงเบนมาตรฐาน (นิยม k=3)'),
    gen: (b, G) => [`${outHelper('outlier_bounds')}(${colOf(G, b)}, ${outArgs(G, b)})`, python.Order.FUNCTION_CALL],
    *run(b, I) { const s = I.df(b).col(I.colName(b)); const [lo, hi] = PB.outlierBounds(s, b.getFieldValue('M'), kOf(b)); return new PB.Tuple([PB.toFloat(lo), PB.toFloat(hi)]); },
    ex: (b, X) => T(X, `ขอบล่างและขอบบนของค่าปกติในคอลัมน์ ${X.f(b, 'COL')} (${methodTh(X.f(b, 'M'), X.f(b, 'K'))})`, `the normal range of ${X.f(b, 'COL')} (${X.f(b, 'M')}, k=${X.f(b, 'K')})`),
  });
  def('pb_outlier_rows', {
    cat: 'clean', out: true, th: TR('หาค่าผิดปกติ'), py: 'find_outliers({DF}, {COL}, method={M}, k={K})', f: Object.assign({ DF: { t: 'var', def: 'df' }, COL: { t: 'col' } }, outFields),
    tip: TR('แถวที่ค่าในคอลัมน์อยู่นอกขอบเขตค่าปกติ ดูก่อนตัดสินใจว่าเป็นข้อมูลผิด (พิมพ์ผิด) หรือค่าจริงที่สุดโต่ง'),
    gen: (b, G) => [`${outHelper('find_outliers')}(${G.v(b, 'DF')}, ${G.col(b, 'COL')}, ${outArgs(G, b)})`, python.Order.FUNCTION_CALL],
    *run(b, I) { const df = I.df(b), s = df.col(I.colName(b)); return df.mask(PB.outliers(s, b.getFieldValue('M'), kOf(b)).mask); },
    ex: (b, X) => T(X, `แถวของ ${X.v(b, 'DF')} ที่ ${X.f(b, 'COL')} อยู่นอกช่วง ${methodTh(X.f(b, 'M'), X.f(b, 'K'))}`, `the rows of ${X.v(b, 'DF')} whose ${X.f(b, 'COL')} is an outlier (${X.f(b, 'M')}, k=${X.f(b, 'K')})`),
  });
  const OUTACT = [[TR('outliers_to_nan · ทำเป็นค่าว่าง'), 'nan'], [TR('clip_outliers · ตัดขอบ'), 'clip'], [TR('remove_outliers · ลบแถว'), 'remove']];
  const OUTACT_TH = { nan: 'เปลี่ยนเป็นค่าว่างเพื่อเติมค่าใหม่ภายหลัง', clip: 'ตัดให้เท่ากับขอบล่าง/ขอบบน', remove: 'ลบแถวนั้นออก' }; /* th-en */
  BK.outlierFixPy = (df, col, action, args) => {
    const c = `${df}[${Py.str(col)}]`;
    if (action === 'remove') return `${df} = ${outHelper('remove_outliers')}(${df}, ${Py.str(col)}, ${args})\n`;
    return `${c} = ${outHelper(action === 'clip' ? 'clip_outliers' : 'outliers_to_nan')}(${c}, ${args})\n`;
  };
  def('pb_outlier_fix', {
    cat: 'clean', th: TR('จัดการค่าผิดปกติ'), thBreak: true, py: '{ACT} ( {DF}[{COL}] ,\nmethod={M}, k={K} )', f: Object.assign({ DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, ACT: { t: 'dd', opts: OUTACT } }, outFields),
    tip: TR('ทำเป็นค่าว่าง = เหมาะกับค่าที่พิมพ์ผิด (เช่น อายุ 250) แล้วเติมค่าใหม่ · ตัดขอบ = เก็บแถวไว้แต่ลดความสุดโต่ง · ลบแถว = ตัดทั้งแถวออก'),
    gen: (b, G) => BK.outlierFixPy(G.v(b, 'DF'), b.getFieldValue('COL') || '', G.f(b, 'ACT'), outArgs(G, b)),
    *run(b, I) {
      const df = I.df(b), c = I.colName(b), s = df.col(c), act = b.getFieldValue('ACT');
      const o = PB.outliers(s, b.getFieldValue('M'), kOf(b));
      if (act === 'remove') I.set(I.vname(b, 'DF'), df.mask(o.mask.map((x) => !x)));
      else df.set(c, act === 'clip' ? s.clip(o.low, o.high) : s.maskWhere(o.mask));
    },
    ex: (b, X) => T(X, `ค่าผิดปกติในคอลัมน์ ${X.f(b, 'COL')} (นอกช่วง ${methodTh(X.f(b, 'M'), X.f(b, 'K'))}): ${OUTACT_TH[X.f(b, 'ACT')]}`, `outliers in ${X.f(b, 'COL')} (${X.f(b, 'M')}, k=${X.f(b, 'K')}): ${X.f(b, 'ACT')}`),
  });

  /* ======================= scaling (normalize) ======================= */
  const SCALERS = [['MinMaxScaler', 'MinMaxScaler'], ['StandardScaler', 'StandardScaler'], ['RobustScaler', 'RobustScaler'], ['MaxAbsScaler', 'MaxAbsScaler']];
  const SCALE_TH = { MinMaxScaler: TR('ให้อยู่ช่วง 0–1 (Min-Max)'), StandardScaler: TR('ให้ค่าเฉลี่ย 0 ส่วนเบี่ยงเบนมาตรฐาน 1 (z-score)'), RobustScaler: TR('ด้วยมัธยฐานและ IQR (ทนค่าผิดปกติ)'), MaxAbsScaler: TR('ให้อยู่ช่วง -1 ถึง 1 โดยหารด้วยค่าสัมบูรณ์มากสุด') };
  BK.SCALE_TH = SCALE_TH;
  BK.scaleColsPy = (df, cols, cls) => { Py.need('sklearn.preprocessing', cls); const sel = `${df}[${Py.list(cols)}]`; return `${sel} = ${cls}().fit_transform(${sel})\n`; };
  def('pb_scale_cols', {
    cat: 'clean', th: TR('ปรับสเกลคอลัมน์'), thBreak: true, py: '{DF}[[{COLS}]] =\n{CLS}().fit_transform(…)', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' }, CLS: { t: 'dd', opts: SCALERS } },
    tip: TR('Normalize: ปรับหลายคอลัมน์ตัวเลขให้อยู่ในสเกลเดียวกันแล้วเขียนทับในตาราง (ค่าว่างยังว่างอยู่) · ถ้าจะสร้างโมเดลต่อ ควรปรับสเกลหลังแบ่งข้อมูลฝึก/ทดสอบ หรือใช้ไปป์ไลน์'),
    gen: (b, G) => BK.scaleColsPy(G.v(b, 'DF'), G.cols(b, 'COLS'), G.f(b, 'CLS')),
    *run(b, I) {
      const df = I.df(b), cols = I.colList(b), cls = b.getFieldValue('CLS');
      for (const c of cols) df._need(c);
      const out = new PB[cls]().fit_transform(df.select(cols));
      cols.forEach((c, j) => df.set(c, new PB.Series(out.data.map((r) => r[j]), { dtype: 'float64' })));
    },
    ex: (b, X) => T(X, `ปรับสเกลคอลัมน์ ${X.f(b, 'COLS')} ของ ${X.v(b, 'DF')} ${SCALE_TH[X.f(b, 'CLS')]} ด้วย ${X.f(b, 'CLS')}`, `scale ${X.f(b, 'COLS')} of ${X.v(b, 'DF')} with ${X.f(b, 'CLS')}`),
  });
  const FORMULA = [['(x - x.min()) / (x.max() - x.min())', 'minmax'], ['(x - x.mean()) / x.std()', 'zscore']];
  def('pb_scale_formula', {
    cat: 'clean', out: true, th: TR('สูตรปรับสเกล'), py: 'x = {DF}[{COL}] ; {FN}', f: { FN: { t: 'dd', opts: FORMULA }, DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('เขียนสูตรเองด้วย pandas: min-max ได้ค่า 0–1, z-score บอกว่าห่างจากค่าเฉลี่ยกี่เท่าของส่วนเบี่ยงเบนมาตรฐาน (pandas ใช้ std แบบตัวอย่าง ddof=1 จึงต่างจาก StandardScaler เล็กน้อย)'),
    gen: (b, G) => { const c = colOf(G, b); return G.f(b, 'FN') === 'zscore' ? [`(${c} - ${c}.mean()) / ${c}.std()`, python.Order.MULTIPLICATIVE] : [`(${c} - ${c}.min()) / (${c}.max() - ${c}.min())`, python.Order.MULTIPLICATIVE]; },
    *run(b, I) {
      const s = I.df(b).col(I.colName(b));
      s._num('scale');
      if (b.getFieldValue('FN') === 'zscore') return s.arith('-', s.mean(), true).arith('/', s.std());
      const lo = s.min(), hi = s.max();
      return s.arith('-', lo, s.dtype === 'float64').arith('/', hi - lo);
    },
    ex: (b, X) => T(X, X.f(b, 'FN') === 'zscore' ? `ค่า z-score ของคอลัมน์ ${X.f(b, 'COL')} (ลบค่าเฉลี่ยแล้วหารด้วยส่วนเบี่ยงเบนมาตรฐาน)` : `ค่าของคอลัมน์ ${X.f(b, 'COL')} ที่ปรับเป็นช่วง 0–1 (ลบค่าต่ำสุดแล้วหารด้วยพิสัย)`, `the ${X.f(b, 'FN')} scaled values of ${X.f(b, 'COL')}`),
  });
})();
