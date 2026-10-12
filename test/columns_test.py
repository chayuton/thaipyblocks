"""Column / table inference without running (src/ui/schema.js) and the pickers that use it.
Run: python3 test/columns_test.py  (add ORIG_DIST=<previous dist/test.html> to compare the Python output too)

1. Every sample project, every wizard recipe for every sample dataset and for uploaded files: the columns that
   PB.schema works out from the blocks (before running) must equal the columns of every DataFrame after the run,
   and every column chosen in a block must be one of the columns its table has at that point of the program.
2. UI: column picker right after placing data = pd.read_csv(...) (no run), position-aware columns
   (before / after get_dummies), "เลือกทั้งหมด", table-variable menu labels, palette blocks switched to the
   table in use by a real drag (and back with one undo), "ทำนายข้อมูลใหม่" filled with the model's features,
   columns of an uploaded file remembered after a reload, Python output unchanged.
"""
import base64, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE, ROOT
from playwright.sync_api import sync_playwright

def boot(p, w=1360, h=860):
    b = p.chromium.launch(); page = b.new_context(viewport={'width': w, 'height': h}).new_page(); route(page)
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000)
    page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=60000)
    return b, page, errs

FILES = os.path.join(ROOT, 'test', 'files')
ok_all = []
def check(label, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + label + (f' — {extra}' if extra else ''))
    ok_all.append(bool(cond)); return cond

def upload(page, fname):
    data = base64.b64encode(open(os.path.join(FILES, fname), 'rb').read()).decode()
    return page.evaluate('''async ([name, b64]) => { const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return PB.ui.readFile(new File([bin], name)); }''', [fname, data])

COMPARE = r'''async (state) => {
  const A = PB.ui; A.loadProgram(state, { run: false });
  const w = PB.schema.walk(), stat = {};
  for (const [n, v] of w.end.vars) if (v.kind === 'table') stat[n] = v.cols.map((c) => c.name);
  /* every column chosen in a block exists in its table at that point */
  const fields = [];
  for (const b of A.ws.getAllBlocks(false)) {
    const spec = PB.blocks.defs[b.type]; if (!spec || !b.isEnabled()) continue;
    for (const [k, f] of Object.entries(spec.f || {})) {
      if (f.t !== 'col' && f.t !== 'cols') continue;
      const v = b.getFieldValue(k); if (!v) continue;
      const of = f.of || 'DF', fv = b.getField(of), vn = fv && fv.getVariable ? fv.getVariable().getName() : null;
      const info = PB.schema.columns(b, vn);
      const names = info && info.from === 'blocks' ? info.cols.map((c) => c.name) : null;
      fields.push({ type: b.type, field: k, value: v, known: !!names, ok: !names || PB.blocks.splitCols(v).every((c) => names.includes(c)) });
    }
  }
  await A.run();
  const err = A.lastError ? (A.lastError.pyType + ': ' + A.lastError.message) : null;
  const run = {};
  for (const [n, v] of A.vars) if (v instanceof PB.DataFrame) run[n] = v.columns.map(String);
  return { stat, run, fields, err };
}'''

def compare(page, label, state_js):
    r = page.evaluate(f'(async () => {{ const st = ({state_js}); return ({COMPARE})(st); }})()')
    bad = [n for n, cols in r['stat'].items() if n in r['run'] and cols != r['run'][n]]
    missing = [n for n in r['stat'] if n not in r['run']]
    unknown = [n for n in r['run'] if n not in r['stat']]
    fb = [f for f in r['fields'] if not f['ok']]
    known = sum(f['known'] for f in r['fields'])
    good = not r['err'] and not bad and not missing and not fb
    detail = f"tables {len(r['stat'])}/{len(r['run'])} known, column fields {known}/{len(r['fields'])} known"
    if unknown: detail += f", unknown before run: {unknown}"
    if bad: detail += ' | MISMATCH ' + '; '.join(f"{n}: {r['stat'][n]} != {r['run'][n]}" for n in bad)
    if missing: detail += f' | not a table after run: {missing}'
    if fb: detail += f' | column not in table: {fb[:3]}'
    if r['err']: detail += ' | run error ' + r['err']
    return check(label, good, detail), r

with sync_playwright() as p:
    browser, page, errs = boot(p)
    page.evaluate('localStorage.clear()')

    # ---------- 1. inferred columns == columns after the run ----------
    n = page.evaluate('PB.SAMPLES.length')
    for i in range(n):
        title = page.evaluate(f'PB.SAMPLES[{i}].title')
        compare(page, f'sample: {title}', f'PB.SAMPLES[{i}].build()')
    combos = page.evaluate('''() => { const out = []; for (const [k, d] of Object.entries(PB.DATASETS)) for (const t of Object.keys(d.tasks || {})) out.push([k, t]); return out; }''')
    for ds, task in combos:
        if task == 'clean':
            js = f'''(() => {{ const raw = PB.loadSample("{ds}"), roles = PB.R.inferRoles(raw); const c = PB.R.cleanDefaults(PB.R.cleanScan(raw, roles), PB.DATASETS["{ds}"].tasks.clean || {{}}); return PB.R.build(Object.assign({{ dataset: "{ds}", task: "clean" }}, c)); }})()'''
        else:
            js = f'''PB.R.build(Object.assign({{ task: "{task}", models: [PB.TASK_MODELS["{task}"][0]].filter(Boolean), evalMode: "holdout" }}, {{ dataset: "{ds}" }}, PB.DATASETS["{ds}"].tasks["{task}"]))'''
        compare(page, f'wizard: {ds} · {task}', js)
    # cross-validation / grid / prep options on one dataset
    for extra in ['evalMode: "cv"', 'evalMode: "grid"', 'prep: { missing: "fill", dedupe: true, outliers: "clip", scaler: "minmax" }']:
        compare(page, f'wizard: titanic · classification · {extra}', f'PB.R.build(Object.assign({{ task: "classification", models: ["KNeighborsClassifier"] }}, {{ dataset: "titanic" }}, PB.DATASETS.titanic.tasks.classification, {{ {extra} }}))')
    # uploaded files through the wizard
    for f in ['customers.csv', 'customers_semi.csv', 'customers.xlsx', 'feedback.csv', 'sales_monthly.csv', 'digits_small.csv', 'thai_tis.csv']:
        upload(page, f)
    for f, dtype, task in [('customers.csv', 'table', 'classification'), ('customers.csv', 'table', 'regression'), ('customers.csv', 'table', 'clustering'),
                           ('customers.csv', 'table', 'pca'), ('customers.csv', 'table', 'anomaly'), ('customers.csv', 'table', 'eda'),
                           ('customers_semi.csv', 'table', 'classification'), ('customers.xlsx', 'table', 'classification'), ('thai_tis.csv', 'table', 'eda'),
                           ('feedback.csv', 'text', 'text_classification'), ('sales_monthly.csv', 'timeseries', 'forecast'), ('digits_small.csv', 'image', 'image_classification')]:
        js = f'''PB.R.build(Object.assign({{ task: "{task}", models: [PB.TASK_MODELS["{task}"][0]].filter(Boolean), evalMode: "holdout" }}, PB.ui._fileConfig("{f}", "{dtype}", "{task}")))'''
        compare(page, f'file: {f} · {task}', js)
    js = '''(() => { const raw = PB.files.get("customers.csv").df, roles = PB.R.inferRoles(raw); return PB.R.build(Object.assign({ file: "customers.csv", task: "clean" }, PB.R.cleanDefaults(PB.R.cleanScan(raw, roles), {}))); })()'''
    compare(page, 'file: customers.csv · clean', js)

    # ---------- 2. pickers before any run ----------
    PROG = '''(() => { const R = PB.R, V = (n) => ({ name: n }); return R.program([
        R.set('data', R.b('pb_read_file', { FN: 'pd.read_csv', FILE: 'customers.csv' })),
        R.set('data', R.b('pb_df_clean', { DF: V('data'), FN: 'dropna' })),
        R.print(R.b('pb_series_stat', { DF: V('data'), COL: '', FN: 'mean' })),
        R.set('data', R.b('pb_get_dummies', { DF: V('data'), COLS: 'gender, region', DROP: 'False' })),
        R.print(R.b('pb_cols', { DF: V('data'), COLS: '' })),
        R.set('X', R.b('pb_drop_cols', { DF: V('data'), COLS: 'customer_id, churn' })),
        R.set('y', R.b('pb_col', { DF: V('data'), COL: 'churn' })),
        R.set('model', R.model('DecisionTreeClassifier')),
        R.b('pb_fit', { M: V('model'), X: V('X'), Y: V('y') }),
    ]); })()'''
    page.evaluate(f'PB.ui.out.clear(); PB.ui.knownCols.clear(); PB.ui.vars = null; PB.ui.loadProgram({PROG}, {{ run: false }})')
    page.wait_for_timeout(300)
    def click_field(btype, field, nth=0):
        """a real click on a block field (Blockly opens editors from its own gesture handling)"""
        page.keyboard.press('Escape'); page.wait_for_timeout(120)
        xy = page.evaluate(f'''() => {{ Blockly.DropDownDiv.hideWithoutAnimation(); Blockly.WidgetDiv.hide(); const b = PB.ui.ws.getAllBlocks(true).filter((x) => x.type === "{btype}")[{nth}]; PB.ui.ws.centerOnBlock(b.id);
            const r = b.getField("{field}").getSvgRoot().getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }}''')
        page.wait_for_timeout(150); page.mouse.click(*xy); page.wait_for_timeout(250)
    def open_picker(btype, field, nth=0):
        click_field(btype, field, nth)
        return page.evaluate('''() => { const d = document.querySelector('.blocklyDropDownDiv .pb-picker'); if (!d) return null;
            return { title: (d.querySelector('.pb-picker-title') || {}).textContent || '', note: (d.querySelector('.pb-picker-note') || {}).textContent || '',
                     names: Array.from(d.querySelectorAll('.pb-picker-name')).map((e) => e.textContent), all: !!d.querySelector('.pb-picker-all') }; }''')
    r = open_picker('pb_series_stat', 'COL')
    check('picker lists the CSV columns before any run', r and r['names'] == ['customer_id', 'age', 'income', 'gender', 'region', 'visits', 'score', 'churn'] and 'customers.csv' in r['title'], str(r))
    r = open_picker('pb_cols', 'COLS')
    check('picker after get_dummies shows the new 0/1 columns', r and 'gender_ชาย' in r['names'] and 'gender' not in r['names'] and r['all'], str(r and r['names']))
    page.click('.pb-picker-all'); page.wait_for_timeout(150)
    v = page.evaluate('PB.ui.ws.getAllBlocks(true).find((x) => x.type === "pb_cols").getFieldValue("COLS")')
    check('"เลือกทั้งหมด" ticks every column', v.count(',') >= 8 and v.startswith('customer_id'), v)
    page.evaluate('Blockly.DropDownDiv.hideWithoutAnimation()')
    r = open_picker('pb_drop_cols', 'COLS')
    check('derived table X knows its columns', r and r['names'][:2] == ['customer_id', 'age'], str(r and r['names'][:4]))
    page.evaluate('PB.ui.ws.getAllBlocks(true).find((x) => x.type === "pb_series_stat").setFieldValue("incom", "COL")')
    r = open_picker('pb_series_stat', 'COL')
    check('picker points out a column that is not in the table', r and 'incom' in r['note'], str(r and r['note']))
    page.evaluate('Blockly.DropDownDiv.hideWithoutAnimation()')
    # table-variable menu
    click_field('pb_cols', 'DF')
    labels = page.evaluate('''() => { const items = Array.from(document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')).map((e) => e.textContent); Blockly.DropDownDiv.hideWithoutAnimation(); return items; }''')
    check('table menu lists the tables at that point first, with their columns', labels and labels[0].startswith('data') and 'ตาราง 12 คอลัมน์' in labels[0] and 'X' in labels, str(labels))
    click_field('pb_fit', 'X')
    labels = page.evaluate('''() => { const items = Array.from(document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')).map((e) => e.textContent); Blockly.DropDownDiv.hideWithoutAnimation(); return items; }''')
    check('every variable menu marks tables (X after it is made)', any(l.startswith('X') and 'ตาราง 10 คอลัมน์' in l for l in labels) and 'y' in labels, str(labels))
    shown = page.evaluate('PB.ui.ws.getAllBlocks(true).find((x) => x.type === "pb_cols").getField("DF").getText()')
    check('table field still shows the plain name', shown == 'data', shown)

    # ---------- 3. palette blocks follow the program's table ----------
    def drag_from_toolbox(cats, pick_js, to=(900, 640)):
        page.evaluate('''(cats) => { const tb = PB.ui.ws.getToolbox(); for (const c of cats) { const it = tb.getToolboxItems().find((i) => i.getName && i.getName() === c);
            if (typeof it.setExpanded === 'function') it.setExpanded(true); else tb.setSelectedItem(it); } }''', cats)
        page.wait_for_timeout(400)
        page.evaluate(f'''() => {{ const fw = PB.ui.ws.getToolbox().getFlyout().getWorkspace(); const b = fw.getTopBlocks(true).find({pick_js}); if (b && fw.scrollbar) fw.scrollbar.set(0, Math.max(0, b.getRelativeToSurfaceXY().y * fw.scale - 30)); }}''')
        page.wait_for_timeout(250)
        pos = page.evaluate(f'''() => {{ const fw = PB.ui.ws.getToolbox().getFlyout().getWorkspace(); const b = fw.getTopBlocks(true).find({pick_js}); if (!b) return null;
            const r = b.getSvgRoot().getBoundingClientRect(); return [r.x + 8, r.y + 8]; }}''')
        if not pos: return False
        page.mouse.move(*pos); page.mouse.down(); page.mouse.move(pos[0] + 60, pos[1] + 30, steps=4); page.mouse.move(*to, steps=10); page.mouse.up(); page.wait_for_timeout(500)
        return True
    page.evaluate('PB.ui.ws.zoomToFit()'); page.wait_for_timeout(200)
    n0 = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
    had_df = page.evaluate('!!PB.ui.ws.getVariableMap().getVariable("df")')
    dragged = drag_from_toolbox(['ข้อมูล', 'โหลด & สำรวจ'], '(b) => b.type === "text_print" && b.getInputTargetBlock("TEXT") && b.getInputTargetBlock("TEXT").type === "pb_df_view"')
    new = page.evaluate('''() => { const b = PB.ui.ws.getAllBlocks(false).filter((x) => x.type === "pb_df_view").pop(); return b ? b.getField("DF").getText() : null; }''')
    check('dragged "df.head()" switches to the loaded table', dragged and new == 'data', f'dragged={dragged} DF={new}')
    gone = page.evaluate('!PB.ui.ws.getVariableMap().getVariable("df")')
    check('the unused "df" variable is not left behind', not had_df and gone)
    page.evaluate('PB.ui.setPanel("code")'); page.wait_for_timeout(500)
    code = page.inner_text('#code-view')
    check('Python of the new block uses the table', 'print(data.head(5))' in code, code[-120:])
    page.evaluate('PB.ui.setPanel("out")')
    page.evaluate('PB.ui.ws.undo(false)'); page.wait_for_timeout(400)
    n1 = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
    check('one undo removes the dropped block', n1 == n0, f'{n0} -> {n1}')
    # a palette block that writes back to its table: df = df.dropna() becomes data = data.dropna()
    drag_from_toolbox(['ทำความสะอาด & ปรับสเกล', 'ค่าว่าง'], '(b) => b.type === "variables_set" && b.getInputTargetBlock("VALUE") && b.getInputTargetBlock("VALUE").type === "pb_df_clean"')
    r = page.evaluate('''() => { const b = PB.ui.ws.getAllBlocks(false).filter((x) => x.type === "pb_df_clean").pop(); return b ? [b.getParent().getField("VAR").getText(), b.getField("DF").getText()] : null; }''')
    check('"df = df.dropna()" becomes "data = data.dropna()"', r == ['data', 'data'], str(r))
    # predict a new row: the dict is filled with the model's features and runs
    drag_from_toolbox(['ฝึก & ทำนาย'], '(b) => b.type === "pb_predict_row"')
    row = page.evaluate('''() => { const b = PB.ui.ws.getAllBlocks(false).filter((x) => x.type === "pb_predict_row").pop(); return b ? b.getFieldValue("ROW") : null; }''')
    check('"ทำนายข้อมูลใหม่" lists the features the model was trained on', row and row.startswith('{"age": ') and '"gender_ชาย": True' in row and '"region_เหนือ": True' in row and '"gender_หญิง": False' in row and 'churn' not in row, str(row)[:160])
    page.evaluate('''() => { const ws = PB.ui.ws, b = ws.getAllBlocks(false).filter((x) => x.type === "pb_predict_row").pop(); const pr = ws.newBlock("text_print"); pr.initSvg(); pr.render(); pr.getInput("TEXT").connection.connect(b.outputConnection);
        const last = ws.getAllBlocks(false).find((x) => x.type === "pb_fit"); last.nextConnection.connect(pr.previousConnection); }''')
    page.evaluate('PB.ui.ws.getAllBlocks(false).find((x) => x.type === "pb_series_stat").setFieldValue("income", "COL")')
    stray = page.evaluate('PB.ui.ws.getTopBlocks(true).filter((b) => b.type === "variables_set" && b.getInputTargetBlock("VALUE") && b.getInputTargetBlock("VALUE").type === "pb_df_clean").forEach((b) => b.dispose(true))')
    page.evaluate('PB.ui.run()'); page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=60000)
    out = page.evaluate('[PB.ui.lastError && PB.ui.lastError.message, document.querySelector("#out-body").innerText.slice(-200)]')
    check('program with the filled row runs', not out[0] and ('ใช่' in out[1] or 'ไม่' in out[1]), str(out))
    # a table that already exists is never replaced: with df loaded, a new block keeps df
    page.evaluate('''PB.ui.loadProgram(PB.R.program([PB.R.set('df', PB.R.b('pb_dataset', { NAME: 'tips' })), PB.R.set('data', PB.R.b('pb_dataset', { NAME: 'iris' }))]))'''); page.wait_for_timeout(300)
    page.evaluate('PB.ui.ws.zoomToFit()'); page.wait_for_timeout(200)
    drag_from_toolbox(['ข้อมูล', 'เลือก & กรอง'], '(b) => b.type === "pb_sort"')
    keep = page.evaluate('''() => { const b = PB.ui.ws.getAllBlocks(false).filter((x) => x.type === "pb_sort").pop(); return b ? b.getField("DF").getText() : null; }''')
    check('a block reading an existing table keeps it', keep == 'df', str(keep))

    # ---------- 4. uploaded file columns remembered after a reload ----------
    page.evaluate(f'PB.ui.loadProgram({PROG}, {{ run: false }})'); page.wait_for_timeout(1200)
    page.reload(); page.wait_for_function('document.body.classList.contains("ready")', timeout=30000); page.wait_for_timeout(600)
    has = page.evaluate('PB.files.has("customers.csv")')
    r = open_picker('pb_series_stat', 'COL')
    check('after a reload (file not uploaded yet) the picker still lists its columns', not has and r and 'income' in r['names'] and 'ยังไม่ได้อัปโหลด' in r['title'], str(r))
    page.evaluate('Blockly.DropDownDiv.hideWithoutAnimation()')
    check('no page errors', not errs, str(errs[:3]))
    browser.close()

    # ---------- 5. Python output is unchanged: ORIG_DIST=<dist/test.html of the previous version> ----------
    SP = os.environ.get('ORIG_DIST')
    if SP:
        codes = []
        for page_url in ['file://' + os.path.abspath(SP), PAGE]:
            b = p.chromium.launch(); pg = b.new_page(); route(pg)
            pg.goto(page_url); pg.wait_for_function('document.body.classList.contains("ready")', timeout=30000); pg.wait_for_timeout(300)
            pg.wait_for_function('!PB.ui.running', timeout=60000)
            codes.append(pg.evaluate('''async () => { const out = []; for (const s of PB.SAMPLES) { PB.ui.loadProgram(s.build(), { run: false }); out.push(PB.ui.fullScript('th')); await PB.ui.run(); out.push(document.querySelector('#out-body').innerText.replace(/\\d+\\.\\d\\d วินาที/g, '')); } return out; }'''))
            b.close()
        diff = [i for i, (a, c) in enumerate(zip(*codes)) if a != c]
        check('Python code and outputs of all samples identical to the previous version', not diff, f'differs at {diff[:4]}')
    print(f'{sum(ok_all)}/{len(ok_all)} passed')
    sys.exit(0 if all(ok_all) else 1)
