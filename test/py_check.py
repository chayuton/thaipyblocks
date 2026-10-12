"""Generate the Python code for every sample project in the app, run it with real CPython
(pandas + scikit-learn), and compare the printed lines with what the in-browser engine printed."""
import json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
PRELUDE = f'''
import os, warnings
warnings.filterwarnings("ignore")
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.show = lambda *a, **k: plt.close("all")
import pandas as pd
pd.set_option("display.width", 200)
_orig_read_csv = pd.read_csv
def _local_read_csv(path, *a, **k):
    if isinstance(path, str) and path.startswith("https://raw.githubusercontent.com/mwaskom/seaborn-data/master/"):
        path = os.path.join({DATA!r}, path.rsplit("/", 1)[1])
    return _orig_read_csv(path, *a, **k)
pd.read_csv = _local_read_csv
'''

def collect(ids=None, comments='none'):
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(); route(page)
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
        ids = ids or page.evaluate('PB.SAMPLES.map(s => s.id)')
        out = {}
        for sid in ids:
            page.evaluate(f'PB.ui.loadProgram(PB.SAMPLES.find(s => s.id === {json.dumps(sid)}).build(), {{run: true}})')
            page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=120000)
            code = page.evaluate(f'PB.ui.fullScript({json.dumps(comments)})')
            prints = page.evaluate('''() => Array.from(document.querySelectorAll('#out-body .cell.print pre.out-text')).map(p => p.textContent)''')
            errs = page.evaluate('''() => Array.from(document.querySelectorAll('#out-body .cell.error')).map(c => c.innerText)''')
            nb = page.evaluate('PB.ui.notebook()')
            out[sid] = {'code': code, 'prints': prints, 'errors': errs, 'nb': nb}
        b.close()
    return out

def run_py(code):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(PRELUDE + code); path = f.name
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=600, cwd=DATA)
    return r.returncode, r.stdout, r.stderr

def numbers(s):
    return [float(x) for x in re.findall(r'-?\d+\.\d+', s)]

if __name__ == '__main__':
    ids = sys.argv[1:] or None
    res = collect(ids)
    bad = 0
    for sid, r in res.items():
        rc, out, err = run_py(r['code'])
        status = 'OK' if rc == 0 else 'FAIL'
        if rc != 0: bad += 1
        print(f'== {sid}: python {status}' + ('' if not r['errors'] else ' · app error: ' + r['errors'][0][:120]))
        if rc != 0:
            print(err[-1500:])
            continue
        # compare metric lines that start with a label (Accuracy:, R²:, MAE: ...)
        for line in r['prints']:
            m = re.match(r'^([^\d\[\(\-][^:]{0,40}:)\s*(-?\d+\.\d+)$', line.strip())
            if not m: continue
            label, val = m.group(1), float(m.group(2))
            py_line = next((l for l in out.splitlines() if l.startswith(label)), None)
            pv = numbers(py_line)[0] if py_line and numbers(py_line) else None
            same = pv is not None and abs(pv - val) < 1e-6 * max(1, abs(val))
            print(f'   {label} app={val:.6f} python={pv if pv is None else round(pv, 6)} {"✓" if same else "≠"}')
        # notebook must be valid JSON with code cells
        nb = json.loads(r['nb']); print(f'   notebook: {len(nb["cells"])} cells')
    print('python failures:', bad)
