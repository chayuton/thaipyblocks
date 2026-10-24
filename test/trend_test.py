"""Version 3.10: trend forecasting — the time index t, comparisons with earlier periods (shift / diff / pct_change),
exponential smoothing, the classical decomposition (trend + seasonal + residual) and its chart, several columns in
one chart, the next periods for a trend model (make_future + get_dummies + reindex), the seasonal naive baseline and
cross-validation with TimeSeriesSplit; the wizard tasks "พยากรณ์แนวโน้ม + ฤดูกาล" and "ดูแนวโน้มและฤดูกาล".

1. Programs with every new block, and the wizard on flights and on uploaded files (monthly, quarterly and daily
   dates), run in the app and in CPython; every printed output must be the same text (the machinery of
   test/clean_test.py), and errors must be the same Python exceptions.
2. The engine against pandas / scikit-learn on hundreds of random inputs: rolling (center, min_periods),
   shift / diff / pct_change, ewm, decompose (and statsmodels' seasonal_decompose when it is installed),
   make_future, seasonal_naive and TimeSeriesSplit — values, dtypes and error messages.
3. The interface: the toolbox category, the wizard choices (evaluation, one model at a time, the note on tree
   models, the frequency of an uploaded file), columns known before a run, the compact decomposition charts,
   the level-4 exercises, and the same in English.
Run: python3 test/trend_test.py"""
import base64, json, math, os, random, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
import clean_test
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

ok_all = []
def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    ok_all.append(bool(cond)); return cond

# test files with quarterly and daily dates (written next to copies of the usual test files)
WORK = tempfile.mkdtemp(prefix='trend_test_')
for f in clean_test.UPLOADS + ['sales_monthly.csv']: shutil.copy(os.path.join(clean_test.FILES, f), WORK)
with open(os.path.join(WORK, 'sales_quarterly.csv'), 'w', encoding='utf-8') as f:
    f.write('quarter_start,revenue\n')
    for i in range(40):
        y, q = 2015 + i // 4, i % 4
        f.write(f'{y}-{q * 3 + 1:02d}-01,{500 + 12 * i + [40, -25, 10, -30][q] * (1 + i / 40) + ((i * 37) % 11 - 5) * 1.3:.1f}\n')
with open(os.path.join(WORK, 'visits_daily.csv'), 'w', encoding='utf-8') as f:
    import datetime as _dt
    f.write('day,visits\n')
    d0 = _dt.date(2024, 3, 1)
    for i in range(84):
        d = d0 + _dt.timedelta(days=i)
        f.write(f'{d.isoformat()},{int(200 + 1.5 * i + [10, 12, 8, 5, 20, 45, 38][d.weekday()] + ((i * 53) % 17 - 8))}\n')
NEW_FILES = ['sales_monthly.csv', 'sales_quarterly.csv', 'visits_daily.csv']

# ---------------------------------------------------------------- 1. app vs CPython
FLIGHTS = r'''S.set('df', B('pb_dataset', { NAME: 'flights' })),
      B('pb_date_range', { DF: V('df'), NAME: 'date', START: '1949-01-01', FREQ: 'MS' }),'''
PROGRAMS = {
    'v310_flights_blocks': FLIGHTS + r'''
      B('pb_time_index', { DF: V('df'), NAME: 't' }),
      B('pb_set_col', { DF: V('df'), NAME: 'last_year' }, { VAL: B('pb_shift', { DF: V('df'), COL: 'passengers', FN: 'shift', N: 12 }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'change' }, { VAL: B('pb_shift', { DF: V('df'), COL: 'passengers', FN: 'diff', N: 12 }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'growth' }, { VAL: B('pb_shift', { DF: V('df'), COL: 'passengers', FN: 'pct_change', N: 12 }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'ewm3' }, { VAL: B('pb_ewm', { DF: V('df'), COL: 'passengers', A: 0.3 }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'ewm9' }, { VAL: B('pb_ewm', { DF: V('df'), COL: 'passengers', A: 0.9 }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'ma12' }, { VAL: B('pb_rolling', { DF: V('df'), COL: 'passengers', N: 12, AGG: 'mean' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'month' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'date', FN: 'month' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'quarter' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'date', FN: 'quarter' }) }),
      B('pb_set_col', { DF: V('df'), NAME: 'weekday' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'date', FN: 'dow' }) }),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'head', N: 14 })),
      S.print(B('pb_df_view', { DF: V('df'), FN: 'tail', N: 4 })),
      S.set('parts', B('pb_decompose', { DF: V('df'), COL: 'passengers', P: 12, M: 'multiplicative' })),
      S.print(B('pb_df_view', { DF: V('parts'), FN: 'head', N: 14 })),
      S.print(B('pb_df_view', { DF: V('parts'), FN: 'tail', N: 8 })),
      B('pb_plot_decompose', { P: V('parts'), DF: V('df'), DATE: 'date' }),
      S.set('add', B('pb_decompose', { DF: V('df'), COL: 'passengers', P: 12, M: 'additive' })),
      S.print(B('pb_df_info', { DF: V('add'), FN: 'describe' })),
      B('pb_plot_decompose', { P: V('add'), DF: V('df'), DATE: '' }),
      S.set('g', B('pb_decompose', { DF: V('df'), COL: 'growth', P: 12, M: 'additive' })),
      S.print(B('pb_df_view', { DF: V('g'), FN: 'head', N: 20 })),
      B('pb_set_col', { DF: V('parts'), NAME: 'month' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'date', FN: 'month' }) }),
      S.print(B('pb_groupby', { DF: V('parts'), BY: 'month', COL: 'seasonal', AGG: 'mean' })),
      S.print(B('pb_groupby', { DF: V('df'), BY: 'quarter', COL: 'growth', AGG: 'mean' })),
      B('pb_plot_lines', { DF: V('df'), X: 'date', COLS: 'passengers, ma12, ewm3, ewm9', TITLE: 'smoothing' }),
      B('pb_plot_lines', { DF: V('parts'), X: '', COLS: 'trend, resid', TITLE: '' }),
    ''',
    'v310_flights_forecast': FLIGHTS + r'''
      B('pb_time_index', { DF: V('df'), NAME: 't' }),
      B('pb_set_col', { DF: V('df'), NAME: 'month' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'date', FN: 'month' }) }),
      S.set('X', B('pb_cols', { DF: V('df'), COLS: 't, month' })),
      S.set('X', B('pb_get_dummies', { DF: V('X'), COLS: 'month', DROP: 'True' })),
      S.set('y', B('pb_col', { DF: V('df'), COL: 'passengers' })),
      B('pb_split', { XTR: V('X_train'), XTE: V('X_test'), YTR: V('y_train'), YTE: V('y_test'), X: V('X'), Y: V('y'), TS: 0.2, RS: 42, MODE: 'time' }),
      S.set('model', R.model('LinearRegression')),
      B('pb_fit', { M: V('model'), X: V('X_train'), Y: V('y_train') }),
      S.set('y_pred', B('pb_predict', { M: V('model'), FN: 'predict', X: V('X_test') })),
      S.set('y_naive', B('pb_naive', { Y: V('y_train'), S: 12 }, { N: B('pb_len', {}, { X: R.get('y_test') }) })),
      S.print(R.get('y_naive')),
      S.print(B('pb_naive', { Y: V('y_train'), S: 1 }, { N: S.num(5) })),
      S.print(B('pb_naive', { Y: V('y_pred'), S: 3 }, { N: S.num(7) })),
      S.print2('MAE model:', B('pb_metric', { FN: 'mean_absolute_error', YT: V('y_test'), YP: V('y_pred') })),
      S.print2('MAE naive:', B('pb_metric', { FN: 'mean_absolute_error', YT: V('y_test'), YP: V('y_naive') })),
      S.print2('MAPE:', B('pb_metric', { FN: 'mape', YT: V('y_test'), YP: V('y_pred') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 5, SC: 'None' }, { M: R.get('model') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 5, SC: 'neg_mean_absolute_error' }, { M: R.get('model') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 4, SC: 'neg_root_mean_squared_error' }, { M: R.get('model') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 3, SC: 'neg_mean_absolute_percentage_error' }, { M: R.get('model') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 6, SC: 'r2' }, { M: R.model('Ridge') })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 5, SC: 'neg_mean_absolute_error' }, { M: R.model('RandomForestRegressor') })),
      B('pb_fit', { M: V('model'), X: V('X'), Y: V('y') }),
      S.set('future', B('pb_future', { DF: V('df'), DATE: 'date', S: 12, FREQ: 'MS', SEASON: 'month' })),
      S.print(R.get('future')),
      S.set('X_future', B('pb_cols', { DF: V('future'), COLS: 't, month' })),
      S.set('X_future', B('pb_get_dummies', { DF: V('X_future'), COLS: 'month', DROP: 'True' })),
      S.set('X_future', B('pb_align_cols', { DF: V('X_future'), REF: V('X') })),
      S.print(B('pb_df_view', { DF: V('X_future'), FN: 'head', N: 3 })),
      S.set('forecast', B('pb_predict', { M: V('model'), FN: 'predict', X: V('X_future') })),
      S.print2('forecast:', R.get('forecast')),
      B('pb_plot_forecast', { DF: V('df'), DATE: 'date', DF2: V('df'), COL: 'passengers', FC: V('forecast') }),
      S.set('short', B('pb_future', { DF: V('df'), DATE: 'date', S: 3, FREQ: 'MS', SEASON: 'month' })),
      S.set('X_short', B('pb_cols', { DF: V('short'), COLS: 't, month' })),
      S.set('X_short', B('pb_get_dummies', { DF: V('X_short'), COLS: 'month', DROP: 'True' })),
      S.print(R.get('X_short')),
      S.set('X_short', B('pb_align_cols', { DF: V('X_short'), REF: V('X') })),
      S.print(R.get('X_short')),
      S.print(B('pb_df_info', { DF: V('X_short'), FN: 'dtypes' })),
      S.print(B('pb_predict', { M: V('model'), FN: 'predict', X: V('X_short') })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'date', S: 6, FREQ: 'QS', SEASON: 'quarter' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'date', S: 9, FREQ: 'D', SEASON: 'dayofweek' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'date', S: 5, FREQ: 'W', SEASON: 'None' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'date', S: 3, FREQ: 'YS', SEASON: 'month' })),
    ''',
    'v310_daily_odd_period': r'''S.set('df', B('pb_dataset', { NAME: 'flights' })),
      B('pb_date_range', { DF: V('df'), NAME: 'day', START: '2024-02-20', FREQ: 'D' }),
      S.set('parts', B('pb_decompose', { DF: V('df'), COL: 'passengers', P: 7, M: 'additive' })),
      S.print(B('pb_df_view', { DF: V('parts'), FN: 'head', N: 9 })),
      S.print(B('pb_df_view', { DF: V('parts'), FN: 'tail', N: 5 })),
      B('pb_set_col', { DF: V('parts'), NAME: 'dow' }, { VAL: B('pb_col_func', { DF: V('df'), COL: 'day', FN: 'dow' }) }),
      S.print(B('pb_groupby', { DF: V('parts'), BY: 'dow', COL: 'seasonal', AGG: 'mean' })),
      B('pb_plot_decompose', { P: V('parts'), DF: V('df'), DATE: 'day' }),
      S.set('mul', B('pb_decompose', { DF: V('df'), COL: 'passengers', P: 4, M: 'multiplicative' })),
      S.print(B('pb_df_view', { DF: V('mul'), FN: 'head', N: 6 })),
      S.set('one', B('pb_decompose', { DF: V('df'), COL: 'passengers', P: 1, M: 'additive' })),
      S.print(B('pb_df_view', { DF: V('one'), FN: 'head', N: 3 })),
      S.set('y', B('pb_col', { DF: V('df'), COL: 'passengers' })),
      S.print(B('pb_naive', { Y: V('y'), S: 7 }, { N: S.num(10) })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 10, FREQ: 'D', SEASON: 'dayofweek' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 4, FREQ: 'MS', SEASON: 'month' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 4, FREQ: 'W', SEASON: 'dayofweek' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 2, FREQ: 'QS', SEASON: 'quarter' })),
      S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 2, FREQ: 'YS', SEASON: 'None' })),
    ''',
}
# the model wizard: source, task, models, evaluation, settings that differ from the dataset / file defaults
WIZARD_CASES = [
    ('v310_wizard_trend_flights', {'dataset': 'flights'}, 'trend', [], 'holdout', {}),
    ('v310_wizard_trend_flights_additive_w6', {'dataset': 'flights'}, 'trend', [], 'holdout', {'decompose': 'additive', 'window': 6}),
    ('v310_wizard_season_lr', {'dataset': 'flights'}, 'trend_forecast', ['LinearRegression'], 'holdout', {}),
    ('v310_wizard_season_ridge_cv', {'dataset': 'flights'}, 'trend_forecast', ['Ridge'], 'cv', {}),
    ('v310_wizard_season_gbr', {'dataset': 'flights'}, 'trend_forecast', ['GradientBoostingRegressor'], 'holdout', {}),
    ('v310_wizard_season_rf_cv', {'dataset': 'flights'}, 'trend_forecast', ['RandomForestRegressor'], 'cv', {}),
    ('v310_wizard_lags_cv', {'dataset': 'flights'}, 'forecast', ['LinearRegression'], 'cv', {}),
    ('v310_wizard_lags_holdout', {'dataset': 'flights'}, 'forecast', ['Ridge'], 'holdout', {}),
    ('v310_file_monthly_trend', {'file': 'sales_monthly.csv'}, 'trend', [], 'holdout', {}),
    ('v310_file_monthly_season', {'file': 'sales_monthly.csv'}, 'trend_forecast', ['LinearRegression'], 'holdout', {}),
    ('v310_file_monthly_season_cv', {'file': 'sales_monthly.csv'}, 'trend_forecast', ['Ridge'], 'cv', {}),
    ('v310_file_quarterly_trend', {'file': 'sales_quarterly.csv'}, 'trend', [], 'holdout', {}),
    ('v310_file_quarterly_season', {'file': 'sales_quarterly.csv'}, 'trend_forecast', ['LinearRegression'], 'holdout', {}),
    ('v310_file_daily_trend', {'file': 'visits_daily.csv'}, 'trend', [], 'holdout', {}),
    ('v310_file_daily_season', {'file': 'visits_daily.csv'}, 'trend_forecast', ['LinearRegression'], 'holdout', {}),
    ('v310_file_daily_lags_cv', {'file': 'visits_daily.csv'}, 'forecast', ['LinearRegression'], 'cv', {}),
]
BUILD_WIZARD = '''([src, task, models, ev, over]) => {
  const base = src.file ? PB.ui._fileConfig(src.file, 'timeseries', task) : PB.DATASETS[src.dataset].tasks[task];
  const cfg = Object.assign({ task, models, evalMode: ev }, base, src, over);
  PB.ui.loadProgram(PB.R.build(cfg), { run: true });
  return JSON.stringify({ value: cfg.value, date: cfg.dateCol || null, freq: cfg.freq, season: cfg.season === undefined ? null : cfg.season, period: cfg.period || null, steps: task === 'trend_forecast' ? PB.R.stepsOf(cfg) : null });
}'''
clean_test.PROGRAMS = PROGRAMS
clean_test.CLEAN_CASES = []
clean_test.PREP_CASES = WIZARD_CASES
clean_test.BUILD_PREP = BUILD_WIZARD
clean_test.FILES = WORK
clean_test.UPLOADS = clean_test.UPLOADS + NEW_FILES
fails = clean_test.main(set(sys.argv[1:]) or None)
check(f'{len(PROGRAMS) + len(WIZARD_CASES)} programs: app and CPython print the same', not fails, str(fails[:6]))
if len(sys.argv) > 1: sys.exit(0 if not fails else 1)

# the same Python exceptions as CPython
ERRORS = {
    'naive_float_steps': (FLIGHTS + r'''S.set('y', B('pb_col', { DF: V('df'), COL: 'passengers' })),
      S.print(B('pb_naive', { Y: V('y'), S: 12 }, { N: B('math_arithmetic', { OP: 'DIVIDE' }, { A: B('pb_len', {}, { X: R.get('y') }), B: S.num(2) }) })),'''),
    'naive_short_history': (FLIGHTS + r'''S.set('small', B('pb_df_view', { DF: V('df'), FN: 'head', N: 3 })),
      S.set('ys', B('pb_col', { DF: V('small'), COL: 'passengers' })),
      S.print(B('pb_naive', { Y: V('ys'), S: 12 }, { N: S.num(5) })),'''),
    'plot_decompose_lengths': (FLIGHTS + r'''S.set('small', B('pb_df_view', { DF: V('df'), FN: 'head', N: 3 })),
      S.set('parts', B('pb_decompose', { DF: V('small'), COL: 'passengers', P: 12, M: 'additive' })),
      B('pb_plot_decompose', { P: V('parts'), DF: V('df'), DATE: 'date' }),'''),
    'cv_ts_too_many_splits': (FLIGHTS + r'''B('pb_time_index', { DF: V('df'), NAME: 't' }),
      S.set('small', B('pb_df_view', { DF: V('df'), FN: 'head', N: 3 })),
      S.set('X', B('pb_cols', { DF: V('small'), COLS: 't' })), S.set('y', B('pb_col', { DF: V('small'), COL: 'passengers' })),
      S.print(B('pb_cv_ts', { X: V('X'), Y: V('y'), K: 5, SC: 'None' }, { M: R.model('LinearRegression') })),'''),
    'future_missing_column': (FLIGHTS + r'''S.print(B('pb_future', { DF: V('df'), DATE: 'day', S: 3, FREQ: 'MS', SEASON: 'month' })),'''),
    'plot_lines_text_column': (FLIGHTS + r'''B('pb_plot_lines', { DF: V('df'), X: 'date', COLS: 'month', TITLE: '' }),'''),
}
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_function('!PB.ui.running', timeout=60000)
    for name, body in ERRORS.items():
        page.evaluate(clean_test.BUILD, body); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
        app = page.evaluate("PB.ui.out.log.filter((e) => e.kind === 'error').map((e) => e.pyType + ': ' + e.message)")
        rc, out, err = clean_test.run_py(page.evaluate('PB.ui.fullScript("none")'))
        py = (err.strip().splitlines() or [''])[-1]
        py = re.sub(r'^\w+\.(\w+Error)', r'\1', py)
        check(f'error {name}: app {app[:1]} = CPython', rc != 0 and len(app) == 1 and app[0] == py, f'python: {py}')
    b.close()

# ---------------------------------------------------------------- 2. the engine against pandas / scikit-learn
import numpy as np
import pandas as pd
from sklearn.model_selection import TimeSeriesSplit
random.seed(310)

def enc(v):
    """JSON-safe float: NaN and the infinities as text"""
    if v is None: return 'nan'
    if isinstance(v, (float, np.floating)):
        if math.isnan(v): return 'nan'
        if math.isinf(v): return 'inf' if v > 0 else '-inf'
        return float(v)
    if isinstance(v, (np.integer,)): return int(v)
    return v
def dec(v): return float(v) if isinstance(v, str) else v
def same_vals(a, b, tol=0.0):
    if len(a) != len(b): return False
    for x, y in zip(a, b):
        x, y = dec(x), dec(y)
        if isinstance(x, float) and isinstance(y, float) and math.isnan(x) and math.isnan(y): continue
        if x == y: continue
        if tol and isinstance(x, (int, float)) and isinstance(y, (int, float)) and not (math.isinf(x) or math.isinf(y)) and abs(x - y) <= tol * max(1.0, abs(y)): continue
        return False
    return True
def series(n, nan_rate=0.0, ints=False, pos=True, zeros=0.0):
    out = []
    for _ in range(n):
        r = random.random()
        if r < nan_rate: out.append(None)
        elif r < nan_rate + zeros: out.append(0)
        elif ints: out.append(random.randint(1 if pos else -60, 500))
        else: out.append(round(random.uniform(0.5 if pos else -60.0, 500.0), random.choice([0, 1, 2, 3])))
    return out
def pd_series(vals):
    if all(v is not None and isinstance(v, int) for v in vals) and vals: return pd.Series(vals, dtype='int64')
    return pd.Series([np.nan if v is None else float(v) for v in vals], dtype='float64')
def typed(cases):
    """the dtype goes with the values (a float like 234.0 arrives in the browser as the number 234)"""
    for c in cases: c['dtype'] = str(pd_series(c['vals']).dtype)
    return cases
JS_SERIES = '''const mk = (vals, dtype) => (dtype === 'int64' ? new PB.Series(vals, { dtype: 'int64' }) : new PB.Series(vals.map((v) => (v === null ? NaN : v)), { dtype: 'float64' }));
  const enc = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'nan' : v === Infinity ? 'inf' : v === -Infinity ? '-inf' : v);
  const out = (s) => Array.from(s.values).map(enc);
  const err = (e) => (e && e.pyType ? e.pyType + ': ' + e.message : 'JS ' + String(e));'''

# python helpers exactly as the app writes them into the code
helpers = {}
with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page(); route(page)
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    code = page.evaluate("() => 'import numpy as np\\nimport pandas as pd\\n\\n' + ['decompose', 'make_future', 'seasonal_naive'].map((k) => PB.blocks.TS_PY[k]).join('\\n\\n\\n') + '\\n'")
    exec(code, helpers)

    # rolling with center / min_periods (the decomposition uses a centred window), every aggregation
    cases = []
    for _ in range(160):
        n = random.randint(1, 40); w = random.randint(1, 12)
        cases.append({'vals': series(n, nan_rate=random.choice([0, 0, 0.15]), ints=random.random() < 0.4), 'w': w, 'center': random.random() < 0.5,
                      'minp': None if random.random() < 0.6 else random.randint(1, w), 'agg': random.choice(['mean', 'sum', 'min', 'max', 'std'])})
    typed(cases)
    js = page.evaluate('(cases) => { ' + JS_SERIES + ''' return cases.map((c) => { try { const opts = { center: c.center }; if (c.minp !== null) opts.min_periods = c.minp; return out(mk(c.vals, c.dtype).rolling(c.w, opts)[c.agg]()); } catch (e) { return err(e); } }); }''', cases)
    bad = []
    for c, a in zip(cases, js):
        s = pd_series(c['vals']).rolling(c['w'], center=c['center'], min_periods=c['minp'])
        q = [enc(v) for v in getattr(s, c['agg'])().tolist()]
        if not same_vals(a, q, 1e-9 if c['agg'] == 'std' else 0.0): bad.append((c, a, q))
    check(f'rolling(window, center, min_periods) mean/sum/min/max/std: engine = pandas on {len(cases)} series', not bad, str(bad[:1])[:600])

    # shift / diff / pct_change (with missing values and zeros)
    cases = []
    for _ in range(120):
        fn = random.choice(['shift', 'diff', 'pct_change'])
        cases.append({'vals': series(random.randint(1, 30), nan_rate=0.12, ints=random.random() < 0.5, pos=random.random() < 0.6, zeros=0.1), 'fn': fn,
                      'n': random.randint(-3, 5) if fn == 'shift' else random.randint(1, 4)})
    typed(cases)
    js = page.evaluate('(cases) => { ' + JS_SERIES + ''' return cases.map((c) => { try { const s = mk(c.vals, c.dtype); return out(c.fn === 'shift' ? s.shift(c.n) : c.fn === 'diff' ? s.diff(c.n) : s.pct_change(c.n)); } catch (e) { return err(e); } }); }''', cases)
    bad = [(c, a, q) for c, a in zip(cases, js) for q in [[enc(v) for v in getattr(pd_series(c['vals']), c['fn'])(c['n']).tolist()]] if not same_vals(a, q)]
    check(f'shift / diff / pct_change: engine = pandas on {len(cases)} series', not bad, str(bad[:1])[:600])

    # exponential smoothing
    cases = [{'vals': series(random.randint(1, 40), nan_rate=random.choice([0, 0.2]), ints=random.random() < 0.4), 'alpha': random.choice([1.0, round(random.uniform(0.05, 0.99), 2)]), 'adjust': random.random() < 0.5} for _ in range(120)]
    typed(cases)
    js = page.evaluate('(cases) => { ' + JS_SERIES + ''' return cases.map((c) => { try { return out(mk(c.vals, c.dtype).ewm({ alpha: c.alpha, adjust: c.adjust }).mean()); } catch (e) { return err(e); } }); }''', cases)
    bad = [(c, a, q) for c, a in zip(cases, js) for q in [[enc(v) for v in pd_series(c['vals']).ewm(alpha=c['alpha'], adjust=c['adjust']).mean().tolist()]] if not same_vals(a, q)]
    check(f'ewm(alpha, adjust).mean(): engine = pandas on {len(cases)} series', not bad, str(bad[:1])[:600])

    # the classical decomposition: the engine against the Python helper (and statsmodels)
    cases = []
    for _ in range(160):
        period = random.randint(1, 13)
        cases.append({'vals': series(random.randint(max(1, period // 2), 80), nan_rate=random.choice([0, 0, 0, 0.1]), ints=random.random() < 0.5, zeros=random.choice([0, 0, 0, 0.05])),
                      'p': period, 'model': random.choice(['additive', 'multiplicative'])})
    typed(cases)
    js = page.evaluate('(cases) => { ' + JS_SERIES + ''' return cases.map((c) => { try { const d = PB.decompose(mk(c.vals, c.dtype), c.p, c.model); return { dtype: d.dtypeOf('observed'), cols: d.columns, data: d.columns.map((k) => out(d.col(k))) }; } catch (e) { return err(e); } }); }''', cases)
    bad = []
    for c, a in zip(cases, js):
        with np.errstate(all='ignore'):
            d = helpers['decompose'](pd_series(c['vals']), period=c['p'], model=c['model'])
        q = {'dtype': str(d['observed'].dtype), 'cols': list(d.columns), 'data': [[enc(v) for v in d[k].tolist()] for k in d.columns]}
        if not isinstance(a, dict) or a['dtype'] != q['dtype'] or a['cols'] != q['cols'] or not all(same_vals(x, y) for x, y in zip(a['data'], q['data'])): bad.append((c, a, q))
    check(f'decompose(series, period, model): engine = the Python helper (pandas) on {len(cases)} series, bit for bit', not bad, str(bad[:1])[:700])
    try:
        from statsmodels.tsa.seasonal import seasonal_decompose
    except ImportError:
        seasonal_decompose = None
        print('SKIP statsmodels is not installed: the comparison with seasonal_decompose is skipped')
    if seasonal_decompose:
        n_cmp, worst, bad = 0, 0.0, []
        for c, a in zip(cases, js):
            v = c['vals']
            if c['p'] < 2 or len(v) < 2 * c['p'] or any(x is None for x in v) or (c['model'] == 'multiplicative' and any(x <= 0 for x in v)): continue
            r = seasonal_decompose(pd.Series([float(x) for x in v]), model=c['model'], period=c['p'])
            for k, ref in (('trend', r.trend), ('seasonal', r.seasonal), ('resid', r.resid)):
                mine = [dec(x) for x in a['data'][a['cols'].index(k)]]
                for x, y in zip(mine, ref.tolist()):
                    if math.isnan(x) and math.isnan(y): continue
                    if math.isnan(x) or math.isnan(y): bad.append((c, k)); break
                    worst = max(worst, abs(x - y) / max(1.0, abs(y)))
            n_cmp += 1
        check(f'decompose = statsmodels seasonal_decompose on {n_cmp} series (largest relative difference {worst:.1e})', n_cmp > 40 and not bad and worst < 1e-9, str(bad[:2]))

    # the next periods: every frequency from any last date, every season
    cases = []
    for _ in range(160):
        hist = random.choice(['MS', 'QS', 'YS', 'W', 'D', 'irregular']); n = random.randint(1, 25)
        start = pd.Timestamp('1950-01-01') + pd.Timedelta(days=random.randint(0, 29000))
        dates = sorted(start + pd.Timedelta(days=random.randint(0, 900)) for _ in range(n)) if hist == 'irregular' else list(pd.date_range(start, periods=n, freq=hist))
        cases.append({'dates': [d.strftime('%Y-%m-%d') for d in dates], 'steps': random.randint(1, 20), 'freq': random.choice(['MS', 'QS', 'YS', 'W', 'D']), 'season': random.choice(['month', 'quarter', 'dayofweek', None])})
    js = page.evaluate('''(cases) => cases.map((c) => { try {
        const ms = c.dates.map((d) => Date.parse(d + 'T00:00:00Z'));
        const df = new PB.DataFrame(new Map([['date', { values: ms, dtype: 'datetime64[ns]' }], ['v', { values: PB.range(ms.length), dtype: 'int64' }]]));
        const f = PB.futureFrame(df, 'date', c.steps, c.freq, c.season);
        return { cols: f.columns, date: f.col('date').values.map((v) => new Date(v).toISOString().slice(0, 10)), t: f.col('t').values, s: c.season ? f.col(c.season).values : null };
      } catch (e) { return e.pyType + ': ' + e.message; } })''', cases)
    bad = []
    for c, a in zip(cases, js):
        f = helpers['make_future'](pd.DataFrame({'date': pd.to_datetime(c['dates']), 'v': range(len(c['dates']))}), 'date', steps=c['steps'], freq=c['freq'], season=c['season'])
        q = {'cols': list(f.columns), 'date': [d.strftime('%Y-%m-%d') for d in f['date']], 't': f['t'].tolist(), 's': f[c['season']].tolist() if c['season'] else None}
        if a != q: bad.append((c, a, q))
    check(f'make_future(df, date, steps, freq, season): engine = the Python helper on {len(cases)} tables (MS/QS/YS/W/D, any last date)', not bad, str(bad[:1])[:700])

    # the seasonal naive baseline, including histories shorter than the season (IndexError like numpy)
    cases = [{'vals': series(random.randint(0, 30), ints=random.random() < 0.5), 'steps': random.randint(0, 40), 'season': random.randint(1, 15)} for _ in range(160)]
    typed(cases)
    js = page.evaluate('(cases) => { ' + JS_SERIES + ''' return cases.map((c) => { try { const r = PB.seasonalNaive(mk(c.vals, c.dtype), c.steps, c.season); return { dtype: r.dtype, vals: r.tolist().map(enc) }; } catch (e) { return err(e); } }); }''', cases)
    bad = []
    for c, a in zip(cases, js):
        try:
            r = helpers['seasonal_naive'](pd_series(c['vals']) if c['vals'] else pd.Series([], dtype='float64'), c['steps'], season=c['season'])
            q = {'dtype': str(r.dtype), 'vals': [enc(v) for v in r.tolist()]}
        except Exception as e:
            q = f'{type(e).__name__}: {e}'
        if a != q: bad.append((c, a, q))
    n_err = sum(isinstance(a, str) for a in js)
    check(f'seasonal_naive(history, steps, season): engine = the Python helper on {len(cases)} cases ({n_err} IndexErrors)', not bad and n_err > 5, str(bad[:1])[:600])

    # TimeSeriesSplit: the folds and the error messages of scikit-learn
    cases = [{'n': random.randint(2, 150), 'k': random.randint(2, 10), 'test_size': None if random.random() < 0.7 else random.randint(1, 25),
              'gap': 0 if random.random() < 0.6 else random.randint(1, 6), 'max_train_size': None if random.random() < 0.7 else random.randint(1, 60)} for _ in range(200)]
    cases.append({'n': 10, 'k': 1, 'test_size': None, 'gap': 0, 'max_train_size': None})
    js = page.evaluate('''(cases) => cases.map((c) => { try { return new PB.TimeSeriesSplit({ n_splits: c.k, test_size: c.test_size, gap: c.gap, max_train_size: c.max_train_size }).folds(c.n); }
        catch (e) { return e.pyType + ': ' + e.message; } })''', cases)
    bad = []
    for c, a in zip(cases, js):
        try:
            q = [[tr.tolist(), te.tolist()] for tr, te in TimeSeriesSplit(n_splits=c['k'], test_size=c['test_size'], gap=c['gap'], max_train_size=c['max_train_size']).split(np.zeros((c['n'], 1)))]
        except Exception as e:
            q = f'{type(e).__name__}: {e}'
        if a != q: bad.append((c, a if isinstance(a, str) else '…', q if isinstance(q, str) else '…'))
    n_err = sum(isinstance(a, str) for a in js)
    check(f'TimeSeriesSplit(n_splits, test_size, gap, max_train_size): engine = scikit-learn on {len(cases)} cases ({n_err} errors)', not bad, str(bad[:2])[:600])
    b.close()

# ---------------------------------------------------------------- 3. interface
def boot(p, url, w=1360, h=860):
    b = p.chromium.launch(); page = b.new_context(viewport={'width': w, 'height': h}).new_page(); route(page)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_function('!PB.ui.running', timeout=60000)
    return b, page, errs
def upload(page, name):
    data = base64.b64encode(open(os.path.join(WORK, name), 'rb').read()).decode()
    page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await PB.ui.readFile(new File([bin], name)); }''', [name, data])
def run_wait(page):
    page.wait_for_timeout(250); page.wait_for_function('!PB.ui.running', timeout=120000)
SEC = '''(title) => { const s = Array.from(document.querySelectorAll('.modal .wz-sec')).find((x) => x.querySelector('h3').textContent.includes(title));
  return s ? Array.from(s.querySelectorAll('.opt')).map((o) => ({ b: (o.querySelector('b') || {}).textContent || '', code: (o.querySelector('code') || {}).textContent || '',
    on: o.getAttribute('aria-pressed') === 'true' || o.getAttribute('aria-checked') === 'true', tags: Array.from(o.querySelectorAll('.tag')).map((t) => t.textContent) })) : null; }'''
SUMMARY = "() => (document.querySelector('.modal .wz-summary') || {}).textContent || ''"
ERR_CELLS = "document.querySelectorAll('#out-body .cell.error').length"
NEW_BLOCKS = ['pb_time_index', 'pb_shift', 'pb_ewm', 'pb_decompose', 'pb_plot_decompose', 'pb_plot_lines', 'pb_future', 'pb_align_cols', 'pb_naive', 'pb_cv_ts']

with sync_playwright() as p:
    b, page, errs = boot(p, PAGE)
    # toolbox: the new category with its 4 subcategories, holding every new block
    tb = page.evaluate('''() => { const tb = PB.ui.ws.getToolbox(), cats = [], types = new Set();
        for (const it of tb.getToolboxItems()) {
          if (it.getName) cats.push([it.getName(), it.getParent && it.getParent() ? it.getParent().getName() : '']);
          if (it.getContents) { const c = it.getContents(); (Array.isArray(c) ? c : []).forEach((x) => { const walk = (o) => { if (!o) return; if (o.type) types.add(o.type); if (o.inputs) Object.values(o.inputs).forEach((i) => walk(i.block || i.shadow)); }; walk(x); }); }
        } return { cats, types: Array.from(types) }; }''')
    subs = [c for c, parent in tb['cats'] if parent == 'อนุกรมเวลา & แนวโน้ม']
    check('toolbox: "อนุกรมเวลา & แนวโน้ม" with 4 subcategories', subs == ['วันที่ & ลำดับเวลา', 'แนวโน้ม & ฤดูกาล', 'พยากรณ์ & วัดผล', 'กราฟอนุกรมเวลา'], str(subs))
    check('toolbox has every new block', all(t in tb['types'] for t in NEW_BLOCKS), str([t for t in NEW_BLOCKS if t not in tb['types']]))

    # the wizard by clicks: time series → trend + season → TimeSeriesSplit, one model at a time
    page.evaluate('PB.ui.openWizard()'); page.wait_for_timeout(250)
    page.click('.modal .opt:has-text("อนุกรมเวลา")'); page.wait_for_timeout(150)
    tasks = page.evaluate(SEC, 'อยากให้คอมพิวเตอร์ทำอะไร')
    check('wizard: 3 time-series tasks', [t['b'] for t in tasks] == ['พยากรณ์อนาคต', 'พยากรณ์แนวโน้ม + ฤดูกาล', 'ดูแนวโน้มและฤดูกาล'], str([t['b'] for t in tasks]))
    page.click('.modal .opt:has-text("พยากรณ์แนวโน้ม + ฤดูกาล")'); page.wait_for_timeout(150)
    ev = page.evaluate(SEC, 'วิธีวัดผล'); models = page.evaluate(SEC, 'เลือกโมเดล')
    check('wizard: time-series evaluations (last 20% or TimeSeriesSplit, no GridSearchCV)', [e['b'] for e in ev] == ['เก็บช่วงท้ายไว้ทดสอบ', 'TimeSeriesSplit 5 รอบ'] and ev[0]['on'], str(ev))
    check('wizard: 4 models, LinearRegression first and chosen', [m['code'] for m in models] == ['LinearRegression', 'Ridge', 'RandomForestRegressor', 'GradientBoostingRegressor'] and models[0]['on'] and not any(m['on'] for m in models[1:]), str([(m['code'], m['on']) for m in models]))
    note = 'ต่อเส้นแนวโน้มเกินช่วงข้อมูลเดิมไม่ได้'
    check('wizard: tree models are marked as unable to extend the trend', [note in m['tags'] for m in models] == [False, False, True, True], str([m['tags'] for m in models]))
    plan = page.evaluate(SUMMARY)
    check('wizard plan (last 20%): time split, naive baseline, 12 periods ahead', all(x in plan for x in ['ลำดับเวลา t + คอลัมน์ 0/1 ของฤดูกาล', 'แบ่งข้อมูลฝึก/ทดสอบตามเวลา', 'เทียบกับค่าพยากรณ์แบบง่าย', 'พยากรณ์ 12 ช่วงถัดไป']), plan)
    page.click('.modal .opt:has-text("Ridge")'); page.wait_for_timeout(100)
    page.click('.modal .opt:has-text("RandomForestRegressor")'); page.wait_for_timeout(100)
    on = [m['code'] for m in page.evaluate(SEC, 'เลือกโมเดล') if m['on']]
    check('wizard: one model at a time', on == ['RandomForestRegressor'], str(on))
    page.click('.modal .opt:has-text("LinearRegression")'); page.wait_for_timeout(100)
    page.click('.modal .opt:has-text("TimeSeriesSplit 5 รอบ")'); page.wait_for_timeout(150)
    plan = page.evaluate(SUMMARY)
    check('wizard plan (TimeSeriesSplit): no time split, no baseline', 'TimeSeriesSplit 5 รอบ' in plan and 'แบ่งข้อมูลฝึก/ทดสอบ' not in plan and 'เทียบกับค่าพยากรณ์แบบง่าย' not in plan, plan)
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); run_wait(page)
    code = page.evaluate('PB.ui.fullScript("none")')
    prints = page.evaluate("PB.ui.out.log.filter((e) => e.kind === 'print').map((e) => e.text)")
    check('wizard program: TimeSeriesSplit, make_future, reindex, no error', 'cv=TimeSeriesSplit(n_splits=5), scoring="neg_mean_absolute_error"' in code and 'future = make_future(df, "date", steps=12, freq="MS", season="month")' in code
          and 'X_future = X_future.reindex(columns=X.columns, fill_value=0)' in code and page.evaluate(ERR_CELLS) == 0 and any(t.startswith('MAE เฉลี่ย: 25.66') for t in prints), str([t[:60] for t in prints]))
    # an evaluation that time series do not offer falls back to the last 20%
    page.evaluate('PB.ui.openWizard()'); page.wait_for_timeout(250)
    page.click('.modal .opt:has-text("ตาราง")'); page.wait_for_timeout(120)
    reg = page.evaluate("PB.TASKS.table.find((t) => t[0] === 'regression')[1]")
    page.click(f'.modal .opt:has-text("{reg}")'); page.wait_for_timeout(120)
    page.click('.modal .opt:has-text("GridSearchCV")'); page.wait_for_timeout(120)
    page.click('.modal .opt:has-text("อนุกรมเวลา")'); page.wait_for_timeout(150)
    ev = page.evaluate(SEC, 'วิธีวัดผล')
    check('wizard: GridSearchCV chosen for a table falls back to the last 20% for time series', ev and [e['on'] for e in ev] == [True, False], str(ev))
    page.click('.modal .opt:has-text("ดูแนวโน้มและฤดูกาล")'); page.wait_for_timeout(150)
    check('wizard: the trend task has no evaluation or model choice', page.evaluate(SEC, 'วิธีวัดผล') is None and page.evaluate(SEC, 'เลือกโมเดล') is None)
    page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # uploaded files: the spacing of the dates gives the frequency, the season and the forecast horizon
    for f in NEW_FILES: upload(page, f)
    freq = page.evaluate('''(names) => names.map((n) => { const c = PB.ui._fileConfig(n, 'timeseries', 'trend_forecast'); return [c.dateCol, c.freq, c.season, c.period, PB.R.stepsOf(c)]; })''', NEW_FILES)
    check('files: monthly MS/month/12 · quarterly QS/quarter/4 · daily D/dayofweek/7', freq == [['month', 'MS', 'month', 12, 12], ['quarter_start', 'QS', 'quarter', 4, 4], ['day', 'D', 'dayofweek', 7, 7]], str(freq))
    irregular = page.evaluate('''() => [['2024-01-15', '2024-02-15', '2024-03-15', '2024-04-15'], ['2024-01-07', '2024-01-14', '2024-01-21', '2024-01-28'], ['2020-01-01', '2021-01-01', '2022-01-01'], ['2024-01-01', '2024-01-05', '2024-01-30']]
        .map((d) => PB.ui._inferFreq(new PB.Series(d, { dtype: 'object' })))''')
    check('frequency: mid-month dates → not month starts, weekly → W, yearly → YS, irregular → none', irregular == [None, 'W', 'YS', None], str(irregular))
    page.evaluate('PB.ui.openWizard({ file: "sales_quarterly.csv" })'); page.wait_for_timeout(250)
    pressed = [t['b'] for t in page.evaluate(SEC, 'ข้อมูลของคุณเป็นแบบไหน') if t['on']]
    page.click('.modal .opt:has-text("พยากรณ์แนวโน้ม + ฤดูกาล")'); page.wait_for_timeout(150)
    plan = page.evaluate(SUMMARY)
    check('quarterly file: time series guessed, 4 quarters ahead', pressed == ['อนุกรมเวลา'] and 'พยากรณ์ 4 ช่วงถัดไป' in plan, f'{pressed} {plan}')
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); run_wait(page)
    code = page.evaluate('PB.ui.fullScript("none")')
    check('quarterly program: quarter dummies, naive season 4, QS future', 'df["quarter"] = df["date"].dt.quarter' in code and 'seasonal_naive(y_train, steps=len(y_test), season=4)' in code
          and 'make_future(df, "date", steps=4, freq="QS", season="quarter")' in code and page.evaluate(ERR_CELLS) == 0, '')
    page.evaluate('PB.ui.openWizard({ file: "visits_daily.csv" })'); page.wait_for_timeout(250)
    page.click('.modal .opt:has-text("ดูแนวโน้มและฤดูกาล")'); page.wait_for_timeout(150)
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); run_wait(page)
    code = page.evaluate('PB.ui.fullScript("none")')
    check('daily program: weekly decomposition (odd period 7) by day of week', 'parts = decompose(df["visits"], period=7, model="additive")' in code and 'parts["dayofweek"] = df["date"].dt.dayofweek' in code
          and 'print(parts.groupby("dayofweek")["seasonal"].mean())' in code and page.evaluate(ERR_CELLS) == 0, '')
    # the decomposition: one output cell holding 4 compact panels (like one matplotlib figure), lower than other charts
    cells = page.evaluate('''() => Array.from(document.querySelectorAll('#out-body .cell.chart')).map((c) => ({ out: c.querySelector('.cell-gutter').textContent.trim(),
        charts: (c._pbCharts || []).map((s, i) => ({ title: s.title, compact: !!s.compact, h: Math.round(c.querySelectorAll('svg.plot')[i].getBoundingClientRect().height),
          ticks: c.querySelectorAll('svg.plot')[i].querySelectorAll('text').length })) }))''')
    comp = [c for c in cells if any(x['compact'] for x in c['charts'])]; other = [x for c in cells for x in c['charts'] if not x['compact']]
    check('decomposition: one output cell with the panels observed · trend · seasonal · resid', len(comp) == 1 and [x['title'] for x in comp[0]['charts']] == ['observed · ข้อมูลจริง', 'trend · แนวโน้ม', 'seasonal · ฤดูกาล', 'resid · ส่วนที่เหลือ']
          and all(x['compact'] for x in comp[0]['charts']), str(cells)[:600])
    check('compact panels are lower than the full-size charts', comp and other and max(x['h'] for x in comp[0]['charts']) <= 190 and min(x['h'] for x in other) >= 200, str([(x['title'][:12], x['h']) for c in cells for x in c['charts']]))

    # columns known before the program runs (pickers, the column check of the wizard)
    cols = page.evaluate('''() => { PB.ui.loadProgram(PB.R.build(Object.assign({ task: 'trend_forecast', models: ['LinearRegression'], evalMode: 'holdout', dataset: 'flights' }, PB.DATASETS.flights.tasks.trend_forecast)), { run: false });
        const all = PB.ui.ws.getAllBlocks(true), last = all.filter((x) => x.type === 'pb_plot_forecast').pop(), names = (v) => (PB.schema.columns(last, v).cols || []).map((c) => c.name);
        const out = { future: names('future'), X: names('X'), X_future: names('X_future') };
        PB.ui.loadProgram(PB.SAMPLES.find((s) => s.id === 'flights_trend').build(), { run: false });
        const g = PB.ui.ws.getAllBlocks(true).filter((x) => x.type === 'pb_groupby').pop();
        out.parts = (PB.schema.columns(g, 'parts').cols || []).map((c) => c.name);
        return out; }''')
    dummies = ['t'] + [f'month_{i}' for i in range(2, 13)]
    check('columns before a run: future, X, X_future (= X after reindex) and parts', cols == {'future': ['date', 't', 'month'], 'X': dummies, 'X_future': dummies, 'parts': ['observed', 'trend', 'seasonal', 'resid', 'month']}, str(cols))

    # the level-4 exercises in the exercise list
    page.evaluate('PB.ui.openExercises()'); page.wait_for_timeout(300)
    lv = page.evaluate('''() => Array.from(document.querySelectorAll('.modal .ex-level-sec')).map((s) => ({ h: s.querySelector('h3').textContent, n: s.querySelectorAll('.ex-item').length,
        color: getComputedStyle(s.querySelector('.ex-level')).color, items: Array.from(s.querySelectorAll('.ex-item b')).map((x) => x.textContent) }))''')
    l4 = lv[-1] if lv else {}
    check('exercise list: level 4 "อนุกรมเวลาและการพยากรณ์แนวโน้ม" with 7 exercises and its own colour', len(lv) == 4 and l4['h'] == 'ระดับ 4อนุกรมเวลาและการพยากรณ์แนวโน้ม' and l4['n'] == 7 and l4['color'] == 'rgb(90, 63, 179)', str(l4))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    check('no page errors', not errs, str(errs[:3]))
    b.close()

    # English
    b, page, errs = boot(p, PAGE + '#lang=en')
    labels = page.evaluate('''(types) => { const ws = PB.ui.ws, out = []; for (const t of types) { const b = ws.newBlock(t); out.push(t + ': ' + b.inputList.flatMap((i) => i.fieldRow.map((f) => f.getText())).join(' ') + ' | ' + b.tooltip); b.dispose(); } return out; }''', NEW_BLOCKS)
    thai = [l for l in labels if re.search(r'[฀-๿]', l)]
    check('English: new block labels and tooltips', not thai, str(thai[:2]))
    page.evaluate("PB.ui.loadProgram(PB.SAMPLES.find((s) => s.id === 'flights_season').build(), { run: true })"); run_wait(page)
    code = page.evaluate('PB.ui.fullScript("none")')
    texts = page.evaluate("PB.ui.out.log.filter((e) => e.kind === 'print' || e.kind === 'chart').map((e) => e.text || e.title)")
    check('English: the trend + season sample runs, its code and output have no Thai', page.evaluate(ERR_CELLS) == 0 and not re.search(r'[฀-๿]', code) and not any(re.search(r'[฀-๿]', t or '') for t in texts) and 'MAE of the naive forecast:' in '\n'.join(texts), str([t for t in texts if re.search(r'[฀-๿]', t or '')][:3]))
    page.evaluate("PB.ui.loadProgram(PB.SAMPLES.find((s) => s.id === 'flights_trend').build(), { run: true })"); run_wait(page)
    titles = page.evaluate("PB.ui.out.log.filter((e) => e.kind === 'chart' && e.block === 'pb_plot_decompose').map((e) => e.title)")
    check('English: decomposition chart titles', titles == ['observed · actual', 'trend', 'seasonal', 'resid · residual'], str(titles))
    page.evaluate('PB.ui.openWizard()'); page.wait_for_timeout(250)
    page.click('.modal .opt:has-text("Time series")'); page.wait_for_timeout(150)
    tasks = page.evaluate(SEC, 'What should the computer do') or page.evaluate("() => Array.from(document.querySelectorAll('.modal .wz-sec')[1].querySelectorAll('.opt b')).map((b) => ({ b: b.textContent }))")
    check('English: wizard time-series tasks', not any(re.search(r'[฀-๿]', t['b']) for t in tasks) and len(tasks) == 3, str([t['b'] for t in tasks]))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)
    page.evaluate('PB.ui.openExercises()'); page.wait_for_timeout(300)
    h4 = page.evaluate("Array.from(document.querySelectorAll('.modal .ex-level-sec h3')).map((x) => x.textContent).pop()")
    check('English: level 4 in the exercise list', h4 == 'Level 4Time series and trend forecasting', h4)
    check('no page errors (English)', not errs, str(errs[:3]))
    b.close()

shutil.rmtree(WORK, ignore_errors=True)
print(f'{sum(ok_all)}/{len(ok_all)} passed')
sys.exit(0 if all(ok_all) else 1)
