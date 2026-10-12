"""Check ThaiPyBlocks the way GitHub Pages serves it, with every function driven in Chromium.

A static web server answers this repository at /thaipyblocks/ (a project site: https://<user>.github.io/thaipyblocks/).
The files the page loads from CDNs (Blockly, SheetJS, Google Fonts) are answered from the npm copies in
vendor/node_modules, and every other outside request is refused and reported.

The test runs:
- all sample projects
- the model wizard for every dataset × task × evaluation × data-preparation option
- the cleaning assistant
- every exercise solution
- uploads of the files in test/files through the real file chooser, then the wizard on them
- the PDF, HTML report, .zip and project downloads, and reopening a saved project
- the explain and variables tabs, and step mode
- the language switch and the phone layout
- the page opened as a local file and served at the site root

Run it from the repository root:
  (cd vendor && npm ci)            # once
  python3 build.py
  python3 test/pages_test.py [--shot docs/screenshot.png]

It prints one line per check, then "N/M checks passed". The exit code is 1 if any check fails."""
import functools, http.server, json, os, pathlib, re, socketserver, sys, tempfile, threading, urllib.parse, zipfile
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.path.join(REPO, 'vendor', 'node_modules')
FILES = os.path.join(REPO, 'test', 'files')
SHOT = sys.argv[sys.argv.index('--shot') + 1] if '--shot' in sys.argv else None
PREFIX = '/thaipyblocks/'
UPLOADS = ['customers.csv', 'customers_semi.csv', 'customers.xlsx', 'feedback.csv', 'digits_small.csv', 'thai_tis.csv', 'sales_monthly.csv']
MIME = {'csv': 'text/csv', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'json': 'application/json'}
THAI = re.compile(r'[\u0e00-\u0e7f]')
results, external, routed, page_errors = [], [], set(), []


def ok(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail else ''), flush=True)
    return cond


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


class ProjectSite(Quiet):
    """GitHub Pages serves a project site under /<repository>/: answer /thaipyblocks/… from this folder, nothing else"""
    def translate_path(self, path):
        p = urllib.parse.urlsplit(path).path
        if p + '/' == PREFIX or p.startswith(PREFIX):
            return super().translate_path(p[len(PREFIX) - 1:])
        return os.path.join(REPO, '.not-served-by-pages')


def serve(handler):
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(handler, directory=REPO))
    httpd.daemon_threads = True
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}'


def font_css():
    """the Google Fonts stylesheet the page asks for, built from the @fontsource copies (same faces and unicode ranges)"""
    parts = []
    for pkg, weights in (('chakra-petch', (500, 600, 700)), ('ibm-plex-mono', (400, 500, 600)), ('ibm-plex-sans-thai', (400, 500, 600))):
        for w in weights:
            css = open(os.path.join(VENDOR, '@fontsource', pkg, f'{w}.css'), encoding='utf-8').read()
            parts.append(css.replace('url(./files/', f'url(https://fonts.gstatic.com/fs/{pkg}/files/'))
    return '\n'.join(parts)


def handle(route):
    url = route.request.url
    if url.startswith(('http://127.0.0.1', 'file://', 'data:', 'blob:')):
        return route.continue_()
    if url.startswith('https://cdn.jsdelivr.net/npm/blockly@13.3.0/'):
        routed.add(url)
        return route.fulfill(path=os.path.join(VENDOR, 'blockly', url.split('blockly@13.3.0/')[1]), content_type='application/javascript')
    if url == 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js':
        routed.add(url)
        return route.fulfill(path=os.path.join(VENDOR, 'xlsx', 'dist', 'xlsx.full.min.js'), content_type='application/javascript')
    if url.startswith('https://fonts.googleapis.com/css2'):
        routed.add('https://fonts.googleapis.com/css2')
        return route.fulfill(body=FONT_CSS, content_type='text/css')
    if url.startswith('https://fonts.gstatic.com/fs/'):
        routed.add('https://fonts.gstatic.com')
        return route.fulfill(path=os.path.join(VENDOR, '@fontsource', url.split('/fs/')[1]), content_type='font/woff2')
    external.append(url)
    return route.abort()


def new_page(browser, **kw):
    ctx = browser.new_context(accept_downloads=True, **kw)
    ctx.route('**/*', handle)
    page = ctx.new_page()
    page.on('pageerror', lambda e: page_errors.append(f'pageerror: {e}'))
    page.on('console', lambda m: page_errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
    return ctx, page


def boot(page, url):
    page.goto(url)
    page.wait_for_function('document.body.classList.contains("ready")', timeout=60000)
    page.wait_for_timeout(400)
    page.wait_for_function('!PB.ui.running', timeout=120000)


# the state of the last run: error, output cells, printed values and charts
RUN_INFO = '''(A) => ({ err: A.lastError ? `${A.lastError.pyType || 'Error'}: ${A.lastError.message}` : null,
  cells: document.querySelectorAll('#out-body .cell').length,
  prints: A.out.log.filter((e) => e.kind === 'print').length, charts: A.out.log.filter((e) => e.kind === 'chart').length })'''
# load a list of [label, program state or recipe config] one after another, run each, report RUN_INFO
RUN_LIST = '''async (items) => { const A = PB.ui, info = %s, out = [];
  for (const [label, kind, x] of items) {
    let state;
    try { state = kind === 'cfg' ? PB.R.build(x) : kind === 'sample' ? PB.SAMPLES.find((s) => s.id === x).build() : x; }
    catch (e) { out.push([label, { err: 'build: ' + e.message, cells: 0 }]); continue; }
    A.loadProgram(state, { run: false }); await A.run(); out.push([label, info(A)]);
  }
  return out; }''' % RUN_INFO
# every model-wizard recipe of one sample dataset, as the wizard builds them
WIZARD_CFGS = '''(ds) => {
  const d = PB.DATASETS[ds], out = [];
  const EVAL = ['classification', 'regression', 'text_classification', 'image_classification'];
  const PREP = ['classification', 'regression', 'clustering', 'pca', 'anomaly'];
  const ALT = [{ missing: 'fill', dedupe: true, outliers: 'clip', scaler: 'minmax' }, { missing: 'drop', dedupe: true, outliers: 'remove', scaler: 'robust' },
               { missing: 'auto', dedupe: false, outliers: 'none', scaler: 'none' }];
  for (const [task, preset] of Object.entries(d.tasks || {})) {
    if (task === 'clean') continue;
    const all = (PB.TASK_MODELS[task] || []).filter(Boolean);
    for (const ev of EVAL.includes(task) ? ['holdout', 'cv', 'grid'] : ['holdout']) {
      for (const tok of task.startsWith('text_') ? ['char', 'thai'] : [undefined]) {
        const base = { task, models: ev === 'grid' ? all.slice(0, 1) : all.slice(0, 2), evalMode: ev, tokenizer: tok };
        const preps = !PREP.includes(task) ? [null] : [{ missing: 'auto', dedupe: false, outliers: 'none', scaler: 'standard' }].concat(ev === 'holdout' ? ALT : []);
        for (const p of preps) {
          const prep = p && task === 'anomaly' ? Object.assign({}, p, { outliers: 'none' }) : p;
          const cfg = Object.assign({}, base, { dataset: ds }, preset, prep ? { prep } : {});
          out.push([`${ds} · ${task} · ${ev}${tok ? ' · ' + tok : ''}${prep ? ' · ' + Object.values(prep).join('/') : ''}`, 'cfg', cfg]);
        }
      }
    }
  }
  return out; }'''
# the cleaning assistant on one dataset (or uploaded file): its recommended fixes, and every fix switched on
CLEAN_CFGS = '''([ds, file]) => {
  const R = PB.R, raw = file ? PB.files.get(file).df : PB.loadSample(ds), roles = R.inferRoles(raw), scan = R.cleanScan(raw, roles);
  const preset = (!file && PB.DATASETS[ds].tasks && PB.DATASETS[ds].tasks.clean) || {};
  const src = file ? { file } : { dataset: ds };
  const def = R.cleanDefaults(scan, preset), all = R.cleanDefaults(scan, preset);
  Object.keys(all.on).forEach((k) => { all.on[k] = true; });
  all.outliers = Object.assign({}, all.outliers, { action: 'clip', cols: scan.outliers.map((e) => e.col) });
  const after = R.cleanPlan(raw, Object.assign({}, all, { scale: { method: 'none' } }), roles).df;
  all.scale = { method: 'minmax', cols: after.columns.filter((c) => ['int64', 'float64'].includes(after.dtypeOf(c))).slice(0, 4), plots: true };
  all.save = true;
  return [[(file || ds) + ' · clean · recommended', 'cfg', Object.assign({ task: 'clean' }, src, def)],
          [(file || ds) + ' · clean · every fix', 'cfg', Object.assign({ task: 'clean' }, src, all)]]; }'''


def run_list(page, items):
    return page.evaluate(RUN_LIST, items)


def last_run(page):
    return page.evaluate(f'({RUN_INFO})(PB.ui)')


def failures(res):
    return [f'{label}: {r["err"] or "no output"}' for label, r in res if r['err'] or not r['cells']]


def menu(page, text):
    """open the ⋯ menu and click the item whose title contains text"""
    page.click('.topbar [data-act="more"]')
    page.wait_for_selector('.menu')
    page.click(f'.menu button:has-text("{text}")')


def main():
    global FONT_CSS
    if not os.path.isdir(os.path.join(VENDOR, 'blockly')):
        print('vendor/node_modules is missing: run  (cd vendor && npm ci)  first'); return 1
    if not os.path.exists(os.path.join(REPO, 'index.html')):
        print('index.html is missing: run  python3 build.py  first'); return 1
    FONT_CSS = font_css()
    httpd, origin = serve(ProjectSite)
    BASE = origin + PREFIX
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ---------- 1. the page as GitHub Pages serves it ----------
        ctx, page = new_page(browser, viewport={'width': 1440, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
        boot(page, BASE)
        info = last_run(page)
        ok('opens at /thaipyblocks/ with the title ThaiPyBlocks', page.title() == 'ThaiPyBlocks', page.title())
        ok('the first sample project runs on opening', not info['err'] and info['cells'] > 0, str(info))
        ok('PDF and HTML-report buttons shown on a plain web page',
           page.evaluate('["pdf", "report"].every((a) => !document.querySelector(`.panel-head [data-act="${a}"]`).hidden)'))
        n_cat = page.evaluate('PB.ui.ws.getToolbox().getToolboxItems().length')
        ok(f'toolbox with {n_cat} categories', n_cat > 10)
        if SHOT:
            page.wait_for_timeout(800)
            page.screenshot(path=SHOT)
            ok(f'screenshot saved to {SHOT}', os.path.getsize(SHOT) > 50_000, f'{os.path.getsize(SHOT) // 1024} KB')

        # ---------- 2. every sample project ----------
        ids = page.evaluate('PB.SAMPLES.map((s) => s.id)')
        res = run_list(page, [[sid, 'sample', sid] for sid in ids])
        bad = failures(res)
        ok(f'all {len(ids)} sample projects run without errors', len(ids) == 11 and not bad, '; '.join(bad[:4]))
        ok('sample projects print values and draw charts', sum(r['prints'] for _, r in res) > 20 and sum(r['charts'] for _, r in res) > 10,
           f"{sum(r['prints'] for _, r in res)} prints, {sum(r['charts'] for _, r in res)} charts")

        # ---------- 3. the model wizard on every sample dataset ----------
        datasets = page.evaluate('Object.keys(PB.DATASETS)')
        total, bad, kinds = 0, [], set()
        for ds in datasets:
            items = page.evaluate(WIZARD_CFGS, ds)
            if not items: continue
            res = run_list(page, items)
            total += len(res); bad += failures(res)
            kinds.add(page.evaluate('(ds) => PB.DATASETS[ds].type', ds))
            print(f'     wizard · {ds}: {len(res)} programs', flush=True)
        ok(f'model wizard: {total} programs (every dataset × task × evaluation × preparation) run without errors', total > 100 and not bad, '; '.join(bad[:4]))
        ok('model wizard covers table, text, time-series and image data', {'table', 'text', 'timeseries', 'image'} <= kinds, str(sorted(kinds)))

        # ---------- 4. the cleaning assistant on every table dataset ----------
        tables = page.evaluate('Object.keys(PB.DATASETS).filter((k) => PB.DATASETS[k].type === "table")')
        res = []
        for ds in tables:
            res += run_list(page, page.evaluate(CLEAN_CFGS, [ds, None]))
        bad = failures(res)
        ok(f'cleaning assistant: recommended fixes and every fix on {len(tables)} table datasets run without errors', len(res) == 2 * len(tables) and not bad, '; '.join(bad[:4]))

        # ---------- 5. the two assistants through their dialogs ----------
        for act, label in [('wizard', 'model wizard dialog'), ('clean', 'cleaning assistant dialog')]:
            page.click(f'.topbar [data-act="{act}"] >> visible=true')
            page.wait_for_selector('.modal .modal-foot .btn-accent')
            page.click('.modal .modal-foot .btn-accent')
            page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=120000)
            info = last_run(page)
            ok(f'{label}: "create blocks and run" builds a program that runs', not info['err'] and info['cells'] > 0 and not page.evaluate('!!document.querySelector(".modal")'), str(info))

        # ---------- 6. exercises ----------
        r = page.evaluate('''async () => { const A = PB.ui, wait = (ms) => new Promise((res) => setTimeout(res, ms));
          localStorage.removeItem('pyblocks.ex.done.v1');
          for (const ex of PB.EXERCISES) {
            A.exStart(ex.id, { fresh: true }); await wait(80); while (A.running) await wait(40);
            A.loadProgram(PB.exState(ex.solution()), { keepExercise: true }); await wait(80); while (A.running) await wait(40);
            await A.exCheck(); await wait(60);
          }
          const done = JSON.parse(localStorage.getItem('pyblocks.ex.done.v1') || '{}');
          A.exLeave({ restore: false }); await wait(100);
          return [PB.EXERCISES.length, Object.keys(done).length]; }''')
        ok(f'all {r[0]} exercise solutions pass the automatic checker', r[0] == 21 and r[1] == 21, f'{r[1]} of {r[0]} marked done')

        # ---------- 7. uploads through the real file chooser ----------
        page.click('.topbar [data-act="data"] >> visible=true')
        page.wait_for_selector('.modal .file-drop .btn-accent')
        for name in UPLOADS:
            with page.expect_file_chooser() as fc:
                page.click('.modal .file-drop .btn-accent')
            data = open(os.path.join(FILES, name), 'rb').read()
            fc.value.set_files(files=[{'name': name, 'mimeType': MIME[name.rsplit('.', 1)[1]], 'buffer': data}])
            page.wait_for_function('(n) => PB.files.has(n)', arg=name, timeout=30000)
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        meta = page.evaluate('() => Object.fromEntries(Array.from(PB.files.entries()).map(([k, v]) => [k, { rows: v.df.nrows, cols: v.df.ncols, sep: v.sep, enc: v.encoding }]))')
        ok(f'{len(UPLOADS)} files uploaded through the file chooser', all(meta.get(n, {}).get('rows', 0) > 0 for n in UPLOADS), json.dumps({k: v['rows'] for k, v in meta.items()}))
        ok('Thai TIS-620 file read as windows-874, semicolon file split on ";"', meta['thai_tis.csv']['enc'] == 'windows-874' and meta['customers_semi.csv']['sep'] == ';',
           f"{meta['thai_tis.csv']['enc']} / {meta['customers_semi.csv']['sep']}")
        ok('Excel file read with SheetJS (loaded on demand)', meta['customers.xlsx']['cols'] >= 5 and 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' in routed)
        combos = [('customers.csv', 'table', 'classification'), ('customers.csv', 'table', 'regression'), ('customers.csv', 'table', 'clustering'),
                  ('customers.csv', 'table', 'pca'), ('customers.csv', 'table', 'anomaly'), ('customers.csv', 'table', 'eda'),
                  ('customers_semi.csv', 'table', 'classification'), ('customers.xlsx', 'table', 'classification'), ('thai_tis.csv', 'table', 'eda'),
                  ('feedback.csv', 'text', 'text_classification'), ('feedback.csv', 'text', 'text_clustering'), ('sales_monthly.csv', 'timeseries', 'forecast'),
                  ('digits_small.csv', 'image', 'image_classification')]
        items = page.evaluate('''(combos) => combos.map(([f, dtype, task]) => {
            const cfg = Object.assign({ task, models: [(PB.TASK_MODELS[task] || [])[0]].filter(Boolean), evalMode: 'holdout', tokenizer: dtype === 'text' ? 'thai' : undefined },
                                      PB.ui._fileConfig(f, dtype, task));
            return [`${f} · ${task}`, 'cfg', cfg, PB.ui._checkConfig(cfg)]; })''', combos)
        problems = [f'{x[0]}: {x[3]}' for x in items if x[3]]
        res = run_list(page, [x[:3] for x in items if not x[3]])
        bad = problems + failures(res)
        ok(f'model wizard on the uploaded files: {len(res)} programs run without errors', len(res) == len(combos) and not bad, '; '.join(bad[:4]))
        res = []
        for f in ['customers.csv', 'thai_tis.csv', 'customers_semi.csv']:
            res += run_list(page, page.evaluate(CLEAN_CFGS, [None, f]))
        bad = failures(res)
        ok(f'cleaning assistant on the uploaded files: {len(res)} programs run without errors', not bad, '; '.join(bad[:4]))

        # ---------- 8. downloads: PDF, HTML report, .zip, project ----------
        page.evaluate('PB.ui.loadProgram(PB.SAMPLES[0].build(), { run: true })')
        page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=120000)
        with page.expect_download(timeout=90000) as dl:
            page.click('.panel-head [data-act="pdf"]')
        body = open(dl.value.path(), 'rb').read()
        ok('PDF button downloads an A4 PDF of the results', body.startswith(b'%PDF-') and len(body) > 50_000 and re.fullmatch(r'thaipyblocks_results_\d{8}\.pdf', dl.value.suggested_filename) is not None,
           f'{dl.value.suggested_filename} {len(body) // 1024} KB')
        with page.expect_download(timeout=60000) as dl:
            page.click('.panel-head [data-act="report"]')
        html = open(dl.value.path(), encoding='utf-8').read()
        ok('HTML report downloads with the charts', html.lower().startswith('<!doctype html>') and 'ThaiPyBlocks' in html and '<svg' in html,
           f'{dl.value.suggested_filename} {len(html) // 1024} KB')
        with page.expect_download(timeout=60000) as dl:
            menu(page, '.zip')
        z = zipfile.ZipFile(dl.value.path()); names = z.namelist()
        nb = json.loads(z.read(next(n for n in names if n.endswith('.ipynb'))).decode('utf-8')) if any(n.endswith('.ipynb') for n in names) else {}
        ok('code bundle (.zip): .py, Colab notebook, report and blocks', all(any(n.endswith(s) for n in names) for s in ['.py', '.ipynb', '_report.html', '.blocks.json'])
           and nb.get('nbformat') == 4 and len(nb.get('cells', [])) > 3, str(names))
        n_blocks = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
        with page.expect_download(timeout=60000) as dl:
            menu(page, 'บันทึกโครงงาน')
        proj_path = os.path.join(tempfile.mkdtemp(prefix='pages_test_'), dl.value.suggested_filename)
        dl.value.save_as(proj_path)
        proj = json.load(open(proj_path, encoding='utf-8'))
        ok('project saved as .json', proj.get('app') == 'ThaiPyBlocks' and 'blocks' in proj.get('workspace', {}), dl.value.suggested_filename)
        page.evaluate('PB.ui.ws.clear(); PB.ui.out.clear()')
        with page.expect_file_chooser() as fc:
            menu(page, 'เปิดโครงงาน')
        fc.value.set_files(proj_path)
        try:
            page.wait_for_function('(n) => PB.ui.ws.getAllBlocks(false).length === n', arg=n_blocks, timeout=30000)
        except PlaywrightTimeout:
            pass
        n_open = page.evaluate('PB.ui.ws.getAllBlocks(false).length')
        ok('saved project opens again with every block', n_open == n_blocks, f'{n_open} of {n_blocks} blocks')
        page.evaluate('PB.ui.setPanel("code")'); page.wait_for_timeout(500)
        page.click('.panel-head [data-act="copy-code"]'); page.wait_for_timeout(400)
        clip = page.evaluate('navigator.clipboard.readText()')
        lines = page.evaluate('document.querySelectorAll("#code-view .ln.has-block").length')
        ok('Python code tab: copy button and lines linked to their blocks', 'import pandas as pd' in clip and 'sklearn' in clip and lines > 10, f'{len(clip)} characters, {lines} linked lines')

        # ---------- 9. explain and variables tabs, step mode ----------
        page.evaluate('PB.ui.run()'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=120000)
        page.evaluate('PB.ui.setPanel("translate")'); page.wait_for_timeout(300)
        page.click('[data-tr-mode="steps"]'); page.wait_for_timeout(300)
        n_steps = page.evaluate('document.querySelectorAll("#tr-body ol.steps > li").length')
        ok('explain tab: the program step by step in Thai', n_steps > 3, f'{n_steps} steps')
        page.click('[data-tr-mode="flow"]'); page.wait_for_timeout(400)
        ok('explain tab: flowchart', page.evaluate('!!document.querySelector("#tr-body svg")'))
        page.click('[data-tr-mode="steps"]'); page.wait_for_timeout(300)
        th = page.inner_text('#tr-body')
        page.click('[data-tr-lang="en"]'); page.wait_for_timeout(300)
        en = page.inner_text('#tr-body')
        n_th, n_en = (len(THAI.findall(t)) for t in (th, en))
        ok('explain tab: the same steps in English', len(en) > 200 and n_en < 0.1 * n_th, f'Thai letters {n_th} → {n_en}')
        page.click('[data-tr-lang="th"]')
        page.click('[data-tr-mode="ai"]'); page.wait_for_timeout(300)
        ok('explain tab: translation to other languages explains that it needs Claude', 'Claude' in page.inner_text('#tr-body'))
        page.evaluate('PB.ui.setPanel("vars")'); page.wait_for_timeout(400)
        n_vars = page.evaluate('document.querySelectorAll("#vars-body table.vars tbody tr").length')
        ok('variables tab lists the variables of the last run', n_vars > 3, f'{n_vars} rows')
        page.evaluate('PB.ui.setPanel("out"); PB.ui.stepDelay = 1')
        page.click('.topbar [data-act="step"]'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=120000)
        info = last_run(page)
        ok('step mode runs the whole program', not info['err'] and info['cells'] > 0, str(info))

        # ---------- 10. switching language keeps the blocks and the uploaded files ----------
        before = page.evaluate('[PB.ui.ws.getAllBlocks(false).length, PB.files.size]')
        with page.expect_navigation(timeout=60000):
            page.click('.topbar [data-act="lang"]')
        page.wait_for_function('document.body.classList.contains("ready")', timeout=60000); page.wait_for_timeout(500)
        page.wait_for_function('!PB.ui.running', timeout=120000)
        after = page.evaluate('[PB.ui.ws.getAllBlocks(false).length, PB.files.size, PB.i18n.lang, document.querySelector(".topbar [data-act=run]").innerText.trim()]')
        page.evaluate('PB.ui.run()'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running', timeout=120000)
        info = last_run(page)
        ok('EN button switches the whole app to English, keeping blocks and files', after[2] == 'en' and 'Run' in after[3] and after[:2] == before and not info['err'], f'{before} → {after}')
        with page.expect_navigation(timeout=60000):
            page.click('.topbar [data-act="lang"]')
        page.wait_for_function('document.body.classList.contains("ready")', timeout=60000)
        ok('and back to Thai', page.evaluate('PB.i18n.lang') == 'th')
        ctx.close()

        # ---------- 11. English link, phone, local file, site root ----------
        ctx, page = new_page(browser, viewport={'width': 1280, 'height': 800})
        boot(page, BASE + '#lang=en')
        ok('a link ending in #lang=en opens in English', page.evaluate('PB.i18n.lang') == 'en' and page.evaluate('document.documentElement.lang') == 'en')
        ctx.close()
        ctx, page = new_page(browser, viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        boot(page, BASE)
        seen = []
        visible = page.evaluate('getComputedStyle(document.querySelector(".mnav")).display !== "none"')
        for v in ['out', 'code', 'translate', 'vars', 'blocks']:
            page.tap(f'.mnav button[data-view="{v}"]'); page.wait_for_timeout(250)
            seen.append(page.evaluate('document.querySelector(".studio").dataset.view'))
        info = last_run(page)
        ok('phone layout: bottom bar switches blocks / results / Python / explain / variables', visible and seen == ['out', 'code', 'translate', 'vars', 'blocks'] and not info['err'] and info['cells'] > 0, str(seen))
        ctx.close()
        ctx, page = new_page(browser, viewport={'width': 1280, 'height': 800})
        boot(page, pathlib.Path(REPO, 'index.html').as_uri())
        info = last_run(page)
        ok('index.html opened straight from the folder (file://) works', not info['err'] and info['cells'] > 0, str(info))
        ctx.close()
        root, root_origin = serve(Quiet)
        ctx, page = new_page(browser, viewport={'width': 1280, 'height': 800})
        boot(page, root_origin + '/')
        info = last_run(page)
        ok('served at the site root (user site or custom domain) works', not info['err'] and info['cells'] > 0, str(info))
        ctx.close(); root.shutdown()
        browser.close()
    httpd.shutdown()

    # ---------- 12. nothing else was loaded, nothing failed ----------
    ok('no requests outside the expected CDNs', not external, str(sorted(set(external))[:5]))
    ok('Blockly and its Thai messages came from the pinned CDN version',
       any(u.endswith('blockly_compressed.js') for u in routed) and any(u.endswith('msg/th.js') for u in routed))
    ok('no page errors and no console errors', not page_errors, '; '.join(page_errors[:3]))
    passed = sum(1 for _, c, _ in results if c)
    print(f'\n{passed}/{len(results)} checks passed')
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
