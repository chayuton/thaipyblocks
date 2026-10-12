"""Worksheet check (worksheets/): open the two solution projects in the app with the worksheet's own CSV files,
run them and every change the worksheet asks students to try, then
  1) compare every printed line with the generated Python run in real CPython (pandas + scikit-learn), and
  2) compare the numbers with the answer key in the worksheet (3 decimals).
    python3 test/worksheet_test.py"""
import base64, json, os, re, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

WS = os.path.join(ROOT, 'worksheets')
PRELUDE = '''
import warnings
warnings.filterwarnings("ignore")
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
plt.show = lambda *a, **k: plt.close("all")
import pandas as pd
pd.set_option("display.width", 200)
'''
INERTIA = [226726.5, 145867.4, 127108.7, 49493.0, 17688.4, 15921.9, 15089.3, 12249.1, 11332.2, 9802.4]
TRAIN, TEST, NEW = 'Silhouette ชุดฝึก:', 'Silhouette ชุดทดสอบ:', 'ลูกค้าใหม่ รายได้ 30 คะแนนใช้จ่าย 85 อยู่กลุ่ม:'
LR_TR, LR_TE, NN_TR, NN_TE = 'LogisticRegression ชุดฝึก:', 'LogisticRegression ชุดทดสอบ:', 'MLP ชุดฝึก:', 'MLP ชุดทดสอบ:'
# (name, solution, changes made in the app, answer key, warning expected)
CASES = [
    ('k-means k=5 (เฉลย)', 'kmeans', {}, {TRAIN: 0.704, TEST: 0.651, NEW: 4}, False),
    ('k-means k=3', 'kmeans', {'k': 3}, {TRAIN: 0.399, TEST: 0.509}, False),
    ('k-means k=4', 'kmeans', {'k': 4}, {TRAIN: 0.593, TEST: 0.677}, False),
    ('k-means k=6', 'kmeans', {'k': 6}, {TRAIN: 0.626, TEST: 0.557}, False),
    ('k-means random_state=7', 'kmeans', {'rs': 7}, {TRAIN: 0.706, TEST: 0.658, NEW: 2}, False),
    ('k-means test_size=0.5', 'kmeans', {'ts': 0.5}, {TRAIN: 0.712, TEST: 0.682, NEW: 4}, False),
    ('MLP (16,) (เฉลย)', 'neural_network', {}, {LR_TR: 0.45, LR_TE: 0.46, NN_TR: 0.963, NN_TE: 0.94}, False),
    ('MLP (2,)', 'neural_network', {'hidden': '(2,)'}, {NN_TR: 0.59, NN_TE: 0.59}, False),
    ('MLP (8,)', 'neural_network', {'hidden': '(8,)'}, {NN_TR: 0.947, NN_TE: 0.91}, True),
    ('MLP (100,)', 'neural_network', {'hidden': '(100,)'}, {NN_TR: 0.97, NN_TE: 0.92}, False),
    ('MLP (16, 16)', 'neural_network', {'hidden': '(16, 16)'}, {NN_TR: 0.977, NN_TE: 0.92}, False),
    ('MLP max_iter=300', 'neural_network', {'max_iter': 300}, {NN_TR: 0.913, NN_TE: 0.88}, True),
    ('MLP ไม่ปรับสเกล', 'neural_network', {'no_scale': True}, {NN_TR: 0.747, NN_TE: 0.78}, False),
]
# the worksheet's edits, done the way a student does them: change a field, or right-click → disable a block
EDIT = '''(o) => {
  const ws = PB.ui.ws, num = (b, input, v) => b.getInputTargetBlock(input).setFieldValue(String(v), 'NUM');
  /* the KMeans block after the elbow loop is the one whose n_clusters is a number (inside the loop it is k) */
  if (o.k) num(ws.getBlocksByType('pb_m_KMeans').find((b) => b.getInputTargetBlock('P_N_CLUSTERS').type === 'math_number'), 'P_N_CLUSTERS', o.k);
  const sp = ws.getBlocksByType('pb_split')[0];
  if (o.rs) sp.setFieldValue(String(o.rs), 'RS');
  if (o.ts) sp.setFieldValue(String(o.ts), 'TS');
  const mlp = ws.getBlocksByType('pb_m_MLPClassifier')[0];
  if (o.hidden) mlp.setFieldValue(o.hidden, 'P_HIDDEN_LAYER_SIZES');
  if (o.max_iter) num(mlp, 'P_MAX_ITER', o.max_iter);
  if (o.no_scale) ws.getAllBlocks(false).filter((b) => b.type === 'variables_set' && ['scaler', 'X_train', 'X_test'].includes(b.getField('VAR').getText())
    && b.getInputTargetBlock('VALUE') && /^pb_(scaler|transform)$/.test(b.getInputTargetBlock('VALUE').type)).forEach((b) => b.setDisabledReason(true, 'MANUALLY_DISABLED'));
}'''
COLLECT = '''() => ({
  errors: Array.from(document.querySelectorAll('#out-body .cell.error')).map((c) => c.innerText.slice(0, 400)),
  warns: Array.from(document.querySelectorAll('#out-body .cell.warn')).map((c) => c.innerText.slice(0, 200)),
  notes: Array.from(document.querySelectorAll('#out-body .cell.note')).map((c) => c.innerText),
  prints: Array.from(document.querySelectorAll('#out-body .cell.print pre.out-text')).map((p) => p.textContent),
  charts: document.querySelectorAll('#out-body .cell.chart').length,
})'''

def run_py(code):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(PRELUDE + code); path = f.name
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=900, cwd=WS)
    return r.returncode, r.stdout, r.stderr

def labelled(lines):
    out = {}
    for line in lines:
        for l in line.splitlines():
            m = re.match(r'^(.{1,60}?:)\s*(-?\d+(?:\.\d+)?)\s*$', l.strip())
            if m: out[m.group(1)] = float(m.group(2))
    return out

def main():
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_function('!PB.ui.running', timeout=60000)
        for fname in ('mall_customers.csv', 'seed_germination.csv'):
            data = base64.b64encode(open(os.path.join(WS, fname), 'rb').read()).decode()
            rows = page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
                const n = await PB.ui.readFile(new File([bin], name)); return PB.files.get(n).df.nrows; }''', [fname, data])
            print(f'read {fname}: {rows} rows')
        sols = {k: json.load(open(os.path.join(WS, f'solution_{k}.json'), encoding='utf-8')) for k in ('kmeans', 'neural_network')}
        for k, s in sols.items():
            if s.get('app') != 'ThaiPyBlocks' or 'blocks' not in s.get('workspace', {}): fails.append(f'solution_{k}.json: not a ThaiPyBlocks project')
        for name, sol, edits, key, warn in CASES:
            page.evaluate('(st) => PB.ui.loadProgram(st)', sols[sol]['workspace'])
            page.evaluate(EDIT, edits)
            page.evaluate('PB.ui.run()'); page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=600000)
            res = page.evaluate(COLLECT)
            code = page.evaluate('PB.ui.fullScript("none")')
            rc, out, err = run_py(code)
            app, py = labelled(res['prints']), labelled(out.splitlines())
            problems = []
            if res['errors']: problems.append('app error: ' + res['errors'][0].replace('\n', ' | '))
            if rc != 0: problems.append('python error: ' + err.strip().splitlines()[-1][:300])
            if bool(res['warns']) != warn: problems.append(f'warning expected={warn} got={res["warns"]}')
            for label, want in key.items():
                got = app.get(label)
                if got is None or round(got, 3) != round(want, 3): problems.append(f'{label} app={got} key={want}')
                pv = py.get(label)
                if rc == 0 and (pv is None or abs(pv - (got or 0)) > 1e-9): problems.append(f'{label} app={got} python={pv}')
            if sol == 'kmeans' and not edits.get('rs') and not edits.get('ts'):
                line = next((l for t in res['prints'] for l in t.splitlines() if l.startswith('inertia ของ k')), '')
                got = [float(v) for v in re.findall(r'-?\d+\.\d+', line)]
                if got != INERTIA: problems.append(f'inertia list {got}')
                if rc == 0 and line not in out: problems.append('inertia line differs from python')
            if rc == 0 and sol == 'neural_network':
                rep = next((t for t in res['prints'] if 'precision' in t), '')
                if rep.rstrip() not in out: problems.append('classification_report text differs from python')
            ok = not problems
            print(f'== {name}: {"OK" if ok else "FAIL"} · ' + ', '.join(f'{k.rstrip(":")} {round(v, 3)}' for k, v in app.items() if not k.startswith('inertia')) + f' · {res["charts"]} charts' + (' · warning' if res['warns'] else ''))
            for pr in problems: print('    ', pr)
            if not ok: fails.append(name)
        print('page errors:', errs)
        if errs: fails.append('page errors')
        b.close()
    print('failures:', fails)
    return 1 if fails else 0

if __name__ == '__main__':
    sys.exit(main())
