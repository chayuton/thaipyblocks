/* ThaiPyBlocks: knows the columns of every table without running the program.
   Follows the blocks in run order (the same order as the interpreter) from the sample dataset or the uploaded
   file a table was read from, through every block that keeps, drops, adds or renames columns, and records which
   columns each DataFrame variable has at each point. Column pickers, the table-variable menus, new blocks dragged
   from the palette and the "ทำนายข้อมูลใหม่" block use it, so after reading a .csv nothing has to be typed. */
(function () {
  const A = (PB.ui = PB.ui || {}), BK = PB.blocks, U = PB.u;
  const S = (PB.schema = {});
  const TABLE = 'table', OTHER = { kind: 'other' }, UNKNOWN = { kind: 'unknown' };
  const isMiss = PB.isMissing;

  /* ---------------- where columns come from ---------------- */
  const dsCache = new Map();
  function sampleFrame(name) {
    if (!dsCache.has(name)) { let d = null; try { d = PB.loadSample(name); } catch (e) { d = null; } dsCache.set(name, d); }
    return dsCache.get(name);
  }
  /* each column remembers where its values came from, for get_dummies levels and example values */
  const fromFrame = (df) => df.columns.map((c) => ({ name: c, hint: PB.dtypeLabel(df.dtypeOf(c)), base: { df, col: c } }));
  const table = (cols, src) => ({ kind: TABLE, cols, src: src || '' });

  /* uploaded files are not kept between visits; their column names (and one example row) are, so the pickers
     still work after a reload, before the file is uploaded again */
  const FILE_KEY = 'pyblocks.fileCols.v1';
  const plain = (v) => (isMiss(v) ? null : typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : PB.str(v));
  S.rememberFile = (name, df) => {
    try {
      const all = U.store.get(FILE_KEY) || {};
      all[name] = { ts: Date.now(), rows: df.nrows, cols: df.columns.map((c) => [c, df.dtypeOf(c)]), example: df.columns.map((c) => plain(df._data.get(c).find((v) => !isMiss(v)))) };
      U.store.set(FILE_KEY, Object.fromEntries(Object.entries(all).sort((a, b) => b[1].ts - a[1].ts).slice(0, 20)));
    } catch (e) { /* storage unavailable: the pickers then work once the file is uploaded */ }
  };
  S.rememberedFile = (name) => { const all = U.store.get(FILE_KEY) || {}; return all[name] || null; };
  function fileTable(name) {
    if (!name) return UNKNOWN;
    const f = PB.files && PB.files.get(name);
    if (f) return table(fromFrame(f.df), name);
    const r = S.rememberedFile(name);
    if (r) return table(r.cols.map(([c, dt], i) => ({ name: c, hint: dt, base: { value: r.example ? r.example[i] : null } })), name + TR(' (ยังไม่ได้อัปโหลดในหน้านี้)'));
    return UNKNOWN;
  }
  function datasetTable(name) { const d = sampleFrame(name); return d ? table(fromFrame(d), TR('ชุดข้อมูล ') + name) : UNKNOWN; }
  S.fileColumns = (name) => { const t = fileTable(name); return t.kind === TABLE ? t.cols : null; };

  /* ---------------- helpers ---------------- */
  const varOf = (b, field) => { const f = b.getField(field); const v = f && f.getVariable ? f.getVariable() : null; return v ? (v.getName ? v.getName() : v.name) : null; };
  const isNum = (dt) => /^(int|float|uint)/.test(dt || '') || dt === 'bool';
  const pick = (cols, names) => names.map((n) => cols.find((c) => c.name === n) || { name: n, hint: '' });
  const without = (cols, names) => cols.filter((c) => !names.includes(c.name));
  const retype = (cols, names, dt) => cols.map((c) => (names.includes(c.name) ? { name: c.name, hint: dt, base: c.base } : c));
  const addCol = (cols, name, dt) => (cols.some((c) => c.name === name) ? retype(cols, [name], dt || '') : cols.concat({ name, hint: dt || '' }));
  const derived = (t, cols) => table(cols, t.src);
  function levelsOf(col) {
    const b = col.base; if (!b || !b.df) return null;
    const v = b.df._data.get(b.col); if (!v) return null;
    return PB.uniqueSorted(v.filter((x) => !isMiss(x)));
  }
  const levelName = (c, lv) => c + '_' + (typeof lv === 'boolean' ? (lv ? 'True' : 'False') : typeof lv === 'number' ? PB.numStr(lv) : String(lv));
  /* one example value per column (the first non-missing value of the data it came from) */
  S.example = (col) => {
    const b = col && col.base; if (!b) return null;
    if (b.df) return plain(b.df._data.get(b.col).find((v) => !isMiss(v)));
    if (b.dummyOf) { const ex = S.example(b.dummyOf); return ex !== null && String(ex) === String(b.level); }
    return b.value === undefined ? null : b.value;
  };

  /* ---------------- the walk ---------------- */
  class Env {
    constructor() { this.vars = new Map(); this.models = new Map(); this.lastTable = null; this.lastSource = null; this.everTables = new Set(); }
    set(name, val) { if (!name) return; this.vars.set(name, val || UNKNOWN); if (val && val.kind === TABLE) { this.lastTable = name; this.everTables.add(name); } }
    get(name) { return (name && this.vars.get(name)) || null; }
    tableOf(name) { const v = this.get(name); return v && v.kind === TABLE ? v : null; }
    snapshot() { const e = new Env(); e.vars = new Map(this.vars); e.models = new Map(this.models); e.lastTable = this.lastTable; e.lastSource = this.lastSource; e.everTables = new Set(this.everTables); return e; }
    /* the imported table: the variable last read from a file or sample dataset, while it still holds a table */
    mainTable() { return this.lastSource && this.tableOf(this.lastSource) ? this.lastSource : this.lastTable; }
  }
  /* value blocks → what they evaluate to (a table with its columns, something else, or unknown) */
  const same = (b, env) => env.tableOf(varOf(b, 'DF')) || UNKNOWN;
  const VALUE = {
    variables_get: (b, env) => env.get(varOf(b, 'VAR')) || UNKNOWN,
    pb_dataset: (b) => datasetTable(b.getFieldValue('NAME')),
    pb_read_file: (b) => fileTable(b.getFieldValue('FILE')),
    pb_df_view: same, pb_filter: same, pb_sort: same, pb_df_clean: same, pb_dropna_cols: same, pb_find_rows: same,
    pb_drop_dups: same, pb_outlier_rows: same,
    /* keeps the columns whose share of missing values is at most P (from the data the column came from) */
    pb_drop_sparse: (b, env) => {
      const t = env.tableOf(varOf(b, 'DF')); if (!t) return UNKNOWN;
      const p = Number(b.getFieldValue('P'));
      if (t.cols.some((c) => !c.base || !c.base.df)) return t;
      return derived(t, t.cols.filter((c) => { const v = c.base.df._data.get(c.base.col); return !v.length || v.filter(isMiss).length / v.length <= p; }));
    },
    pb_na_values: (b, env) => { const t = env.tableOf(varOf(b, 'DF')); return t ? derived(t, t.cols.map((c) => ({ name: c.name, hint: c.hint === 'object' ? 'object' : c.hint, base: c.base }))) : UNKNOWN; },
    pb_cols: (b, env) => { const t = env.tableOf(varOf(b, 'DF')); return t ? derived(t, pick(t.cols, BK.splitCols(b.getFieldValue('COLS')))) : UNKNOWN; },
    pb_drop_cols: (b, env) => { const t = env.tableOf(varOf(b, 'DF')); return t ? derived(t, without(t.cols, BK.splitCols(b.getFieldValue('COLS')))) : UNKNOWN; },
    pb_get_dummies: (b, env) => {
      const t = env.tableOf(varOf(b, 'DF')); if (!t) return UNKNOWN;
      const enc = BK.splitCols(b.getFieldValue('COLS')), drop = b.getFieldValue('DROP') === 'True';
      let out = enc.length === t.cols.length ? [] : without(t.cols, enc);
      for (const name of enc) {
        const col = t.cols.find((c) => c.name === name); if (!col) continue;
        let lv = levelsOf(col); if (!lv) return UNKNOWN;          /* levels unknown until the program runs */
        if (drop) lv = lv.slice(1);
        out = out.concat(lv.map((v) => ({ name: levelName(name, v), hint: 'bool', base: { dummyOf: col, level: v } })));
      }
      return derived(t, out);
    },
    pb_df_info: (b, env) => {
      const fn = b.getFieldValue('FN'); if (fn !== 'describe' && fn !== 'corr') return OTHER;
      const t = env.tableOf(varOf(b, 'DF')); return t ? derived(t, t.cols.filter((c) => isNum(c.hint)).map((c) => ({ name: c.name, hint: 'float64' }))) : UNKNOWN;
    },
    pb_groupby: (b, env) => {
      if (b.getFieldValue('COL') || b.getFieldValue('AGG') === 'count') return OTHER;
      const t = env.tableOf(varOf(b, 'DF')), by = b.getFieldValue('BY');
      return t ? derived(t, t.cols.filter((c) => c.name !== by && (b.getFieldValue('AGG') === 'nunique' || isNum(c.hint))).map((c) => ({ name: c.name, hint: 'float64' }))) : UNKNOWN;
    },
    pb_quality: (b, env) => derived(env.tableOf(varOf(b, 'DF')) || {}, [['dtype', 'object'], ['missing', 'int64'], ['missing_%', 'float64'], ['unique', 'int64']].map(([name, hint]) => ({ name, hint }))),
    pb_to_frame: (b) => table(BK.splitCols(b.getFieldValue('NAMES')).map((name) => ({ name, hint: 'float64' }))),
    pb_transform: (b, env) => { const t = env.tableOf(varOf(b, 'X')); return t ? derived(t, t.cols.map((c) => ({ name: c.name, hint: 'float64' }))) : UNKNOWN; },
    pb_grid_attr: (b) => (b.getFieldValue('ATTR') === 'cv_results_' ? table(['params', 'mean_test_score', 'std_test_score', 'rank_test_score'].map((name) => ({ name, hint: name === 'params' ? 'object' : 'float64' }))) : UNKNOWN),
    pb_similar_values: () => table([['value', 'object'], ['count', 'int64'], ['similar_to', 'object'], ['count_similar', 'int64'], ['ratio', 'float64']].map(([name, hint]) => ({ name, hint }))),
    pb_selectk_scores: () => table([['feature', 'object'], ['score', 'float64'], ['p_value', 'float64'], ['selected', 'bool']].map(([name, hint]) => ({ name, hint }))),
    /* version 3.10: time series */
    pb_decompose: (b, env) => {
      const t = env.tableOf(varOf(b, 'DF')), c = t && t.cols.find((x) => x.name === b.getFieldValue('COL'));
      return table([['observed', c ? c.hint : ''], ['trend', 'float64'], ['seasonal', 'float64'], ['resid', 'float64']].map(([name, hint]) => ({ name, hint })), TR('ส่วนประกอบของอนุกรมเวลา'));
    },
    /* the next periods: their dates (and so the month levels get_dummies will make) follow the last date of the data */
    pb_future: (b, env) => {
      const t = env.tableOf(varOf(b, 'DF')), dc = b.getFieldValue('DATE') || 'date', season = b.getFieldValue('SEASON');
      const cols = [{ name: dc, hint: 'datetime64[us]' }, { name: 't', hint: 'int64' }].concat(season && season !== 'None' ? [{ name: season, hint: 'int64' }] : []);
      let fut = null;
      const s = t && colValues(t, dc);
      if (s && s.dtype === 'datetime64[ns]' && s.length) {
        try { fut = PB.futureFrame(PB.DataFrame.fromColumns({ [dc]: { values: s.values, dtype: 'datetime64[ns]' } }), dc, Number(b.getFieldValue('S')), b.getFieldValue('FREQ'), season === 'None' ? null : season); } catch (e) { fut = null; }
      }
      return table(fut ? cols.map((c) => Object.assign({ base: { df: fut, col: c.name } }, c)) : cols, TR('ช่วงเวลาถัดไป'));
    },
    pb_align_cols: (b, env) => { const r = env.tableOf(varOf(b, 'REF')); return r ? derived(env.tableOf(varOf(b, 'DF')) || r, r.cols.map((c) => ({ name: c.name, hint: c.hint, base: c.base }))) : UNKNOWN; },
    /* which k columns SelectKBest keeps is known only after it is fitted (the last run then tells) */
    pb_selectk_fit: () => UNKNOWN,
    pb_predict: () => UNKNOWN,
    procedures_callreturn: () => UNKNOWN,
    logic_ternary: () => UNKNOWN,
  };
  const OTHER_CATS = new Set(['cls', 'reg', 'clu', 'other', 'metric', 'viz', 'pybasic', 'train', 'prep', 'data', 'clean']);
  function evalValue(b, env) {
    if (!b || !b.isEnabled()) return UNKNOWN;
    const fn = VALUE[b.type];
    if (fn) { try { return fn(b, env) || UNKNOWN; } catch (e) { return UNKNOWN; } }
    const spec = BK.defs[b.type];
    if (spec && OTHER_CATS.has(spec.cat)) return OTHER;
    return b.type.startsWith('pb_') ? UNKNOWN : OTHER;        /* lists, numbers, text … are not tables */
  }
  /* statement blocks → how they change the variables */
  const inPlace = (b, env, f) => { const n = varOf(b, 'DF'), t = env.tableOf(n); if (t) env.set(n, derived(t, f(t.cols))); };
  /* the values a column holds, from the data it came from (null when unknown) */
  function colValues(t, name) {
    const c = t.cols.find((x) => x.name === name);
    return c && c.base && c.base.df && c.base.df.has(c.base.col) ? c.base.df.col(c.base.col) : null;
  }
  const rowsOf = (t) => { const c = t.cols.find((x) => x.base && x.base.df); return c ? c.base.df.nrows : null; };
  const withBase = (cols, name, base) => cols.map((c) => (c.name === name ? { name: c.name, hint: c.hint, base } : c));
  const one = (name, values, dtype) => ({ df: PB.DataFrame.fromColumns({ [name]: { values, dtype } }), col: name });
  /* version 3.10: a column computed from a date column (.dt.year / .month / .quarter / .dayofweek, pd.to_datetime)
     gets values worked out from the data the date column came from, so get_dummies of it knows its levels */
  const DT_PART = { year: 'year', month: 'month', quarter: 'quarter', dow: 'dayofweek' };
  function derivedBase(v, env) {
    if (!v) return null;
    try {
      if (v.type === 'pb_col_func' && DT_PART[v.getFieldValue('FN')]) {
        const src = env.tableOf(varOf(v, 'DF')), s = src && colValues(src, v.getFieldValue('COL'));
        if (s && s.dtype === 'datetime64[ns]') return one('_', s.dt(DT_PART[v.getFieldValue('FN')]).values, 'int64');
      }
      if (v.type === 'pb_to_datetime') {
        const src = env.tableOf(varOf(v, 'DF')), s = src && colValues(src, v.getFieldValue('COL'));
        if (s) return one('_', PB.toDatetime(s).values, 'datetime64[ns]');
      }
    } catch (e) { /* values that do not convert: the levels stay unknown */ }
    return null;
  }
  const VAL_HINT = { pb_th_tokens: 'object', pb_ewm: 'float64', pb_shift: 'float64', pb_rolling: 'float64' };
  const STMT = {
    variables_set: (b, env) => {
      const v = b.getInputTargetBlock('VALUE'), name = varOf(b, 'VAR'), val = evalValue(v, env);
      env.set(name, val);
      if (v && (v.type === 'pb_dataset' || v.type === 'pb_read_file') && name) env.lastSource = name;
    },
    pb_set_col: (b, env) => {
      const v = b.getInputTargetBlock('VAL'), name = b.getFieldValue('NAME'), base = derivedBase(v, env);
      inPlace(b, env, (cols) => { const out = addCol(cols, name, (v && VAL_HINT[v.type]) || (base ? PB.dtypeLabel(base.df.dtypeOf('_')) : '')); return base ? withBase(out, name, base) : out; });
    },
    pb_date_range: (b, env) => inPlace(b, env, (cols) => {
      const name = b.getFieldValue('NAME'), out = addCol(cols, name, 'datetime64[us]'), n = rowsOf({ cols });
      let dates = null;
      try { if (n) dates = PB.dateRange(b.getFieldValue('START'), n, b.getFieldValue('FREQ')); } catch (e) { dates = null; }
      return dates ? withBase(out, name, one('_', dates, 'datetime64[ns]')) : out;
    }),
    pb_time_index: (b, env) => inPlace(b, env, (cols) => addCol(cols, b.getFieldValue('NAME'), 'int64')),
    pb_lags: (b, env) => inPlace(b, env, (cols) => { let out = cols; for (let i = 1; i <= Number(b.getFieldValue('N')); i++) out = addCol(out, 'lag_' + i, 'float64'); return out; }),
    pb_label_encode: (b, env) => inPlace(b, env, (cols) => retype(cols, [b.getFieldValue('COL')], 'int64')),
    pb_to_numeric: (b, env) => inPlace(b, env, (cols) => retype(cols, [b.getFieldValue('COL')], 'float64')),
    pb_parse_dates: (b, env) => inPlace(b, env, (cols) => retype(cols, [b.getFieldValue('COL')], 'datetime64[us]')),
    pb_scale_cols: (b, env) => inPlace(b, env, (cols) => retype(cols, BK.splitCols(b.getFieldValue('COLS')), 'float64')),
    pb_split: (b, env) => {
      const x = env.tableOf(varOf(b, 'X'));
      env.set(varOf(b, 'XTR'), x || UNKNOWN); env.set(varOf(b, 'XTE'), x || UNKNOWN);
      env.set(varOf(b, 'YTR'), OTHER); env.set(varOf(b, 'YTE'), OTHER);
    },
    pb_fit: (b, env) => { const x = env.tableOf(varOf(b, 'X')); if (x) env.models.set(varOf(b, 'M'), x.cols); },
    pb_fit_x: (b, env) => { const x = env.tableOf(varOf(b, 'X')); if (x) env.models.set(varOf(b, 'M'), x.cols); },
    pb_compare: (b, env) => env.set(varOf(b, 'RES'), UNKNOWN),
    pb_compare_cv: (b, env) => env.set(varOf(b, 'RES'), table(['model', 'mean_score', 'std_score'].map((name) => ({ name, hint: name === 'model' ? 'object' : 'float64' })))),
    controls_for: (b, env) => env.set(varOf(b, 'VAR'), OTHER),
    controls_forEach: (b, env) => env.set(varOf(b, 'VAR'), OTHER),
  };
  const STMT_INPUT = () => (Blockly.ConnectionType ? Blockly.ConnectionType.NEXT_STATEMENT : 3);
  /* run order of the interpreter: top stacks by position, function definitions skipped, disabled blocks skipped */
  function walk(ws, target) {
    const env = new Env(); let at = null;
    const stack = (b) => {
      for (; b; b = b.getNextBlock()) {
        if (b === target && !at) at = env.snapshot();
        if (!b.isEnabled()) continue;
        const fn = STMT[b.type];
        if (fn) { try { fn(b, env); } catch (e) { /* half-built block: ignore */ } }
        for (const inp of b.inputList) if (inp.connection && inp.connection.type === STMT_INPUT()) stack(inp.connection.targetBlock());
      }
    };
    for (const top of ws.getTopBlocks(true)) {
      if (top.type === 'procedures_defnoreturn' || top.type === 'procedures_defreturn' || top.outputConnection) continue;
      stack(top);
    }
    return { end: env, at: at || env };
  }
  /* the statement a block belongs to (value blocks sit inside a statement) */
  function stmtOf(b) { let s = b; while (s && s.outputConnection && s.getParent()) s = s.getParent(); return s; }
  function envFor(block) {
    const ws = A.ws; if (!ws) return null;
    const own = block && block.workspace === ws;
    return walk(ws, own ? stmtOf(block) : null).at;
  }
  S.envFor = envFor;
  S.walk = (target) => walk(A.ws, target || null);

  /* columns of a table variable at the place where `block` sits; falls back to the last run */
  S.columns = (block, varName) => {
    if (!varName) return null;
    const env = envFor(block), t = env && env.tableOf(varName);
    if (t) return { cols: t.cols, src: t.src, from: 'blocks' };
    if (A.knownCols && A.knownCols.has(varName)) return { cols: A.knownCols.get(varName), src: '', from: 'run' };
    return null;
  };
  /* table variables in scope at `block` (name → {cols, src}); after a run the variables seen then are added */
  S.tablesAt = (block) => {
    const out = new Map(), env = envFor(block);
    if (env) for (const [n, v] of env.vars) if (v.kind === TABLE) out.set(n, v);
    if (A.knownCols) for (const [n, cols] of A.knownCols) if (!out.has(n) && !(env && env.vars.has(n) && env.vars.get(n).kind === 'other')) out.set(n, { kind: TABLE, cols, src: TR('จากการรันล่าสุด') });
    return out;
  };

  /* ---------------- values of a column (version 3.8) ----------------
     For the value pickers of "แทนค่า" / "กรองแถว" / "เติมค่าว่างด้วยค่า": the program is run quietly up to the
     statement holding the block (no output, a time limit), so the values are the ones that column holds at that
     point. When that is not possible (a file not uploaded, an error before, too slow) the values come from the
     data the column was read from, or from the last run. */
  const QUIET = new Proxy({}, { get: (t, k) => (k === 'log' ? [] : () => null) });
  function dryRun(stmt, budgetMs) {
    const ws = A.ws;
    const keep = [PB.onWarn, PB.warnings];
    PB.onWarn = null; PB.warnings = [];
    const t0 = performance.now();
    try {
      const interp = new PB.Interp(ws, QUIET), gen = interp.run();
      for (;;) {
        const r = gen.next();
        if (r.done) return null;
        if (r.value && r.value.block === stmt) return interp;
        if (performance.now() - t0 > budgetMs) return null;
      }
    } catch (e) { return null; } finally { [PB.onWarn, PB.warnings] = keep; }
  }
  const showValue = (v) => (typeof v === 'string' ? (v !== v.trim() || v === '' ? JSON.stringify(v) : v) : typeof v === 'boolean' ? (v ? 'True' : 'False') : typeof v === 'number' ? PB.numStr(v) : PB.str(v));
  function summarize(series, from, src) {
    if (!series || series.dtype === 'datetime64[ns]') return null;
    const vc = series.value_counts(), items = vc.index.map((v, i) => ({ value: v, n: vc.values[i], label: showValue(v) }));
    return { items, missing: series.values.filter(isMiss).length, from, src: src || '' };
  }
  S.valuesAt = (block, varName, col, budgetMs = 1500) => {
    if (!A.ws || !varName || !col || !block) return null;
    const stmt = stmtOf(block);
    const interp = stmt && !stmt.outputConnection ? dryRun(stmt, budgetMs) : null;
    if (interp && interp.globals.has(varName)) {
      const df = PB.unbox(interp.globals.get(varName));
      if (df instanceof PB.DataFrame && df.has(col)) return summarize(df.col(col), 'here');
    }
    const info = S.columns(block, varName), c = info && info.cols.find((x) => x.name === col);
    if (c && c.base && c.base.df && c.base.df.has(c.base.col)) return summarize(c.base.df.col(c.base.col), 'source', info.src);
    const v = A.vars && PB.unbox(A.vars.get(varName));
    if (v instanceof PB.DataFrame && v.has(col)) return summarize(v.col(col), 'run');
    return null;
  };

  /* ---------------- table fields of each block type ---------------- */
  const tableFieldCache = new Map();
  S.tableFields = (type) => {
    if (!tableFieldCache.has(type)) {
      const spec = BK.defs[type];
      tableFieldCache.set(type, spec ? Object.entries(spec.f || {}).filter(([, s]) => s.t === 'var' && s.def === 'df').map(([k]) => k) : []);
    }
    return tableFieldCache.get(type);
  };

  /* ---------------- new blocks from the palette ----------------
     Palette blocks point at a table called "df". When the program's table has another name (for example
     data = pd.read_csv("shop.csv")) a new block is switched to the table in use at the place it is dropped.
     A reference to a variable that already holds a table somewhere in the program is never changed. */
  const PREDICT_ROW_DEFAULT = '{"sepal_length": 5.1, "sepal_width": 3.5, "petal_length": 1.4, "petal_width": 0.2}';
  const pyLit = (v) => (v === null || v === undefined ? '0' : typeof v === 'boolean' ? (v ? 'True' : 'False') : typeof v === 'number' ? (Number.isFinite(v) ? PB.numStr(v) : '0') : PB.py.str(v));
  S.rowDict = (cols) => '{' + cols.map((c) => `${PB.py.str(c.name)}: ${pyLit(S.example(c))}`).join(', ') + '}';
  S.adopt = (root, opts = {}) => {
    const ws = A.ws; if (!ws || !root || root.workspace !== ws) return [];
    const changed = [];
    const all = walk(ws, stmtOf(root)), here = all.at, end = all.end;
    const target = here.mainTable() || end.mainTable();
    const isTable = (n) => end.everTables.has(n) || here.everTables.has(n);
    const setVar = (b, field, name) => {
      const v = ws.getVariable ? ws.getVariable(name) : ws.getVariableMap().getVariable(name);
      if (!v) return;
      b.setFieldValue(v.getId(), field); changed.push([b.id, field, name]);
    };
    for (const b of root.getDescendants(false)) {
      for (const field of S.tableFields(b.type)) {
        const cur = varOf(b, field);
        if (!target || !cur || cur === target || isTable(cur)) continue;
        setVar(b, field, target);
        /* df = df.dropna() style blocks: the variable being assigned follows the table it reads */
        const parent = b.getParent();
        if (parent && parent.type === 'variables_set' && parent.getInputTargetBlock('VALUE') === b && varOf(parent, 'VAR') === cur) setVar(parent, 'VAR', target);
      }
      if (b.type === 'pb_predict_row' && (opts.row !== false) && (b.getFieldValue('ROW') === PREDICT_ROW_DEFAULT || !b.getFieldValue('ROW'))) {
        const feats = here.models.get(varOf(b, 'M')) || end.models.get(varOf(b, 'M'));
        if (feats && feats.length) { b.setFieldValue(S.rowDict(feats), 'ROW'); changed.push([b.id, 'ROW']); }
      }
    }
    return changed;
  };
})();
