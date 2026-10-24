/* ThaiPyBlocks: pandas data blocks (each block = one Python variable/function call). */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py;
  const PD = 'import pandas as pd';

  /* ---------- interpreter helpers shared by custom blocks ---------- */
  Object.assign(PB.Interp.prototype, {
    vv(b, field) { return PB.unbox(this.get(this.vname(b, field))); },
    df(b, field = 'DF') {
      const name = this.vname(b, field), v = this.get(name);
      if (!(v instanceof PB.DataFrame)) throw PB.err('TypeError', `'${PB.typeName(v)}' object is not a DataFrame`, TR`ตัวแปร ${name} ไม่ใช่ตารางข้อมูล (DataFrame) แต่เป็น ${PB.typeName(v)}`, TR('เลือกตัวแปรที่เก็บตารางข้อมูล เช่น df'));
      return v;
    },
    model(b, field = 'M') {
      const name = this.vname(b, field), v = this.get(name);
      if (!(v instanceof PB.Estimator)) throw PB.err('AttributeError', `'${PB.typeName(v)}' object has no attribute 'fit'`, TR`ตัวแปร ${name} ไม่ใช่โมเดล แต่เป็น ${PB.typeName(v)}`, TR('สร้างโมเดลด้วยบล็อกในหมวดโมเดลแล้วเก็บไว้ในตัวแปรนี้ก่อน'));
      return v;
    },
    colName(b, field = 'COL') { const c = b.getFieldValue(field); if (!c) throw PB.err('SyntaxError', 'column not chosen', TR('ยังไม่ได้เลือกคอลัมน์ในบล็อกนี้'), TR('คลิกช่องคอลัมน์แล้วเลือกชื่อคอลัมน์')); return c; },
    colList(b, field = 'COLS') { const c = BK.splitCols(b.getFieldValue(field)); if (!c.length) throw PB.err('SyntaxError', 'columns not chosen', TR('ยังไม่ได้เลือกคอลัมน์ในบล็อกนี้'), TR('คลิกช่องคอลัมน์แล้วติ๊กเลือก')); return c; },
    *need(b, input) { return yield* this.val(b, input, PB.REQUIRED); },
    *needRaw(b, input) { return yield* this.valRaw(b, input, PB.REQUIRED); },
  });

  /* ---------- explanation helper texts ---------- */
  const T = (X, th, en) => (X.lang === 'en' ? en : th);
  BK.T = T;

  /* ---------- datasets ---------- */
  const dsOpts = () => Object.entries(PB.DATASETS).map(([k, d]) => [`${k} · ${d.title}`, k]);
  function datasetCode(n) {
    const d = PB.DATASETS[n];
    if (n === 'digits') { Py.need('sklearn.datasets', 'load_digits'); return 'load_digits(as_frame=True).frame'; }
    if (n === 'thai_reviews') {
      Py.need(PD);
      const df = PB.loadSample('thai_reviews');
      const rows = PB.range(df.nrows).map((i) => `        (${Py.str(df.col('text').values[i])}, ${Py.str(df.col('label').values[i])}, ${Py.str(df.col('category').values[i])}),`);
      Py.helper('load_thai_reviews', ['def load_thai_reviews():', TR('    """รีวิวสินค้าภาษาไทยตัวอย่าง 120 รายการ (เขียนขึ้นเพื่อการสาธิต)"""'), '    rows = [', ...rows, '    ]', '    return pd.DataFrame(rows, columns=["text", "label", "category"])'].join('\n'));
      return 'load_thai_reviews()';
    }
    if (d.embed) {
      /* a small made-up dataset: the CSV text travels inside the program and pandas reads it */
      Py.need(PD); Py.need('import io');
      Py.helper(d.embed, [`def ${d.embed}():`, TR`    """${d.title} ${d.rows} แถว (ข้อมูลสมมติสำหรับฝึกทำความสะอาดข้อมูล)"""`, '    csv_text = """' + PB.RAW[n] + '"""', '    return pd.read_csv(io.StringIO(csv_text))'].join('\n'));
      return `${d.embed}()`;
    }
    Py.need(PD);
    return `pd.read_csv(${Py.str(d.url)})`;
  }
  BK.datasetCode = datasetCode;
  def('pb_dataset', {
    cat: 'data', out: true, th: TR('ข้อมูลตัวอย่าง'), py: '{NAME}', f: { NAME: { t: 'dd', opts: dsOpts } },
    tip: TR('โหลดชุดข้อมูลตัวอย่างเป็นตาราง DataFrame (ในโค้ด Python ใช้ pd.read_csv หรือ load_digits)'),
    gen: (b) => datasetCode(b.getFieldValue('NAME')),
    *run(b) { return PB.loadSample(b.getFieldValue('NAME')); },
    ex: (b, X) => { const d = PB.DATASETS[b.getFieldValue('NAME')]; return T(X, `ชุดข้อมูล${d.title} (${d.rows.toLocaleString()} แถว)`, `the ${d.en} sample dataset (${d.rows} rows)`); },
  });

  /* ---------- uploaded files ---------- */
  PB.files = PB.files || new Map();
  function readerFor(name) {
    const f = PB.files.get(name) || {};
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') return { fn: 'pd.read_excel', extra: f.sheet ? `, sheet_name=${Py.str(f.sheet)}` : '' };
    if (ext === 'json') return { fn: 'pd.read_json', extra: '' };
    let extra = '';
    if (f.sep && f.sep !== ',') extra += `, sep=${f.sep === '\t' ? '"\\t"' : Py.str(f.sep)}`;
    if (f.encoding && f.encoding !== 'utf-8') extra += `, encoding=${Py.str(f.encoding === 'windows-874' ? 'cp874' : f.encoding)}`;
    return { fn: 'pd.read_csv', extra };
  }
  BK.readerFor = readerFor;
  def('pb_read_file', {
    cat: 'data', out: true, th: TR('อ่านไฟล์ของฉัน'), py: '{FN}({FILE})', f: { FN: { t: 'label', def: 'pd.read_csv' }, FILE: { t: 'file' } },
    tip: TR('อ่านไฟล์ CSV / Excel / JSON ที่อัปโหลดเป็น DataFrame'),
    onchange() { const n = this.getFieldValue('FILE'); if (!n) return; const fn = readerFor(n).fn; if (this.getFieldValue('FN') !== fn) this.setFieldValue(fn, 'FN'); },
    gen: (b) => { Py.need(PD); const n = b.getFieldValue('FILE') || 'data.csv'; const r = readerFor(n); return `${r.fn}(${Py.str(n)}${r.extra})`; },
    *run(b) {
      const n = b.getFieldValue('FILE');
      if (!n) throw PB.err('FileNotFoundError', 'no file selected', TR('ยังไม่ได้เลือกไฟล์'), TR('กดช่องไฟล์เพื่ออัปโหลดหรือเลือกไฟล์'));
      const f = PB.files.get(n);
      if (!f) throw PB.err('FileNotFoundError', `[Errno 2] No such file or directory: '${n}'`, TR`ไม่พบไฟล์ ${n} ในเครื่องนี้`, TR('อัปโหลดไฟล์นี้อีกครั้งด้วยปุ่ม "ข้อมูลของฉัน"'));
      return f.df.copy();
    },
    ex: (b, X) => T(X, `ไฟล์ ${b.getFieldValue('FILE') || '(ยังไม่เลือก)'} ที่อัปโหลด`, `the uploaded file ${b.getFieldValue('FILE') || '(not chosen)'}`),
  });

  /* ---------- viewing / summary ---------- */
  def('pb_df_view', {
    cat: 'data', out: true, th: TR('ดูแถว'), py: '{DF}.{FN}({N})',
    f: { DF: { t: 'var', def: 'df' }, FN: { t: 'dd', opts: [['head', 'head'], ['tail', 'tail'], ['sample', 'sample']] }, N: { t: 'num', def: 5, min: 1, prec: 1 } },
    tip: TR('head = แถวแรก, tail = แถวท้าย, sample = สุ่มแถว'),
    gen: (b, G) => { const fn = G.f(b, 'FN'), n = G.f(b, 'N'); return `${G.v(b, 'DF')}.${fn}(${n}${fn === 'sample' ? ', random_state=42' : ''})`; },
    *run(b, I) { const df = I.df(b), n = Number(b.getFieldValue('N')), fn = b.getFieldValue('FN'); return fn === 'sample' ? df.sample(Math.min(n, df.nrows), 42) : df[fn](n); },
    ex: (b, X) => { const fn = X.f(b, 'FN'), n = X.f(b, 'N'), v = X.v(b, 'DF'); return T(X, { head: `${n} แถวแรกของ ${v}`, tail: `${n} แถวสุดท้ายของ ${v}`, sample: `${n} แถวที่สุ่มจาก ${v}` }[fn], { head: `the first ${n} rows of ${v}`, tail: `the last ${n} rows of ${v}`, sample: `${n} random rows of ${v}` }[fn]); },
  });
  const INFO = [
    ['.describe()', 'describe', TR('สถิติสรุปของคอลัมน์ตัวเลข (count, mean, std, min, ควอร์ไทล์, max)'), 'summary statistics of the numeric columns'],
    ['.info()', 'info', TR('โครงสร้างตาราง: ชื่อคอลัมน์ จำนวนค่าที่ไม่ว่าง และชนิดข้อมูล'), 'the table structure: columns, non-null counts and dtypes'],
    ['.isnull().sum()', 'isnull', TR('จำนวนค่าว่าง (NaN) ในแต่ละคอลัมน์'), 'the number of missing values per column'],
    ['.dtypes', 'dtypes', TR('ชนิดข้อมูลของแต่ละคอลัมน์'), 'the data type of each column'],
    ['.shape', 'shape', TR('ขนาดตาราง (จำนวนแถว, จำนวนคอลัมน์)'), 'the table shape (rows, columns)'],
    ['.columns', 'columns', TR('รายชื่อคอลัมน์'), 'the column names'],
    ['.nunique()', 'nunique', TR('จำนวนค่าที่ไม่ซ้ำกันในแต่ละคอลัมน์'), 'the number of distinct values per column'],
    ['.corr(numeric_only=True)', 'corr', TR('ค่าสหสัมพันธ์ระหว่างคอลัมน์ตัวเลข'), 'the correlation matrix of the numeric columns'],
    ['.mean(numeric_only=True)', 'mean', TR('ค่าเฉลี่ยของแต่ละคอลัมน์ตัวเลข'), 'the mean of each numeric column'],
    ['.duplicated().sum()', 'dups', TR('จำนวนแถวที่ซ้ำกัน'), 'the number of duplicated rows'],
  ];
  def('pb_df_info', {
    cat: 'data', out: true, th: TR('สรุปข้อมูล'), py: '{DF}{FN}', f: { DF: { t: 'var', def: 'df' }, FN: { t: 'dd', opts: INFO.map((x) => [x[0], x[1]]) } },
    tip: TR('ดูภาพรวมของตาราง: สถิติ ชนิดข้อมูล ค่าว่าง ขนาด'),
    gen: (b, G) => { const fn = G.f(b, 'FN'); return [G.v(b, 'DF') + INFO.find((x) => x[1] === fn)[0], python.Order.MEMBER]; },
    *run(b, I) {
      const df = I.df(b), fn = b.getFieldValue('FN');
      switch (fn) {
        case 'describe': return df.describe();
        case 'info': return df.info();
        case 'isnull': return df.nullCounts();
        case 'dtypes': return df.dtypesSeries();
        case 'shape': return df.shape;
        case 'columns': return new PB.Index(df.columns);
        case 'nunique': return df.nunique();
        case 'corr': return df.corr();
        case 'mean': return df.reduce('mean');
        case 'dups': return df.duplicatedCount();
      }
      return null;
    },
    ex: (b, X) => { const r = INFO.find((x) => x[1] === X.f(b, 'FN')); return T(X, r[2] + ' ของ ' + X.v(b, 'DF'), r[3] + ' of ' + X.v(b, 'DF')); },
  });

  /* ---------- selecting ---------- */
  def('pb_col', {
    cat: 'data', out: true, py: '{DF}[{COL}]', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('เลือกคอลัมน์เดียว ได้ผลเป็น Series'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}]`, python.Order.MEMBER],
    *run(b, I) { return I.df(b).col(I.colName(b)); },
    ex: (b, X) => T(X, `คอลัมน์ ${X.f(b, 'COL')} ของ ${X.v(b, 'DF')}`, `the column ${X.f(b, 'COL')} of ${X.v(b, 'DF')}`),
  });
  def('pb_cols', {
    cat: 'data', out: true, py: '{DF}[[{COLS}]]', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' } },
    tip: TR('เลือกหลายคอลัมน์ ได้ผลเป็น DataFrame'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${Py.list(G.cols(b, 'COLS'))}]`, python.Order.MEMBER],
    *run(b, I) { return I.df(b).select(I.colList(b)); },
    ex: (b, X) => T(X, `ตารางที่เลือกเฉพาะคอลัมน์ ${X.f(b, 'COLS')} จาก ${X.v(b, 'DF')}`, `${X.v(b, 'DF')} with only the columns ${X.f(b, 'COLS')}`),
  });
  const OPS = [['==', '=='], ['!=', '!='], ['>', '>'], ['>=', '>='], ['<', '<'], ['<=', '<='], ['.str.contains', 'contains'], ['.isnull()', 'isnull'], ['.notnull()', 'notnull']];
  const OP_TH = { '==': 'เท่ากับ', '!=': 'ไม่เท่ากับ', '>': 'มากกว่า', '>=': 'มากกว่าหรือเท่ากับ', '<': 'น้อยกว่า', '<=': 'น้อยกว่าหรือเท่ากับ', contains: 'มีข้อความ', isnull: 'เป็นค่าว่าง', notnull: 'ไม่เป็นค่าว่าง' }; /* th-en */
  const OP_EN = { '==': 'equals', '!=': 'is not', '>': 'is greater than', '>=': 'is at least', '<': 'is less than', '<=': 'is at most', contains: 'contains', isnull: 'is missing', notnull: 'is not missing' };
  def('pb_filter', {
    cat: 'data', out: true, th: TR('กรองแถว'), py: '{DF}[ {COL} {OP} {@VAL} ]', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, OP: { t: 'dd', opts: OPS }, VAL: {} },
    tip: TR('เลือกเฉพาะแถวที่ตรงเงื่อนไข เช่น df[df["age"] > 30]'),
    gen: (b, G) => {
      const df = G.v(b, 'DF'), c = `${df}[${G.col(b, 'COL')}]`, op = G.f(b, 'OP');
      let cond;
      if (op === 'contains') cond = `${c}.str.contains(${G.in(b, 'VAL', python.Order.NONE, '""')})`;
      else if (op === 'isnull' || op === 'notnull') cond = `${c}.${op}()`;
      else cond = `${c} ${op} ${G.in(b, 'VAL', python.Order.RELATIONAL, '0')}`;
      return [`${df}[${cond}]`, python.Order.MEMBER];
    },
    *run(b, I) {
      const df = I.df(b), s = df.col(I.colName(b)), op = b.getFieldValue('OP');
      let mask;
      if (op === 'isnull') mask = s.isnull(); else if (op === 'notnull') mask = s.notnull();
      else { const v = yield* I.need(b, 'VAL'); mask = op === 'contains' ? s.str_contains(v) : s.compare(op, v); }
      return df.mask(mask);
    },
    ex: (b, X) => { const op = X.f(b, 'OP'); const val = op === 'isnull' || op === 'notnull' ? '' : ' ' + X.in(b, 'VAL'); return T(X, `แถวของ ${X.v(b, 'DF')} ที่ ${X.f(b, 'COL')} ${OP_TH[op]}${val}`, `rows of ${X.v(b, 'DF')} where ${X.f(b, 'COL')} ${OP_EN[op]}${val}`); },
  });
  def('pb_sort', {
    cat: 'data', out: true, th: TR('เรียงลำดับ'), py: '{DF}.sort_values({COL}, ascending={ASC})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, ASC: { t: 'dd', opts: [['True', 'True'], ['False', 'False']] } },
    tip: TR('ascending=True เรียงจากน้อยไปมาก, False เรียงจากมากไปน้อย'),
    gen: (b, G) => `${G.v(b, 'DF')}.sort_values(${G.col(b, 'COL')}, ascending=${G.f(b, 'ASC')})`,
    *run(b, I) { return I.df(b).sort_values(I.colName(b), b.getFieldValue('ASC') === 'True'); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่เรียงตาม ${X.f(b, 'COL')} ${X.f(b, 'ASC') === 'True' ? 'จากน้อยไปมาก' : 'จากมากไปน้อย'}`, `${X.v(b, 'DF')} sorted by ${X.f(b, 'COL')} ${X.f(b, 'ASC') === 'True' ? 'ascending' : 'descending'}`),
  });
  const AGG = [['mean', 'mean'], ['sum', 'sum'], ['count', 'count'], ['min', 'min'], ['max', 'max'], ['median', 'median'], ['std', 'std'], ['nunique', 'nunique']];
  const AGG_TH = { mean: 'ค่าเฉลี่ย', sum: 'ผลรวม', count: 'จำนวน', min: 'ค่าต่ำสุด', max: 'ค่าสูงสุด', median: 'มัธยฐาน', std: 'ส่วนเบี่ยงเบนมาตรฐาน', nunique: 'จำนวนค่าไม่ซ้ำ' }; /* th-en */
  def('pb_groupby', {
    cat: 'data', out: true, th: TR('จัดกลุ่มสรุป'), py: '{DF}.groupby({BY})[{COL}].{AGG}()', f: { DF: { t: 'var', def: 'df' }, BY: { t: 'col' }, COL: { t: 'col', placeholder: TR('ทุกคอลัมน์ตัวเลข') }, AGG: { t: 'dd', opts: AGG } },
    init() { const f = this.getField('COL'); if (f) f.placeholder_ = TR('ทุกคอลัมน์ตัวเลข'); },
    tip: TR('จัดกลุ่มแถวตามค่าในคอลัมน์ แล้วสรุปค่าในแต่ละกลุ่ม (ปล่อยคอลัมน์ว่าง = ทุกคอลัมน์ตัวเลข)'),
    gen: (b, G) => {
      const df = G.v(b, 'DF'), by = G.col(b, 'BY'), col = b.getFieldValue('COL'), agg = G.f(b, 'AGG');
      if (!col) return agg === 'count' ? `${df}.groupby(${by}).size()` : `${df}.groupby(${by}).${agg}(${agg === 'nunique' ? '' : 'numeric_only=True'})`;
      return `${df}.groupby(${by})[${Py.str(col)}].${agg}()`;
    },
    *run(b, I) {
      const df = I.df(b), by = I.colName(b, 'BY'), col = b.getFieldValue('COL') || null, agg = b.getFieldValue('AGG');
      const g = df.groupby(by);
      if (!col && agg === 'count') return g.size();
      return g.agg(col, agg);
    },
    ex: (b, X) => T(X, `${AGG_TH[X.f(b, 'AGG')]}ของ ${X.f(b, 'COL') || 'ทุกคอลัมน์ตัวเลข'} แยกตามกลุ่ม ${X.f(b, 'BY')} ใน ${X.v(b, 'DF')}`, `the ${X.f(b, 'AGG')} of ${X.f(b, 'COL') || 'every numeric column'} for each ${X.f(b, 'BY')} group in ${X.v(b, 'DF')}`),
  });
  const SSTAT = [['.mean()', 'mean'], ['.median()', 'median'], ['.sum()', 'sum'], ['.min()', 'min'], ['.max()', 'max'], ['.std()', 'std'], ['.count()', 'count'], ['.nunique()', 'nunique'], ['.unique()', 'unique'], ['.value_counts()', 'value_counts'], ['.mode()[0]', 'mode'], ['.isnull().sum()', 'nulls'], ['.describe()', 'describe'], ['.idxmax()', 'idxmax']];
  const SSTAT_TH = { mean: 'ค่าเฉลี่ย', median: 'มัธยฐาน', sum: 'ผลรวม', min: 'ค่าต่ำสุด', max: 'ค่าสูงสุด', std: 'ส่วนเบี่ยงเบนมาตรฐาน', count: 'จำนวนค่าที่ไม่ว่าง', nunique: 'จำนวนค่าไม่ซ้ำ', unique: 'รายการค่าไม่ซ้ำ', value_counts: 'จำนวนครั้งของแต่ละค่า', mode: 'ค่าที่พบบ่อยที่สุด', nulls: 'จำนวนค่าว่าง', describe: 'สถิติสรุป', idxmax: 'ตำแหน่ง (index) ของค่าสูงสุด' }; /* th-en */
  def('pb_series_stat', {
    cat: 'data', out: true, th: TR('คำนวณ'), py: '{DF}[{COL}]{FN}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: SSTAT } },
    tip: TR('คำนวณค่าสถิติของคอลัมน์เดียว'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}]${SSTAT.find((x) => x[1] === G.f(b, 'FN'))[0]}`, python.Order.MEMBER],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), fn = b.getFieldValue('FN');
      const fl = s.dtype === 'float64';
      if (fn === 'mode') { const m = s.mode(); if (!m.length) throw PB.err('IndexError', 'index 0 is out of bounds', TR('คอลัมน์ไม่มีค่าเลย')); return fl ? PB.toFloat(m.values[0]) : m.values[0]; }
      if (fn === 'nulls') return s.nullCount();
      const r = s[fn]();
      /* pandas returns numpy floats for these (prints 5.0, not 5) */
      if (typeof r === 'number' && (fn === 'mean' || fn === 'median' || fn === 'std' || (fl && (fn === 'sum' || fn === 'min' || fn === 'max')))) return PB.toFloat(r);
      return r;
    },
    ex: (b, X) => T(X, `${SSTAT_TH[X.f(b, 'FN')]}ของคอลัมน์ ${X.f(b, 'COL')}`, `the ${X.f(b, 'FN').replace('_', ' ')} of column ${X.f(b, 'COL')}`),
  });

  /* ---------- changing columns ---------- */
  def('pb_set_col', {
    cat: 'data', th: TR('สร้าง/แทนคอลัมน์'), py: '{DF}[{NAME}] = {@VAL}', f: { DF: { t: 'var', def: 'df' }, NAME: { t: 'text', def: 'new_col' }, VAL: {} },
    tip: TR('สร้างคอลัมน์ใหม่ (หรือเขียนทับคอลัมน์เดิม) จากค่าที่ใส่ในช่องขวา'),
    gen: (b, G) => `${G.v(b, 'DF')}[${Py.str(G.f(b, 'NAME'))}] = ${G.in(b, 'VAL')}\n`,
    *run(b, I) { const df = I.df(b); let v = yield* I.need(b, 'VAL'); if (Array.isArray(v)) v = v.map(PB.unbox); if (v instanceof PB.DataFrame) throw PB.err('ValueError', 'Cannot set a DataFrame with multiple columns to the single column', TR('ใส่ตารางหลายคอลัมน์ลงในคอลัมน์เดียวไม่ได้')); df.set(b.getFieldValue('NAME'), v); },
    ex: (b, X) => T(X, `สร้างคอลัมน์ ${X.f(b, 'NAME')} ใน ${X.v(b, 'DF')} จาก${X.in(b, 'VAL')}`, `set column ${X.f(b, 'NAME')} of ${X.v(b, 'DF')} to ${X.in(b, 'VAL')}`),
  });
  const MOPS = [['+', '+'], ['-', '-'], ['*', '*'], ['/', '/'], ['**', '**'], ['//', '//'], ['%', '%']];
  def('pb_col_math', {
    cat: 'data', out: true, py: '{DF}[{COL}] {OP} {@VAL}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, OP: { t: 'dd', opts: MOPS }, VAL: {} },
    tip: TR('คำนวณทั้งคอลัมน์กับตัวเลขหรือคอลัมน์อื่น เช่น df["tip"] / df["total_bill"]'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}] ${G.f(b, 'OP')} ${G.in(b, 'VAL', python.Order.MULTIPLICATIVE, '1')}`, G.f(b, 'OP') === '+' || G.f(b, 'OP') === '-' ? python.Order.ADDITIVE : python.Order.MULTIPLICATIVE],
    *run(b, I) { const s = I.df(b).col(I.colName(b)); const v = yield* I.needRaw(b, 'VAL'); return s.arith(b.getFieldValue('OP'), v); },
    ex: (b, X) => T(X, `ค่าในคอลัมน์ ${X.f(b, 'COL')} ${X.f(b, 'OP')} ${X.in(b, 'VAL')}`, `column ${X.f(b, 'COL')} ${X.f(b, 'OP')} ${X.in(b, 'VAL')}`),
  });
  const CFN = [['.astype(float)', 'float'], ['.astype(int)', 'int'], ['.astype(str)', 'str'], ['.str.lower()', 'lower'], ['.str.upper()', 'upper'], ['.str.len()', 'len'], ['.round(2)', 'round2'], ['.abs()', 'abs'], ['.cumsum()', 'cumsum'], ['.shift(1)', 'shift'], ['.diff()', 'diff'], ['.pct_change()', 'pct'], ['.dt.year', 'year'], ['.dt.month', 'month'], ['.dt.quarter', 'quarter'], ['.dt.dayofweek', 'dow']];
  const CFN_TH = { float: 'แปลงเป็นทศนิยม', int: 'แปลงเป็นจำนวนเต็ม', str: 'แปลงเป็นข้อความ', lower: 'แปลงเป็นตัวพิมพ์เล็ก', upper: 'แปลงเป็นตัวพิมพ์ใหญ่', len: 'ความยาวข้อความ', round2: 'ปัดเศษ 2 ตำแหน่ง', abs: 'ค่าสัมบูรณ์', cumsum: 'ผลรวมสะสม', shift: 'ค่าของแถวก่อนหน้า', diff: 'ผลต่างจากแถวก่อนหน้า', pct: 'เปอร์เซ็นต์การเปลี่ยนแปลง', year: 'ปี', month: 'เดือน', quarter: 'ไตรมาส', dow: 'วันในสัปดาห์ (0=จันทร์)' }; /* th-en */
  def('pb_col_func', {
    cat: 'data', out: true, py: '{DF}[{COL}]{FN}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: CFN } },
    tip: TR('แปลงหรือคำนวณค่าในคอลัมน์ทีละแถว'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}]${CFN.find((x) => x[1] === G.f(b, 'FN'))[0]}`, python.Order.MEMBER],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), fn = b.getFieldValue('FN');
      switch (fn) {
        case 'float': case 'int': case 'str': return s.astype(fn);
        case 'lower': case 'upper': case 'len': return s.str_op(fn);
        case 'round2': return s.round(2);
        case 'abs': return s.abs(); case 'cumsum': return s.cumsum(); case 'shift': return s.shift(1); case 'diff': return s.diff(1); case 'pct': return s.pct_change(1);
        case 'year': return s.dt('year'); case 'month': return s.dt('month'); case 'quarter': return s.dt('quarter'); case 'dow': return s.dt('dayofweek');
      }
      return s;
    },
    ex: (b, X) => T(X, `${CFN_TH[X.f(b, 'FN')]}ของคอลัมน์ ${X.f(b, 'COL')}`, `${X.f(b, 'FN')} of column ${X.f(b, 'COL')}`),
  });
  def('pb_np_func', {
    cat: 'data', out: true, py: 'np.{FN}({DF}[{COL}])', f: { FN: { t: 'dd', opts: [['log1p', 'log1p'], ['log', 'log'], ['sqrt', 'sqrt'], ['exp', 'exp']] }, DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('ใช้ฟังก์ชันคณิตศาสตร์ของ numpy กับทั้งคอลัมน์'),
    gen: (b, G) => { Py.need('import numpy as np'); return `np.${G.f(b, 'FN')}(${G.v(b, 'DF')}[${G.col(b, 'COL')}])`; },
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), fn = b.getFieldValue('FN'); const f = { log1p: Math.log1p, log: Math.log, sqrt: Math.sqrt, exp: Math.exp }[fn];
      return s._new(s._num(fn).map((v) => f(v)), { dtype: 'float64' });
    },
    ex: (b, X) => T(X, `${X.f(b, 'FN')} ของคอลัมน์ ${X.f(b, 'COL')}`, `${X.f(b, 'FN')} of column ${X.f(b, 'COL')}`),
  });
  def('pb_to_datetime', {
    cat: 'data', out: true, py: 'pd.to_datetime({DF}[{COL}])', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('แปลงข้อความเป็นวันที่ (datetime)'),
    gen: (b, G) => { Py.need(PD); return `pd.to_datetime(${G.v(b, 'DF')}[${G.col(b, 'COL')}])`; },
    *run(b, I) { return PB.toDatetime(I.df(b).col(I.colName(b))); },
    ex: (b, X) => T(X, `คอลัมน์ ${X.f(b, 'COL')} ที่แปลงเป็นวันที่`, `column ${X.f(b, 'COL')} converted to dates`),
  });
  def('pb_rolling', {
    cat: 'data', out: true, py: '{DF}[{COL}].rolling({N}).{AGG}()', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, N: { t: 'num', def: 3, min: 1, prec: 1 }, AGG: { t: 'dd', opts: [['mean', 'mean'], ['sum', 'sum'], ['min', 'min'], ['max', 'max'], ['std', 'std']] } },
    tip: TR('ค่าเฉลี่ยเคลื่อนที่ (moving average) และสถิติแบบหน้าต่างเลื่อน'),
    gen: (b, G) => `${G.v(b, 'DF')}[${G.col(b, 'COL')}].rolling(${G.f(b, 'N')}).${G.f(b, 'AGG')}()`,
    *run(b, I) { return I.df(b).col(I.colName(b)).rolling(Number(b.getFieldValue('N')))[b.getFieldValue('AGG')](); },
    ex: (b, X) => T(X, `${AGG_TH[X.f(b, 'AGG')] || X.f(b, 'AGG')}เคลื่อนที่ ${X.f(b, 'N')} ช่วงของ ${X.f(b, 'COL')}`, `the ${X.f(b, 'N')}-period rolling ${X.f(b, 'AGG')} of ${X.f(b, 'COL')}`),
  });

  /* ---------- cleaning ---------- */
  const FILL = [['median()', 'median'], ['mean()', 'mean'], ['mode()[0]', 'mode'], ['0', 'zero'], [TR('"ไม่ทราบ"'), 'unknown']];
  const FILL_TH = { median: 'ค่ามัธยฐาน', mean: 'ค่าเฉลี่ย', mode: 'ค่าที่พบบ่อยที่สุด', zero: 'ศูนย์', unknown: 'คำว่า "ไม่ทราบ"' }; /* th-en */
  def('pb_fillna', {
    cat: 'data', th: TR('เติมค่าว่าง'), py: '{DF}[{COL}].fillna({HOW})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, HOW: { t: 'dd', opts: FILL } },
    tip: TR('แทนที่ค่าว่าง (NaN) ในคอลัมน์ แล้วเก็บกลับลงคอลัมน์เดิม'),
    gen: (b, G) => { const df = G.v(b, 'DF'), c = `${df}[${G.col(b, 'COL')}]`, h = G.f(b, 'HOW'); const fill = h === 'zero' ? '0' : h === 'unknown' ? TR('"ไม่ทราบ"') : `${c}.${FILL.find((x) => x[1] === h)[0]}`; return `${c} = ${c}.fillna(${fill})\n`; },
    *run(b, I) {
      const df = I.df(b), c = I.colName(b), s = df.col(c), h = b.getFieldValue('HOW');
      let v;
      if (h === 'zero') v = 0; else if (h === 'unknown') v = TR('ไม่ทราบ');
      else if (h === 'mode') v = s.mode().values[0];
      else v = s[h]();
      df.set(c, s.fillna(v));
    },
    ex: (b, X) => T(X, `เติมค่าว่างในคอลัมน์ ${X.f(b, 'COL')} ของ ${X.v(b, 'DF')} ด้วย${FILL_TH[X.f(b, 'HOW')]}`, `fill missing values in ${X.f(b, 'COL')} of ${X.v(b, 'DF')} with the ${X.f(b, 'HOW')}`),
  });
  const CLEAN = [['.dropna()', 'dropna'], ['.drop_duplicates()', 'dedup'], ['.reset_index(drop=True)', 'reset'], ['.copy()', 'copy']];
  const CLEAN_TH = { dropna: 'ที่ลบแถวที่มีค่าว่างออก', dedup: 'ที่ลบแถวซ้ำออก', reset: 'ที่เรียงเลข index ใหม่', copy: 'ฉบับสำเนา' }; /* th-en */
  def('pb_df_clean', {
    cat: 'data', out: true, th: TR('ทำความสะอาด'), py: '{DF}{FN}', f: { DF: { t: 'var', def: 'df' }, FN: { t: 'dd', opts: CLEAN } },
    tip: TR('dropna = ลบแถวที่มีค่าว่าง, drop_duplicates = ลบแถวซ้ำ'),
    gen: (b, G) => [G.v(b, 'DF') + CLEAN.find((x) => x[1] === G.f(b, 'FN'))[0], python.Order.MEMBER],
    *run(b, I) { const df = I.df(b), fn = b.getFieldValue('FN'); return fn === 'dropna' ? df.dropna() : fn === 'dedup' ? df.drop_duplicates() : fn === 'reset' ? df.reset_index(true) : df.copy(); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ${CLEAN_TH[X.f(b, 'FN')]}`, `${X.v(b, 'DF')} after ${X.f(b, 'FN')}`),
  });
  def('pb_dropna_cols', {
    cat: 'data', out: true, th: TR('ลบแถวที่ว่าง'), py: '{DF}.dropna(subset=[{COLS}])', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' } },
    tip: TR('ลบเฉพาะแถวที่คอลัมน์ที่เลือกเป็นค่าว่าง'),
    gen: (b, G) => `${G.v(b, 'DF')}.dropna(subset=${Py.list(G.cols(b, 'COLS'))})`,
    *run(b, I) { return I.df(b).dropna(I.colList(b)); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่ลบแถวซึ่งคอลัมน์ ${X.f(b, 'COLS')} ว่าง`, `${X.v(b, 'DF')} without rows missing ${X.f(b, 'COLS')}`),
  });
  def('pb_drop_cols', {
    cat: 'data', out: true, th: TR('ลบคอลัมน์'), py: '{DF}.drop(columns=[{COLS}])', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' } },
    tip: TR('ตารางเดิมที่ตัดคอลัมน์ที่เลือกออก (เช่น แยกฟีเจอร์ X ออกจากเป้าหมาย)'),
    gen: (b, G) => `${G.v(b, 'DF')}.drop(columns=${Py.list(G.cols(b, 'COLS'))})`,
    *run(b, I) { return I.df(b).drop(I.colList(b)); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่ตัดคอลัมน์ ${X.f(b, 'COLS')} ออก`, `${X.v(b, 'DF')} without the columns ${X.f(b, 'COLS')}`),
  });
  def('pb_get_dummies', {
    cat: 'data', out: true, th: TR('แปลงหมวดหมู่เป็น 0/1'), py: 'pd.get_dummies({DF}, columns=[{COLS}], drop_first={DROP})', f: { DF: { t: 'var', def: 'df' }, COLS: { t: 'cols' }, DROP: { t: 'dd', opts: [['True', 'True'], ['False', 'False']] } },
    tip: TR('One-hot encoding: สร้างคอลัมน์ใหม่ต่อหนึ่งหมวดหมู่ ให้โมเดลอ่านข้อความเป็นตัวเลขได้'),
    gen: (b, G) => { Py.need(PD); return `pd.get_dummies(${G.v(b, 'DF')}, columns=${Py.list(G.cols(b, 'COLS'))}, drop_first=${G.f(b, 'DROP')})`; },
    *run(b, I) { return PB.getDummies(I.df(b), I.colList(b), b.getFieldValue('DROP') === 'True'); },
    ex: (b, X) => T(X, `${X.v(b, 'DF')} ที่แปลงคอลัมน์หมวดหมู่ ${X.f(b, 'COLS')} เป็นคอลัมน์ 0/1 (one-hot)${X.f(b, 'DROP') === 'True' ? ' โดยตัดหมวดแรกออกเพื่อลดความซ้ำซ้อน' : ''}`, `${X.v(b, 'DF')} with ${X.f(b, 'COLS')} one-hot encoded`),
  });
  def('pb_label_encode', {
    cat: 'data', th: TR('แปลงข้อความเป็นรหัส'), py: '{DF}[{COL}] = LabelEncoder().fit_transform(…)', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' } },
    tip: TR('แทนค่าข้อความด้วยรหัสตัวเลข 0, 1, 2, … เรียงตามตัวอักษร'),
    gen: (b, G) => { Py.need('sklearn.preprocessing', 'LabelEncoder'); const c = `${G.v(b, 'DF')}[${G.col(b, 'COL')}]`; return `${c} = LabelEncoder().fit_transform(${c})\n`; },
    *run(b, I) { const df = I.df(b), c = I.colName(b); const enc = new PB.LabelEncoder(); df.set(c, enc.fit_transform(df.col(c))); },
    ex: (b, X) => T(X, `แปลงค่าข้อความในคอลัมน์ ${X.f(b, 'COL')} เป็นรหัสตัวเลข (LabelEncoder)`, `encode the labels of ${X.f(b, 'COL')} as integers`),
  });
  def('pb_date_range', {
    cat: 'data', th: TR('สร้างคอลัมน์วันที่'), py: '{DF}[{NAME}] = pd.date_range({START}, periods=len(…), freq={FREQ})', f: { DF: { t: 'var', def: 'df' }, NAME: { t: 'text', def: 'date' }, START: { t: 'text', def: '1949-01-01' }, FREQ: { t: 'dd', opts: [[TR('"MS" รายเดือน'), 'MS'], [TR('"D" รายวัน'), 'D'], [TR('"W" รายสัปดาห์'), 'W'], [TR('"QS" รายไตรมาส'), 'QS'], [TR('"YS" รายปี'), 'YS']] } },
    tip: TR('สร้างลำดับวันที่ต่อเนื่องให้ทุกแถว (เหมาะกับข้อมูลอนุกรมเวลา)'),
    gen: (b, G) => { Py.need(PD); const df = G.v(b, 'DF'); return `${df}[${Py.str(G.f(b, 'NAME'))}] = pd.date_range(${Py.str(G.f(b, 'START'))}, periods=len(${df}), freq=${Py.str(G.f(b, 'FREQ'))})\n`; },
    *run(b, I) { const df = I.df(b); df.set(b.getFieldValue('NAME'), new PB.Series(PB.dateRange(b.getFieldValue('START'), df.nrows, b.getFieldValue('FREQ')), { dtype: 'datetime64[ns]' })); },
    ex: (b, X) => T(X, `สร้างคอลัมน์ ${X.f(b, 'NAME')} เป็นวันที่ต่อเนื่องเริ่ม ${X.f(b, 'START')}`, `add a ${X.f(b, 'NAME')} column of consecutive dates from ${X.f(b, 'START')}`),
  });
  def('pb_lags', {
    cat: 'data', th: TR('สร้างค่าย้อนหลัง (lag)'), py: '{DF}[{COL}].shift(i)  i = 1 … {N}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, N: { t: 'num', def: 12, min: 1, max: 60, prec: 1 } },
    tip: TR('สร้างคอลัมน์ lag_1 ถึง lag_n = ค่าของช่วงเวลาก่อนหน้า 1..n ช่วง ใช้เป็นฟีเจอร์พยากรณ์อนาคต'),
    gen: (b, G) => { const df = G.v(b, 'DF'), n = G.f(b, 'N'); return `for i in range(1, ${Number(n) + 1}):\n    ${df}[f"lag_{i}"] = ${df}[${G.col(b, 'COL')}].shift(i)\n`; },
    *run(b, I) { const df = I.df(b), s = df.col(I.colName(b)), n = Number(b.getFieldValue('N')); for (let i = 1; i <= n; i++) df.set('lag_' + i, s.shift(i)); },
    ex: (b, X) => T(X, `สร้างคอลัมน์ lag_1 ถึง lag_${X.f(b, 'N')} จาก ${X.f(b, 'COL')} (ค่าของ 1–${X.f(b, 'N')} ช่วงก่อนหน้า)`, `create lag_1…lag_${X.f(b, 'N')} from ${X.f(b, 'COL')}`),
  });
  def('pb_to_csv', {
    cat: 'data', th: TR('บันทึกเป็นไฟล์'), py: '{DF}.to_csv({NAME}, index=False)', f: { DF: { t: 'var', def: 'df' }, NAME: { t: 'text', def: 'result.csv' } },
    tip: TR('บันทึกตารางเป็นไฟล์ CSV (ในแอปจะแสดงปุ่มดาวน์โหลดในผลลัพธ์)'),
    gen: (b, G) => `${G.v(b, 'DF')}.to_csv(${Py.str(G.f(b, 'NAME'))}, index=False)\n`,
    *run(b, I) { const df = I.df(b); let n = b.getFieldValue('NAME') || 'result.csv'; if (!/\.csv$/i.test(n)) n += '.csv'; I.out.download(n, '﻿' + df.toCSV(), b, df.shape); },
    ex: (b, X) => T(X, `บันทึก ${X.v(b, 'DF')} เป็นไฟล์ ${X.f(b, 'NAME')}`, `save ${X.v(b, 'DF')} to ${X.f(b, 'NAME')}`),
  });
})();
