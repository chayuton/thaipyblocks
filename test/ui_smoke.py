"""Headless smoke test of the bundled app: loads the page with CDN requests served locally,
runs every sample project, and reports errors / outputs."""
import json, os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLOCKLY = os.path.join(ROOT, 'vendor', 'node_modules', 'blockly')
PAGE = 'file://' + os.path.join(ROOT, 'dist', 'test.html')

def route(page):
    def handler(r):
        url = r.request.url
        if 'cdn.jsdelivr.net/npm/blockly@13.3.0/' in url:
            rel = url.split('blockly@13.3.0/')[1]
            return r.fulfill(path=os.path.join(BLOCKLY, rel), content_type='application/javascript')
        if 'cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' in url:
            return r.fulfill(path=os.path.join(ROOT, 'vendor', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js'), content_type='application/javascript')
        if 'fonts.googleapis.com' in url:
            return r.fulfill(body='', content_type='text/css')
        if url.startswith('file://') or url.startswith('data:'):
            return r.continue_()
        return r.abort()
    page.route('**/*', handler)

def main(width=1360, height=860, samples=None, shots=None, dark=False):
    out = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': width, 'height': height}, color_scheme='dark' if dark else 'light', device_scale_factor=1)
        page = ctx.new_page()
        logs = []
        page.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        page.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        route(page)
        page.goto(PAGE)
        page.wait_for_function('document.body.classList.contains("ready")', timeout=20000)
        page.wait_for_function('!PB.ui.running', timeout=60000)
        ids = samples or page.evaluate('PB.SAMPLES.map(s => s.id)')
        for sid in ids:
            t0 = time.time()
            page.evaluate(f'PB.ui.loadProgram(PB.SAMPLES.find(s => s.id === {json.dumps(sid)}).build(), {{run: true}})')
            page.wait_for_timeout(200)
            page.wait_for_function('!PB.ui.running', timeout=120000)
            res = page.evaluate('''() => {
              const cells = Array.from(document.querySelectorAll('#out-body .cell'));
              return {
                status: document.querySelector('#run-status').textContent,
                n: cells.length,
                kinds: cells.map(c => c.className.replace('cell ', '')),
                errors: cells.filter(c => c.classList.contains('error')).map(c => c.innerText.slice(0, 400)),
                warns: cells.filter(c => c.classList.contains('warn')).map(c => c.innerText.slice(0, 300)),
                texts: cells.filter(c => c.classList.contains('print')).map(c => c.innerText.slice(0, 160)),
              };
            }''')
            res['secs'] = round(time.time() - t0, 2)
            out[sid] = res
            if shots:
                page.screenshot(path=os.path.join(shots, f'{sid}.png'))
        out['_logs'] = logs[:40]
        b.close()
    return out

if __name__ == '__main__':
    res = main(samples=sys.argv[1:] or None)
    for k, v in res.items():
        if k == '_logs':
            print('LOGS:'); [print('  ', l) for l in v]; continue
        print(f"== {k}: {v['status']} · {v['n']} cells · {v['secs']}s")
        for e in v['errors']: print('   ERROR:', e.replace('\n', ' | '))
        for w in v['warns']: print('   WARN:', w.replace('\n', ' | '))
        for t in v['texts'][:6]: print('   ·', t.replace('\n', ' | ')[:150])
