"""Build wizard programs with every evaluation mode (hold-out / cross-validation / GridSearchCV) and the
Thai tokenizer, run them in the app, run the generated Python with CPython, and compare every labelled
print line (numbers, dicts such as best_params_, numpy arrays of fold scores)."""
import json, os, re, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE
from py_check import PRELUDE, DATA
from playwright.sync_api import sync_playwright

CASES = [
    ('iris', 'classification', ['KNeighborsClassifier'], 'cv', None),
    ('iris', 'classification', ['KNeighborsClassifier'], 'grid', None),
    ('iris', 'classification', ['LogisticRegression', 'RandomForestClassifier', 'SVC'], 'cv', None),
    ('iris', 'classification', ['DecisionTreeClassifier'], 'grid', None),
    ('titanic', 'classification', ['RandomForestClassifier'], 'grid', None),
    ('titanic', 'classification', ['LogisticRegression'], 'cv', None),
    ('mpg', 'regression', ['Ridge'], 'grid', None),
    ('mpg', 'regression', ['LinearRegression', 'DecisionTreeRegressor'], 'cv', None),
    ('mpg', 'regression', ['GradientBoostingRegressor'], 'grid', None),
    ('thai_reviews', 'text_classification', ['MultinomialNB'], 'holdout', 'thai'),
    ('thai_reviews', 'text_classification', ['MultinomialNB'], 'grid', 'thai'),
    ('thai_reviews', 'text_classification', ['LogisticRegression', 'MultinomialNB'], 'cv', 'thai'),
    ('thai_reviews', 'text_clustering', ['KMeans'], 'holdout', 'thai'),
    ('digits', 'image_classification', ['SVC'], 'cv', None),
    ('digits', 'image_classification', ['KNeighborsClassifier'], 'grid', None),
]

def run_py(code):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(PRELUDE + code); path = f.name
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=900, cwd=DATA)
    return r.returncode, r.stdout, r.stderr

def label_lines(text):
    out = {}
    for line in text.splitlines():
        m = re.match(r'^([^\[\]{}()0-9 \-][^:]{0,60}:)\s+(.*)$', line.strip())
        if m and m.group(1) not in out: out[m.group(1)] = m.group(2).strip()
    return out

def same(a, b):
    if a == b: return True
    na = re.findall(r'-?\d+\.\d+(?:e-?\d+)?', a); nb = re.findall(r'-?\d+\.\d+(?:e-?\d+)?', b)
    if na and len(na) == len(nb) and re.sub(r'-?\d+\.\d+(?:e-?\d+)?', '#', a) == re.sub(r'-?\d+\.\d+(?:e-?\d+)?', '#', b):
        return all(abs(float(x) - float(y)) <= 1e-9 * max(1, abs(float(y))) for x, y in zip(na, nb))
    return False

def main(only=None):
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
        for i, (ds, task, models, ev, tok) in enumerate(CASES):
            if only and i not in only: continue
            t0 = time.time()
            page.evaluate(f'''() => {{ const cfg = Object.assign({{ dataset: {json.dumps(ds)}, task: {json.dumps(task)}, models: {json.dumps(models)}, evalMode: {json.dumps(ev)}, tokenizer: {json.dumps(tok)} }}, PB.DATASETS[{json.dumps(ds)}].tasks[{json.dumps(task)}]);
                PB.ui.loadProgram(PB.R.build(cfg), {{ run: true }}); }}''')
            page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=600000)
            secs = time.time() - t0
            res = page.evaluate('''() => ({ errors: Array.from(document.querySelectorAll('#out-body .cell.error')).map((c) => c.innerText.slice(0, 400)),
                prints: Array.from(document.querySelectorAll('#out-body .cell.print pre.out-text')).map((p) => p.textContent),
                tables: document.querySelectorAll('#out-body table.df').length, charts: document.querySelectorAll('#out-body .cell.chart').length })''')
            code = page.evaluate('PB.ui.fullScript("none")')
            rc, out, err = run_py(code)
            tag = f'[{i}] {ds} · {task} · {"+".join(models)} · {ev}{" · " + tok if tok else ""}'
            print(f'== {tag}: app {"OK" if not res["errors"] else "ERROR"} {secs:.1f}s ({res["tables"]} tables, {res["charts"]} charts) · python {"OK" if rc == 0 else "FAIL"}')
            for e in res['errors']: print('    APP ERROR:', e.replace('\n', ' | ')[:300])
            if rc != 0: print('    PY ERROR:', err[-1500:]); fails.append(tag); continue
            app = label_lines('\n'.join(res['prints'])); py = label_lines(out)
            for k, v in app.items():
                if k not in py: print(f'    {k} app={v[:80]} python=<missing>'); continue
                ok = same(v, py[k])
                print(f'    {"✓" if ok else "≠"} {k} {v[:90]}' + ('' if ok else f'  | python: {py[k][:90]}'))
                if not ok: fails.append(tag + ' ' + k)
            if res['errors']: fails.append(tag)
        print('page errors:', errs[:3])
        b.close()
    print('failures:', fails)

if __name__ == '__main__':
    main({int(a) for a in sys.argv[1:]} or None)
