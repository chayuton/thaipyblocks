/* ThaiPyBlocks: model selection blocks (GridSearchCV, cross-validation comparison) and Thai text blocks
   (word segmentation with PyThaiNLP, word counts). */
(function () {
  const BK = PB.blocks, def = BK.def, Py = PB.py, T = BK.T;
  const PD = 'import pandas as pd';
  const asEst = (v, name) => { if (!(v instanceof PB.Estimator)) throw PB.err('AttributeError', `'${PB.typeName(v)}' object has no attribute 'fit'`, TR`${name} ไม่ใช่โมเดล`, TR('ใส่บล็อกโมเดล หรือตัวแปรที่เก็บโมเดลไว้')); return v; };

  /* ======================= GridSearchCV ======================= */
  const SCORING = [['None (accuracy / R²)', 'None'], ['"accuracy"', 'accuracy'], ['"f1_macro"', 'f1_macro'], ['"r2"', 'r2'], ['"neg_mean_absolute_error"', 'neg_mean_absolute_error'], ['"neg_root_mean_squared_error"', 'neg_root_mean_squared_error']];
  const SC_TH = { None: 'คะแนนมาตรฐานของโมเดล (accuracy หรือ R²)', accuracy: 'accuracy', f1_macro: 'F1 เฉลี่ยทุกคลาส', r2: 'R²', neg_mean_absolute_error: 'MAE (ติดลบ ยิ่งใกล้ 0 ยิ่งดี)', neg_root_mean_squared_error: 'RMSE (ติดลบ ยิ่งใกล้ 0 ยิ่งดี)' }; /* th-en */
  /* the grid text is Python; show it in Thai explanations as "ชื่อ: ค่า, ค่า" */
  const gridSummary = (src) => {
    try {
      const g = PB.pyLiteral(src), one = (m) => Array.from(m.entries()).map(([k, v]) => `${k} = ${(Array.isArray(v) ? v : [v]).map(PB.repr).join(', ')}`).join(' และ '); /* th-en */
      return Array.isArray(g) ? g.map(one).join(' หรือ ') : one(g); /* th-en */
    } catch (e) { return src; }
  };
  def('pb_grid', {
    cat: 'train', out: true, th: TR('ค้นหาพารามิเตอร์ที่ดีที่สุด'), thBreak: true, py: 'GridSearchCV( {@M} ,\nparam_grid={GRID} ,\ncv={CV}, scoring={SC} )',
    f: { M: {}, GRID: { t: 'text', def: '{"n_neighbors": [3, 5, 7, 9, 11]}' }, CV: { t: 'num', def: 5, min: 2, max: 20, prec: 1 }, SC: { t: 'dd', opts: SCORING } },
    tip: TR('ลองทุกชุดค่าใน param_grid วัดผลแต่ละชุดด้วย cross-validation แล้วเลือกชุดที่คะแนนเฉลี่ยดีที่สุด (ถ้าโมเดลอยู่ในไปป์ไลน์ ชื่อพารามิเตอร์คือ ชื่อขั้นตอน__ชื่อพารามิเตอร์ เช่น svc__C)'),
    gen: (b, G) => {
      Py.need('sklearn.model_selection', 'GridSearchCV');
      const sc = G.f(b, 'SC');
      return [`GridSearchCV(\n    ${G.in(b, 'M', python.Order.NONE, 'None')},\n    param_grid=${G.f(b, 'GRID')},\n    cv=${G.f(b, 'CV')},${sc !== 'None' ? `\n    scoring=${Py.str(sc)},` : ''}\n)`, python.Order.FUNCTION_CALL];
    },
    *run(b, I) {
      const m = asEst(yield* I.need(b, 'M'), TR('ช่องโมเดลของ GridSearchCV'));
      const grid = PB.pyLiteral(b.getFieldValue('GRID')), sc = b.getFieldValue('SC');
      return new PB.GridSearchCV(m, grid, { cv: Number(b.getFieldValue('CV')), scoring: sc === 'None' ? null : sc });
    },
    ex: (b, X) => T(X, `ตัวค้นหาค่าพารามิเตอร์ของ${X.in(b, 'M')} ที่ลองทุกชุดค่า (${gridSummary(X.f(b, 'GRID'))}) แล้ววัดผลแต่ละชุดด้วย cross-validation ${X.f(b, 'CV')} รอบ ใช้${SC_TH[X.f(b, 'SC')]}เป็นคะแนน`,
      `a grid search over ${X.in(b, 'M')} trying every combination of ${X.f(b, 'GRID')} with ${X.f(b, 'CV')}-fold cross-validation`),
  });
  const GATTR = [['best_params_', 'best_params_'], ['best_score_', 'best_score_'], ['best_estimator_', 'best_estimator_'], [TR('cv_results_ (ตาราง)'), 'cv_results_']];
  const GATTR_TH = { best_params_: 'ชุดพารามิเตอร์ที่ดีที่สุด', best_score_: 'คะแนน cross-validation เฉลี่ยของชุดที่ดีที่สุด', best_estimator_: 'โมเดลที่ดีที่สุด (ฝึกใหม่กับข้อมูลทั้งหมดแล้ว)', cv_results_: 'ตารางคะแนนของทุกชุดค่าพร้อมอันดับ' }; /* th-en */
  def('pb_grid_attr', {
    cat: 'train', out: true, th: TR('ผลการค้นหา'), py: '{G}.{ATTR}', f: { G: { t: 'var', def: 'grid' }, ATTR: { t: 'dd', opts: GATTR } },
    tip: TR('อ่านผลจาก GridSearchCV หลัง fit แล้ว'),
    gen: (b, G) => {
      const a = G.f(b, 'ATTR'), g = G.v(b, 'G');
      if (a === 'cv_results_') { Py.need(PD); return [`pd.DataFrame(${g}.cv_results_)[["params", "mean_test_score", "std_test_score", "rank_test_score"]]`, python.Order.MEMBER]; }
      return [`${g}.${a}`, python.Order.MEMBER];
    },
    *run(b, I) {
      const g = I.model(b, 'G'), a = b.getFieldValue('ATTR');
      if (!(g instanceof PB.GridSearchCV)) throw PB.err('AttributeError', `'${g.constructor.pyName}' object has no attribute '${a}'`, TR`${I.vname(b, 'G')} ไม่ใช่ GridSearchCV`, TR('สร้างตัวแปรด้วยบล็อก "ค้นหาพารามิเตอร์ที่ดีที่สุด" แล้ว fit ก่อน'));
      if (!g.fitted) throw PB.err('AttributeError', `'GridSearchCV' object has no attribute '${a}'`, TR('ยังไม่ได้ fit ตัวค้นหา จึงยังไม่มีผล'), TR`วางบล็อก ${I.vname(b, 'G')}.fit(X_train, y_train) ก่อนบล็อกนี้`);
      if (a === 'best_params_') return g.best_params_;
      if (a === 'best_score_') return PB.toFloat(g.best_score_);
      if (a === 'best_estimator_') return g._best('best_estimator_');
      return g.cvResultsFrame();
    },
    ex: (b, X) => T(X, `${GATTR_TH[X.f(b, 'ATTR')]}จาก ${X.v(b, 'G')}`, `${X.v(b, 'G')}.${X.f(b, 'ATTR')}`),
  });

  /* ======================= compare models with cross-validation ======================= */
  const COMPARE_CV_PY = TR`def compare_models_cv(models, X, y, cv=5):
    """วัดผลหลายโมเดลด้วย cross-validation (แบ่งข้อมูล cv ส่วน สลับกันเป็นชุดทดสอบ) แล้วคืนตารางคะแนนเฉลี่ย"""
    rows = []
    for model in models:
        name = type(model[-1] if hasattr(model, "steps") else model).__name__
        scores = cross_val_score(model, X, y, cv=cv)
        rows.append({"model": name, "mean_score": scores.mean(), "std_score": scores.std()})
    table = pd.DataFrame(rows)
    return table.sort_values("mean_score", ascending=False).reset_index(drop=True)`;
  def('pb_compare_cv', {
    cat: 'train', th: TR('เปรียบเทียบโมเดลแบบ cross-validation'), thBreak: true, py: '{RES} = compare_models_cv( {@MODELS} ,\n{X}, {Y}, cv={CV} )',
    f: { RES: { t: 'var', def: 'results' }, MODELS: {}, X: { t: 'var', def: 'X' }, Y: { t: 'var', def: 'y' }, CV: { t: 'num', def: 5, min: 2, max: 20, prec: 1 } },
    tip: TR('วัดทุกโมเดลในลิสต์ด้วย cross-validation ชุดเดียวกัน ได้ตารางคะแนนเฉลี่ยและส่วนเบี่ยงเบน เรียงจากดีที่สุด'),
    gen: (b, G) => {
      Py.need(PD); Py.need('sklearn.model_selection', 'cross_val_score');
      Py.helper('compare_models_cv', COMPARE_CV_PY);
      return `${G.v(b, 'RES')} = compare_models_cv(\n    ${G.in(b, 'MODELS', python.Order.NONE, '[]')},\n    ${G.v(b, 'X')}, ${G.v(b, 'Y')}, cv=${G.f(b, 'CV')},\n)\n`;
    },
    *run(b, I) {
      let models = yield* I.need(b, 'MODELS');
      if (!Array.isArray(models)) models = [models];
      const X = I.vv(b, 'X'), y = I.vv(b, 'Y'), cv = Number(b.getFieldValue('CV'));
      const rows = [];
      for (let i = 0; i < models.length; i++) {
        const m = asEst(models[i], TR`สมาชิกลำดับที่ ${i + 1} ในลิสต์`);
        const name = (m instanceof PB.Pipeline ? m.final : m).constructor.pyName;
        yield { progress: `cross-validation ${name} (${i + 1}/${models.length})`, frac: i / models.length };
        const sc = yield* PB.crossValScore(m, X, y, cv);
        rows.push([name, sc.mean(), sc.std()]);
      }
      const names = ['model', 'mean_score', 'std_score'];
      let df = PB.DataFrame.fromColumns({ model: { values: rows.map((r) => r[0]), dtype: 'object' }, mean_score: { values: rows.map((r) => r[1]), dtype: 'float64' }, std_score: { values: rows.map((r) => r[2]), dtype: 'float64' } }, names);
      df = df.sort_values('mean_score', false).reset_index(true);
      I.set(I.vname(b, 'RES'), df);
    },
    ex: (b, X) => T(X, `วัดผลทุกโมเดลใน${X.in(b, 'MODELS')} ด้วย cross-validation ${X.f(b, 'CV')} รอบ แล้วเก็บตารางคะแนนเฉลี่ยไว้ใน ${X.v(b, 'RES')}`, `cross-validate every model in ${X.in(b, 'MODELS')} (${X.f(b, 'CV')} folds) and store the table in ${X.v(b, 'RES')}`),
  });

  /* ======================= one value from a table ======================= */
  def('pb_cell', {
    cat: 'data', out: true, th: TR('ค่าในแถว'), py: '{DF}[{COL}].iloc[{N}]', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, N: { t: 'num', def: 0, min: 0, prec: 1 } },
    tip: TR('ค่าเดียวจากคอลัมน์ที่แถวตำแหน่ง N (เริ่มนับที่ 0 แบบ Python)'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}].iloc[${G.f(b, 'N')}]`, python.Order.MEMBER],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), n = Number(b.getFieldValue('N'));
      if (n >= s.length) throw PB.err('IndexError', 'single positional indexer is out-of-bounds', TR`ตำแหน่ง ${n} เกินจำนวนแถว (มี ${s.length} แถว นับ 0 ถึง ${s.length - 1})`);
      const v = s.values[n];
      return s.dtype === 'float64' ? PB.toFloat(v) : v;
    },
    ex: (b, X) => T(X, `ค่าในคอลัมน์ ${X.f(b, 'COL')} แถวตำแหน่งที่ ${X.f(b, 'N')}`, `the value of column ${X.f(b, 'COL')} at row position ${X.f(b, 'N')}`),
  });

  /* ======================= Thai text ======================= */
  const TOK_PY = TR`def thai_tokenize(text):
    """ตัดคำภาษาไทยด้วย PyThaiNLP (engine newmm) โดยไม่เก็บช่องว่าง"""
    return word_tokenize(text, engine="newmm", keep_whitespace=False)`;
  const TOK_NOSTOP_PY = TR`THAI_STOPWORDS = thai_stopwords()


def thai_tokenize_nostop(text):
    """ตัดคำภาษาไทยแล้วตัดคำหยุด (คำที่พบบ่อยแต่ไม่ค่อยมีความหมาย เช่น ที่ และ ของ) ออก"""
    return [w for w in thai_tokenize(text) if w not in THAI_STOPWORDS]`;
  /* the other PyThaiNLP tokenizers (version 3.8): word engines longest / mm, syllables and Thai Character Clusters */
  const ENG_WORD = [['"newmm"', 'newmm'], ['"longest"', 'longest'], ['"mm"', 'mm']];
  const ENG_ALL = [[TR('ตัดคำ newmm'), 'newmm'], [TR('ตัดคำ longest'), 'longest'], [TR('ตัดคำ mm'), 'mm'], [TR('ตัดพยางค์'), 'syllable'], [TR('หน่วยอักษร TCC'), 'tcc']];
  const ENG_TH = { newmm: 'ตัดคำด้วยพจนานุกรม (newmm)', longest: 'ตัดคำแบบเลือกคำยาวที่สุดก่อน (longest)', mm: 'ตัดคำแบบ mm', syllable: 'ตัดเป็นพยางค์', tcc: 'ตัดเป็นหน่วยอักษรไทย (TCC)' }; /* th-en */
  BK.thaiTokens = (text, eng = 'newmm', keepWs = false) => {
    if (typeof text !== 'string') return [];
    const o = { keepWhitespace: keepWs };
    return eng === 'syllable' ? PB.thai.syllables(text, o) : eng === 'tcc' ? PB.thai.tccTokenize(text, o) : PB.thai.wordTokenize(text, Object.assign({ engine: eng }, o));
  };
  /* one Python call per engine: word_tokenize(engine=...), syllable_tokenize(engine="dict"), subword_tokenize(engine="tcc") */
  BK.thaiTokenCall = (arg, eng, kw) => {
    if (eng === 'syllable') { Py.need('pythainlp.tokenize', 'syllable_tokenize'); return `syllable_tokenize(${arg}, engine="dict", keep_whitespace=${kw})`; }
    if (eng === 'tcc') { Py.need('pythainlp.tokenize', 'subword_tokenize'); return `subword_tokenize(${arg}, engine="tcc", keep_whitespace=${kw})`; }
    Py.need('pythainlp.tokenize', 'word_tokenize');
    return `word_tokenize(${arg}, engine=${Py.str(eng)}, keep_whitespace=${kw})`;
  };
  const TOK_DOC = { longest: TR('ตัดคำภาษาไทยด้วย PyThaiNLP (engine longest) โดยไม่เก็บช่องว่าง'), mm: TR('ตัดคำภาษาไทยด้วย PyThaiNLP (engine mm) โดยไม่เก็บช่องว่าง'), syllable: TR('ตัดข้อความภาษาไทยเป็นพยางค์ด้วย PyThaiNLP โดยไม่เก็บช่องว่าง'), tcc: TR('ตัดข้อความภาษาไทยเป็นหน่วยอักษร (Thai Character Cluster) โดยไม่เก็บช่องว่าง') };
  const TOK_NAME = { longest: 'thai_tokenize_longest', mm: 'thai_tokenize_mm', syllable: 'thai_syllables', tcc: 'thai_tcc' };
  /* register the Python helper for a tokenizer name (and engine) and return the function name used in the code */
  BK.thaiTokenizerPy = (name, eng = 'newmm') => {
    const nostop = name === 'thai_tokenize_nostop';
    if (eng === 'newmm') {
      Py.need('pythainlp.tokenize', 'word_tokenize');
      Py.helper('thai_tokenize', TOK_PY);
      /* THAI_STOPWORDS is written once: the newmm helper carries it unless another engine wrote it first */
      if (nostop) { Py.need('pythainlp.corpus', 'thai_stopwords'); Py.helper('thai_tokenize_nostop', Py.helpers.has('THAI_STOPWORDS') ? TOK_NOSTOP_PY.slice(TOK_NOSTOP_PY.indexOf('def ')) : TOK_NOSTOP_PY); }
      return name;
    }
    const base = TOK_NAME[eng];
    Py.helper(base, [`def ${base}(text):`, '    """' + TOK_DOC[eng] + '"""', `    return ${BK.thaiTokenCall('text', eng, 'False')}`].join('\n'));
    if (!nostop) return base;
    Py.need('pythainlp.corpus', 'thai_stopwords');
    if (!Py.helpers.has('thai_tokenize_nostop')) Py.helper('THAI_STOPWORDS', 'THAI_STOPWORDS = thai_stopwords()');
    Py.helper(base + '_nostop', [`def ${base}_nostop(text):`, TR('    """ตัดข้อความแล้วตัดคำหยุด (คำที่พบบ่อยแต่ไม่ค่อยมีความหมาย เช่น ที่ และ ของ) ออก"""'), `    return [w for w in ${base}(text) if w not in THAI_STOPWORDS]`].join('\n'));
    return base + '_nostop';
  };
  const tokenizeValue = (v, nostop, eng = 'newmm') => {
    if (typeof v !== 'string') return [];
    const t = BK.thaiTokens(v, eng, false);
    return nostop ? PB.thai.removeStopwords(t) : t;
  };
  def('pb_th_tokenize', {
    cat: 'other', out: true, th: TR('ตัดคำไทย'), py: 'word_tokenize( {@TEXT} , engine={ENG}, keep_whitespace={KW} )',
    f: { TEXT: {}, ENG: { t: 'dd', opts: ENG_WORD }, KW: { t: 'dd', opts: [['False', 'False'], ['True', 'True']] } },
    tip: TR('แบ่งข้อความภาษาไทยเป็นคำด้วยพจนานุกรม (PyThaiNLP) ได้ผลเป็นลิสต์ของคำ · engine: "newmm" ตัดตามพจนานุกรมและขอบเขตตัวอักษร (แนะนำ), "longest" เลือกคำที่ยาวที่สุดก่อน (ตัวอักษรอังกฤษเป็นตัวพิมพ์เล็ก), "mm" ช่วงที่ตัดได้หลายแบบรวมเป็นชิ้นเดียว · keep_whitespace=True เก็บช่องว่างไว้เป็นคำด้วย'),
    gen: (b, G) => BK.thaiTokenCall(G.in(b, 'TEXT', python.Order.NONE, '""'), G.f(b, 'ENG') || 'newmm', G.f(b, 'KW')),
    *run(b, I) {
      const t = yield* I.need(b, 'TEXT');
      return BK.thaiTokens(t, b.getFieldValue('ENG') || 'newmm', b.getFieldValue('KW') === 'True');
    },
    ex: (b, X) => T(X, `ลิสต์ของคำที่ได้จากการ${ENG_TH[X.f(b, 'ENG') || 'newmm']}${X.in(b, 'TEXT')}${X.f(b, 'KW') === 'True' ? ' (เก็บช่องว่างไว้ด้วย)' : ''}`, `the Thai words of ${X.in(b, 'TEXT')}${(X.f(b, 'ENG') || 'newmm') !== 'newmm' ? ` (engine ${X.f(b, 'ENG')})` : ''}`),
  });
  const SUBFN = [['syllable_tokenize · engine="dict"', 'syllable'], ['subword_tokenize · engine="tcc"', 'tcc']];
  def('pb_th_subword', {
    cat: 'other', out: true, th: TR('ตัดพยางค์ / หน่วยอักษรไทย'), py: '{FN} ( {@TEXT} , keep_whitespace={KW} )',
    f: { FN: { t: 'dd', opts: SUBFN }, TEXT: {}, KW: { t: 'dd', opts: [['False', 'False'], ['True', 'True']] } },
    tip: TR('แบ่งข้อความภาษาไทยให้ละเอียดกว่าคำ: พยางค์ (เช่น "ประเทศ" → "ประ", "เทศ") หรือหน่วยอักษรที่แยกจากกันไม่ได้ (Thai Character Cluster เช่น "กิ", "น") ใช้กับข้อความที่สะกดผิดหรือคำที่ไม่มีในพจนานุกรม'),
    gen: (b, G) => BK.thaiTokenCall(G.in(b, 'TEXT', python.Order.NONE, '""'), G.f(b, 'FN'), G.f(b, 'KW')),
    *run(b, I) { const t = yield* I.need(b, 'TEXT'); return BK.thaiTokens(t, b.getFieldValue('FN'), b.getFieldValue('KW') === 'True'); },
    ex: (b, X) => T(X, `ลิสต์ที่ได้จากการ${ENG_TH[X.f(b, 'FN')]}ของ${X.in(b, 'TEXT')}${X.f(b, 'KW') === 'True' ? ' (เก็บช่องว่างไว้ด้วย)' : ''}`, `${X.in(b, 'TEXT')} split into ${X.f(b, 'FN') === 'tcc' ? 'Thai character clusters' : 'syllables'}`),
  });
  const TOKFN = [[TR('thai_tokenize (ตัดคำ)'), 'thai_tokenize'], [TR('thai_tokenize_nostop (ตัดคำ + ตัดคำหยุด)'), 'thai_tokenize_nostop']];
  def('pb_th_tokens', {
    cat: 'other', out: true, th: TR('ตัดคำทั้งคอลัมน์'), py: '{DF}[{COL}].apply({FN}) · {ENG}', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, FN: { t: 'dd', opts: TOKFN }, ENG: { t: 'dd', opts: ENG_ALL } },
    tip: TR('ตัดคำข้อความทุกแถวในคอลัมน์ ได้คอลัมน์ใหม่ที่แต่ละแถวเป็นลิสต์ของคำ ตัดคำหยุด = ตัดคำทั่วไปอย่าง "ที่ และ ของ" ออก · เลือกวิธีตัดได้: newmm (แนะนำ), longest, mm, พยางค์ หรือหน่วยอักษร TCC ของ PyThaiNLP'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}].apply(${BK.thaiTokenizerPy(G.f(b, 'FN'), G.f(b, 'ENG') || 'newmm')})`, python.Order.FUNCTION_CALL],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b)), nostop = b.getFieldValue('FN') === 'thai_tokenize_nostop', eng = b.getFieldValue('ENG') || 'newmm';
      yield { progress: TR('กำลังตัดคำภาษาไทย…') };
      return s._new(s.values.map((v) => tokenizeValue(v, nostop, eng)), { dtype: 'object' });
    },
    ex: (b, X) => { const eng = X.f(b, 'ENG') || 'newmm'; return T(X, `ข้อความในคอลัมน์ ${X.f(b, 'COL')} ที่${eng === 'newmm' ? 'ตัดเป็นคำ' : ENG_TH[eng].replace(/[)A-Za-z]$/, '$& ')}แล้วทุกแถว${X.f(b, 'FN') === 'thai_tokenize_nostop' ? ' (ตัดคำหยุดออก)' : ''}`, `column ${X.f(b, 'COL')} split into Thai ${eng === 'syllable' ? 'syllables' : eng === 'tcc' ? 'character clusters' : 'words'}${eng !== 'newmm' && eng !== 'syllable' && eng !== 'tcc' ? ` (engine ${eng})` : ''}`); },
  });
  def('pb_word_count', {
    cat: 'other', out: true, th: TR('นับคำที่พบบ่อย'), py: '{DF}[{COL}].explode().value_counts().head({N})', f: { DF: { t: 'var', def: 'df' }, COL: { t: 'col' }, N: { t: 'num', def: 10, min: 1, max: 200, prec: 1 } },
    tip: TR('ใช้กับคอลัมน์ที่ตัดคำแล้ว: explode แยกทุกคำเป็นแถว แล้วนับจำนวนครั้งของแต่ละคำ'),
    gen: (b, G) => [`${G.v(b, 'DF')}[${G.col(b, 'COL')}].explode().value_counts().head(${G.f(b, 'N')})`, python.Order.FUNCTION_CALL],
    *run(b, I) {
      const s = I.df(b).col(I.colName(b));
      /* pandas accepts any column (a string is not exploded), so only hint when nothing was tokenized */
      if (!s.values.some((v) => Array.isArray(v))) PB.warn(`column ${s.name} has no lists of words`, TR`คอลัมน์ ${s.name} ยังไม่ได้ตัดคำ จึงนับทั้งข้อความแทนคำ — ใช้บล็อก "ตัดคำทั้งคอลัมน์" สร้างคอลัมน์คำก่อน`);
      return s.explode().value_counts().head(Number(b.getFieldValue('N')));
    },
    ex: (b, X) => T(X, `${X.f(b, 'N')} คำที่พบบ่อยที่สุดในคอลัมน์ ${X.f(b, 'COL')} พร้อมจำนวนครั้ง`, `the ${X.f(b, 'N')} most frequent words in column ${X.f(b, 'COL')}`),
  });
})();
