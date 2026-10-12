/* ThaiPyBlocks: builds complete block programs from a choice of data type, task, data and models.
   Used by the model wizard and by the sample projects. Output = Blockly JSON serialization. */
(function () {
  const BK = PB.blocks;
  const R = {};
  const V = (name) => ({ name });
  R.b = (type, fields = {}, inputs = {}, extra) => {
    const o = { type, fields: {} };
    for (const [k, v] of Object.entries(fields)) o.fields[k] = v;
    const ins = {};
    for (const [k, v] of Object.entries(inputs)) if (v) ins[k] = v.type ? { block: v } : v;
    if (Object.keys(ins).length) o.inputs = ins;
    if (extra) Object.assign(o, extra);
    return o;
  };
  R.set = (name, val) => R.b('variables_set', { VAR: V(name) }, { VALUE: val });
  R.get = (name) => R.b('variables_get', { VAR: V(name) });
  R.print = (val) => R.b('text_print', {}, { TEXT: val });
  R.print2 = (label, val) => R.b('pb_print2', { LABEL: label }, { VAL: val });
  R.num = (n) => R.b('math_number', { NUM: n });
  R.text = (t) => R.b('text', { TEXT: t });
  R.list = (items) => { const o = R.b('lists_create_with', {}, {}, { extraState: { itemCount: items.length } }); o.inputs = {}; items.forEach((it, i) => { o.inputs['ADD' + i] = { block: it }; }); return o; };
  R.model = (cls, vals = {}) => {
    const M = BK.modelInfo(cls), inputs = {}, fields = {};
    for (const [name, kind, dflt] of M.params) {
      const key = 'P_' + name.toUpperCase(), has = Object.prototype.hasOwnProperty.call(vals, name);
      if (kind === 'int' || kind === 'num') inputs[key] = has && typeof vals[name] === 'object' ? { shadow: { type: 'math_number', fields: { NUM: dflt } }, block: vals[name] } : { shadow: { type: 'math_number', fields: { NUM: has ? vals[name] : dflt } } };
      else if (kind === 'none_int') inputs[key] = has && vals[name] !== null ? { shadow: { type: 'logic_null' }, block: R.num(vals[name]) } : { shadow: { type: 'logic_null' } };
      else if (has) fields[key] = vals[name];
    }
    const o = R.b(M.type, fields); o.inputs = inputs; return o;
  };
  R.chain = (stmts) => {
    const list = stmts.filter(Boolean);
    for (let i = list.length - 2; i >= 0; i--) list[i].next = { block: list[i + 1] };
    return list[0];
  };
  R.program = (stmts, extraTops = []) => {
    const tops = [Object.assign(R.chain(stmts), { x: 24, y: 24 })];
    extraTops.forEach((t, i) => tops.push(Object.assign(t, { x: 24, y: 24 + 4000 + i * 400 })));
    return { blocks: { languageVersion: 0, blocks: tops } };
  };
  PB.R = R;

  /* ---------- helpers ---------- */
  const df = V('df');
  const needsScale = (cls) => !!(BK.modelInfo(cls).flags || {}).scale;
  const isTree = (cls) => /Tree|Forest|Boosting/.test(cls);
  const isLinear = (cls) => /^(LinearRegression|Ridge|Lasso|ElasticNet)$/.test(cls);
  /* the wizard's scaler choice applies to the models that need scaling (KNN, SVM, MLP, KMeans, …) */
  const SCALER_CLS = { standard: 'StandardScaler', minmax: 'MinMaxScaler', robust: 'RobustScaler' };
  R.SCALER_CLS = SCALER_CLS;
  const scalerFor = (cls, opts = {}) => { const sc = opts.scaler || 'standard'; return sc === 'none' || opts.noScale || !needsScale(cls) ? null : SCALER_CLS[sc] || 'StandardScaler'; };
  function modelExpr(cls, opts = {}) {
    const m = R.model(cls, opts.params || {});
    if (opts.text) return R.b('pb_pipeline', {}, { A: R.b('pb_vectorizer', { CLS: 'TfidfVectorizer', AN: opts.analyzer || 'char_wb', N1: opts.n1 || 2, N2: opts.n2 || 3 }), B: m });
    const sc = scalerFor(cls, opts);
    if (sc) return R.b('pb_pipeline', {}, { A: R.b('pb_scaler', { CLS: sc }), B: m });
    return m;
  }
  /* column roles: num (continuous) · num-cat (few whole numbers) · cat · text (long text) · date · id */
  R.inferRoles = function inferRoles(df) {
    const roles = {};
    for (const c of df.columns) {
      const dt = df.dtypeOf(c), vals = df._data.get(c), nn = vals.filter((v) => !PB.isMissing(v));
      const uniq = new Set(nn.map(PB.keyOf)).size;
      if (dt === 'datetime64[ns]') roles[c] = 'date';
      else if (PB.isNumericDtype(dt)) roles[c] = dt === 'bool' || (uniq <= 10 && nn.every((v) => Number.isInteger(+v))) ? 'num-cat' : 'num';
      else {
        const avg = nn.reduce((s, v) => s + String(v).length, 0) / Math.max(1, nn.length);
        const spaced = nn.filter((v) => /\S\s+\S/.test(String(v))).length / Math.max(1, nn.length);
        const dateLike = nn.slice(0, 30).filter((v) => /^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(String(v))).length > Math.min(20, nn.length * 0.8);
        const texty = uniq > 20 && ((avg > 25) || (avg > 10 && spaced > 0.5 && uniq >= nn.length * 0.5));
        roles[c] = dateLike ? 'date' : texty ? 'text' : uniq <= Math.max(30, nn.length * 0.05) ? 'cat' : 'id';
      }
    }
    return roles;
  };
  function srcBlock(cfg) {
    if (cfg.file) return R.b('pb_read_file', { FN: BK.readerFor(cfg.file).fn, FILE: cfg.file });
    return R.b('pb_dataset', { NAME: cfg.dataset });
  }
  function loadSteps(cfg) {
    const S = [R.set('df', srcBlock(cfg)), R.print(R.b('pb_df_view', { DF: df, FN: 'head', N: 5 }))];
    if (cfg.showShape) S.push(R.print2(TR('ขนาดข้อมูล (แถว, คอลัมน์):'), R.b('pb_df_info', { DF: df, FN: 'shape' })));
    return S;
  }
  /* cleaning before a model: duplicates → columns → missing values → outliers (wizard options in cfg) */
  function cleanSteps(cfg, cols) {
    const S = [];
    let reset = false;
    if (cfg.dedupe) { S.push(R.set('df', R.b('pb_drop_dups', { DF: df, COLS: '', KEEP: 'first' }))); reset = true; }
    if (cols) S.push(R.set('df', R.b('pb_cols', { DF: df, COLS: cols.join(', ') })));
    if (cfg.dropnaCols && cfg.dropnaCols.length) { S.push(R.set('df', R.b('pb_dropna_cols', { DF: df, COLS: cfg.dropnaCols.join(', ') }))); reset = true; }
    for (const [c, how] of Object.entries(cfg.fill || {})) S.push(R.b('pb_fillna', { DF: df, COL: c, HOW: how }));
    if (cfg.dropna) { S.push(R.set('df', R.b('pb_df_clean', { DF: df, FN: 'dropna' }))); S.push(R.set('df', R.b('pb_df_clean', { DF: df, FN: 'reset' }))); reset = false; }
    for (const c of cfg.outlierCols || []) { S.push(R.b('pb_outlier_fix', { DF: df, COL: c, ACT: cfg.outlierAction, M: 'iqr', K: 1.5 })); if (cfg.outlierAction === 'remove') reset = true; }
    if (reset) S.push(R.set('df', R.b('pb_df_clean', { DF: df, FN: 'reset' })));
    return S;
  }
  /* the wizard's "ทำความสะอาด & ปรับสเกล" choices for table tasks, turned into concrete steps for this data:
     missing auto | fill (median / most frequent; rows without a target are dropped) | drop ·
     dedupe · outliers none | clip | remove (IQR rule on continuous features) · scaler for the models */
  R.prepData = (cfg) => (cfg.file ? (PB.files.get(cfg.file) || {}).df || null : PB.loadSample(cfg.dataset));
  function applyPrep(cfg) {
    const p = cfg.prep;
    if (!p) return cfg;
    const c = Object.assign({}, cfg, { scaler: p.scaler || 'standard', dedupe: !!p.dedupe });
    const data = R.prepData(cfg);
    if (!data) return c;
    const hasNA = (col) => data.has(col) && data._data.get(col).some(PB.isMissing);
    const used = (c.target ? [c.target] : []).concat(c.features || []);
    if (p.missing === 'fill') {
      c.fill = {}; c.dropna = false; c.dropnaCols = c.target && hasNA(c.target) ? [c.target] : [];
      for (const col of c.features || []) if (hasNA(col)) c.fill[col] = PB.isNumericDtype(data.dtypeOf(col)) ? 'median' : 'mode';
    } else if (p.missing === 'drop') { c.fill = {}; c.dropna = used.some(hasNA); }
    if (p.outliers && p.outliers !== 'none' && c.task !== 'anomaly') {
      const roles = R.inferRoles(data);
      c.outlierAction = p.outliers;
      c.outlierCols = (c.features || []).filter((col) => data.has(col) && roles[col] === 'num' && PB.outliers(data.col(col), 'iqr', 1.5).mask.some(Boolean));
    }
    return c;
  }
  R.applyPrep = applyPrep;

  /* ---------- evaluation shared by tables, text and images ----------
     holdout = train_test_split + test metrics · cv = cross_val_score / compare_models_cv · grid = GridSearchCV */
  const GRIDS = {
    LogisticRegression: { C: '[0.01, 0.1, 1, 10]' },
    KNeighborsClassifier: { n_neighbors: '[3, 5, 7, 9, 11]', weights: '["uniform", "distance"]' },
    KNeighborsRegressor: { n_neighbors: '[3, 5, 7, 9, 11]', weights: '["uniform", "distance"]' },
    DecisionTreeClassifier: { max_depth: '[2, 3, 4, 5, None]' },
    DecisionTreeRegressor: { max_depth: '[2, 3, 4, 5, None]' },
    RandomForestClassifier: { max_depth: '[3, 5, None]' },
    RandomForestRegressor: { max_depth: '[3, 5, None]' },
    GradientBoostingClassifier: { learning_rate: '[0.05, 0.1, 0.2]' },
    GradientBoostingRegressor: { learning_rate: '[0.05, 0.1, 0.2]' },
    SVC: { C: '[0.1, 1, 10]', kernel: '["linear", "rbf"]' },
    SVR: { C: '[0.1, 1, 10]', epsilon: '[0.05, 0.1, 0.5]' },
    GaussianNB: { var_smoothing: '[1e-09, 1e-08, 1e-07]' },
    MultinomialNB: { alpha: '[0.1, 0.5, 1.0]' },
    MLPClassifier: { alpha: '[0.0001, 0.01]' },
    MLPRegressor: { alpha: '[0.0001, 0.01]' },
    LinearRegression: { fit_intercept: '[True, False]' },
    Ridge: { alpha: '[0.1, 1, 10, 100]' },
    Lasso: { alpha: '[0.001, 0.01, 0.1, 1]' },
    ElasticNet: { alpha: '[0.01, 0.1, 1]', l1_ratio: '[0.2, 0.5, 0.8]' },
  };
  R.GRIDS = GRIDS;
  /* a param_grid literal for the model; inside a pipeline the names become step__param */
  R.gridFor = (cls, prefix = '') => '{' + Object.entries(GRIDS[cls] || { random_state: '[42]' }).map(([k, v]) => `"${prefix}${k}": ${v}`).join(', ') + '}';
  const EVAL_TH = { holdout: TR('แบ่งฝึก/ทดสอบ'), cv: 'cross-validation', grid: 'GridSearchCV' };
  R.EVAL_TH = EVAL_TH;
  function evaluate(S, cfg, o) {
    const models = cfg.models, mode = cfg.evalMode || 'holdout', k = cfg.cvFolds || 5;
    const scoreName = o.cls ? 'accuracy' : 'R²';
    if (mode === 'cv') {
      if (models.length > 1) {
        S.push(R.b('pb_compare_cv', { RES: V('results'), X: V('X'), Y: V('y'), CV: k }, { MODELS: R.list(models.map(o.mk)) }));
        S.push(R.print(R.get('results')));
        S.push(R.b('pb_plot_xy', { KIND: 'barplot', DF: V('results'), X: 'model', Y: 'mean_score', HUE: '', TITLE: TR`คะแนนเฉลี่ย cross-validation ${k} รอบ (${scoreName})` }));
        return S;
      }
      S.push(R.set('model', o.mk(models[0])));
      S.push(R.set('scores', R.b('pb_cv', { X: V('X'), Y: V('y'), K: k, SC: 'None' }, { M: R.get('model') })));
      S.push(R.print2(TR('คะแนนแต่ละรอบ:'), R.get('scores')));
      S.push(R.print2(TR('คะแนนเฉลี่ย:'), R.b('pb_arr_stat', { FN: 'mean' }, { X: R.get('scores') })));
      S.push(R.print2(TR('ส่วนเบี่ยงเบนมาตรฐาน:'), R.b('pb_arr_stat', { FN: 'std' }, { X: R.get('scores') })));
      S.push(R.b('pb_plot_list', { KIND: 'bar', TITLE: TR`${scoreName} ของแต่ละรอบใน cross-validation` }, { DATA: R.get('scores') }));
      S.push(R.b('pb_comment', { TEXT: TR('ฝึกโมเดลสุดท้ายด้วยข้อมูลทั้งหมด เพื่อนำไปใช้งานจริง') }));
      S.push(R.b('pb_fit', { M: V('model'), X: V('X'), Y: V('y') }));
      if (o.after) S.push(...o.after(models[0], 'model'));
      return S;
    }
    S.push(R.b('pb_split', Object.assign({ XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), RS: 42 }, o.split)));
    if (mode === 'grid') {
      const m = models[0];
      S.push(R.set('model', o.mk(m)));
      S.push(R.set('grid', R.b('pb_grid', { GRID: R.gridFor(m, o.prefix(m)), CV: k, SC: 'None' }, { M: R.get('model') })));
      S.push(R.b('pb_fit', { M: V('grid'), X: V('X_train'), Y: V('y_train') }));
      S.push(R.print2(TR('พารามิเตอร์ที่ดีที่สุด:'), R.b('pb_grid_attr', { G: V('grid'), ATTR: 'best_params_' })));
      S.push(R.print2(TR('คะแนน CV ที่ดีที่สุด:'), R.b('pb_grid_attr', { G: V('grid'), ATTR: 'best_score_' })));
      S.push(R.print(R.b('pb_grid_attr', { G: V('grid'), ATTR: 'cv_results_' })));
      S.push(R.b('pb_comment', { TEXT: TR('วัดผลโมเดลที่ดีที่สุดกับชุดทดสอบที่ไม่เคยใช้ระหว่างค้นหา') }));
      S.push(R.set('y_pred', R.b('pb_predict', { M: V('grid'), FN: 'predict', X: V('X_test') })));
      S.push(...o.metrics());
      if (o.afterGrid) S.push(...o.afterGrid());
      return S;
    }
    if (models.length > 1) {
      S.push(R.b('pb_compare', { RES: V('results'), XTR: V('X_train'), YTR: V('y_train'), XTE: V('X_test'), YTE: V('y_test') }, { MODELS: R.list(models.map(o.mk)) }));
      S.push(R.print(R.get('results')));
      S.push(R.b('pb_plot_xy', { KIND: 'barplot', DF: V('results'), X: 'model', Y: o.cls ? 'accuracy' : 'r2', HUE: '', TITLE: o.cls ? TR('เปรียบเทียบ accuracy') : TR('เปรียบเทียบ R²') }));
      return S;
    }
    const m = models[0];
    S.push(R.set('model', o.mk(m)));
    S.push(R.b('pb_fit', { M: V('model'), X: V('X_train'), Y: V('y_train') }));
    S.push(R.set('y_pred', R.b('pb_predict', { M: V('model'), FN: 'predict', X: V('X_test') })));
    S.push(...o.metrics());
    if (o.after) S.push(...o.after(m, 'model'));
    return S;
  }
  const clsMetrics = (report = true) => () => [
    R.print2('Accuracy:', R.b('pb_metric', { FN: 'accuracy_score', YT: V('y_test'), YP: V('y_pred') })),
    report ? R.print(R.b('pb_report', { YT: V('y_test'), YP: V('y_pred') })) : null,
    R.b('pb_plot_cm', { YT: V('y_test'), YP: V('y_pred') }),
  ].filter(Boolean);
  const regMetrics = () => [
    R.print2('R²:', R.b('pb_metric', { FN: 'r2_score', YT: V('y_test'), YP: V('y_pred') })),
    R.print2('MAE:', R.b('pb_metric', { FN: 'mean_absolute_error', YT: V('y_test'), YP: V('y_pred') })),
    R.b('pb_plot_pred', { YT: V('y_test'), YP: V('y_pred') }),
  ];

  /* ---------- supervised (classification / regression) on tables ---------- */
  function supervised(cfg) {
    const cls = cfg.task === 'classification', target = cfg.target, feats = cfg.features;
    const S = loadSteps(cfg);
    if (cfg.dropna || Object.keys(cfg.fill || {}).length) S.push(R.print(R.b('pb_df_info', { DF: df, FN: 'isnull' })));
    S.push(...cleanSteps(cfg, [target, ...feats]));
    if (cls) S.push(R.print(R.b('pb_series_stat', { DF: df, COL: target, FN: 'value_counts' })));
    if (cfg.dummies && cfg.dummies.length) S.push(R.set('df', R.b('pb_get_dummies', { DF: df, COLS: cfg.dummies.join(', '), DROP: 'True' })));
    S.push(R.set('X', R.b('pb_drop_cols', { DF: df, COLS: target })));
    S.push(R.set('y', R.b('pb_col', { DF: df, COL: target })));
    const sc = { scaler: cfg.scaler };
    return evaluate(S, cfg, {
      cls, mk: (m) => modelExpr(m, sc), prefix: (m) => (scalerFor(m, sc) ? m.toLowerCase() + '__' : ''),
      split: { TS: cfg.testSize || 0.2, MODE: cls && !cfg.noStratify ? 'stratify' : 'shuffle' },
      metrics: cls ? clsMetrics() : regMetrics,
      after: (m, mv) => {
        const out = [];
        if (isTree(m)) out.push(R.b('pb_plot_importance', { M: V(mv), ATTR: 'feature_importances_', X: V('X') }));
        else if (isLinear(m) && !scalerFor(m, sc)) out.push(R.b('pb_plot_importance', { M: V(mv), ATTR: 'coef_', X: V('X') }));
        if (cfg.newRow) out.push(R.print2(TR('ทำนายข้อมูลใหม่:'), R.b('pb_predict_row', { M: V(mv), ROW: cfg.newRow })));
        return out;
      },
      afterGrid: () => (cfg.newRow ? [R.print2(TR('ทำนายข้อมูลใหม่:'), R.b('pb_predict_row', { M: V('grid'), ROW: cfg.newRow }))] : []),
    });
  }

  /* ---------- clustering / pca / anomaly / eda ---------- */
  function clustering(cfg) {
    const feats = cfg.features, m = cfg.models[0] || 'KMeans';
    const S = loadSteps(cfg);
    S.push(...cleanSteps(cfg, null));
    S.push(R.set('X', R.b('pb_cols', { DF: df, COLS: feats.join(', ') })));
    const sc = scalerFor(m, { scaler: cfg.scaler }), xs = sc ? 'X_scaled' : 'X';
    if (sc) { S.push(R.set('scaler', R.b('pb_scaler', { CLS: sc }))); S.push(R.set('X_scaled', R.b('pb_transform', { M: V('scaler'), FN: 'fit_transform', X: V('X') }))); }
    S.push(R.set('model', R.model(m)));
    S.push(R.set('labels', R.b('pb_predict', { M: V('model'), FN: 'fit_predict', X: V(xs) })));
    S.push(R.b('pb_set_col', { DF: df, NAME: 'cluster' }, { VAL: R.get('labels') }));
    S.push(R.print(R.b('pb_series_stat', { DF: df, COL: 'cluster', FN: 'value_counts' })));
    S.push(R.print2('Silhouette score:', R.b('pb_silhouette', { X: V(xs), L: V('labels') })));
    S.push(R.print(R.b('pb_groupby', { DF: df, BY: 'cluster', COL: '', AGG: 'mean' })));
    S.push(R.set('pca', R.model('PCA', { n_components: 2 })));
    S.push(R.set('pcs', R.b('pb_to_frame', { NAMES: 'PC1, PC2' }, { ARR: R.b('pb_predict', { M: V('pca'), FN: 'fit_transform', X: V(xs) }) })));
    S.push(R.b('pb_set_col', { DF: V('pcs'), NAME: 'cluster' }, { VAL: R.get('labels') }));
    S.push(R.b('pb_plot_xy', { KIND: 'scatterplot', DF: V('pcs'), X: 'PC1', Y: 'PC2', HUE: 'cluster', TITLE: TR`กลุ่มจาก ${m} (แสดงด้วย PCA 2 มิติ)` }));
    return S;
  }
  function pca(cfg) {
    const S = loadSteps(cfg);
    S.push(...cleanSteps(cfg, null));
    S.push(R.set('X', R.b('pb_cols', { DF: df, COLS: cfg.features.join(', ') })));
    const sc = cfg.noScale ? null : scalerFor('PCA', { scaler: cfg.scaler });
    if (sc) { S.push(R.set('scaler', R.b('pb_scaler', { CLS: sc }))); S.push(R.set('X_scaled', R.b('pb_transform', { M: V('scaler'), FN: 'fit_transform', X: V('X') }))); }
    const xs = sc ? 'X_scaled' : 'X';
    S.push(R.set('pca', R.model('PCA', { n_components: 2 })));
    S.push(R.set('pcs', R.b('pb_to_frame', { NAMES: 'PC1, PC2' }, { ARR: R.b('pb_predict', { M: V('pca'), FN: 'fit_transform', X: V(xs) }) })));
    S.push(R.print2(TR('สัดส่วนความแปรปรวนที่อธิบายได้:'), R.b('pb_attr', { M: V('pca'), ATTR: 'explained_variance_ratio_' })));
    if (cfg.hue) S.push(R.b('pb_set_col', { DF: V('pcs'), NAME: cfg.hue }, { VAL: R.b('pb_col', { DF: df, COL: cfg.hue }) }));
    S.push(R.b('pb_plot_xy', { KIND: 'scatterplot', DF: V('pcs'), X: 'PC1', Y: 'PC2', HUE: cfg.hue || '', TITLE: TR('ข้อมูลใน 2 มิติแรกของ PCA') }));
    return S;
  }
  function anomaly(cfg) {
    const S = loadSteps(cfg);
    S.push(...cleanSteps(cfg, null));
    S.push(R.set('X', R.b('pb_cols', { DF: df, COLS: cfg.features.join(', ') })));
    S.push(R.set('model', R.model('IsolationForest', { contamination: cfg.contamination || '0.05' })));
    S.push(R.b('pb_set_col', { DF: df, NAME: 'anomaly' }, { VAL: R.b('pb_predict', { M: V('model'), FN: 'fit_predict', X: V('X') }) }));
    S.push(R.print(R.b('pb_series_stat', { DF: df, COL: 'anomaly', FN: 'value_counts' })));
    S.push(R.set('outliers', R.b('pb_filter', { DF: df, COL: 'anomaly', OP: '==' }, { VAL: R.num(-1) })));
    S.push(R.print(R.b('pb_df_view', { DF: V('outliers'), FN: 'head', N: 10 })));
    S.push(R.b('pb_plot_xy', { KIND: 'scatterplot', DF: df, X: cfg.x, Y: cfg.y, HUE: 'anomaly', TITLE: TR('จุดผิดปกติ (-1) เทียบกับจุดปกติ (1)') }));
    return S;
  }
  function eda(cfg) {
    const S = loadSteps(cfg);
    S.push(R.print(R.b('pb_df_info', { DF: df, FN: 'info' })));
    S.push(R.print(R.b('pb_df_info', { DF: df, FN: 'describe' })));
    S.push(R.print(R.b('pb_df_info', { DF: df, FN: 'isnull' })));
    if (cfg.cat) S.push(R.print(R.b('pb_series_stat', { DF: df, COL: cfg.cat, FN: 'value_counts' })));
    if (cfg.num) S.push(R.b('pb_plot_dist', { KIND: 'histplot', DF: df, X: cfg.num, HUE: '', TITLE: TR`การกระจายของ ${cfg.num}` }));
    if (cfg.cat) S.push(R.b('pb_plot_dist', { KIND: 'countplot', DF: df, X: cfg.cat, HUE: '', TITLE: TR`จำนวนแต่ละ ${cfg.cat}` }));
    if (cfg.x && cfg.y) S.push(R.b('pb_plot_xy', { KIND: 'scatterplot', DF: df, X: cfg.x, Y: cfg.y, HUE: cfg.cat || '', TITLE: TR`${cfg.y} เทียบกับ ${cfg.x}` }));
    if (cfg.cat && cfg.num) S.push(R.b('pb_plot_xy', { KIND: 'boxplot', DF: df, X: cfg.cat, Y: cfg.num, HUE: '', TITLE: TR`${cfg.num} แยกตาม ${cfg.cat}` }));
    S.push(R.b('pb_plot_heat', { TITLE: TR('ความสัมพันธ์ระหว่างคอลัมน์ตัวเลข') }, { M: R.b('pb_df_info', { DF: df, FN: 'corr' }) }));
    return S;
  }

  /* ---------- text ---------- */
  /* "thai" = TF-IDF over PyThaiNLP words (uni+bigrams), otherwise character n-grams (char_wb 2–3) */
  const textOpt = (cfg, nostop) => (cfg.tokenizer === 'thai' ? { text: true, analyzer: nostop ? 'thai_nostop' : 'thai', n1: 1, n2: 2 } : { text: true, analyzer: cfg.analyzer || 'char_wb', n1: cfg.analyzer === 'word' ? 1 : 2, n2: cfg.analyzer === 'word' ? 2 : 3 });
  function textClassification(cfg) {
    const S = loadSteps(cfg);
    if (cfg.dropna) S.push(R.set('df', R.b('pb_dropna_cols', { DF: df, COLS: [cfg.text, cfg.target].join(', ') })));
    S.push(R.print(R.b('pb_series_stat', { DF: df, COL: cfg.target, FN: 'value_counts' })));
    if (cfg.tokenizer === 'thai') S.push(R.print(R.b('pb_th_tokenize', { KW: 'False' }, { TEXT: R.b('pb_cell', { DF: df, COL: cfg.text, N: 0 }) })));
    S.push(R.set('X', R.b('pb_col', { DF: df, COL: cfg.text })));
    S.push(R.set('y', R.b('pb_col', { DF: df, COL: cfg.target })));
    const opt = textOpt(cfg, false);
    const sample = cfg.sample || 'อาหารอร่อย ส่งไว ประทับใจมาก'; /* th-data */
    return evaluate(S, cfg, {
      cls: true, mk: (m) => modelExpr(m, opt), prefix: (m) => m.toLowerCase() + '__',
      split: { TS: cfg.testSize || 0.25, MODE: 'stratify' },
      metrics: clsMetrics(),
      after: (m, mv) => [R.print2(TR('ข้อความใหม่:'), R.b('pb_predict_text', { M: V(mv), TEXT: sample }))],
      afterGrid: () => [R.print2(TR('ข้อความใหม่:'), R.b('pb_predict_text', { M: V('grid'), TEXT: sample }))],
    });
  }
  function textClustering(cfg) {
    const S = loadSteps(cfg);
    const opt = textOpt(cfg, true);
    if (cfg.tokenizer === 'thai') {
      S.push(R.b('pb_set_col', { DF: df, NAME: 'tokens' }, { VAL: R.b('pb_th_tokens', { DF: df, COL: cfg.text, FN: 'thai_tokenize_nostop' }) }));
      S.push(R.print(R.b('pb_word_count', { DF: df, COL: 'tokens', N: 10 })));
    }
    S.push(R.set('vectorizer', R.b('pb_vectorizer', { CLS: 'TfidfVectorizer', AN: opt.analyzer, N1: opt.n1, N2: opt.n2 })));
    S.push(R.set('X_text', R.b('pb_col', { DF: df, COL: cfg.text })));
    S.push(R.set('X', R.b('pb_transform', { M: V('vectorizer'), FN: 'fit_transform', X: V('X_text') })));
    S.push(R.set('model', R.model(cfg.models[0] || 'KMeans', { n_clusters: cfg.k || 2 })));
    S.push(R.b('pb_set_col', { DF: df, NAME: 'cluster' }, { VAL: R.b('pb_predict', { M: V('model'), FN: 'fit_predict', X: V('X') }) }));
    S.push(R.print(R.b('pb_series_stat', { DF: df, COL: 'cluster', FN: 'value_counts' })));
    S.push(R.print(R.b('pb_df_view', { DF: df, FN: 'head', N: 10 })));
    if (cfg.hue) S.push(R.b('pb_plot_dist', { KIND: 'countplot', DF: df, X: 'cluster', HUE: cfg.hue, TITLE: TR`กลุ่มข้อความเทียบกับ ${cfg.hue}` }));
    return S;
  }

  /* ---------- time series ---------- */
  function forecast(cfg) {
    const val = cfg.value, L = cfg.lags || 12, m = cfg.models[0] || 'LinearRegression';
    const S = loadSteps(cfg);
    if (cfg.dateCol) S.push(R.b('pb_set_col', { DF: df, NAME: 'date' }, { VAL: R.b('pb_to_datetime', { DF: df, COL: cfg.dateCol }) }));
    else S.push(R.b('pb_date_range', { DF: df, NAME: 'date', START: cfg.start || '2020-01-01', FREQ: cfg.freq || 'MS' }));
    S.push(R.b('pb_plot_xy', { KIND: 'lineplot', DF: df, X: 'date', Y: val, HUE: '', TITLE: TR`${val} ตามเวลา` }));
    S.push(R.b('pb_lags', { DF: df, COL: val, N: L }));
    S.push(R.set('data', R.b('pb_df_clean', { DF: df, FN: 'dropna' })));
    S.push(R.set('data', R.b('pb_df_clean', { DF: V('data'), FN: 'reset' })));
    S.push(R.set('X', R.b('pb_cols', { DF: V('data'), COLS: PB.range(L).map((i) => 'lag_' + (i + 1)).join(', ') })));
    S.push(R.set('y', R.b('pb_col', { DF: V('data'), COL: val })));
    S.push(R.b('pb_split', { XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), TS: 0.2, RS: 42, MODE: 'time' }));
    S.push(R.set('model', modelExpr(m)));
    S.push(R.b('pb_fit', { M: V('model'), X: V('X_train'), Y: V('y_train') }));
    S.push(R.set('y_pred', R.b('pb_predict', { M: V('model'), FN: 'predict', X: V('X_test') })));
    S.push(R.print2('MAE:', R.b('pb_metric', { FN: 'mean_absolute_error', YT: V('y_test'), YP: V('y_pred') })));
    S.push(R.print2('MAPE:', R.b('pb_metric', { FN: 'mape', YT: V('y_test'), YP: V('y_pred') })));
    S.push(R.b('pb_plot_pred', { YT: V('y_test'), YP: V('y_pred') }));
    S.push(R.b('pb_fit', { M: V('model'), X: V('X'), Y: V('y') }));
    S.push(R.set('forecast', R.b('pb_forecast', { M: V('model'), DF: df, COL: val, L, S: cfg.steps || 12 })));
    S.push(R.print2(TR('ค่าพยากรณ์:'), R.get('forecast')));
    S.push(R.b('pb_plot_forecast', { DF: df, DATE: 'date', DF2: df, COL: val, FC: V('forecast') }));
    return S;
  }
  function trend(cfg) {
    const val = cfg.value, w = cfg.window || 12;
    const S = loadSteps(cfg);
    if (cfg.dateCol) S.push(R.b('pb_set_col', { DF: df, NAME: 'date' }, { VAL: R.b('pb_to_datetime', { DF: df, COL: cfg.dateCol }) }));
    else S.push(R.b('pb_date_range', { DF: df, NAME: 'date', START: cfg.start || '2020-01-01', FREQ: cfg.freq || 'MS' }));
    S.push(R.b('pb_set_col', { DF: df, NAME: 'rolling_mean' }, { VAL: R.b('pb_rolling', { DF: df, COL: val, N: w, AGG: 'mean' }) }));
    S.push(R.b('pb_set_col', { DF: df, NAME: 'pct_change' }, { VAL: R.b('pb_col_func', { DF: df, COL: val, FN: 'pct' }) }));
    S.push(R.print(R.b('pb_df_view', { DF: df, FN: 'tail', N: 5 })));
    S.push(R.b('pb_plot_xy', { KIND: 'lineplot', DF: df, X: 'date', Y: val, HUE: '', TITLE: TR`${val} ตามเวลา` }));
    S.push(R.b('pb_plot_xy', { KIND: 'lineplot', DF: df, X: 'date', Y: 'rolling_mean', HUE: '', TITLE: TR`ค่าเฉลี่ยเคลื่อนที่ ${w} ช่วง` }));
    S.push(R.b('pb_plot_dist', { KIND: 'histplot', DF: df, X: 'pct_change', HUE: '', TITLE: TR('การเปลี่ยนแปลงต่อช่วง (%)') }));
    return S;
  }

  /* ---------- images ---------- */
  function imageClassification(cfg) {
    const S = loadSteps(Object.assign({ showShape: true }, cfg));
    S.push(R.b('pb_plot_images', { DF: df, N: 10, COL: cfg.target }));
    S.push(R.set('X', R.b('pb_drop_cols', { DF: df, COLS: cfg.target })));
    S.push(R.set('y', R.b('pb_col', { DF: df, COL: cfg.target })));
    const noScale = (m) => m === 'SVC';
    return evaluate(S, cfg, {
      cls: true, mk: (m) => modelExpr(m, { noScale: noScale(m) }), prefix: (m) => (needsScale(m) && !noScale(m) ? m.toLowerCase() + '__' : ''),
      split: { TS: 0.2, MODE: 'stratify' },
      metrics: clsMetrics(false),
    });
  }
  function imagePca(cfg) {
    const S = loadSteps(cfg);
    S.push(R.set('X', R.b('pb_drop_cols', { DF: df, COLS: cfg.target })));
    S.push(R.set('pca', R.model('PCA', { n_components: 2 })));
    S.push(R.set('pcs', R.b('pb_to_frame', { NAMES: 'PC1, PC2' }, { ARR: R.b('pb_predict', { M: V('pca'), FN: 'fit_transform', X: V('X') }) })));
    S.push(R.b('pb_set_col', { DF: V('pcs'), NAME: cfg.target }, { VAL: R.b('pb_col', { DF: df, COL: cfg.target }) }));
    S.push(R.print2(TR('สัดส่วนความแปรปรวนที่อธิบายได้:'), R.b('pb_attr', { M: V('pca'), ATTR: 'explained_variance_ratio_' })));
    S.push(R.b('pb_plot_xy', { KIND: 'scatterplot', DF: V('pcs'), X: 'PC1', Y: 'PC2', HUE: cfg.target, TITLE: TR('ภาพแต่ละภาพใน 2 มิติแรกของ PCA') }));
    return S;
  }

  /* ======================= data cleansing assistant =======================
     scan (what is wrong) → defaults (what to fix) → plan (each fix replayed on a copy with the engine, so
     the plan knows exactly which columns still have gaps) → blocks */
  const PLACEHOLDERS = new Set(['-', '--', '---', '?', '??', '???', 'ไม่ระบุ', '(ว่าง)', 'ว่าง', 'unknown', 'none', 'nil', 'missing', 'n.a.', 'not available']); /* th-data */
  const isPlaceholder = (v) => typeof v === 'string' && (v.trim() === '' || PLACEHOLDERS.has(v.trim().toLowerCase()));
  const JUNK = /[,\s฿$€£%]|บาท|baht|thb|usd/gi;
  const PLAIN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
  const isObj = (d, c) => d.dtypeOf(c) === 'object';
  /* similar spellings: the cutoff of similar_values, and old → new pairs followed to the end of a chain */
  const SIMILAR_CUTOFF = 0.8;
  R.SIMILAR_CUTOFF = SIMILAR_CUTOFF;
  function resolveChains(pairs) {
    const m = new Map(pairs.map(([o, n]) => [PB.keyOf(o), n])), out = new Map();
    for (const [o] of pairs) {
      let n = m.get(PB.keyOf(o)), guard = 0;
      while (m.has(PB.keyOf(n)) && guard++ < 50) n = m.get(PB.keyOf(n));
      out.set(o, n);
    }
    return out;
  }
  const isNum = (d, c) => d.dtypeOf(c) === 'int64' || d.dtypeOf(c) === 'float64';
  const strs = (d, c) => d._data.get(c).filter((v) => typeof v === 'string');
  const nMiss = (d, c) => d._data.get(c).filter(PB.isMissing).length;
  R.cleanScan = (raw, roles) => {
    roles = roles || R.inferRoles(raw);
    const out = { rows: raw.nrows, cols: raw.ncols, roles };
    const tok = new Map();
    for (const c of raw.columns) if (isObj(raw, c)) for (const v of strs(raw, c)) if (isPlaceholder(v)) { if (!tok.has(v)) tok.set(v, { n: 0, cols: [] }); const e = tok.get(v); e.n++; if (!e.cols.includes(c)) e.cols.push(c); }
    out.placeholders = Array.from(tok.entries()).map(([token, e]) => ({ token, n: e.n, cols: e.cols })).sort((a, b) => b.n - a.n);
    let d = out.placeholders.length ? PB.replaceWithNaN(raw, out.placeholders.map((p) => p.token)) : raw.copy();
    out.strip = [];
    for (const c of d.columns) if (isObj(d, c) && roles[c] !== 'text' && roles[c] !== 'date') { const n = strs(d, c).filter((v) => PB.pyStrip(v) !== v).length; if (n) { out.strip.push({ col: c, n }); d.set(c, d.col(c).str_op('strip')); } }
    out.case = [];
    for (const c of d.columns) {
      if (!isObj(d, c) || roles[c] !== 'cat') continue;
      const groups = new Map();
      for (const v of strs(d, c)) { const k = v.toLowerCase(); if (!groups.has(k)) groups.set(k, new Map()); const g = groups.get(k); g.set(v, (g.get(v) || 0) + 1); }
      const mixed = Array.from(groups.values()).filter((g) => g.size > 1);
      if (!mixed.length) continue;
      const score = { title: 0, lower: 0, upper: 0 };
      for (const g of groups.values()) { const [top, n] = Array.from(g.entries()).sort((a, b) => b[1] - a[1])[0]; if (top === PB.pyTitle(top)) score.title += n; else if (top === top.toLowerCase()) score.lower += n; else if (top === top.toUpperCase()) score.upper += n; }
      const fn = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
      out.case.push({ col: c, fn, examples: Array.from(mixed[0].keys()).slice(0, 4), n: mixed.reduce((t, g) => t + g.size, 0) });
      d.set(c, d.col(c).str_op(fn));
    }
    /* names spelled in several ways (fuzzy matching): the rarer spelling → the more common one it resembles */
    out.similar = [];
    for (const c of d.columns) {
      if (!isObj(d, c) || roles[c] !== 'cat') continue;
      const pairs = PB.similarPairs(d.col(c), SIMILAR_CUTOFF);
      if (!pairs.length) continue;
      for (const p of pairs) out.similar.push({ col: c, old: p.value, new: p.similar_to, n: p.count, ratio: p.ratio });
      d.set(c, d.col(c).replaceMap(resolveChains(pairs.map((p) => [p.value, p.similar_to]))));
    }
    out.numeric = [];
    for (const c of d.columns) {
      if (!isObj(d, c) || roles[c] === 'text' || roles[c] === 'date') continue;
      const vals = strs(d, c);
      if (!vals.length || vals.filter((v) => PLAIN.test(v.replace(JUNK, ''))).length < 0.8 * vals.length) continue;
      const mode = vals.every((v) => PLAIN.test(v.trim())) ? 'plain' : 'strip';
      out.numeric.push({ col: c, mode, examples: vals.filter((v) => !PLAIN.test(v.trim())).slice(0, 3), lost: PB.toNumericLoss(d.col(c), mode === 'strip') });
      d.set(c, PB.toNumeric(d.col(c), mode === 'strip'));
    }
    /* dates typed in many formats: a text column where at least 60% of the values read as a date */
    out.dates = [];
    for (const c of d.columns) {
      if (!isObj(d, c)) continue;
      const r = PB.dateShare(d.col(c));
      if (r.n < 3 || r.ok < 0.6 * r.n) continue;
      out.dates.push({ col: c, ok: r.ok, n: r.n, bad: r.bad, examples: PB.dateExamples(d.col(c)) });
      d.set(c, PB.parseDates(d.col(c)));
    }
    const roles2 = R.inferRoles(d);
    out.numRoles = roles2;
    out.dups = d.duplicatedCount();
    out.idCols = raw.columns.filter((c) => roles[c] === 'id');
    out.sparse = d.columns.map((c) => ({ col: c, frac: d.nrows ? nMiss(d, c) / d.nrows : 0 })).filter((e) => e.frac > 0.5);
    out.outliers = [];
    for (const c of d.columns) if (isNum(d, c) && roles2[c] === 'num') { const o = PB.outliers(d.col(c), 'iqr', 1.5); const vals = d.col(c).values.filter((_, i) => o.mask[i]); if (vals.length) out.outliers.push({ col: c, n: vals.length, low: o.low, high: o.high, examples: PB.uniqueSorted(vals).slice(-3) }); }
    out.scaleCols = d.columns.filter((c) => isNum(d, c) && roles2[c] === 'num' && !out.sparse.some((e) => e.col === c));
    out.missing = d.columns.filter((c) => nMiss(d, c)).map((c) => ({ col: c, n: nMiss(d, c), kind: isNum(d, c) ? 'num' : roles[c] === 'text' || roles[c] === 'id' ? 'skip' : 'cat' }));
    return out;
  };
  /* the recommended fixes for a scan; a dataset preset (DATASETS[k].tasks.clean) can override */
  R.cleanDefaults = (scan, preset = {}) => ({
    placeholders: scan.placeholders.map((p) => p.token),
    strip: scan.strip.map((e) => e.col),
    case: Object.fromEntries(scan.case.map((e) => [e.col, e.fn])),
    replace: (preset.replace || []).slice(),
    similar: (scan.similar || []).map((e) => ({ col: e.col, old: e.old, new: e.new, on: true })),
    numeric: scan.numeric.map((e) => ({ col: e.col, mode: e.mode })),
    dates: (scan.dates || []).map((e) => e.col),
    sparse: 0.5,
    on: { placeholders: true, strip: true, case: true, replace: true, similar: true, numeric: true, dates: true, sparse: true, dedupe: scan.dups > 0 && scan.idCols.length > 0 },
    outliers: Object.assign({ action: 'none', cols: scan.outliers.map((e) => e.col), method: 'iqr', k: 1.5 }, preset.outliers || {}),
    missing: Object.assign({ num: 'median', cat: 'mode' }, preset.missing || {}),
    scale: Object.assign({ method: 'none', cols: scan.scaleCols.slice(), plots: true }, preset.scale || {}),
    save: !!preset.save,
  });
  const CLS_OF = { minmax: 'MinMaxScaler', standard: 'StandardScaler', robust: 'RobustScaler', maxabs: 'MaxAbsScaler' };
  R.cleanPlan = (raw, cfg, roles) => {
    roles = roles || R.inferRoles(raw);
    const on = cfg.on || {}, steps = [];
    let d = raw.copy(), removed = false;
    if (on.placeholders !== false && (cfg.placeholders || []).length) { d = PB.replaceWithNaN(d, cfg.placeholders); steps.push({ kind: 'na', tokens: cfg.placeholders.slice() }); }
    if (on.strip !== false) for (const c of cfg.strip || []) if (d.has(c) && isObj(d, c)) { d.set(c, d.col(c).str_op('strip')); steps.push({ kind: 'text', col: c, fn: 'strip' }); }
    if (on.case !== false) for (const [c, fn] of Object.entries(cfg.case || {})) if (d.has(c) && isObj(d, c)) { d.set(c, d.col(c).str_op(fn)); steps.push({ kind: 'text', col: c, fn }); }
    if (on.replace !== false) for (const r of cfg.replace || []) if (d.has(r.col)) { d.set(r.col, d.col(r.col).replaceValue(r.old, r.new)); steps.push({ kind: 'replace', col: r.col, old: r.old, new: r.new }); }
    if (on.similar !== false) {
      const byCol = new Map();
      for (const r of cfg.similar || []) if (r.on !== false && d.has(r.col) && isObj(d, r.col)) { if (!byCol.has(r.col)) byCol.set(r.col, []); byCol.get(r.col).push([r.old, r.new]); }
      for (const [c, pairs] of byCol) {
        const map = resolveChains(pairs);
        d.set(c, d.col(c).replaceMap(map));
        steps.push({ kind: 'similar', col: c, pairs: Array.from(map, ([o, n]) => ({ old: o, new: n })) });
      }
    }
    if (on.numeric !== false) for (const e of cfg.numeric || []) if (d.has(e.col) && isObj(d, e.col)) { d.set(e.col, PB.toNumeric(d.col(e.col), e.mode === 'strip')); steps.push({ kind: 'numeric', col: e.col, mode: e.mode }); }
    if (on.dates !== false) for (const c of cfg.dates || []) if (d.has(c) && isObj(d, c)) { const s = d.col(c), p = PB.parseDates(s); d.set(c, p); steps.push({ kind: 'dates', col: c, bad: s.values.filter((v, i) => !PB.isMissing(v) && Number.isNaN(p.values[i])).length }); }
    if (on.dedupe) { const n = d.duplicatedCount(); if (n) { d = d.drop_duplicates(); removed = true; steps.push({ kind: 'dedupe', n }); } }
    if (on.sparse !== false && cfg.sparse != null) { const cols = d.columns.filter((c) => d.nrows && nMiss(d, c) / d.nrows > cfg.sparse); if (cols.length) { d = PB.keepFilledColumns(d, cfg.sparse); steps.push({ kind: 'sparse', p: cfg.sparse, cols }); } }
    const o = cfg.outliers || { action: 'none' };
    if (o.action && o.action !== 'none') for (const c of o.cols || []) {
      if (!d.has(c) || !isNum(d, c)) continue;
      const s = d.col(c), r = PB.outliers(s, o.method || 'iqr', o.k || 1.5), n = r.mask.filter(Boolean).length;
      if (!n) continue;
      if (o.action === 'remove') { d = d.mask(r.mask.map((x) => !x)); removed = true; } else d.set(c, o.action === 'clip' ? s.clip(r.low, r.high) : s.maskWhere(r.mask));
      steps.push({ kind: 'outlier', col: c, action: o.action, method: o.method || 'iqr', k: o.k || 1.5, n });
    }
    const m = cfg.missing || { num: 'none', cat: 'none' }, dropCols = [];
    for (const c of d.columns) {
      const n = nMiss(d, c);
      if (!n) continue;
      const how = isNum(d, c) ? m.num : isObj(d, c) && roles[c] !== 'text' && roles[c] !== 'id' ? m.cat : 'none';
      if (!how || how === 'none') continue;
      if (how === 'drop') { dropCols.push(c); continue; }
      const s = d.col(c), v = how === 'mean' ? s.mean() : how === 'median' ? s.median() : how === 'unknown' ? TR('ไม่ทราบ') : s.mode().values[0];
      d.set(c, s.fillna(v));
      steps.push({ kind: 'fill', col: c, how, n });
    }
    if (dropCols.length) { const before = d.nrows; d = d.dropna(dropCols); removed = true; steps.push({ kind: 'dropna', cols: dropCols, n: before - d.nrows }); }
    if (removed) { d = d.reset_index(true); steps.push({ kind: 'reset' }); }
    const sc = cfg.scale || { method: 'none' };
    if (sc.method && sc.method !== 'none') {
      const cols = (sc.cols || []).filter((c) => d.has(c) && isNum(d, c));
      if (cols.length) {
        const cls = CLS_OF[sc.method] || 'MinMaxScaler', r = new PB[cls]().fit_transform(d.select(cols));
        cols.forEach((c, j) => d.set(c, new PB.Series(r.data.map((x) => x[j]), { dtype: 'float64' })));
        steps.push({ kind: 'scale', cols, cls, plots: sc.plots !== false });
      }
    }
    return { steps, df: d };
  };
  const tokenText = (toks) => toks.map((t) => (typeof t === 'number' ? PB.py.num(t) : PB.py.str(t))).join(', ');
  const valBlock = (v) => (typeof v === 'number' ? R.num(v) : R.text(String(v)));
  function cleanTask(cfg) {
    const raw = R.prepData(cfg);
    if (!raw) throw new Error(TR('ไม่พบข้อมูล ') + (cfg.file || cfg.dataset));
    const roles = R.inferRoles(raw);
    const full = cfg.placeholders ? cfg : Object.assign({}, cfg, R.cleanDefaults(R.cleanScan(raw, roles), cfg));
    const { steps } = R.cleanPlan(raw, full, roles);
    const S = loadSteps(cfg);
    const note = (t) => R.b('pb_comment', { TEXT: t });
    let k = 0;
    const stage = (title) => note(TR`ขั้นที่ ${++k} · ${title}`);
    S.push(stage(TR('สำรวจปัญหา: ชนิดข้อมูล ค่าว่าง และจำนวนค่าไม่ซ้ำของแต่ละคอลัมน์')));
    S.push(R.print(R.b('pb_quality', { DF: df })));
    S.push(R.print2(TR('จำนวนแถวซ้ำ:'), R.b('pb_df_info', { DF: df, FN: 'dups' })));
    if (!steps.length) S.push(note(TR('ไม่พบสิ่งที่ต้องแก้ตามตัวเลือกที่เลือกไว้ ข้อมูลนี้พร้อมใช้งาน')));
    const of = (...kinds) => steps.filter((s) => kinds.includes(s.kind));
    if (of('na').length) { S.push(stage(TR('ค่าว่างที่ซ่อนอยู่: ข้อความที่ใช้แทนค่าว่างเปลี่ยนเป็น NaN'))); for (const s of of('na')) S.push(R.set('df', R.b('pb_na_values', { DF: df, VALS: tokenText(s.tokens) }))); }
    const txt = of('text', 'replace');
    if (txt.length) {
      S.push(stage(TR('ข้อความที่พิมพ์ไม่ตรงกัน: ช่องว่างเกิน ตัวพิมพ์ใหญ่-เล็ก และชื่อย่อ')));
      for (const s of txt) S.push(s.kind === 'text' ? R.b('pb_clean_text', { DF: df, COL: s.col, FN: s.fn }) : R.b('pb_replace_val', { DF: df, COL: s.col }, { OLD: valBlock(s.old), NEW: valBlock(s.new) }));
    }
    const sim = of('similar');
    if (sim.length) {
      S.push(stage(TR('ชื่อเดียวกันที่สะกดต่างกัน (fuzzy matching): ดูคู่ที่สะกดคล้ายกัน แล้วรวมเป็นชื่อที่พบบ่อยกว่า')));
      for (const s of sim) {
        S.push(R.print(R.b('pb_similar_values', { DF: df, COL: s.col, CUT: SIMILAR_CUTOFF })));
        for (const p of s.pairs) S.push(R.b('pb_replace_val', { DF: df, COL: s.col }, { OLD: valBlock(p.old), NEW: valBlock(p.new) }));
      }
    }
    if (of('numeric').length) { S.push(stage(TR('ตัวเลขที่เก็บเป็นข้อความ → ตัวเลข'))); for (const s of of('numeric')) S.push(R.b('pb_to_numeric', { DF: df, COL: s.col, MODE: s.mode })); }
    if (of('dates').length) { S.push(stage(TR('วันที่ที่พิมพ์หลายรูปแบบ → ชนิดวันที่ (datetime)'))); for (const s of of('dates')) S.push(R.b('pb_parse_dates', { DF: df, COL: s.col })); }
    if (of('dedupe', 'sparse').length) {
      S.push(stage(TR('แถวซ้ำและคอลัมน์ที่ว่างเกือบทั้งหมด')));
      for (const s of of('dedupe', 'sparse')) S.push(s.kind === 'dedupe' ? R.set('df', R.b('pb_drop_dups', { DF: df, COLS: '', KEEP: 'first' })) : R.set('df', R.b('pb_drop_sparse', { DF: df, P: s.p })));
    }
    if (of('outlier').length) {
      S.push(stage(TR('ค่าผิดปกติ (กฎ IQR): ดูก่อนแล้วจึงจัดการ')));
      for (const s of of('outlier')) { S.push(R.print(R.b('pb_outlier_rows', { DF: df, COL: s.col, M: s.method, K: s.k }))); S.push(R.b('pb_outlier_fix', { DF: df, COL: s.col, ACT: s.action, M: s.method, K: s.k })); }
    }
    if (of('fill', 'dropna').length) {
      S.push(stage(TR('จัดการค่าว่างที่เหลือ')));
      for (const s of of('fill', 'dropna')) S.push(s.kind === 'fill' ? R.b('pb_fillna', { DF: df, COL: s.col, HOW: s.how }) : R.set('df', R.b('pb_dropna_cols', { DF: df, COLS: s.cols.join(', ') })));
    }
    if (of('reset').length) S.push(R.set('df', R.b('pb_df_clean', { DF: df, FN: 'reset' })));
    const cleaned = steps.some((s) => s.kind !== 'scale');
    if (cleaned) {
      S.push(stage(TR('ตรวจคุณภาพอีกครั้งหลังทำความสะอาด')));
      S.push(R.print(R.b('pb_quality', { DF: df })));
      S.push(R.print2(TR('ขนาดข้อมูลหลังทำความสะอาด:'), R.b('pb_df_info', { DF: df, FN: 'shape' })));
      const showCol = (txt.find((s) => s.kind === 'replace' || s.fn !== 'strip') || sim[0] || txt.find((s) => roles[s.col] === 'cat') || {}).col;
      if (showCol) S.push(R.print(R.b('pb_series_stat', { DF: df, COL: showCol, FN: 'value_counts' })));
    }
    const sc = of('scale')[0];
    if (sc) {
      const cols = sc.cols.join(', ');
      S.push(stage(TR`ปรับสเกล (Normalize) ด้วย ${sc.cls}: ${BK.SCALE_TH[sc.cls]}`));
      if (sc.plots) S.push(R.b('pb_plot_box_cols', { DF: df, COLS: cols, TITLE: TR('ก่อนปรับสเกล: แต่ละคอลัมน์มีช่วงค่าต่างกันมาก') }));
      S.push(R.b('pb_scale_cols', { DF: df, COLS: cols, CLS: sc.cls }));
      S.push(R.print(R.b('pb_df_info', { DF: df, FN: 'describe' })));
      if (sc.plots) S.push(R.b('pb_plot_box_cols', { DF: df, COLS: cols, TITLE: TR('หลังปรับสเกล: ทุกคอลัมน์อยู่ในสเกลเดียวกัน') }));
    }
    if (full.save) S.push(R.b('pb_to_csv', { DF: df, NAME: 'clean_data.csv' }));
    return S;
  }

  R.build = (cfg) => {
    const f = { classification: supervised, regression: supervised, clustering, pca, anomaly, eda, clean: cleanTask, text_classification: textClassification, text_clustering: textClustering, forecast, trend, image_classification: imageClassification, image_pca: imagePca }[cfg.task];
    if (!f) throw new Error('unknown task ' + cfg.task);
    return R.program(f(applyPrep(cfg)));
  };

  /* ---------- task catalogue for the wizard ---------- */
  PB.TASKS = {
    table: [
      ['classification', TR('จำแนกประเภท'), TR('ทายว่าแต่ละแถวอยู่กลุ่มไหน เช่น รอด/ไม่รอด, สายพันธุ์')],
      ['regression', TR('พยากรณ์ค่าตัวเลข'), TR('ทายตัวเลข เช่น ราคา น้ำหนัก ยอดขาย')],
      ['clustering', TR('จัดกลุ่มอัตโนมัติ'), TR('แบ่งข้อมูลเป็นกลุ่มที่คล้ายกัน โดยไม่มีคำตอบให้')],
      ['pca', TR('ลดมิติ / มองภาพรวม'), TR('บีบหลายคอลัมน์เหลือ 2 มิติเพื่อวาดกราฟ')],
      ['anomaly', TR('หาค่าผิดปกติ'), TR('หาแถวที่แปลกไปจากส่วนใหญ่')],
      ['eda', TR('สำรวจข้อมูล'), TR('สถิติ ค่าว่าง การกระจาย และความสัมพันธ์')],
      ['clean', TR('ทำความสะอาด & ปรับสเกล'), TR('แก้ค่าว่าง แถวซ้ำ ข้อความไม่ตรงกัน ค่าผิดปกติ แล้ว Normalize')],
    ],
    text: [
      ['text_classification', TR('จำแนกข้อความ'), TR('เช่น รีวิวบวก/ลบ หมวดหมู่ข่าว')],
      ['text_clustering', TR('จัดกลุ่มข้อความ'), TR('รวมข้อความที่คล้ายกันเป็นกลุ่ม')],
    ],
    timeseries: [
      ['forecast', TR('พยากรณ์อนาคต'), TR('ใช้ค่าย้อนหลังทำนายช่วงเวลาถัดไป')],
      ['trend', TR('ดูแนวโน้ม'), TR('ค่าเฉลี่ยเคลื่อนที่และอัตราการเปลี่ยนแปลง')],
    ],
    image: [
      ['image_classification', TR('จำแนกภาพ'), TR('ทายว่าภาพคืออะไรจากค่าพิกเซล')],
      ['image_pca', TR('มองภาพรวมของภาพ'), TR('ลดพิกเซลเหลือ 2 มิติแล้ววาดกราฟ')],
    ],
  };
  PB.TASK_MODELS = {
    classification: ['RandomForestClassifier', 'LogisticRegression', 'GradientBoostingClassifier', 'DecisionTreeClassifier', 'KNeighborsClassifier', 'SVC', 'GaussianNB', 'MLPClassifier'],
    regression: ['LinearRegression', 'RandomForestRegressor', 'GradientBoostingRegressor', 'Ridge', 'Lasso', 'ElasticNet', 'DecisionTreeRegressor', 'KNeighborsRegressor', 'SVR', 'MLPRegressor'],
    clustering: ['KMeans', 'AgglomerativeClustering', 'DBSCAN'],
    pca: ['PCA'], anomaly: ['IsolationForest'], eda: [], clean: [],
    text_classification: ['MultinomialNB', 'LogisticRegression', 'SVC', 'RandomForestClassifier'],
    text_clustering: ['KMeans', 'AgglomerativeClustering'],
    forecast: ['LinearRegression', 'Ridge', 'RandomForestRegressor', 'GradientBoostingRegressor', 'KNeighborsRegressor', 'MLPRegressor'],
    trend: [],
    image_classification: ['SVC', 'KNeighborsClassifier', 'LogisticRegression', 'RandomForestClassifier', 'MLPClassifier'],
    image_pca: ['PCA'],
  };

  /* ---------- sample projects ---------- */
  const DS = (k) => PB.DATASETS[k];
  const sampleCfg = (dataset, task, models, extra = {}) => Object.assign({ dataset, task, models }, DS(dataset).tasks[task], extra);
  function basicsProgram() {
    const k = V('k');
    const loopBody = R.chain([
      R.set('model', R.model('KMeans', { n_clusters: R.get('k') })),
      R.b('pb_fit_x', { M: V('model'), X: V('X') }),
      R.b('pb_append', { L: V('inertias') }, { X: R.b('pb_attr', { M: V('model'), ATTR: 'inertia_' }) }),
      R.print(R.b('text_join', {}, {}, { extraState: { itemCount: 4 }, inputs: { ADD0: { block: R.text('k = ') }, ADD1: { block: R.get('k') }, ADD2: { block: R.text('  inertia = ') }, ADD3: { block: R.b('pb_round', { N: 1 }, { X: R.b('pb_attr', { M: V('model'), ATTR: 'inertia_' }) }) } } })),
    ]);
    const forLoop = R.b('controls_for', { VAR: k }, { FROM: R.num(1), TO: R.num(8), BY: R.num(1) });
    forLoop.inputs.DO = { block: loopBody };
    const fn = {
      type: 'procedures_defreturn', extraState: { params: [{ name: 'weight' }, { name: 'height' }] }, fields: { NAME: 'bmi' },
      inputs: { RETURN: { block: R.b('math_arithmetic', { OP: 'DIVIDE' }, { A: R.get('weight'), B: R.b('math_arithmetic', { OP: 'POWER' }, { A: R.b('math_arithmetic', { OP: 'DIVIDE' }, { A: R.get('height'), B: R.num(100) }), B: R.num(2) }) }) } },
    };
    const call = { type: 'procedures_callreturn', extraState: { name: 'bmi', params: ['weight', 'height'] }, inputs: { ARG0: { block: R.num(65) }, ARG1: { block: R.num(170) } } };
    const ifBlk = { type: 'controls_if', extraState: { elseIfCount: 1, hasElse: true }, inputs: {
      IF0: { block: R.b('logic_compare', { OP: 'LT' }, { A: R.get('value'), B: R.num(18.5) }) }, DO0: { block: R.print(R.text(TR('น้ำหนักน้อยกว่าเกณฑ์'))) },
      IF1: { block: R.b('logic_compare', { OP: 'LT' }, { A: R.get('value'), B: R.num(23) }) }, DO1: { block: R.print(R.text(TR('น้ำหนักปกติ'))) },
      ELSE: { block: R.print(R.text(TR('น้ำหนักเกินเกณฑ์'))) } } };
    const main = [
      R.b('pb_comment', { TEXT: TR('ตัวแปร ฟังก์ชัน และเงื่อนไข') }),
      R.set('value', R.b('pb_round', { N: 1 }, { X: call })),
      R.print2('BMI =', R.get('value')),
      ifBlk,
      R.b('pb_comment', { TEXT: TR('ลูป: ลองจำนวนกลุ่ม k = 1..8 แล้วดูว่า inertia ลดลงเท่าไร (elbow method)') }),
      R.set('df', R.b('pb_dataset', { NAME: 'iris' })),
      R.set('X', R.b('pb_drop_cols', { DF: df, COLS: 'species' })),
      R.set('inertias', R.b('lists_create_empty')),
      forLoop,
      R.b('pb_plot_list', { KIND: 'plot', TITLE: TR('Elbow method: inertia เทียบกับจำนวนกลุ่ม k') }, { DATA: R.get('inertias') }),
    ];
    return R.program(main, [fn]);
  }
  PB.SAMPLES = [
    { id: 'iris', title: TR('จำแนกพันธุ์ดอกไอริส'), sub: TR('RandomForestClassifier · ตาราง'), build: () => R.build(sampleCfg('iris', 'classification', ['RandomForestClassifier'], { newRow: '{"sepal_length": 6.1, "sepal_width": 2.8, "petal_length": 4.7, "petal_width": 1.2}' })) },
    { id: 'titanic', title: TR('ใครรอดจากไททานิก'), sub: TR('เปรียบเทียบ 4 โมเดล · ตาราง'), build: () => R.build(sampleCfg('titanic', 'classification', ['LogisticRegression', 'RandomForestClassifier', 'GradientBoostingClassifier', 'KNeighborsClassifier'])) },
    { id: 'mpg', title: TR('พยากรณ์อัตราสิ้นเปลืองน้ำมัน'), sub: TR('LinearRegression · ตาราง'), build: () => R.build(sampleCfg('mpg', 'regression', ['LinearRegression'])) },
    { id: 'penguins', title: TR('จัดกลุ่มนกเพนกวิน'), sub: TR('KMeans + PCA · ตาราง'), build: () => R.build(sampleCfg('penguins', 'clustering', ['KMeans'])) },
    { id: 'reviews', title: TR('วิเคราะห์ความรู้สึกรีวิวภาษาไทย'), sub: TR('TF-IDF + Naive Bayes · ข้อความ'), build: () => R.build(sampleCfg('thai_reviews', 'text_classification', ['MultinomialNB'])) },
    { id: 'flights', title: TR('พยากรณ์ผู้โดยสารสายการบิน'), sub: TR('ค่าย้อนหลัง + LinearRegression · อนุกรมเวลา'), build: () => R.build(sampleCfg('flights', 'forecast', ['LinearRegression'])) },
    { id: 'digits', title: TR('อ่านตัวเลขลายมือ'), sub: TR('SVC · รูปภาพ 8×8'), build: () => R.build(sampleCfg('digits', 'image_classification', ['SVC'])) },
    { id: 'tips', title: TR('หาบิลผิดปกติในร้านอาหาร'), sub: TR('IsolationForest · ตาราง'), build: () => R.build(sampleCfg('tips', 'anomaly', ['IsolationForest'])) },
    { id: 'eda', title: TR('สำรวจข้อมูลไททานิก'), sub: TR('สถิติ ค่าว่าง กราฟ · ตาราง'), build: () => R.build(sampleCfg('titanic', 'eda', [])) },
    { id: 'clean', title: TR('ทำความสะอาดข้อมูลสมาชิกร้านกาแฟ'), sub: TR('Cleansing + Normalize (MinMaxScaler) · ตาราง'), build: () => R.build(sampleCfg('coffee', 'clean', [])) },
    { id: 'basics', title: TR('พื้นฐาน Python กับข้อมูล'), sub: TR('ตัวแปร ฟังก์ชัน เงื่อนไข ลูป'), build: basicsProgram },
  ];
})();
