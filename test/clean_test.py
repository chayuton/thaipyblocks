"""Cleansing & normalization: (1) programs that use every new block and option, (2) the cleansing assistant
(wizard task "clean") with different choices on every table dataset and on uploaded files, (3) the model
wizard's cleaning/scaling options (prep) for every table task. Each program runs in the app, the generated
Python runs in CPython, and every printed output is compared text-for-text (tables included; numbers that come
out of model training may differ only in the last bits).
pandas 3 is run twice: with text columns as object (like pandas 2 and the app) for exact comparison, and with
its default string dtype to make sure the code also runs there and prints the same labelled numbers."""
import base64, glob, json, os, re, shutil, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from py_check import PRELUDE, DATA
from wizard_modes import label_lines, same
from playwright.sync_api import sync_playwright

OBJECT_STR = 'import pandas as pd\npd.options.future.infer_string = False\npd.set_option("display.max_columns", None)\n'

# programs written with the app's own recipe helpers (PB.R); V(name) = variable field
PROGRAMS = {
    'coffee_all_steps': r'''
      S.set('df', B('pb_dataset', { NAME: 'coffee' })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 5 })),
      S.print(B('pb_quality', { DF: V('df') })),
      S.print2('จำนวนแถวซ้ำ:', B('pb_df_info', { DF: V('df'), FN: 'dups' })),
      S.print(B('pb_find_rows', { DF: V('df'), WHAT: 'dups' })),
      S.set('rows', B('pb_find_rows', { DF: V('df'), WHAT: 'nulls' })),
      S.print2('แถวที่มีค่าว่าง:', B('pb_df_info', { DF: V('rows'), FN: 'shape' })),
      S.print(B('pb_series_stat', { DF: V('df'), COL: 'province', FN: 'value_counts' })),
      S.set('df', B('pb_na_values', { DF: V('df'), VALS: '"-", "?", "ไม่ระบุ"' })),
      S.print(B('pb_quality', { DF: V('df') })),
      S.set('df', B('pb_drop_dups', { DF: V('df'), COLS: '', KEEP: 'first' })),
      S.set('df', B('pb_drop_dups', { DF: V('df'), COLS: 'member_id', KEEP: 'last' })),
      B('pb_clean_text', { DF: V('df'), COL: 'province', FN: 'strip' }),
      B('pb_clean_text', { DF: V('df'), COL: 'gender', FN: 'strip' }),
      B('pb_clean_text', { DF: V('df'), COL: 'member_type', FN: 'strip' }),
      B('pb_clean_text', { DF: V('df'), COL: 'member_type', FN: 'title' }),
      B('pb_replace_val', { DF: V('df'), COL: 'province' }, { OLD: S.text('กทม'), NEW: S.text('กรุงเทพ') }),
      S.print(B('pb_series_stat', { DF: V('df'), COL: 'province', FN: 'value_counts' })),
      S.print(B('pb_series_stat', { DF: V('df'), COL: 'member_type', FN: 'value_counts' })),
      B('pb_to_numeric', { DF: V('df'), COL: 'monthly_spend', MODE: 'strip' }),
      B('pb_to_numeric', { DF: V('df'), COL: 'satisfaction', MODE: 'plain' }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'dtypes' })),
      S.set('df', B('pb_drop_sparse', { DF: V('df'), P: 0.5 })),
      S.print2('ขอบเขตค่าปกติ:', B('pb_outlier_bounds', { DF: V('df'), COL: 'age', M: 'iqr', K: 1.5 })),
      S.print2('ขอบเขต z-score:', B('pb_outlier_bounds', { DF: V('df'), COL: 'monthly_spend', M: 'zscore', K: 3 })),
      S.print(B('pb_outlier_rows', { DF: V('df'), COL: 'age', M: 'iqr', K: 1.5 })),
      B('pb_outlier_fix', { DF: V('df'), COL: 'age', ACT: 'nan', M: 'iqr', K: 1.5 }),
      B('pb_outlier_fix', { DF: V('df'), COL: 'monthly_spend', ACT: 'clip', M: 'iqr', K: 1.5 }),
      B('pb_fillna', { DF: V('df'), COL: 'age', HOW: 'median' }),
      B('pb_fill_value', { DF: V('df'), COL: 'gender' }, { VAL: S.text('ไม่ทราบ') }),
      B('pb_fill_group', { DF: V('df'), COL: 'visits', BY: 'member_type', AGG: 'median' }),
      B('pb_fill_method', { DF: V('df'), COL: 'satisfaction', FN: 'interpolate' }),
      B('pb_fill_method', { DF: V('df'), COL: 'monthly_spend', FN: 'ffill' }),
      S.set('df', B('pb_df_clean', { DF: V('df'), FN: 'reset' })),
      S.print(B('pb_quality', { DF: V('df') })),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'describe' })),
      B('pb_plot_box_cols', { DF: V('df'), COLS: 'age, visits, monthly_spend', TITLE: 'ก่อนปรับสเกล' }),
      B('pb_scale_cols', { DF: V('df'), COLS: 'age, visits, monthly_spend', CLS: 'MinMaxScaler' }),
      B('pb_set_col', { DF: V('df'), NAME: 'sat_z' }, { VAL: B('pb_scale_formula', { FN: 'zscore', DF: V('df'), COL: 'satisfaction' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'sat_mm' }, { VAL: B('pb_scale_formula', { FN: 'minmax', DF: V('df'), COL: 'satisfaction' }) }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'describe' })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 8 })),
      S.print2('ค่าเฉลี่ย sat_z:', B('pb_series_stat', { DF: V('df'), COL: 'sat_z', FN: 'mean' })),
      B('pb_plot_box_cols', { DF: V('df'), COLS: 'age, visits, monthly_spend', TITLE: 'หลังปรับสเกล' }),
    ''',
    'titanic_options': r'''
      S.set('df', B('pb_dataset', { NAME: 'titanic' })),
      S.print(B('pb_quality', { DF: V('df') })),
      S.set('df', B('pb_drop_sparse', { DF: V('df'), P: 0.5 })),
      B('pb_fill_group', { DF: V('df'), COL: 'age', BY: 'pclass', AGG: 'median' }),
      B('pb_fill_method', { DF: V('df'), COL: 'embarked', FN: 'bfill' }),
      B('pb_fill_method', { DF: V('df'), COL: 'embark_town', FN: 'ffill' }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'isnull' })),
      S.print2('ขอบเขต fare:', B('pb_outlier_bounds', { DF: V('df'), COL: 'fare', M: 'zscore', K: 3 })),
      B('pb_outlier_fix', { DF: V('df'), COL: 'fare', ACT: 'remove', M: 'zscore', K: 3 }),
      B('pb_outlier_fix', { DF: V('df'), COL: 'age', ACT: 'clip', M: 'iqr', K: 1.5 }),
      B('pb_outlier_fix', { DF: V('df'), COL: 'sibsp', ACT: 'clip', M: 'iqr', K: 1.5 }),
      B('pb_outlier_fix', { DF: V('df'), COL: 'parch', ACT: 'nan', M: 'iqr', K: 3 }),
      S.print2('จำนวนแถว:', B('pb_df_info', { DF: V('df'), FN: 'shape' })),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'describe' })),
      S.set('a', B('pb_cols', { DF: V('df'), COLS: 'age, fare, sibsp' })),
      B('pb_scale_cols', { DF: V('a'), COLS: 'age, fare, sibsp', CLS: 'StandardScaler' }),
      S.print(B('pb_df_info', { DF: V('a'), FN: 'describe' })),
      S.set('b', B('pb_cols', { DF: V('df'), COLS: 'age, fare, parch' })),
      B('pb_scale_cols', { DF: V('b'), COLS: 'age, fare, parch', CLS: 'RobustScaler' }),
      S.print(B('pb_df_view', { DF: V('b'), FN: 'head', N: 6 })),
      S.set('c', B('pb_cols', { DF: V('df'), COLS: 'age, fare, parch' })),
      B('pb_scale_cols', { DF: V('c'), COLS: 'age, fare, parch', CLS: 'MaxAbsScaler' }),
      S.print(B('pb_df_view', { DF: V('c'), FN: 'tail', N: 6 })),
      S.print(B('pb_groupby', { DF: V('df'), BY: 'class', COL: 'fare', AGG: 'mean' })),
      S.print(B('pb_groupby', { DF: V('df'), BY: 'class', COL: 'age', AGG: 'std' })),
      S.print(B('pb_groupby', { DF: V('df'), BY: 'class', COL: '', AGG: 'sum' })),
    ''',
    'mpg_text_types': r'''
      S.set('df', B('pb_dataset', { NAME: 'mpg' })),
      B('pb_fill_method', { DF: V('df'), COL: 'horsepower', FN: 'interpolate' }),
      S.print2('ค่าว่าง horsepower:', B('pb_series_stat', { DF: V('df'), COL: 'horsepower', FN: 'nulls' })),
      B('pb_clean_text', { DF: V('df'), COL: 'origin', FN: 'upper' }),
      B('pb_clean_text', { DF: V('df'), COL: 'name', FN: 'title' }),
      B('pb_str_replace', { DF: V('df'), COL: 'name', OLD: 'Chevrolet', NEW: 'Chevy' }),
      B('pb_replace_val', { DF: V('df'), COL: 'cylinders' }, { OLD: S.num(3), NEW: S.num(4) }),
      B('pb_replace_val', { DF: V('df'), COL: 'model_year' }, { OLD: S.num(70), NEW: S.num(70.5) }),
      S.print(B('pb_series_stat', { DF: V('df'), COL: 'cylinders', FN: 'value_counts' })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 6 })),
      S.set('df', B('pb_na_values', { DF: V('df'), VALS: '4, "USA"' })),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'isnull' })),
      B('pb_to_numeric', { DF: V('df'), COL: 'weight', MODE: 'strip' }),
      B('pb_to_numeric', { DF: V('df'), COL: 'name', MODE: 'plain' }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'dtypes' })),
      S.print(B('pb_outlier_rows', { DF: V('df'), COL: 'horsepower', M: 'iqr', K: 1.5 })),
      S.set('df', B('pb_drop_dups', { DF: V('df'), COLS: 'cylinders, origin', KEEP: 'last' })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 10 })),
    ''',
    'penguins_scaling': r'''
      S.set('df', B('pb_dataset', { NAME: 'penguins' })),
      S.print(B('pb_find_rows', { DF: V('df'), WHAT: 'nulls' })),
      B('pb_fill_group', { DF: V('df'), COL: 'body_mass_g', BY: 'species', AGG: 'mean' }),
      B('pb_fill_group', { DF: V('df'), COL: 'flipper_length_mm', BY: 'island', AGG: 'median' }),
      B('pb_fillna', { DF: V('df'), COL: 'sex', HOW: 'mode' }),
      B('pb_fillna', { DF: V('df'), COL: 'bill_length_mm', HOW: 'mean' }),
      B('pb_fill_value', { DF: V('df'), COL: 'bill_depth_mm' }, { VAL: S.num(0) }),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 5 })),
      B('pb_set_col', { DF: V('df'), NAME: 'mass_mm' }, { VAL: B('pb_scale_formula', { FN: 'minmax', DF: V('df'), COL: 'body_mass_g' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'flip_z' }, { VAL: B('pb_scale_formula', { FN: 'zscore', DF: V('df'), COL: 'flipper_length_mm' }) }),
      B('pb_scale_cols', { DF: V('df'), COLS: 'bill_length_mm, bill_depth_mm', CLS: 'MinMaxScaler' }),
      S.print(B('pb_df_info', { DF: V('df'), FN: 'describe' })),
      S.print2('mass_mm สูงสุด:', B('pb_series_stat', { DF: V('df'), COL: 'mass_mm', FN: 'max' })),
      S.print2('flip_z std:', B('pb_series_stat', { DF: V('df'), COL: 'flip_z', FN: 'std' })),
      S.print(B('pb_groupby', { DF: V('df'), BY: 'species', COL: '', AGG: 'mean' })),
      B('pb_plot_box_cols', { DF: V('df'), COLS: 'bill_length_mm, bill_depth_mm, mass_mm', TITLE: '' }),
    ''',
}

# the cleansing assistant: source, choices merged over the dataset preset (None = exactly what the sample builds),
# switches for single fixes ("on" flags of the issue list)
CLEAN_CASES = [
    ('assistant_coffee_sample', {'dataset': 'coffee'}, None, None),
    ('assistant_coffee_clip_standard', {'dataset': 'coffee'}, {'outliers': {'action': 'clip', 'cols': ['age', 'monthly_spend']}, 'missing': {'num': 'mean', 'cat': 'mode'}, 'scale': {'method': 'standard'}, 'save': True}, None),
    ('assistant_coffee_remove_drop_robust', {'dataset': 'coffee'}, {'outliers': {'action': 'remove'}, 'missing': {'num': 'drop', 'cat': 'drop'}, 'scale': {'method': 'robust'}}, {'case': False, 'replace': False}),
    ('assistant_titanic_nan_maxabs', {'dataset': 'titanic'}, {'outliers': {'action': 'nan', 'cols': ['fare']}, 'scale': {'method': 'maxabs'}}, None),
    ('assistant_mpg_clip_minmax', {'dataset': 'mpg'}, {'outliers': {'action': 'clip'}, 'scale': {'method': 'minmax'}}, None),
    ('assistant_penguins_drop_standard', {'dataset': 'penguins'}, {'missing': {'num': 'drop', 'cat': 'drop'}, 'scale': {'method': 'standard'}}, None),
    ('assistant_tips_clip_robust', {'dataset': 'tips'}, {'outliers': {'action': 'clip'}, 'scale': {'method': 'robust'}}, None),
    ('assistant_iris_dedupe_minmax', {'dataset': 'iris'}, {'scale': {'method': 'minmax'}}, {'dedupe': True}),
    ('assistant_file_shop_messy', {'file': 'shop_messy.csv'}, {'outliers': {'action': 'nan'}, 'missing': {'num': 'median', 'cat': 'unknown'}, 'scale': {'method': 'minmax'}, 'save': True}, None),
    ('assistant_file_customers', {'file': 'customers.csv'}, {'outliers': {'action': 'clip'}, 'scale': {'method': 'standard'}}, None),
    ('assistant_file_thai_tis', {'file': 'thai_tis.csv'}, {}, None),
]
# the model wizard's "ทำความสะอาด & ปรับสเกล" options: source, task, models, evaluation, prep
PREP_CASES = [
    ('prep_titanic_fill_clip_minmax', {'dataset': 'titanic'}, 'classification', ['LogisticRegression', 'RandomForestClassifier'], 'holdout', {'missing': 'fill', 'dedupe': True, 'outliers': 'clip', 'scaler': 'minmax'}),
    ('prep_titanic_drop_remove_robust_cv', {'dataset': 'titanic'}, 'classification', ['KNeighborsClassifier'], 'cv', {'missing': 'drop', 'dedupe': False, 'outliers': 'remove', 'scaler': 'robust'}),
    ('prep_mpg_fill_remove_standard', {'dataset': 'mpg'}, 'regression', ['Ridge', 'SVR'], 'holdout', {'missing': 'fill', 'dedupe': True, 'outliers': 'remove', 'scaler': 'standard'}),
    ('prep_mpg_drop_clip_none_grid', {'dataset': 'mpg'}, 'regression', ['KNeighborsRegressor'], 'grid', {'missing': 'drop', 'dedupe': False, 'outliers': 'clip', 'scaler': 'none'}),
    ('prep_penguins_kmeans_minmax', {'dataset': 'penguins'}, 'clustering', ['KMeans'], 'holdout', {'missing': 'fill', 'dedupe': False, 'outliers': 'clip', 'scaler': 'minmax'}),
    ('prep_penguins_pca_robust', {'dataset': 'penguins'}, 'pca', ['PCA'], 'holdout', {'missing': 'drop', 'dedupe': False, 'outliers': 'none', 'scaler': 'robust'}),
    ('prep_titanic_anomaly_fill', {'dataset': 'titanic'}, 'anomaly', ['IsolationForest'], 'holdout', {'missing': 'fill', 'dedupe': True, 'outliers': 'none', 'scaler': 'standard'}),
    ('prep_tips_dbscan_standard', {'dataset': 'tips'}, 'clustering', ['DBSCAN'], 'holdout', {'missing': 'auto', 'dedupe': True, 'outliers': 'remove', 'scaler': 'standard'}),
    ('prep_file_customers_svc_minmax', {'file': 'customers.csv'}, 'classification', ['SVC', 'GaussianNB'], 'holdout', {'missing': 'fill', 'dedupe': True, 'outliers': 'clip', 'scaler': 'minmax'}),
]
FILES = os.path.join(ROOT, 'test', 'files')
UPLOADS = ['shop_messy.csv', 'customers.csv', 'thai_tis.csv']

def run_py(code, obj=True):
    """runs in a fresh folder holding copies of the test files (programs read uploads and may write clean_data.csv)"""
    pre = (OBJECT_STR if obj else '') + PRELUDE
    work = tempfile.mkdtemp(prefix='clean_test_')
    for f in UPLOADS: shutil.copy(os.path.join(FILES, f), work)
    path = os.path.join(work, 'program.py')
    with open(path, 'w', encoding='utf-8') as f: f.write(pre + code)
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=900, cwd=work)
    shutil.rmtree(work, ignore_errors=True)
    return r.returncode, r.stdout, r.stderr

def py_prints(code):
    """run the program again with print() captured call by call, so each print is one chunk"""
    hook = 'import builtins as _b\n_P = []\n_orig = _b.print\ndef _cap(*a, **k):\n    import io\n    s = io.StringIO(); _orig(*a, file=s, **{x: y for x, y in k.items() if x != "file"}); _P.append(s.getvalue().rstrip("\\n"))\n_b.print = _cap\n'
    tail = '\nimport json as _j\n_orig("@@PRINTS@@" + _j.dumps(_P, ensure_ascii=False))\n'
    rc, out, err = run_py(hook + code + tail)
    if rc != 0: return None, err
    line = [l for l in out.splitlines() if l.startswith('@@PRINTS@@')][-1]
    return json.loads(line[len('@@PRINTS@@'):]), ''

BUILD = '''(body) => {
  const R = PB.R, V = (n) => ({ name: n }), B = R.b, S = { set: R.set, print: R.print, print2: R.print2, text: R.text, num: R.num };
  const stmts = eval('[' + body + ']');
  PB.ui.loadProgram(R.program(stmts), { run: true });
}'''
# same steps as the assistant dialog: scan → defaults (dataset preset + choices) → switches → R.build
BUILD_CLEAN = '''([src, preset, on]) => {
  const base = src.dataset ? PB.DATASETS[src.dataset].tasks.clean || {} : {};
  let cfg;
  if (preset === null && on === null) cfg = Object.assign({ task: 'clean', models: [] }, src, base);
  else {
    const raw = PB.R.prepData(src), c = PB.R.cleanDefaults(PB.R.cleanScan(raw, PB.R.inferRoles(raw)), Object.assign({}, base, preset || {}));
    Object.assign(c.on, on || {});
    cfg = Object.assign({ task: 'clean', models: [] }, src, c);
  }
  PB.ui.loadProgram(PB.R.build(cfg), { run: true });
  return PB.R.cleanPlan(PB.R.prepData(src), cfg.placeholders ? cfg : Object.assign({}, cfg, PB.R.cleanDefaults(PB.R.cleanScan(PB.R.prepData(src)), cfg))).steps.map((x) => x.kind + (x.col ? ':' + x.col : '') + (x.fn ? '.' + x.fn : '') + (x.action ? '.' + x.action : '') + (x.how ? '.' + x.how : '') + (x.cls ? '.' + x.cls : '')).join(' ');
}'''
# same as the model wizard's build(): dataset/file config + prep choices → R.build
BUILD_PREP = '''([src, task, models, ev, prep]) => {
  const base = src.file ? PB.ui._fileConfig(src.file, 'table', task) : PB.DATASETS[src.dataset].tasks[task];
  const cfg = Object.assign({ task, models, evalMode: ev }, base, src, { prep });
  PB.ui.loadProgram(PB.R.build(cfg), { run: true });
  const c = PB.R.applyPrep(cfg);
  return JSON.stringify({ fill: c.fill, dropna: c.dropna, dropnaCols: c.dropnaCols, dedupe: c.dedupe, outliers: c.outlierAction ? c.outlierAction + ' ' + c.outlierCols.join(',') : '-', scaler: c.scaler });
}'''
NUM = r'-?\d+\.\d+(?:e[-+]?\d+)?'

def near(a, b):
    """same text except numbers from model training that differ only in the last bits"""
    na, nb = re.findall(NUM, a), re.findall(NUM, b)
    if len(na) != len(nb) or re.sub(NUM, '#', a) != re.sub(NUM, '#', b): return False
    return all(abs(float(x) - float(y)) <= 1e-9 * max(1, abs(float(y))) for x, y in zip(na, nb))

def main(only=None):
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
        for fname in UPLOADS:
            data = base64.b64encode(open(os.path.join(FILES, fname), 'rb').read()).decode()
            page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await PB.ui.readFile(new File([bin], name)); }''', [fname, data])
        jobs = [(name, BUILD, body) for name, body in PROGRAMS.items()]
        jobs += [(name, BUILD_CLEAN, [src, preset, on]) for name, src, preset, on in CLEAN_CASES]
        jobs += [(name, BUILD_PREP, [src, task, models, ev, prep]) for name, src, task, models, ev, prep in PREP_CASES]
        for name, js, arg in jobs:
            if only and name not in only: continue
            t0 = time.time()
            info = page.evaluate(js, arg)
            page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=600000)
            res = page.evaluate('''() => ({ errors: PB.ui.out.log.filter((e) => e.kind === 'error').map((e) => e.pyType + ': ' + e.message + ' / ' + e.thai),
                prints: PB.ui.out.log.filter((e) => e.kind === 'print').map((e) => e.text), charts: PB.ui.out.log.filter((e) => e.kind === 'chart').length })''')
            code = page.evaluate('PB.ui.fullScript("none")')
            pys, err = py_prints(code)
            rc2, out2, err2 = run_py(code, obj=False)
            print(f'== {name}: app {"OK" if not res["errors"] else "ERROR"} · {len(res["prints"])} prints · {res["charts"]} charts · python {"OK" if pys is not None else "FAIL"} · pandas-default-str {"OK" if rc2 == 0 else "FAIL"} · {time.time() - t0:.1f}s')
            if info: print('   plan:', info)
            for e in res['errors']: print('   APP ERROR:', e); fails.append(name + ' app')
            if pys is None: print('   PY ERROR:', err[-1500:]); fails.append(name + ' python'); continue
            if rc2 != 0: print('   PY (str dtype) ERROR:', err2[-1500:]); fails.append(name + ' python-str')
            if len(pys) != len(res['prints']): print(f'   print count app={len(res["prints"])} python={len(pys)}'); fails.append(name + ' count')
            exact = close = 0
            for i, (a, q) in enumerate(zip(res['prints'], pys)):
                if a == q: exact += 1; continue
                if near(a, q):
                    close += 1
                    d = next((x, y) for x, y in zip(re.findall(NUM, a), re.findall(NUM, q)) if x != y)
                    print(f'   ≈ print #{i}: app {d[0]} · python {d[1]}')
                    continue
                fails.append(f'{name} print {i}')
                print(f'   ≠ print #{i}\n--- app ---\n{a[:1800]}\n--- python ---\n{q[:1800]}')
            print(f'   identical prints: {exact}/{len(pys)}' + (f' · {close} equal up to last-bit float noise' if close else ''))
            # the default pandas-3 string dtype run prints the same labelled values
            app = label_lines('\n'.join(res['prints'])); py2 = label_lines(out2)
            for k, v in app.items():
                if k in py2 and not same(v, py2[k]): print(f'   ≠ (str dtype) {k} {v[:80]} | {py2[k][:80]}'); fails.append(name + ' str ' + k)
        print('page errors:', errs[:3])
        if errs: fails.append('page errors')
        b.close()
    print('failures:', fails)
    return fails

if __name__ == '__main__':
    main(set(sys.argv[1:]) or None)
