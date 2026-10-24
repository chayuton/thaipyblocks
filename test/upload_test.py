"""Upload flows: read each test file through the app's own reader (as a browser File), build the
wizard program for every data type / task, run it in the app, then run the generated Python in
CPython in the folder that holds the files and compare the metric lines."""
import base64, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from py_check import numbers
from playwright.sync_api import sync_playwright

FILES = os.path.join(ROOT, 'test', 'files')
PRELUDE = '''
import warnings
warnings.filterwarnings("ignore")
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.show = lambda *a, **k: plt.close("all")
import pandas as pd
pd.set_option("display.width", 200)
'''

CASES = [
    # file, dtype, task, models
    ('customers.csv', 'table', 'classification', ['RandomForestClassifier']),
    ('customers.csv', 'table', 'classification', ['LogisticRegression', 'DecisionTreeClassifier', 'GaussianNB']),
    ('customers.csv', 'table', 'regression', ['Ridge']),
    ('customers.csv', 'table', 'regression', ['LinearRegression', 'RandomForestRegressor', 'KNeighborsRegressor']),
    ('customers.csv', 'table', 'clustering', ['KMeans']),
    ('customers.csv', 'table', 'clustering', ['AgglomerativeClustering']),
    ('customers.csv', 'table', 'pca', ['PCA']),
    ('customers.csv', 'table', 'anomaly', ['IsolationForest']),
    ('customers.csv', 'table', 'eda', []),
    ('customers.xlsx', 'table', 'classification', ['GradientBoostingClassifier']),
    ('customers_semi.csv', 'table', 'eda', []),
    ('thai_tis.csv', 'table', 'eda', []),
    ('feedback.csv', 'text', 'text_classification', ['MultinomialNB']),
    ('feedback.csv', 'text', 'text_classification', ['LogisticRegression', 'SVC']),
    ('feedback.csv', 'text', 'text_clustering', ['KMeans']),
    ('sales_monthly.csv', 'timeseries', 'forecast', ['LinearRegression']),
    ('sales_monthly.csv', 'timeseries', 'forecast', ['RandomForestRegressor']),
    ('sales_monthly.csv', 'timeseries', 'trend', []),
    ('sales_monthly.csv', 'timeseries', 'trend_forecast', ['LinearRegression']),
    ('sales_monthly.csv', 'timeseries', 'trend_forecast', ['GradientBoostingRegressor']),
    ('digits_small.csv', 'image', 'image_classification', ['SVC']),
    ('digits_small.csv', 'image', 'image_classification', ['KNeighborsClassifier', 'LogisticRegression']),
    ('digits_small.csv', 'image', 'image_pca', ['PCA']),
]

def run_py(code):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(PRELUDE + code); path = f.name
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=600, cwd=FILES)
    return r.returncode, r.stdout, r.stderr

def main(only=None):
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        logs = []
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type == 'error' else None)
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
        loaded = {}
        for fname in sorted({c[0] for c in CASES}):
            data = base64.b64encode(open(os.path.join(FILES, fname), 'rb').read()).decode()
            info = page.evaluate('''async ([name, b64]) => {
                const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const n = await PB.ui.readFile(new File([bin], name));
                const f = PB.files.get(n);
                return { name: n, rows: f.df.nrows, cols: f.df.columns, dtypes: f.df.columns.map((c) => f.df.dtypeOf(c)), encoding: f.encoding, sep: f.sep, sheet: f.sheet };
            }''', [fname, data])
            loaded[fname] = info
            print(f'read {fname}: {info["rows"]} rows · enc={info["encoding"]} sep={info["sep"]!r} sheet={info["sheet"]}')
            print('   ', ', '.join(f'{c}:{t}' for c, t in zip(info['cols'][:9], info['dtypes'][:9])))
        # role inference + automatic data type guess used by the wizard
        for fname in loaded:
            roles = page.evaluate(f'PB.ui._fileConfig({json.dumps(fname)}, "table", "eda").roles')
            short = {k: v for k, v in list(roles.items())[:9]}
            print(f'roles {fname}: {short}')
        for i, (fname, dtype, task, models) in enumerate(CASES):
            if only and i not in only: continue
            cfg = page.evaluate(f'PB.ui._fileConfig({json.dumps(fname)}, {json.dumps(dtype)}, {json.dumps(task)})')
            cfg.pop('roles', None)
            page.evaluate(f'''() => {{ const cfg = Object.assign({{ task: {json.dumps(task)}, models: {json.dumps(models)} }}, PB.ui._fileConfig({json.dumps(fname)}, {json.dumps(dtype)}, {json.dumps(task)}));
                PB.ui.loadProgram(PB.R.build(cfg), {{ run: true }}); }}''')
            page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=180000)
            res = page.evaluate('''() => ({
                status: document.querySelector('#run-status').textContent,
                errors: Array.from(document.querySelectorAll('#out-body .cell.error')).map((c) => c.innerText.slice(0, 500)),
                warns: Array.from(document.querySelectorAll('#out-body .cell.warn')).map((c) => c.innerText.slice(0, 300)),
                prints: Array.from(document.querySelectorAll('#out-body .cell.print pre.out-text')).map((p) => p.textContent),
                charts: document.querySelectorAll('#out-body .cell.chart').length,
                tables: document.querySelectorAll('#out-body table.df').length,
            })''')
            code = page.evaluate('PB.ui.fullScript("none")')
            rc, out, err = run_py(code)
            tag = f'{fname} · {task} · {"+".join(models) or "-"}'
            ok = rc == 0 and not res['errors']
            print(f'== [{i}] {tag}: app {"OK" if not res["errors"] else "ERROR"} ({res["charts"]} charts, {res["tables"]} tables) · python {"OK" if rc == 0 else "FAIL"}')
            print('    cfg:', json.dumps(cfg, ensure_ascii=False)[:300])
            for e in res['errors']: print('    APP ERROR:', e.replace('\n', ' | ')[:400])
            for w in res['warns']: print('    warn:', w.replace('\n', ' | ')[:200])
            if rc != 0:
                print('    PY ERROR:', err[-1200:])
            else:
                for line in res['prints']:
                    m = re.match(r'^([^\d\[\(\-][^:]{0,40}:)\s*(-?\d+\.\d+)$', line.strip())
                    if not m: continue
                    label, val = m.group(1), float(m.group(2))
                    py_line = next((l for l in out.splitlines() if l.startswith(label)), None)
                    pv = numbers(py_line)[0] if py_line and numbers(py_line) else None
                    same = pv is not None and abs(pv - val) < 1e-6 * max(1, abs(val))
                    print(f'    {label} app={val:.6f} python={pv if pv is None else round(pv, 6)} {"✓" if same else "≠"}')
            results.append((tag, ok))
        print('LOGS:', logs[:20])
        b.close()
    print('failures:', [t for t, ok in results if not ok])

if __name__ == '__main__':
    main({int(a) for a in sys.argv[1:]} or None)
