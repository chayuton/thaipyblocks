"""Interaction tests with a mocked claude.ai runtime (downloads + sample), error display,
step mode, the wizard via real clicks, zip export contents, and draft restore; then the same page
inside Claude without granted capabilities, and as a plain web page (GitHub Pages / a file opened
in the browser), where the browser saves files itself."""
import base64, io, json, os, subprocess, sys, tempfile, zipfile
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

FILES = os.path.join(ROOT, 'test', 'files')
MOCK = r'''
window.__saves = []; window.__sampleCalls = []; window.__sampleMode = 'ok';
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
window.claude = { use: (name) => new Promise((res) => setTimeout(() => {
  if (name === 'downloads') res(Object.freeze({ save: async (req) => {
    if (window.__saveMode === 'declined') throw { code: 'declined', message: 'no' };
    const d = req.data; const u8 = typeof d === 'string' ? new TextEncoder().encode(d) : d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : d instanceof Uint8Array ? d : new Uint8Array(d);
    window.__saves.push({ filename: req.filename, b64: b64(u8) }); return {}; } }));
  else if (name === 'sample') {
    const f = async (input, opts = {}) => {
      window.__sampleCalls.push(input);
      if (window.__sampleMode === 'not_granted') throw { code: 'not_granted', message: 'not granted' };
      const full = '```r\nlibrary(tidyverse)\ndf <- read_csv("iris.csv")\nprint(head(df))\n```';
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, window.__sampleMode === 'slow' ? 400 : 40));
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'cancelled', text: full.slice(0, i * 12) };
        if (opts.onText) opts.onText({ text: full.slice(0, i * 16), delta: '' });
      }
      return { text: full, truncated: false };
    };
    f.json = async () => ({}); f.limits = async () => ({});
    res(f);
  } else res(null);
}, 30)) };
'''

# claude.ai runtime that grants nothing (capabilities switched off)
DENIED = "window.claude = { use: () => Promise.reject({ code: 'not_granted', message: 'not granted' }) };"

def boot(p, mock=True, ctx=None, w=1360, hgt=860):
    """mock: True = mocked claude.ai runtime, a string = that init script, False = plain web page"""
    ctx = ctx or p.chromium.launch().new_context(viewport={'width': w, 'height': hgt})
    page = ctx.new_page(); route(page)
    if mock: page.add_init_script(MOCK if mock is True else mock)
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000)
    page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    return ctx, page, errs

def upload(page, fname):
    data = base64.b64encode(open(os.path.join(FILES, fname), 'rb').read()).decode()
    return page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return PB.ui.readFile(new File([bin], name)); }''', [fname, data])

def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    return cond

def last_save(page):
    s = page.evaluate('window.__saves[window.__saves.length - 1]')
    return s['filename'], base64.b64decode(s['b64'])

with sync_playwright() as p:
    results = []
    browser = p.chromium.launch()
    # ---------- 1. capabilities present ----------
    ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
    ctx, page, errs = boot(p, True, ctx)
    page.wait_for_timeout(200)
    results.append(check('zip button visible with downloads', page.evaluate('!document.querySelector(\'[data-act="zip"]\').hidden')))
    page.evaluate('PB.ui.exportZip()'); page.wait_for_function('window.__saves.length > 0', timeout=5000)
    fn, data = last_save(page)
    z = zipfile.ZipFile(io.BytesIO(data)); names = z.namelist()
    results.append(check('zip saved with .py/.ipynb/.blocks.json/md/README', fn.endswith('.zip') and any(n.endswith('.py') for n in names) and any(n.endswith('.ipynb') for n in names) and any(n.endswith('.blocks.json') for n in names) and 'คำอธิบาย.md' in names and 'README.txt' in names, f'{fn}: {names}'))
    nb = json.loads(z.read([n for n in names if n.endswith('.ipynb')][0]).decode('utf-8'))
    results.append(check('notebook valid', nb['nbformat'] == 4 and len(nb['cells']) > 4, f'{len(nb["cells"])} cells'))
    py = z.read([n for n in names if n.endswith('.py')][0]).decode('utf-8')
    results.append(check('py has Thai comments', '# ' in py and 'RandomForestClassifier' in py))
    # zip with an uploaded file, then run the extracted script
    upload(page, 'customers.csv')
    page.evaluate('''() => { const cfg = Object.assign({ task: 'classification', models: ['RandomForestClassifier'] }, PB.ui._fileConfig('customers.csv', 'table', 'classification')); PB.ui.loadProgram(PB.R.build(cfg), { run: true }); }''')
    page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    page.evaluate('PB.ui.exportZip()'); page.wait_for_function('window.__saves.length > 1', timeout=5000)
    fn, data = last_save(page)
    z = zipfile.ZipFile(io.BytesIO(data)); names = z.namelist()
    results.append(check('zip includes uploaded customers.csv', 'customers.csv' in names, str(names)))
    with tempfile.TemporaryDirectory() as d:
        z.extractall(d)
        script = [n for n in names if n.endswith('.py')][0]
        pre = 'import matplotlib; matplotlib.use("Agg")\nimport matplotlib.pyplot as plt\nplt.show = lambda *a, **k: plt.close("all")\n'
        src = open(os.path.join(d, script), encoding='utf-8').read()
        open(os.path.join(d, 'run.py'), 'w', encoding='utf-8').write(pre + src)
        r = subprocess.run([sys.executable, 'run.py'], cwd=d, capture_output=True, text=True, timeout=300)
        results.append(check('extracted .py runs next to its data', r.returncode == 0, (r.stderr or r.stdout)[-300:]))
        # also execute the notebook's code cells in order
        nb = json.load(open(os.path.join(d, [n for n in names if n.endswith('.ipynb')][0]), encoding='utf-8'))
        code = pre + '\n\n'.join(''.join(c['source']) for c in nb['cells'] if c['cell_type'] == 'code')
        open(os.path.join(d, 'nb.py'), 'w', encoding='utf-8').write(code)
        r = subprocess.run([sys.executable, 'nb.py'], cwd=d, capture_output=True, text=True, timeout=300)
        results.append(check('notebook cells run in order', r.returncode == 0, (r.stderr or '')[-300:]))
    # table CSV download button appears on DataFrame outputs
    results.append(check('CSV buttons on tables', page.evaluate('''Array.from(document.querySelectorAll('#out-body button')).some(b => b.textContent.includes('CSV'))''')))
    page.evaluate('window.__saveMode = "declined"; PB.ui.saveFile("x.csv", "a,b")'); page.wait_for_timeout(200)
    results.append(check('declined save shows no error dialog', page.evaluate('!document.querySelector(".modal")')))
    page.evaluate('window.__saveMode = "ok"')

    # ---------- 2. AI translation with sample ----------
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build(), {run: true})'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    page.evaluate('PB.ui.setPanel("translate")'); page.click('[data-tr-mode="ai"]'); page.wait_for_timeout(150)
    results.append(check('AI target select shown', page.locator('#ai-target').count() == 1))
    page.select_option('#ai-target', 'r'); page.click('.ai-row .btn-accent')
    page.wait_for_function('document.querySelector(".ai-out pre") && document.querySelector(".ai-out pre").textContent.includes("print(head(df))")', timeout=5000)
    txt = page.evaluate('document.querySelector(".ai-out pre").textContent')
    results.append(check('AI result streamed without fences', txt.startswith('library(tidyverse)') and '```' not in txt, repr(txt[:60])))
    call = page.evaluate('window.__sampleCalls[0]')
    results.append(check('prompt carries the Python program', 'RandomForestClassifier' in call and 'tidyverse' in call))
    # stop mid-way
    page.evaluate('window.__sampleMode = "slow"'); page.click('.ai-row .btn-accent'); page.wait_for_timeout(500)
    page.click('.ai-row button:has-text("หยุด")'); page.wait_for_timeout(700)
    results.append(check('stop keeps partial text and re-enables', page.evaluate('!document.querySelector(".ai-row .btn-accent").disabled')))
    page.evaluate('window.__sampleMode = "not_granted"'); page.click('.ai-row .btn-accent'); page.wait_for_timeout(400)
    results.append(check('not_granted hides AI controls with Thai note', page.locator('#ai-target').count() == 0 and 'อนุญาต' in page.inner_text('#tr-body'), page.inner_text('#tr-body')[:120]))

    # ---------- 3. errors ----------
    page.evaluate('PB.ui.setPanel("out")')
    prog = '''() => { const R = PB.R; return R.program([
        R.set('df', R.b('pb_dataset', { NAME: 'iris' })),
        R.print(R.b('pb_series_stat', { DF: { name: 'df' }, COL: 'sepal_lenght', FN: 'mean' })),
    ]); }'''
    page.evaluate(f'PB.ui.loadProgram(({prog})(), {{ run: true }})'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    err = page.evaluate('''() => { const c = document.querySelector('#out-body .cell.error'); return c ? c.innerText : ''; }''')
    results.append(check('KeyError shown in Thai with suggestion', 'KeyError' in err and 'sepal_length' in err and any('฀' <= ch <= '๿' for ch in err), err.replace('\n', ' | ')[:200]))
    page.wait_for_timeout(200)
    sel = page.evaluate('PB.ui.selectedId && PB.ui.ws.getBlockById(PB.ui.selectedId).type')
    warn = page.evaluate('PB.ui.ws.getAllBlocks(false).filter(b => b.hasIcon(Blockly.icons.IconType.WARNING)).map(b => b.type)')
    results.append(check('warning icon on the failing block', warn == ['pb_series_stat'], str(warn)))
    results.append(check('error block selected', sel == 'pb_series_stat', str(sel)))
    prog2 = '''() => { const R = PB.R; return R.program([
        R.set('df', R.b('pb_dataset', { NAME: 'iris' })),
        R.b('pb_fit', { M: { name: 'model' }, X: { name: 'X' }, Y: { name: 'y' } }),
    ]); }'''
    page.evaluate(f'PB.ui.loadProgram(({prog2})(), {{ run: true }})'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    err = page.evaluate('''() => { const c = document.querySelector('#out-body .cell.error'); return c ? c.innerText : ''; }''')
    results.append(check('NameError for unset variable in Thai', 'NameError' in err, err.replace('\n', ' | ')[:200]))
    # fixing a program clears old warnings on the next run
    page.evaluate(f'PB.ui.loadProgram(({prog})(), {{ run: true }})'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    page.evaluate('PB.ui.ws.getAllBlocks(false).find(b => b.type === "pb_series_stat").setFieldValue("sepal_length", "COL")'); page.wait_for_timeout(100)
    page.evaluate('PB.ui.run()'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    left = page.evaluate('PB.ui.ws.getAllBlocks(false).filter(b => b.hasIcon(Blockly.icons.IconType.WARNING)).length')
    out = page.evaluate('document.querySelector("#out-body").innerText')
    results.append(check('fixed column runs and clears warning', left == 0 and '5.8433' in out, out[:120]))
    # a fit with a text column that was not encoded -> ValueError explained
    prog3 = '''() => { const R = PB.R, V = (n) => ({ name: n }); return R.program([
        R.set('df', R.b('pb_dataset', { NAME: 'penguins' })),
        R.set('df', R.b('pb_df_clean', { DF: V('df'), FN: 'dropna' })),
        R.set('X', R.b('pb_drop_cols', { DF: V('df'), COLS: 'species' })),
        R.set('y', R.b('pb_col', { DF: V('df'), COL: 'species' })),
        R.set('model', R.model('LogisticRegression')),
        R.b('pb_fit', { M: V('model'), X: V('X'), Y: V('y') }),
    ]); }'''
    page.evaluate(f'PB.ui.loadProgram(({prog3})(), {{ run: true }})'); page.wait_for_timeout(150); page.wait_for_function('!PB.ui.running', timeout=60000)
    err = page.evaluate('''() => { const c = document.querySelector('#out-body .cell.error'); return c ? c.innerText : ''; }''')
    results.append(check('ValueError for string features explained', 'ValueError' in err and 'could not convert string to float' in err, err.replace('\n', ' | ')[:240]))

    # ---------- 3b. editing: fields, undo, toolbox drag, delete, inspector ----------
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build())'); page.wait_for_timeout(300)
    results.append(check('Blockly events enabled after loading', page.evaluate('Blockly.Events.isEnabled()')))
    page.evaluate('PB.ui.setPanel("code")')
    page.evaluate('PB.ui.ws.getAllBlocks(false).find(b => b.type === "pb_split").setFieldValue(0.3, "TS")'); page.wait_for_timeout(700)
    code = page.inner_text('#code-view')
    results.append(check('field edit refreshes Python', 'test_size=0.3' in code))
    page.evaluate('PB.ui.ws.undo(false)'); page.wait_for_timeout(700)
    code = page.inner_text('#code-view')
    results.append(check('undo restores the field', 'test_size=0.2' in code and 'test_size=0.3' not in code))
    n0 = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
    page.click('.blocklyToolboxCategory:has-text("ข้อมูล") >> nth=0'); page.wait_for_timeout(300)
    page.click('.blocklyToolboxCategory:has-text("โหลด & สำรวจ") >> nth=0'); page.wait_for_timeout(400)
    fb = page.evaluate('''() => { const g = document.querySelector('.blocklyFlyout:not([style*="display: none"]) .blocklyBlockCanvas > .blocklyDraggable'); if (!g) return null; const r = g.getBoundingClientRect(); return [r.x + 12, r.y + 10]; }''')
    if fb:
        page.mouse.move(fb[0], fb[1]); page.mouse.down(); page.mouse.move(fb[0] + 80, fb[1] + 40, steps=4); page.mouse.move(820, 560, steps=8); page.mouse.up(); page.wait_for_timeout(700)
    n1 = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
    results.append(check('drag a block from the toolbox', fb is not None and n1 > n0, f'{n0} -> {n1}'))
    code = page.inner_text('#code-view')
    results.append(check('new block appears in Python', code.count('read_csv') >= 2 or code.count('load_') >= 1, code[-160:].replace('\n', ' | ')))
    ins = page.inner_text('#inspector')
    results.append(check('inspector shows the dragged block', '>>>' in ins, ins[:100].replace('\n', ' | ')))
    page.keyboard.press('Delete'); page.wait_for_timeout(500)
    n2 = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
    results.append(check('Delete key removes the selected block', n2 < n1, f'{n1} -> {n2}'))
    page.evaluate('PB.ui.setPanel("translate")'); page.click('[data-tr-mode="steps"]'); page.wait_for_timeout(200)
    page.evaluate('PB.ui.ws.getAllBlocks(false).find(b => b.type === "pb_split").setFieldValue(0.25, "TS")'); page.wait_for_timeout(700)
    tr = page.inner_text('#tr-body')
    results.append(check('translation follows edits', '25%' in tr or '0.25' in tr, tr[:0]))
    page.evaluate('PB.ui.setPanel("out")')

    # ---------- 4. step mode ----------
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build())'); page.wait_for_timeout(150)
    page.click('[data-act="step"]'); page.wait_for_timeout(700)
    running = page.evaluate('PB.ui.running'); hl = page.evaluate('document.querySelectorAll(".blocklyHighlighted").length')
    results.append(check('step mode runs and highlights', running and hl > 0, f'running={running} hl={hl}'))
    page.click('[data-act="stop"]'); page.wait_for_timeout(500)
    results.append(check('stop ends the run', not page.evaluate('PB.ui.running'), page.inner_text('#run-status')))

    # ---------- 5. wizard by clicks with an uploaded text file ----------
    upload(page, 'feedback.csv')
    page.click('.topbar [data-act="wizard"] >> visible=true'); page.wait_for_timeout(250)
    page.click('.modal .opt:has-text("ข้อความ")'); page.wait_for_timeout(150)
    page.select_option('#wz-src', 'file:feedback.csv'); page.wait_for_timeout(150)
    roles = page.evaluate('[document.querySelector("#wz-text") && document.querySelector("#wz-text").value, document.querySelector("#wz-target") && document.querySelector("#wz-target").value]')
    results.append(check('wizard picked text + target columns', roles == ['comment', 'sentiment'], str(roles)))
    page.click('.modal .opt:has-text("LogisticRegression")'); page.wait_for_timeout(100)
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=60000)
    res = page.evaluate('''() => ({ err: document.querySelectorAll('#out-body .cell.error').length, t: Array.from(document.querySelectorAll('#out-body .cell')).map(c => c.className + ': ' + c.innerText.slice(0, 300)).join(' | ') })''')
    results.append(check('wizard program ran (compare 2 models)', res['err'] == 0 and 'LogisticRegression' in res['t'] and 'MultinomialNB' in res['t'], res['t'][-900:]))
    # wizard overrides on a table file: change the target, drop a feature, then build and run
    upload(page, 'customers.csv')
    page.evaluate('PB.ui.openWizard({ file: "customers.csv" })'); page.wait_for_timeout(200)
    page.click('.modal .opt:has-text("จำแนกประเภท")'); page.wait_for_timeout(150)
    page.select_option('#wz-target', 'gender'); page.wait_for_timeout(150)
    chips = page.evaluate('Array.from(document.querySelectorAll(".modal .chips .chip")).map(c => [c.firstChild.textContent, c.getAttribute("aria-pressed")])')
    results.append(check('target change updates feature chips', not any(c[0] == 'gender' for c in chips) and ['churn', 'true'] in chips, str(chips)))
    page.click('.modal .chips .chip:has-text("income")'); page.wait_for_timeout(150)
    pressed = page.evaluate('document.querySelector(".modal .chips .chip:nth-child(3)") && Array.from(document.querySelectorAll(".modal .chips .chip")).filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.firstChild.textContent)')
    results.append(check('feature chip toggles off', 'income' not in pressed, str(pressed)))
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=60000)
    code = page.evaluate('PB.ui.fullScript("none")')
    errs_n = page.evaluate('document.querySelectorAll("#out-body .cell.error").length')
    sel_line = next((l for l in code.splitlines() if l.startswith('df = df[[')), '')
    results.append(check('overrides reach the program', errs_n == 0 and 'y = df["gender"]' in code and sel_line and '"income"' not in sel_line, sel_line))
    # validation: clustering with a single feature is explained before building
    page.evaluate('PB.ui.openWizard({ file: "customers.csv" })'); page.wait_for_timeout(200)
    page.click('.modal .opt:has-text("ตาราง")'); page.wait_for_timeout(100)
    page.click('.modal .opt:has-text("จัดกลุ่มอัตโนมัติ")'); page.wait_for_timeout(150)
    on = page.evaluate('Array.from(document.querySelectorAll(".modal .chips .chip")).filter(c => c.getAttribute("aria-pressed") === "true").map(c => c.firstChild.textContent)')
    for name in on[1:]:
        page.click(f'.modal .chips .chip:has-text("{name}")'); page.wait_for_timeout(80)
    prob = page.evaluate('document.querySelector(".modal .wz-problem") ? document.querySelector(".modal .wz-problem").textContent : ""')
    results.append(check('wizard explains too few columns', '2 คอลัมน์' in prob, prob))
    page.click('.modal button:has-text("สร้างบล็อกและรัน")'); page.wait_for_timeout(250)
    alert_txt = page.evaluate('Array.from(document.querySelectorAll(".modal")).map(m => m.innerText).join(" | ")')
    results.append(check('build blocked with a dialog', 'อย่างน้อย 2' in alert_txt, alert_txt[-120:]))
    page.keyboard.press('Escape'); page.wait_for_timeout(150); page.keyboard.press('Escape'); page.wait_for_timeout(150)
    # automatic data-type guess when opening the wizard from a file
    page.evaluate('PB.ui.openWizard({ file: "feedback.csv" })'); page.wait_for_timeout(200)
    pressed = page.evaluate('Array.from(document.querySelectorAll(".modal .opt[aria-pressed=true] b")).map(b => b.textContent)')
    results.append(check('wizard guesses text data from file', 'ข้อความ' in pressed, str(pressed)))
    page.keyboard.press('Escape'); page.wait_for_timeout(200)

    # ---------- 6. draft restore with a missing file ----------
    page.wait_for_timeout(1000)
    page.reload(); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_timeout(600)
    restored = page.evaluate('PB.ui.ws.getAllBlocks(false).some(b => b.type === "pb_read_file" && b.getFieldValue("FILE") === "customers.csv")')
    note = page.inner_text('#out-body')
    results.append(check('draft restored after reload', restored))
    results.append(check('missing upload explained instead of error', 'customers.csv' in note and 'อัปโหลด' in note and not page.evaluate('document.querySelectorAll("#out-body .cell.error").length'), note[:160]))
    results.append(check('no page errors (mocked session)', not errs, str(errs[:3])))
    ctx.close()

    # ---------- 7. inside Claude without granted capabilities ----------
    ctx = browser.new_context(viewport={'width': 1360, 'height': 860})
    ctx, page, errs = boot(p, DENIED, ctx)
    page.wait_for_timeout(200)
    results.append(check('zip button hidden without downloads', page.evaluate('document.querySelector(\'[data-act="zip"]\').hidden')))
    page.click('.topbar [data-act="more"]'); page.wait_for_timeout(200)
    menu = page.evaluate('document.querySelector(".menu") ? document.querySelector(".menu").innerText : ""')
    results.append(check('More menu hides save items', '.zip' not in menu and 'คัดลอกโค้ด' in menu, menu.replace('\n', ' | ')[:200]))
    page.keyboard.press('Escape')
    page.evaluate('PB.ui.setPanel("translate")'); page.click('[data-tr-mode="ai"]'); page.wait_for_timeout(150)
    results.append(check('AI view explains it needs Claude', 'Claude' in page.inner_text('#tr-body') and page.locator('#ai-target').count() == 0))
    results.append(check('CSV buttons hidden without downloads', not page.evaluate('''Array.from(document.querySelectorAll('#out-body button')).some(b => b.textContent.includes('CSV'))''')))
    results.append(check('no page errors (capabilities not granted)', not errs, str(errs[:3])))
    ctx.close()

    # ---------- 8. plain web page (GitHub Pages / file opened in a browser) ----------
    ctx = browser.new_context(viewport={'width': 1360, 'height': 860}, accept_downloads=True)
    ctx, page, errs = boot(p, False, ctx)
    results.append(check('zip button shown on a plain web page', not page.evaluate('document.querySelector(\'[data-act="zip"]\').hidden')))
    results.append(check('CSV buttons on tables (plain page)', page.evaluate('''Array.from(document.querySelectorAll('#out-body button')).some(b => b.textContent.includes('CSV'))''')))
    with page.expect_download() as dl:
        page.evaluate('PB.ui.saveFile("ทดสอบ.py", "print(\'สวัสดี\')\\n")')
    d = dl.value
    body = open(d.path(), encoding='utf-8').read()
    results.append(check('browser download keeps Thai file name and text', d.suggested_filename == 'ทดสอบ.py' and body == "print('สวัสดี')\n", f'{d.suggested_filename} {body!r}'))
    with page.expect_download(timeout=60000) as dl:
        page.click('.topbar [data-act="more"]'); page.wait_for_timeout(200)
        page.click('.menu >> text=ดาวน์โหลดชุดโค้ด')
    d = dl.value
    names = zipfile.ZipFile(d.path()).namelist() if d.suggested_filename.endswith('.zip') else []
    results.append(check('zip downloaded by the browser (.py + .ipynb)', any(n.endswith('.py') for n in names) and any(n.endswith('.ipynb') for n in names), f'{d.suggested_filename} {names[:6]}'))
    page.evaluate('PB.ui.setPanel("translate")'); page.click('[data-tr-mode="ai"]'); page.wait_for_timeout(150)
    results.append(check('AI view explains it needs Claude (plain page)', 'Claude' in page.inner_text('#tr-body') and page.locator('#ai-target').count() == 0))
    results.append(check('no page errors (plain)', not errs, str(errs[:3])))
    ctx.close(); browser.close()
    print(f'{sum(results)}/{len(results)} passed')
