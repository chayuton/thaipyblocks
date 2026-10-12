"""HTML report: build it from several sample runs, open each file on its own (no network) and check that
tables, charts (SVG), pixel images, metric tiles, Thai steps and the Python code are all present."""
import json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(__file__))
from ui_smoke import route, PAGE
from playwright.sync_api import sync_playwright

EXPECT = {'iris': dict(svgs=2, tables=2, imgs=0), 'digits': dict(svgs=1, tables=1, imgs=10), 'reviews': dict(svgs=1, tables=2, imgs=0), 'basics': dict(svgs=1, tables=0, imgs=0)}

def main():
    fails = []
    out = tempfile.mkdtemp()
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': 1360, 'height': 860}); route(page)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(PAGE); page.wait_for_function('document.body.classList.contains("ready")', timeout=20000); page.wait_for_function('!PB.ui.running', timeout=60000)
        for sid in EXPECT:
            page.evaluate(f'PB.ui.loadProgram(PB.SAMPLES.find(s => s.id === {json.dumps(sid)}).build(), {{ run: true }})')
            page.wait_for_timeout(200); page.wait_for_function('!PB.ui.running', timeout=120000)
            if not page.evaluate('PB.ui.outputsCurrent()'): fails.append(sid + ' not current')
            open(os.path.join(out, sid + '.html'), 'w', encoding='utf-8').write(page.evaluate('PB.ui.buildReport()'))
        page.evaluate("PB.ui.ws.getTopBlocks(false)[0].moveBy(10, 10)"); page.wait_for_timeout(100)
        if page.evaluate('PB.ui.outputsCurrent()'): fails.append('stale outputs not detected')
        # exportReport re-runs stale outputs, then hands the file to the downloads capability
        page.evaluate("() => { window.__saved = null; PB.ui.caps.downloads = { save: async (f) => { window.__saved = f; } }; }")
        page.evaluate('PB.ui.exportReport()'); page.wait_for_timeout(300); page.wait_for_function('!PB.ui.running && window.__saved', timeout=60000)
        saved = page.evaluate('({ name: window.__saved.filename, size: window.__saved.data.length, current: PB.ui.outputsCurrent() })')
        print('exportReport:', saved)
        if not saved['name'].endswith('.html') or saved['size'] < 5000 or not saved['current']: fails.append('exportReport')
        # the zip export includes the report when outputs are current
        page.evaluate('PB.ui.exportZip()'); page.wait_for_timeout(500)
        zname = page.evaluate('window.__saved.filename')
        zip_has = page.evaluate("window.__saved.data.arrayBuffer().then((b) => new TextDecoder('latin1').decode(new Uint8Array(b)).includes('_report.html'))")
        print('zip:', zname, 'has report:', zip_has)
        if not zip_has: fails.append('zip report')
        for sid, exp in EXPECT.items():
            pg = b.new_page(viewport={'width': 1200, 'height': 900})
            pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file://') else r.abort())
            rerr = []; pg.on('pageerror', lambda e: rerr.append(str(e)))
            pg.goto('file://' + os.path.join(out, sid + '.html')); pg.wait_for_timeout(300)
            st = pg.evaluate('''() => ({ svgs: document.querySelectorAll("svg.plot").length, tables: document.querySelectorAll("table.df").length,
                imgs: document.querySelectorAll(".img-grid img").length, buttons: document.querySelectorAll("button").length,
                tiles: document.querySelectorAll(".tile").length, steps: document.querySelectorAll(".steps-th > li").length,
                code: (document.querySelector("pre.py") || {}).textContent || "", title: document.title })''')
            ok = all(st[k] == v for k, v in exp.items()) and st['buttons'] == 0 and st['tiles'] >= 1 and st['steps'] >= 3 and 'import' in st['code'] and not rerr
            print(f'{sid}: {"OK" if ok else "FAIL"} {dict((k, st[k]) for k in ("svgs", "tables", "imgs", "buttons", "tiles", "steps"))} {st["title"]}', rerr[:2])
            if not ok: fails.append(sid)
            pg.close()
        if errs: fails.append('page errors'); print(errs[:3])
        b.close()
    print('failures:', fails)
    return fails

if __name__ == '__main__':
    main()
