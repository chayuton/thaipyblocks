"""The English interface (#lang=en): no Thai left on screen except data, everything still works.

Every sample project runs and its outputs, Python code (comments) and explanations contain no Thai; every toolbox
category, the model wizard for each data type, the cleaning assistant, My data, the variables / code / explain tabs,
error messages, the HTML report and all 21 exercises (solutions must pass) are scanned for Thai text, and TR() must
never meet a text missing from src/i18n_en.js. Thai that is data is allowed: the Thai reviews, the coffee shop's
place names and placeholder words, Thai sample sentences, the Thai month names of the date formats, the misspelled place names
the orders dataset's description quotes. Then switching language with the button keeps the
blocks and the uploaded file, and switches back.
Run: python3 test/lang_test.py
"""
import base64, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

FILES = os.path.join(ROOT, 'test', 'files')
THAI = re.compile(r'[฀-฾เ-๿]+')        # Thai letters (the baht sign ฿ alone is fine)
DATA = ['อาหารอร่อยมาก ส่งไวด้วย', 'อาหารอร่อย ส่งไว ประทับใจมาก', 'อาหารอร่อย ส่งไว ประทับใจ', 'ของดีมาก ส่งไว แพ็คมาอย่างดี',
        'กรุงเทพ', 'กทม', 'ไม่ระบุ', 'บาท', 'ภาษาไทย', 'ไทย', 'ที่ และ ของ มาก', 'ที่ และ ของ', 'ที่ และ มาก', 'ไม่ อร่อย', 'บวก', 'ลบ',
        'ม.ค.', 'มกราคม',   # 3.8: the date formats parse_dates reads (Thai month names) in its tooltip
        'เชียงไหม่', 'ขอนเเก่น']   # 3.9: misspelled place names the orders dataset's description quotes (tooltip in My data)
ok_all = []
def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    ok_all.append(bool(cond)); return cond

def thai_left(text):
    for d in DATA: text = text.replace(d, ' ')
    return sorted(set(THAI.findall(text)))

SCAN = '''(sel) => { const out = []; document.querySelectorAll(sel).forEach((root) => {
  const clone = root.cloneNode(true);
  clone.querySelectorAll('#out-body table.df, #out-body .out-text, .tbl-wrap, .var-preview, .chips .chip, select option, .cl-desc, .cl-code').forEach((e) => e.remove());
  out.push(clone.innerText || clone.textContent || '');
  root.querySelectorAll('[title],[aria-label],[placeholder]').forEach((e) => ['title', 'aria-label', 'placeholder'].forEach((a) => { if (e.getAttribute(a)) out.push(e.getAttribute(a)); }));
}); return out.join('\\n'); }'''

def boot(p, url, w=1360, h=860):
    b = p.chromium.launch(); page = b.new_context(viewport={'width': w, 'height': h}).new_page(); route(page)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(url); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    return b, page, errs

def missing(page):
    return page.evaluate('Array.from(PB.i18n.missing)')

with sync_playwright() as p:
    b, page, errs = boot(p, PAGE + '#lang=en')
    check('page opens in English', page.evaluate('PB.i18n.lang') == 'en' and page.evaluate('document.documentElement.lang') == 'en')
    left = thai_left(page.evaluate(SCAN, '.app'))
    check('no Thai in the page after the first run', not left, str(left[:12]))
    btn = page.evaluate('document.querySelector(\'[data-act="lang"]\').textContent')
    check('language button offers ไทย', btn == 'ไทย', btn)
    # every block in every toolbox category
    names = page.evaluate('PB.ui.ws.getToolbox().getToolboxItems().filter((i) => i.getName && !(i.hasChildren && i.hasChildren())).map((i) => i.getName())')
    bad = {}
    for n in names:
        txt = page.evaluate('''(n) => { const tb = PB.ui.ws.getToolbox(); for (const it of tb.getToolboxItems()) if (it.setExpanded) it.setExpanded(true);
            const it = tb.getToolboxItems().find((i) => i.getName && i.getName() === n); tb.setSelectedItem(it);
            const fw = tb.getFlyout().getWorkspace(); return Array.from(fw.getCanvas().querySelectorAll('text')).filter((t) => !t.closest('.blocklyEditableField')).map((t) => t.textContent).join(' ') + ' ' + fw.getTopBlocks(false).map((b) => b.tooltip || '').join(' '); }''', n)
        l = thai_left(txt)
        if l: bad[n] = l[:6]
    tb_names = ' '.join(names)
    check(f'toolbox: {len(names)} categories in English, no Thai on any palette block', not bad and not thai_left(tb_names), str(bad)[:400] + ' ' + str(thai_left(tb_names)))
    page.evaluate('PB.ui.ws.getToolbox().setSelectedItem(null)')
    # every sample project
    n = page.evaluate('PB.SAMPLES.length')
    for i in range(n):
        r = page.evaluate(f'''async () => {{ const A = PB.ui, s = PB.SAMPLES[{i}]; A.loadProgram(s.build(), {{ run: false }}); await A.run();
            const code = A.fullScript('en'), out = document.querySelector('#out-body').innerText;
            const blocks = Array.from(A.ws.getCanvas().querySelectorAll('text')).filter((t) => !t.closest('.blocklyEditableField')).map((t) => t.textContent).join(' ');
            const steps = PB.explain.steps(A.ws, 'en').map((x) => x.text).join(' ');
            return {{ title: s.title, sub: s.sub, err: A.lastError ? A.lastError.message : null, code, out, blocks, steps }}; }}''')
        thai = r['title'] + ' ' + r['sub'] + ' ' + re.sub(r'(?m)^\s*\(.*$|"[^"\n]*"', '', re.sub(r'(?s)""".*?"""|\'\'\'.*?\'\'\'', '', r['code'])) + ' ' + r['blocks'] + ' ' + re.sub(r'"[^"\n]*"|\'[^\'\n]*\'|«[^»]*»|“[^”]*”', '', r['steps'])
        out_thai = thai_left(r['out']) if 'thai' not in r['title'].lower() and 'review' not in r['title'].lower() and 'coffee' not in r['title'].lower() else []
        l = thai_left(thai)
        check(f'sample "{r["title"]}" runs in English', not r['err'] and not l and not out_thai, (r['err'] or '') + ' ' + str(l[:8]) + str(out_thai[:8]))
    # tabs: code, explain (steps + flowchart), variables
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build(), { run: true })'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    for tab in ['code', 'translate', 'vars']:
        page.evaluate(f'PB.ui.setPanel("{tab}")'); page.wait_for_timeout(400)
        if tab == 'translate':
            for mode in ['steps', 'flow', 'ai']:
                page.click(f'[data-tr-mode="{mode}"]'); page.wait_for_timeout(250)
                l = thai_left(page.evaluate(SCAN, '.pane-side'))
                check(f'explain tab · {mode} in English', not l, str(l[:8]))
        else:
            l = thai_left(page.evaluate(SCAN, '.pane-side'))
            check(f'{tab} tab in English', not l, str(l[:8]))
    page.evaluate('PB.ui.setPanel("out")')
    # selecting a block: inspector
    page.evaluate('PB.ui.onSelect(PB.ui.ws.getAllBlocks(false).find((b) => b.type === "pb_split").id)')
    l = thai_left(page.evaluate(SCAN, '#inspector'))
    check('block inspector in English', not l, str(l))
    # an error message
    page.evaluate('''PB.ui.loadProgram(PB.R.program([PB.R.set('df', PB.R.b('pb_dataset', { NAME: 'iris' })), PB.R.print(PB.R.b('pb_series_stat', { DF: { name: 'df' }, COL: 'sepal_lenght', FN: 'mean' }))]), { run: true })''')
    page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    err = page.evaluate('document.querySelector("#out-body .cell.error") ? document.querySelector("#out-body .cell.error").innerText : ""')
    check('error explained in English', 'KeyError' in err and 'How to fix' in err and not thai_left(err), err.replace('\n', ' | ')[:200])
    # model wizard for each data type, the cleaning assistant, My data
    for k, label in [('table', 'Table'), ('text', 'Text'), ('timeseries', 'Time series'), ('image', 'Images')]:
        page.evaluate('PB.ui.openWizard()'); page.wait_for_timeout(250)
        page.click(f'.modal .opt:has-text("{label}") >> nth=0'); page.wait_for_timeout(250)
        l = thai_left(page.evaluate(SCAN, '.modal'))
        check(f'model wizard · {k} in English', not l, str(l[:8]))
        page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.evaluate('PB.ui.openWizard({ task: "clean" })'); page.wait_for_timeout(300)
    l = thai_left(page.evaluate(SCAN, '.modal'))
    check('cleaning assistant (coffee data) in English apart from the data values', not l, str(l[:8]))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    data = base64.b64encode(open(os.path.join(FILES, 'customers.csv'), 'rb').read()).decode()
    page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return PB.ui.readFile(new File([bin], name)); }''', ['customers.csv', data])
    page.evaluate('PB.ui.openData()'); page.wait_for_timeout(300)
    l = thai_left(page.evaluate(SCAN, '.modal'))
    check('My data dialog in English', not l, str(l[:8]))
    page.keyboard.press('Escape'); page.wait_for_timeout(150)
    page.evaluate('PB.ui.openWizard({ file: "customers.csv" })'); page.wait_for_timeout(300)
    page.click('.modal button:has-text("Create blocks and run")'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    r = page.evaluate('[PB.ui.lastError && PB.ui.lastError.message, PB.ui.fullScript("en")]')
    check('wizard on an uploaded file builds and runs in English', not r[0] and not thai_left(re.sub(r'"[^"\n]*"', '', r[1])), str(r[0]))
    page.click('.topbar [data-act="more"]'); page.wait_for_timeout(200)
    l = thai_left(page.evaluate(SCAN, '.menu').replace('ภาษาไทย · Switch to Thai', ''))
    check('More menu in English (with the switch to Thai)', not l and 'Switch to Thai' in page.evaluate('document.querySelector(".menu").innerText'), str(l))
    page.keyboard.press('Escape')
    # HTML report
    page.evaluate('PB.ui.loadProgram(PB.SAMPLES[1].build(), { run: true })'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    rep = page.evaluate('PB.ui.buildReport()')
    l = thai_left(re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>|<[^>]+>', ' ', rep))
    check('HTML report in English', not l and '<html lang="en">' in rep, str(l[:8]))
    # all exercises: the solutions pass, and the task panel has no Thai apart from data
    r = page.evaluate('''async () => { const A = PB.ui, out = [], wait = (ms) => new Promise((res) => setTimeout(res, ms));
      for (const ex of PB.EXERCISES) {
        A.exStart(ex.id, { fresh: true }); await wait(80); while (A.running) await wait(40);
        const sol = ex.solution(), R = PB.R, cl = (x) => JSON.parse(JSON.stringify(x)); const tops = [];
        if (sol.main && sol.main.length) tops.push(Object.assign(R.chain(sol.main.map(cl)), { x: 24, y: 24 }));
        (sol.pieces || []).forEach((b, i) => tops.push(Object.assign(cl(b), { x: 24, y: 3000 + i * 200 })));
        A.loadProgram({ blocks: { languageVersion: 0, blocks: tops } }, { keepExercise: true }); await wait(80); while (A.running) await wait(40);
        await A.exCheck(); await wait(80);
        const panel = document.querySelector('#task-body').innerText;
        out.push([ex.id, document.querySelectorAll('#task-body .ex-check.pass').length, document.querySelectorAll('#task-body .ex-check').length, panel]);
      }
      A.exLeave({ restore: false }); return out; }''')
    failing = [x[:3] for x in r if x[1] != x[2] or not x[2]]
    check('all 21 exercise solutions pass in English', len(r) == 21 and not failing, str(failing))
    th = {x[0]: thai_left(x[3])[:5] for x in r if thai_left(x[3])}
    check('exercise panels in English apart from data', not th, str(th)[:400])
    page.evaluate('PB.ui.openExercises && PB.ui.openExercises()'); page.wait_for_timeout(300)
    l = thai_left(page.evaluate(SCAN, '#task-body'))
    check('exercise list in English', not l, str(l))
    m = missing(page)
    check('every text TR met has an English entry', not m, str(m[:10]))
    check('no page errors (English)', not errs, str(errs[:3]))
    b.close()

    # ---------- switching with the button keeps the blocks and the uploaded file ----------
    b, page, errs = boot(p, PAGE)
    page.evaluate('localStorage.removeItem("pyblocks.lang")')
    page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); await PB.ui.readFile(new File([bin], name));
        PB.ui.loadProgram(PB.R.program([PB.R.set('data', PB.R.b('pb_read_file', { FN: 'pd.read_csv', FILE: 'customers.csv' })), PB.R.print(PB.R.b('pb_df_view', { DF: { name: 'data' }, FN: 'head', N: 3 }))]), { run: true }); }''', ['customers.csv', data])
    page.wait_for_timeout(1200); page.wait_for_function('!PB.ui.running', timeout=60000)
    with page.expect_navigation():
        page.click('[data-act="lang"]')
    page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_timeout(800); page.wait_for_function('!PB.ui.running', timeout=60000)
    st = page.evaluate('''[PB.i18n.lang, PB.files.has("customers.csv"), PB.ui.ws.getAllBlocks(false).some((b) => b.type === "pb_read_file" && b.getFieldValue("FILE") === "customers.csv"),
        !document.querySelector("#out-body .cell.error") && document.querySelector("#out-body").innerText.includes("customer_id"), document.querySelector('[data-act="lang"]').textContent, document.querySelector('[data-act="run"]').innerText.trim()]''')
    check('button switches to English and keeps the blocks and the uploaded file', st[:4] == ['en', True, True, True] and st[4] == 'ไทย' and st[5] == 'Run', str(st))
    with page.expect_navigation():
        page.click('[data-act="lang"]')
    page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_timeout(800); page.wait_for_function('!PB.ui.running', timeout=60000)
    st = page.evaluate('[PB.i18n.lang, PB.files.has("customers.csv"), document.querySelector(\'[data-act="run"]\').innerText.trim(), document.documentElement.lang]')
    check('and back to Thai', st[0] == 'th' and st[1] and st[2] == 'รัน', str(st))
    check('no page errors (switching)', not errs, str(errs[:3]))
    b.close()
    # phone width
    b, page, errs = boot(p, PAGE + '#lang=en', 390, 844)
    l = thai_left(page.evaluate(SCAN, '.app'))
    fits = page.evaluate('(() => { const r = document.querySelector(\'[data-act="more"]\').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()')
    page.click('[data-act="more"]'); page.wait_for_timeout(300)
    first = page.evaluate('(() => { const m = document.querySelector(".menu-pop, .more-menu, [role=menu]"); return m ? m.innerText.split("\\n")[0] : ""; })()')
    # on phones the header has no room for the language button: the switch is the first item of the ⋯ menu
    check('phone layout in English (⋯ menu fits, first item switches to Thai)', not l and fits and 'ภาษาไทย' in first, str(l[:8]) + f' fits={fits} first={first!r}')
    b.close()
    print(f'{sum(ok_all)}/{len(ok_all)} passed')
    sys.exit(0 if all(ok_all) else 1)
