/* ThaiPyBlocks: scikit-learn blocks — preparation, model constructors, training/prediction, metrics. */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py, T = BK.T;
  const PD = 'import pandas as pd';

  /* ======================= preparation ======================= */
  def('pb_split', {
    cat: 'prep', th: TR('แบ่งข้อมูลฝึก / ทดสอบ'), thBreak: true,
    py: '{XTR}, {XTE}, {YTR}, {YTE} = train_test_split(\n{X}, {Y}, test_size={TS}, random_state={RS}, {MODE} )',
    f: { XTR: { t: 'var', def: 'X_train' }, XTE: { t: 'var', def: 'X_test' }, YTR: { t: 'var', def: 'y_train' }, YTE: { t: 'var', def: 'y_test' }, X: { t: 'var', def: 'X' }, Y: { t: 'var', def: 'y' },
      TS: { t: 'num', def: 0.2, min: 0.05, max: 0.9 }, RS: { t: 'num', def: 42, min: 0, prec: 1 }, MODE: { t: 'dd', opts: [['stratify=y', 'stratify'], ['shuffle=True', 'shuffle'], [TR('shuffle=False (ตามเวลา)'), 'time']] } },
    tip: TR('แบ่งข้อมูลเป็นชุดฝึก (ให้โมเดลเรียน) และชุดทดสอบ (ใช้วัดผล) stratify=y รักษาสัดส่วนคลาส, shuffle=False ใช้กับอนุกรมเวลา'),
    gen: (b, G) => {
      Py.need('sklearn.model_selection', 'train_test_split');
      const mode = G.f(b, 'MODE'), y = G.v(b, 'Y');
      const extra = mode === 'stratify' ? `, random_state=${G.f(b, 'RS')}, stratify=${y}` : mode === 'shuffle' ? `, random_state=${G.f(b, 'RS')}` : ', shuffle=False';
      return `${G.v(b, 'XTR')}, ${G.v(b, 'XTE')}, ${G.v(b, 'YTR')}, ${G.v(b, 'YTE')} = train_test_split(\n    ${G.v(b, 'X')}, ${y}, test_size=${Py.num(G.f(b, 'TS'))}${extra}\n)\n`;
    },
    *run(b, I) {
      const X = I.vv(b, 'X'), y = I.vv(b, 'Y'), mode = b.getFieldValue('MODE');
      const opts = { test_size: Number(b.getFieldValue('TS')), random_state: Number(b.getFieldValue('RS')) };
      if (mode === 'stratify') opts.stratify = y; if (mode === 'time') opts.shuffle = false;
      const [a, c, d, e] = PB.trainTestSplit([X, y], opts);
      I.set(I.vname(b, 'XTR'), a); I.set(I.vname(b, 'XTE'), c); I.set(I.vname(b, 'YTR'), d); I.set(I.vname(b, 'YTE'), e);
      I.out.note(TR`train ${PB.nRows(a)} แถว · test ${PB.nRows(c)} แถว`, b);
    },
    ex: (b, X) => { const ts = Number(X.f(b, 'TS')); const mode = X.f(b, 'MODE'); return T(X, `แบ่ง ${X.v(b, 'X')}, ${X.v(b, 'Y')} เป็นชุดฝึก ${Math.round((1 - ts) * 100)}% และชุดทดสอบ ${Math.round(ts * 100)}%` + (mode === 'stratify' ? ' โดยรักษาสัดส่วนของแต่ละคลาสให้เท่ากัน' : mode === 'time' ? ' ตามลำดับเวลา (ไม่สุ่มสลับ)' : ' แบบสุ่ม') + (mode !== 'time' ? ` (random_state=${X.f(b, 'RS')} ทำให้สุ่มได้ผลเดิมทุกครั้ง)` : ''), `split ${X.v(b, 'X')}, ${X.v(b, 'Y')} into ${Math.round((1 - ts) * 100)}% training and ${Math.round(ts * 100)}% test data` + (mode === 'stratify' ? ', keeping class proportions' : mode === 'time' ? ' in time order' : '')); },
  });
  const SCALERS = [['StandardScaler', 'StandardScaler'], ['MinMaxScaler', 'MinMaxScaler'], ['RobustScaler', 'RobustScaler'], ['MaxAbsScaler', 'MaxAbsScaler']];
  const SC_TH = { StandardScaler: 'ปรับให้ค่าเฉลี่ย 0 ส่วนเบี่ยงเบนมาตรฐาน 1', MinMaxScaler: 'ปรับให้อยู่ช่วง 0–1', RobustScaler: 'ปรับด้วยมัธยฐานและช่วงควอร์ไทล์ (ทนค่าผิดปกติ)', MaxAbsScaler: 'หารด้วยค่าสัมบูรณ์มากสุด ให้อยู่ช่วง -1 ถึง 1' }; /* th-en */
  def('pb_scaler', {
    cat: 'prep', out: true, th: TR('ตัวปรับสเกล'), py: '{CLS}().set_output(transform="pandas")', f: { CLS: { t: 'dd', opts: SCALERS } },
    tip: TR('ปรับสเกลตัวเลขให้อยู่ในช่วงใกล้กัน จำเป็นสำหรับ KNN, SVM, โครงข่ายประสาท, KMeans'),
    gen: (b, G) => { Py.need('sklearn.preprocessing', G.f(b, 'CLS')); return `${G.f(b, 'CLS')}().set_output(transform="pandas")`; },
    *run(b) { return new PB[b.getFieldValue('CLS')]().set_output('pandas'); },
    ex: (b, X) => T(X, `ตัวปรับสเกล ${X.f(b, 'CLS')} (${SC_TH[X.f(b, 'CLS')]})`, `a ${X.f(b, 'CLS')} scaler`),
  });
  def('pb_imputer', {
    cat: 'prep', out: true, th: TR('ตัวเติมค่าว่าง'), py: 'SimpleImputer(strategy={S}).set_output(transform="pandas")', f: { S: { t: 'dd', opts: [['"median"', 'median'], ['"mean"', 'mean'], ['"most_frequent"', 'most_frequent']] } },
    tip: TR('เติมค่าว่างทุกคอลัมน์ด้วยค่าสถิติที่เรียนจากชุดฝึก'),
    gen: (b, G) => { Py.need('sklearn.impute', 'SimpleImputer'); return `SimpleImputer(strategy=${Py.str(G.f(b, 'S'))}).set_output(transform="pandas")`; },
    *run(b) { return new PB.SimpleImputer({ strategy: b.getFieldValue('S') }).set_output('pandas'); },
    ex: (b, X) => T(X, `ตัวเติมค่าว่างด้วย ${X.f(b, 'S')}`, `an imputer using the ${X.f(b, 'S')}`),
  });
  def('pb_transform', {
    cat: 'prep', out: true, py: '{M}.{FN}({X})', f: { M: { t: 'var', def: 'scaler' }, FN: { t: 'dd', opts: [['fit_transform', 'fit_transform'], ['transform', 'transform'], ['inverse_transform', 'inverse_transform']] }, X: { t: 'var', def: 'X_train' } },
    tip: TR('fit_transform = เรียนค่าจากข้อมูลแล้วแปลง (ใช้กับชุดฝึก), transform = แปลงด้วยค่าที่เรียนแล้ว (ใช้กับชุดทดสอบ)'),
    gen: (b, G) => `${G.v(b, 'M')}.${G.f(b, 'FN')}(${G.v(b, 'X')})`,
    *run(b, I) {
      const m = I.model(b), fn = b.getFieldValue('FN'), X = I.vv(b, 'X');
      if (typeof m[fn] !== 'function') throw PB.err('AttributeError', `'${m.constructor.pyName}' object has no attribute '${fn}'`, TR`${m.constructor.pyName} ไม่มีเมธอด ${fn}`);
      return yield* PB.gen(m[fn](X));
    },
    ex: (b, X) => T(X, X.f(b, 'FN') === 'fit_transform' ? `${X.v(b, 'X')} ที่ผ่าน ${X.v(b, 'M')} (เรียนค่าแล้วแปลง)` : `${X.v(b, 'X')} ที่แปลงด้วย ${X.v(b, 'M')}`, `${X.v(b, 'X')} transformed by ${X.v(b, 'M')}`),
  });
  def('pb_pipeline', {
    cat: 'prep', out: true, th: TR('ไปป์ไลน์'), py: 'make_pipeline( {@A} , {@B} )', f: { A: {}, B: {} },
    tip: TR('ต่อขั้นตอนเตรียมข้อมูลกับโมเดลเป็นชุดเดียว fit/predict ครั้งเดียวทำทุกขั้น'),
    gen: (b, G) => { Py.need('sklearn.pipeline', 'make_pipeline'); return `make_pipeline(${G.in(b, 'A')}, ${G.in(b, 'B')})`; },
    *run(b, I) {
      const a = yield* I.need(b, 'A'), c = yield* I.need(b, 'B');
      for (const s of [a, c]) if (!(s instanceof PB.Estimator)) throw PB.err('TypeError', 'All intermediate steps should be transformers', TR('ทุกช่องในไปป์ไลน์ต้องเป็นตัวแปลงข้อมูลหรือโมเดล'));
      const steps = [].concat(a instanceof PB.Pipeline ? a.steps : [a], c instanceof PB.Pipeline ? c.steps : [c]);
      return new PB.Pipeline(steps);
    },
    ex: (b, X) => T(X, `ไปป์ไลน์ที่ทำ ${X.in(b, 'A')} แล้วต่อด้วย ${X.in(b, 'B')}`, `a pipeline of ${X.in(b, 'A')} then ${X.in(b, 'B')}`),
  });
  /* ---------- automatic feature selection (SelectKBest) ---------- */
  const SCORE_FN = [[TR('f_classif · ทายกลุ่ม (ANOVA F)'), 'f_classif'], [TR('f_regression · ทายตัวเลข (สหสัมพันธ์)'), 'f_regression'], [TR('chi2 · ค่าไม่ติดลบ เช่น จำนวนนับ'), 'chi2']];
  const SCORE_TH = { f_classif: 'ค่า F ของ ANOVA (ค่าเฉลี่ยแต่ละกลุ่มต่างกันมากแค่ไหน)', f_regression: 'ค่า F จากสหสัมพันธ์กับคำตอบ', chi2: 'ค่าไคสแควร์ (เหมาะกับค่าที่ไม่ติดลบ)' }; /* th-en */
  BK.selectKPy = (fn, k) => { Py.need('sklearn.feature_selection', 'SelectKBest'); Py.need('sklearn.feature_selection', fn); return `SelectKBest(${fn}, k=${k}).set_output(transform="pandas")`; };
  def('pb_selectk', {
    cat: 'prep', out: true, th: TR('เลือกฟีเจอร์อัตโนมัติ'), py: 'SelectKBest({FN}, k={K}).set_output(transform="pandas")', f: { FN: { t: 'dd', opts: SCORE_FN }, K: { t: 'num', def: 3, min: 0, prec: 1 } },
    tip: TR('ให้คะแนนแต่ละฟีเจอร์ว่าเกี่ยวกับคำตอบ y มากแค่ไหน แล้วเก็บไว้เฉพาะ k ฟีเจอร์ที่คะแนนสูงสุด · f_classif ใช้กับงานจำแนกประเภท, f_regression กับงานพยากรณ์ค่า, chi2 กับค่าที่ไม่ติดลบ · ใส่ในไปป์ไลน์ได้'),
    gen: (b, G) => BK.selectKPy(G.f(b, 'FN'), Number(G.f(b, 'K'))),
    *run(b) { return new PB.SelectKBest({ score_func: b.getFieldValue('FN'), k: Number(b.getFieldValue('K')) }).set_output('pandas'); },
    ex: (b, X) => T(X, `ตัวเลือกฟีเจอร์ SelectKBest ที่เก็บ ${X.f(b, 'K')} ฟีเจอร์ซึ่งได้คะแนนสูงสุดตาม${SCORE_TH[X.f(b, 'FN')]}`, `a SelectKBest selector keeping the ${X.f(b, 'K')} best features by ${X.f(b, 'FN')}`),
  });
  def('pb_selectk_fit', {
    cat: 'prep', out: true, th: TR('เลือกฟีเจอร์'), py: '{M}.fit_transform({X}, {Y})', f: { M: { t: 'var', def: 'selector' }, X: { t: 'var', def: 'X_train' }, Y: { t: 'var', def: 'y_train' } },
    tip: TR('ให้คะแนนฟีเจอร์ด้วยข้อมูลฝึก (X, y) แล้วคืนตารางที่เหลือเฉพาะฟีเจอร์ที่ถูกเลือก · ใช้ selector.transform(X_test) กับชุดทดสอบ เพื่อไม่ให้ข้อมูลทดสอบรั่วไปตอนเลือก'),
    gen: (b, G) => `${G.v(b, 'M')}.fit_transform(${G.v(b, 'X')}, ${G.v(b, 'Y')})`,
    *run(b, I) {
      const m = I.model(b);
      if (typeof m.fit_transform !== 'function') throw PB.err('AttributeError', `'${m.constructor.pyName}' object has no attribute 'fit_transform'`, TR`${m.constructor.pyName} ไม่มีเมธอด fit_transform`);
      return yield* PB.gen(m.fit_transform(I.vv(b, 'X'), I.vv(b, 'Y')));
    },
    ex: (b, X) => T(X, `${X.v(b, 'X')} ที่เหลือเฉพาะฟีเจอร์ซึ่ง ${X.v(b, 'M')} เลือกจากคะแนนเทียบกับ ${X.v(b, 'Y')}`, `${X.v(b, 'X')} reduced to the features ${X.v(b, 'M')} picks using ${X.v(b, 'Y')}`),
  });
  BK.featureScoresPy = (m) => {
    Py.need(PD);
    return `pd.DataFrame({"feature": ${m}.feature_names_in_, "score": ${m}.scores_, "p_value": ${m}.pvalues_, "selected": ${m}.get_support()}).sort_values("score", ascending=False)`;
  };
  def('pb_selectk_scores', {
    cat: 'prep', out: true, th: TR('คะแนนของแต่ละฟีเจอร์'), py: '{M}.scores_ · pvalues_ · get_support()', f: { M: { t: 'var', def: 'selector' } },
    tip: TR('ตารางเรียงฟีเจอร์จากคะแนนสูงไปต่ำ: score ยิ่งสูงยิ่งเกี่ยวกับคำตอบมาก, p_value ยิ่งน้อยยิ่งมั่นใจว่าไม่ได้เกิดโดยบังเอิญ, selected = ถูกเลือกหรือไม่'),
    gen: (b, G) => [BK.featureScoresPy(G.v(b, 'M')), python.Order.FUNCTION_CALL],
    *run(b, I) { return PB.featureScoreTable(I.model(b)); },
    ex: (b, X) => T(X, `ตารางคะแนนของแต่ละฟีเจอร์จาก ${X.v(b, 'M')} (score, p_value และถูกเลือกหรือไม่) เรียงจากคะแนนสูงไปต่ำ`, `the score, p-value and selection of every feature in ${X.v(b, 'M')}, best first`),
  });
  def('pb_vectorizer', {
    cat: 'other', out: true, th: TR('แปลงข้อความเป็นตัวเลข'), thBreak: true, py: '{CLS}(analyzer={AN}, ngram_range=({N1}, {N2}))',
    f: { CLS: { t: 'dd', opts: [['TfidfVectorizer', 'TfidfVectorizer'], ['CountVectorizer', 'CountVectorizer']] }, AN: { t: 'dd', opts: [[TR('"char_wb" (ภาษาไทยแบบตัวอักษร)'), 'char_wb'], [TR('"word" + ตัดคำไทย (PyThaiNLP)'), 'thai'], [TR('"word" + ตัดคำไทย + ตัดคำหยุด'), 'thai_nostop'], [TR('"word" (คำที่มีเว้นวรรค)'), 'word'], ['"char"', 'char']] }, N1: { t: 'num', def: 2, min: 1, max: 5, prec: 1 }, N2: { t: 'num', def: 3, min: 1, max: 6, prec: 1 } },
    tip: TR('TF-IDF ให้น้ำหนักคำ/ตัวอักษรที่เด่นในแต่ละข้อความ ภาษาไทยไม่มีเว้นวรรค: ใช้ "char_wb" (ชิ้นตัวอักษร) หรือ "word" + ตัดคำไทยด้วย PyThaiNLP'),
    gen: (b, G) => {
      const c = G.f(b, 'CLS'), an = G.f(b, 'AN'); Py.need('sklearn.feature_extraction.text', c);
      if (an === 'thai' || an === 'thai_nostop') return `${c}(analyzer="word", tokenizer=${BK.thaiTokenizerPy(an === 'thai' ? 'thai_tokenize' : 'thai_tokenize_nostop')}, token_pattern=None, ngram_range=(${G.f(b, 'N1')}, ${G.f(b, 'N2')}))`;
      return `${c}(analyzer=${Py.str(an)}, ngram_range=(${G.f(b, 'N1')}, ${G.f(b, 'N2')}))`;
    },
    *run(b) {
      const n1 = Number(b.getFieldValue('N1')), n2 = Number(b.getFieldValue('N2')), an = b.getFieldValue('AN');
      if (n1 > n2) throw PB.err('ValueError', 'Invalid value for ngram_range', TR('ngram_range ตัวแรกต้องไม่มากกว่าตัวหลัง'));
      const thai = an === 'thai' || an === 'thai_nostop';
      return new PB[b.getFieldValue('CLS')]({ analyzer: thai ? 'word' : an, tokenizer: thai ? (an === 'thai' ? 'thai_tokenize' : 'thai_tokenize_nostop') : null, ngram_range: new PB.Tuple([n1, n2]) });
    },
    ex: (b, X) => { const an = X.f(b, 'AN'), w = an === 'word' || an === 'thai' || an === 'thai_nostop'; return T(X, `ตัวแปลงข้อความ ${X.f(b, 'CLS')} ที่${an === 'thai' || an === 'thai_nostop' ? 'ตัดคำไทยด้วย PyThaiNLP' + (an === 'thai_nostop' ? ' (ตัดคำหยุดออก)' : '') + ' แล้วใช้' : 'ตัดข้อความเป็น'}ชิ้นละ ${X.f(b, 'N1')}–${X.f(b, 'N2')} ${w ? 'คำ' : 'ตัวอักษร'}`, `a ${X.f(b, 'CLS')} using ${X.f(b, 'N1')}–${X.f(b, 'N2')} ${w ? 'word' : 'character'} n-grams${an === 'thai' || an === 'thai_nostop' ? ' over Thai words (PyThaiNLP)' : ''}`); },
  });
  def('pb_to_frame', {
    cat: 'prep', out: true, th: TR('ทำเป็นตาราง'), py: 'pd.DataFrame({@ARR}, columns=[{NAMES}])', f: { ARR: {}, NAMES: { t: 'text', def: 'PC1, PC2' } },
    tip: TR('ห่ออาร์เรย์ (เช่น ผลจาก PCA) เป็น DataFrame พร้อมตั้งชื่อคอลัมน์'),
    gen: (b, G) => { Py.need(PD); return `pd.DataFrame(${G.in(b, 'ARR')}, columns=${Py.list(BK.splitCols(G.f(b, 'NAMES')))})`; },
    *run(b, I) {
      const a = yield* I.need(b, 'ARR'), names = BK.splitCols(b.getFieldValue('NAMES'));
      let rows;
      if (a instanceof PB.DataFrame) rows = a.columns.length ? PB.range(a.nrows).map((i) => a.columns.map((c) => a._data.get(c)[i])) : [];
      else if (a instanceof PB.NDArray) rows = a.shape.length === 2 ? a.data.map((r) => Array.from(r)) : Array.from(a.data, (v) => [v]);
      else if (Array.isArray(a)) rows = a.map((r) => (Array.isArray(r) ? r.map(PB.unbox) : [PB.unbox(r)]));
      else throw PB.err('ValueError', 'DataFrame constructor not properly called!', TR('ต้องใส่อาร์เรย์หรือลิสต์'));
      const w = rows[0] ? rows[0].length : names.length;
      if (names.length !== w) throw PB.err('ValueError', `Shape of passed values is (${rows.length}, ${w}), indices imply (${rows.length}, ${names.length})`, TR`ข้อมูลมี ${w} คอลัมน์ แต่ตั้งชื่อไว้ ${names.length} ชื่อ`);
      if (a instanceof PB.NDArray && a.dtype === 'float64') return PB.DataFrame.fromColumns(Object.fromEntries(names.map((n, j) => [n, { values: rows.map((r) => r[j]), dtype: 'float64' }])), names);
      return PB.DataFrame.fromRows(rows, names);
    },
    ex: (b, X) => T(X, `ตารางที่มีคอลัมน์ ${X.f(b, 'NAMES')} จาก${X.in(b, 'ARR')}`, `a DataFrame with columns ${X.f(b, 'NAMES')} built from ${X.in(b, 'ARR')}`),
  });

  /* ======================= model constructors ======================= */
  /* [class, category, Thai name, params, description, flags]  param: [name, kind, default, options] */
  const MODELS = [
    ['LogisticRegression', 'cls', TR('การถดถอยโลจิสติก'), [['C', 'num', 1.0], ['max_iter', 'int', 1000]], TR('โมเดลเส้นตรงที่ให้ความน่าจะเป็นของแต่ละคลาส ฝึกเร็ว อธิบายผลได้ เหมาะเป็นโมเดลตั้งต้น'), { scale: true }],
    ['KNeighborsClassifier', 'cls', TR('เพื่อนบ้านใกล้สุด (KNN)'), [['n_neighbors', 'int', 5], ['weights', 'choice', 'uniform', ['uniform', 'distance']]], TR('ทายคลาสจากเสียงข้างมากของข้อมูลที่ใกล้ที่สุด k ตัว เข้าใจง่าย แต่ต้องปรับสเกลก่อน'), { scale: true }],
    ['DecisionTreeClassifier', 'cls', TR('ต้นไม้ตัดสินใจ'), [['max_depth', 'none_int', 'None'], ['random_state', 'int', 42]], TR('สร้างกฎ ถ้า–แล้ว ที่อ่านเข้าใจได้ ถ้าต้นไม้ลึกเกินไปจะจำข้อมูลฝึก (overfit)'), {}],
    ['RandomForestClassifier', 'cls', TR('ป่าสุ่ม (Random Forest)'), [['n_estimators', 'int', 100], ['max_depth', 'none_int', 'None'], ['random_state', 'int', 42]], TR('รวมต้นไม้ตัดสินใจหลายต้นมาโหวต แม่นยำ ทนทาน ไม่ต้องปรับสเกล และบอกความสำคัญของฟีเจอร์ได้'), {}],
    ['GradientBoostingClassifier', 'cls', TR('เกรเดียนต์บูสติ้ง'), [['n_estimators', 'int', 100], ['learning_rate', 'num', 0.1], ['max_depth', 'int', 3], ['random_state', 'int', 42]], TR('สร้างต้นไม้เล็กทีละต้นเพื่อแก้จุดที่ทายผิด มักแม่นยำสูง แต่ฝึกนานกว่า'), { slow: true }],
    ['SVC', 'cls', TR('ซัพพอร์ตเวกเตอร์แมชชีน (SVM)'), [['C', 'num', 1.0], ['kernel', 'choice', 'rbf', ['rbf', 'linear', 'poly', 'sigmoid']]], TR('หาขอบเขตแบ่งคลาสที่ห่างจากข้อมูลมากที่สุด เก่งกับข้อมูลขนาดกลาง ต้องปรับสเกล'), { scale: true }],
    ['GaussianNB', 'cls', TR('นาอีฟเบย์ (Gaussian)'), [], TR('ใช้ทฤษฎีความน่าจะเป็นของเบย์ ฝึกเร็วมาก ใช้ได้ดีแม้ข้อมูลน้อย'), {}],
    ['MultinomialNB', 'cls', TR('นาอีฟเบย์ (สำหรับข้อความ)'), [['alpha', 'num', 1.0]], TR('คิดจากความถี่ของคำหรือตัวอักษร เหมาะกับการจำแนกข้อความ (ข้อมูลต้องไม่ติดลบ)'), { text: true }],
    ['MLPClassifier', 'cls', TR('โครงข่ายประสาทเทียม (MLP)'), [['hidden_layer_sizes', 'tuple', '(100,)'], ['max_iter', 'int', 300], ['random_state', 'int', 42]], TR('ชั้นของเซลล์ประสาทเทียมที่เรียนรู้รูปแบบซับซ้อน ต้องปรับสเกล และใช้เวลาฝึก'), { scale: true, slow: true }],
    ['LinearRegression', 'reg', TR('การถดถอยเชิงเส้น'), [], TR('หาสมการเส้นตรงที่ใกล้ข้อมูลที่สุด เร็ว อธิบายได้ด้วยค่าสัมประสิทธิ์ (coef_)'), {}],
    ['Ridge', 'reg', TR('ริดจ์ (เส้นตรง + L2)'), [['alpha', 'num', 1.0]], TR('การถดถอยเชิงเส้นที่ลงโทษค่าสัมประสิทธิ์ใหญ่ ลดการ overfit เมื่อฟีเจอร์สัมพันธ์กันสูง'), { scale: true }],
    ['Lasso', 'reg', TR('ลาสโซ (เส้นตรง + L1)'), [['alpha', 'num', 0.1]], TR('ทำให้สัมประสิทธิ์ของฟีเจอร์ที่ไม่สำคัญเป็นศูนย์ ช่วยคัดเลือกฟีเจอร์'), { scale: true }],
    ['ElasticNet', 'reg', TR('อีลาสติกเน็ต (L1 + L2)'), [['alpha', 'num', 0.1], ['l1_ratio', 'num', 0.5]], TR('ผสมข้อดีของ Ridge และ Lasso'), { scale: true }],
    ['KNeighborsRegressor', 'reg', TR('เพื่อนบ้านใกล้สุด (KNN)'), [['n_neighbors', 'int', 5], ['weights', 'choice', 'uniform', ['uniform', 'distance']]], TR('เฉลี่ยค่าจากข้อมูลที่ใกล้ที่สุด k ตัว ต้องปรับสเกล'), { scale: true }],
    ['DecisionTreeRegressor', 'reg', TR('ต้นไม้ตัดสินใจ'), [['max_depth', 'none_int', 'None'], ['random_state', 'int', 42]], TR('แบ่งข้อมูลเป็นช่วง ๆ ตามกฎ ถ้า–แล้ว และใช้ค่าเฉลี่ยของแต่ละช่วง'), {}],
    ['RandomForestRegressor', 'reg', TR('ป่าสุ่ม (Random Forest)'), [['n_estimators', 'int', 100], ['max_depth', 'none_int', 'None'], ['random_state', 'int', 42]], TR('เฉลี่ยคำทำนายของต้นไม้หลายต้น แม่นยำ ทนทาน ไม่ต้องปรับสเกล'), {}],
    ['GradientBoostingRegressor', 'reg', TR('เกรเดียนต์บูสติ้ง'), [['n_estimators', 'int', 100], ['learning_rate', 'num', 0.1], ['max_depth', 'int', 3], ['random_state', 'int', 42]], TR('ต้นไม้เล็กหลายต้นที่ค่อย ๆ แก้ส่วนที่ทายพลาด มักแม่นยำสูง'), { slow: true }],
    ['SVR', 'reg', TR('ซัพพอร์ตเวกเตอร์รีเกรสชัน (SVR)'), [['C', 'num', 1.0], ['kernel', 'choice', 'rbf', ['rbf', 'linear', 'poly']], ['epsilon', 'num', 0.1]], TR('หาฟังก์ชันที่ผิดพลาดไม่เกินระยะ epsilon ต้องปรับสเกลทั้ง X'), { scale: true }],
    ['MLPRegressor', 'reg', TR('โครงข่ายประสาทเทียม (MLP)'), [['hidden_layer_sizes', 'tuple', '(100,)'], ['max_iter', 'int', 500], ['random_state', 'int', 42]], TR('โครงข่ายประสาทสำหรับพยากรณ์ตัวเลข ต้องปรับสเกล ใช้เวลาฝึก'), { scale: true, slow: true }],
    ['KMeans', 'clu', TR('เคมีนส์ (K-Means)'), [['n_clusters', 'int', 3], ['random_state', 'int', 42]], TR('แบ่งข้อมูลเป็น k กลุ่มตามระยะใกล้จุดศูนย์กลาง ต้องกำหนดจำนวนกลุ่มเอง ควรปรับสเกล'), { scale: true }],
    ['AgglomerativeClustering', 'clu', TR('จัดกลุ่มแบบลำดับชั้น'), [['n_clusters', 'int', 3], ['linkage', 'choice', 'ward', ['ward', 'complete', 'average', 'single']]], TR('รวมจุดที่ใกล้กันทีละคู่จนเหลือ k กลุ่ม ไม่สุ่ม ผลคงที่'), { scale: true }],
    ['DBSCAN', 'clu', TR('DBSCAN (ตามความหนาแน่น)'), [['eps', 'num', 0.5], ['min_samples', 'int', 5]], TR('หากลุ่มจากบริเวณที่จุดหนาแน่น ไม่ต้องกำหนดจำนวนกลุ่ม จุดที่ไม่อยู่กลุ่มใดได้ป้าย -1'), { scale: true }],
    ['PCA', 'clu', TR('วิเคราะห์องค์ประกอบหลัก (PCA)'), [['n_components', 'int', 2]], TR('บีบหลายคอลัมน์ให้เหลือ 2–3 มิติที่เก็บความแปรปรวนไว้มากที่สุด ใช้วาดกราฟหรือลดฟีเจอร์'), { scale: true }],
    ['IsolationForest', 'other', TR('ป่าแยกตัว (หาค่าผิดปกติ)'), [['contamination', 'auto_num', 'auto'], ['random_state', 'int', 42]], TR('หาจุดที่แยกออกจากกลุ่มได้ง่าย ผลลัพธ์ -1 = ผิดปกติ, 1 = ปกติ'), {}],
  ];
  BK.MODELS = MODELS.map(([cls, cat, th, params, desc, flags]) => ({ cls, cat, th, params, desc, flags, type: 'pb_m_' + cls, task: { cls: 'classification', reg: 'regression', clu: cls === 'PCA' ? 'pca' : 'clustering', other: 'anomaly' }[cat] }));
  BK.modelInfo = (cls) => BK.MODELS.find((m) => m.cls === cls);
  const pyParam = (kind, v) => {
    if (kind === 'choice') return Py.str(v);
    if (kind === 'tuple') return v;
    if (kind === 'auto_num') return v === 'auto' ? '"auto"' : Py.num(v);
    return String(v);
  };
  const INT_MIN = { random_state: 0 };
  function checkParam(cls, name, kind, v) {
    if (kind === 'none_int') {
      if (v === null || v === undefined) return null;
      if (!Number.isInteger(v) || v < 1) throw PB.err('ValueError', `The '${name}' parameter of ${cls} must be an int in the range [1, inf) or None. Got ${PB.repr(v)} instead.`, TR`${name} ต้องเป็นจำนวนเต็มตั้งแต่ 1 หรือ None`);
      return v;
    }
    if (kind === 'int') {
      const lo = INT_MIN[name] ?? 1;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < lo) throw PB.err('ValueError', `The '${name}' parameter of ${cls} must be an int in the range [${lo}, inf). Got ${PB.repr(v)} instead.`, TR`${name} ต้องเป็นจำนวนเต็มตั้งแต่ ${lo} ขึ้นไป แต่ได้ ${PB.repr(v)}`);
      return v;
    }
    if (kind === 'num') {
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw PB.err('ValueError', `The '${name}' parameter of ${cls} must be a float in the range [0, inf). Got ${PB.repr(v)} instead.`, TR`${name} ต้องเป็นตัวเลขที่ไม่ติดลบ`);
      if ((name === 'C' || name === 'eps' || name === 'learning_rate') && v === 0) throw PB.err('ValueError', `The '${name}' parameter of ${cls} must be > 0.`, TR`${name} ต้องมากกว่า 0`);
      return v;
    }
    return v;
  }
  const isInputKind = (kind) => kind === 'int' || kind === 'num' || kind === 'none_int';
  BK.modelShadows = (cls) => {
    const M = BK.modelInfo(cls), inputs = {};
    for (const [name, kind, dflt] of M.params) {
      if (!isInputKind(kind)) continue;
      inputs['P_' + name.toUpperCase()] = { shadow: kind === 'none_int' ? { type: 'logic_null' } : { type: 'math_number', fields: { NUM: dflt } } };
    }
    return inputs;
  };
  for (const M of BK.MODELS) {
    const f = {};
    const parts = M.params.map(([name, kind, dflt, opts]) => {
      const key = 'P_' + name.toUpperCase();
      if (isInputKind(kind)) { f[key] = {}; return `${name}={@${key}}`; }
      if (kind === 'choice') f[key] = { t: 'dd', opts: opts.map((o) => ['"' + o + '"', o]) };
      else if (kind === 'auto_num') f[key] = { t: 'dd', opts: [['"auto"', 'auto'], ['0.01', '0.01'], ['0.05', '0.05'], ['0.1', '0.1']] };
      else f[key] = { t: 'text', def: dflt };
      return `${name}={${key}}`;
    });
    def(M.type, {
      cat: M.cat, out: true, th: M.th, thBreak: M.params.length > 0, py: `${M.cls}(${parts.join(', ')})`, f,
      tip: M.desc,
      init() {
        for (const [name, kind] of M.params) {
          if (kind !== 'tuple') continue;
          this.getField('P_' + name.toUpperCase()).setValidator((v) => { const nums = String(v).match(/\d+/g); if (!nums || nums.some((n) => +n < 1)) return null; return '(' + nums.join(', ') + (nums.length === 1 ? ',' : '') + ')'; });
        }
      },
      gen: (b, G) => {
        Py.need(PB[M.cls].module, M.cls);
        return `${M.cls}(${M.params.map(([name, kind, dflt]) => { const key = 'P_' + name.toUpperCase(); return `${name}=${isInputKind(kind) ? G.in(b, key, python.Order.NONE, kind === 'none_int' ? 'None' : String(dflt)) : pyParam(kind, b.getFieldValue(key))}`; }).join(', ')})`;
      },
      *run(b, I) {
        const p = {};
        for (const [name, kind, dflt] of M.params) {
          const key = 'P_' + name.toUpperCase();
          if (isInputKind(kind)) { let v = yield* I.val(b, key, kind === 'none_int' ? null : dflt); if (typeof v === 'boolean') v = +v; p[name] = checkParam(M.cls, name, kind, v); }
          else if (kind === 'tuple') p[name] = new PB.Tuple((String(b.getFieldValue(key)).match(/\d+/g) || ['100']).map(Number));
          else if (kind === 'auto_num') { const v = b.getFieldValue(key); p[name] = v === 'auto' ? 'auto' : Number(v); }
          else p[name] = b.getFieldValue(key);
        }
        return new PB[M.cls](p);
      },
      ex: (b, X) => {
        const ps = M.params.map(([name, kind]) => { const key = 'P_' + name.toUpperCase(); return `${name}=${isInputKind(kind) ? X.in(b, key).trim() : b.getFieldValue(key)}`; }).join(', ');
        return T(X, `โมเดล ${M.cls} หรือ "${M.th}"${ps ? ' ตั้งค่า ' + ps : ''}`, `a ${M.cls} model${ps ? ' with ' + ps : ''}`);
      },
    });
  }

  /* ======================= train / predict ======================= */
  const asEst = (v, name) => { if (!(v instanceof PB.Estimator)) throw PB.err('AttributeError', `'${PB.typeName(v)}' object has no attribute 'fit'`, TR`${name} ไม่ใช่โมเดล`); return v; };
  def('pb_fit', {
    cat: 'train', th: TR('ฝึกโมเดล'), py: '{M}.fit({X}, {Y})', f: { M: { t: 'var', def: 'model' }, X: { t: 'var', def: 'X_train' }, Y: { t: 'var', def: 'y_train' } },
    tip: TR('ให้โมเดลเรียนรู้ความสัมพันธ์ระหว่างฟีเจอร์ X กับคำตอบ y'),
    gen: (b, G) => `${G.v(b, 'M')}.fit(${G.v(b, 'X')}, ${G.v(b, 'Y')})\n`,
    *run(b, I) { const m = I.model(b); yield* PB.gen(m.fit(I.vv(b, 'X'), I.vv(b, 'Y'))); I.out.note(TR`ฝึก ${m.constructor.pyName} เสร็จแล้ว`, b); },
    ex: (b, X) => T(X, `ฝึกโมเดล ${X.v(b, 'M')} ด้วยฟีเจอร์ ${X.v(b, 'X')} และคำตอบ ${X.v(b, 'Y')}`, `train ${X.v(b, 'M')} on ${X.v(b, 'X')} and ${X.v(b, 'Y')}`),
  });
  def('pb_fit_x', {
    cat: 'train', th: TR('ฝึก (ไม่มีคำตอบ)'), py: '{M}.fit({X})', f: { M: { t: 'var', def: 'model' }, X: { t: 'var', def: 'X' } },
    tip: TR('สำหรับงานไม่มีคำตอบ เช่น จัดกลุ่ม, PCA, ตัวปรับสเกล'),
    gen: (b, G) => `${G.v(b, 'M')}.fit(${G.v(b, 'X')})\n`,
    *run(b, I) { const m = I.model(b); yield* PB.gen(m.fit(I.vv(b, 'X'))); I.out.note(TR`ฝึก ${m.constructor.pyName} เสร็จแล้ว`, b); },
    ex: (b, X) => T(X, `ให้ ${X.v(b, 'M')} เรียนรู้รูปแบบจาก ${X.v(b, 'X')} (ไม่มีคำตอบ)`, `fit ${X.v(b, 'M')} on ${X.v(b, 'X')} (no labels)`),
  });
  const PRED = [['predict', 'predict'], ['predict_proba', 'predict_proba'], ['fit_predict', 'fit_predict'], ['transform', 'transform'], ['fit_transform', 'fit_transform'], ['decision_function', 'decision_function']];
  const PRED_TH = { predict: 'ผลทำนาย', predict_proba: 'ความน่าจะเป็นของแต่ละคลาส', fit_predict: 'ป้ายกลุ่มหลังฝึก', transform: 'ข้อมูลที่แปลงแล้ว', fit_transform: 'ข้อมูลที่เรียนและแปลงแล้ว', decision_function: 'คะแนนการตัดสินใจ' }; /* th-en */
  def('pb_predict', {
    cat: 'train', out: true, th: TR('ทำนาย'), py: '{M}.{FN}({X})', f: { M: { t: 'var', def: 'model' }, FN: { t: 'dd', opts: PRED }, X: { t: 'var', def: 'X_test' } },
    tip: TR('predict = ทายคำตอบ, predict_proba = ความน่าจะเป็น, fit_predict = ฝึกและให้ป้ายกลุ่ม'),
    gen: (b, G) => `${G.v(b, 'M')}.${G.f(b, 'FN')}(${G.v(b, 'X')})`,
    *run(b, I) {
      const m = I.model(b), fn = b.getFieldValue('FN');
      if (typeof m[fn] !== 'function') throw PB.err('AttributeError', `'${m.constructor.pyName}' object has no attribute '${fn}'`, TR`${m.constructor.pyName} ไม่มีเมธอด ${fn}()`, fn === 'predict_proba' ? TR('predict_proba ใช้ได้กับโมเดลจำแนกประเภทบางตัว') : TR('ลองเลือกเมธอดอื่น'));
      let r = yield* PB.gen(m[fn](I.vv(b, 'X')));
      return r;
    },
    ex: (b, X) => T(X, `${PRED_TH[X.f(b, 'FN')]}ของ ${X.v(b, 'M')} สำหรับ ${X.v(b, 'X')}`, `${X.v(b, 'M')}.${X.f(b, 'FN')} on ${X.v(b, 'X')}`),
  });
  def('pb_score', {
    cat: 'train', out: true, th: TR('คะแนน'), py: '{M}.score({X}, {Y})', f: { M: { t: 'var', def: 'model' }, X: { t: 'var', def: 'X_test' }, Y: { t: 'var', def: 'y_test' } },
    tip: TR('จำแนกประเภท = accuracy, พยากรณ์ค่า = R²'),
    gen: (b, G) => `${G.v(b, 'M')}.score(${G.v(b, 'X')}, ${G.v(b, 'Y')})`,
    *run(b, I) { return PB.toFloat(I.model(b).score(I.vv(b, 'X'), I.vv(b, 'Y'))); },
    ex: (b, X) => T(X, `คะแนนของ ${X.v(b, 'M')} บน ${X.v(b, 'X')} (accuracy หรือ R²)`, `the score of ${X.v(b, 'M')} on ${X.v(b, 'X')}`),
  });
  const ATTRS = ['feature_importances_', 'coef_', 'intercept_', 'classes_', 'labels_', 'cluster_centers_', 'inertia_', 'explained_variance_ratio_', 'components_', 'n_iter_', 'feature_names_in_', 'scores_', 'pvalues_'];
  const ATTR_TH = { feature_importances_: 'ความสำคัญของแต่ละฟีเจอร์', coef_: 'ค่าสัมประสิทธิ์', intercept_: 'ค่าจุดตัดแกน', classes_: 'รายชื่อคลาส', labels_: 'ป้ายกลุ่มของแต่ละแถว', cluster_centers_: 'จุดศูนย์กลางของแต่ละกลุ่ม', inertia_: 'ผลรวมระยะห่างภายในกลุ่ม (inertia)', explained_variance_ratio_: 'สัดส่วนความแปรปรวนที่แต่ละองค์ประกอบอธิบายได้', components_: 'องค์ประกอบหลัก', n_iter_: 'จำนวนรอบที่ใช้ฝึก', feature_names_in_: 'ชื่อฟีเจอร์ที่ใช้ฝึก', scores_: 'คะแนนของแต่ละฟีเจอร์', pvalues_: 'ค่า p ของแต่ละฟีเจอร์' }; /* th-en */
  def('pb_attr', {
    cat: 'train', out: true, th: TR('ค่าในโมเดล'), py: '{M}.{ATTR}', f: { M: { t: 'var', def: 'model' }, ATTR: { t: 'dd', opts: ATTRS.map((a) => [a, a]) } },
    tip: TR('อ่านค่าที่โมเดลเรียนรู้แล้ว (ต้อง fit ก่อน)'),
    gen: (b, G) => [`${G.v(b, 'M')}.${G.f(b, 'ATTR')}`, python.Order.MEMBER],
    *run(b, I) {
      const m = I.model(b), a = b.getFieldValue('ATTR');
      if (a === 'feature_names_in_') { m._needFit(a); if (!m.feature_names_in_) throw PB.err('AttributeError', `'${m.constructor.pyName}' object has no attribute 'feature_names_in_'`, TR('โมเดลถูกฝึกด้วยข้อมูลที่ไม่มีชื่อคอลัมน์')); return new PB.NDArray(m.feature_names_in_.slice(), undefined, 'object'); }
      const target = m instanceof PB.Pipeline ? ((a === 'scores_' || a === 'pvalues_') && m.steps.find((st) => st instanceof PB.SelectKBest)) || m.final : m;
      const v = target[a];
      if (v === undefined) {
        if (!target.fitted) target._needFit(a);
        throw PB.err('AttributeError', `'${target.constructor.pyName}' object has no attribute '${a}'`, TR`${target.constructor.pyName} ไม่มีค่า ${a}`, a === 'feature_importances_' ? TR('ใช้ได้กับโมเดลต้นไม้ เช่น RandomForest, DecisionTree, GradientBoosting') : a === 'coef_' ? TR('ใช้ได้กับโมเดลเส้นตรง เช่น LinearRegression, LogisticRegression') : TR('เลือกค่าที่โมเดลนี้มี'));
      }
      if (a === 'classes_') return new PB.NDArray(v.slice(), undefined, PB.inferDtype(v));
      if (typeof v === 'number' && (a === 'inertia_' || a === 'intercept_')) return PB.toFloat(v);
      return v;
    },
    ex: (b, X) => T(X, `${ATTR_TH[X.f(b, 'ATTR')]}ของ ${X.v(b, 'M')}`, `${X.v(b, 'M')}.${X.f(b, 'ATTR')}`),
  });
  const CV_SCORING = [['None', 'None'], ['"accuracy"', 'accuracy'], ['"f1_macro"', 'f1_macro'], ['"r2"', 'r2'], ['"neg_mean_absolute_error"', 'neg_mean_absolute_error']];
  def('pb_cv', {
    cat: 'train', out: true, th: TR('ตรวจไขว้'), py: 'cross_val_score( {@M} , {X}, {Y}, cv={K}, scoring={SC} )', f: { M: {}, X: { t: 'var', def: 'X' }, Y: { t: 'var', def: 'y' }, K: { t: 'num', def: 5, min: 2, max: 20, prec: 1 }, SC: { t: 'dd', opts: CV_SCORING } },
    tip: TR('แบ่งข้อมูลเป็น k ส่วน ฝึก/ทดสอบสลับกัน k รอบ ได้คะแนน k ค่า วัดผลได้น่าเชื่อถือกว่าแบ่งครั้งเดียว (โมเดลจำแนกประเภทแบ่งแบบรักษาสัดส่วนคลาสให้อัตโนมัติ)'),
    gen: (b, G) => { Py.need('sklearn.model_selection', 'cross_val_score'); const sc = G.f(b, 'SC'); return `cross_val_score(${G.in(b, 'M')}, ${G.v(b, 'X')}, ${G.v(b, 'Y')}, cv=${G.f(b, 'K')}${sc && sc !== 'None' ? `, scoring=${Py.str(sc)}` : ''})`; },
    *run(b, I) { const m = asEst(yield* I.need(b, 'M'), TR('ช่องโมเดล')), sc = b.getFieldValue('SC'); return yield* PB.crossValScore(m, I.vv(b, 'X'), I.vv(b, 'Y'), Number(b.getFieldValue('K')), sc && sc !== 'None' ? sc : null); },
    ex: (b, X) => T(X, `คะแนน cross-validation ${X.f(b, 'K')} รอบของ${X.in(b, 'M')}`, `${X.f(b, 'K')}-fold cross-validation scores of ${X.in(b, 'M')}`),
  });
  const COMPARE_PY = TR`def compare_models(models, X_train, y_train, X_test, y_test):
    """ฝึกและวัดผลหลายโมเดลด้วยข้อมูลชุดเดียวกัน แล้วคืนตารางคะแนน"""
    rows = []
    for model in models:
        name = type(model[-1] if hasattr(model, "steps") else model).__name__
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        if is_classifier(model):
            rows.append({"model": name,
                         "accuracy": accuracy_score(y_test, y_pred),
                         "f1_macro": f1_score(y_test, y_pred, average="macro")})
        else:
            rows.append({"model": name,
                         "r2": r2_score(y_test, y_pred),
                         "mae": mean_absolute_error(y_test, y_pred)})
    table = pd.DataFrame(rows)
    return table.sort_values(table.columns[1], ascending=False).reset_index(drop=True)`;
  def('pb_compare', {
    cat: 'train', th: TR('เปรียบเทียบโมเดล'), thBreak: true, py: '{RES} = compare_models( {@MODELS} ,\n{XTR}, {YTR}, {XTE}, {YTE} )',
    f: { RES: { t: 'var', def: 'results' }, MODELS: {}, XTR: { t: 'var', def: 'X_train' }, YTR: { t: 'var', def: 'y_train' }, XTE: { t: 'var', def: 'X_test' }, YTE: { t: 'var', def: 'y_test' } },
    tip: TR('ใส่ลิสต์ของโมเดล แล้วได้ตารางคะแนนเรียงจากดีที่สุด'),
    gen: (b, G) => {
      Py.need(PD); Py.need('sklearn.base', 'is_classifier'); ['accuracy_score', 'f1_score', 'r2_score', 'mean_absolute_error'].forEach((n) => Py.need('sklearn.metrics', n));
      Py.helper('compare_models', COMPARE_PY);
      return `${G.v(b, 'RES')} = compare_models(\n    ${G.in(b, 'MODELS', python.Order.NONE, '[]')},\n    ${G.v(b, 'XTR')}, ${G.v(b, 'YTR')}, ${G.v(b, 'XTE')}, ${G.v(b, 'YTE')},\n)\n`;
    },
    *run(b, I) {
      let models = yield* I.need(b, 'MODELS');
      if (!Array.isArray(models)) models = [models];
      const Xtr = I.vv(b, 'XTR'), ytr = I.vv(b, 'YTR'), Xte = I.vv(b, 'XTE'), yte = I.vv(b, 'YTE');
      const rows = [];
      for (let i = 0; i < models.length; i++) {
        const m = asEst(models[i], TR`สมาชิกลำดับที่ ${i + 1} ในลิสต์`);
        const name = (m instanceof PB.Pipeline ? m.final : m).constructor.pyName;
        yield { progress: TR`กำลังฝึก ${name} (${i + 1}/${models.length})`, frac: i / models.length };
        yield* PB.gen(m.fit(Xtr, ytr));
        const p = PB.runMaybe(m.predict(Xte));
        if (m.kind === 'classifier') rows.push([name, PB.metrics.accuracy_score(yte, p), PB.metrics.f1_score(yte, p, 'macro')]);
        else rows.push([name, PB.metrics.r2_score(yte, p), PB.metrics.mean_absolute_error(yte, p)]);
      }
      const cls = rows.length && models[0].kind === 'classifier';
      const names = cls ? ['model', 'accuracy', 'f1_macro'] : ['model', 'r2', 'mae'];
      let df = PB.DataFrame.fromColumns({ [names[0]]: { values: rows.map((r) => r[0]), dtype: 'object' }, [names[1]]: { values: rows.map((r) => r[1]), dtype: 'float64' }, [names[2]]: { values: rows.map((r) => r[2]), dtype: 'float64' } }, names);
      df = df.sort_values(df.columns[1], false).reset_index(true);
      I.set(I.vname(b, 'RES'), df);
    },
    ex: (b, X) => T(X, `ฝึกและวัดผลโมเดลทุกตัวใน${X.in(b, 'MODELS')} แล้วเก็บตารางคะแนนไว้ใน ${X.v(b, 'RES')}`, `train and score every model in ${X.in(b, 'MODELS')}, store the table in ${X.v(b, 'RES')}`),
  });
  function parsePyDict(s) {
    const src = String(s).trim();
    if (!/^\{[\s\S]*\}$/.test(src)) throw PB.err('SyntaxError', 'invalid syntax', TR('ข้อมูลต้องอยู่ในรูป {"คอลัมน์": ค่า, ...}'));
    const body = src.slice(1, -1).trim(); const out = new Map();
    if (!body) return out;
    const re = /\s*(?:"([^"]*)"|'([^']*)')\s*:\s*("([^"]*)"|'([^']*)'|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|True|False|None)\s*(,|$)/gy;
    let m, pos = 0;
    while (pos < body.length && (m = re.exec(body))) {
      const k = m[1] ?? m[2]; let v = m[3];
      if (m[4] !== undefined) v = m[4]; else if (m[5] !== undefined) v = m[5]; else if (v === 'True') v = true; else if (v === 'False') v = false; else if (v === 'None') v = null; else v = Number(v);
      out.set(k, v); pos = re.lastIndex;
    }
    if (pos < body.length) throw PB.err('SyntaxError', 'invalid syntax', TR('อ่านข้อมูลแถวใหม่ไม่ได้ ตรวจเครื่องหมาย " : , ให้ถูกต้อง'));
    return out;
  }
  def('pb_predict_row', {
    cat: 'train', out: true, th: TR('ทำนายข้อมูลใหม่'), thBreak: true, py: '{M}.predict(pd.DataFrame([ {ROW} ]))[0]', f: { M: { t: 'var', def: 'model' }, ROW: { t: 'text', def: '{"sepal_length": 5.1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2}' } },
    tip: TR('ใส่ค่าของแถวใหม่ในรูป dictionary ของ Python ชื่อคอลัมน์ต้องตรงกับตอนฝึก'),
    gen: (b, G) => { Py.need(PD); return [`${G.v(b, 'M')}.predict(pd.DataFrame([${G.f(b, 'ROW')}]))[0]`, python.Order.MEMBER]; },
    *run(b, I) {
      const m = I.model(b), d = parsePyDict(b.getFieldValue('ROW'));
      const df = PB.DataFrame.fromRows([Array.from(d.values())], Array.from(d.keys()));
      const p = PB.runMaybe(m.predict(df));
      if (p instanceof PB.NDArray) return p.dtype === 'float64' ? PB.toFloat(p.data[0]) : p.data[0];
      return p;
    },
    ex: (b, X) => T(X, `ผลทำนายของ ${X.v(b, 'M')} สำหรับข้อมูลใหม่ ${X.f(b, 'ROW')}`, `${X.v(b, 'M')}'s prediction for the new row ${X.f(b, 'ROW')}`),
  });
  def('pb_predict_text', {
    cat: 'train', out: true, th: TR('ทำนายข้อความใหม่'), py: '{M}.predict([ {TEXT} ])[0]', f: { M: { t: 'var', def: 'model' }, TEXT: { t: 'text', def: 'อาหารอร่อย ส่งไว ประทับใจ' } }, /* th-data */
    tip: TR('ทายผลของข้อความใหม่ด้วยโมเดลข้อความ (ไปป์ไลน์ Vectorizer + โมเดล)'),
    gen: (b, G) => [`${G.v(b, 'M')}.predict([${Py.str(G.f(b, 'TEXT'))}])[0]`, python.Order.MEMBER],
    *run(b, I) { const m = I.model(b); const p = PB.runMaybe(m.predict([b.getFieldValue('TEXT')])); return p.data[0]; },
    ex: (b, X) => T(X, `ผลทำนายของ ${X.v(b, 'M')} สำหรับข้อความ "${X.f(b, 'TEXT')}"`, `${X.v(b, 'M')}'s prediction for "${X.f(b, 'TEXT')}"`),
  });
  const FORECAST_PY = TR`def forecast_next(model, series, n_lags, steps):
    """พยากรณ์ต่อไปทีละช่วง โดยใช้ค่าที่ทำนายได้เป็นค่าย้อนหลัง (lag) ของช่วงถัดไป"""
    history = list(series)
    preds = []
    for _ in range(steps):
        row = {f"lag_{i}": history[-i] for i in range(1, n_lags + 1)}
        y_next = float(model.predict(pd.DataFrame([row]))[0])
        preds.append(y_next)
        history.append(y_next)
    return preds`;
  def('pb_forecast', {
    cat: 'train', out: true, th: TR('พยากรณ์ล่วงหน้า'), thBreak: true, py: 'forecast_next({M}, {DF}[{COL}], n_lags={L}, steps={S})', f: { M: { t: 'var', def: 'model' }, DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, L: { t: 'num', def: 12, min: 1, prec: 1 }, S: { t: 'num', def: 12, min: 1, max: 120, prec: 1 } },
    tip: TR('ใช้โมเดลที่ฝึกด้วยคอลัมน์ lag_1..lag_n ทำนายอนาคตทีละช่วงต่อกันไป'),
    gen: (b, G) => { Py.need(PD); Py.helper('forecast_next', FORECAST_PY); return `forecast_next(${G.v(b, 'M')}, ${G.v(b, 'DF')}[${G.col(b, 'COL')}], n_lags=${G.f(b, 'L')}, steps=${G.f(b, 'S')})`; },
    *run(b, I) {
      const m = I.model(b), s = I.df(b).col(I.colName(b)), L = Number(b.getFieldValue('L')), S = Number(b.getFieldValue('S'));
      const hist = s.values.slice(), preds = [];
      const cols = PB.range(L).map((i) => 'lag_' + (i + 1));
      for (let t = 0; t < S; t++) {
        const row = cols.map((c, i) => hist[hist.length - 1 - i]);
        if (row.some(PB.isMissing)) throw PB.err('ValueError', 'Input X contains NaN.', TR('ข้อมูลย้อนหลังมีค่าว่าง'), TR('ตรวจสอบคอลัมน์ที่ใช้พยากรณ์'));
        const p = PB.runMaybe(m.predict(PB.DataFrame.fromRows([row], cols)));
        const v = Number(p.data[0]); preds.push(v); hist.push(v);
      }
      return preds.map(PB.toFloat);
    },
    ex: (b, X) => T(X, `ค่าพยากรณ์ ${X.f(b, 'S')} ช่วงถัดไปของ ${X.f(b, 'COL')} จากโมเดล ${X.v(b, 'M')}`, `the next ${X.f(b, 'S')} forecasts of ${X.f(b, 'COL')} from ${X.v(b, 'M')}`),
  });

  /* ======================= metrics ======================= */
  const METRICS = [
    ['accuracy_score', 'accuracy_score', 'ความแม่นยำ (สัดส่วนที่ทายถูก)', 'accuracy'], /* th-en */
    ['precision_score (macro)', 'precision', 'ความเที่ยง (precision เฉลี่ยทุกคลาส)', 'macro precision'], /* th-en */
    ['recall_score (macro)', 'recall', 'ความครบถ้วน (recall เฉลี่ยทุกคลาส)', 'macro recall'], /* th-en */
    ['f1_score (macro)', 'f1', 'ค่า F1 เฉลี่ยทุกคลาส', 'macro F1 score'], /* th-en */
    ['confusion_matrix', 'confusion_matrix', 'ตารางความสับสน (จริง × ทำนาย)', 'confusion matrix'], /* th-en */
    ['r2_score', 'r2_score', 'ค่า R² (1 = ทำนายได้สมบูรณ์)', 'R² score'], /* th-en */
    ['mean_absolute_error', 'mean_absolute_error', 'ค่าคลาดเคลื่อนสัมบูรณ์เฉลี่ย (MAE)', 'mean absolute error'], /* th-en */
    ['mean_squared_error', 'mean_squared_error', 'ค่าคลาดเคลื่อนกำลังสองเฉลี่ย (MSE)', 'mean squared error'], /* th-en */
    ['RMSE', 'rmse', 'รากของค่าคลาดเคลื่อนกำลังสองเฉลี่ย (RMSE)', 'root mean squared error'], /* th-en */
    ['mean_absolute_percentage_error', 'mape', 'ค่าคลาดเคลื่อนเป็นสัดส่วนเฉลี่ย (MAPE)', 'mean absolute percentage error'], /* th-en */
    ['adjusted_rand_score', 'adjusted_rand_score', 'ความสอดคล้องของกลุ่มกับคำตอบจริง (ARI)', 'adjusted Rand index'], /* th-en */
  ];
  def('pb_metric', {
    cat: 'metric', out: true, th: TR('วัดผล'), py: '{FN}({YT}, {YP})', f: { FN: { t: 'dd', opts: METRICS.map((m) => [m[0], m[1]]) }, YT: { t: 'var', def: 'y_test' }, YP: { t: 'var', def: 'y_pred' } },
    tip: TR('เทียบคำตอบจริงกับค่าที่ทำนาย จำแนกประเภทใช้ accuracy/F1 พยากรณ์ค่าใช้ R²/MAE'),
    gen: (b, G) => {
      const fn = G.f(b, 'FN'), yt = G.v(b, 'YT'), yp = G.v(b, 'YP');
      const mk = (name, extra = '') => { Py.need('sklearn.metrics', name); return [`${name}(${yt}, ${yp}${extra})`, python.Order.FUNCTION_CALL]; };
      if (fn === 'precision') return mk('precision_score', ', average="macro"');
      if (fn === 'recall') return mk('recall_score', ', average="macro"');
      if (fn === 'f1') return mk('f1_score', ', average="macro"');
      if (fn === 'rmse') { Py.need('sklearn.metrics', 'mean_squared_error'); return [`mean_squared_error(${yt}, ${yp}) ** 0.5`, python.Order.EXPONENTIATION]; }
      if (fn === 'mape') return mk('mean_absolute_percentage_error');
      return mk(fn);
    },
    *run(b, I) {
      const fn = b.getFieldValue('FN'), yt = I.vv(b, 'YT'), yp = I.vv(b, 'YP'), M = PB.metrics;
      const r = (() => {
        switch (fn) {
          case 'precision': return M.precision_score(yt, yp, 'macro');
          case 'recall': return M.recall_score(yt, yp, 'macro');
          case 'f1': return M.f1_score(yt, yp, 'macro');
          case 'rmse': return M.root_mean_squared_error(yt, yp);
          case 'mape': return M.mean_absolute_percentage_error(yt, yp);
          default: return M[fn](yt, yp);
        }
      })();
      return typeof r === 'number' ? PB.toFloat(r) : r;
    },
    ex: (b, X) => { const m = METRICS.find((x) => x[1] === X.f(b, 'FN')); return T(X, `${m[2]} ระหว่างคำตอบจริง ${X.v(b, 'YT')} กับค่าทำนาย ${X.v(b, 'YP')}`, `the ${m[3]} between ${X.v(b, 'YT')} and ${X.v(b, 'YP')}`); },
  });
  def('pb_report', {
    cat: 'metric', out: true, th: TR('รายงานผลจำแนก'), py: 'classification_report({YT}, {YP})', f: { YT: { t: 'var', def: 'y_test' }, YP: { t: 'var', def: 'y_pred' } },
    tip: TR('precision, recall, f1-score ของทุกคลาสในตารางเดียว'),
    gen: (b, G) => { Py.need('sklearn.metrics', 'classification_report'); return `classification_report(${G.v(b, 'YT')}, ${G.v(b, 'YP')})`; },
    *run(b, I) { return PB.metrics.classification_report(I.vv(b, 'YT'), I.vv(b, 'YP')); },
    ex: (b, X) => T(X, `รายงาน precision / recall / F1 ของแต่ละคลาส`, 'a per-class precision / recall / F1 report'),
  });
  def('pb_silhouette', {
    cat: 'metric', out: true, th: TR('คุณภาพการจัดกลุ่ม'), py: 'silhouette_score({X}, {L})', f: { X: { t: 'var', def: 'X' }, L: { t: 'var', def: 'labels' } },
    tip: TR('ค่าระหว่าง -1 ถึง 1 ยิ่งใกล้ 1 กลุ่มยิ่งแยกกันชัด'),
    gen: (b, G) => { Py.need('sklearn.metrics', 'silhouette_score'); return `silhouette_score(${G.v(b, 'X')}, ${G.v(b, 'L')})`; },
    *run(b, I) { return PB.toFloat(PB.metrics.silhouette_score(I.vv(b, 'X'), I.vv(b, 'L'))); },
    ex: (b, X) => T(X, `ค่า silhouette ที่บอกว่ากลุ่ม ${X.v(b, 'L')} แยกจากกันชัดแค่ไหน`, `the silhouette score of the clusters ${X.v(b, 'L')}`),
  });
  def('pb_arr_stat', {
    cat: 'metric', out: true, py: '{@X} .{FN}()', f: { X: {}, FN: { t: 'dd', opts: [['mean', 'mean'], ['std', 'std'], ['min', 'min'], ['max', 'max'], ['sum', 'sum']] } },
    tip: TR('สรุปอาร์เรย์ของ numpy เช่น คะแนน cross-validation'),
    gen: (b, G) => [`${G.in(b, 'X', python.Order.MEMBER)}.${G.f(b, 'FN')}()`, python.Order.FUNCTION_CALL],
    *run(b, I) {
      const x = yield* I.need(b, 'X'), fn = b.getFieldValue('FN');
      const fl = (r, dt) => (typeof r === 'number' && (fn === 'mean' || fn === 'std' || dt === 'float64') ? PB.toFloat(r) : r);
      if (x instanceof PB.NDArray) return fl(x[fn](), x.dtype);
      if (x instanceof PB.Series) return fl(fn === 'std' ? x.std() : x[fn](), x.dtype);
      throw PB.err('AttributeError', `'${PB.typeName(x)}' object has no attribute '${fn}'`, TR`${PB.typeName(x)} ไม่มีเมธอด .${fn}()`, PB.typeName(x) === 'list' ? TR('ลิสต์ของ Python ใช้บล็อก "คณิต: ผลรวม/ค่าเฉลี่ยของลิสต์" แทน') : '');
    },
    ex: (b, X) => T(X, `${{ mean: 'ค่าเฉลี่ย', std: 'ส่วนเบี่ยงเบนมาตรฐาน', min: 'ค่าต่ำสุด', max: 'ค่าสูงสุด', sum: 'ผลรวม' }[X.f(b, 'FN')]}ของ${X.in(b, 'X')}`, `the ${X.f(b, 'FN')} of ${X.in(b, 'X')}`),
  });
})();
