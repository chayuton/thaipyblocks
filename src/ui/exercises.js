/* ThaiPyBlocks: exercise mode — short tasks that learners solve by connecting blocks.
   Each exercise has a starter program (sometimes with loose "pieces" to connect), goals that are checked
   automatically after a run (variables, printed values, charts, blocks used), hints and a model solution. */
(function () {
  const U = PB.u, h = U.h, $ = U.$, A = PB.ui, R = PB.R;

  /* ---------------- block builders ---------------- */
  const V = (n) => ({ name: n }), df = V('df');
  const B = R.b, set = R.set, get = R.get, num = R.num, txt = R.text, pr = R.print, pr2 = R.print2;
  const note = (t) => B('pb_comment', { TEXT: t });
  const ds = (n) => B('pb_dataset', { NAME: n });
  const head = (n = 5) => pr(B('pb_df_view', { DF: df, FN: 'head', N: n }));
  const cols = (list, d = 'df') => B('pb_cols', { DF: V(d), COLS: list.join(', ') });
  const col = (c, d = 'df') => B('pb_col', { DF: V(d), COL: c });
  const dropCols = (c) => B('pb_drop_cols', { DF: df, COLS: c });
  const clean = (fn, d = 'df') => B('pb_df_clean', { DF: V(d), FN: fn });
  const split = (ts = 0.2, mode = 'stratify') => B('pb_split', { XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), TS: ts, RS: 42, MODE: mode });
  const fit = (m = 'model', x = 'X_train', y = 'y_train') => B('pb_fit', { M: V(m), X: V(x), Y: V(y) });
  const predict = (m = 'model', x = 'X_test') => set('y_pred', B('pb_predict', { M: V(m), FN: 'predict', X: V(x) }));
  const metric = (label, fn) => pr2(label, B('pb_metric', { FN: fn, YT: V('y_test'), YP: V('y_pred') }));
  const arith = (op, a, b) => B('math_arithmetic', { OP: op }, { A: a, B: b });
  const forLoop = (v, a, b, by, body) => { const o = B('controls_for', { VAR: V(v) }, { FROM: num(a), TO: num(b), BY: num(by) }); if (body && body.length) o.inputs.DO = { block: R.chain(body) }; return o; };
  const pipe = (a, b) => B('pb_pipeline', {}, { A: a, B: b });
  const scaler = () => B('pb_scaler', { CLS: 'StandardScaler' });
  const stat = (d, c, fn) => B('pb_series_stat', { DF: V(d), COL: c, FN: fn });

  /* ---------------- checking helpers ---------------- */
  const isDF = (x) => x instanceof PB.DataFrame, isS = (x) => x instanceof PB.Series, isArr = (x) => x instanceof PB.NDArray;
  const values = (x) => (isArr(x) ? x.tolist() : isS(x) ? x.values : Array.isArray(x) ? x.map(PB.unbox) : null);
  const near = (a, b, tol = 1e-6) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  const est = (x, cls) => x instanceof PB.Estimator && x.constructor.pyName === cls;
  const fitted = (x) => x instanceof PB.Estimator && !!x.fitted;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const missing = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  const sample = (() => { const cache = new Map(); return (n) => { if (!cache.has(n)) cache.set(n, PB.loadSample(n)); return cache.get(n); }; })();
  const CONNECTED = { text: TR('ต่อทุกบล็อกคำสั่งเป็นโปรแกรมเดียว ไม่มีบล็อกลอยอยู่'), test: (c) => c.chains() <= 1, hint: TR('ลากบล็อกที่ยังลอยอยู่มาต่อใต้โปรแกรมหลักให้เป็นสายเดียวกัน') };
  const hasField = (c, type, fields) => c.has(type, (b) => Object.entries(fields).every(([k, v]) => b.getFieldValue(k) === v));
  const num0 = (x) => PB.unbox(x);
  /* a block that is part of a program (its statement follows another block), not a loose piece run on its own */
  const linked = (c, type) => c.has(type, (b) => { let x = b; while (x.outputConnection && x.getParent()) x = x.getParent(); return !!(x.getPreviousBlock() || x.getSurroundParent()); });
  /* what the cleansing exercises expect, worked out from the sample data with the same engine functions */
  const ref = (() => { const cache = {}; return (k, f) => (k in cache ? cache[k] : (cache[k] = f())); })();
  const spendRef = () => ref('spend', () => { const s = PB.toNumeric(sample('coffee').col('monthly_spend'), true); return { median: num0(s.median()), nan: s.values.filter(missing).length }; });
  const ageRef = () => ref('age', () => {
    const s = sample('coffee').col('age'), o = PB.outliers(s, 'iqr', 1.5), m = s.maskWhere(o.mask), med = num0(m.median());
    return { median: med, outliers: o.mask.filter(Boolean).length, same: m.values.filter((v) => v === med).length + m.values.filter(missing).length };
  });

  /* ---------------- the exercises ---------------- */
  const EX = [];
  const add = (o) => EX.push(o);

  /* ===== level 1: Python and pandas basics ===== */
  add({
    id: 'vars', level: 1, title: TR('ตัวแปรและการคำนวณ'), topic: TR('ตัวแปร · เลขคณิต · print'), jigsaw: true,
    goal: TR('ร้านชานมขายแก้วละ 45 บาท วันนี้ขายได้ 38 แก้ว ให้คำนวณยอดขายรวมเก็บไว้ในตัวแปร `total` แล้วแสดงผลด้วย `print`'),
    start: () => ({ main: [note(TR('ร้านชานม: ราคาต่อแก้วและจำนวนที่ขายได้')), set('price', num(45)), set('cups', num(38))],
      pieces: [pr2(TR('ยอดขายรวม (บาท):'), get('total')), set('total', arith('MULTIPLY', get('price'))), get('cups')] }),
    solution: () => ({ main: [note(TR('ร้านชานม: ราคาต่อแก้วและจำนวนที่ขายได้')), set('price', num(45)), set('cups', num(38)), set('total', arith('MULTIPLY', get('price'), get('cups'))), pr2(TR('ยอดขายรวม (บาท):'), get('total'))] }),
    checks: [
      { text: TR('ตัวแปร `total` มีค่า 1710 (45 × 38)'), test: (c) => c.v('total') === 1710, hint: TR('ลากบล็อก `cups` ไปใส่ช่องว่างหลังเครื่องหมาย × ในบล็อก `total = …`') },
      { text: TR('แสดงยอดขายรวมด้วย `print`'), test: (c) => c.printedNum((x) => x === 1710), hint: TR('ต่อบล็อก print ไว้ใต้บล็อก `total = …`') },
      CONNECTED,
    ],
    hints: [TR('บล็อก × ต้องมีค่าครบทั้งสองช่อง คือ `price` และ `cups`'), TR('Python ทำงานจากบนลงล่าง จึงต้องสร้าง `total` ก่อนจะสั่ง print'), TR('ต่อบล็อกทั้งหมดไว้ใต้ `cups = 38` ให้เป็นสายเดียวกัน')],
    learn: TR('ตัวแปรเก็บค่าไว้ใช้ต่อ และลำดับของบล็อกจากบนลงล่างคือลำดับที่ Python ทำงาน'),
  });
  add({
    id: 'load', level: 1, title: TR('โหลดข้อมูลและสำรวจตาราง'), topic: 'pandas · head · shape', jigsaw: true,
    goal: TR('โหลดชุดข้อมูลดอกไอริส (`iris`) เก็บในตัวแปร `df` แล้วแสดง 5 แถวแรก และขนาดของตาราง (จำนวนแถว, จำนวนคอลัมน์)'),
    start: () => ({ main: [note(TR('โหลดข้อมูลแล้วสำรวจตาราง'))], pieces: [pr2(TR('ขนาดข้อมูล:'), B('pb_df_info', { DF: df, FN: 'shape' })), head(5), set('df', ds('titanic'))] }),
    solution: () => ({ main: [note(TR('โหลดข้อมูลแล้วสำรวจตาราง')), set('df', ds('iris')), head(5), pr2(TR('ขนาดข้อมูล:'), B('pb_df_info', { DF: df, FN: 'shape' }))] }),
    checks: [
      { text: TR('`df` เก็บข้อมูลดอกไอริส 150 แถว'), test: (c) => isDF(c.v('df')) && c.v('df').nrows === 150 && c.v('df').columns.includes('species'), hint: TR('บล็อก `df = …` ตอนนี้เลือก titanic อยู่ ให้คลิกเปลี่ยนเป็น iris') },
      { text: TR('แสดง 5 แถวแรกด้วย `df.head(5)`'), test: (c) => c.printedVal((x) => isDF(x) && x.nrows === 5 && x.columns.includes('species')), hint: TR('ต่อบล็อก print(df.head(5)) ใต้บล็อกโหลดข้อมูล') },
      { text: TR('แสดงขนาดตาราง (150, 5)'), test: (c) => c.printedText(/\(150, 5\)/), hint: TR('ต่อบล็อก print("ขนาดข้อมูล:", df.shape) ใต้บล็อกโหลดข้อมูล') },
      CONNECTED,
    ],
    hints: [TR('ต้องโหลดข้อมูลก่อนจึงจะดูข้อมูลได้ บล็อก `df = …` จึงต้องอยู่บนสุด'), TR('คลิกที่ชื่อชุดข้อมูลในบล็อก `df = …` เพื่อเลือก iris')],
    learn: TR('`df.head()` แสดงตัวอย่างข้อมูล ส่วน `df.shape` บอกขนาดตารางเป็น (แถว, คอลัมน์)'),
  });
  add({
    id: 'stats', level: 1, title: TR('ค่าเฉลี่ยและการนับ'), topic: 'mean · value_counts',
    goal: TR('ข้อมูลทิปร้านอาหาร (`tips`) โหลดไว้แล้ว ให้แสดงค่าเฉลี่ยของยอดบิล `total_bill` และนับว่าแต่ละวัน (`day`) มีกี่บิล'),
    start: () => ({ main: [note(TR('ข้อมูลทิปร้านอาหาร: 1 แถว = 1 บิล')), set('df', ds('tips')), head(5)] }),
    solution: () => ({ main: [note(TR('ข้อมูลทิปร้านอาหาร: 1 แถว = 1 บิล')), set('df', ds('tips')), head(5), pr2(TR('ยอดบิลเฉลี่ย:'), stat('df', 'total_bill', 'mean')), pr(stat('df', 'day', 'value_counts'))] }),
    checks: [
      { text: TR('แสดงค่าเฉลี่ยของ `total_bill` (ประมาณ 19.79)'), test: (c) => c.printedNum((x) => near(x, sample('tips').col('total_bill').mean())), hint: TR('ใช้บล็อก คำนวณ `df[…].mean()` จากหมวด ข้อมูล › โหลด & สำรวจ แล้วเสียบในบล็อก print') },
      { text: TR('แสดงจำนวนบิลของแต่ละวันด้วย `value_counts()`'), test: (c) => c.printedVal((x) => isS(x) && ['Sat', 'Sun', 'Thur', 'Fri'].every((d) => x.index.includes(d)) && x.values.reduce((s, v) => s + v, 0) === 244), hint: TR('ใช้บล็อกเดียวกัน เลือกคอลัมน์ day และฟังก์ชัน .value_counts()') },
    ],
    hints: [TR('บล็อก "คำนวณ" เป็นบล็อกค่า ต้องเสียบเข้าในบล็อก print( ) ก่อนจึงจะแสดงผล'), TR('คลิกช่องชื่อคอลัมน์ในบล็อกเพื่อเลือก total_bill'), TR('บล็อก print ทั้งสองต่อไว้ใต้ print(df.head(5)) ได้เลย')],
    learn: TR('`.mean()` หาค่าเฉลี่ย และ `.value_counts()` นับว่าแต่ละค่ามีกี่ครั้ง — สองคำสั่งที่ใช้บ่อยที่สุดตอนสำรวจข้อมูล'),
  });
  add({
    id: 'filter', level: 1, title: TR('กรองแถวตามเงื่อนไข'), topic: TR('กรองข้อมูล · len · mean'), jigsaw: true,
    goal: TR('หาผู้โดยสารไททานิกที่จ่ายค่าตั๋ว (`fare`) มากกว่า 100 เก็บในตัวแปร `rich` แล้วแสดงจำนวนคน และอัตราการรอดชีวิตของกลุ่มนี้ (ค่าเฉลี่ยของ `survived`)'),
    start: () => ({ main: [note(TR('ผู้โดยสารไททานิก: survived = 1 คือรอดชีวิต')), set('df', ds('titanic'))],
      pieces: [pr2(TR('อัตรารอดชีวิต:'), stat('rich', 'survived', 'mean')), set('rich', B('pb_filter', { DF: df, COL: 'age', OP: '>' }, { VAL: num(100) })), pr2(TR('จำนวนผู้โดยสาร:'), B('pb_len', {}, { X: get('rich') }))] }),
    solution: () => ({ main: [note(TR('ผู้โดยสารไททานิก: survived = 1 คือรอดชีวิต')), set('df', ds('titanic')), set('rich', B('pb_filter', { DF: df, COL: 'fare', OP: '>' }, { VAL: num(100) })), pr2(TR('จำนวนผู้โดยสาร:'), B('pb_len', {}, { X: get('rich') })), pr2(TR('อัตรารอดชีวิต:'), stat('rich', 'survived', 'mean'))] }),
    checks: [
      { text: TR('`rich` มีเฉพาะผู้โดยสารที่ `fare` มากกว่า 100 (53 คน)'), test: (c) => { const r = c.v('rich'); return isDF(r) && r.nrows === 53 && r.col('fare').values.every((v) => v > 100); }, hint: TR('ในบล็อกกรองแถว เปลี่ยนคอลัมน์จาก age เป็น fare') },
      { text: TR('แสดงจำนวนผู้โดยสารในกลุ่มนี้'), test: (c) => c.printedNum((x) => x === 53), hint: TR('ต่อบล็อก print("จำนวนผู้โดยสาร:", len(rich)) ใต้บล็อกที่สร้าง rich') },
      { text: TR('แสดงอัตราการรอดชีวิตของกลุ่มนี้'), test: (c) => { const t = sample('titanic'), f = t.col('fare').values, s = t.col('survived').values.filter((_, i) => f[i] > 100); return c.printedNum((x) => near(x, mean(s))); }, hint: TR('บล็อก rich["survived"].mean() ต้องอยู่หลังบล็อกที่สร้าง rich') },
      CONNECTED,
    ],
    hints: [TR('`survived` เป็น 0 หรือ 1 ค่าเฉลี่ยจึงเท่ากับสัดส่วนคนที่รอดชีวิต'), TR('สร้าง `rich` ก่อน แล้วจึง print ค่าที่คำนวณจาก `rich`')],
    learn: TR('`df[df["fare"] > 100]` เลือกเฉพาะแถวที่เงื่อนไขเป็นจริง และกลุ่มที่จ่ายค่าตั๋วแพงรอดชีวิตมากกว่าค่าเฉลี่ยทั้งลำ (ประมาณ 0.38) อย่างชัดเจน'),
  });
  add({
    id: 'groupby', level: 1, title: TR('สรุปตามกลุ่มและวาดกราฟ'), topic: 'groupby · barplot',
    goal: TR('จากข้อมูล `tips` ให้หาทิปเฉลี่ยของแต่ละวันด้วย `groupby` แล้ววาดกราฟแท่งเปรียบเทียบทิปของแต่ละวัน'),
    start: () => ({ main: [note(TR('ทิปเฉลี่ยของแต่ละวันต่างกันไหม')), set('df', ds('tips'))] }),
    solution: () => ({ main: [note(TR('ทิปเฉลี่ยของแต่ละวันต่างกันไหม')), set('df', ds('tips')), pr(B('pb_groupby', { DF: df, BY: 'day', COL: 'tip', AGG: 'mean' })), B('pb_plot_xy', { KIND: 'barplot', DF: df, X: 'day', Y: 'tip', HUE: '', TITLE: TR('ทิปเฉลี่ยของแต่ละวัน') })] }),
    checks: [
      { text: TR('แสดงทิปเฉลี่ยของแต่ละวัน `df.groupby("day")["tip"].mean()`'), test: (c) => {
        const t = sample('tips'), day = t.col('day').values, tip = t.col('tip').values;
        return c.printedVal((x) => isS(x) && x.length === 4 && x.index.every((d, i) => near(x.values[i], mean(tip.filter((_, j) => day[j] === d)))));
      }, hint: TR('หมวด ข้อมูล › เลือก & กรอง › จัดกลุ่มสรุป ตั้งค่า day, tip, mean แล้วเสียบในบล็อก print') },
      { text: TR('วาดกราฟแท่ง (barplot) โดย x = day และ y = tip'), test: (c) => hasField(c, 'pb_plot_xy', { KIND: 'barplot', X: 'day', Y: 'tip' }) && c.chart((e) => e.chart === 'bar'), hint: TR('หมวด กราฟ › กราฟ x–y เลือกชนิด barplot แล้วตั้ง x = day, y = tip') },
    ],
    hints: [TR('บล็อก "จัดกลุ่มสรุป" มี 3 ช่อง: จัดกลุ่มตาม (day) คอลัมน์ที่สรุป (tip) และวิธีสรุป (mean)'), TR('กราฟไม่ต้องใส่ใน print วางต่อในโปรแกรมได้เลย')],
    learn: TR('`groupby` แบ่งตารางเป็นกลุ่มแล้วสรุปแต่ละกลุ่ม ส่วน `sns.barplot` คำนวณค่าเฉลี่ยของแต่ละกลุ่มแล้ววาดให้ในคำสั่งเดียว'),
  });
  add({
    id: 'missing', level: 1, title: TR('จัดการค่าว่าง'), topic: 'isnull · fillna · median',
    goal: TR('คอลัมน์ `age` ของไททานิกมีค่าว่าง (NaN) 177 ค่า ให้เติมด้วยค่ามัธยฐาน (median) แล้วนับค่าว่างอีกครั้งเพื่อยืนยันว่าไม่เหลือแล้ว'),
    start: () => ({ main: [note(TR('นับค่าว่างของแต่ละคอลัมน์')), set('df', ds('titanic')), pr(B('pb_df_info', { DF: df, FN: 'isnull' }))] }),
    solution: () => ({ main: [note(TR('นับค่าว่างของแต่ละคอลัมน์')), set('df', ds('titanic')), pr(B('pb_df_info', { DF: df, FN: 'isnull' })), B('pb_fillna', { DF: df, COL: 'age', HOW: 'median' }), pr(B('pb_df_info', { DF: df, FN: 'isnull' }))] }),
    checks: [
      { text: TR('คอลัมน์ `age` ไม่มีค่าว่างแล้ว'), test: (c) => isDF(c.v('df')) && c.v('df').columns.includes('age') && !c.v('df').col('age').values.some(missing), hint: TR('หมวด ทำความสะอาด & ปรับสเกล › ค่าว่าง › เติมค่าว่าง แล้วเลือกคอลัมน์ age') },
      { text: TR('เติมด้วยค่ามัธยฐาน (28.0)'), test: (c) => isDF(c.v('df')) && c.v('df').col('age').values.filter((v) => v === 28).length === 25 + 177, hint: TR('ในบล็อกเติมค่าว่าง เลือกวิธี median()') },
      { text: TR('แสดงจำนวนค่าว่างหลังเติม (age = 0)'), test: (c) => c.printedVal((x) => isS(x) && x.index.includes('age') && x.values[x.index.indexOf('age')] === 0), hint: TR('วางบล็อก print(df.isnull().sum()) อีกบล็อกไว้ใต้บล็อกเติมค่าว่าง') },
    ],
    hints: [TR('บล็อกเติมค่าว่างเป็นบล็อกคำสั่ง ต่อใต้ print(df.isnull().sum()) ได้เลย'), TR('ค่ามัธยฐานคือค่ากลางเมื่อเรียงข้อมูลจากน้อยไปมาก')],
    learn: TR('ค่ามัธยฐานไม่ถูกดึงด้วยค่าสุดโต่งเหมือนค่าเฉลี่ย จึงนิยมใช้เติมค่าว่างของข้อมูลตัวเลข'),
  });
  add({
    id: 'clean_text', level: 1, title: TR('ข้อความไม่ตรงกันและแถวซ้ำ'), topic: 'str.strip · replace · drop_duplicates', jigsaw: true,
    goal: TR('ข้อมูลสมาชิกร้านกาแฟ (`coffee`) ยังไม่สะอาด จังหวัดเดียวกันถูกนับแยกกันเพราะมีช่องว่างเกิน (" กรุงเทพ") และชื่อย่อ ("กทม") อีกทั้งมีแถวที่บันทึกซ้ำ ให้ตัดช่องว่างในคอลัมน์ `province` เปลี่ยน "กทม" เป็น "กรุงเทพ" ลบแถวซ้ำ แล้วนับจำนวนสมาชิกของแต่ละจังหวัดอีกครั้ง'),
    start: () => ({ main: [note(TR('ข้อมูลสมาชิกร้านกาแฟ: นับสมาชิกของแต่ละจังหวัด')), set('df', ds('coffee')), pr(stat('df', 'province', 'value_counts')), pr2(TR('จำนวนแถวซ้ำ:'), B('pb_df_info', { DF: df, FN: 'dups' }))],
      pieces: [pr(stat('df', 'province', 'value_counts')), set('df', B('pb_drop_dups', { DF: df, COLS: '', KEEP: 'first' })), B('pb_replace_val', { DF: df, COL: 'province' }, { OLD: txt('กทม'), NEW: txt('กรุงเทพ') }), B('pb_clean_text', { DF: df, COL: 'province', FN: 'strip' })] }), /* th-data */
    solution: () => ({ main: [note(TR('ข้อมูลสมาชิกร้านกาแฟ: นับสมาชิกของแต่ละจังหวัด')), set('df', ds('coffee')), pr(stat('df', 'province', 'value_counts')), pr2(TR('จำนวนแถวซ้ำ:'), B('pb_df_info', { DF: df, FN: 'dups' })),
      B('pb_clean_text', { DF: df, COL: 'province', FN: 'strip' }), B('pb_replace_val', { DF: df, COL: 'province' }, { OLD: txt('กทม'), NEW: txt('กรุงเทพ') }), set('df', B('pb_drop_dups', { DF: df, COLS: '', KEEP: 'first' })), pr(stat('df', 'province', 'value_counts'))] }), /* th-data */
    checks: [
      { text: TR('ชื่อจังหวัดไม่มีช่องว่างเกินที่หัว-ท้าย'), test: (c) => linked(c, 'pb_clean_text') && isDF(c.v('df')) && c.v('df').col('province').values.every((v) => typeof v !== 'string' || v === PB.pyStrip(v)), hint: TR('บล็อก ทำความสะอาดข้อความ df["province"].str.strip() (หมวด ทำความสะอาด & ปรับสเกล › แถวซ้ำ & ข้อความ)') },
      { text: TR('ไม่มี "กทม" เหลืออยู่ (รวมเป็น "กรุงเทพ")'), test: (c) => linked(c, 'pb_replace_val') && isDF(c.v('df')) && !c.v('df').col('province').values.includes('กทม') && c.v('df').col('province').values.includes('กรุงเทพ'), hint: TR('บล็อก แทนค่า df["province"].replace("กทม", "กรุงเทพ")') }, /* th-data */
      { text: TR('ลบแถวซ้ำแล้ว เหลือ 80 แถว'), test: (c) => linked(c, 'pb_drop_dups') && isDF(c.v('df')) && c.v('df').nrows === 80 && c.v('df').duplicatedCount() === 0, hint: TR('บล็อก df = df.drop_duplicates(…) คืนตารางใหม่ จึงต้องเก็บกลับในตัวแปร df') },
      { text: TR('แสดงจำนวนสมาชิกของแต่ละจังหวัดหลังทำความสะอาด (กรุงเทพ 33 คน)'), test: (c) => c.printedVal((x) => isS(x) && x.index.includes('กรุงเทพ') && !x.index.includes('กทม') && x.index.every((k) => typeof k !== 'string' || k === PB.pyStrip(k)) && x.values[x.index.indexOf('กรุงเทพ')] === 33), hint: TR('บล็อก print(df["province"].value_counts()) ต้องอยู่ใต้บล็อกทำความสะอาดทั้งหมด') }, /* th-data */
      CONNECTED,
    ],
    hints: [TR('pandas มองว่า " กรุงเทพ" กับ "กรุงเทพ" เป็นคนละค่า เพราะต่างกันที่ช่องว่าง'), TR('ทำความสะอาดให้เสร็จก่อน แล้วจึงสั่งนับ value_counts ครั้งที่สอง'), TR('แถวซ้ำคือแถวที่ทุกช่องเหมือนกัน รวมถึงรหัสสมาชิก เกิดจากการบันทึกซ้ำ')],
    learn: TR('ข้อความที่ต่างกันแค่ช่องว่างหรือวิธีเขียนจะถูกนับแยกกลุ่ม และแถวซ้ำทำให้นับเกินจริง จึงต้องแก้ก่อนสรุปผลหรือสร้างโมเดล'),
  });
  add({
    id: 'to_numeric', level: 1, title: TR('ตัวเลขที่เก็บเป็นข้อความ'), topic: 'dtypes · pd.to_numeric · fillna',
    goal: TR('คอลัมน์ `monthly_spend` (ยอดใช้จ่ายต่อเดือน) เก็บเป็นข้อความ เช่น "฿1,450" หรือ "2,380 บาท" จึงคำนวณไม่ได้ ให้แปลงเป็นตัวเลขด้วย `pd.to_numeric` แบบตัด , ฿ บาท ออกก่อน เติมค่าที่แปลงไม่ได้ (NaN) ด้วยค่ามัธยฐาน แล้วแสดงค่าเฉลี่ยของ `monthly_spend`'),
    start: () => ({ main: [note(TR('ยอดใช้จ่ายต่อเดือนของสมาชิก: ดูชนิดข้อมูลก่อน')), set('df', ds('coffee')), pr(B('pb_df_info', { DF: df, FN: 'dtypes' })), set('spend', cols(['member_id', 'monthly_spend'])), pr(B('pb_df_view', { DF: V('spend'), FN: 'head', N: 8 }))] }),
    solution: () => ({ main: [note(TR('ยอดใช้จ่ายต่อเดือนของสมาชิก: ดูชนิดข้อมูลก่อน')), set('df', ds('coffee')), pr(B('pb_df_info', { DF: df, FN: 'dtypes' })), set('spend', cols(['member_id', 'monthly_spend'])), pr(B('pb_df_view', { DF: V('spend'), FN: 'head', N: 8 })),
      B('pb_to_numeric', { DF: df, COL: 'monthly_spend', MODE: 'strip' }), B('pb_fillna', { DF: df, COL: 'monthly_spend', HOW: 'median' }), pr2(TR('ยอดใช้จ่ายเฉลี่ย (บาท):'), stat('df', 'monthly_spend', 'mean'))] }),
    checks: [
      { text: TR('`monthly_spend` เป็นตัวเลข (float64)'), test: (c) => isDF(c.v('df')) && c.v('df').dtypeOf('monthly_spend') === 'float64', hint: TR('บล็อก แปลงเป็นตัวเลข (หมวด ทำความสะอาด & ปรับสเกล › แถวซ้ำ & ข้อความ) เลือก monthly_spend และแบบ "ตัด , ฿ บาท ออกก่อน"') },
      { text: TR('ไม่มีค่าว่างใน `monthly_spend` และเติมด้วยค่ามัธยฐาน'), test: (c) => { const d = c.v('df'); if (!isDF(d) || d.dtypeOf('monthly_spend') !== 'float64') return false; const v = d.col('monthly_spend').values, r = spendRef(); return !v.some(missing) && v.filter((x) => x === r.median).length >= r.nan; }, hint: TR('แปลงแล้วค่าที่อ่านไม่ได้ เช่น "-" จะเป็น NaN ให้ต่อบล็อกเติมค่าว่าง monthly_spend ด้วย median()') },
      { text: TR('แสดงค่าเฉลี่ยของ `monthly_spend` หลังเติมค่าว่าง'), test: (c) => { const d = c.v('df'); return isDF(d) && d.dtypeOf('monthly_spend') === 'float64' && c.printedNum((x) => near(x, num0(d.col('monthly_spend').mean()))); }, hint: TR('print("ยอดใช้จ่ายเฉลี่ย (บาท):", df["monthly_spend"].mean()) ไว้ท้ายสุด') },
    ],
    hints: [TR('ดูผลของ print(df.dtypes): คอลัมน์ที่เป็น object คือข้อความ'), TR('errors="coerce" เปลี่ยนค่าที่แปลงไม่ได้เป็น NaN แทนที่จะหยุดทำงาน'), TR('ลำดับคือ แปลงเป็นตัวเลข → เติมค่าว่าง → คำนวณค่าเฉลี่ย')],
    learn: TR('ตัวเลขที่มีเครื่องหมาย , ฿ หรือหน่วยติดมาจะถูกอ่านเป็นข้อความ ต้องแปลงด้วย pd.to_numeric ก่อนจึงคำนวณได้'),
  });
  add({
    id: 'loop', level: 1, title: TR('ลูปและลิสต์'), topic: 'for · append · sum', jigsaw: true,
    goal: TR('ใช้ลูป `for` คำนวณกำลังสองของ 1 ถึง 10 เก็บในลิสต์ `squares` แล้วแสดงลิสต์และผลรวมของลิสต์'),
    start: () => ({ main: [note(TR('สร้างลิสต์ว่างไว้เก็บผล')), set('squares', B('lists_create_empty'))],
      pieces: [pr2(TR('ผลรวม:'), B('math_on_list', { OP: 'SUM' }, { LIST: get('squares') })), forLoop('i', 1, 10, 1), B('pb_append', { L: V('squares') }, { X: arith('POWER', get('i'), num(2)) }), pr(get('squares'))] }),
    solution: () => ({ main: [note(TR('สร้างลิสต์ว่างไว้เก็บผล')), set('squares', B('lists_create_empty')), forLoop('i', 1, 10, 1, [B('pb_append', { L: V('squares') }, { X: arith('POWER', get('i'), num(2)) })]), pr(get('squares')), pr2(TR('ผลรวม:'), B('math_on_list', { OP: 'SUM' }, { LIST: get('squares') }))] }),
    checks: [
      { text: '`squares` = [1, 4, 9, …, 100]', test: (c) => { const s = values(c.vars.get('squares')); return Array.isArray(s) && s.length === 10 && s.every((v, i) => v === (i + 1) * (i + 1)); }, hint: TR('บล็อก squares.append(i ** 2) ต้องอยู่ "ข้างใน" ลูป') },
      { text: TR('ใช้ลูป `for` ที่ต่ออยู่ในโปรแกรม'), test: (c) => c.has('controls_for', (b) => !!(b.getPreviousBlock() || b.getSurroundParent())), hint: TR('ลากบล็อกลูปที่วางไว้มาต่อใต้ `squares = []`') },
      { text: TR('แสดงผลรวม 385'), test: (c) => c.printedNum((x) => x === 385), hint: TR('บล็อก print ผลรวมต้องอยู่ใต้ลูป ไม่ใช่ในลูป') },
      CONNECTED,
    ],
    hints: [TR('ช่อง "ทำ" ของลูปคือคำสั่งที่ทำซ้ำทุกรอบ'), TR('ลูปนับ i = 1, 2, …, 10 และ `i ** 2` คือ i ยกกำลังสอง'), TR('ถ้าวาง print ในลูป จะพิมพ์ออกมา 10 ครั้ง')],
    learn: TR('ลูป `for` ทำคำสั่งข้างในซ้ำทีละค่า และ `.append()` เพิ่มข้อมูลต่อท้ายลิสต์ทีละตัว'),
  });

  /* ===== level 2: machine learning workflow ===== */
  const irisXY = () => [set('df', ds('iris')), set('X', dropCols('species')), set('y', col('species'))];
  add({
    id: 'first_model', level: 2, title: TR('โมเดลแรก: จำแนกพันธุ์ไอริส'), topic: 'split · fit · predict · accuracy', jigsaw: true,
    goal: TR('เตรียม X, y ไว้แล้ว ให้ต่อขั้นตอน Machine Learning: แบ่งข้อมูลฝึก/ทดสอบ (20%) → สร้าง `KNeighborsClassifier` → ฝึก → ทำนายชุดทดสอบ → วัด accuracy'),
    start: () => ({ main: [note(TR('เตรียมข้อมูล: X = ขนาดกลีบ, y = สายพันธุ์')), ...irisXY(), note(TR('ต่อ: แบ่งข้อมูล → สร้างโมเดล → ฝึก → ทำนาย → วัดผล'))],
      pieces: [metric('Accuracy:', 'accuracy_score'), set('model', R.model('KNeighborsClassifier')), split(), predict(), fit()] }),
    solution: () => ({ main: [note(TR('เตรียมข้อมูล: X = ขนาดกลีบ, y = สายพันธุ์')), ...irisXY(), note(TR('ต่อ: แบ่งข้อมูล → สร้างโมเดล → ฝึก → ทำนาย → วัดผล')), split(), set('model', R.model('KNeighborsClassifier')), fit(), predict(), metric('Accuracy:', 'accuracy_score')] }),
    checks: [
      { text: TR('แบ่งข้อมูลแล้ว: ชุดทดสอบ `X_test` มี 30 แถว'), test: (c) => isDF(c.v('X_test')) && c.v('X_test').nrows === 30, hint: TR('บล็อกแบ่งข้อมูลต้องอยู่ก่อนบล็อกอื่นของโมเดล') },
      { text: TR('`model` เป็น KNeighborsClassifier ที่ฝึกแล้ว'), test: (c) => est(c.v('model'), 'KNeighborsClassifier') && fitted(c.v('model')), hint: TR('ต้องมีบล็อก model.fit(X_train, y_train) หลังบล็อกสร้างโมเดล') },
      { text: TR('`y_pred` มีคำทำนายครบ 30 ค่า'), test: (c) => { const p = values(c.v('y_pred')); return !!p && p.length === 30; }, hint: TR('บล็อก y_pred = model.predict(X_test) ต้องอยู่หลัง fit') },
      { text: TR('แสดง accuracy ของชุดทดสอบ (อย่างน้อย 0.9)'), test: (c) => hasField(c, 'pb_metric', { FN: 'accuracy_score' }) && c.printedNum((x) => x >= 0.9 && x <= 1), hint: TR('บล็อก print("Accuracy:", …) อยู่ท้ายสุด') },
      CONNECTED,
    ],
    hints: [TR('ลำดับที่ถูกคือ แบ่งข้อมูล → สร้างโมเดล → fit → predict → accuracy'), TR('ถ้า predict ก่อน fit จะเกิด NotFittedError เพราะโมเดลยังไม่ได้เรียน')],
    learn: TR('ทุกโมเดลใน scikit-learn ใช้ขั้นตอนเดียวกัน: สร้าง → `fit(X_train, y_train)` → `predict(X_test)` แล้ววัดผลเทียบกับคำตอบจริง `y_test`'),
  });
  add({
    id: 'regression', level: 2, title: TR('พยากรณ์อัตราสิ้นเปลืองน้ำมัน'), topic: 'LinearRegression · R²',
    goal: TR('ข้อมูลรถยนต์ (`mpg`) ลบแถวว่างและกำหนด y แล้ว ให้ใช้คอลัมน์ `horsepower` และ `weight` เป็น X ทาย `mpg` ด้วย `LinearRegression` แล้ววัด R² กับชุดทดสอบ'),
    start: () => ({ main: [note(TR('ทายอัตราสิ้นเปลือง (ไมล์ต่อแกลลอน) จากแรงม้าและน้ำหนักรถ')), set('df', ds('mpg')), set('df', clean('dropna')), set('y', col('mpg')), note(TR('ต่อ: X → แบ่งข้อมูล → LinearRegression → ฝึก → ทำนาย → R²'))] }),
    solution: () => ({ main: [note(TR('ทายอัตราสิ้นเปลือง (ไมล์ต่อแกลลอน) จากแรงม้าและน้ำหนักรถ')), set('df', ds('mpg')), set('df', clean('dropna')), set('y', col('mpg')), note(TR('ต่อ: X → แบ่งข้อมูล → LinearRegression → ฝึก → ทำนาย → R²')),
      set('X', cols(['horsepower', 'weight'])), split(0.2, 'shuffle'), set('model', R.model('LinearRegression')), fit(), predict(), metric('R²:', 'r2_score')] }),
    checks: [
      { text: TR('`X` มีคอลัมน์ horsepower และ weight'), test: (c) => { const X = c.v('X'); return isDF(X) && X.ncols === 2 && X.columns.includes('horsepower') && X.columns.includes('weight'); }, hint: TR('หมวด ข้อมูล › เลือก & กรอง › บล็อก df[[…]] พิมพ์ horsepower, weight แล้วเก็บในตัวแปร X') },
      { text: TR('แบ่งข้อมูลฝึก/ทดสอบแล้ว'), test: (c) => isDF(c.v('X_train')) && isDF(c.v('X_test')) && c.v('X_test').nrows > 0, hint: TR('หมวด เตรียมข้อมูล › แบ่งข้อมูลฝึก / ทดสอบ (งานทายตัวเลขให้เลือก shuffle=True)') },
      { text: TR('`model` เป็น LinearRegression ที่ฝึกแล้ว'), test: (c) => est(c.v('model'), 'LinearRegression') && fitted(c.v('model')), hint: TR('หมวด โมเดล › พยากรณ์ค่า › การถดถอยเชิงเส้น แล้วต่อด้วย model.fit(X_train, y_train)') },
      { text: TR('แสดง R² ของชุดทดสอบ (มากกว่า 0.6)'), test: (c) => hasField(c, 'pb_metric', { FN: 'r2_score' }) && c.printedNum((x) => x > 0.6 && x <= 1), hint: TR('หมวด วัดผล › print("R²:", r2_score(y_test, y_pred))') },
    ],
    hints: [TR('stratify=y ใช้ได้กับงานจำแนกประเภทเท่านั้น งานทายตัวเลขให้เลือก shuffle=True'), TR('R² = 1 คือทายได้สมบูรณ์ ส่วน R² = 0 คือไม่ดีไปกว่าการทายค่าเฉลี่ยทุกครั้ง')],
    learn: TR('LinearRegression หาสมการเส้นตรงจากฟีเจอร์ และ R² บอกว่าโมเดลอธิบายความแปรปรวนของคำตอบได้กี่ส่วน'),
  });
  add({
    id: 'tune_k', level: 2, title: TR('หาค่า k ที่ดีด้วยลูป'), topic: TR('for · KNN · score · กราฟ'), jigsaw: true,
    goal: TR('ลองโมเดล KNN ด้วย n_neighbors = 1, 3, 5, …, 15 (ลูป `for` เพิ่มทีละ 2) เก็บคะแนนชุดทดสอบของแต่ละค่าไว้ในลิสต์ `scores` แล้ววาดกราฟของ `scores`'),
    start: () => ({ main: [note(TR('เตรียมข้อมูลและแบ่งชุดฝึก/ทดสอบไว้แล้ว')), ...irisXY(), split(), set('scores', B('lists_create_empty'))],
      pieces: [B('pb_plot_list', { KIND: 'plot', TITLE: TR('คะแนนชุดทดสอบของ k = 1, 3, …, 15') }, { DATA: get('scores') }), forLoop('k', 1, 15, 2), B('pb_append', { L: V('scores') }, { X: B('pb_score', { M: V('model'), X: V('X_test'), Y: V('y_test') }) }), set('model', R.model('KNeighborsClassifier')), get('k'), fit()] }),
    solution: () => ({ main: [note(TR('เตรียมข้อมูลและแบ่งชุดฝึก/ทดสอบไว้แล้ว')), ...irisXY(), split(), set('scores', B('lists_create_empty')),
      forLoop('k', 1, 15, 2, [set('model', R.model('KNeighborsClassifier', { n_neighbors: get('k') })), fit(), B('pb_append', { L: V('scores') }, { X: B('pb_score', { M: V('model'), X: V('X_test'), Y: V('y_test') }) })]),
      B('pb_plot_list', { KIND: 'plot', TITLE: TR('คะแนนชุดทดสอบของ k = 1, 3, …, 15') }, { DATA: get('scores') })] }),
    checks: [
      { text: TR('`scores` มีคะแนน 8 ค่า (k = 1, 3, …, 15)'), test: (c) => { const s = values(c.vars.get('scores')); return Array.isArray(s) && s.length === 8 && s.every((v) => typeof v === 'number' && v >= 0 && v <= 1); }, hint: TR('บล็อกสร้างโมเดล ฝึก และ append ต้องอยู่ข้างในลูปทั้งสามบล็อก') },
      { text: TR('ใช้ค่า k ของแต่ละรอบเป็น n_neighbors'), test: (c) => est(c.v('model'), 'KNeighborsClassifier') && c.v('model').params.n_neighbors === 15, hint: TR('ลากบล็อกตัวแปร k ไปวางทับเลข 5 ในช่อง n_neighbors') },
      { text: TR('วาดกราฟของ `scores` หลังลูปจบ'), test: (c) => c.chart((e) => e.block === 'pb_plot_list') && (values(c.vars.get('scores')) || []).length === 8, hint: TR('วางบล็อกกราฟไว้ใต้ลูป (ไม่ใช่ในลูป)') },
      CONNECTED,
    ],
    hints: [TR('ช่อง "ทำ" ของลูปต้องมี 3 บล็อกเรียงกัน: model = … → model.fit(…) → scores.append(…)'), TR('k ที่ดีควรได้คะแนนสูงและอยู่ในช่วงที่คะแนนไม่แกว่งมาก')],
    learn: TR('การลองพารามิเตอร์หลายค่าด้วยลูปคือการปรับจูนโมเดลแบบพื้นฐาน (ระดับ 3 จะใช้ GridSearchCV ทำแทนในคำสั่งเดียว)'),
  });
  const titanicPrep = () => [set('df', ds('titanic')), set('df', cols(['survived', 'pclass', 'sex', 'age', 'fare'])), set('df', clean('dropna')),
    set('df', B('pb_get_dummies', { DF: df, COLS: 'sex', DROP: 'True' })), set('X', dropCols('survived')), set('y', col('survived')), split(),
    set('model', R.model('DecisionTreeClassifier', { max_depth: 4 })), fit()];
  add({
    id: 'evaluate', level: 2, title: TR('อ่านผลด้วย Confusion Matrix'), topic: 'classification_report · confusion matrix',
    goal: TR('โมเดลต้นไม้ตัดสินใจทายการรอดชีวิตบนไททานิกฝึกไว้แล้ว ให้ทำนายชุดทดสอบ แสดงรายงานผล `classification_report` และวาด confusion matrix เพื่อดูว่าโมเดลทายผิดแบบไหนบ่อยที่สุด'),
    start: () => ({ main: [note(TR('เตรียมข้อมูลและฝึกโมเดลไว้แล้ว')), ...titanicPrep(), note(TR('ต่อ: ทำนาย → รายงานผล → confusion matrix'))] }),
    solution: () => ({ main: [note(TR('เตรียมข้อมูลและฝึกโมเดลไว้แล้ว')), ...titanicPrep(), note(TR('ต่อ: ทำนาย → รายงานผล → confusion matrix')), predict(), pr(B('pb_report', { YT: V('y_test'), YP: V('y_pred') })), B('pb_plot_cm', { YT: V('y_test'), YP: V('y_pred') })] }),
    checks: [
      { text: TR('`y_pred` มีคำทำนายครบทุกแถวของชุดทดสอบ'), test: (c) => { const p = values(c.v('y_pred')); return !!p && isDF(c.v('X_test')) && p.length === c.v('X_test').nrows; }, hint: TR('หมวด ฝึก & ทำนาย › y_pred = model.predict(X_test)') },
      { text: TR('แสดง `classification_report`'), test: (c) => c.printedText(/precision[\s\S]*recall/), hint: TR('หมวด วัดผล › print(classification_report(y_test, y_pred))') },
      { text: TR('วาด confusion matrix'), test: (c) => c.chart((e) => e.block === 'pb_plot_cm'), hint: TR('หมวด กราฟ › ตารางความสับสน') },
    ],
    hints: [TR('recall ของคลาส 1 คือสัดส่วนคนที่รอดจริงซึ่งโมเดลทายถูกว่ารอด'), TR('ใน confusion matrix แถวคือคำตอบจริง คอลัมน์คือคำทำนาย')],
    learn: TR('accuracy บอกภาพรวม แต่ precision, recall และ confusion matrix บอกว่าโมเดลพลาดกับคลาสไหน เช่น ทายว่าไม่รอดทั้งที่รอดจริง'),
  });
  const penguinPrep = () => [set('df', ds('penguins')), set('df', cols(['species', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm', 'body_mass_g'])), set('df', clean('dropna')),
    set('X', dropCols('species')), set('y', col('species')), split()];
  add({
    id: 'outliers', level: 2, title: TR('ค่าผิดปกติด้วยกฎ IQR'), topic: 'IQR · find_outliers · fillna',
    goal: TR('อายุสมาชิกบางค่าพิมพ์ผิด (เช่น 250, 999) ให้แสดงแถวที่อายุอยู่นอกขอบเขต Q1 − 1.5×IQR ถึง Q3 + 1.5×IQR เปลี่ยนค่าเหล่านั้นเป็นค่าว่าง (NaN) เติมค่าว่างทั้งหมดของ `age` ด้วยค่ามัธยฐาน แล้วแสดงอายุสูงสุดหลังแก้'),
    start: () => ({ main: [note(TR('อายุของสมาชิกร้านกาแฟ')), set('df', ds('coffee')), pr(stat('df', 'age', 'describe')), B('pb_plot_box_cols', { DF: df, COLS: 'age', TITLE: TR('อายุก่อนแก้: จุดคือค่าผิดปกติ') })] }),
    solution: () => ({ main: [note(TR('อายุของสมาชิกร้านกาแฟ')), set('df', ds('coffee')), pr(stat('df', 'age', 'describe')), B('pb_plot_box_cols', { DF: df, COLS: 'age', TITLE: TR('อายุก่อนแก้: จุดคือค่าผิดปกติ') }),
      pr(B('pb_outlier_rows', { DF: df, COL: 'age', M: 'iqr', K: 1.5 })), B('pb_outlier_fix', { DF: df, COL: 'age', ACT: 'nan', M: 'iqr', K: 1.5 }), B('pb_fillna', { DF: df, COL: 'age', HOW: 'median' }), pr2(TR('อายุสูงสุดหลังแก้:'), stat('df', 'age', 'max'))] }),
    checks: [
      { text: TR('แสดงแถวที่อายุผิดปกติ (3 แถว)'), test: (c) => c.printedVal((x) => isDF(x) && x.nrows === ageRef().outliers && x.columns.includes('age') && x.col('age').values.every((v) => v > 100)), hint: TR('บล็อก หาค่าผิดปกติ (หมวด ทำความสะอาด & ปรับสเกล › ค่าผิดปกติ) ใส่ใน print เลือกคอลัมน์ age') },
      { text: TR('ไม่มีอายุเกิน 100 ปี และไม่มีค่าว่างใน `age`'), test: (c) => { const d = c.v('df'); return isDF(d) && d.col('age').values.every((v) => !missing(v) && v <= 100); }, hint: TR('บล็อก จัดการค่าผิดปกติ เลือก "ทำเป็นค่าว่าง" แล้วต่อบล็อกเติมค่าว่าง age ด้วย median()') },
      { text: TR('ค่าที่ผิดและค่าว่างถูกเติมด้วยค่ามัธยฐาน (ไม่ลบแถวทิ้ง)'), test: (c) => { const d = c.v('df'), r = ageRef(); return isDF(d) && d.nrows === 85 && d.col('age').values.filter((v) => v === r.median).length === r.same; }, hint: TR('เปลี่ยนเป็นค่าว่างก่อน แล้วจึงเติม median() ค่ามัธยฐานจะไม่ถูกดึงด้วยอายุที่พิมพ์ผิด') },
      { text: TR('แสดงอายุสูงสุดหลังแก้'), test: (c) => { const d = c.v('df'); return isDF(d) && c.printedNum((x) => x <= 100 && near(x, num0(d.col('age').max()))); }, hint: TR('print("อายุสูงสุดหลังแก้:", df["age"].max()) ไว้ท้ายสุด') },
    ],
    hints: [TR('IQR = Q3 − Q1 คือช่วงของข้อมูลครึ่งกลาง ค่าที่ห่างออกไปเกิน 1.5 เท่าของ IQR ถือว่าผิดปกติ'), TR('ดูแถวก่อนตัดสินใจ: อายุ 250 ปีเป็นการพิมพ์ผิดแน่นอน จึงควรทำเป็นค่าว่างแล้วเติมใหม่'), TR('ถ้าเป็นค่าจริงที่สุดโต่ง (เช่น บิลก้อนใหญ่) ให้ "ตัดขอบ" หรือเก็บไว้แทน')],
    learn: TR('ค่าผิดปกติดึงค่าเฉลี่ยและสเกลของข้อมูลให้เพี้ยน กฎ IQR ช่วยหาค่าเหล่านั้น แล้วเลือกวิธีจัดการตามสาเหตุ'),
  });
  add({
    id: 'normalize', level: 2, title: TR('ปรับสเกลให้อยู่ช่วง 0–1'), topic: 'MinMaxScaler · describe · boxplot',
    goal: TR('ยอดบิล (`total_bill`) อยู่หลักสิบ ทิป (`tip`) อยู่หลักหน่วย และจำนวนคน (`size`) เป็นเลข 1–6 จึงเทียบกันตรง ๆ ไม่ได้ ให้ปรับสเกลทั้ง 3 คอลัมน์ด้วย `MinMaxScaler` ให้อยู่ในช่วง 0–1 แล้วแสดง `df.describe()` และวาดกราฟกล่องหลังปรับสเกลเทียบกับก่อนปรับ'),
    start: () => ({ main: [note(TR('ข้อมูลทิปร้านอาหาร: เทียบช่วงของค่าแต่ละคอลัมน์')), set('df', ds('tips')), B('pb_plot_box_cols', { DF: df, COLS: 'total_bill, tip, size', TITLE: TR('ก่อนปรับสเกล') })] }),
    solution: () => ({ main: [note(TR('ข้อมูลทิปร้านอาหาร: เทียบช่วงของค่าแต่ละคอลัมน์')), set('df', ds('tips')), B('pb_plot_box_cols', { DF: df, COLS: 'total_bill, tip, size', TITLE: TR('ก่อนปรับสเกล') }),
      B('pb_scale_cols', { DF: df, COLS: 'total_bill, tip, size', CLS: 'MinMaxScaler' }), pr(B('pb_df_info', { DF: df, FN: 'describe' })), B('pb_plot_box_cols', { DF: df, COLS: 'total_bill, tip, size', TITLE: TR('หลังปรับสเกล') })] }),
    checks: [
      { text: TR('`total_bill`, `tip` และ `size` มีค่าต่ำสุด 0 และสูงสุด 1'), test: (c) => { const d = c.v('df'); return isDF(d) && ['total_bill', 'tip', 'size'].every((k) => d.has(k) && near(num0(d.col(k).min()), 0) && near(num0(d.col(k).max()), 1)); }, hint: TR('บล็อก ปรับสเกลคอลัมน์ (หมวด ทำความสะอาด & ปรับสเกล › ปรับสเกล) ใส่ total_bill, tip, size และเลือก MinMaxScaler') },
      { text: TR('ใช้ `MinMaxScaler`'), test: (c) => hasField(c, 'pb_scale_cols', { CLS: 'MinMaxScaler' }) || c.has('pb_scaler', (b) => b.getFieldValue('CLS') === 'MinMaxScaler'), hint: TR('ในบล็อกปรับสเกลคอลัมน์ เปลี่ยนตัวปรับสเกลเป็น MinMaxScaler') },
      { text: TR('แสดงสถิติหลังปรับสเกลด้วย `df.describe()`'), test: (c) => c.printedVal((x) => isDF(x) && x.index.includes('max') && x.columns.includes('tip') && near(x.col('tip').values[x.index.indexOf('max')], 1)), hint: TR('print(df.describe()) ต่อใต้บล็อกปรับสเกล') },
      { text: TR('วาดกราฟกล่องหลังปรับสเกล (รวมเป็น 2 กราฟ)'), test: (c) => c.log.filter((e) => e.kind === 'chart' && e.block === 'pb_plot_box_cols').length >= 2, hint: TR('ต่อบล็อก กราฟกล่องหลายคอลัมน์ อีกบล็อกไว้ท้ายสุด') },
    ],
    hints: [TR('MinMaxScaler คำนวณ (x − ค่าต่ำสุด) ÷ (ค่าสูงสุด − ค่าต่ำสุด) ค่าต่ำสุดจึงเป็น 0 และค่าสูงสุดเป็น 1'), TR('รูปร่างของกล่องเหมือนเดิม เปลี่ยนแค่สเกลของแกน'), TR('ถ้าจะสร้างโมเดล ให้เรียนสเกลจากชุดฝึกเท่านั้น ข้อถัดไปใช้ไปป์ไลน์ทำให้อัตโนมัติ')],
    learn: TR('การปรับสเกลทำให้ทุกคอลัมน์มีน้ำหนักใกล้กันในโมเดลที่ใช้ระยะทาง (KNN, SVM, K-Means) โดยไม่เปลี่ยนรูปร่างการกระจายของข้อมูล'),
  });
  add({
    id: 'pipeline', level: 2, title: TR('ปรับสเกลด้วยไปป์ไลน์'), topic: 'StandardScaler · SVC · make_pipeline',
    goal: TR('SVC วัดระยะห่างระหว่างจุด จึงอ่อนไหวต่อหน่วยของข้อมูล (น้ำหนักเป็นพันกรัม แต่ความยาวปากเป็นสิบมิลลิเมตร) ให้สร้าง `model = make_pipeline(StandardScaler(), SVC())` ฝึก แล้วแสดงคะแนนชุดทดสอบเทียบกับ SVC ที่ไม่ปรับสเกล'),
    start: () => ({ main: [note(TR('SVC ที่ไม่ปรับสเกล')), ...penguinPrep(), set('raw', R.model('SVC')), fit('raw'), pr2(TR('SVC ไม่ปรับสเกล:'), B('pb_score', { M: V('raw'), X: V('X_test'), Y: V('y_test') })), note(TR('ต่อ: model = ไปป์ไลน์ StandardScaler → SVC แล้วฝึกและแสดงคะแนน'))] }),
    solution: () => ({ main: [note(TR('SVC ที่ไม่ปรับสเกล')), ...penguinPrep(), set('raw', R.model('SVC')), fit('raw'), pr2(TR('SVC ไม่ปรับสเกล:'), B('pb_score', { M: V('raw'), X: V('X_test'), Y: V('y_test') })), note(TR('ต่อ: model = ไปป์ไลน์ StandardScaler → SVC แล้วฝึกและแสดงคะแนน')),
      set('model', pipe(scaler(), R.model('SVC'))), fit(), pr2(TR('SVC + ปรับสเกล:'), B('pb_score', { M: V('model'), X: V('X_test'), Y: V('y_test') }))] }),
    checks: [
      { text: TR('`model` เป็นไปป์ไลน์ StandardScaler → SVC'), test: (c) => { const m = c.v('model'); return m instanceof PB.Pipeline && m.steps.length === 2 && est(m.steps[0], 'StandardScaler') && est(m.steps[1], 'SVC'); }, hint: TR('หมวด เตรียมข้อมูล › ไปป์ไลน์ (มี StandardScaler ในช่องแรกให้แล้ว) แล้วดึงบล็อก SVC(…) สีม่วงจากบล็อก model = SVC(…) ในหมวด โมเดล › จำแนกประเภท ไปใส่ช่องที่สอง') },
      { text: TR('ฝึก `model` ด้วยชุดฝึกแล้ว'), test: (c) => fitted(c.v('model')), hint: TR('ต่อบล็อก model.fit(X_train, y_train)') },
      { text: TR('แสดงคะแนนชุดทดสอบของไปป์ไลน์ (สูงกว่าแบบไม่ปรับสเกล)'), test: (c) => {
        const m = c.v('model'), raw = c.v('raw'); if (!fitted(m) || !fitted(raw)) return false;
        const s = PB.unbox(PB.runMaybe(m.score(c.v('X_test'), c.v('y_test')))), r = PB.unbox(PB.runMaybe(raw.score(c.v('X_test'), c.v('y_test'))));
        return s > r && c.printedNum((x) => near(x, s));
      }, hint: TR('ใช้บล็อก print("SVC + ปรับสเกล:", model.score(X_test, y_test))') },
    ],
    hints: [TR('บล็อกโมเดลในแถบเครื่องมือมาพร้อม `model = …` ถ้าต้องการเฉพาะตัวโมเดล ให้ลากบล็อกสีม่วงด้านในออกมา'), TR('ไปป์ไลน์ทำตัวเหมือนโมเดลหนึ่งตัว ใช้ fit / score ได้ตามปกติ'), TR('เก็บไปป์ไลน์ไว้ในตัวแปรชื่อ `model` (ไม่ใช่ `raw`)')],
    learn: TR('ไปป์ไลน์รวมการปรับสเกลกับโมเดลเป็นชิ้นเดียว fit ครั้งเดียวได้ทั้งสองขั้น และไม่นำข้อมูลชุดทดสอบไปใช้ตอนปรับสเกล'),
  });
  add({
    id: 'kmeans', level: 2, title: TR('จัดกลุ่มนกเพนกวินด้วย K-Means'), topic: 'StandardScaler · KMeans · countplot',
    goal: TR('ไม่บอกสายพันธุ์ ให้ K-Means แบ่งนกเพนกวินเป็น 3 กลุ่มจากขนาดปากและครีบ: ปรับสเกล X → `KMeans(n_clusters=3)` → เก็บป้ายกลุ่มในคอลัมน์ `cluster` แล้ววาด countplot ของ cluster แยกสีตาม species เพื่อดูว่ากลุ่มตรงกับสายพันธุ์จริงแค่ไหน'),
    start: () => ({ main: [note(TR('เลือกคอลัมน์และลบแถวว่าง')), set('df', ds('penguins')), set('df', cols(['species', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm'])), set('df', clean('dropna')), set('df', clean('reset')),
      set('X', cols(['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm'])), note(TR('ต่อ: ปรับสเกล → KMeans → df["cluster"] → countplot'))] }),
    solution: () => ({ main: [note(TR('เลือกคอลัมน์และลบแถวว่าง')), set('df', ds('penguins')), set('df', cols(['species', 'bill_length_mm', 'bill_depth_mm', 'flipper_length_mm'])), set('df', clean('dropna')), set('df', clean('reset')),
      set('X', cols(['bill_length_mm', 'bill_depth_mm', 'flipper_length_mm'])), note(TR('ต่อ: ปรับสเกล → KMeans → df["cluster"] → countplot')),
      set('scaler', scaler()), set('X_scaled', B('pb_transform', { M: V('scaler'), FN: 'fit_transform', X: V('X') })), set('model', R.model('KMeans', { n_clusters: 3 })),
      set('labels', B('pb_predict', { M: V('model'), FN: 'fit_predict', X: V('X_scaled') })), B('pb_set_col', { DF: df, NAME: 'cluster' }, { VAL: get('labels') }),
      B('pb_plot_dist', { KIND: 'countplot', DF: df, X: 'cluster', HUE: 'species', TITLE: TR('กลุ่มจาก K-Means เทียบกับสายพันธุ์จริง') })] }),
    checks: [
      { text: TR('ปรับสเกล X ด้วย StandardScaler ก่อนจัดกลุ่ม'), test: (c) => c.has('pb_scaler') && c.has('pb_transform', (b) => b.getFieldValue('FN') === 'fit_transform'), hint: TR('หมวด เตรียมข้อมูล › scaler = StandardScaler() แล้ว X_scaled = scaler.fit_transform(X)') },
      { text: TR('`model` เป็น KMeans 3 กลุ่มที่ฝึกแล้ว'), test: (c) => est(c.v('model'), 'KMeans') && c.v('model').params.n_clusters === 3 && fitted(c.v('model')), hint: TR('หมวด โมเดล › จัดกลุ่ม & ลดมิติ › KMeans แล้วใช้ fit_predict กับ X_scaled') },
      { text: TR('`df` มีคอลัมน์ `cluster` ที่มี 3 กลุ่ม'), test: (c) => isDF(c.v('df')) && c.v('df').columns.includes('cluster') && new Set(c.v('df').col('cluster').values).size === 3, hint: TR('หมวด ข้อมูล › คำนวณคอลัมน์ › df["cluster"] = labels') },
      { text: TR('วาด countplot ของ cluster แยกสีตาม species'), test: (c) => hasField(c, 'pb_plot_dist', { KIND: 'countplot', X: 'cluster', HUE: 'species' }) && c.chart((e) => e.block === 'pb_plot_dist'), hint: TR('หมวด กราฟ › กราฟการกระจาย เลือก countplot, x = cluster, hue = species') },
    ],
    hints: [TR('labels = model.fit_predict(X_scaled) ทั้งฝึกและได้ป้ายกลุ่มในคำสั่งเดียว'), TR('เลขกลุ่ม 0, 1, 2 ไม่ได้ตรงกับชื่อสายพันธุ์ ให้ดูว่าแต่ละกลุ่มมีสายพันธุ์ไหนเป็นส่วนใหญ่')],
    learn: TR('การจัดกลุ่มไม่ใช้คำตอบตอนฝึก แต่ถ้ามีคำตอบจริงก็นำมาเทียบเพื่อตรวจคุณภาพของกลุ่มได้'),
  });

  /* ===== level 3: model selection and Thai text ===== */
  add({
    id: 'cross_val', level: 3, title: 'Cross-validation', topic: 'cross_val_score · mean · std',
    goal: TR('การแบ่งข้อมูลครั้งเดียวอาจได้ชุดทดสอบที่ง่ายหรือยากเกินจริง ให้วัด `model` ด้วย `cross_val_score` แบบ 5 รอบ เก็บในตัวแปร `scores` แล้วแสดงคะแนนแต่ละรอบ ค่าเฉลี่ย และส่วนเบี่ยงเบนมาตรฐาน'),
    start: () => ({ main: [note(TR('ต้นไม้ตัดสินใจลึกไม่เกิน 3 ชั้น')), ...irisXY(), set('model', R.model('DecisionTreeClassifier', { max_depth: 3 })), note(TR('ต่อ: scores = cross_val_score(…) แล้วแสดงผล'))] }),
    solution: () => ({ main: [note(TR('ต้นไม้ตัดสินใจลึกไม่เกิน 3 ชั้น')), ...irisXY(), set('model', R.model('DecisionTreeClassifier', { max_depth: 3 })), note(TR('ต่อ: scores = cross_val_score(…) แล้วแสดงผล')),
      set('scores', B('pb_cv', { X: V('X'), Y: V('y'), K: 5, SC: 'None' }, { M: get('model') })), pr2(TR('คะแนนแต่ละรอบ:'), get('scores')),
      pr2(TR('คะแนนเฉลี่ย:'), B('pb_arr_stat', { FN: 'mean' }, { X: get('scores') })), pr2(TR('ส่วนเบี่ยงเบนมาตรฐาน:'), B('pb_arr_stat', { FN: 'std' }, { X: get('scores') }))] }),
    checks: [
      { text: TR('`scores` เป็นคะแนน 5 รอบจาก `cross_val_score`'), test: (c) => c.has('pb_cv') && isArr(c.v('scores')) && values(c.v('scores')).length === 5, hint: TR('หมวด ฝึก & ทำนาย › วัดผลแบบไขว้ › scores = cross_val_score(model, X, y, cv=5)') },
      { text: TR('แสดงคะแนนแต่ละรอบ'), test: (c) => c.printedVal((x) => isArr(x) && values(x).length === 5), hint: TR('print("คะแนนแต่ละรอบ:", scores)') },
      { text: TR('แสดงค่าเฉลี่ยของ `scores`'), test: (c) => isArr(c.v('scores')) && c.printedNum((x) => near(x, PB.npMean(values(c.v('scores'))))), hint: TR('หมวด วัดผล › บล็อก (…).mean() ใส่ scores ในช่อง') },
      { text: TR('แสดงส่วนเบี่ยงเบนมาตรฐานของ `scores`'), test: (c) => isArr(c.v('scores')) && c.printedNum((x) => near(x, PB.npStd(values(c.v('scores'))))), hint: TR('บล็อกเดียวกัน เปลี่ยนเป็น .std()') },
    ],
    hints: [TR('cross_val_score แบ่งข้อมูลเป็น 5 ส่วน สลับกันใช้เป็นชุดทดสอบ จึงได้คะแนน 5 ค่า'), TR('ไม่ต้อง fit เอง cross_val_score ฝึกโมเดลให้ในแต่ละรอบ')],
    learn: TR('ค่าเฉลี่ยบอกว่าโมเดลเก่งแค่ไหน ส่วนเบี่ยงเบนมาตรฐานบอกว่าผลแกว่งตามการแบ่งข้อมูลมากน้อยเพียงใด'),
  });
  add({
    id: 'grid', level: 3, title: TR('GridSearchCV หาค่าที่ดีที่สุด'), topic: 'GridSearchCV · best_params_',
    goal: TR('ใช้ `GridSearchCV` ลอง n_neighbors = 1, 3, 5, 7, 9, 11 ของ KNN ด้วย cross-validation 5 รอบบนชุดฝึก แล้วแสดง `best_params_` `best_score_` และ accuracy ของชุดทดสอบ'),
    start: () => ({ main: [note(TR('เตรียมข้อมูล แบ่งชุดฝึก/ทดสอบ และสร้างโมเดลไว้แล้ว')), ...irisXY(), split(), set('model', R.model('KNeighborsClassifier')), note(TR('ต่อ: grid = GridSearchCV(…) → fit → ผลลัพธ์ → ทดสอบ'))] }),
    solution: () => ({ main: [note(TR('เตรียมข้อมูล แบ่งชุดฝึก/ทดสอบ และสร้างโมเดลไว้แล้ว')), ...irisXY(), split(), set('model', R.model('KNeighborsClassifier')), note(TR('ต่อ: grid = GridSearchCV(…) → fit → ผลลัพธ์ → ทดสอบ')),
      set('grid', B('pb_grid', { GRID: '{"n_neighbors": [1, 3, 5, 7, 9, 11]}', CV: 5, SC: 'None' }, { M: get('model') })), fit('grid'),
      pr2(TR('พารามิเตอร์ที่ดีที่สุด:'), B('pb_grid_attr', { G: V('grid'), ATTR: 'best_params_' })), pr2(TR('คะแนน CV ที่ดีที่สุด:'), B('pb_grid_attr', { G: V('grid'), ATTR: 'best_score_' })),
      predict('grid'), metric(TR('Accuracy ชุดทดสอบ:'), 'accuracy_score')] }),
    checks: [
      { text: TR('`grid` ลอง n_neighbors อย่างน้อย 6 ค่า'), test: (c) => { const g = c.v('grid'); return g instanceof PB.GridSearchCV && g._candidates.length >= 6 && g._candidates.every((p) => p.has ? p.has('n_neighbors') : 'n_neighbors' in p); }, hint: TR('แก้ param_grid ในบล็อกเป็น {"n_neighbors": [1, 3, 5, 7, 9, 11]}') },
      { text: TR('ฝึก `grid` ด้วยชุดฝึกแล้ว'), test: (c) => fitted(c.v('grid')), hint: TR('บล็อก grid.fit(X_train, y_train) (เปลี่ยนตัวแปรในบล็อกฝึกเป็น grid)') },
      { text: TR('แสดง `best_params_`'), test: (c) => c.printedVal((x) => x instanceof Map && x.has('n_neighbors')), hint: TR('หมวด ฝึก & ทำนาย › print("พารามิเตอร์ที่ดีที่สุด:", grid.best_params_)') },
      { text: TR('แสดง `best_score_`'), test: (c) => fitted(c.v('grid')) && c.printedNum((x) => near(x, PB.unbox(c.v('grid').best_score_))), hint: TR('บล็อกผลการค้นหา เลือก best_score_ แล้วใส่ใน print') },
      { text: TR('แสดง accuracy ของชุดทดสอบจาก `grid.predict`'), test: (c) => c.has('pb_predict', (b) => c.varOf(b, 'M') === 'grid') && hasField(c, 'pb_metric', { FN: 'accuracy_score' }) && c.printedNum((x) => x >= 0 && x <= 1), hint: TR('y_pred = grid.predict(X_test) แล้ว print accuracy_score(y_test, y_pred)') },
    ],
    hints: [TR('หมวด ฝึก & ทำนาย › หาค่าพารามิเตอร์ที่ดีที่สุด มีบล็อกครบชุด'), TR('หลัง fit แล้ว grid ใช้ predict ได้เหมือนโมเดลปกติ โดยใช้โมเดลที่ดีที่สุดให้อัตโนมัติ'), TR('best_score_ คือคะแนนเฉลี่ย cross-validation บนชุดฝึก ส่วน accuracy ชุดทดสอบวัดกับข้อมูลที่ไม่เคยใช้เลย')],
    learn: TR('GridSearchCV คือลูปลองพารามิเตอร์ + cross-validation ในคำสั่งเดียว และเก็บโมเดลที่ดีที่สุดไว้ใน `best_estimator_`'),
  });
  add({
    id: 'thai_words', level: 3, title: TR('ตัดคำรีวิวภาษาไทย'), topic: TR('PyThaiNLP · คำหยุด · นับคำ'),
    goal: TR('ภาษาไทยเขียนติดกันไม่เว้นวรรค ต้องตัดคำก่อนนับคำ ให้ตัดคำคอลัมน์ `text` แบบตัดคำหยุดออก เก็บในคอลัมน์ใหม่ `tokens` แล้วแสดง 10 คำที่พบบ่อยที่สุด'),
    start: () => ({ main: [note(TR('รีวิวสินค้าภาษาไทย 120 ข้อความ')), set('df', ds('thai_reviews')), head(5), note(TR('ลองตัดคำหนึ่งประโยค')), pr(B('pb_th_tokenize', { KW: 'False' }, { TEXT: txt('อาหารอร่อยมาก ส่งไวด้วย') }))] }), /* th-data */
    solution: () => ({ main: [note(TR('รีวิวสินค้าภาษาไทย 120 ข้อความ')), set('df', ds('thai_reviews')), head(5), note(TR('ลองตัดคำหนึ่งประโยค')), pr(B('pb_th_tokenize', { KW: 'False' }, { TEXT: txt('อาหารอร่อยมาก ส่งไวด้วย') })), /* th-data */
      B('pb_set_col', { DF: df, NAME: 'tokens' }, { VAL: B('pb_th_tokens', { DF: df, COL: 'text', FN: 'thai_tokenize_nostop' }) }), pr(B('pb_word_count', { DF: df, COL: 'tokens', N: 10 }))] }),
    checks: [
      { text: TR('`df` มีคอลัมน์ `tokens` ที่แต่ละแถวเป็นลิสต์ของคำ'), test: (c) => isDF(c.v('df')) && c.v('df').columns.includes('tokens') && c.v('df').col('tokens').values.every(Array.isArray), hint: TR('หมวด ข้อมูล › ข้อความภาษาไทย › df["tokens"] = df[…].apply(…) เลือกคอลัมน์ text') },
      { text: TR('ตัดคำหยุด (เช่น ที่ และ มาก) ออกแล้ว'), test: (c) => isDF(c.v('df')) && c.v('df').columns.includes('tokens') && c.v('df').col('tokens').values.every((t) => Array.isArray(t) && !t.some((w) => PB.thai.isStopword(w))), hint: TR('เลือกฟังก์ชัน thai_tokenize_nostop (ตัดคำ + ตัดคำหยุด)') },
      { text: TR('แสดง 10 คำที่พบบ่อยที่สุด'), test: (c) => c.has('pb_word_count') && c.printedVal((x) => isS(x) && x.length === 10), hint: 'print(df["tokens"].explode().value_counts().head(10))' },
    ],
    hints: [TR('คำหยุด (stopwords) คือคำที่พบบ่อยมากแต่ไม่ช่วยบอกความหมาย เช่น ที่ และ ของ มาก'), TR('บล็อกนับคำที่พบบ่อยต้องใช้กับคอลัมน์ tokens ที่ตัดคำแล้ว')],
    learn: TR('PyThaiNLP ตัดคำด้วยพจนานุกรม (newmm) ส่วนคำหยุดคือคำที่พบบ่อยแต่ไม่ช่วยบอกความหมาย จึงมักตัดออกก่อนนับคำ'),
  });
  add({
    id: 'thai_model', level: 3, title: TR('จำแนกรีวิวด้วยคำภาษาไทย'), topic: TR('TF-IDF · ตัดคำไทย · MultinomialNB'),
    goal: TR('สร้างไปป์ไลน์ `TfidfVectorizer` แบบตัดคำไทย → `MultinomialNB` เพื่อทายว่ารีวิวเป็นบวกหรือลบ วัด accuracy กับชุดทดสอบ แล้วลองทายรีวิวที่คุณพิมพ์เอง'),
    start: () => ({ main: [note(TR('X = ข้อความรีวิว, y = บวก/ลบ')), set('df', ds('thai_reviews')), set('X', col('text')), set('y', col('label')), split(0.25), note(TR('ต่อ: model = ไปป์ไลน์ TF-IDF (ตัดคำไทย) → MultinomialNB'))] }),
    solution: () => ({ main: [note(TR('X = ข้อความรีวิว, y = บวก/ลบ')), set('df', ds('thai_reviews')), set('X', col('text')), set('y', col('label')), split(0.25), note(TR('ต่อ: model = ไปป์ไลน์ TF-IDF (ตัดคำไทย) → MultinomialNB')),
      set('model', pipe(B('pb_vectorizer', { CLS: 'TfidfVectorizer', AN: 'thai', N1: 1, N2: 2 }), R.model('MultinomialNB'))), fit(), predict(), metric('Accuracy:', 'accuracy_score'),
      pr2(TR('รีวิวใหม่:'), B('pb_predict_text', { M: V('model'), TEXT: 'ของดีมาก ส่งไว แพ็คมาอย่างดี' }))] }), /* th-data */
    checks: [
      { text: TR('`model` เป็นไปป์ไลน์ TfidfVectorizer → MultinomialNB'), test: (c) => { const m = c.v('model'); return m instanceof PB.Pipeline && m.steps.length === 2 && est(m.steps[0], 'TfidfVectorizer') && est(m.steps[1], 'MultinomialNB'); }, hint: TR('หมวด เตรียมข้อมูล › ไปป์ไลน์: ช่องแรกใส่บล็อก TfidfVectorizer(…) (ดึงจากบล็อก vectorizer = … ในหมวด ข้อมูล › ข้อความภาษาไทย) ช่องที่สองใส่ MultinomialNB(…) จากหมวด โมเดล › จำแนกประเภท') },
      { text: TR('ตัวแปลงข้อความใช้การตัดคำภาษาไทย (PyThaiNLP)'), test: (c) => { const m = c.v('model'); return m instanceof PB.Pipeline && !!m.steps[0].params.tokenizer; }, hint: TR('ในบล็อก TfidfVectorizer เลือก analyzer เป็น "word" + ตัดคำไทย (PyThaiNLP)') },
      { text: TR('แสดง accuracy ของชุดทดสอบ (อย่างน้อย 0.8)'), test: (c) => fitted(c.v('model')) && hasField(c, 'pb_metric', { FN: 'accuracy_score' }) && c.printedNum((x) => x >= 0.8 && x <= 1), hint: 'model.fit(X_train, y_train) → y_pred = model.predict(X_test) → print accuracy' },
      { text: TR('ทายรีวิวใหม่ที่พิมพ์เอง'), test: (c) => c.has('pb_predict_text') && c.printedVal((x) => x === 'บวก' || x === 'ลบ'), hint: TR('หมวด ฝึก & ทำนาย › ทำนายข้อความใหม่ แล้วใส่ใน print') }, /* th-data */
    ],
    hints: [TR('ไปป์ไลน์รับข้อความดิบได้เลย ไม่ต้องแปลงข้อความเป็นตัวเลขเอง'), TR('หรือจะสร้าง `vectorizer = TfidfVectorizer(…)` ไว้ก่อน แล้วใส่ตัวแปร vectorizer ในช่องแรกของไปป์ไลน์ก็ได้'), TR('ngram_range=(1, 2) ใช้ทั้งคำเดี่ยวและคู่คำ เช่น "ไม่ อร่อย"')],
    learn: TR('TF-IDF เปลี่ยนคำเป็นตัวเลขโดยให้น้ำหนักคำที่เด่นในแต่ละรีวิว แล้ว Naive Bayes เรียนว่าคำไหนมักอยู่กับรีวิวบวกหรือลบ'),
  });
  EX.forEach((e, i) => { e.n = i + 1; });
  PB.EXERCISES = EX;

  /* ---------------- programs ---------------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const toState = (p) => {
    const tops = [];
    if (p.main && p.main.length) tops.push(Object.assign(R.chain(p.main.map(clone)), { x: 24, y: 24 }));
    (p.pieces || []).forEach((b, i) => tops.push(Object.assign(clone(b), { x: 24, y: 3000 + i * 200 })));
    return { blocks: { languageVersion: 0, blocks: tops } };
  };
  PB.exState = toState;
  /* loose pieces go beside the main program when they fit in the visible canvas, otherwise below it */
  function layoutPieces() {
    const ws = A.ws, tops = ws.getTopBlocks(false);
    if (tops.length < 2) return;
    const main = tops.reduce((a, b) => (a.getRelativeToSurfaceXY().y <= b.getRelativeToSurfaceXY().y ? a : b));
    const pieces = tops.filter((b) => b !== main).sort((a, b) => a.getRelativeToSurfaceXY().y - b.getRelativeToSurfaceXY().y);
    const mr = main.getBoundingRectangle();
    const widest = Math.max(...pieces.map((p) => { const r = p.getBoundingRectangle(); return r.right - r.left; }));
    let viewW = 0;
    try { viewW = ws.getMetricsManager().getViewMetrics(true).width; } catch (e) { viewW = 0; }
    if (!viewW) viewW = ((A.isPhone() ? window.innerWidth - 90 : window.innerWidth * 0.5)) / ws.scale;
    const beside = !A.isPhone() && mr.right + 60 + widest <= mr.left + viewW - 20;
    let x = beside ? mr.right + 60 : mr.left, y = beside ? mr.top + 56 : mr.bottom + 60;
    Blockly.Events.setGroup(true);
    try {
      for (const p of pieces) {
        const xy = p.getRelativeToSurfaceXY();
        p.moveBy(x - xy.x, y - xy.y);
        const r = p.getBoundingRectangle();
        y += r.bottom - r.top + 24;
      }
    } finally { Blockly.Events.setGroup(false); }
    S.piecesBeside = beside;
  }

  /* ---------------- state ---------------- */
  const KEY_DONE = 'pyblocks.ex.done.v1', KEY_WORK = 'pyblocks.ex.work.v1', KEY_ACTIVE = 'pyblocks.ex.active';
  const LEVELS = { 1: [TR('ระดับ 1'), TR('พื้นฐาน Python และ pandas')], 2: [TR('ระดับ 2'), TR('ขั้นตอน Machine Learning')], 3: [TR('ระดับ 3'), TR('วัดผลขั้นสูงและข้อความภาษาไทย')] };
  const S = (A.ex = { active: null, results: null, hints: 0, prev: null, runError: null, usedSolution: false, checking: false });
  const doneMap = () => U.store.get(KEY_DONE) || {};
  const workMap = () => U.store.get(KEY_WORK) || {};
  const byId = (id) => EX.find((e) => e.id === id);
  S.saveWork = (state) => {
    if (!S.active) return;
    const w = workMap(); w[S.active] = { ts: Date.now(), state };
    const keys = Object.keys(w).sort((a, b) => w[b].ts - w[a].ts);
    keys.slice(30).forEach((k) => delete w[k]);
    U.store.set(KEY_WORK, w);
  };

  /* what a check can look at after a run */
  function context() {
    const vars = A.vars || new Map(), log = (A.out && A.out.log) || [];
    const blocks = A.ws.getAllBlocks(false).filter((b) => b.isEnabled());
    const prints = log.filter((e) => e.kind === 'print');
    const vals = prints.flatMap((e) => e.values.map(PB.unbox));
    const safe = (f) => (x) => { try { return !!f(x); } catch (e) { return false; } };
    const varOf = (b, field) => { const f = b.getField(field); const v = f && f.getVariable ? f.getVariable() : null; return v ? (v.getName ? v.getName() : v.name) : b.getFieldValue(field); };
    return {
      vars, log, prints, varOf,
      v: (n) => PB.unbox(vars.get(n)),
      has: (type, f) => blocks.some((b) => b.type === type && (!f || safe(f)(b))),
      printedNum: (f) => vals.some((x) => typeof x === 'number' && safe(f)(x)),
      printedVal: (f) => vals.some(safe(f)),
      printedText: (re) => prints.some((e) => re.test(e.text)),
      chart: (f) => log.some((e) => e.kind === 'chart' && (!f || safe(f)(e))),
      chains: () => A.ws.getTopBlocks(false).filter((b) => !b.outputConnection && b.isEnabled() && !/^procedures_def/.test(b.type)).length,
    };
  }

  /* ---------------- enter / leave ---------------- */
  A.exStart = (id, { fresh = false } = {}) => {
    const ex = byId(id);
    if (!ex) return false;
    /* a program still running (e.g. the start-up run) is stopped first */
    if (A.running) {
      A.stop();
      const t0 = Date.now();
      const wait = () => { if (!A.running) A.exStart(id, { fresh }); else if (Date.now() - t0 < 6000) setTimeout(wait, 40); };
      setTimeout(wait, 40);
      return true;
    }
    if (!S.active) { A.saveDraftNow(); S.prev = Blockly.serialization.workspaces.save(A.ws); }
    else A.saveDraftNow();
    S.active = id; S.results = null; S.hints = 0; S.runError = null; S.usedSolution = false; S.checking = false;
    U.store.set(KEY_ACTIVE, id);
    const saved = !fresh && workMap()[id];
    A.loadProgram(saved ? saved.state : toState(ex.start()), { keepExercise: true });
    if (!saved) { layoutPieces(); A.saveDraftNow(); }
    S.resumed = !!saved;
    document.body.classList.add('ex-mode');
    U.$$('[data-panel="task"], [data-view="task"]').forEach((el) => { if (el.classList.contains('tab') || el.tagName === 'BUTTON') el.hidden = false; });
    A.out.clear(); A.vars = null; A.lastError = null; A.setErrorBadge(false); A.setStatus('', TR('พร้อมรัน'));
    A.out.note(TR`แบบฝึกหัดข้อ ${ex.n}: ${ex.title} — ต่อบล็อกตามโจทย์ แล้วกด "ตรวจคำตอบ" โปรแกรมจะรันและตรวจให้อัตโนมัติ`);
    if (A.refreshVars) A.refreshVars();
    renderBar();
    if (A.isPhone()) A.setView('task'); else A.setPanel('task');
    return true;
  };
  A.exLeave = ({ restore = true } = {}) => {
    if (!S.active) return;
    A.saveDraftNow();
    S.active = null; S.results = null; U.store.del(KEY_ACTIVE);
    document.body.classList.remove('ex-mode');
    U.$$('.tab[data-panel="task"], .mnav [data-view="task"]').forEach((el) => { el.hidden = true; });
    renderBar();
    const prev = S.prev; S.prev = null;
    if (restore) {
      const st = prev || (U.store.get('pyblocks.draft.v2') || {}).state;
      A.loadProgram(st && st.blocks ? st : PB.SAMPLES[0].build());
      A.out.clear(); A.vars = null; A.lastError = null; A.setErrorBadge(false); A.setStatus('', TR('พร้อมรัน'));
      A.out.note(TR('ออกจากโหมดแบบฝึกหัดแล้ว กลับมาที่งานเดิมของคุณ (งานในแบบฝึกหัดถูกเก็บไว้ ทำต่อได้ภายหลัง)'));
      if (A.refreshVars) A.refreshVars();
    }
    if (A.isPhone()) A.setView('blocks'); else if (A.panel === 'task') A.setPanel('out');
  };
  /* resume after a reload */
  A.exResume = () => {
    const id = U.store.get(KEY_ACTIVE);
    if (!id || !byId(id)) { U.store.del(KEY_ACTIVE); return false; }
    return A.exStart(id);
  };

  /* ---------------- actions ---------------- */
  async function check() {
    const ex = byId(S.active);
    if (!ex || A.running || S.checking) return;
    S.checking = true; renderPanel(); renderBar();
    try { await A.run(); } finally { S.checking = false; }
    if (!S.active || S.active !== ex.id) return;
    const c = context();
    S.results = ex.checks.map((k) => { try { return k.test(c) === true; } catch (e) { return false; } });
    const err = A.lastError;
    S.runError = err ? (err.thai || err.message || String(err)) : null;
    const passed = S.results.filter(Boolean).length, all = passed === S.results.length;
    /* clean = passed at least once without loading the solution */
    if (all) { const d = doneMap(), prev = d[ex.id]; d[ex.id] = { t: Date.now(), clean: !S.usedSolution || !!(prev && prev.clean) }; U.store.set(KEY_DONE, d); }
    renderPanel(); renderBar();
    if (A.isPhone()) A.setView('task'); else A.setPanel('task');
    U.toast(all ? TR('ผ่านครบทุกข้อ เยี่ยมมาก!') : TR`ผ่าน ${passed} จาก ${S.results.length} ข้อ — ดูสิ่งที่ยังขาดในแท็บโจทย์`, 3200);
  }
  A.exCheck = check;
  function showHint() { const ex = byId(S.active); if (!ex) return; S.hints = Math.min(ex.hints.length, S.hints + 1); renderPanel(); }
  function showSolution() {
    const ex = byId(S.active); if (!ex) return;
    U.confirm(TR('แทนบล็อกของคุณด้วยเฉลย? บล็อกที่ต่อไว้ในข้อนี้จะถูกแทนที่'), (ok) => {
      if (!ok) return;
      A.loadProgram(toState(ex.solution()), { keepExercise: true });
      S.usedSolution = true; S.results = null; S.runError = null;
      A.out.clear(); A.out.note(TR('ใส่เฉลยแล้ว อ่านบล็อกทีละขั้น แล้วกด "ตรวจคำตอบ" เพื่อดูผล'));
      renderPanel(); renderBar();
      if (A.isPhone()) A.setView('blocks');
    }, TR('ดูเฉลย'));
  }
  function restart() {
    const ex = byId(S.active); if (!ex) return;
    U.confirm(TR('เริ่มข้อนี้ใหม่? บล็อกที่ต่อไว้ในข้อนี้จะหายไป'), (ok) => {
      if (!ok) return;
      A.loadProgram(toState(ex.start()), { keepExercise: true }); layoutPieces(); A.saveDraftNow();
      S.results = null; S.hints = 0; S.runError = null; S.usedSolution = false; S.resumed = false;
      A.out.clear(); A.vars = null; A.lastError = null; A.setErrorBadge(false); A.setStatus('', TR('พร้อมรัน'));
      if (A.refreshVars) A.refreshVars();
      renderPanel(); renderBar();
    }, TR('เริ่มใหม่'));
  }
  const go = (d) => { const i = EX.findIndex((e) => e.id === S.active) + d; if (i >= 0 && i < EX.length) A.exStart(EX[i].id); };

  /* ---------------- rendering ---------------- */
  /* `code` spans inside task text */
  const rich = (text) => String(text).split(/(`[^`]+`)/).filter(Boolean).map((p) => (p[0] === '`' ? h('code', {}, p.slice(1, -1)) : p));
  const MARK = { pass: '<path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>', fail: '<path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>', todo: '<circle cx="10" cy="10" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' };
  const mark = (k) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = MARK[k]; return s; };
  function renderPanel() {
    const box = $('#task-body'); if (!box) return;
    const ex = byId(S.active);
    box.textContent = '';
    if (!ex) { box.appendChild(h('div', { class: 'empty-state' }, h('h3', {}, TR('ยังไม่ได้เลือกแบบฝึกหัด')), TR('เปิดรายการแบบฝึกหัดแล้วเลือกข้อที่ต้องการ'), h('div', { style: { marginTop: '12px' } }, h('button', { class: 'btn btn-accent', onclick: () => A.openExercises() }, U.icon('task'), TR('รายการแบบฝึกหัด'))))); return; }
    const d = doneMap()[ex.id];
    const top = h('div', { class: 'ex-top' },
      h('span', { class: 'ex-level l' + ex.level }, LEVELS[ex.level][0]),
      h('span', { class: 'muted' }, TR`ข้อ ${ex.n} จาก ${EX.length} · ${ex.topic}`),
      d ? h('span', { class: 'tag good' }, d.clean ? TR('ผ่านแล้ว') : TR('ผ่านแล้ว (ดูเฉลย)')) : null);
    const card = h('div', { class: 'ex-card-main' }, top, h('h2', { class: 'ex-title' }, ex.title), h('p', { class: 'ex-goal' }, rich(ex.goal)));
    if (ex.jigsaw) card.appendChild(h('div', { class: 'ex-note' }, U.icon('blocks'), h('span', {}, TR`บล็อกที่ต้องใช้วางไว้${S.piecesBeside ? TR('ทางขวาของ') : TR('ใต้')}โปรแกรมแล้ว ลากไปต่อให้ถูกลำดับ และแก้ค่าที่ยังไม่ตรงโจทย์`)));
    if (S.resumed && !S.results) card.appendChild(h('div', { class: 'muted', style: { marginTop: '6px' } }, TR('เปิดงานที่ทำค้างไว้ในข้อนี้ (กด "เริ่มใหม่" ถ้าต้องการเริ่มจากต้น)')));
    box.appendChild(card);

    const list = h('ol', { class: 'ex-checks' });
    ex.checks.forEach((k, i) => {
      const st = S.results ? (S.results[i] ? 'pass' : 'fail') : 'todo';
      const li = h('li', { class: 'ex-check ' + st }, h('span', { class: 'ex-mark' }, mark(st)), h('div', {}, h('div', {}, rich(k.text)), st === 'fail' && k.hint ? h('div', { class: 'ex-why' }, rich(k.hint)) : null));
      list.appendChild(li);
    });
    box.appendChild(h('section', { class: 'ex-sec' }, h('h3', {}, TR('สิ่งที่ต้องทำให้ได้')), list));
    if (S.results && S.runError) box.appendChild(h('div', { class: 'ex-err', role: 'status' }, h('b', {}, TR('โปรแกรมหยุดเพราะเกิดข้อผิดพลาด: ')), S.runError, ' ', h('button', { class: 'btn btn-sm', onclick: () => (A.isPhone() ? A.setView('out') : A.setPanel('out')) }, TR('ดูที่ผลลัพธ์'))));
    const allPass = S.results && S.results.every(Boolean);
    if (allPass) box.appendChild(h('div', { class: 'ex-success', role: 'status' }, h('div', { class: 'ex-success-head' }, mark('pass'), h('b', {}, S.usedSolution ? TR('เฉลยผ่านครบทุกข้อ') : TR('ผ่านครบทุกข้อ เยี่ยมมาก!'))), h('p', {}, rich(ex.learn)),
      ex.n < EX.length ? h('button', { class: 'btn btn-accent', onclick: () => go(1) }, TR`ข้อถัดไป: ${EX[ex.n].title} →`) : h('div', { class: 'muted' }, TR('นี่คือข้อสุดท้ายแล้ว ลองกลับไปทำข้อที่ยังไม่ผ่านในรายการแบบฝึกหัด'))));

    const checking = S.checking || A.running;
    const actions = h('div', { class: 'ex-actions' },
      h('button', { class: 'btn btn-run', disabled: checking, onclick: () => check() }, U.icon('play'), checking ? TR('กำลังตรวจ…') : TR('ตรวจคำตอบ')),
      h('button', { class: 'btn', disabled: S.hints >= ex.hints.length, onclick: showHint }, U.icon('bulb'), TR`คำใบ้ (${S.hints}/${ex.hints.length})`),
      h('button', { class: 'btn', onclick: showSolution }, TR('ดูเฉลย')),
      h('button', { class: 'btn btn-ghost', onclick: restart }, TR('เริ่มใหม่')));
    box.appendChild(actions);
    if (S.hints) box.appendChild(h('section', { class: 'ex-sec' }, h('h3', {}, TR('คำใบ้')), h('ol', { class: 'ex-hints' }, ex.hints.slice(0, S.hints).map((t) => h('li', {}, rich(t))))));
    const nav = h('div', { class: 'ex-nav' },
      h('button', { class: 'btn btn-sm btn-ghost', disabled: ex.n <= 1, onclick: () => go(-1) }, TR('← ข้อก่อนหน้า')),
      h('button', { class: 'btn btn-sm', onclick: () => A.openExercises() }, U.icon('task'), TR('รายการแบบฝึกหัด')),
      h('button', { class: 'btn btn-sm btn-ghost', disabled: ex.n >= EX.length, onclick: () => go(1) }, TR('ข้อถัดไป →')),
      h('div', { class: 'grow' }),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => A.exLeave() }, TR('ออกจากแบบฝึกหัด')));
    box.appendChild(nav);
  }
  A.exRender = renderPanel;
  /* the strip over the canvas while an exercise is open */
  function renderBar() {
    const bar = $('#ex-bar'); if (!bar) return;
    const ex = byId(S.active);
    bar.hidden = !ex; bar.textContent = '';
    if (!ex) return;
    const passed = S.results ? S.results.filter(Boolean).length : null;
    bar.appendChild(h('button', { class: 'ex-bar-title', title: TR('ดูโจทย์'), onclick: () => (A.isPhone() ? A.setView('task') : A.setPanel('task')) },
      h('span', { class: 'ex-level l' + ex.level }, TR`ข้อ ${ex.n}`), h('span', { class: 'ex-bar-name' }, ex.title),
      passed !== null ? h('span', { class: 'ex-bar-score' + (passed === S.results.length ? ' ok' : '') }, `${passed}/${S.results.length}`) : null));
    bar.appendChild(h('button', { class: 'btn btn-sm btn-run', disabled: S.checking || A.running, onclick: () => check() }, U.icon('play'), S.checking ? TR('กำลังตรวจ…') : TR('ตรวจคำตอบ')));
    const n = $('#ex-count'); if (n) n.textContent = passed !== null ? `${passed}/${S.results.length}` : '';
  }
  A.exRenderBar = renderBar;

  /* ---------------- list dialog ---------------- */
  A.openExercises = () => {
    const d = doneMap(), nDone = EX.filter((e) => d[e.id]).length;
    const body = h('div', { class: 'ex-list' });
    body.appendChild(h('div', { class: 'ex-progress' }, h('div', { class: 'ex-progress-text' }, h('b', {}, TR`ทำผ่านแล้ว ${nDone} จาก ${EX.length} ข้อ`), h('span', { class: 'muted' }, TR('ต่อบล็อกตามโจทย์ กด "ตรวจคำตอบ" แล้วแอปจะรันโปรแกรมและตรวจให้ทันที'))),
      h('div', { class: 'ex-progress-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(EX.length), 'aria-valuenow': String(nDone) }, h('i', { style: { width: (nDone / EX.length * 100).toFixed(1) + '%' } }))));
    for (const lv of [1, 2, 3]) {
      const items = EX.filter((e) => e.level === lv);
      const grid = h('div', { class: 'ex-grid' }, items.map((e) => {
        const st = d[e.id], cur = S.active === e.id, w = workMap()[e.id];
        return h('button', { type: 'button', class: 'ex-item' + (st ? ' done' : '') + (cur ? ' current' : ''), onclick: () => { m.close(); A.exStart(e.id); } },
          h('span', { class: 'ex-num' }, st ? mark('pass') : String(e.n)),
          h('span', { class: 'ex-item-text' }, h('b', {}, e.title), h('small', {}, e.topic)),
          cur ? h('span', { class: 'tag' }, TR('กำลังทำ')) : st ? h('span', { class: 'tag good' }, TR('ผ่านแล้ว')) : w ? h('span', { class: 'tag note' }, TR('ทำค้างไว้')) : null);
      }));
      body.appendChild(h('section', { class: 'ex-level-sec' }, h('h3', {}, h('span', { class: 'ex-level l' + lv }, LEVELS[lv][0]), LEVELS[lv][1]), grid));
    }
    const foot = [h('div', { class: 'grow' }, TR('งานของแต่ละข้อถูกบันทึกไว้ในเบราว์เซอร์นี้ ทำต่อได้ทุกเมื่อ'))];
    if (nDone || Object.keys(workMap()).length) foot.push(h('button', { class: 'btn btn-ghost', onclick: () => U.confirm(TR('ล้างความคืบหน้าและงานที่ทำค้างไว้ของแบบฝึกหัดทั้งหมด?'), (ok) => { if (!ok) return; U.store.del(KEY_DONE); U.store.del(KEY_WORK); m.close(); A.openExercises(); renderPanel(); }, TR('ล้างทั้งหมด')) }, TR('ล้างความคืบหน้า')));
    if (S.active) foot.push(h('button', { class: 'btn', onclick: () => { m.close(); A.exLeave(); } }, TR('ออกจากแบบฝึกหัด')));
    const next = EX.find((e) => !d[e.id]);
    if (!S.active && next) foot.push(h('button', { class: 'btn btn-accent', onclick: () => { m.close(); A.exStart(next.id); } }, nDone ? TR`ทำต่อ: ข้อ ${next.n}` : TR('เริ่มข้อแรก')));
    const m = U.modal({ title: TR('แบบฝึกหัด: ต่อบล็อกตามโจทย์'), body, foot });
  };
})();
