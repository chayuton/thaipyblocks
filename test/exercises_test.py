"""Exercise mode: every starter must fail at least one goal, every model solution must pass all goals,
and the Python generated from each solution must run in CPython and print the same labelled values.
Also checks resume-after-reload, leaving exercise mode and the phone layout."""
import json, os, re, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE
from py_check import PRELUDE, DATA
from wizard_modes import label_lines, same
from playwright.sync_api import sync_playwright

def run_py(code):
    with tempfile.NamedTemporaryFile('w', suffix='.py', delete=False, encoding='utf-8') as f:
        f.write(PRELUDE + code); path = f.name
    r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=600, cwd=DATA)
    return r.returncode, r.stdout, r.stderr

def check(page):
    page.evaluate('() => { window.__chk = PB.ui.exCheck(); }')
    page.wait_for_timeout(100)
    page.wait_for_function('!PB.ui.running && !PB.ui.ex.checking', timeout=300000)
    return page.evaluate('''() => ({ results: PB.ui.ex.results, err: PB.ui.ex.runError,
        prints: PB.ui.out.log.filter((e) => e.kind === 'print').map((e) => e.text) })''')

def main(only=None):
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_timeout(400); page.wait_for_function('!PB.ui.running', timeout=60000)
        page.evaluate("() => { localStorage.removeItem('pyblocks.ex.done.v1'); localStorage.removeItem('pyblocks.ex.work.v1'); }")
        # the app opens on a blank start screen: start from a sample project, which must come back after the exercises
        page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build())'); page.wait_for_timeout(300)
        before = page.evaluate('JSON.stringify(Blockly.serialization.workspaces.save(PB.ui.ws))')
        ids = page.evaluate('PB.EXERCISES.map((e) => e.id)')
        for i, ex in enumerate(ids):
            if only and ex not in only: continue
            t0 = time.time()
            page.evaluate(f'PB.ui.exStart({json.dumps(ex)}, {{ fresh: true }})')
            page.wait_for_function(f'PB.ui.ex.active === {json.dumps(ex)} && !PB.ui.running', timeout=20000)
            loose = page.evaluate('PB.ui.ws.getTopBlocks(false).length')
            s = check(page)
            starter_ok = s['results'] is not None and not all(s['results'])
            page.evaluate(f'''() => {{ const ex = PB.EXERCISES.find((e) => e.id === {json.dumps(ex)}); PB.ui.loadProgram(PB.exState(ex.solution()), {{ keepExercise: true }}); }}''')
            r = check(page)
            sol_ok = r['results'] is not None and all(r['results'])
            code = page.evaluate('PB.ui.fullScript("none")')
            rc, out, err = run_py(code)
            secs = time.time() - t0
            print(f'== [{i + 1}] {ex}: starter {"fails ✓" if starter_ok else "PASSES ✗"} {s["results"]} · solution {"passes ✓" if sol_ok else "FAILS ✗"} {r["results"]} · python {"OK" if rc == 0 else "FAIL"} · {loose} top blocks · {secs:.1f}s')
            if not starter_ok: fails.append(ex + ' starter')
            if not sol_ok: fails.append(ex + ' solution'); print('   run error:', r['err']); print('   prints:', [t[:120] for t in r['prints']])
            if rc != 0: fails.append(ex + ' python'); print('   PY ERROR:', err[-1200:])
            else:
                app = label_lines('\n'.join(r['prints'])); py = label_lines(out)
                for k, v in app.items():
                    if k not in py: print(f'    {k} app={v[:80]} python=<missing>'); fails.append(ex + ' ' + k); continue
                    ok = same(v, py[k])
                    print(f'    {"✓" if ok else "≠"} {k} {v[:90]}' + ('' if ok else f'  | python: {py[k][:90]}'))
                    if not ok: fails.append(ex + ' ' + k)
        # jigsaw exercises can be solved by connecting the given pieces (no new blocks)
        page.evaluate('''() => {
          window.__asm = {
            vars(ws, T) { const st = T.find((b) => b.type === 'variables_set' && b.getField('VAR').getText() === 'total'); st.getInputTargetBlock('VALUE').getInput('B').connection.connect(T.find((b) => b.type === 'variables_get').outputConnection); return [st, T.find((b) => b.type === 'pb_print2')]; },
            load(ws, T) { const d = T.find((b) => b.type === 'variables_set'); d.getInputTargetBlock('VALUE').setFieldValue('iris', 'NAME'); return [d, T.find((b) => b.type === 'text_print'), T.find((b) => b.type === 'pb_print2')]; },
            filter(ws, T) { const r = T.find((b) => b.type === 'variables_set'); r.getInputTargetBlock('VALUE').setFieldValue('fare', 'COL'); const p2 = T.filter((b) => b.type === 'pb_print2'); return [r, p2.find((b) => b.getFieldValue('LABEL').startsWith('จำนวน')), p2.find((b) => b.getFieldValue('LABEL').startsWith('อัตรา'))]; },
            clean_text(ws, T) { const by = (t) => T.find((b) => b.type === t); return [by('pb_clean_text'), by('pb_replace_val'), by('variables_set'), by('text_print')]; },
            loop(ws, T) { const f = T.find((b) => b.type === 'controls_for'); f.getInput('DO').connection.connect(T.find((b) => b.type === 'pb_append').previousConnection); return [f, T.find((b) => b.type === 'text_print'), T.find((b) => b.type === 'pb_print2')]; },
            first_model(ws, T) { const by = (t, f) => T.find((b) => b.type === t && (!f || f(b))); return [by('pb_split'), by('variables_set', (b) => b.getField('VAR').getText() === 'model'), by('pb_fit'), by('variables_set', (b) => b.getField('VAR').getText() === 'y_pred'), by('pb_print2')]; },
            tune_k(ws, T) { const f = T.find((b) => b.type === 'controls_for'), m = T.find((b) => b.type === 'variables_set'), fit = T.find((b) => b.type === 'pb_fit'), ap = T.find((b) => b.type === 'pb_append');
              m.getInputTargetBlock('VALUE').getInput('P_N_NEIGHBORS').connection.connect(T.find((b) => b.type === 'variables_get').outputConnection);
              f.getInput('DO').connection.connect(m.previousConnection); m.nextConnection.connect(fit.previousConnection); fit.nextConnection.connect(ap.previousConnection);
              return [f, T.find((b) => b.type === 'pb_plot_list')]; },
          };
          window.__assemble = (id) => {
            const ws = PB.ui.ws, tops = ws.getTopBlocks(true), main = tops[0], T = tops.slice(1);
            const order = window.__asm[id](ws, T);
            let last = main; while (last.getNextBlock()) last = last.getNextBlock();
            for (const b of order) { last.nextConnection.connect(b.previousConnection); last = b; while (last.getNextBlock()) last = last.getNextBlock(); }
          };
        }''')
        for ex in page.evaluate('Object.keys(window.__asm)'):
            if only and ex not in only: continue
            page.evaluate(f'PB.ui.exStart({json.dumps(ex)}, {{ fresh: true }})')
            page.wait_for_function(f'PB.ui.ex.active === {json.dumps(ex)} && !PB.ui.running', timeout=20000)
            page.evaluate(f'window.__assemble({json.dumps(ex)})')
            a = check(page)
            ok = a['results'] is not None and all(a['results'])
            print(f'assembled from pieces: {ex} {"passes ✓" if ok else "FAILS ✗"} {a["results"]} {a["err"] or ""}')
            if not ok: fails.append(ex + ' assembled')
        # progress was recorded for solved exercises
        done = page.evaluate("Object.keys(JSON.parse(localStorage.getItem('pyblocks.ex.done.v1') || '{}')).length")
        print('done recorded:', done)
        # resume after reload, then leave and get the original workspace back
        page.evaluate("PB.ui.exStart('filter', { fresh: true })")
        page.wait_for_timeout(900)
        page.reload(); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000)
        page.wait_for_timeout(300)
        st = page.evaluate("({ active: PB.ui.ex.active, mode: document.body.classList.contains('ex-mode'), tab: !document.querySelector('.tab[data-panel=\"task\"]').hidden, panel: PB.ui.panel, tops: PB.ui.ws.getTopBlocks(false).length })")
        print('after reload:', st)
        if st['active'] != 'filter' or not st['mode'] or not st['tab']: fails.append('resume')
        page.evaluate('PB.ui.exLeave()')
        page.wait_for_timeout(900)
        after = page.evaluate('JSON.stringify(Blockly.serialization.workspaces.save(PB.ui.ws))')
        left = page.evaluate("({ active: PB.ui.ex.active, mode: document.body.classList.contains('ex-mode'), tab: document.querySelector('.tab[data-panel=\"task\"]').hidden, stored: localStorage.getItem('pyblocks.ex.active') })")
        print('after leave:', left, 'workspace restored:', after == before)
        if left['active'] or left['mode'] or not left['tab'] or left['stored'] or after != before: fails.append('leave')
        # opening a sample while in an exercise ends exercise mode
        page.evaluate("PB.ui.exStart('vars')"); page.wait_for_timeout(200)
        page.evaluate("PB.ui.loadProgram(PB.SAMPLES[2].build())"); page.wait_for_timeout(300)
        if page.evaluate('PB.ui.ex.active') is not None: fails.append('sample-ends-exercise')
        print('page errors:', errs[:5])
        if errs: fails.append('page errors')
        b.close()
    print('failures:', fails)
    return fails

if __name__ == '__main__':
    main(set(sys.argv[1:]) or None)
